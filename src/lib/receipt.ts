// Invoices and receipts for purchases (memberships, passes, gift cards).
// Shared by the browser (in-app receipt page) and the Worker (email body, hosted /r/ link, WhatsApp/SMS text),
// so keep this file free of DOM and Worker APIs.
//
// Note: this is the studio's purchase confirmation. The legal tax document (חשבונית מס / קבלה with the
// business number and a sequential number) comes from the accounting or payment system (Green Invoice or the payment provider)
// once it is connected. The business details below stay hidden until they are filled in site.ts.
import { isTodo, siteConfig } from "../config/site";
import type { Lang, PayMethod } from "./relayTypes";

export type DocType = "invoice" | "receipt";

export interface ReceiptLine {
  label: string; // "Reformer · 10 classes"
  detail?: string; // "+2 classes carried over from your previous pass"
  amount: number; // ILS
}

export interface ReceiptData {
  no: string; // RS-261019-7KQ2, also the order id the relay uses to ignore a repeated purchase
  issuedAt: string; // ISO
  lang: Lang;
  customer: { name: string; phone: string; email?: string };
  lines: ReceiptLine[];
  total: number;
  method?: PayMethod;
  paid: boolean; // false => payment still to be confirmed (the receipt says so)
  /** Classes on the new plan after the carry-over, shown as a highlight. */
  classesTotal?: number;
  validUntil?: string; // YYYY-MM-DD
  giftCode?: string;
  link?: string; // hosted copy (/r/…) from the relay, kept on the device for sharing
  sentVia?: ("email" | "whatsapp" | "sms")[];
}

/** Order / document number: RS-YYMMDD-XXXX (date in studio time + 4 random characters, no look-alikes). */
export function receiptNumber(now = new Date(), rand: () => number = Math.random): string {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "2-digit", month: "2-digit", day: "2-digit" }).format(now).replace(/-/g, "");
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const tail = Array.from({ length: 4 }, () => abc[Math.floor(rand() * abc.length)]).join("");
  return `RS-${d}-${tail}`;
}
export const isReceiptNumber = (v: unknown): v is string => typeof v === "string" && /^RS-\d{6}-[A-Z2-9]{4}$/.test(v);

const L = {
  he: {
    invoice: "חשבון עסקה",
    receipt: "קבלה",
    no: "מספר",
    date: "תאריך",
    billedTo: "לכבוד",
    item: "פריט",
    amount: "סכום",
    total: "סה״כ",
    totalDue: "סה״כ לתשלום",
    paidBy: "שולם באמצעות",
    method: { bit: "bit", card: "כרטיס אשראי" } as Record<string, string>,
    pending: "התשלום ממתין לאישור הסטודיו.",
    classes: "שיעורים במנוי",
    validUntil: "בתוקף עד",
    giftCode: "קוד שובר",
    taxId: "עוסק",
    thanks: "תודה שבחרת ב־re:set pilates",
    note: "מסמך זה הוא אישור רכישה. חשבונית מס/קבלה רשמית תישלח ממערכת התשלומים.",
    view: "לצפייה והדפסה",
  },
  en: {
    invoice: "Invoice",
    receipt: "Receipt",
    no: "No.",
    date: "Date",
    billedTo: "Billed to",
    item: "Item",
    amount: "Amount",
    total: "Total",
    totalDue: "Total due",
    paidBy: "Paid by",
    method: { bit: "Bit", card: "Credit card" } as Record<string, string>,
    pending: "Payment is awaiting the studio's confirmation.",
    classes: "Classes on your plan",
    validUntil: "Valid until",
    giftCode: "Gift card code",
    taxId: "Business no.",
    thanks: "Thank you for choosing re:set pilates",
    note: "This document confirms your purchase. The official tax invoice/receipt is sent by the payment system.",
    view: "View and print",
  },
} as const;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => `₪${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const ilDate = (iso: string) => {
  const d = iso.length === 10 ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
};

/**
 * Studio contact shown on receipts and invoices: the email, plus WhatsApp once `contact.whatsapp` is filled in site.ts.
 * No social handles, address or website (owner's choice). Business name and number appear once filled.
 */
export function studioContact() {
  const c = siteConfig.contact;
  const set = (v?: string) => (v && !isTodo(v) ? v : "");
  const wa = set(c.whatsapp).replace(/\D/g, "").replace(/^972/, "0"); // 9725XXXXXXXX → 05XXXXXXXX
  return {
    name: siteConfig.brand.name,
    legalName: set(siteConfig.business.legalName),
    taxId: set(siteConfig.business.taxId),
    email: c.email,
    whatsapp: wa.length === 10 ? `${wa.slice(0, 3)}-${wa.slice(3, 6)}-${wa.slice(6)}` : wa,
  };
}

/** The RE:SET PILATES logo as a transparent PNG (email clients do not show SVG), absolute so it loads inside emails. */
export const RECEIPT_LOGO = "/assets/reset-wordmark.png";
export const receiptLogo = () => `${siteConfig.siteUrl}${RECEIPT_LOGO}`;

/** A complete, self-contained HTML document (inline styles only, so it renders the same in the app, a browser tab and an email). */
export function renderReceiptHtml(r: ReceiptData, type: DocType, opts: { logo?: string; link?: string } = {}): string {
  const t = L[r.lang];
  const he = r.lang === "he";
  const s = studioContact();
  const title = type === "invoice" ? t.invoice : t.receipt;
  const ink = "#2b2522";
  const muted = "#7a6f68";
  const line = "#e8e0d6";
  // each part isolated so phone numbers, addresses and the @handle keep their direction inside Hebrew text
  const contact = [s.email, s.whatsapp ? `WhatsApp ${s.whatsapp}` : ""].filter(Boolean).map((v) => `<bdi>${esc(v)}</bdi>`).join(" · ");
  const rows = r.lines
    .map(
      (l) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid ${line};vertical-align:top">${esc(l.label)}${l.detail ? `<div style="color:${muted};font-size:13px;margin-top:2px">${esc(l.detail)}</div>` : ""}</td>
        <td style="padding:12px 0;border-bottom:1px solid ${line};text-align:${he ? "left" : "right"};white-space:nowrap;direction:ltr">${money(l.amount)}</td>
      </tr>`,
    )
    .join("");
  const facts = [
    r.classesTotal ? [t.classes, String(r.classesTotal)] : null,
    r.validUntil ? [t.validUntil, ilDate(r.validUntil)] : null,
    r.giftCode ? [t.giftCode, r.giftCode] : null,
    type === "receipt" && r.method ? [t.paidBy, t.method[r.method] ?? r.method] : null,
  ].filter((x): x is string[] => !!x);

  return `<!doctype html>
<html lang="${r.lang}" dir="${he ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} ${esc(r.no)} · ${esc(s.name)}</title>
<style>@media print{body{background:#fff!important}.sheet{box-shadow:none!important;margin:0!important}}</style>
</head>
<body style="margin:0;background:#f6f1ea;font-family:${he ? "Heebo," : ""}Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:${ink};font-size:15px;line-height:1.5">
<div class="sheet" style="max-width:560px;margin:24px auto;background:#fffdf9;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:32px 28px">
  <table role="presentation" style="width:100%;border-collapse:collapse"><tr>
    <td style="vertical-align:middle"><img src="${esc(opts.logo ?? receiptLogo())}" width="124" height="60" alt="${esc(s.name)}" style="display:block;height:60px;width:auto"></td>
    <td style="vertical-align:middle;text-align:${he ? "left" : "right"}">
      <div style="font-size:22px;font-weight:600;letter-spacing:.02em">${esc(title)}</div>
      <div style="color:${muted};font-size:13px;direction:ltr;display:inline-block">${esc(t.no)} ${esc(r.no)}</div>
    </td>
  </tr></table>
  ${s.legalName || s.taxId ? `<div style="margin-top:16px;color:${muted};font-size:13px">${[s.legalName, s.taxId ? `${t.taxId} ${s.taxId}` : ""].filter(Boolean).map(esc).join(" · ")}</div>` : ""}
  <div style="margin-top:${s.legalName || s.taxId ? 0 : 16}px;color:${muted};font-size:13px">${contact}</div>

  <table role="presentation" style="width:100%;border-collapse:collapse;margin-top:24px;font-size:14px"><tr>
    <td style="vertical-align:top"><div style="color:${muted};font-size:12px;text-transform:uppercase;letter-spacing:.08em">${esc(t.billedTo)}</div>
      <div>${esc(r.customer.name)}</div><div style="direction:ltr;display:inline-block">${esc(r.customer.phone)}</div>${r.customer.email ? `<div>${esc(r.customer.email)}</div>` : ""}</td>
    <td style="vertical-align:top;text-align:${he ? "left" : "right"}"><div style="color:${muted};font-size:12px;text-transform:uppercase;letter-spacing:.08em">${esc(t.date)}</div>
      <div style="direction:ltr;display:inline-block">${ilDate(r.issuedAt)}</div></td>
  </tr></table>

  <table style="width:100%;border-collapse:collapse;margin-top:24px">
    <tr><th style="text-align:${he ? "right" : "left"};font-weight:500;color:${muted};font-size:12px;text-transform:uppercase;letter-spacing:.08em;padding-bottom:6px;border-bottom:1px solid ${line}">${esc(t.item)}</th>
        <th style="text-align:${he ? "left" : "right"};font-weight:500;color:${muted};font-size:12px;text-transform:uppercase;letter-spacing:.08em;padding-bottom:6px;border-bottom:1px solid ${line}">${esc(t.amount)}</th></tr>
    ${rows}
    <tr><td style="padding-top:14px;font-weight:600">${esc(type === "invoice" && !r.paid ? t.totalDue : t.total)}</td>
        <td style="padding-top:14px;font-weight:600;font-size:18px;text-align:${he ? "left" : "right"};direction:ltr">${money(r.total)}</td></tr>
  </table>

  ${facts.length ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:20px;background:#f6f1ea;border-radius:12px">${facts
    .map(([k, v]) => `<tr><td style="padding:8px 14px;color:${muted};font-size:14px">${esc(k)}</td><td style="padding:8px 14px;text-align:${he ? "left" : "right"};font-weight:600;direction:ltr">${esc(v)}</td></tr>`)
    .join("")}</table>` : ""}
  ${type === "receipt" && !r.paid ? `<p style="margin:16px 0 0;color:${muted};font-size:13px">${esc(t.pending)}</p>` : ""}
  ${opts.link ? `<p style="margin:20px 0 0"><a href="${esc(opts.link)}" style="color:#2e5670">${esc(t.view)}</a></p>` : ""}

  <p style="margin:28px 0 0;font-size:15px">${esc(t.thanks)}</p>
  <p style="margin:6px 0 0;color:${muted};font-size:12px">${esc(t.note)}</p>
</div>
</body>
</html>`;
}

/** Short plain-text version for WhatsApp, SMS and the email's text part. */
export function receiptText(r: ReceiptData, link?: string): string {
  const t = L[r.lang];
  const s = studioContact();
  return [
    `${s.name} · ${t.receipt} ${r.no}`,
    ...r.lines.map((l) => `${l.label}${l.detail ? ` (${l.detail})` : ""}: ${money(l.amount)}`),
    `${t.total}: ${money(r.total)}`,
    r.classesTotal ? `${t.classes}: ${r.classesTotal}` : "",
    r.validUntil ? `${t.validUntil}: ${ilDate(r.validUntil)}` : "",
    r.giftCode ? `${t.giftCode}: ${r.giftCode}` : "",
    r.paid ? "" : t.pending,
    link ? `${t.view}: ${link}` : "",
    [s.email, s.whatsapp && `WhatsApp ${s.whatsapp}`].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join("\n");
}

export const receiptSubject = (r: ReceiptData) => `${L[r.lang].receipt} ${r.no} · ${siteConfig.brand.name}`;
