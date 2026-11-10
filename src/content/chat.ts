// Scripted studio assistant. Answers are built from the same config the site uses, so prices,
// address and policies never drift. Swap `answer()` for an AI call later without touching the UI.
import { MAT_OFF_PER_CLASS, planClasses, pricing, singleClass, teenSingleClass, teensPlan } from "../config/pricing";
import { packageById } from "../config/packages";
import { isTodo, mapsLink, siteConfig } from "../config/site";
import { founder, instructors } from "../config/team";
import type { Lang } from "../config/site";

export interface ChatAction {
  label: string;
  to?: string; // internal path (without /he|/en)
  href?: string; // external link
}
export interface ChatReply {
  text: string;
  actions?: ChatAction[];
  handoff?: boolean; // offer WhatsApp to the studio
  intent?: string; // id of the scripted answer used; empty when handed to the studio
}
interface Intent {
  id: string;
  keys: string[]; // lowercase fragments, Hebrew and English
  reply: (he: boolean) => ChatReply;
}

const c = siteConfig.contact;
const maps = mapsLink();
const launch = siteConfig.flags.launchPricing;
const price = (p: (typeof pricing.memberships)[number]) => (launch && p.launchPrice ? p.launchPrice : p.price);
const H = siteConfig.policies.cancelHours;
const group = packageById("group")!;
const event = packageById("event")!;

const monthly = (he: boolean) =>
  pricing.memberships
    .filter((p) => !p.track)
    .map((p) => `${p.perWeek === "unlimited" ? (he ? "ללא הגבלה" : "Unlimited") : he ? `${p.perWeek} בשבוע` : `${p.perWeek}× a week`}: ₪${price(p)}`)
    .join("\n");
const passes = (he: boolean) =>
  pricing.passes
    .filter((p) => (p.sessions ?? 0) > 1)
    .map((p) => `${p.sessions} ${he ? "כניסות" : "sessions"}: ₪${p.price}${launch && p.bonusSessions ? (he ? ` (+1 במתנה בחודש ההשקה = ${planClasses(p)} שיעורים)` : ` (+1 free in the launch month = ${planClasses(p)} classes)`) : ""}`)
    .join("\n");

const book = (he: boolean): ChatAction => ({ label: he ? "ללוח השיעורים" : "Open the schedule", to: "schedule" });
const prices = (he: boolean): ChatAction => ({ label: he ? "למחירים" : "See pricing", to: "pricing" });

export const intents: Intent[] = [
  {
    id: "hello",
    keys: ["hello", "hi ", "hey", "shalom", "שלום", "היי", "הי ", "בוקר טוב", "ערב טוב"],
    reply: (he) => ({
      text: he
        ? "היי! אני כאן לכל שאלה על השיעורים, המחירים, השריון או הסטודיו. במה אפשר לעזור?"
        : "Hi! Ask me anything about classes, prices, booking or the studio. How can I help?",
    }),
  },
  {
    id: "book",
    keys: ["book", "reserve", "sign up", "spot", "register", "join a class", "לשריין", "שריון", "להירשם", "הרשמה", "מקום", "לקבוע שיעור"],
    reply: (he) => ({
      text: he
        ? "שריון לוקח פחות מדקה: בוחרים רפורמר או מזרן, יום ושעה, מיטה אם רוצים, ומאשרים. אם אין לך עדיין מנוי או כרטיסייה, בוחרים אחד בשלב התשלום."
        : "Booking takes under a minute: pick Reformer or Mat, a day and time, a bed if you like, and confirm. If you don't have a plan yet, you choose one at checkout.",
      actions: [book(he)],
    }),
  },
  {
    id: "times",
    keys: ["when", "what time", "time", "times", "start", "schedule", "morning", "evening", "today", "tomorrow", "weekend", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "מתי", "באיזו שעה", "שעה", "שעות שיעור", "מתחיל", "לוח", "בוקר", "ערב", "היום", "מחר", "ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "סופש"],
    reply: (he) => ({
      text: he
        ? "יש שיעורי בוקר וערב ברוב ימי השבוע. השעות המדויקות והמקומות הפנויים מופיעים בלוח השיעורים, ומתעדכנים כל הזמן."
        : "There are morning and evening classes most days of the week. The exact times and open spots are always up to date in the schedule.",
      actions: [book(he)],
    }),
  },
  {
    id: "hours",
    keys: ["hours", "open", "opening", "closed", "שעות פעילות", "פתוח", "פתוחים", "סגור"],
    reply: (he) => ({
      text: isTodo(c.hours)
        ? he
          ? "הסטודיו פתוח לפי לוח השיעורים, בבוקר ובערב. כדאי להציץ בלוח לשעות של כל יום."
          : "The studio is open around the class schedule, mornings and evenings. Check the schedule for each day's times."
        : c.hours,
      actions: [book(he)],
    }),
  },
  {
    id: "types",
    keys: ["type", "kind", "what classes", "which classes", "reformer", "mat ", "difference", "what do you offer", "offer", "סוג", "סוגי", "אילו שיעורים", "איזה שיעורים", "רפורמר", "מזרן", "מכשירים", "ההבדל", "מה יש"],
    reply: (he) => ({
      text: he
        ? "יש לנו:\n• רפורמר בקבוצות של עד 5 (50 דק׳)\n• פילאטיס מזרן בקבוצה קטנה\n• אימון פרטי 1:1\n• אימון זוגי\n• פילאטיס לנערות 12–17\n• קבוצות סגורות ואירועים: סוגרים את הסטודיו בשבילכן\n• קבוצת נשים בלבד, בתיאום\nרפורמר הוא מיטה עם קפיצים שמוסיפים התנגדות או תמיכה, ומזרן מתמקד בליבה ובגמישות. פילאטיס מזרן זול ב־₪5 לשיעור מרפורמר."
        : "We offer:\n• Reformer in groups of up to 5 (50 min)\n• Mat Pilates in a small group\n• Private 1:1\n• Duo training\n• Teen Pilates (girls 12–17)\n• Closed groups & events: the studio is yours\n• Women-only groups, by request\nThe Reformer uses springs for resistance or support; Mat focuses on core and mobility. Mat Pilates is ₪5 a class less than Reformer.",
      actions: [{ label: he ? "לכל השירותים" : "All services", to: "services" }, book(he)],
    }),
  },
  {
    id: "private",
    keys: ["private", "1:1", "one on one", "personal", "duo", "couple", "partner", "friend", "פרטי", "אישי", "זוגי", "חברה", "בת זוג"],
    reply: (he) => ({
      text: he
        ? "אימון פרטי (1:1) ואימון זוגי מתואמים מראש, 50 דקות, ונבנים סביבך. השאירי פרטים או שלחי הודעה ונמצא שעה שמתאימה."
        : "Private (1:1) and duo sessions are booked by appointment, 50 minutes, built around you. Leave your details or message us and we'll find a time.",
      actions: [{ label: he ? "לתיאום" : "Request a session", to: "contact?interest=private" }],
      handoff: true,
    }),
  },
  {
    id: "teens",
    keys: ["teen", "teens", "girl", "daughter", "12", "13", "14", "15", "16", "17", "נערות", "נערה", "ילדה", "בת שלי", "הבת", "לנוער"],
    reply: (he) => ({
      text: he
        ? `פילאטיס לנערות בגילאי 12–17: קבוצה קבועה של עד 5 נערות, 50 דקות. ${teensPlan?.price ?? ""} ₪ לחודש (4 אימונים), שיעור בודד ${teenSingleClass.price} ₪. חיזוק הגוף, יציבה נכונה, גמישות וביטחון עצמי.`
        : `Teen Pilates for girls aged 12–17: a fixed group of up to 5, 50 minutes. ₪${teensPlan?.price ?? ""} a month (4 sessions), ₪${teenSingleClass.price} for a single class. Strength, posture, mobility and confidence.`,
      actions: [{ label: he ? "לפרטים ולהרשמה" : "Details & sign up", to: "services/teens" }],
    }),
  },
  {
    id: "groups",
    keys: ["event", "party", "birthday", "bachelorette", "hen", "team", "group", "close the studio", "אירוע", "מסיבה", "יום הולדת", "רווקות", "צוות", "גיבוש", "קבוצה סגורה", "קבוצה פרטית", "לסגור את הסטודיו"],
    reply: (he) => ({
      text: he
        ? `סוגרים את הסטודיו רק בשבילכן, עד ${group.capacity} משתתפות:\n• קבוצה פרטית: אימון מכשירים של ${group.minutes} דק׳, ${group.price} ₪ לקבוצה\n• חבילת אירוע: ${event.minutes} דק׳ עם זמן חופשי, מתיחות, 50 דק׳ פילאטיס מכשירים וכיבוד מפנק, ${event.price} ₪ לקבוצה\nבתיאום מראש. שלחי לנו את התאריך ונשריין.`
        : `We close the studio just for you, up to ${group.capacity} people:\n• Private group: a ${group.minutes}-min equipment session, ₪${group.price} per group\n• Event package: ${event.minutes} min with free time, stretching, 50 min of equipment Pilates and light refreshments, ₪${event.price} per group\nBy appointment. Send us your date and we'll hold it.`,
      actions: [{ label: he ? "לחבילות" : "See the packages", to: "services/closed-groups" }, { label: he ? "לשריין תאריך" : "Book a date", to: "contact?interest=groups" }],
      handoff: true,
    }),
  },
  {
    id: "women",
    keys: ["women only", "women-only", "ladies", "religious", "modest", "נשים בלבד", "נשים", "דתיות", "צנוע", "פרטיות"],
    reply: (he) => ({
      text: he
        ? "יש מתכונת לנשים בלבד, באווירה פרטית ונעימה, לנשים דתיות ולא דתיות. היא מתואמת לפי ביקוש, אז שלחי לנו הודעה ונעדכן."
        : "We run a women-only format in a private, comfortable setting, for religious and non-religious women alike. It's arranged by demand, so message us and we'll let you know.",
      handoff: true,
    }),
  },
  {
    id: "beginner",
    keys: ["beginner", "never", "first time", "new to", "experience", "level", "first class", "מתחילה", "פעם ראשונה", "שיעור ראשון", "ניסיון", "רמה", "אף פעם"],
    reply: (he) => ({
      text: he
        ? "בטח! לא צריך ניסיון. עם 5 מתאמנות בלבד המדריכה מכירה לך את הרפורמר ומתאימה כל תרגיל."
        : "Absolutely, no experience needed. With only 5 people in the room, your instructor walks you through the Reformer and adapts every exercise.",
      actions: [book(he)],
    }),
  },
  {
    id: "wear",
    keys: ["wear", "bring", "clothes", "socks", "grip", "water", "towel", "shoes", "ללבוש", "להביא", "בגדים", "גרביים", "מים", "מגבת", "נעליים"],
    reply: (he) => ({
      text: he
        ? "בגדים נוחים וצמודים ובקבוק מים. מתאמנים בלי נעליים. כל הציוד מחכה בסטודיו."
        : "Comfortable, fitted clothes and a water bottle. We train without shoes. All the equipment is at the studio.",
    }),
  },
  {
    id: "length",
    keys: ["how long", "length", "duration", "minutes", "how many people", "group size", "capacity", "כמה זמן", "משך", "דקות", "כמה משתתפות", "כמה אנשים", "גודל"],
    reply: (he) => ({
      text: he
        ? "כל שיעור נמשך 50 דקות. בשיעורי רפורמר יש עד 5 משתתפות, מיטה לכל אחת."
        : "Every class is 50 minutes. Reformer classes have a maximum of 5 people, one bed each.",
    }),
  },
  {
    id: "price",
    keys: ["price", "cost", "how much", "membership", "pass", "package", "monthly", "card", "punch", "מחיר", "עלות", "כמה עולה", "מנוי", "כרטיסייה", "חבילה", "חודשי"],
    reply: (he) => ({
      text: he
        ? `שיעור בודד: ₪${singleClass.price}\n\nמנוי חודשי (בתוקף לחודש)${launch ? ", מחירי השקה" : ""}:\n${monthly(he)}\n\nכרטיסיות (בתוקף חודשיים):\n${passes(he)}\n\nהמחירים לרפורמר; מזרן זול ב־₪${MAT_OFF_PER_CLASS} לשיעור. נערות: ${teensPlan?.price ?? ""} ₪ לחודש.${launch ? "\nמחירי ההשקה תקפים לרכישות במהלך חודש ההשקה בלבד." : ""}`
        : `Single class: ₪${singleClass.price}\n\nMonthly (valid one month)${launch ? ", launch prices" : ""}:\n${monthly(he)}\n\nPasses (valid 2 months):\n${passes(he)}\n\nReformer prices; Mat is ₪${MAT_OFF_PER_CLASS} a class less. Teens: ₪${teensPlan?.price ?? ""} a month.${launch ? "\nLaunch prices are for purchases during the launch month only." : ""}`,
      actions: [prices(he)],
    }),
  },
  {
    id: "payment",
    keys: ["pay", "payment", "bit", "credit", "visa", "cash", "installments", "תשלום", "לשלם", "ביט", "אשראי", "מזומן", "תשלומים", "ארבוקס"],
    reply: (he) => ({
      text: he
        ? siteConfig.flags.paymentsLive
          ? "אפשר לשלם ב־bit או בכרטיס אשראי, בשלב האחרון של הרכישה. השיעורים עצמם יורדים מהמנוי או מהכרטיסייה, בלי חיוב נוסף."
          : "התשלום באתר (bit או אשראי) ייפתח בקרוב. בינתיים אפשר להצטרף לרשימת ההמתנה בשלב הרכישה, והסטודיו יתקשר לשריין מקום."
        : siteConfig.flags.paymentsLive
          ? "You can pay with Bit or by credit card at the last step of checkout. Classes are then taken from your membership or pass, with no extra charge."
          : "Online payment (Bit or card) opens soon. Until then you can join the waitlist at the purchase step, and the studio will call you to save your spot.",
      actions: [prices(he)],
    }),
  },
  {
    id: "cancel",
    keys: ["cancel", "reschedule", "change", "late", "can't make", "no show", "refund", "לבטל", "ביטול", "בטל", "מבטלת", "מבטלים", "להזיז", "לשנות", "איחור", "לא אגיע", "החזר"],
    reply: (he) => ({
      text: he
        ? `ביטול עד ${H} שעות לפני השיעור מחזיר את הכניסה למנוי או לכרטיסייה. ביטול מאוחר יותר או אי־הגעה נחשבים ככניסה. מבטלים בלחיצה במסך ״השיעורים שלי״.`
        : `Cancel at least ${H} hours before class and the session goes back to your plan. Later cancellations and no-shows count as used. You can cancel in one tap from My classes.`,
      actions: [{ label: he ? "לשיעורים שלי" : "My classes", to: "my" }],
    }),
  },
  {
    id: "waitlist",
    keys: ["full", "waitlist", "wait list", "no spots", "מלא", "רשימת המתנה", "אין מקום"],
    reply: (he) => ({
      text: he
        ? "אם שיעור מלא, אפשר להצטרף לרשימת ההמתנה מתוך עמוד השיעור, ונעדכן אותך ברגע שמתפנה מיטה."
        : "If a class is full, join the waitlist from the class page and we'll let you know the moment a bed opens.",
      actions: [book(he)],
    }),
  },
  {
    id: "where",
    keys: ["where", "address", "location", "map", "directions", "waze", "find you", "איפה", "כתובת", "מיקום", "מפה", "ניווט", "וויז", "וייז", "גזית", "הוד השרון"],
    reply: (he) => ({
      text: he ? `אנחנו ב${c.cityHe}.` : `We're in ${c.cityEn}.`,
      actions: [{ label: he ? "פתיחה במפות" : "Open in Maps", href: maps }],
    }),
  },
  {
    id: "parking",
    keys: ["parking", "do i park", "to park", " park", "car ", "bus", "accessible", "wheelchair", "elevator", "חניה", "חנייה", "חונים", "לחנות", "איפה חונים", "רכב", "אוטובוס", "נגיש", "נגישות", "מעלית"],
    reply: (he) => ({
      text: he
        ? `${c.parking.he}. לשאלות על נגישות, שלחי הודעה והצוות יענה.`
        : `${c.parking.en}. For access questions, send a message and the team will reply.`,
    }),
  },
  {
    id: "pregnancy",
    keys: ["pregnan", "expecting", "prenatal", "postnatal", "postpartum", "after birth", "gave birth", "baby", "בהריון", "הריון", "הרה", "לידה", "אחרי לידה", "תינוק"],
    reply: (he) => ({
      text: he
        ? `אפשר להתאמן בהריון${isTodo(siteConfig.policies.pregnancyUpTo) ? " עד שלב מסוים" : ` עד ${siteConfig.policies.pregnancyUpTo}`}, עם אישור רופא, ולעדכן את המדריכה לפני כל שיעור. אחרי לידה חוזרים רק באישור רופא. המדריכות ישמחו לדבר איתך על מה שמתאים לך.`
        : `Yes, you can train during pregnancy${isTodo(siteConfig.policies.pregnancyUpTo) ? " up to a certain stage" : ` up to ${siteConfig.policies.pregnancyUpTo}`}, with your doctor's approval, and by telling your instructor before each class. After birth, please return only with your doctor's OK. Our instructors are happy to talk through what's right for you.`,
      handoff: true,
    }),
  },
  {
    id: "health",
    keys: ["injur", "pain", "back", "knee", "neck", "shoulder", "hip", "surgery", "condition", "doctor", "medical", "health", "osteo", "disc", "scoliosis", "arthritis", "rehab", "פציעה", "כאב", "גב", "ברך", "צוואר", "כתף", "ירך", "ניתוח", "רופא", "רפואי", "בריאות", "פריצת דיסק", "דיסק", "עקמת", "שיקום", "מחלה"],
    reply: (he) => ({
      text: he
        ? "פילאטיס מתאים להרבה גופים, והשיעורים מותאמים לכל אחת. עם פציעה, כאב או מצב רפואי: קודם מתייעצים עם רופא, ומעדכנים את המדריכה לפני השיעור. לפעמים אימון פרטי הוא ההתחלה הנכונה. אנחנו לא נותנות ייעוץ רפואי, אבל המדריכות ישמחו לשמוע ולהכווין."
        : "Pilates suits many bodies, and every class is adapted. With an injury, pain or a medical condition, please check with your doctor first and tell your instructor before class. Sometimes a private session is the right place to start. We can't give medical advice, but our instructors are happy to hear more and guide you.",
      actions: [{ label: he ? "אימון פרטי" : "Private session", to: "contact?interest=private" }],
      handoff: true,
    }),
  },
  {
    id: "age",
    keys: ["age", "teen", "old", "older", "senior", "kid", "daughter", "גיל", "נערה", "נערות", "מבוגרת", "גיל הזהב", "ילדה", "בת שלי"],
    reply: (he) => ({
      text: he
        ? "השיעורים מתאימים לנשים בכל גיל, והקפיצים מאפשרים להתחיל בעדינות. לנערות ולאמא ובת יש גם אימון זוגי. לשאלה על גיל מינימום, שלחי לנו הודעה."
        : "Classes suit women of every age, and the springs let you start gently. For teens or mother and daughter, duo sessions are a great option. For a minimum age, just message us.",
      handoff: true,
    }),
  },
  {
    id: "benefits",
    keys: ["benefit", "good for", "results", "lose weight", "tone", "strong", "posture", "flexib", "why pilates", "יתרון", "טוב ל", "תוצאות", "לרדת במשקל", "חיטוב", "חזק", "יציבה", "גמישות", "למה פילאטיס"],
    reply: (he) => ({
      text: he
        ? "פילאטיס רפורמר בונה כוח, שליטה, יציבה וגמישות, בתנועה איטית ומדויקת. רוב המתאמנות מרגישות יותר ״ארוכות״, יציבות ורגועות. התוצאות תלויות בגוף ובהתמדה, אז אנחנו לא מבטיחות מספרים."
        : "Reformer Pilates builds strength, control, posture and mobility through slow, precise movement. Most people leave feeling longer, steadier and calmer. Results depend on your body and consistency, so we don't promise numbers.",
      actions: [book(he)],
    }),
  },
  {
    id: "gift",
    keys: ["gift", "voucher", "present", "birthday", "מתנה", "שובר", "יום הולדת"],
    reply: (he) => ({
      text: he ? "יש שוברי מתנה: כרטיסייה או סכום לבחירה, עם ברכה אישית ממך." : "We have gift cards: a class pass or a custom amount, with your own note.",
      actions: [{ label: he ? "לשוברי מתנה" : "Gift cards", to: "gift" }],
    }),
  },
  {
    id: "team",
    keys: ["orit", "founder", "owner", "instructor", "teacher", "who teaches", "אורית", "מייסדת", "בעלים", "מדריכה", "מדריכות", "מי מלמדת"],
    reply: (he) => ({
      text: he
        ? `צוות המדריכות של re:set מלמד בקבוצות של עד חמש. ${founder.nameHe} הקימה את הסטודיו: ${founder.bioHe.split(".")[0]}.${
            instructors.length ? ` לצידה מלמדות ${instructors.map((i) => i.nameHe).join(", ")}.` : " הצוות המלא יוצג לקראת הפתיחה."
          }`
        : `re:set's team of instructors teaches in groups of up to five. ${founder.nameEn} founded the studio: ${founder.bioEn.split(".")[0]}.${
            instructors.length ? ` Teaching alongside her: ${instructors.map((i) => i.nameEn).join(", ")}.` : " The full team is announced before opening."
          }`,
      actions: [{ label: he ? "על הסטודיו" : "About the studio", to: "about" }],
    }),
  },
  {
    id: "contact",
    keys: ["contact", "phone", "call", "whatsapp", "email", "mail", "gmail", "מייל", "דואר", "talk to", "human", "person", "צור קשר", "טלפון", "להתקשר", "וואטסאפ", "ווטסאפ", "מייל", "לדבר עם", "נציג"],
    reply: (he) => ({
      text: he
        ? `הכי מהיר בוואטסאפ, ישירות לסטודיו: ${c.phone}. במייל: ${c.email}. אפשר גם להשאיר פרטים ונחזור אלייך.`
        : `WhatsApp is fastest, straight to the studio: ${c.phone}. By email: ${c.email}. You can also leave your details and we'll call you back.`,
      actions: [
        { label: he ? "חיוג" : "Call", href: `tel:+${c.whatsapp}` },
        { label: he ? "שליחת מייל" : "Send an email", href: `mailto:${c.email}` },
        { label: he ? "צרי קשר" : "Contact", to: "contact" },
      ],
      handoff: true,
    }),
  },
  {
    id: "review",
    keys: ["review", "rating", "google", "stars", "feedback", "ביקורת", "דירוג", "גוגל", "כוכבים", "משוב"],
    reply: (he) => ({
      text: he
        ? "נשמח מאוד לביקורת בגוגל! זה עוזר לנשים אחרות למצוא אותנו."
        : "We'd love a Google review! It helps other women find us.",
      actions: isTodo(siteConfig.social.googleReview)
        ? [{ label: he ? "שליחת משוב במייל" : "Send feedback by email", href: `mailto:${c.email}` }]
        : [{ label: he ? "לכתיבת ביקורת" : "Write a review", href: siteConfig.social.googleReview }],
    }),
  },
  {
    id: "thanks",
    keys: ["thank", "thanks", "great", "perfect", "תודה", "מעולה", "מושלם", "סבבה"],
    reply: (he) => ({ text: he ? "בכיף! נתראה בסטודיו 🤍" : "My pleasure! See you at the studio 🤍" }),
  },
];

const normalize = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[?!.,;:'"״׳()]/g, " ")
    .replace(/\s+/g, " ")} `;

export function answer(input: string, lang: Lang): ChatReply {
  const he = lang === "he";
  const text = normalize(input);
  let best: Intent | null = null;
  let bestScore = 0;
  for (const it of intents) {
    const score = it.keys.reduce((n, k) => (text.includes(k) ? n + k.length : n), 0);
    if (score > bestScore) {
      best = it;
      bestScore = score;
    }
  }
  if (best) return { ...best.reply(he), intent: best.id };
  return {
    text: he
      ? "שאלה טובה. אין לנו עליה תשובה מוכנה כאן, אבל הצוות ישמח לענות. שלחי לנו הודעה בוואטסאפ או השאירי פרטים."
      : "Good question. There's no ready answer for that here, but the team will be happy to help. Message us on WhatsApp or leave your details.",
    actions: [{ label: he ? "צרי קשר" : "Contact", to: "contact" }],
    handoff: true,
  };
}

export const quickTopics = (he: boolean) =>
  he
    ? ["איך משריינים?", "כמה זה עולה?", "אני מתחילה, זה מתאים לי?", "איך מבטלים?", "איפה אתם?", "יש לי כאבי גב"]
    : ["How do I book?", "How much does it cost?", "I'm a beginner, is it for me?", "How do I cancel?", "Where are you?", "I have back pain"];
