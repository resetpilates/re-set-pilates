import { useNavigate } from "react-router-dom";
import { PageHead } from "../components/blocks";
import { termsAccepted } from "../components/forms";
import { TermsBody } from "../components/Terms";
import { Check } from "../components/ui";
import { siteConfig } from "../config/site";
import { track } from "../lib/analytics";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";
import { useStore } from "../lib/store";

/**
 * Studio terms page: the full text plus a one-tap acceptance card (a checkbox, no signature).
 * Acceptance is remembered on this device (profile.termsAcceptedAt + version) and sent to Airtable with the next checkout.
 */
export default function Terms() {
  const { t, fmtDate } = useI18n();
  useSeo(t.meta.terms);
  const store = useStore();
  const nav = useNavigate();
  const p = store.profile;
  const ok = termsAccepted(p);
  const outdated = !!p.termsAcceptedAt && !ok;
  const accept = () => {
    store.saveProfile({ termsAcceptedAt: new Date().toISOString(), termsVersion: siteConfig.policies.termsVersion });
    track("terms_accepted", { version: siteConfig.policies.termsVersion });
  };
  return (
    <div className="page tone-dark">
      <PageHead title={t.terms.title} sub={t.terms.sub} />
      <div className="wrap wrap--narrow pbody">
        <div className="screen stack gap-32">
          {outdated && (
            <p className="notice" role="status">
              {t.terms.changed}
            </p>
          )}
          <TermsBody />
          {ok ? (
            <div className="card stack gap-12 terms-accept" role="status">
              <div className="row gap-12" style={{ alignItems: "center" }}>
                <Check />
                <span className="stack gap-4">
                  <b className="display d-sm">{t.terms.acceptedTitle}</b>
                  <span className="small muted">{t.terms.acceptedOn.replace("{date}", fmtDate(new Date(p.termsAcceptedAt!)))}</span>
                </span>
              </div>
              <button className="btn btn--secondary btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => (history.length > 1 ? nav(-1) : nav("../profile"))}>
                {t.terms.back}
              </button>
            </div>
          ) : (
            <div className="card stack gap-12 terms-accept">
              <h2 className="display d-sm">{t.terms.acceptTitle}</h2>
              <p className="small muted">{t.terms.acceptSub}</p>
              <label className="tick">
                <input type="checkbox" onChange={(e) => e.currentTarget.checked && accept()} />
                <span>
                  {t.form.terms} {t.form.termsLink}
                </span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
