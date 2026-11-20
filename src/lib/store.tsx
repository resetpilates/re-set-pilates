import { normalizePhone, type ShowAs } from "./relayTypes";
import { photoBase64 } from "./photo";
import type { HealthRecord } from "./health";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { planById, type ClassKind } from "../config/pricing";
import { siteConfig } from "../config/site";
import { fromISO, israelNow, slotStart, type ClassSlot } from "./booking";
import { heldClass, planCovers, planUsage } from "./plan";
import type { ReceiptData } from "./receipt";
import { RELAY_REPLY, ask, relay, type RelayReplyDetail } from "./relay";

export interface Booking {
  id: string;
  slotId: string;
  service: ClassSlot["service"];
  date: string;
  time: string;
  minutes: number;
  instructorId: string;
  bed: number | null;
  remind: boolean;
  bookedAt?: string; // when the booking was made (ISO)
  cancelledLate?: boolean; // cancelled inside the policy window: no longer attended, but the session stays used
  remoteId?: string; // Airtable record id from the relay, used to cancel there too
  single?: boolean; // paid for on its own (single class) while a plan was active: it does not use the plan
  held?: boolean; // held before payment (checkout while payment is closed, or a plan still pending): one at a time
}

export interface Profile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  heard?: string; // "How did you hear about us?" — asked once
  showAs?: ShowAs; // how the name appears on the schedule beds (default "short": first initial + last name)
  consented?: boolean; // ticked "Send me news and offers" at least once
  termsAcceptedAt?: string; // ISO: when the studio terms were accepted on this device
  termsVersion?: string; // which version (siteConfig.policies.termsVersion) was accepted
  health?: HealthRecord; // the latest health declaration made on this device
  photo?: string; // optional photo on the membership card: a small square JPEG data URL (src/lib/photo.ts)
  photoPending?: boolean; // the photo was added, changed or removed here and the studio's record has not caught up yet
}

/** In-app notification (the bell on the profile). Purchases add one that opens the receipt. */
export interface Notice {
  id: string;
  at: string; // ISO
  kind: "receipt";
  receiptNo: string;
  read?: boolean;
}

interface Persisted {
  planId: string | null; // active membership/pass id; null => visitor
  planKind?: ClassKind | null; // Reformer or Mat, chosen at checkout (teens plans have none)
  memberSince: string | null;
  planStart: string | null; // when the current plan was bought; pass balances and validity count from here
  carry?: number; // classes carried over from the previous plan into the current one
  planPending?: boolean; // plan chosen at checkout while online payment is closed: usable in the app, payment still owed
  autoRenew?: boolean; // monthly membership renews every month (opted in at checkout, switched on/off in the profile)
  membershipId?: string; // Airtable record of the current membership, so the profile switch can update it
  receipts?: ReceiptData[]; // newest first
  notices?: Notice[]; // newest first
  bookings: Booking[];
  waitlist: string[]; // slot ids
  reminders: boolean;
  seenWelcome: boolean;
  profile: Profile;
}

interface Store extends Persisted {
  isMember: boolean;
  upcoming: Booking[];
  /** The class held before payment that is still ahead, if any: no other class can be held until it is paid or over. */
  held?: Booking;
  past: Booking[];
  /**
   * Returns null when the plan's allowance is used up (weekly cap, pass balance, ended plan) or the plan does not
   * cover this class. `single` = the class was bought on its own, so the plan is neither checked nor used.
   * `held` = booked before payment: refused (null) while another unpaid class is still ahead.
   */
  book: (slot: ClassSlot, bed: number | null, remind: boolean, opts?: { single?: boolean; held?: boolean }) => Booking | null;
  /** `late` keeps the booking on the record (hidden from lists) so the plan still counts it. */
  cancel: (bookingId: string, late?: boolean) => void;
  joinWaitlist: (slotId: string) => void;
  leaveWaitlist: (slotId: string) => void;
  /** `carry` = unused classes moved over from the previous plan (see checkPurchase in plan.ts). */
  /** `pending` = ordered while online payment is closed: the plan works in the app, the studio still takes payment. */
  setPlan: (planId: string | null, kind?: ClassKind | null, carry?: number, pending?: boolean) => void;
  /** The studio took payment for the pending plan: drop "payment pending" and link the studio's membership record. */
  /** `planId` = the plan the studio confirmed; ignored if the device has since ordered another one. */
  confirmPlan: (planId: string, membershipId: string, autoRenew: boolean) => void;
  /** Keep a purchase's receipt and notify in the app. */
  addReceipt: (r: ReceiptData) => void;
  /** Auto-renew on/off for the current monthly membership; `membershipId` is kept when given. */
  setRenewal: (on: boolean, membershipId?: string) => void;
  markNoticesRead: () => void;
  setReminders: (on: boolean) => void;
  markWelcomeSeen: () => void;
  saveProfile: (p: Partial<Profile>) => void;
  setRemoteId: (bookingId: string, remoteId: string) => void;
  /** Forget everything saved on this device (bookings, plan, profile, progress) and start as a new visitor. */
  signOut: () => void;
}

const KEY = "reset.v1";
const TRAINER_KEY = "reset.trainer.v1"; // same key as trainerStore (kept literal: that module imports this one)
const initial: Persisted = {
  planId: null,
  memberSince: null,
  planStart: null,
  bookings: [],
  waitlist: [],
  reminders: true,
  seenWelcome: false,
  profile: { firstName: "", lastName: "", phone: "", email: "" },
};

function load(): Persisted {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const { name, ...rest } = saved.profile ?? {};
    // Older versions kept one "name" box: split it into first and last name.
    if (name && !rest.firstName) {
      const [first, ...last] = String(name).trim().split(/\s+/);
      Object.assign(rest, { firstName: first ?? "", lastName: last.join(" ") });
    }
    const out: Persisted = { ...initial, planStart: saved.memberSince ?? null, ...saved, profile: { ...initial.profile, ...rest } };
    // Saved before bookings carried the "held" mark (18 Nov 2026): while payment is closed, a class booked with no plan
    // (held at checkout) or on a plan still waiting for payment was held, not paid.
    if (!siteConfig.flags.paymentsLive && (!out.planId || out.planPending))
      out.bookings = out.bookings.map((b) => (b.held === undefined && !b.cancelledLate ? { ...b, held: true } : b));
    return out;
  } catch {
    return initial;
  }
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<Persisted>(load);
  const latest = useRef(s);
  latest.current = s;

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      /* private mode: state stays in memory */
    }
  }, [s]);

  const book = useCallback<Store["book"]>((slot, bed, remind, { single = false, held = false } = {}) => {
    // Never book past the plan's allowance; a booking for the same slot is being replaced, so it doesn't count
    const allowed = (p: Persisted) => {
      // A late cancel keeps the session used: the same class can't be taken again
      if (p.bookings.some((x) => x.slotId === slot.id && x.cancelledLate)) return false;
      // Before payment, one held class at a time (the same class being re-booked doesn't count)
      if (held && heldClass(p.bookings.filter((x) => x.slotId !== slot.id), israelNow())) return false;
      const plan = p.planId ? planById(p.planId) : undefined;
      if (!plan || single) return true;
      const others = p.bookings.filter((x) => x.slotId !== slot.id);
      return planCovers(plan, p.planKind, slot.service) && planUsage(plan, others, fromISO(slot.date), p.planStart, p.carry ?? 0, !!p.autoRenew && !p.planPending).left > 0;
    };
    if (!allowed(latest.current)) return null;
    const b: Booking = {
      id: `b${Date.now()}`,
      slotId: slot.id,
      service: slot.service,
      date: slot.date,
      time: slot.time,
      minutes: slot.minutes,
      instructorId: slot.instructorId,
      bed,
      remind,
      bookedAt: new Date().toISOString(),
      ...(single ? { single: true } : {}),
      ...(held ? { held: true } : {}),
    };
    setS((p) => (allowed(p) ? { ...p, bookings: [...p.bookings.filter((x) => x.slotId !== slot.id), b] } : p));
    return b;
  }, []);
  const cancel = useCallback(
    (id: string, late = false) =>
      setS((p) => ({
        ...p,
        bookings: late ? p.bookings.map((b) => (b.id === id ? { ...b, cancelledLate: true } : b)) : p.bookings.filter((b) => b.id !== id),
      })),
    [],
  );
  const joinWaitlist = useCallback((id: string) => setS((p) => ({ ...p, waitlist: [...new Set([...p.waitlist, id])] })), []);
  const leaveWaitlist = useCallback((id: string) => setS((p) => ({ ...p, waitlist: p.waitlist.filter((w) => w !== id) })), []);
  const setPlan = useCallback(
    (planId: string | null, kind: ClassKind | null = null, carry = 0, pending = false) => {
      // Every purchase starts a fresh plan period (carrying unused classes over); "member since" keeps the first one.
      // The clock is read here, not inside the update, so a class booked right after the purchase counts on the new plan.
      const now = new Date().toISOString();
      const next = (p: Persisted): Persisted => ({ ...p, planId, planKind: planId ? kind : null, planStart: planId ? now : null, carry: planId ? carry : 0, planPending: !!planId && pending, memberSince: planId ? (p.memberSince ?? now) : null, autoRenew: false, membershipId: undefined });
      // book() checks the allowance before React has re-rendered: let it see the new plan straight away
      latest.current = next(latest.current);
      setS(next);
    },
    [],
  );
  const confirmPlan = useCallback(
    (planId: string, membershipId: string, autoRenew: boolean) =>
      setS((p) =>
        p.planPending && p.planId === planId
          ? { ...p, planPending: false, membershipId, autoRenew, bookings: p.bookings.map((b) => (b.held && !b.single ? { ...b, held: undefined } : b)) }
          : p,
      ),
    [],
  );
  const addReceipt = useCallback(
    (r: ReceiptData) =>
      setS((p) => {
        if (p.receipts?.some((x) => x.no === r.no)) return p;
        const notice: Notice = { id: `n${Date.now()}`, at: r.issuedAt, kind: "receipt", receiptNo: r.no };
        return { ...p, receipts: [r, ...(p.receipts ?? [])].slice(0, 50), notices: [notice, ...(p.notices ?? [])].slice(0, 30) };
      }),
    [],
  );
  const markNoticesRead = useCallback(
    () => setS((p) => (p.notices?.some((n) => !n.read) ? { ...p, notices: p.notices.map((n) => ({ ...n, read: true })) } : p)),
    [],
  );
  const setRenewal = useCallback(
    (on: boolean, membershipId?: string) => setS((p) => ({ ...p, autoRenew: on, ...(membershipId ? { membershipId } : {}) })),
    [],
  );
  const setReminders = useCallback((on: boolean) => setS((p) => ({ ...p, reminders: on })), []);
  const saveProfile = useCallback((pr: Partial<Profile>) => setS((p) => ({ ...p, profile: { ...p.profile, ...pr } })), []);
  const setRemoteId = useCallback(
    (bookingId: string, remoteId: string) =>
      setS((p) => ({ ...p, bookings: p.bookings.map((b) => (b.id === bookingId ? { ...b, remoteId } : b)) })),
    [],
  );
  // The card photo is kept on the device first; the studio's Airtable row follows as soon as we know who this is
  // (name and phone) and the relay can be reached. Retried on the next visit and when the phone is back online.
  const photoBusy = useRef(false);
  const syncPhoto = useCallback(async () => {
    const pr = latest.current.profile;
    if (!pr.photoPending || photoBusy.current || !pr.firstName.trim() || !pr.lastName.trim() || !normalizePhone(pr.phone)) return;
    photoBusy.current = true;
    const sent = pr.photo;
    const reply = await ask("member-photo", {
      lang: document.documentElement.lang === "en" ? "en" : "he",
      contact: { firstName: pr.firstName, lastName: pr.lastName, phone: pr.phone, ...(pr.email ? { email: pr.email } : {}) },
      image: sent ? photoBase64(sent) : null,
    });
    photoBusy.current = false;
    if (latest.current.profile.photo !== sent) return void syncPhoto(); // changed again while this one was on its way
    // Any answer settles it (a refusal will not change by asking again); no answer means try again later.
    if (reply) setS((p) => (p.profile.photo === sent ? { ...p, profile: { ...p.profile, photoPending: false } } : p));
  }, []);
  useEffect(() => {
    if (s.profile.photoPending) void syncPhoto();
  }, [s.profile.photoPending, s.profile.photo, s.profile.firstName, s.profile.lastName, s.profile.phone, syncPhoto]);
  useEffect(() => {
    const again = () => void syncPhoto();
    addEventListener("online", again);
    return () => removeEventListener("online", again);
  }, [syncPhoto]);

  const markWelcomeSeen = useCallback(() => setS((p) => (p.seenWelcome ? p : { ...p, seenWelcome: true })), []);

  // A booking that waited in the outbox gets its Airtable id when it is finally sent.
  // If the visitor cancelled it in the meantime, cancel it in Airtable right away.
  useEffect(() => {
    const onReply = (e: Event) => {
      const { event, ref, reply } = (e as CustomEvent<RelayReplyDetail>).detail;
      if (event !== "booking" || !ref) return;
      // Sent later from the outbox and refused (class full, or another class already held before payment): drop it here too
      if (!reply.ok) {
        if (reply.error === "full" || reply.error === "held limit") setS((p) => ({ ...p, bookings: p.bookings.filter((b) => b.id !== ref) }));
        return;
      }
      if (!reply.id) return;
      const cur = latest.current;
      if (cur.bookings.some((b) => b.id === ref)) setRemoteId(ref, reply.id);
      else relay("cancel", { lang: document.documentElement.lang === "en" ? "en" : "he", bookingId: reply.id, phone: cur.profile.phone });
    };
    addEventListener(RELAY_REPLY, onReply);
    return () => removeEventListener(RELAY_REPLY, onReply);
  }, [setRemoteId]);
  // Sign out = wipe this device's saved state (bookings, plan, profile and the progress profile) and reload as a new visitor.
  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem(TRAINER_KEY);
    } catch {
      /* private mode: nothing saved anyway */
    }
    location.assign(`/${location.pathname.split("/")[1] || ""}/profile`);
  }, []);

  // Upcoming/past depend on the clock: refresh once a minute and whenever the app comes back to the foreground.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const i = setInterval(bump, 60_000);
    document.addEventListener("visibilitychange", bump);
    return () => {
      clearInterval(i);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  const value = useMemo<Store>(() => {
    const now = israelNow();
    const sorted = s.bookings.filter((b) => !b.cancelledLate).sort((a, b) => slotStart(a).getTime() - slotStart(b).getTime());
    return {
      ...s,
      isMember: !!s.planId,
      upcoming: sorted.filter((b) => slotStart(b) > now),
      held: heldClass(s.bookings, now),
      past: sorted.filter((b) => slotStart(b) <= now).reverse(),
      book,
      cancel,
      joinWaitlist,
      leaveWaitlist,
      setPlan,
      confirmPlan,
      addReceipt,
      setRenewal,
      markNoticesRead,
      setReminders,
      markWelcomeSeen,
      saveProfile,
      setRemoteId,
      signOut,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick only forces the clock-based split to recompute
  }, [s, tick, book, cancel, joinWaitlist, leaveWaitlist, setPlan, confirmPlan, addReceipt, setRenewal, markNoticesRead, setReminders, markWelcomeSeen, saveProfile, setRemoteId, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}
