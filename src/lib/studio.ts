// Browser side of the Studio hub: the passcode pass kept on this phone, and the three calls to /api/studio/.
import type { DocMeta, StudioAction, StudioData, StudioDocs, StudioMember, StudioReply } from "./studioTypes";

const KEY = "reset.studio.pass";
type Fail = Extract<StudioReply, { ok: false }>["error"] | "offline";

export const hasPass = () => {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return false;
  }
};
export const forgetPass = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* private mode: nothing was stored */
  }
};
const pass = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};

async function call<T>(path: string, init?: RequestInit): Promise<T | { ok: false; error: Fail }> {
  try {
    const r = await fetch(`/api/studio/${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${pass()}` } });
    return (await r.json()) as T;
  } catch {
    return { ok: false, error: "offline" };
  }
}

/** Trades the passcode for a 30-day pass. Returns the reason when it fails. */
export async function signIn(code: string): Promise<Fail | null> {
  const r = await call<StudioReply>("login", { method: "POST", body: JSON.stringify({ code }) });
  if (!r.ok) return r.error;
  try {
    localStorage.setItem(KEY, r.token ?? "");
  } catch {
    return "offline";
  }
  return null;
}

export const loadStudio = () => call<StudioData>("data");
/** The wiki's documents: every saved file with its labels. */
export const loadDocs = () => call<StudioDocs>("docs");

type DocReply = { ok: true; id?: string } | { ok: false; error: Fail };
const labels = (m: DocMeta) => ({ title: m.title, category: m.category, date: m.date, note: m.note, amount: m.amount === null ? "" : String(m.amount), payee: m.payee });

/**
 * A photo from the phone camera is usually 3-6 MB; scaled to 2400 px it reads just as well and uploads in seconds
 * on mobile data. PDFs and other files are sent as they are. Any problem making the smaller copy sends the original.
 */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024 || typeof createImageBitmap !== "function") return file;
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Saves a new document. */
export async function uploadDoc(file: File, meta: DocMeta): Promise<DocReply> {
  const form = new FormData();
  form.append("file", await shrink(file));
  for (const [k, v] of Object.entries(labels(meta))) form.append(k, v);
  try {
    const r = await fetch("/api/studio/docs", { method: "POST", body: form, headers: { Authorization: `Bearer ${pass()}` } });
    return (await r.json()) as DocReply;
  } catch {
    return { ok: false, error: "offline" };
  }
}
/** New labels for a saved document. */
export const saveDocLabels = (id: string, meta: DocMeta) => call<DocReply>(`docs/${id}`, { method: "POST", body: JSON.stringify(labels(meta)) });
export const removeDoc = (id: string) => call<DocReply>(`docs/${id}`, { method: "DELETE" });
export const loadMember = (id: string) => call<StudioMember>(`member?id=${encodeURIComponent(id)}`);

/** Sends one edit. `status` is what a booking ended up as (an undo may give back "Held"). */
export async function sendAction(a: StudioAction): Promise<{ ok: boolean; status?: string }> {
  const r = await call<StudioReply>("act", { method: "POST", body: JSON.stringify(a) });
  return r.ok ? { ok: true, status: r.status } : { ok: false };
}

/** Israeli number as typed ("050-123-4567") → digits for wa.me ("972501234567"). */
export function waDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("972") ? d : d.startsWith("0") ? `972${d.slice(1)}` : d;
}
