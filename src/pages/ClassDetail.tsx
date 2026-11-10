import { ReformerSketch } from "../components/art";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { instructorName } from "../components/blocks";
import { openChat } from "../components/ChatWidget";
import { Check, Sheet, Switch } from "../components/ui";
import { classPrices, planById, priceFor, singleClass } from "../config/pricing";
import { serviceById } from "../config/services";
import { track } from "../lib/analytics";
import { bookingProvider, fromISO, rememberBed, slotStart, type ClassSlot } from "../lib/booking";
import { withRoster } from "../lib/roster";
import { useI18n } from "../lib/i18n";
import { downloadIcs } from "../lib/ics";
import { planUsage } from "../lib/plan";
import { useSeo } from "../lib/seo";
import { relay } from "../lib/relay";
import { SHOW_AS, scheduleName, type Contact, type ShowAs, type SlotRef } from "../lib/relayTypes";
import { useStore } from "../lib/store";
import { ContactFields, readContact } from "../components/forms";

export default function ClassDetail() {
  const { id = "" } = useParams();
  const { t, href, isHe, fmtDate, lang } = useI18n();
  const store = useStore();
  const nav = useNavigate();
  const [slot, setSlot] = useState<ClassSlot | null | undefined>(undefined);
  const [bed, setBed] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [remind, setRemind] = useState(store.reminders);
  useSeo(t.meta.schedule);

  useEffect(() => {
    let alive = true;
    bookingProvider.getSlot(id).then(async (s) => {
      const real = s ? await withRoster(s) : s; // beds taken by real bookings, same as the schedule
      if (alive) setSlot(real);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  if (slot === undefined) return <div className="page tone-dark" />;
  if (slot === null || (slotStart(slot) < new Date() && !store.past.some((b) => b.slotId === slot.id)))
    return (
      <div className="page page--app tone-dark has-tabbar">
        <div className="wrap wrap--app stack gap-16 center">
          <p className="muted">{t.klass.notFound}</p>
          <Link to={href("schedule")} className="btn btn--primary">
            {t.common.seeSchedule}
          </Link>
        </div>
      </div>
    );

  const svc = serviceById(slot.service)!;
  const copy = t.services.items[slot.service];
  const day = fromISO(slot.date);
  const existing = store.upcoming.find((b) => b.slotId === slot.id);
  const lateCancelled = !existing && store.bookings.some((b) => b.slotId === slot.id && b.cancelledLate);
  const waitlisted = store.waitlist.includes(slot.id);
  const isReformer = slot.capacity !== null;
  const bedLabel = !isReformer ? copy.short : bed === null ? t.klass.anyBed : `${t.klass.bed} ${bed + 1}`;

  // Plan limit: weekly cap for monthly plans, remaining sessions and validity for passes
  const plan = store.planId ? planById(store.planId) : undefined;
  const usage = plan ? planUsage(plan, store.bookings.filter((b) => b.slotId !== slot.id), fromISO(slot.date), store.planStart, store.carry ?? 0) : null;
  const atLimit = !!usage && usage.left <= 0;
  // Name and phone are asked once (first booking or waitlist), then remembered on this device.
  const needsDetails = !store.profile.firstName || !store.profile.lastName || !store.profile.phone;
  // How the name shows on the schedule beds for the others in the class; remembered for next time
  const showAs: ShowAs = store.profile.showAs ?? "short";
  const setShowAs = (v: ShowAs) => store.saveProfile({ showAs: v });
  const slotRef: SlotRef = { slotId: slot.id, service: slot.service, date: slot.date, time: slot.time, minutes: slot.minutes, capacity: slot.capacity };
  const whoFrom = (form: HTMLFormElement | null): Contact => {
    if (form && needsDetails) {
      const c = readContact(new FormData(form));
      store.saveProfile({ firstName: c.firstName, lastName: c.lastName, phone: c.phone });
      return c;
    }
    const p = store.profile;
    return { firstName: p.firstName, lastName: p.lastName, phone: p.phone, email: p.email || undefined };
  };
  const confirm = (e: FormEvent) => {
    e.preventDefault();
    if (atLimit) return;
    const local = store.book(slot, isReformer ? bed : null, remind);
    if (!local) return;
    const contact = whoFrom(e.currentTarget as HTMLFormElement);
    relay("booking", { lang, contact, slot: slotRef, bed: isReformer ? bed : null, showAs }, { ref: local.id }).then(
      (r) => r.id && store.setRemoteId(local.id, r.id),
    );
    track("booking_confirmed", { service: slot.service });
    setConfirmed(true);
  };
  const joinWaitlist = (e: FormEvent) => {
    e.preventDefault();
    const contact = whoFrom(e.currentTarget as HTMLFormElement);
    store.joinWaitlist(slot.id);
    relay("waitlist", { lang, contact, slot: slotRef });
    track("waitlist_join", { service: slot.service });
  };
  const closeSheet = () => {
    setSheet(false);
    if (confirmed) nav(href("my"));
  };

  return (
    <div className="page tone-dark has-tabbar">
      <div className="wrap wrap--app stack gap-24 screen" style={{ paddingBlock: "16px 40px" }}>
        <div className="media" style={{ height: 220 }}>
          <img src={svc.image} alt="" style={{ objectPosition: svc.pos }} />
          <div className="scrim" />
          <div className="stack gap-4" style={{ position: "absolute", inset: "auto 20px 18px 20px", color: "var(--ivory)" }}>
            <span className="eyebrow">{fmtDate(day)}</span>
            <h1 className="display d-md">{copy.name}</h1>
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <b className="nums">{slot.time}</b>
            <span>{t.klass.time}</span>
          </div>
          <div className="stat">
            <b>{slot.minutes}</b>
            <span>{t.common.min}</span>
          </div>
          <div className="stat">
            <b>{instructorName(slot.instructorId, isHe)}</b>
            <span>{t.klass.instructor}</span>
          </div>
        </div>

        <p className="single-price">
          <b>{t.pricing.singlePrice.replace("{price}", String(priceFor(singleClass, slot.service)))}</b>
          <Link to={href(`pricing?kind=${slot.service}&next=${slot.id}`)} className="link small">
            {t.pricing.singlePlan.replace("{price}", String(classPrices("adult", undefined, slot.service).plan))}
          </Link>
        </p>

        <p className="muted" style={{ fontSize: 14 }}>
          {copy.desc}
        </p>

        {isReformer && !existing && !lateCancelled && !slot.full && (
          <div className="card stack gap-16">
            <div className="row between">
              <h2 className="key">{t.klass.chooseBed}</h2>
              <span className="small hi">
                {bedLabel}
              </span>
            </div>
            {/* The room as it is: a small mirror on the left wall, the big mirror wall on the right, mirrors along the front */}
            <div className="room">
            <span className="mirror-v mirror-v--small" aria-hidden>
              <span>{t.klass.mirror.toUpperCase()}</span>
            </span>
            <div className="beds">
              {Array.from({ length: slot.capacity! }, (_, i) => {
                const taken = slot.takenBeds.includes(i);
                return (
                  <button
                    key={i}
                    className="bed"
                    disabled={taken}
                    aria-pressed={bed === i}
                    aria-label={`${t.klass.bed} ${i + 1}${taken ? ` · ${t.klass.taken}` : ""}`}
                    onClick={() => setBed(bed === i ? null : i)}
                  >
                    <ReformerSketch />
                    <span className="bed__num">{i + 1}</span>
                  </button>
                );
              })}
            </div>
            <span className="mirror-v mirror-v--big" aria-hidden>
              <span>{t.klass.mirrorWall.toUpperCase()}</span>
            </span>
            </div>
            <span className="mirror-h" aria-hidden>
              <span>{t.klass.mirrorWall.toUpperCase()}</span>
            </span>
            <p className="tiny">{t.klass.bedOptional}</p>
          </div>
        )}

        {existing ? (
          <div className="stack gap-12">
            <div className="notice">{t.klass.alreadyBooked}</div>
            <Link to={href("my")} className="btn btn--secondary btn--block">
              {t.confirm.viewBookings}
            </Link>
          </div>
        ) : lateCancelled ? (
          <div className="notice">{t.klass.lateCancelled}</div>
        ) : slot.full ? (
          <div className="stack gap-12">
            <form className="stack gap-12" onSubmit={joinWaitlist}>
              {needsDetails && !waitlisted && (
                <>
                  <p className="small muted">{t.klass.waitDetails}</p>
                  <ContactFields id="wl" profile={store.profile} email="none" />
                </>
              )}
              <button className="btn btn--secondary btn--block" disabled={waitlisted}>
                {waitlisted ? t.klass.waitJoined : t.klass.waitlist}
              </button>
            </form>
            <p className="tiny center" aria-live="polite">
              {waitlisted ? t.klass.waitNote : ""}
            </p>
          </div>
        ) : (
          <div className="stack gap-12">
            <button className="btn btn--primary btn--block" onClick={() => setSheet(true)}>
              {t.klass.reserve}
            </button>
            <p className="tiny center">{store.isMember ? t.klass.payNote : t.klass.payNoteVisitor}</p>
          </div>
        )}
      </div>

      <Sheet open={sheet} onClose={closeSheet} label={t.confirm.title}>
        {!confirmed ? (
          <div className="stack gap-16">
            <h2 className="display d-sm">{t.confirm.title}</h2>
            <div>
              <div className="kv">
                <span>{t.confirm.classLbl}</span>
                <span>{copy.name}</span>
              </div>
              <div className="kv">
                <span>{t.confirm.when}</span>
                <span>
                  {fmtDate(day)} · <span className="nums">{slot.time}</span>
                </span>
              </div>
              {isReformer && (
                <div className="kv">
                  <span>{t.confirm.bed}</span>
                  <span>{bedLabel}</span>
                </div>
              )}
              <div className="kv">
                <span>{t.confirm.payWith}</span>
                <span className={store.isMember ? "" : "hi"}>
                  {store.isMember ? t.confirm.payMember : t.confirm.payNone}
                </span>
              </div>
              <div className="kv" style={{ alignItems: "center", borderBottom: 0 }}>
                <span>{t.confirm.remind}</span>
                <Switch checked={remind} onChange={setRemind} label={t.confirm.remind} />
              </div>
            </div>
            {usage && plan && (
              <p className={`plan-left ${atLimit ? "is-out" : ""}`}>
                {atLimit
                  ? usage.expired
                    ? t.confirm.passExpired
                    : (plan.billingType === "monthly" ? t.confirm.limitWeek : t.confirm.limitPass)
                        .replace("{used}", String(usage.used))
                        .replace("{cap}", String(usage.cap))
                  : usage.cap === null
                    ? t.profile.unlimitedNote
                    : (plan.billingType === "monthly" ? t.confirm.leftWeek : t.confirm.leftPass)
                        .replace("{left}", String(usage.left))
                        .replace("{cap}", String(usage.cap))}
              </p>
            )}
            {store.isMember && atLimit ? (
              <>
                <p className="small muted center">{plan?.billingType === "monthly" ? t.confirm.limitHint : t.confirm.limitPassHint}</p>
                <Link to={href(`pricing?next=${slot.id}`)} className="btn btn--sand btn--block">
                  {t.confirm.upgrade}
                </Link>
              </>
            ) : store.isMember ? (
              <form className="stack gap-12" onSubmit={confirm}>
                {needsDetails && (
                  <>
                    <p className="small muted">{t.form.detailsNote}</p>
                    <ContactFields id="bk" profile={store.profile} email="none" />
                  </>
                )}
                {isReformer && (
                  <ShowAsPicker value={showAs} onChange={setShowAs} name={needsDetails ? undefined : store.profile} />
                )}
                <button className="btn btn--sand btn--block">{t.confirm.confirmBtn}</button>
              </form>
            ) : (
              <>
                <Link
                  to={href(`checkout/${singleClass.id}?kind=${slot.service}&next=${slot.id}`)}
                  className="btn btn--sand btn--block"
                  onClick={() => {
                    rememberBed(slot.id, isReformer ? bed : null);
                    track("membership_click", { plan: singleClass.id, kind: slot.service });
                  }}
                >
                  {t.confirm.single.replace("{price}", String(priceFor(singleClass, slot.service)))}
                </Link>
                <Link to={href(`pricing?kind=${slot.service}&next=${slot.id}`)} className="btn btn--secondary btn--block" onClick={() => rememberBed(slot.id, isReformer ? bed : null)}>
                  {t.confirm.choosePlan}
                </Link>
              </>
            )}
            <button
              className="btn btn--ghost btn--sm"
              style={{ alignSelf: "center" }}
              onClick={() => {
                setSheet(false);
                openChat();
              }}
            >
              {t.confirm.questions}
            </button>
            <p className="tiny center">
              {t.confirm.policy}: {t.my.policyText}
            </p>
          </div>
        ) : (
          <div className="stack gap-16 center" style={{ paddingTop: 8 }}>
            <Check />
            <h2 className="display d-md">{t.confirm.bookedTitle}</h2>
            <p className="muted small">
              {copy.name} · {fmtDate(day)} · <span className="nums">{slot.time}</span>
              {isReformer ? ` · ${bedLabel}` : ""}
              <br />
              {t.confirm.bookedSub}
            </p>
            <button
              className="btn btn--sand btn--block"
              onClick={() => {
                downloadIcs({ title: copy.name, start: slotStart(slot), minutes: slot.minutes });
                nav(href("my"));
              }}
            >
              {t.confirm.addCalendar}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => nav(href("my"))}>
              {t.confirm.viewBookings}
            </button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/** "On the schedule, show me as": full name, first initial + last name, or anonymous (a filled bed, no name). */
export function ShowAsPicker({ value, onChange, name, label = true }: { value: ShowAs; onChange: (v: ShowAs) => void; name?: { firstName: string; lastName: string }; label?: boolean }) {
  const { t } = useI18n();
  const sample = name ?? { firstName: t.profile.firstName, lastName: t.profile.name.split(" ").slice(-1)[0] ?? "" };
  return (
    <fieldset className="showas">
      <legend className={label ? "tiny" : "sr-only"}>{t.schedule.showAsTitle}</legend>
      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
        {SHOW_AS.map((v) => (
          <button key={v} type="button" className={`chip ${value === v ? "is-on" : ""}`} aria-pressed={value === v} onClick={() => onChange(v)}>
            {v === "anon" ? t.schedule.showAs.anon : scheduleName(sample, v)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
