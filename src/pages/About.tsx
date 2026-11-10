import { Link } from "react-router-dom";
import { PageHead, PersonCard } from "../components/blocks";
import { Accordion, MaskImg, Reveal } from "../components/ui";
import { siteConfig } from "../config/site";
import { founder, instructors, pressMentions } from "../config/team";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { faqLd, useSeo } from "../lib/seo";

export function About() {
  const { t, href, isHe } = useI18n();
  useSeo(t.meta.about);
  const founderName = isHe ? founder.nameHe : founder.nameEn;
  return (
    <div className="page page--bleed tone-dark">
      <section className="phero" style={{ minHeight: "min(78svh, 680px)" }}>
        <img src="/assets/studio.webp" alt="" style={{ objectPosition: "50% 60%" }} />
        <div className="wrap phero__body stack gap-12">
          <span className="eyebrow fade-up" style={{ color: "var(--cream)" }}>
            {t.about.eyebrow}
          </span>
          <h1 className="display d-xl fade-up">{t.about.headline}</h1>
        </div>
      </section>

      <section className="section">
        <div className="wrap split">
          <Reveal className="stack gap-24">
            <p className="display d-md" style={{ lineHeight: 1.3 }}>
              {t.about.p1}
            </p>
            <p className="lede">{t.about.p2}</p>
            <div className="stats">
              <div className="stat">
                <b>{siteConfig.capacity.reformerBeds}</b>
                <span>{t.about.statBeds}</span>
              </div>
              <div className="stat">
                <b>50</b>
                <span>{t.about.statMin}</span>
              </div>
              <div className="stat">
                <b>1:1</b>
                <span>{t.about.statPrivate}</span>
              </div>
            </div>
          </Reveal>
          <MaskImg src="/assets/studio-entry.webp" ratio="4 / 5" pos="50% 40%" delay={120} />
        </div>
      </section>

      <section className="section tone-dark tone-raise">
        <div className="wrap stack gap-32">
          <Reveal>
            <h2 className="display d-lg">{t.about.philosophyTitle}</h2>
          </Reveal>
          <div className="grid-3">
            {t.about.philosophy.map((p, i) => (
              <Reveal key={p.t} delay={i * 90} className="stack gap-8" style={{ borderTop: "1px solid var(--line-strong)", paddingTop: 18 }}>
                <span className="eyebrow">0{i + 1}</span>
                <h3 className="display d-sm">{p.t}</h3>
                <p className="muted">{p.d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap stack gap-32">
          <div className="split">
            <Reveal>
              {founder.portrait ? (
                <MaskImg src={founder.portrait} alt={founderName} ratio="4 / 5" pos="60% 40%" className="founder-photo" />
              ) : (
                <div className="portrait" style={{ maxWidth: 420 }}>
                  <span className="portrait__mono">{founderName[0]}</span>
                  <span>{t.about.portraitSoon}</span>
                </div>
              )}
            </Reveal>
            <Reveal className="stack gap-16" delay={100}>
              <p className="eyebrow">{t.about.founder}</p>
              <h2 className="display d-lg">{founderName}</h2>
              <p className="lede">{isHe ? founder.bioHe : founder.bioEn}</p>
            </Reveal>
          </div>
          <Reveal className="stack gap-16">
            <p className="eyebrow">{t.about.team}</p>
            <p className="lede">{t.about.teamIntro}</p>
            {instructors.length > 0 && (
              <>
                <div className="grid-3">
                  {instructors.map((ins) => (
                    <PersonCard key={ins.id} p={ins} sample />
                  ))}
                </div>
                <p className="tiny">{t.home.teamNote}</p>
              </>
            )}
          </Reveal>
          {pressMentions.length > 0 && (
            <Reveal className="stack gap-12">
              <p className="eyebrow">{t.about.press}</p>
              <div className="row gap-24" style={{ flexWrap: "wrap" }}>
                {pressMentions.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="display d-sm">
                    {p.name}
                  </a>
                ))}
              </div>
            </Reveal>
          )}
          <div>
            <Link to={href("schedule")} className="btn btn--primary" onClick={() => track("book_reformer_click", { source: "about" })}>
              {t.common.book}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export function Faq() {
  const { t, href } = useI18n();
  useSeo(t.meta.faq, faqLd(t.faq.items));
  return (
    <div className="page tone-dark">
      <PageHead title={t.faq.title} sub={t.faq.sub} />
      <div className="wrap wrap--narrow pbody">
        <div className="screen stack gap-32">
          <Accordion items={t.faq.items} defaultOpen={0} />
          <div className="card row between gap-16 faq-more">
            <span className="display d-sm">{t.faq.more}</span>
            <Link to={href("contact")} className="btn btn--primary btn--sm">
              {t.nav.contact}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
