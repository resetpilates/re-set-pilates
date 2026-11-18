import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHead } from "../components/blocks";
import { useI18n } from "../lib/i18n";
import { RECEIPT_LOGO, renderReceiptHtml, type DocType } from "../lib/receipt";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";

/** Purchases & receipts (list) and one receipt / invoice, printable and shareable. */
export default function Receipt() {
  const { no } = useParams();
  const { t, href, fmtDate } = useI18n();
  useSeo({ title: `${t.receipt.list} | re:set pilates`, desc: t.receipt.list });
  const store = useStore();
  const receipts = store.receipts ?? [];
  const r = no ? receipts.find((x) => x.no === no) : undefined;
  const [type, setType] = useState<DocType>("receipt");
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);

  // Opening the receipts clears the notification dot.
  const { markNoticesRead } = store;
  useEffect(() => markNoticesRead(), [markNoticesRead, no]);

  const html = useMemo(() => (r ? renderReceiptHtml(r, type, { logo: RECEIPT_LOGO }) : ""), [r, type]);

  if (!no)
    return (
      <div className="page tone-dark has-tabbar">
        <PageHead title={t.receipt.list} app />
        <div className="wrap wrap--app pbody screen stack gap-16">
          {receipts.length === 0 ? (
            <p className="muted">{t.receipt.none}</p>
          ) : (
            <div className="card rows" style={{ paddingBlock: 4 }}>
              {receipts.map((x) => (
                <Link key={x.no} to={href(`receipt/${x.no}`)}>
                  <span className="stack gap-4">
                    <span className="key">{x.lines[0]?.label}</span>
                    <span className="tiny muted">
                      <bdi dir="ltr">{x.no}</bdi> · {fmtDate(new Date(x.issuedAt))} · <bdi dir="ltr">₪{x.total}</bdi>
                      {!x.paid && <> · {t.receipt.pending}</>}
                    </span>
                  </span>
                  <span className="chev" aria-hidden />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    );

  if (!r)
    return (
      <div className="page tone-dark has-tabbar">
        <PageHead title={t.receipt.title} app />
        <div className="wrap wrap--app pbody screen stack gap-16 center">
          <p className="muted">{t.receipt.notFound}</p>
          <Link to={href("receipt")} className="btn btn--secondary">
            {t.receipt.list}
          </Link>
        </div>
      </div>
    );

  const share = async () => {
    const url = r.link ?? location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${t.receipt.receipt} ${r.no}`, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelled */
    }
  };

  return (
    <div className="page tone-dark has-tabbar">
      <PageHead title={type === "invoice" ? t.receipt.invoice : t.receipt.receipt} app />
      <div className="wrap wrap--app pbody screen stack gap-16">
        <div className="row gap-8" role="group" aria-label={t.receipt.title}>
          {(["receipt", "invoice"] as const).map((k) => (
            <button key={k} type="button" className="pill" aria-pressed={type === k} onClick={() => setType(k)}>
              {t.receipt[k]}
            </button>
          ))}
        </div>
        <iframe
          ref={frame}
          title={`${t.receipt[type]} ${r.no}`}
          srcDoc={html}
          style={{ width: "100%", height, border: 0, borderRadius: 16, background: "#efeae4" }}
          onLoad={() => {
            const d = frame.current?.contentDocument;
            if (d) setHeight(d.documentElement.scrollHeight + 8);
          }}
        />
        <div className="row gap-8" style={{ flexWrap: "wrap" }}>
          <button type="button" className="btn btn--primary" style={{ flex: 1 }} onClick={() => frame.current?.contentWindow?.print()}>
            {t.receipt.print}
          </button>
          <button type="button" className="btn btn--secondary" style={{ flex: 1 }} onClick={share}>
            {t.receipt.share}
          </button>
        </div>
        <Link to={href("receipt")} className="btn btn--ghost btn--sm" style={{ alignSelf: "flex-start" }}>
          {t.receipt.list}
        </Link>
      </div>
    </div>
  );
}
