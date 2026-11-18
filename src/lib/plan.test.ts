// Plan balances, carry-over and the one-membership-at-a-time rule. Run with `bun test src/`.
import { expect, test } from "bun:test";
import { planById, type PricingItem } from "../config/pricing";
import { carryOver, checkPurchase, planCovers, planSeat, planUsage } from "./plan";
import type { Booking } from "./store";

const p5 = planById("p5")!; // 5 classes (no launch bonus any more)
const p10 = planById("p10")!;
const m2x = planById("m2x")!;
const munl = planById("munl")!;
const now = new Date(2026, 9, 19, 10); // Monday 19 Oct 2026
const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);
let n = 0;
const booking = (date: string, at: Date): Booking => ({ id: `b${++n}`, slotId: `reformer_${date}_${n}`, service: "reformer", date, time: "18:00", minutes: 50, instructorId: "orit", bed: null, remind: false, bookedAt: iso(at) });
const current = (plan: PricingItem, bookings: Booking[], start: Date, carry = 0) => ({ plan, bookings, planStart: iso(start), carry });

test("2 classes left on a pass + a new 5-class pass = 7", () => {
  const start = daysAgo(20);
  const used = [1, 2, 3].map((i) => booking(`2026-10-0${i + 1}`, start)); // 3 of 5 used → 2 left
  expect(planUsage(p5, used, now, iso(start)).left).toBe(2);
  const check = checkPurchase(p5, current(p5, used, start), now);
  expect(check).toEqual({ ok: true, carry: 2 });
  // after buying: 5 + 2 carried
  expect(planUsage(p5, used, now, iso(now), 2).cap).toBe(7);
  expect(planUsage(p5, used, now, iso(now), 2).left).toBe(7);
});

test("a monthly plan bought mid-week ignores classes booked before it (on the old pass)", () => {
  const old = [booking("2026-10-18", daysAgo(3)), booking("2026-10-20", daysAgo(2))]; // two classes this week, booked on the previous pass
  const m1x = planById("m1x")!;
  const u = planUsage(m1x, old, now, iso(now));
  expect(u.used).toBe(0);
  expect(u.left).toBe(1);
});

test("an expired pass carries nothing", () => {
  const start = daysAgo(70); // passes are valid 2 months
  expect(checkPurchase(p10, current(p5, [], start), now)).toEqual({ ok: true, carry: 0 });
});

test("the same monthly membership can't be bought twice while it runs; renewing in its last days is fine", () => {
  const check = checkPurchase(m2x, current(m2x, [], daysAgo(5)), now);
  expect(check.ok).toBe(false);
  expect(!check.ok && check.reason).toBe("active");
  expect(checkPurchase(m2x, current(m2x, [], daysAgo(29)), now).ok).toBe(true);
});

test("switching from a weekly membership to a pass carries the unused classes", () => {
  const start = daysAgo(1); // bought yesterday: about 4–5 weeks left, 2 a week
  const check = checkPurchase(p10, current(m2x, [booking("2026-10-20", now)], start), now);
  expect(check.ok).toBe(true);
  const carry = check.ok ? check.carry : 0;
  expect(carry).toBeGreaterThanOrEqual(7);
  expect(carry).toBeLessThanOrEqual(10);
});

test("unlimited carries nothing (there is no count to move)", () => {
  expect(carryOver(munl, [], iso(daysAgo(3)), 0, now)).toBe(0);
});

test("the same plan bought again within minutes asks to confirm, then carries", () => {
  const start = new Date(now.getTime() - 2 * 60_000);
  const first = checkPurchase(p5, current(p5, [], start), now);
  expect(first).toEqual({ ok: false, reason: "repeat", carry: 5 });
  expect(checkPurchase(p5, current(p5, [], start), now, true)).toEqual({ ok: true, carry: 5 });
});

test("carried classes on a weekly membership cover bookings above the weekly cap", () => {
  const start = iso(daysAgo(1));
  const week = ["2026-10-19", "2026-10-20", "2026-10-21"].map((d) => booking(d, now)); // 3 this week, cap 2
  const u = planUsage(m2x, week, now, start, 2);
  expect(u.used).toBe(3);
  expect(u.extra).toBe(1); // one carried class used for the 3rd booking
  expect(u.left).toBe(1);
});

test("each class knows its place in the plan: 2 of 5 on a pass, 1 of 2 this week on a membership", () => {
  const start = daysAgo(5);
  const visitor = booking("2026-10-12", daysAgo(9)); // booked before the pass was bought
  const a = booking("2026-10-20", daysAgo(4));
  const b = booking("2026-10-21", daysAgo(3));
  const all = [visitor, a, b];
  expect(planSeat(p5, all, visitor, iso(start))).toBeNull();
  expect(planSeat(p5, all, a, iso(start))).toEqual({ n: 1, cap: 5 });
  expect(planSeat(p5, all, b, iso(start))).toEqual({ n: 2, cap: 5 });
  expect(planUsage(p5, all, now, iso(start)).left).toBe(3);
  // carried classes raise the pass total
  expect(planSeat(p5, all, b, iso(start), 2)).toEqual({ n: 2, cap: 7 });
  // membership: counted per week, in class order
  const nextWeek = booking("2026-10-27", daysAgo(1));
  expect(planSeat(m2x, [...all, nextWeek], b, iso(start))).toEqual({ n: 2, cap: 2 });
  expect(planSeat(m2x, [...all, nextWeek], nextWeek, iso(start))).toEqual({ n: 1, cap: 2 });
  expect(planSeat(munl, all, a, iso(start))).toBeNull();
});

test("a single class bought on its own never uses the plan; classes are numbered in class order", () => {
  const start = daysAgo(5);
  const late = booking("2026-10-22", daysAgo(4)); // booked first, takes place last
  const early = booking("2026-10-20", daysAgo(3));
  const single = { ...booking("2026-10-21", daysAgo(2)), single: true };
  const all = [late, early, single];
  expect(planUsage(p5, all, now, iso(start)).left).toBe(3);
  expect(planSeat(p5, all, single, iso(start))).toBeNull();
  expect(planSeat(p5, all, early, iso(start))).toEqual({ n: 1, cap: 5 });
  expect(planSeat(p5, all, late, iso(start))).toEqual({ n: 2, cap: 5 });
  expect(carryOver(p5, all, iso(start), 0, now)).toBe(3);
});

test("a membership that does not renew ends on its last day; a renewing one keeps going", () => {
  const start = daysAgo(40);
  expect(planUsage(m2x, [], now, iso(start))).toMatchObject({ left: 0, expired: true });
  expect(planUsage(munl, [], now, iso(start))).toMatchObject({ left: 0, expired: true });
  expect(planUsage(m2x, [], now, iso(start), 0, true)).toMatchObject({ left: 2, expired: false });
});

test("a teens plan never covers the adult schedule; a Mat plan covers Mat only", () => {
  expect(planCovers(planById("teens")!, null, "reformer")).toBe(false);
  expect(planCovers(p5, "mat", "reformer")).toBe(false);
  expect(planCovers(p5, "reformer", "reformer")).toBe(true);
  expect(planCovers(p5, undefined, "mat")).toBe(true);
});
