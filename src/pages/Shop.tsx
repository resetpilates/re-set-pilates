import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { ConsentField, ContactFields, profileFrom, readContact, readExtras } from "../components/forms";
import { Accordion, Check, Reveal, Sheet } from "../components/ui";
import { bundleSinglesTotal, shopCategories, shopItem, shopItems, shopMedia, teenBundle, type ShopCategory, type ShopItem, type ShopItemId } from "../config/shop";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { relay } from "../lib/relay";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";

type Pick = { id: ShopItemId; name: string; price: number; sizes?: string[] };

/**
 * Studio shop, "coming soon": the catalog (teen set first), each piece with a planned price and a
 * "tell me when it's here" button that saves the person to the launch waitlist (source "Shop").
 */
export default function Shop() {
  const { t, href } = useI18n();
  const c = t.shop;
  useSeo(t.meta.shop);
  const [cat, setCat] = useState<ShopCategory | "all">("all");
  const [pick, setPick] = useState<Pick | null>(null);
  useEffect(() => track("shop_view"), []);

  const items = shopItems.filter((i) => i.active && (cat === "all" || i.category === cat));
  const saves = bundleSinglesTotal() - teenBundle.price;
  const bundleName = c.items["teen-set"].name;
  const open = (p: Pick) => setPick(p);

  return (
    <div className="page tone-dark has-tabbar shop">
      <header className="phead shop-head">
        <div className="wrap shop-head__in screen">
          <span className="shop-head__eyebrow">{c.comingSoon}</span>
          <h1 className="shop-head__title">{c.title}</h1>
        </div>
      </header>

      {/* Hero: the real RE:SET flat-lay (ball, ring, wrist weights, band) */}
      <section className="wrap shop-hero">
        <Reveal className="shop-hero__media shop-hero__media--tall">
          <img src={shopMedia.hero.src} alt="" style={{ objectPosition: shopMedia.hero.pos }} loading="eager" decoding="async" />
          <span className="shop-tag">{c.comingSoon}</span>
        </Reveal>
        <Reveal className="shop-hero__body" delay={80}>
          <span className="eyebrow">{c.heroEyebrow}</span>
          <h2 className="display d-lg">{c.heroTitle}</h2>
          <p className="lede">{c.heroBody}</p>
          <button className="btn btn--blue" onClick={() => open({ id: teenBundle.id, name: bundleName, price: teenBundle.price })}>
            {c.notify}
          </button>
        </Reveal>
      </section>

      {/* The teen set */}
      <section className="section--tight">
        <div className="wrap shop-set">
          <Reveal className="shop-set__media">
            <img src={teenBundle.image} alt="" style={{ objectPosition: teenBundle.pos }} loading="lazy" decoding="async" />
            <span className="shop-tag">{c.comingSoon}</span>
          </Reveal>
          <Reveal className="shop-set__body" delay={80}>
            <span className="eyebrow">{c.setEyebrow}</span>
            <h2 className="display d-md">{c.setTitle}</h2>
            <p className="muted">{c.setBody}</p>
            <div className="shop-set__list">
              <span className="eyebrow">{c.setIncludes}</span>
              <ul>
                {teenBundle.items.map((id) => {
                  const it = shopItem(id);
                  return (
                    <li key={id}>
                      <span>{c.items[id].name}</span>
                      {it && <span className="tiny nums">₪{it.price}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div className="shop-set__price">
              <div className="stack gap-4">
                <span className="tiny">{c.setPrice}</span>
                <span className="price">
                  <small>₪</small>
                  {teenBundle.price}
                </span>
              </div>
              {saves > 0 && <span className="badge badge--blush">{c.setSaves.replace("{amount}", String(saves))}</span>}
            </div>
            <button className="btn btn--blue btn--block" onClick={() => open({ id: teenBundle.id, name: bundleName, price: teenBundle.price })}>
              {c.notify}
            </button>
          </Reveal>
        </div>
      </section>

      {/* Catalog */}
      <section className="section--tight">
        <div className="wrap stack gap-24">
          <div className="row between gap-12 shop-cat">
            <h2 className="display d-md">{c.catalogTitle}</h2>
            <div className="row gap-8" style={{ flexWrap: "wrap" }}>
              <button type="button" className="pill" aria-pressed={cat === "all"} onClick={() => setCat("all")}>
                {c.all}
              </button>
              {shopCategories.map((k) => (
                <button type="button" key={k} className="pill" aria-pressed={cat === k} onClick={() => setCat(k)}>
                  {c.cats[k]}
                </button>
              ))}
            </div>
          </div>
          <div className="shop-grid list-in">
            {items.map((it, i) => (
              <ProductCard key={it.id} it={it} index={i} onNotify={() => open({ id: it.id, name: c.items[it.id].name, price: it.price, sizes: it.sizes })} />
            ))}
          </div>
          <p className="tiny">{c.priceNote}</p>
        </div>
      </section>

      {/* A quiet moment before class */}
      <section className="section--tight">
        <div className="wrap shop-moment">
          <Reveal className="shop-moment__media">
            <img src={shopMedia.moment.src} alt="" style={{ objectPosition: shopMedia.moment.pos }} loading="lazy" decoding="async" />
          </Reveal>
          <Reveal className="shop-moment__body" delay={80}>
            <span className="eyebrow">{c.momentEyebrow}</span>
            <h2 className="display d-md">{c.momentTitle}</h2>
            <p className="muted">{c.momentBody}</p>
          </Reveal>
        </div>
      </section>

      {/* Good to know */}
      <section className="section--tight">
        <div className="wrap wrap--narrow stack gap-16">
          <h2 className="display d-md">{c.faqTitle}</h2>
          <Accordion items={c.faq} />
          <p className="tiny center" style={{ marginTop: 8 }}>
            <a href={href("faq")}>{t.nav.faq}</a>
          </p>
        </div>
      </section>

      <Sheet open={!!pick} onClose={() => setPick(null)} label={c.sheet.title}>
        {pick && <NotifyForm pick={pick} />}
      </Sheet>
    </div>
  );
}

function ProductCard({ it, index, onNotify }: { it: ShopItem; index: number; onNotify: () => void }) {
  const { t } = useI18n();
  const c = t.shop;
  const copy = c.items[it.id];
  return (
    <article className="shop-card" style={{ "--i": index } as CSSProperties}>
      <button type="button" className="shop-card__media" onClick={onNotify} aria-label={`${copy.name} · ${c.notifyShort}`}>
        <img src={it.image} alt="" style={{ objectPosition: it.pos }} loading="lazy" decoding="async" />
        <span className="shop-tag">{c.comingSoon}</span>
      </button>
      <div className="shop-card__body">
        <div className="row between gap-8" style={{ alignItems: "flex-start" }}>
          <h3 className="shop-card__name">{copy.name}</h3>
          <span className="shop-card__price nums">₪{it.price}</span>
        </div>
        <p className="small muted">{copy.blurb}</p>
        <span className="tiny">{it.sizes?.length ? `${c.sizes}: ${it.sizes.join(" · ")}` : c.oneSize}</span>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onNotify}>
          {c.notifyShort}
        </button>
      </div>
    </article>
  );
}

/** Saves the person to the launch waitlist with what they want; one message when it lands, nothing charged. */
function NotifyForm({ pick }: { pick: Pick }) {
  const { t, lang } = useI18n();
  const c = t.shop.sheet;
  const store = useStore();
  const [size, setSize] = useState<string | null>(null);
  const [who, setWho] = useState<"teen" | "me">("teen");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<"sent" | "queued" | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const contact = readContact(f);
    const x = readExtras(f);
    setSending(true);
    setFailed(false);
    const r = await relay("launch-waitlist", {
      lang,
      contact,
      classType: who === "teen" ? "Teens" : "Not sure",
      source: "Shop",
      planId: pick.id,
      wanted: [pick.name, size, `₪${pick.price}`].filter(Boolean).join(" · "),
      consent: x.consent,
      website: x.website,
    });
    setSending(false);
    if (!r.ok && !r.queued) return setFailed(true);
    store.saveProfile(profileFrom(contact, x));
    track("shop_notify", { item: pick.id, who });
    track("launch_waitlist_join", { source: "Shop", item: pick.id });
    setDone(r.ok ? "sent" : "queued");
  };

  if (done)
    return (
      <div className="stack gap-16 center" style={{ paddingBlock: 16 }}>
        <Check />
        <h2 className="display d-md">{c.doneTitle}</h2>
        <p className="muted">{c.doneSub}</p>
        {done === "queued" && <p className="small">{t.form.saved}</p>}
      </div>
    );

  return (
    <form className="stack gap-24" onSubmit={submit}>
      <div className="stack gap-8">
        <h2 className="display d-md">{c.title}</h2>
        <p className="small muted" style={{ margin: 0 }}>
          {c.sub.replace("{item}", pick.name)}
        </p>
      </div>
      {pick.sizes && pick.sizes.length > 0 && (
        <fieldset className="stack gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="eyebrow" style={{ marginBottom: 8 }}>
            {c.size}
          </legend>
          <div className="row gap-8" style={{ flexWrap: "wrap" }}>
            {pick.sizes.map((s) => (
              <button type="button" key={s} className="pill" aria-pressed={size === s} onClick={() => setSize(size === s ? null : s)}>
                {s}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset className="stack gap-8" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="eyebrow" style={{ marginBottom: 8 }}>
          {c.forWho}
        </legend>
        <div className="row gap-8" style={{ flexWrap: "wrap" }}>
          <label className="chip-radio">
            <input type="radio" name="who" checked={who === "teen"} onChange={() => setWho("teen")} />
            <span>{c.teen}</span>
          </label>
          <label className="chip-radio">
            <input type="radio" name="who" checked={who === "me"} onChange={() => setWho("me")} />
            <span>{c.me}</span>
          </label>
        </div>
      </fieldset>
      <fieldset className="stack gap-12" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="eyebrow" style={{ marginBottom: 12 }}>
          {t.form.yourDetails}
        </legend>
        <ContactFields id="shop" profile={store.profile} />
      </fieldset>
      <ConsentField profile={store.profile} />
      <button className="btn btn--blue btn--block" disabled={sending}>
        {sending ? t.form.sending : c.cta}
      </button>
      {failed && (
        <p className="small center" role="alert" style={{ margin: 0 }}>
          {t.form.failed}
        </p>
      )}
      <p className="tiny center">{t.launchWaitlist.note}</p>
    </form>
  );
}
