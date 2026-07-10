import type { DeletionAssessment } from "../types/sync";
import type { DeletionSafetySettings } from "../types/settings";

export interface DeletionAssessmentInput {
  deleteCount: number;
  eligibleLocalFileCount: number;
  remoteIndexComplete: boolean;
  remoteRootExists: boolean;
  remoteRootChanged: boolean;
  settings: DeletionSafetySettings;
}

export function assessDeletion(input: DeletionAssessmentInput): DeletionAssessment {
  const deletePercentage =
    input.eligibleLocalFileCount === 0
      ? 0
      : (input.deleteCount / input.eligibleLocalFileCount) * 100;
  const countLimitExceeded = input.deleteCount > input.settings.maxDeleteCount;
  const percentageLimitExceeded = deletePercentage > input.settings.maxDeletePercentage;

  if (!input.remoteRootExists) {
    return blocked("UNSAFE_REMOTE_ROOT");
  }
  if (!input.remoteIndexComplete) {
    return blocked("REMOTE_INDEX_INCOMPLETE");
  }
  if (input.remoteRootChanged) {
    return blocked("REMOTE_ROOT_CHANGED");
  }

  return {
    allowed: true,
    confirmationRequired:
      input.settings.enabled &&
      input.settings.requireConfirmationAboveLimit &&
      (countLimitExceeded || percentageLimitExceeded),
    deleteCount: input.deleteCount,
    deletePercentage,
    countLimitExceeded,
    percentageLimitExceeded,
  };

  function blocked(
    blockedReason: NonNullable<DeletionAssessment["blockedReason"]>,
  ): DeletionAssessment {
    return {
      allowed: false,
      confirmationRequired: false,
      blockedReason,
      deleteCount: input.deleteCount,
      deletePercentage,
      countLimitExceeded,
      percentageLimitExceeded,
    };
  }
}
