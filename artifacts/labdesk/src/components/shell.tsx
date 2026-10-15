import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, BookCheck, ClipboardList, FileText, FlaskConical, History, Layers, Ruler } from 'lucide-react';
import { useGetCatalog, useGetResults, useHealthCheck } from '@workspace/api-client-react';

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const cat = useGetCatalog();
  const res = useGetResults();
  const health = useHealthCheck();
  const open = (res.data ?? []).filter((r) => r.status === 'Draft').length;
  const unappr = (cat.data?.references ?? []).filter((r) => !r.approvedBy).length;
  const items = [
    { href: '/', label: 'Test catalog', icon: FlaskConical, count: cat.data?.tests.length, match: (l: string) => l === '/' || l.startsWith('/tests') },
    { href: '/results', label: 'Results', icon: ClipboardList, count: open || undefined, match: (l: string) => l.startsWith('/results') },
    { href: '/reports', label: 'Reports', icon: FileText, match: (l: string) => l.startsWith('/reports') },
    { href: '/masters', label: 'Masters', icon: Layers, match: (l: string) => l.startsWith('/masters') },
    { href: '/references', label: 'References', icon: Ruler, count: unappr || undefined, match: (l: string) => l.startsWith('/references') },
    { href: '/audit', label: 'Audit', icon: History, match: (l: string) => l.startsWith('/audit') },
  ];
  const ok = health.data?.status && !health.isError;
  return (
    <div className="shell flex h-screen overflow-hidden">
      <aside className="no-print w-[212px] shrink-0 flex flex-col" style={{ background: 'hsl(var(--sidebar))', color: 'hsl(var(--sidebar-foreground))' }}>
        <div className="px-4 pt-5 pb-4 flex items-center gap-2.5">
          <div className="size-8 rounded grid place-items-center" style={{ background: 'hsl(var(--sidebar-primary))' }}><BookCheck size={17} color="white" /></div>
          <div>
            <div className="font-bold text-[15px] leading-none" style={{ color: 'hsl(var(--sidebar-accent-foreground))' }}>LabDesk</div>
            <div className="text-[10px] tracking-widest uppercase mt-1 opacity-60">Workstation</div>
          </div>
        </div>
        <nav className="px-2 space-y-0.5 flex-1">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`navlink ${i.match(loc) ? 'on' : ''}`} data-testid={`link-nav-${i.label.toLowerCase().replace(/\s/g, '-')}`}>
              <i.icon size={15} />
              <span className="flex-1">{i.label}</span>
              {i.count !== undefined && <span className="mono opacity-70" data-testid={`text-count-${i.label.toLowerCase().replace(/\s/g, '-')}`}>{i.count}</span>}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
          <div className="flex items-center gap-1.5 text-[10px] opacity-70" data-testid="status-health">
            <Activity size={11} /> <span className="size-1.5 rounded-full" style={{ background: ok ? 'hsl(168 60% 50%)' : 'hsl(8 70% 55%)' }} /> {ok ? 'Service reachable' : health.isLoading ? 'Checking service' : 'Service unreachable'}
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">{children}</main>
    </div>
  );
}
