import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("candidate password", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const h = await hashPassword("Secret123!");
    expect(await verifyPassword("Secret123!", h)).toBe(true);
    expect(await verifyPassword("secret123!", h)).toBe(false);
  });
});
