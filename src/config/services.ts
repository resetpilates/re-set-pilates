export type ServiceId = "reformer" | "mat" | "private" | "duo" | "women" | "teens" | "groups";

export interface ServiceConfig {
  id: ServiceId;
  slug: string;
  image: string; // photo slot: rendered inside the real studio room, Orit as the instructor (17 Nov 2026); replace with shoot photos when there are any
  pos: string; // object-position
  thumb: string; // 240px square-ish exercise photo for tabs and class cards (ex-*-sm.jpg)
  thumbPos?: string;
  bookable: boolean; // bookable in the schedule vs. by request
  capacity?: number;
  minutes: number;
  approved: boolean; // launch-approved to present as bookable
}

export const services: ServiceConfig[] = [
  { id: "reformer", slug: "reformer-groups", image: "/assets/class/group.webp", pos: "50% 50%", thumb: "/assets/class/tab-reformer-sm.webp", bookable: true, capacity: 5, minutes: 50, approved: true },
  { id: "mat", slug: "mat-pilates", image: "/assets/class/mat.webp", pos: "50% 50%", thumb: "/assets/class/tab-mat-sm.webp", bookable: false, minutes: 50, approved: true }, // by request until Mat instructors join (then true + slots in lib/booking.ts)
  { id: "private", slug: "private-1to1", image: "/assets/class/private.webp", pos: "50% 50%", thumb: "/assets/class/private-sm.webp", bookable: false, minutes: 50, approved: true },
  { id: "duo", slug: "duo", image: "/assets/class/duo.webp", pos: "50% 50%", thumb: "/assets/class/duo-sm.webp", bookable: false, minutes: 50, approved: true },
  { id: "women", slug: "women-only", image: "/assets/class/women.webp", pos: "50% 50%", thumb: "/assets/class/women-sm.webp", bookable: false, minutes: 50, approved: false },
  // Teens (girls 12-17): a fixed weekly group, sold as its own monthly plan (pricing.ts: "teens"). Photo is a stand-in until the shoot.
  { id: "teens", slug: "teens", image: "/assets/class/teens.webp", pos: "50% 50%", thumb: "/assets/class/teens-sm.webp", bookable: false, capacity: 5, minutes: 50, approved: true },
  // Closed groups: the studio closes for your group. Two packages (packages.ts): private group and event.
  { id: "groups", slug: "closed-groups", image: "/assets/class/groups.webp", pos: "50% 50%", thumb: "/assets/class/groups-sm.webp", bookable: false, capacity: 5, minutes: 50, approved: true },
];

export const serviceById = (id: string) => services.find((s) => s.id === id);
export const serviceBySlug = (slug: string) => services.find((s) => s.slug === slug);
