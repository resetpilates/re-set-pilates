import { expect, test } from "bun:test";
import { HEALTH_VERSION, clearanceReasons, guardianMissing, healthStatus, healthValid, needsClearance, validUntil, type HealthAnswers } from "./health";

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

test("a declaration lasts a year on the studio's calendar, in any time zone, and is asked again when the wording changes", () => {
  const at = new Date("2026-11-11T10:00:00Z"); // 12:00 in Israel
  const rec = { at: at.toISOString(), version: HEALTH_VERSION, validUntil: validUntil(at), clearance: false, answers: ok };
  expect(rec.validUntil).toBe("2027-11-11");
  expect(healthValid(rec, new Date("2027-11-11T20:00:00Z"))).toBe(true); // 22:00 in Israel on the last day
  expect(healthValid(rec, new Date("2027-11-11T22:30:00Z"))).toBe(false); // 00:30 in Israel the next day (still the 11th in UTC)
  expect(validUntil(new Date("2026-11-10T22:30:00Z"))).toBe("2027-11-11"); // 00:30 on 11 Nov in Israel counts as the 11th
  expect(healthValid({ ...rec, version: "old" }, at)).toBe(false);
  expect(healthValid(undefined, at)).toBe(false);
});

test("a declaration saved offline does not count until it has been sent; status says where the device stands", () => {
  const at = new Date("2026-11-11T10:00:00Z");
  const rec = { at: at.toISOString(), version: HEALTH_VERSION, validUntil: validUntil(at), clearance: false, answers: ok };
  expect(healthStatus(rec, at)).toBe("valid");
  expect(healthValid({ ...rec, queued: true }, at)).toBe(false);
  expect(healthStatus({ ...rec, queued: true }, at)).toBe("sending");
  expect(healthStatus({ ...rec, version: "old" }, at)).toBe("renew");
  expect(healthStatus(undefined, at)).toBe("missing");
});
