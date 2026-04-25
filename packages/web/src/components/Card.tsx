import type { Issue } from '../types.js';
import { hrefFor } from '../hooks/useRoute.js';
import { AgentBadge } from './AgentBadge.js';

export function Card({ issue }: { issue: Issue }) {
  return (
    <a className="card" href={hrefFor({ name: 'issue', number: issue.number })}>
      <div className="card-title">
        <span className="card-number">#{issue.number}</span>
        {issue.title}
      </div>
      <div className="card-meta">
        {issue.agent ? <AgentBadge agent={issue.agent} /> : null}
        {issue.isPullRequest ? <span className="badge pr">PR</span> : null}
        <span className="card-author">{issue.user.login}</span>
      </div>
    </a>
  );
}
