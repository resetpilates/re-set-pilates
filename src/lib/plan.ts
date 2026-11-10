import type { PricingItem } from "../config/pricing";
import { siteConfig } from "../config/site";
import { fromISO } from "./booking";
import type { Booking } from "./store";

export interface PlanUsage {
  /** Classes already booked in the period that counts (this week for monthly plans, since purchase for passes). */
  used: number;
  /** Classes allowed in that period; null = unlimited. */
  cap: number | null;
  /** Classes still available; Infinity when unlimited, 0 once a pass has expired. */
  left: number;
  /** A pass whose validity ended before `forDate`. */
  expired: boolean;
  /** Carried-over classes still unused (monthly plans: usable on top of the weekly cap until the plan ends). */
  extra: number;
}

/** Sunday-to-Saturday week (Israeli week) that contains `d`. */
export function weekOf(d: Date) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** Last day a plan bought on `planStart` is valid (monthly plans renew; passes expire). */
export function planEnd(plan: PricingItem, planStart: string | null) {
  const end = planStart ? new Date(planStart) : new Date();
  end.setMonth(end.getMonth() + plan.validityMonths);
  return end;
}

/** When a booking was made; older saved bookings only carry it in their `b<ms>` id. */
const bookedAt = (b: Booking) => (b.bookedAt ? Date.parse(b.bookedAt) : Number(b.id.slice(1)) || 0);

/**
 * How much of the plan is used, measured for the week of `forDate` (monthly plans) or since the plan was bought (passes).
 * `carry` = classes carried over from the previous plan when this one was bought (see `carryOver`).
 * Real balances come from the booking backend once connected; this keeps the demo honest in the meantime.
 */
export function planUsage(plan: PricingItem, bookings: Booking[], forDate: Date, planStart: string | null, carry = 0): PlanUsage {
  const start = planStart ? Date.parse(planStart) : 0;
  // Only classes booked on this plan count, so a new purchase starts from zero
  const mine = bookings.filter((b) => bookedAt(b) >= start);
  const expired = forDate >= planEnd(plan, planStart);
  if (plan.billingType === "monthly") {
    const used = countInWeek(mine, forDate);
    if (plan.perWeek === "unlimited") return { used, cap: null, left: Infinity, expired: false, extra: 0 };
    const cap = plan.perWeek as number;
    // Carried classes cover bookings above the weekly cap, in any week of the plan
    const extra = expired ? 0 : Math.max(0, carry - overflow(mine, cap));
    return { used, cap, left: Math.max(0, cap - used) + extra, expired: false, extra };
  }
  const cap = (plan.sessions ?? 0) + (siteConfig.flags.launchPricing ? (plan.bonusSessions ?? 0) : 0) + carry;
  const used = mine.length;
  return { used, cap, left: expired ? 0 : Math.max(0, cap - used), expired, extra: 0 };
}

/** Bookings above the weekly cap, summed over every week (each one used a carried class). */
function overflow(bookings: Booking[], cap: number) {
  const perWeek = new Map<number, number>();
  for (const b of bookings) {
    const k = weekOf(fromISO(b.date)).start.getTime();
    perWeek.set(k, (perWeek.get(k) ?? 0) + 1);
  }
  let n = 0;
  perWeek.forEach((c) => (n += Math.max(0, c - cap)));
  return n;
}

function countInWeek(bookings: Booking[], d: Date) {
  const { start, end } = weekOf(d);
  return bookings.filter((b) => {
    const day = fromISO(b.date);
    return day >= start && day < end;
  }).length;
}

/**
 * Classes still unused on the current plan at `now`, which move to the next purchase
 * (2 left on a pass + a new 5-class pass = 7 classes).
 * Pass: its balance. Weekly membership: what is left of this week, each remaining week until it ends, plus unused
 * carried classes. Unlimited: nothing countable. An expired plan carries nothing.
 */
export function carryOver(plan: PricingItem, bookings: Booking[], planStart: string | null, carry: number, now = new Date()): number {
  const end = planEnd(plan, planStart);
  if (now >= end) return 0;
  const u = planUsage(plan, bookings, now, planStart, carry);
  if (plan.billingType === "pass") return u.left;
  if (u.cap === null) return 0;
  const cap = u.cap;
  let left = u.extra;
  for (let w = weekOf(now).start; w < end; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
    // the current week counts from today; later weeks count in full minus classes already booked in them
    left += Math.max(0, cap - countInWeek(bookings, w));
  }
  return left;
}

/** Days before a monthly membership ends from which buying the same one again (renewing) is allowed. */
export const RENEW_DAYS = 3;
/** The same plan bought again within this many minutes asks "buy again?" first (back button, double tap). */
export const REPEAT_MINUTES = 10;

export type PurchaseCheck =
  | { ok: true; carry: number }
  /** The same monthly membership is already active: buying it again would pay twice for the same month. */
  | { ok: false; reason: "active"; until: Date }
  /** The same plan was bought a moment ago; the buyer must confirm it is a second purchase. */
  | { ok: false; reason: "repeat"; carry: number };

export interface CurrentPlan {
  plan: PricingItem;
  bookings: Booking[];
  planStart: string | null;
  carry: number;
}

/** Can `next` be bought now, and how many classes carry over from the current plan? */
export function checkPurchase(next: PricingItem, current: CurrentPlan | null, now = new Date(), confirmedRepeat = false): PurchaseCheck {
  if (!current) return { ok: true, carry: 0 };
  const { plan, bookings, planStart, carry: prev } = current;
  const end = planEnd(plan, planStart);
  if (now >= end) return { ok: true, carry: 0 };
  const carry = carryOver(plan, bookings, planStart, prev, now);
  if (plan.id === next.id && plan.billingType === "monthly" && end.getTime() - now.getTime() > RENEW_DAYS * 864e5) return { ok: false, reason: "active", until: end };
  const since = planStart ? now.getTime() - Date.parse(planStart) : Infinity;
  if (plan.id === next.id && since < REPEAT_MINUTES * 60_000 && !confirmedRepeat) return { ok: false, reason: "repeat", carry };
  return { ok: true, carry };
}
