import { MotionConfig } from "motion/react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Shell } from "./components/Shell";
import { Welcome } from "./components/Welcome";
import type { Lang } from "./config/site";
import { siteConfig } from "./config/site";
import { I18nProvider } from "./lib/i18n";
import { preferredLang } from "./lib/lang";
import { StoreProvider } from "./lib/store";
import { TrainerProvider } from "./lib/trainerStore";
import { About, Faq } from "./pages/About";
import ClassDetail from "./pages/ClassDetail";
import Contact from "./pages/Contact";
import Gift from "./pages/Gift";
import Home from "./pages/Home";
import My from "./pages/My";
import Onboarding from "./pages/Onboarding";
import { Checkout, Pricing } from "./pages/Pricing";
import Profile from "./pages/Profile";
import Progress from "./pages/Progress";
import Quiz from "./pages/Quiz";
import Receipt from "./pages/Receipt";
import Request from "./pages/Request";
import Schedule from "./pages/Schedule";
import Shop from "./pages/Shop";
import Terms from "./pages/Terms";
import { ServiceDetail, Services } from "./pages/Services";

function LangRoot() {
  const { lang } = useParams();
  if (!siteConfig.locale.supported.includes(lang as Lang)) return <Navigate to={`/${preferredLang()}/`} replace />;
  return (
    <I18nProvider lang={lang as Lang}>
      <Welcome />
      <Shell />
    </I18nProvider>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <StoreProvider>
        <TrainerProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to={`/${preferredLang()}/`} replace />} />
              <Route path="/:lang" element={<LangRoot />}>
                <Route index element={<Home />} />
                <Route path="schedule" element={<Schedule />} />
                <Route path="class/:id" element={<ClassDetail />} />
                <Route path="services" element={<Services />} />
                <Route path="services/:slug" element={<ServiceDetail />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="checkout/:planId" element={<Checkout />} />
                <Route path="my" element={<My />} />
                <Route path="receipt" element={<Receipt />} />
                <Route path="receipt/:no" element={<Receipt />} />
                <Route path="profile" element={<Profile />} />
                <Route path="progress" element={<Progress />} />
                <Route path="progress/start" element={<Onboarding />} />
                <Route path="about" element={<About />} />
                <Route path="faq" element={<Faq />} />
                <Route path="contact" element={<Contact />} />
                <Route path="request" element={<Request />} />
                <Route path="quiz" element={<Quiz />} />
                <Route path="gift" element={<Gift />} />
                <Route path="shop" element={<Shop />} />
                <Route path="terms" element={<Terms />} />
                <Route path="*" element={<Navigate to="." replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </TrainerProvider>
      </StoreProvider>
    </MotionConfig>
  );
}
