// Shared form fields: name, phone, email, "How did you hear about us?", marketing opt-in and a spam trap.
// Values are read back with readContact()/readExtras() so every form sends the same shape to the relay.
import { useState } from "react";
import { Link } from "react-router-dom";
import { siteConfig } from "../config/site";
import { useI18n } from "../lib/i18n";
import { HEARD_FROM, normalizePhone, type Contact, type HeardFrom } from "../lib/relayTypes";
import type { Profile } from "../lib/store";
import { TermsBody } from "./Terms";
import { Sheet } from "./ui";

export function ContactFields({ id, profile, email = "optional" }: { id: string; profile: Profile; email?: "optional" | "none" }) {
  const { t } = useI18n();
  return (
    <>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${id}-first`}>{t.form.firstName}</label>
          <input id={`${id}-first`} name="firstName" className="input" autoComplete="given-name" defaultValue={profile.firstName} required maxLength={60} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-last`}>{t.form.lastName}</label>
          <input id={`${id}-last`} name="lastName" className="input" autoComplete="family-name" defaultValue={profile.lastName} required maxLength={60} />
        </div>
      </div>
      <div className={email === "none" ? "" : "grid-2"}>
        <div className="field">
          <label htmlFor={`${id}-phone`}>{t.form.phone}</label>
          <input
            id={`${id}-phone`}
            name="phone"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            defaultValue={profile.phone}
            required
            maxLength={16}
            // Same rule as the relay: an Israeli number (05X…, 0X…, or +972…).
            onInput={(e) => e.currentTarget.setCustomValidity(normalizePhone(e.currentTarget.value) ? "" : t.form.phoneInvalid)}
          />
        </div>
        {email !== "none" && (
          <div className="field">
            <label htmlFor={`${id}-email`}>{t.form.emailOptional}</label>
            <input id={`${id}-email`} name="email" className="input" type="email" autoComplete="email" dir="ltr" defaultValue={profile.email} maxLength={120} />
          </div>
        )}
      </div>
      {/* Spam trap: hidden from people, filled in by bots. */}
      <label className="hp" aria-hidden>
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </>
  );
}

/** Asked once: hidden after the visitor has answered on any form. */
export function HeardField({ id, profile }: { id: string; profile: Profile }) {
  const { t } = useI18n();
  if (profile.heard) return null;
  return (
    <div className="field">
      <label htmlFor={`${id}-heard`}>{t.form.heard}</label>
      <select id={`${id}-heard`} name="heard" className="input" defaultValue="">
        <option value="">{t.form.heardPick}</option>
        {HEARD_FROM.map((h) => (
          <option key={h} value={h}>
            {t.form.heardOpts[h]}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Unticked marketing opt-in. Hidden once the visitor has opted in. */
export function ConsentField({ profile }: { profile: Profile }) {
  const { t } = useI18n();
  if (profile.consented) return null;
  return (
    <label className="tick">
      <input type="checkbox" name="consent" />
      <span>{t.form.consent}</span>
    </label>
  );
}

/** True once this device accepted the studio terms now in force (an older version has to be accepted again). */
export const termsAccepted = (p: Profile) => !!p.termsAcceptedAt && p.termsVersion === siteConfig.policies.termsVersion;

/**
 * Required "I have read and accept the studio terms" box, asked before checkout and on first registration.
 * The link opens the full terms in a sheet (the form keeps its values); "I accept" there ticks the box.
 * Shown as a short "accepted on …" line once the current terms were accepted on this device.
 */
export function TermsField({ profile }: { profile: Profile }) {
  const { t, href, fmtDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState(false);
  if (termsAccepted(profile))
    return (
      <p className="tiny muted terms-ok">
        {t.form.termsAccepted.replace("{date}", fmtDate(new Date(profile.termsAcceptedAt!)))} · <Link to={href("terms")}>{t.form.termsLink}</Link>
      </p>
    );
  return (
    <>
      <label className="tick">
        <input type="checkbox" name="terms" required checked={ticked} onChange={(e) => setTicked(e.currentTarget.checked)} />
        <span>
          {t.form.terms}{" "}
          <button type="button" className="linklike" onClick={() => setOpen(true)}>
            {t.form.termsLink}
          </button>
        </span>
      </label>
      <Sheet open={open} onClose={() => setOpen(false)} label={t.terms.title}>
        <div className="stack gap-16 terms-sheet">
          <h2 className="display d-md">{t.terms.title}</h2>
          <TermsBody />
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => {
              setTicked(true);
              setOpen(false);
            }}
          >
            {t.terms.acceptCta}
          </button>
        </div>
      </Sheet>
    </>
  );
}

export function readContact(f: FormData): Contact {
  const s = (k: string) => String(f.get(k) ?? "").trim();
  return { firstName: s("firstName"), lastName: s("lastName"), phone: s("phone"), email: s("email") || undefined };
}

export function readExtras(f: FormData) {
  const heard = HEARD_FROM.find((h) => h === f.get("heard")) as HeardFrom | undefined;
  return { heard, consent: f.get("consent") === "on", terms: f.get("terms") === "on", website: String(f.get("website") ?? "") };
}

/** What to remember on this device after a successful form. */
export const profileFrom = (c: Contact, x: ReturnType<typeof readExtras>): Partial<Profile> => ({
  firstName: c.firstName,
  lastName: c.lastName,
  phone: c.phone,
  ...(c.email ? { email: c.email } : {}),
  ...(x.heard ? { heard: x.heard } : {}),
  ...(x.consent ? { consented: true } : {}),
  ...(x.terms ? { termsAcceptedAt: new Date().toISOString(), termsVersion: siteConfig.policies.termsVersion } : {}),
});
