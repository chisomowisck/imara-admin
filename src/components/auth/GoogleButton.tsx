import { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    google?: any;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Google sign-in'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Renders Google's official button and returns the ID token through onCredential.
 * The token is verified by the backend; nothing is trusted client-side.
 */
export function GoogleButton({ clientId, onCredential, text = 'signin_with' }: { clientId: string; onCredential: (idToken: string) => void; text?: 'signin_with' | 'continue_with' }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;

  useEffect(() => {
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !ref.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res: { credential: string }) => callbackRef.current(res.credential),
          ux_mode: 'popup',
        });
        window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text, width: 320 });
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, text]);

  return (
    <div>
      <div ref={ref} className="flex justify-center" />
      {error && <p className="mt-1 text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}
