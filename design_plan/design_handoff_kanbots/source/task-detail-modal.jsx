// Task Detail modal — overlays the kanban board

function TaskDetailModal({ issue, onClose }) {
  const [tab, setTab] = React.useState('overview');
  if (!issue) return null;
  const D = window.KB_DATA;

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isRunning = issue.agent === 'running' || issue.agent === 'awaiting';

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="crumb-chip"><b>kanbots</b></span>
          <span style={{color:'var(--ink-4)'}}>·</span>
          <span className="num">#{issue.number}</span>
          <h2>{issue.title}</h2>
          <span className="grow"/>
          <button className="btn ghost">Stop</button>
          <button className="btn ghost">Fork run</button>
          <button className="btn primary">Open preview ↗</button>
          <button className="x-btn" onClick={onClose} title="Close (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6l-12 12"/></svg>
          </button>
        </div>

        <div className="modal-body">
          <main className="modal-main">
            <div className={`tdm-hero ${isRunning ? 'running' : ''}`}>
              <div className="tdm-title-row">
                <span className="tdm-num">#{issue.number}</span>
                <h1 className="tdm-h1">{issue.title}</h1>
              </div>
              <div className="tdm-meta-row">
                {isRunning ? (
                  <span className={`card-status-pill ${issue.agent === 'awaiting' ? 'awaiting' : ''}`}>
                    <span className="px"/>{issue.agent === 'awaiting' ? 'AWAITING INPUT' : 'RUNNING'} · run #{issue.runId || '7821'}
                  </span>
                ) : null}
                <span className={`tag ${issue.tag}`}>{issue.tag}</span>
                <span className="chip mono">area:auth</span>
                <span className="chip mono">priority:p1</span>
                <span className="chip mono"><span className="k">branch</span>{issue.branch}</span>
                <span className="chip mono"><span className="k">opened</span>1d ago</span>
              </div>
            </div>

            <div className="tdm-tabs">
              <button className={`tdm-tab ${tab==='overview'?'active':''}`} onClick={()=>setTab('overview')}>Overview</button>
              <button className={`tdm-tab ${tab==='thread'?'active':''}`}   onClick={()=>setTab('thread')}>Thread <span className="ct">42</span></button>
              <button className={`tdm-tab ${tab==='diff'?'active':''}`}     onClick={()=>setTab('diff')}>Diff <span className="ct">14</span></button>
              <button className={`tdm-tab ${tab==='preview'?'active':''}`}  onClick={()=>setTab('preview')}>Preview</button>
              <button className={`tdm-tab ${tab==='runs'?'active':''}`}     onClick={()=>setTab('runs')}>Runs <span className="ct">3</span></button>
            </div>

            <div className="tdm-content">
              {tab === 'overview' ? <OverviewTab/> : null}
              {tab === 'thread'   ? <ThreadTab/> : null}
              {tab === 'diff'     ? <DiffTab issue={issue}/> : null}
              {tab === 'preview'  ? <PreviewTab issue={issue}/> : null}
              {tab === 'runs'     ? <RunsTab/> : null}
            </div>
          </main>

          <aside className="modal-aside">
            <div className="mas-block">
              <div className="mas-h">Live run</div>
              <div className="run-stats" style={{borderRadius: 7, border:'1px solid var(--hairline)', overflow:'hidden'}}>
                <div className="run-stat"><div className="k">Model</div><div className="v">opus-4.5</div></div>
                <div className="run-stat"><div className="k">Elapsed</div><div className="v">30m 40s</div></div>
                <div className="run-stat"><div className="k">Tokens</div><div className="v">184k<small>in</small> 41k<small>out</small></div></div>
                <div className="run-stat"><div className="k">Cost</div><div className="v">$2.41</div></div>
              </div>
              <div style={{display:'flex', gap:5, marginTop:10, flexWrap:'wrap'}}>
                <span className="check-pill run">  <span className="ico">⟳</span><span className="lbl">tests</span><span className="meta">0:42</span></span>
                <span className="check-pill pass"> <span className="ico">✓</span><span className="lbl">tsc</span><span className="meta">4.2s</span></span>
                <span className="check-pill pass"> <span className="ico">✓</span><span className="lbl">lint</span><span className="meta">2.1s</span></span>
              </div>
            </div>

            <div className="mas-block">
              <div className="mas-h">Properties</div>
              <div className="mas-row"><span className="k">Status</span><span className="v">In Progress</span></div>
              <div className="mas-row"><span className="k">Assignee</span><span className="v">raj</span></div>
              <div className="mas-row"><span className="k">Priority</span><span className="v">P1 · High</span></div>
              <div className="mas-row"><span className="k">Folder</span><span className="v mono">kanbots</span></div>
              <div className="mas-row"><span className="k">Worktree</span><span className="v mono">.kanbots/wt/{issue.number}</span></div>
              <div className="mas-row"><span className="k">Branch</span><span className="v mono">{issue.branch}</span></div>
              <div className="mas-row"><span className="k">Base</span><span className="v mono">main · 2a8f1c4</span></div>
            </div>

            <div className="mas-block">
              <div className="mas-h">Linked</div>
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,padding:'6px 8px',borderRadius:6,background:'var(--bg-2)',border:'1px solid var(--hairline-soft)'}}>
                  <span style={{fontFamily:'JetBrains Mono, monospace', fontSize:11, color:'var(--ink-3)'}}>#408</span>
                  <span style={{flex:1, color:'var(--ink-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>Streaming SSE drops mid-message</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,padding:'6px 8px',borderRadius:6,background:'var(--bg-2)',border:'1px solid var(--hairline-soft)'}}>
                  <span style={{fontFamily:'JetBrains Mono, monospace', fontSize:11, color:'var(--ink-3)'}}>#388</span>
                  <span style={{flex:1, color:'var(--ink-1)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>Stream parser handles tool_result</span>
                  <span style={{color:'var(--review)', fontSize:10}}>merged</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="modal-foot">
          <span className="hint">Reply to agent</span>
          <input className="input" style={{flex:1}} placeholder="/spec to refine · /review to spawn reviewer · /split to fan out…"/>
          <button className="btn primary">Send <span className="kbd">⌘↵</span></button>
        </div>
      </div>
    </div>
  );
}

function OverviewTab() {
  return <>
    <div className="tdm-section">
      <h3>Description</h3>
      <div className="desc-md">
        <p>Replace password+TOTP login with passkey-first onboarding. Keep magic-link as fallback for 90 days, then deprecate.</p>
        <p><b>Scope:</b></p>
        <ul>
          <li>Add <code>/auth/passkey/register</code> + <code>/auth/passkey/auth</code> using <code>@simplewebauthn/server</code>.</li>
          <li>Update login UI to detect passkey support; fall back for unsupported browsers.</li>
          <li>Migrate session middleware to accept passkey attestations.</li>
        </ul>
      </div>
    </div>

    <div className="tdm-section">
      <h3>Spec — generated by /spec</h3>
      <div className="spec">
        <h4>Acceptance criteria</h4>
        <ul className="spec-list">
          <li className="done"><div className="box"/><span className="label">A new user can register a passkey on first login.</span></li>
          <li className="done"><div className="box"/><span className="label">Existing users see a "secure your account" banner.</span></li>
          <li><div className="box"/><span className="label">Passkey auth survives a session refresh without re-prompting.</span></li>
          <li><div className="box"/><span className="label">Magic-link fallback emits a deprecation header for 90 days.</span></li>
          <li><div className="box"/><span className="label">Audit log records auth method per session.</span></li>
        </ul>
        <h4>Files the agent expects to touch</h4>
        <ul className="spec-list">
          <li><div className="box" style={{visibility:'hidden'}}/><span className="mono" style={{fontSize:11.5,fontFamily:'JetBrains Mono, monospace'}}>apps/web/src/auth/login.ts</span></li>
          <li><div className="box" style={{visibility:'hidden'}}/><span className="mono" style={{fontSize:11.5,fontFamily:'JetBrains Mono, monospace'}}>apps/web/src/auth/passkey/*</span> <span style={{color:'var(--ink-3)'}}>(new)</span></li>
          <li><div className="box" style={{visibility:'hidden'}}/><span className="mono" style={{fontSize:11.5,fontFamily:'JetBrains Mono, monospace'}}>packages/api/src/session/middleware.ts</span></li>
        </ul>
      </div>
    </div>

    <div className="tdm-section">
      <h3>What the agent did just now</h3>
      <div className="tcall"><div className="tcall-head"><span className="name">Edit</span><span className="arg">apps/web/src/auth/passkey/register.ts</span><span className="dur">+38 −0 · 1.2s</span></div><div className="tcall-body">Created module with registerPasskey() wrapping @simplewebauthn/browser.</div></div>
      <div className="tcall"><div className="tcall-head"><span className="name">Bash</span><span className="arg">pnpm typecheck</span><span className="dur">4.2s</span></div><div className="tcall-body" style={{color:'var(--review)'}}>tsc — no errors</div></div>
      <div className="tcall"><div className="tcall-head"><span className="name">Edit</span><span className="arg">apps/web/src/auth/login.ts</span><span className="dur">+62 −41 · 0.8s</span></div><div className="tcall-body">Branch session creation on passkey support detection.</div></div>
    </div>
  </>;
}

function ThreadTab() {
  return <div className="tdm-section">
    <h3>Agent thread</h3>
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{background:'var(--bg-1)', border:'1px solid var(--hairline)', borderRadius:8, padding:'10px 12px'}}>
        <div style={{fontSize:11, color:'var(--ink-3)', marginBottom:5}}><b style={{color:'var(--ink-1)'}}>raj</b> · 30m ago</div>
        <div style={{fontSize:13, color:'var(--ink-1)', lineHeight:1.55}}>Implement the passkey registration flow per the spec. Run typecheck after each major edit.</div>
      </div>
      <div style={{background:'color-mix(in oklch, var(--bg-1) 80%, var(--accent-soft))', border:'1px solid var(--accent-line)', borderRadius:8, padding:'10px 12px'}}>
        <div style={{fontSize:11, color:'var(--ink-3)', marginBottom:5}}><b style={{color:'var(--accent)'}}>claude</b> · 28m ago</div>
        <div style={{fontSize:13, lineHeight:1.55, color:'var(--ink-1)'}}>I'll start by mapping the existing auth surface, then add the WebAuthn ceremony in a new passkey/ module so we don't disturb the password path.</div>
      </div>
      <div>
        <div style={{fontSize:11, color:'var(--ink-3)', marginBottom:5}}><b style={{color:'var(--accent)'}}>claude</b> · streaming</div>
        <div className="tcall"><div className="tcall-head"><span className="name">Edit</span><span className="arg">apps/web/src/auth/passkey/register.ts</span><span className="dur" style={{color:'var(--running)'}}>● live</span></div></div>
      </div>
    </div>
  </div>;
}

function DiffTab({ issue }) {
  const D = window.KB_DATA;
  return <div className="tdm-section">
    <h3>Diff vs main · 14 files · <span style={{color:'var(--add)'}}>+612</span> <span style={{color:'var(--del)'}}>−187</span></h3>
    <div className="diff-block">
      <div className="diff-head">
        <span className="branch">{issue.branch}</span>
        <span className="arrow">←</span>
        <span className="branch" style={{color:'var(--ink-3)'}}>main</span>
        <span className="stat"><span className="add">+612</span> <span className="del">−187</span></span>
      </div>
      {D.diff.files.map(f => (
        <div key={f.path} className="diff-file">
          <div className="diff-fhead">
            <span className={`stat-tag ${f.status}`}>{f.status}</span>
            <span className="path">{f.path}</span>
          </div>
          <div className="diff-hunk">
            {f.hunks.map((h,hi)=>(
              <React.Fragment key={hi}>
                <div className="diff-meta">{h.meta}</div>
                {h.lines.map((l,li)=>(
                  <div key={li} className={`diff-line ${l.k==='add'?'add':l.k==='del'?'del':''}`}>
                    <span className="ln">{l.k==='add'?'+':l.k==='del'?'−':' '}</span><span>{l.t || ' '}</span>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>;
}

function PreviewTab({ issue }) {
  return <div className="tdm-section">
    <h3>Branch preview · live dev server on this worktree</h3>
    <div className="preview-frame">
      <div className="pf-bar">
        <div className="pf-dots"><i/><i/><i/></div>
        <div className="pf-url">localhost:3041 · {issue.branch}</div>
        <span style={{color:'var(--review)'}}>● live</span>
      </div>
      <div className="pf-canvas" style={{height: 360}}>
        <div className="lbl" style={{color:'var(--ink-1)', fontSize:13}}>BRANCH PREVIEW</div>
        <div className="lbl">spawned via <span style={{color:'var(--accent)'}}>pnpm dev</span> in <span style={{color:'var(--ink-1)'}}>.kanbots/wt/{issue.number}</span></div>
      </div>
    </div>
    <div style={{display:'flex',gap:6,marginTop:10,flexWrap:'wrap'}}>
      <button className="btn">Restart dev server</button>
      <button className="btn">Run e2e on this branch</button>
      <button className="btn ghost">Open in browser ↗</button>
    </div>
  </div>;
}

function RunsTab() {
  return <div className="tdm-section">
    <h3>Run history</h3>
    <div className="run-timeline">
      <div className="run-row running">
        <div className="marker"><div className="dot"/></div>
        <div>
          <div className="run-meta-line"><span style={{color:'var(--running)', fontWeight:600}}>● Running</span><span className="id">run #7821</span><span>· 30m ago · raj</span></div>
          <div className="run-summary">Implement the passkey registration flow per the spec…</div>
          <div className="run-stats-inline"><span>opus-4.5</span><span className="add">+612</span><span className="del">−187</span><span>$2.41</span></div>
        </div>
        <button className="btn ghost">Stop</button>
      </div>
      <div className="run-row done">
        <div className="marker"><div className="dot"/></div>
        <div>
          <div className="run-meta-line"><span style={{color:'var(--review)', fontWeight:600}}>✓ Completed</span><span className="id">run #7799</span><span>· 4h ago · jess</span></div>
          <div className="run-summary">/spec — refined into 5 acceptance criteria.</div>
          <div className="run-stats-inline"><span>sonnet-4.5</span><span>14k/3k tok</span><span>$0.18</span></div>
        </div>
        <button className="btn ghost">View</button>
      </div>
      <div className="run-row failed">
        <div className="marker"><div className="dot"/></div>
        <div>
          <div className="run-meta-line"><span style={{color:'var(--failed)', fontWeight:600}}>✗ Failed</span><span className="id">run #7782</span><span>· yesterday · raj</span></div>
          <div className="run-summary">Hit a typecheck loop on session middleware.</div>
          <div className="run-stats-inline"><span>opus-4.5</span><span>$0.94</span><span>14m</span></div>
        </div>
        <button className="btn ghost">Log</button>
      </div>
    </div>
  </div>;
}

window.TaskDetailModal = TaskDetailModal;
