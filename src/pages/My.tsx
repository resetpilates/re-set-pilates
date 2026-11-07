import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHead, instructorName } from "../components/blocks";
import { Sheet } from "../components/ui";
import { mapsLink, siteConfig } from "../config/site";
import { fromISO, hasClasses, slotStart } from "../lib/booking";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";
import { downloadIcs } from "../lib/ics";
import { dropQueued, relay } from "../lib/relay";
import { useStore, type Booking } from "../lib/store";

export default function My() {
  const { t, href, isHe, fmtDate, lang } = useI18n();
  useSeo(t.meta.my);
  const store = useStore();
  const [toCancel, setToCancel] = useState<Booking | null>(null);
  const maps = mapsLink();
  // Inside the policy window the session stays used (same rule as a no-show).
  const isLate = (b: Booking) => slotStart(b).getTime() - Date.now() < siteConfig.policies.cancelHours * 3600_000;

  return (
    <div className="page tone-dark has-tabbar">
      <PageHead title={t.my.title} app />
      <div className="wrap wrap--app pbody stack gap-24 screen">

        {store.upcoming.length === 0 ? (
          <div className="my-empty stack gap-12 center">
            <div className="media media--bare my-empty__img" aria-hidden>
              <img src="/assets/ex-rest.webp" alt="" style={{ objectPosition: "50% 40%" }} />
            </div>
            <h2 className="display d-sm">{t.my.emptyTitle}</h2>
            <p className="small muted">{t.my.emptySub}</p>
            <Link to={href("schedule?service=reformer")} className="btn btn--primary">
              {t.common.book}
            </Link>
            {/* Mat is by request until Mat classes are on the schedule; then the button opens the Mat tab */}
            <Link to={href(hasClasses("mat") ? "schedule?service=mat" : "request?type=mat")} className="btn btn--primary">
              {t.common.bookMat}
            </Link>
            <Link to={href("#first-class")} className="small hi" style={{ textDecoration: "underline", textUnderlineOffset: 4 }}>
              {t.home.heroSecondary}
            </Link>
          </div>
        ) : (
          <div className="stack gap-12">
            <AnimatePresence initial={false}>
              {store.upcoming.map((b) => {
                const d = fromISO(b.date);
                return (
                  <motion.div key={b.id} layout exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }} className="card stack gap-16">
                    <div className="row gap-16">
                      <span className="date-tile">
                        {t.common.dows[d.getDay()]}
                        <b>{d.getDate()}</b>
                      </span>
                      <span className="stack gap-4">
                        <span className="key">{t.services.items[b.service].name}</span>
                        <span className="small muted">
                          <span className="nums">{b.time}</span> · {instructorName(b.instructorId, isHe)}
                        </span>
                        <span className="small hi">
                          {b.service === "mat" ? t.services.items.mat.short : b.bed === null ? t.klass.anyBed : `${t.klass.bed} ${b.bed + 1}`}
                        </span>
                      </span>
                    </div>
                    <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                      <button className="btn btn--ghost btn--sm" style={{ border: "1px solid var(--line-strong)" }} onClick={() => setToCancel(b)}>
                        {t.my.cancel}
                      </button>
                      <a className="btn btn--secondary btn--sm" href={maps} target="_blank" rel="noreferrer">
                        {t.common.directions}
                      </a>
                      <button className="btn btn--secondary btn--sm" onClick={() => downloadIcs({ title: t.services.items[b.service].name, start: slotStart(b), minutes: b.minutes })}>
                        {t.my.calendar}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        <p className="tiny">
          {t.my.policy}: {t.my.policyText}
        </p>

        {store.waitlist.length > 0 && (
          <section className="stack gap-8">
            <h2 className="eyebrow">{t.my.waitlist}</h2>
            <div className="rows">
              {store.waitlist.map((id) => {
                const [svc, date, hhmm] = id.split("_");
                return (
                  <div key={id}>
                    <span className="small">
                      {t.services.items[svc as "reformer" | "mat"].short} · {fmtDate(fromISO(date))} ·{" "}
                      <span className="nums">
                        {hhmm.slice(0, 2)}:{hhmm.slice(2)}
                      </span>
                    </span>
                    <button className="btn btn--ghost btn--sm" onClick={() => store.leaveWaitlist(id)}>
                      {t.my.leave}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {store.past.length > 0 && (
          <section className="stack gap-8">
            <h2 className="eyebrow">{t.my.history}</h2>
            <div className="rows">
              {store.past.map((b) => (
                <div key={b.id} className="small">
                  <span>{t.services.items[b.service].name}</span>
                  <span className="muted">
                    {fmtDate(fromISO(b.date))} · <span className="nums">{b.time}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <Sheet open={!!toCancel} onClose={() => setToCancel(null)} label={t.my.cancelAsk}>
        {toCancel && (
          <div className="stack gap-16">
            <h2 className="display d-sm">{t.my.cancelAsk}</h2>
            <p className="muted small">
              {t.services.items[toCancel.service].name} · {fmtDate(fromISO(toCancel.date))} · <span className="nums">{toCancel.time}</span>
            </p>
            {isLate(toCancel) && <p className="notice">{t.my.lateCancel.replace("{hours}", String(siteConfig.policies.cancelHours))}</p>}
            <button
              className="btn btn--blush btn--block"
              onClick={() => {
                // The relay decides on-time vs late cancel from the class time, so the 24-hour rule is applied in one place.
                // Not sent yet (offline)? Then simply drop it from the outbox instead.
                if (toCancel.remoteId) relay("cancel", { lang, bookingId: toCancel.remoteId, phone: store.profile.phone });
                else dropQueued(toCancel.id);
                store.cancel(toCancel.id, isLate(toCancel));
                setToCancel(null);
              }}
            >
              {t.my.cancelYes}
            </button>
            <button className="btn btn--secondary btn--block" onClick={() => setToCancel(null)}>
              {t.my.keep}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
