import { expect, test } from "bun:test";
import { bookingProvider, hasClasses } from "./booking";

// The timetable is the trial week poster (22–26 Nov 2026), repeated weekly: config/schedule.ts.
const at = (date: string, time: string) => bookingProvider.getSlot(`reformer_${date}_${time.replace(":", "")}`);

test("the poster's classes exist, taught by Shenhav, with all five beds open until the roster says otherwise", async () => {
  const want: Record<string, string[]> = {
    "2026-11-22": ["09:00", "10:00"], // Sunday
    "2026-11-24": ["09:00", "18:00", "19:00"], // Tuesday
    "2026-11-25": ["09:00", "10:00"], // Wednesday
    "2026-11-26": ["09:00", "10:00"], // Thursday
  };
  for (const [date, times] of Object.entries(want))
    for (const time of times) {
      const s = await at(date, time);
      expect(s?.instructorId).toBe("shenhav");
      expect(s?.capacity).toBe(5);
      expect(s?.takenBeds).toEqual([]);
      expect(s?.full).toBe(false);
    }
});

test("no classes on Monday, Friday or Saturday, at times not on the poster, or before the first day", async () => {
  expect(await at("2026-11-23", "09:00")).toBeNull(); // Monday
  expect(await at("2026-11-27", "09:00")).toBeNull(); // Friday
  expect(await at("2026-11-28", "09:00")).toBeNull(); // Saturday
  expect(await at("2026-11-22", "08:00")).toBeNull();
  expect(await at("2026-11-24", "10:00")).toBeNull(); // Tuesday has no 10:00
  expect(await at("2026-11-15", "09:00")).toBeNull(); // a Sunday before the trial week
});

test("the week repeats until a new poster replaces it; Mat has no classes yet", async () => {
  expect((await at("2026-12-01", "19:00"))?.instructorId).toBe("shenhav"); // the Tuesday after
  expect(hasClasses("reformer")).toBe(true);
  expect(hasClasses("mat")).toBe(false);
});
