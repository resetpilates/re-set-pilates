import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { serviceTarget } from "../components/blocks";
import { serviceById, type ServiceId } from "../config/services";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { relay } from "../lib/relay";
import type { QuizMsg } from "../lib/relayTypes";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import { ConsentField, ContactFields, profileFrom, readContact, readExtras } from "../components/forms";

type Rec = "reformer" | "mat" | "private" | "duo";

function recommend(a: string[]): Rec {
  const [goal, , style] = a;
  if (style === "pair" || goal === "together") return "duo";
  if (style === "solo" || goal === "care") return "private";
  if (goal === "calm") return "mat";
  return "reformer";
}

export default function Quiz() {
  const { t, href, dir, lang } = useI18n();
  useSeo(t.meta.quiz);
  const reduce = useReducedMotion();
  const [answers, setAnswers] = useState<string[]>([]);
  const step = answers.length;
  const total = t.quiz.q.length;
  const done = step >= total;
  const rec = done ? recommend(answers) : null;
  const sign = dir === "rtl" ? -1 : 1;
  const shift = reduce ? 0 : 24 * sign;

  const [quizId, setQuizId] = useState<string | null>(null);
  const pick = (id: string) => {
    const next = [...answers, id];
    setAnswers(next);
    if (next.length === total) {
      const result = recommend(next);
      track("quiz_complete", { result });
      // Answers are saved anonymously; the visitor can add their number under the result.
      const [goal, experience, style] = next as [QuizMsg["goal"], QuizMsg["experience"], QuizMsg["style"]];
      relay("quiz", { lang, goal, experience, style, recommended: result }).then((r) => setQuizId(r.id ?? null));
    }
  };

  return (
    <div className="page page--app tone-dark has-tabbar">
      <div className="wrap wrap--app stack gap-24">
        <div className="progress" aria-hidden>
          <i key={step} style={{ width: `${(Math.min(step + (done ? 0 : 1), total) / total) * 100}%`, animation: "none", transition: "width 400ms var(--ease-out)" }} />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: shift }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -shift }}
            transition={{ duration: 0.24, ease: [0.2, 0.7, 0.2, 1] }}
            className="stack gap-24"
          >
            {!done ? (
              <>
                <div className="stack gap-8">
                  <span className="eyebrow">
                    {t.quiz.step} {step + 1} {t.quiz.of} {total}
                  </span>
                  <h1 className="display d-md">{t.quiz.q[step].q}</h1>
                </div>
                <div className="stack gap-12">
                  {t.quiz.q[step].options.map((o) => (
                    <button key={o.id} className="slot" onClick={() => pick(o.id)}>
                      <span style={{ flex: 1, fontWeight: 500 }}>{o.label}</span>
                      <span className="chev" aria-hidden style={{ color: "var(--fg-3)" }} />
                    </button>
                  ))}
                </div>
                {step > 0 && (
                  <button className="btn btn--ghost btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setAnswers(answers.slice(0, -1))}>
                    {t.common.back}
                  </button>
                )}
              </>
            ) : (
              rec && (
                <>
                  <Result
                    rec={rec}
                    onAgain={() => {
                      setAnswers([]);
                      setQuizId(null);
                    }}
                  />
                  {quizId && <LeaveNumber quizId={quizId} />}
                </>
              )
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  function Result({ rec, onAgain }: { rec: Rec; onAgain: () => void }) {
    const s = serviceById(rec)!;
    const c = t.services.items[rec as ServiceId];
    return (
      <>
        <div className="media media--page">
          <img src={s.image} alt="" style={{ objectPosition: s.pos }} />
          <div className="scrim" />
          <div className="media__cap stack gap-4">
            <span className="eyebrow">{t.quiz.resultEyebrow}</span>
            <h1 className="display d-md">{c.name}</h1>
          </div>
        </div>
        <p className="muted">{t.quiz.why[rec]}</p>
        <Link to={serviceTarget(s, href)} className="btn btn--sand btn--block">
          {s.bookable ? t.common.seeSchedule : t.common.requestSession}
        </Link>
        <button className="btn btn--ghost btn--sm" onClick={onAgain}>
          {t.quiz.again}
        </button>
      </>
    );
  }
}

/** Optional: under the quiz result, the visitor can leave their number for a personal plan. */
function LeaveNumber({ quizId }: { quizId: string }) {
  const { t, lang } = useI18n();
  const { profile, saveProfile } = useStore();
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const contact = readContact(f);
    const x = readExtras(f);
    setState("sending");
    const r = await relay("quiz-contact", { lang, quizId, contact, consent: x.consent, website: x.website });
    if (!r.ok && !r.queued) return setState("failed");
    saveProfile(profileFrom(contact, x));
    setState("done");
  };
  if (state === "done") return <p className="notice">{t.quiz.leaveDone}</p>;
  return (
    <form className="card stack gap-12" onSubmit={submit}>
      <div className="stack gap-4">
        <h2 className="key">{t.quiz.leaveTitle}</h2>
        <p className="tiny" style={{ margin: 0 }}>{t.quiz.leaveSub}</p>
      </div>
      <ContactFields id="qz" profile={profile} email="none" />
      <ConsentField profile={profile} />
      <button className="btn btn--blush btn--block" disabled={state === "sending"}>
        {state === "sending" ? t.form.sending : t.quiz.leaveBtn}
      </button>
      {state === "failed" && (
        <p className="small" role="alert" style={{ margin: 0 }}>
          {t.form.failed}
        </p>
      )}
    </form>
  );
}
