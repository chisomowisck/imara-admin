import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import { Button } from './primitives';

export function LoadingState({ label = 'Loading…', rows = 5 }: { label?: string; rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action, icon }: { title?: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-zinc-100 p-3 text-zinc-400 dark:bg-zinc-800">{icon ?? <Inbox className="size-5" />}</div>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong';
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" role="alert">
      <div className="mb-3 rounded-full bg-red-50 p-3 text-red-500 dark:bg-red-950">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm font-medium">Could not load this data</p>
      <p className="mt-1 max-w-md text-[13px] text-zinc-500">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function ForbiddenState() {
  return (
    <EmptyState
      icon={<Lock className="size-5" />}
      title="You don't have access to this page"
      description="Ask a Super Administrator to grant your role the required permission."
    />
  );
}

/** Renders loading / error / empty / content for a react-query result. */
export function QueryState<T>({
  query,
  isEmpty,
  empty,
  children,
}: {
  query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data === undefined) return <LoadingState />;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState />}</>;
  return <>{children(query.data)}</>;
}
