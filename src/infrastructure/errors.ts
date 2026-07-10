export class AuthenticationError extends Error {}
export class RemoteNotFoundError extends Error {}
export class RateLimitError extends Error {}
export class NetworkError extends Error {}
export class IntegrityError extends Error {}
export class UnsafeDeletionError extends Error {}
export class SyncCancelledError extends Error {}
export class UnsupportedProviderError extends Error {}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
