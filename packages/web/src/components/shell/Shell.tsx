import type { ReactNode } from 'react';

export interface ShellProps {
  rail: ReactNode | null;
  center: ReactNode;
  inspector: ReactNode | null;
}

export function Shell({ rail, center, inspector }: ShellProps) {
  return (
    <div
      className="kb-shell"
      data-no-rail={rail === null ? 'true' : undefined}
      data-no-inspector={inspector === null ? 'true' : undefined}
    >
      {rail !== null ? <aside className="kb-zone-rail">{rail}</aside> : null}
      <main className="kb-zone-center">{center}</main>
      {inspector !== null ? <aside className="kb-zone-inspector">{inspector}</aside> : null}
    </div>
  );
}
