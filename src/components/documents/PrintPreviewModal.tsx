import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import type { PrintedDocument } from '@/api/documents';
import { Button } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { QueryState } from '@/components/ui/States';

/**
 * Shows server-rendered print HTML in a sandboxed iframe (never allow-scripts)
 * and prints it from the parent page.
 */
export function PrintPreviewModal({ open, onClose, queryKey, load, title }: { open: boolean; onClose: () => void; queryKey: unknown[]; load: () => Promise<PrintedDocument>; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const doc = useQuery({ queryKey: ['print', ...queryKey], queryFn: load, enabled: open, retry: false });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={doc.data?.title ?? title}
      size="xl"
      footer={
        <>
          <span className="mr-auto self-center text-xs text-zinc-500">To download a PDF, choose "Save as PDF" in the print dialog.{doc.data && <> Template: {doc.data.template.name}</>}</span>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button icon={<Printer className="size-4" />} disabled={!doc.data} onClick={() => frame.current?.contentWindow?.print()}>Print</Button>
        </>
      }
    >
      <QueryState query={doc}>
        {(d) => <iframe ref={frame} title={d.title} sandbox="allow-same-origin allow-modals" srcDoc={d.html} className="h-[65vh] w-full rounded border border-zinc-200 bg-white dark:border-zinc-800" />}
      </QueryState>
    </Modal>
  );
}
