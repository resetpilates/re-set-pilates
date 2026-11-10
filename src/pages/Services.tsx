import { Link, useParams } from "react-router-dom";
import { PageHead, Packages, TeensPlan, pricesVisible, serviceTarget } from "../components/blocks";
import { classPrices, teensPlan } from "../config/pricing";

/** Group classes that can also be bought one at a time (shows "Single class: ₪60", Mat ₪55, teens ₪50). */
const SINGLE_CLASS = ["reformer", "mat", "teens"];
import { serviceBySlug, services } from "../config/services";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";

/** Same cards as "Our classes" on the home page (the #classes styles); each card opens the service's page. */
export function Services() {
  const { t, href } = useI18n();
  useSeo(t.meta.services);
  return (
    <div className="page tone-dark page--still">
      <PageHead title={t.services.title} sub={t.services.sub} />
      <section id="classes" className="section--tight">
        <div className="wrap">
          <div>
            {services.map((s) => {
              const c = t.services.items[s.id];
              return (
                <div key={s.id} className="reveal is-in">
                  <Link to={href(`services/${s.slug}`)} className="flow-row ccard" onClick={() => track("service_view", { service: s.id })}>
                    <span className="ccard__media" aria-hidden>
                      <img src={s.image} alt="" style={{ objectPosition: s.pos }} loading="eager" decoding="async" />
                      <span className="ccard__chip">{c.meta}</span>
                    </span>
                    <span className="ccard__body">
                      <span className="display d-md ccard__title">{c.name}</span>
                      <span className="ccard__blurb">{c.blurb}</span>
                      <span className={`ccard__cta ${s.bookable ? "ccard__cta--book" : ""}`}>
                        {t.common.learnMore}
                        <span className="chev" aria-hidden />
                      </span>
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

export function ServiceDetail() {
  const { slug = "" } = useParams();
  const { t, href } = useI18n();
  const s = serviceBySlug(slug) ?? services[0];
  const c = t.services.items[s.id];
  const cp = classPrices(s.id === "teens" ? "teen" : "adult", undefined, s.id === "mat" ? "mat" : "reformer");
  useSeo({ title: `${c.name} | re:set pilates`, desc: c.desc });
  return (
    <div className="page page--bleed tone-dark page--still">
      <section className="phero">
        <img src={s.image} alt="" style={{ objectPosition: s.pos }} />
        <div className="wrap phero__body stack gap-12">
          <span className="eyebrow" style={{ color: "var(--cream)" }}>
            {c.meta}
          </span>
          <h1 className="display d-lg">{c.name}</h1>
        </div>
      </section>
      <section className="section--tight">
        <div className="wrap wrap--narrow stack gap-32">
          <div>
            <p className="display d-sm" style={{ lineHeight: 1.35 }}>
              {c.desc}
            </p>
          </div>
          <div className="rows card" style={{ paddingBlock: 6 }}>
            <div>
              <span className="muted">{t.services.forWho}</span>
              <span style={{ textAlign: "end", maxWidth: "60%", paddingBlock: 12 }}>{c.who}</span>
            </div>
            <div>
              <span className="muted">{t.services.format}</span>
              <span style={{ textAlign: "end", maxWidth: "60%", paddingBlock: 12 }}>{c.format}</span>
            </div>
            <div>
              <span className="muted">{t.services.duration}</span>
              <span>
                {s.minutes} {t.common.min}
              </span>
            </div>
            {SINGLE_CLASS.includes(s.id) && (
              <div>
                <span className="muted">{t.pricing.single}</span>
                <span className="stack" style={{ alignItems: "flex-end", gap: 2, paddingBlock: 10 }}>
                  <b>₪{cp.single}</b>
                  <Link to={href(s.id === "teens" ? "pricing" : `pricing?kind=${s.id}`)} className="link tiny">
                    {cp.plan < cp.single ? t.pricing.singlePlan.replace("{price}", String(cp.plan)) : t.pricing.concession}
                  </Link>
                </span>
              </div>
            )}
            {s.capacity && (
              <div>
                <span className="muted">{t.services.capacity}</span>
                <span>
                  {t.services.upTo} {s.capacity}
                </span>
              </div>
            )}
          </div>
          {s.id === "teens" && teensPlan && pricesVisible(teensPlan) && (
            <div className="stack gap-12">
              <h2 className="display d-sm">{t.pricing.title}</h2>
              <TeensPlan plan={teensPlan} brief />
            </div>
          )}
          {s.id === "groups" && (
            <div className="stack gap-12">
              <h2 className="display d-sm">{t.services.packagesTitle}</h2>
              <Packages />
            </div>
          )}
          <div className="row gap-12" style={{ flexWrap: "wrap" }}>
            <Link to={serviceTarget(s, href)} className={`btn ${s.bookable ? "btn--primary" : "btn--blue"}`} onClick={() => s.id === "reformer" && track("book_reformer_click", { source: "service" })}>
              {s.bookable ? t.common.seeSchedule : t.common.requestSession}
            </Link>
            <Link to={href("pricing")} className="btn btn--secondary">
              {t.nav.pricing}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
