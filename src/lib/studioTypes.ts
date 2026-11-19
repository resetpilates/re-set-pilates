// What the Studio hub (Orit's command center, /he/studio) and the Worker (worker/studio.ts) say to each other.
// Health details are never part of this: Health & Consent and Trainer Check-ins stay in Airtable, Orit only.

export const LEAD_STATUSES = ["New", "Contacted", "Booked first class", "Converted", "No answer", "Not interested"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Attendance Orit can set from the hub. "Booked" / "Held" are only used to undo a tap. */
export const ATTENDANCE = ["Attended", "No-show", "Booked", "Held"] as const;
export type Attendance = (typeof ATTENDANCE)[number];

export interface StBooking {
  id: string;
  name: string; // member's full name ("" when the member row is missing)
  phone: string;
  bed: string;
  status: string;
}
export interface StClass {
  id: string;
  type: string;
  when: string; // ISO instant
  capacity: number | null;
  status: string;
  waitlist: number;
  bookings: StBooking[];
}
export interface StLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  channel: string;
  interested: string[];
  message: string;
  prefTime: string;
  heard: string;
  status: string;
  received: string; // ISO instant
}
export interface StWait {
  id: string;
  name: string;
  phone: string;
  wanted: string;
  slot: string;
  contacted: boolean;
  submitted: string;
}
export interface StMember {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  source: string;
  added: string; // ISO instant
  plan: string; // status of their plans, e.g. "Active"
  renews: string; // YYYY-MM-DD or ""
  classesLeft: number | null;
  lastClass: string; // YYYY-MM-DD or ""
  attended: number;
}
export interface StPayment {
  id: string;
  name: string;
  what: string;
  amount: number;
  method: string;
  status: string;
  paidOn: string;
}
export interface StPlan {
  id: string;
  name: string;
  renews: string;
  autoRenew: boolean;
  sessionsLeft: number | null;
}
export interface StCampaign {
  id: string;
  name: string;
  channels: string[];
  start: string;
  end: string;
  offer: string;
  budget: number | null;
  leads: number;
}
export interface StChat {
  id: string;
  question: string;
  asked: string;
}
/** Meta (Instagram / Facebook) ads, last 30 days. null = not connected yet. */
export interface StMeta {
  ok: boolean; // false = connected but Meta did not answer
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  leads: number;
}

export interface StudioData {
  ok: true;
  at: string; // when this snapshot was read
  today: string; // studio date, YYYY-MM-DD
  base: string; // Airtable base id, for "Open in Airtable" links
  tables: Record<"members" | "leads" | "classes" | "bookings" | "payments" | "memberships" | "campaigns" | "waitlist" | "chat", string>;
  classes: StClass[]; // today and the next 7 days
  leads: StLead[]; // newest first
  waitlist: StWait[];
  members: StMember[];
  membersCapped: boolean; // true when there are more members than the hub loads
  pending: StPayment[]; // payments waiting for Orit to confirm
  paid: StPayment[]; // confirmed payments, last 60 days
  plans: StPlan[]; // active plans
  campaigns: StCampaign[];
  chat: StChat[]; // chat questions handed to Orit
  meta: StMeta | null;
}

export type StudioAction =
  | { kind: "lead"; id: string; status: LeadStatus }
  | { kind: "wait"; id: string; contacted: boolean }
  | { kind: "booking"; id: string; status: Attendance };

export type StudioReply = { ok: true; token?: string } | { ok: false; error: "code" | "setup" | "auth" | "slow down" | "bad request" | "unavailable" | "origin" };
