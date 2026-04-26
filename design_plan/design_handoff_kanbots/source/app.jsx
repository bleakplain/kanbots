// kanbots — main app

const { Card, Column, LeftRail, Avatar, ICONS } = window.KBComponents;
const { Inspector, Palette, Tray } = window.KBInspector;

const COLS = [
  { key: null,         label: 'Inbox',       status: 'inbox' },
  { key: 'backlog',    label: 'Backlog',     status: 'backlog' },
  { key: 'todo',       label: 'Todo',        status: 'todo' },
  { key: 'inProgress', label: 'In Progress', status: 'inProgress' },
  { key: 'review',     label: 'Review',      status: 'review' },
  { key: 'done',       label: 'Done',        status: 'done' },
];

function App() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "dark",
    "showTray": true,
    "showInspector": true,
    "density": "comfy",
    "accentHue": 45
  }/*EDITMODE-END*/;

  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [selected, setSelected] = React.useState(412);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [detailIssue, setDetailIssue] = React.useState(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', tweaks.theme === 'paper' ? 'paper' : 'dark');
    document.documentElement.style.setProperty('--accent', `oklch(${tweaks.theme==='paper'?'0.585':'0.745'} 0.155 ${tweaks.accentHue})`);
    document.documentElement.style.setProperty('--accent-line', `oklch(${tweaks.theme==='paper'?'0.585':'0.745'} 0.155 ${tweaks.accentHue} / 0.45)`);
    document.documentElement.style.setProperty('--accent-soft', `oklch(${tweaks.theme==='paper'?'0.585':'0.745'} 0.155 ${tweaks.accentHue} / 0.14)`);
    document.documentElement.style.setProperty('--running', `oklch(${tweaks.theme==='paper'?'0.585':'0.745'} 0.155 ${tweaks.accentHue})`);
  }, [tweaks.theme, tweaks.accentHue]);

  React.useEffect(() => {
    const onKey = (e) => {
      const isField = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA';
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(v => !v); }
      if (e.key === 'n' && !isField && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setCreateOpen(true); }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const issues = window.KB_DATA.issues;
  const grouped = COLS.map(c => ({
    ...c,
    issues: issues.filter(i => i.status === c.key),
  }));

  const selectedIssue = issues.find(i => i.number === selected);
  const runningIssues = issues.filter(i => i.agent === 'running' || i.agent === 'awaiting');

  return (
    <div className="stage">
      <div className="mac-window">
        {/* Title bar */}
        <div className="mac-titlebar">
          <div className="tlights">
            <div className="tlight r"/>
            <div className="tlight y"/>
            <div className="tlight g"/>
          </div>
          <div className="tbar-title">
            <span className="dot"/>
            <span>Anthropic stack</span>
            <span style={{color:'var(--ink-3)'}}>/</span>
            <span style={{color:'var(--ink-1)'}}>kanbots</span>
            <span className="mono" style={{color:'var(--ink-3)', fontSize: 10.5}}>main</span>
          </div>
          <div className="tbar-actions">
            <button className="tbar-btn" title="Sidebar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></svg></button>
            <button className="tbar-btn" title="Inspector" onClick={() => setTweak('showInspector', !tweaks.showInspector)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg></button>
          </div>
        </div>

        {/* Shell */}
        <div className={`shell ${!tweaks.showInspector ? 'no-inspector' : ''}`}>
          <LeftRail
            workspace={window.KB_DATA.workspace}
            folders={window.KB_DATA.folders}
            runningIssues={runningIssues}
            onOpenPalette={() => setPaletteOpen(true)}
          />

          <main className="center">
            {/* Top toolbar */}
            <div className="center-bar">
              <div className="crumbs">
                <span className="crumb">Anthropic stack</span>
                <span className="sep">/</span>
                <span className="crumb">kanbots</span>
                <span className="sep">/</span>
                <span className="crumb active">Board</span>
              </div>
              <div className="toolbar">
                <div className="search">{ICONS.search}<span>Search issues, branches, agents…</span><span style={{marginLeft:'auto', fontFamily:'JetBrains Mono', fontSize: 10.5, color:'var(--ink-4)'}}>⌘K</span></div>
                <button className="btn ghost">{ICONS.filter} Filter</button>
                <button className="btn ghost">Group: status</button>
                <button className="btn primary" onClick={() => setCreateOpen(true)}>{ICONS.plus} New task <span className="kbd">N</span></button>
              </div>
            </div>

            {/* Filter pills */}
            <div className="filter-row">
              <span className="pill on"><span className="x"/>Open</span>
              <span className="pill">All assignees</span>
              <span className="pill on" style={{color:'var(--running)', borderColor:'oklch(0.745 0.155 45 / 0.45)', background:'oklch(0.745 0.155 45 / 0.10)'}}><span className="x"/>Has agent</span>
              <span className="pill">priority:p0 · p1</span>
              <span className="pill">area:auth +3</span>
              <span style={{flex:1}}/>
              <span style={{color:'var(--ink-3)', fontSize: 11.5, fontFamily:'JetBrains Mono'}}>14 issues · 3 active runs · 2 awaiting · $7.42 today</span>
            </div>

            {/* Board */}
            <div className="board">
              {grouped.map(g => (
                <Column
                  key={String(g.key)}
                  status={g.status}
                  label={g.label}
                  issues={g.issues}
                  selectedNum={selected}
                  onSelect={setSelected}
                  onOpen={setDetailIssue}
                />
              ))}
            </div>
          </main>

          {tweaks.showInspector ? (
            <Inspector
              issue={selectedIssue}
              ticker={window.KB_DATA.tickerEvents}
              diff={window.KB_DATA.diff}
              onResolveDecision={() => {}}
              onExpand={() => setDetailIssue(selectedIssue)}
            />
          ) : null}
        </div>

        {tweaks.showTray ? <Tray decisions={window.KB_DATA.decisions} onJump={setSelected}/> : null}
        <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)}/>
        {detailIssue ? <TaskDetailModal issue={detailIssue} onClose={() => setDetailIssue(null)}/> : null}
        {createOpen ? <TaskCreateModal onClose={() => setCreateOpen(false)}/> : null}

        <TweaksPanel title="Tweaks">
          <TweakSection label="Theme">
            <TweakRadio name="theme" value={tweaks.theme} onChange={v => setTweak('theme', v)}
              options={[{value:'dark',label:'Dark'},{value:'paper',label:'Paper'}]} />
          </TweakSection>
          <TweakSection label="Accent hue">
            <TweakSlider value={tweaks.accentHue} onChange={v => setTweak('accentHue', v)} min={0} max={360} step={1}/>
          </TweakSection>
          <TweakSection label="Layout">
            <TweakToggle label="Inspector dock" value={tweaks.showInspector} onChange={v => setTweak('showInspector', v)}/>
            <TweakToggle label="Decision tray" value={tweaks.showTray} onChange={v => setTweak('showTray', v)}/>
          </TweakSection>
          <TweakSection label="Try things">
            <TweakButton onClick={() => setPaletteOpen(true)}>Open command palette (⌘K)</TweakButton>
            <TweakButton onClick={() => setSelected(408)}>Focus a paused agent</TweakButton>
            <TweakButton onClick={() => setSelected(401)}>Focus a review-ready PR</TweakButton>
          </TweakSection>
        </TweaksPanel>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
