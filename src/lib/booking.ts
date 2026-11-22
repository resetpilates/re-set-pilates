import { siteConfig } from "../config/site";
import { scheduleConfig } from "../config/schedule";
import { roster } from "../config/team";

// Booking adapter. The UI only talks to `bookingProvider`: the published timetable (config/schedule.ts);
// who is on which bed comes from the Worker's roster (lib/roster.ts).
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

// 50-minute classes on the hour with a 10-minute changeover. The days and times are the studio's latest poster,
// kept in config/schedule.ts. Mat has no classes yet, so its schedule tab is hidden.
export const CLASS_MINUTES = 50;
const classesOn = (service: BookableService, date: string) => {
  if (date < scheduleConfig.startsOn) return [];
  const day = fromISO(date).getDay();
  return scheduleConfig.week.filter((c) => c.service === service && c.day === day).sort((a, b) => a.time.localeCompare(b.time));
};
/** Formats with at least one class in the week (the others get no schedule tab). */
export const hasClasses = (service: BookableService) => scheduleConfig.week.some((c) => c.service === service);

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

// Beds start empty here: the real bookings come from the studio's roster (lib/roster.ts) and fill them in.
function build(service: BookableService, date: string, time: string, instructor: string): ClassSlot {
  return {
    id: `${service}_${date}_${time.replace(":", "")}`,
    service,
    date,
    time,
    minutes: CLASS_MINUTES,
    instructorId: (roster.find((p) => p.id === instructor) ?? roster[0]).id,
    capacity: service === "reformer" ? siteConfig.capacity.reformerBeds : null,
    takenBeds: [],
    full: false,
  };
}

const timetableProvider: BookingProvider = {
  isLive: true, // the studio's published timetable, with real bookings from the roster
  async getSchedule(service, date) {
    const now = israelNow();
    return classesOn(service, date)
      .map((c) => build(service, date, c.time, c.instructor))
      .filter((s) => slotStart(s) > now);
  },
  async getSlot(id) {
    const [service, date, hhmm] = id.split("_");
    if ((service !== "reformer" && service !== "mat") || !date || !hhmm) return null;
    if (toISO(fromISO(date)) !== date) return null; // malformed or impossible date
    const time = `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
    const row = classesOn(service, date).find((c) => c.time === time);
    return row ? build(service, date, time, row.instructor) : null;
  },
};

export const bookingProvider: BookingProvider = timetableProvider;

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
