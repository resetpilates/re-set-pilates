import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { PageHead, PricingList, effectivePrice, planName, pricesVisible } from "../components/blocks";
import { Check, PayCards, Price } from "../components/ui";
import { isClassKind, planById } from "../config/pricing";
import { RENEW_DAYS, checkPurchase, planEnd } from "../lib/plan";
import { buildReceipt, systemNotice } from "../lib/purchase";
import { ReceiptNotify } from "../components/ReceiptNotify";
import { receiptNumber } from "../lib/receipt";
import { isTodo, siteConfig } from "../config/site";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";
import { relay } from "../lib/relay";
import type { Contact, SlotRef } from "../lib/relayTypes";
import { useStore } from "../lib/store";
import { ConsentField, ContactFields, HeardField, profileFrom, readContact, readExtras, termsAccepted, TermsField, HealthNextStep } from "../components/forms";
import { bookingProvider, fromISO, rememberBed, rememberedBed } from "../lib/booking";

export function Pricing() {
  const { t, href } = useI18n();
  const [params] = useSearchParams();
  const kindParam = params.get("kind");
  useSeo(t.meta.pricing);
  return (
    <div className="page tone-dark">
      <PageHead title={t.pricing.title} sub={t.pricing.sub} />
      <div className="wrap wrap--narrow pbody">
        <div className="screen stack gap-32">
          <PricingList next={params.get("next") ?? undefined} initialKind={isClassKind(kindParam) ? kindParam : undefined} />
          <div className="row gap-12" style={{ flexWrap: "wrap" }}>
            <Link to={href("schedule")} className="btn btn--primary" onClick={() => track("book_reformer_click", { source: "pricing" })}>
              {t.common.book}
            </Link>
            <Link to={href("gift")} className="btn btn--secondary">
              {t.nav.gift}
            </Link>
          </div>
          <PayCards />
        </div>
      </div>
    </div>
  );
}

/** Checkout: no card data is collected here; payment happens at the provider's link.
 * Until payments are live it shows the launch waitlist instead. */
export function Checkout() {
  const { planId = "" } = useParams();
  const [params] = useSearchParams();
  const { t, href, lang, fmtDate } = useI18n();
  const store = useStore();
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirmedRepeat, setConfirmedRepeat] = useState(false);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null); // the relay found the same membership still running
  const [receiptNo, setReceiptNo] = useState("");
  const [waitlisted, setWaitlisted] = useState(false); // payments not live: the order went to the launch waitlist
  const [hold, setHold] = useState<"held" | "full" | null>(null); // checkout for a class: its bed was held, or it had just filled
  const [sentVia, setSentVia] = useState<string[]>([]);
  const plan = planById(planId);
  const next = params.get("next");
  // Reformer or Mat (Mat is ₪5 a class less). Teens plans carry no kind; a general plan defaults to Reformer.
  const kindParam = params.get("kind");
  const kind = plan?.track ? null : isClassKind(kindParam) ? kindParam : "reformer";

  if (!plan || !pricesVisible(plan))
    return (
      <div className="page page--app tone-dark has-tabbar">
        <div className="wrap wrap--app stack gap-16 center">
          <p className="muted">{t.checkout.notFound}</p>
          <Link to={href("pricing")} className="btn btn--primary">
            {t.nav.pricing}
          </Link>
        </div>
      </div>
    );

  // While online payment is not live the whole checkout still runs; pressing Pay saves the order to the launch
  // waitlist (with the details already typed) instead of opening a payment page.
  const live = siteConfig.flags.paymentsLive;
  const [svc, date, hhmm] = (next ?? "").split("_");
  const slotLabel =
    (svc === "reformer" || svc === "mat") && /^\d{4}-\d{2}-\d{2}$/.test(date ?? "") && /^\d{4}$/.test(hhmm ?? "")
      ? `${t.services.items[svc].short} · ${fmtDate(fromISO(date))} · ${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
      : undefined;

  // One active plan at a time: the same running membership can't be bought twice, and unused classes move to the new plan.
  const current = store.planId ? planById(store.planId) : undefined;
  const check = checkPurchase(plan, current ? { plan: current, bookings: store.bookings, planStart: store.planStart, carry: store.carry ?? 0 } : null, new Date(), confirmedRepeat);
  const carry = "carry" in check ? check.carry : 0;
  const activeUntil = blockedUntil ?? (!check.ok && check.reason === "active" ? check.until : null);
  const launch = siteConfig.flags.launchPricing;
  const passClasses = plan.billingType === "pass" ? (plan.sessions ?? 0) + (launch ? (plan.bonusSessions ?? 0) : 0) + carry : 0;
  const fmt = (d: Date) => `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
  const payLabel = { bit: t.checkout.payBit, card: t.checkout.payCard };
  const monthly = plan.billingType === "monthly";
  const hours = String(siteConfig.policies.cancelHours);
  const keyTerms = monthly
    ? t.checkout.keyMonthly.replace("{hours}", hours)
    : plan.sessions === 1
      ? t.checkout.keySingle.replace("{hours}", hours)
      : t.checkout.keyPass.replace("{months}", String(plan.validityMonths)).replace("{hours}", hours);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const id = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value;
    const method = siteConfig.payments.find((m) => m.id === id);
    if (!method || !check.ok) return;
    if (!live) return saveToWaitlist(e.currentTarget as HTMLFormElement, method.id);
    // Real payment happens at the provider's link.
    // The tab is opened now (before anything is awaited, so the browser allows it) and only
    // pointed at the payment page once the order is saved; it is closed if saving fails.
    const url = method.url;
    const payTab = isTodo(url) ? null : window.open("", "_blank");
    if (payTab) payTab.opener = null;
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const contact = readContact(f);
    const x = readExtras(f);
    // The studio terms box is required unless this device already accepted the current terms; the Worker refuses an order without it
    if (!x.terms && !termsAccepted(store.profile)) {
      payTab?.close();
      return;
    }
    setSending(true);
    setFailed(false);
    // Saved in Airtable as a Pending payment until Orit confirms it. A queued order (offline) counts as saved.
    // The receipt number doubles as the order id, so a repeated send of this order is saved once.
    const no = receiptNumber();
    const itemLabel = planName(plan, t, kind);
    const r = await relay("checkout", {
      lang, contact, planId: plan.id, kind: kind ?? undefined, method: method.id, heard: x.heard, consent: x.consent, termsAccepted: true, autoRenew: monthly && x.autoRenew, website: x.website,
      orderId: no, itemLabel, carryOver: carry,
    });
    if (!r.ok && !r.queued) {
      payTab?.close();
      setSending(false);
      if (r.error === "already active") setBlockedUntil(r.until ? new Date(`${r.until}T12:00:00`) : current ? planEnd(current, store.planStart) : new Date());
      else setFailed(true);
      return;
    }
    if (payTab) payTab.location.href = url;
    store.saveProfile(profileFrom(contact, x));
    const receipt = buildReceipt({
      no,
      lang,
      contact,
      line: { label: itemLabel, ...(carry ? { detail: t.checkout.carried.replace("{n}", String(carry)) } : {}), amount: effectivePrice(plan, kind) },
      method: method.id,
      classesTotal: passClasses,
      validUntil: planEnd(plan, new Date().toISOString()),
    });
    store.addReceipt({ ...receipt, link: r.receiptUrl, sentVia: r.sentVia });
    store.setPlan(plan.id, kind, carry);
    store.setRenewal(monthly && x.autoRenew, r.id);
    if (store.reminders) systemNotice(t.receipt.notice.replace("{no}", no), t.receipt.noticeSub, href(`receipt/${no}`));
    setReceiptNo(no);
    setSentVia(r.sentVia ?? []);
    setSending(false);
    setDone(true);
  };

  const saveToWaitlist = async (form: HTMLFormElement, method: "bit" | "card") => {
    const f = new FormData(form);
    const contact = readContact(f);
    const x = readExtras(f);
    setSending(true);
    setFailed(false);
    const teens = plan.track === "teens";
    const r = await relay("launch-waitlist", {
      lang,
      contact,
      classType: teens ? "Teens" : kind === "mat" ? "Mat" : "Reformer",
      prefTime: teens ? "Teen evening" : "Adult morning",
      source: next ? "Booking" : "Pricing",
      planId: plan.id,
      wanted: [`${planName(plan, t, slotLabel ? null : kind)} · ₪${effectivePrice(plan, kind)} · ${payLabel[method]}`, monthly && x.autoRenew ? t.checkout.autoRenewTag : ""].filter(Boolean).join(" · "),
      slot: slotLabel,
      consent: x.consent,
      website: x.website,
    });
    setSending(false);
    if (!r.ok && !r.queued) {
      setFailed(true);
      return;
    }
    store.saveProfile(profileFrom(contact, x));
    track("launch_waitlist_join", { source: next ? "Booking" : "Pricing", plan: plan.id, method });
    if (next) await holdBed(next, contact);
    setWaitlisted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /**
   * Checkout for a specific class before payments open: hold the bed (Airtable status "Held") so the person's
   * name shows on the schedule. If the class filled up meanwhile, they go on that class's waitlist instead.
   */
  const holdBed = async (slotId: string, contact: Contact) => {
    const s = await bookingProvider.getSlot(slotId);
    if (!s) return;
    const bed = s.service === "reformer" ? rememberedBed(s.id) : null;
    const slot: SlotRef = { slotId: s.id, service: s.service, date: s.date, time: s.time, minutes: s.minutes, capacity: s.capacity };
    const local = store.book(s, bed, store.reminders);
    const r = await relay("booking", { lang, contact, slot, bed, showAs: store.profile.showAs ?? "short", held: true }, local ? { ref: local.id } : undefined);
    if (r.error === "full") {
      if (local) store.cancel(local.id);
      store.joinWaitlist(s.id);
      relay("waitlist", { lang, contact, slot });
      setHold("full");
      return;
    }
    if (local && r.id) store.setRemoteId(local.id, r.id);
    rememberBed(s.id, null);
    setHold("held");
  };

  if (waitlisted)
    return (
      <div className="page tone-dark has-tabbar">
        <div className="wrap wrap--app pbody screen">
          <div className="stack gap-16 center" style={{ paddingTop: 40 }}>
            <Check />
            <h1 className="display d-md">{t.launchWaitlist.doneTitle}</h1>
            <p className="muted">{t.launchWaitlist.atPay}</p>
            {hold === "held" && <p className="small hi">{t.launchWaitlist.bedHeld}</p>}
            {hold === "full" && <p className="small hi">{t.launchWaitlist.classFull}</p>}
            <HealthNextStep profile={store.profile} next={next ? `class/${next}` : undefined} />
            <p className="small">
              <b>{t.launchWaitlist.youChose}:</b> {[`${planName(plan, t, slotLabel ? null : kind)} · ₪${effectivePrice(plan, kind)}`, slotLabel].filter(Boolean).join(" · ")}
            </p>
            <Link to={href("schedule")} className="btn btn--sand btn--block">
              {t.checkout.doneCta}
            </Link>
          </div>
        </div>
      </div>
    );

  return (
    <div className="page tone-dark has-tabbar">
      {!done && <PageHead title={t.checkout.title} app />}
      <div className="wrap wrap--app pbody screen">
        {done ? (
          <div className="stack gap-16 center" style={{ paddingTop: 40 }}>
            <Check />
            <h1 className="display d-md">{t.checkout.doneTitle}</h1>
            <p className="muted">{t.checkout.doneSub}</p>
            <p className="small">
              {sentVia.length
                ? t.checkout.receiptSent.replace("{channels}", sentVia.map((c) => t.checkout.channels[c as keyof typeof t.checkout.channels]).join(" · "))
                : t.checkout.receiptInApp}
            </p>
            <Link to={next ? href(`class/${next}`) : href("schedule")} className="btn btn--sand btn--block">
              {t.checkout.doneCta}
            </Link>
            <Link to={href(`receipt/${receiptNo}`)} className="btn btn--secondary btn--block">
              {t.checkout.viewReceipt}
            </Link>
            <HealthNextStep profile={store.profile} next={next ? `class/${next}` : undefined} />
            <ReceiptNotify receiptNo={receiptNo} />
          </div>
        ) : (
          <form className="stack gap-24" onSubmit={submit}>
            <div className="member-card row between gap-16">
              <span className="stack gap-4">
                <span className="eyebrow">{t.checkout.summary}</span>
                <span className="display d-sm">{planName(plan, t, kind)}</span>
                <span className="tiny">
                  {plan.track === "teens"
                    ? t.pricing.teensNote
                    : plan.billingType === "monthly"
                    ? t.pricing.validMonth
                    : launch && plan.bonusSessions
                      ? `${t.pricing.bonus} · ${t.checkout.totalClasses.replace("{n}", String(passClasses - carry))}`
                      : t.pricing.validPass}
                </span>
                {carry > 0 && (
                  <span className="tiny hi">
                    {t.checkout.carried.replace("{n}", String(carry))}
                    {passClasses ? ` · ${t.checkout.totalClasses.replace("{n}", String(passClasses))}` : ` · ${t.checkout.carriedMonthly}`}
                  </span>
                )}
              </span>
              <Price amount={effectivePrice(plan, kind)} was={launch && plan.launchPrice ? plan.price : null} />
            </div>
            {activeUntil && (
              <div className="notice stack gap-8" role="alert">
                <b>{t.checkout.alreadyActive}</b>
                <span className="small">{t.checkout.alreadyActiveSub.replace("{date}", fmt(activeUntil)).replace("{days}", String(RENEW_DAYS))}</span>
                <Link to={href("pricing")} className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start" }}>
                  {t.nav.pricing}
                </Link>
              </div>
            )}
            {!activeUntil && (
            <>
            <fieldset className="stack gap-12" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="eyebrow" style={{ marginBottom: 12 }}>
                {t.checkout.details}
              </legend>
              <ContactFields id="co" profile={store.profile} />
              <HeardField id="co" profile={store.profile} />
            </fieldset>
            <div className="kv" style={{ borderBottom: 0, fontSize: 16 }}>
              <span>{t.checkout.total}</span>
              <span style={{ direction: "ltr" }}>₪{effectivePrice(plan, kind)}</span>
            </div>
            <div className="stack gap-12">
              <p className="tiny key-terms">{keyTerms}</p>
              {monthly && (
                <label className="tick">
                  <input type="checkbox" name="autoRenew" />
                  <span className="stack gap-4">
                    <span>{t.checkout.autoRenew}</span>
                    <span className="tiny muted">{t.checkout.autoRenewSub}</span>
                  </span>
                </label>
              )}
              <TermsField profile={store.profile} />
              <ConsentField profile={store.profile} />
            </div>
            {!check.ok && check.reason === "repeat" ? (
              <div className="notice stack gap-8" role="alert">
                <span className="small">{t.checkout.repeat}</span>
                <button type="button" className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmedRepeat(true)}>
                  {t.checkout.repeatYes}
                </button>
              </div>
            ) : (
            <div className="stack gap-12">
              <span className="eyebrow">{t.checkout.choosePay}</span>
              {siteConfig.payments.map((m, i) => (
                <button key={m.id} name="method" value={m.id} disabled={sending} className={`btn btn--block ${i === 0 ? "btn--sand" : "btn--secondary"}`}>
                  {payLabel[m.id]}
                </button>
              ))}
              {failed && (
                <p className="small center" role="alert">
                  {t.form.failed}
                </p>
              )}
              {live && <PayCards className="paycards--center" />}
            </div>
            )}
            {!plan.approved && (
              <p className="tiny center">
                {t.pricing.pendingApproval}
              </p>
            )}
            </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
