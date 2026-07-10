import type { SkipReason, SyncOperation, SyncPlan } from "../types/sync";

export interface SyncPlanSection {
  title: string;
  operations: SyncOperation[];
  tone: "normal" | "warning" | "muted";
}

const SKIP_LABELS: Record<SkipReason, string> = {
  UNCHANGED: "Без изменений",
  EXCLUDED: "Исключено фильтром",
  FILE_TOO_LARGE: "Превышен лимит размера",
  DELETION_DISABLED: "Удаление отключено",
  REMOTE_INDEX_INCOMPLETE: "Удаление заблокировано: индекс неполный",
  REMOTE_ROOT_CHANGED: "Удаление недоступно до полной синхронизации этой папки",
  UNSAFE_REMOTE_ROOT: "Удаление недоступно: папка на сервере не подтверждена",
};

export function buildPlanSections(plan: SyncPlan): SyncPlanSection[] {
  return [
    section("Новые файлы", plan, "DOWNLOAD_NEW", "normal"),
    section("Изменённые файлы", plan, "UPDATE_LOCAL", "warning"),
    section("Удалить локально", plan, "TRASH_LOCAL", "warning"),
    section("Оставить без изменений", plan, "SKIP", "muted"),
  ].filter((item) => item.operations.length > 0);
}

export function operationDetail(operation: SyncOperation): string {
  if (operation.type === "DOWNLOAD_NEW") {
    return `На сервере: ${formatBytes(operation.remoteFile.size)}; изменён ${formatDate(operation.remoteFile.modifiedAt)}.`;
  }
  if (operation.type === "UPDATE_LOCAL") return updateDetail(operation);
  if (operation.type === "TRASH_LOCAL") {
    return `Локально: ${formatBytes(operation.localFile.size)}; изменён ${formatDate(operation.localFile.modifiedAt)}.`;
  }
  const label = SKIP_LABELS[operation.reason];
  if (operation.remoteFile !== undefined && operation.localFile !== undefined) {
    return `${label}. На сервере: ${formatBytes(operation.remoteFile.size)}, ${formatDate(operation.remoteFile.modifiedAt)}; локально: ${formatBytes(operation.localFile.size)}, ${formatDate(operation.localFile.modifiedAt)}.`;
  }
  if (operation.remoteFile !== undefined) {
    return `${label}. На сервере: ${formatBytes(operation.remoteFile.size)}, ${formatDate(operation.remoteFile.modifiedAt)}.`;
  }
  if (operation.localFile !== undefined) {
    return `${label}. Локально: ${formatBytes(operation.localFile.size)}, ${formatDate(operation.localFile.modifiedAt)}.`;
  }
  return label;
}

function updateDetail(operation: Extract<SyncOperation, { type: "UPDATE_LOCAL" }>): string {
  const remote = operation.remoteFile;
  const local = operation.localFile;
  const sizeDelta = remote.size - local.size;
  const reason =
    sizeDelta !== 0
      ? `размер ${formatBytes(local.size)} → ${formatBytes(remote.size)} (${formatSizeDelta(sizeDelta)})`
      : remote.modifiedAt !== local.modifiedAt
        ? "размер одинаковый, даты изменения отличаются"
        : "размер и дата совпадают, но нет подтверждённого результата предыдущей синхронизации";
  return `Причина: ${reason}. На сервере: ${formatDate(remote.modifiedAt)}; локально: ${formatDate(local.modifiedAt)}.`;
}

function formatSizeDelta(bytes: number): string {
  const sign = bytes > 0 ? "+" : "−";
  return `${sign}${formatBytes(Math.abs(bytes))}`;
}

function formatDate(milliseconds: number): string {
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(milliseconds));
}

export function deletionWarning(plan: SyncPlan): string | undefined {
  const assessment = plan.deletionAssessment;
  if (assessment.deleteCount === 0) return undefined;
  if (!assessment.allowed) {
    const reason = assessment.blockedReason;
    const label =
      reason === "REMOTE_INDEX_INCOMPLETE"
        ? "список файлов с сервера получен не полностью"
        : reason === "UNSAFE_REMOTE_ROOT"
          ? "папка на сервере недоступна"
          : "сначала нужна полная успешная синхронизация выбранной папки";
    return `Локальное удаление отключено: ${label}. Файлов: ${String(assessment.deleteCount)}.`;
  }
  if (!assessment.confirmationRequired) return undefined;
  return `Массовое удаление потребует подтверждения: ${String(assessment.deleteCount)} файлов (${formatPercentage(assessment.deletePercentage)}).`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${String(bytes)} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes / 1_024;
  let unit = units[0] ?? "КБ";
  for (let index = 1; index < units.length && value >= 1_024; index += 1) {
    value /= 1_024;
    unit = units[index] ?? unit;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function section(
  title: string,
  plan: SyncPlan,
  type: SyncOperation["type"],
  tone: SyncPlanSection["tone"],
): SyncPlanSection {
  return {
    title,
    operations: plan.operations.filter((operation) => operation.type === type),
    tone,
  };
}

function formatPercentage(value: number): string {
  return `${value.toFixed(value >= 10 ? 1 : 2)}%`;
}
