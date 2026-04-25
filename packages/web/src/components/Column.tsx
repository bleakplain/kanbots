import type { Issue } from '../types.js';
import { Card } from './Card.js';

export function Column({
  label,
  issues,
}: {
  label: string;
  issues: Issue[];
}) {
  return (
    <div className="column">
      <div className="column-header">
        <span>{label}</span>
        <span className="column-count">{issues.length}</span>
      </div>
      <div className="cards">
        {issues.map((issue) => (
          <Card key={issue.number} issue={issue} />
        ))}
      </div>
    </div>
  );
}
