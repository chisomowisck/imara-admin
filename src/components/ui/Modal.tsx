import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, cn } from './primitives';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/60 p-0 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn(
          'card flex max-h-[92vh] w-full flex-col overflow-hidden rounded-b-none sm:rounded-(--radius-card)',
          { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size],
        )}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 id={titleId} className="text-sm font-semibold">
            {title}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800" aria-label="Close">
            <X className="size-4" />
          </button>
        </header>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/** Simple confirm for destructive actions without a mandatory reason. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary' | 'warning';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] text-zinc-600 dark:text-zinc-300">{message}</div>
    </Modal>
  );
}

/**
 * Mandatory-reason dialog used for every PRD action that requires a recorded
 * reason (suspend, reactivate, offboard, restore, module toggles, trial extension…).
 */
export function ReasonDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  presetReasons = [],
  confirmLabel = 'Confirm',
  tone = 'danger',
  loading,
  extra,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  description?: ReactNode;
  presetReasons?: string[];
  confirmLabel?: string;
  tone?: 'danger' | 'primary' | 'warning';
  loading?: boolean;
  extra?: ReactNode;
}) {
  const [preset, setPreset] = useState('');
  const [details, setDetails] = useState('');
  useEffect(() => {
    if (open) {
      setPreset('');
      setDetails('');
    }
  }, [open]);
  const reason = [preset, details.trim()].filter(Boolean).join(presetReasons.length && details.trim() ? ': ' : '');
  const valid = reason.trim().length >= 3;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} disabled={!valid} loading={loading} onClick={() => onConfirm(reason)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {description && <div className="text-[13px] text-zinc-600 dark:text-zinc-300">{description}</div>}
        {extra}
        {presetReasons.length > 0 && (
          <Field label="Reason" required>
            <Select value={preset} onChange={(e) => setPreset(e.target.value)}>
              <option value="">Select a reason…</option>
              {presetReasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={presetReasons.length ? 'Details' : 'Reason'} required={!presetReasons.length} hint="Recorded in the audit trail.">
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} placeholder="Explain why…" />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * Two-step confirmation (PRD: offboarding and restore). Step 1 explains the
 * consequences; step 2 asks for the reason and an explicit typed confirmation.
 */
export function TwoStepConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  consequences,
  confirmPhrase,
  confirmLabel,
  presetReasons = [],
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
  consequences: ReactNode;
  confirmPhrase: string;
  confirmLabel: string;
  presetReasons?: string[];
  loading?: boolean;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) {
      setStep(1);
      setReason('');
      setTyped('');
    }
  }, [open]);
  const ok = reason.trim().length >= 3 && typed.trim() === confirmPhrase;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${title} — step ${step} of 2`}
      size="md"
      footer={
        step === 1 ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setStep(2)}>
              I understand, continue
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button variant="danger" disabled={!ok} loading={loading} onClick={() => onConfirm(reason.trim())}>
              {confirmLabel}
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <div className="space-y-3">
          <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div className="text-[13px]">Review what will happen before continuing.</div>
          </div>
          <div className="text-[13px] text-zinc-700 dark:text-zinc-300">{consequences}</div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Reason" required hint="Recorded in the audit trail.">
            {presetReasons.length ? (
              <Select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="">Select a reason…</option>
                {presetReasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            ) : (
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
            )}
          </Field>
          <Field label={`Type "${confirmPhrase}" to confirm`} required>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
