import { Link, useSearchParams } from "react-router-dom";
import { PageHead, ScheduleBoard, TrialBanner } from "../components/blocks";
import { serviceById } from "../config/services";
import { useI18n } from "../lib/i18n";
import { useSeo } from "../lib/seo";

export default function Schedule() {
  const { t, href } = useI18n();
  useSeo(t.meta.schedule);
  const [params] = useSearchParams();
  // Private, duo and women-only have no open slots yet: lead with a request so the enquiry is never lost.
  const requested = serviceById(params.get("service") ?? "");
  const byRequest = requested && !requested.bookable ? requested : null;
  return (
    <div className="page tone-dark has-tabbar">
      <PageHead title={t.schedule.title} sub={t.schedule.sub} app />
      <div className="wrap wrap--app pbody screen">
        {byRequest && (
          <div className="card card--blue stack gap-12 request-time">
            <h2 className="display d-sm">{t.common.requestTimeTitle.replace("{name}", t.services.items[byRequest.id].name)}</h2>
            <p className="small muted">{t.common.requestTimeSub}</p>
            <Link to={href(`request?type=${byRequest.id}`)} className="btn btn--primary btn--arrow" style={{ alignSelf: "flex-start" }}>
              {t.common.requestTime}
            </Link>
          </div>
        )}
        <TrialBanner />
        <ScheduleBoard />
      </div>
    </div>
  );
}
