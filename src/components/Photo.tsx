import { useId, useState } from "react";
import { useI18n } from "../lib/i18n";
import { photoFromFile } from "../lib/photo";

export function CameraIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/**
 * The optional membership-card photo: pick one (camera or library on a phone), change it, or remove it.
 * `value` is the square JPEG data URL made by photoFromFile; nothing is sent from here.
 */
export function PhotoField({ value, onChange }: { value?: string; onChange: (photo: string | null) => void }) {
  const { t } = useI18n();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setFailed(false);
    try {
      onChange(await photoFromFile(file));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack gap-8">
      <label className="photo-field" htmlFor={id} aria-busy={busy}>
        <span className="photo-field__ring">{value ? <img src={value} alt="" /> : <CameraIcon size={22} />}</span>
        <span className="stack gap-4" style={{ flex: 1 }}>
          <b>{value ? t.profile.photoChange : t.profile.photoAdd}</b>
          <span className="tiny muted">{t.profile.photoSub}</span>
        </span>
        <input
          id={id}
          className="sr-only"
          type="file"
          accept="image/*"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = ""; // picking the same file again still fires
          }}
        />
      </label>
      {failed && (
        <p className="tiny hi" role="alert">
          {t.profile.photoError}
        </p>
      )}
      {value && (
        <button type="button" className="btn btn--ghost btn--sm" style={{ alignSelf: "flex-start" }} onClick={() => onChange(null)}>
          {t.profile.photoRemove}
        </button>
      )}
    </div>
  );
}
