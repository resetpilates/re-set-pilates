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
- [ ] **Choose the payment provider** for Bit + credit card (not chosen yet; e.g. Grow/Meshulam, PayPlus, Cardcom, Tranzila). Then add the links in `siteConfig.payments`, set `paymentsLive: true`, and call everyone on the Launch Waitlist.
- [ ] Airtable: create an automation "New Launch Waitlist row → email Orit" (same as the lead email) and a view sorted by Submitted, filtered on Contacted = off.
- **Class-price strip** (schedule, class rows, service pages): adults ₪60 a single class / from ₪50 per class with a plan; teens and soldiers ₪50 either way (`intro` in `src/config/pricing.ts`; derived from the price list).
- **Requests (private, duo, closed groups):** the `/request` page (type tiles, preferred days and times, name, phone, note) replaces the old contact-form link; it arrives as a lead whose message carries the type, days, times and package. The "Private or Duo session" card under the schedule is gone.
- **Team:** only Orit is listed; every class shows "with Orit". Add instructors in `src/config/team.ts` when they join.
- **Hero (21 Oct):** greeting, headline and two buttons only, centred; the facts line, the sub-line and the launch note were removed at the owner's request. The photo/motion stays until a new hero asset exists.
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
- Studio terms (תקנון, owner's text of 7 Nov 2026) live in `src/content` under `terms` and at `/he/terms` · `/en/terms`. Accepting them (a checkbox, no signature) is required at checkout, in the profile sign-in and on the first booking; the date is saved on the device and written to the Airtable member (*Terms accepted on*) with the checkout. Changing the text: edit both languages and bump `policies.termsVersion` in `site.ts` so everyone accepts again. Cancellation is one rule everywhere (owner, 10 Nov 2026): **24 hours** before group classes, private and duo sessions and closed groups (`policies.cancelHours`). Private events keep **5 days** (terms §8). Checkout shows a one-line summary of the key terms above the terms box. Auto-renew for monthly memberships is opt-in at checkout (unticked by default) and can be switched on or off any time on the profile; it is tagged as "· Auto-renew" at the end of the Airtable membership name. Nothing charges automatically yet: Orit renews by hand for members who have the tag. Later: add an *Auto-renew* checkbox field to Airtable Memberships and point the Worker at it. Orit to confirm the English translation; the health declaration and the privacy policy the terms mention are not built yet.
- Hidden while `paymentsLive` is off (waitlist instead). Once on: Bit and card buttons open the provider links in `siteConfig.payments`.
- After real payment, the provider must tell the app the plan is active (payment webhook → Worker → Airtable). Today Orit confirms it by hand in Airtable.
- Name, phone and email typed at checkout are not saved or sent anywhere.
- No receipt or confirmation message is sent.

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
