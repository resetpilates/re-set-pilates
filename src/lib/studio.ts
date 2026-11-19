// Browser side of the Studio hub: the passcode pass kept on this phone, and the three calls to /api/studio/.
import type { StudioAction, StudioData, StudioDocs, StudioMember, StudioReply } from "./studioTypes";

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
/** The wiki's documents: one folder, or a search across all of them. */
export const loadDocs = (o: { folder?: string; q?: string }) => call<StudioDocs>(`docs?${new URLSearchParams(o.q ? { q: o.q } : o.folder ? { folder: o.folder } : {})}`);
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
