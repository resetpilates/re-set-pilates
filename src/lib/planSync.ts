// A plan ordered while online payment was closed shows "payment pending". Once the studio takes payment and marks a
// membership for that plan Active in Airtable, this clears the note: later bookings go in as normal bookings (not held)
// and the profile's auto-renew switch works. Asks only while a plan is pending: when the app opens, and again when it
// comes back to the foreground, at most every few minutes.
import { useEffect } from "react";
import { useI18n } from "./i18n";
import { ask } from "./relay";
import { useStore } from "./store";

const EVERY_MS = 5 * 60_000;
let lastAsked = 0;

export function usePlanSync() {
  const { lang } = useI18n();
  const { planId, planPending, profile, confirmPlan } = useStore();
  const { phone, lastName } = profile;
  useEffect(() => {
    if (!planPending || !planId || !phone || !lastName.trim()) return;
    // The answer is applied even if this screen has re-mounted meanwhile; the store ignores it for another plan.
    const check = () => {
      if (document.visibilityState === "hidden" || Date.now() - lastAsked < EVERY_MS) return;
      lastAsked = Date.now();
      ask("plan-status", { lang, phone, lastName, planId }).then((r) => {
        if (r?.ok && r.membership) confirmPlan(planId, r.membership.id, r.membership.autoRenew);
      });
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => document.removeEventListener("visibilitychange", check);
  }, [planPending, planId, phone, lastName, lang, confirmPlan]);
}
