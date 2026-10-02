import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b">
          <div>
            <h2 className="text-[15px] font-bold">{title}</h2>
            {subtitle && <p className="text-muted-foreground text-xs mt-0.5">{subtitle}</p>}
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close" data-testid="button-close-modal">
            <X size={14} />
          </button>
        </div>
        <div className="scroll px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t flex justify-end gap-2 bg-secondary/40">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, span = 1 }: { label: string; hint?: string; error?: string | null; children: ReactNode; span?: number }) {
  return (
    <label className="block" style={{ gridColumn: `span ${span}` }}>
      <span className="lbl block mb-1">{label}</span>
      {children}
      {error ? <span className="text-[11px] mt-1 block" style={{ color: 'hsl(var(--bad))' }}>{error}</span> : hint ? <span className="text-[11px] mt-1 block text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Check({ checked, onChange, label, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; testId?: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none h-[30px]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[hsl(332_72%_42%)]" data-testid={testId} />
      <span className="font-medium">{label}</span>
    </label>
  );
}

export function Pill({ tone = '', children }: { tone?: string; children: ReactNode }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Skeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skel" style={{ width: `${95 - ((i * 13) % 40)}%`, animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="m-6 border border-dashed rounded-lg py-12 px-6 text-center" style={{ borderColor: 'hsl(var(--input))' }}>
      <div className="font-bold text-[14px]">{title}</div>
      {body && <p className="text-muted-foreground mt-1 max-w-md mx-auto">{body}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorBlock({ onRetry, what }: { onRetry: () => void; what: string }) {
  return (
    <div className="m-6 panel p-6 flex items-center gap-4" style={{ borderColor: 'hsl(var(--bad))' }}>
      <AlertTriangle style={{ color: 'hsl(var(--bad))' }} />
      <div className="flex-1">
        <div className="font-bold">Could not load {what}</div>
        <div className="text-muted-foreground text-xs">The service did not respond as expected.</div>
      </div>
      <button className="btn" onClick={onRetry} data-testid="button-retry">Retry</button>
    </div>
  );
}

export function PageHead({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="no-print flex items-end justify-between gap-4 px-6 pt-5 pb-3 border-b bg-card/60">
      <div>
        <h1 className="text-[20px] font-bold tracking-tight leading-none">{title}</h1>
        {sub && <div className="text-muted-foreground mt-1.5 text-xs">{sub}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </header>
  );
}

export function ConfirmFoot({ onClose, onSave, busy, label = 'Save', disabled }: { onClose: () => void; onSave: () => void; busy?: boolean; label?: string; disabled?: boolean }) {
  return (
    <>
      <button className="btn" onClick={onClose} data-testid="button-cancel">Cancel</button>
      <button className="btn btn-primary" onClick={onSave} disabled={busy || disabled} data-testid="button-save">{busy ? 'Saving…' : label}</button>
    </>
  );
}
