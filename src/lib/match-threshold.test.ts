import { describe, expect, it } from "vitest";
import { effectiveInterviewStatus, requiresInterview } from "./recruitment";
describe("requiresInterview", () => {
  it("flags a score above the threshold", () => expect(requiresInterview(76, 70)).toBe(true));
  it("does not flag a score equal to the threshold", () => expect(requiresInterview(70, 70)).toBe(false));
  it("does not flag a score below or missing", () => { expect(requiresInterview(50, 70)).toBe(false); expect(requiresInterview(null, 70)).toBe(false); });
});

describe("effectiveInterviewStatus", () => {
  it("shows a profile above the threshold as to be done", () => {
    expect(effectiveInterviewStatus(undefined, 76, 70)).toBe("not_started");
    expect(effectiveInterviewStatus("none", 76, 70)).toBe("not_started");
  });
  it("shows a profile below or at the threshold as unavailable", () => {
    expect(effectiveInterviewStatus(undefined, 50, 70)).toBe("unavailable");
    expect(effectiveInterviewStatus(undefined, 70, 70)).toBe("unavailable");
    expect(effectiveInterviewStatus("not_started", 43, 50)).toBe("unavailable");
  });
  it("never overrides an interview already underway", () => {
    expect(effectiveInterviewStatus("in_progress", 76, 70)).toBe("in_progress");
    expect(effectiveInterviewStatus("completed", 76, 70)).toBe("completed");
  });
});
