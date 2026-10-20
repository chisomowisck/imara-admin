import { Loader2 } from 'lucide-react';

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin text-accent-600`} aria-label="Loading" />;
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-7" />
    </div>
  );
}
