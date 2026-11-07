// The price list must follow the owner's rules (7 Nov 2026): a class is never under ₪50, a single class is ₪60,
// plans step the price down slowly, teens and soldiers never pay over ₪50. Run with `bun test src/`.
import { expect, test } from "bun:test";
import { CONCESSION_MAX, MAT_OFF_PER_CLASS, PRICE_FLOOR, allPlans, classPrices, perClass, planById, planClasses, priceFor, pricing, singleClass, teenSingleClass } from "./pricing";
import { packageById } from "./packages";

const price = (id: string) => planById(id)!;

test("a single class is ₪60; the floor is ₪50", () => {
  expect(singleClass.price).toBe(60);
  expect(PRICE_FLOOR).toBe(50);
  expect(CONCESSION_MAX).toBe(50);
});

test("monthly plans: 240 / 465 / 660 / 800 / 1000, a class at 60 → 58 → 55 → 50, valid one month", () => {
  const want = { m1x: [1, 240, 60], m2x: [2, 465, 58], m3x: [3, 660, 55], m4x: [4, 800, 50] } as const;
  for (const [id, [perWeek, ils, each]] of Object.entries(want)) {
    const p = price(id);
    expect([p.billingType, p.perWeek, p.price, p.validityMonths, p.active, p.approved]).toEqual(["monthly", perWeek, ils, 1, true, true]);
    expect(perClass(p, false)).toBe(each);
  }
  expect([price("munl").perWeek, price("munl").price, price("munl").validityMonths]).toEqual(["unlimited", 1000, 1]);
  expect(perClass(price("munl"), false)).toBeNull();
});

test("passes 5/10/15 at 300/550/750 = ₪60/55/50 a class, valid two months", () => {
  const want = { p5: [5, 300, 60], p10: [10, 550, 55], p15: [15, 750, 50] } as const;
  for (const [id, [sessions, ils, each]] of Object.entries(want)) {
    const p = price(id);
    expect([p.billingType, p.sessions, p.price, p.validityMonths]).toEqual(["pass", sessions, ils, 2]);
    expect(perClass(p, false)).toBe(each);
    expect(planClasses(p, true)).toBe(sessions); // no launch +1 any more
  }
});

test("no plan takes a class under the ₪50 floor, with or without a launch overlay", () => {
  for (const p of allPlans) {
    for (const launch of [false, true]) {
      const each = perClass(p, launch);
      if (each !== null) expect(each).toBeGreaterThanOrEqual(PRICE_FLOOR);
    }
    expect(p.launchPrice).toBeUndefined();
    expect(p.bonusSessions).toBeUndefined();
  }
});

test("the price per class only goes down as the plan grows (slow discount)", () => {
  const each = (ids: string[]) => ids.map((id) => perClass(price(id), false)!);
  for (const seq of [each(["m1x", "m2x", "m3x", "m4x"]), each(["p5", "p10", "p15"])]) {
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThanOrEqual(seq[i - 1]);
    expect(seq[0]).toBe(singleClass.price); // the smallest plan costs the same per class as a single class
  }
});

test("teens (and soldiers): ₪200 a month for 4 classes, single ₪50, never over ₪50 a class", () => {
  expect([price("teens").track, price("teens").price, price("teens").perWeek]).toEqual(["teens", 200, 1]);
  expect(teenSingleClass.price).toBe(50);
  expect(perClass(price("teens"), false)).toBeLessThanOrEqual(CONCESSION_MAX);
  expect(teenSingleClass.price).toBeLessThanOrEqual(CONCESSION_MAX);
});

test("monthly plans and passes sit on one ladder: the per-class price only depends on how many classes the plan holds", () => {
  const byCount = [...pricing.memberships, ...pricing.passes]
    .filter((p) => !p.track && p.sessions !== 1 && p.perWeek !== "unlimited")
    .map((p) => ({ id: p.id, n: planClasses(p, false)!, each: perClass(p, false)! }))
    .sort((a, b) => a.n - b.n);
  // 4, 5, 8, 10, 12, 15, 16 classes → 60, 60, 58, 55, 55, 50, 50
  expect(byCount.map((x) => [x.n, x.each])).toEqual([[4, 60], [5, 60], [8, 58], [10, 55], [12, 55], [15, 50], [16, 50]]);
});

test("Mat is ₪5 a class less than Reformer on every general plan; teens unchanged", () => {
  expect(MAT_OFF_PER_CLASS).toBe(5);
  expect(priceFor(singleClass, "mat")).toBe(55);
  const want = { m1x: 220, m2x: 425, m3x: 600, m4x: 720, munl: 900, p5: 275, p10: 500, p15: 675 } as const;
  for (const [id, ils] of Object.entries(want)) expect(priceFor(price(id), "mat")).toBe(ils);
  for (const p of allPlans) {
    if (p.track) expect(priceFor(p, "mat")).toBe(p.price);
    else if (perClass(p, false) !== null) expect(perClass(p, false)! - perClass(p, false, "mat")!).toBe(MAT_OFF_PER_CLASS);
    const each = perClass(p, false, "mat");
    if (each !== null) expect(each).toBeGreaterThanOrEqual(PRICE_FLOOR - MAT_OFF_PER_CLASS);
  }
  expect(classPrices("adult", false, "mat")).toEqual({ single: 55, plan: 45 });
});

test("closed groups: private group ₪375, event package ₪750", () => {
  expect([packageById("group")!.price, packageById("event")!.price]).toEqual([375, 750]);
});

test("class-price strip is derived from the list: adults ₪60 / from ₪50 with a plan, teens ₪50 / ₪50", () => {
  expect(classPrices("adult", false)).toEqual({ single: 60, plan: 50 });
  expect(classPrices("teen", false)).toEqual({ single: 50, plan: 50 });
});

test("every plan is in exactly one list and ids are unique", () => {
  const ids = [...pricing.memberships, ...pricing.passes].map((p) => p.id);
  expect(new Set(ids).size).toBe(ids.length);
});
