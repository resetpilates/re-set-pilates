// Brings a health declaration made elsewhere (another phone, after signing out, or on paper at the studio) onto this device,
// so the member is not asked to declare again. Asks the relay once per visit, only while this device has no current one.
import { useEffect } from "react";
import { HEALTH_VERSION, healthValid } from "./health";
import { useI18n } from "./i18n";
import { ask } from "./relay";
import { useStore } from "./store";

const asked = new Set<string>();

export function useHealthSync() {
  const { lang } = useI18n();
  const { profile, saveProfile } = useStore();
  const { phone, lastName, health } = profile;
  const current = healthValid(health);
  useEffect(() => {
    if (current || !phone || !lastName.trim()) return;
    const key = `${phone}|${lastName.trim().toLowerCase()}`;
    if (asked.has(key)) return;
    asked.add(key);
    ask("health-status", { lang, phone, lastName }).then((r) => {
      if (r?.ok && r.validUntil)
        // Answers stay on the device they were given on; only the date comes back.
        saveProfile({ health: { at: new Date().toISOString(), version: HEALTH_VERSION, validUntil: r.validUntil, clearance: false } });
    });
  }, [current, phone, lastName, lang, saveProfile]);
}
