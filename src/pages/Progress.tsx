import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConsistencyChart, RecoveryChart } from "../components/charts";
import { PageHead } from "../components/blocks";
import { Sheet, Switch } from "../components/ui";
import { siteConfig } from "../config/site";
import { resources, trainerConfig } from "../config/trainer";
import { useTrainerCopy, type TrainerCopy } from "../content/trainer";
import { track } from "../lib/analytics";
import { fromISO, slotStart, toISO } from "../lib/booking";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import {
  allWeeks,
  attendanceRisk,
  buildWeeks,
  comparable,
  composite,
  deriveMilestones,
  goalFor,
  initialLevel,
  nextAction,
  paidCardAllowed,
  safetyHold,
  streaks,
  trend4,
  weekStart,
  weeklyRecap,
  type Assessment,
  type Milestone,
  type NextAction,
  type Session,
} from "../lib/trainer";
import { useTrainer } from "../lib/trainerStore";
import { Scale } from "./Onboarding";

const fmtShort = (iso: string) => {
  const d = fromISO(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`;
};

export function milestoneLabel(m: Milestone, c: TrainerCopy) {
  if (m.type === "sessions") return c.ms.sessions(m.value!);
  if (m.type === "streak") return c.ms.streak(m.value!);
  return c.ms[m.type];
}

export default function Progress() {
  const c = useTrainerCopy();
  const tr = useTrainer();
  useSeo({ title: `${c.nav} | re:set pilates`, desc: c.intro.sub });
  return tr.onboarded ? <Dashboard /> : <Intro />;
}

function Intro() {
  const { href } = useI18n();
  const c = useTrainerCopy();
  const tr = useTrainer();
  const started = tr.stepsDone > 0;
  return (
    <div className="page tone-dark has-tabbar">
      <PageHead title={c.nav} app />
      <div className="wrap wrap--app pbody stack gap-24 screen">
        <h2 className="display d-sm">{c.intro.title}</h2>
        <p className="muted">{c.intro.sub}</p>
        <ul className="ticks">
          {c.intro.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <Link to={href("progress/start")} className="btn btn--primary btn--go btn--block">
          {started ? c.intro.resume : c.intro.start}
        </Link>
        {siteConfig.flags.demoMode && (
          <button className="btn btn--ghost btn--sm" style={{ border: "1px dashed var(--line-strong)" }} onClick={tr.loadSample}>
            {c.intro.sample}
          </button>
        )}
        <p className="tiny">{c.scope}</p>
        <p className="tiny">{c.deviceNote}</p>
      </div>
    </div>
  );
}

function Dashboard() {
  const { href, isHe, fmtDate, t } = useI18n();
  const c = useTrainerCopy();
  const tr = useTrainer();
  const store = useStore();
  const now = useMemo(() => new Date(), []);
  const [sheet, setSheet] = useState<null | "checkin" | "goal" | "details" | "share">(null);
  const [checkinFor, setCheckinFor] = useState<string | null>(null);

  const sessions = tr.allSessions;
  const weeks = useMemo(() => buildWeeks(sessions, tr.goals, tr.pauses, now, trainerConfig.consistency.graphWeeks), [sessions, tr.goals, tr.pauses, now]);
  const every = useMemo(() => allWeeks(sessions, tr.goals, tr.pauses, now), [sessions, tr.goals, tr.pauses, now]);
  // Weeks before the member started (first class or sign-up) are never judged
  const firstWeek = [toISO(weekStart(new Date(tr.onboardedAt!))), ...sessions.filter((s) => s.status === "attended").map((s) => toISO(weekStart(fromISO(s.date))))].sort()[0];
  const active = weeks.filter((w) => w.start >= firstWeek);
  const streak = streaks(every);
  const avg = trend4(active);
  const startedWithPain = tr.answers.H1 === true;
  const milestones = useMemo(
    () => deriveMilestones({ sessions, weeks: every, assessments: tr.assessments, checkins: tr.checkins, startedWithPain }),
    [sessions, every, tr.assessments, tr.checkins, startedWithPain],
  );
  const hold = safetyHold(tr.reviews);
  const resource = resources[0];
  const action = nextAction({
    onboarded: true,
    reviews: tr.reviews,
    sessions,
    checkins: tr.checkins,
    assessments: tr.assessments,
    weeks,
    hasUpcoming: store.upcoming.length > 0,
    now,
    resourceId: resource.id,
  });
  const recap = weeklyRecap(active, milestones, streak.current);
  const goal = goalFor(toISO(weekStart(now)), tr.goals);
  const primary = tr.answers.G2 as string | undefined;
  const paid = paidCardAllowed({ paidSuggestions: tr.answers.S7 === true, reviews: tr.reviews });
  const notes = tr.notes.filter((n) => n.visibility === "client").sort((a, b) => b.at.localeCompare(a.at));

  // Milestones earned since the last visit get a "New" badge once, then count as seen
  const [fresh] = useState(() => new Set(milestones.filter((m) => !tr.seenMilestones.includes(m.id)).map((m) => m.id)));
  useEffect(() => {
    track("progress_view");
    fresh.forEach((id) => track("milestone_earned", { milestone: id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const milestoneIds = milestones.map((m) => m.id).join(",");
  useEffect(() => {
    tr.markSeen(milestoneIds ? milestoneIds.split(",") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestoneIds]);
  useEffect(() => {
    if (tr.answers.S7 === true && !hold) track("recommendation_view", { kind: "catalog_link" });
  }, [tr.answers.S7, hold]);

  const openCheckin = (sessionId?: string) => {
    setCheckinFor(sessionId ?? null);
    setSheet("checkin");
  };
  const upcoming = store.upcoming[0];

  return (
    <div className="page tone-dark has-tabbar">
      <PageHead title={c.nav} app />
      <div className="wrap wrap--app pbody stack gap-24 screen">
        <div className="row between gap-12 wrap-row">
          <span className="small muted">
            {tr.answers.A1 ? String(tr.answers.A1).split(" ")[0] : ""}
          </span>
          {tr.sample && <span className="badge badge--outline">{c.sampleBadge}</span>}
        </div>

        {hold && (
          <div className="hold stack gap-8" role="status">
            <b>{c.dash.hold}</b>
            <p className="small">{c.dash.holdSub}</p>
            <p className="small">{c.dash.stop}</p>
            <span className="tiny">{c.dash.stopDraft}</span>
          </div>
        )}

        {/* Above the graphs: goal, one win, one next step, next class */}
        <div className="pgrid">
          <div className="card stack gap-8">
            <span className="eyebrow">{c.dash.goalLabel}</span>
            <b className="key">{primary ? c.ob.opts.G1[primary] : "·"}</b>
            <div className="row between gap-8">
              <span className="small muted">
                {c.dash.weekly}: <b className="nums">{goal ?? "·"}</b> {c.dash.perWeek}
              </span>
              <button className="link-btn" onClick={() => setSheet("goal")}>
                {c.dash.change}
              </button>
            </div>
          </div>
          <div className="card stack gap-8">
            <span className="eyebrow">{c.dash.recentWin}</span>
            {milestones[0] ? (
              <>
                <b className="key">{milestoneLabel(milestones[0], c)}</b>
                <span className="small muted">{fmtShort(milestones[0].earnedAt)}</span>
              </>
            ) : streak.current > 0 ? (
              <b className="key">{c.dash.streakWeeks(streak.current)}</b>
            ) : (
              <span className="small muted">{c.dash.noWinYet}</span>
            )}
          </div>
        </div>

        <NextStep action={action} c={c} onCheckin={openCheckin} />

        <div className="card row gap-16">
          <span className="date-tile" aria-hidden>
            {upcoming ? (
              <>
                {t.common.dows[fromISO(upcoming.date).getDay()]}
                <b>{fromISO(upcoming.date).getDate()}</b>
              </>
            ) : (
              "·"
            )}
          </span>
          <span className="stack gap-4" style={{ flex: 1 }}>
            <span className="eyebrow">{c.dash.nextClass}</span>
            {upcoming ? (
              <span className="small">
                {t.services.items[upcoming.service].name} · {fmtDate(slotStart(upcoming))} · <span className="nums">{upcoming.time}</span>
              </span>
            ) : (
              <Link to={href("schedule")} className="small hi">
                {c.dash.noUpcoming} →
              </Link>
            )}
          </span>
        </div>

        {notes[0] && (
          <figure className="note">
            <figcaption className="eyebrow">{c.dash.fromInstructor}</figcaption>
            <blockquote>{isHe ? notes[0].text.he : notes[0].text.en}</blockquote>
            <span className="tiny">
              {notes[0].author} · {fmtShort(notes[0].at.slice(0, 10))}
            </span>
          </figure>
        )}

        {recap && (
          <div className="card stack gap-8">
            <span className="eyebrow">{c.dash.recap} · {fmtShort(recap.week.start)}</span>
            <b className="key">{recap.week.paused ? c.dash.recapPaused : c.dash.recapLine(recap.week.attended, recap.week.goal)}</b>
            {recap.win && <span className="small">✦ {milestoneLabel(recap.win, c)}</span>}
            {recap.streak > 0 && <span className="small muted">{c.dash.streakWeeks(recap.streak)}</span>}
            {recap.flat && (
              <>
                <p className="small">{c.dash.recapFlat}</p>
                <Link to={href("contact")} className="small hi">
                  {c.dash.recapFlatCta} →
                </Link>
              </>
            )}
          </div>
        )}

        <h2 className="display d-sm">{c.dash.graphsTitle}</h2>

        <section className="card stack gap-12" aria-labelledby="g1">
          <div className="stack gap-4">
            <h3 id="g1" className="key">{c.g1.title}</h3>
            <span className="tiny">{c.g1.sub}</span>
          </div>
          <div className="kpis">
            <span><b className="nums">{streak.current}</b> {c.g1.streak} ({c.g1.weeksUnit})</span>
            <span><b className="nums">{streak.longest}</b> {c.g1.longest}</span>
            <span><b className="nums">{avg == null ? "·" : avg.toFixed(1)}</b> {c.g1.avg}</span>
          </div>
          {sessions.some((s) => s.status === "attended") ? <ConsistencyChart weeks={weeks} /> : <p className="small muted">{c.g1.empty}</p>}
        </section>

        <section className="card stack gap-12" aria-labelledby="g4">
          <div className="row between gap-12">
            <span className="stack gap-4">
              <h3 id="g4" className="key">{c.g4.title}</h3>
              <span className="tiny">{c.g4.sub}</span>
            </span>
            <button className="btn btn--secondary btn--sm" onClick={() => openCheckin()}>
              {c.dash.checkin}
            </button>
          </div>
          <RecoveryChart checkins={tr.checkins} sessions={sessions} />
        </section>

        <BaselineCard assessments={tr.assessments} pending={tr.baselineMode === "studio"} c={c} />

        <section className="stack gap-12" aria-labelledby="ms">
          <h2 id="ms" className="eyebrow">{c.dash.milestones}</h2>
          {milestones.length === 0 ? (
            <p className="small muted">{c.dash.noMilestones}</p>
          ) : (
            <ol className="timeline">
              {milestones.map((m) => (
                <li key={m.id}>
                  <span className="medal" aria-hidden>✦</span>
                  <span className="stack">
                    <b>{milestoneLabel(m, c)}</b>
                    <span className="tiny">{fmtShort(m.earnedAt)}</span>
                  </span>
                  {fresh.has(m.id) && <span className="badge">{c.dash.newBadge}</span>}
                </li>
              ))}
            </ol>
          )}
          {milestones.length > 0 && (
            <button className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setSheet("share")}>
              {c.dash.share}
            </button>
          )}
        </section>

        <section className="stack gap-12" aria-labelledby="res">
          <h2 id="res" className="eyebrow">{c.dash.resources}</h2>
          <div className="card rows" style={{ paddingBlock: 4 }}>
            {resources.map((r) => (
              <div key={r.id}>
                <span className="stack">
                  <span>{isHe ? r.titleHe : r.titleEn}</span>
                  <span className="tiny">
                    {r.minutes} {t.common.min} · {c.dash.included}
                  </span>
                </span>
                <span className="badge badge--outline">{r.approved ? c.dash.included : c.dash.soon}</span>
              </div>
            ))}
          </div>
        </section>

        {/* At most one paid card. Without catalog/entitlement sync it is a plain price-list link. */}
        {tr.answers.S7 === true && !hold && (
          <div className="card stack gap-8">
            <div className="row between gap-8">
              <span className="key">{c.dash.catalogTitle}</span>
              <span className="badge badge--blush">{c.dash.paid}</span>
            </div>
            <p className="small muted">{c.dash.catalogSub}</p>
            <Link to={href("pricing")} className="small hi" data-reason={paid.ok ? "eligible" : paid.reason}>
              {c.dash.catalogCta} →
            </Link>
          </div>
        )}

        <button className="btn btn--secondary btn--block" onClick={() => setSheet("details")}>
          {c.dash.details}
        </button>
        {tr.sample && <p className="tiny">{c.dash.dataNote}</p>}
        <p className="tiny">{c.scope}</p>
        <p className="tiny">{c.deviceNote}</p>
      </div>

      <Sheet open={sheet === "checkin"} onClose={() => setSheet(null)} label={c.ck.title}>
        {sheet === "checkin" && <CheckinForm initial={checkinFor} sessions={sessions} onClose={() => setSheet(null)} />}
      </Sheet>
      <Sheet open={sheet === "goal"} onClose={() => setSheet(null)} label={c.dash.weekly}>
        <div className="stack gap-16">
          <h2 className="display d-sm">{c.ob.q.S1}</h2>
          <p className="small muted">{c.ob.hint.S1}</p>
          <div className="opts">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className="opt"
                aria-pressed={goal === n}
                onClick={() => {
                  tr.setGoal(n);
                  setSheet(null);
                }}
              >
                {c.ob.opts.S1[String(n)]}
              </button>
            ))}
          </div>
        </div>
      </Sheet>
      <Sheet open={sheet === "details"} onClose={() => setSheet(null)} label={c.details.title}>
        {sheet === "details" && <Details sessions={sessions} risk={attendanceRisk(active)} />}
      </Sheet>
      <Sheet open={sheet === "share"} onClose={() => setSheet(null)} label={c.share.title}>
        {sheet === "share" && <ShareCard sessions={sessions} streak={streak.current} />}
      </Sheet>
    </div>
  );
}

function NextStep({ action, c, onCheckin }: { action: NextAction; c: TrainerCopy; onCheckin: (id?: string) => void }) {
  const { href } = useI18n();
  const [title, cta] = c.actions[action.kind];
  const sub =
    action.kind === "reassess" ? c.actionSub.reassess(action.weeks) : action.kind === "book" ? c.actionSub.book(action.left) : c.actionSub[action.kind];
  const to: Record<NextAction["kind"], string> = {
    onboarding: "progress/start",
    review: "contact",
    checkin: "",
    baseline: "progress/start?step=baseline",
    reassess: "schedule",
    book: "schedule",
    resource: "progress",
  };
  return (
    <div className="nextstep stack gap-8">
      <span className="eyebrow">{c.dash.next}</span>
      <b className="display d-sm">{title}</b>
      <p className="small">{sub}</p>
      {action.kind === "checkin" ? (
        <button className="btn btn--dark btn--block" onClick={() => onCheckin(action.sessionId)}>
          {cta}
        </button>
      ) : action.kind === "resource" ? (
        <span className="badge badge--outline" style={{ alignSelf: "flex-start" }}>{c.dash.soon}</span>
      ) : (
        <Link to={href(to[action.kind])} className="btn btn--dark btn--block">
          {cta}
        </Link>
      )}
    </div>
  );
}

function BaselineCard({ assessments, pending, c }: { assessments: Assessment[]; pending: boolean; c: TrainerCopy }) {
  const sorted = [...assessments].sort((a, b) => a.date.localeCompare(b.date));
  const base = sorted.find((a) => a.type === "baseline") ?? sorted[0];
  const latest = sorted[sorted.length - 1];
  if (!base)
    return (
      <section className="card card--dashed stack gap-8">
        <h3 className="key">{c.baseline.title}</h3>
        <p className="small muted">{pending ? c.baseline.pending : c.baseline.none}</p>
      </section>
    );
  const both = latest !== base && comparable(base, latest);
  const cols = both ? [base, latest] : [base];
  const u = c.ob.units;
  const row = (label: string, f: (a: Assessment) => string) => (
    <tr>
      <th scope="row">{label}</th>
      {cols.map((a) => (
        <td key={a.id} className="nums" dir="ltr">{f(a)}</td>
      ))}
    </tr>
  );
  const n = (v: number | null, unit: string) => (v == null ? "·" : `${v} ${unit}`);
  const r = (v: number | null) => (v == null ? "·" : `${v}/5`);
  return (
    <section className="card stack gap-12" aria-labelledby="bl">
      <div className="row between gap-8">
        <h3 id="bl" className="key">{c.baseline.title}</h3>
        {base.source === "self" && <span className="badge badge--outline">{c.baseline.self}</span>}
      </div>
      <table className="chart__table chart__table--bl">
        <thead>
          <tr>
            <th />
            {cols.map((a, i) => (
              <th key={a.id} scope="col">
                {i === 0 ? c.baseline.start : c.baseline.latest}
                <br />
                <span className="tiny">{fmtShort(a.date)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row(c.baseline.axes.plank, (a) => n(a.plankS, u.s))}
          {row(`${c.baseline.axes.balance} (${c.baseline.left})`, (a) => n(a.balanceLeftS, u.s))}
          {row(`${c.baseline.axes.balance} (${c.baseline.right})`, (a) => n(a.balanceRightS, u.s))}
          {row(c.baseline.axes.reach, (a) => n(a.sitReachCm, u.cm))}
          {row(c.baseline.axes.shoulder, (a) => r(a.shoulder))}
          {row(c.baseline.axes.hip, (a) => r(a.hip))}
          {row(c.baseline.score, (a) => (composite(a) == null ? "·" : `${composite(a)}/100`))}
        </tbody>
      </table>
      {cols.some((a) => composite(a) == null) && <p className="tiny">{c.baseline.incomplete}</p>}
      <p className="tiny">{c.baseline.scoreNote}</p>
    </section>
  );
}

function CheckinForm({ initial, sessions, onClose }: { initial: string | null; sessions: Session[]; onClose: () => void }) {
  const c = useTrainerCopy();
  const tr = useTrainer();
  const recent = sessions
    .filter((s) => s.status === "attended")
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
    .slice(0, 5);
  const [sid, setSid] = useState(initial ?? recent[0]?.id ?? "");
  const [energy, setEnergy] = useState<number | null>(null);
  const [soreness, setSoreness] = useState<number | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  const [where, setWhere] = useState<string[]>([]);
  const [result, setResult] = useState<null | "ok" | "alert">(null);
  const [tried, setTried] = useState(false);
  const painRequired = tr.answers.H1 === true;

  if (!recent.length) return <p className="small muted">{c.g4.empty}</p>;
  if (result)
    return (
      <div className="stack gap-16">
        <h2 className="display d-sm">{result === "alert" ? c.ck.alertTitle : c.ck.thanks}</h2>
        {result === "alert" && (
          <>
            <p className="small">{c.ck.alertSub}</p>
            <p className="small">{c.dash.stop}</p>
            <span className="tiny">{c.dash.stopDraft}</span>
          </>
        )}
        <button className="btn btn--primary btn--block" onClick={onClose}>
          {c.ob.toDashboard}
        </button>
      </div>
    );

  const save = () => {
    if (painRequired && pain == null) return setTried(true);
    const opened = tr.addCheckin({ sessionId: sid, timing: "post", energy, soreness, pain, painLocations: pain ? where : [] });
    // Health values never go to analytics: only that a check-in happened
    track("checkin_submit");
    setResult(opened.length || (pain != null && pain >= trainerConfig.safety.painAlertAt) ? "alert" : "ok");
  };

  return (
    <div className="stack gap-16">
      <h2 className="display d-sm">{c.ck.title}</h2>
      <label className="field">
        <span className="small">{c.ck.which}</span>
        <select className="input" value={sid} onChange={(e) => setSid(e.target.value)}>
          {recent.map((s) => (
            <option key={s.id} value={s.id}>
              {fmtShort(s.date)} · {s.time}
            </option>
          ))}
        </select>
      </label>
      <div className="q stack gap-8">
        <span className="q__label" id="ck-e-l">{c.ck.energy}</span>
        <span className="tiny">{c.ck.energyHint}</span>
        <Scale id="ck-e" min={1} max={5} value={energy} onChange={setEnergy} />
      </div>
      <div className="q stack gap-8">
        <span className="q__label" id="ck-s-l">{c.ck.soreness}</span>
        <span className="tiny">{c.ck.sorenessHint}</span>
        <Scale id="ck-s" min={0} max={10} value={soreness} onChange={setSoreness} />
      </div>
      <div className="q stack gap-8">
        <span className="q__label" id="ck-p-l">{c.ck.pain}</span>
        <span className="tiny">{c.ck.painHint}</span>
        {painRequired && <span className="tiny">{c.ck.painRequired}</span>}
        <Scale id="ck-p" min={0} max={10} value={pain} onChange={setPain} />
        {tried && pain == null && <span className="q__err" role="alert">{c.ob.required}</span>}
      </div>
      {!!pain && (
        <div className="q stack gap-8">
          <span className="q__label">{c.ck.where}</span>
          <div className="opts">
            {Object.entries(c.ob.opts.H2).map(([k, label]) => (
              <button key={k} className="opt" aria-pressed={where.includes(k)} onClick={() => setWhere(where.includes(k) ? where.filter((x) => x !== k) : [...where, k])}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button className="btn btn--primary btn--block" onClick={save}>
        {c.ck.save}
      </button>
      <button className="btn btn--ghost btn--sm" onClick={onClose}>
        {c.ck.skip}
      </button>
    </div>
  );
}

function Details({ sessions, risk }: { sessions: Session[]; risk: boolean }) {
  const { href } = useI18n();
  const c = useTrainerCopy();
  const d = c.details;
  const tr = useTrainer();
  const [confirm, setConfirm] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const monthAgo = toISO(new Date(Date.now() - 30 * 864e5));
  const late = sessions.filter((s) => s.status !== "attended" && s.date >= monthAgo).length;
  const level = initialLevel(tr.answers);
  const promo = Array.isArray(tr.answers.S8) ? tr.answers.S8 : [];

  return (
    <div className="stack gap-24">
      <h2 className="display d-sm">{d.title}</h2>

      <div className="stack gap-8">
        <span className="eyebrow">{d.attendance}</span>
        <div className="rows">
          <div><span className="small">{d.lifetime}</span><b className="nums">{sessions.filter((s) => s.status === "attended").length}</b></div>
          <div><span className="small">{d.lateCancels}</span><b className="nums">{late}</b></div>
          {level && <div><span className="small">{d.level}</span><b>{d.levels[level]}</b></div>}
        </div>
      </div>

      <div className="stack gap-8">
        <span className="eyebrow">{d.prefs}</span>
        <div className="rows">
          <div>
            <span className="small">{d.suggestions}</span>
            <Switch checked={tr.answers.S7 === true} onChange={tr.setPaidSuggestions} label={d.suggestions} />
          </div>
          {(["whatsapp", "email"] as const).map((ch) => (
            <div key={ch}>
              <span className="small">{d.promo} · {c.ob.opts.S8[ch]}</span>
              <Switch checked={promo.includes(ch)} onChange={(on) => tr.setPromo(ch, on)} label={`${d.promo} ${ch}`} />
            </div>
          ))}
          <Link to={href("progress/start")}>
            <span className="small">{d.editAnswers}</span>
            <span className="chev" aria-hidden />
          </Link>
        </div>
      </div>

      <div className="stack gap-8">
        <span className="eyebrow">{d.consents}</span>
        <div className="rows">
          {tr.consents.map((k, i) => (
            <div key={i}>
              <span className="small">{k.scope === "health" ? d.consentHealth : `${d.promo} · ${c.ob.opts.S8[k.channel ?? ""] ?? k.channel}`}</span>
              <span className="tiny" dir="ltr">
                {k.revokedAt ? d.revoked : d.granted} {fmtShort((k.revokedAt ?? k.grantedAt).slice(0, 10))} · {k.textVersion}
              </span>
            </div>
          ))}
        </div>
      </div>

      {siteConfig.flags.demoMode && (
        <div className="staff stack gap-12">
          <span className="eyebrow">{d.staff}</span>
          <p className="tiny">{d.staffNote}</p>
          <p className="small">{risk ? d.riskOn : d.riskOff}</p>
          <b className="small">{d.reviews}</b>
          {tr.reviews.length === 0 && <p className="small muted">{d.noReviews}</p>}
          {[...tr.reviews].reverse().map((r) => (
            <div key={r.id} className="card stack gap-8">
              <div className="row between gap-8">
                <b className="small">{d.types[r.type]}</b>
                <span className="badge badge--outline">{d.status[r.status]}</span>
              </div>
              {r.reasons && <span className="tiny">{r.reasons.map((x) => c.ob.opts.H6[x] ?? c.ck.pain).join(" · ")}</span>}
              {r.resolution && <p className="small">{r.resolution}</p>}
              {r.status !== "resolved" && (
                <>
                  {r.status === "open" && (
                    <button className="btn btn--secondary btn--sm" onClick={() => tr.ackReview(r.id)}>{d.ack}</button>
                  )}
                  <label className="field">
                    <span className="small">{d.resolution}</span>
                    <textarea className="input" placeholder={d.resolutionPh} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                  </label>
                  <button className="btn btn--dark btn--sm" disabled={!notes[r.id]?.trim()} onClick={() => tr.resolveReview(r.id, notes[r.id].trim())}>
                    {d.resolve}
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {confirm ? (
        <div className="stack gap-8">
          <p className="small">{d.deleteAsk}</p>
          <button className="btn btn--blush btn--block" onClick={tr.reset}>{d.deleteYes}</button>
          <button className="btn btn--secondary btn--block" onClick={() => setConfirm(false)}>{c.ob.back}</button>
        </div>
      ) : (
        <button className="btn btn--ghost btn--sm" onClick={() => setConfirm(true)}>{d.deleteData}</button>
      )}
    </div>
  );
}

/* ---------- Share card: client-chosen metrics only, drawn locally, never posted ---------- */

function ShareCard({ sessions, streak }: { sessions: Session[]; streak: number }) {
  const { isHe } = useI18n();
  const c = useTrainerCopy();
  const s = c.share;
  const tr = useTrainer();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState("");
  const [showName, setShowName] = useState(false);
  const sorted = [...tr.assessments].sort((a, b) => a.date.localeCompare(b.date));
  const base = sorted[0];
  const latest = sorted[sorted.length - 1];
  const attended = sessions.filter((x) => x.status === "attended").sort((a, b) => a.date.localeCompare(b.date));
  const available = {
    sessions: attended.length > 0,
    streak: streak > 0,
    plank: latest?.plankS != null,
    composite: !!base && !!latest && latest !== base && comparable(base, latest) && composite(base) != null && composite(latest) != null,
  };
  type K = keyof typeof available;
  const [pick, setPick] = useState<K[]>((Object.keys(available) as K[]).filter((k) => available[k]).slice(0, 2));
  const first = String(tr.answers.A1 ?? "").split(" ")[0];

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const W = 1080;
    const H = 1350;
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d")!;
    const font = isHe ? "Heebo, sans-serif" : "Inter, sans-serif";
    g.fillStyle = "#f8ecd9";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#d4e5f1";
    g.beginPath();
    g.arc(W - 120, 180, 260, 0, Math.PI * 2);
    g.fill();
    g.direction = isHe ? "rtl" : "ltr";
    g.textAlign = isHe ? "right" : "left";
    const X = isHe ? W - 90 : 90;
    g.fillStyle = "#1f1612";
    g.font = `700 64px ${font}`;
    g.fillText("re:set pilates", X, 150);
    g.font = `600 52px ${font}`;
    g.fillText(showName && first ? first : c.nav, X, 300);
    let y = 470;
    const block = (big: string, label: string, sub: string) => {
      g.fillStyle = "#4a7590";
      g.font = `700 150px ${font}`;
      g.save();
      g.direction = "ltr";
      g.textAlign = isHe ? "right" : "left";
      g.fillText(big, X, y);
      g.restore();
      g.fillStyle = "#1f1612";
      g.font = `600 44px ${font}`;
      g.fillText(label, X, y + 64);
      g.fillStyle = "rgba(31,22,18,0.6)";
      g.font = `400 32px ${font}`;
      if (sub) g.fillText(sub, X, y + 112);
      y += 300;
    };
    for (const k of pick.slice(0, 3)) {
      if (k === "sessions") block(String(attended.length), s.metrics.sessions, attended[0] ? `${s.since} ${fmtShort(attended[0].date)}` : "");
      if (k === "streak") block(String(streak), s.metrics.streak, "");
      if (k === "plank" && latest) block(`${latest.plankS}s`, s.metrics.plank, `${fmtShort(latest.date)}${latest.source === "self" ? ` · ${s.selfReported}` : ""}`);
      if (k === "composite" && base && latest)
        block(`${composite(base)}→${composite(latest)}`, s.metrics.composite, `${fmtShort(base.date)} → ${fmtShort(latest.date)} · /100`);
    }
    setUrl(cv.toDataURL("image/png"));
  }, [pick, showName, isHe, first, attended.length, streak, base, latest, c.nav, s]);

  return (
    <div className="stack gap-16">
      <h2 className="display d-sm">{s.title}</h2>
      <p className="small muted">{s.sub}</p>
      <div className="opts">
        {(Object.keys(available) as K[]).filter((k) => available[k]).map((k) => (
          <button key={k} className="opt" aria-pressed={pick.includes(k)} onClick={() => setPick(pick.includes(k) ? pick.filter((x) => x !== k) : [...pick, k].slice(-3))}>
            {s.metrics[k]}
          </button>
        ))}
      </div>
      <div className="row between gap-12">
        <span className="small">{s.showName}</span>
        <Switch checked={showName} onChange={setShowName} label={s.showName} />
      </div>
      <canvas ref={canvas} hidden />
      {url && <img src={url} alt={s.title} className="share-preview" />}
      <a
        className="btn btn--primary btn--block"
        href={url}
        download="reset-progress.png"
        onClick={() => track("progress_export", { metrics: pick.join(",") })}
      >
        {s.download}
      </a>
    </div>
  );
}
