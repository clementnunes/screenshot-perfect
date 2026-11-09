import { describe, expect, it } from "vitest";
import { requiresInterview } from "./recruitment";
describe("requiresInterview", () => {
  it("flags a score above the threshold", () => expect(requiresInterview(76, 70)).toBe(true));
  it("does not flag a score equal to the threshold", () => expect(requiresInterview(70, 70)).toBe(false));
  it("does not flag a score below or missing", () => { expect(requiresInterview(50, 70)).toBe(false); expect(requiresInterview(null, 70)).toBe(false); });
});
