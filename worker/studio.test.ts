// The Studio hub's Worker side against an in-memory stand-in for Airtable: `bun test worker/`.
import { beforeEach, expect, test } from "bun:test";
import worker from "./index";
import { F, T } from "./airtable";
import { issuePass, validPass } from "./studio";
import type { StudioData } from "../src/lib/studioTypes";

type Rec = { id: string; fields: Record<string, unknown> };
let db: Record<string, Rec[]>;
let calls: { method: string; table: string; id?: string; body?: { fields: Record<string, unknown> } }[];

const PASSCODE = "reformer-studio-11";
const ORIGIN = "https://resetpilates.org";
const env = (over: Partial<Env> = {}) => ({ AIRTABLE_TOKEN: "t", AIRTABLE_BASE: "appTESTxxxxxxxxxxx", STUDIO_PASSCODE: PASSCODE, FORM_LIMIT: { limit: async () => ({ success: true }) }, ...over }) as unknown as Env;
const ectx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext;
const hit = (path: string, init: RequestInit & { token?: string } = {}, e = env()) =>
  worker.fetch(new Request(`${ORIGIN}/api/studio/${path}`, { ...init, headers: { Origin: ORIGIN, ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) } }) as never, e, ectx);

const soon = new Date(Date.now() + 3600e3); // a class one hour from now
const MAYA = "recMAYAxxxxxxxxxx";
const CLASS = "recCLASSxxxxxxxxx";
const BOOKING = "recBOOKxxxxxxxxxx";
const LEAD = "recLEADxxxxxxxxxx";

beforeEach(() => {
  calls = [];
  db = {
    [T.members]: [{ id: MAYA, fields: { [F.members.fullName]: "Maya Levi", [F.members.phone]: "050-123-4567", [F.members.status]: "Active member", fldl2W4id3WcEAB1v: ["Expired", "Active"], fldkaD5FRdCbIqdfe: 6 } }],
    [T.classes]: [{ id: CLASS, fields: { [F.classes.type]: "Reformer", [F.classes.when]: soon.toISOString(), [F.classes.capacity]: 5 } }],
    [T.bookings]: [{ id: BOOKING, fields: { [F.bookings.bed]: "2", [F.bookings.status]: "Booked", [F.bookings.member]: [MAYA], [F.bookings.class]: [CLASS] } }],
    [T.leads]: [{ id: LEAD, fields: { [F.leads.person]: "Noa", [F.leads.phone]: "052-000-0000", [F.leads.status]: "New", [F.leads.interested]: ["Reformer"] } }],
  };
  globalThis.fetch = (async (input: RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    const [, , , table, id] = url.pathname.split("/");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, table, id, body });
    const rows = (db[table] ??= []);
    if (method === "PATCH") {
      const r = rows.find((x) => x.id === id)!;
      Object.assign(r.fields, body.fields);
      return new Response(JSON.stringify(r));
    }
    const stamp = (r?: Rec) => r && { ...r, createdTime: "2026-11-19T08:00:00.000Z" }; // Airtable sends this with every row
    return new Response(JSON.stringify(id ? stamp(rows.find((x) => x.id === id)) : { records: rows.map(stamp) }));
  }) as typeof fetch;
});

test("a pass is good for 30 days and only for the passcode that signed it", async () => {
  const now = Date.now();
  const pass = await issuePass(PASSCODE, now);
  expect(await validPass(PASSCODE, pass, now + 29 * 864e5)).toBe(true);
  expect(await validPass(PASSCODE, pass, now + 31 * 864e5)).toBe(false);
  expect(await validPass("another-passcode", pass, now)).toBe(false);
  expect(await validPass(PASSCODE, `${now + 864e5}.forged`, now)).toBe(false);
  expect(await validPass(PASSCODE, null, now)).toBe(false);
});

test("the hub stays closed until a real passcode is set", async () => {
  expect((await hit("login", { method: "POST", body: JSON.stringify({ code: "" }) }, env({ STUDIO_PASSCODE: undefined }))).status).toBe(503);
  expect((await hit("login", { method: "POST", body: JSON.stringify({ code: "1234" }) }, env({ STUDIO_PASSCODE: "1234" }))).status).toBe(503); // too short to count
});

test("wrong passcode is refused, the right one opens the data", async () => {
  expect((await hit("login", { method: "POST", body: JSON.stringify({ code: "guess" }) })).status).toBe(401);
  expect((await hit("data")).status).toBe(401);
  expect((await hit("data", { token: "123.abc" })).status).toBe(401);
  expect(calls.length).toBe(0); // Airtable is never touched without a pass

  const { token } = (await (await hit("login", { method: "POST", body: JSON.stringify({ code: PASSCODE }) })).json()) as { token: string };
  const res = await hit("data", { token });
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  const d = (await res.json()) as StudioData;
  expect(d.classes[0].bookings).toEqual([{ id: BOOKING, memberId: MAYA, name: "Maya Levi", phone: "050-123-4567", bed: "2", status: "Booked" }]);
  expect(d.members[0]).toMatchObject({ name: "Maya Levi", plan: "Active", classesLeft: 6 });
  expect(d.leads[0]).toMatchObject({ name: "Noa", status: "New", interested: ["Reformer"] });
  expect(d.meta).toBeNull();
});

test("the hub never reads the health tables", async () => {
  const token = await issuePass(PASSCODE);
  await hit("data", { token });
  expect(calls.some((c) => c.table === T.health || c.table === "tblm6kY3ZprkZkW9P")).toBe(false);
});

test("edits: lead status, attendance, and nothing else", async () => {
  const token = await issuePass(PASSCODE);
  const post = (body: unknown) => hit("act", { method: "POST", token, body: JSON.stringify(body) });

  expect((await post({ kind: "lead", id: LEAD, status: "Contacted" })).status).toBe(200);
  expect(db[T.leads][0].fields[F.leads.status]).toBe("Contacted");
  expect(typeof db[T.leads][0].fields.fldGdvxcAvHvxtnFn).toBe("string"); // first response time noted

  expect((await post({ kind: "booking", id: BOOKING, status: "Attended" })).status).toBe(200);
  expect(db[T.bookings][0].fields[F.bookings.status]).toBe("Attended");

  expect((await post({ kind: "booking", id: BOOKING, status: "Cancelled on time" })).status).toBe(400);
  expect((await post({ kind: "lead", id: "not-a-record", status: "Contacted" })).status).toBe(400);
  expect((await post({ kind: "member", id: MAYA, status: "Lost" })).status).toBe(400);
  expect((await hit("act", { method: "POST", body: JSON.stringify({ kind: "lead", id: LEAD, status: "New" }) })).status).toBe(401);
});

test("payments carry a receipt that opens, and one customer's page has her whole history", async () => {
  const PAY = "recPAYxxxxxxxxxxx";
  const PLAN = "recPLANxxxxxxxxxx";
  db[T.payments] = [{ id: PAY, fields: { [F.payments.name]: "RS-261119-A2B3 · Maya Levi · 10 sessions", [F.payments.for]: "Pass", [F.payments.amount]: 550, [F.payments.method]: "Bit", [F.payments.status]: "Pending", [F.payments.member]: [MAYA] } }];
  db[T.memberships] = [{ id: PLAN, fields: { [F.memberships.name]: "Maya Levi · 10 sessions · Nov 2026", [F.memberships.start]: "2026-11-19", [F.memberships.renews]: "2027-01-19", [F.memberships.pricePaid]: 550, [F.memberships.member]: [MAYA] } }];
  Object.assign(db[T.members][0].fields, { [F.members.memberships]: [PLAN], fldGLowOhww5j2sAn: [PAY], fldUq9AGWE2REsefs: [BOOKING], fldxf07CZABvSgJ7J: 0, fldgFbgj6G3YIrKQr: [true] });
  Object.assign(db[T.bookings][0].fields, { [F.bookings.name]: "Maya Levi · Reformer · Thu 19 Nov · 18:00", [F.bookings.classStartUnix]: Math.floor(soon.getTime() / 1000) });
  const e = env({ TURNSTILE_SECRET: "s3cret" } as Partial<Env>);
  const token = await issuePass(PASSCODE);

  const d = (await (await hit("data", { token }, e)).json()) as StudioData;
  const p = d.pending[0];
  expect(p).toMatchObject({ no: "RS-261119-A2B3", member: "Maya Levi", memberId: MAYA, amount: 550, status: "Pending" });
  expect(p.receipt.startsWith(`${ORIGIN}/r/`)).toBe(true);
  const page = await worker.fetch(new Request(p.receipt) as never, e, ectx);
  const html = await page.text();
  expect(page.status).toBe(200);
  expect(html).toContain("RS-261119-A2B3");
  expect(html).toContain("Maya Levi");
  expect(d.plans[0]).toMatchObject({ status: "", price: 550, memberId: MAYA }); // bought, waiting for payment

  const one = (await (await hit(`member?id=${MAYA}`, { token }, e)).json()) as import("../src/lib/studioTypes").StudioMember;
  expect(one.health).toBe(true);
  expect(one.plans.length).toBe(1);
  expect(one.payments[0].receipt).toContain("/r/");
  expect(one.history.map((h) => h.kind).sort()).toEqual(["class", "joined", "payment", "plan"]);
  expect(one.history.find((h) => h.kind === "class")).toMatchObject({ title: "Reformer · Thu 19 Nov · 18:00", status: "Booked" });

  expect((await hit("member?id=nope", { token }, e)).status).toBe(400);
  expect((await hit(`member?id=${MAYA}`, {}, e)).status).toBe(401);
  expect(calls.some((c) => c.table === T.health)).toBe(false);
});
