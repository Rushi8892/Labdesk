import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useGetResults } from '@workspace/api-client-react';
import { Empty, ErrorBlock, PageHead, Pill, Skeleton } from '@/components/kit';
import { ResultEntry } from '@/components/result-entry';
import { useCatalog } from '@/hooks/use-lab';
import { fmtDate, statusTone } from '@/lib/lab';

const STATUSES = ['Draft', 'Entered', 'Verified', 'Released'];

export default function ResultsPage() {
  const res = useGetResults();
  const { ix } = useCatalog();
  const [sel, setSel] = useState<number | 'new' | null>(null);
  const [status, setStatus] = useState('');
  const [s, setS] = useState('');
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    (res.data ?? []).forEach((r) => { m[r.status] = (m[r.status] ?? 0) + 1; });
    return m;
  }, [res.data]);
  const rows = useMemo(() => {
    const t = s.trim().toLowerCase();
    return [...(res.data ?? [])].filter((r) => (!status || r.status === status) && (!t || `${r.patientName} ${r.patientCode} ${r.testName}`.toLowerCase().includes(t)))
      .sort((a, b) => b.id - a.id);
  }, [res.data, status, s]);
  const current = typeof sel === 'number' ? res.data?.find((r) => r.id === sel) : undefined;
  const key = sel === 'new' ? 'new' : current ? `${current.id}-${current.status}-${current.updatedAt ?? ''}` : 'none';

  return (
    <>
      <PageHead title="Results" sub={res.data ? `${res.data.length} results · ${counts.Draft ?? 0} draft · ${counts.Entered ?? 0} entered · ${counts.Verified ?? 0} verified · ${counts.Released ?? 0} released` : 'Loading worklist'}>
        <button className="btn btn-primary" onClick={() => setSel('new')} disabled={!ix} data-testid="button-new-result"><Plus size={14} /> New result</button>
      </PageHead>
      <div className="flex flex-1 min-h-0">
        <section className="w-[400px] shrink-0 border-r flex flex-col">
          <div className="p-3 border-b space-y-2">
            <input className="input" placeholder="Search patient, code, test" value={s} onChange={(e) => setS(e.target.value)} data-testid="input-search-results" />
            <div className="flex gap-1 flex-wrap">
              {['', ...STATUSES].map((st) => (
                <button key={st} onClick={() => setStatus(st)} className={`btn btn-sm ${status === st ? 'btn-ink' : ''}`} data-testid={`filter-status-${st || 'all'}`}>{st || 'All'}{st ? ` ${counts[st] ?? 0}` : ''}</button>
              ))}
            </div>
          </div>
          <div className="scroll flex-1">
            {res.isLoading && <Skeleton rows={9} />}
            {res.isError && <ErrorBlock what="the worklist" onRetry={() => res.refetch()} />}
            {res.data && rows.length === 0 && <Empty title={res.data.length ? 'Nothing matches' : 'Worklist is empty'} body={res.data.length ? undefined : 'Start a new result to enter values against any configured test.'} />}
            <table className="tbl"><tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`click ${r.id === sel ? 'sel' : ''}`} onClick={() => setSel(r.id)} data-testid={`row-result-${r.id}`}>
                  <td><div className="font-semibold">{r.patientName}</div><div className="mono text-muted-foreground">{r.patientCode}</div></td>
                  <td><div>{r.testName}</div><div className="text-[11px] text-muted-foreground">{fmtDate(r.collectedAt)}</div></td>
                  <td><Pill tone={statusTone(r.status)}>{r.status}</Pill></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </section>
        <section className="flex-1 min-w-0 min-h-0">
          {!ix || sel === null || (sel !== 'new' && !current) ? <Empty title="Select a result or start a new one" body="Fields, validation and reference intervals are generated from the test configuration." /> :
            <ResultEntry key={key} result={current} ix={ix} onSaved={(id) => setSel(id)} />}
        </section>
      </div>
    </>
  );
}
