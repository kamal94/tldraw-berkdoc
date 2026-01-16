export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="text-2xl font-semibold text-slate-900">{message}</div>
        <div className="mt-2 text-sm text-slate-500">Please wait</div>
      </div>
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
      <div className="text-center text-red-600">
        <div className="text-2xl font-semibold">{title}</div>
        {message && <div className="mt-2 text-sm">{message}</div>}
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
