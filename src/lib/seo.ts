import { useEffect } from "react";
import { allPlans, priceFor, type ClassKind } from "../config/pricing";
import { isTodo, mapsLink, siteConfig } from "../config/site";
import { founder } from "../config/team";

/** Per-page title, description and optional JSON-LD. */
export function useSeo(meta: { title: string; desc: string }, jsonLd?: object) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : "";
  useEffect(() => {
    document.title = meta.title;
    const set = (sel: string, attr: string, key: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(sel);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    set('meta[name="description"]', "name", "description", meta.desc);
    set('meta[property="og:title"]', "property", "og:title", meta.title);
    set('meta[property="og:description"]', "property", "og:description", meta.desc);
    set('meta[property="og:image"]', "property", "og:image", siteConfig.studioMedia.ogImage);

    let script: HTMLScriptElement | null = null;
    if (ld) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = ld;
      document.head.appendChild(script);
    }
    return () => script?.remove();
  }, [meta.title, meta.desc, ld]);
}

const DAY: Record<string, string> = { Su: "Sunday", Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday", Sa: "Saturday" };

/**
 * Local business schema for Google. Name, address, phone and hours must match the
 * Google Business Profile exactly. Unconfirmed (TODO_VERIFY) fields are left out, never guessed.
 */
export const localBusinessLd = (lang: string) => {
  const c = siteConfig.contact;
  const s = siteConfig.social;
  const origin = typeof location === "undefined" ? "" : location.origin;
  const abs = (path: string) => (path.startsWith("http") ? path : origin + path);
  const he = lang === "he";
  const known = (v?: string) => (isTodo(v) ? undefined : v);
  const kindName = (k: ClassKind) => (k === "mat" ? (he ? "מזרן" : "Mat") : he ? "רפורמר" : "Reformer");
  const offer = (p: (typeof allPlans)[number], kind: ClassKind = "reformer") => ({
    "@type": "Offer",
    name:
      p.track === "teens"
        ? p.billingType === "monthly"
          ? he ? "פילאטיס לנערות, מנוי חודשי" : "Teen Pilates monthly plan"
          : he ? "שיעור בודד לנערות" : "Teen single class"
        : p.billingType === "monthly"
        ? p.perWeek === "unlimited"
          ? he ? "מנוי חודשי ללא הגבלה" : "Unlimited monthly membership"
          : he ? `מנוי חודשי, ${p.perWeek} פעמים בשבוע` : `Monthly membership, ${p.perWeek}x a week`
        : p.sessions === 1
          ? he ? "שיעור בודד" : "Single class"
          : he ? `כרטיסיית ${p.sessions} שיעורים` : `${p.sessions}-class pass`,
    ...(p.track ? {} : { category: kindName(kind) }),
    price: priceFor(p, kind),
    priceCurrency: p.currency,
    url: `${origin || siteConfig.siteUrl}/${lang}/pricing`,
  });

  return {
    "@context": "https://schema.org",
    "@type": ["ExerciseGym", "HealthClub"],
    "@id": `${origin}/#studio`,
    name: siteConfig.brand.name,
    alternateName: ["RE:SET Pilates", "reset pilates", "ריסט פילאטיס"],
    slogan: siteConfig.brand.tagline,
    description: he
      ? "סטודיו בוטיק לפילאטיס מכשירים (רפורמר) בהוד השרון. קבוצות של עד 5 מתאמנות, פילאטיס מזרן, אימונים אישיים ודואו."
      : "Boutique Reformer Pilates studio in Hod Hasharon. Groups of up to 5, plus Mat Pilates, private and duo sessions.",
    url: `${origin}/`,
    logo: abs(siteConfig.studioMedia.logoDisc),
    image: [abs(siteConfig.studioMedia.heroPoster), abs(siteConfig.studioMedia.ogStudio), abs(siteConfig.studioMedia.ogImage)],
    ...(known(c.phone) && { telephone: `+${c.whatsapp}` }),
    ...(known(c.email) && { email: c.email }),
    address: {
      "@type": "PostalAddress",
      addressLocality: he ? c.cityHe : c.cityEn,
      ...(known(c.postalCode) && { postalCode: c.postalCode }),
      addressCountry: "IL",
    },
    ...(c.geoVerified && { geo: { "@type": "GeoCoordinates", latitude: c.geo.lat, longitude: c.geo.lng } }),
    hasMap: mapsLink(),
    areaServed: { "@type": "City", name: he ? c.cityHe : c.cityEn },
    ...(c.openingHours.length > 0 && {
      openingHoursSpecification: c.openingHours.map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: h.days.map((d) => DAY[d]),
        opens: h.opens,
        closes: h.closes,
      })),
    }),
    priceRange: "₪₪",
    currenciesAccepted: "ILS",
    knowsLanguage: ["he", "en"],
    founder: { "@type": "Person", name: he ? founder.nameHe : founder.nameEn },
    makesOffer: allPlans.filter((p) => p.active && p.approved).flatMap((p) => (p.track ? [offer(p)] : [offer(p, "reformer"), offer(p, "mat")])),
    // Booking is built into the site (no outside booking system).
    potentialAction: { "@type": "ReserveAction", target: `${origin || siteConfig.siteUrl}/${lang}/schedule`, name: he ? "הזמנת שיעור" : "Book a class" },
    sameAs: [s.instagram, s.tiktok, s.facebook, known(s.googleBusiness)].filter(Boolean),
  };
};

export const faqLd = (items: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: items.map((i) => ({
    "@type": "Question",
    name: i.q,
    acceptedAnswer: { "@type": "Answer", text: i.a },
  })),
});
