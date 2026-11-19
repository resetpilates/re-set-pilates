// The wiki's Documents section against a stand-in for Google Drive: `bun test worker/`.
import { beforeAll, beforeEach, expect, test } from "bun:test";
import worker from "./index";
import { issuePass } from "./studio";
import type { StudioDocs } from "../src/lib/studioTypes";

const PASSCODE = "reformer-studio-11";
const ORIGIN = "https://resetpilates.org";
const ROOT = "ROOTfolder0000001";
const F = "application/vnd.google-apps.folder";
type File = { id: string; name: string; mimeType: string; parents?: string[]; modifiedTime?: string; size?: string; body?: string };
let files: File[];
let key = "";
let asked: string[];

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const der = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey))));
  key = JSON.stringify({ client_email: "wiki@reset.iam.gserviceaccount.com", private_key: `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----\n` });
});

const env = (over: Partial<Env> = {}) => ({ AIRTABLE_TOKEN: "t", AIRTABLE_BASE: "appX", STUDIO_PASSCODE: PASSCODE, GOOGLE_SERVICE_ACCOUNT: key, WIKI_FOLDER_ID: ROOT, FORM_LIMIT: { limit: async () => ({ success: true }) }, ...over }) as unknown as Env;
const get = async (path: string, e = env(), signedIn = true) =>
  worker.fetch(new Request(`${ORIGIN}/api/studio/${path}`, { headers: signedIn ? { Authorization: `Bearer ${await issuePass(PASSCODE)}` } : {} }) as never, e, {} as never);

beforeEach(() => {
  asked = [];
  files = [
    { id: ROOT, name: "re:set wiki", mimeType: F },
    { id: "SOPSfolder0000001", name: "נהלים", mimeType: F, parents: [ROOT] },
    { id: "INVfolder00000001", name: "Invoices", mimeType: F, parents: [ROOT] },
    { id: "opening-sop-00001", name: "פתיחת הסטודיו", mimeType: "application/vnd.google-apps.document", parents: ["SOPSfolder0000001"], modifiedTime: "2026-11-01T08:00:00Z" },
    { id: "invoice-nov-00001", name: "invoice-november.pdf", mimeType: "application/pdf", parents: ["INVfolder00000001"], size: "125033", body: "%PDF-invoice" },
    { id: "page-html-0000001", name: "note.html", mimeType: "text/html", parents: [ROOT], body: "<script>alert(1)</script>" },
    { id: "OTHERfolder000001", name: "Someone else's folder", mimeType: F },
    { id: "outside-file-0001", name: "private-elsewhere.pdf", mimeType: "application/pdf", parents: ["OTHERfolder000001"], body: "secret" },
  ];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    asked.push(url.pathname);
    if (url.hostname === "oauth2.googleapis.com") {
      const jwt = String(new URLSearchParams(String(init?.body)).get("assertion"));
      return new Response(JSON.stringify(jwt.split(".").length === 3 ? { access_token: "tok", expires_in: 3600 } : {}), { status: jwt.split(".").length === 3 ? 200 : 400 });
    }
    const id = url.pathname.split("/files/")[1]?.split("/")[0];
    if (!id) {
      const q = url.searchParams.get("q") ?? "";
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const word = q.match(/fullText contains '([^']+)'/)?.[1];
      return new Response(JSON.stringify({ files: files.filter((f) => (parent ? f.parents?.[0] === parent : word ? f.mimeType !== F && f.name.includes(word) : false)) }));
    }
    const f = files.find((x) => x.id === id);
    if (!f) return new Response("{}", { status: 404 });
    if (url.pathname.endsWith("/export")) return new Response("%PDF-exported");
    if (url.searchParams.get("alt") === "media") return new Response(f.body ?? "");
    return new Response(JSON.stringify(f));
  }) as typeof fetch;
});

test("until the Drive folder is connected the wiki says so, and never calls Google", async () => {
  const d = (await (await get("docs", env({ GOOGLE_SERVICE_ACCOUNT: undefined }))).json()) as StudioDocs;
  expect(d).toEqual({ ok: true, connected: false, path: [], items: [] });
  expect(asked.length).toBe(0);
  expect((await get("docs", env(), false)).status).toBe(401);
});

test("lists the wiki folder, walks into a subfolder, and stays out of folders that are not inside it", async () => {
  const top = (await (await get("docs")).json()) as StudioDocs;
  expect(top.connected).toBe(true);
  expect(top.items.map((x) => [x.name, x.kind])).toEqual([["נהלים", "folder"], ["Invoices", "folder"], ["note.html", "doc"]]);
  expect(top.items[0].link).toBe("");

  const sops = (await (await get("docs?folder=SOPSfolder0000001")).json()) as StudioDocs;
  expect(sops.path.map((x) => x.id)).toEqual([ROOT, "SOPSfolder0000001"]);
  expect(sops.items[0]).toMatchObject({ name: "פתיחת הסטודיו", kind: "doc" });
  expect(sops.items[0].link).toContain("/api/studio/file/opening-sop-00001?e=");

  const other = (await (await get("docs?folder=OTHERfolder000001")).json()) as StudioDocs;
  expect(other.items).toEqual([]);
});

test("search finds documents inside the wiki folder only", async () => {
  const d = (await (await get("docs?q=invoice")).json()) as StudioDocs;
  expect(d.items.map((x) => x.name)).toEqual(["invoice-november.pdf"]);
  const out = (await (await get("docs?q=private")).json()) as StudioDocs;
  expect(out.items).toEqual([]);
});

test("a document opens through its signed link, without a pass; a changed or expired link does not", async () => {
  const d = (await (await get("docs?folder=INVfolder00000001")).json()) as StudioDocs;
  const link = d.items[0].link;
  const ok = await worker.fetch(new Request(link) as never, env(), {} as never);
  expect(ok.status).toBe(200);
  expect(ok.headers.get("Content-Type")).toBe("application/pdf");
  expect(ok.headers.get("Cache-Control")).toBe("private, no-store");
  expect(await ok.text()).toBe("%PDF-invoice");

  expect((await worker.fetch(new Request(link.replace("invoice-nov-00001", "outside-file-0001")) as never, env(), {} as never)).status).toBe(403);
  expect((await worker.fetch(new Request(link.replace(/e=\d+/, "e=1000000000000")) as never, env(), {} as never)).status).toBe(403);
});

test("a Google Doc comes out as a PDF; a web page in the folder is downloaded, never shown as a page of the site; outside files are refused", async () => {
  const link = async (id: string) => {
    const exp = Date.now() + 60_000;
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(PASSCODE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`file.${id}.${exp}`))), (b) => b.toString(16).padStart(2, "0")).join("");
    return worker.fetch(new Request(`${ORIGIN}/api/studio/file/${id}?e=${exp}&s=${sig}`) as never, env(), {} as never);
  };
  const doc = await link("opening-sop-00001");
  expect(doc.headers.get("Content-Type")).toBe("application/pdf");
  expect(await doc.text()).toBe("%PDF-exported");

  const html = await link("page-html-0000001");
  expect(html.headers.get("Content-Type")).toBe("application/octet-stream");
  expect(html.headers.get("Content-Disposition")).toStartWith("attachment");

  expect((await link("outside-file-0001")).status).toBe(404); // correctly signed, but not in the wiki folder
});
