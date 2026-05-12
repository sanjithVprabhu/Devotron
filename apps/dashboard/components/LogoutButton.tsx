'use client';

export function LogoutButton() {
  return (
    <button
      onClick={async () => {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
      className="text-xs text-zinc-500 hover:text-zinc-900 underline-offset-2 hover:underline text-left"
    >
      Sign out
    </button>
  );
}
