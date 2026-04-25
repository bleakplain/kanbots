import { useFetch } from '../hooks/useFetch.js';
import { api } from '../api.js';
import { COLUMNS } from '../labels.js';
import { Column } from '../components/Column.js';
import type { Issue, StatusKey } from '../types.js';

export function Board() {
  const { data: config } = useFetch('config', () => api.config());
  const { data: issues, loading, error } = useFetch('issues:open', () => api.issues('open'));

  if (loading && !issues) {
    return <div className="loading">Loading…</div>;
  }
  if (error) {
    return (
      <div className="error">
        <h2>Failed to load issues</h2>
        <pre>{error.message}</pre>
      </div>
    );
  }

  const grouped = groupByStatus(issues ?? []);

  return (
    <div className="app-board">
      <header className="topbar">
        <strong>kanbots</strong>
        {config ? (
          <span className="muted">
            · {config.owner}/{config.repo}
          </span>
        ) : null}
      </header>
      <div className="board">
        {COLUMNS.map((col) => (
          <Column
            key={String(col.key)}
            label={col.label}
            issues={col.key === null ? grouped.untagged : grouped.byKey[col.key]}
          />
        ))}
      </div>
    </div>
  );
}

interface GroupedIssues {
  byKey: Record<StatusKey, Issue[]>;
  untagged: Issue[];
}

function groupByStatus(issues: Issue[]): GroupedIssues {
  const grouped: GroupedIssues = {
    byKey: { backlog: [], todo: [], inProgress: [], review: [], done: [] },
    untagged: [],
  };
  for (const issue of issues) {
    if (issue.status === null) {
      grouped.untagged.push(issue);
    } else {
      grouped.byKey[issue.status].push(issue);
    }
  }
  return grouped;
}
