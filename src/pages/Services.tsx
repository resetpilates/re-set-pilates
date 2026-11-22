import { Link, useParams } from "react-router-dom";
import { PageHead, Packages, TeensPlan, pricesVisible, serviceTarget } from "../components/blocks";
import { classPrices, teensPlan } from "../config/pricing";

/** Group classes that can also be bought one at a time (shows "Single class: ₪60", Mat ₪55, teens ₪50). */
const SINGLE_CLASS = ["reformer", "mat", "teens"];
import { serviceBySlug, services, type ServiceId } from "../config/services";
import { packages } from "../config/packages";
import { waLink } from "../config/site";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";

/** The price line a service shows on its card and page: single class and plan price, a group package price, or "price on request". */
function ServicePrice({ id }: { id: ServiceId }) {
  const { t } = useI18n();
  if (SINGLE_CLASS.includes(id)) {
    const cp = classPrices(id === "teens" ? "teen" : "adult", undefined, id === "mat" ? "mat" : "reformer");
    if (cp.plan >= cp.single)
      return (
        <span className="svc__price">
          <b className="nums">₪{cp.single}</b>
          <small>{t.services.samePrice}</small>
        </span>
      );
    return (
      <span className="svc__price">
        <b className="nums">₪{cp.single}</b>
        <small>{t.schedule.introSingle}</small>
        <i aria-hidden>·</i>
        <span className="svc__from">
          {t.schedule.introFrom}
          <b className="nums">₪{cp.plan}</b> {t.schedule.introPlan}
        </span>
      </span>
    );
  }
  if (id === "groups") {
    const from = Math.min(...packages.filter((p) => p.approved).map((p) => p.price));
    return (
      <span className="svc__price">
        <small>{t.schedule.introFrom.trim()}</small>
        <b className="nums">₪{from}</b>
        <small>{t.services.perGroup}</small>
      </span>
    );
  }
  return (
    <span className="svc__price svc__price--ask">
      <small>{t.services.priceOnRequest}</small>
    </span>
  );
}

/** All services as medium cards: a short people-free photo, the fuller description, tags and the price. Each card opens the service's page. */
export function Services() {
  const { t, href } = useI18n();
  useSeo(t.meta.services);
  return (
    <div className="page tone-dark page--still">
      <PageHead title={t.services.title} sub={t.services.sub} />
      <section className="section--tight">
        <div className="wrap">
          <div className="svcs">
            {services.map((s) => {
              const c = t.services.items[s.id];
              const ask = !SINGLE_CLASS.includes(s.id) && s.id !== "groups";
              return (
                <article key={s.id} className="svc">
                  <figure className="svc__photo" aria-hidden>
                    <img src={s.image} alt="" style={{ objectPosition: s.pos }} loading="lazy" decoding="async" />
                    <figcaption>{c.meta}</figcaption>
                  </figure>
                  <div className="svc__body">
                    <h2 className="display d-md svc__title">
                      <Link to={href(`services/${s.slug}`)} className="svc__link" onClick={() => track("service_view", { service: s.id })}>
                        {c.name}
                      </Link>
                    </h2>
                    <p className="svc__desc">{c.desc}</p>
                    <ul className="svc__tags">
                      {c.tags.map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                    <div className="svc__foot">
                      <ServicePrice id={s.id} />
                      {ask ? (
                        <a href={waLink(`${t.services.priceOnRequest}: ${c.name}`)} target="_blank" rel="noreferrer" className="svc__ask">
                          {t.services.askOnWhatsApp}
                        </a>
                      ) : (
                        <span className="svc__more" aria-hidden>
                          {t.common.learnMore}
                          <span className="chev" />
                        </span>
                      )}
                    </div>
                  </div>
                </article>
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
            {!SINGLE_CLASS.includes(s.id) && s.id !== "groups" && (
              <div>
                <span className="muted">{t.services.price}</span>
                <span className="stack" style={{ alignItems: "flex-end", gap: 2, paddingBlock: 10 }}>
                  <b>{t.services.priceOnRequest}</b>
                  <a href={waLink(`${t.services.priceOnRequest}: ${c.name}`)} target="_blank" rel="noreferrer" className="link tiny">
                    {t.services.askOnWhatsApp}
                  </a>
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
