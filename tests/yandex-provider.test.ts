import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  IntegrityError,
  RateLimitError,
  RemoteNotFoundError,
  SyncCancelledError,
} from "../src/infrastructure/errors";
import type {
  HttpRequest,
  HttpResponse,
  HttpTransport,
} from "../src/infrastructure/http-transport";
import type { Logger } from "../src/infrastructure/logger";
import { YandexApiClient } from "../src/providers/yandex/yandex-api-client";
import { YandexDiskProvider } from "../src/providers/yandex/yandex-provider";
import { RetryPolicy } from "../src/sync/retry-policy";

const logger: Logger = {
  error: () => undefined,
  warn: () => undefined,
  info: () => undefined,
  debug: () => undefined,
};

class MockTransport implements HttpTransport {
  readonly requests: HttpRequest[] = [];

  constructor(private readonly responses: (HttpResponse | Error)[]) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const response = this.responses.shift();
    if (response === undefined) throw new Error("Mock response queue is empty.");
    if (response instanceof Error) throw response;
    return response;
  }
}

function response(
  status: number,
  json: unknown,
  headers: Record<string, string> = {},
): HttpResponse {
  return { status, json, headers, arrayBuffer: new ArrayBuffer(0), text: "" };
}

function directory(path: string, items: unknown[], total = items.length, offset = 0): unknown {
  const finalSegment = path.split("/").at(-1);
  return {
    name: finalSegment === undefined || finalSegment === "" ? "disk" : finalSegment,
    path: `disk:${path}`,
    type: "dir",
    _embedded: { items, total, offset, limit: 100 },
  };
}

function file(path: string, overrides: Record<string, unknown> = {}): unknown {
  return {
    name: path.split("/").at(-1),
    path: `disk:${path}`,
    type: "file",
    size: 10,
    modified: "2026-07-10T10:00:00+03:00",
    md5: "abc",
    revision: 7,
    ...overrides,
  };
}

function client(transport: HttpTransport, retryCount = 0, delays: number[] = []): YandexApiClient {
  return new YandexApiClient({
    transport,
    accessToken: async () => "token",
    logger,
    timeoutMs: 1_000,
    retryCount,
    retryPolicy: new RetryPolicy({ maxRetries: retryCount, random: () => 0, now: () => 0 }),
    delay: async (milliseconds) => {
      delays.push(milliseconds);
    },
  });
}

describe("YandexDiskProvider", () => {
  it("lists one page and maps file metadata", async () => {
    const transport = new MockTransport([
      response(200, directory("/Vault", [file("/Vault/A.md")])),
    ]);
    const files = await new YandexDiskProvider(client(transport), "/Vault").listFiles("/Vault");
    expect(files).toEqual([
      expect.objectContaining({
        relativePath: "A.md",
        size: 10,
        checksum: "abc",
        checksumAlgorithm: "md5",
        revision: "7",
      }),
    ]);
  });

  it("reads every pagination page", async () => {
    const transport = new MockTransport([
      response(200, directory("/Vault", [file("/Vault/A.md")], 2, 0)),
      response(200, directory("/Vault", [file("/Vault/B.md")], 2, 1)),
    ]);
    const files = await new YandexDiskProvider(client(transport), "/Vault").listFiles("/Vault");
    expect(files.map((item) => item.relativePath)).toEqual(["A.md", "B.md"]);
    expect(transport.requests[1]?.url).toContain("offset=1");
  });

  it("reports cumulative listing batches", async () => {
    const transport = new MockTransport([
      response(200, directory("/Vault", [file("/Vault/A.md")], 2, 0)),
      response(200, directory("/Vault", [file("/Vault/B.md")], 2, 1)),
    ]);
    const counts: number[] = [];
    await new YandexDiskProvider(client(transport), "/Vault").listFiles(
      "/Vault",
      undefined,
      (batch) => counts.push(batch.discoveredFileCount),
    );
    expect(counts).toEqual([1, 2]);
  });

  it("walks nested folders recursively", async () => {
    const transport = new MockTransport([
      response(
        200,
        directory("/Vault", [{ name: "Папка", path: "disk:/Vault/Папка", type: "dir" }]),
      ),
      response(200, directory("/Vault/Папка", [file("/Vault/Папка/Заметка.md")])),
    ]);
    const files = await new YandexDiskProvider(client(transport), "/Vault").listFiles("/Vault");
    expect(files[0]?.relativePath).toBe("Папка/Заметка.md");
  });

  it("encodes Cyrillic and reserved path characters", async () => {
    const transport = new MockTransport([response(200, directory("/Тест #100%?", []))]);
    await new YandexDiskProvider(client(transport), "/Тест #100%?").listFiles("/Тест #100%?");
    const url = transport.requests[0]?.url ?? "";
    expect(url).toContain("path=%2F%D0%A2%D0%B5%D1%81%D1%82+%23100%25%3F");
  });

  it.each([
    [401, AuthenticationError],
    [404, RemoteNotFoundError],
    [429, RateLimitError],
  ])("maps HTTP %s to typed error", async (status, ErrorType) => {
    const transport = new MockTransport([
      response(status, {}, status === 429 ? { "Retry-After": "15" } : {}),
    ]);
    await expect(
      new YandexDiskProvider(client(transport), "/Vault").listFiles("/Vault"),
    ).rejects.toBeInstanceOf(ErrorType);
  });

  it("retries 503 and honors Retry-After", async () => {
    const delays: number[] = [];
    const transport = new MockTransport([
      response(503, {}, { "Retry-After": "2" }),
      response(200, directory("/Vault", [])),
    ]);
    await new YandexDiskProvider(client(transport, 1, delays), "/Vault").listFiles("/Vault");
    expect(delays).toEqual([2_000]);
    expect(transport.requests).toHaveLength(2);
  });

  it("cancels before starting a request", async () => {
    const transport = new MockTransport([]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      new YandexDiskProvider(client(transport), "/Vault").listFiles("/Vault", controller.signal),
    ).rejects.toBeInstanceOf(SyncCancelledError);
    expect(transport.requests).toHaveLength(0);
  });

  it("cancels an in-flight request cooperatively", async () => {
    const transport: HttpTransport = {
      request: () => new Promise<HttpResponse>(() => undefined),
    };
    const controller = new AbortController();
    const listing = new YandexDiskProvider(client(transport), "/Vault").listFiles(
      "/Vault",
      controller.signal,
    );
    controller.abort();
    await expect(listing).rejects.toBeInstanceOf(SyncCancelledError);
  });

  it("rejects a root path that points to a file", async () => {
    const transport = new MockTransport([response(200, file("/Vault.md"))]);
    await expect(
      new YandexDiskProvider(client(transport), "/Vault.md").listFiles("/Vault.md"),
    ).rejects.toBeInstanceOf(RemoteNotFoundError);
  });

  it("downloads binary data through signed link", async () => {
    const binary = new Uint8Array([0, 1, 2, 255]).buffer;
    const transport = new MockTransport([
      response(200, { href: "https://download.example/file", method: "GET" }),
      { status: 200, json: {}, headers: {}, arrayBuffer: binary, text: "" },
    ]);
    const result = await new YandexDiskProvider(client(transport), "/Vault").downloadFile(
      "disk:/Vault/image.png",
    );
    expect([...new Uint8Array(result)]).toEqual([0, 1, 2, 255]);
    expect(transport.requests[1]?.headers).toEqual({});
  });

  it("rejects an incomplete page", async () => {
    const transport = new MockTransport([response(200, directory("/Vault", [], 1, 0))]);
    await expect(
      new YandexDiskProvider(client(transport), "/Vault").listFiles("/Vault"),
    ).rejects.toBeInstanceOf(IntegrityError);
  });

  it("rejects file metadata without size", async () => {
    const transport = new MockTransport([
      response(200, directory("/Vault", [file("/Vault/A.md", { size: undefined })])),
    ]);
    await expect(
      new YandexDiskProvider(client(transport), "/Vault").listFiles("/Vault"),
    ).rejects.toBeInstanceOf(IntegrityError);
  });
});
