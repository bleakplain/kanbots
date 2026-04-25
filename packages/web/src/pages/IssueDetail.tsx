import { useFetch } from '../hooks/useFetch.js';
import { api } from '../api.js';
import { Comments } from '../components/Comments.js';
import { AgentBadge } from '../components/AgentBadge.js';

export function IssueDetail({ number }: { number: number }) {
  const { data, loading, error } = useFetch(`issue:${number}`, () => api.issue(number));

  if (loading && !data) {
    return <div className="loading">Loading…</div>;
  }
  if (error) {
    return (
      <div className="error">
        <h2>Failed to load issue #{number}</h2>
        <pre>{error.message}</pre>
        <a href="#/">← back</a>
      </div>
    );
  }
  if (!data) return <></>;

  const { issue, comments } = data;

  return (
    <div className="issue-detail">
      <header>
        <a href="#/" className="back">
          ← board
        </a>
        <h1>
          {issue.title} <span className="number">#{issue.number}</span>
        </h1>
        <div className="issue-meta">
          <span className={`state state-${issue.state}`}>{issue.state}</span>
          {issue.agent ? <AgentBadge agent={issue.agent} /> : null}
          {issue.isPullRequest ? <span className="badge pr">PR</span> : null}
          <span className="muted">opened by {issue.user.login}</span>
          <a href={issue.htmlUrl} target="_blank" rel="noreferrer" className="muted">
            open on github →
          </a>
        </div>
        <div className="labels">
          {issue.labels.map((l) => (
            <span key={l} className="label">
              {l}
            </span>
          ))}
        </div>
      </header>

      <section>
        <h2>Description</h2>
        <div className="markdown">{issue.body || '(no description)'}</div>
      </section>

      <section>
        <h2>GitHub comments ({comments.length})</h2>
        <Comments comments={comments} />
      </section>
    </div>
  );
}
