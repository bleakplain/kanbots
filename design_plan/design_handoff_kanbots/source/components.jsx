// Card component, Column, Board, LeftRail, Inspector, Palette, Tray
// All consumed by app.jsx

const ICONS = {
  search: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>,
  plus:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>,
  cmd:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6V4a2 2 0 1 0-2 2h2zm0 0v12m0-12h6m-6 12v2a2 2 0 1 1-2-2h2zm0 0h6m0 0V6m0 12v2a2 2 0 1 0 2-2h-2zm0-12V4a2 2 0 1 1 2 2h-2z"/></svg>,
  branch: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M8 12h8"/></svg>,
  filter: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 5h18l-7 9v6l-4-2v-4z"/></svg>,
  arr:    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="m9 6 6 6-6 6"/></svg>,
  spark:  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 13.5 9 21 10l-7.5 1.5L12 22l-1.5-10.5L3 10l7.5-1z"/></svg>,
  bot:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 14h.01M15 14h.01"/></svg>,
  inbox:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/></svg>,
  layers: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m12 2 9 5-9 5-9-5 9-5z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>,
  flame:  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s4 4 4 9-2 6-4 6-4-1-4-6 4-9 4-9zm0 17a4 4 0 0 0 0-8 4 4 0 0 0 0 8z" opacity=".9"/></svg>,
  check:  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="m5 12 5 5L20 7"/></svg>,
  cross:  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M6 6l12 12M18 6l-12 12"/></svg>,
  spin:   <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9" strokeOpacity=".25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>,
};

function Avatar({ user, size = 22 }) {
  if (!user) return null;
  const initial = (user.login || '?').slice(0, 1).toUpperCase();
  return (
    <div className="av" style={{
      width: size, height: size,
      background: user.color || 'var(--bg-3)',
      color: 'oklch(0.18 0.02 60)',
      borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 600,
    }}>{initial}</div>
  );
}

function CheckBadge({ kind, label }) {
  const cls = kind === 'pass' ? 'pass' : kind === 'fail' ? 'fail' : kind === 'running' ? 'run' : '';
  const ico = kind === 'pass' ? ICONS.check : kind === 'fail' ? ICONS.cross : kind === 'running' ? <span className="spin">{ICONS.spin}</span> : '·';
  return <div className={`check ${cls}`} title={label}>{ico}</div>;
}

function Card({ issue, selected, onClick, onOpen }) {
  const isRunning = issue.agent === 'running';
  const isAwaiting = issue.agent === 'awaiting';
  const isReview = issue.agent === 'review';
  const stateCls = isRunning ? 'running' : isAwaiting ? 'awaiting' : isReview ? 'review' : '';

  const statusPill = isRunning ? <div className="card-status-pill"><span className="px"/>RUNNING</div>
    : isAwaiting ? <div className="card-status-pill awaiting"><span className="px"/>WAITING ON YOU</div>
    : isReview ? <div className="card-status-pill review"><span className="px"/>READY TO REVIEW</div>
    : issue.agent === 'queued' ? <div className="card-status-pill queued"><span className="px"/>QUEUED</div>
    : null;

  return (
    <div className={`card ${stateCls} ${selected ? 'selected' : ''}`} onClick={onClick} onDoubleClick={onOpen}>
      <div className="card-row1">
        <span className={`tag ${issue.tag}`}>{issue.tag}</span>
        <span className="card-num">#{issue.number}</span>
        {statusPill}
      </div>
      <div className="card-title">{issue.title}</div>

      {isRunning && issue.currentTool ? (
        <div className="live-ticker">
          <span className="dot"/>
          <span className="tool">{issue.currentTool}</span>
          <span className="arg">{issue.currentFile}</span>
        </div>
      ) : null}

      {isAwaiting && issue.decision ? (
        <div className="card-decision">
          <div className="q-icon">?</div>
          <div className="q-text">{issue.decision.question}</div>
        </div>
      ) : null}

      {(isRunning || isReview) && typeof issue.progress === 'number' ? (
        <div className="card-progress">
          <div className="bar"><i style={{ width: `${issue.progress * 100}%` }}/></div>
          <span className="pct">{Math.round(issue.progress * 100)}%</span>
        </div>
      ) : null}

      <div className="card-meta">
        {issue.branch ? <span className="branch">{ICONS.branch}{issue.branch.replace(/^kb\//, '')}</span> : null}
        {issue.additions != null ? (
          <span className="stats">
            <span className="add">+{issue.additions}</span>
            <span className="del">−{issue.deletions}</span>
          </span>
        ) : null}
        {issue.checks ? (
          <span className="checks">
            <CheckBadge kind={issue.checks.tests} label={`tests: ${issue.checks.tests}`}/>
            <CheckBadge kind={issue.checks.typecheck} label={`tsc: ${issue.checks.typecheck}`}/>
            <CheckBadge kind={issue.checks.lint} label={`lint: ${issue.checks.lint}`}/>
          </span>
        ) : null}
        {!issue.checks ? <span className="checks" style={{marginLeft:'auto'}}/> : null}
        <span className="assignees">
          {(issue.assignees || []).map(login => {
            const u = window.KB_DATA.users[login] || { login, color: 'var(--bg-3)' };
            return <Avatar key={login} user={u} size={18}/>;
          })}
        </span>
      </div>
    </div>
  );
}

function Column({ status, label, issues, selectedNum, onSelect, onOpen }) {
  return (
    <div className="col">
      <div className="col-head" data-status={status}>
        <span className="glyph"/>
        <span className="name">{label}</span>
        <span className="count">{issues.length}</span>
        <button className="add" title="Add issue">{ICONS.plus}</button>
      </div>
      <div className="col-list">
        {issues.map(i => (
          <Card key={i.number} issue={i} selected={selectedNum === i.number} onClick={() => onSelect(i.number)} onOpen={() => onOpen && onOpen(i)}/>
        ))}
        {issues.length === 0 ? <div style={{ padding: '12px 6px', color: 'var(--ink-4)', fontSize: 11.5 }}>—</div> : null}
      </div>
    </div>
  );
}

function LeftRail({ workspace, folders, runningIssues, onOpenPalette }) {
  return (
    <aside className="rail">
      <div className="rail-section">
        <div className="rail-label">Workspace</div>
        <div className="workspace active" style={{cursor:'default'}}>
          <div className="workspace-glyph">{workspace.name.slice(0,2).toUpperCase()}</div>
          <div className="workspace-meta">
            <div className="workspace-name">{workspace.name}</div>
            <div className="workspace-path">{folders.length} folders</div>
          </div>
          {workspace.activeAgents > 0 ? (
            <div className="workspace-pulse"><span className="px"/>{workspace.activeAgents}</div>
          ) : null}
        </div>
      </div>

      <div className="rail-section">
        <div className="rail-label">Folders <button className="add" title="Add folder">{ICONS.plus}</button></div>
        {folders.map(f => (
          <div key={f.id} className={`rail-item ${f.current ? 'active' : ''}`} style={{padding:'7px 8px'}}>
            <span className="glyph">{ICONS.branch}</span>
            <span style={{flex:1, minWidth:0, overflow:'hidden'}}>
              <div style={{fontSize:12.5, color:'var(--ink-1)'}}>{f.name}</div>
              <div className="mono" style={{fontSize:10, color:'var(--ink-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{f.path} · {f.branch}</div>
            </span>
            {f.activeAgents > 0 ? (
              <span style={{display:'flex',alignItems:'center',gap:4,fontSize:10,color:'var(--running)',fontVariantNumeric:'tabular-nums'}}>
                <span style={{width:5,height:5,borderRadius:'50%',background:'var(--running)',animation:'pulse 1.4s infinite'}}/>{f.activeAgents}
              </span>
            ) : <span className="count">{f.issues}</span>}
          </div>
        ))}
      </div>

      <div className="rail-section">
        <div className="rail-label">Views</div>
        <div className="rail-item active"><span className="glyph">{ICONS.layers}</span>Board <span className="count">12</span></div>
        <div className="rail-item"><span className="glyph">{ICONS.bot}</span>Swarm <span className="count">3</span></div>
        <div className="rail-item"><span className="glyph">{ICONS.inbox}</span>Inbox <span className="count">1</span></div>
        <div className="rail-item"><span className="glyph">{ICONS.flame}</span>Decisions <span className="count">2</span></div>
        <div className="rail-item"><span className="glyph">{ICONS.spark}</span>Activity</div>
      </div>

      <div className="rail-section">
        <div className="rail-label">Live agents</div>
        {runningIssues.map(i => (
          <div key={i.number} className="swarm-card">
            <div className={`swarm-bar ${i.agent === 'awaiting' ? 'awaiting' : i.agent === 'review' ? 'review' : ''}`}/>
            <div className="swarm-meta">
              <div className="swarm-num">#{i.number} · run {i.runId}</div>
              <div className="swarm-title">{i.title}</div>
              <div className="swarm-tool">{i.currentTool ? `${i.currentTool} · ${(i.currentFile||'').split('/').pop()}` : 'awaiting input'}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="rail-foot">
        <Avatar user={window.KB_DATA.users.you} size={26}/>
        <div className="who">
          <div className="who-name">jess</div>
          <div className="who-status"><span className="px"/>3 agents · 12 issues</div>
        </div>
        <button className="btn ghost" onClick={onOpenPalette} title="Command palette">⌘K</button>
      </div>
    </aside>
  );
}

window.KBComponents = { Card, Column, LeftRail, Avatar, ICONS, CheckBadge };
