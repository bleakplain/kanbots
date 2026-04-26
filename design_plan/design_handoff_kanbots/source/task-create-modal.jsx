// Task Create modal — overlays the kanban board

const TEMPLATES = [
  { id:'bug',      icon:'!',  name:'Bug fix' },
  { id:'feature',  icon:'+',  name:'Feature' },
  { id:'refactor', icon:'~',  name:'Refactor' },
  { id:'review',   icon:'?',  name:'Review' },
  { id:'spike',    icon:'*',  name:'Spike' },
];

const MODES = [
  { id:'spec',     glyph:'✎', name:'Spec first',        desc:'Run /spec to refine acceptance criteria. Wait for my approval.' },
  { id:'dispatch', glyph:'▶', name:'Create & dispatch', desc:'Spawn the agent immediately on a fresh worktree.' },
  { id:'queue',    glyph:'◷', name:'Queue for later',   desc:"Sit in the Backlog. I'll start it manually." },
];

function TaskCreateModal({ onClose }) {
  const [title, setTitle] = React.useState('');
  const [body, setBody] = React.useState('');
  const [mode, setMode] = React.useState('spec');
  const [tpl, setTpl] = React.useState('feature');
  const [folder] = React.useState('kanbots');
  const [base] = React.useState('main');
  const [model, setModel] = React.useState('opus-4.5');
  const [assignee, setAssignee] = React.useState('claude');
  const [tag, setTag] = React.useState('feat');
  const [priority, setPriority] = React.useState('p2');
  const [scope, setScope] = React.useState(['apps/web/src/auth/**']);
  const [checks, setChecks] = React.useState({ tsc: true, tests: true, lint: false, e2e: false, preview: true });

  const branchName = React.useMemo(() => {
    const slug = (title || 'untitled')
      .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0, 36) || 'task';
    return `claude/${slug}`;
  }, [title]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const previewIssue = {
    number: 425,
    title: title || 'Untitled task',
    repo: folder,
    branch: branchName,
    tag,
    agent: mode === 'queue' ? 'idle' : (mode === 'spec' ? 'awaiting' : 'running'),
    assignees: [{ login: assignee, color: assignee === 'claude' ? 'oklch(0.78 0.13 60)' : 'oklch(0.74 0.14 280)' }],
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="crumb-chip"><b>kanbots</b></span>
          <span style={{color:'var(--ink-4)'}}>·</span>
          <h2>New task</h2>
          <span className="grow"/>
          <span style={{color:'var(--ink-3)', fontSize:11.5}}>Press <span className="kbd">⌘↵</span> to create</span>
          <button className="x-btn" onClick={onClose} title="Close (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6l-12 12"/></svg>
          </button>
        </div>

        <div className="modal-body">
          <main className="modal-main">
            <div className="tcm-content">
              {/* TITLE */}
              <div className="field">
                <label className="field-label">Title <span className="field-hint">→ becomes branch + PR title</span></label>
                <input className="input title-input" placeholder="e.g. Replace password login with passkey-first onboarding"
                  value={title} onChange={e=>setTitle(e.target.value)} autoFocus/>
                {title ? (
                  <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--ink-3)'}}>
                    <span style={{color:'var(--ink-4)'}}>branch will be</span>
                    <span style={{fontFamily:'JetBrains Mono, monospace', color:'var(--accent)'}}>{branchName}</span>
                  </div>
                ) : null}
              </div>

              {/* TEMPLATE */}
              <div className="field">
                <label className="field-label">Template</label>
                <div className="templates">
                  {TEMPLATES.map(t=>(
                    <button key={t.id} className={`tpl ${tpl===t.id?'on':''}`} onClick={()=>setTpl(t.id)}>
                      <span className="ico">{t.icon}</span>{t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* DESCRIPTION */}
              <div className="field">
                <label className="field-label">Description<span className="field-hint">Markdown · @ for files · use AC: for acceptance criteria</span></label>
                <textarea className="textarea" value={body} onChange={e=>setBody(e.target.value)}
                  placeholder={"What is the user-facing outcome?\n\nAC:\n- A new user can register a passkey on first login\n- Existing users see a banner with passkey CTA"}/>
              </div>

              {/* MODE */}
              <div className="field">
                <label className="field-label">How should this start?</label>
                <div className="modes">
                  {MODES.map(m=>(
                    <div key={m.id} className={`mode-card ${mode===m.id?'on':''}`} onClick={()=>setMode(m.id)}>
                      <div className="mode-radio"/>
                      <div className="mode-glyph">{m.glyph}</div>
                      <div className="mode-name">{m.name}</div>
                      <div className="mode-desc">{m.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* CONTEXT */}
              <div className="field">
                <label className="field-label">Context</label>
                <div className="sub-grid">
                  <div className="pill-select"><span className="lbl">folder</span><span className="v mono">{folder}</span><span className="caret">▾</span></div>
                  <div className="pill-select"><span className="lbl">base</span><span className="v mono">{base}</span><span className="caret">▾</span></div>
                </div>
                <div className="scope-row" style={{marginTop:6}}>
                  <span style={{fontSize:11, color:'var(--ink-3)', marginRight:4}}>scope:</span>
                  {scope.map((p,i)=>(
                    <span key={i} className="scope-chip">{p}<span className="x" onClick={()=>setScope(scope.filter((_,j)=>j!==i))}>×</span></span>
                  ))}
                  <button className="scope-add">+ Add path</button>
                </div>
              </div>

              {/* AGENT */}
              <div className="field">
                <label className="field-label">Agent</label>
                <div className="sub-grid">
                  <div className="pill-select" onClick={()=>setAssignee(assignee==='claude'?'raj':'claude')}>
                    <span className="lbl">assignee</span>
                    <span className="v">{assignee === 'claude' ? 'claude (auto)' : 'raj (manual)'}</span>
                    <span className="caret">▾</span>
                  </div>
                  <div className="pill-select" onClick={()=>setModel(model==='opus-4.5'?'sonnet-4.5':'opus-4.5')}>
                    <span className="lbl">model</span>
                    <span className="v mono">{model}</span>
                    <span className="caret">▾</span>
                  </div>
                </div>
              </div>

              {/* CHECKS */}
              <div className="field">
                <label className="field-label">Auto-run on each step <span className="field-hint">surface failures inline on the card</span></label>
                <div className="checklist">
                  <label><input type="checkbox" checked={checks.tsc}     onChange={e=>setChecks({...checks, tsc:e.target.checked})}/><div><b style={{fontWeight:500, color:'var(--ink)'}}>Typecheck</b><span className="lt">pnpm typecheck · ~4s</span></div></label>
                  <label><input type="checkbox" checked={checks.tests}   onChange={e=>setChecks({...checks, tests:e.target.checked})}/><div><b style={{fontWeight:500, color:'var(--ink)'}}>Unit tests</b><span className="lt">vitest · ~12s</span></div></label>
                  <label><input type="checkbox" checked={checks.lint}    onChange={e=>setChecks({...checks, lint:e.target.checked})}/><div><b style={{fontWeight:500, color:'var(--ink)'}}>Lint</b><span className="lt">eslint --cache · ~2s</span></div></label>
                  <label><input type="checkbox" checked={checks.e2e}     onChange={e=>setChecks({...checks, e2e:e.target.checked})}/><div><b style={{fontWeight:500, color:'var(--ink)'}}>End-to-end</b><span className="lt">playwright · only on review-ready</span></div></label>
                  <label><input type="checkbox" checked={checks.preview} onChange={e=>setChecks({...checks, preview:e.target.checked})}/><div><b style={{fontWeight:500, color:'var(--ink)'}}>Branch preview</b><span className="lt">live URL on the card</span></div></label>
                </div>
              </div>

              {/* LABELS */}
              <div className="field" style={{marginBottom:0}}>
                <label className="field-label">Labels</label>
                <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
                  <div>
                    <div style={{fontSize:10.5, color:'var(--ink-3)', marginBottom:5}}>TYPE</div>
                    <div className="seg">{['feat','fix','chore','infra','docs'].map(t=>(
                      <button key={t} className={tag===t?'on':''} onClick={()=>setTag(t)}>{t}</button>
                    ))}</div>
                  </div>
                  <div>
                    <div style={{fontSize:10.5, color:'var(--ink-3)', marginBottom:5}}>PRIORITY</div>
                    <div className="seg">{['p0','p1','p2','p3'].map(p=>(
                      <button key={p} className={priority===p?'on':''} onClick={()=>setPriority(p)}>{p.toUpperCase()}</button>
                    ))}</div>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <aside className="modal-aside">
            <div className="mas-block">
              <div className="mas-h">How it'll appear</div>
              <div style={{fontSize:10, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--ink-3)', marginBottom:8}}>{
                mode === 'queue' ? 'BACKLOG' : mode === 'spec' ? 'AWAITING INPUT' : 'IN PROGRESS'
              }</div>
              <div className="preview-card-wrap">
                <PreviewCard issue={previewIssue} mode={mode} title={title || 'Untitled task'}/>
              </div>
              <div style={{marginTop:12, fontSize:11, color:'var(--ink-3)', lineHeight:1.55}}>
                Branch <span style={{fontFamily:'JetBrains Mono, monospace', color:'var(--accent)'}}>{branchName}</span> off <span style={{fontFamily:'JetBrains Mono, monospace', color:'var(--ink-1)'}}>{base}</span> in <span style={{fontFamily:'JetBrains Mono, monospace', color:'var(--ink-2)'}}>.kanbots/wt/425</span>.
              </div>
            </div>

            <div className="mas-block">
              <div className="mas-h">What runs</div>
              <div style={{display:'flex',flexDirection:'column',gap:7, fontSize:12}}>
                <Step n="1" label="git worktree add" sub={`→ ${branchName}`}/>
                {mode === 'spec' ? (
                  <Step n="2" label="claude /spec" sub="refine into acceptance criteria"/>
                ) : mode === 'dispatch' ? (
                  <Step n="2" label="claude code" sub={`spawn ${model} on the worktree`}/>
                ) : (
                  <Step n="2" label="(idle)" sub="wait for you to press Start" muted/>
                )}
                {mode !== 'queue' && checks.preview ? (
                  <Step n="3" label="pnpm dev" sub="branch preview comes online"/>
                ) : null}
              </div>
            </div>
          </aside>
        </div>

        <div className="modal-foot">
          <span className="hint">{
            mode === 'spec' ? 'Will create a worktree and run /spec — agent waits for approval.' :
            mode === 'dispatch' ? 'Will create a worktree and start coding immediately.' :
            'Will land in Backlog. No worktree until you start it.'
          }</span>
          <span className="grow"/>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <div className="btn-grp">
            <button className="btn primary">
              {mode === 'spec' ? 'Create & spec' : mode === 'dispatch' ? 'Create & dispatch' : 'Create task'}
              <span className="kbd" style={{marginLeft:6}}>⌘↵</span>
            </button>
            <button className="btn primary" title="More options">▾</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ n, label, sub, muted }) {
  return (
    <div style={{display:'flex',gap:9, opacity: muted ? 0.55 : 1}}>
      <div style={{width:18, height:18, borderRadius:'50%', background:'var(--bg-2)', border:'1px solid var(--hairline)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'var(--ink-2)', fontFamily:'JetBrains Mono, monospace', flexShrink:0}}>{n}</div>
      <div>
        <div style={{fontFamily:'JetBrains Mono, monospace', fontSize:11.5, color:'var(--ink-1)'}}>{label}</div>
        <div style={{fontSize:10.5, color:'var(--ink-3)', marginTop:1}}>{sub}</div>
      </div>
    </div>
  );
}

function PreviewCard({ issue, mode, title }) {
  const lane = mode === 'queue' ? '' : mode === 'spec' ? 'awaiting' : 'running';
  return (
    <div className={`card ${lane}`}>
      <div className="card-head">
        <span className="num">#{issue.number}</span>
        <span className={`tag ${issue.tag}`}>{issue.tag}</span>
        <span className="repo mono">{issue.repo}</span>
        {lane === 'running' ? (
          <span className="card-status-pill" style={{marginLeft:'auto'}}><span className="px"/>QUEUED</span>
        ) : lane === 'awaiting' ? (
          <span className="card-status-pill awaiting" style={{marginLeft:'auto'}}><span className="px"/>SPEC</span>
        ) : null}
      </div>
      <h4 className="card-title">{title}</h4>
      <div className="card-meta-row">
        <span className="branch-pill mono">{issue.branch}</span>
      </div>
      <div className="card-foot">
        <div className="avatars">
          {issue.assignees.map(a=>(
            <div key={a.login} className="avatar" style={{background: a.color}} title={a.login}>{a.login[0].toUpperCase()}</div>
          ))}
        </div>
        <span className="age">just now</span>
      </div>
    </div>
  );
}

window.TaskCreateModal = TaskCreateModal;
