export interface InspectorPlaceholderProps {
  selectedNumber: number | null;
}

export function InspectorPlaceholder({ selectedNumber }: InspectorPlaceholderProps) {
  if (selectedNumber === null) {
    return <div className="kb-placeholder-empty">Select a card to inspect</div>;
  }
  return (
    <div className="kb-placeholder">
      <div>
        <div className="kb-placeholder-h">#{selectedNumber}</div>
        <div className="kb-placeholder-line" style={{ marginTop: 12, height: 28 }} />
      </div>
      <div className="kb-placeholder-empty" style={{ height: 'auto', padding: 0 }}>
        Inspector tabs land in Phase 4
      </div>
    </div>
  );
}
