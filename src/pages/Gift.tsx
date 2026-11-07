import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PageHead, effectivePrice, planName, pricesVisible } from "../components/blocks";
import { Wordmark } from "../components/Shell";
import { Check } from "../components/ui";
import { pricing } from "../config/pricing";
import { siteConfig } from "../config/site";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { relay } from "../lib/relay";
import { buildReceipt, systemNotice } from "../lib/purchase";
import { ReceiptNotify } from "../components/ReceiptNotify";
import { receiptNumber } from "../lib/receipt";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";
import { ConsentField, ContactFields, profileFrom, readContact, readExtras } from "../components/forms";

/** Gift card flow. Until online payment is live it saves the buyer to the launch waitlist instead. */
export default function Gift() {
  const { t, lang, href } = useI18n();
  useSeo(t.meta.gift);
  const passes = pricing.passes.filter((p) => (p.sessions ?? 0) > 1 && pricesVisible(p));
  const live = siteConfig.flags.paymentsLive;
  const [choice, setChoice] = useState<string>(passes[0]?.id ?? "custom");
  const [amount, setAmount] = useState(300);
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [code, setCode] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const { profile, saveProfile, addReceipt, reminders } = useStore();
  const pass = passes.find((p) => p.id === choice);
  const value = pass ? effectivePrice(pass) : amount;
  const label = pass ? planName(pass, t) : t.gift.custom;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const buyer = readContact(f);
    const x = readExtras(f);
    track("gift_card_start", { choice });
    setSending(true);
    setFailed(false);
    if (!live) {
      const w = await relay("launch-waitlist", {
        lang, contact: buyer, classType: "Gift card", source: "Gift card",
        planId: pass?.id, wanted: `${t.nav.gift} · ${label} · ₪${value}${to ? ` · ${to}` : ""}`, consent: x.consent, website: x.website,
      });
      setSending(false);
      if (!w.ok && !w.queued) return setFailed(true);
      saveProfile(profileFrom(buyer, x));
      setCode("");
      setReceiptNo("");
      setDone(true);
      return;
    }
    const no = receiptNumber(); // also the order id: a repeated send is saved once
    const r = await relay("gift", {
      orderId: no,
      itemLabel: `${t.nav.gift} · ${label}`,
      lang,
      buyer,
      planId: pass ? pass.id : null,
      amount: pass ? undefined : amount,
      recipientName: to,
      note: note || undefined,
      consent: x.consent,
      website: x.website,
    });
    if (!r.ok && !r.queued) {
      setSending(false);
      setFailed(true);
      return;
    }
    saveProfile(profileFrom(buyer, x));
    setCode(r.code ?? "");
    addReceipt({
      ...buildReceipt({ no, lang, contact: buyer, line: { label: `${t.nav.gift} · ${label}`, detail: to, amount: value }, giftCode: r.code }),
      link: r.receiptUrl,
      sentVia: r.sentVia,
    });
    if (reminders) systemNotice(t.receipt.notice.replace("{no}", no), t.receipt.noticeSub, href(`receipt/${no}`));
    setReceiptNo(no);
    setSending(false);
    setDone(true);
  };

  return (
    <div className="page tone-dark has-tabbar">
      <PageHead title={t.gift.title} sub={t.gift.sub} />
      <div className="wrap pbody screen">
        <div className="split split--top">
          <div className="stack gap-12 gift-preview">
            <div className="gift-card" aria-label={t.gift.preview}>
              <div className="gift-card__top">
                <Wordmark />
                <span className="gift-card__amount">
                  <small>₪</small>
                  {value || 0}
                </span>
              </div>
              <span className="gift-card__chip" aria-hidden />
              <div className="gift-card__bottom">
                <span className="gift-card__eyebrow">{t.gift.cardLine}</span>
                <span className={`gift-card__name ${to ? "" : "is-empty"}`}>{to || "· · · ·"}</span>
                <span className="gift-card__meta">
                  {label}
                  {from ? ` · ${from}` : ""}
                </span>
                {note && <span className="gift-card__note">“{note}”</span>}
              </div>
            </div>
          </div>

          {done ? (
            <div className="stack gap-16 center" style={{ paddingTop: 16 }}>
              <Check />
              <h2 className="display d-md">{live ? t.gift.doneTitle : t.launchWaitlist.doneTitle}</h2>
              <p className="muted">{live ? t.gift.doneSub : t.launchWaitlist.doneSub}</p>
              {code && (
                <p className="key">
                  {t.gift.codeLabel}: <bdi dir="ltr">{code}</bdi>
                </p>
              )}
              {receiptNo && (
                <Link to={href(`receipt/${receiptNo}`)} className="btn btn--secondary">
                  {t.checkout.viewReceipt}
                </Link>
              )}
              <ReceiptNotify receiptNo={receiptNo} />
              <button className="btn btn--secondary" onClick={() => setDone(false)}>
                {t.gift.another}
              </button>
            </div>
          ) : (
            <form className="stack gap-16" onSubmit={submit}>
              <span className="eyebrow">{t.gift.choose}</span>
              <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                {passes.map((p) => (
                  <button type="button" key={p.id} className="pill" aria-pressed={choice === p.id} onClick={() => setChoice(p.id)}>
                    {planName(p, t)}
                  </button>
                ))}
                <button type="button" className="pill" aria-pressed={choice === "custom"} onClick={() => setChoice("custom")}>
                  {t.gift.custom}
                </button>
              </div>
              {choice === "custom" && (
                <div className="field screen">
                  <label htmlFor="g-amount">{t.gift.amount}</label>
                  <input id="g-amount" className="input" type="number" inputMode="numeric" min={50} step={10} dir="ltr" value={amount} onChange={(e) => setAmount(Number(e.target.value))} required />
                </div>
              )}
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="g-to">{t.gift.to}</label>
                  <input id="g-to" className="input" value={to} onChange={(e) => setTo(e.target.value)} required />
                </div>
                <div className="field">
                  <label htmlFor="g-from">{t.gift.from}</label>
                  <input id="g-from" className="input" value={from} onChange={(e) => setFrom(e.target.value)} autoComplete="name" required />
                </div>
              </div>
              <div className="field">
                <label htmlFor="g-note">{t.gift.note}</label>
                <textarea id="g-note" className="input" maxLength={120} placeholder={t.gift.notePh} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <fieldset className="stack gap-12" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="eyebrow" style={{ marginBottom: 4 }}>
                  {t.gift.buyerTitle}
                </legend>
                {live && <p className="tiny" style={{ margin: 0 }}>{t.gift.buyerNote}</p>}
                <ContactFields id="g" profile={profile} />
                <ConsentField profile={profile} />
              </fieldset>
              {!live && (
                <div className="notice stack gap-4">
                  <b>{t.launchWaitlist.title}</b>
                  <span className="small">{t.launchWaitlist.sub}</span>
                </div>
              )}
              {failed && (
                <p className="small" role="alert" style={{ margin: 0 }}>
                  {t.form.failed}
                </p>
              )}
              <button className="btn btn--sand btn--block" disabled={sending}>
                {sending ? t.form.sending : live ? t.gift.send : t.launchWaitlist.cta}
              </button>
            </form>
          )}
        </div>

        <section className="card gift-shop stack gap-12">
          <div className="stack gap-4">
            <span className="eyebrow">{t.gift.shopEyebrow}</span>
            <h2 className="display d-sm">{t.gift.shopTitle}</h2>
            <p className="small muted">{t.gift.shopBody}</p>
          </div>
          <Link to={href("shop")} className="btn btn--sand btn--sm">
            {t.gift.shopLink}
          </Link>
        </section>
      </div>
    </div>
  );
}
