import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { siteConfig } from "../config/site";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { LangToggle } from "./Shell";

/** First-run onboarding for the installed (PWA) experience. Shown once; always skippable. */
export function Welcome() {
  const { t, href } = useI18n();
  const store = useStore();
  const nav = useNavigate();
  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches || new URLSearchParams(location.search).has("welcome"));
  const show = standalone && !store.seenWelcome;
  const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

  return (
    <AnimatePresence>
      {show && (
        <motion.div className="welcome" exit={{ opacity: 0 }} transition={{ duration: 0.35 }} role="dialog" aria-label="re:set pilates">
          <img src="/assets/studio-entry.webp" alt="" />
          <LangToggle className="welcome__lang" />
          <div className="welcome__body">
            <div className="logo-disc logo-disc--mark fade-up" style={d(150)}>
              <img src={siteConfig.studioMedia.mark} alt="re:set pilates" />
            </div>
            <p className="display fade-up" style={{ ...d(300), fontSize: 44, fontWeight: 600, letterSpacing: ".04em", direction: "ltr" }}>
              re:set pilates
            </p>
            <p className="hero__tag fade-up" style={{ ...d(400), fontSize: 24 }}>
              {siteConfig.brand.tagline}
            </p>
            <p className="small fade-up" style={{ ...d(500), letterSpacing: ".14em", fontWeight: 500 }}>
              {t.welcome.supporting}
            </p>
            <button
              className="btn btn--sand btn--block fade-up"
              style={{ ...d(650), marginTop: 10 }}
              onClick={() => {
                track("book_reformer_click", { source: "welcome" });
                store.markWelcomeSeen();
                nav(href("schedule"));
              }}
            >
              {t.common.book}
            </button>
            <button className="btn btn--ghost fade-up" style={d(750)} onClick={store.markWelcomeSeen}>
              {t.welcome.explore}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
