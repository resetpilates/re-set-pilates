import { expect, test } from "bun:test";
import { HEALTH_VERSION, clearanceReasons, guardianMissing, healthValid, needsClearance, validUntil, type HealthAnswers } from "./health";

const ok: HealthAnswers = { heart: false, chest: false, dizzy: false, asthma: false, family: false, supervised: false, chronic: false, pregnancy: "no", injury: false, adult: true };

test("all no: no doctor's approval needed", () => {
  expect(needsClearance(ok)).toBe(false);
});

test("any medical yes, pregnancy or a recent birth needs a doctor's approval; an injury alone does not", () => {
  expect(clearanceReasons({ ...ok, chest: true })).toEqual(["chest"]);
  expect(clearanceReasons({ ...ok, pregnancy: "pregnant" })).toEqual(["pregnant"]);
  expect(clearanceReasons({ ...ok, pregnancy: "postnatal", heart: true })).toEqual(["heart", "postnatal"]);
  expect(needsClearance({ ...ok, injury: true, injuryNote: "knee" })).toBe(false);
});

test("under 18 needs the parent's or guardian's name and phone", () => {
  expect(guardianMissing({ ...ok, adult: false })).toBe(true);
  expect(guardianMissing({ ...ok, adult: false, guardianName: "Dana", guardianPhone: "0501234567" })).toBe(false);
  expect(guardianMissing(ok)).toBe(false);
});

test("a declaration lasts a year and is asked again when the wording version changes", () => {
  const at = new Date(2026, 10, 11);
  const rec = { at: at.toISOString(), version: HEALTH_VERSION, validUntil: validUntil(at), clearance: false, answers: ok };
  expect(rec.validUntil).toBe("2027-11-11");
  expect(healthValid(rec, new Date(2027, 10, 10))).toBe(true);
  expect(healthValid(rec, new Date(2027, 10, 12))).toBe(false);
  expect(healthValid({ ...rec, version: "old" }, at)).toBe(false);
  expect(healthValid(undefined, at)).toBe(false);
});
