// Progress profile ("AI trainer"): data shapes and the deterministic rules from the spec.
// Everything here is pure: the dashboard, the future server and tests can all share it.
// No AI writes numbers: KPIs, milestones, safety holds and next actions are rule-based.
import { trainerConfig as cfg } from "../config/trainer";
import { fromISO, toISO } from "./booking";

/* ---------- Onboarding questionnaire (spec section 3) ---------- */

export type QType = "text" | "longtext" | "date" | "number" | "single" | "multi" | "scale" | "bool";
export interface Question {
  id: string;
  type: QType;
  req?: boolean;
  opts?: string[];
  optsFrom?: string; // G2 picks from the G1 answers
  max?: number; // multi: max picks; text: max chars; scale: top value
  min?: number;
  unit?: string;
  exclusive?: string; // multi option that clears the others ("none")
  when?: (a: Answers) => boolean; // conditional question
}
export type Answer = string | number | boolean | string[] | null | undefined;
export type Answers = Record<string, Answer>;

const painYes = (a: Answers) => a.H1 === true;

export const STEPS: { id: string; questions: Question[] }[] = [
  {
    id: "about",
    questions: [
      { id: "A1", type: "text", req: true },
      { id: "A2", type: "date", req: true },
      { id: "A3", type: "number", unit: "cm", min: 100, max: 230 },
      { id: "A4", type: "number", unit: "kg", min: 30, max: 250 },
      { id: "A5", type: "single", opts: ["friend", "instagram", "google", "walkin", "other"] },
    ],
  },
  {
    id: "goals",
    questions: [
      { id: "G1", type: "multi", req: true, max: 3, opts: ["strength", "rehab", "posture", "flexibility", "toning", "weight", "stress", "natal", "sport"] },
      { id: "G2", type: "single", req: true, optsFrom: "G1" },
      { id: "G3", type: "longtext", max: 300 },
      { id: "G4", type: "scale", min: 1, max: 5 },
    ],
  },
  {
    id: "health",
    questions: [
      { id: "H1", type: "bool", req: true },
      { id: "H2", type: "multi", req: true, when: painYes, opts: ["neck", "shoulders", "upperBack", "lowerBack", "hips", "knees", "ankles", "wrists", "other"] },
      { id: "H3", type: "scale", req: true, when: painYes, min: 0, max: 10 },
      { id: "H4", type: "longtext", req: true, when: painYes },
      { id: "H5", type: "longtext" },
      { id: "H6", type: "multi", req: true, exclusive: "none", opts: ["pregnancy", "postpartum", "osteoporosis", "hypertension", "diastasis", "herniated", "scoliosis", "arthritis", "other", "none"] },
      { id: "H7", type: "longtext" },
      { id: "H8", type: "bool" },
      { id: "H9", type: "bool", req: true }, // consent: must be "yes"
    ],
  },
  {
    id: "experience",
    questions: [
      { id: "E1", type: "single", req: true, opts: ["never", "lt6m", "6to24m", "2y"] },
      { id: "E2", type: "multi", req: true, exclusive: "none", opts: ["mat", "reformer", "cadillac", "chair", "barrels", "none"] },
      { id: "E3", type: "multi", exclusive: "none", opts: ["strength", "running", "yoga", "cycling", "swimming", "team", "none", "other"] },
      { id: "E4", type: "scale", req: true, min: 1, max: 5 },
      { id: "E5", type: "scale", min: 1, max: 5 },
    ],
  },
  {
    id: "schedule",
    questions: [
      { id: "S1", type: "single", req: true, opts: ["1", "2", "3", "4", "5"] },
      { id: "S2", type: "multi", opts: ["0", "1", "2", "3", "4", "5", "6"] },
      { id: "S3", type: "multi", opts: ["morning", "midday", "evening"] },
      { id: "S4", type: "multi", opts: ["mat", "reformer", "private", "duet", "group"] },
      { id: "S5", type: "multi", exclusive: "none", opts: ["push", "whatsapp", "email", "none"] },
      { id: "S6", type: "longtext" },
      { id: "S7", type: "bool" },
      { id: "S8", type: "multi", opts: ["whatsapp", "email"] }, // promotional consent, per channel
      { id: "S9", type: "bool" }, // photo / video consent for the studio's own channels (opt-in, never required)
    ],
  },
];

export const visible = (q: Question, a: Answers) => !q.when || q.when(a);

export function questionError(q: Question, a: Answers): "required" | "consent" | "range" | null {
  if (!visible(q, a)) return null;
  const v = a[q.id];
  const empty = v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  if (q.id === "H9") return v === true ? null : "consent";
  if (q.req && empty) return "required";
  if (q.type === "date" && !empty) {
    const d = new Date(String(v));
    const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
    if (Number.isNaN(d.getTime()) || age < 14 || age > 110) return "range";
  }
  if (q.type === "number" && !empty) {
    const n = Number(v);
    if (!Number.isFinite(n) || (q.min != null && n < q.min) || (q.max != null && n > q.max)) return "range";
  }
  return null;
}
export const stepValid = (i: number, a: Answers) => STEPS[i].questions.every((q) => !questionError(q, a));

/** Spec: E1 maps to a starting level; a trainer or the baseline can override it. */
export function initialLevel(a: Answers): "basic" | "intermediate" | "advanced" | null {
  if (a.E1 === "never" || a.E1 === "lt6m") return "basic";
  if (a.E1 === "6to24m") return "intermediate";
  if (a.E1 === "2y") return "advanced";
  return null;
}

/** Step 3 red flags → "needs trainer review" before any automated exercise/load suggestion. */
export function onboardingRedFlags(a: Answers): string[] {
  const reasons: string[] = [];
  const h6 = Array.isArray(a.H6) ? a.H6 : [];
  for (const f of cfg.safety.onboardingRedFlags) if (h6.includes(f)) reasons.push(f);
  if (a.H1 === true && typeof a.H3 === "number" && a.H3 >= cfg.safety.onboardingPainAt) reasons.push("pain");
  return reasons;
}

/* ---------- Records (spec section 5, trimmed to what the MVP shows) ---------- */

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD, studio-local
  time: string;
  service: string;
  status: "attended" | "late_cancel" | "no_show";
  source: "sample" | "booking";
}

export interface Checkin {
  id: string;
  sessionId: string;
  at: string; // UTC ISO timestamp
  timing: "pre" | "post" | "next_morning";
  soreness: number | null; // 0–10; null = not reported (never 0)
  energy: number | null; // 1–5
  pain: number | null; // 0–10
  painLocations: string[];
}

export interface Assessment {
  id: string;
  date: string;
  type: "baseline" | "reassessment";
  source: "studio" | "self";
  protocolVersion: string;
  normalizationVersion: string;
  plankS: number | null;
  balanceLeftS: number | null;
  balanceRightS: number | null;
  sitReachCm: number | null;
  shoulder: number | null; // 1–5
  hip: number | null; // 1–5
}

export interface TrainerNote {
  id: string;
  author: string;
  at: string;
  text: { he: string; en: string };
  visibility: "client" | "staff";
}

export type ReviewType = "onboarding" | "pain_high" | "pain_rising" | "soreness_high";
export interface ReviewTask {
  id: string;
  type: ReviewType;
  evidence: string[]; // check-in ids, or onboarding question ids
  reasons?: string[];
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
  resolvedAt?: string;
  resolution?: string; // approved restrictions + plan, recorded by the trainer
}

export interface GoalEntry {
  target: number; // sessions per week (S1)
  from: string; // week start (YYYY-MM-DD): effective-dated, never rewrites the past
}

export interface Pause {
  from: string;
  to: string;
}

export interface ConsentRecord {
  scope: "health" | "promo" | "media";
  channel?: string;
  textVersion: string;
  grantedAt: string;
  revokedAt?: string | null;
}

/** Is there a consent of this scope that has not been withdrawn? */
export const hasConsent = (consents: ConsentRecord[], scope: ConsentRecord["scope"]) => consents.some((c) => c.scope === scope && !c.revokedAt);

/**
 * Photo / video consent follows the checkbox: ticked grants one active "media" record (never a
 * duplicate), unticked withdraws any active one. Returns the same array when nothing changes.
 */
export function withMediaConsent(consents: ConsentRecord[], on: boolean, textVersion: string, now: string): ConsentRecord[] {
  if (on) return hasConsent(consents, "media") ? consents : [...consents, { scope: "media", textVersion, grantedAt: now }];
  return hasConsent(consents, "media") ? consents.map((c) => (c.scope === "media" && !c.revokedAt ? { ...c, revokedAt: now } : c)) : consents;
}

/* ---------- Weeks and consistency (Graph 1) ---------- */

export function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() - cfg.weekStartsOn + 7) % 7));
  return x;
}
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export function goalFor(weekISO: string, goals: GoalEntry[]): number | null {
  let g: number | null = null;
  for (const e of [...goals].sort((a, b) => a.from.localeCompare(b.from))) if (e.from <= weekISO) g = e.target;
  // Weeks before the first goal use the first goal so early history still has a reference line
  return g ?? (goals.length ? [...goals].sort((a, b) => a.from.localeCompare(b.from))[0].target : null);
}

export interface Week {
  start: string;
  attended: number;
  goal: number | null;
  pct: number | null;
  paused: boolean;
  complete: boolean; // false for the current week: never labelled as a miss
  met: boolean; // ≥ 80% of goal
}

export function buildWeeks(sessions: Session[], goals: GoalEntry[], pauses: Pause[], now: Date, count: number): Week[] {
  const thisWeek = weekStart(now);
  const attended = sessions.filter((s) => s.status === "attended");
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(thisWeek, -7 * (count - 1 - i));
    const startISO = toISO(start);
    const endISO = toISO(addDays(start, 7));
    const n = attended.filter((s) => s.date >= startISO && s.date < endISO).length;
    const goal = goalFor(startISO, goals);
    const paused = pauses.some((p) => p.from < endISO && p.to >= startISO);
    const pct = goal ? n / goal : null;
    return {
      start: startISO,
      attended: n,
      goal,
      pct,
      paused,
      complete: start.getTime() < thisWeek.getTime(),
      met: pct !== null && pct >= cfg.consistency.streakMetPct,
    };
  });
}

/** Weeks from the first attended session (or the last 104): used for streaks. */
export function allWeeks(sessions: Session[], goals: GoalEntry[], pauses: Pause[], now: Date) {
  const first = sessions.filter((s) => s.status === "attended").map((s) => s.date).sort()[0];
  if (!first) return [];
  const span = Math.round((weekStart(now).getTime() - weekStart(fromISO(first)).getTime()) / (7 * 864e5)) + 1;
  return buildWeeks(sessions, goals, pauses, now, Math.min(Math.max(span, 1), 104));
}

export function streaks(weeks: Week[]) {
  // Current: walk back over complete weeks; paused weeks neither count nor break.
  let current = 0;
  const done = weeks.filter((w) => w.complete);
  for (let i = done.length - 1; i >= 0; i--) {
    if (done[i].paused) continue;
    if (!done[i].met) break;
    current++;
  }
  const now = weeks[weeks.length - 1];
  if (now && !now.complete && now.met) current++; // this week already met → counts, a short week never breaks it
  let longest = 0;
  let run = 0;
  for (const w of weeks) {
    if (w.paused) continue;
    if (w.met) longest = Math.max(longest, ++run);
    else if (w.complete) run = 0;
  }
  return { current, longest: Math.max(longest, current) };
}

export function trend4(weeks: Week[]) {
  const done = weeks.filter((w) => w.complete && !w.paused).slice(-4);
  if (!done.length) return null;
  return done.reduce((s, w) => s + w.attended, 0) / done.length;
}

/** Staff-only review signal: under 60% of goal for 3 complete, un-paused weeks. */
export function attendanceRisk(weeks: Week[]) {
  const done = weeks.filter((w) => w.complete && !w.paused).slice(-cfg.consistency.reviewWeeks);
  return done.length === cfg.consistency.reviewWeeks && done.every((w) => w.pct !== null && w.pct < cfg.consistency.reviewBelowPct);
}

/* ---------- Mobility and control (baseline; Graph 3 is phase 2) ---------- */

export const AXES = ["plank", "balance", "reach", "shoulder", "hip"] as const;
export type Axis = (typeof AXES)[number];

const clamp = (n: number) => Math.max(0, Math.min(100, n));
export function normalize(a: Assessment): Record<Axis, number | null> {
  const c = cfg.assessment;
  const bal =
    a.balanceLeftS != null && a.balanceRightS != null
      ? (Math.min(a.balanceLeftS, c.balanceCapSec) + Math.min(a.balanceRightS, c.balanceCapSec)) / 2
      : null;
  const rating = (r: number | null) => (r == null ? null : clamp(((r - 1) / 4) * 100));
  return {
    plank: a.plankS == null ? null : clamp((a.plankS / c.plankFullSec) * 100),
    balance: bal == null ? null : clamp((bal / c.balanceCapSec) * 100),
    reach: a.sitReachCm == null ? null : clamp(((a.sitReachCm - c.reachMinCm) / (c.reachMaxCm - c.reachMinCm)) * 100),
    shoulder: rating(a.shoulder),
    hip: rating(a.hip),
  };
}
/** Composite only when all five axes exist: otherwise the assessment is "incomplete". */
export function composite(a: Assessment): number | null {
  const n = normalize(a);
  const vals = AXES.map((k) => n[k]);
  if (vals.some((v) => v == null)) return null;
  return Math.round((vals as number[]).reduce((s, v) => s + v, 0) / vals.length);
}
export const comparable = (a: Assessment, b: Assessment) =>
  a.protocolVersion === b.protocolVersion && a.normalizationVersion === b.normalizationVersion;

export function reassessDue(assessments: Assessment[], now: Date) {
  const last = [...assessments].sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!last) return null;
  const weeks = (now.getTime() - fromISO(last.date).getTime()) / (7 * 864e5);
  return { weeks: Math.floor(weeks), due: weeks >= cfg.assessment.reassessEveryWeeks[0] };
}

/* ---------- Recovery check-ins and safety (Graph 4) ---------- */

/** Post-session check-ins in session order, one per session (the latest wins). */
export function postCheckins(checkins: Checkin[], sessions: Session[]) {
  const order = new Map(sessions.map((s) => [s.id, `${s.date} ${s.time}`]));
  const bySession = new Map<string, Checkin>();
  for (const c of checkins) if (c.timing === "post" && order.has(c.sessionId)) bySession.set(c.sessionId, c);
  return [...bySession.values()].sort((a, b) => order.get(a.sessionId)!.localeCompare(order.get(b.sessionId)!));
}

/** Runs the alert rules after a new check-in. Returns the review tasks to open. */
export function evaluateCheckin(c: Checkin, all: Checkin[], sessions: Session[], open: ReviewTask[]): ReviewTask[] {
  const s = cfg.safety;
  const out: ReviewTask[] = [];
  const has = (type: ReviewType) => open.some((r) => r.type === type && r.status !== "resolved");
  const task = (type: ReviewType, evidence: string[]): ReviewTask => ({
    id: `rv${Date.now()}${type}`,
    type,
    evidence,
    status: "open",
    createdAt: new Date().toISOString(),
  });

  if (c.pain != null && c.pain >= s.painAlertAt && !has("pain_high")) out.push(task("pain_high", [c.id]));

  const series = postCheckins(all, sessions);
  const pains = series.filter((x) => x.pain != null).slice(-s.painRisingSessions);
  if (
    pains.length === s.painRisingSessions &&
    pains.every((x, i) => i === 0 || x.pain! > pains[i - 1].pain!) &&
    !has("pain_rising")
  )
    out.push(task("pain_rising", pains.map((x) => x.id)));

  const sore = series.slice(-s.sorenessAlertSessions);
  if (
    sore.length === s.sorenessAlertSessions &&
    sore.every((x) => x.soreness != null && x.soreness >= s.sorenessAlertAt) &&
    !has("soreness_high")
  )
    out.push(task("soreness_high", sore.map((x) => x.id)));
  return out;
}

/** Any unresolved review suspends automated suggestions and personalised paid cards. */
export const safetyHold = (reviews: ReviewTask[]) => reviews.some((r) => r.status !== "resolved");

/* ---------- Milestones (derived, never stored as truth) ---------- */

export interface Milestone {
  id: string; // stable: type + threshold
  type: "first_class" | "sessions" | "streak" | "plank60" | "low_pain_week" | "reassess_up";
  value?: number;
  earnedAt: string; // YYYY-MM-DD
  evidence: string[];
  ruleVersion: string;
}

export function deriveMilestones(p: {
  sessions: Session[];
  weeks: Week[];
  assessments: Assessment[];
  checkins: Checkin[];
  startedWithPain: boolean;
}): Milestone[] {
  const rv = cfg.milestones.ruleVersion;
  const out: Milestone[] = [];
  const att = p.sessions.filter((s) => s.status === "attended").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (att[0]) out.push({ id: "first_class", type: "first_class", earnedAt: att[0].date, evidence: [att[0].id], ruleVersion: rv });
  for (const n of cfg.milestones.sessionCounts)
    if (att.length >= n) out.push({ id: `sessions_${n}`, type: "sessions", value: n, earnedAt: att[n - 1].date, evidence: [att[n - 1].id], ruleVersion: rv });

  // Streak thresholds: the week the run first reached the threshold
  let run = 0;
  const hit = new Set<number>();
  for (const w of p.weeks) {
    if (w.paused) continue;
    if (w.met) run++;
    else if (w.complete) run = 0;
    for (const n of cfg.milestones.streaks)
      if (run >= n && !hit.has(n)) {
        hit.add(n);
        out.push({ id: `streak_${n}`, type: "streak", value: n, earnedAt: w.start, evidence: [w.start], ruleVersion: rv });
      }
  }

  const sortedA = [...p.assessments].sort((a, b) => a.date.localeCompare(b.date));
  const plank = sortedA.find((a) => a.plankS != null && a.plankS >= 60);
  if (plank) out.push({ id: "plank60", type: "plank60", earnedAt: plank.date, evidence: [plank.id], ruleVersion: rv });

  const base = sortedA.find((a) => a.type === "baseline");
  const baseScore = base ? composite(base) : null;
  if (base && baseScore != null) {
    const up = sortedA.find((a) => a !== base && comparable(a, base) && (composite(a) ?? -1) >= baseScore + cfg.assessment.improvementPoints);
    if (up) out.push({ id: "reassess_up", type: "reassess_up", earnedAt: up.date, evidence: [base.id, up.id], ruleVersion: rv });
  }

  // Low-pain week: 7 days in a row, a pain report on every day, all ≤ 2. Self-reported, not "pain-free".
  if (p.startedWithPain) {
    const byDay = new Map<string, number[]>();
    for (const c of p.checkins) if (c.pain != null) {
      const day = toISO(new Date(c.at));
      byDay.set(day, [...(byDay.get(day) ?? []), c.pain]);
    }
    const days = [...byDay.keys()].sort();
    let streak = 0;
    let prev: string | null = null;
    for (const d of days) {
      const ok = byDay.get(d)!.every((v) => v <= 2);
      const next = prev ? toISO(addDays(fromISO(prev), 1)) === d : false;
      streak = ok ? (next ? streak + 1 : 1) : 0;
      prev = d;
      if (streak >= 7) {
        out.push({ id: "low_pain_week", type: "low_pain_week", earnedAt: d, evidence: [d], ruleVersion: rv });
        break;
      }
    }
  }
  return out.sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
}

/* ---------- One next action ---------- */

export type NextAction =
  | { kind: "review" }
  | { kind: "onboarding" }
  | { kind: "checkin"; sessionId: string }
  | { kind: "baseline" }
  | { kind: "reassess"; weeks: number }
  | { kind: "book"; left: number }
  | { kind: "resource"; id: string };

export function nextAction(p: {
  onboarded: boolean;
  reviews: ReviewTask[];
  sessions: Session[];
  checkins: Checkin[];
  assessments: Assessment[];
  weeks: Week[];
  hasUpcoming: boolean;
  now: Date;
  resourceId: string;
}): NextAction {
  if (!p.onboarded) return { kind: "onboarding" };
  if (safetyHold(p.reviews)) return { kind: "review" };
  // The most recent attended session in the last 2 days without a post check-in
  const recent = p.sessions
    .filter((s) => s.status === "attended" && (p.now.getTime() - fromISO(s.date).getTime()) / 864e5 <= 2)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))[0];
  if (recent && !p.checkins.some((c) => c.sessionId === recent.id && c.timing === "post")) return { kind: "checkin", sessionId: recent.id };
  if (!p.assessments.length) return { kind: "baseline" };
  const due = reassessDue(p.assessments, p.now);
  if (due?.due) return { kind: "reassess", weeks: due.weeks };
  const week = p.weeks[p.weeks.length - 1];
  const left = week?.goal ? Math.max(0, week.goal - week.attended) : 0;
  if (left > 0 && !p.hasUpcoming) return { kind: "book", left };
  return { kind: "resource", id: p.resourceId };
}

/* ---------- Weekly recap ---------- */

export function weeklyRecap(weeks: Week[], milestones: Milestone[], streak: number) {
  const last = [...weeks].reverse().find((w) => w.complete);
  if (!last) return null;
  const end = toISO(addDays(fromISO(last.start), 7));
  const win = milestones.find((m) => m.earnedAt >= last.start && m.earnedAt < end) ?? null;
  const prev = weeks[weeks.indexOf(last) - 1];
  const flat = !last.paused && !last.met && (!prev || prev.attended >= last.attended);
  return { week: last, win, streak, flat };
}

/* ---------- Paid suggestion eligibility (deterministic gate before any wording) ---------- */

export function paidCardAllowed(p: { paidSuggestions: boolean; reviews: ReviewTask[] }) {
  if (!p.paidSuggestions) return { ok: false as const, reason: "opted_out" };
  if (safetyHold(p.reviews)) return { ok: false as const, reason: "safety_review" };
  if (!cfg.paidCards.enabled) return { ok: false as const, reason: "catalog_not_connected" };
  return { ok: true as const };
}
