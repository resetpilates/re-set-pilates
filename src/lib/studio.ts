// Browser side of the Studio hub: the passcode pass kept on this phone, and the three calls to /api/studio/.
import type { StudioAction, StudioData, StudioReply } from "./studioTypes";

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

export async function sendAction(a: StudioAction): Promise<boolean> {
  return (await call<StudioReply>("act", { method: "POST", body: JSON.stringify(a) })).ok;
}

/** Israeli number as typed ("050-123-4567") → digits for wa.me ("972501234567"). */
export function waDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("972") ? d : d.startsWith("0") ? `972${d.slice(1)}` : d;
}
