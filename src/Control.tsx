import { useEffect, useRef, useState } from 'react';
import { ROLE_IDS, ROLE_NAMES, SLOT_STATUSES, STATUS_NAMES, type AppState, type Layout, type Result, type Snapshot } from '../shared/model';
import { Editor, Numeric, Preview } from './Editor';
import { RoleIndicator } from './Strip';
import { SmallIcon } from './icons';

const titles = {
  team: ['车队状态', '五个分路，三种状态。选择后即刻同步到直播画面。'],
  layout: ['布局编辑', '在草稿中调整位置与样式，再应用到直播画面。'],
  heart: ['心率连接', '像添加OBS浏览器源一样，粘贴HypeRate展示网址。'],
};
type Tab = keyof typeof titles;
export function Control({ snapshot }: { snapshot: Snapshot }) {
  const { state, runtime } = snapshot;
  const [tab, setTab] = useState<Tab>('team');
  const [draft, setDraft] = useState<Layout | null>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);
  const run = async (op: Promise<Result>, message = '') => {
    try {
      const result = await op;
      if (!result.ok || message) {
        setNotice({ text: result.error || message, error: !result.ok });
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 6000);
      }
      return result.ok;
    } catch { setNotice({ text: '操作失败，请稍后重试。', error: true }); return false; }
  };
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img className="brand-mark" src="./app-icon.svg" alt="" draggable={false}/><div><strong>荣耀车队</strong><span>LIVE PANEL</span></div></div>
      <div className="side-label">直播控制</div>
      <nav aria-label="控制台功能">{(['team', 'layout', 'heart'] as Tab[]).map(key => <button key={key} className={tab === key ? 'active' : ''} aria-current={tab === key ? 'page' : undefined} onClick={() => { setTab(key); if (key === 'layout' && !draft) setDraft(structuredClone(state.layout)); }}><SmallIcon kind={key === 'team' ? 'grid' : key === 'layout' ? 'layout' : 'heart'}/>{titles[key][0]}{key === 'layout' && draft && JSON.stringify(draft) !== JSON.stringify(state.layout) && <i className="unsaved-dot"/>}</button>)}</nav>
      <div className="side-bottom"><button className="help-button" onClick={() => run(window.panel.openHelp('guide'))}><SmallIcon kind="help"/>使用说明</button><div className="local-status"><span/>本地运行 · 自动保存</div><div className="version">KING LIVE PANEL　1.0.1</div></div>
    </aside>
    <main className="main-content">
      <header className="page-header"><div><span className="eyebrow">王者荣耀 / 直播信息屏</span><h1>{titles[tab][0]}</h1><p>{titles[tab][1]}</p></div><div className="output-badge"><span className={`live-dot ${runtime.displayVisible ? '' : 'off'}`}/>{runtime.displayVisible ? '展示窗口已开启' : '展示窗口已隐藏'}</div></header>
      {runtime.storageWarning && <div className="notice warning">{runtime.storageWarning}</div>}
      {tab !== 'layout' && <Preview state={state} layout={state.layout} status={runtime.heartStatus}/>}
      {tab === 'team' && <>
        <div className="section-heading roles-heading"><div><h2>五分路席位</h2><p className="muted">徽记下沿表示席位状态，对局结束后手动修改。</p></div><div className="legend"><span><i className="green"/>空位</span><span><i className="yellow"/>下局有人</span><span><i className="red"/>有人</span></div></div>
        <div className="role-cards">{ROLE_IDS.map((id, index) => <section className="role-card" key={id}>
          <div className="role-card-heading"><span>0{index + 1}</span><span>{['CLASH', 'JUNGLE', 'MID', 'FARM', 'ROAM'][index]}</span></div>
          <div className="card-glyph"><RoleIndicator id={id} box={state.layout.roles[id]} value={state.slots[id]} animations={state.layout.animations}/></div>
          <h3>{ROLE_NAMES[id]}</h3>
          <div className="slot-controls" role="group" aria-label={`${ROLE_NAMES[id]}状态`}>{SLOT_STATUSES.map(status => <button key={status} aria-pressed={state.slots[id] === status} aria-label={`${ROLE_NAMES[id]}：${STATUS_NAMES[status]}`} data-testid={`${id}-${status}`} disabled={pending[id]} className={`slot-option ${status} ${state.slots[id] === status ? 'selected' : ''}`} onClick={async () => {
            setPending(p => ({ ...p, [id]: true }));
            await run(window.panel.setSlot(id, status));
            setPending(p => ({ ...p, [id]: false }));
          }}><span>{STATUS_NAMES[status]}</span><span className="option-check" aria-hidden="true">{state.slots[id] === status ? '✓' : ''}</span></button>)}</div>
        </section>)}</div>
        <div className="quiet-note"><span className="note-mark">i</span>每个分路只显示一种状态。选择自动保存，下次打开继续保留。</div>
      </>}
      {tab === 'layout' && <Editor state={state} status={runtime.heartStatus} draft={draft || state.layout} setDraft={setDraft} run={run}/>}
      {tab === 'heart' && <HeartSettings state={state} status={runtime.heartStatus} run={run}/>}
      <section className="window-toolbar"><div><strong>直播展示窗口</strong><span>在直播伴侣中选择「王者直播信息屏 · 直播展示」</span></div><div className="toolbar-actions"><button onClick={() => run(window.panel.display(runtime.displayVisible ? 'hide' : 'show'))}>{runtime.displayVisible ? '隐藏窗口' : '显示窗口'}</button><button onClick={() => run(window.panel.display('reposition'), '展示窗口已定位到屏幕底部')}>定位到底部</button><button aria-pressed={runtime.alwaysOnTop} className={runtime.alwaysOnTop ? 'selected-button' : ''} onClick={() => run(window.panel.display('pin'))}>窗口置顶</button></div></section>
      <footer className="app-footer"><span>手动掌控 · 安静呈现</span><span>{state.layout.width} × {state.layout.height} / {state.layout.background === 'transparent' ? '透明背景' : '黑色背景'}</span></footer>
    </main>
    {notice && <div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.text}<button aria-label="关闭提示" onClick={() => setNotice(null)}>×</button></div>}
  </div>;
}

function HeartSettings({ state, status, run }: { state: AppState; status: Snapshot['runtime']['heartStatus']; run: (op: Promise<Result>, message?: string) => Promise<boolean> }) {
  const [url, setURL] = useState(state.heart.url);
  const [zoom, setZoom] = useState(state.heart.zoom);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setURL(state.heart.url); setZoom(state.heart.zoom); }, [state.heart.url, state.heart.zoom]);
  const statusText = { unconfigured: state.layout.heart.visible ? '尚未配置' : '心率控件已隐藏', loading: '正在加载网页', loaded: '网页已载入', error: '网页加载失败，将自动重试' }[status];
  return <div className="heart-settings-grid"><section className="panel"><div className="section-heading"><h2>连接你的HypeRate</h2><span className={`tiny-tag ${status === 'error' ? 'amber' : ''}`}>{statusText}</span></div>
    <label className="field"><span>心率展示网址</span><textarea aria-label="心率展示网址" rows={3} value={url} onChange={e => setURL(e.target.value)} placeholder="粘贴HypeRate提供的完整OBS展示网址" spellCheck={false}/></label>
    <p className="muted">支持app.hyperate.io和designer.hyperate.io生成的展示链接，保留所有样式参数。无需API Key。</p>
    <div className="heart-settings-bottom"><Numeric label="网页缩放倍数" value={zoom} onChange={setZoom} min={0.1} max={5} step={0.1}/><div className="button-row"><button onClick={() => run(window.panel.refreshHeart(), '已刷新心率网页')} disabled={!state.heart.url}>刷新网页</button><button className="primary" disabled={saving} onClick={async () => { setSaving(true); await run(window.panel.setHeart({ url, zoom }), '心率设置已保存'); setSaving(false); }}>保存并加载</button></div></div>
    <div className="notice subtle">网页载入不代表手表正在测量。真实数值显示在左侧直播窗口，控制台不读取心率。</div>
  </section><section className="panel setup-guide"><span className="eyebrow">APPLE WATCH → HYPERATE → 直播</span><h2>第一次连接</h2><ol><li>在iPhone与Apple Watch安装HypeRate并开始测量。</li><li>获取展示网址，或在官方设计器选择白色数字、透明背景和简洁心形。</li><li>复制OBS展示网址到左侧，加载后调整缩放。</li></ol><div className="button-row"><button onClick={() => run(window.panel.openHelp('hyperate'))}>HypeRate官网 ↗</button><button onClick={() => run(window.panel.openHelp('designer'))}>打开设计器 ↗</button></div></section></div>;
}
