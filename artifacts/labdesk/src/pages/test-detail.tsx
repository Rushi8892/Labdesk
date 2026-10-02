import { useMemo, useState } from 'react';
import { Link, useParams } from 'wouter';
import { ArrowDown, ArrowLeft, ArrowUp, Plus } from 'lucide-react';
import type { ParameterOption, ReferenceInterval, TestParameter } from '@workspace/api-client-react';
import { Empty, ErrorBlock, PageHead, Pill, Skeleton } from '@/components/kit';
import { OptionEditor, ParameterEditor, TestEditor } from '@/components/editors';
import { ApproveDialog, ReferenceEditor } from '@/components/reference';
import { useCatalog, useLab } from '@/hooks/use-lab';
import { fmtAge, fmtRange, isApproved } from '@/lib/lab';

export default function TestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { q, ix } = useCatalog();
  const lab = useLab();
  const [selId, setSelId] = useState<number | null>(null);
  const [editTest, setEditTest] = useState(false);
  const [editParam, setEditParam] = useState<{ p?: TestParameter } | null>(null);
  const [editOpt, setEditOpt] = useState<{ o?: ParameterOption } | null>(null);
  const [editRef, setEditRef] = useState<{ r?: ReferenceInterval } | null>(null);
  const [approve, setApprove] = useState<ReferenceInterval | null>(null);

  const test = ix?.testById.get(id);
  const plist = useMemo(() => ix?.paramsByTest.get(id) ?? [], [ix, id]);
  const sel = plist.find((p) => p.id === selId) ?? plist[0];
  const opts = sel ? ix?.optsByParam.get(sel.id as number) ?? [] : [];
  const refs = sel ? ix?.refsByParam.get(sel.id as number) ?? [] : [];
  const contexts = useMemo(() => Array.from(new Set((ix?.raw.references ?? []).map((r) => r.context))).filter(Boolean), [ix]);

  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= plist.length) return;
    const arr = [...plist];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const changed = arr.map((p, k) => ({ p, order: (k + 1) * 10 })).filter((x) => x.p.displayOrder !== x.order);
    for (const c of changed) await lab.saveParameter.mutateAsync({ data: { ...c.p, displayOrder: c.order } }).catch(() => undefined);
  };

  if (q.isLoading) return <Skeleton rows={12} />;
  if (q.isError) return <ErrorBlock what="the test" onRetry={() => q.refetch()} />;
  if (!ix || !test) return <Empty title="Test not found" action={<Link href="/" className="btn">Back to catalog</Link>} />;

  const info: [string, string | undefined][] = [
    ['Category', ix.cat.get(test.categoryId)?.name], ['Specimen', ix.spec.get(test.specimenTypeId)?.name],
    ['Method', test.methodId ? ix.meth.get(test.methodId)?.name : 'None'], ['Container', test.container], ['Min. sample', test.minimumSample],
    ['Turnaround', test.turnaroundTime], ['Price', test.price.toFixed(2)], ['Display order', String(test.displayOrder)],
    ['Report title', test.reportTitle], ['Short name', test.shortName],
  ];
  const long: [string, string | undefined][] = [['Description', test.description], ['Patient preparation', test.patientPreparation], ['Collection', test.collectionInstructions], ['Notes', test.notes]];

  return (
    <>
      <PageHead title={`${test.code} · ${test.name}`} sub={<Link href="/" className="inline-flex items-center gap-1 hover:underline" data-testid="link-back-catalog"><ArrowLeft size={11} /> Test catalog</Link>}>
        <Pill tone={test.active ? 'pill-ok' : ''}>{test.active ? 'Active' : 'Inactive'}</Pill>
        <button className="btn" onClick={() => lab.saveTest.mutate({ data: { ...test, active: !test.active } })} data-testid="button-toggle-test">{test.active ? 'Deactivate' : 'Activate'}</button>
        <button className="btn btn-ink" onClick={() => setEditTest(true)} data-testid="button-edit-test">Edit test</button>
      </PageHead>
      <div className="px-6 py-3 border-b grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {info.map(([k, v]) => <div key={k}><div className="lbl">{k}</div><div className="font-medium truncate">{v || <span className="text-muted-foreground">—</span>}</div></div>)}
        {long.filter(([, v]) => v).map(([k, v]) => <div key={k} style={{ gridColumn: 'span 2' }}><div className="lbl">{k}</div><div className="text-xs">{v}</div></div>)}
      </div>
      <div className="flex flex-1 min-h-0">
        <section className="flex-1 min-w-0 flex flex-col border-r">
          <div className="flex items-center justify-between px-6 py-2 border-b">
            <div className="font-bold">Parameters <span className="mono text-muted-foreground">{plist.length}</span></div>
            <button className="btn btn-primary btn-sm" onClick={() => setEditParam({})} data-testid="button-new-parameter"><Plus size={12} /> Add parameter</button>
          </div>
          <div className="scroll flex-1">
            {plist.length === 0 ? <Empty title="No parameters yet" body="Add the first parameter to start defining what this test reports." action={<button className="btn btn-primary" onClick={() => setEditParam({})}>Add parameter</button>} /> : (
              <table className="tbl">
                <thead><tr><th>Order</th><th>Code</th><th>Name</th><th>Type</th><th>Unit</th><th>Ref. type</th><th>Req</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {plist.map((p, i) => (
                    <tr key={p.id} className={`click ${p.id === sel?.id ? 'sel' : ''} ${p.active ? '' : 'off'}`} onClick={() => setSelId(p.id as number)} data-testid={`row-param-${p.id}`}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-0.5">
                          <button className="btn btn-ghost btn-icon btn-sm" disabled={i === 0 || lab.saveParameter.isPending} onClick={() => move(i, -1)} aria-label="Move up" data-testid={`button-up-${p.id}`}><ArrowUp size={12} /></button>
                          <button className="btn btn-ghost btn-icon btn-sm" disabled={i === plist.length - 1 || lab.saveParameter.isPending} onClick={() => move(i, 1)} aria-label="Move down" data-testid={`button-down-${p.id}`}><ArrowDown size={12} /></button>
                          <span className="mono text-muted-foreground ml-1">{p.displayOrder}</span>
                        </span>
                      </td>
                      <td className="mono font-semibold">{p.code}</td>
                      <td className="font-semibold">{p.name}</td>
                      <td>{p.dataType}</td>
                      <td className="mono">{p.unit || '—'}</td>
                      <td>{p.referenceType}</td>
                      <td>{p.required ? 'Yes' : 'No'}</td>
                      <td><Pill tone={p.active ? 'pill-ok' : ''}>{p.active ? 'Active' : 'Inactive'}</Pill></td>
                      <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-sm" onClick={() => setEditParam({ p })} data-testid={`button-edit-param-${p.id}`}>Edit</button>{' '}
                        <button className="btn btn-sm" onClick={() => lab.saveParameter.mutate({ data: { ...p, active: !p.active } })} data-testid={`button-toggle-param-${p.id}`}>{p.active ? 'Deactivate' : 'Activate'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <aside className="w-[500px] shrink-0 flex flex-col bg-card/50 min-h-0">
          {!sel ? <Empty title="Select a parameter" body="Options and reference intervals appear here." /> : (
            <div className="scroll flex-1 pop" key={sel.id}>
              <div className="px-5 py-3 border-b">
                <div className="lbl">Selected parameter</div>
                <div className="font-bold text-[15px]">{sel.name} <span className="mono text-muted-foreground">{sel.code}</span></div>
                <div className="text-xs text-muted-foreground mt-1">
                  {sel.dataType}{sel.unit ? ` · ${sel.unit}` : ''}{sel.dataType === 'Numeric' ? ` · decimals ${sel.decimalPlaces ?? 'any'} · technical ${sel.technicalMin ?? '−∞'} to ${sel.technicalMax ?? '+∞'} · negative ${sel.allowNegative ? 'allowed' : 'blocked'}` : ''}
                </div>
                {sel.notes && <div className="text-xs mt-1">Note: {sel.notes}</div>}
              </div>
              {sel.dataType === 'Dropdown' && (
                <div className="px-5 py-3 border-b">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-bold">Options <span className="mono text-muted-foreground">{opts.length}</span></div>
                    <button className="btn btn-sm btn-primary" onClick={() => setEditOpt({})} data-testid="button-new-option"><Plus size={12} /> Add option</button>
                  </div>
                  {opts.length === 0 ? <div className="text-xs p-3 rounded border border-dashed" style={{ color: 'hsl(var(--warn))' }}>No options configured. Result entry cannot accept a value until options are added.</div> : (
                    <table className="tbl">
                      <thead><tr><th>Sort</th><th>Code</th><th>Label</th><th>Flag</th><th /></tr></thead>
                      <tbody>
                        {opts.map((o) => (
                          <tr key={o.id} className={o.active ? '' : 'off'} data-testid={`row-option-${o.id}`}>
                            <td className="mono">{o.sortOrder}</td><td className="mono">{o.code}</td><td>{o.label}</td>
                            <td>{o.abnormal ? <Pill tone="pill-warn">Abnormal</Pill> : <span className="text-muted-foreground">—</span>}</td>
                            <td className="text-right whitespace-nowrap">
                              <button className="btn btn-sm" onClick={() => setEditOpt({ o })} data-testid={`button-edit-option-${o.id}`}>Edit</button>{' '}
                              <button className="btn btn-sm" onClick={() => lab.saveOption.mutate({ data: { ...o, active: !o.active } })} data-testid={`button-toggle-option-${o.id}`}>{o.active ? 'Off' : 'On'}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
              <div className="px-5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold">Reference intervals <span className="mono text-muted-foreground">{refs.length}</span></div>
                  <button className="btn btn-sm btn-primary" onClick={() => setEditRef({})} disabled={sel.referenceType === 'None'} data-testid="button-new-reference"><Plus size={12} /> Add interval</button>
                </div>
                {sel.referenceType === 'None' && (
                  <div className="text-xs p-3 mb-2 rounded flex items-center gap-2" style={{ background: 'hsl(var(--warn-bg))', color: 'hsl(var(--warn))' }} data-testid="text-reftype-none">
                    <span className="flex-1">This parameter's reference type is None. Edit the parameter and choose Range, Text or Decision Value before adding intervals.</span>
                    <button className="btn btn-sm" onClick={() => setEditParam({ p: sel })} data-testid="button-edit-param-reftype">Edit parameter</button>
                  </div>
                )}
                {refs.length === 0 ? <div className="text-xs p-3 rounded border border-dashed text-muted-foreground">Not configured. Results will show no reference and no flag until the lab enters and approves one.</div> : (
                  <div className="space-y-2">
                    {refs.map((r) => (
                      <div key={r.id} className={`panel p-3 ${r.active ? '' : 'opacity-60'}`} data-testid={`card-ref-${r.id}`}>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <Pill tone={isApproved(r) ? 'pill-ok' : 'pill-hatch'}>{isApproved(r) ? 'Approved' : 'Unapproved'}</Pill>
                          <Pill>v{r.version ?? 1}</Pill>{!r.active && <Pill>Inactive</Pill>}
                        </div>
                        <div className="font-semibold mono">{fmtRange(r)} {r.unit}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{r.context} · {r.sex} · {fmtAge(r)}{r.effectiveFrom || r.effectiveTo ? ` · ${r.effectiveFrom || '…'} to ${r.effectiveTo || '…'}` : ''}</div>
                        {isApproved(r) && <div className="text-[11px] text-muted-foreground">Approved by {r.approvedBy} (typed attribution)</div>}
                        <div className="flex gap-1.5 mt-2">
                          {!isApproved(r) && <button className="btn btn-sm btn-primary" onClick={() => setApprove(r)} data-testid={`button-approve-ref-${r.id}`}>Approve</button>}
                          <button className="btn btn-sm" onClick={() => setEditRef({ r })} data-testid={`button-edit-ref-${r.id}`}>{isApproved(r) ? 'New version' : 'Edit'}</button>
                          <button className="btn btn-sm" onClick={() => lab.saveReference.mutate({ data: { ...r, active: !r.active } })} data-testid={`button-toggle-ref-${r.id}`}>{r.active ? 'Deactivate' : 'Activate'}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
      {editTest && <TestEditor test={test} ix={ix} onClose={() => setEditTest(false)} onSaved={() => setEditTest(false)} />}
      {editParam && <ParameterEditor testId={id} param={editParam.p} nextOrder={(plist[plist.length - 1]?.displayOrder ?? 0) + 10} onClose={() => setEditParam(null)} onSaved={(p) => { setSelId(p.id as number); setEditParam(null); }} />}
      {editOpt && sel && <OptionEditor parameterId={sel.id as number} option={editOpt.o} nextOrder={(opts[opts.length - 1]?.sortOrder ?? 0) + 10} onClose={() => setEditOpt(null)} />}
      {editRef && sel && <ReferenceEditor param={sel} reference={editRef.r} contexts={contexts} onClose={() => setEditRef(null)} />}
      {approve && sel && <ApproveDialog reference={approve} label={`${sel.name}: ${fmtRange(approve)} (${approve.context})`} onClose={() => setApprove(null)} />}
    </>
  );
}
