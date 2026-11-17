// Studio shop: branded apparel and accessories. Everything here is "coming soon" until stock lands:
// the page shows the catalog and a "tell me when it's here" button that saves people to the launch waitlist.
// Prices: planned ILS price points, approved by the owner on 2026-10-21 ("fine for now"); a final pass happens before stock lands.
import type { Content } from "../content/en";

/** Every catalog id must have copy in `shop.items` (en.ts + he.ts): the type makes a missing entry a compile error, not a blank page. */
export type ShopItemId = keyof Content["shop"]["items"];

export type ShopCategory = "tops" | "bottoms" | "accessories";
export const shopCategories: ShopCategory[] = ["tops", "bottoms", "accessories"];

export interface ShopItem {
  id: ShopItemId;
  category: ShopCategory;
  price: number; // ILS
  currency: "ILS";
  image: string;
  pos?: string; // object-position of the photo
  sizes?: string[]; // teen + adult sizes; empty = one size
  active: boolean;
}

export const shopItems: ShopItem[] = [
  { id: "tank", category: "tops", price: 119, currency: "ILS", image: "/assets/shop/tank.webp", sizes: ["XS", "S", "M", "L"], active: true },
  { id: "leggings", category: "bottoms", price: 159, currency: "ILS", image: "/assets/shop/leggings.webp", sizes: ["XS", "S", "M", "L"], active: true },
  { id: "towel", category: "accessories", price: 59, currency: "ILS", image: "/assets/shop/towel.webp", active: true },
  { id: "socks", category: "accessories", price: 35, currency: "ILS", image: "/assets/shop/socks.webp", sizes: ["35–38", "39–42"], active: true },
  { id: "tote", category: "accessories", price: 69, currency: "ILS", image: "/assets/shop/tote.webp", active: true },
  // Hand weights pulled from the catalog (owner, 22 Oct): the look did not sit with the rest of the set.
  { id: "weights", category: "accessories", price: 89, currency: "ILS", image: "/assets/shop/weights.webp", active: false },
  { id: "bottle", category: "accessories", price: 49, currency: "ILS", image: "/assets/shop/bottle.webp", active: true },
];

/** The teen set: what girls wear to the teens class, like a kit for any other after-school activity. Recommended, not required. */
export const teenBundle = {
  id: "teen-set" as const satisfies ShopItemId,
  items: ["tank", "leggings", "towel", "socks", "tote"] as ShopItemId[],
  price: 349, // ILS — singles add up to ₪441
  currency: "ILS" as const,
  image: "/assets/shop/teen-set.webp",
  pos: "50% 50%",
};

export const shopMedia = {
  hero: { src: "/assets/real/flatlay.webp", pos: "50% 50%" }, // real product photo (owner, 17 Nov 2026)
  moment: { src: "/assets/class/moment.webp", pos: "50% 40%" },
};

export const shopItem = (id: ShopItemId) => shopItems.find((i) => i.id === id);
export const bundleSinglesTotal = () => teenBundle.items.reduce((sum, id) => sum + (shopItem(id)?.price ?? 0), 0);
