// Runs the relay against an in-memory stand-in for Airtable: `bun test worker/`.
import { beforeEach, expect, test } from "bun:test";
import worker from "./index";
import { F, T } from "./airtable";

type Rec = { id: string; fields: Record<string, unknown> };
let db: Record<string, Rec[]>;
let n = 0;
let airtableDown = false; // when true, every Airtable write answers 500

const PLAN: Rec = { id: "recPlan3xxxxxxxxx", fields: { [F.plans.websiteId]: "m3x", [F.plans.name]: "3× per week", [F.plans.type]: "Monthly", [F.plans.regular]: 630, [F.plans.launch]: 590, [F.plans.validityMonths]: 1 } };
const PASS: Rec = { id: "recPass10xxxxxxxx", fields: { [F.plans.websiteId]: "p10", [F.plans.name]: "10 sessions", [F.plans.type]: "Pass", [F.plans.regular]: 550, [F.plans.bonus]: 1, [F.plans.validityMonths]: 2 } };

beforeEach(() => {
  db = { [T.plans]: [PLAN, PASS], [T.campaigns]: [{ id: "recCampxxxxxxxxxx", fields: { [F.campaigns.utm]: "launch-month" } }] };
  airtableDown = false;
  globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    // Turnstile stand-in: only the token "good" passes.
    if (url.hostname === "challenges.cloudflare.com") {
      const token = (init?.body as FormData).get("response");
      return new Response(JSON.stringify({ success: token === "good", "error-codes": token === "good" ? [] : ["invalid-input-response"] }), { status: 200 });
    }
    if (airtableDown && init?.method === "POST") return new Response(JSON.stringify({ error: { type: "DOWN" } }), { status: 500 });
    const [, , , table, id] = url.pathname.split("/");
    const rows = (db[table] ??= []);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const ok = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });
    if (method === "POST") {
      const r = { id: `rec${String(++n).padStart(14, "0")}`, fields: body.records[0].fields };
      rows.push(r);
      return ok({ records: [r] });
    }
    if (method === "PATCH") {
      const r = rows.find((x) => x.id === id)!;
      Object.assign(r.fields, body.fields);
      return ok(r);
    }
    if (id) return ok(rows.find((x) => x.id === id) ?? Object.values(db).flat().find((x) => x.id === id));
    // Tiny formula support: equality on one field id, or phone digits match.
    const f = url.searchParams.get("filterByFormula") ?? "";
    // The phone lookup's own pieces ('' and '[^0-9]' inside REGEX_REPLACE) are not values to match.
    const want = [...f.matchAll(/'([^']*)'/g)].map((m) => m[1]).filter((w) => w !== "" && w !== "[^0-9]");
    // RECORD_ID() lists (a member's memberships), optionally with IS_AFTER({renews}, 'date')
    if (f.includes("RECORD_ID()")) {
      const after = /IS_AFTER\(\{(\w+)\},'([^']*)'\)/.exec(f);
      return ok({ records: rows.filter((r) => want.includes(r.id) && (!after || String(r.fields[after[1]] ?? "") > after[2])) });
    }
    // AND(... FIND(...)): every quoted value matches a field exactly or as a substring (roster: Booked + slot date)
    // AND(OR(status Booked/Held), …): an active booking whose other fields match every remaining quoted value
    if (f.startsWith("AND(OR(")) {
      const active = ["Booked", "Held"];
      const rest = want.filter((w) => !active.includes(w));
      return ok({ records: rows.filter((r) => active.includes(String(r.fields[F.bookings.status])) && rest.every((w) => Object.values(r.fields).some((v) => typeof v === "string" && v.includes(w)))) });
    }
    // FIND('text',{field}): substring match (order ids inside payment names)
    if (f.startsWith("FIND(")) return ok({ records: rows.filter((r) => Object.values(r.fields).some((v) => typeof v === "string" && want.some((w) => v.includes(w)))) });
    const hit = rows.filter((r) => Object.values(r.fields).some((v) => want.includes(String(v).replace(/\D/g, "")) || want.includes(String(v)) || want.includes(String(v).toLowerCase())));
    return ok({ records: hit });
  }) as typeof fetch;
});

const env = { AIRTABLE_TOKEN: "test", AIRTABLE_BASE: "appTEST", ASSETS: { fetch: async () => new Response("asset") }, FORM_LIMIT: { limit: async () => ({ success: true }) } } as unknown as Env;
const guarded = { ...env, TURNSTILE_SECRET: "turnstile-secret" } as Env;
const call = (event: string, body: unknown, origin = "https://reset.example", e: Env = env) =>
  worker.fetch(new Request(`https://reset.example/api/${event}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }) as never, e, {} as never) as Promise<Response>;
const maya = { firstName: "Maya", lastName: "Test", phone: "+972 50-123-4567", email: "maya@example.com" };
// Class dates sit a year ahead: the Worker refuses slots that have already started.
const Y = new Date().getFullYear() + 1;
const slot = { service: "reformer", date: `${Y}-10-20`, time: "18:00", minutes: 50 };

test("lead creates a member and a lead linked to the campaign", async () => {
  const r = await call("lead", { lang: "he", contact: maya, interest: "reformer", prefTime: "Evening", heard: "Instagram", consent: true, attribution: { utmCampaign: "launch-month" } });
  expect(r.status).toBe(200);
  const [m] = db[T.members];
  expect(m.fields[F.members.phone]).toBe("050-123-4567");
  expect(m.fields[F.members.consent]).toBe(true);
  expect(m.fields[F.members.source]).toBe("Instagram");
  const [l] = db[T.leads];
  expect(l.fields[F.leads.campaign]).toEqual(["recCampxxxxxxxxxx"]);
  expect(l.fields[F.leads.interested]).toEqual(["Reformer"]);
});

test("same phone in another format finds the same member", async () => {
  await call("lead", { lang: "he", contact: maya, interest: "mat", consent: false });
  await call("lead", { lang: "he", contact: { ...maya, phone: "0501234567" }, interest: "reformer", consent: false });
  expect(db[T.members].length).toBe(1);
  expect(db[T.members][0].fields[F.members.interests]).toEqual(["Mat", "Reformer"]);
});

test("checkout prices from Airtable, saves Pending payment and terms date", async () => {
  const r = await call("checkout", { lang: "en", contact: maya, planId: "m3x", method: "card", consent: false, termsAccepted: true });
  expect(r.status).toBe(200);
  const [p] = db[T.payments];
  expect(p.fields[F.payments.amount]).toBe(590);
  expect(p.fields[F.payments.status]).toBe("Pending");
  expect(p.fields[F.payments.method]).toBe("Credit card");
  expect(db[T.memberships][0].fields[F.memberships.status]).toBeUndefined();
  expect(db[T.members][0].fields[F.members.termsOn]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("a Mat plan is charged ₪5 a class less than the Reformer price Airtable lists", async () => {
  const r = await call("checkout", { lang: "en", contact: maya, planId: "m3x", kind: "mat", method: "card", consent: false, termsAccepted: true });
  expect(r.status).toBe(200);
  expect(db[T.payments][0].fields[F.payments.amount]).toBe(590 - 12 * 5); // 3×/week = 12 classes a month
  expect(db[T.memberships][0].fields[F.memberships.pricePaid]).toBe(590 - 12 * 5);
});

test("a class that already started, or an impossible date, can't be booked", async () => {
  expect((await call("booking", { lang: "he", contact: maya, slot: { ...slot, date: "2020-01-01" }, bed: null })).status).toBe(400);
  expect((await call("booking", { lang: "he", contact: maya, slot: { ...slot, date: `${Y}-02-31` }, bed: null })).status).toBe(400);
  expect(db[T.classes] ?? []).toEqual([]);
});

test("an Origin of \"null\" is refused like any other foreign origin, not a crash", async () => {
  const r = await call("chat", { lang: "en", question: "hi" }, "null");
  expect(r.status).toBe(403);
});

test("auto-renew: opted in at checkout, then switched off and on from the profile (phone must match)", async () => {
  const r = await call("checkout", { lang: "en", contact: maya, planId: "m3x", method: "card", consent: false, termsAccepted: true, autoRenew: true });
  expect(r.status).toBe(200);
  const ms = db[T.memberships][0];
  expect(ms.fields[F.memberships.autoRenew]).toBe(true);
  expect((await call("renewal", { lang: "en", membershipId: ms.id, phone: "0509999999", autoRenew: false })).status).toBe(400);
  expect((await call("renewal", { lang: "en", membershipId: ms.id, phone: "050-123-4567", autoRenew: false })).status).toBe(200);
  expect(db[T.memberships][0].fields[F.memberships.autoRenew]).toBe(false);
  expect((await call("renewal", { lang: "en", membershipId: ms.id, phone: "050-123-4567", autoRenew: true })).status).toBe(200);
  expect(db[T.memberships][0].fields[F.memberships.autoRenew]).toBe(true);
});

test("checkout without auto-renew leaves the Auto-renew box empty", async () => {
  await call("checkout", { lang: "en", contact: maya, planId: "m3x", method: "card", consent: false, termsAccepted: true });
  expect(db[T.memberships][0].fields[F.memberships.autoRenew]).toBe(false);
});

const healthy = { heart: false, chest: false, dizzy: false, asthma: false, family: false, supervised: false, chronic: false, pregnancy: "no", injury: false, adult: true };

test("health declaration: one row in Health & Consent, linked to the member, valid for a year", async () => {
  const r = await call("health-declaration", { lang: "he", contact: maya, version: "health-decl-v0-draft", answers: healthy });
  expect(r.status).toBe(200);
  const h = db[T.health][0].fields;
  expect(h[F.health.signed]).toBe(true);
  expect(h[F.health.member]).toEqual([db[T.members][0].id]);
  expect(h[F.health.pregnant]).toBe("No");
  expect(h[F.health.via]).toBe("Profile (online)");
  expect(h[F.health.conditions]).toMatch(/^No doctor's approval needed/);
  expect(Number(String(h[F.health.validUntil]).slice(0, 4)) - Number(String(h[F.health.signedOn]).slice(0, 4))).toBe(1);
});

test("health declaration: the studio terms ticked with it are recorded on the row and on the member", async () => {
  const r = await call("health-declaration", { lang: "he", contact: maya, version: "health-decl-v0-draft", answers: healthy, termsAccepted: true, termsVersion: "2026-11-10" });
  expect(r.status).toBe(200);
  const h = db[T.health][0].fields;
  expect(h[F.health.terms]).toBe(true);
  expect(h[F.health.termsOn]).toBe(h[F.health.signedOn]);
  expect(h[F.health.conditions]).toContain("Studio terms accepted (2026-11-10)");
  expect(db[T.members][0].fields[F.members.termsOn]).toBe(h[F.health.signedOn]);
});

test("health declaration: a yes that needs a doctor's approval is flagged first, with the injury note and guardian", async () => {
  const r = await call("health-declaration", {
    lang: "en",
    contact: maya,
    version: "health-decl-v0-draft",
    answers: { ...healthy, heart: true, pregnancy: "postnatal", injury: true, injuryNote: "Left knee", adult: false, guardianName: "Dana Test", guardianPhone: "050-765-4321" },
  });
  expect(r.status).toBe(200);
  const h = db[T.health][0].fields;
  expect(h[F.health.conditions]).toMatch(/^⚠ Doctor's approval needed: heart condition or high blood pressure, gave birth in the last 12 months/);
  expect(h[F.health.conditions]).toContain("Left knee");
  expect(h[F.health.conditions]).toContain("Dana Test");
  expect(h[F.health.pregnant]).toBe("Postnatal");
});

test("health declaration: missing answers, or under 18 without a guardian, is refused", async () => {
  const { chest: _, ...noChest } = healthy;
  expect((await call("health-declaration", { lang: "en", contact: maya, version: "v", answers: noChest })).status).toBe(400);
  expect((await call("health-declaration", { lang: "en", contact: maya, version: "v", answers: { ...healthy, adult: false } })).status).toBe(400);
  expect(db[T.health]).toBeUndefined();
});

test("health declaration: the same declaration resent (outbox after a lost reply) is saved once", async () => {
  const body = { lang: "he", contact: maya, version: "health-decl-v0-draft", answers: healthy, declarationId: "0f8c2a1e-3b4d-4e5f-9a6b-7c8d9e0f1a2b" };
  const first = (await (await call("health-declaration", body)).json()) as { id: string };
  const again = (await (await call("health-declaration", body)).json()) as { id: string; duplicate?: boolean };
  expect(again.duplicate).toBe(true);
  expect(again.id).toBe(first.id);
  expect(db[T.health].length).toBe(1);
  // A new declaration (new id) is a new row
  await call("health-declaration", { ...body, declarationId: "1a2b3c4d-0000-4000-8000-000000000001" });
  expect(db[T.health].length).toBe(2);
});

test("health declaration: an under-18's guardian needs an Israeli phone number", async () => {
  const minor = { ...healthy, adult: false, guardianName: "Dana Test" };
  expect((await call("health-declaration", { lang: "en", contact: maya, version: "v", answers: { ...minor, guardianPhone: "mom" } })).status).toBe(400);
  expect((await call("health-declaration", { lang: "en", contact: maya, version: "v", answers: { ...minor, guardianPhone: "+972 50-765-4321" } })).status).toBe(200);
  expect(db[T.health][0].fields[F.health.conditions]).toContain("050-765-4321");
});

test("health declaration with Turnstile on: needs a good token (or a retry pass), like the lead form", async () => {
  const body = { lang: "he", contact: maya, version: "health-decl-v0-draft", answers: healthy };
  expect((await call("health-declaration", body, undefined, guarded)).status).toBe(403);
  expect((await call("health-declaration", { ...body, turnstile: "bad" }, undefined, guarded)).status).toBe(403);
  expect(db[T.health]).toBeUndefined();
  expect((await call("health-declaration", { ...body, turnstile: "good" }, undefined, guarded)).status).toBe(200);
  expect(db[T.health].length).toBe(1);
});

test("health status: a current declaration on file is found by phone + last name, and nothing else is revealed", async () => {
  await call("health-declaration", { lang: "he", contact: maya, version: "health-decl-v0-draft", answers: { ...healthy, heart: true } });
  // Airtable fills the member's side of the link itself; the stand-in needs it set by hand.
  db[T.members][0].fields[F.members.health] = [db[T.health][0].id];
  const status = async (body: unknown) => (await (await call("health-status", body)).json()) as { ok: boolean; validUntil?: string; [k: string]: unknown };

  const found = await status({ lang: "he", phone: "050-123-4567", lastName: "test" });
  expect(found.validUntil).toBe(String(db[T.health][0].fields[F.health.validUntil]));
  expect(Object.keys(found).sort()).toEqual(["ok", "validUntil"]); // a date only: no answers, no doctor's-approval flag

  expect((await status({ lang: "he", phone: "050-123-4567", lastName: "Someone" })).validUntil).toBeUndefined();
  expect((await status({ lang: "he", phone: "050-999-9999", lastName: "Test" })).validUntil).toBeUndefined();

  // An online declaration in older wording no longer counts; one Orit entered from a paper form does.
  db[T.health][0].fields[F.health.conditions] = "No doctor's approval needed\nWording: health-decl-old";
  expect((await status({ lang: "he", phone: "050-123-4567", lastName: "Test" })).validUntil).toBeUndefined();
  db[T.health][0].fields[F.health.via] = "Paper";
  expect((await status({ lang: "he", phone: "050-123-4567", lastName: "Test" })).validUntil).toBeDefined();
  // An expired one never counts.
  db[T.health][0].fields[F.health.validUntil] = "2020-01-01";
  expect((await status({ lang: "he", phone: "050-123-4567", lastName: "Test" })).validUntil).toBeUndefined();
});

test("checkout without accepted terms is refused", async () => {
  const r = await call("checkout", { lang: "en", contact: maya, planId: "m3x", method: "card", consent: false });
  expect(r.status).toBe(400);
  expect(db[T.payments]).toBeUndefined();
});

test("booking creates the class once and maps bed 0 → 1", async () => {
  await call("booking", { lang: "he", contact: maya, slot, bed: 0 });
  await call("booking", { lang: "he", contact: maya, slot: { ...slot }, bed: null });
  expect(db[T.classes].length).toBe(1);
  expect(db[T.classes][0].fields[F.classes.when]).toBe(`${Y}-10-20T15:00:00.000Z`); // 18:00 Israel summer time
  expect(db[T.bookings][0].fields[F.bookings.bed]).toBe("1");
  expect(db[T.bookings][1].fields[F.bookings.bed]).toBe("Any");
});

test("cancel checks the phone and applies the 24-hour rule", async () => {
  const b = await (await call("booking", { lang: "he", contact: maya, slot, bed: 2 })).json();
  const rec = db[T.bookings][0];
  rec.fields[F.bookings.classStartUnix] = Math.floor(Date.now() / 1000) + 3600 * 5; // class in 5 hours
  expect((await call("cancel", { lang: "he", bookingId: b.id, phone: "0509999999" })).status).toBe(400);
  expect((await call("cancel", { lang: "he", bookingId: b.id, phone: "050-123-4567" })).status).toBe(200);
  expect(rec.fields[F.bookings.status]).toBe("Late cancel");
});

test("gift card gets a code and a pending payment; amount limits apply", async () => {
  const r = await (await call("gift", { lang: "he", buyer: maya, planId: null, amount: 300, recipientName: "Shira", consent: false })).json();
  expect(r.code).toMatch(/^RS-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  expect(db[T.payments][0].fields[F.payments.for]).toBe("Gift card");
  expect((await call("gift", { lang: "he", buyer: maya, planId: null, amount: 10, recipientName: "Shira", consent: false })).status).toBe(400);
});

test("quiz saves answers, then contact links a member and a lead", async () => {
  const q = await (await call("quiz", { lang: "he", goal: "care", experience: "none", style: "solo", recommended: "private" })).json();
  expect(db[T.quiz][0].fields[F.quiz.goal]).toBe("Gentle return");
  await call("quiz-contact", { lang: "he", quizId: q.id, contact: maya, consent: true });
  expect(db[T.quiz][0].fields[F.quiz.member]).toEqual([db[T.members][0].id]);
  expect(db[T.leads][0].fields[F.leads.interested]).toEqual(["Private 1:1"]);
  expect(db[T.members][0].fields[F.members.experience]).toBe("New to Pilates");
});

test("chat logs topic and handoff", async () => {
  await call("chat", { lang: "en", question: "How much is a pass?", intent: "price", handoff: false });
  await call("chat", { lang: "en", question: "Can I bring my dog?", handoff: true });
  expect(db[T.chat][0].fields[F.chat.topic]).toBe("Price");
  expect(db[T.chat][1].fields[F.chat.handedToOrit]).toBe(true);
  expect(db[T.chat][1].fields[F.chat.answeredAuto]).toBe(false);
});

test("guards: other sites, spam trap, bad phone, unknown plan", async () => {
  expect((await call("chat", { lang: "en", question: "hi" }, "https://evil.example")).status).toBe(403);
  expect((await call("lead", { lang: "en", contact: maya, interest: "mat", consent: false, website: "spam" })).status).toBe(200);
  expect(db[T.leads]).toBeUndefined();
  expect((await call("lead", { lang: "en", contact: { ...maya, phone: "123" }, interest: "mat", consent: false })).status).toBe(400);
  expect((await call("checkout", { lang: "en", contact: maya, planId: "zzz", method: "bit", consent: false, termsAccepted: true })).status).toBe(400);
});

test("lead with Turnstile on: bad token refused, failed attempt gets a retry pass that works without a token", async () => {
  const lead = { lang: "en", contact: maya, interest: "reformer", consent: false };
  expect((await call("lead", { ...lead, turnstile: "bad" }, undefined, guarded)).status).toBe(403);
  expect((await call("lead", lead, undefined, guarded)).status).toBe(403);
  expect(db[T.leads]).toBeUndefined();

  airtableDown = true;
  const failed = await call("lead", { ...lead, turnstile: "good" }, undefined, guarded);
  expect(failed.status).toBe(502);
  const { retry } = (await failed.json()) as { retry?: string };
  expect(retry).toMatch(/^\d{13}\.[0-9a-f]{64}$/);

  airtableDown = false;
  expect((await call("lead", { ...lead, retry }, undefined, guarded)).status).toBe(200);
  expect(db[T.leads].length).toBe(1);
  // A pass is bound to its event and cannot be forged or reused for another form.
  expect((await call("lead", { ...lead, retry: retry!.replace(/.$/, (c) => (c === "0" ? "1" : "0")) }, undefined, guarded)).status).toBe(403);
});

test("retry pass is only issued once the bot check passed", async () => {
  airtableDown = true;
  const r = await call("lead", { lang: "en", contact: maya, interest: "reformer", consent: false, turnstile: "good" });
  expect(r.status).toBe(502);
  expect(((await r.json()) as { retry?: string }).retry).toBeUndefined(); // Turnstile off: nothing to pass
});


test("localhost origins are refused on the live site", async () => {
  expect((await call("chat", { lang: "en", question: "hi" }, "http://localhost:5173")).status).toBe(403);
  const local = await worker.fetch(
    new Request("http://localhost:8787/api/chat", { method: "POST", headers: { Origin: "http://localhost:5173" }, body: JSON.stringify({ lang: "en", question: "hi" }) }) as never,
    env,
    {} as never,
  );
  expect(local.status).toBe(200); // wrangler dev: both sides local
});

test("a later 'how did you hear' answer replaces the automatic Website source", async () => {
  await call("waitlist", { lang: "he", contact: maya, slot });
  expect(db[T.members][0].fields[F.members.source]).toBe("Website");
  await call("checkout", { lang: "he", contact: maya, planId: "m3x", method: "bit", heard: "Instagram", consent: false, termsAccepted: true });
  expect(db[T.members][0].fields[F.members.source]).toBe("Instagram");
  await call("checkout", { lang: "he", contact: maya, planId: "m3x", method: "bit", heard: "TikTok", consent: false, termsAccepted: true });
  expect(db[T.members][0].fields[F.members.source]).toBe("Instagram"); // a real answer is never overwritten
});

test("receipt: checkout with an order id answers with a sealed /r/ link that opens the receipt", async () => {
  const r = await call("checkout", { lang: "he", contact: maya, planId: "p10", method: "bit", consent: false, termsAccepted: true, orderId: "RS-261019-ABCD", itemLabel: "Reformer · 10", carryOver: 2 }, undefined, guarded);
  const out = (await r.json()) as { receiptUrl: string; sentVia: string[] };
  expect(out.sentVia).toEqual([]); // no email binding / WhatsApp / SMS secrets in tests
  expect(out.receiptUrl).toStartWith("https://reset.example/r/");
  expect(out.receiptUrl).not.toContain("Maya"); // personal details are encrypted, not readable in the link
  expect(db[T.payments][0].fields[F.payments.name]).toStartWith("RS-261019-ABCD · ");
  expect(String(db[T.memberships][0].fields[F.memberships.name])).toContain("+2 carried over");
  const page = await worker.fetch(new Request(out.receiptUrl) as never, guarded, {} as never);
  const html = await page.text();
  expect(html).toContain("RS-261019-ABCD");
  expect(html).toContain("Maya Test");
  expect(html).toContain("13"); // 10 + 1 launch bonus + 2 carried
  const bad = await worker.fetch(new Request(out.receiptUrl.slice(0, -3) + "xyz") as never, guarded, {} as never);
  expect(bad.status).toBe(404);
});

test("the same order sent twice is saved once", async () => {
  const body = { lang: "en", contact: maya, planId: "p10", method: "card", consent: false, termsAccepted: true, orderId: "RS-261019-WXYZ" };
  await call("checkout", body);
  const again = (await (await call("checkout", body)).json()) as { ok: boolean; duplicate?: boolean };
  expect(again).toMatchObject({ ok: true, duplicate: true });
  expect(db[T.payments].length).toBe(1);
  expect(db[T.memberships].length).toBe(1);
});

test("a running monthly membership can't be bought again; a pass can", async () => {
  await call("checkout", { lang: "en", contact: maya, planId: "m3x", method: "card", consent: false, termsAccepted: true, orderId: "RS-261019-AAAA" });
  const member = db[T.members][0];
  member.fields[F.members.memberships] = db[T.memberships].map((m) => m.id);
  const r = await call("checkout", { lang: "en", contact: maya, planId: "m3x", method: "card", consent: false, termsAccepted: true, orderId: "RS-261019-BBBB" });
  expect(r.status).toBe(409);
  expect(((await r.json()) as { until?: string }).until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  const pass = await call("checkout", { lang: "en", contact: maya, planId: "p10", method: "card", consent: false, termsAccepted: true, orderId: "RS-261019-CCCC" });
  expect(pass.status).toBe(200);
});

test("receipts go out on the channels that are set up: email + WhatsApp, SMS only without WhatsApp", async () => {
  const { channelsFor, e164 } = await import("./notify");
  const r = { no: "RS-261019-ABCD", issuedAt: "", lang: "he" as const, customer: { name: "Maya Test", phone: "050-123-4567", email: "m@x.com" }, lines: [], total: 1, paid: false };
  const base = { ...env, EMAIL: {} } as unknown as Env;
  expect(channelsFor(base, r)).toEqual(["email"]);
  expect(channelsFor({ ...base, TWILIO_SID: "a", TWILIO_TOKEN: "b", TWILIO_FROM: "c" } as Env, r)).toEqual(["email", "sms"]);
  expect(channelsFor({ ...base, TWILIO_SID: "a", TWILIO_TOKEN: "b", TWILIO_FROM: "c", WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_ID: "p", WHATSAPP_RECEIPT_TEMPLATE: "receipt" } as Env, r)).toEqual(["email", "whatsapp"]);
  expect(channelsFor(env, { ...r, customer: { ...r.customer, email: undefined } })).toEqual([]);
  expect(e164("050-123-4567")).toBe("+972501234567");
});

test("receipts are sent after the reply, through every configured channel", async () => {
  const sent: unknown[] = [];
  const waits: Promise<unknown>[] = [];
  const e = { ...guarded, EMAIL: { send: async (m: unknown) => void sent.push(m) } } as unknown as Env;
  const req = new Request("https://reset.example/api/gift", { method: "POST", headers: { Origin: "https://reset.example" }, body: JSON.stringify({ lang: "en", buyer: maya, planId: null, amount: 300, recipientName: "Dana", consent: false, orderId: "RS-261019-GIFT" }) });
  const res = await worker.fetch(req as never, e, { waitUntil: (p: Promise<unknown>) => void waits.push(p) } as never);
  expect(((await res.json()) as { sentVia: string[] }).sentVia).toEqual(["email"]);
  await Promise.all(waits);
  const mail = sent[0] as { to: { email: string }; subject: string; html: string; bcc: string };
  expect(mail.to.email).toBe("maya@example.com");
  expect(mail.subject).toContain("RS-261019-GIFT");
  expect(mail.html).toContain("/assets/reset-wordmark.png"); // the site logo
  expect(mail.html).not.toContain("@resetpilates_"); // no social handles
  expect(mail.html).toContain("resetpilates11@gmail.com"); // studio contact
  expect(mail.bcc).toBe("resetpilates11@gmail.com");
});

test("launch waitlist: saves the person, their class and time, and links the member", async () => {
  const r = await call("launch-waitlist", {
    lang: "he", contact: maya, classType: "Teens", prefTime: "Teen evening", source: "Booking",
    planId: "single", wanted: "Single class · ₪50", slot: "Reformer · Sun 25 Oct · 08:00", consent: true,
  });
  expect(r.status).toBe(200);
  const [row] = db[T.launchWaitlist];
  const W = F.launchWaitlist;
  expect(row.fields[W.classType]).toBe("Teens");
  expect(row.fields[W.prefTime]).toBe("Teen evening");
  expect(row.fields[W.source]).toBe("Booking");
  expect(row.fields[W.planId]).toBe("single");
  expect(row.fields[W.consent]).toBe(true);
  expect(row.fields[W.member]).toEqual([db[T.members][0].id]);
  expect(db[T.members][0].fields[F.members.prefTimes]).toEqual(["Evening"]);
});

test("launch waitlist: a class sign-up needs a time; a gift card does not", async () => {
  expect((await call("launch-waitlist", { lang: "en", contact: maya, classType: "Reformer", source: "Pricing", consent: false })).status).toBe(400);
  expect((await call("launch-waitlist", { lang: "en", contact: maya, classType: "Gift card", source: "Gift card", consent: false })).status).toBe(200);
  expect(db[T.launchWaitlist][0].fields[F.launchWaitlist.prefTime]).toBeUndefined();
});

test("checkout refuses the removed Arbox payment method", async () => {
  const r = await call("checkout", { lang: "he", contact: maya, planId: "m3x", method: "arbox", consent: false, termsAccepted: true });
  expect(r.status).toBe(400);
});

test("roster: names only as each person chose, by bed, for that day only", async () => {
  const noa = { firstName: "Noa", lastName: "Cohen", phone: "0521111111" };
  const dana = { firstName: "Dana", lastName: "Mor", phone: "0522222222" };
  await call("booking", { lang: "he", contact: maya, slot, bed: 0 }); // default: first initial + last name
  await call("booking", { lang: "he", contact: noa, slot, bed: 2, showAs: "full" });
  await call("booking", { lang: "he", contact: dana, slot, bed: 4, showAs: "anon" });
  await call("booking", { lang: "he", contact: noa, slot: { ...slot, date: `${Y}-10-21` }, bed: 1 });
  const res = await worker.fetch(new Request(`https://reset.example/api/roster?date=${Y}-10-20`) as never, env, { waitUntil() {} } as never);
  const body = (await res.json()) as { ok: boolean; slots: Record<string, { bed: number | null; name: string }[]> };
  expect(body.ok).toBe(true);
  expect(Object.keys(body.slots)).toEqual([`reformer_${Y}-10-20_1800`]);
  expect(body.slots[`reformer_${Y}-10-20_1800`]).toEqual([
    { bed: 0, name: "M. Test" },
    { bed: 2, name: "Noa Cohen" },
    { bed: 4, name: "" },
  ]);
  expect(JSON.stringify(body)).not.toContain("052"); // no phone numbers
  expect((await worker.fetch(new Request("https://reset.example/api/roster?date=bad") as never, env, {} as never)).status).toBe(400);
});

test("checkout before payments open holds the bed; a full class refuses; a held bed shows on the roster", async () => {
  const s2 = { ...slot, date: `${Y}-11-02`, time: "08:00", capacity: 5 };
  const people = ["0521000001", "0521000002", "0521000003", "0521000004", "0521000005", "0521000006"].map((phone, i) => ({ firstName: `P${i}`, lastName: `Last${i}`, phone }));
  const first = await call("booking", { lang: "he", contact: people[0], slot: s2, bed: 2, held: true });
  expect(first.status).toBe(200);
  const held = db[T.bookings].at(-1)!;
  expect(held.fields[F.bookings.status]).toBe("Held");
  expect(held.fields[F.bookings.bed]).toBe("3");
  // Someone else asks for the same bed: they get any free bed instead
  await call("booking", { lang: "he", contact: people[1], slot: s2, bed: 2, held: true });
  expect(db[T.bookings].at(-1)!.fields[F.bookings.bed]).toBe("Any");
  for (const p of people.slice(2, 5)) await call("booking", { lang: "he", contact: p, slot: s2, bed: null, held: true });
  // Five beds taken: the sixth is refused
  expect((await call("booking", { lang: "he", contact: people[5], slot: s2, bed: null, held: true })).status).toBe(409);
  const res = await worker.fetch(new Request(`https://reset.example/api/roster?date=${Y}-11-02`) as never, env, { waitUntil() {} } as never);
  const body = (await res.json()) as { slots: Record<string, { bed: number | null; name: string }[]> };
  expect(body.slots[`reformer_${Y}-11-02_0800`].length).toBe(5);
  expect(body.slots[`reformer_${Y}-11-02_0800`][0]).toEqual({ bed: 2, name: "P. Last0" });
});
