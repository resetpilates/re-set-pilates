import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { isTodo } from "../config/site";

import { useI18n } from "../lib/i18n";

/** Accepted payment methods: the owner's card-logo strip (cropped to the cards the studio takes) with bit beside it. Footer, pricing and live checkout. */
export function PayCards({ className = "" }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={`paycards ${className}`} role="group" aria-label={t.footer.payments}>
      <span className="paycards__label">{t.footer.payments}</span>
      <span className="paycards__row">
        <img src="/assets/pay-cards.png" alt="Mastercard, Visa, American Express, Discover" width={257} height={50} loading="lazy" decoding="async" />
        <span className="paycards__bit" aria-label="bit">bit</span>
      </span>
    </div>
  );
}

/** Adds `.is-in` once the element scrolls into view (runs once). */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setIn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setIn(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    // Safety net: never leave content hidden if the observer doesn't report (background tab, old browser)
    const r = el.getBoundingClientRect();
    const fallback = setTimeout(() => setIn(true), r.top < innerHeight ? 300 : 2500);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, []);
  return { ref, inView };
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  className = "",
  children,
  style,
}: {
  as?: ElementType;
  delay?: number;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? "is-in" : ""} ${className}`}
      style={{ ...style, "--d": `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** Image with a slow top-down mask reveal. */
export function MaskImg({
  src,
  alt = "",
  pos = "50% 50%",
  ratio,
  delay = 0,
  className = "",
  zoom = false,
  children,
}: {
  src: string;
  alt?: string;
  pos?: string;
  ratio?: string;
  delay?: number;
  className?: string;
  zoom?: boolean;
  children?: ReactNode;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  // The observed wrapper is never clipped; the clip-path lives on the inner layer.
  return (
    <div
      ref={ref}
      className={`media media--bare ${zoom ? "media--zoom" : ""} ${className}`}
      style={{ aspectRatio: ratio, "--d": `${delay}ms` } as CSSProperties}
    >
      <div className={`mask ${inView ? "is-in" : ""}`}>
        <img src={src} alt={alt} loading="lazy" style={{ objectPosition: pos }} />
      </div>
      {children}
    </div>
  );
}

/** Subtle scroll parallax on a child layer. Disabled for reduced motion and touch. */
export function useParallax<T extends HTMLElement>(strength = 0.12) {
  const ref = useRef<T>(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.parentElement!.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = (r.top + r.height / 2 - innerHeight / 2) / innerHeight;
      el.style.transform = `translate3d(0, ${(-p * strength * 100).toFixed(2)}px, 0)`;
    };
    const onScroll = () => (raf ||= requestAnimationFrame(update));
    update();
    addEventListener("scroll", onScroll, { passive: true });
    return () => {
      removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduce, strength]);
  return ref;
}

export function Accordion({ items, defaultOpen = -1 }: { items: { q: string; a: string }[]; defaultOpen?: number }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="acc">
      {items.map((it, i) => (
        <div key={it.q} className={`acc__item ${open === i ? "is-open" : ""}`}>
          <h3>
            <button
              className="acc__btn"
              aria-expanded={open === i}
              aria-controls={`${id}-${i}`}
              onClick={() => setOpen(open === i ? -1 : i)}
            >
              {it.q}
              <span className="acc__sign" aria-hidden />
            </button>
          </h3>
          <div className="acc__panel" id={`${id}-${i}`} role="region" {...(open !== i ? ({ inert: "" } as object) : {})}>
            <div>
              <p>{it.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  const layoutId = useId();
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} onClick={() => onChange(o.id)}>
          {value === o.id && (
            <motion.span
              layoutId={layoutId}
              className="seg__thumb"
              transition={{ type: "spring", duration: 0.35, bounce: 0.12 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Bottom sheet: springs up, drag down to dismiss, Esc to close. */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  const desktop = typeof window !== "undefined" && window.matchMedia("(min-width: 1000px)").matches;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Keyboard and screen-reader users land inside the sheet, the page behind it is inert, and focus returns to the opener on close
    const opener = document.activeElement as HTMLElement | null;
    const page = document.getElementById("root");
    page?.setAttribute("inert", "");
    const raf = requestAnimationFrame(() => panel.current?.focus());
    return () => {
      cancelAnimationFrame(raf);
      page?.removeAttribute("inert");
      opener?.focus?.();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("sheet-open"); // hides the chat bubble so it never sits on top of the sheet
    return () => {
      removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      document.body.classList.remove("sheet-open");
    };
  }, [open, onClose]);

  const hidden = reduce ? { opacity: 0 } : desktop ? { opacity: 0, y: "-46%", scale: 0.97 } : { y: "100%" };
  const shown = desktop ? { opacity: 1, y: "-50%", scale: 1 } : { opacity: 1, y: 0 };

  // Rendered at the end of <body>: inside the animated page it would sit under the tab bar and the chat bubble
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="sheet-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.div
            // tone-dark carries the page palette (legacy name, light colours): the sheet lives outside the page now
            className="sheet tone-dark"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            ref={panel}
            tabIndex={-1}
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={{ type: "spring", duration: 0.45, bounce: 0 }}
            drag={desktop || reduce ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="sheet__grab" aria-hidden />
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

/** Shows a value, or a "to be confirmed" marker when business data is still TODO_VERIFY. */
export function Verified({ value }: { value?: string }) {
  const { t } = useI18n();
  return isTodo(value) ? <span className="badge badge--outline">{t.common.pending}</span> : <>{value}</>;
}

export function Price({ amount, was }: { amount: number; was?: number | null }) {
  return (
    <span className="stack" style={{ alignItems: "flex-end", gap: 2 }}>
      {was ? <span className="was">₪{was}</span> : null}
      <span className="price">
        <small>₪</small>
        {amount}
      </span>
    </span>
  );
}

export function Check() {
  return (
    <div className="ring" aria-hidden>
      <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
        <path d="M7 15.5l5.5 5.5L23 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
