// Founder and instructor roster.
// Instructors are PLACEHOLDERS (names, bios, portraits) until the real team is confirmed -
// replace them and set `approved: true`. Drop portrait files in /public/assets and set `portrait`.
export interface Person {
  id: string;
  nameHe: string;
  nameEn: string;
  roleHe: string;
  roleEn: string;
  bioHe: string;
  bioEn: string;
  portrait?: string;
  approved: boolean;
}

export const founder: Person = {
  id: "founder",
  nameHe: "אורית שיבר אביטן",
  nameEn: "Orit Schieber Abitan",
  roleHe: "מייסדת ומדריכה",
  roleEn: "Founder & instructor",
  bioHe:
    "אורית היא אמא לארבעה, יזמת ובעלת עסקים, ומדריכת פילאטיס שהתאהבה בשיטה הרבה לפני שהפכה אותה למקצוע. היא קוראת בלי הפסקה על בריאות, תנועה וכושר, ומביאה לסטודיו את מה שהיא מאמינה בו בבית: עקביות, תשומת לב וחום. את re:set היא הקימה כדי ליצור חדר קטן ואישי, שבו כל אחת מקבלת יחס מלא ויוצאת חזקה ורגועה יותר.",
  bioEn:
    "Orit is a mother of four, a multi-business owner, and a Pilates instructor who fell in love with the method long before she made it her work. An avid reader of everything health and fitness, she brings to the studio what she believes in at home: consistency, attention and warmth. She founded re:set to create a small, personal room where every woman gets full attention and leaves stronger and calmer.",
  portrait: "/assets/orit-v3.webp", // final owner-supplied photo (18 Nov 2026): blush sports set on a warm ivory wall, 4:5 (new file name so caches drop the old one)
  approved: true,
};

// Instructors other than Orit are added here once they join (name, role, bio, portrait, approved: true).
export const instructors: Person[] = [];
/** Everyone who can be named on a class: the founder first, then the instructors. */
export const roster: Person[] = [founder, ...instructors];

// Only verified items render. Leave empty until real quotes / press exist.
export interface Review {
  id: string;
  quoteHe: string;
  quoteEn: string;
  author: string;
  stars?: number;
  source?: "google";
  approved: boolean; // real, permitted to publish
  sample?: boolean; // layout placeholder: shown only in demo mode, clearly labelled
}
// Replace the samples with real Google reviews (copy the text and first name + initial), set approved: true,
// and delete the sample entries. Samples never show when demo mode is off.
export const reviews: Review[] = [
  {
    id: "sample-1",
    quoteEn: "Small classes, real attention. I felt my core working from the very first session.",
    quoteHe: "קבוצות קטנות ותשומת לב אמיתית. הרגשתי את הליבה עובדת כבר מהשיעור הראשון.",
    author: "Sample review",
    stars: 5,
    source: "google",
    approved: false,
    sample: true,
  },
  {
    id: "sample-2",
    quoteEn: "A beautiful, calm studio. Booking is easy and the instructors adjust everything to you.",
    quoteHe: "סטודיו יפה ורגוע. קל לשריין, והמדריכות מתאימות הכול אלייך.",
    author: "Sample review",
    stars: 5,
    source: "google",
    approved: false,
    sample: true,
  },
  {
    id: "sample-3",
    quoteEn: "I came in as a total beginner and never felt lost. Now it's the best part of my week.",
    quoteHe: "הגעתי כמתחילה מוחלטת ואף פעם לא הרגשתי אבודה. היום זה החלק הכי טוב בשבוע שלי.",
    author: "Sample review",
    stars: 5,
    source: "google",
    approved: false,
    sample: true,
  },
];
export const pressMentions: { id: string; name: string; url: string }[] = [];
