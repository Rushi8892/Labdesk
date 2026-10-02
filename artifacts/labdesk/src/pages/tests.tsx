import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, Search } from 'lucide-react';
import { Empty, ErrorBlock, PageHead, Pill, Skeleton } from '@/components/kit';
import { TestEditor } from '@/components/editors';
import { useCatalog, useLab } from '@/hooks/use-lab';
import { readiness } from '@/lib/lab';

export default function TestsPage() {
  const { q, ix } = useCatalog();
  const lab = useLab();
  const [, nav] = useLocation();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('');
  const [spec, setSpec] = useState('');
  const [act, setAct] = useState('');
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    if (!ix) return [];
    const s = search.trim().toLowerCase();
    return [...ix.raw.tests]
      .filter((t) => (!cat || t.categoryId === Number(cat)) && (!spec || t.specimenTypeId === Number(spec)) && (!act || String(t.active) === act) &&
        (!s || `${t.code} ${t.name} ${t.shortName ?? ''}`.toLowerCase().includes(s)))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  }, [ix, search, cat, spec, act]);

  const totals = useMemo(() => {
    if (!ix) return null;
    return {
      tests: ix.raw.tests.length,
      params: ix.raw.parameters.length,
      refs: ix.raw.references.filter((r) => r.approvedBy).length,
      unapproved: ix.raw.references.filter((r) => !r.approvedBy).length,
      opts: ix.raw.options.length,
    };
  }, [ix]);

  return (
    <>
      <PageHead title="Test catalog" sub={totals ? <span data-testid="text-catalog-summary">{totals.tests} tests · {totals.params} parameters · {totals.opts} options · {totals.refs} approved / {totals.unapproved} unapproved references</span> : 'Loading configuration'}>
        <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!ix} data-testid="button-new-test"><Plus size={14} /> New test</button>
      </PageHead>
      <div className="no-print flex items-center gap-2 px-6 py-2.5 border-b">
        <div className="relative w-72">
          <Search size={13} className="absolute left-2.5 top-2.5 text-muted-foreground" />
          <input className="input pl-8" placeholder="Search code or name" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-tests" />
        </div>
        <select className="select w-44" value={cat} onChange={(e) => setCat(e.target.value)} data-testid="select-filter-category">
          <option value="">All categories</option>{ix?.raw.categories.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="select w-44" value={spec} onChange={(e) => setSpec(e.target.value)} data-testid="select-filter-specimen">
          <option value="">All specimens</option>{ix?.raw.specimens.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select className="select w-36" value={act} onChange={(e) => setAct(e.target.value)} data-testid="select-filter-active">
          <option value="">Active + inactive</option><option value="true">Active only</option><option value="false">Inactive only</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground" data-testid="text-row-count">{rows.length} shown</span>
      </div>
      <div className="scroll flex-1">
        {q.isLoading && <Skeleton rows={12} />}
        {q.isError && <ErrorBlock what="the catalog" onRetry={() => q.refetch()} />}
        {ix && rows.length === 0 && <Empty title={ix.raw.tests.length ? 'No tests match these filters' : 'No tests defined'} body={ix.raw.tests.length ? undefined : 'Create a test, then add parameters, options and references.'} action={!ix.raw.tests.length ? <button className="btn btn-primary" onClick={() => setCreating(true)}>New test</button> : undefined} />}
        {ix && rows.length > 0 && (
          <table className="tbl">
            <thead><tr><th>Code</th><th>Test</th><th>Category</th><th>Specimen</th><th>Method</th><th>Params</th><th>Configuration</th><th>Price</th><th>Active</th></tr></thead>
            <tbody>
              {rows.map((t) => {
                const r = readiness(t, ix);
                return (
                  <tr key={t.id} className={`click ${t.active ? '' : 'off'}`} onClick={() => nav(`/tests/${t.id}`)} data-testid={`row-test-${t.id}`}>
                    <td className="mono font-semibold">{t.code}</td>
                    <td><div className="font-semibold">{t.name}</div>{t.shortName && <div className="text-[11px] text-muted-foreground">{t.shortName}</div>}</td>
                    <td>{ix.cat.get(t.categoryId)?.name ?? '—'}</td>
                    <td>{ix.spec.get(t.specimenTypeId)?.name ?? '—'}</td>
                    <td>{t.methodId ? ix.meth.get(t.methodId)?.name ?? '—' : <span className="text-muted-foreground">—</span>}</td>
                    <td className="mono">{r.params}</td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {r.params === 0 ? <Pill tone="pill-warn">No parameters</Pill> : (
                          <>
                            <Pill tone={r.needRef === 0 || r.withRef === r.needRef ? 'pill-ok' : 'pill-hatch'}>Refs {r.withRef}/{r.needRef}</Pill>
                            {r.dropNoOpts > 0 && <Pill tone="pill-warn">{r.dropNoOpts} dropdown no options</Pill>}
                            {r.unapproved > 0 && <Pill tone="pill-hatch">{r.unapproved} unapproved</Pill>}
                          </>
                        )}
                      </div>
                    </td>
                    <td className="mono">{t.price.toFixed(2)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <button className={`btn btn-sm ${t.active ? '' : 'btn-ghost'}`} disabled={lab.saveTest.isPending}
                        onClick={() => lab.saveTest.mutate({ data: { ...t, active: !t.active } })} data-testid={`button-toggle-test-${t.id}`}>
                        {t.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {creating && ix && <TestEditor ix={ix} onClose={() => setCreating(false)} onSaved={(t) => { setCreating(false); nav(`/tests/${t.id}`); }} />}
    </>
  );
}
