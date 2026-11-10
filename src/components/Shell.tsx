import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { PayCards } from "./ui";
import { addressLine, isTodo, siteConfig, telLink } from "../config/site";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { WaIcon, useWaLink, waReady } from "../lib/whatsapp";
import { ChatWidget } from "./ChatWidget";

const ROOTS = ["", "schedule", "services", "my", "profile"];

export function Wordmark() {
  return (
    <span className="wordmark" aria-label="re:set pilates">
      <span aria-hidden>
        re<i>:</i>set
      </span>
      <small className="wordmark__sub" aria-hidden>
        pilates
      </small>
    </span>
  );
}

function useScrolled(threshold = 24) {
  const [scrolled, set] = useState(false);
  useEffect(() => {
    const on = () => set(scrollY > threshold);
    on();
    addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, [threshold]);
  return scrolled;
}

export function LangToggle({ className = "" }: { className?: string }) {
  const { lang, t } = useI18n();
  const loc = useLocation();
  const nav = useNavigate();
  const other = lang === "he" ? "en" : "he";
  return (
    <button
      className={`lang ${className}`}
      aria-label={other === "en" ? "Switch to English" : "מעבר לעברית"}
      onClick={() => {
        track("language_switch", { to: other });
        nav(loc.pathname.replace(/^\/(he|en)/, `/${other}`) + loc.search, { replace: true });
      }}
    >
      {t.common.langSwitch}
    </button>
  );
}

function Header({ section }: { section: string }) {
  const { t, href } = useI18n();
  const scrolled = useScrolled();
  const nav = useNavigate();
  const loc = useLocation();
  const wa = useWaLink();
  const [menu, setMenu] = useState(false);
  const closeMenu = useCallback(() => setMenu(false), []);
  const isRoot = ROOTS.includes(section);
  const overHero = section === "" || section === "about";

  // Close the menu whenever the page changes
  useEffect(() => setMenu(false), [loc.pathname]);

  return (
    <header className={`hdr ${scrolled || !overHero || menu ? "is-solid" : ""} ${isRoot ? "" : "hdr--pushed"}`}>
      <div className="wrap hdr__in">
        <div className="hdr__start">
          {!isRoot && (
            <button
              className="back hdr__back"
              // Deep links (first entry in this tab) go home instead of leaving the site.
              onClick={() => (loc.key === "default" || history.length <= 1 ? nav(href()) : nav(-1))}
            >
              <span className="chev chev--back" aria-hidden />
              {t.common.back}
            </button>
          )}
        </div>
        <Link to={href()} className="hdr__brand">
          <Wordmark />
        </Link>
        <div className="hdr__end">
          <LangToggle />
          {waReady() && (
            <a
              className="hdr__wa"
              href={wa}
              target="_blank"
              rel="noreferrer"
              aria-label={t.wa.aria}
              onClick={() => track("whatsapp_click", { source: "header" })}
            >
              <WaIcon size={20} />
            </a>
          )}
          <Link to={href("schedule")} className="btn btn--sand btn--sm hdr__book" onClick={() => track("book_reformer_click", { source: "header" })}>
            {t.common.bookShort}
          </Link>
          <button
            className={`burger ${menu ? "is-open" : ""}`}
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
            aria-controls="site-menu"
            aria-label={menu ? t.common.close : t.common.menu}
          >
            <i />
            <i />
            <i />
          </button>
        </div>
      </div>
      <SiteMenu open={menu} onClose={closeMenu} />
    </header>
  );
}

/** Full menu behind the 3-line button: every section of the site in one place. */
function SiteMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, href } = useI18n();
  const reduce = useReducedMotion();
  const wa = useWaLink();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("menu-open"); // hides the chat bubble so it can't cover the menu's WhatsApp button
    return () => {
      removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      document.body.classList.remove("menu-open");
    };
  }, [open, onClose]);

  const main: [string, string][] = [
    ["", t.nav.home],
    ["schedule", t.nav.scheduleTab],
    ["services", t.nav.classes],
    ["pricing", t.nav.memberships],
    ["about", t.nav.studio],
  ];
  const more: [string, string][] = [
    ["my", t.nav.myClasses],
    ["progress", t.nav.progress],
    ["profile", t.nav.profile],
    ["quiz", t.nav.quiz],
    ["gift", t.nav.gift],
    ["shop", t.nav.shop],
    ["faq", t.nav.faq],
    ["terms", t.nav.terms],
    ["contact", t.nav.contact],
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="menu-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.nav
            id="site-menu"
            className="menu"
            aria-label={t.common.menu}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <ul className="menu__main">
              {main.map(([to, label], i) => (
                <motion.li
                  key={to}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, delay: 0.03 * i, ease: [0.2, 0.7, 0.2, 1] }}
                >
                  <NavLink to={href(to)} end={to === ""} onClick={onClose}>
                    {label}
                    <span className="chev" aria-hidden />
                  </NavLink>
                </motion.li>
              ))}
            </ul>
            <ul className="menu__more">
              {more.map(([to, label]) => (
                <li key={to}>
                  <NavLink to={href(to)} onClick={onClose}>
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="menu__foot">
              <Link
                to={href("schedule")}
                className="btn btn--dark btn--block btn--arrow"
                onClick={() => {
                  track("book_reformer_click", { source: "menu" });
                  onClose();
                }}
              >
                {t.nav.bookTitle}
              </Link>
              {waReady() && (
                <div className="menu__contact">
                  <a
                    className="btn btn--wa btn--block"
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => track("whatsapp_click", { source: "menu" })}
                  >
                    <WaIcon size={16} />
                    {t.contact.whatsapp}
                  </a>
                  <a className="menu__tel" href={telLink()} onClick={() => track("phone_click", { source: "menu" })}>
                    {t.wa.callStudio} · <span dir="ltr">{siteConfig.contact.phone}</span>
                  </a>
                </div>
              )}
              <a className="menu__mail" href={`mailto:${siteConfig.contact.email}`} dir="ltr">
                {siteConfig.contact.email}
              </a>
            </div>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}

function TabBar({ section }: { section: string }) {
  const { t, href } = useI18n();
  // New receipts show as a count on the Profile tab until they are opened
  const unread = (useStore().notices ?? []).filter((n) => !n.read).length;
  const tabs: [string, string][] = [
    ["", t.nav.home],
    ["schedule", t.nav.schedule],
    ["services", t.nav.services],
    ["my", t.nav.mine],
    ["profile", t.nav.profile],
  ];
  const activeKey = section === "class" ? "schedule" : section === "checkout" || section === "progress" ? "profile" : section;
  return (
    <nav className="tabbar" aria-label={t.common.menu}>
      {tabs.map(([to, label]) => {
        const active = activeKey === to;
        return (
          <Link key={to} to={href(to)} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            {/* Static underline per tab (CSS scales it in): a shared-layout animation left it off-centre in RTL. */}
            <span className="tabbar__dot" aria-hidden />
            {label}
            {to === "profile" && unread > 0 && (
              <span className="tabbar__badge" aria-label={`${unread} ${t.receipt.unread}`}>
                {unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer() {
  const { t, href, isHe } = useI18n();
  return (
    <footer className="footer tone-dark has-tabbar">
      <div className="wrap">
        <div className="footer__grid">
          <div className="stack gap-12">
            <Wordmark />
            <p className="display d-sm hi">
              {t.footer.tagline}
            </p>
            <p className="small muted">{addressLine(isHe)}</p>
          </div>
          <div>
            <h3>{t.footer.explore}</h3>
            <ul>
              <li><Link to={href("schedule")}>{t.nav.schedule}</Link></li>
              <li><Link to={href("services")}>{t.nav.services}</Link></li>
              <li><Link to={href("pricing")}>{t.nav.pricing}</Link></li>
              <li><Link to={href("quiz")}>{t.nav.quiz}</Link></li>
              <li><Link to={href("gift")}>{t.nav.gift}</Link></li>
              <li><Link to={href("shop")}>{t.nav.shop}</Link></li>
            </ul>
          </div>
          <div>
            <h3>{t.footer.studio}</h3>
            <ul>
              <li><Link to={href("about")}>{t.nav.about}</Link></li>
              <li><Link to={href("faq")}>{t.nav.faq}</Link></li>
              <li><Link to={href("terms")}>{t.nav.terms}</Link></li>
              <li><Link to={href("contact")}>{t.nav.contact}</Link></li>
              <li><a href={`mailto:${siteConfig.contact.email}`} dir="ltr">{siteConfig.contact.email}</a></li>
            </ul>
          </div>
          <div>
            <h3>{t.footer.follow}</h3>
            <ul>
              <li><a href={siteConfig.social.instagram} target="_blank" rel="noreferrer">Instagram</a></li>
              <li><a href={siteConfig.social.tiktok} target="_blank" rel="noreferrer">TikTok</a></li>
              <li><a href={siteConfig.social.facebook} target="_blank" rel="noreferrer">Facebook</a></li>
              {!isTodo(siteConfig.social.googleBusiness) && (
                <li><a href={siteConfig.social.googleBusiness} target="_blank" rel="noreferrer">Google</a></li>
              )}
            </ul>
          </div>
        </div>
        <PayCards />
        <div className="footer__base">
          <span>
            © {new Date().getFullYear()} re:set pilates · {t.footer.rights}
          </span>
        </div>
      </div>
    </footer>
  );
}

export function Shell() {
  const { t } = useI18n();
  const loc = useLocation();
  const section = loc.pathname.split("/")[2] ?? "";

  useEffect(() => {
    // A hash (e.g. /en/#first-class from the profile) scrolls to that section once it has rendered; otherwise start at the top.
    if (loc.hash) {
      const id = loc.hash.slice(1);
      const t = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [loc.pathname, loc.hash]);

  return (
    <>
      <a href="#main" className="skip">
        {t.common.skip}
      </a>
      <Header section={section} />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <TabBar section={section} />
      <ChatWidget />
    </>
  );
}
