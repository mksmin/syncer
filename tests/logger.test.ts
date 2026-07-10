import { describe, expect, it } from "vitest";
import { redactContext } from "../src/infrastructure/logger";

describe("logger redaction", () => {
  it("redacts token, auth, password and secret fields", () => {
    expect(
      redactContext({
        accessToken: "a",
        Authorization: "b",
        password: "c",
        clientSecret: "d",
        path: "A.md",
      }),
    ).toEqual({
      accessToken: "<redacted>",
      Authorization: "<redacted>",
      password: "<redacted>",
      clientSecret: "<redacted>",
      path: "A.md",
    });
  });
});
