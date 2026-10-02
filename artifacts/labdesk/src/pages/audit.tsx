import { useMemo, useState } from 'react';
import { useGetAudit } from '@workspace/api-client-react';
import { Empty, ErrorBlock, PageHead, Skeleton } from '@/components/kit';
import { fmtDate } from '@/lib/lab';

export default function AuditPage() {
  const q = useGetAudit();
  const [entity, setEntity] = useState('');
  const [s, setS] = useState('');
  const entities = useMemo(() => Array.from(new Set((q.data ?? []).map((e) => e.entity))).sort(), [q.data]);
  const rows = useMemo(() => {
    const t = s.trim().toLowerCase();
    return [...(q.data ?? [])]
      .filter((e) => (!entity || e.entity === entity) && (!t || `${e.action} ${e.actor} ${e.details}`.toLowerCase().includes(t)))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp) || b.id - a.id);
  }, [q.data, entity, s]);
  return (
    <>
      <PageHead title="Audit history" sub="Actor names are typed operator attribution, not authenticated identity." />
      <div className="flex gap-2 px-6 py-2.5 border-b">
        <input className="input w-72" placeholder="Search action, actor, details" value={s} onChange={(e) => setS(e.target.value)} data-testid="input-search-audit" />
        <select className="select w-44" value={entity} onChange={(e) => setEntity(e.target.value)} data-testid="select-audit-entity">
          <option value="">All entities</option>{entities.map((e) => <option key={e}>{e}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground self-center">{rows.length} events</span>
      </div>
      <div className="scroll flex-1">
        {q.isLoading && <Skeleton rows={10} />}
        {q.isError && <ErrorBlock what="audit history" onRetry={() => q.refetch()} />}
        {q.data && rows.length === 0 && <Empty title="No audit events" body="Configuration and result changes will be listed here." />}
        {rows.length > 0 && (
          <table className="tbl">
            <thead><tr><th>When</th><th>Entity</th><th>Id</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} data-testid={`row-audit-${e.id}`}>
                  <td className="mono whitespace-nowrap">{fmtDate(e.timestamp)}</td>
                  <td className="font-semibold">{e.entity}</td>
                  <td className="mono">{e.entityId}</td>
                  <td><span className="pill">{e.action}</span></td>
                  <td>{e.actor || '—'}</td>
                  <td className="text-muted-foreground">{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
