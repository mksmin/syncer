import { describe, expect, it } from "vitest";
import { ProviderFactory } from "../src/providers/provider-factory";
import { WebDavProvider } from "../src/providers/webdav/webdav-provider";

describe("ProviderFactory", () => {
  it("adds WebDAV without changing planner or engine contracts", () => {
    const factory = new ProviderFactory();
    factory.register(
      "webdav",
      () =>
        new WebDavProvider({
          baseUrl: "https://nas.example/dav",
          username: "",
          password: "",
          remoteRootPath: "/vault",
        }),
    );
    expect(factory.create("webdav").type).toBe("webdav");
  });

  it("rejects unavailable providers", () => {
    expect(() => new ProviderFactory().create("yandex-disk")).toThrow("not available");
  });
});
