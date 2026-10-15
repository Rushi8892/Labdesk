import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { getGetReportQueryKey, useGetReport, useGetResults } from '@workspace/api-client-react';
import { Empty, ErrorBlock, PageHead, Skeleton } from '@/components/kit';
import { fmtDate } from '@/lib/lab';

export default function ReportsPage() {
  const res = useGetResults();
  const [s, setS] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const completed = useMemo(() => {
    const t = s.trim().toLowerCase();
    return (res.data ?? []).filter((r) => r.status === 'Completed' && (!t || `${r.patientName} ${r.testName}`.toLowerCase().includes(t)))
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  }, [res.data, s]);
  const id = sel ?? 0;
  const rep = useGetReport(id, { query: { enabled: !!id, queryKey: getGetReportQueryKey(id) } });
  const r = rep.data;

  return (
    <>
      <PageHead title="Reports" sub="Completed results use the values and reference ranges captured at completion.">
        <button className="btn btn-primary" disabled={!r} onClick={() => window.print()} data-testid="button-print"><Printer size={14} /> Print</button>
      </PageHead>
      <div className="flex flex-1 min-h-0">
        <section className="no-print w-[380px] shrink-0 border-r flex flex-col">
          <div className="p-3 border-b"><input className="input" placeholder="Search patient or test" value={s} onChange={(e) => setS(e.target.value)} data-testid="input-search-reports" /></div>
          <div className="scroll flex-1">
            {res.isLoading && <Skeleton rows={8} />}
            {res.isError && <ErrorBlock what="results" onRetry={() => res.refetch()} />}
            {res.data && completed.length === 0 && <Empty title="No completed reports" body="Completed results appear here." />}
            <table className="tbl"><tbody>
              {completed.map((x) => (
                <tr key={x.id} className={`click ${x.id === sel ? 'sel' : ''}`} onClick={() => setSel(x.id)} data-testid={`row-report-${x.id}`}>
                  <td><div className="font-semibold">{x.patientName}</div></td>
                  <td><div>{x.testName}</div><div className="text-[11px] text-muted-foreground">{fmtDate(x.completedAt)}</div></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </section>
        <section className="scroll flex-1 p-6" style={{ background: 'hsl(var(--muted))' }}>
          {!id && <Empty title="Select a completed report" />}
          {id > 0 && rep.isLoading && <Skeleton rows={10} />}
          {id > 0 && rep.isError && <ErrorBlock what="the report snapshot" onRetry={() => rep.refetch()} />}
          {r && (
            <article className="report-sheet pop" data-testid="report-sheet">
              <div className="flex justify-between items-end pb-3" style={{ borderBottom: '2px solid #1a2326' }}>
                <h2 className="text-[22px] font-bold">{r.reportTitle || r.testName}</h2>
                <div className="mono text-right">{r.testCode}<br />Result #{r.resultId}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 py-3 text-[12.5px]">
                <div>Patient: <b>{r.patientName}</b></div><div>Test: <b>{r.testName}</b></div>
                <div>Age / sex: <b>{r.age} y · {r.sex}</b></div><div>Collected: <b>{fmtDate(r.collectedAt)}</b></div>
                <div>Completed: <b>{fmtDate(r.completedAt)}</b></div>
              </div>
              <table className="w-full text-[12.5px]" style={{ borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid #1a2326', textAlign: 'left' }}>
                  {['Parameter', 'Result', 'Unit', 'Reference', 'Flag'].map((h) => <th key={h} className="py-1.5 pr-2 text-[10.5px] uppercase tracking-wider">{h}</th>)}
                </tr></thead>
                <tbody>
                  {r.lines.map((l) => (
                      <tr key={l.parameterId} style={{ borderBottom: '1px solid #ddd8cc', verticalAlign: 'top' }} data-testid={`report-line-${l.parameterId}`}>
                        <td className="py-1.5 pr-2"><b>{l.name}</b></td>
                        <td className="py-1.5 pr-2 mono">{l.optionLabel || l.value}</td>
                        <td className="py-1.5 pr-2 mono">{l.unit}</td>
                        <td className="py-1.5 pr-2 mono">{l.referenceText}</td>
                        <td className="py-1.5 font-semibold">{l.flag}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </article>
          )}
        </section>
      </div>
    </>
  );
}
