import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { defaultLayout, layoutErrors, layoutWarnings, ROLE_IDS, widgetName, widgets, type AppState, type Box, type HeartStatus, type Layout, type RoleId, type WidgetId } from '../shared/model';
import { position, Strip } from './Strip';

export function Numeric({ label, value, onChange, min = 0, max = 8192, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label className="field numeric"><span>{label}</span><input aria-label={label} type="number" value={value} min={min} max={max} step={step} onChange={e => { if (e.target.value !== '' && Number.isFinite(e.target.valueAsNumber)) onChange(e.target.valueAsNumber); }}/></label>;
}

export function Preview({ state, layout, status, editing = false, selected, onSelect, onBoxChange }: {
  state: AppState; layout: Layout; status: HeartStatus; editing?: boolean; selected?: WidgetId;
  onSelect?: (id: WidgetId) => void; onBoxChange?: (id: WidgetId, box: Partial<Box>) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(900);
  const [zoom, setZoom] = useState('fit');
  const drag = useRef<{ pointer: number; x: number; y: number; box: Box; id: WidgetId; resize: boolean } | null>(null);
  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setAvailable(Math.max(100, entry.contentRect.width - 48)));
    if (container.current) ro.observe(container.current);
    return () => ro.disconnect();
  }, []);
  const scale = zoom === 'fit' ? Math.min(1, available / layout.width) : Number(zoom);
  const start = (event: PointerEvent<HTMLButtonElement>, id: WidgetId, b: Box) => {
    if (event.button !== 0) return;
    onSelect?.(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, box: { ...b }, id, resize: (event.target as HTMLElement).dataset.resize === 'true' };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== event.pointerId) return;
    const dx = Math.round((event.clientX - d.x) / scale), dy = Math.round((event.clientY - d.y) / scale);
    onBoxChange?.(d.id, d.resize ? { width: Math.max(8, d.box.width + dx), height: Math.max(8, d.box.height + dy) } : { x: Math.max(0, d.box.x + dx), y: Math.max(0, d.box.y + dy) });
  };
  return <section className={`preview-panel ${editing ? 'editing' : ''}`}>
    <div className="preview-top"><div><span className={`live-dot ${editing ? 'draft' : ''}`}/><strong>{editing ? '布局草稿' : '直播画面预览'}</strong><span className="preview-size">{layout.width} × {layout.height}</span></div>
      <label className="zoom-control">预览缩放 <select aria-label="预览缩放" value={zoom} onChange={e => setZoom(e.target.value)}><option value="fit">适应宽度</option><option value="1">100%</option><option value="1.5">150%</option><option value="2">200%</option></select></label>
    </div>
    <div className="preview-viewport" ref={container}>
      <div className="preview-scroll"><div className="preview-frame" style={{ width: layout.width * scale, height: layout.height * scale }}>
        <div className="preview-canvas" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
          <Strip state={state} layout={layout} status={status} preview sampleLyrics/>
          {editing && <>
            <div className="center-guide" style={{ left: layout.width / 2 }}/>
            {widgets(layout).map(([id, b]) => <button key={id} type="button" aria-label={`编辑${widgetName(id)}`} data-testid={`editor-${id}`} className={`edit-box ${selected === id ? 'selected' : ''} ${!b.visible ? 'hidden-widget' : ''}`} style={position(b)}
              onPointerDown={e => start(e, id, b)} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
              onKeyDown={e => {
                const step = e.shiftKey ? 10 : 1;
                const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (delta) { e.preventDefault(); onBoxChange?.(id, { x: Math.max(0, b.x + delta[0]), y: Math.max(0, b.y + delta[1]) }); }
              }}><span className="resize-handle" data-resize="true"/></button>)}
          </>}
        </div>
      </div></div>
    </div>
    <div className="preview-bottom"><span>心率在左 · 歌词居中 · 五分路在右</span><span>{editing ? '拖动移动 · 右下角缩放 · 应用后生效' : '歌词示意与网页状态仅用于控制台预览'}</span></div>
  </section>;
}

export function Editor({ state, status, draft, setDraft, run }: { state: AppState; status: HeartStatus; draft: Layout; setDraft: (layout: Layout | null) => void; run: (op: Promise<{ ok: boolean; error?: string }>, message?: string) => Promise<boolean> }) {
  const [selected, setSelected] = useState<WidgetId>('clash');
  const box = selected === 'heart' ? draft.heart : selected === 'lyrics' ? draft.lyrics : draft.roles[selected];
  const errors = layoutErrors(draft);
  const warnings = errors.length ? [] : layoutWarnings(draft);
  const changed = JSON.stringify(draft) !== JSON.stringify(state.layout);
  const changeBox = (id: WidgetId, patch: Partial<Box> & { iconSize?: number; statusWidth?: number }) => {
    if (id === 'heart' || id === 'lyrics') setDraft({ ...draft, [id]: { ...draft[id], ...patch } });
    else setDraft({ ...draft, roles: { ...draft.roles, [id]: { ...draft.roles[id], ...patch } } });
  };
  return <>
    <Preview state={state} layout={draft} status={status} editing selected={selected} onSelect={setSelected} onBoxChange={changeBox}/>
    <div className="editor-grid">
      <section className="panel"><div className="section-heading"><h2>画布设置</h2><span className={`tiny-tag ${changed ? 'amber' : ''}`}>{changed ? '有未应用的修改' : '与直播一致'}</span></div>
        <div className="field-row"><Numeric label="画布宽度" value={draft.width} min={320} onChange={width => setDraft({ ...draft, width })}/><Numeric label="画布高度" value={draft.height} min={32} max={2160} onChange={height => setDraft({ ...draft, height })}/></div>
        <label className="field"><span>展示背景</span><select aria-label="展示背景" value={draft.background} onChange={e => setDraft({ ...draft, background: e.target.value as Layout['background'] })}><option value="transparent">透明 · 叠加在直播黑边</option><option value="black">纯黑 · 捕获兼容模式</option></select></label>
        <label className="check-row"><input type="checkbox" checked={draft.animations} onChange={e => setDraft({ ...draft, animations: e.target.checked })}/><span>启用状态切换渐变</span></label>
        <p className="muted">修改尺寸不会自动移动控件。中心虚线和选框仅在这里可见。</p>
      </section>
      <section className="panel"><div className="section-heading"><h2>控件属性</h2><span className="tiny-tag">精确到像素</span></div>
        <label className="field"><span>选择控件</span><select aria-label="选择控件" value={selected} onChange={e => setSelected(e.target.value as WidgetId)}>{['heart', 'lyrics', ...ROLE_IDS].map(id => <option key={id} value={id}>{widgetName(id as WidgetId)}</option>)}</select></label>
        <div className="field-row"><Numeric label="X 位置" value={box.x} onChange={x => changeBox(selected, { x })}/><Numeric label="Y 位置" value={box.y} max={4320} onChange={y => changeBox(selected, { y })}/><Numeric label="控件宽度" value={box.width} min={8} onChange={width => changeBox(selected, { width })}/><Numeric label="控件高度" value={box.height} min={8} max={4320} onChange={height => changeBox(selected, { height })}/></div>
        {ROLE_IDS.includes(selected as RoleId) && <div className="field-row"><Numeric label="图标大小" value={draft.roles[selected as RoleId].iconSize} min={8} max={40} onChange={iconSize => changeBox(selected, { iconSize })}/><Numeric label="状态线粗细" value={draft.roles[selected as RoleId].statusWidth} min={1} max={4} step={0.1} onChange={statusWidth => changeBox(selected, { statusWidth })}/></div>}
        <label className="check-row"><input type="checkbox" checked={box.visible} onChange={e => changeBox(selected, { visible: e.target.checked })}/><span>{selected === 'lyrics' ? '显示歌词预留参考（仅控制台）' : '在直播画面中显示'}</span></label>
      </section>
    </div>
    {errors.length > 0 && <div className="notice error" role="alert">{errors.join(' ')}</div>}
    {warnings.length > 0 && <div className="notice warning">{warnings.join(' ')} 请核对是否符合预期。</div>}
    <div className="editor-footer"><button onClick={() => setDraft(defaultLayout())}>恢复默认布局</button><div><button onClick={() => setDraft(structuredClone(state.layout))}>取消修改</button><button className="primary" disabled={errors.length > 0 || !changed} onClick={async () => { if (await run(window.panel.applyLayout(draft), '布局已应用到直播窗口')) setDraft(null); }}>应用到直播</button></div></div>
  </>;
}
