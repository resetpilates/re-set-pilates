// Sends form data to the studio's relay (/api/*, a Cloudflare Worker that writes to Airtable).
// If the phone is offline or the relay is down, the message waits in an outbox and is retried on the next visit.
// A Turnstile token is single-use, so a queued lead carries a signed retry pass from the relay instead; a lead
// queued while offline (no pass) gets a fresh token when it is resent.
import type { Attribution, RelayEvent, RelayMap, RelayReply } from "./relayTypes";
import { freshTurnstileToken } from "./turnstile";

const OUTBOX = "reset.outbox.v1";
const FIRST_TOUCH = "reset.attribution.v1";

/** `key` identifies the entry in the outbox; `ref` is the caller's own id (e.g. the local booking id). */
type Queued = { event: RelayEvent; body: Record<string, unknown>; at: number; key?: string; ref?: string };

/** Fired on window when a queued message finally reaches the relay: detail = { event, ref, reply }. */
export const RELAY_REPLY = "reset:relay-reply";
export type RelayReplyDetail = { event: RelayEvent; ref?: string; reply: RelayReply };

const keyOf = (i: Queued) => i.key ?? `${i.at}:${i.event}`;
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

/** A reply worth retrying later: the relay failed (5xx) or asked to slow down (429). */
class RelayError extends Error {
  constructor(public reply: RelayReply) {
    super(reply.error ?? "relay");
  }
}

function readOutbox(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "[]");
  } catch {
    return [];
  }
}
function writeOutbox(items: Queued[]) {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(items.slice(-30)));
  } catch {
    /* private mode */
  }
}

async function post<E extends RelayEvent>(event: E, body: RelayMap[E] | unknown): Promise<RelayReply> {
  const res = await fetch(`/api/${event}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  });
  const reply = (await res.json().catch(() => ({ ok: false }))) as RelayReply;
  // Other 4xx means the message itself is wrong; retrying will not help.
  if (!res.ok && (res.status >= 500 || res.status === 429)) throw new RelayError(reply);
  return reply;
}

/**
 * Send one event. Resolves with the relay's reply, or `{ ok: false, queued: true }` when it
 * could not reach the relay and saved the message for later.
 */
export async function relay<E extends RelayEvent>(
  event: E,
  body: Omit<RelayMap[E], "attribution" | "page">,
  opts: { ref?: string } = {},
): Promise<RelayReply & { queued?: boolean }> {
  const full = { ...body, page: location.pathname, attribution: attribution() };
  try {
    return await post(event, full);
  } catch (e) {
    // Cancels and quiz contact details depend on ids from earlier replies; they are still worth retrying.
    // The used Turnstile token is dropped; the relay's retry pass (if it sent one) takes its place.
    const { turnstile: _used, ...rest } = full as Record<string, unknown>;
    const retry = e instanceof RelayError ? e.reply.retry : undefined;
    writeOutbox([...readOutbox(), { event, body: { ...rest, ...(retry ? { retry } : {}) }, at: Date.now(), key: newKey(), ref: opts.ref }]);
    return { ok: false, queued: true };
  }
}

/** A question to the relay that is not worth queueing (e.g. a status lookup). Resolves to null when it could not be asked. */
export async function ask<E extends RelayEvent>(event: E, body: Omit<RelayMap[E], "attribution" | "page">): Promise<RelayReply | null> {
  try {
    return await post(event, { ...body, page: location.pathname });
  } catch {
    return null;
  }
}

/** Events behind the Turnstile bot check: a queued one without a retry pass needs a fresh token when resent. */
const BOT_CHECKED: RelayEvent[] = ["lead", "health-declaration"];

/** Remove a message that has not been sent yet (e.g. a booking cancelled while still offline). */
export function dropQueued(ref: string): boolean {
  const items = readOutbox();
  const left = items.filter((i) => i.ref !== ref);
  if (left.length !== items.length) writeOutbox(left);
  return left.length !== items.length;
}

let flushing: Promise<void> | null = null;

/**
 * Retry anything left in the outbox (at start-up and when the phone comes back online).
 * Only one flush runs at a time, and only the entries it handled are removed, so a message
 * queued while the flush is running is kept. Drops messages older than two weeks.
 */
export function flushOutbox(): Promise<void> {
  flushing ??= flush().finally(() => (flushing = null));
  return flushing;
}

async function flush() {
  const handled = new Set<string>();
  for (const i of readOutbox()) {
    if (Date.now() - i.at >= 14 * 864e5) {
      handled.add(keyOf(i));
      continue;
    }
    // A bot-checked message without a retry pass (saved while offline) needs a fresh bot-check token.
    let body = i.body;
    if (BOT_CHECKED.includes(i.event) && !body.retry && !body.turnstile) {
      const turnstile = await freshTurnstileToken(String(body.lang ?? "he"));
      if (!turnstile) continue; // could not complete the check now; keep it for the next visit
      body = { ...body, turnstile };
    }
    try {
      const reply = await post(i.event, body);
      // The bot check can be retried later; any other 4xx means the message itself is wrong.
      if (!reply.ok && reply.error === "turnstile") continue;
      handled.add(keyOf(i));
      if (reply.ok) dispatchEvent(new CustomEvent<RelayReplyDetail>(RELAY_REPLY, { detail: { event: i.event, ref: i.ref, reply } }));
    } catch {
      /* still failing; keep it */
    }
  }
  // Re-read: entries queued (or dropped) while this flush was sending are left as they are.
  writeOutbox(readOutbox().filter((i) => !handled.has(keyOf(i))));
}

/** Remember where this visitor first came from (campaign links, referrer). Call once at start-up. */
export function captureAttribution() {
  try {
    if (localStorage.getItem(FIRST_TOUCH)) return;
    const p = new URLSearchParams(location.search);
    const ref = document.referrer && !document.referrer.startsWith(location.origin) ? new URL(document.referrer).hostname : "";
    const a: Attribution = {
      utmSource: p.get("utm_source") ?? undefined,
      utmMedium: p.get("utm_medium") ?? undefined,
      utmCampaign: p.get("utm_campaign") ?? undefined,
      referrer: ref || undefined,
      landing: location.pathname,
    };
    localStorage.setItem(FIRST_TOUCH, JSON.stringify(a));
  } catch {
    /* private mode */
  }
}

function attribution(): Attribution | undefined {
  try {
    return JSON.parse(localStorage.getItem(FIRST_TOUCH) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
}
