import { useMemo } from 'react';
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
  };
}

// Used only as a convenient default for reference approval attribution.
const OPERATOR_KEY = 'labdesk.operator';
export function useOperator(): string {
  return typeof localStorage === 'undefined' ? '' : localStorage.getItem(OPERATOR_KEY) ?? '';
}
