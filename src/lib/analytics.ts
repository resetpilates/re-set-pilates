// GA4-ready event layer. Pushes to dataLayer when present; no-op otherwise.
export type AnalyticsEvent =
  | "book_reformer_click"
  | "hero_join_click"
  | "membership_click"
  | "launch_waitlist_join" // waitlist form shown instead of checkout while payments are not live
  | "plan_kind_select" // Reformer / Mat switch on the price list
  | "package_request" // "Book your date" on a closed-group package
  | "terms_accepted" // studio terms (תקנון) ticked on the terms page
  | "service_view"
  | "schedule_view"
  | "contact_click"
  | "whatsapp_click"
  | "phone_click"
  | "language_switch"
  | "lead_form_start"
  | "request_form_submit" // request-a-session page (private, duo, groups)
  | "lead_form_submit"
  | "booking_confirmed"
  | "waitlist_join"
  | "quiz_complete"
  | "gift_card_start"
  | "shop_view"
  | "shop_notify" // "tell me when it's here" on a shop item or the teen set
  | "chat_open"
  | "chat_question"
  // Progress profile: never carries health values, only that something happened
  | "progress_view"
  | "onboarding_step"
  | "onboarding_complete"
  | "checkin_submit"
  | "milestone_earned"
  | "progress_export"
  | "recommendation_view";

export function track(event: AnalyticsEvent, params: Record<string, string | number | boolean> = {}) {
  const w = window as unknown as { dataLayer?: unknown[] };
  w.dataLayer?.push({ event, ...params });
  if (import.meta.env.DEV) console.debug("[analytics]", event, params);
}
