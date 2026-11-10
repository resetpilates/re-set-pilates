import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocation } from "react-router-dom";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { siteConfig, waLink } from "../config/site";
import { answer, quickTopics, type ChatReply } from "../content/chat";
import { track } from "../lib/analytics";
import { relay } from "../lib/relay";
import { useI18n } from "../lib/i18n";
import { WaIcon, useWaLink, waReady as hasWa } from "../lib/whatsapp";

interface Msg extends ChatReply {
  id: number;
  from: "me" | "studio";
}

const AVATAR = siteConfig.studioMedia.chatAvatar;
export const OPEN_CHAT = "reset:open-chat";
export const openChat = () => window.dispatchEvent(new CustomEvent(OPEN_CHAT));

/** "Ask the studio" chat: floating avatar bottom-right, scripted answers from the studio's own info. */
export function ChatWidget() {
  const { t, lang, isHe, href } = useI18n();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const waReady = hasWa();
  const waPage = useWaLink();
  // Booking and checkout are focused flows (the booking sheet has its own "Ask the team" button); keep the bubble off their controls.
  const { pathname } = useLocation();
  const section = pathname.split("/")[2] ?? "";
  // On Home the bubble stays out of the way until the hero's Book button has scrolled off screen.
  const [overHero, setOverHero] = useState(false);
  useEffect(() => {
    const cta = document.querySelector(".hero__offer");
    if (!cta) {
      setOverHero(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => setOverHero(e.isIntersecting), { threshold: 0.2 });
    io.observe(cta);
    return () => io.disconnect();
  }, [pathname]);
  const hideFab = section === "class" || section === "checkout" || overHero;

  // Any part of the app can open the chat: window.dispatchEvent(new CustomEvent(OPEN_CHAT))
  useEffect(() => {
    const onOpen = () => {
      track("chat_open", { source: "link" });
      setOpen(true);
    };
    addEventListener(OPEN_CHAT, onOpen);
    return () => removeEventListener(OPEN_CHAT, onOpen);
  }, []);

  // Greeting resets when the language changes
  useEffect(() => {
    setMsgs([{ id: 0, from: "studio", text: t.chat.greeting }]);
  }, [t.chat.greeting]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    addEventListener("keydown", onKey);
    const f = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 220);
    return () => {
      removeEventListener("keydown", onKey);
      clearTimeout(f);
    };
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [msgs, typing, reduce]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    // Analytics gets the topic only, never the question text (questions can be about health).
    setMsgs((m) => [...m, { id: nextId.current++, from: "me", text }]);
    setDraft("");
    setTyping(true);
    const reply = answer(text, lang);
    track("chat_question", { topic: reply.intent ?? "handoff" });
    relay("chat", { lang, question: text, intent: reply.intent, handoff: !!reply.handoff });
    setTimeout(
      () => {
        setTyping(false);
        setMsgs((m) => [...m, { id: nextId.current++, from: "studio", ...reply }]);
      },
      reduce ? 0 : 550,
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(draft);
  };

  const asked = msgs.some((m) => m.from === "me");
  // Handing off to WhatsApp carries the visitor's last question, so they don't have to type it again.
  const lastQ = [...msgs].reverse().find((m) => m.from === "me")?.text ?? "";

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section
            className="chat"
            role="dialog"
            aria-label={t.chat.title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <header className="chat__head">
              <img src={AVATAR} alt="" className="chat__ava" />
              <span className="stack" style={{ flex: 1, minWidth: 0 }}>
                <b>{t.chat.title}</b>
                <span className="chat__status">{t.chat.status}</span>
              </span>
              <button className="chat__x" onClick={() => setOpen(false)} aria-label={t.common.close}>
                <span aria-hidden>×</span>
              </button>
            </header>

            {waReady && (
              <a
                className="chat__wa"
                href={waPage}
                target="_blank"
                rel="noreferrer"
                onClick={() => track("whatsapp_click", { source: "chat_top" })}
              >
                <WaIcon size={20} />
                <span className="stack" style={{ flex: 1, minWidth: 0 }}>
                  <b>{t.chat.whatsapp}</b>
                  <span>{t.wa.sub}</span>
                </span>
                <span className="chev" aria-hidden />
              </a>
            )}

            <div className="chat__list" ref={listRef} aria-live="polite">
              {msgs.map((m) => (
                <div key={m.id} className={`bubble bubble--${m.from}`}>
                  <p>{m.text}</p>
                  {(m.actions?.length || m.handoff) && (
                    <div className="bubble__acts">
                      {m.actions?.map((a) =>
                        a.to ? (
                          <Link key={a.label} to={href(a.to)} className="chip" onClick={() => setOpen(false)}>
                            {a.label}
                          </Link>
                        ) : (
                          <a key={a.label} href={a.href} target="_blank" rel="noreferrer" className="chip">
                            {a.label}
                          </a>
                        ),
                      )}
                      {m.handoff &&
                        (waReady || !m.actions?.some((a) => a.to === "contact")) &&
                        (waReady ? (
                          <a
                            className="chip chip--wa"
                            href={waLink(t.chat.waPrefill + lastQ)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => track("whatsapp_click", { source: "chat" })}
                          >
                            {t.chat.whatsapp}
                          </a>
                        ) : (
                          <Link to={href("contact")} className="chip chip--wa" onClick={() => setOpen(false)}>
                            {t.chat.leaveDetails}
                          </Link>
                        ))}
                    </div>
                  )}
                </div>
              ))}
              {typing && (
                <div className="bubble bubble--studio bubble--typing" aria-label={t.chat.typing}>
                  <i />
                  <i />
                  <i />
                </div>
              )}
              {!asked && (
                <div className="chat__topics">
                  {quickTopics(isHe).map((q) => (
                    <button key={q} className="chip" onClick={() => ask(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <form className="chat__form" onSubmit={submit}>
              <input
                ref={inputRef}
                className="chat__input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t.chat.placeholder}
                aria-label={t.chat.placeholder}
                enterKeyHint="send"
              />
              <button className="chat__send" disabled={!draft.trim()} aria-label={t.chat.send}>
                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
                  <path d="M3 10h12M10 4l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
            <p className="chat__note">{t.chat.note}</p>
          </motion.section>
        )}
      </AnimatePresence>

      <button
        className={`chat-fab ${open ? "is-open" : ""}`}
        hidden={hideFab && !open}
        onClick={() => {
          if (!open) track("chat_open");
          setOpen(!open);
        }}
        aria-label={open ? t.common.close : t.chat.open}
        aria-expanded={open}
      >
        <img src={AVATAR} alt="" />
        <span className="chat-fab__badge" aria-hidden>
          <svg viewBox="0 0 16 16" width="14" height="14">
            <path d="M3 3.5h10a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H7l-3 2.5V11H3a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" fill="currentColor" />
          </svg>
        </span>
      </button>
    </>
  );
}
