import { motion } from "motion/react";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { classPrices, generalPlans, intro, perClass, planClasses, priceFor, pricing, teensPlan, type ClassKind, type PricingItem } from "../config/pricing";
import { packages } from "../config/packages";
import { services, type ServiceConfig, type ServiceId } from "../config/services";
import { isTodo, mapsEmbedSrc, siteConfig } from "../config/site";
import { reviews, roster, type Person } from "../config/team";
import type { Content } from "../content/en";
import { track } from "../lib/analytics";
import { bookingProvider, fromISO, hasClasses, toISO, upcomingDays, type BookableService, type ClassSlot } from "../lib/booking";
import { useI18n } from "../lib/i18n";
import { relay } from "../lib/relay";
import { PREF_TIMES, type PrefTime } from "../lib/relayTypes";
import { useStore } from "../lib/store";
import { sampleBeds, useRoster, type RosterSlots } from "../lib/roster";
import { scheduleName } from "../lib/relayTypes";
import { loadTurnstile } from "../lib/turnstile";
import { ConsentField, ContactFields, HeardField, profileFrom, readContact, readExtras } from "./forms";
import { MaskImg, Price, Segmented } from "./ui";

export const instructorName = (id: string, isHe: boolean) => {
  const i = roster.find((x) => x.id === id);
  // First name only on class rows ("with Orit"); the full name stays on the founder's card.
  return i ? (isHe ? i.nameHe : i.nameEn).split(" ")[0] : "";
};

/** Same dark title band at the top of every inner page. */
export function PageHead({ title, sub, app = false }: { title: string; sub?: string; app?: boolean }) {
  return (
    <header className="phead tone-dark">
      <div className={`wrap ${app ? "wrap--app" : ""} stack gap-8 screen`}>
        <h1 className="display phead__title">{title}</h1>
        {sub && <p className="lede">{sub}</p>}
      </div>
    </header>
  );
}

/** Portrait (or monogram placeholder), name, role and short bio. */
export function PersonCard({ p, sample = false }: { p: Person; sample?: boolean }) {
  const { isHe, t } = useI18n();
  const name = isHe ? p.nameHe : p.nameEn;
  return (
    <div className="stack gap-12">
      {p.portrait ? (
        <MaskImg src={p.portrait} alt={name} ratio="4 / 5" />
      ) : (
        <div className="portrait" role="img" aria-label={`${name} · ${t.about.portraitSoon}`}>
          <span className="portrait__mono">{name[0]}</span>
          <span>{t.about.portraitSoon}</span>
        </div>
      )}
      <div className="stack gap-4">
        <span className="display d-sm">{name}</span>
        <span className="eyebrow">{isHe ? p.roleHe : p.roleEn}</span>
      </div>
      <p className="small muted">{isHe ? p.bioHe : p.bioEn}</p>
      {sample && !p.approved && <span className="badge badge--outline" style={{ alignSelf: "flex-start" }}>{t.common.sample}</span>}
    </div>
  );
}

export const planName = (p: PricingItem, t: Content, kind?: ClassKind | null) => {
  if (p.track === "teens") return t.pricing.teensPlan;
  const base =
    p.billingType === "monthly"
      ? p.perWeek === "unlimited"
        ? t.pricing.unlimited
        : `${p.perWeek}× ${t.pricing.perWeek}`
      : p.sessions === 1
        ? t.pricing.single
        : `${p.sessions} ${t.pricing.sessions}`;
  return kind ? `${base} · ${t.pricing.kinds[kind]}` : base;
};
/** Price-list title for a pass during the launch month: "5 + 1 free" (poster 2); otherwise the plain name. */
export const listName = (p: PricingItem, t: Content) =>
  siteConfig.flags.launchPricing && p.billingType === "pass" && p.bonusSessions ? t.pricing.plusOne.replace("{n}", String(p.sessions)) : planName(p, t);

export const pricesVisible = (p: PricingItem) => p.active && (p.approved || siteConfig.flags.showUnapprovedPrices);
/** The price to show and charge: the Reformer price, or ₪5 a class less for Mat (`kind`). */
export const effectivePrice = (p: PricingItem, kind?: ClassKind | null) => priceFor(p, kind);

/** Where a service's primary CTA leads. */
export const serviceTarget = (s: ServiceConfig, href: (p?: string) => string) =>
  s.bookable ? href(`schedule?service=${s.id}`) : href(`request?type=${s.id}`);

export function ServiceCard({ s, delay = 0 }: { s: ServiceConfig; delay?: number }) {
  const { t, href } = useI18n();
  const c = t.services.items[s.id];
  return (
    <Link to={href(`services/${s.slug}`)} className="svc-card" onClick={() => track("service_view", { service: s.id })}>
      <MaskImg src={s.image} pos={s.pos} delay={delay} zoom>
        {!s.bookable && <span className="badge badge--blush svc-card__badge">{t.common.byRequest}</span>}
      </MaskImg>
      <div className="svc-card__cap">
        <span className="eyebrow">{c.meta}</span>
        <span className="display d-sm">{c.name}</span>
      </div>
    </Link>
  );
}

export function SlotRow({ slot, index = 0, roster }: { slot: ClassSlot; index?: number; roster?: RosterSlots | null }) {
  const { t, href, isHe } = useI18n();
  const { upcoming, profile } = useStore();
  const myBooking = upcoming.find((b) => b.slotId === slot.id);
  const mine = !!myBooking;
  const cap = slot.capacity;
  // Who is on the beds: the studio's bookings (names as each person chose), plus your own from this phone.
  // Without the roster (offline, local dev) the sample availability stands in, as anonymous beds.
  const booked = sampleBeds(slot.time) ?? roster?.[slot.id] ?? (roster ? [] : slot.takenBeds.map((bed) => ({ bed, name: "" })));
  const beds = cap ? placeBeds(cap, booked, mine ? { bed: myBooking.bed, name: scheduleName(profile, profile.showAs ?? "short") || t.schedule.you, mine: true } : undefined) : null;
  const taken = beds ? beds.filter(Boolean).length : slot.takenBeds.length + (mine ? 1 : 0);
  const left = cap ? cap - taken : null;
  // With real bookings known, "full" means all beds taken (the sample availability flag no longer applies)
  const full = beds ? left === 0 : slot.full || left === 0;
  const status = mine
    ? t.schedule.booked
    : cap === null
      ? t.schedule.smallGroup
      : full
        ? t.schedule.full
        : left === 1
          ? t.schedule.lastSpot
          : `${left} ${t.schedule.spotsLeft}`;
  return (
    <Link to={href(`class/${slot.id}`)} className="slot2" style={{ "--i": index } as CSSProperties}>
      <span className="row between gap-12">
        <span className="slot2__time nums">{slot.time}</span>
        <span className={`slot2__spots ${mine ? "is-mine" : full ? "is-full" : left === 1 ? "is-last" : ""}`}>{status}</span>
      </span>
      <span className="slot2__name">{t.services.items[slot.service].name}</span>
      <span className="small muted">
        {t.home.withInstructor} {instructorName(slot.instructorId, isHe)}
      </span>
      {intro.active && (
        <span className="slot2__price">
          <b>₪{classPrices("adult", undefined, slot.service).single}</b> {t.schedule.introSingle} <i aria-hidden>·</i> {t.schedule.introFrom}<b>₪{classPrices("adult", undefined, slot.service).plan}</b> {t.schedule.introPlan}
        </span>
      )}
      {beds && <BedsRow beds={beds} />}
      <span className="row between gap-12" style={{ marginTop: 6 }}>
        <span className="small muted">
          {slot.minutes} {t.common.min}
        </span>
        <span className={`btn btn--sm ${mine || full ? "btn--secondary" : "btn--primary"} slot2__go`}>
          {mine ? t.schedule.booked : full ? t.my.waitlist : t.common.bookShort}
        </span>
      </span>
    </Link>
  );
}

type BedSeat = { name: string; mine?: boolean } | null;

/** Puts each booking on its bed (1-5); "any bed" bookings take the first free one. */
function placeBeds(cap: number, booked: { bed: number | null; name: string }[], me?: { bed: number | null; name: string; mine: true }): BedSeat[] {
  const beds: BedSeat[] = Array.from({ length: cap }, () => null);
  const all = me ? [...booked, me] : booked;
  const free = () => beds.findIndex((b) => b === null);
  for (const b of all.filter((x) => x.bed !== null)) if (b.bed! < cap && !beds[b.bed!]) beds[b.bed!] = { name: b.name, mine: "mine" in b };
  for (const b of all.filter((x) => x.bed === null || beds[x.bed] === null || beds[x.bed]?.name !== x.name)) {
    if (b.bed !== null && beds[b.bed] && beds[b.bed]!.name === b.name) continue;
    const i = free();
    if (i !== -1) beds[i] = { name: b.name, mine: "mine" in b };
  }
  return beds;
}

/** Five little reformers in a row: filled when booked, with the name the person chose to show underneath. */
function BedsRow({ beds }: { beds: BedSeat[] }) {
  const { t } = useI18n();
  const names = beds.filter((b): b is NonNullable<BedSeat> => !!b).map((b) => b.name || t.schedule.someone);
  return (
    <span className="beds5" role="img" aria-label={names.length ? `${t.schedule.whoBooked}: ${names.join(", ")}` : t.schedule.nobodyYet}>
      {beds.map((b, i) => (
        <span key={i} className={`bed5 ${b ? "is-taken" : ""} ${b?.mine ? "is-mine" : ""}`}>
          {/* A reformer from the side: frame on legs, carriage with headrest, footbar at the end */}
          <svg viewBox="0 0 56 24" width="56" height="24" aria-hidden>
            <path d="M3 18v4M53 18v4" className="bed5__line" />
            <rect x="1.5" y="13" width="53" height="5" rx="2.5" className="bed5__frame" />
            <rect x="9" y="7.5" width="22" height="5" rx="2" className="bed5__carriage" />
            <path d="M31 9.5h4" className="bed5__line" />
            <path d="M46 13V6.5h6V13" className="bed5__line" />
          </svg>
          <small>{b ? b.name || "·" : ""}</small>
        </span>
      ))}
    </span>
  );
}

type PriceTab = "monthly" | "passes" | "teens" | "groups";

/**
 * The price list: Monthly / Passes (the switch picks Reformer or Mat, Mat being ₪5 a class less, and travels to
 * checkout), plus the Teens plan and the closed-group packages on their own tabs.
 */
export function PricingList({ next, limit, initialKind }: { next?: string; limit?: boolean; initialKind?: ClassKind }) {
  const { t, href } = useI18n();
  const [tab, setTab] = useState<PriceTab>("monthly");
  const [kind, setKind] = useState<ClassKind>(initialKind ?? "reformer");
  const launch = siteConfig.flags.launchPricing;
  const teens = teensPlan && pricesVisible(teensPlan) ? teensPlan : undefined;
  const groups = packages.filter((p) => p.approved);
  let rows = generalPlans(tab === "passes" ? pricing.passes : pricing.memberships).filter(pricesVisible);
  if (limit) rows = rows.filter((r) => r.popular || r.perWeek === 1 || r.perWeek === "unlimited" || r.sessions === 5);
  const anyUnapproved = rows.some((r) => !r.approved);
  const query = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    const str = q.toString();
    return str ? `?${str}` : "";
  };

  if (![...pricing.memberships, ...pricing.passes].some(pricesVisible)) {
    return <p className="card muted">{t.pricing.hidden}</p>;
  }
  const tabs: { id: PriceTab; label: string }[] = [
    { id: "monthly", label: t.pricing.monthly },
    { id: "passes", label: t.pricing.passes },
    ...(teens ? [{ id: "teens" as const, label: t.pricing.teens }] : []),
    ...(groups.length ? [{ id: "groups" as const, label: t.pricing.groups }] : []),
  ];
  return (
    <div className="stack gap-16">
      <div className={tabs.length > 2 ? "seg-wrap" : undefined}>
        <Segmented value={tab} onChange={setTab} options={tabs} />
      </div>

      {!limit && <PlanPhoto tab={tab} />}

      {(tab === "monthly" || tab === "passes") && (
        <>
          <div className="row gap-12" style={{ flexWrap: "wrap", alignItems: "center" }}>
            <span className="tiny">{t.pricing.kindLabel}</span>
            <Segmented
              value={kind}
              onChange={(k) => {
                setKind(k);
                track("plan_kind_select", { kind: k });
              }}
              options={[
                { id: "reformer", label: t.pricing.kinds.reformer },
                { id: "mat", label: t.pricing.kinds.mat },
              ]}
            />
          </div>
          {launch && <div className="notice">{t.common.announcement}</div>}
          <div className="stack gap-12 list-in" key={`${tab}-${kind}`}>
            {rows.map((p, i) => (
              <Link
                key={p.id}
                to={href(`checkout/${p.id}${query({ kind, next })}`)}
                className={`price-row ${p.popular ? "is-pop" : ""}`}
                style={{ "--i": i } as CSSProperties}
                onClick={() => track("membership_click", { plan: p.id, kind })}
              >
                <span className="stack gap-4" style={{ flex: 1 }}>
                  <span className="row gap-8 key">
                    {listName(p, t)}
                    {p.popular && <span className="badge">{t.pricing.popular}</span>}
                  </span>
                  <span className="tiny">
                    {t.pricing.kinds[kind]} ·{" "}
                    {p.sessions === 1 || p.perWeek === "unlimited"
                      ? t.pricing.validMonth
                      : p.billingType === "monthly"
                        ? `${t.pricing.validMonth} · ${t.pricing.classes.replace("{n}", String(planClasses(p, launch)))} · ₪${perClass(p, launch, kind)} ${t.pricing.perSession}`
                        : `${t.pricing.classes.replace("{n}", String(planClasses(p, launch)))} · ₪${perClass(p, launch, kind)} ${t.pricing.perSession}${launch && p.bonusSessions ? ` · ${t.pricing.bonus}` : ""}`}
                  </span>
                </span>
                <Price amount={effectivePrice(p, kind)} was={launch && p.launchPrice ? p.price : null} />
              </Link>
            ))}
          </div>
          <p className="tiny">
            {t.pricing.validity} {t.pricing.concession}
            {launch ? ` ${t.pricing.launchNote}` : ""}
          </p>
          {anyUnapproved && (
            <p className="small" style={{ color: "var(--accent)" }}>
              ● {t.pricing.pendingApproval}
            </p>
          )}
        </>
      )}

      {tab === "teens" && teens && <TeensPlan plan={teens} next={next} />}

      {tab === "groups" && <Packages />}
    </div>
  );
}

/** A quiet photo strip above each pricing tab (full pricing page only; the Home excerpt stays plain). */
const PLAN_PHOTOS: Record<PriceTab, { src: string; pos: string }> = {
  monthly: { src: "/assets/ex-membership.webp", pos: "50% 40%" },
  passes: { src: "/assets/ex-pass.webp", pos: "50% 30%" },
  teens: { src: "/assets/ex-teens-after.webp", pos: "50% 50%" },
  groups: { src: "/assets/ex-event.webp", pos: "50% 45%" },
};
function PlanPhoto({ tab }: { tab: PriceTab }) {
  const p = PLAN_PHOTOS[tab];
  return (
    <div className="plan-photo" aria-hidden key={tab}>
      <img src={p.src} alt="" style={{ objectPosition: p.pos }} loading="lazy" />
    </div>
  );
}

/** The girls' weekly group: one monthly plan, bought like any other. */
export function TeensPlan({ plan, next, brief }: { plan: PricingItem; next?: string; brief?: boolean }) {
  const { t, href } = useI18n();
  const c = t.services.items.teens;
  return (
    <div className="stack gap-12 list-in">
      <Link
        to={href(`checkout/${plan.id}${next ? `?next=${next}` : ""}`)}
        className="price-row is-pop"
        onClick={() => track("membership_click", { plan: plan.id })}
      >
        <span className="stack gap-4" style={{ flex: 1 }}>
          <span className="row gap-8 key">{planName(plan, t)}</span>
          <span className="tiny">{t.pricing.teensNote}</span>
          {intro.active && (
            <span className="tiny">
              {classPrices("teen").single <= classPrices("teen").plan
                ? t.pricing.concession
                : `${t.pricing.singlePrice.replace("{price}", String(classPrices("teen").single))} · ${t.pricing.singlePlan.replace("{price}", String(classPrices("teen").plan))}`}
            </span>
          )}
        </span>
        <span className="stack" style={{ alignItems: "flex-end", gap: 2 }}>
          <Price amount={effectivePrice(plan)} />
          <span className="tiny">{t.pricing.perMonth}</span>
        </span>
      </Link>
      {!brief && (
        <>
          <div className="row gap-8" style={{ flexWrap: "wrap" }}>
            {c.tags.map((tag) => (
              <span key={tag} className="tag">
                {tag}
              </span>
            ))}
          </div>
          <p className="tiny">{c.desc}</p>
        </>
      )}
      {!plan.approved && (
        <p className="small" style={{ color: "var(--accent)" }}>
          ● {t.pricing.pendingApproval}
        </p>
      )}
    </div>
  );
}

/** Closed-group packages (private group, event): priced per group, booked by request. */
export function Packages() {
  const { t, href } = useI18n();
  return (
    <div className="stack gap-12 list-in">
      {packages
        .filter((p) => p.approved)
        .map((p, i) => {
          const c = t.services.packages[p.id];
          return (
            <article key={p.id} className="card pkg stack gap-12" style={{ "--i": i } as CSSProperties}>
              <div className="pkg__photo" aria-hidden>
                <img src={p.image} alt="" style={{ objectPosition: p.pos }} loading="lazy" />
              </div>
              <div className="row between gap-12" style={{ alignItems: "flex-start" }}>
                <span className="stack gap-4">
                  <span className="eyebrow">{c.tagline}</span>
                  <span className="display d-sm">{c.name}</span>
                </span>
                <span className="stack" style={{ alignItems: "flex-end", gap: 2 }}>
                  <Price amount={p.price} />
                  <span className="tiny">{t.services.perGroup}</span>
                </span>
              </div>
              <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                <span className="tag">
                  {t.services.upTo} {p.capacity} {t.services.participants}
                </span>
                <span className="tag">
                  {p.minutes} {t.common.min}
                </span>
                <span className="tag">{t.services.byArrangement}</span>
              </div>
              <p className="small muted" style={{ margin: 0 }}>
                {c.desc}
              </p>
              {c.includes.length > 0 && (
                <div className="stack gap-6">
                  <span className="tiny" style={{ fontWeight: 700 }}>
                    {t.services.includes}
                  </span>
                  <ul className="pkg__list">
                    {c.includes.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Link
                to={href(`request?type=groups&package=${p.id}`)}
                className="btn btn--blue btn--block"
                onClick={() => track("package_request", { package: p.id })}
              >
                {t.services.requestDate}
              </Link>
            </article>
          );
        })}
    </div>
  );
}

export function LeadForm({ initialInterest, note }: { initialInterest?: string; note?: string }) {
  const { t, lang } = useI18n();
  const { profile, saveProfile } = useStore();
  const [interest, setInterest] = useState<string>(initialInterest ?? "reformer");
  const [prefTime, setPrefTime] = useState<PrefTime | undefined>();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "queued" | "failed">("idle");
  const [error, setError] = useState<"phone" | "bot" | null>(null);
  const [started, setStarted] = useState(false);
  const turnstile = useTurnstile(started);
  const onStart = () => {
    if (!started) {
      setStarted(true);
      track("lead_form_start");
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const contact = readContact(f);
    const x = readExtras(f);
    setState("sending");
    track("lead_form_submit", { interest });
    setError(null);
    const r = await relay("lead", { lang, contact, interest, note, prefTime, heard: x.heard, consent: x.consent, website: x.website, turnstile: turnstile.token });
    if (r.ok || r.queued) saveProfile(profileFrom(contact, x));
    // The visitor can fix these two; anything else is an infrastructure failure.
    if (!r.ok && !r.queued && (r.error === "turnstile" || r.error?.startsWith("bad ") || r.error === "missing field")) {
      setError(r.error === "turnstile" ? "bot" : "phone");
      setState("idle");
      return;
    }
    setState(r.ok ? "sent" : r.queued ? "queued" : "failed");
  };
  const done = state === "sent" || state === "queued";
  return (
    <form className="card stack gap-16" onSubmit={submit} onFocus={onStart}>
      <div className="stack gap-4">
        <h2 className="display d-sm">{t.contact.leadTitle}</h2>
        <p className="small muted">{t.contact.leadSub}</p>
      </div>
      <ContactFields id="lead" profile={profile} />
      <div className="stack gap-8">
        <span className="tiny">{t.contact.fInterest}</span>
        <div className="row gap-8" style={{ flexWrap: "wrap" }}>
          {services.map((s) => (
            <button
              type="button"
              key={s.id}
              className="pill pill--blush"
              aria-pressed={interest === s.id}
              onClick={() => setInterest(s.id)}
            >
              {t.services.items[s.id as ServiceId].short}
            </button>
          ))}
        </div>
      </div>
      <div className="stack gap-8">
        <span className="tiny">{t.form.prefTime}</span>
        <div className="row gap-8" style={{ flexWrap: "wrap" }}>
          {PREF_TIMES.map((p) => (
            <button type="button" key={p} className="pill pill--blush" aria-pressed={prefTime === p} onClick={() => setPrefTime(prefTime === p ? undefined : p)}>
              {t.form.times[p as keyof typeof t.form.times]}
            </button>
          ))}
        </div>
      </div>
      <HeardField id="lead" profile={profile} />
      <ConsentField profile={profile} />
      <div ref={turnstile.ref} />
      {error && (
        <p className="small" role="alert" style={{ color: "var(--accent)" }}>
          {error === "phone" ? t.contact.errPhone : t.contact.errBot}
        </p>
      )}
      <button className={`btn ${done ? "btn--secondary" : "btn--blush"}`} disabled={done || state === "sending"} aria-live="polite">
        {state === "sending" ? t.form.sending : done ? t.contact.sent : t.contact.send}
      </button>
      <p className="small" aria-live="polite" style={{ margin: 0 }}>
        {state === "queued" ? t.form.saved : state === "failed" ? t.form.failed : ""}
      </p>
    </form>
  );
}

/** Cloudflare Turnstile bot check. Loads only once the visitor starts the form, and only when a site key is set. */
export function useTurnstile(active: boolean) {
  const { lang } = useI18n();
  const [token, setToken] = useState("");
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active || !el) return;
    let id = "";
    let gone = false;
    loadTurnstile().then((api) => {
      if (!api || gone) return;
      id = api.render(el, { sitekey: siteConfig.turnstileSiteKey, language: lang, size: "flexible", theme: "light", callback: setToken, "expired-callback": () => setToken("") });
    });
    return () => {
      gone = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [active, el, lang]);
  return { ref: setEl, token };
}

/** Service chips, day strip and bookable class list. State lives in the URL (?service=&date=). */
/** Formats that can be booked from the schedule (the others are by request). */
const bookableServices = services.filter((s) => s.bookable && hasClasses(s.id as BookableService));

export function ScheduleBoard() {
  const { t, href } = useI18n();
  const [params, setParams] = useSearchParams();
  const service: BookableService = params.get("service") === "mat" && hasClasses("mat") ? "mat" : "reformer";
  const days = upcomingDays(14); // two weeks ahead
  // Default to the first day that still has classes (today may already be over).
  const [firstOpen, setFirstOpen] = useState(toISO(days[0]));
  // A shared or bookmarked link with a past ?date= falls back to the first open day.
  const wanted = params.get("date");
  const date = wanted && wanted >= toISO(days[0]) && toISO(fromISO(wanted)) === wanted ? wanted : firstOpen;
  const [slots, setSlots] = useState<ClassSlot[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      for (const d of upcomingDays(4)) {
        if ((await bookingProvider.getSchedule(service, toISO(d))).length) {
          if (alive) setFirstOpen(toISO(d));
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [service]);

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    p.set(k, v);
    setParams(p, { replace: true, preventScrollReset: true });
  };

  useEffect(() => {
    track("schedule_view", { service });
  }, [service]);

  const roster = useRoster(date);
  useEffect(() => {
    let alive = true;
    bookingProvider.getSchedule(service, date).then((s) => alive && setSlots(s));
    return () => {
      alive = false;
    };
  }, [service, date]);

  return (
    <div className="stack gap-16">
      {bookableServices.length > 1 && (
      <div className="ctabs" role="tablist" aria-label={t.home.classesTitle}>
        {bookableServices.map((svc) => {
          const s = svc.id as BookableService;
          const on = service === s;
          return (
            <button
              key={s}
              role="tab"
              className="ctab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              onClick={() => set("service", s)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                e.preventDefault();
                const i = bookableServices.findIndex((b) => b.id === service);
                const next = bookableServices[(i + (e.key === "ArrowRight" ? 1 : -1) + bookableServices.length) % bookableServices.length];
                set("service", next.id);
                (e.currentTarget.parentElement?.children[bookableServices.indexOf(next)] as HTMLElement | undefined)?.focus();
              }}
            >
              <span className="ctab__img">
                <img src={svc.thumb} alt="" style={{ objectPosition: svc.thumbPos }} />
              </span>
              <span className="ctab__txt">
                <b>{t.services.items[s].short}</b>
                <small>{t.services.items[s].meta}</small>
              </span>
              {on && <motion.span layoutId="ctab-ring" className="ctab__ring" transition={{ type: "spring", duration: 0.4, bounce: 0.15 }} />}
            </button>
          );
        })}
      </div>
      )}
      <div className="days" role="tablist" aria-label={t.schedule.title}>
        {days.map((d, i) => {
          const iso = toISO(d);
          return (
            <button key={iso} role="tab" className="day" aria-selected={iso === date} onClick={() => set("date", iso)}>
              {i === 0 ? t.common.today : t.common.dows[d.getDay()]}
              <b>{d.getDate()}</b>
            </button>
          );
        })}
      </div>
      {intro.active && <IntroPrices />}
      <div className="stack list-in" key={`${service}-${date}`} aria-live="polite">
        {slots?.length === 0 && (
          <div className="card card--dashed stack gap-12 center">
            <p className="small muted">{t.schedule.closedDay}</p>
            <Link to={href("request?type=private")} className="btn btn--secondary btn--sm">
              {t.common.requestTime}
            </Link>
          </div>
        )}
        {slots?.map((s, i) => <SlotRow key={s.id} slot={s} index={i} roster={roster} />)}
      </div>
      {!bookingProvider.isLive && <p className="tiny center">{t.common.demoData}</p>}
    </div>
  );
}

/** Class prices: one class on its own against one class with a plan, adults and teens/soldiers, and the saving (when there is one). */
export function IntroPrices() {
  const { t, href } = useI18n();
  const rows: { who: "adult" | "teen"; kind: ClassKind | null; label: string }[] = [
    { who: "adult", kind: "reformer", label: t.schedule.introAdults },
    { who: "adult", kind: "mat", label: t.schedule.introMat },
    { who: "teen", kind: null, label: t.schedule.introTeens },
  ];
  return (
    <div className="intro card">
      <div className="row between gap-12 wrap-row">
        <span className="eyebrow">{t.schedule.introTitle}</span>
        <Link to={href("pricing")} className="link tiny">
          {t.schedule.introSeePlans}
        </Link>
      </div>
      <div className="intro__grid">
        {rows.map(({ who, kind, label }) => {
          const p = classPrices(who, undefined, kind);
          return (
            <div key={`${who}-${kind}`} className="intro__row">
              <span className="intro__who">{label}</span>
              <span className="intro__cell">
                <b>₪{p.single}</b>
                <small>{t.schedule.introSingle}</small>
              </span>
              <span className="intro__cell intro__cell--plan">
                <b>
                  <span className="tiny">{t.schedule.introFrom}</span>₪{p.plan}
                </b>
                <small>
                  {t.schedule.introPlan} · {t.schedule.introPerClass}
                </small>
              </span>
              {p.single > p.plan && <span className="intro__save">{t.schedule.introSave.replace("{n}", String(p.single - p.plan))}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Google-style review cards. Real, approved reviews always show; labelled samples only in demo mode. */
export function GoogleReviews() {
  const { t, isHe } = useI18n();
  if (!siteConfig.flags.showReviews) return null;
  const real = reviews.filter((r) => r.approved);
  const list = real.length > 0 ? real : siteConfig.flags.demoMode ? reviews.filter((r) => r.sample) : [];
  if (list.length === 0) return null;
  const g = siteConfig.social;
  return (
    <div className="quotes">
      <div className="row between gap-12 wrap-row">
        <p className="row gap-8 eyebrow" style={{ color: "var(--ink)" }}>
          <GoogleG /> {t.home.googleTitle}
        </p>
        <div className="row gap-8 wrap-row">
          {!isTodo(g.googleBusiness) && (
            <a className="btn btn--sm btn--secondary" href={g.googleBusiness} target="_blank" rel="noreferrer">
              {t.home.googleRead}
            </a>
          )}
          <a
            className="btn btn--sm btn--primary btn--arrow"
            href={isTodo(g.googleReview) ? undefined : g.googleReview}
            aria-disabled={isTodo(g.googleReview)}
            target="_blank"
            rel="noreferrer"
          >
            {t.home.googleWrite}
          </a>
        </div>
      </div>
      <div className="grid-3">
        {list.slice(0, 3).map((r) => (
          <figure key={r.id} className={`quote ${r.sample ? "quote--sample" : ""}`}>
            <span className="stars" aria-label={`${r.stars ?? 5} / 5`}>
              {"★★★★★".slice(0, r.stars ?? 5)}
            </span>
            <blockquote>“{isHe ? r.quoteHe : r.quoteEn}”</blockquote>
            <figcaption className="row between gap-8 tiny">
              <span>{r.author}</span>
              {r.source === "google" && <GoogleG small />}
            </figcaption>
            {r.sample && <span className="badge badge--outline">{t.home.sampleBadge}</span>}
          </figure>
        ))}
      </div>
    </div>
  );
}

function GoogleG({ small = false }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Live Google map of the studio (keyless embed; Google adds its own "Open in Maps" link). */
export function MapEmbed() {
  const { t, lang } = useI18n();
  return (
    <div className="map map--embed">
      <iframe title={t.contact.mapTitle} src={mapsEmbedSrc(lang)} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
    </div>
  );
}
