// Closed-group packages: the studio closes for one group, by appointment (never bookable in the schedule).
// Prices: owner, 7 Nov 2026 (private group ₪375, event package ₪750). Copy lives in content/*.ts under services.packages.
export type PackageId = "group" | "event";

export interface PackageConfig {
  id: PackageId;
  price: number; // per group, ILS
  minutes: number;
  capacity: number; // up to
  approved: boolean;
  image: string; // card photo (generated stand-in until the shoot)
  pos?: string;
}

export const packages: PackageConfig[] = [
  { id: "group", price: 375, minutes: 50, capacity: 5, approved: true, image: "/assets/ex-group-team.webp", pos: "50% 45%" },
  { id: "event", price: 750, minutes: 90, capacity: 5, approved: true, image: "/assets/ex-event.webp", pos: "50% 45%" },
];

export const packageById = (id: string) => packages.find((p) => p.id === id);
