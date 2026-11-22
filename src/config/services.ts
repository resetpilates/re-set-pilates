export type ServiceId = "reformer" | "mat" | "private" | "duo" | "women" | "teens" | "groups";

export interface ServiceConfig {
  id: ServiceId;
  slug: string;
  image: string; // photo slot: rendered inside the real studio room, Orit as the instructor (17 Nov 2026); replace with shoot photos when there are any
  pos: string; // object-position
  thumb: string; // small square-ish photo for tabs and class cards (assets/class/*-sm.webp)
  thumbPos?: string;
  bookable: boolean; // bookable in the schedule vs. by request
  capacity?: number;
  minutes: number;
  approved: boolean; // launch-approved to present as bookable
}

// Services photos show the studio without people (owner, 22 Nov 2026): the empty room, the equipment and the props, in the
// style of the single Reformer under the arch. Rendered or real stills of the space; replace with shoot photos when there are any.
export const services: ServiceConfig[] = [
  { id: "reformer", slug: "reformer-groups", image: "/assets/real/room.webp", pos: "50% 55%", thumb: "/assets/real/room-sm.webp", bookable: true, capacity: 5, minutes: 50, approved: true },
  { id: "mat", slug: "mat-pilates", image: "/assets/real/flatlay.webp", pos: "50% 45%", thumb: "/assets/real/flatlay.webp", thumbPos: "50% 45%", bookable: false, minutes: 50, approved: true }, // by request until Mat instructors join (then true + slots in lib/booking.ts)
  { id: "private", slug: "private-1to1", image: "/assets/welcome/arch.webp", pos: "50% 62%", thumb: "/assets/welcome/arch.webp", thumbPos: "50% 62%", bookable: false, minutes: 50, approved: true },
  { id: "duo", slug: "duo", image: "/assets/real/entry.webp", pos: "50% 72%", thumb: "/assets/real/entry.webp", thumbPos: "50% 72%", bookable: false, minutes: 50, approved: true },
  { id: "women", slug: "women-only", image: "/assets/welcome/aisle.webp", pos: "50% 58%", thumb: "/assets/welcome/aisle.webp", thumbPos: "50% 58%", bookable: false, minutes: 50, approved: false },
  // Teens (girls 12-17): a fixed weekly group, sold as its own monthly plan (pricing.ts: "teens").
  { id: "teens", slug: "teens", image: "/assets/welcome/above.webp", pos: "50% 60%", thumb: "/assets/welcome/above.webp", thumbPos: "50% 60%", bookable: false, capacity: 5, minutes: 50, approved: true },
  // Closed groups: the studio closes for your group. Two packages (packages.ts): private group and event.
  { id: "groups", slug: "closed-groups", image: "/assets/welcome/evening.webp", pos: "50% 60%", thumb: "/assets/welcome/evening.webp", thumbPos: "50% 60%", bookable: false, capacity: 5, minutes: 50, approved: true },
];

export const serviceById = (id: string) => services.find((s) => s.id === id);
export const serviceBySlug = (slug: string) => services.find((s) => s.slug === slug);
