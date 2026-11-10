// Single source of truth for business data. Anything TODO_VERIFY is unresolved
// business data, not design: never hard-code these values inside components.
export const TODO = "TODO_VERIFY";
export const isTodo = (v?: string) => !v || v.startsWith(TODO);

export const siteConfig = {
  brand: {
    name: "re:set pilates",
    tagline: "Reset Your Strength",
    supportingLine: "Strong body · Calm mind · Happier you",
  },
  locale: { default: "he", supported: ["he", "en"] as const },
  capacity: { reformerBeds: 5, maxGroupSize: 5 },
  social: {
    instagram: "https://www.instagram.com/resetpilates_/",
    tiktok: "https://www.tiktok.com/@reset.pilates",
    facebook: "https://www.facebook.com/profile.php?id=61595012095305",
    instagramHandle: "@resetpilates_",
    // Google Business Profile: paste the profile link and the "Ask for reviews" link once the listing is live
    googleBusiness: "https://g.page/r/CYP9NF0IiTdlEBM",
    googleReview: "https://g.page/r/CYP9NF0IiTdlEBM/review",
    // Google Place ID (from the profile, starts with "ChIJ"). Once set, directions and the map open the listing itself.
    googlePlaceId: TODO,
    tiktokHandle: "@reset.pilates",
  },
  contact: {
    // One studio number for WhatsApp and calls. WhatsApp is the first line of contact in Israel.
    phone: "050-837-1101", // shown as is (local format)
    whatsapp: "972508371101", // international digits only: 972 + the number without its leading 0
    email: "resetpilates11@gmail.com", // main customer contact: all important communication goes here
    streetHe: "גזית 1",
    streetEn: "Gazit 1",
    cityHe: "הוד השרון",
    cityEn: "Hod Hasharon",
    publicAddress: "TODO_VERIFY_PUBLIC_ADDRESS",
    mapsQuery: "Gazit 1, Hod Hasharon, Israel",
    geo: { lat: 32.1506, lng: 34.8888 }, // approximate: TODO_VERIFY
    geoVerified: false, // set true once lat/lng match the pin on the Google profile; only then is it published in the schema
    postalCode: TODO,
    hours: TODO,
    // Structured opening hours for Google (schema). Must match the Google Business Profile exactly.
    // Days: Su Mo Tu We Th Fr Sa. Example: { days: ["Su", "Mo", "Tu", "We", "Th"], opens: "07:00", closes: "21:00" }
    openingHours: [] as { days: ("Su" | "Mo" | "Tu" | "We" | "Th" | "Fr" | "Sa")[]; opens: string; closes: string }[],
    parking: { he: "חניה ברחוב", en: "Street parking" },
  },
  // WhatsApp Business extras on the same number. Each link stays hidden on the site until it is filled in.
  whatsappBusiness: {
    catalog: TODO, // wa.me/c/972508371101 once the catalog has items
    channel: TODO, // whatsapp.com/channel/… (studio news, schedule, openings)
    // Invite links for the member groups, one per class (chat.whatsapp.com/…)
    groups: { reformer: TODO, teens: TODO, mat: TODO } as Record<"reformer" | "teens" | "mat", string>,
  },
  // Shown on invoices and receipts once filled (hidden while TODO).
  business: {
    legalName: TODO, // the registered business name, e.g. "Orit Schieber Abitan"
    taxId: TODO, // עוסק פטור / מורשה number
  },
  // Feature flags
  policies: {
    cancelHours: 24, // group classes, private, duo and closed groups: cancel at least 24 hours before to avoid a charge (private events: 5 days, studio terms §8)
    // Date of the studio terms in force. Bump it when Orit changes the terms: everyone is asked to accept again.
    termsVersion: "2026-11-10",
    pregnancyUpTo: TODO, // e.g. "week 30": Orit to confirm
  },
  flags: {
    // Launch pricing overlay (never overwrites the core pricing model). Off: the price list carries no overlay
    // any more, a class is never under ₪50 (see PRICE_FLOOR in pricing.ts).
    launchPricing: false,
    // Prototype: show unapproved prices with a "pending approval" marker.
    showUnapprovedPrices: true,
    // Prototype: member/visitor switch on the profile screen. Remove in production.
    demoMode: false,
    // Real reviews/press only; hidden until verified entries exist.
    showReviews: true,
    // Online payment (Bit + card) is not connected yet. While false, every buy/book button ends in the
    // launch waitlist form (Airtable "Launch Waitlist") instead of a checkout. Turn on once a provider is live.
    paymentsLive: false,
  },
  // Payment options offered at the end of checkout (only shown once flags.paymentsLive is on).
  // The booking and payment system is built in-house; add each provider's payment link here.
  payments: [
    { id: "bit", url: TODO },
    { id: "card", url: TODO },
  ] as { id: "bit" | "card"; url: string }[],
  analytics: { ga4MeasurementId: TODO },
  // Public web address (Cloudflare). Used for the sitemap and robots.txt.
  siteUrl: "https://resetpilates.org",
  // Cloudflare Turnstile site key (public). Leave empty to skip the bot check; the secret key lives only in the Worker.
  turnstileSiteKey: "0x4AAAAAAFU9mcKzrVwPIAhL",
  studioMedia: {
    heroVideo: "/media/hero.mp4", // Seedance 1.5 Pro: empty studio at dawn, dolly in to the gold-ring sign (12s, 1080p, silent); replace with real footage after the shoot
    heroVideoPhone: "/media/hero-720.mp4", // lighter 720p encode served below 1000px (made by the compress-hero workflow)
    heroPoster: "/assets/hero-poster.webp", // first frame of the hero video (studio + sign); studio-wide.jpg is the plain studio photo
    // Link preview (WhatsApp, Instagram, Facebook, Google): the RE:SET logo on white, 1200×630 (new file name so WhatsApp drops its cached preview). og-studio.jpg (the five
    // reformers) stays for the schema.org photo list only; the owner asked that a shared link shows the logo, not the studio.
    ogImage: "/assets/og-logo-v2.jpg",
    ogStudio: "/assets/og-studio.jpg",
    logoDisc: "/assets/logo-gold-ring.webp",
    // Chat launcher and chat header avatar: the wordmark on white, sized to sit inside a circle.
    chatAvatar: "/icons/icon-chat-512.png",
    // The RE:SET mark alone (no "pilates", no tagline) on a white square: welcome screen, hero, chat button.
    mark: "/assets/reset-mark.png",
    // Vector versions (traced from the logo): the letters alone, and the letters with PILATES under them. Header and hero.
    markSvg: "/assets/reset-mark.svg",
    wordmark: "/assets/reset-wordmark.svg",
    wordmarkCream: "/assets/reset-wordmark-cream.svg", // same lockup in cream, for the dark (ink) membership card
    music: "", // optional user-uploaded track; never autoplays
  },
};

/** WhatsApp chat link to the studio, with an optional pre-written first message. */
export function waLink(text?: string) {
  const base = `https://wa.me/${siteConfig.contact.whatsapp}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Phone link in international form (works from abroad too). */
export const telLink = () => `tel:+${siteConfig.contact.whatsapp}`;

/** Google Maps link: opens the Google listing once the Place ID is set, the address until then. */
/** Public address line. The street is deliberately left out: the owner asked that it not appear on the site. */
export const addressLine = (he: boolean) => (he ? siteConfig.contact.cityHe : siteConfig.contact.cityEn);

export function mapsLink() {
  const c = siteConfig.contact;
  const q = isTodo(siteConfig.social.googleBusiness) ? c.mapsQuery : `${siteConfig.brand.name}, ${c.mapsQuery}`;
  const place = isTodo(siteConfig.social.googlePlaceId) ? "" : `&query_place_id=${siteConfig.social.googlePlaceId}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}${place}`;
}

/** Keyless Google Maps embed. Searches the business name once the profile is live so the pin shows the listing. */
export function mapsEmbedSrc(lang: string) {
  const c = siteConfig.contact;
  const q = isTodo(siteConfig.social.googleBusiness) ? c.mapsQuery : `${siteConfig.brand.name}, ${c.mapsQuery}`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&hl=${lang}&z=17&output=embed`;
}

export type Lang = (typeof siteConfig.locale.supported)[number];
