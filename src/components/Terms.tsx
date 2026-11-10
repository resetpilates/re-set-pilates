// The studio terms (תקנון), as text. Used by the Terms page and by the sheet behind the "I accept the studio terms" box.
// The copy lives in src/content (Hebrew is the owner's original); phone and email come from siteConfig.
import { siteConfig } from "../config/site";
import { useI18n } from "../lib/i18n";

export function TermsBody() {
  const { t, fmtDate } = useI18n();
  const fill = (s: string) => s.replace("{phone}", siteConfig.contact.phone).replace("{email}", siteConfig.contact.email);
  const version = new Date(`${siteConfig.policies.termsVersion}T12:00:00`);
  return (
    <div className="terms">
      <p className="tiny muted">{t.terms.updated.replace("{date}", fmtDate(version))}</p>
      {t.terms.sections.map((s) => (
        <section key={s.h} className="terms__sec stack gap-8">
          <h3 className="display d-sm">{s.h}</h3>
          <ul>
            {s.items.map((it) => (
              <li key={it}>{fill(it)}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
