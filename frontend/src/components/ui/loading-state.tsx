import type { ReactNode } from "react";

const CONTAINER_CLASSES = "fixed inset-0 flex items-center justify-center bg-slate-50";
const CONTENT_CLASSES = "text-center";
const TITLE_CLASSES = "text-2xl font-semibold";
const MESSAGE_CLASSES = "mt-2 text-sm";
const BUTTON_CLASSES =
  "mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800";

function StateContainer({ children, textColor = "text-slate-900" }: { children: ReactNode; textColor?: string }) {
  return (
    <div className={CONTAINER_CLASSES}>
      <div className={`${CONTENT_CLASSES} ${textColor}`}>{children}</div>
    </div>
  );
}

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return (
    <StateContainer>
      <div className={TITLE_CLASSES}>{message}</div>
      <div className={`${MESSAGE_CLASSES} text-slate-500`}>Please wait</div>
    </StateContainer>
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
    <StateContainer textColor="text-red-600">
      <div className={TITLE_CLASSES}>{title}</div>
      {message && <div className={MESSAGE_CLASSES}>{message}</div>}
      {onRetry && (
        <button onClick={onRetry} className={BUTTON_CLASSES}>
          Retry
        </button>
      )}
    </StateContainer>
  );
}

export function UnauthorizedState({
  title = 'Unauthorized access',
  message = "You don't have access to this board.",
  actionLabel,
  onAction,
}: {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <StateContainer>
      <div className={TITLE_CLASSES}>{title}</div>
      <div className={`${MESSAGE_CLASSES} text-slate-500`}>{message}</div>
      {onAction && actionLabel && (
        <button onClick={onAction} className={BUTTON_CLASSES}>
          {actionLabel}
        </button>
      )}
    </StateContainer>
  );
}
