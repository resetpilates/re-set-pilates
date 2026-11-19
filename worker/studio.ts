// Studio hub: Orit's command center at /he/studio (src/pages/Studio.tsx). Everything under /api/studio/.
//
//   POST /api/studio/login   { code }  → { token }   the studio passcode (secret STUDIO_PASSCODE) for a 30-day pass
//   GET  /api/studio/data    Bearer token → one snapshot of Airtable: classes, leads, members, payments, campaigns
//   POST /api/studio/act     Bearer token → one of three small edits: lead status, waitlist "contacted", attendance
//
// The hub reads member names, phones and emails, so every call needs the pass and nothing here is cached.
// Health & Consent and Trainer Check-ins are never read: medical details stay in Airtable, Orit only.
import { ATTENDANCE, LEAD_STATUSES, type StBooking, type StMeta, type StudioAction, type StudioData, type StudioReply } from "../src/lib/studioTypes";
import { Airtable, AirtableError, F, T, type AirRecord } from "./airtable";

declare global {
  interface Env {
    STUDIO_PASSCODE?: string; // the passcode Orit types once per phone. At least 8 characters, or the hub stays closed.
    META_ADS_TOKEN?: string; // optional: a Meta Marketing API token with ads_read, for the Marketing screen
    META_AD_ACCOUNT?: string; // optional: the ad account number (digits only, without "act_")
  }
}

const TZ = "Asia/Jerusalem";
const PASS_DAYS = 30;
const MAX_MEMBERS = 500;

// Fields the relay never needed (worker/airtable.ts has the rest).
const X = {
  memberAdded: "fld1C1oB1eWPXFIgq",
  memberPlanStatus: "fldl2W4id3WcEAB1v",
  memberRenews: "fldpwGqyvDQIOfgxL",
  memberClassesLeft: "fldkaD5FRdCbIqdfe",
  memberLastClass: "fld31c77sI4TyuoPv",
  memberAttended: "fld8YJfpLeGHX3opg",
  leadReceived: "fld704sQd3Yul8r8q",
  leadFirstResponse: "fldGdvxcAvHvxtnFn",
  paymentPaidOn: "fld00nCxSiz7LZD1V",
  membershipSessionsLeft: "fldytuDwYaazHUijV",
  campaignName: "fldB939T4RLkbyYjf",
  campaignChannel: "fldkoAsOSIn3wnIlW",
  campaignStart: "fldGKv0dgWbWPEw64",
  campaignEnd: "fldcQw3cDeRphCJrs",
  campaignOffer: "fld1t0GEB3QHDHhbK",
  campaignBudget: "fld227DSuSuAwFjx8",
  campaignLeads: "fldb35TQM3Ij4WOPm",
  chatAsked: "fldWUzkgoirKEXiT2",
} as const;

const reply = (body: StudioReply | StudioData, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// ---------- the pass ----------

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}
/** Signed with the passcode itself: changing the passcode signs every phone out. */
export async function issuePass(passcode: string, now = Date.now()): Promise<string> {
  const exp = now + PASS_DAYS * 864e5;
  return `${exp}.${await hmacHex(passcode, `studio.${exp}`)}`;
}
export async function validPass(passcode: string, pass: string | null, now = Date.now()): Promise<boolean> {
  const [exp, sig] = (pass ?? "").split(".");
  if (!/^\d{13}$/.test(exp ?? "") || Number(exp) < now || !sig) return false;
  return sig === (await hmacHex(passcode, `studio.${exp}`));
}
const passcodeOf = (env: Env) => ((env.STUDIO_PASSCODE ?? "").length >= 8 ? env.STUDIO_PASSCODE! : "");

// ---------- reading Airtable values ----------

// Lookups and rollups come back as arrays; plain fields as values.
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : v);
const str = (v: unknown): string => {
  const x = first(v);
  return typeof x === "string" ? x : typeof x === "number" ? String(x) : "";
};
const num = (v: unknown): number | null => {
  const x = first(v);
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const day = (v: unknown): string => str(v).slice(0, 10);

const todayIL = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
/** Unix seconds of midnight (studio time) that starts `date`. */
function studioMidnight(date: string): number {
  const off = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${date}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")!
    .value.replace("GMT", "");
  return Date.parse(`${date}T00:00:00${off || "+00:00"}`) / 1000;
}

/** Runs the reads a few at a time: Airtable allows 5 requests a second per base. */
async function inBatches<T>(jobs: (() => Promise<T>)[], size = 4): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < jobs.length; i += size) out.push(...(await Promise.all(jobs.slice(i, i + size).map((j) => j()))));
  return out;
}

async function metaAds(env: Env): Promise<StMeta | null> {
  const account = (env.META_AD_ACCOUNT ?? "").replace(/\D/g, "");
  if (!env.META_ADS_TOKEN || !account) return null;
  const empty: StMeta = { ok: false, spend: 0, currency: "", impressions: 0, clicks: 0, leads: 0 };
  try {
    const u = new URL(`https://graph.facebook.com/act_${account}/insights`);
    u.searchParams.set("fields", "spend,impressions,clicks,actions,account_currency");
    u.searchParams.set("date_preset", "last_30d");
    const r = await fetch(u, { headers: { Authorization: `Bearer ${env.META_ADS_TOKEN}` } });
    if (!r.ok) {
      console.error(JSON.stringify({ msg: "meta ads failed", status: r.status }));
      return empty;
    }
    const row = ((await r.json()) as { data?: Record<string, unknown>[] }).data?.[0];
    if (!row) return { ...empty, ok: true };
    const actions = (Array.isArray(row.actions) ? row.actions : []) as { action_type?: string; value?: string }[];
    const leads = actions.filter((a) => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped").reduce((n, a) => Math.max(n, Number(a.value) || 0), 0);
    return { ok: true, spend: Number(row.spend) || 0, currency: String(row.account_currency ?? ""), impressions: Number(row.impressions) || 0, clicks: Number(row.clicks) || 0, leads };
  } catch (e) {
    console.error(JSON.stringify({ msg: "meta ads failed", detail: String(e) }));
    return empty;
  }
}

// ---------- the snapshot ----------

export async function snapshot(at: Airtable, env: Env, now = new Date()): Promise<StudioData> {
  const today = todayIL(now);
  const from = studioMidnight(today);
  const to = from + 8 * 86400; // today and the next 7 days
  const M = F.members, C = F.classes, B = F.bookings, L = F.leads, W = F.launchWaitlist, P = F.payments, S = F.memberships;
  const status = (f: string, ...names: string[]) => `OR(${names.map((n) => `{${f}}='${n}'`).join(", ")})`;

  const [members, classes, bookings, leads, waitlist, pending, paid, plans, campaigns, chat] = await inBatches([
    () => at.list(T.members, { fields: [M.fullName, M.phone, M.email, M.status, M.source, X.memberAdded, X.memberPlanStatus, X.memberRenews, X.memberClassesLeft, X.memberLastClass, X.memberAttended], sort: [X.memberAdded, "desc"], max: MAX_MEMBERS }),
    () => at.list(T.classes, { formula: `AND({${C.startUnix}}>=${from}, {${C.startUnix}}<${to}, {${C.status}}!='Cancelled')`, fields: [C.type, C.when, C.capacity, C.status, C.onWaitlist], sort: [C.when, "asc"], max: 200 }),
    () => at.list(T.bookings, { formula: `AND({${B.classStartUnix}}>=${from}, {${B.classStartUnix}}<${to}, ${status(B.status, "Booked", "Held", "Attended", "No-show")})`, fields: [B.bed, B.status, B.member, B.class], max: 500 }),
    () => at.list(T.leads, { fields: [L.person, L.phone, L.email, L.channel, L.interested, L.message, L.prefTime, L.heard, L.status, X.leadReceived], sort: [X.leadReceived, "desc"], max: 200 }),
    () => at.list(T.launchWaitlist, { fields: [W.name, W.phone, W.wanted, W.slot, W.contacted, W.submitted], sort: [W.submitted, "desc"], max: 200 }),
    () => at.list(T.payments, { formula: `{${P.status}}='Pending'`, fields: [P.name, P.for, P.amount, P.method, P.status], max: 100 }),
    () => at.list(T.payments, { formula: `AND({${P.status}}='Paid', IS_AFTER({${X.paymentPaidOn}}, DATEADD(NOW(), -60, 'days')))`, fields: [P.name, P.for, P.amount, P.method, P.status, X.paymentPaidOn], sort: [X.paymentPaidOn, "desc"], max: 300 }),
    () => at.list(T.memberships, { formula: `{${S.status}}='Active'`, fields: [S.name, S.renews, S.autoRenew, X.membershipSessionsLeft], sort: [S.renews, "asc"], max: 300 }),
    () => at.list(T.campaigns, { fields: [X.campaignName, X.campaignChannel, X.campaignStart, X.campaignEnd, X.campaignOffer, X.campaignBudget, X.campaignLeads], sort: [X.campaignStart, "desc"], max: 50 }),
    () => at.list(T.chat, { formula: `{${F.chat.handedToOrit}}`, fields: [F.chat.question, X.chatAsked], sort: [X.chatAsked, "desc"], max: 30 }),
  ]);

  const who = new Map(members.records.map((r) => [r.id, r]));
  const byClass = new Map<string, StBooking[]>();
  for (const b of bookings.records) {
    const m = who.get(list(b.fields[B.member])[0] ?? "");
    const row: StBooking = { id: b.id, name: str(m?.fields[M.fullName]), phone: str(m?.fields[M.phone]), bed: str(b.fields[B.bed]), status: str(b.fields[B.status]) };
    for (const c of list(b.fields[B.class])) byClass.set(c, [...(byClass.get(c) ?? []), row]);
  }
  const pay = (r: AirRecord) => ({ id: r.id, name: str(r.fields[P.name]), what: str(r.fields[P.for]), amount: num(r.fields[P.amount]) ?? 0, method: str(r.fields[P.method]), status: str(r.fields[P.status]), paidOn: str(r.fields[X.paymentPaidOn]) });

  return {
    ok: true,
    at: now.toISOString(),
    today,
    base: env.AIRTABLE_BASE,
    tables: { members: T.members, leads: T.leads, classes: T.classes, bookings: T.bookings, payments: T.payments, memberships: T.memberships, campaigns: T.campaigns, waitlist: T.launchWaitlist, chat: T.chat },
    classes: classes.records.map((r) => ({
      id: r.id,
      type: str(r.fields[C.type]),
      when: str(r.fields[C.when]),
      capacity: num(r.fields[C.capacity]),
      status: str(r.fields[C.status]),
      waitlist: num(r.fields[C.onWaitlist]) ?? 0,
      bookings: (byClass.get(r.id) ?? []).sort((a, b) => a.bed.localeCompare(b.bed)),
    })),
    leads: leads.records.map((r) => ({
      id: r.id,
      name: str(r.fields[L.person]),
      phone: str(r.fields[L.phone]),
      email: str(r.fields[L.email]),
      channel: str(r.fields[L.channel]),
      interested: list(r.fields[L.interested]),
      message: str(r.fields[L.message]),
      prefTime: str(r.fields[L.prefTime]),
      heard: str(r.fields[L.heard]),
      status: str(r.fields[L.status]) || "New",
      received: str(r.fields[X.leadReceived]),
    })),
    waitlist: waitlist.records.map((r) => ({ id: r.id, name: str(r.fields[W.name]), phone: str(r.fields[W.phone]), wanted: str(r.fields[W.wanted]), slot: str(r.fields[W.slot]), contacted: r.fields[W.contacted] === true, submitted: str(r.fields[W.submitted]) })),
    members: members.records.map((r) => ({
      id: r.id,
      name: str(r.fields[M.fullName]),
      phone: str(r.fields[M.phone]),
      email: str(r.fields[M.email]),
      status: str(r.fields[M.status]),
      source: str(r.fields[M.source]),
      added: str(r.fields[X.memberAdded]),
      plan: list(r.fields[X.memberPlanStatus]).includes("Active") ? "Active" : str(r.fields[X.memberPlanStatus]),
      renews: day(r.fields[X.memberRenews]),
      classesLeft: num(r.fields[X.memberClassesLeft]),
      lastClass: day(r.fields[X.memberLastClass]),
      attended: num(r.fields[X.memberAttended]) ?? 0,
    })),
    membersCapped: members.more,
    pending: pending.records.map(pay),
    paid: paid.records.map(pay),
    plans: plans.records.map((r) => ({ id: r.id, name: str(r.fields[S.name]), renews: day(r.fields[S.renews]), autoRenew: r.fields[S.autoRenew] === true, sessionsLeft: num(r.fields[X.membershipSessionsLeft]) })),
    campaigns: campaigns.records.map((r) => ({
      id: r.id,
      name: str(r.fields[X.campaignName]),
      channels: list(r.fields[X.campaignChannel]),
      start: day(r.fields[X.campaignStart]),
      end: day(r.fields[X.campaignEnd]),
      offer: str(r.fields[X.campaignOffer]),
      budget: num(r.fields[X.campaignBudget]),
      leads: num(r.fields[X.campaignLeads]) ?? 0,
    })),
    chat: chat.records.map((r) => ({ id: r.id, question: str(r.fields[F.chat.question]), asked: str(r.fields[X.chatAsked]) })),
    meta: await metaAds(env),
  };
}

// ---------- the three edits ----------

const REC = /^rec[A-Za-z0-9]{14}$/;

export async function act(at: Airtable, a: StudioAction, now = new Date()): Promise<boolean> {
  if (!a || typeof a !== "object" || !REC.test(String(a.id))) return false;
  if (a.kind === "lead") {
    if (!LEAD_STATUSES.includes(a.status)) return false;
    const fields: Record<string, unknown> = { [F.leads.status]: a.status };
    // The first time a lead leaves "New", note when: Airtable works out the response time from it.
    if (a.status !== "New" && !(await at.get(T.leads, a.id)).fields[X.leadFirstResponse]) fields[X.leadFirstResponse] = now.toISOString();
    await at.update(T.leads, a.id, fields);
    return true;
  }
  if (a.kind === "wait") {
    await at.update(T.launchWaitlist, a.id, { [F.launchWaitlist.contacted]: a.contacted === true });
    return true;
  }
  if (a.kind === "booking") {
    if (!ATTENDANCE.includes(a.status)) return false;
    await at.update(T.bookings, a.id, { [F.bookings.status]: a.status });
    return true;
  }
  return false;
}

// ---------- entry ----------

export async function studio(req: Request, env: Env, url: URL, sameOrigin: boolean): Promise<Response> {
  const route = url.pathname.slice("/api/studio/".length);
  const passcode = passcodeOf(env);
  if (!passcode || !env.AIRTABLE_TOKEN) return reply({ ok: false, error: "setup" }, 503);
  const { success } = await env.FORM_LIMIT.limit({ key: `studio:${req.headers.get("CF-Connecting-IP") ?? "unknown"}` });
  if (!success) return reply({ ok: false, error: "slow down" }, 429);

  if (route === "login" && req.method === "POST") {
    if (!sameOrigin) return reply({ ok: false, error: "origin" }, 403);
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().slice(0, 200) : "";
    // Compare digests, not the strings, so the answer takes the same time whatever was typed.
    if ((await hmacHex(passcode, code)) !== (await hmacHex(passcode, passcode))) return reply({ ok: false, error: "code" }, 401);
    return reply({ ok: true, token: await issuePass(passcode) });
  }

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? null;
  if (!(await validPass(passcode, bearer))) return reply({ ok: false, error: "auth" }, 401);
  const at = new Airtable(env.AIRTABLE_TOKEN, env.AIRTABLE_BASE);
  try {
    if (route === "data" && req.method === "GET") return reply(await snapshot(at, env));
    if (route === "act" && req.method === "POST") {
      if (!sameOrigin) return reply({ ok: false, error: "origin" }, 403);
      const done = await act(at, (await req.json().catch(() => null)) as StudioAction);
      return done ? reply({ ok: true }) : reply({ ok: false, error: "bad request" }, 400);
    }
  } catch (e) {
    console.error(JSON.stringify({ msg: "studio failed", route, status: e instanceof AirtableError ? e.status : undefined, detail: e instanceof AirtableError ? e.body : String(e) }));
    return reply({ ok: false, error: "unavailable" }, 502);
  }
  return reply({ ok: false, error: "bad request" }, 404);
}
