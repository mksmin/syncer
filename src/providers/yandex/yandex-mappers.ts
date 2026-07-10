import { IntegrityError } from "../../infrastructure/errors";
import type { RemoteFile } from "../../types/remote";
import { normalizeRelativePath, UnsafePathError } from "../../utils/paths";
import type {
  YandexDiskInfo,
  YandexDownloadLink,
  YandexEmbeddedResourceList,
  YandexOAuthError,
  YandexResource,
  YandexTokenResponse,
} from "./yandex-types";

export function parseYandexResource(value: unknown): YandexResource {
  const record = requireRecord(value, "resource");
  const type = record.type;
  if (type !== "dir" && type !== "file")
    throw new IntegrityError("Яндекс Диск вернул неизвестный тип ресурса.");
  const result: YandexResource = {
    name: requireString(record.name, "resource.name"),
    path: requireString(record.path, "resource.path"),
    type,
    ...optionalNumber(record.size, "resource.size", "size"),
    ...optionalString(record.modified, "resource.modified", "modified"),
    ...optionalString(record.md5, "resource.md5", "md5"),
    ...optionalRevision(record.revision),
    ...optionalString(record.mime_type, "resource.mime_type", "mime_type"),
  };
  if (record._embedded !== undefined) result._embedded = parseEmbedded(record._embedded);
  return result;
}

export function parseYandexDiskInfo(value: unknown): YandexDiskInfo {
  const record = requireRecord(value, "disk info");
  const result: YandexDiskInfo = {
    total_space: requireNumber(record.total_space, "disk.total_space"),
    used_space: requireNumber(record.used_space, "disk.used_space"),
  };
  if (record.user !== undefined) {
    const user = requireRecord(record.user, "disk.user");
    result.user = {
      ...(typeof user.login === "string" ? { login: user.login } : {}),
      ...(typeof user.display_name === "string" ? { display_name: user.display_name } : {}),
    };
  }
  return result;
}

export function parseYandexDownloadLink(value: unknown): YandexDownloadLink {
  const record = requireRecord(value, "download link");
  return {
    href: requireString(record.href, "download.href"),
    method: requireString(record.method, "download.method"),
  };
}

export function parseYandexToken(value: unknown): YandexTokenResponse {
  const record = requireRecord(value, "OAuth token");
  return {
    access_token: requireString(record.access_token, "token.access_token"),
    token_type: requireString(record.token_type, "token.token_type"),
    expires_in: requireNumber(record.expires_in, "token.expires_in"),
    ...(typeof record.refresh_token === "string" ? { refresh_token: record.refresh_token } : {}),
    ...(typeof record.scope === "string" ? { scope: record.scope } : {}),
  };
}

export function parseYandexOAuthError(value: unknown): YandexOAuthError | undefined {
  if (!isRecord(value) || typeof value.error !== "string") return undefined;
  return {
    error: value.error,
    ...(typeof value.error_description === "string"
      ? { error_description: value.error_description }
      : {}),
  };
}

export function normalizeRemoteRoot(input: string): string {
  const normalized = input
    .trim()
    .replaceAll("\\", "/")
    .replace(/\/{2,}/gu, "/");
  const withoutScheme = normalized.startsWith("disk:") ? normalized.slice(5) : normalized;
  if (withoutScheme === "" || withoutScheme === "/") return "/";
  try {
    const relative = normalizeRelativePath(withoutScheme);
    if (relative === "") return "/";
    return `/${relative}`;
  } catch (error: unknown) {
    if (error instanceof UnsafePathError) throw error;
    throw new IntegrityError("Некорректный путь удалённой папки.");
  }
}

export function mapYandexFile(resource: YandexResource, rootPath: string): RemoteFile {
  if (resource.type !== "file") throw new IntegrityError("Каталог нельзя преобразовать в файл.");
  const root = normalizeRemoteRoot(rootPath);
  const rawPath = resource.path.startsWith("disk:") ? resource.path.slice(5) : resource.path;
  const normalizedPath = normalizeRemoteRoot(rawPath);
  const prefix = root === "/" ? "/" : `${root}/`;
  if (!normalizedPath.startsWith(prefix)) {
    throw new IntegrityError(`Remote path вышел за пределы корня: ${resource.path}`);
  }
  const relativePath = normalizeRelativePath(normalizedPath.slice(prefix.length));
  if (relativePath === "") throw new IntegrityError("Удалённый файл имеет пустой relative path.");
  if (resource.size === undefined || resource.size < 0) {
    throw new IntegrityError(`Яндекс Диск не вернул размер файла: ${relativePath}`);
  }
  if (resource.modified === undefined) {
    throw new IntegrityError(`Яндекс Диск не вернул дату файла: ${relativePath}`);
  }
  const modifiedAt = Date.parse(resource.modified);
  if (Number.isNaN(modifiedAt)) {
    throw new IntegrityError(`Некорректная дата файла: ${relativePath}`);
  }
  return {
    path: resource.path,
    relativePath,
    name: resource.name,
    size: resource.size,
    modifiedAt,
    ...(resource.revision === undefined ? {} : { revision: String(resource.revision) }),
    ...(resource.md5 === undefined ? {} : { checksum: resource.md5, checksumAlgorithm: "md5" }),
    ...(resource.mime_type === undefined ? {} : { mimeType: resource.mime_type }),
  };
}

function parseEmbedded(value: unknown): YandexEmbeddedResourceList {
  const record = requireRecord(value, "resource._embedded");
  if (!Array.isArray(record.items))
    throw new IntegrityError("Яндекс Диск вернул неполный список items.");
  return {
    items: record.items.map(parseYandexResource),
    limit: requireNumber(record.limit, "embedded.limit"),
    offset: requireNumber(record.offset, "embedded.offset"),
    total: requireNumber(record.total, "embedded.total"),
  };
}

function optionalString<K extends string>(
  value: unknown,
  label: string,
  key: K,
): Partial<Record<K, string>> {
  if (value === undefined) return {};
  if (typeof value !== "string") throw new IntegrityError(`Поле ${label} имеет неверный тип.`);
  return { [key]: value } as Record<K, string>;
}

function optionalNumber<K extends string>(
  value: unknown,
  label: string,
  key: K,
): Partial<Record<K, number>> {
  if (value === undefined) return {};
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new IntegrityError(`Поле ${label} имеет неверный тип.`);
  }
  return { [key]: value } as Record<K, number>;
}

function optionalRevision(value: unknown): { revision?: number | string } {
  if (value === undefined) return {};
  if (typeof value !== "number" && typeof value !== "string") {
    throw new IntegrityError("Поле resource.revision имеет неверный тип.");
  }
  return { revision: value };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string")
    throw new IntegrityError(`Поле ${label} отсутствует или повреждено.`);
  return value;
}

function requireNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new IntegrityError(`Поле ${label} отсутствует или повреждено.`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new IntegrityError(`Ответ ${label} имеет неверный формат.`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
