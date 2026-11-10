// Link previews and search tags, added to every page as Cloudflare sends it.
//
// The app sets titles in the browser, but WhatsApp, Instagram, Facebook and Google read the raw HTML
// and never run the app. So the Worker fills in <title>, description, Open Graph tags, canonical and
// hreflang links from the same copy the pages use (src/content), per language and per page.
import { serviceBySlug } from "../src/config/services";
import { siteConfig } from "../src/config/site";
import { en } from "../src/content/en";
import { he } from "../src/content/he";

type Lang = "he" | "en";
type Meta = { title: string; desc: string };

const DICT = { he, en };
// First path segment after the language → key in content.meta.
const PAGE: Record<string, keyof typeof en.meta> = {
  "": "home",
  schedule: "schedule",
  class: "schedule",
  services: "services",
  pricing: "pricing",
  checkout: "pricing",
  about: "about",
  faq: "faq",
  contact: "contact",
  quiz: "quiz",
  gift: "gift",
  shop: "shop",
  request: "services",
  receipt: "my",
  my: "my",
  profile: "profile",
  progress: "profile",
};
// Personal pages: fine to open, pointless to index.
const PRIVATE = new Set(["my", "profile", "progress", "checkout", "class", "receipt"]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function pageMeta(pathname: string): { lang: Lang; rest: string; meta: Meta; index: boolean } {
  const m = pathname.match(/^\/(he|en)(?:\/(.*))?$/);
  const lang: Lang = m && m[1] === "en" ? "en" : "he";
  const rest = (m?.[2] ?? "").replace(/\/+$/, "");
  const [first, second] = rest.split("/");
  const t = DICT[lang];
  let meta: Meta = t.meta[PAGE[first] ?? "home"];
  if (first === "services" && second) {
    const s = serviceBySlug(second);
    const item = s && t.services.items[s.id];
    if (item) meta = { title: `${item.name} | ${siteConfig.brand.name}`, desc: item.desc };
  }
  return { lang, rest, meta, index: !PRIVATE.has(first) };
}

/** Rewrites an HTML response in place. Non-HTML responses are returned untouched. */
export function withPreview(res: Response, url: URL): Response {
  if (!res.headers.get("content-type")?.includes("text/html")) return res;
  const { lang, rest, meta, index } = pageMeta(url.pathname);
  // Always the public https address, even when the Worker is hit over plain http (local dev).
  const origin = url.hostname === "localhost" ? url.origin : `https://${url.host}`;
  const page = (l: Lang) => `${origin}/${l}/${rest}${rest ? "/" : ""}`;
  const image = new URL(siteConfig.studioMedia.ogImage, origin).toString();
  const tags = [
    `<link rel="canonical" href="${esc(page(lang))}">`,
    `<link rel="alternate" hreflang="he" href="${esc(page("he"))}">`,
    `<link rel="alternate" hreflang="en" href="${esc(page("en"))}">`,
    `<link rel="alternate" hreflang="x-default" href="${esc(page("he"))}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(siteConfig.brand.name)}">`,
    `<meta property="og:locale" content="${lang === "he" ? "he_IL" : "en_US"}">`,
    `<meta property="og:url" content="${esc(page(lang))}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.desc)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    `<meta property="og:image:type" content="image/jpeg">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.desc)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    index ? "" : `<meta name="robots" content="noindex">`,
  ].join("\n    ");

  const out = new HTMLRewriter()
    .on("html", {
      element(el) {
        el.setAttribute("lang", lang);
        el.setAttribute("dir", lang === "he" ? "rtl" : "ltr");
      },
    })
    .on("title", { element: (el) => void el.setInnerContent(meta.title) })
    .on('meta[name="description"]', { element: (el) => void el.setAttribute("content", meta.desc) })
    .on("head", { element: (el) => void el.append(tags, { html: true }) })
    .transform(res);
  return withScriptNonce(out);
}

/**
 * Per-request CSP nonce. Cloudflare adds a small inline bootstrap to HTML pages (bot and challenge
 * signals) and copies the nonce from the Content-Security-Policy header onto it, so the strict policy
 * in public/_headers keeps blocking every other inline script while that one is allowed to run.
 */
function withScriptNonce(res: Response): Response {
  const csp = res.headers.get("content-security-policy");
  if (!csp || !csp.includes("script-src 'self'")) return res;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const r = new Response(res.body, res);
  r.headers.set("content-security-policy", csp.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`));
  return r;
}
