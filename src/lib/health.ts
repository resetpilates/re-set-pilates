// Health declaration (הצהרת בריאות): the questions, which answers need a doctor's approval, and how long a declaration lasts.
// Shared by the app (src/pages/Health.tsx) and the Worker (worker/index.ts), so both apply the same rule.
// The wording lives in src/content (key `health`) and is a draft until Orit approves it.

/** Bump when the wording changes: everyone is asked to declare again. */
export const HEALTH_VERSION = "health-decl-v0-draft";
/** A declaration is valid for this many months, then the member is asked to renew it. TODO_VERIFY with Orit. */
export const HEALTH_VALID_MONTHS = 12;
/** From this many days before a declaration (and the terms accepted with it) runs out, the member is asked to renew. */
export const RENEW_NOTICE_DAYS = 30;

/** Yes/no questions. A "yes" to any of these needs a doctor's approval before training (studio terms §10). */
export const CLEARANCE_QUESTIONS = ["heart", "chest", "dizzy", "asthma", "family", "supervised", "chronic"] as const;
export type ClearanceQuestion = (typeof CLEARANCE_QUESTIONS)[number];

export const PREGNANCY = ["no", "pregnant", "postnatal"] as const;
export type Pregnancy = (typeof PREGNANCY)[number];

export interface HealthAnswers extends Record<ClearanceQuestion, boolean> {
  pregnancy: Pregnancy; // postnatal = gave birth in the last 12 months
  injury: boolean; // current injury, pain, or surgery in the last 12 months
  injuryNote?: string;
  adult: boolean; // 18 or over
  guardianName?: string; // under 18: the parent or guardian who confirms
  guardianPhone?: string;
}

/** What this device remembers after a declaration. */
export interface HealthRecord {
  at: string; // ISO
  version: string;
  validUntil: string; // YYYY-MM-DD
  clearance: boolean; // a doctor's approval is needed before the first class
  answers?: HealthAnswers; // missing when the declaration was confirmed from the studio's records (another device, paper form)
  queued?: boolean; // made offline: waiting in the outbox, does not count until the studio has it
  ref?: string; // id sent with the declaration, so a resend is saved once
}

/** The questions that need a doctor's approval, by id (empty = none). Pregnancy and the months after birth count. */
export function clearanceReasons(a: HealthAnswers): string[] {
  const r: string[] = CLEARANCE_QUESTIONS.filter((q) => a[q] === true);
  if (a.pregnancy === "pregnant" || a.pregnancy === "postnatal") r.push(a.pregnancy);
  return r;
}

export const needsClearance = (a: HealthAnswers) => clearanceReasons(a).length > 0;

/** Under 18 needs the parent's or guardian's name and phone. */
export const guardianMissing = (a: HealthAnswers) => !a.adult && (!a.guardianName?.trim() || !a.guardianPhone?.trim());

/** The studio's calendar day (Israel), YYYY-MM-DD, whatever time zone the phone or server is in. Same day as the Worker's todayIL. */
export const studioDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);

export function validUntil(from: Date, months = HEALTH_VALID_MONTHS): string {
  const [y, m, d] = studioDate(from).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

/** "11.11.2027": the year matters for a declaration that lasts a year. */
export const fmtValid = (iso: string) => iso.split("-").reverse().map(Number).join(".");

/** A declaration on this device that is current: the same wording version and not past its date. */
export function healthValid(h: HealthRecord | undefined, now = new Date()): boolean {
  if (!h || h.queued || h.version !== HEALTH_VERSION) return false;
  return h.validUntil >= studioDate(now);
}

/** Days from today (studio date) to an ISO date; negative once it has passed. */
export function daysUntil(iso: string, now = new Date()): number {
  const day = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((day(iso) - day(studioDate(now))) / 86_400_000);
}

/** Still valid, but inside the last month: time to renew (the studio is told the same day). */
export const renewSoon = (h: HealthRecord | undefined, now = new Date()) => healthValid(h, now) && daysUntil(h!.validUntil, now) <= RENEW_NOTICE_DAYS;

/** Where this device stands, for the profile row and the "next step" card. */
export type HealthStatus = "valid" | "soon" | "sending" | "renew" | "missing";
export function healthStatus(h: HealthRecord | undefined, now = new Date()): HealthStatus {
  if (renewSoon(h, now)) return "soon";
  if (healthValid(h, now)) return "valid";
  if (h?.queued) return "sending";
  return h ? "renew" : "missing";
}
