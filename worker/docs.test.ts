// The wiki's document cabinet against an in-memory stand-in for the R2 bucket: `bun test worker/`.
import { beforeEach, expect, test } from "bun:test";
import worker from "./index";
import { issuePass } from "./studio";
import type { StudioDocs } from "../src/lib/studioTypes";

const PASSCODE = "reformer-studio-11";
const ORIGIN = "https://resetpilates.org";
type Obj = { body: Uint8Array; httpMetadata: { contentType?: string }; customMetadata: Record<string, string>; uploaded: Date };
let store: Map<string, Obj>;

// Just enough of R2 for worker/docs.ts.
const fakeBucket = () => ({
  async put(key: string, value: ArrayBuffer, o: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    store.set(key, { body: new Uint8Array(value), httpMetadata: o.httpMetadata ?? {}, customMetadata: o.customMetadata ?? {}, uploaded: new Date() });
  },
  async get(key: string) {
    const o = store.get(key);
    if (!o) return null;
    return { key, size: o.body.length, uploaded: o.uploaded, httpMetadata: o.httpMetadata, customMetadata: o.customMetadata, body: new Response(o.body).body, arrayBuffer: async () => o.body.slice().buffer };
  },
  async delete(key: string) {
    store.delete(key);
  },
  async list(o: { prefix: string }) {
    const objects = [...store].filter(([k]) => k.startsWith(o.prefix)).map(([key, v]) => ({ key, size: v.body.length, uploaded: v.uploaded, httpMetadata: v.httpMetadata, customMetadata: v.customMetadata }));
    return { objects, truncated: false };
  },
});

const env = (withBucket = true) =>
  ({ AIRTABLE_TOKEN: "t", AIRTABLE_BASE: "appX", STUDIO_PASSCODE: PASSCODE, FORM_LIMIT: { limit: async () => ({ success: true }) }, ...(withBucket ? { DOCS: fakeBucket() } : {}) }) as unknown as Env;
const call = async (path: string, init: RequestInit = {}, e = env(), o: { pass?: boolean; origin?: string } = {}) =>
  worker.fetch(
    new Request(`${ORIGIN}/api/studio/${path}`, {
      ...init,
      headers: { ...(o.pass === false ? {} : { Authorization: `Bearer ${await issuePass(PASSCODE)}` }), Origin: o.origin ?? ORIGIN, ...(init.headers ?? {}) },
    }) as never,
    e,
    {} as never,
  );
const upload = (file: File, labels: Record<string, string>, e = env(), o = {}) => {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(labels)) form.append(k, v);
  return call("docs", { method: "POST", body: form }, e, o);
};
const list = async (e = env()) => (await (await call("docs", {}, e)).json()) as StudioDocs;

beforeEach(() => {
  store = new Map();
});

test("until the storage is switched on, Documents says so and uploads are refused", async () => {
  expect(await list(env(false))).toEqual({ ok: true, connected: false, items: [], capped: false });
  expect((await upload(new File(["x"], "a.pdf", { type: "application/pdf" }), { category: "other" }, env(false))).status).toBe(503);
});

test("a receipt photographed on the phone is saved with its labels and listed, newest date first", async () => {
  const e = env();
  const r = await upload(new File([new Uint8Array(2048)], "IMG_4411.jpg", { type: "image/jpeg" }), { title: "קבלה - ספק ציוד", category: "expense", date: "2026-11-18", amount: "₪1,250.50", payee: "Balanced Body", note: "מזרנים" }, e);
  expect(r.status).toBe(200);
  await upload(new File(["%PDF"], "rent-oct.pdf", { type: "application/pdf" }), { category: "invoice", date: "2026-10-01", amount: "4000" }, e);
  await upload(new File(["%PDF"], "doctor.pdf", { type: "application/pdf" }), { category: "health", date: "2026-11-20" }, e);

  const d = await list(e);
  expect(d.connected).toBe(true);
  expect(d.items.map((x) => [x.title, x.category, x.date])).toEqual([
    ["doctor", "health", "2026-11-20"],
    ["קבלה - ספק ציוד", "expense", "2026-11-18"],
    ["rent-oct", "invoice", "2026-10-01"],
  ]);
  expect(d.items[1]).toMatchObject({ amount: 1250.5, payee: "Balanced Body", note: "מזרנים", kind: "image", fileName: "IMG_4411.jpg", size: 2048 });
  expect(d.items[1].link).toContain(`/api/studio/file/${d.items[1].id}?e=`);
});

test("uploads need the pass, this site as origin, a known category and a sane amount, and stay under 20 MB", async () => {
  const f = () => new File(["x"], "a.pdf", { type: "application/pdf" });
  expect((await upload(f(), { category: "expense" }, env(), { pass: false })).status).toBe(401);
  expect((await upload(f(), { category: "expense" }, env(), { origin: "https://evil.example" })).status).toBe(403);
  expect((await upload(f(), { category: "receipts" })).status).toBe(400);
  expect((await upload(f(), { category: "expense", amount: "-5" })).status).toBe(400);
  expect((await upload(f(), { category: "expense", date: "18/11/2026" })).status).toBe(400);
  expect((await upload(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" }), { category: "other" })).status).toBe(413);
  expect(store.size).toBe(0);
});

test("labels can be changed and a document removed; the file itself is kept on a label change", async () => {
  const e = env();
  await upload(new File(["%PDF-1.7 hello"], "x.pdf", { type: "application/pdf" }), { category: "other", title: "Old" }, e);
  const [doc] = (await list(e)).items;
  const r = await call(`docs/${doc.id}`, { method: "POST", body: JSON.stringify({ title: "Insurance 2027", category: "contract", date: "2026-12-01", note: "renew in Dec" }) }, e);
  expect(r.status).toBe(200);
  const [after] = (await list(e)).items;
  expect(after).toMatchObject({ id: doc.id, title: "Insurance 2027", category: "contract", date: "2026-12-01", note: "renew in Dec", fileName: "x.pdf" });
  expect(new TextDecoder().decode(store.get(`docs/${doc.id}`)!.body)).toBe("%PDF-1.7 hello");

  expect((await call(`docs/${doc.id}`, { method: "DELETE" }, e, { origin: "https://evil.example" })).status).toBe(403);
  expect((await call(`docs/${doc.id}`, { method: "DELETE" }, e)).status).toBe(200);
  expect((await list(e)).items).toEqual([]);
  expect((await call("docs/not-a-document-id", { method: "DELETE" }, e)).status).toBe(400);
});

test("a document opens through its signed link; a web page or Word file is downloaded, never shown as a page of the site", async () => {
  const e = env();
  await upload(new File(["%PDF-invoice"], "inv.pdf", { type: "application/pdf" }), { category: "invoice" }, e);
  await upload(new File(["<script>alert(1)</script>"], "note.html", { type: "text/html" }), { category: "other" }, e);
  const items = (await list(e)).items;
  const pdf = items.find((x) => x.fileName === "inv.pdf")!;
  const html = items.find((x) => x.fileName === "note.html")!;

  const open = (link: string) => worker.fetch(new Request(link) as never, e, {} as never);
  const ok = await open(pdf.link);
  expect(ok.status).toBe(200);
  expect(ok.headers.get("Content-Type")).toBe("application/pdf");
  expect(ok.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await ok.text()).toBe("%PDF-invoice");

  const page = await open(html.link);
  expect(page.headers.get("Content-Type")).toBe("application/octet-stream");
  expect(page.headers.get("Content-Disposition")).toStartWith("attachment");

  expect((await open(pdf.link.replace(pdf.id, html.id))).status).toBe(403); // a link only opens its own file
  expect((await open(pdf.link.replace(/e=\d+/, "e=1000000000000"))).status).toBe(403); // expired
});
