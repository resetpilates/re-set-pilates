/**
 * PRICE LIST — single source of truth for the whole site (pricing page, Home cards, checkout, receipts, chat, schema.org).
 * Owner's rules (7 Nov 2026):
 *
 *   A class is never cheaper than ₪50 and a single class is ₪60. Plans discount a class step by step, never below the floor:
 *     Monthly (valid one month):  1×/wk ₪240 (₪60/class) · 2×/wk ₪465 (₪58) · 3×/wk ₪660 (₪55) · 4×/wk ₪835 (₪52) · Unlimited ₪1000
 *     Passes  (valid two months): 5 = ₪300 (₪60/class) · 10 = ₪550 (₪55/class) · 15 = ₪750 (₪50/class)
 *   Teens and active-duty soldiers never pay more than ₪50 a class, single or with a plan: teens ₪200/month (4 classes), single ₪50.
 *   Closed groups: private group ₪375, event package ₪750 (`packages.ts`). Gift cards sell the passes (₪300 / ₪550 / ₪750).
 *
 * There is no launch overlay any more (it took a class under the floor): `launchPrice` / `bonusSessions` stay supported by the
 * code but no item carries them, and `siteConfig.flags.launchPricing` is off. The Worker charges what Airtable *Plans & Prices*
 * says, so that table must carry the same numbers (see LAUNCH-CHECKLIST.md "Pricing").
 */
import { siteConfig } from "./site";

/** Which class a membership or pass is for. Reformer and Mat cost the same; the buyer picks one at checkout. */
export type ClassKind = "reformer" | "mat";
export const classKinds: ClassKind[] = ["reformer", "mat"];
export const isClassKind = (v: unknown): v is ClassKind => v === "reformer" || v === "mat";

export interface PricingItem {
  id: string;
  billingType: "monthly" | "pass";
  /** "teens": the girls' weekly group plan — sold on its own tab, not in the general list, and not tied to a class kind. */
  track?: "teens";
  perWeek?: number | "unlimited";
  sessions?: number;
  price: number;
  launchPrice?: number; // optional launch overlay on a monthly plan (unused now: it must never take a class under PRICE_FLOOR)
  bonusSessions?: number; // optional launch overlay on a pass, +N classes (unused now, same reason)
  currency: "ILS";
  popular?: boolean;
  tone: "cream" | "sand" | "ink"; // membership card colour, same on pricing and the member's profile
  validityMonths: number;
  active: boolean;
  approved: boolean; // false => shown with a "pending approval" note (or hidden)
}

/** A class never costs less than this, on any plan, for anyone (owner's rule). The tests pin every plan to it. */
export const PRICE_FLOOR = 50;
/** The teens / active-duty soldiers rate: a class is never more than this for them, single or with a plan. */
export const CONCESSION_MAX = 50;

export const pricing: { memberships: PricingItem[]; passes: PricingItem[] } = {
  memberships: [
    // 4 classes a month per weekly slot: ₪60 → ₪58 → ₪55 → ₪52 a class, then Unlimited.
    { id: "m1x", tone: "cream", billingType: "monthly", perWeek: 1, price: 240, currency: "ILS", validityMonths: 1, active: true, approved: true },
    { id: "m2x", tone: "sand", billingType: "monthly", perWeek: 2, price: 465, currency: "ILS", validityMonths: 1, active: true, approved: true },
    { id: "m3x", tone: "sand", billingType: "monthly", perWeek: 3, price: 660, currency: "ILS", validityMonths: 1, popular: true, active: true, approved: true },
    { id: "m4x", tone: "ink", billingType: "monthly", perWeek: 4, price: 835, currency: "ILS", validityMonths: 1, active: true, approved: true },
    { id: "munl", tone: "ink", billingType: "monthly", perWeek: "unlimited", price: 1000, currency: "ILS", validityMonths: 1, active: true, approved: true },
    // Teens (girls 12-17): once a week, 4 sessions a month, up to 5 girls, ₪50 a class (the teens / soldiers rate).
    { id: "teens", track: "teens", tone: "cream", billingType: "monthly", perWeek: 1, price: 200, currency: "ILS", validityMonths: 1, active: true, approved: true },
  ],
  passes: [
    // One class, Reformer or Mat, adults. Shown on every class page. (Airtable Plans & Prices row `single` must match.)
    { id: "single", tone: "cream", billingType: "pass", sessions: 1, price: 60, currency: "ILS", validityMonths: 1, active: true, approved: true },
    // One class for the teens group (Airtable row `tsingle`).
    { id: "tsingle", track: "teens", tone: "cream", billingType: "pass", sessions: 1, price: 50, currency: "ILS", validityMonths: 1, active: true, approved: true },
    { id: "p5", tone: "cream", billingType: "pass", sessions: 5, price: 300, currency: "ILS", validityMonths: 2, active: true, approved: true },
    { id: "p10", tone: "sand", billingType: "pass", sessions: 10, price: 550, currency: "ILS", validityMonths: 2, popular: true, active: true, approved: true },
    { id: "p15", tone: "ink", billingType: "pass", sessions: 15, price: 750, currency: "ILS", validityMonths: 2, active: true, approved: true },
  ],
};

export const allPlans = [...pricing.memberships, ...pricing.passes];
export const planById = (id: string) => allPlans.find((p) => p.id === id);
/** The general Reformer/Mat list (teens has its own tab). */
export const generalPlans = (list: PricingItem[]) => list.filter((p) => !p.track);
export const teensPlan = pricing.memberships.find((p) => p.track === "teens");
export const singleClass = pricing.passes.find((p) => p.id === "single")!;
export const teenSingleClass = pricing.passes.find((p) => p.id === "tsingle")!;

/** Classes a plan gives in its period: weekly plans × 4 weeks, passes incl. the launch +1. null = unlimited. */
export const planClasses = (p: PricingItem, launch = siteConfig.flags.launchPricing): number | null => {
  if (p.billingType === "monthly") return p.perWeek === "unlimited" ? null : (p.perWeek as number) * 4;
  return (p.sessions ?? 0) + (launch ? (p.bonusSessions ?? 0) : 0);
};
/** What one class costs inside a plan (₪, rounded), e.g. 5-pass ₪60, 15-pass ₪50, launch 15+1 ₪47. null = unlimited. */
export const perClass = (p: PricingItem, launch = siteConfig.flags.launchPricing): number | null => {
  const n = planClasses(p, launch);
  if (!n) return null;
  const price = launch && p.launchPrice ? p.launchPrice : p.price;
  return Math.round(price / n);
};
/** The cheapest per-class price among the visible plans of a track ("with a plan from ₪50"). */
const bestPerClass = (plans: PricingItem[], launch: boolean) =>
  Math.min(...plans.filter((p) => p.active && p.approved && p.sessions !== 1).map((p) => perClass(p, launch) ?? Infinity));

/**
 * Class-price strip (schedule, class rows, service pages): what one class costs on its own and, at best, with a plan.
 * Adults: single ₪60, with a plan from ₪50 (15-pass). Teens and soldiers: ₪50 either way.
 * The "with a plan" figure is derived from the price list above so it can never drift from it.
 */
export const intro = { active: true };
export const classPrices = (who: "adult" | "teen", launch = siteConfig.flags.launchPricing) =>
  who === "teen"
    ? { single: teenSingleClass.price, plan: (teensPlan && perClass(teensPlan, launch)) || CONCESSION_MAX }
    : { single: singleClass.price, plan: bestPerClass(allPlans.filter((p) => !p.track), launch) };
