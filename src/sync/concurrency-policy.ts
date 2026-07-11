export function effectiveDownloadConcurrency(configured: number, isMobileApp: boolean): number {
  const safeConfigured = Math.max(1, Math.floor(configured));
  return isMobileApp ? 1 : safeConfigured;
}
