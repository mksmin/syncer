import { describe, expect, it } from "vitest";
import { validateGlob } from "../src/filters/path-filter";
import { createDiagnosticSettings, migrateSettings } from "../src/settings/settings-migration";
import { DEFAULT_SETTINGS } from "../src/types/settings";

describe("settings", () => {
  it("has valid defaults", () => {
    const settings = migrateSettings(undefined);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(settings.concurrentDownloads).toBeGreaterThanOrEqual(1);
    expect(settings.concurrentDownloads).toBeLessThanOrEqual(5);
  });

  it("migrates and clamps values", () => {
    const settings = migrateSettings({
      schemaVersion: 0,
      concurrentDownloads: 99,
      deletionSafety: { maxDeletePercentage: -2 },
    });
    expect(settings.schemaVersion).toBe(4);
    expect(settings.concurrentDownloads).toBe(5);
    expect(settings.deletionSafety.maxDeletePercentage).toBe(0);
  });

  it("adds the Codex metadata exclusion to existing settings", () => {
    const settings = migrateSettings({ schemaVersion: 3, excludePatterns: ["Private/**"] });
    expect(settings.excludePatterns).toEqual(["Private/**", ".codex/**"]);
  });

  it("detects invalid glob", () => {
    expect(validateGlob("Folder/[abc").valid).toBe(false);
  });

  it("never exports secrets", () => {
    const settings = migrateSettings({
      yandexAccessToken: "top-secret-token",
      yandexRefreshToken: "top-secret-refresh-token",
      yandexPendingPkceVerifier: "top-secret-verifier",
      webdav: { password: "top-secret-password" },
    });
    const diagnostic = JSON.stringify(createDiagnosticSettings(settings));
    expect(diagnostic).not.toContain("top-secret-token");
    expect(diagnostic).not.toContain("top-secret-refresh-token");
    expect(diagnostic).not.toContain("top-secret-verifier");
    expect(diagnostic).not.toContain("top-secret-password");
  });
});
