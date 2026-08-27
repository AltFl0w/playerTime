import { describe, expect, it } from "vitest";
import { shouldShowA2hsNudge, shouldShowA2hsNudgeFrom } from "./a2hs";

describe("shouldShowA2hsNudgeFrom", () => {
  it("shows on iOS Safari in a tab that has not dismissed", () => {
    expect(shouldShowA2hsNudgeFrom({ ios: true, standalone: false, dismissed: false })).toBe(true);
  });

  it("hides when already installed (standalone)", () => {
    expect(shouldShowA2hsNudgeFrom({ ios: true, standalone: true, dismissed: false })).toBe(false);
  });

  it("hides after dismiss", () => {
    expect(shouldShowA2hsNudgeFrom({ ios: true, standalone: false, dismissed: true })).toBe(false);
  });

  it("hides on non-iOS even in a browser tab", () => {
    expect(shouldShowA2hsNudgeFrom({ ios: false, standalone: false, dismissed: false })).toBe(false);
  });

  it("hides when standalone and dismissed", () => {
    expect(shouldShowA2hsNudgeFrom({ ios: true, standalone: true, dismissed: true })).toBe(false);
  });

  it("hides on non-iOS standalone", () => {
    expect(shouldShowA2hsNudgeFrom({ ios: false, standalone: true, dismissed: false })).toBe(false);
  });
});

describe("shouldShowA2hsNudge", () => {
  it("wraps the pure helper and is false without an iOS browser", () => {
    expect(shouldShowA2hsNudge()).toBe(false);
  });
});
