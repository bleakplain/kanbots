// Inspector: agent thread, ticker, decision, diff, branch preview

const { Avatar, ICONS, CheckBadge } = window.KBComponents;

function fmtElapsed(s) {
  const m = Math.floor(s/60), sec = s%60;
  return `${m}m ${sec.toString().padStart(2,'0')}s`;
}
function fmtTok(n) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }

function TickerEvent({ ev }) {
  if (ev.type === 'text') return <div className="tev text">{ev.text}</div>;
  if (ev.type === 'tool_use') return (
    <div className={`tev tool ${ev.live ? 'live' : ''}`}>
      <span className="arrow">↗</span>
      <span className="name">{ev.name}</span>
      <span className="arg">{ev.input}</span>
    </div>
  );
  if (ev.type === 'tool_result') return (
    <div className="tev result"><span className="arrow">↩</span>{ev.summary}</div>
  );
  return null;
}

function Decision({ decision, onResolve }) {
  if (!decision) return null;
  return (
    <div className="decision">
      <div className="decision-head">
        <div className="ico">?</div>
        <span>Agent paused · awaiting your input</span>
      </div>
      <div className="decision-q">{decision.question}</div>
      <div className="decision-opts">
        {decision.options.map((o, i) => (
          <button key={o.value} className="decision-opt" onClick={() => onResolve(o.value)}>
            <span className="num">{i + 1}</span>{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DiffView({ diff }) {
  return (
    <div className="diff-block">
      <div className="diff-head">
        <span className="branch">{diff.branch}</span>
        <span className="arrow">←</span>
        <span className="branch" style={{color:'var(--ink-3)'}}>{diff.base}</span>
        <span className="stat"><span className="add">+835</span> <span className="del">−228</span></span>
      </div>
      {diff.files.map(f => (
        <div key={f.path} className="diff-file">
          <div className="diff-fhead">
            <span className={`stat-tag ${f.status}`}>{f.status}</span>
            <span className="path">{f.path}</span>
          </div>
          <div className="diff-hunk">
            {f.hunks.map((h, hi) => (
              <React.Fragment key={hi}>
                <div className="diff-meta">{h.meta}</div>
                {h.lines.map((l, li) => (
                  <div key={li} className={`diff-line ${l.k === 'add' ? 'add' : l.k === 'del' ? 'del' : ''}`}>
                    <span className="ln">{l.k === 'add' ? '+' : l.k === 'del' ? '−' : ' '}</span>
                    <span>{l.t || ' '}</span>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BranchPreview({ branch }) {
  return (
    <div className="preview-frame">
      <div className="pf-bar">
        <div className="pf-dots"><i/><i/><i/></div>
        <div className="pf-url">localhost:3000 · worktree {branch}</div>
        <span style={{color:'var(--ink-3)'}}>live</span>
      </div>
      <div className="pf-canvas">
        <div className="lbl" style={{color:'var(--ink-2)'}}>BRANCH PREVIEW</div>
        <div className="lbl">dev server running on worktree port 3041</div>
        <div className="lbl" style={{color:'var(--ink-4)', marginTop: 6}}>(iframe sandbox would mount here)</div>
      </div>
    </div>
  );
}

function Inspector({ issue, ticker, diff, onResolveDecision, onExpand }) {
  const [tab, setTab] = React.useState('thread');
  if (!issue) return <aside className="inspector"/>;

  const showRun = issue.agent === 'running' || issue.agent === 'awaiting';

  return (
    <aside className="inspector">
      <div className="insp-bar">
        <span className="mono" style={{color:'var(--ink-3)', fontSize: 11}}>#{issue.number}</span>
        <span style={{ color:'var(--ink-3)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--ink-1)' }}>{issue.branch || 'no branch'}</span>
        <div className="insp-tabs">
          <button onClick={onExpand} className="insp-tab" style={{color:'var(--accent)', display:'inline-flex', alignItems:'center', gap:4}} title="Expand to full detail view">↗ Expand</button>
          <button className={`insp-tab ${tab==='thread'?'active':''}`} onClick={()=>setTab('thread')}>Thread</button>
          <button className={`insp-tab ${tab==='diff'?'active':''}`}   onClick={()=>setTab('diff')}>Diff</button>
          <button className={`insp-tab ${tab==='preview'?'active':''}`}onClick={()=>setTab('preview')}>Preview</button>
        </div>
      </div>

      <div className="insp-body">
        <div className="insp-title-row">
          <span className="num mono">#{issue.number}</span>
          <h1 className="insp-title">{issue.title}</h1>
        </div>

        <div className="insp-meta-row">
          <span className={`tag ${issue.tag}`}>{issue.tag}</span>
          {issue.labels.filter(l=>!l.startsWith('status:')).map(l => (
            <span key={l} className="chip mono">{l}</span>
          ))}
          <span className="chip"><span className="k">opened</span>{issue.user.login}</span>
          {issue.assignees.length ? (
            <span className="chip" style={{paddingRight: 4}}>
              <span className="k">on</span>
              {issue.assignees.map(login => {
                const u = window.KB_DATA.users[login] || { login, color: 'var(--bg-3)' };
                return <Avatar key={login} user={u} size={16}/>;
              })}
            </span>
          ) : null}
        </div>

        {tab === 'thread' ? (
          <>
            <div className="section-h">Description</div>
            <div className="body-block">{issue.body || '(no description)'}</div>

            {showRun ? (
              <>
                <div className="section-h">
                  Agent run
                  <span style={{display:'flex',gap:6}}>
                    <button className="btn ghost" style={{height:24,padding:'0 8px'}}>Stop</button>
                    <button className="btn ghost" style={{height:24,padding:'0 8px'}}>Fork</button>
                  </span>
                </div>
                <div className="run-card">
                  <div className="run-head">
                    <span className="px"/>
                    <span className="label">Agent {issue.agent === 'awaiting' ? 'awaiting input' : 'running'}</span>
                    <span className="id mono">run #{issue.runId}</span>
                    <span className="elapsed">{fmtElapsed(issue.elapsedSec || 0)}</span>
                  </div>
                  <div className="run-stats">
                    <div className="run-stat"><div className="k">Model</div><div className="v">claude-opus-4.5</div></div>
                    <div className="run-stat"><div className="k">Tokens</div><div className="v">{fmtTok(issue.tokens.in)}<small>in</small> / {fmtTok(issue.tokens.out)}<small>out</small></div></div>
                    <div className="run-stat"><div className="k">Files</div><div className="v">{issue.filesChanged}<small>changed</small></div></div>
                    <div className="run-stat"><div className="k">Cost</div><div className="v">$2.41</div></div>
                  </div>
                  <div className="ticker">
                    {ticker.map(ev => <TickerEvent key={ev.id} ev={ev}/>)}
                  </div>
                </div>

                {issue.decision ? <Decision decision={issue.decision} onResolve={onResolveDecision}/> : null}
              </>
            ) : null}

            {!showRun && issue.status === 'review' ? (
              <>
                <div className="section-h">Ready for review</div>
                <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
                  <button className="btn primary">Approve & merge</button>
                  <button className="btn">Request changes</button>
                  <button className="btn">Run reviewer agent</button>
                  <button className="btn ghost">Re-run tests</button>
                </div>
              </>
            ) : null}

            <div className="section-h">Reply</div>
            <div className="composer">
              <textarea className="composer-input" placeholder="Message agent, drop /spec to refine, /review to spawn a reviewer, /split to fan out…" defaultValue=""/>
              <div className="composer-tools">
                <button className="slash">/spec</button>
                <button className="slash">/review</button>
                <button className="slash">/split</button>
                <button className="slash">/test</button>
                <span className="model" style={{marginLeft:'auto', marginRight: 8}}>opus-4.5 · sonnet-4.5</span>
                <button className="btn primary send">Send <span className="kbd">⌘↵</span></button>
              </div>
            </div>
          </>
        ) : null}

        {tab === 'diff' ? <DiffView diff={diff}/> : null}
        {tab === 'preview' ? <BranchPreview branch={issue.branch || 'main'}/> : null}
      </div>
    </aside>
  );
}

function Palette({ open, onClose }) {
  if (!open) return null;
  return (
    <div className="palette-overlay" onClick={onClose}>
      <div className="palette" onClick={e => e.stopPropagation()}>
        <div className="palette-input">
          {ICONS.search}
          <input autoFocus placeholder="Run a command, jump to issue, ask an agent…"/>
          <span className="kbd-hint">esc</span>
        </div>
        <div className="palette-section">
          <div className="palette-section-h">Quick actions</div>
          <div className="palette-row active"><span className="ico">{ICONS.plus}</span><span className="label">New issue</span><span className="hint">N</span></div>
          <div className="palette-row"><span className="ico">{ICONS.bot}</span><span className="label">Spawn agent on selected issue</span><span className="hint">⇧⏎</span></div>
          <div className="palette-row"><span className="ico">{ICONS.layers}</span><span className="label">Split task into parallel agents…</span><span className="hint">⌘⇧S</span></div>
          <div className="palette-row"><span className="ico">{ICONS.flame}</span><span className="label">Resolve decision · #408</span><span className="hint">D</span></div>
          <div className="palette-row"><span className="ico">{ICONS.branch}</span><span className="label">Open branch preview</span><span className="hint">P</span></div>
        </div>
        <div className="palette-section">
          <div className="palette-section-h">Jump to issue</div>
          {window.KB_DATA.issues.slice(0,4).map(i => (
            <div key={i.number} className="palette-row">
              <span className="ico mono" style={{fontSize:11}}>#{i.number}</span>
              <span className="label">{i.title}</span>
              <span className="hint">{i.status || 'inbox'}</span>
            </div>
          ))}
        </div>
        <div className="palette-section">
          <div className="palette-section-h">Ask Claude</div>
          <div className="palette-row"><span className="ico">{ICONS.spark}</span><span className="label" style={{color:'var(--ink-2)'}}><span className="serif" style={{fontSize:14, color:'var(--ink-1)'}}>“draft an issue for the SSE buffering bug…”</span></span></div>
        </div>
      </div>
    </div>
  );
}

function Tray({ decisions, onJump }) {
  if (!decisions.length) return null;
  return (
    <div className="tray">
      <div className="tray-head">
        <span className="px"/>
        <span className="t">Decisions awaiting you</span>
        <span className="ct">{decisions.length}</span>
      </div>
      {decisions.map(d => (
        <div key={d.runId} className="tray-item">
          <div className="tray-num">#{d.issueNumber} · run {d.runId} · {d.ageSec}s ago</div>
          <div className="tray-title">{d.issueTitle}</div>
          <div className="tray-q">{d.question}</div>
          <div className="tray-opts">
            {d.options.map(o => <button key={o.value} className="o" onClick={() => onJump(d.issueNumber)}>{o.label}</button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

window.KBInspector = { Inspector, Palette, Tray };
