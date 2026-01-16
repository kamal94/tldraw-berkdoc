import { useState, useRef, useEffect } from 'react';
import { useEditor, useValue } from 'tldraw';
import { useAuth } from '../hooks/useAuth';
import { useCachedAvatarUrl } from '../hooks/useCachedAvatarUrl';
import { AuthModal } from './AuthModal';

interface SharePanelProps {
  onViewDuplicates?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function CollaboratorAvatars() {
  const editor = useEditor();
  const collaborators = useValue('presences', () => {
    if (!editor) return [];
    return editor.getCollaborators();
  }, [editor]);

  if (!editor || collaborators.length === 0) return null;

  const visibleCollaborators = collaborators.slice(0, 3);
  const remainingCount = collaborators.length - 3;

  return (
    <div className="flex items-center gap-1.5 -mr-1">
      {visibleCollaborators.map((collab) => {
        const initials = collab.userName
          ? getInitials(collab.userName)
          : collab.userId.slice(0, 2).toUpperCase();
        const displayName = collab.userName || `User ${collab.userId.slice(0, 4)}`;

        return (
          <div
            key={collab.userId}
            className="w-7 h-7 rounded-full border-2 border-white shadow-md flex items-center justify-center text-white text-xs font-medium"
            style={{ backgroundColor: collab.color }}
            title={displayName}
          >
            {initials}
          </div>
        );
      })}
      {remainingCount > 0 && (
        <div
          className="w-7 h-7 rounded-full border-2 border-white shadow-md bg-gray-400 flex items-center justify-center text-white text-xs font-medium"
          title={`+${remainingCount} more`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, handler]);
}

function SignInButton({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="flex items-center justify-end w-full m-2" style={{ pointerEvents: 'auto' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSignIn();
        }}
        className="px-4 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-sm font-medium rounded-lg shadow-lg transition-colors flex items-center gap-2"
        style={{ pointerEvents: 'auto' }}
      >
        Sign in to share
      </button>
    </div>
  );
}

function UserAvatarButton({
  avatarUrl,
  initials,
  userName,
  onClick,
}: {
  avatarUrl: string | null | undefined;
  initials: string;
  userName: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-lg hover:shadow-xl transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      style={{ pointerEvents: 'auto' }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-[#1a73e8] flex items-center justify-center text-white text-xs font-medium">
          {initials}
        </div>
      )}
    </button>
  );
}

function UserMenu({
  user,
  avatarUrl,
  initials,
  onViewDuplicates,
  onLogout,
}: {
  user: { name: string; email: string };
  avatarUrl: string | null | undefined;
  initials: string;
  onViewDuplicates?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden z-1000">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {avatarUrl ? (
            <img src={avatarUrl} alt={user.name} className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#1a73e8] flex items-center justify-center text-white text-sm font-medium">
              {initials}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-gray-900 font-medium truncate">{user.name}</p>
            <p className="text-gray-500 text-sm truncate">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="p-2">
        {onViewDuplicates && (
          <button
            onClick={onViewDuplicates}
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            View Duplicates
          </button>
        )}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );
}

export function SharePanel({ onViewDuplicates }: SharePanelProps) {
  const { user, isAuthenticated, logout } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const avatarUrl = useCachedAvatarUrl(user?.avatarUrl);
  useClickOutside(menuRef, () => setIsMenuOpen(false));

  if (!isAuthenticated || !user) {
    return (
      <>
        <SignInButton onSignIn={() => setIsModalOpen(true)} />
        <AuthModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  const initials = getInitials(user.name);

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMenuOpen(!isMenuOpen);
  };

  const handleViewDuplicates = () => {
    setIsMenuOpen(false);
    onViewDuplicates?.();
  };

  const handleLogout = () => {
    setIsMenuOpen(false);
    logout();
  };

  return (
    <div ref={menuRef} className="relative flex items-center justify-end w-full m-2 gap-2" style={{ pointerEvents: 'auto' }}>
      <CollaboratorAvatars />
      <UserAvatarButton
        avatarUrl={avatarUrl}
        initials={initials}
        userName={user.name}
        onClick={handleAvatarClick}
      />
      {isMenuOpen && (
        <UserMenu
          user={user}
          avatarUrl={avatarUrl}
          initials={initials}
          onViewDuplicates={handleViewDuplicates}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}
