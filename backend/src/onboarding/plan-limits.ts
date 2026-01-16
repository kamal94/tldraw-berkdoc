/**
 * Plan limits for free tier (stubbed for now)
 * 
 * These limits control how many documents a user can process
 * without upgrading to a paid plan.
 */

export const FREE_TIER_LIMITS = {
  /** Maximum number of documents that can be processed */
  maxDocuments: 100,
  /** Maximum total size in GB that can be processed */
  maxSizeGb: 0.5,
  /** Maximum documents that can be processed per day */
  maxProcessingPerDay: 50,
} as const;

export interface PlanLimitCheck {
  withinLimits: boolean;
  maxDocuments: number;
  currentDocuments: number;
  documentsOverLimit: number;
  maxSizeGb: number;
  currentSizeGb: number;
  sizeOverLimitGb: number;
}

/**
 * Check if a drive snapshot is within plan limits
 */
export function checkPlanLimits(
  supportedFileCount: number,
  supportedSizeBytes: number,
): PlanLimitCheck {
  const currentSizeGb = supportedSizeBytes / (1024 * 1024 * 1024);
  
  const documentsOverLimit = Math.max(0, supportedFileCount - FREE_TIER_LIMITS.maxDocuments);
  const sizeOverLimitGb = Math.max(0, currentSizeGb - FREE_TIER_LIMITS.maxSizeGb);
  
  const withinLimits = documentsOverLimit === 0 && sizeOverLimitGb === 0;

  return {
    withinLimits,
    maxDocuments: FREE_TIER_LIMITS.maxDocuments,
    currentDocuments: supportedFileCount,
    documentsOverLimit,
    maxSizeGb: FREE_TIER_LIMITS.maxSizeGb,
    currentSizeGb,
    sizeOverLimitGb,
  };
}

/**
 * Get the number of documents that can be processed today
 * based on daily limits
 */
export function getRemainingDailyQuota(processedToday: number): number {
  return Math.max(0, FREE_TIER_LIMITS.maxProcessingPerDay - processedToday);
}
