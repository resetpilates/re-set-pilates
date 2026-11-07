import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { planName } from "../components/blocks";
import { ShowAsPicker } from "./ClassDetail";
import { ContactFields, readContact } from "../components/forms";
import { LangToggle, Wordmark } from "../components/Shell";
import { Sheet, Switch } from "../components/ui";
import { planById } from "../config/pricing";
import { addressLine, siteConfig } from "../config/site";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";
import { planEnd, planUsage } from "../lib/plan";
import { trainerConfig } from "../config/trainer";
import { useTrainerCopy } from "../content/trainer";
import { allWeeks, buildWeeks, goalFor, nextAction, streaks, weekStart, type NextAction } from "../lib/trainer";
import { useTrainer } from "../lib/trainerStore";
import { toISO } from "../lib/booking";
import { useStore } from "../lib/store";

export default function Profile() {
  const { t, href, isHe, fmtDate } = useI18n();
  useSeo(t.meta.profile);
  const store = useStore();
  const [hint, setHint] = useState(false);
  const [signIn, setSignIn] = useState(false);
  // "Signed in" on this prototype = we know who you are (details saved on this device) or you hold a plan.
  const raw = store.profile.firstName.trim();
  const known = raw ? raw[0].toUpperCase() + raw.slice(1) : "";
  const signedIn = store.isMember || !!known;
  const submitSignIn = (e: FormEvent) => {
    e.preventDefault();
    const c = readContact(new FormData(e.currentTarget as HTMLFormElement));
    store.saveProfile({ firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email ?? "" });
    setSignIn(false);
  };
  const plan = store.planId ? planById(store.planId) : undefined;
  const receipts = store.receipts ?? [];
  const unread = (store.notices ?? []).filter((n) => !n.read).length;

  // Demo usage figures from local bookings; real balances come from the booking backend once connected.
  const usage = plan ? planUsage(plan, store.bookings, new Date(), store.planStart, store.carry ?? 0) : null;
  const pct = usage && usage.cap ? Math.min(1, usage.used / usage.cap) : 1;
  const since = store.memberSince ? new Date(store.memberSince) : null;
  const until = plan ? planEnd(plan, store.planStart) : new Date();

  return (
    <div className="page page--app tone-dark has-tabbar">
      <div className="wrap wrap--app stack gap-24 screen">
        <div className="row gap-16 profile-hello">
          <span className="avatar avatar--brand" aria-hidden>
            <Wordmark />
          </span>
          <span className="stack gap-4">
            <h1 className="display d-md">{known ? `${t.profile.hello} ${known}` : store.isMember ? t.profile.name : t.profile.guest}</h1>
            <span className="small muted">
              {since ? `${t.profile.memberSince} ${t.common.months[since.getMonth()]} ${since.getFullYear()}` : t.profile.guestSub}
            </span>
          </span>
        </div>

        {(store.notices ?? []).filter((n) => !n.read).slice(0, 3).map((n) => (
          <Link key={n.id} to={href(`receipt/${n.receiptNo}`)} className="notice row between gap-12" role="status">
            <span className="stack gap-4">
              <b>{t.receipt.notice.replace("{no}", n.receiptNo)}</b>
              <span className="tiny">{t.receipt.noticeSub}</span>
            </span>
            <span className="chev" aria-hidden />
          </Link>
        ))}

        {!signedIn && (
          <div className="card card--signedout stack gap-12">
            <h2 className="display d-sm">{t.profile.signedOut}</h2>
            <p className="small muted">{t.profile.signedOutSub}</p>
            <div className="row gap-8" style={{ flexWrap: "wrap" }}>
              <button className="btn btn--blue" style={{ flex: 1 }} onClick={() => setSignIn(true)}>
                {t.profile.signIn}
              </button>
              <Link to={href("pricing")} className="btn btn--dark" style={{ flex: 1 }}>
                {t.profile.signUp}
              </Link>
            </div>
          </div>
        )}

        {plan && usage ? (
          <div className="stack gap-12">
            <span className="eyebrow">{t.profile.membership}</span>
            <div className={`mcard mcard--member mcard--${plan.tone}`}>
              <div className="row between gap-12">
                <Wordmark />
                <span className="mcard__renew">
                  {plan.billingType === "monthly" ? t.profile.renews : t.profile.validUntil}{" "}
                  <b dir="ltr">
                    {until.getDate()}.{until.getMonth() + 1}
                  </b>
                </span>
              </div>
              <div className="stack gap-8">
                <span className="mcard__name">{planName(plan, t, store.planKind)}</span>
                <span className="mcard__usage">
                  {usage.cap === null ? (
                    <>
                      <b>{usage.used}</b> {t.profile.bookedWeek} · {t.profile.unlimitedNote}
                    </>
                  ) : (
                    <>
                      <b>
                        {usage.used} / {usage.cap}
                      </b>{" "}
                      {plan.billingType === "monthly" ? t.profile.bookedWeek : t.profile.bookedPass}
                    </>
                  )}
                </span>
                <span className="mcard__bar" aria-hidden>
                  <i style={{ width: `${Math.round(pct * 100)}%` }} />
                </span>
              </div>
            </div>
            <Link to={href("pricing")} className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start" }}>
              {t.profile.manage}
            </Link>
          </div>
        ) : signedIn ? (
          <div className="card stack gap-12">
            <h2 className="display d-sm">{t.profile.noPlan}</h2>
            <p className="small muted">{t.profile.noPlanSub}</p>
            <Link to={href("pricing")} className="btn btn--primary">
              {t.nav.pricing}
            </Link>
          </div>
        ) : null}

        {signedIn && (
          <Link to={href("receipt")} className="payfolder" aria-label={t.receipt.list}>
            <span className="payfolder__icon" aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <path d="M8 13h8M8 16h5" />
              </svg>
            </span>
            <span className="stack gap-4" style={{ flex: 1 }}>
              <b>{t.receipt.list}</b>
              <span className="tiny">
                {receipts.length
                  ? t.receipt.folderSub.replace("{n}", String(receipts.length)).replace("{date}", fmtDate(new Date(receipts[0].issuedAt)))
                  : t.receipt.folderEmpty}
              </span>
            </span>
            {unread > 0 && <span className="payfolder__badge">{unread} {t.receipt.unread}</span>}
            <span className="chev" aria-hidden />
          </Link>
        )}

        <ProgressCard done={store.past.length} />

        <div className="card rows" style={{ paddingBlock: 4 }}>
          <Link to={href("my")}>
            {t.nav.myClasses}
            <span className="chev" aria-hidden />
          </Link>
          <Link to={href("#first-class")}>
            {t.home.heroSecondary}
            <span className="chev" aria-hidden />
          </Link>
          <div>
            {t.profile.language}
            <LangToggle />
          </div>
          <div className="stack gap-8" style={{ alignItems: "stretch" }}>
            <span>{t.schedule.showAsTitle}</span>
            <ShowAsPicker value={store.profile.showAs ?? "short"} onChange={(v) => store.saveProfile({ showAs: v })} name={store.profile.firstName ? store.profile : undefined} label={false} />
          </div>
          <div>
            {t.profile.notifications}
            <Switch checked={store.reminders} onChange={store.setReminders} label={t.profile.notifications} />
          </div>
          <Link to={href("gift")}>
            {t.nav.gift}
            <span className="chev" aria-hidden />
          </Link>
          <Link to={href("about")}>
            {t.nav.about}
            <span className="chev" aria-hidden />
          </Link>
          <Link to={href("faq")}>
            {t.nav.faq}
            <span className="chev" aria-hidden />
          </Link>
          <Link to={href("contact")}>
            {t.nav.contact}
            <span className="chev" aria-hidden />
          </Link>
          <button onClick={() => setHint(!hint)} aria-expanded={hint}>
            {t.profile.install}
            <span className="chev" aria-hidden />
          </button>
        </div>
        {hint && <p className="notice screen">{t.profile.installHint}</p>}

        {siteConfig.flags.demoMode && (
          <button className="btn btn--ghost btn--sm" style={{ border: "1px dashed var(--line-strong)" }} onClick={() => store.setPlan(store.isMember ? null : "m3x")}>
            {t.profile.demo}
          </button>
        )}
        {signedIn && (
          <div className="card stack gap-8">
            <button
              className="btn btn--secondary"
              onClick={() => {
                if (confirm(t.profile.signOutConfirm)) store.signOut();
              }}
            >
              {t.profile.signOut}
            </button>
            <p className="tiny muted center">{t.profile.signOutSub}</p>
          </div>
        )}
        <p className="tiny center">{addressLine(isHe)}</p>

        <Sheet open={signIn} onClose={() => setSignIn(false)} label={t.profile.signInTitle}>
          <form className="stack gap-16" onSubmit={submitSignIn}>
            <h2 className="display d-md">{t.profile.signInTitle}</h2>
            <p className="small muted">{t.profile.signInSub}</p>
            <ContactFields id="signin" profile={store.profile} />
            <button className="btn btn--primary btn--block">{t.profile.signInCta}</button>
          </form>
        </Sheet>
      </div>
    </div>
  );
}

/** Class milestones, the next one shown as a target. */
const MILESTONES = [5, 10, 25, 50, 100];

/**
 * "My progress": three numbers from the AI trainer (classes, week streak, this week against the goal) and the trainer's
 * one next step. Everything is computed by `src/lib/trainer.ts`, the same logic as the progress page.
 */
function ProgressCard({ done }: { done: number }) {
  const { t, href } = useI18n();
  const c = useTrainerCopy();
  const tr = useTrainer();
  const store = useStore();
  const now = new Date();
  const sessions = tr.allSessions;
  const attended = Math.max(done, sessions.filter((s) => s.status === "attended").length);
  const weeks = buildWeeks(sessions, tr.goals, tr.pauses, now, trainerConfig.consistency.graphWeeks);
  const streak = tr.onboarded ? streaks(allWeeks(sessions, tr.goals, tr.pauses, now)).current : 0;
  const week = weeks[weeks.length - 1];
  const goal = goalFor(toISO(weekStart(now)), tr.goals);
  const action: NextAction = tr.onboarded
    ? nextAction({ onboarded: true, reviews: tr.reviews, sessions, checkins: tr.checkins, assessments: tr.assessments, weeks, hasUpcoming: store.upcoming.length > 0, now, resourceId: "r1" })
    : { kind: "onboarding" };
  const [nextTitle] = c.actions[action.kind];
  const next = MILESTONES.find((m) => m > attended);
  const line = attended === 0 ? t.profile.progressStart : next ? t.profile.progressNext.replace("{n}", String(next - attended)).replace("{m}", String(next)) : t.profile.progressTop;
  return (
    <Link to={href("progress")} className="nextstep nextstep--progress pgcard" aria-label={`${t.nav.progress}. ${line}`}>
      <span className="pgcard__head">
        <span className="pgcard__logo" aria-hidden>
          <Wordmark />
        </span>
        <b className="nextstep__title">{t.nav.progress}</b>
        <span className="chev" aria-hidden />
      </span>
      <span className="pgcard__stats">
        <span className="pgcard__stat">
          <b>{attended}</b>
          <small>{c.g1.sessions}</small>
        </span>
        <span className="pgcard__stat">
          <b>{streak}</b>
          <small>{c.g1.streak}</small>
        </span>
        <span className="pgcard__stat">
          <b>
            {week?.attended ?? 0}
            {goal ? <i>/{goal}</i> : null}
          </b>
          <small>{c.g1.thisWeek.replace(/\s*\(.*\)$/, "")}</small>
        </span>
      </span>
      <span className="pgcard__next">
        <span className="pgcard__ai">{c.dash.next}</span>
        <span className="pgcard__line">{nextTitle}</span>
        {next && <span className="pgcard__tiny">{line}</span>}
      </span>
    </Link>
  );
}
