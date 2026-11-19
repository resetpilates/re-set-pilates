// Studio hub: Orit's command center. One private page (passcode) that shows everything the website sends to
// Airtable: who needs an answer, who is coming today, the week's schedule, every member, where people come from,
// and a small help wiki. Data and edits go through worker/studio.ts; copy lives in src/content/studio.ts.
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { siteConfig } from "../config/site";
import { studioCopy, type StudioCopy, type TabId } from "../content/studio";
import { useI18n } from "../lib/i18n";
import { forgetPass, hasPass, loadMember, loadStudio, sendAction, signIn, waDigits } from "../lib/studio";
import { LEAD_STATUSES, type Attendance, type LeadStatus, type StClass, type StLead, type StMember, type StPayment, type StPlan, type StudioAction, type StudioData, type StudioMember } from "../lib/studioTypes";
import "../styles/studio.css";

const TZ = "Asia/Jerusalem";
const TABS: TabId[] = ["today", "leads", "schedule", "members", "money", "marketing", "help"];
const ICONS: Record<TabId, string> = {
  today: "M4 11.5 12 5l8 6.5V20h-5v-5H9v5H4z",
  leads: "M4 6h16v10H9l-5 4z",
  schedule: "M5 6h14v14H5zM5 10h14M9 3v5M15 3v5",
  members: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
  money: "M4 7h16v11H4zM4 11h16M8 15h3",
  marketing: "M5 20V11M12 20V4M19 20v-6",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8M12 17h.01",
};

const dayKey = (d: Date | string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(typeof d === "string" ? new Date(d) : d);
const addDays = (key: string, n: number) => new Date(Date.parse(`${key}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
const money = (n: number) => `₪${Math.round(n).toLocaleString("en-US")}`;

function useFmt(c: StudioCopy, lang: string, today: string) {
  return useMemo(() => {
    const time = new Intl.DateTimeFormat(lang === "he" ? "he-IL" : "en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
    const date = (key: string) => {
      if (!key) return "";
      const [, m, d] = key.split("-").map(Number);
      return lang === "he" ? `${d}.${m}` : `${d} ${c.common.months[m - 1]}`;
    };
    const dow = (key: string) => c.common.dows[new Date(`${key}T12:00:00Z`).getUTCDay()];
    return {
      time: (iso: string) => (iso ? time.format(new Date(iso)) : ""),
      date,
      /** "Today", "Tomorrow" or "Sunday, 22 Nov". */
      dayName: (key: string) => (key === today ? c.common.today : key === addDays(today, 1) ? c.common.tomorrow : `${dow(key)}, ${date(key)}`),
      /** When something arrived: "09:14" today, otherwise the date. */
      when: (iso: string) => (!iso ? "" : dayKey(iso) === today ? time.format(new Date(iso)) : date(dayKey(iso))),
    };
  }, [c, lang, today]);
}
type Fmt = ReturnType<typeof useFmt>;

// ---------- small pieces ----------

function Icon({ d, className = "st-ico" }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** WhatsApp, call and (when there is one) email, as three big buttons. */
function Reach({ c, phone, email }: { c: StudioCopy; phone: string; email?: string }) {
  if (!phone && !email) return null;
  return (
    <div className="st-reach">
      {phone && (
        <a className="st-btn st-btn--wa" href={`https://wa.me/${waDigits(phone)}`} target="_blank" rel="noreferrer">
          {c.common.whatsapp}
        </a>
      )}
      {phone && (
        <a className="st-btn" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
          {c.common.call}
        </a>
      )}
      {email && (
        <a className="st-btn" href={`mailto:${email}`}>
          {c.common.email}
        </a>
      )}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="st-empty">{children}</p>;
}

function Chips<T extends string>({ value, options, onPick }: { value: T; options: [T, string, number?][]; onPick: (v: T) => void }) {
  return (
    <div className="st-chips" role="tablist">
      {options.map(([id, label, n]) => (
        <button key={id} type="button" role="tab" aria-selected={value === id} className={`st-chip${value === id ? " is-on" : ""}`} onClick={() => onPick(id)}>
          {label}
          {n ? <b>{n}</b> : null}
        </button>
      ))}
    </div>
  );
}

// ---------- sign-in ----------

function Gate({ c, onOpen }: { c: StudioCopy; onOpen: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    const fail = await signIn(code.trim());
    setBusy(false);
    if (!fail) return onOpen();
    setError(fail === "code" ? c.gate.wrong : fail === "slow down" ? c.gate.slow : fail === "setup" ? c.gate.setup : c.gate.offline);
  }
  return (
    <main className="st-gate">
      <form className="st-gate__card" onSubmit={submit}>
        <img className="st-gate__logo" src={siteConfig.studioMedia.wordmark} alt="re:set pilates" />
        <p className="st-eyebrow">{c.sub}</p>
        <h1 className="st-h1">{c.gate.hello}</h1>
        <p className="st-muted">{c.gate.lede}</p>
        <label className="st-field">
          <span>{c.gate.label}</span>
          <input type="password" autoComplete="current-password" autoFocus value={code} onChange={(e) => (setCode(e.target.value), setError(""))} />
        </label>
        {error && (
          <p className="st-error" role="alert">
            {error}
          </p>
        )}
        <button className="st-btn st-btn--ink st-btn--block" disabled={busy || !code.trim()}>
          {c.gate.go}
        </button>
      </form>
    </main>
  );
}

// ---------- classes ----------

function ClassCard({ c, f, cls, open, onToggle, onMark, who }: { c: StudioCopy; f: Fmt; cls: StClass; open: boolean; onToggle: () => void; onMark?: (id: string, from: string, to: Attendance) => void; who: (id: string) => string }) {
  const n = cls.bookings.length;
  return (
    <article className={`st-card st-class${open ? " is-open" : ""}`}>
      <button type="button" className="st-class__head" onClick={onToggle} aria-expanded={open}>
        <span className="st-class__time">{f.time(cls.when)}</span>
        <span className="st-class__what">
          <b>{c.cls.types[cls.type] ?? cls.type}</b>
          <small>
            {n ? c.cls.booked(n, cls.capacity) : c.cls.empty}
            {cls.waitlist ? ` · ${c.cls.waiting(cls.waitlist)}` : ""}
          </small>
        </span>
        {cls.capacity ? (
          <span className="st-dots" aria-hidden>
            {Array.from({ length: cls.capacity }, (_, i) => (
              <i key={i} className={i < n ? "is-on" : ""} />
            ))}
          </span>
        ) : null}
      </button>
      {open && n > 0 && (
        <ul className="st-people">
          {cls.bookings.map((b) => (
            <li key={b.id}>
              <span className="st-people__name">
                {b.memberId ? (
                  <Link className="st-name" to={who(b.memberId)}>
                    {b.name || "—"}
                  </Link>
                ) : (
                  <b>{b.name || "—"}</b>
                )}
                <small>
                  {b.bed ? `${c.cls.bed} ${b.bed}` : ""}
                  {b.status === "Held" ? `${b.bed ? " · " : ""}${c.cls.held}` : ""}
                </small>
              </span>
              {onMark && (
                <span className="st-mark">
                  {(["Attended", "No-show"] as const).map((s) => (
                    <button key={s} type="button" className={`st-mark__btn st-mark__btn--${s === "Attended" ? "yes" : "no"}${b.status === s ? " is-on" : ""}`} aria-pressed={b.status === s} onClick={() => onMark(b.id, b.status, b.status === s ? "Booked" : s)}>
                      {s === "Attended" ? c.cls.came : c.cls.noShow}
                    </button>
                  ))}
                </span>
              )}
              {!onMark && b.phone && (
                <a className="st-link" href={`https://wa.me/${waDigits(b.phone)}`} target="_blank" rel="noreferrer">
                  {c.common.whatsapp}
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ---------- screens ----------

interface ScreenProps {
  c: StudioCopy;
  f: Fmt;
  d: StudioData;
  go: (t: TabId) => void;
  /** Shows the change at once (`set(false)`), sends it, and on failure puts back just that row (`set(true)`). */
  act: (a: StudioAction, set: (undo: boolean, serverStatus?: string) => (d: StudioData) => StudioData) => void;
  air: (table: keyof StudioData["tables"], id: string) => string;
  /** Link to one customer's page. */
  who: (id: string) => string;
}

function Today({ c, f, d, go, act, air, who }: ScreenProps) {
  const [open, setOpen] = useState<string | null>(null);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date()));
  const todays = d.classes.filter((x) => dayKey(x.when) === d.today);
  const newLeads = d.leads.filter((l) => l.status === "New").length;
  const waiting = d.waitlist.filter((w) => !w.contacted).length;
  const active = d.plans.filter((p) => p.status === "Active");
  const ending = active.filter((p) => p.renews && daysBetween(d.today, p.renews) >= 0 && daysBetween(d.today, p.renews) <= 7);
  const needs: [number, string, (() => void) | string][] = [
    [newLeads, c.today.newLeads, () => go("leads")],
    [d.pending.length, c.today.payments, () => go("money")],
    [waiting, c.today.waitlist, () => go("leads")],
    [ending.length, c.today.renewals, "#st-renewals"],
    [d.chat.length, c.today.chat, "#st-chat"],
  ];
  const live = needs.filter(([n]) => n > 0);
  const since = (days: number) => addDays(d.today, -days);
  const stats: [string, string][] = [
    [String(d.leads.filter((l) => l.received && dayKey(l.received) >= since(7)).length), c.today.leads7],
    [String(d.classes.reduce((n, x) => n + x.bookings.length, 0)), c.today.booked7],
    [String(active.length), c.today.active],
    [money(d.paid.filter((p) => (p.paidOn || p.created) && dayKey(p.paidOn || p.created) >= since(30)).reduce((n, p) => n + p.amount, 0)), c.today.money30],
  ];
  // "Booked" here means "undo my tap": the server decides whether the place goes back to Booked or to Held (not paid yet).
  const mark = (id: string, from: string, to: Attendance) => {
    const put = (status: string) => (x: StudioData) => ({ ...x, classes: x.classes.map((k) => ({ ...k, bookings: k.bookings.map((b) => (b.id === id ? { ...b, status } : b)) })) });
    act({ kind: "booking", id, status: to }, (undo, server) => put(undo ? from : (server ?? to)));
  };
  return (
    <>
      <header className="st-hello">
        <p className="st-eyebrow">{`${c.common.dows[new Date(`${d.today}T12:00:00Z`).getUTCDay()]}, ${f.date(d.today)}`}</p>
        <h1 className="st-h1">{hour < 12 ? c.today.morning : hour < 17 ? c.today.afternoon : c.today.evening}</h1>
      </header>

      <section className="st-sec">
        <h2 className="st-h2">{c.today.needs}</h2>
        {live.length === 0 ? (
          <p className="st-card st-clear">{c.today.clear}</p>
        ) : (
          <div className="st-needs">
            {live.map(([n, label, to]) =>
              typeof to === "string" ? (
                <a key={label} className="st-need" href={to}>
                  <b>{n}</b>
                  <span>{label}</span>
                </a>
              ) : (
                <button key={label} type="button" className="st-need" onClick={to}>
                  <b>{n}</b>
                  <span>{label}</span>
                </button>
              ),
            )}
          </div>
        )}
      </section>

      <section className="st-sec">
        <h2 className="st-h2">{c.today.classes}</h2>
        {todays.length === 0 ? <Empty>{c.today.noClasses}</Empty> : todays.map((x) => <ClassCard key={x.id} c={c} f={f} cls={x} open={open === x.id} onToggle={() => setOpen(open === x.id ? null : x.id)} onMark={mark} who={who} />)}
      </section>

      <section className="st-sec">
        <h2 className="st-h2">{c.today.week}</h2>
        <div className="st-stats">
          {stats.map(([n, label]) => (
            <div key={label} className="st-card st-stat">
              <b>{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {ending.length > 0 && (
        <section className="st-sec" id="st-renewals">
          <h2 className="st-h2">{c.today.renewalsTitle}</h2>
          <ul className="st-card st-rows">
            {ending.map((p) => (
              <li key={p.id}>
                <Link to={p.memberId ? who(p.memberId) : "#"}>
                  <span>
                    <b dir="auto">{p.name}</b>
                    <small>{[p.autoRenew ? c.today.autoRenew : "", p.sessionsLeft != null ? c.today.left(p.sessionsLeft) : ""].filter(Boolean).join(" · ")}</small>
                  </span>
                  <strong>{f.date(p.renews)}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.chat.length > 0 && (
        <section className="st-sec" id="st-chat">
          <h2 className="st-h2">{c.today.chatTitle}</h2>
          <ul className="st-card st-rows">
            {d.chat.slice(0, 8).map((q) => (
              <li key={q.id}>
                <a href={air("chat", q.id)} target="_blank" rel="noreferrer">
                  <span>
                    <b className="st-wrap">{q.question}</b>
                  </span>
                  <small>{f.when(q.asked)}</small>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const LEAD_GROUP: Record<string, "open" | "progress" | "done"> = { New: "open", Contacted: "progress", "Booked first class": "progress", "No answer": "progress", Converted: "done", "Not interested": "done" };

function LeadCard({ c, f, lead, onStatus, link }: { c: StudioCopy; f: Fmt; lead: StLead; onStatus: (s: LeadStatus) => void; link: string }) {
  const facts: [string, string][] = [
    [c.leads.wants, lead.interested.join(", ")],
    [c.leads.time, lead.prefTime],
    [c.leads.heard, lead.heard],
  ];
  return (
    <article className="st-card st-lead">
      <header>
        <h3>{lead.name || lead.phone || "—"}</h3>
        <small>{f.when(lead.received)}</small>
      </header>
      {lead.message && <p className="st-lead__msg">{lead.message}</p>}
      <dl className="st-facts">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <Reach c={c} phone={lead.phone} email={lead.email} />
      <div className="st-next">
        <span>{c.leads.next}</span>
        <div className="st-next__opts">
          {LEAD_STATUSES.filter((s) => s !== "New").map((s) => (
            <button key={s} type="button" className={`st-pill${lead.status === s ? " is-on" : ""}`} aria-pressed={lead.status === s} onClick={() => onStatus(lead.status === s ? "New" : s)}>
              {c.leads.status[s]}
            </button>
          ))}
        </div>
      </div>
      <a className="st-link" href={link} target="_blank" rel="noreferrer">
        {c.common.airtable}
      </a>
    </article>
  );
}

function Leads({ c, f, d, act, air }: ScreenProps) {
  const [tab, setTab] = useState<"open" | "progress" | "done" | "waitlist">("open");
  const count = (g: string) => d.leads.filter((l) => (LEAD_GROUP[l.status] ?? "open") === g).length;
  const shown = d.leads.filter((l) => (LEAD_GROUP[l.status] ?? "open") === tab);
  const waiting = d.waitlist.filter((w) => !w.contacted).length;
  return (
    <>
      <h1 className="st-h1">{c.tabs.leads}</h1>
      <Chips value={tab} onPick={setTab} options={[["open", c.leads.filters.open, count("open")], ["progress", c.leads.filters.progress, count("progress")], ["done", c.leads.filters.done], ["waitlist", c.leads.filters.waitlist, waiting]]} />
      {tab !== "waitlist" ? (
        shown.length === 0 ? (
          <Empty>{c.leads.empty}</Empty>
        ) : (
          shown.map((l) => <LeadCard key={l.id} c={c} f={f} lead={l} link={air("leads", l.id)} onStatus={(status) => act({ kind: "lead", id: l.id, status }, (undo) => (x) => ({ ...x, leads: x.leads.map((k) => (k.id === l.id ? { ...k, status: undo ? l.status : status } : k)) }))} />)
        )
      ) : (
        <>
          <p className="st-muted st-sec__note">{c.leads.waitlistHelp}</p>
          {d.waitlist.length === 0 ? (
            <Empty>{c.leads.empty}</Empty>
          ) : (
            d.waitlist.map((w) => (
              <article key={w.id} className={`st-card st-lead${w.contacted ? " is-done" : ""}`}>
                <header>
                  <h3>{w.name || w.phone || "—"}</h3>
                  <small>{f.when(w.submitted)}</small>
                </header>
                {(w.wanted || w.slot) && (
                  <dl className="st-facts">
                    <div>
                      <dt>{c.leads.wanted}</dt>
                      <dd>{[w.wanted, w.slot].filter(Boolean).join(" · ")}</dd>
                    </div>
                  </dl>
                )}
                <Reach c={c} phone={w.phone} />
                <label className="st-tick">
                  <input type="checkbox" checked={w.contacted} onChange={(e) => {
                    const contacted = e.target.checked;
                    act({ kind: "wait", id: w.id, contacted }, (undo) => (x) => ({ ...x, waitlist: x.waitlist.map((k) => (k.id === w.id ? { ...k, contacted: undo ? !contacted : contacted } : k)) }));
                  }} />
                  <span>{c.leads.contacted}</span>
                </label>
              </article>
            ))
          )}
        </>
      )}
    </>
  );
}

function Schedule({ c, f, d, who }: ScreenProps) {
  const [open, setOpen] = useState<string | null>(null);
  const days = useMemo(() => {
    const by = new Map<string, StClass[]>();
    for (const x of d.classes) by.set(dayKey(x.when), [...(by.get(dayKey(x.when)) ?? []), x]);
    return [...by];
  }, [d.classes]);
  return (
    <>
      <h1 className="st-h1">{c.schedule.title}</h1>
      {days.length === 0 ? (
        <Empty>{c.schedule.empty}</Empty>
      ) : (
        days.map(([key, list]) => (
          <section key={key} className="st-sec">
            <h2 className="st-h2">{f.dayName(key)}</h2>
            {list.map((x) => (
              <ClassCard key={x.id} c={c} f={f} cls={x} open={open === x.id} onToggle={() => setOpen(open === x.id ? null : x.id)} who={who} />
            ))}
          </section>
        ))
      )}
      <p className="st-muted st-foot">{c.schedule.note}</p>
    </>
  );
}

const QUIET = new Set(["Lapsed", "Lost", "Paused"]);

function Members({ c, f, d, who }: ScreenProps) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "leads" | "quiet">("all");
  const [limit, setLimit] = useState(100);
  const is = (m: StMember, g: typeof filter) => g === "all" || (g === "active" ? m.plan === "Active" : g === "quiet" ? QUIET.has(m.status) : m.plan !== "Active" && !QUIET.has(m.status));
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, "");
  const shown = d.members.filter((m) => is(m, filter) && (!needle || m.name.toLowerCase().includes(needle) || (digits.length >= 3 && m.phone.replace(/\D/g, "").includes(digits))));
  const n = (g: typeof filter) => d.members.filter((m) => is(m, g)).length;
  return (
    <>
      <h1 className="st-h1">{c.tabs.members}</h1>
      <input className="st-search" type="search" inputMode="search" placeholder={c.members.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={c.members.search} />
      <Chips value={filter} onPick={setFilter} options={[["all", c.members.filters.all, n("all")], ["active", c.members.filters.active, n("active")], ["leads", c.members.filters.leads, n("leads")], ["quiet", c.members.filters.quiet, n("quiet")]]} />
      {shown.length === 0 ? (
        <Empty>{c.members.empty}</Empty>
      ) : (
        <ul className="st-card st-members">
          {shown.slice(0, limit).map((m) => (
            <li key={m.id}>
              <Link className="st-member" to={who(m.id)}>
                <MemberLine c={c} f={f} m={m} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <button type="button" className="st-btn st-btn--block" onClick={() => setLimit(limit + 100)}>
          {c.members.more(shown.length - limit)}
        </button>
      )}
      {d.membersCapped && <p className="st-muted st-foot">{c.members.capped}</p>}
    </>
  );
}

function MemberLine({ c, f, m }: { c: StudioCopy; f: Fmt; m: StMember }) {
  return (
    <>
      <span className="st-avatar" aria-hidden>
        {(m.name.trim()[0] ?? "·").toUpperCase()}
      </span>
      <span className="st-member__main">
        <b>{m.name || m.phone || "—"}</b>
        <small>{m.plan === "Active" ? [m.classesLeft != null && m.classesLeft > 0 ? c.members.classesLeft(m.classesLeft) : "", m.renews ? `${c.members.renews} ${f.date(m.renews)}` : ""].filter(Boolean).join(" · ") : m.lastClass ? `${c.members.last} ${f.date(m.lastClass)}` : c.members.never}</small>
      </span>
      {m.status && <span className={`st-tag${m.plan === "Active" ? " st-tag--on" : ""}`}>{c.members.status[m.status] ?? m.status}</span>}
    </>
  );
}

// ---------- money: payments, receipts, memberships ----------

function PaymentRow({ c, f, p, who, link }: { c: StudioCopy; f: Fmt; p: StPayment; who?: (id: string) => string; link: string }) {
  const title = p.name.replace(p.no, "").split(" · ").filter((x) => x && x !== p.member).join(" · ") || p.what;
  return (
    <li className="st-pay">
      <div className="st-pay__top">
        <span>
          {who && p.memberId ? (
            <Link className="st-name" to={who(p.memberId)}>
              {p.member || "—"}
            </Link>
          ) : (
            <b dir="auto">{who ? p.member || p.name : title}</b>
          )}
          <small dir="auto">{[who ? title : "", p.method, f.date(dayKey(p.paidOn || p.created || new Date()))].filter(Boolean).join(" · ")}</small>
        </span>
        <strong>{money(p.amount)}</strong>
      </div>
      <div className="st-pay__foot">
        <span className={`st-tag${p.status === "Paid" ? " st-tag--on" : ""}`}>{c.money.pay[p.status] ?? p.status}</span>
        {p.no && <small className="st-pay__no">{p.no}</small>}
        {p.receipt ? (
          <a className="st-link" href={p.receipt} target="_blank" rel="noreferrer">
            {c.money.receipt}
          </a>
        ) : (
          <small className="st-muted">{c.money.noReceipt}</small>
        )}
        <a className="st-link" href={link} target="_blank" rel="noreferrer">
          {c.common.airtable}
        </a>
      </div>
    </li>
  );
}

const planGroup = (p: StPlan) => (p.status === "Active" || p.status === "Paused" ? "active" : p.status === "" ? "waiting" : "ended");

function PlanRow({ c, f, p, name, link }: { c: StudioCopy; f: Fmt; p: StPlan; name: ReactNode; link: string }) {
  return (
    <li className="st-pay">
      <div className="st-pay__top">
        <span>
          {name}
          <small>{[p.start ? `${c.money.from}${c.money.from.endsWith("-") ? "" : " "}${f.date(p.start)}` : "", p.renews ? `${c.money.until} ${f.date(p.renews)}` : "", p.sessionsLeft != null ? c.today.left(p.sessionsLeft) : "", p.autoRenew ? c.today.autoRenew : ""].filter(Boolean).join(" · ")}</small>
        </span>
        {p.price != null && <strong>{money(p.price)}</strong>}
      </div>
      <div className="st-pay__foot">
        <span className={`st-tag${p.status === "Active" ? " st-tag--on" : ""}`}>{c.money.plan[p.status] ?? p.status}</span>
        <a className="st-link" href={link} target="_blank" rel="noreferrer">
          {c.common.airtable}
        </a>
      </div>
    </li>
  );
}

function Money({ c, f, d, air, who }: ScreenProps) {
  const [tab, setTab] = useState<"pending" | "paid" | "plans">(d.pending.length ? "pending" : "paid");
  const [group, setGroup] = useState<"active" | "waiting" | "ended">("active");
  const rows = tab === "pending" ? d.pending : d.paid;
  const plans = d.plans.filter((p) => planGroup(p) === group);
  const count = (g: string) => d.plans.filter((p) => planGroup(p) === g).length;
  return (
    <>
      <h1 className="st-h1">{c.tabs.money}</h1>
      <Chips value={tab} onPick={setTab} options={[["pending", c.money.filters.pending, d.pending.length], ["paid", c.money.filters.paid], ["plans", c.money.filters.plans, count("active")]]} />
      {tab !== "plans" ? (
        <>
          <p className="st-muted st-sec__note">{tab === "pending" ? c.money.pendingHelp : c.money.paidHelp}</p>
          {rows.length === 0 ? (
            <Empty>{c.money.empty}</Empty>
          ) : (
            <>
              <div className="st-card st-total">
                <span>{c.money.total}</span>
                <b>{money(rows.reduce((n, p) => n + p.amount, 0))}</b>
              </div>
              <ul className="st-card st-pays">
                {rows.map((p) => (
                  <PaymentRow key={p.id} c={c} f={f} p={p} who={who} link={air("payments", p.id)} />
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <>
          <Chips value={group} onPick={setGroup} options={[["active", c.money.planFilters.active, count("active")], ["waiting", c.money.planFilters.waiting, count("waiting")], ["ended", c.money.planFilters.ended]]} />
          {plans.length === 0 ? (
            <Empty>{c.money.empty}</Empty>
          ) : (
            <ul className="st-card st-pays">
              {plans.map((p) => (
                <PlanRow key={p.id} c={c} f={f} p={p} link={air("memberships", p.id)} name={p.memberId ? <Link className="st-name" to={who(p.memberId)} dir="auto">{p.name}</Link> : <b dir="auto">{p.name}</b>} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}

// ---------- one customer ----------

function Profile({ c, f, id, air, back, stamp }: { c: StudioCopy; f: Fmt; id: string; air: ScreenProps["air"]; back: string; stamp: string }) {
  const [p, setP] = useState<StudioMember | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void loadMember(id).then((r) => live && (r.ok ? (setP(r), setFailed(false)) : (setFailed(true), setP((old) => (old?.member.id === id ? old : null)))));
    return () => void (live = false);
  }, [id, stamp]); // read again whenever the hub refreshes
  const backLink = (
    <Link className="st-back" to={back}>
      <Icon d="M15 6l-6 6 6 6" className="st-ico st-ico--sm st-ico--flip" />
      {c.profile.back}
    </Link>
  );
  if (!p) return <>{backLink}<Empty>{failed ? c.profile.failed : c.common.loading}</Empty></>;
  const m = p.member;
  const k = c.profile.facts;
  const facts: [string, string][] = [
    [k.phone, m.phone],
    [k.email, m.email],
    [k.source, m.source],
    [k.added, m.added ? f.date(dayKey(m.added)) : ""],
    [k.since, f.date(p.memberSince)],
    [k.language, p.language],
    [k.health, p.health ? c.profile.yes : c.profile.no],
  ];
  const stats: [string, string][] = [
    [money(p.spent), k.spent],
    [String(m.attended), k.classes],
    [String(p.noShows), k.missed],
    [String(p.lateCancels), k.late],
  ];
  return (
    <>
      {backLink}
      <header className="st-who">
        <span className="st-avatar st-avatar--lg" aria-hidden>
          {(m.name.trim()[0] ?? "·").toUpperCase()}
        </span>
        <div>
          <h1 className="st-h1" dir="auto">{m.name || m.phone || "—"}</h1>
          {m.status && <span className={`st-tag${m.plan === "Active" ? " st-tag--on" : ""}`}>{c.members.status[m.status] ?? m.status}</span>}
        </div>
      </header>
      <Reach c={c} phone={m.phone} email={m.email} />
      <div className="st-stats">
        {stats.map(([n, label]) => (
          <div key={label} className="st-card st-stat">
            <b>{n}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <dl className="st-card st-facts st-facts--card">
        {facts
          .filter(([, v]) => v)
          .map(([key, v]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd dir="auto">{v}</dd>
            </div>
          ))}
      </dl>
      {p.notes && (
        <section className="st-sec">
          <h2 className="st-h2">{c.profile.notes}</h2>
          <p className="st-card st-note st-pre" dir="auto">{p.notes}</p>
        </section>
      )}

      <section className="st-sec">
        <h2 className="st-h2">{c.profile.plans}</h2>
        {p.plans.length === 0 ? (
          <Empty>{c.profile.nothing}</Empty>
        ) : (
          <ul className="st-card st-pays">
            {p.plans.map((x) => (
              <PlanRow key={x.id} c={c} f={f} p={x} link={air("memberships", x.id)} name={<b dir="auto">{x.name.split(" · ").filter((t) => t !== m.name).join(" · ") || x.name}</b>} />
            ))}
          </ul>
        )}
      </section>

      <section className="st-sec">
        <h2 className="st-h2">{c.profile.payments}</h2>
        {p.payments.length === 0 ? (
          <Empty>{c.profile.nothing}</Empty>
        ) : (
          <ul className="st-card st-pays">
            {p.payments.map((x) => (
              <PaymentRow key={x.id} c={c} f={f} p={x} link={air("payments", x.id)} />
            ))}
          </ul>
        )}
      </section>

      <section className="st-sec">
        <h2 className="st-h2">{c.profile.history}</h2>
        {p.history.length === 0 ? (
          <Empty>{c.profile.nothing}</Empty>
        ) : (
          <ol className="st-card st-line">
            {p.history.map((e, i) => (
              <li key={i} className={`st-line__item st-line__item--${e.kind}`}>
                <time>{f.date(dayKey(e.when.length === 10 ? `${e.when}T12:00:00Z` : e.when))}</time>
                <div>
                  <b>
                    {c.profile.kinds[e.kind]}
                    {e.status && <span className="st-line__status">{(e.kind === "class" ? c.profile.booking[e.status] : e.kind === "payment" ? c.money.pay[e.status] : e.kind === "plan" ? c.money.plan[e.status] : c.leads.status[e.status]) ?? e.status}</span>}
                  </b>
                  {e.title && <p dir="auto">{e.title}</p>}
                  {e.kind === "plan" && !e.status && <span className="st-line__status">{c.money.plan[""]}</span>}
                </div>
                {e.amount != null && <strong>{money(e.amount)}</strong>}
              </li>
            ))}
          </ol>
        )}
        {p.capped && <p className="st-muted st-foot">{c.profile.capped}</p>}
      </section>
      <a className="st-link" href={air("members", m.id)} target="_blank" rel="noreferrer">
        {c.common.airtable}
      </a>
    </>
  );
}

function Marketing({ c, f, d, air }: ScreenProps) {
  const sources = useMemo(() => {
    const from = addDays(d.today, -30);
    const by = new Map<string, number>();
    for (const m of d.members) if (m.added && dayKey(m.added) >= from) by.set(m.source || c.marketing.unknown, (by.get(m.source || c.marketing.unknown) ?? 0) + 1);
    return [...by].sort((a, b) => b[1] - a[1]);
  }, [d.members, d.today, c]);
  const top = sources[0]?.[1] ?? 1;
  const s = siteConfig.social;
  return (
    <>
      <h1 className="st-h1">{c.tabs.marketing}</h1>

      <section className="st-sec">
        <h2 className="st-h2">{c.marketing.sources}</h2>
        <p className="st-muted st-sec__note">{c.marketing.sourcesSub}</p>
        {sources.length === 0 ? (
          <Empty>{c.marketing.noSources}</Empty>
        ) : (
          <ul className="st-card st-bars">
            {sources.map(([name, n]) => (
              <li key={name}>
                <span>{name}</span>
                <i style={{ inlineSize: `${Math.max(6, (n / top) * 100)}%` }} />
                <b>{n}</b>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="st-sec">
        <h2 className="st-h2">{c.marketing.meta}</h2>
        <p className="st-muted st-sec__note">{c.marketing.metaSub}</p>
        {!d.meta ? (
          <p className="st-card st-note">{c.marketing.metaOff}</p>
        ) : !d.meta.ok ? (
          <p className="st-card st-note">{c.marketing.metaDown}</p>
        ) : (
          <div className="st-stats">
            {(
              [
                [`${d.meta.currency === "ILS" || !d.meta.currency ? "₪" : `${d.meta.currency} `}${Math.round(d.meta.spend).toLocaleString("en-US")}`, c.marketing.spend],
                [d.meta.impressions.toLocaleString("en-US"), c.marketing.seen],
                [d.meta.clicks.toLocaleString("en-US"), c.marketing.clicks],
                [String(d.meta.leads), c.marketing.adLeads],
              ] as [string, string][]
            ).map(([n, label]) => (
              <div key={label} className="st-card st-stat">
                <b>{n}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="st-sec">
        <h2 className="st-h2">{c.marketing.campaigns}</h2>
        {d.campaigns.length === 0 ? (
          <p className="st-card st-note">{c.marketing.noCampaigns}</p>
        ) : (
          d.campaigns.map((k) => (
            <a key={k.id} className="st-card st-camp" href={air("campaigns", k.id)} target="_blank" rel="noreferrer">
              <header>
                <h3>{k.name}</h3>
                <small>{[k.channels.join(", "), [f.date(k.start), f.date(k.end)].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}</small>
              </header>
              {k.offer && <p className="st-muted">{k.offer}</p>}
              <dl className="st-trio">
                <div>
                  <dt>{c.marketing.budget}</dt>
                  <dd>{k.budget != null ? money(k.budget) : "—"}</dd>
                </div>
                <div>
                  <dt>{c.marketing.leads}</dt>
                  <dd>{k.leads}</dd>
                </div>
                <div>
                  <dt>{c.marketing.perLead}</dt>
                  <dd>{k.budget != null && k.leads > 0 ? money(k.budget / k.leads) : "—"}</dd>
                </div>
              </dl>
            </a>
          ))
        )}
      </section>

      <section className="st-sec">
        <h2 className="st-h2">{c.marketing.links}</h2>
        <div className="st-reach st-reach--wrap">
          {(
            [
              [c.marketing.instagram, s.instagram],
              [c.marketing.facebook, s.facebook],
              [c.marketing.google, s.googleBusiness],
              [c.marketing.reviews, s.googleReview],
            ] as [string, string][]
          ).map(([label, url]) => (
            <a key={label} className="st-btn" href={url} target="_blank" rel="noreferrer">
              {label}
            </a>
          ))}
        </div>
      </section>
    </>
  );
}

function Help({ c }: { c: StudioCopy }) {
  const { href } = useI18n();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = c.help.wiki.filter((w) => words.every((x) => `${w.q} ${w.a.join(" ")}`.toLowerCase().includes(x)));
  return (
    <>
      <h1 className="st-h1">{c.help.title}</h1>
      <p className="st-muted">{c.help.lede}</p>
      <input className="st-search" type="search" placeholder={c.help.search} value={q} onChange={(e) => setQ(e.target.value)} aria-label={c.help.search} />
      {shown.length === 0 ? (
        <Empty>{c.help.empty}</Empty>
      ) : (
        <div className="st-card st-wiki">
          {shown.map((w) => {
            const on = open === w.id || (words.length > 0 && shown.length === 1);
            return (
              <section key={w.id} className={on ? "is-open" : ""}>
                <button type="button" onClick={() => setOpen(on ? null : w.id)} aria-expanded={on}>
                  <span>{w.q}</span>
                  <Icon d="M6 9l6 6 6-6" className="st-ico st-ico--sm" />
                </button>
                {on && (
                  <div className="st-wiki__body">
                    {w.a.map((p) => (p.startsWith("• ") ? <p key={p} className="st-step">{p.slice(2)}</p> : <p key={p}>{p}</p>))}
                    {w.link && (
                      <Link className="st-link" to={href(w.link.to)}>
                        {w.link.label}
                      </Link>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------- the hub ----------

export default function Studio() {
  const { lang } = useI18n();
  const c = studioCopy[lang];
  const nav = useNavigate();
  const params = useParams();
  const tab: TabId = TABS.includes(params.tab as TabId) ? (params.tab as TabId) : "today";
  const personId = tab === "members" && /^rec[A-Za-z0-9]{14}$/.test(params.id ?? "") ? params.id! : "";
  const [signedIn, setSignedIn] = useState(hasPass);
  const [data, setData] = useState<StudioData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [toast, setToast] = useState("");
  const [, tick] = useState(0);
  const f = useFmt(c, lang, data?.today ?? dayKey(new Date()));
  const go = useCallback((t: TabId) => (nav(`/${lang}/studio${t === "today" ? "" : `/${t}`}`), window.scrollTo(0, 0)), [nav, lang]);

  const refresh = useCallback(async () => {
    setState((s) => (s === "ready" ? s : "loading"));
    const r = await loadStudio();
    if (r.ok) return setData(r), setState("ready");
    if (r.error === "auth") return forgetPass(), setSignedIn(false);
    setState((s) => (s === "ready" ? s : "failed"));
  }, []);

  useEffect(() => {
    document.title = `${c.title} · ${siteConfig.brand.name}`;
  }, [c]);
  useEffect(() => {
    if (!signedIn) return;
    void refresh();
    const again = () => document.visibilityState === "visible" && void refresh();
    const timer = setInterval(again, 120_000); // a fresh look every two minutes while the page is open
    const clock = setInterval(() => tick((n) => n + 1), 30_000);
    document.addEventListener("visibilitychange", again);
    return () => (clearInterval(timer), clearInterval(clock), document.removeEventListener("visibilitychange", again));
  }, [signedIn, refresh]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Show the change at once; if Airtable did not take it, put back that one row and nothing else.
  const act = useCallback<ScreenProps["act"]>(
    (a, set) => {
      setData((d) => (d ? set(false)(d) : d));
      void sendAction(a).then((r) => {
        if (!r.ok) setData((d) => (d ? set(true)(d) : d));
        else if (r.status) setData((d) => (d ? set(false, r.status)(d) : d));
        setToast(r.ok ? c.common.saved : c.common.notSaved);
      });
    },
    [c],
  );
  const who = useCallback((id: string) => `/${lang}/studio/members/${id}`, [lang]);
  const air = useCallback((table: keyof StudioData["tables"], id: string) => (data ? `https://airtable.com/${data.base}/${data.tables[table]}/${id}` : "#"), [data]);

  if (!signedIn) return <div className="st"><Gate c={c} onOpen={() => setSignedIn(true)} /></div>;

  const mins = data ? Math.floor((Date.now() - Date.parse(data.at)) / 60000) : 0;
  const badge: Partial<Record<TabId, number>> = data ? { leads: data.leads.filter((l) => l.status === "New").length + data.waitlist.filter((w) => !w.contacted).length } : {};
  const here = `/studio${tab === "today" ? "" : `/${tab}`}${personId ? `/${personId}` : ""}`;
  const props = data && { c, f, d: data, go, act, air, who };
  return (
    <div className="st">
      <nav className="st-nav" aria-label={c.sub}>
        <Link to={`/${lang}/studio`} className="st-nav__brand" onClick={() => window.scrollTo(0, 0)}>
          <img src={siteConfig.studioMedia.wordmark} alt="re:set pilates" />
          <span>{c.sub}</span>
        </Link>
        <div className="st-nav__tabs">
          {TABS.map((t) => (
            <button key={t} type="button" className={`st-tab${tab === t ? " is-on" : ""}`} aria-current={tab === t ? "page" : undefined} onClick={() => go(t)}>
              <Icon d={ICONS[t]} />
              <span>{c.tabs[t]}</span>
              {badge[t] ? <b>{badge[t]}</b> : null}
            </button>
          ))}
        </div>
        <div className="st-nav__foot">
          <Link className="st-link" to={`/${lang === "he" ? "en" : "he"}${here}`}>
            {lang === "he" ? "English" : "עברית"}
          </Link>
          <button type="button" className="st-link" onClick={() => (forgetPass(), setSignedIn(false), setData(null))}>
            {c.common.signOut}
          </button>
        </div>
      </nav>

      <div className="st-body">
        <header className="st-top">
          <Link to={`/${lang}/studio`} className="st-top__logo">
            <img src={siteConfig.studioMedia.wordmark} alt="re:set pilates" />
          </Link>
          <span className="st-top__time">{data ? `${c.common.updated} ${mins < 1 ? c.common.justNow : c.common.minAgo(mins)}` : ""}</span>
          <button type="button" className="st-btn st-btn--sm" onClick={() => void refresh()}>
            {c.common.refresh}
          </button>
          <Link className="st-top__lang" to={`/${lang === "he" ? "en" : "he"}${here}`}>
            {lang === "he" ? "EN" : "עב"}
          </Link>
        </header>
        <main className="st-main">
          {tab === "help" ? (
            <Help c={c} />
          ) : !props ? (
            <Empty>{state === "failed" ? c.common.failed : c.common.loading}</Empty>
          ) : personId ? (
            <Profile key={personId} c={c} f={f} id={personId} air={air} back={`/${lang}/studio/members`} stamp={props.d.at} />
          ) : tab === "money" ? (
            <Money {...props} />
          ) : tab === "leads" ? (
            <Leads {...props} />
          ) : tab === "schedule" ? (
            <Schedule {...props} />
          ) : tab === "members" ? (
            <Members {...props} />
          ) : tab === "marketing" ? (
            <Marketing {...props} />
          ) : (
            <Today {...props} />
          )}
        </main>
      </div>
      {toast && (
        <p className="st-toast" role="status">
          {toast}
        </p>
      )}
    </div>
  );
}
