import { useState } from 'react';
import { useOnboarding } from '../../hooks/useOnboarding';
import type { DriveMetadataSnapshot, PlanLimitCheck } from '../../api/onboarding';

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

interface FileTypeGroup {
  name: string;
  count: number;
  size?: number;
}

function groupFileTypesByClassification(
  fileTypeBreakdown: DriveMetadataSnapshot['fileTypeBreakdown'],
): { supported: FileTypeGroup[]; excluded: FileTypeGroup[] } {
  const supportedTypesMap = new Map<string, FileTypeGroup>();
  const excludedTypesMap = new Map<string, FileTypeGroup>();

  Object.entries(fileTypeBreakdown).forEach(([, data]) => {
    const key = `${data.displayName}|${data.classification}`;

    if (data.classification === 'supported') {
      const existing = supportedTypesMap.get(key);
      if (existing) {
        existing.count += data.count;
        existing.size = (existing.size || 0) + data.sizeBytes;
      } else {
        supportedTypesMap.set(key, {
          name: data.displayName,
          count: data.count,
          size: data.sizeBytes,
        });
      }
    } else {
      const existing = excludedTypesMap.get(key);
      if (existing) {
        existing.count += data.count;
      } else {
        excludedTypesMap.set(key, {
          name: data.displayName,
          count: data.count,
        });
      }
    }
  });

  return {
    supported: Array.from(supportedTypesMap.values()).sort((a, b) => b.count - a.count),
    excluded: Array.from(excludedTypesMap.values()).sort((a, b) => b.count - a.count),
  };
}

function getPlanLimitFillClass(usagePercent: number): string {
  if (usagePercent > 100) return 'bg-red-500';
  if (usagePercent > 80) return 'bg-yellow-500';
  return 'bg-green-500';
}

interface SummaryCardProps {
  label: string;
  value: string | number;
  subValue?: string;
}

function SummaryCard({ label, value, subValue }: SummaryCardProps) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      {subValue && <div className="text-xs text-gray-400">{subValue}</div>}
    </div>
  );
}

interface FileTypeListProps {
  types: FileTypeGroup[];
  emptyMessage: string;
}

function FileTypeList({ types, emptyMessage }: FileTypeListProps) {
  if (types.length === 0) {
    return (
      <div className="flex justify-between py-1.5 text-sm">
        <span className="text-gray-400">{emptyMessage}</span>
      </div>
    );
  }

  return (
    <>
      {types.map((type) => (
        <div key={type.name} className="flex justify-between py-1.5 text-sm border-b border-gray-200 last:border-0">
          <span className="text-gray-700">{type.name}</span>
          <span className="text-gray-500">
            {type.count.toLocaleString()}
            {type.size !== undefined && ` (${formatBytes(type.size)})`}
          </span>
        </div>
      ))}
    </>
  );
}

interface PlanLimitBarProps {
  planLimits: PlanLimitCheck;
  isScanning: boolean;
}

function PlanLimitBar({ planLimits, isScanning }: PlanLimitBarProps) {
  const usagePercent = Math.min(100, (planLimits.currentDocuments / planLimits.maxDocuments) * 100);

  return (
    <div className="my-4">
      <div className="flex justify-between mb-2 text-sm">
        <span className="text-gray-700 font-medium">Processing Capacity</span>
        <span className="text-gray-500">
          {planLimits.currentDocuments} / {planLimits.maxDocuments} included
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className={`h-full rounded transition-all duration-300 ${getPlanLimitFillClass(usagePercent)}`}
          style={{ width: `${Math.min(100, usagePercent)}%` }}
        />
      </div>
      {!planLimits.withinLimits && (
        <div className="mt-2 text-xs text-red-500">
          {planLimits.documentsOverLimit} documents over the free tier limit. Only the first{' '}
          {planLimits.maxDocuments} will be processed.
        </div>
      )}
      {isScanning && (
        <div className="mt-2 text-xs text-gray-500">Updating as files are scanned...</div>
      )}
    </div>
  );
}

export function StepReviewDrive() {
  const { snapshot, isScanning, scanProgress, planLimits, confirmProcessing, error } = useOnboarding();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isExcludedExpanded, setIsExcludedExpanded] = useState(false);

  if (!snapshot && !isScanning) {
    return (
      <div className="flex flex-col items-center py-10">
        <div className="w-10 h-10 border-3 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        <div className="text-base font-medium text-gray-700 mt-4">Loading your Drive summary...</div>
      </div>
    );
  }

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await confirmProcessing();
    } finally {
      setIsConfirming(false);
    }
  };

  const showPrepareSection = !isScanning && snapshot && planLimits;
  const displaySnapshot: DriveMetadataSnapshot = snapshot || {
    totalFileCount: 0,
    totalSizeBytes: 0,
    folderCount: 0,
    supportedFileCount: 0,
    supportedSizeBytes: 0,
    unsupportedFileCount: 0,
    sharedDocCount: 0,
    uniqueCollaboratorCount: 0,
    fileTypeBreakdown: {},
  };

  const { supported: supportedTypes, excluded: excludedTypes } = groupFileTypesByClassification(
    displaySnapshot.fileTypeBreakdown,
  );

  return (
    <div>
      {isScanning && (
        <div className="bg-blue-50 border border-blue-500 rounded-lg py-3 px-4 mb-5 flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          <div className="flex-1">
            <div className="font-medium text-blue-900 mb-0.5">Scanning your Drive...</div>
            <div className="text-sm text-blue-500">
              {scanProgress?.filesScanned
                ? `Scanned ${scanProgress.filesScanned.toLocaleString()} files so far`
                : 'Starting scan...'}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5 items-start">
        {/* Left Pane: Summary and Supported Files */}
        <div className="flex flex-col gap-5 min-h-0">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <SummaryCard
              label="Total Documents"
              value={displaySnapshot.totalFileCount.toLocaleString()}
              subValue={formatBytes(displaySnapshot.totalSizeBytes)}
            />
            <SummaryCard
              label="Folders"
              value={displaySnapshot.folderCount.toLocaleString()}
            />
          </div>

          {/* Shared Documents */}
          <div className="bg-blue-50 border-2 border-blue-500 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="#3b82f6">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              <span className="text-base font-semibold text-gray-700">
                {displaySnapshot.sharedDocCount.toLocaleString()} shared documents
                {displaySnapshot.uniqueCollaboratorCount > 0 && (
                  <> • {displaySnapshot.uniqueCollaboratorCount.toLocaleString()} collaborators</>
                )}
              </span>
            </div>
            {displaySnapshot.uniqueCollaboratorCount > 0 ? (
              <div className="text-sm text-blue-900 mt-1">
                You work with {displaySnapshot.uniqueCollaboratorCount.toLocaleString()}{' '}
                {displaySnapshot.uniqueCollaboratorCount === 1 ? 'person' : 'people'} across{' '}
                {displaySnapshot.sharedDocCount.toLocaleString()} documents
              </div>
            ) : isScanning ? (
              <div className="text-sm text-gray-500 mt-1">Analyzing your collaboration network...</div>
            ) : (
              <div className="text-sm text-gray-500 mt-1">No shared documents found</div>
            )}
          </div>

          {/* Supported Files */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="#10b981">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium text-gray-700">
                Processable: {displaySnapshot.supportedFileCount.toLocaleString()} documents (
                {formatBytes(displaySnapshot.supportedSizeBytes)})
              </span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <FileTypeList types={supportedTypes} emptyMessage="No processable documents found" />
            </div>
          </div>

          {/* Excluded Files */}
          <div className="mb-5">
            <div
              className="flex items-center gap-2 mb-2 cursor-pointer select-none"
              onClick={() => setIsExcludedExpanded(!isExcludedExpanded)}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="#9ca3af">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm font-medium text-gray-700 flex-1">
                Excluded: {displaySnapshot.unsupportedFileCount.toLocaleString()} files
              </span>
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="#6b7280"
                className={`transition-transform duration-200 ${isExcludedExpanded ? 'rotate-180' : ''}`}
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            {isExcludedExpanded && (
              <div className="bg-gray-50 rounded-lg p-3">
                {excludedTypes.length > 0 ? (
                  <>
                    <FileTypeList types={excludedTypes.slice(0, 5)} emptyMessage="" />
                    {excludedTypes.length > 5 && (
                      <div className="flex justify-between py-1.5 text-sm">
                        <span className="text-gray-400">+ {excludedTypes.length - 5} more types</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between py-1.5 text-sm">
                    <span className="text-gray-400">No excluded files</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Pane: Plan Limits and Prepare Section */}
        <div className="flex flex-col gap-5 min-h-0">
          {planLimits && <PlanLimitBar planLimits={planLimits} isScanning={isScanning} />}

          {isScanning && (
            <div className="flex gap-3 py-3 px-4 bg-blue-50 rounded-lg">
              <svg className="text-blue-500 flex-shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
              <div className="text-[0.8125rem] text-blue-900 leading-relaxed">
                This overview is based on file metadata only. No document content has been processed yet.
              </div>
            </div>
          )}

          {showPrepareSection && (
            <>
              {error && (
                <div className="bg-red-50 text-red-800 py-3 px-4 rounded-lg text-sm">{error}</div>
              )}

              <div className="flex gap-3 py-3 px-4 bg-yellow-50 rounded-lg">
                <svg
                  className="text-yellow-600 flex-shrink-0"
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="#d97706"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="text-[0.8125rem] text-yellow-900 leading-relaxed">
                  By continuing, BerkDoc will begin reading and analyzing your document content to organize
                  your Drive.
                </div>
              </div>

              <div className="mt-auto text-center">
                <button
                  className="px-8 py-3 text-base w-full rounded-lg text-sm font-medium cursor-pointer transition-colors bg-blue-500 text-white hover:bg-blue-600 border-none disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleConfirm}
                  disabled={isConfirming || !snapshot || snapshot.supportedFileCount === 0}
                >
                  {isConfirming ? (
                    <>
                      <span className="inline-block w-5 h-5 border-2 border-gray-200 border-t-white rounded-full animate-spin mr-2" />
                      Starting...
                    </>
                  ) : (
                    'Start Processing Documents'
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
