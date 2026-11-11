import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHead, useTurnstile } from "../components/blocks";
import { ContactFields, readContact, TermsField } from "../components/forms";
import { Check, YesNo } from "../components/ui";
import { siteConfig, waLink } from "../config/site";
import { track } from "../lib/analytics";
import {
  CLEARANCE_QUESTIONS,
  HEALTH_VERSION,
  PREGNANCY,
  guardianMissing,
  healthValid,
  renewSoon,
  needsClearance,
  validUntil,
  fmtValid,
  type HealthAnswers,
  type Pregnancy,
} from "../lib/health";
import { useI18n } from "../lib/i18n";
import { relay } from "../lib/relay";
import { normalizePhone } from "../lib/relayTypes";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";

type Draft = Partial<HealthAnswers>;
const YES_NO = [...CLEARANCE_QUESTIONS, "injury", "adult"] as const;

/**
 * Health declaration (הצהרת בריאות): yes/no questions before the first class, confirmed with a checkbox (no signature).
 * Saved on this device and sent to the studio's restricted Airtable table "Health & Consent".
 * `?next=` is where to go back to afterwards (e.g. the class being booked).
 */
export default function Health() {
  const { t, href, lang } = useI18n();
  useSeo(t.meta.health);
  const store = useStore();
  const [params] = useSearchParams();
  const next = params.get("next");
  // Back to the class or the checkout that sent the member here (an app path, never another site)
  const back = next && /^[a-z0-9_-][a-z0-9/_?=&.-]*$/i.test(next) ? href(next) : null;
  const toCheckout = !!next?.startsWith("checkout/");
  const turnstile = useTurnstile(true);
  const [bot, setBot] = useState(false);
  const prev = store.profile.health;
  // Editing a current declaration starts from its answers; a renewal (expired or new wording) starts blank, so every question is read again.
  const [a, setA] = useState<Draft>(() => (healthValid(prev) && !renewSoon(prev) ? { ...prev?.answers } : {}));
  const [attempt, setAttempt] = useState(0);
  const [queued, setQueued] = useState(false);
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [guardianOk, setGuardianOk] = useState(false);
  // The studio terms are accepted here too, every year with the declaration, so both are done before the first payment
  const [terms, setTerms] = useState(false);
  const needsDetails = !store.profile.firstName || !store.profile.lastName || !store.profile.phone;
  const set = <K extends keyof HealthAnswers>(k: K, v: HealthAnswers[K]) => setA((p) => ({ ...p, [k]: v }));

  const missing = (k: (typeof YES_NO)[number] | "pregnancy" | "injuryNote") => {
    if (k === "pregnancy") return !a.pregnancy;
    if (k === "injuryNote") return a.injury === true && !a.injuryNote?.trim();
    return typeof a[k] !== "boolean";
  };
  const guardianPhoneBad = a.adult === false && !!a.guardianPhone?.trim() && !normalizePhone(a.guardianPhone);
  const guardianBad = () => a.adult === false && (guardianMissing(a as HealthAnswers) || guardianPhoneBad || !guardianOk);
  const complete = () => [...YES_NO, "pregnancy" as const, "injuryNote" as const].every((k) => !missing(k)) && !guardianBad() && confirmed && terms;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // Our own check (the form is noValidate) so every missing answer is marked at once, not only the first box
    const form = e.currentTarget as HTMLFormElement;
    if (!complete() || (needsDetails && !form.checkValidity())) {
      if (needsDetails) form.reportValidity();
      setTried(true);
      setAttempt((n) => n + 1); // scrolls once the error marks have rendered (see the effect below)
      return;
    }
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const c = needsDetails ? readContact(f) : { firstName: store.profile.firstName, lastName: store.profile.lastName, phone: store.profile.phone, email: store.profile.email || undefined };
    const answers: HealthAnswers = {
      ...(a as HealthAnswers),
      injuryNote: a.injury ? a.injuryNote?.trim() : undefined,
      guardianName: a.adult ? undefined : a.guardianName?.trim(),
      guardianPhone: a.adult ? undefined : a.guardianPhone?.trim(),
    };
    setSending(true);
    setFailed(false);
    setBot(false);
    const ref = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const r = await relay("health-declaration", { lang, contact: c, version: HEALTH_VERSION, answers, termsAccepted: true, termsVersion: siteConfig.policies.termsVersion, turnstile: turnstile.token, declarationId: ref }, { ref });
    setSending(false);
    if (!r.ok && !r.queued) {
      if (r.error === "turnstile") setBot(true);
      else setFailed(true);
      return;
    }
    const now = new Date();
    store.saveProfile({
      ...(needsDetails ? { firstName: c.firstName, lastName: c.lastName, phone: c.phone, ...(c.email ? { email: c.email } : {}) } : {}),
      termsAcceptedAt: now.toISOString(),
      termsVersion: siteConfig.policies.termsVersion,
      // Offline: kept on the phone but not counted until the outbox delivers it
      health: { at: now.toISOString(), version: HEALTH_VERSION, validUntil: validUntil(now), clearance: needsClearance(answers), answers, ref, ...(r.queued ? { queued: true } : {}) },
    });
    setQueued(!!r.queued);
    track("health_declared", { clearance: needsClearance(answers) });
    setDone(true);
    scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (attempt) document.querySelector(".q--err")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [attempt]);

  const h = store.profile.health;
  if (done && h && queued)
    return (
      <div className="page page--app tone-dark has-tabbar">
        <div className="wrap wrap--app pbody screen">
          <div className="stack gap-16 center" style={{ paddingTop: 40 }}>
            <h1 className="display d-md">{t.health.queuedTitle}</h1>
            <p className="muted">{t.health.queuedSub}</p>
            <Link to={href("schedule")} className="btn btn--secondary btn--block">
              {t.nav.schedule}
            </Link>
          </div>
        </div>
      </div>
    );
  if (done && h)
    return (
      <div className="page page--app tone-dark has-tabbar">
        <div className="wrap wrap--app pbody screen">
          <div className="stack gap-16 center" style={{ paddingTop: 40 }}>
            <Check />
            <h1 className="display d-md">{h.clearance ? t.health.doneClearanceTitle : t.health.doneTitle}</h1>
            <p className="muted">{t.health.doneSub}</p>
            <p className="tiny">{t.health.validUntil.replace("{date}", fmtValid(h.validUntil))}</p>
            {h.clearance && (
              <div className="notice stack gap-8" role="status" style={{ textAlign: "start" }}>
                <b>{t.health.clearanceTitle}</b>
                <span className="small">{t.health.clearanceSub}</span>
                <a className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start" }} href={waLink(t.health.waText)} target="_blank" rel="noreferrer">
                  {t.health.clearanceWa}
                </a>
              </div>
            )}
            <Link to={back ?? href("schedule")} className="btn btn--sand btn--block">
              {back ? (toCheckout ? t.health.backCheckout : t.health.back) : t.checkout.doneCta}
            </Link>
          </div>
        </div>
      </div>
    );

  const yesNo = (k: (typeof YES_NO)[number], label: string) => (
    <div key={k} className={`q stack gap-12 ${tried && missing(k) ? "q--err" : ""}`}>
      <span id={`hq-${k}`} className="q__label">
        {label}
      </span>
      <YesNo value={a[k]} onChange={(b) => set(k, b)} labelledBy={`hq-${k}`} yes={t.health.yes} no={t.health.no} />
    </div>
  );

  return (
    <div className="page tone-dark has-tabbar">
      <PageHead title={t.health.title} sub={t.health.sub} app />
      <div className="wrap wrap--app pbody screen">
        <form className="stack gap-24 health" onSubmit={submit} noValidate>
          {prev && (!healthValid(prev) || renewSoon(prev)) && (
            <p className="notice" role="status">
              {healthValid(prev) ? t.health.renewBy.replace("{date}", fmtValid(prev.validUntil)) : t.health.expired}
            </p>
          )}
          {needsDetails && (
            <fieldset className="stack gap-12" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="eyebrow" style={{ marginBottom: 12 }}>
                {t.form.yourDetails}
              </legend>
              <ContactFields id="hd" profile={store.profile} email="none" />
            </fieldset>
          )}

          {CLEARANCE_QUESTIONS.map((k) => yesNo(k, t.health.q[k]))}

          <div className={`q stack gap-12 ${tried && missing("pregnancy") ? "q--err" : ""}`}>
            <span id="hq-pregnancy" className="q__label">
              {t.health.q.pregnancy}
            </span>
            <div className="opts" role="radiogroup" aria-labelledby="hq-pregnancy">
              {PREGNANCY.map((p: Pregnancy) => (
                <button key={p} type="button" className="opt" role="radio" aria-checked={a.pregnancy === p} onClick={() => set("pregnancy", p)}>
                  {t.health.pregnancyOpts[p]}
                </button>
              ))}
            </div>
          </div>

          {yesNo("injury", t.health.q.injury)}
          {a.injury && (
            <div className={`field ${tried && missing("injuryNote") ? "q--err" : ""}`}>
              <label htmlFor="hq-note">{t.health.injuryNote}</label>
              <textarea id="hq-note" className="input" rows={3} maxLength={400} value={a.injuryNote ?? ""} onChange={(e) => set("injuryNote", e.target.value)} />
            </div>
          )}

          {yesNo("adult", t.health.q.adult)}
          {a.adult === false && (
            <fieldset className={`card stack gap-12 ${tried && guardianBad() ? "q--err" : ""}`} style={{ margin: 0 }}>
              <legend className="eyebrow">{t.health.guardianTitle}</legend>
              <p className="small muted">{t.health.guardianSub}</p>
              <div className="field">
                <label htmlFor="hq-gname">{t.health.guardianName}</label>
                <input id="hq-gname" className="input" maxLength={80} value={a.guardianName ?? ""} onChange={(e) => set("guardianName", e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="hq-gphone">{t.health.guardianPhone}</label>
                <input id="hq-gphone" className="input" type="tel" inputMode="tel" dir="ltr" maxLength={16} autoComplete="off" value={a.guardianPhone ?? ""} onChange={(e) => set("guardianPhone", e.target.value)} aria-invalid={guardianPhoneBad} />
                {guardianPhoneBad && tried && <span className="tiny hi">{t.health.guardianPhoneBad}</span>}
              </div>
              <label className="tick">
                <input type="checkbox" checked={guardianOk} onChange={(e) => setGuardianOk(e.currentTarget.checked)} />
                <span>{t.health.guardianConfirm}</span>
              </label>
            </fieldset>
          )}

          <label className={`tick tick--consent ${tried && !confirmed ? "q--err" : ""}`}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.currentTarget.checked)} />
            <span>{t.health.confirm}</span>
          </label>
          <div className={tried && !terms ? "q--err" : ""}>
            <TermsField profile={store.profile} always onTicked={setTerms} />
          </div>
          {tried && !complete() && (
            <p className="small hi" role="alert">
              {t.health.answerAll}
            </p>
          )}
          <div ref={turnstile.ref} />
          <button className="btn btn--sand btn--block" disabled={sending}>
            {sending ? t.form.sending : t.health.submit}
          </button>
          {(failed || bot) && (
            <p className="small center" role="alert">
              {bot ? t.contact.errBot : t.form.failed}
            </p>
          )}
          <p className="tiny center muted">
            {t.health.draft} · {HEALTH_VERSION} · {siteConfig.contact.phone}
          </p>
        </form>
      </div>
    </div>
  );
}
