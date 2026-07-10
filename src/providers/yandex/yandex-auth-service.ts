import { AuthenticationError, IntegrityError } from "../../infrastructure/errors";
import type { HttpTransport } from "../../infrastructure/http-transport";
import type { SyncerSettings } from "../../types/settings";
import { raceWithAbortAndTimeout, throwIfAborted } from "../../utils/abort";
import { parseYandexOAuthError, parseYandexToken } from "./yandex-mappers";
import type { YandexTokenResponse } from "./yandex-types";

const OAUTH_BASE = "https://oauth.yandex.com";
const REDIRECT_URI = `${OAUTH_BASE}/verification_code`;
const EXPIRY_MARGIN_MS = 5 * 60 * 1_000;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export type PkceFactory = () => Promise<PkcePair>;

export interface YandexAuthServiceOptions {
  transport: HttpTransport;
  settings: () => SyncerSettings;
  saveSettings: () => Promise<void>;
  timeoutMs: () => number;
  now?: () => number;
  pkceFactory?: PkceFactory;
}

export class YandexAuthService {
  private readonly now: () => number;
  private readonly pkceFactory: PkceFactory;

  constructor(private readonly options: YandexAuthServiceOptions) {
    this.now = options.now ?? Date.now;
    this.pkceFactory = options.pkceFactory ?? createPkcePair;
  }

  isAuthorized(): boolean {
    return this.options.settings().yandexAccessToken !== "";
  }

  async beginAuthorization(): Promise<string> {
    const settings = this.options.settings();
    if (settings.yandexClientId.trim() === "") {
      throw new AuthenticationError("Сначала укажите Yandex OAuth Client ID.");
    }
    const pair = await this.pkceFactory();
    settings.yandexPendingPkceVerifier = pair.verifier;
    if (settings.yandexDeviceId === "") settings.yandexDeviceId = createDeviceId();
    await this.options.saveSettings();
    const query = new URLSearchParams({
      response_type: "code",
      client_id: settings.yandexClientId.trim(),
      redirect_uri: REDIRECT_URI,
      force_confirm: "yes",
      code_challenge: pair.challenge,
      code_challenge_method: "S256",
      device_id: settings.yandexDeviceId,
      device_name: "Syncer for Obsidian",
    });
    return `${OAUTH_BASE}/authorize?${query.toString()}`;
  }

  async exchangeCode(code: string, signal?: AbortSignal): Promise<void> {
    const settings = this.options.settings();
    if (settings.yandexPendingPkceVerifier === "") {
      throw new AuthenticationError("Сначала нажмите «Авторизоваться» и получите новый код.");
    }
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: code.trim(),
      client_id: settings.yandexClientId.trim(),
      code_verifier: settings.yandexPendingPkceVerifier,
      device_id: settings.yandexDeviceId,
      device_name: "Syncer for Obsidian",
    });
    const token = await this.requestToken(body, signal);
    applyToken(settings, token, this.now());
    settings.yandexPendingPkceVerifier = "";
    await this.options.saveSettings();
  }

  async getValidAccessToken(signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    const settings = this.options.settings();
    if (settings.yandexAccessToken === "")
      throw new AuthenticationError("Яндекс Диск не авторизован.");
    const expiresSoon =
      settings.yandexTokenExpiresAt > 0 &&
      settings.yandexTokenExpiresAt <= this.now() + EXPIRY_MARGIN_MS;
    if (!expiresSoon) return settings.yandexAccessToken;
    if (settings.yandexRefreshToken === "") {
      throw new AuthenticationError("Токен Яндекс Диска истёк. Авторизуйтесь заново.");
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.yandexRefreshToken,
      client_id: settings.yandexClientId.trim(),
    });
    const token = await this.requestToken(body, signal);
    applyToken(settings, token, this.now());
    await this.options.saveSettings();
    return settings.yandexAccessToken;
  }

  async forgetAuthorization(): Promise<void> {
    const settings = this.options.settings();
    settings.yandexAccessToken = "";
    settings.yandexRefreshToken = "";
    settings.yandexTokenExpiresAt = 0;
    settings.yandexPendingPkceVerifier = "";
    await this.options.saveSettings();
  }

  private async requestToken(
    body: URLSearchParams,
    signal?: AbortSignal,
  ): Promise<YandexTokenResponse> {
    const response = await raceWithAbortAndTimeout(
      this.options.transport.request({
        url: `${OAUTH_BASE}/token`,
        method: "POST",
        contentType: "application/x-www-form-urlencoded",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      }),
      this.options.timeoutMs(),
      signal,
    );
    if (response.status !== 200) {
      const oauthError = parseYandexOAuthError(response.json);
      throw new AuthenticationError(
        oauthError?.error_description ??
          oauthError?.error ??
          "Не удалось получить OAuth-токен Яндекса.",
      );
    }
    return parseYandexToken(response.json);
  }
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomUrlSafeString(64);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64Url(new Uint8Array(digest)) };
}

function applyToken(settings: SyncerSettings, token: YandexTokenResponse, now: number): void {
  if (token.expires_in <= 0)
    throw new IntegrityError("Яндекс OAuth вернул некорректный срок токена.");
  settings.yandexAccessToken = token.access_token;
  if (token.refresh_token !== undefined) settings.yandexRefreshToken = token.refresh_token;
  settings.yandexTokenExpiresAt = now + token.expires_in * 1_000;
}

function randomUrlSafeString(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let value = "";
  for (const byte of bytes) value += alphabet.charAt(byte % alphabet.length);
  return value;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/gu, "");
}

function createDeviceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let value = "syncer-";
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value;
}
