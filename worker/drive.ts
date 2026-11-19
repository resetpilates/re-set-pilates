// Google Drive for the Studio hub's wiki: the Documents section lists one Drive folder (SOPs, invoices, receipts,
// expenses, private papers) and opens its files, without Orit signing in to Google.
//
// The Worker signs in as a Google "service account" (secret GOOGLE_SERVICE_ACCOUNT, the JSON key file) that the
// folder is shared with as Viewer, and only ever reads. WIKI_FOLDER_ID is that folder's id (the last part of its
// address in Drive). Nothing outside that folder is listed or opened, even if more is shared with the account.
import type { StDoc, StudioDocs } from "../src/lib/studioTypes";

declare global {
  interface Env {
    GOOGLE_SERVICE_ACCOUNT?: string; // the service account's JSON key, as one secret
    WIKI_FOLDER_ID?: string; // the Drive folder the wiki shows
  }
}

const API = "https://www.googleapis.com/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
const ID = /^[A-Za-z0-9_-]{10,80}$/;
const FIELDS = "id,name,mimeType,modifiedTime,size,parents";

export const driveReady = (env: Env) => Boolean(env.GOOGLE_SERVICE_ACCOUNT && ID.test(env.WIKI_FOLDER_ID ?? ""));

// ---------- signing in as the service account ----------

const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === "string" ? unescape(encodeURIComponent(b)) : String.fromCharCode(...new Uint8Array(b)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

let cached: { for: string; token: string; until: number } | undefined;

async function accessToken(env: Env): Promise<string> {
  const key = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT!) as { client_email: string; private_key: string };
  if (cached && cached.for === key.client_email && cached.until > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({ iss: key.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }),
  )}`;
  const der = Uint8Array.from(atob(key.private_key.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const signer = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const jwt = `${unsigned}.${b64url(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", signer, new TextEncoder().encode(unsigned)))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!r.ok) throw new Error(`google sign-in ${r.status}`);
  const t = (await r.json()) as { access_token: string; expires_in: number };
  cached = { for: key.client_email, token: t.access_token, until: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

async function drive(env: Env, path: string, params: Record<string, string> = {}): Promise<Response> {
  const u = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries({ supportsAllDrives: "true", ...params })) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Authorization: `Bearer ${await accessToken(env)}` } });
  if (!r.ok) throw new Error(`drive ${r.status}`);
  return r;
}

interface Meta {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
}
const meta = async (env: Env, id: string) => (await (await drive(env, `/${id}`, { fields: FIELDS })).json()) as Meta;

// ---------- staying inside the wiki folder ----------

/** The folders from the wiki folder down to `id` (empty when `id` is not inside it). Climbs at most 8 levels. */
async function trail(env: Env, id: string): Promise<{ id: string; name: string }[]> {
  const root = env.WIKI_FOLDER_ID!;
  const path: { id: string; name: string }[] = [];
  for (let at = id, i = 0; i < 8; i++) {
    const m = await meta(env, at);
    path.unshift({ id: m.id, name: m.name });
    if (at === root) return path;
    if (!m.parents?.length) return [];
    at = m.parents[0];
  }
  return [];
}

const KIND: [RegExp, StDoc["kind"]][] = [
  [/folder$/, "folder"],
  [/pdf$/, "pdf"],
  [/^image\//, "image"],
  [/spreadsheet|excel|csv/, "sheet"],
  [/document|word|text\/|markdown/, "doc"],
];
const toDoc = (m: Meta, link: (id: string) => Promise<string>): Promise<StDoc> =>
  (async () => {
    const kind = KIND.find(([re]) => re.test(m.mimeType))?.[1] ?? "file";
    return { id: m.id, name: m.name, kind, modified: m.modifiedTime ?? "", size: Number(m.size) || 0, link: kind === "folder" ? "" : await link(m.id) };
  })();

/** One folder's contents, or (with `q`) every file inside the wiki folder that mentions the words. */
export async function listDocs(env: Env, o: { folder?: string; q?: string }, link: (id: string) => Promise<string>): Promise<StudioDocs> {
  if (!driveReady(env)) return { ok: true, connected: false, path: [], items: [] };
  const root = env.WIKI_FOLDER_ID!;
  const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  if (o.q) {
    const r = await drive(env, "", { q: `fullText contains '${quote(o.q.slice(0, 80))}' and trashed = false and mimeType != '${FOLDER}'`, fields: `files(${FIELDS})`, pageSize: "40", includeItemsFromAllDrives: "true" });
    const found = ((await r.json()) as { files: Meta[] }).files;
    const inside = new Map<string, boolean>();
    const kept: Meta[] = [];
    for (const f of found) {
      const parent = f.parents?.[0] ?? "";
      if (!inside.has(parent)) inside.set(parent, parent === root || (parent ? (await trail(env, parent)).length > 0 : false));
      if (inside.get(parent)) kept.push(f);
    }
    return { ok: true, connected: true, path: [], items: await Promise.all(kept.map((f) => toDoc(f, link))) };
  }
  const folder = o.folder && ID.test(o.folder) ? o.folder : root;
  const path = await trail(env, folder);
  if (!path.length) return { ok: true, connected: true, path: [], items: [] };
  const r = await drive(env, "", { q: `'${folder}' in parents and trashed = false`, fields: `files(${FIELDS})`, orderBy: "folder,name", pageSize: "200", includeItemsFromAllDrives: "true" });
  const files = ((await r.json()) as { files: Meta[] }).files;
  return { ok: true, connected: true, path, items: await Promise.all(files.map((f) => toDoc(f, link))) };
}

/** A file's bytes, for the browser to show. Google Docs, Sheets and Slides come out as PDF. Refuses anything outside the wiki folder. */
export async function openDoc(env: Env, id: string): Promise<Response> {
  if (!driveReady(env) || !ID.test(id)) return new Response("Not found", { status: 404 });
  const m = await meta(env, id);
  if (m.mimeType === FOLDER || !m.parents?.length || !(await trail(env, m.parents[0])).length) return new Response("Not found", { status: 404 });
  const google = m.mimeType.startsWith("application/vnd.google-apps.");
  const r = google ? await drive(env, `/${id}/export`, { mimeType: "application/pdf" }) : await drive(env, `/${id}`, { alt: "media" });
  // Shown in the browser: PDFs, photos and plain text. Anything else (a web page, a spreadsheet file, a zip) is
  // downloaded instead, so a file in the folder can never run as a page of this site.
  const text = /\.(md|txt|csv)$/i.test(m.name) || m.mimeType === "text/plain" || m.mimeType === "text/markdown" || m.mimeType === "text/csv";
  const type = google || m.mimeType === "application/pdf" ? "application/pdf" : /^image\/(png|jpeg|webp|gif|heic)$/.test(m.mimeType) ? m.mimeType : text ? "text/plain; charset=utf-8" : "application/octet-stream";
  return new Response(r.body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `${type === "application/octet-stream" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(google ? `${m.name}.pdf` : m.name)}`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
