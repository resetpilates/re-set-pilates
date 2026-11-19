// Studio hub: Orit's command center at /he/studio (src/pages/Studio.tsx). Everything under /api/studio/.
//
//   POST /api/studio/login   { code }  → { token }   the studio passcode (secret STUDIO_PASSCODE) for a 30-day pass
//   GET  /api/studio/data    Bearer token → one snapshot of Airtable: classes, leads, members, payments, campaigns
//   GET  /api/studio/member  ?id=rec…  → one customer in full: plans, payments with receipts, every class and enquiry
//   GET  /api/studio/docs    ?folder= | ?q=  → the wiki's Documents: one Google Drive folder (worker/drive.ts)
//   GET  /api/studio/file/<id>?e=&s=  → one of those files; the link is signed and lasts a few hours
//   POST /api/studio/act     Bearer token → one of three small edits: lead status, waitlist "contacted", attendance
//
// The hub reads member names, phones and emails, so every call needs the pass and nothing here is cached.
// Health & Consent and Trainer Check-ins are never read: medical details stay in Airtable, Orit only.
import type { ReceiptData } from "../src/lib/receipt";
import { ATTENDANCE, LEAD_STATUSES, type StBooking, type StEvent, type StMember, type StMeta, type StPayment, type StPlan, type StudioAction, type StudioData, type StudioDocs, type StudioMember, type StudioReply } from "../src/lib/studioTypes";
import { Airtable, AirtableError, F, T, type AirRecord } from "./airtable";
import { listDocs, openDoc } from "./drive";
import { receiptLink } from "./notify";

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
const DOC_LINK_HOURS = 6;
/** Gap between the hub's Airtable requests: 4 a second, under Airtable's limit of 5 with room for the public site. Tests set it to 0. */
export const pacing = { ms: 250 };

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
  membershipType: "fldhgUSxfIMQ0VfAT",
  paymentReceiptNo: "fldtWKdPAjQZbt9RJ",
  classBookings: "fldiMbO6i5pgM73vK",
  memberNotes: "fldx6pFCdAuQIbU6q",
  memberSince: "fldD4ztlrfOzlqdMj",
  memberSpent: "fldxf07CZABvSgJ7J",
  memberNoShows: "fldOR0kEM3lyPgg9C",
  memberLateCancels: "fld7QncutCVhxRf2f",
  memberHealthSigned: "fldgFbgj6G3YIrKQr",
  memberBookings: "fldUq9AGWE2REsefs",
  memberPayments: "fldGLowOhww5j2sAn",
  memberInquiries: "fldhG1V8SkmDsdOqQ",
  campaignName: "fldB939T4RLkbyYjf",
  campaignChannel: "fldkoAsOSIn3wnIlW",
  campaignStart: "fldGKv0dgWbWPEw64",
  campaignEnd: "fldcQw3cDeRphCJrs",
  campaignOffer: "fld1t0GEB3QHDHhbK",
  campaignBudget: "fld227DSuSuAwFjx8",
  campaignLeads: "fldb35TQM3Ij4WOPm",
  chatAsked: "fldWUzkgoirKEXiT2",
} as const;

const reply = (body: StudioReply | StudioData | StudioMember | StudioDocs, status = 200) =>
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
/** A space or line break pasted around the passcode in Cloudflare is ignored, as it is on the sign-in screen. */
const passcodeOf = (env: Env) => {
  const p = (env.STUDIO_PASSCODE ?? "").trim();
  return p.length >= 8 ? p : "";
};

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

/** Starts every read; the Airtable client itself lets them through one at a time, paced (see `pacing`). */
const inBatches = <T>(jobs: (() => Promise<T>)[]): Promise<T[]> => Promise.all(jobs.map((j) => j()));

const anyOf = (ids: string[]) => `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
/** Rows by record id, 50 ids per request so the address never gets too long. */
async function byIds(at: Airtable, table: string, ids: string[], fields: string[], and = ""): Promise<AirRecord[]> {
  const out: AirRecord[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const pick = anyOf(ids.slice(i, i + 50));
    out.push(...(await at.list(table, { formula: and ? `AND(${pick}, ${and})` : pick, fields, max: 50 })).records);
  }
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

// ---------- rows → what the hub shows ----------

const M = F.members, P = F.payments, S = F.memberships;
const MEMBER_FIELDS = [M.fullName, M.phone, M.email, M.status, M.source, M.language, X.memberAdded, X.memberPlanStatus, X.memberRenews, X.memberClassesLeft, X.memberLastClass, X.memberAttended];
const PAYMENT_FIELDS = [P.name, P.for, P.amount, P.method, P.status, P.member, X.paymentPaidOn, X.paymentReceiptNo];
const PLAN_FIELDS = [S.name, S.status, S.start, S.renews, S.autoRenew, S.pricePaid, S.member, X.membershipSessionsLeft, X.membershipType];

const toMember = (r: AirRecord): StMember => ({
  id: r.id,
  name: str(r.fields[M.fullName]),
  phone: str(r.fields[M.phone]),
  email: str(r.fields[M.email]),
  status: str(r.fields[M.status]),
  source: str(r.fields[M.source]),
  added: str(r.fields[X.memberAdded]) || (r.createdTime ?? ""),
  plan: list(r.fields[X.memberPlanStatus]).includes("Active") ? "Active" : str(r.fields[X.memberPlanStatus]),
  renews: day(r.fields[X.memberRenews]),
  classesLeft: num(r.fields[X.memberClassesLeft]),
  lastClass: day(r.fields[X.memberLastClass]),
  attended: num(r.fields[X.memberAttended]) ?? 0,
});

const toPlan = (r: AirRecord): StPlan => ({
  id: r.id,
  name: str(r.fields[S.name]),
  status: str(r.fields[S.status]),
  type: str(r.fields[X.membershipType]),
  start: day(r.fields[S.start]),
  renews: day(r.fields[S.renews]),
  autoRenew: r.fields[S.autoRenew] === true,
  price: num(r.fields[S.pricePaid]),
  sessionsLeft: num(r.fields[X.membershipSessionsLeft]),
  memberId: list(r.fields[S.member])[0] ?? "",
});

const RECEIPT_NO = /RS-\d{6}-[A-Z2-9]{4}/;

/**
 * A payment row, with a link to its printable receipt. The receipt is rebuilt from the row as it is now
 * (so it says "paid" once Orit has confirmed it); payments typed in by hand without a receipt number get no link.
 */
async function toPayment(r: AirRecord, who: Map<string, AirRecord>, env: Env, origin: string): Promise<StPayment> {
  const name = str(r.fields[P.name]);
  const no = str(r.fields[X.paymentReceiptNo]).match(RECEIPT_NO)?.[0] ?? name.match(RECEIPT_NO)?.[0] ?? "";
  const memberId = list(r.fields[P.member])[0] ?? "";
  const m = who.get(memberId);
  const parts = name.split(" · ").filter((x) => x && x !== no);
  const customer = str(m?.fields[M.fullName]) || (parts.length > 1 ? parts[0] : "");
  const amount = num(r.fields[P.amount]) ?? 0;
  const status = str(r.fields[P.status]);
  const paidOn = str(r.fields[X.paymentPaidOn]);
  const method = str(r.fields[P.method]);
  let receipt = "";
  if (no) {
    const data: ReceiptData = {
      no,
      issuedAt: paidOn || r.createdTime || new Date().toISOString(),
      lang: str(m?.fields[M.language]) === "English" ? "en" : "he",
      customer: { name: customer, phone: str(m?.fields[M.phone]), email: str(m?.fields[M.email]) || undefined },
      lines: [{ label: parts.filter((x) => x !== customer).join(" · ") || str(r.fields[P.for]), amount }],
      total: amount,
      ...(method === "Bit" ? { method: "bit" as const } : method === "Credit card" ? { method: "card" as const } : {}),
      paid: status === "Paid",
    };
    receipt = (await receiptLink(env, origin, data)) ?? "";
  }
  return { id: r.id, name, what: str(r.fields[P.for]), amount, method, status, paidOn, created: r.createdTime ?? "", no, memberId, member: customer, receipt };
}

// ---------- the snapshot ----------

export async function snapshot(at: Airtable, env: Env, origin: string, now = new Date()): Promise<StudioData> {
  const today = todayIL(now);
  const from = studioMidnight(today);
  const to = from + 8 * 86400; // today and the next 7 days
  const C = F.classes, B = F.bookings, L = F.leads, W = F.launchWaitlist;
  const status = (f: string, ...names: string[]) => `OR(${names.map((n) => `{${f}}='${n}'`).join(", ")})`;

  const [members, classes, leads, waitlist, pending, paid, plans, campaigns, chat] = await inBatches([
    () => at.list(T.members, { fields: MEMBER_FIELDS, sort: [X.memberAdded, "desc"], max: MAX_MEMBERS }),
    () => at.list(T.classes, { formula: `AND({${C.startUnix}}>=${from}, {${C.startUnix}}<${to}, {${C.status}}!='Cancelled')`, fields: [C.type, C.when, C.capacity, C.status, C.onWaitlist, X.classBookings], sort: [C.when, "asc"], max: 200 }),
    () => at.list(T.leads, { fields: [L.person, L.phone, L.email, L.channel, L.interested, L.message, L.prefTime, L.heard, L.status, X.leadReceived], sort: [X.leadReceived, "desc"], max: 200 }),
    () => at.list(T.launchWaitlist, { fields: [W.name, W.phone, W.wanted, W.slot, W.contacted, W.submitted], sort: [W.submitted, "desc"], max: 200 }),
    () => at.list(T.payments, { formula: `{${P.status}}='Pending'`, fields: PAYMENT_FIELDS, max: 100 }),
    // "Paid on" is often left empty when Orit confirms a payment: such a row counts from the day the order was placed.
    () => at.list(T.payments, { formula: `AND({${P.status}}='Paid', IS_AFTER(IF({${X.paymentPaidOn}}, {${X.paymentPaidOn}}, CREATED_TIME()), DATEADD(NOW(), -90, 'days')))`, fields: PAYMENT_FIELDS, max: 300 }),
    () => at.list(T.memberships, { fields: PLAN_FIELDS, sort: [S.start, "desc"], max: 300 }),
    () => at.list(T.campaigns, { fields: [X.campaignName, X.campaignChannel, X.campaignStart, X.campaignEnd, X.campaignOffer, X.campaignBudget, X.campaignLeads], sort: [X.campaignStart, "desc"], max: 50 }),
    () => at.list(T.chat, { formula: `{${F.chat.handedToOrit}}`, fields: [F.chat.question, X.chatAsked], sort: [X.chatAsked, "desc"], max: 30 }),
  ]);

  // The week's bookings, found through the classes themselves (their linked bookings), cancelled ones left out.
  const bookings = await byIds(at, T.bookings, [...new Set(classes.records.flatMap((r) => list(r.fields[X.classBookings])))].slice(0, 500), [B.bed, B.status, B.member, B.class], status(B.status, "Booked", "Held", "Attended", "No-show"));
  // Names for anyone in a class or on a payment who is not among the newest members loaded above.
  const who = new Map(members.records.map((r) => [r.id, r]));
  const strangers = [...new Set([...bookings.map((b) => list(b.fields[B.member])[0]), ...[...pending.records, ...paid.records].map((p) => list(p.fields[P.member])[0])])].filter((id): id is string => Boolean(id) && !who.has(id));
  for (const r of await byIds(at, T.members, strangers.slice(0, 200), MEMBER_FIELDS)) who.set(r.id, r);
  const byClass = new Map<string, StBooking[]>();
  for (const b of bookings) {
    const m = who.get(list(b.fields[B.member])[0] ?? "");
    const row: StBooking = { id: b.id, memberId: m?.id ?? "", name: str(m?.fields[M.fullName]), phone: str(m?.fields[M.phone]), bed: str(b.fields[B.bed]), status: str(b.fields[B.status]) };
    for (const c of list(b.fields[B.class])) byClass.set(c, [...(byClass.get(c) ?? []), row]);
  }
  const pay = (rows: AirRecord[]) => Promise.all(rows.map((r) => toPayment(r, who, env, origin)));

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
    members: members.records.map(toMember),
    membersCapped: members.more,
    pending: await pay(pending.records),
    paid: (await pay(paid.records)).sort((a, b) => (b.paidOn || b.created).localeCompare(a.paidOn || a.created)),
    plans: plans.records.map(toPlan),
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

// ---------- one customer in full ----------

const HISTORY_CLASSES = 100;

export async function memberDetail(at: Airtable, env: Env, origin: string, id: string): Promise<StudioMember> {
  const m = await at.get(T.members, id);
  const B = F.bookings, L = F.leads;
  const allBookings = list(m.fields[X.memberBookings]);
  const ids = { plans: list(m.fields[M.memberships]), payments: list(m.fields[X.memberPayments]), bookings: allBookings.slice(-HISTORY_CLASSES), inquiries: list(m.fields[X.memberInquiries]).slice(-50) };
  const none = { records: [] as AirRecord[], more: false };
  const [plans, payments, bookings, inquiries] = await inBatches([
    async () => ({ ...none, records: await byIds(at, T.memberships, ids.plans.slice(-50), PLAN_FIELDS) }),
    async () => ({ ...none, records: await byIds(at, T.payments, ids.payments.slice(-100), PAYMENT_FIELDS) }),
    async () => ({ ...none, records: await byIds(at, T.bookings, ids.bookings, [B.name, B.status, B.classStartUnix]) }),
    async () => ({ ...none, records: await byIds(at, T.leads, ids.inquiries, [L.message, L.channel, L.status, L.interested, X.leadReceived]) }),
  ]);
  const who = new Map([[m.id, m]]);
  const name = str(m.fields[M.fullName]);
  const pays = (await Promise.all(payments.records.map((r) => toPayment(r, who, env, origin)))).sort((a, b) => (b.paidOn || b.created).localeCompare(a.paidOn || a.created));
  const planRows = plans.records.map(toPlan).sort((a, b) => b.start.localeCompare(a.start));
  const short = (title: string) => title.split(" · ").filter((x) => x && x !== name).join(" · ") || title;

  const history: StEvent[] = [
    ...bookings.records.map((r): StEvent => {
      const unix = num(r.fields[B.classStartUnix]);
      return { when: unix ? new Date(unix * 1000).toISOString() : (r.createdTime ?? ""), kind: "class", title: short(str(r.fields[B.name])), status: str(r.fields[B.status]) };
    }),
    ...pays.map((p): StEvent => ({ when: p.paidOn || p.created, kind: "payment", title: short(p.name.replace(p.no, "")), status: p.status, amount: p.amount, receipt: p.receipt })),
    ...planRows.map((p): StEvent => ({ when: p.start, kind: "plan", title: short(p.name), status: p.status })),
    ...inquiries.records.map((r): StEvent => ({ when: str(r.fields[X.leadReceived]) || (r.createdTime ?? ""), kind: "inquiry", title: str(r.fields[L.message]).slice(0, 300) || list(r.fields[L.interested]).join(", ") || str(r.fields[L.channel]), status: str(r.fields[L.status]) })),
    { when: str(m.fields[X.memberAdded]) || (m.createdTime ?? ""), kind: "joined" as const, title: str(m.fields[M.source]), status: "" },
  ]
    .filter((e) => e.when)
    .sort((a, b) => Date.parse(b.when) - Date.parse(a.when));

  return {
    ok: true,
    member: toMember(m),
    language: str(m.fields[M.language]),
    notes: str(m.fields[X.memberNotes]),
    memberSince: day(m.fields[X.memberSince]),
    spent: num(m.fields[X.memberSpent]) ?? 0,
    noShows: num(m.fields[X.memberNoShows]) ?? 0,
    lateCancels: num(m.fields[X.memberLateCancels]) ?? 0,
    health: ([] as unknown[]).concat(m.fields[X.memberHealthSigned] ?? []).includes(true),
    plans: planRows,
    payments: pays,
    history,
    capped: allBookings.length > HISTORY_CLASSES,
  };
}

// ---------- the three edits ----------

const REC = /^rec[A-Za-z0-9]{14}$/;

/** Statuses of a booking that still holds its place; only these may be marked or un-marked from the hub. */
const MARKABLE = ["Booked", "Held", "Attended", "No-show"];

/** Returns false for a request that makes no sense; for a booking, the status it ended up with. */
export async function act(at: Airtable, a: StudioAction, now = new Date()): Promise<boolean | string> {
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
    const B = F.bookings;
    const row = await at.get(T.bookings, a.id);
    // A booking the member cancelled in the meantime is left alone: marking it would count a class against her plan.
    if (!MARKABLE.includes(str(row.fields[B.status]))) return false;
    let next: string = a.status;
    if (next === "Booked" || next === "Held") {
      // Undoing a mark. The place goes back to "Held" when it was taken at checkout and its plan is still not paid.
      const plan = list(row.fields[B.membership])[0];
      const unpaid = str(row.fields[B.via]) === "Checkout (payment pending)" && (!plan || str((await at.get(T.memberships, plan)).fields[F.memberships.status]) !== "Active");
      next = unpaid ? "Held" : "Booked";
    }
    await at.update(T.bookings, a.id, { [B.status]: next });
    return next;
  }
  return false;
}

// ---------- entry ----------

export async function studio(req: Request, env: Env, url: URL, sameOrigin: boolean): Promise<Response> {
  const route = url.pathname.slice("/api/studio/".length);
  const passcode = passcodeOf(env);
  if (!passcode || !env.AIRTABLE_TOKEN) return reply({ ok: false, error: "setup" }, 503);

  if (route === "login" && req.method === "POST") {
    if (!sameOrigin) return reply({ ok: false, error: "origin" }, 403);
    // Only passcode attempts are counted. A signed-in phone is never slowed down, and a call without a valid pass
    // is turned away below before it reaches Airtable.
    const { success } = await env.FORM_LIMIT.limit({ key: `studio:${req.headers.get("CF-Connecting-IP") ?? "unknown"}` });
    if (!success) return reply({ ok: false, error: "slow down" }, 429);
    const body = (await req.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code.trim().slice(0, 200) : "";
    // Compare digests, not the strings, so the answer takes the same time whatever was typed.
    if ((await hmacHex(passcode, code)) !== (await hmacHex(passcode, passcode))) return reply({ ok: false, error: "code" }, 401);
    return reply({ ok: true, token: await issuePass(passcode) });
  }

  // A document link carries its own short-lived signature, so it can open in a new tab (which sends no pass).
  if (route.startsWith("file/") && req.method === "GET") {
    const id = route.slice(5);
    const exp = url.searchParams.get("e") ?? "";
    const good = /^\d{13}$/.test(exp) && Number(exp) > Date.now() && url.searchParams.get("s") === (await hmacHex(passcode, `file.${id}.${exp}`));
    if (!good) return new Response("This link has expired. Open the document again from the Studio page.", { status: 403 });
    try {
      return await openDoc(env, id);
    } catch (e) {
      console.error(JSON.stringify({ msg: "studio file failed", detail: String(e) }));
      return new Response("Could not open this document.", { status: 502 });
    }
  }

  const bearer = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? null;
  if (!(await validPass(passcode, bearer))) return reply({ ok: false, error: "auth" }, 401);
  const at = new Airtable(env.AIRTABLE_TOKEN, env.AIRTABLE_BASE, pacing.ms);
  try {
    const origin = url.hostname === "localhost" ? url.origin : `https://${url.host}`;
    if (route === "data" && req.method === "GET") return reply(await snapshot(at, env, origin));
    if (route === "docs" && req.method === "GET") {
      const link = async (id: string) => {
        const exp = Date.now() + DOC_LINK_HOURS * 3600e3;
        return `${origin}/api/studio/file/${id}?e=${exp}&s=${await hmacHex(passcode, `file.${id}.${exp}`)}`;
      };
      return reply(await listDocs(env, { folder: url.searchParams.get("folder") ?? undefined, q: (url.searchParams.get("q") ?? "").trim() || undefined }, link));
    }
    if (route === "member" && req.method === "GET") {
      const id = url.searchParams.get("id") ?? "";
      return REC.test(id) ? reply(await memberDetail(at, env, origin, id)) : reply({ ok: false, error: "bad request" }, 400);
    }
    if (route === "act" && req.method === "POST") {
      if (!sameOrigin) return reply({ ok: false, error: "origin" }, 403);
      const done = await act(at, (await req.json().catch(() => null)) as StudioAction);
      return done === false ? reply({ ok: false, error: "bad request" }, 400) : reply({ ok: true, ...(typeof done === "string" ? { status: done } : {}) });
    }
  } catch (e) {
    console.error(JSON.stringify({ msg: "studio failed", route, status: e instanceof AirtableError ? e.status : undefined, detail: e instanceof AirtableError ? e.body : String(e) }));
    return reply({ ok: false, error: "unavailable" }, 502);
  }
  return reply({ ok: false, error: "bad request" }, 404);
}
