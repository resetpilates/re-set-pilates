# re:set pilates — working notes for Claude

Bilingual (Hebrew default / English) marketing site + installable booking app for a boutique Reformer Pilates studio in Hod Hasharon.
One Vite + React + TypeScript codebase, served by a Cloudflare Worker (`worker/`). Owner: Eli (cdlvpflooring-prog); studio: Orit.

## Run and check

```bash
bun install
bun run dev          # http://localhost:5173 (the app's .claude/launch.json uses this)
bun test src/        # pricing + plan rules
bun run build        # tsc (app + worker) + vite build; run before every PR
```

## Where things live

- `src/config/pricing.ts` — the whole price list. Every page, checkout, receipt, chat answer and schema.org offer reads it; never hard-code a price in a component or in copy.
- `src/config/packages.ts` — closed-group packages (private group, event). `src/config/shop.ts` — studio shop (coming soon).
- `src/config/site.ts` — contact, flags (`launchPricing`, `paymentsLive`, `demoMode`), media slots (`studioMedia.ogImage` is the link-preview image).
- `src/content/en.ts`, `he.ts` — all copy, same shape (`en.ts` defines the type). Add a key to both.
- `src/components/blocks.tsx` — pricing list, teens plan, packages, class-price strip, lead form. `ui.tsx` — small pieces (`PayCards` = "We accept").
- `src/components/Shell.tsx` — header (wordmark, language, WhatsApp, Book, menu), tab bar, footer.
- `src/styles/global.css` — one stylesheet, appended in dated "v3.x" sections; later rules override earlier ones. Add a new section at the end rather than editing old ones.
- `worker/preview.ts` — injects title / Open Graph / canonical tags per page for WhatsApp, Instagram, Facebook and Google (the app never runs there).
- `LAUNCH-CHECKLIST.md` — open business items; its Pricing section mirrors `pricing.ts`.

## Pricing rules (owner, 7 Nov 2026)

- A single class is ₪60. A class is never cheaper than ₪50 on any plan (`PRICE_FLOOR`); plans step the price down slowly.
- Teens and active-duty soldiers never pay more than ₪50 a class, single or with a plan (`CONCESSION_MAX`).
- Private group ₪375, event package ₪750. Gift cards sell the passes (₪300 / ₪550 / ₪750).
- No launch overlay: `flags.launchPricing` is off and no item carries `launchPrice` / `bonusSessions`. `src/config/pricing.test.ts` enforces all of this; update the tests with any price change.
- The Worker charges what Airtable *Plans & Prices* says: a price change here needs the same change there.

## Conventions

- Mobile first: most visitors are on phones. Check every change at 390px wide and in both languages (Hebrew is RTL: use logical properties, `inset-inline`, `margin-inline-start`).
- Keep the aesthetic: Cormorant Garamond display, Inter / Heebo UI, cream background, clay accent, rounded cards. Reuse `.card`, `.btn`, `.pill`, `.eyebrow`, `.tiny`.
- Business facts marked `TODO_VERIFY` are unresolved, never guessed.
- Branch per task (`claude/<topic>`), PR into `main`. Commit messages say what changed for the owner, not which files.
