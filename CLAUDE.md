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
- `src/config/schedule.ts` — the class timetable from the studio's latest poster (weekday, time, instructor), repeated weekly from `startsOn`, plus the `freeTrial` switch. A new poster = replace `week`, `source`, `startsOn`; update `src/lib/booking.test.ts`.
- `src/config/packages.ts` — closed-group packages (private group, event). `src/config/shop.ts` — studio shop (coming soon).
- `src/config/site.ts` — contact, flags (`launchPricing`, `paymentsLive`, `demoMode`), media slots (`studioMedia.ogImage` is the link-preview image).
- `src/content/en.ts`, `he.ts` — all copy, same shape (`en.ts` defines the type). Add a key to both.
- `src/components/blocks.tsx` — home "Our classes" (`ClassWays`: In a group / Personal / Whole studio), pricing list, teens plan, packages, class-price strip, lead form. `ui.tsx` — small pieces (`PayCards` = "We accept").
- `src/components/Shell.tsx` — header (wordmark, language, WhatsApp, Book, menu), tab bar, footer.
- `src/styles/global.css` — one stylesheet, appended in dated "v3.x" sections; later rules override earlier ones. Add a new section at the end rather than editing old ones.
- `worker/preview.ts` — injects title / Open Graph / canonical tags per page for WhatsApp, Instagram, Facebook and Google (the app never runs there).
- **Studio hub** (Orit's command center, `/he/studio` · `/en/studio`, passcode): `src/pages/Studio.tsx` (screens: Today, Leads, Classes, Members with a full page per customer, Money with payments, receipts and memberships, Marketing, Wiki), copy and the help wiki in `src/content/studio.ts`, styles in `src/styles/studio.css`, Worker side in `worker/studio.ts` (`/api/studio/login · data · member · act · docs · file`), shared shapes in `src/lib/studioTypes.ts`. It is loaded only when opened, so its copy and CSS stay out of `en.ts` / `he.ts` / `global.css` on purpose. It never reads Health & Consent or Trainer Check-ins. Secrets: `STUDIO_PASSCODE` (8+ characters; without it the hub stays closed), optional `META_ADS_TOKEN` + `META_AD_ACCOUNT` for the ads numbers. **Wiki** (the `help` tab): routines and how-tos from `src/content/studio.ts`, studio rules straight from the site's terms (`t.terms.sections`, never a second copy), and **Documents**: Orit uploads photos and files from her phone into the private R2 bucket `reset-studio-docs` (binding `DOCS`, `worker/docs.ts`), each labelled with a category (expense, invoice, tax, health, contract, other), date, note and, for expenses and invoices, amount and payee; search is over those labels; expense totals and a CSV for the accountant are built on the phone. Files open only through a 6-hour signed link; PDFs and photos show inline, anything else downloads. Health documents sit with the rest under the one studio passcode (owner's choice, 21 Nov 2026), so the hub *does* hold medical papers there, even though it never reads Airtable's Health & Consent. `bun run wiki:export` rewrites `wiki/` (Markdown notes for an Obsidian vault) from the wiki text: run it after changing wiki copy or the terms. Nothing private goes in the repo or the bundle.
- `LAUNCH-CHECKLIST.md` — open business items; its Pricing section mirrors `pricing.ts`.

## Pricing rules (owner, 7 Nov 2026)

- A Reformer single class is ₪60. A Reformer class is never cheaper than ₪50 on any plan (`PRICE_FLOOR`). Monthly plans and passes share one per-class ladder by class count (4–5: ₪60, 8: ₪58, 10–12: ₪55, 15–16: ₪50).
- Mat Pilates is ₪5 a class less than Reformer on every general plan (`priceFor(plan, kind)`); never type Mat prices by hand.
- Teens and active-duty soldiers never pay more than ₪50 a class, single or with a plan (`CONCESSION_MAX`).
- Private group ₪375, event package ₪750. Gift cards sell the passes (₪300 / ₪550 / ₪750).
- No launch overlay: `flags.launchPricing` is off and no item carries `launchPrice` / `bonusSessions`. `src/config/pricing.test.ts` enforces all of this; update the tests with any price change.
- The Worker charges what Airtable *Plans & Prices* says: a price change here needs the same change there.

## Conventions

- Mobile first: most visitors are on phones. Check every change at 390px wide and in both languages (Hebrew is RTL: use logical properties, `inset-inline`, `margin-inline-start`).
- Keep the aesthetic: Cormorant Garamond display, Inter / Heebo UI, warm ivory background, blush accent with a touch of sage (the "Hygge Haven" palette, `--hy-*` tokens in the v5.0 section of `global.css`), rounded cards. Reuse `.card`, `.btn`, `.pill`, `.eyebrow`, `.tiny`.
- Business facts marked `TODO_VERIFY` are unresolved, never guessed.
- Branch per task (`claude/<topic>`), PR into `main`. Commit messages say what changed for the owner, not which files.
