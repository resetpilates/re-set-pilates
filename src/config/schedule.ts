// The class timetable: the week on the studio's latest poster. Replace `week` (and `source`) when a new poster comes in.
// Every page, class card, booking and calendar file reads it through src/lib/booking.ts; never type class times anywhere else.
import type { BookableService } from "../lib/booking";

export interface WeeklyClass {
  /** Studio weekday: 0 = Sunday … 5 = Friday (Saturday is closed). */
  day: 0 | 1 | 2 | 3 | 4 | 5;
  time: string; // HH:mm, studio time (Asia/Jerusalem)
  service: BookableService;
  instructor: string; // a Person id from config/team.ts
}

export const scheduleConfig = {
  /** Which poster this timetable comes from, so the next update knows what it replaces. */
  source: "Trial week poster, 22–26 Nov 2026 (owner, 21 Nov 2026)",
  /** No classes are shown or bookable before this date. */
  startsOn: "2026-11-22",
  /** The week repeats every week from `startsOn` until a new poster replaces it (owner, 21 Nov 2026). */
  week: [
    { day: 0, time: "09:00", service: "reformer", instructor: "shenhav" },
    { day: 0, time: "10:00", service: "reformer", instructor: "shenhav" },
    { day: 2, time: "09:00", service: "reformer", instructor: "shenhav" },
    { day: 2, time: "18:00", service: "reformer", instructor: "shenhav" },
    { day: 2, time: "19:00", service: "reformer", instructor: "shenhav" },
    { day: 3, time: "09:00", service: "reformer", instructor: "shenhav" },
    { day: 3, time: "10:00", service: "reformer", instructor: "shenhav" },
    { day: 4, time: "09:00", service: "reformer", instructor: "shenhav" },
    { day: 4, time: "10:00", service: "reformer", instructor: "shenhav" },
  ] as WeeklyClass[],
  /**
   * Trial week (poster: "אימון ניסיון במתנה"): a visitor without a plan books her first class free, one per person.
   * The bed is reserved straight away (Airtable booking, via "Free trial"); the Worker refuses a second trial.
   * Set to false to end the offer: class pages go back to single class / plans.
   */
  freeTrial: true,
};
