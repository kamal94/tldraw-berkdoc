import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AuthModal } from './AuthModal';
import { UserMenu } from './UserMenu';

export function SignInButton() {
  const { isAuthenticated } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (isAuthenticated) {
    return <UserMenu />;
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed top-3 right-3 z-[9999] px-4 py-2 bg-[#1a73e8] hover:bg-[#1557b0] text-white text-sm font-medium rounded-lg shadow-lg transition-colors flex items-center gap-2"
        style={{ pointerEvents: 'auto' }}
      >
        Sign in to share
      </button>

      <AuthModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}

