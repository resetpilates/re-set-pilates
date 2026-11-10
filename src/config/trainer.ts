// AI trainer / progress profile settings (spec: AI-TRAINER-SPEC.md).
// Every number here is a PROPOSED default from the spec. The studio must approve them
// (spec section 10): keep `approved: false` until Orit signs off.

export const trainerConfig = {
  approved: false,
  /** Studio-local week. Israel weeks run Sunday → Saturday. */
  weekStartsOn: 0 as 0 | 1,
  timeZone: "Asia/Jerusalem",

  consistency: {
    graphWeeks: 12,
    streakMetPct: 0.8, // a week counts toward a streak at ≥ 80% of goal
    reviewBelowPct: 0.6, // review signal: under 60% of goal…
    reviewWeeks: 3, // …for 3 complete weeks in a row
  },

  /** Graph 3 / composite control score: display targets, NOT clinical norms. */
  assessment: {
    protocolVersion: "p1",
    normalizationVersion: "n1",
    plankFullSec: 120,
    balanceCapSec: 60,
    reachMinCm: -15,
    reachMaxCm: 15,
    reassessEveryWeeks: [4, 6] as const,
    selfTestAllowed: true, // TODO_VERIFY: open decision: may clients self-test at home?
    improvementPoints: 10, // "re-assessment improvement" milestone
  },

  safety: {
    painAlertAt: 7, // pain ≥ 7 in any check-in → trainer review
    painRisingSessions: 3, // pain higher than the session before, 3 sessions running
    sorenessAlertAt: 8, // soreness ≥ 8…
    sorenessAlertSessions: 2, // …two sessions in a row → no automatic load increases
    onboardingRedFlags: ["pregnancy", "postpartum", "osteoporosis", "herniated"],
    onboardingPainAt: 7,
  },

  milestones: { ruleVersion: "m1", sessionCounts: [10, 25, 50, 100], streaks: [4, 12] },

  /**
   * Personalised paid course/package cards need fresh catalog + entitlement data from the
   * in-house booking/commerce system. Until that sync exists the dashboard shows a plain
   * link to the price list instead: no inferred prices, eligibility or urgency.
   */
  paidCards: { enabled: false, cooldownDays: 14, dismissDays: 30 },

  /** Consent texts are versioned; bump the version whenever the wording changes. */
  consentVersions: { health: "health-v0-draft", promo: "promo-v0-draft", media: "media-v0-draft" },
};

/**
 * Included resources shown on the dashboard. These are SAMPLE titles: Orit has not
 * supplied or reviewed any content yet. Replace, add a real link, and set `approved: true`.
 */
export interface Resource {
  id: string;
  kind: "video" | "guide";
  titleHe: string;
  titleEn: string;
  minutes: number;
  url: string;
  approved: boolean;
}
export const resources: Resource[] = [
  { id: "r-breath", kind: "video", titleHe: "נשימה ברפורמר: 5 דקות לפני השיעור", titleEn: "Reformer breathing: 5 minutes before class", minutes: 5, url: "TODO_VERIFY", approved: false },
  { id: "r-posture", kind: "guide", titleHe: "יציבה ליד השולחן: 4 תרגילים קטנים", titleEn: "Desk posture: 4 small exercises", minutes: 4, url: "TODO_VERIFY", approved: false },
  { id: "r-selftest", kind: "video", titleHe: "איך עושים את מבחן הבסיס בבית", titleEn: "How to do the baseline test at home", minutes: 6, url: "TODO_VERIFY", approved: false },
];
