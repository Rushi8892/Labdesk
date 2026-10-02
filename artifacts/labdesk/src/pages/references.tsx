import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import type { ReferenceInterval } from '@workspace/api-client-react';
import { Empty, ErrorBlock, PageHead, Pill, Skeleton } from '@/components/kit';
import { ApproveDialog, ReferenceEditor } from '@/components/reference';
import { useCatalog, useLab } from '@/hooks/use-lab';
import { fmtAge, fmtRange, isApproved } from '@/lib/lab';

export default function ReferencesPage() {
  const { q, ix } = useCatalog();
  const lab = useLab();
  const [status, setStatus] = useState('unapproved');
  const [testId, setTestId] = useState('');
  const [s, setS] = useState('');
  const [approve, setApprove] = useState<ReferenceInterval | null>(null);
  const [edit, setEdit] = useState<ReferenceInterval | null>(null);
  const contexts = useMemo(() => Array.from(new Set((ix?.raw.references ?? []).map((r) => r.context))).filter(Boolean), [ix]);

  const rows = useMemo(() => {
    if (!ix) return [];
    const t = s.trim().toLowerCase();
    return ix.raw.references.map((r) => ({ r, p: ix.paramById.get(r.parameterId) })).filter((x) => x.p)
      .map((x) => ({ r: x.r, p: x.p!, t: ix.testById.get(x.p!.testId) }))
      .filter((x) => (!testId || x.p.testId === Number(testId)) &&
        (status === 'all' || (status === 'unapproved' && !isApproved(x.r)) || (status === 'approved' && isApproved(x.r)) || (status === 'inactive' && !x.r.active)) &&
        (!t || `${x.p.name} ${x.p.code} ${x.t?.name ?? ''} ${x.r.context}`.toLowerCase().includes(t)));
  }, [ix, status, testId, s]);

  const total = ix?.raw.references.length ?? 0;
  const un = ix?.raw.references.filter((r) => !isApproved(r)).length ?? 0;
  const editParam = edit ? ix?.paramById.get(edit.parameterId) : undefined;
  const apParam = approve ? ix?.paramById.get(approve.parameterId) : undefined;

  return (
    <>
      <PageHead title="Reference approvals" sub={ix ? <span data-testid="text-ref-summary">{total} intervals · {un} awaiting approval · {total - un} approved. All entered by the lab.</span> : 'Loading'} />
      <div className="flex gap-2 px-6 py-2.5 border-b">
        <input className="input w-72" placeholder="Search parameter, test, context" value={s} onChange={(e) => setS(e.target.value)} data-testid="input-search-refs" />
        <select className="select w-44" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-ref-status">
          <option value="unapproved">Unapproved</option><option value="approved">Approved</option><option value="inactive">Inactive</option><option value="all">All</option>
        </select>
        <select className="select w-56" value={testId} onChange={(e) => setTestId(e.target.value)} data-testid="select-ref-test">
          <option value="">All tests</option>{ix?.raw.tests.map((t) => <option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}
        </select>
      </div>
      <div className="scroll flex-1">
        {q.isLoading && <Skeleton rows={8} />}
        {q.isError && <ErrorBlock what="references" onRetry={() => q.refetch()} />}
        {ix && rows.length === 0 && <Empty title={total === 0 ? 'No reference intervals configured' : 'Nothing matches'} body={total === 0 ? 'The starter catalog has none. Open a test, select a parameter and add the intervals your lab uses. Until then results show Not configured.' : undefined} />}
        {rows.length > 0 && (
          <table className="tbl">
            <thead><tr><th>Status</th><th>Test / parameter</th><th>Context</th><th>Sex</th><th>Age</th><th>Interval</th><th>Effective</th><th>Approval</th><th /></tr></thead>
            <tbody>
              {rows.map(({ r, p, t }) => (
                <tr key={r.id} className={r.active ? '' : 'off'} data-testid={`row-ref-${r.id}`}>
                  <td><Pill tone={isApproved(r) ? 'pill-ok' : 'pill-hatch'}>{isApproved(r) ? 'Approved' : 'Unapproved'}</Pill> <Pill>v{r.version ?? 1}</Pill></td>
                  <td><Link href={`/tests/${p.testId}`} className="font-semibold hover:underline">{p.name}</Link><div className="text-[11px] text-muted-foreground">{t?.code} · {t?.name}</div></td>
                  <td>{r.context}</td><td>{r.sex}</td><td className="mono">{fmtAge(r)}</td>
                  <td className="mono">{fmtRange(r)} {r.unit}</td>
                  <td className="mono">{r.effectiveFrom || '…'} to {r.effectiveTo || '…'}</td>
                  <td className="text-xs">{isApproved(r) ? `${r.approvedBy}` : '—'}</td>
                  <td className="text-right whitespace-nowrap">
                    {!isApproved(r) && <button className="btn btn-sm btn-primary" onClick={() => setApprove(r)} data-testid={`button-approve-ref-${r.id}`}>Approve</button>}{' '}
                    <button className="btn btn-sm" onClick={() => setEdit(r)} data-testid={`button-edit-ref-${r.id}`}>{isApproved(r) ? 'New version' : 'Edit'}</button>{' '}
                    <button className="btn btn-sm" onClick={() => lab.saveReference.mutate({ data: { ...r, active: !r.active } })} data-testid={`button-toggle-ref-${r.id}`}>{r.active ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && editParam && <ReferenceEditor param={editParam} reference={edit} contexts={contexts} onClose={() => setEdit(null)} />}
      {approve && apParam && <ApproveDialog reference={approve} label={`${apParam.name}: ${fmtRange(approve)} (${approve.context})`} onClose={() => setApprove(null)} />}
    </>
  );
}
