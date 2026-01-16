import { useOnboarding } from '../../hooks/useOnboarding';

export function StepConnectDrive() {
  const { startMetadataScan, isScanning, scanProgress, error } = useOnboarding();

  if (isScanning) {
    return (
      <div className="flex flex-col items-center py-10">
        <svg
          className="w-16 h-16 mb-4"
          style={{ animation: 'pulse 1.5s ease-in-out infinite' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
        >
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <div className="text-base font-medium text-gray-700 mb-2">Scanning your Drive...</div>
        <div className="text-sm text-gray-500">
          {scanProgress?.filesScanned
            ? `Scanned ${scanProgress.filesScanned.toLocaleString()} files so far...`
            : 'This may take a moment depending on your Drive size'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center py-5">
        <svg
          width="80"
          height="80"
          viewBox="0 0 24 24"
          fill="none"
          className="mx-auto mb-5"
        >
          <path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="#3b82f6"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <h3 className="text-lg font-semibold mb-2 text-gray-900">
          Let's scan your Google Drive
        </h3>

        <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
          We'll take a quick look at your Drive to show you what documents you have.
          This scan only reads file metadata - no document content will be accessed yet.
        </p>

        {error && (
          <div className="bg-red-50 text-red-800 py-3 px-4 rounded-lg mb-4 text-sm max-w-sm mx-auto">
            {error}
          </div>
        )}

        <button
          className="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors bg-blue-500 text-white hover:bg-blue-600 border-none disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={startMetadataScan}
        >
          Scan My Drive
        </button>
      </div>

      <div className="flex gap-3 py-3 px-4 bg-blue-50 rounded-lg mt-4">
        <svg className="text-blue-500 shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div className="text-[0.8125rem] text-blue-900 leading-relaxed">
          <strong>Read-only access:</strong> BerkDoc only reads your documents. We never modify, move,
          or delete any files in your Drive.
        </div>
      </div>
    </div>
  );
}
