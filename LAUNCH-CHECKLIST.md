# re:set pilates — what is not finished end to end

Everything below works on screen as a demo. This is what each flow still needs before real customers use it.

## Pricing — the owner's rules (7 Nov 2026) are the source of truth
`src/config/pricing.ts` holds the whole list and every page, the checkout, receipts, the chat and the schema.org data read from it (`src/config/pricing.test.ts` pins it to the rules below).

Rules: a single class is ₪60; a class is never under ₪50 on any plan (`PRICE_FLOOR`); plans step the price down slowly; teens and active-duty soldiers never pay over ₪50 a class, single or with a plan.

| Plan | Reformer | Per class | Mat (−₪5 a class) | Valid |
| --- | --- | --- | --- | --- |
| Single class | ₪60 (teens / soldiers ₪50) | | ₪55 | |
| 1× a week (4 classes) | ₪240 | ₪60 | ₪220 | 1 month from purchase |
| 2× a week (8) | ₪465 | ₪58 | ₪425 | 1 month |
| 3× a week (12) | ₪660 | ₪55 | ₪600 | 1 month |
| 4× a week (16) | ₪800 | ₪50 | ₪720 | 1 month |
| Unlimited | ₪1000 | | ₪900 | 1 month |
| 5-class pass | ₪300 | ₪60 | ₪275 | 2 months from purchase |
| 10-class pass | ₪550 | ₪55 | ₪500 | 2 months |
| 15-class pass | ₪750 | ₪50 | ₪675 | 2 months |
| Teens monthly (4 classes) | ₪200 | ₪50 | | 1 month |
| Private group / event package | ₪375 / ₪750 per group | | | by request |

Monthly plans and passes share one ladder by class count: 4–5 classes ₪60, 8 ₪58, 10–12 ₪55, 15–16 ₪50. Mat is derived in code (`priceFor`), never typed in twice.
Gift cards sell the three Reformer passes (₪300 / ₪550 / ₪750) or a custom amount. There is no launch overlay any more (`flags.launchPricing` is off and no item carries `launchPrice` / `bonusSessions`): the old "+1 class" took the 15-pass to ₪47, under the floor. Reformer and Mat share this list.
- [x] **Airtable *Plans & Prices* is what the Worker charges** (updated 7 Nov 2026, incl. the new `tsingle` row): these numbers (m1x 240, m2x 465, m3x 660, m4x 800, munl 1000, teens 200, single 60, tsingle 50, p5 300, p10 550, p15 750) and clear the *Launch price* and *Bonus* columns. Mat is ₪5 a class less: the Worker's charge must take the chosen class into account (today it charges one price per plan id), so either add Mat rows or deduct per class in the Worker before payments go live. Until then the site shows one price and the Worker charges another.

## Launch prep decisions (owner review, 20 Oct 2026)
- **No Arbox.** The booking system is built in-house (site + Cloudflare Worker + Airtable). Arbox was removed from checkout, config, chat answers, receipts and the schema.
- **Payments not live yet** (`flags.paymentsLive: false` in `src/config/site.ts`). Every buy/book button (pricing, booking a class, gift cards) ends in the launch waitlist form instead of a sample purchase. Sign-ups land in Airtable **Launch Waitlist** (name, phone, optional email, class type, Adult morning / Teen evening, what they wanted, which class slot, source, contacted ✓). Name + phone are required.
- **One held class before payment:** until the studio confirms a customer's payment, the app lets them hold one upcoming class at a time (on an unpaid plan or with a single class). Further orders still reach the Launch Waitlist, without a bed. The Worker enforces it too, by phone number: a second Held booking for a class that hasn't started yet is refused, from any phone or browser. Switching a held class to Booked (payment taken) frees the slot.
- **Confirming a waitlist plan after taking payment:** in Airtable **Memberships**, add a row linked to the member with the plan they ordered (Plan = the *Plans & Prices* row), Start, Renews and **Status = Active**. The customer's app then clears "Payment pending" by itself the next time it is opened, and their next bookings arrive as Booked instead of Held. Beds they already held stay Held: switch those to Booked by hand.
- [ ] **Choose the payment provider** for Bit + credit card (not chosen yet; e.g. Grow/Meshulam, PayPlus, Cardcom, Tranzila). Then add the links in `siteConfig.payments`, set `paymentsLive: true`, and call everyone on the Launch Waitlist.
- [ ] Airtable: create an automation "New Launch Waitlist row → email Orit" (same as the lead email) and a view sorted by Submitted, filtered on Contacted = off.
- **Class-price strip** (schedule, class rows, service pages): adults ₪60 a single class / from ₪50 per class with a plan; teens and soldiers ₪50 either way (`intro` in `src/config/pricing.ts`; derived from the price list).
- **Requests (private, duo, closed groups):** the `/request` page (type tiles, preferred days and times, name, phone, note) replaces the old contact-form link; it arrives as a lead whose message carries the type, days, times and package. The "Private or Duo session" card under the schedule is gone.
- **Team:** only Orit is listed; every class shows "with Orit". Add instructors in `src/config/team.ts` when they join.
- **Hero (21 Oct):** greeting, headline and two buttons only, centred; the facts line, the sub-line and the launch note were removed at the owner's request. The photo/motion stays until a new hero asset exists.
- **Hero (18 Nov):** the first screen is a silent 10-second video of Orit in a plank with a leg lift on a Reformer in the real studio room (arches, sheer curtains), over a still of its first frame, with a cream card on it: the RE:SET logo, welcome, one headline ("Get strong." / "להיות חזקה.") and the two buttons. Phones get a tall video, wide screens a wide one (`public/media/hero-orit-tall.mp4`, `hero-orit-wide.mp4`; stills `public/assets/hero-orit-*.webp`). Rendered from the owner's real room and portrait photos; replace all four files with real footage after the shoot (the `compress-hero` workflow re-encodes them).
- **Single class: ₪60** (teens / soldiers ₪50). Shown on every Reformer class page next to time/length/instructor, on the Reformer, Mat and Teens service pages, at the top of the punch-card list, and in the booking sheet. Airtable *Plans & Prices* rows `single` and `teens` must be updated to ₪60 and ₪200.
- **Schedule (planned):** 50-minute classes on the hour, 10-minute changeover (owner, 21 Oct). Sun–Fri mornings 08:00, 09:00, 10:00, 11:00 = adults (Reformer for now). Sun–Thu evenings 17:00–20:00 = teens (by request until the teen timetable is set). Closed Saturday; no Friday evening. Final timetable is set closer to opening (`src/lib/booking.ts`).
- [ ] **Mat:** no Mat slots until Mat instructors join, so the Mat schedule tab is hidden and Mat shows "By request". When it starts: up to 8 people, set `bookable: true` in `src/config/services.ts` and add slots in `src/lib/booking.ts` (Mat capacity is not modelled yet).
- [ ] **Circuit class (idea):** 5 reformers + 3 mat stations, up to 8 people, each station a different exercise. Not on the site yet; decide name, price and slots before adding it.
- [ ] **For Orit:** create the workout routines and the levels (e.g. beginner / intermediate / advanced) for Reformer, Mat and the circuit. Studio planning only, no site change yet.
- Contact page: parking = street parking; Google profile + review link set (`g.page/r/CYP9NF0IiTdlEBM`). Studio WhatsApp + phone = **050-837-1101** (`contact.phone`, `contact.whatsapp` = 972508371101). WhatsApp shows in the header (green icon), the menu (button + call link), the top of the Contact page and the top of the "Ask Orit" chat; every link carries a pre-written first message for the page it came from (`t.wa.prefill`, `src/lib/whatsapp.tsx`). Receipts and the Google schema use the same number.

## Scheduling and booking
- Class times follow the planned week; "spots left" is still sample data. Needs live availability from the in-house booking backend.
- Bookings and cancellations are sent to Airtable (Bookings) through the Worker, but availability is not read back yet, so two people can pick the same bed.
- Bed choice is saved with the booking; nothing yet blocks a bed someone else took.
- Membership limits (for example 3 classes a week) and pass balances are not enforced; the numbers on the profile are estimates.
- Waitlist and "remind me" are switches only. Nobody is notified. Needs a messaging service (WhatsApp / SMS / email).
- There is no sign-in. Needs real accounts (phone-code login, see `ACCOUNTS-PLAN.md`).

## Checkout (memberships and passes)
- Studio terms (תקנון, owner's text of 7 Nov 2026) live in `src/content` under `terms` and at `/he/terms` · `/en/terms`. Accepting them (a checkbox, no signature) is required at checkout, in the profile sign-in and on the first booking; the date is saved on the device and written to the Airtable member (*Terms accepted on*) with the checkout. Changing the text: edit both languages and bump `policies.termsVersion` in `site.ts` so everyone accepts again. Cancellation is one rule everywhere (owner, 10 Nov 2026): **24 hours** before group classes, private and duo sessions and closed groups (`policies.cancelHours`). Private events keep **5 days** (terms §8). Checkout shows a one-line summary of the key terms above the terms box. Auto-renew for monthly memberships is opt-in at checkout (unticked by default) and can be switched on or off any time on the profile; it ticks the *Auto-renew* checkbox on the Airtable membership. Nothing charges automatically yet: Orit renews by hand for memberships with Auto-renew ticked. Orit to confirm the English translation; the privacy policy the terms mention is not built yet.
- Hidden while `paymentsLive` is off (waitlist instead). Once on: Bit and card buttons open the provider links in `siteConfig.payments`.
- After real payment, the provider must tell the app the plan is active (payment webhook → Worker → Airtable). Today Orit confirms it by hand in Airtable.
- Name, phone and email typed at checkout are not saved or sent anywhere.
- No receipt or confirmation message is sent.

## Studio hub (Orit's command center, 19 Nov 2026)

One private page, `resetpilates.org/he/studio` (English: `/en/studio`), that shows everything the website sends to Airtable: what is waiting for Orit, today's classes with attendance, leads with WhatsApp / call buttons, the next 7 days, every member with their plan, where people come from, and a help wiki.

- [ ] **Set the passcode:** Cloudflare > Workers > re-set-pilates > Settings > Variables and Secrets > add secret `STUDIO_PASSCODE` (8 characters or more; a short phrase is best), or `bunx wrangler secret put STUDIO_PASSCODE`. Until it is set the page answers "not switched on yet". Changing it signs every phone out.
- [ ] **Check the Airtable token** (`AIRTABLE_TOKEN`) can read Classes, Campaigns and Chat Questions and edit Leads, Bookings and Launch Waitlist (it already writes to them for the website).
- [ ] **Orit adds it to her home screen** (Help > "How do I put this on my phone's home screen?") and reads the Hebrew wording once: it was written with the page and has not been reviewed by her.
- [ ] **Meta ads numbers (optional):** add secrets `META_ADS_TOKEN` (Marketing API token with `ads_read`) and `META_AD_ACCOUNT` (the ad account number, digits only). Not tested against a real ad account yet. Without them Marketing says "Not connected yet".
- [ ] **Google Sheet feed:** the sheet "re:set pilates – Studio records" has a tab per kind of record with the columns ready, and no rows yet. To fill it: Airtable > Automations > connect a Google Sheets account that can edit the sheet, then one "record created → append row" automation per tab.
- **Money and customer pages (19 Nov 2026):** Money lists payments to confirm, payments received (90 days) and every membership. Tapping a name anywhere opens that customer's page: details, memberships, every payment with its receipt, and a full history of classes, purchases and enquiries. A receipt opened from the hub is rebuilt from the Airtable payment row as it is now (it says "paid" once confirmed), so it can differ slightly from the one sent at checkout (no carry-over line). Receipt links need `RECEIPT_SECRET` or `TURNSTILE_SECRET` set, as for customer receipts; a payment typed into Airtable without an RS- number has no receipt.
- **Wiki (20 Nov 2026):** the Help tab is now the studio wiki. Four parts: Routines (start of day, after class, when money arrives, weekly, month end), Studio rules (the terms from the website, same wording), How do I… (the dashboard how-tos), and Documents (a Google Drive folder, live). Search covers all four.
- [ ] **Connect the Documents folder** (until then Documents says "not connected yet"; the rest of the wiki works):
  1. In Google Drive, signed in as resetpilates11@gmail.com, create a folder, e.g. "re:set wiki", with subfolders such as נהלים / חשבוניות / קבלות / הוצאות / מסמכים פרטיים. Put the documents in.
  2. At console.cloud.google.com (any Google account): create a project, enable "Google Drive API", then IAM & Admin > Service Accounts > Create service account. Open it > Keys > Add key > JSON. A file downloads.
  3. Share the wiki folder with the service account's email (it ends in `iam.gserviceaccount.com`) as **Viewer**. Share nothing else with it.
  4. In Cloudflare > re-set-pilates > Settings > Variables and Secrets: add secret `GOOGLE_SERVICE_ACCOUNT` (paste the whole JSON file) and variable `WIKI_FOLDER_ID` (the last part of the folder's address, after `/folders/`). Deploy, then re-run the `ci` workflow on main.
  5. `resetpilates.org/api/health` should show `"wiki":true`. Not yet tried against the real Google Drive.
- Everyone with the studio passcode can open every document in that folder (owner's choice, 20 Nov 2026). A document link works for 6 hours without signing in, so don't forward those links.
- **Obsidian:** `wiki/he` and `wiki/en` hold the wiki as Markdown notes (routines, rules, how-tos). Copy either folder into the Reset Pilates vault. Regenerate with `bun run wiki:export` after the wiki text changes. Invoices and private papers are not exported; they stay in Drive.
- What Orit can change from the hub: a lead's status, "I contacted them" on the waiting list, and came / didn't come on a booking. Confirming a payment and activating a plan are still done in Airtable (each row links straight to the record).
- Not in the hub on purpose: health declarations and trainer check-ins (Airtable only).

## Health declaration (הצהרת בריאות)

- **Health declaration + studio terms, one step, once a year (11 Nov 2026):** before a first payment (and before booking a class) the member fills the health declaration and ticks the studio terms on the same page. Both last 12 months. From 30 days before the end the app says "Please renew by …" (profile and next-step card); after it, the member is asked again before paying or booking. The terms tick is saved on the same Health & Consent row (*Terms & cancellation policy accepted* + *Terms accepted on*) and on Members > *Terms accepted on*.
- [ ] **Turn on the Airtable automation "Health declaration + terms renew in 30 days → email Orit"** (Automations in the base; it was created switched off). It emails resetpilates11@gmail.com once per declaration when 30 days are left.
- At `/he/health` · `/en/health`, linked from the profile, the checkout and waitlist confirmations, My classes, and the class booking sheet. A member can't confirm their first booking until it is filled in; the checkbox confirms it, no signature.
- Each declaration adds a row to Airtable **Health & Consent** (restricted, Orit only), linked to the member: signed, signed on, valid until (12 months), pregnant / postnatal, signed via "Profile (online)". The first line of *Injuries / conditions* says whether a doctor's approval is needed and why; injury notes and an under-18's parent or guardian follow. Members > *Health declaration* shows the tick.
- Buying a single class for a specific date asks for the declaration first, before paying or holding the bed. The form has the same Turnstile bot check as the contact form.
- A member who declared on another phone, after signing out, or on paper (a row Orit adds with *Signed via* Paper or Studio QR code) is not asked again: the app checks Health & Consent by phone + last name and gets back only the valid-until date.
- A declaration made with no connection waits on the phone ("saved, sending when you're back online") and counts only once it reaches Airtable; a resend of the same declaration is saved once (its *Ref:* line in *Injuries / conditions*). A yearly renewal starts with blank answers. An under-18's guardian needs an Israeli phone number.
- A doctor's approval does not block booking: the member is asked to send it on WhatsApp or bring it. **Orit ticks *Doctor approval on file* before their first class.**
- Orit to approve: the question wording (draft `health-decl-v0-draft` in `src/content`, shown as "Draft wording" on the form), which answers need a doctor's approval (`src/lib/health.ts`), and the 12-month validity. When approved, bump the version in `src/lib/health.ts`.
- Optional, cleaner for Orit: add two fields to Health & Consent, a *Medical clearance needed* checkbox and a *Parent / guardian (under 18)* text field, and point the Worker at them (today both go into the *Injuries / conditions* note).
- Auto-renew now ticks the existing *Auto-renew* checkbox on the Airtable membership (the "· Auto-renew" name tag is gone).

## Gift cards
- No payment is taken and nothing is sent to the recipient.
- No gift code is created, so a gift cannot be redeemed.
- To make it real: (1) a payment link, (2) a unique code per gift stored somewhere the studio can see (Airtable Gift Cards), (3) delivery to the recipient by WhatsApp or email with the note, (4) a way to redeem the code at checkout or at the desk, (5) an expiry rule.
- "Notify me" for the shop saves nothing.

## Contact and leads
- Main contact is resetpilates11@gmail.com (set in `src/config/site.ts`).
- The "call me back" form sends straight into Airtable (Leads & Inquiries) through the Cloudflare Worker once `AIRTABLE_TOKEN` is set on the Worker. Until then, or if sending fails, it opens a ready-to-send email to that Gmail as before. Steps: `CLOUDFLARE-PLAN.md` section 1.
- Google Business Profile and review links are set. Still to do: the Place ID (`social.googlePlaceId`) so directions open the listing.
- The three Google reviews on the home page are labelled samples (demo mode only). Replace them with real reviews in `src/config/team.ts`.
- WhatsApp and phone: 050-837-1101 (live). WhatsApp Business catalog, channel and class group links are empty slots in `siteConfig.whatsappBusiness` (hidden until filled). Parking: street parking.

## Content placeholders (planned for the next version)
- Studio photos and hero video (after construction and the professional shoot).
- Instructor names, bios and portraits; fuller founder bio and background story.
- Reviews and press (hidden until real ones exist).

## Before going live
- Live at https://resetpilates.org (Cloudflare, auto-published from `main`). Open items: `CLOUDFLARE-PLAN.md` section 1.
- Turn off demo mode (`flags.demoMode`) and confirm launch pricing on/off.
- New offers (Oct 2026 flyers): add a "Teens" plan in Airtable *Plans & Prices* with Website ID `teens`, regular price 200, monthly, validity 1 month, or the teens checkout returns "unknown plan". Reformer and Mat share one price list; the chosen class is written into the membership name, e.g. "2× per week (Mat)". Group packages (private group 375, event 750) are request-only and arrive as leads with interest "Event" and the package in the message. (The `teens` row now exists in Airtable.)
- Photos for Teens and Closed groups are stand-ins (`ex-rest`, `studio`) until the shoot.
- Google Analytics ID (or Cloudflare Web Analytics). Sitemap and `robots.txt` are set for `resetpilates.org`.
- Check on a real iPhone and Android phone, in Hebrew and English.

## My progress (AI trainer MVP, spec in `AI-TRAINER-SPEC.md`)
- Works as a demo only: answers, check-ins and progress live in the visitor's own browser. Needs sign-in and a private server database (health data encrypted, seen only by the member and her instructor) before real use.
- Attendance comes from sample data plus the visitor's own demo bookings. Needs attendance from the in-house bookings.
- Safety reviews (pain 7+, rising pain, high soreness, onboarding red flags) show in a demo "Studio view" inside Details. Needs a real staff screen and a notification to Orit (WhatsApp / email) that retries until she acknowledges.
- Orit must approve: health-consent wording, the "stop and see a doctor" wording, all thresholds and score targets in `src/config/trainer.ts`, whether clients may self-test at home, and who covers safety reviews when she is away.
- Included resources are sample titles with no content. Supply real videos/guides and set `approved: true`.
- Personal paid suggestions are switched off (`paidCards.enabled: false`) until catalog and membership data are connected; members who opt in see a plain link to the price list.
- Not built yet (phase 2 in the spec): spring/level progression graph, re-assessment radar chart, trainer level-ups, AI-written recaps and load suggestions, nutrition.

## Receipts (invoice + receipt after every purchase)

Built: every membership, pass and gift card purchase makes a receipt (number `RS-YYMMDD-XXXX`) with the logo and studio contact details. It is saved in the app (Profile → Purchases & receipts, plus a notification card), has a private printable link (`/r/…`, encrypted), and is sent automatically on whichever channels are set up below. Unused classes move to the new plan, and the same running monthly membership can't be bought twice.

To switch on each channel (any channel left unset is simply skipped):
- [ ] **Business details on the receipt**: fill `business.legalName` and `business.taxId` (עוסק number) in `src/config/site.ts`. Receipts show only the email; the WhatsApp number appears once `contact.whatsapp` is filled (no social handles or address).
- [ ] **Email**: in Cloudflare → Email → Email Sending, onboard `resetpilates.org` (adds DNS records), then uncomment `"send_email"` in `wrangler.jsonc`. Sends from `receipts@resetpilates.org`, replies go to the Gmail, and the Gmail gets a copy of every receipt.
- [ ] **WhatsApp** (new studio number): WhatsApp Business Cloud API. Create and get approved a template (Hebrew + English) with body parameters {{1}} first name, {{2}} receipt number, {{3}} total, {{4}} receipt link. Then add Worker secrets `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` and `WHATSAPP_RECEIPT_TEMPLATE` (the template name).
- [ ] **SMS** (only used when WhatsApp is not set up): Twilio secrets `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM`.
- [ ] Optional: a separate `RECEIPT_SECRET` for the receipt links (otherwise the Turnstile secret is used; changing it breaks old links).
- [ ] Legal: this is a purchase confirmation. The official tax invoice/receipt (חשבונית מס / קבלה) must come from the payment or accounting system (Green Invoice or the payment provider) once connected.
