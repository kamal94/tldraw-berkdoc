import { useOnboarding } from '../../hooks/useOnboarding';
import { StepConnectDrive } from './StepConnectDrive';
import { StepReviewDrive } from './StepReviewDrive';
import { StepOrganizeDrive } from './StepOrganizeDrive';

const STEP_CONFIG = {
  connect: {
    title: 'Connect Your Drive',
    subtitle: 'Securely connect your Google Drive to get started',
    component: StepConnectDrive,
    showBack: false,
    showNext: false,
  },
  review: {
    title: 'Your Drive at a Glance',
    subtitle: 'Here\'s what we found in your Google Drive',
    component: StepReviewDrive,
    showBack: false,
    showNext: false,
  },
  processing: {
    title: 'Organizing Your Drive',
    subtitle: 'Processing your documents to build your knowledge graph',
    component: StepOrganizeDrive,
    showBack: false,
    showNext: false,
  },
  complete: {
    title: 'All Done!',
    subtitle: 'Your Drive is ready to explore',
    component: StepOrganizeDrive,
    showBack: false,
    showNext: false,
  },
};

const STEPS_ORDER = ['connect', 'review', 'processing', 'complete'] as const;

export function OnboardingWizard() {
  const { step, needsOnboarding, isLoading, dismissOnboarding, isScanning } = useOnboarding();

  // Don't render if not needed
  if (!needsOnboarding || isLoading) {
    return null;
  }

  // Show review step during scanning (with live updates)
  const displayStep = isScanning && step === 'connect' ? 'review' : step;
  const currentConfig = STEP_CONFIG[displayStep];
  const StepComponent = currentConfig.component;
  const currentStepIndex = STEPS_ORDER.indexOf(displayStep);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000]"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
      onClick={(e) => e.target === e.currentTarget && dismissOnboarding()}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }
      `}</style>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-[900px] max-h-[90vh] overflow-hidden flex flex-col"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-0 border-b border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-900 m-0 mb-2">{currentConfig.title}</h2>
          <p className="text-sm text-gray-500 m-0 mb-4">{currentConfig.subtitle}</p>

          {/* Progress Steps */}
          <div className="flex gap-2 pb-4">
            {STEPS_ORDER.slice(0, 3).map((s, index) => (
              <div
                key={s}
                className={`flex-1 h-1 rounded transition-colors ${
                  index < currentStepIndex
                    ? 'bg-green-500'
                    : index === currentStepIndex
                    ? 'bg-blue-500'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          <StepComponent />
        </div>

        {/* Footer */}
        {(currentConfig.showBack || currentConfig.showNext) && (
          <div className="px-6 py-4 border-t border-gray-200 flex justify-between gap-3">
            {currentConfig.showBack ? (
              <button className="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 border-none">
                Back
              </button>
            ) : (
              <div />
            )}

            {currentConfig.showNext && (
              <button className="px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors bg-blue-500 text-white hover:bg-blue-600 border-none disabled:opacity-50 disabled:cursor-not-allowed">
                {currentConfig.nextLabel || 'Continue'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
