import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Empty, ErrorBlock, PageHead, Pill, Skeleton } from '@/components/kit';
import { MasterEditor } from '@/components/editors';
import { useCatalog, useLab } from '@/hooks/use-lab';
import type { Master } from '@workspace/api-client-react';

type Kind = 'Category' | 'Specimen' | 'Method';

export default function MastersPage() {
  const { q, ix } = useCatalog();
  const lab = useLab();
  const [kind, setKind] = useState<Kind>('Category');
  const [edit, setEdit] = useState<{ m?: Master } | null>(null);
  const list: Master[] = !ix ? [] : kind === 'Category' ? ix.raw.categories : kind === 'Specimen' ? ix.raw.specimens : ix.raw.methods;
  const used = (m: Master) => ix?.raw.tests.filter((t) => (kind === 'Category' ? t.categoryId : kind === 'Specimen' ? t.specimenTypeId : t.methodId) === m.id).length ?? 0;
  const tabs: [Kind, string][] = [['Category', 'Categories'], ['Specimen', 'Specimens'], ['Method', 'Methods (optional)']];
  return (
    <>
      <PageHead title="Masters" sub="Lookup lists used by tests. Methods are optional on a test.">
        <button className="btn btn-primary" onClick={() => setEdit({})} data-testid="button-new-master"><Plus size={14} /> New {kind.toLowerCase()}</button>
      </PageHead>
      <div className="flex gap-1 px-6 pt-3 border-b">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setKind(k)} data-testid={`tab-master-${k}`}
            className="px-3 py-2 font-semibold text-[12.5px] -mb-px border-b-2" style={{ borderColor: kind === k ? 'hsl(var(--primary))' : 'transparent', color: kind === k ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}>
            {l} {ix && <span className="mono opacity-60">{k === 'Category' ? ix.raw.categories.length : k === 'Specimen' ? ix.raw.specimens.length : ix.raw.methods.length}</span>}
          </button>
        ))}
      </div>
      <div className="scroll flex-1">
        {q.isLoading && <Skeleton rows={6} />}
        {q.isError && <ErrorBlock what="masters" onRetry={() => q.refetch()} />}
        {ix && list.length === 0 && <Empty title={`No ${kind.toLowerCase()} entries`} body="Add one so tests can reference it." action={<button className="btn btn-primary" onClick={() => setEdit({})}>Add {kind.toLowerCase()}</button>} />}
        {ix && list.length > 0 && (
          <table className="tbl">
            <thead><tr><th>Code</th><th>Name</th><th>Tests using</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} className={m.active ? '' : 'off'} data-testid={`row-master-${m.id}`}>
                  <td className="mono font-semibold">{m.code}</td>
                  <td className="font-semibold">{m.name}</td>
                  <td className="mono">{used(m)}</td>
                  <td><Pill tone={m.active ? 'pill-ok' : ''}>{m.active ? 'Active' : 'Inactive'}</Pill></td>
                  <td className="text-right space-x-1">
                    <button className="btn btn-sm" onClick={() => setEdit({ m })} data-testid={`button-edit-master-${m.id}`}>Edit</button>
                    <button className="btn btn-sm" onClick={() => lab.saveMaster.mutate({ data: { ...m, kind, active: !m.active } })} data-testid={`button-toggle-master-${m.id}`}>{m.active ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && <MasterEditor kind={kind} master={edit.m} onClose={() => setEdit(null)} />}
    </>
  );
}
