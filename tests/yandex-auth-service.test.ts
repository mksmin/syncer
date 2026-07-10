import { describe, expect, it } from "vitest";
import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../src/infrastructure/http-transport";
import { YandexAuthService } from "../src/providers/yandex/yandex-auth-service";
import { migrateSettings } from "../src/settings/settings-migration";

class AuthTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly responses: HttpResponse[]) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (response === undefined) throw new Error("Missing OAuth mock response.");
    return response;
  }
}

function tokenResponse(access = "access", refresh = "refresh"): HttpResponse {
  return {
    status: 200,
    headers: {},
    arrayBuffer: new ArrayBuffer(0),
    text: "",
    json: {
      access_token: access,
      refresh_token: refresh,
      token_type: "bearer",
      expires_in: 3_600,
    },
  };
}

describe("YandexAuthService", () => {
  it("creates PKCE authorization URL without client secret", async () => {
    const settings = migrateSettings({ yandexClientId: "client-id", yandexDeviceId: "device-123" });
    const service = new YandexAuthService({
      transport: new AuthTransport([]),
      settings: () => settings,
      saveSettings: async () => undefined,
      timeoutMs: () => 1_000,
      pkceFactory: async () => ({ verifier: "verifier", challenge: "challenge" }),
    });
    const url = new URL(await service.beginAuthorization());
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.has("client_secret")).toBe(false);
    expect(settings.yandexPendingPkceVerifier).toBe("verifier");
  });

  it("exchanges code with verifier and stores tokens", async () => {
    const settings = migrateSettings({
      yandexClientId: "client-id",
      yandexDeviceId: "device-123",
      yandexPendingPkceVerifier: "verifier",
    });
    const transport = new AuthTransport([tokenResponse()]);
    const service = new YandexAuthService({
      transport,
      settings: () => settings,
      saveSettings: async () => undefined,
      timeoutMs: () => 1_000,
      now: () => 1_000,
    });
    await service.exchangeCode("auth-code");
    const body = transport.requests[0]?.body;
    expect(typeof body).toBe("string");
    if (typeof body !== "string") throw new Error("OAuth body must be a string.");
    expect(body).toContain("code_verifier=verifier");
    expect(body).not.toContain("client_secret");
    expect(settings.yandexAccessToken).toBe("access");
    expect(settings.yandexRefreshToken).toBe("refresh");
    expect(settings.yandexTokenExpiresAt).toBe(3_601_000);
    expect(settings.yandexPendingPkceVerifier).toBe("");
  });

  it("refreshes an expiring token without storing a client secret", async () => {
    const settings = migrateSettings({
      yandexClientId: "client-id",
      yandexAccessToken: "old",
      yandexRefreshToken: "refresh",
      yandexTokenExpiresAt: 1_001,
    });
    const transport = new AuthTransport([tokenResponse("new-access", "new-refresh")]);
    const service = new YandexAuthService({
      transport,
      settings: () => settings,
      saveSettings: async () => undefined,
      timeoutMs: () => 1_000,
      now: () => 1_000,
    });
    await expect(service.getValidAccessToken()).resolves.toBe("new-access");
    const body = transport.requests[0]?.body;
    expect(typeof body).toBe("string");
    if (typeof body !== "string") throw new Error("OAuth body must be a string.");
    expect(body).toContain("grant_type=refresh_token");
    expect(body).not.toContain("client_secret");
  });

  it("forgets all local token material", async () => {
    const settings = migrateSettings({
      yandexAccessToken: "access",
      yandexRefreshToken: "refresh",
      yandexPendingPkceVerifier: "verifier",
      yandexTokenExpiresAt: 123,
    });
    const service = new YandexAuthService({
      transport: new AuthTransport([]),
      settings: () => settings,
      saveSettings: async () => undefined,
      timeoutMs: () => 1_000,
    });
    await service.forgetAuthorization();
    expect(settings.yandexAccessToken).toBe("");
    expect(settings.yandexRefreshToken).toBe("");
    expect(settings.yandexPendingPkceVerifier).toBe("");
    expect(settings.yandexTokenExpiresAt).toBe(0);
  });
});
