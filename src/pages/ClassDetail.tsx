import { ReformerSketch } from "../components/art";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { instructorName, planLeft, planName, redeemLabel } from "../components/blocks";
import { openChat } from "../components/ChatWidget";
import { Check, Sheet, Switch } from "../components/ui";
import { classPrices, planById, priceFor, singleClass } from "../config/pricing";
import { serviceById } from "../config/services";
import { track } from "../lib/analytics";
import { bookingProvider, fromISO, rememberBed, slotStart, type ClassSlot } from "../lib/booking";
import { withRoster } from "../lib/roster";
import { useI18n } from "../lib/i18n";
import { downloadIcs } from "../lib/ics";
import { planCovers, planUsage } from "../lib/plan";
import { useSeo } from "../lib/seo";
import { relay } from "../lib/relay";
import { SHOW_AS, scheduleName, type Contact, type ShowAs, type SlotRef } from "../lib/relayTypes";
import { useStore } from "../lib/store";
import { ContactFields, readContact, TermsField } from "../components/forms";
import { siteConfig } from "../config/site";
import { healthValid } from "../lib/health";

export default function ClassDetail() {
  const { id = "" } = useParams();
  const { t, href, isHe, fmtDate, lang } = useI18n();
  const store = useStore();
  const nav = useNavigate();
  const [slot, setSlot] = useState<ClassSlot | null | undefined>(undefined);
  const [bed, setBed] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [refused, setRefused] = useState(false); // the studio refused the hold: another class is already held before payment
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
  // A plan that does not cover this class (a teens plan on the adult schedule, a Mat plan on a Reformer class)
  // is left out: the class is then bought like a visitor's, on its own.
  const owned = store.planId ? planById(store.planId) : undefined;
  const plan = owned && planCovers(owned, store.planKind, slot.service) ? owned : undefined;
  const renews = !!store.autoRenew && !store.planPending;
  const usage = plan ? planUsage(plan, store.bookings.filter((b) => b.slotId !== slot.id), fromISO(slot.date), store.planStart, store.carry ?? 0, renews) : null;
  const atLimit = !!usage && usage.left <= 0;
  // The balance once this class is redeemed, shown on the "spot saved" screen
  const after = plan && confirmed ? planUsage(plan, store.bookings, fromISO(slot.date), store.planStart, store.carry ?? 0, renews) : null;
  // Before payment only one class can be held at a time. Reserving here would hold another one when the plan is still
  // unpaid, or (no plan covering this class, payment closed) when the class would be held at checkout.
  const holdsUnpaid = plan ? !!store.planPending : !siteConfig.flags.paymentsLive;
  const otherHeld = holdsUnpaid && store.held && store.held.slotId !== slot.id ? store.held : undefined;
  // One class bought on its own: a visitor's way in, and a member's when the plan is used up
  const singleLink = (primary: boolean) => (
    <Link
      to={href(`checkout/${singleClass.id}?kind=${slot.service}&next=${slot.id}`)}
      className={`btn ${primary ? "btn--sand" : "btn--secondary"} btn--block`}
      onClick={() => {
        rememberBed(slot.id, isReformer ? bed : null);
        track("membership_click", { plan: singleClass.id, kind: slot.service });
      }}
    >
      {t.confirm.single.replace("{price}", String(priceFor(singleClass, slot.service)))}
    </Link>
  );
  // Name and phone are asked once (first booking or waitlist), then remembered on this device.
  const needsDetails = !store.profile.firstName || !store.profile.lastName || !store.profile.phone;
  // How the name shows on the schedule beds for the others in the class; remembered for next time
  const showAs: ShowAs = store.profile.showAs ?? "short";
  const setShowAs = (v: ShowAs) => store.saveProfile({ showAs: v });
  const slotRef: SlotRef = { slotId: slot.id, service: slot.service, date: slot.date, time: slot.time, minutes: slot.minutes, capacity: slot.capacity };
  const whoFrom = (form: HTMLFormElement | null): Contact => {
    if (form && needsDetails) {
      const f = new FormData(form);
      const c = readContact(f);
      // First booking on this device doubles as registration: the studio terms box is required there
      store.saveProfile({ firstName: c.firstName, lastName: c.lastName, phone: c.phone, ...(f.get("terms") === "on" ? { termsAcceptedAt: new Date().toISOString(), termsVersion: siteConfig.policies.termsVersion } : {}) });
      return c;
    }
    const p = store.profile;
    return { firstName: p.firstName, lastName: p.lastName, phone: p.phone, email: p.email || undefined };
  };
  const confirm = (e: FormEvent) => {
    e.preventDefault();
    if (atLimit) return;
    const local = store.book(slot, isReformer ? bed : null, remind, { held: !!store.planPending });
    if (!local) return;
    const contact = whoFrom(e.currentTarget as HTMLFormElement);
    // A plan ordered before online payment opened holds the bed (status "Held") until the studio takes payment
    relay("booking", { lang, contact, slot: slotRef, bed: isReformer ? bed : null, showAs, ...(store.planPending ? { held: true } : {}) }, { ref: local.id }).then((r) => {
      if (r.id) store.setRemoteId(local.id, r.id);
      else if (r.error === "held limit") {
        store.cancel(local.id);
        setConfirmed(false);
        setRefused(true);
      }
    });
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
        <div className="media media--page">
          <img src={svc.image} alt="" style={{ objectPosition: svc.pos }} />
          <div className="scrim" />
          <div className="media__cap stack gap-4">
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
            <p className="tiny center">{!plan ? t.klass.payNoteVisitor : store.planPending ? t.klass.payNotePending : t.klass.payNote}</p>
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
                <span className={plan ? "" : "hi"}>
                  {plan ? (store.planPending ? t.confirm.payPlanPending : t.confirm.payPlan).replace("{plan}", planName(plan, t, store.planKind)) : t.confirm.payNone}
                </span>
              </div>
              <div className="kv" style={{ alignItems: "center", borderBottom: 0 }}>
                <span>{t.confirm.remind}</span>
                <Switch checked={remind} onChange={setRemind} label={t.confirm.remind} />
              </div>
            </div>
            {usage && plan && (
              <p className={`plan-left ${atLimit ? "is-out" : ""}`}>
                {!atLimit
                  ? planLeft(plan, usage, t)
                  : usage.expired
                    ? plan.billingType === "monthly"
                      ? t.confirm.planEnded
                      : t.confirm.passExpired
                    : (plan.billingType === "monthly" ? t.confirm.limitWeek : t.confirm.limitPass).replace("{used}", String(usage.used)).replace("{cap}", String(usage.cap))}
              </p>
            )}
            {refused ? (
              <div className="notice" role="alert">
                <span className="small">{t.confirm.holdLimitStudio}</span>
              </div>
            ) : otherHeld ? (
              <div className="notice stack gap-8" role="status">
                <span className="small">
                  {t.confirm.holdLimit.replace("{class}", `${fmtDate(fromISO(otherHeld.date))} · ${otherHeld.time}`)}
                </span>
                <Link to={href("my")} className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start" }}>
                  {t.confirm.viewBookings}
                </Link>
              </div>
            ) : plan && usage && atLimit ? (
              <>
                <p className="small muted center">{plan.billingType === "monthly" && !usage.expired ? t.confirm.limitHint : t.confirm.limitPassHint}</p>
                <Link to={href(`pricing?kind=${slot.service}&next=${slot.id}`)} className="btn btn--sand btn--block" onClick={() => rememberBed(slot.id, isReformer ? bed : null)}>
                  {t.confirm.upgrade}
                </Link>
                {singleLink(false)}
              </>
            ) : plan && usage ? (
              <form className="stack gap-12" onSubmit={confirm}>
                {needsDetails && (
                  <>
                    <p className="small muted">{t.form.detailsNote}</p>
                    <ContactFields id="bk" profile={store.profile} email="none" />
                    <TermsField profile={store.profile} />
                  </>
                )}
                {isReformer && (
                  <ShowAsPicker value={showAs} onChange={setShowAs} name={needsDetails ? undefined : store.profile} />
                )}
                {healthValid(store.profile.health) ? (
                  <>
                    <button className="btn btn--sand btn--block">
                      {redeemLabel(plan, usage, t)}
                    </button>
                    {store.planPending && <p className="tiny center">{t.confirm.pending}</p>}
                  </>
                ) : (
                  <div className="notice stack gap-8" role="status">
                    <b>{t.health.gateTitle}</b>
                    <span className="small">{t.health.gateSub}</span>
                    <Link to={href(`health?next=${encodeURIComponent(`class/${slot.id}`)}`)} className="btn btn--sand btn--block">
                      {t.health.gateCta}
                    </Link>
                  </div>
                )}
              </form>
            ) : (
              <>
                {singleLink(true)}
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
              {t.confirm.policy}: {t.my.policyText.replace("{hours}", String(siteConfig.policies.cancelHours))}
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
            {after && plan && after.cap !== null && <p className="plan-left">{planLeft(plan, after, t)}</p>}
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
