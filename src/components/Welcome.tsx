import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { siteConfig } from "../config/site";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { LangToggle } from "./Shell";

type Layout = "a" | "b" | "c";
const LAYOUTS: Layout[] = ["a", "b", "c"];

/**
 * First-run opening screen for the installed (PWA) experience. Shown once; always skippable.
 * Three layouts in the November 2026 brand kit; `siteConfig.welcome.layout` picks the live one.
 * Preview any of them in a browser with ?welcome=a, ?welcome=b or ?welcome=c.
 *  a · Editorial: the room fills the screen, RE:SET / PILATES set large in capitals at the foot.
 *  b · Arch: ivory page, the room seen through an arch like the studio's own, the wall-sign lockup below.
 *  c · Sheet: the room fills the top, an ivory card with the logo rises over it.
 */
export function Welcome() {
  const { t, href } = useI18n();
  const store = useStore();
  const nav = useNavigate();
  const params = typeof window !== "undefined" ? new URLSearchParams(location.search) : null;
  const forced = params?.get("welcome") ?? null;
  const standalone =
    typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || params?.has("welcome"));
  const show = standalone && !store.seenWelcome;
  const layout: Layout = LAYOUTS.includes(forced as Layout) ? (forced as Layout) : siteConfig.welcome.layout;
  const photo = siteConfig.welcome.photo[layout];
  const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

  const book = () => {
    track("book_reformer_click", { source: "welcome" });
    store.markWelcomeSeen();
    nav(href("schedule"));
  };

  const name = (
    <h1 className="welcome__name fade-up" style={d(250)} dir="ltr">
      <span>RE:SET</span>
      <span>PILATES</span>
    </h1>
  );
  const actions = (
    <div className="welcome__actions">
      <button className="btn btn--block welcome__book fade-up" style={d(650)} onClick={book}>
        {t.common.book}
      </button>
      <button className="welcome__explore fade-up" style={d(750)} onClick={store.markWelcomeSeen}>
        {t.welcome.explore}
      </button>
    </div>
  );

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className={`welcome welcome--${layout}`}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          role="dialog"
          aria-label="RE:SET PILATES"
        >
          <LangToggle className="welcome__lang" />

          {layout === "a" && (
            <>
              <img className="welcome__photo" src={photo} alt="" />
              <div className="welcome__body">
                <p className="welcome__eyebrow fade-up" style={d(150)}>{t.welcome.eyebrow}</p>
                {name}
                <p className="welcome__tag fade-up" style={d(400)}>{siteConfig.brand.tagline}</p>
                <p className="welcome__support fade-up" style={d(500)}>{t.welcome.supporting}</p>
                {actions}
              </div>
            </>
          )}

          {layout === "b" && (
            <div className="welcome__body">
              <div className="welcome__arch fade-up" style={d(100)}>
                <img src={photo} alt="" />
              </div>
              <p className="welcome__sign fade-up" style={d(300)} dir="ltr">
                <i aria-hidden="true" />
                <span>RE:SET PILATES</span>
                <i aria-hidden="true" />
              </p>
              <p className="welcome__tag fade-up" style={d(400)}>{siteConfig.brand.tagline}</p>
              <p className="welcome__support fade-up" style={d(500)}>{t.welcome.supporting}</p>
              {actions}
            </div>
          )}

          {layout === "c" && (
            <>
              <img className="welcome__photo" src={photo} alt="" />
              <div className="welcome__sheet">
                <p className="welcome__eyebrow fade-up" style={d(150)}>{t.welcome.eyebrow}</p>
                {name}
                <p className="welcome__tag fade-up" style={d(400)}>{siteConfig.brand.tagline}</p>
                <p className="welcome__support fade-up" style={d(500)}>{t.welcome.supporting}</p>
                {actions}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
