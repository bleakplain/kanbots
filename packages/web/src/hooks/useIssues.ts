import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../api.js';
import { useFetch, type Mutator } from './useFetch.js';
import type { Issue } from '../types.js';

export interface IssuesContextValue {
  issues: Issue[];
  loading: boolean;
  error: Error | null;
  mutate: Mutator<Issue[]>;
  refetch: () => Promise<void>;
}

const IssuesContext = createContext<IssuesContextValue | null>(null);

export const ISSUES_REFETCH_EVENT = 'kanbots:issues-refetch';

export function IssuesProvider({ children }: { children: ReactNode }) {
  const [refetchTick, setRefetchTick] = useState(0);
  const { data, loading, error, mutate } = useFetch(`issues:open:${refetchTick}`, () =>
    api.issues('open'),
  );

  const refetch = useCallback(async () => {
    setRefetchTick((t) => t + 1);
  }, []);

  useEffect(() => {
    function onEvent(): void {
      void refetch();
    }
    window.addEventListener(ISSUES_REFETCH_EVENT, onEvent);
    return () => window.removeEventListener(ISSUES_REFETCH_EVENT, onEvent);
  }, [refetch]);

  return createElement(
    IssuesContext.Provider,
    { value: { issues: data ?? [], loading, error, mutate, refetch } },
    children,
  );
}

export function useIssues(): IssuesContextValue {
  const v = useContext(IssuesContext);
  if (!v) throw new Error('useIssues must be used inside <IssuesProvider>');
  return v;
}

export function dispatchIssuesRefetch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ISSUES_REFETCH_EVENT));
}
