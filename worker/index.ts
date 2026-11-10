// Cloudflare Worker for re:set pilates. Static files are served by Cloudflare directly; this script runs for
//   POST /api/<event>  form relay → Airtable (the token lives only here, secret AIRTABLE_TOKEN; TURNSTILE_SECRET guards the lead form)
//   GET  /api/health   which secrets are set
//   /go/<slug>         short links for flyers and QR codes
//   pages              link-preview and search tags per language and page (see run_worker_first in wrangler.jsonc)
import { planById, priceFor } from "../src/config/pricing";
import { isTodo, mapsLink, siteConfig } from "../src/config/site";
import { withPreview } from "./preview";
import type {
  Attribution,
  BookingMsg,
  CancelMsg,
  ChatMsg,
  CheckoutMsg,
  Contact,
  GiftMsg,
  HeardFrom,
  LaunchWaitlistMsg,
  LeadMsg,
  QuizContactMsg,
  QuizMsg,
  RelayEvent,
  RenewalMsg,
  HealthMsg,
  HealthStatusMsg,
  RelayReply,
  SlotRef,
  WaitlistMsg,
} from "../src/lib/relayTypes";
import { HEARD_FROM, LAUNCH_TIMES, PREF_TIMES, SHOW_AS, normalizePhone, scheduleName, type RosterReply } from "../src/lib/relayTypes";
import { Airtable, AirtableError, F, T, q, type AirRecord, type Fields } from "./airtable";
import { isReceiptNumber, type ReceiptData } from "../src/lib/receipt";
import { CLEARANCE_QUESTIONS, HEALTH_VALID_MONTHS, HEALTH_VERSION, PREGNANCY, clearanceReasons, guardianMissing, type HealthAnswers } from "../src/lib/health";
import { channelsFor, receiptLink, sendReceipt, serveReceipt } from "./notify";

declare global {
  interface Env {
    TURNSTILE_SECRET?: string; // Turnstile secret key. When set, the lead form must pass the bot check.
  }
}

const TZ = "Asia/Jerusalem";
const CANCEL_HOURS = siteConfig.policies.cancelHours; // same policy the site shows
const MAX_BODY = 8 * 1024;

class BadRequest extends Error {}
/** The request is fine but would duplicate something that exists (e.g. the same membership is still running). */
/** Airtable formula: a booking that holds a bed (a paid booking, or a bed held at checkout before payment opened). */
const ACTIVE_BOOKING = `OR({${F.bookings.status}}='Booked', {${F.bookings.status}}='Held')`;

class Conflict extends Error {
  constructor(message: string, public until?: string) {
    super(message);
  }
}
/** Thrown by the lead handler when the Turnstile token is missing or rejected; the form shows "try again". */
class BotCheckFailed extends Error {}

// A Turnstile token can be used once. When the relay fails after the bot check passed (Airtable down, bad
// token scope…), the browser keeps the message in an outbox and retries later: it gets a signed "retry pass"
// instead, valid for the outbox's lifetime, so a lead that already passed the check is never lost.
const RETRY_DAYS = 14;
async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}
async function issueRetryPass(secret: string, event: string): Promise<string> {
  const exp = Date.now() + RETRY_DAYS * 864e5;
  return `${exp}.${await hmacHex(secret, `${event}.${exp}`)}`;
}
async function validRetryPass(secret: string, event: string, pass: unknown): Promise<boolean> {
  if (typeof pass !== "string") return false;
  const [exp, sig] = pass.split(".");
  if (!/^\d{13}$/.test(exp ?? "") || Number(exp) < Date.now() || !sig) return false;
  return sig === (await hmacHex(secret, `${event}.${exp}`));
}

async function passesTurnstile(secret: string | undefined, token: unknown, ip: string | null) {
  if (!secret) return true;
  if (typeof token !== "string" || !token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token.slice(0, 2048));
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const out = (await r.json()) as { success?: boolean; "error-codes"?: string[] };
  if (out.success !== true) console.error(JSON.stringify({ msg: "turnstile rejected", codes: out["error-codes"] ?? [], tokenLength: token.length }));
  return out.success === true;
}

// ---------- small helpers ----------

const json = (body: RelayReply | RosterReply, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function text(v: unknown, max: number, required = false): string {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  if (required && !s) throw new BadRequest("missing field");
  return s;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(v as T) ? (v as T) : undefined;
}

/** Israeli phone → local digits ("0501234567"). Throws when it can't be a phone number. */
function phoneDigits(raw: unknown): string {
  const d = normalizePhone(String(raw ?? ""));
  if (!d) throw new BadRequest("bad phone");
  return d;
}
const phonePretty = (d: string) => (d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`);

function contact(v: unknown): Contact {
  const c = (v ?? {}) as Record<string, unknown>;
  const email = text(c.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequest("bad email");
  return { firstName: text(c.firstName, 60, true), lastName: text(c.lastName, 60, true), phone: phoneDigits(c.phone), email: email || undefined };
}

function slot(v: unknown): SlotRef {
  const s = (v ?? {}) as Record<string, unknown>;
  const service = oneOf(s.service, ["reformer", "mat"] as const);
  const date = text(s.date, 10, true);
  const time = text(s.time, 5, true);
  if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new BadRequest("bad slot");
  const start = Date.parse(studioInstant(date, time));
  if (Number.isNaN(start) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new BadRequest("bad slot"); // e.g. 31 Feb
  if (start < Date.now()) throw new BadRequest("past slot"); // the class has already started (studio time)
  return {
    slotId: `${service}_${date}_${time.replace(":", "")}`, // rebuilt here, never trusted from the client
    service,
    date,
    time,
    minutes: Math.min(Math.max(Number(s.minutes) || 50, 15), 120),
    capacity: service === "reformer" ? 5 : null,
  };
}

const todayIL = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** Studio-local date + time → ISO instant (handles summer/winter time). */
function studioInstant(date: string, time: string): string {
  const guess = new Date(`${date}T${time}:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  return new Date(`${date}T${time}:00${off || "+00:00"}`).toISOString();
}

function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SERVICE_NAME = { reformer: "Reformer", mat: "Mat" } as const;
const INTEREST: Record<string, string> = { reformer: "Reformer", mat: "Mat", private: "Private 1:1", duo: "Duo", women: "Women-only", teens: "Teens", groups: "Event" };
const fullName = (c: Contact) => `${c.firstName} ${c.lastName}`;
const linkIds = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

function slotLabel(s: SlotRef) {
  const [y, m, d] = s.date.split("-").map(Number);
  const dow = DOWS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${SERVICE_NAME[s.service]} · ${dow} ${d} ${MONTHS[m - 1]} · ${s.time}`;
}

/** Best guess at the Members "Source" from utm tags or the referrer. An explicit answer always wins. */
function sourceFrom(heard: HeardFrom | undefined, a: Attribution | undefined): string {
  if (heard) return heard;
  const hint = `${a?.utmSource ?? ""} ${a?.referrer ?? ""}`.toLowerCase();
  if (/instagram|\big\b/.test(hint)) return "Instagram";
  if (/facebook|\bfb\b/.test(hint)) return "Facebook";
  if (/tiktok/.test(hint)) return "TikTok";
  if (/maps\.google|google\.[a-z.]+\/maps/.test(hint)) return "Google Maps";
  if (/google/.test(hint)) return "Google";
  return "Website";
}

function attributionNote(a: Attribution | undefined): string {
  if (!a) return "";
  return [a.utmSource && `utm_source=${a.utmSource}`, a.utmMedium && `utm_medium=${a.utmMedium}`, a.utmCampaign && `utm_campaign=${a.utmCampaign}`, a.referrer && `ref=${a.referrer}`]
    .filter(Boolean)
    .join(" · ")
    .slice(0, 250);
}

function attribution(v: unknown): Attribution | undefined {
  if (!v || typeof v !== "object") return undefined;
  const a = v as Record<string, unknown>;
  return { utmSource: text(a.utmSource, 60), utmMedium: text(a.utmMedium, 60), utmCampaign: text(a.utmCampaign, 80), referrer: text(a.referrer, 120), landing: text(a.landing, 120) };
}

// ---------- shared Airtable steps ----------

interface MemberOpts {
  lang: "he" | "en";
  heard?: HeardFrom;
  attribution?: Attribution;
  consent?: boolean;
  consentSource?: "Website form" | "Checkout";
  interests?: string[];
  extra?: Fields; // set only when the field is still empty
}

/** Finds the person by phone (any formatting) or creates them. Fills gaps, never overwrites what the studio entered. */
/** The member with this phone (local 05… digits), matching however the number was typed in Airtable. */
async function memberByPhone(at: Airtable, phone: string): Promise<AirRecord | undefined> {
  const digits = `REGEX_REPLACE({${F.members.phone}}&'','[^0-9]','')`;
  const [found] = await at.find(T.members, `OR(${digits}=${q(phone)},${digits}=${q(`972${phone.slice(1)}`)})`);
  return found;
}

async function upsertMember(at: Airtable, c: Contact, o: MemberOpts): Promise<AirRecord> {
  const M = F.members;
  const found = await memberByPhone(at, c.phone);
  const today = todayIL();
  const consent: Fields = o.consent ? { [M.consent]: true, [M.consentDate]: today, [M.consentSource]: o.consentSource ?? "Website form" } : {};

  if (!found) {
    return at.create(T.members, {
      [M.fullName]: fullName(c),
      [M.firstName]: c.firstName,
      [M.lastName]: c.lastName,
      [M.phone]: phonePretty(c.phone),
      ...(c.email ? { [M.email]: c.email } : {}),
      [M.language]: o.lang === "he" ? "Hebrew" : "English",
      [M.status]: "Lead",
      [M.lifecycle]: "New enquiry",
      [M.source]: sourceFrom(o.heard, o.attribution),
      [M.sourceDetail]: attributionNote(o.attribution),
      [M.signedUpOn]: today,
      ...(o.interests?.length ? { [M.interests]: o.interests } : {}),
      ...consent,
      ...(o.extra ?? {}),
    });
  }

  const f = found.fields;
  const patch: Fields = {};
  const fill = (id: string, v: unknown) => {
    if (v !== undefined && v !== "" && (f[id] === undefined || f[id] === "")) patch[id] = v;
  };
  fill(M.firstName, c.firstName);
  fill(M.lastName, c.lastName);
  fill(M.email, c.email);
  // An explicit "How did you hear about us?" answer replaces the automatic guess ("Website").
  if (o.heard && (!f[M.source] || f[M.source] === "Website")) patch[M.source] = o.heard;
  if (o.consent && !f[M.consent]) Object.assign(patch, consent);
  if (o.interests?.length) {
    const have = (f[M.interests] as string[] | undefined) ?? [];
    const merged = [...new Set([...have, ...o.interests])];
    if (merged.length !== have.length) patch[M.interests] = merged;
  }
  for (const [id, v] of Object.entries(o.extra ?? {})) fill(id, v);
  return Object.keys(patch).length ? at.update(T.members, found.id, patch) : found;
}

async function campaignFor(at: Airtable, a: Attribution | undefined): Promise<string[]> {
  if (!a?.utmCampaign) return [];
  const [c] = await at.find(T.campaigns, `LOWER({${F.campaigns.utm}})=${q(a.utmCampaign.toLowerCase())}`);
  return c ? [c.id] : [];
}

async function findOrCreateClass(at: Airtable, s: SlotRef): Promise<AirRecord> {
  const C = F.classes;
  const [found] = await at.find(T.classes, `{${C.websiteId}}=${q(s.slotId)}`);
  if (found) return found;
  return at.create(T.classes, {
    [C.name]: slotLabel(s),
    [C.type]: SERVICE_NAME[s.service],
    [C.when]: studioInstant(s.date, s.time),
    [C.minutes]: s.minutes,
    ...(s.capacity ? { [C.capacity]: s.capacity } : {}),
    [C.status]: "Scheduled",
    [C.websiteId]: s.slotId,
  });
}

/** The member's current Active membership, if the studio has marked one active. */
async function activeMembership(at: Airtable, member: AirRecord): Promise<string | undefined> {
  const ids = linkIds(member.fields[F.members.memberships]);
  if (!ids.length) return undefined;
  const M = F.memberships;
  const rows = await at.find(T.memberships, `AND({${M.status}}='Active',OR(${ids.map((id) => `RECORD_ID()=${q(id)}`).join(",")}))`, 10);
  rows.sort((a, b) => String(b.fields[M.start] ?? "").localeCompare(String(a.fields[M.start] ?? "")));
  return rows[0]?.id;
}

async function planByWebsiteId(at: Airtable, planId: string) {
  const P = F.plans;
  if (!/^[a-z0-9]{2,12}$/.test(planId)) throw new BadRequest("bad plan");
  const [plan] = await at.find(T.plans, `{${P.websiteId}}=${q(planId)}`);
  if (!plan) throw new BadRequest("unknown plan");
  const regular = Number(plan.fields[P.regular] ?? 0);
  const launch = Number(plan.fields[P.launch] ?? 0);
  const type = (plan.fields[P.type] as string | undefined) ?? "";
  return {
    plan,
    websiteId: planId,
    name: String(plan.fields[P.name] ?? planId),
    type,
    price: launch || regular, // launch pricing is on; when it ends, clear "Launch price" in Airtable
    launchApplied: !!launch || !!plan.fields[P.bonus],
    bonus: Number(plan.fields[P.bonus] ?? 0),
    validityMonths: Number(plan.fields[P.validityMonths] ?? 1),
  };
}

function giftCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(bytes, (b) => abc[b % abc.length]).join("");
  return `RS-${s.slice(0, 4)}-${s.slice(4)}`;
}

// ---------- event handlers ----------

type Ctx = { env: Env; ip: string | null; botChecked: boolean; origin: string; wait: (p: Promise<unknown>) => void };

// ---------- receipts ----------

/** A payment already saved for this order (the same purchase sent twice: double tap, outbox retry). */
async function paymentForOrder(at: Airtable, orderId: string | undefined): Promise<AirRecord | undefined> {
  if (!orderId) return undefined;
  const [found] = await at.find(T.payments, `FIND(${q(orderId)},{${F.payments.name}})`);
  return found;
}

/** Builds the hosted link, answers with it, and sends the receipt in the background (after the reply). */
async function issueReceipt(ctx: Ctx, r: ReceiptData): Promise<Pick<RelayReply, "receiptUrl" | "sentVia">> {
  const link = await receiptLink(ctx.env, ctx.origin, r);
  const via = channelsFor(ctx.env, r);
  if (via.length) ctx.wait(sendReceipt(ctx.env, r, via, link));
  return { receiptUrl: link, sentVia: via };
}

/**
 * A membership that is still running for the same monthly plan: buying it again would pay twice for the same month.
 * Renewing in its last days is fine. Passes may be bought again at any time (the classes add up).
 */
async function sameMembershipRunning(at: Airtable, member: AirRecord, planRecordId: string, today: string): Promise<string | undefined> {
  const ids = linkIds(member.fields[F.members.memberships]);
  if (!ids.length) return undefined;
  const S = F.memberships;
  const renewFrom = addDays(today, 3);
  const rows = await at.find(T.memberships, `AND(OR(${ids.map((id) => `RECORD_ID()=${q(id)}`).join(",")}),IS_AFTER({${S.renews}},${q(renewFrom)}))`, 20);
  return rows.find((r) => linkIds(r.fields[S.plan]).includes(planRecordId) && r.fields[S.status] !== "Cancelled")?.fields[S.renews] as string | undefined;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
type Handler = (at: Airtable, body: Record<string, unknown>, ctx: Ctx) => Promise<RelayReply>;

const lang = (v: unknown) => (v === "en" ? "en" : "he") as "he" | "en";

const handlers: Record<RelayEvent, Handler> = {
  async lead(at, b, ctx) {
    const m = b as unknown as LeadMsg;
    const c = contact(m.contact);
    const secret = ctx.env.TURNSTILE_SECRET;
    const viaRetry = !!secret && (await validRetryPass(secret, "lead", m.retry));
    if (!viaRetry && !(await passesTurnstile(secret, m.turnstile, ctx.ip))) throw new BotCheckFailed();
    ctx.botChecked = !!secret && !viaRetry; // a retry pass is not renewed; the original one keeps its expiry
    const a = attribution(m.attribution);
    const heard = oneOf(m.heard, HEARD_FROM);
    const interest = INTEREST[text(m.interest, 20)] ?? "Reformer";
    const prefTime = oneOf(m.prefTime, PREF_TIMES);
    // Independent lookups: run together to save an Airtable round-trip.
    const [member, campaign] = await Promise.all([
      upsertMember(at, c, {
        lang: lang(m.lang),
        heard,
        attribution: a,
        consent: m.consent === true,
        interests: [interest],
        extra: prefTime ? { [F.members.prefTimes]: [prefTime] } : undefined,
      }),
      campaignFor(at, a),
    ]);
    const L = F.leads;
    const lead = await at.create(T.leads, {
      [L.name]: `${fullName(c)} · website form · ${todayIL()}`,
      [L.person]: fullName(c),
      [L.phone]: phonePretty(c.phone),
      ...(c.email ? { [L.email]: c.email } : {}),
      [L.channel]: "Website form",
      [L.interested]: [interest],
      ...(m.note ? { [L.message]: text(m.note, 200) } : {}),
      ...(prefTime ? { [L.prefTime]: prefTime } : {}),
      [L.page]: [text(m.page, 120), attributionNote(a)].filter(Boolean).join(" · "),
      [L.status]: "New",
      [L.member]: [member.id],
      [L.campaign]: campaign,
      ...(heard ? { [L.heard]: heard } : {}),
      [L.consent]: m.consent === true,
    });
    return { ok: true, id: lead.id };
  },

  async checkout(at, b, ctx) {
    const m = b as unknown as CheckoutMsg;
    if (m.termsAccepted !== true) throw new BadRequest("terms not accepted");
    const c = contact(m.contact);
    const method = oneOf(m.method, ["bit", "card"] as const);
    if (!method) throw new BadRequest("bad method");
    const orderId = isReceiptNumber(m.orderId) ? m.orderId : undefined;
    const p = await planByWebsiteId(at, text(m.planId, 12, true));
    const kind = oneOf(m.kind, ["reformer", "mat"] as const);
    // Airtable lists the Reformer price. Mat is ₪5 a class less, taken from the site's own price list so the two never drift.
    const local = planById(p.websiteId);
    const matOff = kind === "mat" && local ? priceFor(local, "reformer") - priceFor(local, "mat") : 0;
    const price = Math.max(0, p.price - matOff);
    const kindLabel = kind ? { reformer: "Reformer", mat: "Mat" }[kind] : "";
    const carry = Math.min(Math.max(Math.round(Number(m.carryOver) || 0), 0), 60);
    const today = todayIL();
    // The same order sent twice (double tap, outbox retry) is saved once
    const again = await paymentForOrder(at, orderId);
    if (again) return { ok: true, id: linkIds(again.fields[F.payments.membership])[0], duplicate: true };
    const member = await upsertMember(at, c, {
      lang: lang(m.lang),
      heard: oneOf(m.heard, HEARD_FROM),
      attribution: attribution(m.attribution),
      consent: m.consent === true,
      consentSource: "Checkout",
    });
    if (p.type !== "Pass") {
      const until = await sameMembershipRunning(at, member, p.plan.id, today);
      if (until) throw new Conflict("already active", until);
    }
    await at.update(T.members, member.id, { [F.members.termsOn]: today });
    const S = F.memberships;
    const [y, mo] = today.split("-").map(Number);
    const membership = await at.create(T.memberships, {
      // Status stays empty until Orit confirms the payment and sets it to Active.
      [S.name]: `${fullName(c)} · ${p.name}${kindLabel ? ` (${kindLabel})` : ""} · ${MONTHS[mo - 1]} ${y}${carry ? ` · +${carry} carried over` : ""}`,
      [S.autoRenew]: p.type !== "Pass" && m.autoRenew === true,
      [S.member]: [member.id],
      [S.plan]: [p.plan.id],
      [S.start]: today,
      [S.renews]: addMonths(today, p.validityMonths || 1),
      ...(p.type === "Pass" && p.bonus ? { [S.bonus]: p.bonus } : {}),
      [S.pricePaid]: price,
      [S.launchApplied]: p.launchApplied,
      [S.soldBy]: "Website",
    });
    const P = F.payments;
    await at.create(T.payments, {
      [P.name]: [orderId, fullName(c), p.name].filter(Boolean).join(" · "),
      [P.for]: p.type === "Pass" ? "Pass" : "Membership",
      [P.amount]: price,
      [P.method]: { bit: "Bit", card: "Credit card" }[method],
      [P.status]: "Pending",
      [P.member]: [member.id],
      [P.membership]: [membership.id],
    });
    if (!orderId) return { ok: true, id: membership.id };
    const lg = lang(m.lang);
    const label = text(m.itemLabel, 80) || `${p.name}${kindLabel ? ` · ${kindLabel}` : ""}`;
    const classes = local?.billingType === "pass" ? (local.sessions ?? 0) + (siteConfig.flags.launchPricing ? (local.bonusSessions ?? 0) : 0) + carry : 0;
    const sent = await issueReceipt(ctx, {
      no: orderId,
      issuedAt: new Date().toISOString(),
      lang: lg,
      customer: { name: fullName(c), phone: phonePretty(c.phone), email: c.email },
      lines: [{ label, ...(carry ? { detail: lg === "he" ? `כולל ${carry} שיעורים שנותרו מהמנוי הקודם` : `Includes ${carry} classes left on your previous plan` } : {}), amount: price }],
      total: price,
      method,
      paid: false, // Orit confirms the payment in Airtable
      ...(classes ? { classesTotal: classes } : {}),
      validUntil: addMonths(today, p.validityMonths || 1),
    });
    return { ok: true, id: membership.id, ...sent };
  },

  async booking(at, b) {
    const m = b as unknown as BookingMsg;
    const c = contact(m.contact);
    const s = slot(m.slot);
    const B = F.bookings;
    let bed = typeof m.bed === "number" && m.bed >= 0 && m.bed < 5 ? String(m.bed + 1) : "Any";
    // A full class can't take another booking; a bed someone else already holds becomes "any free bed"
    const taken = await at.find(T.bookings, `AND(${ACTIVE_BOOKING}, {${B.slotId}}=${q(s.slotId)})`, 20);
    if (s.capacity && taken.length >= s.capacity) throw new Conflict("full");
    if (bed !== "Any" && taken.some((r) => String(r.fields[B.bed] ?? "") === bed)) bed = "Any";
    const member = await upsertMember(at, c, { lang: lang(m.lang), attribution: attribution(m.attribution) });
    const klass = await findOrCreateClass(at, s);
    const membership = await activeMembership(at, member);
    const booking = await at.create(T.bookings, {
      [B.name]: `${fullName(c)} · ${slotLabel(s)}`,
      [B.member]: [member.id],
      [B.class]: [klass.id],
      ...(membership ? { [B.membership]: [membership] } : {}),
      ...(s.service === "reformer" ? { [B.bed]: bed } : {}),
      [B.slotId]: s.slotId,
      [B.shownOn]: scheduleName(c, oneOf(m.showAs, SHOW_AS) ?? "short"),
      [B.via]: m.held ? "Checkout (payment pending)" : "App",
      [B.status]: m.held ? "Held" : "Booked",
    });
    const stage = member.fields[F.members.lifecycle];
    if (stage === "New enquiry" || stage === "Contacted") await at.update(T.members, member.id, { [F.members.lifecycle]: "First class booked" });
    return { ok: true, id: booking.id };
  },

  async cancel(at, b) {
    const m = b as unknown as CancelMsg;
    const id = text(m.bookingId, 17, true);
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new BadRequest("bad booking");
    const B = F.bookings;
    const booking = await at.get(T.bookings, id);
    const [memberId] = linkIds(booking.fields[B.member]);
    if (!memberId) throw new BadRequest("not found");
    const member = await at.get(T.members, memberId);
    const onFile = String(member.fields[F.members.phone] ?? "").replace(/\D/g, "").replace(/^972/, "0");
    if (onFile !== phoneDigits(m.phone)) throw new BadRequest("not found");
    if (booking.fields[B.status] !== "Booked" && booking.fields[B.status] !== "Held") return { ok: true, id };
    const start = Number(booking.fields[B.classStartUnix] ?? 0) * 1000;
    const hours = start ? (start - Date.now()) / 3_600_000 : CANCEL_HOURS;
    await at.update(T.bookings, id, {
      [B.status]: hours >= CANCEL_HOURS ? "Cancelled on time" : "Late cancel",
      [B.cancelledOn]: new Date().toISOString(),
    });
    return { ok: true, id };
  },

  // Auto-renew switched on or off in the profile: the membership's Auto-renew checkbox follows.
  async renewal(at, b) {
    const m = b as unknown as RenewalMsg;
    const id = text(m.membershipId, 17, true);
    if (!/^rec[A-Za-z0-9]{14}$/.test(id) || typeof m.autoRenew !== "boolean") throw new BadRequest("bad membership");
    const S = F.memberships;
    const ms = await at.get(T.memberships, id);
    const [memberId] = linkIds(ms.fields[S.member]);
    if (!memberId) throw new BadRequest("not found");
    const member = await at.get(T.members, memberId);
    const onFile = String(member.fields[F.members.phone] ?? "").replace(/\D/g, "").replace(/^972/, "0");
    if (onFile !== phoneDigits(m.phone)) throw new BadRequest("not found");
    await at.update(T.memberships, id, { [S.autoRenew]: m.autoRenew });
    return { ok: true, id };
  },

  // Health declaration: one new row in the restricted "Health & Consent" table per declaration (an audit trail).
  // Only short labels go to Airtable; the free-text injury note is capped. A doctor's approval is flagged on the first line.
  async "health-declaration"(at, b, ctx) {
    const m = b as unknown as HealthMsg;
    const c = contact(m.contact);
    // Same bot check as the lead form: this writes into Orit's restricted health table.
    const secret = ctx.env.TURNSTILE_SECRET;
    const viaRetry = !!secret && (await validRetryPass(secret, "health-declaration", m.retry));
    if (!viaRetry && !(await passesTurnstile(secret, m.turnstile, ctx.ip))) throw new BotCheckFailed();
    ctx.botChecked = !!secret && !viaRetry;
    const raw = (m.answers ?? {}) as unknown as Record<string, unknown>;
    const yes = (k: string) => {
      if (typeof raw[k] !== "boolean") throw new BadRequest("missing answer");
      return raw[k] as boolean;
    };
    const pregnancy = oneOf(raw.pregnancy, PREGNANCY);
    if (!pregnancy) throw new BadRequest("missing answer");
    const a: HealthAnswers = {
      ...(Object.fromEntries(CLEARANCE_QUESTIONS.map((k) => [k, yes(k)])) as Record<(typeof CLEARANCE_QUESTIONS)[number], boolean>),
      pregnancy,
      injury: yes("injury"),
      injuryNote: text(raw.injuryNote, 400),
      adult: yes("adult"),
      guardianName: text(raw.guardianName, 80),
      guardianPhone: text(raw.guardianPhone, 20),
    };
    if (guardianMissing(a)) throw new BadRequest("guardian required");
    const member = await upsertMember(at, c, { lang: lang(m.lang) });
    const today = todayIL();
    const reasons = clearanceReasons(a);
    const lines = [
      reasons.length ? `⚠ Doctor's approval needed: ${reasons.map((r) => HEALTH_LABEL[r] ?? r).join(", ")}` : "No doctor's approval needed",
      a.injury ? `Injury / pain / recent surgery: ${a.injuryNote || "yes"}` : "",
      a.adult ? "" : `Under 18 · parent or guardian: ${a.guardianName} · ${a.guardianPhone}`,
      `Wording: ${text(m.version, 40) || "unknown"}`,
    ].filter(Boolean);
    const H = F.health;
    const rec = await at.create(T.health, {
      [H.name]: `${fullName(c)} · Health declaration · ${today}`,
      [H.signed]: true,
      [H.signedOn]: today,
      [H.validUntil]: addMonths(today, HEALTH_VALID_MONTHS),
      [H.conditions]: lines.join("\n"),
      [H.pregnant]: { no: "No", pregnant: "Pregnant", postnatal: "Postnatal" }[pregnancy],
      [H.via]: "Profile (online)",
      [H.member]: [member.id],
    });
    return { ok: true, id: rec.id };
  },

  // Is there a current declaration on file? Lets a member who declared on another device (or on paper) book without
  // declaring again. Asks for the phone and the last name, and answers only a date, so it reveals nothing about health.
  async "health-status"(at, b) {
    const m = b as unknown as HealthStatusMsg;
    const phone = phoneDigits(m.phone);
    const last = text(m.lastName, 60, true).toLowerCase();
    const member = await memberByPhone(at, phone);
    if (!member || String(member.fields[F.members.lastName] ?? "").trim().toLowerCase() !== last) return { ok: true };
    const ids = linkIds(member.fields[F.members.health]).slice(0, 20);
    if (!ids.length) return { ok: true };
    const H = F.health;
    const rows = await at.find(T.health, `OR(${ids.map((id) => `RECORD_ID()=${q(id)}`).join(",")})`, ids.length);
    const today = todayIL();
    // Online declarations count only in the current wording; paper or QR ones that Orit entered always count.
    const best = rows
      .filter((r) => r.fields[H.signed] === true && String(r.fields[H.validUntil] ?? "") >= today)
      .filter((r) => r.fields[H.via] !== "Profile (online)" || String(r.fields[H.conditions] ?? "").includes(`Wording: ${HEALTH_VERSION}`))
      .map((r) => String(r.fields[H.validUntil]))
      .sort()
      .pop();
    return { ok: true, ...(best ? { validUntil: best } : {}) };
  },

  async waitlist(at, b) {
    const m = b as unknown as WaitlistMsg;
    const c = contact(m.contact);
    const s = slot(m.slot);
    const member = await upsertMember(at, c, { lang: lang(m.lang), attribution: attribution(m.attribution) });
    const klass = await findOrCreateClass(at, s);
    const W = F.waitlist;
    const entry = await at.create(T.waitlist, {
      [W.name]: `${fullName(c)} · ${slotLabel(s)}`,
      [W.member]: [member.id],
      [W.class]: [klass.id],
      [W.position]: Number(klass.fields[F.classes.onWaitlist] ?? 0) + 1,
      [W.status]: "Waiting",
    });
    return { ok: true, id: entry.id };
  },

  // Online payment is not live yet: anyone who tries to buy or book is saved here so Orit can call them when it opens.
  async "launch-waitlist"(at, b) {
    const m = b as unknown as LaunchWaitlistMsg;
    const c = contact(m.contact);
    const classType = oneOf(m.classType, ["Reformer", "Mat", "Teens", "Gift card", "Not sure"] as const) ?? "Not sure";
    const prefTime = oneOf(m.prefTime, LAUNCH_TIMES);
    const source = oneOf(m.source, ["Pricing", "Booking", "Gift card", "Class page", "Shop"] as const) ?? "Pricing";
    // Gift cards and shop "notify me" sign-ups have no class time to pick.
    if (!prefTime && classType !== "Gift card" && source !== "Shop") throw new BadRequest("bad time");
    const lg = lang(m.lang);
    const interest = classType === "Reformer" || classType === "Mat" || classType === "Teens" ? classType : undefined;
    const member = await upsertMember(at, c, {
      lang: lg,
      attribution: attribution(m.attribution),
      consent: m.consent === true,
      interests: interest ? [interest] : undefined,
      extra: prefTime ? { [F.members.prefTimes]: [prefTime === "Adult morning" ? "Morning" : "Evening"] } : undefined,
    });
    const W = F.launchWaitlist;
    const planId = text(m.planId, 12);
    const wanted = text(m.wanted, 80);
    const slotText = text(m.slot, 80);
    const row = await at.create(T.launchWaitlist, {
      [W.name]: fullName(c),
      [W.phone]: phonePretty(c.phone),
      ...(c.email ? { [W.email]: c.email } : {}),
      [W.member]: [member.id],
      [W.classType]: classType,
      ...(prefTime ? { [W.prefTime]: prefTime } : {}),
      ...(wanted ? { [W.wanted]: wanted } : {}),
      ...(planId ? { [W.planId]: planId } : {}),
      ...(slotText ? { [W.slot]: slotText } : {}),
      [W.source]: source,
      [W.language]: lg === "he" ? "Hebrew" : "English",
      [W.consent]: m.consent === true,
      [W.submitted]: new Date().toISOString(),
    });
    return { ok: true, id: row.id };
  },

  async gift(at, b, ctx) {
    const m = b as unknown as GiftMsg;
    const c = contact(m.buyer);
    const orderId = isReceiptNumber(m.orderId) ? m.orderId : undefined;
    const again = await paymentForOrder(at, orderId);
    if (again) {
      const [giftId] = linkIds(again.fields[F.payments.gift]);
      const g = giftId ? await at.get(T.gifts, giftId) : undefined;
      return { ok: true, id: giftId, code: g ? String(g.fields[F.gifts.code] ?? "") : undefined, duplicate: true };
    }
    const recipient = text(m.recipientName, 60, true);
    const planId = m.planId ? text(m.planId, 12) : "";
    const p = planId ? await planByWebsiteId(at, planId) : null;
    const value = p ? p.price : Math.round(Number(m.amount));
    if (!Number.isFinite(value) || value < 50 || value > 5000) throw new BadRequest("bad amount");
    const member = await upsertMember(at, c, { lang: lang(m.lang), attribution: attribution(m.attribution), consent: m.consent === true, consentSource: "Checkout" });
    const G = F.gifts;
    const code = giftCode();
    // Status and expiry stay empty until Orit confirms payment (check the legal minimum validity for gift vouchers).
    const gift = await at.create(T.gifts, {
      [G.code]: code,
      [G.buyer]: [member.id],
      [G.recipient]: recipient,
      ...(m.note ? { [G.message]: text(m.note, 120) } : {}),
      [G.value]: value,
      ...(p ? { [G.plan]: [p.plan.id] } : {}),
    });
    const P = F.payments;
    await at.create(T.payments, {
      [P.name]: [orderId, fullName(c), `gift card ${code}`].filter(Boolean).join(" · "),
      [P.for]: "Gift card",
      [P.amount]: value,
      [P.status]: "Pending",
      [P.member]: [member.id],
      [P.gift]: [gift.id],
    });
    if (!orderId) return { ok: true, id: gift.id, code };
    const lg = lang(m.lang);
    const sent = await issueReceipt(ctx, {
      no: orderId,
      issuedAt: new Date().toISOString(),
      lang: lg,
      customer: { name: fullName(c), phone: phonePretty(c.phone), email: c.email },
      lines: [{ label: text(m.itemLabel, 80) || (lg === "he" ? "כרטיס מתנה" : "Gift card"), detail: lg === "he" ? `עבור ${recipient}` : `For ${recipient}`, amount: value }],
      total: value,
      paid: false,
      giftCode: code,
    });
    return { ok: true, id: gift.id, code, ...sent };
  },

  async quiz(at, b) {
    const m = b as unknown as QuizMsg;
    const goal = oneOf(m.goal, ["strength", "calm", "care", "together"] as const);
    const exp = oneOf(m.experience, ["none", "some", "regular"] as const);
    const style = oneOf(m.style, ["group", "solo", "pair"] as const);
    const rec = oneOf(m.recommended, ["reformer", "mat", "private", "duo"] as const);
    if (!goal || !exp || !style || !rec) throw new BadRequest("bad answers");
    const Q = F.quiz;
    const recName = { reformer: "Reformer", mat: "Mat", private: "Private", duo: "Duo" }[rec];
    const r = await at.create(T.quiz, {
      [Q.result]: `${recName} · ${todayIL()}`,
      [Q.goal]: { strength: "Strength", calm: "Calm & mobility", care: "Gentle return", together: "Together" }[goal],
      [Q.experience]: { none: "None", some: "Some", regular: "Regular" }[exp],
      [Q.prefers]: { group: "Small group", solo: "One-to-one", pair: "With a friend" }[style],
      [Q.recommended]: recName,
    });
    return { ok: true, id: r.id };
  },

  async "quiz-contact"(at, b) {
    const m = b as unknown as QuizContactMsg;
    const id = text(m.quizId, 17, true);
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new BadRequest("bad quiz");
    const c = contact(m.contact);
    const Q = F.quiz;
    const quiz = await at.get(T.quiz, id);
    const rec = String(quiz.fields[Q.recommended] ?? "Reformer");
    const interest = rec === "Private" ? "Private 1:1" : rec;
    const exp = { None: "New to Pilates", Some: "Some classes", Regular: "Regular" }[String(quiz.fields[Q.experience] ?? "")];
    const a = attribution(m.attribution);
    const [member, campaign] = await Promise.all([
      upsertMember(at, c, {
        lang: lang(m.lang),
        attribution: a,
        consent: m.consent === true,
        interests: [interest],
        extra: exp ? { [F.members.experience]: exp } : undefined,
      }),
      campaignFor(at, a),
    ]);
    await at.update(T.quiz, id, { [Q.member]: [member.id] });
    const L = F.leads;
    await at.create(T.leads, {
      [L.name]: `${fullName(c)} · quiz · ${todayIL()}`,
      [L.person]: fullName(c),
      [L.phone]: phonePretty(c.phone),
      ...(c.email ? { [L.email]: c.email } : {}),
      [L.channel]: "Website form",
      [L.interested]: [interest],
      [L.message]: `Find your class quiz → ${rec} (${quiz.fields[Q.goal] ?? ""}, ${quiz.fields[Q.experience] ?? ""}, ${quiz.fields[Q.prefers] ?? ""})`,
      [L.page]: ["/quiz", attributionNote(a)].filter(Boolean).join(" · "),
      [L.status]: "New",
      [L.member]: [member.id],
      [L.campaign]: campaign,
      [L.consent]: m.consent === true,
    });
    return { ok: true, id };
  },

  async chat(at, b) {
    const m = b as unknown as ChatMsg;
    const question = text(m.question, 500, true);
    const intent = text(m.intent, 30);
    const C = F.chat;
    const r = await at.create(T.chat, {
      [C.question]: question,
      [C.language]: lang(m.lang) === "he" ? "Hebrew" : "English",
      [C.answeredAuto]: !!intent,
      [C.topic]: CHAT_TOPIC[intent] ?? "Other",
      [C.handedToOrit]: m.handoff === true,
      ...(intent ? { [C.answerUsed]: intent } : {}),
    });
    return { ok: true, id: r.id };
  },
};

/** Health declaration answers that need a doctor's approval, as Orit reads them in Airtable. */
const HEALTH_LABEL: Record<string, string> = {
  heart: "heart condition or high blood pressure",
  chest: "chest pain",
  dizzy: "dizziness or fainting in the past year",
  asthma: "asthma attack treated in the past year",
  family: "family history of early heart disease",
  supervised: "doctor said exercise only under supervision",
  chronic: "chronic condition",
  pregnant: "pregnant",
  postnatal: "gave birth in the last 12 months",
};

/** Scripted chat answers (src/content/chat.ts) grouped into the Airtable topics. */
const CHAT_TOPIC: Record<string, string> = {
  book: "Booking",
  times: "Booking",
  waitlist: "Booking",
  price: "Price",
  gift: "Price",
  payment: "Payment",
  cancel: "Cancel",
  health: "Health",
  pregnancy: "Pregnancy",
  where: "Location",
  parking: "Location",
  hours: "Location",
};

// ---------- short links ----------

// /go/wa, /go/book, … for flyers and QR codes. Change the target here, the printed QR stays the same.
function go(slug: string, url: URL) {
  const s = siteConfig.social;
  const c = siteConfig.contact;
  const targets: Record<string, string> = {
    book: "/he/schedule",
    prices: "/he/pricing",
    gift: "/he/gift",
    quiz: "/he/quiz",
    map: mapsLink(),
    ig: s.instagram,
    tiktok: s.tiktok,
    fb: s.facebook,
    wa: isTodo(c.whatsapp) ? "/he/contact" : `https://wa.me/${c.whatsapp}`,
    review: isTodo(s.googleReview) ? "/he/contact" : s.googleReview,
  };
  const to = targets[slug];
  if (!to) return Response.redirect(new URL("/", url).toString(), 302);
  // Keep ?utm_… so campaigns can tell which flyer brought the visit.
  const dest = new URL(to, url);
  if (dest.host === url.host) url.searchParams.forEach((v, k) => dest.searchParams.set(k, v));
  return Response.redirect(dest.toString(), 302);
}

// ---------- entry point ----------

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("Origin");
  if (!origin) return false;
  let o: URL;
  try {
    o = new URL(origin); // "null" (sandboxed iframes) and other junk are simply not us
  } catch {
    return false;
  }
  const u = new URL(req.url);
  if (o.host === u.host) return true;
  // Local origins are only trusted when the Worker itself is running locally (wrangler dev / vite proxy).
  const local = (h: string) => h === "localhost" || h === "127.0.0.1";
  return local(u.hostname) && local(o.hostname);
}

/**
 * Who is booked on each class of one day, for the bed sketches on the schedule.
 * Public, so it returns only the bed and the name each person chose to show (never phone, email or record ids).
 * Cached for a minute at the edge so busy schedule pages cost one Airtable call.
 */
async function roster(env: Env, url: URL, ectx: ExecutionContext): Promise<Response> {
  const date = url.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ ok: false }, 400);
  if (!env.AIRTABLE_TOKEN) return json({ ok: false }, 503);
  const key = new Request(`${url.origin}/api/roster?date=${date}`);
  const cache = typeof caches === "undefined" ? undefined : caches.default; // absent in local tests
  const hit = await cache?.match(key);
  if (hit) return hit;
  const B = F.bookings;
  try {
    const rows = await new Airtable(env.AIRTABLE_TOKEN, env.AIRTABLE_BASE).find(
      T.bookings,
      `AND(${ACTIVE_BOOKING}, FIND(${q(`_${date}_`)}, {${B.slotId}}))`,
      100,
    );
    const slots: NonNullable<RosterReply["slots"]> = {};
    for (const r of rows) {
      const id = String(r.fields[B.slotId] ?? "");
      if (!id) continue;
      const n = Number(r.fields[B.bed]);
      (slots[id] ??= []).push({ bed: n >= 1 && n <= 5 ? n - 1 : null, name: String(r.fields[B.shownOn] ?? "").slice(0, 40) });
    }
    const res = json({ ok: true, slots });
    res.headers.set("Cache-Control", "public, max-age=60");
    if (cache) ectx.waitUntil(cache.put(key, res.clone()));
    return res;
  } catch (e) {
    console.error(JSON.stringify({ msg: "roster failed", status: e instanceof AirtableError ? e.status : undefined }));
    return json({ ok: false }, 502);
  }
}

export default {
  async fetch(req, env, ectx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/go/")) return go(url.pathname.slice(4).replace(/\/$/, ""), url);
    if (url.pathname.startsWith("/r/")) return serveReceipt(env, url);
    if (url.pathname === "/api/roster" && req.method === "GET") return roster(env, url, ectx);
    if (url.pathname === "/api/health") {
      return json({ ok: true, airtable: Boolean(env.AIRTABLE_TOKEN), turnstile: Boolean(env.TURNSTILE_SECRET) } as RelayReply);
    }
    // Pages: add link-preview and search tags for the language and page being served.
    if (!url.pathname.startsWith("/api/")) return withPreview(await env.ASSETS.fetch(req), url);

    const event = url.pathname.slice(5) as RelayEvent;
    if (!(event in handlers)) return json({ ok: false, error: "not found" }, 404);
    if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);
    if (!sameOrigin(req)) return json({ ok: false, error: "origin" }, 403);

    const ip = req.headers.get("CF-Connecting-IP");
    const { success } = await env.FORM_LIMIT.limit({ key: ip ?? "unknown" });
    if (!success) return json({ ok: false, error: "slow down" }, 429);

    if (!env.AIRTABLE_TOKEN) {
      console.error(JSON.stringify({ msg: "AIRTABLE_TOKEN is not set", event }));
      return json({ ok: false, error: "unavailable" }, 503);
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ ok: false, error: "too large" }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw);
      if (!body || typeof body !== "object") throw new Error();
    } catch {
      return json({ ok: false, error: "bad json" }, 400);
    }
    // Honeypot: real visitors never fill the hidden "website" field.
    if (typeof body.website === "string" && body.website) return json({ ok: true });

    const ctx: Ctx = { env, ip, botChecked: false, origin: url.origin, wait: (p) => ectx.waitUntil(p) };
    try {
      const reply = await handlers[event](new Airtable(env.AIRTABLE_TOKEN, env.AIRTABLE_BASE), body, ctx);
      console.log(JSON.stringify({ msg: "relayed", event, id: reply.id }));
      return json(reply);
    } catch (e) {
      if (e instanceof BadRequest) return json({ ok: false, error: e.message }, 400);
      if (e instanceof Conflict) return json({ ok: false, error: e.message, ...(e.until ? { until: e.until } : {}) }, 409);
      if (e instanceof BotCheckFailed) return json({ ok: false, error: "turnstile" }, 403);
      console.error(JSON.stringify({ msg: "relay failed", event, status: e instanceof AirtableError ? e.status : undefined, detail: e instanceof AirtableError ? e.body : String(e) }));
      const retry = ctx.botChecked && env.TURNSTILE_SECRET ? await issueRetryPass(env.TURNSTILE_SECRET, event) : undefined;
      return json({ ok: false, error: "unavailable", ...(retry ? { retry } : {}) }, 502);
    }
  },
} satisfies ExportedHandler<Env>;
