// Messages the website sends to the /api relay (worker/index.ts), which writes them to Airtable.
// Shared by the browser and the Worker, so keep this file free of DOM and Worker APIs.

export type Lang = "he" | "en";
export type HeardFrom = "Instagram" | "TikTok" | "Facebook" | "Google" | "Referral" | "Walk-in" | "Other";
export type PrefTime = "Early morning" | "Morning" | "Midday" | "Evening";
export type PayMethod = "bit" | "card";
/** Launch waitlist time choice: adults train in the morning, teens in the evening. */
export type LaunchTime = "Adult morning" | "Teen evening";
export const LAUNCH_TIMES: LaunchTime[] = ["Adult morning", "Teen evening"];
/** Where a launch-waitlist sign-up came from (which buy/book button). */
export type LaunchSource = "Pricing" | "Booking" | "Gift card" | "Class page" | "Shop";
export type LaunchClass = "Reformer" | "Mat" | "Teens" | "Gift card" | "Not sure";

export const HEARD_FROM: HeardFrom[] = ["Instagram", "TikTok", "Facebook", "Google", "Referral", "Walk-in", "Other"];
export const PREF_TIMES: PrefTime[] = ["Morning", "Midday", "Evening"];

/**
 * Israeli phone number → local digits ("0501234567"), or null when it can't be one.
 * Shared so the form rejects exactly what the relay would reject.
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("972")) d = `0${d.slice(3)}`;
  return /^0\d{8,9}$/.test(d) ? d : null;
}

/** How a person's name appears on the public schedule beds: "Maya Levi", "M. Levi" or not at all. */
export type ShowAs = "full" | "short" | "anon";
export const SHOW_AS: ShowAs[] = ["short", "full", "anon"];

/** The name shown on the schedule for a booking ("" = anonymous). Never includes phone or email. */
export function scheduleName(c: Pick<Contact, "firstName" | "lastName">, showAs: ShowAs = "short"): string {
  const first = c.firstName.trim();
  const last = c.lastName.trim();
  if (showAs === "anon" || !first) return "";
  if (showAs === "full") return `${first} ${last}`.trim();
  return last ? `${[...first][0]}. ${last}` : first; // "M. Levi"
}

/** GET /api/roster?date=YYYY-MM-DD → who is on which bed, per class slot (names only as each person chose). */
export interface RosterReply {
  ok: boolean;
  slots?: Record<string, { bed: number | null; name: string }[]>; // bed 0-4, null = "any bed"; name "" = anonymous
}

/** Who the person is. Phone is the key used to find them again in Airtable. */
export interface Contact {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
}

/** Where the visitor first came from (utm_* tags and referrer), kept from their first visit. */
export interface Attribution {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  landing?: string;
}

interface Base {
  lang: Lang;
  page?: string;
  attribution?: Attribution;
  website?: string; // spam trap; real visitors leave it empty
  retry?: string; // signed pass from a failed attempt (see the outbox in relay.ts); replaces the Turnstile token
}

export interface LeadMsg extends Base {
  contact: Contact;
  interest: string; // service id: reformer | mat | private | duo | women | teens | groups
  note?: string; // free text for the lead's "Message", e.g. the package a group asked about
  prefTime?: PrefTime;
  heard?: HeardFrom;
  consent: boolean;
  turnstile?: string; // Cloudflare Turnstile token (the lead form shows the widget)
}

export interface CheckoutMsg extends Base {
  contact: Contact;
  planId: string; // Plans & Prices > Website ID
  kind?: "reformer" | "mat"; // which class the plan is for (same price); teens plans send none
  method: PayMethod;
  heard?: HeardFrom;
  consent: boolean;
  termsAccepted: true;
  autoRenew?: boolean; // monthly memberships only: the buyer opted in to renew every month
  orderId?: string; // receipt number (RS-YYMMDD-XXXX): the same order sent twice is saved once
  itemLabel?: string; // the plan's name as the buyer saw it, for the receipt
  carryOver?: number; // unused classes moved over from the buyer's previous plan
}

export interface SlotRef {
  slotId: string; // reformer_2026-10-12_1800
  service: "reformer" | "mat";
  date: string; // YYYY-MM-DD, studio time
  time: string; // HH:mm, studio time
  minutes: number;
  capacity: number | null;
}

export interface BookingMsg extends Base {
  contact: Contact;
  slot: SlotRef;
  bed: number | null; // 0-based on the site; Airtable shows 1-5
  showAs?: ShowAs; // name on the schedule beds (default "short")
  held?: boolean; // checkout before online payment is open: the bed is held (Airtable status "Held") until Orit takes payment
}

export interface CancelMsg extends Base {
  bookingId: string; // Airtable record id returned when booking
  phone: string; // must match the booking's member
}

/** Auto-renew switched on or off from the profile. */
export interface RenewalMsg extends Base {
  membershipId: string; // Airtable record id returned by checkout
  phone: string; // must match the membership's member
  autoRenew: boolean;
}

export interface WaitlistMsg extends Base {
  contact: Contact;
  slot: SlotRef;
}

/** Before online payment is live, every buy/book button ends here instead of a checkout. */
export interface LaunchWaitlistMsg extends Base {
  contact: Contact; // first/last name + phone required, email optional
  classType: LaunchClass;
  prefTime?: LaunchTime; // required except for gift cards
  source: LaunchSource;
  planId?: string; // Plans & Prices > Website ID, when they picked a plan
  wanted?: string; // what they tried to buy, as they saw it
  slot?: string; // the class they were booking, as they saw it
  consent: boolean;
}

export interface GiftMsg extends Base {
  buyer: Contact;
  planId: string | null; // null = custom amount
  amount?: number; // custom amount in ₪
  recipientName: string;
  note?: string;
  consent: boolean;
  orderId?: string; // receipt number, see CheckoutMsg
  itemLabel?: string;
}

export interface QuizMsg extends Base {
  goal: "strength" | "calm" | "care" | "together";
  experience: "none" | "some" | "regular";
  style: "group" | "solo" | "pair";
  recommended: "reformer" | "mat" | "private" | "duo";
}

export interface QuizContactMsg extends Base {
  quizId: string;
  contact: Contact;
  consent: boolean;
}

export interface ChatMsg extends Base {
  question: string;
  intent?: string; // scripted answer id; empty when handed to Orit
  handoff: boolean;
}

export interface RelayMap {
  lead: LeadMsg;
  checkout: CheckoutMsg;
  booking: BookingMsg;
  cancel: CancelMsg;
  renewal: RenewalMsg;
  waitlist: WaitlistMsg;
  "launch-waitlist": LaunchWaitlistMsg;
  gift: GiftMsg;
  quiz: QuizMsg;
  "quiz-contact": QuizContactMsg;
  chat: ChatMsg;
}
export type RelayEvent = keyof RelayMap;

/** What the relay answers. `id` is the main Airtable record created (booking, quiz, gift card). */
export interface RelayReply {
  ok: boolean;
  id?: string;
  code?: string; // gift card code
  error?: string;
  receiptUrl?: string; // hosted copy of the receipt (/r/…), when the Worker can sign one
  sentVia?: ("email" | "whatsapp" | "sms")[]; // channels the receipt is being sent on
  until?: string; // 409 "already active": the date the running membership ends (YYYY-MM-DD)
  duplicate?: boolean; // this order was already saved; nothing new was created
  retry?: string; // on a 5xx after the bot check passed: pass for resending the same message later
  airtable?: boolean; // /api/health only
  turnstile?: boolean;
}
