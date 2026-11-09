import { describe, expect, it } from "vitest";
import { givenWebhookSecret } from "./webhook-auth";

describe("givenWebhookSecret", () => {
  it("reads x-webhook-secret and trims stray spaces", () => {
    expect(givenWebhookSecret(new Headers({ "x-webhook-secret": "  abc123 \n" }))).toBe("abc123");
  });
  it("accepts Authorization: Bearer", () => {
    expect(givenWebhookSecret(new Headers({ authorization: "Bearer abc123" }))).toBe("abc123");
  });
  it("returns empty when nothing is sent", () => {
    expect(givenWebhookSecret(new Headers())).toBe("");
  });
});
