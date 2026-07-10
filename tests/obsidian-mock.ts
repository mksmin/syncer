export function normalizePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/{2,}/gu, "/");
  return normalized === "" ? "/" : normalized;
}

interface RequestUrlResult {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
  readonly json: unknown;
  text: string;
}

let requestUrlMock: (options: unknown) => Promise<RequestUrlResult> = async () => {
  throw new Error("requestUrl mock is not configured.");
};

export function setRequestUrlMock(mock: (options: unknown) => Promise<RequestUrlResult>): void {
  requestUrlMock = mock;
}

export async function requestUrl(options: unknown): Promise<RequestUrlResult> {
  return await requestUrlMock(options);
}
