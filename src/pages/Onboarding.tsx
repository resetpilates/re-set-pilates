import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "../components/ui";
import { trainerConfig } from "../config/trainer";
import { useTrainerCopy, type TrainerCopy } from "../content/trainer";
import { track } from "../lib/analytics";
import { toISO } from "../lib/booking";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";
import { goalFor, onboardingRedFlags, questionError, stepValid, STEPS, visible, weekStart, type Answers, type Question } from "../lib/trainer";
import { useTrainer } from "../lib/trainerStore";

const BASELINE = STEPS.length; // step index of the baseline check (step 6)

export default function Onboarding() {
  const { href, dir } = useI18n();
  const c = useTrainerCopy();
  const tr = useTrainer();
  const reduce = useReducedMotion();
  useSeo({ title: `${c.nav} | re:set pilates`, desc: c.intro.sub });

  const [a, setA] = useState<Answers>(tr.answers);
  const [step, setStep] = useState(() => {
    if (new URLSearchParams(location.search).get("step") === "baseline") return BASELINE;
    return tr.onboarded ? 0 : Math.min(tr.stepsDone, BASELINE);
  });
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(false);
  const total = BASELINE + 1;
  const shift = reduce ? 0 : 24 * (dir === "rtl" ? -1 : 1);

  const set = (id: string, v: Answers[string]) => setA((p) => ({ ...p, [id]: v }));

  const next = () => {
    if (!stepValid(step, a)) {
      setTried(true);
      return;
    }
    setTried(false);
    // Hidden conditional answers are cleared so they never linger in the record
    const clean = { ...a };
    for (const q of STEPS[step].questions) if (!visible(q, a)) delete clean[q.id];
    tr.saveAnswers(clean, step + 1);
    track("onboarding_step", { step: step + 1 });
    setA(clean);
    setStep(step + 1);
    scrollTo({ top: 0 });
  };

  const finish = () => {
    const wasOnboarded = tr.onboarded;
    tr.saveAnswers(a, BASELINE);
    tr.finishOnboarding();
    // An edited weekly goal starts this week; past weeks keep the goal they had
    const target = Number(a.S1);
    if (wasOnboarded && target && goalFor(toISO(weekStart(new Date())), tr.goals) !== target) tr.setGoal(target);
    track("onboarding_complete");
    setDone(true);
    scrollTo({ top: 0 });
  };

  return (
    <div className="page page--app tone-dark has-tabbar">
      <div className="wrap wrap--app stack gap-24">
        {!done && (
          <div className="stack gap-8">
            <div className="progress" aria-hidden>
              <i style={{ width: `${((step + 1) / total) * 100}%`, animation: "none", transition: "width 400ms var(--ease-out)" }} />
            </div>
            <span className="eyebrow">
              {c.ob.step} {step + 1} {c.ob.of} {total} · {c.ob.steps[step]}
            </span>
          </div>
        )}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={done ? "done" : step}
            initial={{ opacity: 0, x: shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -shift }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
            className="stack gap-24"
          >
            {done ? (
              <div className="stack gap-16 center" style={{ paddingTop: 24 }}>
                <Check />
                <h1 className="display d-md">{c.ob.doneTitle}</h1>
                <p className="muted">{c.ob.doneSub}</p>
                {onboardingRedFlags(a).length > 0 && <p className="notice">{c.ob.flagNote}</p>}
                <Link to={href("progress")} className="btn btn--primary btn--block">
                  {c.ob.toDashboard}
                </Link>
              </div>
            ) : step < BASELINE ? (
              <>
                <h1 className="display d-md">{c.ob.steps[step]}</h1>
                {step === 2 && <p className="small muted">{c.scope}</p>}
                <div className="stack gap-24">
                  {STEPS[step].questions.filter((q) => visible(q, a)).map((q) => (
                    <Field key={q.id} q={q} a={a} set={set} c={c} showError={tried} />
                  ))}
                </div>
                {step === 2 && onboardingRedFlags(a).length > 0 && <p className="notice">{c.ob.flagNote}</p>}
                <div className="stack gap-8">
                  <button className="btn btn--primary btn--block" onClick={next}>
                    {c.ob.next}
                  </button>
                  {step > 0 && (
                    <button className="btn btn--ghost btn--sm" onClick={() => setStep(step - 1)}>
                      {c.ob.back}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <Baseline a={a} onDone={finish} onBack={() => setStep(step - 1)} />
            )}
          </motion.div>
        </AnimatePresence>
        <p className="tiny">{c.deviceNote}</p>
      </div>
    </div>
  );
}

function Field({ q, a, set, c, showError }: { q: Question; a: Answers; set: (id: string, v: Answers[string]) => void; c: TrainerCopy; showError: boolean }) {
  const err = showError ? questionError(q, a) : null;
  const id = `q-${q.id}`;
  const v = a[q.id];
  const label = c.ob.q[q.id];
  const hint = c.ob.hint[q.id];
  const labels = c.ob.opts[q.id] ?? {};
  const optional = !q.req && q.id !== "H9" && q.id !== "S9";
  const arr = Array.isArray(v) ? v : [];

  const head = (
    <div className="stack gap-4">
      <span className="q__label" id={`${id}-l`}>
        {label}
        {optional && <span className="q__opt"> · {c.ob.optional}</span>}
      </span>
      {q.type === "multi" && q.max && <span className="tiny">{c.ob.pickUpTo} {q.max}</span>}
      {hint && <span className="tiny">{hint}</span>}
    </div>
  );

  let control: React.ReactNode = null;
  if (q.type === "text" || q.type === "date" || q.type === "number") {
    control = (
      <div className="row gap-8">
        <input
          id={id}
          className="input"
          aria-labelledby={`${id}-l`}
          type={q.type}
          inputMode={q.type === "number" ? "decimal" : undefined}
          value={(v as string | number | undefined) ?? ""}
          max={q.type === "date" ? toISO(new Date()) : undefined}
          onChange={(e) => set(q.id, q.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
          autoComplete={q.id === "A1" ? "given-name" : q.id === "A2" ? "bday" : "off"}
          dir={q.type === "text" ? "auto" : "ltr"}
        />
        {q.unit && <span className="small muted">{c.ob.units[q.unit as "cm"]}</span>}
      </div>
    );
  } else if (q.type === "longtext") {
    control = (
      <textarea id={id} className="input" aria-labelledby={`${id}-l`} maxLength={q.max} value={(v as string) ?? ""} onChange={(e) => set(q.id, e.target.value)} dir="auto" />
    );
  } else if (q.type === "single" || q.type === "multi") {
    const opts = q.optsFrom ? (Array.isArray(a[q.optsFrom]) ? (a[q.optsFrom] as string[]) : []) : q.opts!;
    const optLabels = q.optsFrom ? c.ob.opts[q.optsFrom] : labels;
    control = (
      <div className="opts" role={q.type === "single" ? "radiogroup" : "group"} aria-labelledby={`${id}-l`}>
        {opts.map((o) => {
          const on = q.type === "single" ? v === o : arr.includes(o);
          const full = q.type === "multi" && !!q.max && !on && arr.length >= q.max;
          return (
            <button
              key={o}
              type="button"
              className="opt"
              role={q.type === "single" ? "radio" : undefined}
              aria-checked={q.type === "single" ? on : undefined}
              aria-pressed={q.type === "multi" ? on : undefined}
              disabled={full}
              onClick={() => {
                if (q.type === "single") return set(q.id, o);
                if (on) return set(q.id, arr.filter((x) => x !== o));
                if (o === q.exclusive) return set(q.id, [o]);
                set(q.id, [...arr.filter((x) => x !== q.exclusive), o]);
              }}
            >
              {optLabels[o] ?? o}
            </button>
          );
        })}
      </div>
    );
  } else if (q.type === "scale") {
    control = <Scale id={id} min={q.min ?? 1} max={q.max ?? 5} value={typeof v === "number" ? v : null} onChange={(n) => set(q.id, n)} />;
  } else if (q.type === "bool" && q.id === "H9") {
    control = (
      <div className="consent stack gap-12">
        <p className="small">{c.ob.consentText}</p>
        <span className="tiny">{c.ob.consentDraft} · {trainerConfig.consentVersions.health}</span>
        <button type="button" className="opt" aria-pressed={v === true} onClick={() => set("H9", v !== true)} aria-labelledby={`${id}-l`}>
          {v === true ? "✓ " : ""}
          {c.ob.yes}
        </button>
      </div>
    );
  } else if (q.type === "bool" && q.id === "S9") {
    control = (
      <div className="consent consent--media stack gap-12">
        <p className="small">{c.ob.mediaText}</p>
        <label className="tick tick--consent">
          <input id={id} type="checkbox" checked={v === true} onChange={(e) => set("S9", e.target.checked)} />
          <span>{c.ob.mediaTick}</span>
        </label>
        <p className="tiny consent__note">{c.ob.mediaCamera}</p>
        <span className="tiny">{c.ob.consentDraft} · {trainerConfig.consentVersions.media}</span>
      </div>
    );
  } else if (q.type === "bool") {
    control = (
      <div className="opts" role="radiogroup" aria-labelledby={`${id}-l`}>
        {[true, false].map((b) => (
          <button key={String(b)} type="button" className="opt" role="radio" aria-checked={v === b} onClick={() => set(q.id, b)}>
            {b ? c.ob.yes : c.ob.no}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`q stack gap-12 ${err ? "q--err" : ""}`}>
      {head}
      {control}
      {err && (
        <span className="q__err" role="alert">
          {err === "consent" ? c.ob.consentRequired : err === "range" ? c.ob.range : c.ob.required}
        </span>
      )}
    </div>
  );
}

export function Scale({ id, min, max, value, onChange }: { id: string; min: number; max: number; value: number | null; onChange: (n: number) => void }) {
  return (
    <div className="scale" role="radiogroup" aria-labelledby={`${id}-l`} style={{ gridTemplateColumns: `repeat(${max - min + 1}, 1fr)` }}>
      {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(n)} className="nums">
          {n}
        </button>
      ))}
    </div>
  );
}

function Baseline({ a, onDone, onBack }: { a: Answers; onDone: () => void; onBack: () => void }) {
  const c = useTrainerCopy();
  const tr = useTrainer();
  const [mode, setMode] = useState<"studio" | "self" | "later" | null>(tr.baselineMode);
  const [vals, setVals] = useState<Record<string, number | null>>({});
  const [tried, setTried] = useState(false);
  const blocked = onboardingRedFlags(a).length > 0 || !trainerConfig.assessment.selfTestAllowed;
  const tests: { id: string; key: "plankS" | "balanceLeftS" | "balanceRightS" | "sitReachCm"; unit: "s" | "cm"; max: number; min: number }[] = [
    { id: "B1", key: "plankS", unit: "s", min: 0, max: 600 },
    { id: "B2", key: "balanceLeftS", unit: "s", min: 0, max: 60 },
    { id: "B3", key: "balanceRightS", unit: "s", min: 0, max: 60 },
    { id: "B4", key: "sitReachCm", unit: "cm", min: -40, max: 40 },
  ];
  const T = c.ob.tests as unknown as Record<string, string>;
  const complete = tests.every((x) => vals[x.key] != null && vals[x.key]! >= x.min && vals[x.key]! <= x.max) && vals.shoulder != null && vals.hip != null;

  const save = () => {
    if (mode === "self") {
      if (!complete) return setTried(true);
      tr.addAssessment({
        date: toISO(new Date()),
        type: "baseline",
        source: "self",
        plankS: vals.plankS!,
        balanceLeftS: Math.min(60, vals.balanceLeftS!),
        balanceRightS: Math.min(60, vals.balanceRightS!),
        sitReachCm: vals.sitReachCm!,
        shoulder: vals.shoulder!,
        hip: vals.hip!,
      });
    }
    if (mode === "studio" || mode === "self") tr.setBaselineMode(mode);
    onDone();
  };

  return (
    <>
      <div className="stack gap-8">
        <h1 className="display d-md">{c.ob.baselineTitle}</h1>
        <p className="muted">{c.ob.baselineSub}</p>
      </div>
      <div className="stack gap-12" role="radiogroup">
        <button className="choice" role="radio" aria-checked={mode === "studio"} onClick={() => setMode("studio")}>
          <b>{c.ob.baselineStudio}</b>
          <span className="small muted">{c.ob.baselineStudioSub}</span>
        </button>
        {blocked ? (
          <p className="notice">{c.ob.baselineSelfBlocked}</p>
        ) : (
          <button className="choice" role="radio" aria-checked={mode === "self"} onClick={() => setMode("self")}>
            <b>{c.ob.baselineSelf}</b>
            <span className="small muted">{c.ob.baselineSelfSub}</span>
          </button>
        )}
        <button className="choice" role="radio" aria-checked={mode === "later"} onClick={() => setMode("later")}>
          <b>{c.ob.baselineLater}</b>
        </button>
      </div>

      {mode === "self" && !blocked && (
        <div className="card stack gap-24">
          <p className="small">{c.dash.stop}</p>
          {tests.map((x) => (
            <div key={x.id} className="q stack gap-8">
              <span className="q__label" id={`b-${x.id}-l`}>{T[x.id]}</span>
              <span className="tiny">{T[`${x.id}h`]}</span>
              <div className="row gap-8">
                <input
                  className="input"
                  aria-labelledby={`b-${x.id}-l`}
                  type="number"
                  inputMode={x.unit === "cm" ? "text" : "numeric"}
                  dir="ltr"
                  min={x.min}
                  max={x.max}
                  value={vals[x.key] ?? ""}
                  onChange={(e) => setVals({ ...vals, [x.key]: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <span className="small muted">{c.ob.units[x.unit]}</span>
              </div>
            </div>
          ))}
          {(["B5", "B6"] as const).map((b) => (
            <div key={b} className="q stack gap-8">
              <span className="q__label" id={`b-${b}-l`}>{T[b]}</span>
              <Scale id={`b-${b}`} min={1} max={5} value={vals[b === "B5" ? "shoulder" : "hip"] ?? null} onChange={(n) => setVals({ ...vals, [b === "B5" ? "shoulder" : "hip"]: n })} />
              <ol className="guide tiny">
                {c.ob.tests.ratingGuide.map((g, i) => (
                  <li key={g}><b className="nums">{i + 1}</b> {g}</li>
                ))}
              </ol>
            </div>
          ))}
          {tried && !complete && <span className="q__err" role="alert">{c.ob.required}</span>}
        </div>
      )}

      <div className="stack gap-8">
        <button className="btn btn--primary btn--block" disabled={!mode} onClick={save}>
          {c.ob.finish}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          {c.ob.back}
        </button>
      </div>
    </>
  );
}
