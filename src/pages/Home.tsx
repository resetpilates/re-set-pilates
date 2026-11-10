import type { CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import { GoogleReviews, MapEmbed, PersonCard, ScheduleBoard, effectivePrice, planName, pricesVisible } from "../components/blocks";
import { openChat } from "../components/ChatWidget";
import { Logo } from "../components/Shell";
import { Accordion, Reveal, Verified } from "../components/ui";
import { ReformerLineArt, ReformerTopArt } from "../components/art";
import { pricing } from "../config/pricing";
import { services } from "../config/services";
import { addressLine, isTodo, mapsLink, siteConfig } from "../config/site";
import { founder, instructors, reviews } from "../config/team";
import { track } from "../lib/analytics";
import { fromISO } from "../lib/booking";
import { useI18n } from "../lib/i18n";
import { localBusinessLd, useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import { WaIcon, useWaLink, waReady } from "../lib/whatsapp";

const FEATURED = ["m1x", "m3x", "munl"];

/** One long page: hero → why → classes → schedule → pricing → people → visit → questions → book. */
export default function Home() {
  const { t, href, isHe, fmtDate } = useI18n();
  const wa = useWaLink();
  const { upcoming, isMember, profile } = useStore();
  useSeo(t.meta.home, localBusinessLd(isHe ? "he" : "en"));
  const next = upcoming[0];
  const c = siteConfig.contact;
  const maps = mapsLink();
  const launch = siteConfig.flags.launchPricing;
  const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
  const loc = useLocation();
  const firstTimer = !isMember && upcoming.length === 0;
  const plans = pricing.memberships.filter((p) => FEATURED.includes(p.id) && pricesVisible(p));
  const city = isHe ? c.cityHe : c.cityEn;

  return (
    <div className="page page--bleed tone-dark">
      {/* Hero */}
      {/* First screen: the RE:SET wordmark on white, no film (owner, 11 Nov 2026), then the welcome line, headline and buttons */}
      <section className="hero hero--ed hero--sport hero--v4 hero--logo">
        <div className="wrap hero__body">
          {/* Top: the welcome, with the member's name when we know her. Middle: the photo breathes. */}
          <img className="hero__mark fade-up" style={d(60)} src={siteConfig.studioMedia.wordmark} alt="re:set pilates" />
          <p className="hero__greet fade-up" style={d(100)}>
            {t.home.greetingGuest}
            {profile.firstName && <b>{profile.firstName}</b>}
          </p>
          {/* Bottom: the headline and the two buttons share one column and one left edge */}
          <div className="hero__bottom">
            <h1 className="hero__title">
              {t.home.heroSport.map((line, i) => (
                <span className="line" key={line}>
                  <span style={d(200 + i * 130)}>{line}</span>
                </span>
              ))}
            </h1>
            <div className="hero__offer fade-up" style={d(500)}>
              <a href="#schedule" className="btn btn--gold" onClick={() => track("book_reformer_click", { source: "hero" })}>
                {t.nav.bookTitle}
              </a>
              <Link to={href("profile")} className="btn btn--outline" onClick={() => track("hero_join_click")}>
                {t.home.heroJoin}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Member: next class */}
      {next && (
        <section className="wrap" style={{ paddingTop: 24 }}>
          <Link to={href("my")} className="card row gap-16">
            <span className="date-tile">
              {t.common.dows[fromISO(next.date).getDay()]}
              <b>{fromISO(next.date).getDate()}</b>
            </span>
            <span className="stack gap-4" style={{ flex: 1 }}>
              <span className="eyebrow">{t.home.nextClass}</span>
              <span className="key">
                <span className="nums">{next.time}</span> · {t.services.items[next.service].name}
              </span>
              <span className="key key--date">{fmtDate(fromISO(next.date))}</span>
            </span>
            <span className="chev" aria-hidden />
          </Link>
        </section>
      )}

      {/* Why */}
      <section className="section">
        <div className="wrap block tone-raise block--sketch">
          <ReformerTopArt className="sketch sketch--small sketch--top" />
          <Reveal>
            <h2 className="display d-lg">
              {t.home.statHead.map((l) => (
                <span key={l} style={{ display: "block" }}>
                  {l}
                </span>
              ))}
            </h2>
          </Reveal>
          <div className="facts3">
            {t.home.stats.map((s, i) => (
              <Reveal key={s.n} delay={i * 90} className="stack gap-4">
                <span className="display d-sm">{s.n}</span>
                <span className="small muted">{s.l}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* First-timer path */}
      {(firstTimer || loc.hash === "#first-class") && (
        <section id="first-class" className="section--tight">
          <div className="wrap">
            <Reveal className="stack gap-8 sec-title">
              <p className="eyebrow">{t.home.newHereEyebrow}</p>
              <h2 className="display d-lg">{t.home.newHereTitle}</h2>
            </Reveal>
            <ol className="steps">
              {t.home.firstSteps.map((st, i) => (
                <Reveal as="li" key={st.t} delay={i * 90} className="step">
                  <span className="step__n">{i + 1}</span>
                  <span className="stack gap-4">
                    <b className="d-sm display">{st.t}</b>
                    <span className="small muted">{st.d}</span>
                  </span>
                </Reveal>
              ))}
            </ol>
            <div className="row gap-12 wrap-row" style={{ marginTop: 24 }}>
              <a href="#schedule" className="btn btn--primary btn--arrow" onClick={() => track("book_reformer_click", { source: "first-timer" })}>
                {t.nav.bookTitle}
              </a>
              <Link to={href("quiz")} className="btn btn--secondary">
                {t.home.notSure}
              </Link>
              <button className="btn btn--ghost" onClick={openChat}>
                {t.home.askTeam}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Classes */}
      <section id="classes" className="section--tight">
        <div className="wrap">
          <Reveal>
            <h2 className="display d-lg sec-title">{t.home.classesTitle}</h2>
          </Reveal>
          <div>
            {services.map((s) => {
              const sc = t.services.items[s.id];
              return (
                <Reveal key={s.id}>
                  <Link
                    to={href(`schedule?service=${s.id}`)}
                    className="flow-row ccard"
                    onClick={() => track("service_view", { service: s.id })}
                  >
                    <span className="ccard__media" aria-hidden>
                      <img src={s.image} alt="" style={{ objectPosition: s.pos }} loading="lazy" />
                      <span className="ccard__chip">{sc.meta}</span>
                    </span>
                    <span className="ccard__body">
                      <span className="display d-md ccard__title">{sc.name}</span>
                      <span className="ccard__blurb">{sc.blurb}</span>
                      <span className="ccard__cta ccard__cta--book ccard__cta--reformer">
                        {/* A reformer from the side: frame on legs, carriage, footbar */}
                        <svg className="reformer-ico" viewBox="0 0 44 18" width="44" height="18" aria-hidden>
                          <path d="M3 13v3M41 13v3" />
                          <rect x="1.5" y="9.5" width="41" height="3.5" rx="1.75" />
                          <rect x="7" y="4.5" width="17" height="4" rx="1.5" className="reformer-ico__carriage" />
                          <path d="M24 6.5h3.5" />
                          <path d="M34 9.5V3h5v6.5" />
                        </svg>
                        {t.nav.bookTitle}
                        <span className="chev" aria-hidden />
                      </span>
                    </span>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Schedule */}
      <section id="schedule" className="section">
        <div className="wrap split split--top">
          <Reveal>
            <h2 className="display d-lg sec-title">{t.home.upcoming}</h2>
            <p className="lede">{t.schedule.sub}</p>
          </Reveal>
          <ScheduleBoard />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="section--tight">
        <div className="wrap">
          <Reveal>
            <h2 className="display d-lg sec-title">{t.home.pricingTitle}</h2>
            <p className="lede">{t.pricing.sub}</p>
          </Reveal>
          <div className="plans">
            {plans.map((p, i) => (
              <Reveal key={p.id} delay={i * 90} className="plan">
                <div className={`mcard mcard--${p.tone}`} aria-hidden>
                  <Logo tone={p.tone === "ink" ? "cream" : "ink"} />
                  <div className="stack">
                    <span className="mcard__name">{planName(p, t)}</span>
                    <span className="mcard__sub">PILATES · {(isHe ? "HOD HASHARON" : city).toUpperCase()}</span>
                  </div>
                </div>
                <div className="stack gap-12" style={{ padding: "4px 4px 0" }}>
                  <span className="row gap-8">
                    <span className="display d-sm">{planName(p, t)}</span>
                    {p.popular && <span className="badge">{t.pricing.popular}</span>}
                  </span>
                  <span className="plan__price">
                    <b>₪{effectivePrice(p)}</b>
                    {launch && p.launchPrice ? <s>₪{p.price}</s> : null}
                    <span className="small muted">· {t.pricing.validMonth}</span>
                  </span>
                  <Link
                    to={href(`checkout/${p.id}`)}
                    className={`btn btn--block ${p.popular ? "btn--primary" : "btn--secondary"} btn--arrow`}
                    onClick={() => track("membership_click", { plan: p.id })}
                  >
                    {t.pricing.choose}
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
          <Link to={href("pricing")} className="link" style={{ marginTop: 20 }}>
            {t.home.allPlans}
          </Link>

          {/* Reviews sit right under the prices */}
          <GoogleReviews />
        </div>
      </section>

      {/* People */}
      <section id="team" className="section tone-blush">
        <div className="wrap stack gap-32">
          <Reveal>
            <h2 className="display d-lg">{t.home.teamTitle}</h2>
          </Reveal>
          <div className="grid-3">
            {[founder, ...instructors].map((p, i) => (
              <Reveal key={p.id} delay={i * 80}>
                <PersonCard p={p} sample />
              </Reveal>
            ))}
          </div>
          <p className="tiny">{t.home.teamNote}</p>
          {siteConfig.flags.showReviews && reviews.some((r) => r.approved) && (
            <div className="grid-3">
              {reviews
                .filter((r) => r.approved)
                .map((r) => (
                  <blockquote key={r.id} className="stack gap-12" style={{ margin: 0 }}>
                    <p className="display d-sm">“{isHe ? r.quoteHe : r.quoteEn}”</p>
                    <cite className="small" style={{ fontStyle: "normal" }}>
                      {r.author}
                    </cite>
                  </blockquote>
                ))}
            </div>
          )}
        </div>
      </section>

      {/* Visit */}
      <section id="visit" className="section">
        <div className="wrap block tone-raise">
          <Reveal>
            <h2 className="display d-lg">{t.home.visitTitle}</h2>
          </Reveal>
          <div className="facts3">
            <Reveal className="stack gap-12">
              <span className="display d-sm">{addressLine(isHe)}</span>
              <span className="small muted">
                {t.contact.parking}: <Verified value={c.parking[isHe ? "he" : "en"]} />
              </span>
              <a className="btn btn--secondary btn--sm btn--arrow" href={maps} target="_blank" rel="noreferrer" style={{ alignSelf: "flex-start" }}>
                {t.common.directions}
              </a>
            </Reveal>
            <Reveal delay={90} className="stack gap-12">
              <span className="display d-sm">{t.contact.hours}</span>
              {isTodo(c.hours) ? (
                <a href="#schedule" className="small muted">
                  {t.contact.hoursBySchedule}
                </a>
              ) : (
                <span className="small muted">{c.hours}</span>
              )}
            </Reveal>
            <Reveal delay={180} className="stack gap-12">
              <span className="display d-sm">{t.home.sayHello}</span>
              {waReady() && (
                <a href={wa} target="_blank" rel="noreferrer" className="hello__wa" onClick={() => track("whatsapp_click", { source: "home" })}>
                  <WaIcon size={18} />
                  <span dir="ltr">{c.phone}</span>
                  <span className="small muted">· {t.wa.label}</span>
                </a>
              )}
              <a href={`mailto:${c.email}`} className="small muted" dir="ltr" style={{ textAlign: "start" }}>
                {c.email}
              </a>
              <a href={siteConfig.social.instagram} target="_blank" rel="noreferrer" className="small muted" dir="ltr" style={{ textAlign: "start" }}>
                {siteConfig.social.instagramHandle}
              </a>
              <Link to={href("contact")} className="btn btn--secondary btn--sm btn--arrow" style={{ alignSelf: "flex-start" }} onClick={() => track("contact_click", { source: "home" })}>
                {t.nav.contact}
              </Link>
            </Reveal>
          </div>
          <Reveal className="visit-map">
            <MapEmbed />
          </Reveal>
        </div>
      </section>

      {/* Questions */}
      <section id="faq" className="section--tight">
        <div className="wrap split split--top">
          <Reveal>
            <h2 className="display d-lg sec-title">{t.faq.title}</h2>
            <p className="lede">{t.faq.sub}</p>
          </Reveal>
          <Reveal delay={100}>
            <Accordion items={t.faq.items.slice(0, 6)} defaultOpen={0} />
            <Link to={href("faq")} className="link" style={{ marginTop: 12 }}>
              {t.nav.faq}
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Book */}
      <section className="section tone-studio band--sketch">
        <ReformerLineArt className="sketch sketch--band" />
        <Reveal className="wrap stack gap-24">
          <h2 className="display d-xl">
            {t.home.ctaTitle.map((l) => (
              <span key={l} style={{ display: "block" }}>
                {l}
              </span>
            ))}
          </h2>
          <p className="lede">{t.home.sub}</p>
          <div>
            <a href="#schedule" className="btn btn--gold btn--arrow" onClick={() => track("book_reformer_click", { source: "footer" })}>
              {t.nav.bookTitle}
            </a>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
