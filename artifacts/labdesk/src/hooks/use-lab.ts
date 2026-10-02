import { useMemo, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAuditQueryKey,
  getGetCatalogQueryKey,
  getGetResultsQueryKey,
  useApproveReference,
  useGetCatalog,
  useSaveMaster,
  useSaveOption,
  useSaveParameter,
  useSaveReference,
  useSaveResult,
  useSaveTest,
  useTransitionResult,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { indexCatalog, msg } from '@/lib/lab';

export function useCatalog() {
  const q = useGetCatalog();
  const ix = useMemo(() => (q.data ? indexCatalog(q.data) : undefined), [q.data]);
  return { q, ix };
}

export function useLab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const opts = {
    mutation: {
      onSuccess: () =>
        Promise.all(
          [getGetCatalogQueryKey(), getGetResultsQueryKey(), getGetAuditQueryKey()].map((k) =>
            qc.invalidateQueries({ queryKey: k }),
          ),
        ),
      onError: (e: unknown) => toast({ title: 'Request failed', description: msg(e), variant: 'destructive' }),
    },
  };
  return {
    toast,
    saveTest: useSaveTest(opts),
    saveParameter: useSaveParameter(opts),
    saveOption: useSaveOption(opts),
    saveReference: useSaveReference(opts),
    approveReference: useApproveReference(opts),
    saveMaster: useSaveMaster(opts),
    saveResult: useSaveResult(opts),
    transition: useTransitionResult(opts),
  };
}

// Temporary operator attribution. Not an authenticated identity.
const KEY = 'labdesk.operator';
const subs = new Set<() => void>();
export function setOperator(v: string) {
  localStorage.setItem(KEY, v);
  subs.forEach((f) => f());
}
export function useOperator(): string {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => localStorage.getItem(KEY) ?? '',
  );
}
