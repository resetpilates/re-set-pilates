import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { trainerConfig as cfg } from "../config/trainer";
import { fromISO, toISO } from "./booking";
import { useStore } from "./store";
import {
  evaluateCheckin,
  onboardingRedFlags,
  weekStart,
  type Answers,
  type Assessment,
  type Checkin,
  type ConsentRecord,
  type GoalEntry,
  type Pause,
  type ReviewTask,
  type Session,
  type TrainerNote,
} from "./trainer";

// Progress-profile state. Demo only: it lives in this browser (localStorage), like bookings.
// The real version keeps it server-side, encrypted, readable only by the member and her
// assigned trainer (spec section 7). Everything goes through this provider so the swap is local.

interface Persisted {
  answers: Answers;
  stepsDone: number; // onboarding steps saved (progress is kept after every step)
  onboardedAt: string | null;
  baselineMode: "studio" | "self" | null;
  goals: GoalEntry[];
  sessions: Session[]; // sample attendance; real attendance comes from the booking system
  checkins: Checkin[];
  assessments: Assessment[];
  notes: TrainerNote[];
  reviews: ReviewTask[];
  pauses: Pause[];
  consents: ConsentRecord[];
  seenMilestones: string[];
  sample: boolean;
}

interface Trainer extends Persisted {
  onboarded: boolean;
  /** Sample sessions plus the member's own past bookings from the booking flow. */
  allSessions: Session[];
  saveAnswers: (a: Answers, stepsDone?: number) => void;
  finishOnboarding: () => void;
  setBaselineMode: (m: "studio" | "self") => void;
  addAssessment: (a: Omit<Assessment, "id" | "protocolVersion" | "normalizationVersion">) => void;
  addCheckin: (c: Omit<Checkin, "id" | "at">) => ReviewTask[];
  setGoal: (target: number) => void;
  setPaidSuggestions: (on: boolean) => void;
  setPromo: (channel: string, on: boolean) => void;
  setMedia: (on: boolean) => void;
  ackReview: (id: string) => void;
  resolveReview: (id: string, resolution: string) => void;
  markSeen: (ids: string[]) => void;
  loadSample: () => void;
  reset: () => void;
}

const KEY = "reset.trainer.v1";
const empty: Persisted = {
  answers: {},
  stepsDone: 0,
  onboardedAt: null,
  baselineMode: null,
  goals: [],
  sessions: [],
  checkins: [],
  assessments: [],
  notes: [],
  reviews: [],
  pauses: [],
  consents: [],
  seenMilestones: [],
  sample: false,
};

function load(): Persisted {
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return empty;
  }
}

const iso = () => new Date().toISOString();
const versions = { protocolVersion: cfg.assessment.protocolVersion, normalizationVersion: cfg.assessment.normalizationVersion };

const Ctx = createContext<Trainer | null>(null);

export function TrainerProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Persisted>(load);
  const { past } = useStore();
  // Latest state for callbacks that must return a value right away (React may defer updaters)
  const latest = useRef(s);
  latest.current = s;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* private mode: state stays in memory */
    }
  }, [s]);

  const saveAnswers = useCallback<Trainer["saveAnswers"]>(
    (a, stepsDone) => setS((p) => ({ ...p, answers: { ...p.answers, ...a }, stepsDone: Math.max(p.stepsDone, stepsDone ?? 0) })),
    [],
  );

  const finishOnboarding = useCallback(
    () =>
      setS((p) => {
        const a = p.answers;
        const now = iso();
        const flags = onboardingRedFlags(a);
        const target = Number(a.S1) || 2;
        // Photo / video consent: withdrawn when a returning client unticks it (granted below when ticked)
        const consents: ConsentRecord[] = p.consents.map((c) => (c.scope === "media" && !c.revokedAt && a.S9 !== true ? { ...c, revokedAt: now } : c));
        if (!consents.some((c) => c.scope === "health" && c.textVersion === cfg.consentVersions.health && !c.revokedAt))
          consents.push({ scope: "health", textVersion: cfg.consentVersions.health, grantedAt: now });
        for (const ch of Array.isArray(a.S8) ? a.S8 : [])
          if (!consents.some((c) => c.scope === "promo" && c.channel === ch && !c.revokedAt))
            consents.push({ scope: "promo", channel: ch, textVersion: cfg.consentVersions.promo, grantedAt: now });
        if (a.S9 === true && !consents.some((c) => c.scope === "media" && !c.revokedAt))
          consents.push({ scope: "media", textVersion: cfg.consentVersions.media, grantedAt: now });
        const reviews = flags.length && !p.reviews.some((r) => r.type === "onboarding" && r.status !== "resolved")
          ? [...p.reviews, { id: `rv${Date.now()}`, type: "onboarding" as const, evidence: ["H1", "H3", "H6"], reasons: flags, status: "open" as const, createdAt: now }]
          : p.reviews;
        return {
          ...p,
          onboardedAt: p.onboardedAt ?? now,
          stepsDone: 6,
          goals: p.goals.length ? p.goals : [{ target, from: toISO(weekStart(new Date())) }],
          consents,
          reviews,
        };
      }),
    [],
  );

  const setBaselineMode = useCallback((m: "studio" | "self") => setS((p) => ({ ...p, baselineMode: m })), []);

  const addAssessment = useCallback<Trainer["addAssessment"]>(
    (a) => setS((p) => ({ ...p, assessments: [...p.assessments, { ...a, ...versions, id: `as${Date.now()}` }] })),
    [],
  );

  const addCheckin = useCallback<Trainer["addCheckin"]>(
    (c) => {
      const full: Checkin = { ...c, id: `ck${Date.now()}`, at: iso() };
      const p = latest.current;
      const checkins = [...p.checkins, full];
      const sessions = [...p.sessions, ...past.map(fromBooking)];
      const opened = evaluateCheckin(full, checkins, sessions, p.reviews);
      setS((q) => ({ ...q, checkins: [...q.checkins, full], reviews: [...q.reviews, ...opened] }));
      return opened;
    },
    [past],
  );

  // Effective-dated: the new target starts this week and never rewrites past weeks.
  const setGoal = useCallback(
    (target: number) =>
      setS((p) => {
        const from = toISO(weekStart(new Date()));
        return { ...p, goals: [...p.goals.filter((g) => g.from !== from), { target, from }], answers: { ...p.answers, S1: String(target) } };
      }),
    [],
  );

  const setMedia = useCallback(
    (on: boolean) =>
      setS((p) => {
        const now = iso();
        const consents = on
          ? [...p.consents, { scope: "media" as const, textVersion: cfg.consentVersions.media, grantedAt: now }]
          : p.consents.map((c) => (c.scope === "media" && !c.revokedAt ? { ...c, revokedAt: now } : c));
        return { ...p, consents, answers: { ...p.answers, S9: on } };
      }),
    [],
  );

  const setPaidSuggestions = useCallback((on: boolean) => setS((p) => ({ ...p, answers: { ...p.answers, S7: on } })), []);

  const setPromo = useCallback(
    (channel: string, on: boolean) =>
      setS((p) => {
        const now = iso();
        const consents = on
          ? [...p.consents, { scope: "promo" as const, channel, textVersion: cfg.consentVersions.promo, grantedAt: now }]
          : p.consents.map((c) => (c.scope === "promo" && c.channel === channel && !c.revokedAt ? { ...c, revokedAt: now } : c));
        const S8 = new Set(Array.isArray(p.answers.S8) ? p.answers.S8 : []);
        if (on) S8.add(channel);
        else S8.delete(channel);
        return { ...p, consents, answers: { ...p.answers, S8: [...S8] } };
      }),
    [],
  );

  const ackReview = useCallback(
    (id: string) => setS((p) => ({ ...p, reviews: p.reviews.map((r) => (r.id === id && r.status === "open" ? { ...r, status: "acknowledged" as const } : r)) })),
    [],
  );
  const resolveReview = useCallback(
    (id: string, resolution: string) =>
      setS((p) => ({ ...p, reviews: p.reviews.map((r) => (r.id === id ? { ...r, status: "resolved" as const, resolution, resolvedAt: iso() } : r)) })),
    [],
  );
  const markSeen = useCallback(
    (ids: string[]) => setS((p) => (ids.every((i) => p.seenMilestones.includes(i)) ? p : { ...p, seenMilestones: [...new Set([...p.seenMilestones, ...ids])] })),
    [],
  );
  const loadSample = useCallback(() => setS(sampleMember()), []);
  const reset = useCallback(() => setS(empty), []);

  const value = useMemo<Trainer>(
    () => ({
      ...s,
      onboarded: !!s.onboardedAt,
      allSessions: [...s.sessions, ...past.map(fromBooking)],
      saveAnswers,
      finishOnboarding,
      setBaselineMode,
      addAssessment,
      addCheckin,
      setGoal,
      setPaidSuggestions,
      setPromo,
      setMedia,
      ackReview,
      resolveReview,
      markSeen,
      loadSample,
      reset,
    }),
    [s, past, saveAnswers, finishOnboarding, setBaselineMode, addAssessment, addCheckin, setGoal, setPaidSuggestions, setPromo, setMedia, ackReview, resolveReview, markSeen, loadSample, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTrainer() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTrainer outside provider");
  return v;
}

/** A past booking counts as attended in the demo; the booking system owns real attendance. */
function fromBooking(b: { id: string; date: string; time: string; service: string }): Session {
  return { id: b.id, date: b.date, time: b.time, service: b.service, status: "attended", source: "booking" };
}

/* ---------- Sample member (demo mode) ---------- */

function sampleMember(): Persisted {
  const now = new Date();
  const thisWeek = weekStart(now);
  const day = (weeksAgo: number, dow: number) => {
    const d = new Date(thisWeek);
    d.setDate(d.getDate() - 7 * weeksAgo + dow);
    return toISO(d);
  };
  // Sessions per week, oldest first (11 complete weeks + this week). Week 4 is an approved pause.
  const plan: number[][] = [[1, 3], [0, 3], [2], [1, 4], [], [0, 2, 4], [1, 3, 5], [0, 2, 4], [1, 3, 4], [0, 2, 4], [1, 3, 5], [1]];
  const sessions: Session[] = [];
  plan.forEach((days, i) =>
    days.forEach((dow, j) => {
      const date = day(plan.length - 1 - i, dow);
      if (fromISO(date) > now) return;
      sessions.push({ id: `ss${i}_${j}`, date, time: j % 2 ? "18:00" : "08:00", service: "reformer", status: "attended", source: "sample" });
    }),
  );
  sessions.push({ id: "ss_lc", date: day(8, 5), time: "08:00", service: "reformer", status: "late_cancel", source: "sample" });

  // Post-session check-ins: energy climbs, soreness and lower-back pain ease. A few are missing on purpose.
  const checkins: Checkin[] = sessions
    .filter((s) => s.status === "attended")
    .map((s, i, all): Checkin | null => {
      if (i % 6 === 4) return null;
      const t = i / Math.max(1, all.length - 1);
      const at = fromISO(s.date);
      at.setHours(Number(s.time.slice(0, 2)) + 1, 10);
      return {
        id: `sc${i}`,
        sessionId: s.id,
        at: at.toISOString(),
        timing: "post",
        energy: Math.min(5, Math.max(1, Math.round(2.6 + t * 2 + ((i % 3) - 1) * 0.4))),
        soreness: Math.max(0, Math.round(5.5 - t * 3.5 + ((i % 4) - 1.5) * 0.6)),
        pain: Math.max(0, Math.round(4.2 - t * 3.6 + (i % 5 === 2 ? 1 : 0))),
        painLocations: ["lowerBack"],
      };
    })
    .filter((c): c is Checkin => !!c);

  return {
    ...empty,
    sample: true,
    answers: {
      A1: "Maya Levi",
      A2: "1990-05-14",
      A5: "instagram",
      G1: ["strength", "posture", "stress"],
      G2: "posture",
      G3: "",
      G4: 4,
      H1: true,
      H2: ["lowerBack"],
      H3: 4,
      H4: "Lower-back tightness after long days at the desk.",
      H6: ["none"],
      H8: false,
      H9: true,
      E1: "lt6m",
      E2: ["mat"],
      E3: ["running"],
      E4: 3,
      E5: 2,
      S1: "3",
      S2: ["0", "2", "4"],
      S3: ["morning"],
      S4: ["reformer"],
      S5: ["push"],
      S7: true,
      S8: [],
    },
    stepsDone: 6,
    onboardedAt: new Date(day(11, 0)).toISOString(),
    baselineMode: "studio",
    goals: [
      { target: 2, from: day(11, 0) },
      { target: 3, from: day(6, 0) },
    ],
    pauses: [{ from: day(7, 0), to: day(7, 6) }],
    sessions,
    checkins,
    assessments: [
      { id: "sa0", date: day(11, 1), type: "baseline", source: "studio", ...versions, plankS: 45, balanceLeftS: 22, balanceRightS: 30, sitReachCm: -6, shoulder: 3, hip: 2 },
      { id: "sa1", date: day(5, 2), type: "reassessment", source: "studio", ...versions, plankS: 70, balanceLeftS: 35, balanceRightS: 38, sitReachCm: -1, shoulder: 4, hip: 3 },
    ],
    notes: [
      {
        id: "sn1",
        author: "Orit",
        at: new Date(day(1, 3)).toISOString(),
        visibility: "client",
        text: {
          he: "שליטה יפה מאוד בעבודת הרגליים השבוע. בפעם הבאה נוסיף קפיץ קל לגשר, ונמשיך לשמור על גב תחתון ארוך.",
          en: "Lovely control in footwork this week. Next time we'll add a light spring to the bridge and keep that lower back long.",
        },
      },
    ],
    consents: [{ scope: "health", textVersion: cfg.consentVersions.health, grantedAt: new Date(day(11, 0)).toISOString() }],
  };
}
