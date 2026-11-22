// The Studio hub's document cabinet: receipts, invoices, tax papers, health forms, contracts — anything Orit wants
// kept. She uploads from her phone (a photo or a file) in the wiki's Documents section; each file is stored in the
// site's own private Cloudflare R2 bucket (binding DOCS) with a few labels she can search: title, category, date,
// note, and for expenses the amount and who was paid. Nothing here is public: every call needs the studio pass,
// and a file opens only through a short-lived signed link made by worker/studio.ts.
import { DOC_CATEGORIES, type DocCategory, type DocMeta, type StDoc, type StudioDocs } from "../src/lib/studioTypes";

const PREFIX = "docs/";
export const MAX_DOC_BYTES = 20 * 1024 * 1024; // a phone photo is 2-6 MB; a scanned PDF rarely passes 10 MB
const MAX_DOCS = 5000;
export const DOC_ID = /^[0-9a-f]{32}$/;

/** The bucket, when it is bound in wrangler.jsonc. Read loosely so a regenerated Env type never clashes. */
export const bucketOf = (env: Env) => (env as Env & { DOCS?: R2Bucket }).DOCS;

// Shown in the browser: PDFs and photos. Anything else (Word, Excel, a web page, a zip) is downloaded instead, so a
// stored file can never run as a page of this site.
const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);
const kindOf = (type: string): StDoc["kind"] => (type === "application/pdf" ? "pdf" : type.startsWith("image/") ? "image" : "file");

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");

/** Labels from the form, checked. Returns null when the category or a number makes no sense. */
export function readMeta(raw: Record<string, unknown>, fallbackTitle = ""): DocMeta | null {
  const category = DOC_CATEGORIES.includes(raw.category as DocCategory) ? (raw.category as DocCategory) : null;
  if (!category) return null;
  const date = clean(raw.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const amountText = clean(raw.amount, 20).replace(/[,\s₪]/g, "");
  const amount = amountText === "" ? null : Number(amountText);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000)) return null;
  return {
    title: clean(raw.title, 120) || fallbackTitle || "—",
    category,
    date: date || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date()),
    note: clean(raw.note, 400),
    amount: amount === null ? null : Math.round(amount * 100) / 100,
    payee: clean(raw.payee, 80),
  };
}

// R2 keeps labels as text (customMetadata), 2 KB at most per file; the caps above keep well under it.
const toCustom = (m: DocMeta, fileName: string, uploaded: string): Record<string, string> => ({
  title: m.title,
  category: m.category,
  date: m.date,
  note: m.note,
  amount: m.amount === null ? "" : String(m.amount),
  payee: m.payee,
  fileName,
  uploaded,
});

function toDoc(o: R2Object, link: string): StDoc {
  const c = o.customMetadata ?? {};
  const type = o.httpMetadata?.contentType ?? "application/octet-stream";
  return {
    id: o.key.slice(PREFIX.length),
    title: c.title || c.fileName || "—",
    category: DOC_CATEGORIES.includes(c.category as DocCategory) ? (c.category as DocCategory) : "other",
    date: c.date || o.uploaded.toISOString().slice(0, 10),
    note: c.note ?? "",
    amount: c.amount ? Number(c.amount) : null,
    payee: c.payee ?? "",
    fileName: c.fileName ?? "",
    kind: kindOf(type),
    size: o.size,
    uploaded: c.uploaded || o.uploaded.toISOString(),
    link,
  };
}

/** Every document, newest first. */
export async function listDocs(env: Env, link: (id: string) => Promise<string>): Promise<StudioDocs> {
  const bucket = bucketOf(env);
  if (!bucket) return { ok: true, connected: false, items: [], capped: false };
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: PREFIX, cursor, limit: 1000, include: ["customMetadata", "httpMetadata"] });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && objects.length < MAX_DOCS);
  const items = await Promise.all(objects.map(async (o) => toDoc(o, await link(o.key.slice(PREFIX.length)))));
  items.sort((a, b) => b.date.localeCompare(a.date) || b.uploaded.localeCompare(a.uploaded));
  return { ok: true, connected: true, items, capped: Boolean(cursor) };
}

export type DocResult = { ok: true; id?: string } | { ok: false; status: number; error: "setup" | "bad request" | "too large" | "not found" };

/** A new document: multipart form with `file` plus the labels. */
export async function uploadDoc(env: Env, req: Request): Promise<DocResult> {
  const bucket = bucketOf(env);
  if (!bucket) return { ok: false, status: 503, error: "setup" };
  if (Number(req.headers.get("Content-Length") ?? 0) > MAX_DOC_BYTES + 64 * 1024) return { ok: false, status: 413, error: "too large" };
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !file || typeof file === "string" || file.size === 0) return { ok: false, status: 400, error: "bad request" };
  if (file.size > MAX_DOC_BYTES) return { ok: false, status: 413, error: "too large" };
  const fileName = clean(file.name, 120) || "document";
  const meta = readMeta(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")), fileName.replace(/\.[a-z0-9]{1,5}$/i, ""));
  if (!meta) return { ok: false, status: 400, error: "bad request" };
  const type = /^[a-z]+\/[a-z0-9.+-]+$/i.test(file.type) ? file.type.toLowerCase() : "application/octet-stream";
  const id = crypto.randomUUID().replace(/-/g, "");
  await bucket.put(PREFIX + id, await file.arrayBuffer(), { httpMetadata: { contentType: type }, customMetadata: toCustom(meta, fileName, new Date().toISOString()) });
  return { ok: true, id };
}

/** New labels for a document already saved (the file itself is kept as it is). */
export async function updateDoc(env: Env, id: string, raw: Record<string, unknown>): Promise<DocResult> {
  const bucket = bucketOf(env);
  if (!bucket) return { ok: false, status: 503, error: "setup" };
  if (!DOC_ID.test(id)) return { ok: false, status: 400, error: "bad request" };
  const obj = await bucket.get(PREFIX + id);
  if (!obj) return { ok: false, status: 404, error: "not found" };
  const old = obj.customMetadata ?? {};
  const meta = readMeta(raw, old.title);
  if (!meta) return { ok: false, status: 400, error: "bad request" };
  // R2 can't change labels in place: the file is written again under the same name with the new labels.
  await bucket.put(PREFIX + id, await obj.arrayBuffer(), { httpMetadata: obj.httpMetadata, customMetadata: toCustom(meta, old.fileName ?? "", old.uploaded ?? obj.uploaded.toISOString()) });
  return { ok: true, id };
}

export async function deleteDoc(env: Env, id: string): Promise<DocResult> {
  const bucket = bucketOf(env);
  if (!bucket) return { ok: false, status: 503, error: "setup" };
  if (!DOC_ID.test(id)) return { ok: false, status: 400, error: "bad request" };
  await bucket.delete(PREFIX + id);
  return { ok: true };
}

/** The file itself, for a signed link. */
export async function openDoc(env: Env, id: string): Promise<Response> {
  const bucket = bucketOf(env);
  const obj = bucket && DOC_ID.test(id) ? await bucket.get(PREFIX + id) : null;
  if (!obj) return new Response("Not found", { status: 404 });
  const type = obj.httpMetadata?.contentType ?? "application/octet-stream";
  const inline = INLINE.has(type);
  const name = obj.customMetadata?.fileName || "document";
  return new Response(obj.body, {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Length": String(obj.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
