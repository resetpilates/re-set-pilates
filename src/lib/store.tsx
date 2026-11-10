import type { ShowAs } from "./relayTypes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { planById, type ClassKind } from "../config/pricing";
import { fromISO, israelNow, slotStart, type ClassSlot } from "./booking";
import { planUsage } from "./plan";
import type { ReceiptData } from "./receipt";
import { RELAY_REPLY, relay, type RelayReplyDetail } from "./relay";

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
}

export interface Profile {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  heard?: string; // "How did you hear about us?" — asked once
  showAs?: ShowAs; // how the name appears on the schedule beds (default "short": first initial + last name)
  consented?: boolean; // ticked "Send me news and offers" at least once
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
  past: Booking[];
  /** Returns null when the plan's allowance is used up (weekly cap, pass balance or expired pass). */
  book: (slot: ClassSlot, bed: number | null, remind: boolean) => Booking | null;
  /** `late` keeps the booking on the record (hidden from lists) so the plan still counts it. */
  cancel: (bookingId: string, late?: boolean) => void;
  joinWaitlist: (slotId: string) => void;
  leaveWaitlist: (slotId: string) => void;
  /** `carry` = unused classes moved over from the previous plan (see checkPurchase in plan.ts). */
  setPlan: (planId: string | null, kind?: ClassKind | null, carry?: number) => void;
  /** Keep a purchase's receipt and notify in the app. */
  addReceipt: (r: ReceiptData) => void;
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
    return { ...initial, planStart: saved.memberSince ?? null, ...saved, profile: { ...initial.profile, ...rest } };
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

  const book = useCallback<Store["book"]>((slot, bed, remind) => {
    // Never book past the plan's allowance; a booking for the same slot is being replaced, so it doesn't count
    const allowed = (p: Persisted) => {
      // A late cancel keeps the session used: the same class can't be taken again
      if (p.bookings.some((x) => x.slotId === slot.id && x.cancelledLate)) return false;
      const plan = p.planId ? planById(p.planId) : undefined;
      const others = p.bookings.filter((x) => x.slotId !== slot.id);
      return !plan || planUsage(plan, others, fromISO(slot.date), p.planStart, p.carry ?? 0).left > 0;
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
    (planId: string | null, kind: ClassKind | null = null, carry = 0) =>
      setS((p) => {
        // Every purchase starts a fresh plan period (carrying unused classes over); "member since" keeps the first one
        const now = new Date().toISOString();
        return { ...p, planId, planKind: planId ? kind : null, planStart: planId ? now : null, carry: planId ? carry : 0, memberSince: planId ? (p.memberSince ?? now) : null };
      }),
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
  const setReminders = useCallback((on: boolean) => setS((p) => ({ ...p, reminders: on })), []);
  const saveProfile = useCallback((pr: Partial<Profile>) => setS((p) => ({ ...p, profile: { ...p.profile, ...pr } })), []);
  const setRemoteId = useCallback(
    (bookingId: string, remoteId: string) =>
      setS((p) => ({ ...p, bookings: p.bookings.map((b) => (b.id === bookingId ? { ...b, remoteId } : b)) })),
    [],
  );
  const markWelcomeSeen = useCallback(() => setS((p) => (p.seenWelcome ? p : { ...p, seenWelcome: true })), []);

  // A booking that waited in the outbox gets its Airtable id when it is finally sent.
  // If the visitor cancelled it in the meantime, cancel it in Airtable right away.
  useEffect(() => {
    const onReply = (e: Event) => {
      const { event, ref, reply } = (e as CustomEvent<RelayReplyDetail>).detail;
      if (event !== "booking" || !ref || !reply.id) return;
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
      past: sorted.filter((b) => slotStart(b) <= now).reverse(),
      book,
      cancel,
      joinWaitlist,
      leaveWaitlist,
      setPlan,
      addReceipt,
      markNoticesRead,
      setReminders,
      markWelcomeSeen,
      saveProfile,
      setRemoteId,
      signOut,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tick only forces the clock-based split to recompute
  }, [s, tick, book, cancel, joinWaitlist, leaveWaitlist, setPlan, addReceipt, markNoticesRead, setReminders, markWelcomeSeen, saveProfile, setRemoteId, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}
