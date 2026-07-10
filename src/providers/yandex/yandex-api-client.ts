import {
  AuthenticationError,
  NetworkError,
  RateLimitError,
  RemoteNotFoundError,
  SyncCancelledError,
} from "../../infrastructure/errors";
import type { HttpResponse, HttpTransport } from "../../infrastructure/http-transport";
import type { Logger } from "../../infrastructure/logger";
import { RetryPolicy } from "../../sync/retry-policy";
import { cancellableDelay, raceWithAbortAndTimeout, throwIfAborted } from "../../utils/abort";
import {
  parseYandexDiskInfo,
  parseYandexDownloadLink,
  parseYandexResource,
} from "./yandex-mappers";
import type { YandexDiskInfo, YandexDownloadLink, YandexResource } from "./yandex-types";

const API_BASE = "https://cloud-api.yandex.net/v1/disk";

export type AccessTokenProvider = (signal?: AbortSignal) => Promise<string>;

export interface YandexApiClientOptions {
  transport: HttpTransport;
  accessToken: AccessTokenProvider;
  logger: Logger;
  timeoutMs: number;
  retryCount: number;
  retryPolicy?: RetryPolicy;
  delay?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

export class YandexApiClient {
  private readonly retryPolicy: RetryPolicy;
  private readonly delay: (milliseconds: number, signal?: AbortSignal) => Promise<void>;

  constructor(private readonly options: YandexApiClientOptions) {
    this.retryPolicy = options.retryPolicy ?? new RetryPolicy({ maxRetries: options.retryCount });
    this.delay = options.delay ?? cancellableDelay;
  }

  async getDiskInfo(signal?: AbortSignal): Promise<YandexDiskInfo> {
    const response = await this.request(API_BASE, signal);
    return parseYandexDiskInfo(response.json);
  }

  async getResource(
    path: string,
    limit: number,
    offset: number,
    signal?: AbortSignal,
  ): Promise<YandexResource> {
    const query = new URLSearchParams({ path, limit: String(limit), offset: String(offset) });
    const response = await this.request(`${API_BASE}/resources?${query.toString()}`, signal);
    return parseYandexResource(response.json);
  }

  async getDownloadLink(path: string, signal?: AbortSignal): Promise<YandexDownloadLink> {
    const query = new URLSearchParams({ path });
    const response = await this.request(
      `${API_BASE}/resources/download?${query.toString()}`,
      signal,
    );
    return parseYandexDownloadLink(response.json);
  }

  async download(href: string, signal?: AbortSignal): Promise<ArrayBuffer> {
    const response = await this.request(href, signal, false, "binary");
    return response.arrayBuffer;
  }

  private async request(
    url: string,
    signal: AbortSignal | undefined,
    authenticated = true,
    responseType: "json" | "binary" = "json",
  ): Promise<HttpResponse> {
    for (let attempt = 0; ; attempt += 1) {
      throwIfAborted(signal);
      let response: HttpResponse;
      try {
        const token = authenticated ? await this.options.accessToken(signal) : undefined;
        response = await raceWithAbortAndTimeout(
          this.options.transport.request({
            url,
            method: "GET",
            responseType,
            headers: token === undefined ? {} : { Authorization: `OAuth ${token}` },
          }),
          this.options.timeoutMs,
          signal,
        );
      } catch (error: unknown) {
        if (
          error instanceof AuthenticationError ||
          error instanceof RemoteNotFoundError ||
          error instanceof RateLimitError ||
          error instanceof SyncCancelledError
        ) {
          throw error;
        }
        if (attempt < this.options.retryCount) {
          const delayMs = this.retryPolicy.delayMs(attempt, undefined);
          this.options.logger.debug("Retrying failed network request", {
            attempt: attempt + 1,
            delayMs,
          });
          await this.delay(delayMs, signal);
          continue;
        }
        if (error instanceof NetworkError) throw error;
        const detail = error instanceof Error ? ` ${error.message}` : "";
        throw new NetworkError(`Не удалось связаться с Яндекс Диском.${detail}`);
      }
      if (response.status >= 200 && response.status < 300) return response;
      if (this.retryPolicy.shouldRetry(response.status, attempt)) {
        const retryAfter = getHeader(response.headers, "retry-after");
        const delayMs = this.retryPolicy.delayMs(attempt, retryAfter);
        this.options.logger.debug("Retrying Yandex request", {
          attempt: attempt + 1,
          delayMs,
          status: response.status,
        });
        await this.delay(delayMs, signal);
        continue;
      }
      throwStatus(response.status, getHeader(response.headers, "retry-after"));
    }
  }
}

function throwStatus(status: number, retryAfter: string | undefined): never {
  if (status === 401) throw new AuthenticationError("Авторизация Яндекс Диска недействительна.");
  if (status === 403) throw new AuthenticationError("Нет доступа к ресурсу Яндекс Диска.");
  if (status === 404) throw new RemoteNotFoundError("Удалённая папка или файл не найдены.");
  if (status === 429) {
    throw new RateLimitError(
      retryAfter === undefined
        ? "Яндекс временно ограничил число запросов."
        : `Яндекс временно ограничил число запросов. Retry-After: ${retryAfter}`,
    );
  }
  throw new NetworkError(`Яндекс Диск вернул HTTP ${String(status)}.`);
}

function getHeader(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const pair = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return pair?.[1];
}
