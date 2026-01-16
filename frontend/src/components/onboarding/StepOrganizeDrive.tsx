import { useOnboarding } from '../../hooks/useOnboarding';

interface ProgressCircleProps {
  size: number;
  strokeWidth: number;
  percentComplete: number;
  isComplete: boolean;
}

function ProgressCircle({ size, strokeWidth, percentComplete, isComplete }: ProgressCircleProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentComplete / 100) * circumference;

  return (
    <svg width={size} height={size} className="mx-auto mb-6 block">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={isComplete ? '#10b981' : '#3b82f6'}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={isComplete ? 0 : offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="transition-[stroke-dashoffset] duration-300 ease-out"
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize="24"
        fontWeight="600"
        fill={isComplete ? '#10b981' : '#111827'}
      >
        {isComplete ? 'Done!' : `${percentComplete}%`}
      </text>
    </svg>
  );
}

export function StepOrganizeDrive() {
  const { progress, dismissOnboarding } = useOnboarding();

  const filesProcessed = progress?.filesProcessed ?? 0;
  const filesTotal = progress?.filesTotal ?? 1;
  const percentComplete = progress?.percentComplete ?? 0;
  const isComplete = progress?.isComplete ?? false;

  const size = 120;
  const strokeWidth = 8;

  if (isComplete) {
    return (
      <div className="text-center py-10">
        <ProgressCircle size={size} strokeWidth={strokeWidth} percentComplete={100} isComplete={true} />

        <h3 className="text-xl font-semibold mb-2 text-gray-900">Your Drive is ready!</h3>

        <p className="text-gray-500 text-sm mb-6">
          We've processed {filesTotal.toLocaleString()} documents. Your canvas is now populated with
          your organized documents.
        </p>

        <button
          className="px-8 py-3 text-base rounded-lg text-sm font-medium cursor-pointer transition-colors bg-blue-500 text-white hover:bg-blue-600 border-none"
          onClick={dismissOnboarding}
        >
          Start Exploring
        </button>
      </div>
    );
  }

  return (
    <div className="text-center py-10">
      <ProgressCircle
        size={size}
        strokeWidth={strokeWidth}
        percentComplete={percentComplete}
        isComplete={false}
      />

      <h3 className="text-lg font-semibold mb-2 text-gray-900">Processing your documents...</h3>

      <div className="text-gray-500 text-sm mb-6">
        {filesProcessed.toLocaleString()} of {filesTotal.toLocaleString()} documents processed
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="animate-spin"
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          Analyzing content and building connections...
        </div>
      </div>

      <div className="flex gap-3 py-3 px-4 bg-blue-50 rounded-lg mt-8 text-left">
        <svg className="text-blue-500 flex-shrink-0" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div className="text-[0.8125rem] text-blue-900 leading-relaxed">
          You can close this dialog and continue using BerkDoc. Processing will continue in the
          background and your canvas will update automatically.
        </div>
      </div>

      <button
        className="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 border-none mt-4"
        onClick={dismissOnboarding}
      >
        Continue in Background
      </button>
    </div>
  );
}
