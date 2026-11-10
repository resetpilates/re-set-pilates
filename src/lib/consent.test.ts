import { describe, expect, test } from "bun:test";
import { hasConsent, withMediaConsent, type ConsentRecord } from "./trainer";

const health: ConsentRecord = { scope: "health", textVersion: "health-v0-draft", grantedAt: "2026-11-01T10:00:00.000Z" };
const T1 = "2026-11-10T10:00:00.000Z";
const T2 = "2026-11-12T10:00:00.000Z";

describe("photo / video consent follows the checkbox", () => {
  test("ticked: one active media record is added", () => {
    const out = withMediaConsent([health], true, "media-v1", T1);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ scope: "media", textVersion: "media-v1", grantedAt: T1 });
    expect(hasConsent(out, "media")).toBe(true);
  });

  test("ticked again: never a duplicate active record", () => {
    const once = withMediaConsent([health], true, "media-v1", T1);
    expect(withMediaConsent(once, true, "media-v1", T2)).toBe(once);
  });

  test("unticked: the active record is withdrawn, history kept", () => {
    const once = withMediaConsent([health], true, "media-v1", T1);
    const out = withMediaConsent(once, false, "media-v1", T2);
    expect(out).toHaveLength(2);
    expect(out[1].revokedAt).toBe(T2);
    expect(hasConsent(out, "media")).toBe(false);
    expect(hasConsent(out, "health")).toBe(true);
  });

  test("unticked with nothing to withdraw: unchanged", () => {
    const list = [health];
    expect(withMediaConsent(list, false, "media-v1", T1)).toBe(list);
  });

  test("re-granted after withdrawal: a fresh record, the old one stays withdrawn", () => {
    const a = withMediaConsent([health], true, "media-v1", T1);
    const b = withMediaConsent(a, false, "media-v1", T2);
    const c = withMediaConsent(b, true, "media-v1", "2026-11-14T10:00:00.000Z");
    expect(c).toHaveLength(3);
    expect(c[1].revokedAt).toBe(T2);
    expect(c[2].revokedAt).toBeUndefined();
  });
});
