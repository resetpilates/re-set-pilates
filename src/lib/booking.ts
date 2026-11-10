import { siteConfig } from "../config/site";
import { roster } from "../config/team";

// Booking adapter. The UI only talks to `bookingProvider`; swap the mock for the
// in-house booking backend (Worker + Airtable/D1) once it serves live availability.
export type BookableService = "reformer" | "mat";

export interface ClassSlot {
  id: string; // `${service}_${date}_${HHmm}`
  service: BookableService;
  date: string; // YYYY-MM-DD (local)
  time: string; // HH:mm
  minutes: number;
  instructorId: string;
  capacity: number | null; // null = capacity not exposed (Mat: TODO_VERIFY)
  takenBeds: number[]; // bed indexes 0..4 (Reformer only)
  full: boolean;
}

export interface BookingProvider {
  isLive: boolean; // false => UI labels availability as sample data
  getSchedule(service: BookableService, date: string): Promise<ClassSlot[]>;
  getSlot(id: string): Promise<ClassSlot | null>;
}

// Planned week (owner, 21 Oct 2026): 50-minute classes on the hour with a 10-minute changeover.
// Adults train in the morning (08:00-12:00, Sun-Fri); the 17:00-21:00 evening slots (Sun-Thu) are for
// the teens group, booked by request for now. Mornings are Reformer until Mat instructors join;
// Mat has no slots yet, so its schedule tab is hidden. Final timetable is set closer to opening.
export const CLASS_MINUTES = 50;
const TEMPLATE: Record<BookableService, [time: string, instructor: number][]> = {
  reformer: [["08:00", 0], ["09:00", 0], ["10:00", 0], ["11:00", 0]],
  mat: [],
};
/** Formats with at least one class in the week (the others get no schedule tab). */
export const hasClasses = (service: BookableService) => TEMPLATE[service].length > 0;
const BED_ORDER = [2, 0, 4, 1, 3];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fromISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const TZ = "Asia/Jerusalem";
/** The studio's wall clock as a local Date: a visitor abroad sees the same "still ahead" classes as someone in Hod Hasharon. */
export const israelNow = () => {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(new Date())) p[x.type] = x.value;
  return new Date(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
};
export const slotStart = (slot: Pick<ClassSlot, "date" | "time">) => {
  const d = fromISO(slot.date);
  const [h, m] = slot.time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

function build(service: BookableService, date: string, time: string, instructor: number): ClassSlot {
  const id = `${service}_${date}_${time.replace(":", "")}`;
  const cap = service === "reformer" ? siteConfig.capacity.reformerBeds : null;
  const taken = cap ? hash(id) % (cap + 1) : 0;
  return {
    id,
    service,
    date,
    time,
    minutes: CLASS_MINUTES,
    instructorId: (roster[instructor] ?? roster[0]).id,
    capacity: cap,
    takenBeds: BED_ORDER.slice(0, taken),
    full: !!cap && taken >= cap,
  };
}

const mockProvider: BookingProvider = {
  isLive: false,
  async getSchedule(service, date) {
    const day = fromISO(date);
    if (day.getDay() === 6) return []; // closed Saturdays
    const now = israelNow();
    return TEMPLATE[service]
      .map(([time, ins]) => build(service, date, time, ins))
      .filter((s) => slotStart(s) > now);
  },
  async getSlot(id) {
    const [service, date, hhmm] = id.split("_");
    if ((service !== "reformer" && service !== "mat") || !date || !hhmm) return null;
    if (toISO(fromISO(date)) !== date) return null; // malformed or impossible date
    const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
    const row = TEMPLATE[service].find(([t]) => t === time);
    return row ? build(service, date, time, row[1]) : null;
  },
};

export const bookingProvider: BookingProvider = mockProvider;

export const upcomingDays = (count = 10) =>
  Array.from({ length: count }, (_, i) => {
    const d = israelNow();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    return d;
  });

/** The bed picked on a class page, kept for this tab until checkout holds it (it may pass through the pricing page). */
export function rememberBed(slotId: string, bed: number | null) {
  try {
    if (bed === null) sessionStorage.removeItem(`reset.bed.${slotId}`);
    else sessionStorage.setItem(`reset.bed.${slotId}`, String(bed));
  } catch {
    /* storage blocked: checkout falls back to any free bed */
  }
}
export function rememberedBed(slotId: string): number | null {
  try {
    const v = sessionStorage.getItem(`reset.bed.${slotId}`);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
