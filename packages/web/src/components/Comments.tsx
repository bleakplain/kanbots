import type { Comment } from '../types.js';

export function Comments({ comments }: { comments: Comment[] }) {
  if (comments.length === 0) {
    return <p className="muted">No comments yet.</p>;
  }
  return (
    <div className="comments">
      {comments.map((c) => (
        <article className="comment" key={c.id}>
          <div className="comment-header">
            <strong>{c.user.login}</strong>
            <span className="muted"> · {formatDate(c.createdAt)}</span>
          </div>
          <div className="markdown">{c.body || '(empty)'}</div>
        </article>
      ))}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
