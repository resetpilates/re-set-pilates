# re:set pilates — Airtable plan

> **Update 20 Oct 2026:** Arbox is no longer used. Booking and payments are built in-house (site + Worker + Airtable), so read "Arbox" below as "the studio's own booking system". New tab **Launch Waitlist** (`tblPunpSdfmw6nmaq`) collects everyone who tries to buy or book before online payment opens; *Plans & Prices* gained `single` (₪50) and `teens` (₪180).

One Airtable base, **re:set pilates — Studio OS**, that records every person, plan, booking and payment the website and app touch, so it can be used for marketing, sales and record-keeping.

Arbox stays the system that actually books classes and charges members. Airtable is the studio's own record: it collects what the website captures (sign-ups, leads, quiz answers, chat questions, gift cards) and keeps a copy of what Arbox knows (members, plans, bookings, payments), so the studio can see one complete picture of each customer.

Legend for field types: **Text** (single line), **Long text**, **Email**, **Phone**, **Date**, **Date & time**, **Number**, **Currency (₪)**, **Checkbox**, **Single select**, **Multi select**, **Link** (to another tab), **Lookup / Rollup / Count** (calculated from a linked tab), **Formula**, **Attachment**, **Created time**, **Last modified**.

---

## The tabs at a glance

| # | Tab | One row is… | Filled by |
|---|---|---|---|
| 1 | **Members** | one person (lead, trial, member, past member) | site sign-up, checkout, lead form, Arbox |
| 2 | **Memberships** | one plan a member bought (monthly or pass) | checkout, Arbox |
| 3 | **Plans & Prices** | one product the studio sells | studio (matches the website's price list) |
| 4 | **Classes** | one scheduled class (date + time + type) | Arbox schedule |
| 5 | **Bookings** | one member in one class | app booking, Arbox |
| 6 | **Waitlist** | one member waiting for one full class | app |
| 7 | **Payments** | one payment or refund | Arbox / Bit / card provider |
| 8 | **Leads & Inquiries** | one enquiry (form, chat, WhatsApp, call, walk-in) | website, chat, studio |
| 9 | **Health & Consent** | one signed health declaration / waiver | sign-up form (restricted access) |
| 10 | **Gift Cards** | one gift card sold | gift card checkout |
| 11 | **Instructors** | one teacher | studio |
| 12 | **Reviews & Feedback** | one review or feedback note | Google, email, after-class survey |
| 13 | **Campaigns** | one marketing campaign or promotion | studio |
| 14 | **Touchpoints** | one message or call with a person | studio, automations |
| 15 | **Quiz Answers** | one "Find your class" result | website quiz |
| 16 | **Chat Questions** | one question asked to "Ask Orit" | website chat |

Tabs 1–8 are what you need on opening day. 9–16 make marketing and follow-up much stronger and can be added in the first month.

---

## 1. Members — the heart of the base

One row per person, from the first enquiry onward. Everything else links back here.

**Identity and contact**

| Field | Type | Notes |
|---|---|---|
| Full name | Text (primary field) | |
| First name | Text | used in messages ("Hi Maya") |
| Last name | Text | |
| Phone | Phone | main contact; WhatsApp usually the same number |
| WhatsApp number | Phone | only if different from phone |
| Email | Email | |
| Preferred contact | Single select | WhatsApp / Phone call / SMS / Email |
| Preferred language | Single select | Hebrew / English |
| City | Single select | Hod Hasharon, Ra'anana, Kfar Saba, Herzliya, Ramat Hasharon, Other |
| Date of birth | Date | optional; birthday offers |
| Age group | Formula | from date of birth: 18–29 / 30–39 / 40–49 / 50–59 / 60+ |
| Emergency contact name | Text | |
| Emergency contact phone | Phone | |
| Arbox member ID | Text | the link to the same person in Arbox |

**Status and lifecycle**

| Field | Type | Notes |
|---|---|---|
| Status | Single select | Lead / Trial booked / Active member / Pass holder / Paused / Lapsed / Lost |
| Lifecycle stage | Single select | New enquiry → Contacted → First class booked → First class done → Bought plan → Regular → Lapsed |
| Source | Single select | Instagram / TikTok / Facebook / Google / Google Maps / Website / Referral / Walk-in / WhatsApp / Event / Gift card / Other |
| Source detail | Text | campaign name, referrer's name, post, etc. |
| Referred by | Link → Members | for referral rewards |
| Signed up on | Date | first time they appeared |
| Photo | Attachment | optional photo the member added to their membership card in the app (one image; the app replaces or clears it). For recognising people in class; never shown on the public schedule |
| First class date | Rollup (Bookings) | earliest attended booking |
| Last class date | Rollup (Bookings) | latest attended booking |
| Days since last class | Formula | drives "we miss you" follow-ups |
| Member since | Date | first paid plan |

**Membership snapshot (calculated)**

| Field | Type | Notes |
|---|---|---|
| Memberships | Link → Memberships | all plans ever bought |
| Current plan | Lookup | name of the active plan |
| Plan renews / expires | Lookup | date |
| Classes left (pass) | Lookup | from the active pass |
| Classes this week / weekly cap | Lookup + Rollup | to spot members at their limit |
| Total classes attended | Count (Bookings, attended) | |
| No-shows | Count (Bookings, no-show) | |
| Late cancellations | Count (Bookings, late cancel) | |
| Lifetime spend | Rollup (Payments) | sum of paid amounts |

**Preferences (from sign-up, quiz and booking history)**

| Field | Type | Notes |
|---|---|---|
| Interests | Multi select | Reformer / Mat / Private 1:1 / Duo / Women-only |
| Goals | Multi select | Strength / Posture / Mobility / Calm / Return after injury / After birth / Fitness for sport |
| Experience level | Single select | New to Pilates / Some classes / Regular |
| Preferred times | Multi select | Early morning / Morning / Midday / Evening |
| Preferred days | Multi select | Sun / Mon / Tue / Wed / Thu / Fri |
| Favourite instructor | Link → Instructors | |
| Preferred bed | Single select | 1–5 / No preference |
| Women-only interest | Checkbox | |

**Consent and marketing (required before sending promotions)**

| Field | Type | Notes |
|---|---|---|
| Marketing consent | Checkbox | explicit opt-in to promotions |
| Consent date | Date | when they agreed |
| Consent source | Single select | Website form / Checkout / Paper form / WhatsApp |
| Channels allowed | Multi select | WhatsApp / SMS / Email |
| Unsubscribed | Checkbox | never message if ticked |
| Health declaration on file | Lookup (Health & Consent) | Yes / No / Expired |
| Waiver signed | Lookup (Health & Consent) | |

**Notes and tags**

| Field | Type | Notes |
|---|---|---|
| Tags | Multi select | VIP / Ambassador / Teen / Mother–daughter / Corporate / Influencer |
| Staff notes | Long text | non-medical notes only |
| Owner | Collaborator | who follows up with this person |
| Next follow-up | Date | |
| Created / Last updated | Created time / Last modified | |

Do not store medical details in Members. They go in **Health & Consent**, which only Orit can see.

---

## 2. Memberships — one row per plan purchased

| Field | Type | Notes |
|---|---|---|
| Membership ID | Formula (primary) | e.g. "Maya Levi · 3× week · Nov 2026" |
| Member | Link → Members | |
| Plan | Link → Plans & Prices | |
| Type | Lookup | Monthly / Pass |
| Status | Single select | Active / Paused / Expired / Cancelled / Used up |
| Start date | Date | |
| Renews / expires | Date | monthly: 1 month; pass: 2 months |
| Auto-renew | Checkbox | |
| Weekly cap | Lookup | from plan (1, 2, 3, 4, unlimited) |
| Sessions included | Lookup | passes: 5, 10, 15 |
| Bonus sessions | Number | launch +1 |
| Sessions used | Count (Bookings) | |
| Sessions left | Formula | included + bonus − used |
| Price paid | Currency (₪) | |
| Launch price applied | Checkbox | |
| Discount / coupon | Text | |
| Payments | Link → Payments | |
| Paid in full | Formula | price paid vs payments |
| Sold by | Single select | Website / Studio / Arbox / WhatsApp |
| Gift card used | Link → Gift Cards | |
| Freeze start / end | Date | pauses for travel, illness |
| Cancellation reason | Single select | Price / Schedule / Moved / Injury / Pregnancy / Not satisfied / Other |
| Renewal reminder sent | Checkbox | |
| Arbox membership ID | Text | |

## 3. Plans & Prices — the product catalogue

Matches the website's price list (`src/config/pricing.ts`).

| Field | Type | Notes |
|---|---|---|
| Plan name | Text (primary) | 1× week, 2× week, 3× week, 4× week, Unlimited, 5 / 10 / 15 sessions, Private 1:1, Duo, Gift card |
| Name (Hebrew) | Text | |
| Type | Single select | Monthly / Pass / Private / Duo / Gift card |
| Weekly cap | Number | blank = unlimited |
| Sessions included | Number | passes |
| Validity (months) | Number | 1 for monthly, 2 for passes |
| Regular price | Currency (₪) | |
| Launch price | Currency (₪) | |
| Launch bonus sessions | Number | |
| Active on website | Checkbox | |
| Popular badge | Checkbox | |
| Arbox product link | URL | |
| Payment link (Bit / card) | URL | |
| Memberships sold | Count | |
| Revenue | Rollup | |

## 4. Classes — one row per scheduled class

| Field | Type | Notes |
|---|---|---|
| Class | Formula (primary) | "Reformer · Sun 4 Oct · 18:00" |
| Class type | Single select | Reformer small group / Mat / Private 1:1 / Duo / Women-only / Event |
| Date & time | Date & time | |
| Length (min) | Number | 50 |
| Instructor | Link → Instructors | |
| Capacity | Number | 5 for Reformer |
| Bookings | Link → Bookings | |
| Booked | Count | |
| Spots left | Formula | capacity − booked |
| Attended | Count | |
| Waitlist | Link → Waitlist | |
| Status | Single select | Scheduled / Full / Cancelled / Completed |
| Arbox class ID | Text | |

## 5. Bookings — one row per member per class

| Field | Type | Notes |
|---|---|---|
| Booking | Formula (primary) | "Maya Levi · Reformer · 4 Oct 18:00" |
| Member | Link → Members | |
| Class | Link → Classes | |
| Membership used | Link → Memberships | which plan the class came off |
| Bed | Single select | 1–5 / Any |
| Booked on | Created time | |
| Booked via | Single select | App / Website / Arbox / Studio / WhatsApp |
| Status | Single select | Booked / Attended / Cancelled on time / Late cancel / No-show / Waitlist promoted |
| Cancelled on | Date & time | |
| Hours before class | Formula | for the 24-hour rule |
| Counts against plan | Formula | yes unless cancelled 24h+ before |
| Reminder sent | Checkbox | |
| Added to calendar | Checkbox | |
| First class for member | Formula / Checkbox | triggers welcome follow-up |
| After-class feedback | Link → Reviews & Feedback | |

## 6. Waitlist

| Field | Type | Notes |
|---|---|---|
| Entry | Formula (primary) | |
| Member | Link → Members | |
| Class | Link → Classes | |
| Joined on | Created time | |
| Position | Number | |
| Status | Single select | Waiting / Offered / Booked / Expired / Left |
| Notified on | Date & time | |

## 7. Payments

| Field | Type | Notes |
|---|---|---|
| Payment | Formula (primary) | |
| Member | Link → Members | |
| For | Single select | Membership / Pass / Private / Duo / Gift card / Late-cancel fee / Retail |
| Membership | Link → Memberships | |
| Gift card | Link → Gift Cards | |
| Amount | Currency (₪) | negative for refunds |
| Method | Single select | Arbox / Bit / Credit card / Cash / Bank transfer / Gift card |
| Status | Single select | Paid / Pending / Failed / Refunded |
| Paid on | Date & time | |
| Invoice / receipt no. | Text | |
| Invoice file | Attachment | |
| Provider reference | Text | Arbox / Bit / card transaction ID |

## 8. Leads & Inquiries — everyone who reached out

| Field | Type | Notes |
|---|---|---|
| Inquiry | Formula (primary) | |
| Member | Link → Members | created or matched by phone |
| Name / Phone / Email | Text / Phone / Email | as typed |
| Channel | Single select | Website form / Ask Orit chat / WhatsApp / Phone / Instagram DM / Walk-in / Email |
| Interested in | Multi select | Reformer / Mat / Private / Duo / Women-only / Gift card / Event |
| Message | Long text | |
| Preferred time | Text | |
| Page / source | Text | which page or campaign it came from |
| Status | Single select | New / Contacted / Booked first class / Converted / Not interested / No answer |
| Owner | Collaborator | |
| First response at | Date & time | |
| Response time (hrs) | Formula | how fast the studio answered |
| Converted to member | Checkbox | |
| Received on | Created time | |

## 9. Health & Consent — restricted, Orit only

| Field | Type | Notes |
|---|---|---|
| Record | Formula (primary) | |
| Member | Link → Members | |
| Health declaration signed | Checkbox | |
| Signed on | Date | |
| Valid until | Date | renew yearly |
| Form file | Attachment | signed PDF |
| Injuries / conditions | Long text | only what the member chooses to share |
| Pregnant / postnatal | Single select | No / Pregnant / Postnatal |
| Weeks pregnant / weeks since birth | Number | |
| Doctor approval on file | Checkbox | |
| Approval file | Attachment | |
| Instructor notes | Long text | adjustments to make in class |
| Terms & cancellation policy accepted | Checkbox | |
| Photo / video consent | Checkbox | for social media |

Health information is sensitive personal data: share this tab with Orit only, never export it into marketing lists, and delete records you no longer need. Have a lawyer confirm the studio's health-declaration wording and retention period under Israeli law.

## 10. Gift Cards

| Field | Type | Notes |
|---|---|---|
| Code | Text (primary) | unique, printed on the card |
| Buyer | Link → Members | |
| Recipient name / phone / email | Text / Phone / Email | |
| Message | Long text | the personal note |
| Gift | Link → Plans & Prices | or a custom amount |
| Value | Currency (₪) | |
| Payment | Link → Payments | |
| Sent on / via | Date / Single select | WhatsApp / Email / Printed |
| Status | Single select | Active / Partly used / Redeemed / Expired |
| Redeemed by | Link → Members | becomes a new member |
| Expires on | Date | |

## 11. Instructors

| Field | Type | Notes |
|---|---|---|
| Name / Name (Hebrew) | Text | |
| Role | Single select | Founder / Instructor / Guest |
| Phone / Email | Phone / Email | |
| Bio (HE / EN) | Long text | what the website shows |
| Portrait | Attachment | |
| Certifications | Long text + Attachment | |
| Classes | Link → Classes | |
| Classes taught this month | Rollup | |
| Average rating | Rollup (Reviews) | |
| Status | Single select | Active / On leave / Left |

## 12. Reviews & Feedback

| Field | Type | Notes |
|---|---|---|
| Member | Link → Members | |
| Source | Single select | Google / After-class survey / Email / WhatsApp / Instagram |
| Rating | Rating (1–5) | |
| Text | Long text | |
| Class / Instructor | Link | |
| Received on | Date | |
| Permission to publish | Checkbox | needed before it goes on the website |
| Published on website | Checkbox | |
| Response sent | Checkbox | |
| Follow-up needed | Checkbox | low scores get a personal call |

## 13. Campaigns

| Field | Type | Notes |
|---|---|---|
| Campaign | Text (primary) | "Launch month", "Bring a friend", "Mother's Day gift card" |
| Channel | Multi select | Instagram / TikTok / Facebook / Google / WhatsApp broadcast / Email / Flyers |
| Start / End | Date | |
| Offer | Text | |
| Budget | Currency (₪) | |
| UTM / tracking code | Text | matches website links |
| Leads | Link → Leads & Inquiries | |
| Members won | Count | |
| Revenue | Rollup | |
| Cost per member | Formula | budget ÷ members won |

## 14. Touchpoints — every message or call

| Field | Type | Notes |
|---|---|---|
| Member | Link → Members | |
| Date & time | Date & time | |
| Type | Single select | WhatsApp / Call / SMS / Email / In person |
| Direction | Single select | Inbound / Outbound |
| Purpose | Single select | Welcome / First-class follow-up / Renewal reminder / Win-back / Birthday / Review request / Payment issue / Other |
| Summary | Long text | |
| By | Collaborator | |
| Campaign | Link → Campaigns | |

## 15. Quiz Answers — "Find your class"

| Field | Type | Notes |
|---|---|---|
| Member / Lead | Link | if they left details |
| Goal | Single select | Strength / Calm & mobility / Gentle return / Together |
| Experience | Single select | None / Some / Regular |
| Prefers | Single select | Small group / One-to-one / With a friend |
| Recommended | Single select | Reformer / Mat / Private / Duo |
| Booked after quiz | Checkbox | |
| Taken on | Created time | |

## 16. Chat Questions — "Ask Orit"

| Field | Type | Notes |
|---|---|---|
| Question | Long text | |
| Language | Single select | Hebrew / English |
| Answered automatically | Checkbox | |
| Topic | Single select | Booking / Price / Payment / Cancel / Health / Pregnancy / Location / Other |
| Handed to Orit | Checkbox | |
| Asked on | Created time | |
| Add to FAQ | Checkbox | unanswered questions become new chat answers |

---

## Views to set up on day one

**Members**
- Active members, by plan
- New leads this week (not yet contacted)
- First class done, no plan bought (sales follow-up)
- Lapsed: no class in 21+ days (win-back list)
- Renewing in the next 7 days
- Pass holders with 2 or fewer classes left
- Birthdays this month
- Marketing list: consent ticked, not unsubscribed

**Bookings / Classes**
- Today's classes with names and beds (front-desk sheet)
- No-shows and late cancels this month
- Classes under 3 bookings in the next 48 hours (fill with a WhatsApp nudge)

**Sales**
- Revenue this month by plan
- Leads by source and conversion rate
- Gift cards not yet redeemed

---

## Automations worth adding

1. **New lead → WhatsApp/email to Orit** with the person's details.
2. **First class booked → welcome message** with address, parking, what to bring.
3. **First class attended → follow-up next day** with a plan offer.
4. **Plan renews in 3 days → reminder** to the member.
5. **Pass at 2 classes left → reminder** to buy the next one.
6. **No class in 21 days → win-back message.**
7. **After 5th class → Google review request.**
8. **Health declaration expires in 30 days → renewal request.**
9. **Waitlist spot opens → notify the first person in line.**

---

## How the website will send data to Airtable

The Airtable token must never be put inside the website code: anyone can read a website's code in their browser and would get full access to the base. The safe setup is a small private relay (a Cloudflare Worker on the same Cloudflare account as the site) that holds the token as a secret and accepts only these website events:

| Website event | Writes to |
|---|---|
| Lead / call-me-back form | Leads & Inquiries (+ Members, matched by phone) |
| Checkout completed | Members, Memberships, Payments |
| Booking confirmed / cancelled | Bookings |
| Joined waitlist | Waitlist |
| Gift card bought | Gift Cards, Payments |
| Quiz finished | Quiz Answers |
| Chat question not answered | Chat Questions |

Arbox data (members, plans, classes, payments) is copied in on a schedule once the Arbox API access is set up, matched by Arbox ID or phone number.

---

## What's needed to build it

1. **A token that can create the base.** The token shared can't see any bases or workspaces yet. Create a new one at airtable.com/create/tokens with scopes `data.records:read`, `data.records:write`, `schema.bases:read`, `schema.bases:write`, and access to the re:set workspace.
2. **Replace the shared token.** It was pasted into a chat, so regenerate it and delete the old one.
3. Decide who besides Orit gets access, and keep **Health & Consent** to Orit only.

---

## Website ↔ Airtable sync decisions (owner, 9–10 Oct 2026)

**Accounts and sign-in**
- Visitors give first name, last name and phone on their first booking; the app remembers them after that.
- Sign-in options: WhatsApp code (WhatsApp Business account on the studio's new number; Meta charges a small fee per code), Google, and email magic link.
- After buying a plan, the customer is invited to build a full profile (the AI trainer onboarding). They can skip it and finish later.

**Consent**
- Unticked "Send me news and offers" box on the lead form and at checkout → Members: Marketing consent, Consent date, Consent source.
- Required tickbox at checkout: terms + 24-hour cancellation policy → Health & Consent: Terms & cancellation policy accepted, with date.
- Waiver / health declaration: online form, opened from the profile or by scanning a QR code at the studio. Saved in Health & Consent (wording to be approved by a lawyer).

**Health data**
- AI trainer check-ins (pain, energy, soreness, pregnancy) go to a new **Trainer Check-ins** tab that only Orit can see, next to Health & Consent. Never in Members or marketing views.

**Forms**
- Lead form: first name, last name, phone, email (optional), interest, preferred time (morning / midday / evening), "How did you hear about us?", marketing opt-in.
- "How did you hear about us?" is also asked once at checkout. Campaign links (`utm_` tags) are read automatically and saved as Source detail.
- Gift cards: the buyer gives their own name, phone and email and receives the card (image + code) to forward or print. Recipient name and note stay on the card.
- Quiz: the result shows first, then an optional "Leave your number and Orit will send you a plan". Answers are saved whether or not they leave details.
- Ask Orit chat: every question is saved to Chat Questions with topic, language and whether it was answered. Question text is no longer sent to analytics.

**Payments and alerts**
- Purchases are saved as **Pending**. Orit marks them Paid by hand until the Arbox sync does it automatically.
- New lead / booking / purchase / gift card: saved in Airtable, plus an email to resetpilates11@gmail.com and a WhatsApp message to Orit.

**Matching details for the relay**
- Plans & Prices gets a **Website ID** field (m1x, m2x, m3x, m4x, munl, p5, p10, p15) so checkout can link the right plan.
- Bed numbers: the site counts 0–4, Airtable 1–5 (relay adds 1).
- Payment method "card" → "Credit card".
- Chat topics: the site's 26 answer topics are grouped into the 8 Airtable topics.

**Relay setup**
- Claude writes the Cloudflare Worker in the repo; the owner deploys it from the Cloudflare dashboard and pastes a fresh Airtable key as a secret there.

### Applied to the live base (10 Oct 2026)

Checked: all 16 tabs present; the 11 rows in Plans & Prices match `src/config/pricing.ts` (prices, launch prices, bonus sessions, popular badges); quiz, payment, bed and booking-status options cover every value the site produces.

Added:
- Plans & Prices → **Website ID** (filled: m1x, m2x, m3x, m4x, munl, p5, p10, p15, private, duo, gift)
- Members → **Signs in with** (WhatsApp code / Google / Email link), **Trainer profile completed**
- Leads & Inquiries → **How did you hear**, **Marketing consent**
- Health & Consent → **Terms accepted on**, **Signed via** (Profile / Studio QR code / Paper), **Signature (typed name)**
- Chat Questions → **Answer used** (the site's chat answer id)
- Classes → **Website class ID** (e.g. reformer_2026-10-12_1800)
- New tab **Trainer Check-ins** (Orit only): Member, Booking, Date, Energy 1–5, Soreness 0–10, Pain 0–10, Pain locations, Member notes, Safety review, Review reason, Orit's resolution

Relay value mapping: quiz `strength/calm/care/together` → Strength / Calm & mobility / Gentle return / Together; `none/some/regular` → None / Some / Regular; `group/solo/pair` → Small group / One-to-one / With a friend; payment `card` → Credit card; bed index +1; booked via App; purchases → Payments status Pending.

### Test run with sample data (10 Oct 2026)

One linked sample customer ("SAMPLE Maya Levi") was added to every tab, plus a sample instructor, campaign and two classes. All records start with "SAMPLE" and can be deleted.

Fixed after the test:
- Lifetime spend and "Paid in full" counted pending payments → new Payments "Confirmed amount"; Members "Lifetime spend (paid)"; Memberships "Paid (confirmed)" (old rollups renamed "All payments (incl. pending)").
- 24-hour rule used a date-only class time → Classes "Start (unix)", Bookings "Class start (unix)"; "Hours notice when cancelled" is now exact (tested: 23 h → late cancel).
- Cancelled bookings still took a spot → Bookings "Holds a spot (1/0)", Classes "Spots taken"; "Spots left" uses it ("Booked" renamed "All bookings (incl. cancelled)").
- "Days since last class" counted future bookings and was off by one → uses new "Last attended class", in Israel time ("Last class date" renamed "Latest booking date").
- Number formulas returned text (broke "more than 21 days" style filters) → Spots left, Sessions left, Hours notice, Cost per lead, Response time now return numbers.

Still open: Memberships "Days to renewal" returns text (change `""` to `BLANK()` in its formula); delete the Bookings field "UNUSED - safe to delete".
