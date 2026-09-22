import { useEffect, useRef, type CSSProperties } from 'react';
import { ROLE_IDS, ROLE_COLORS, ROLE_NAMES, STATUS_NAMES, type AppState, type HeartStatus, type Layout, type SlotStatus, type RoleBox, type RoleId } from '../shared/model';
import { HeartGlyph, RoleGlyph } from './icons';

export function RoleIndicator({ id, value, box, animations }: { id: RoleId; value: SlotStatus; box: RoleBox; animations: boolean }) {
  const previous = useRef(value);
  const indicator = useRef<SVGPathElement>(null);
  useEffect(() => {
    if (animations && previous.current !== value && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      indicator.current?.animate([{ opacity: .55 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
    }
    if (!animations) indicator.current?.getAnimations().forEach(animation => animation.cancel());
    previous.current = value;
  }, [value, animations]);
  return <div className={`role-indicator ${animations ? 'animated' : ''}`} data-role={id} data-status={value}
    aria-label={`${ROLE_NAMES[id]}：${STATUS_NAMES[value]}`} role="img">
    <div className="role-glyph" style={{ width: `${box.iconSize / 48 * 100}%`, height: `${box.iconSize / 48 * 100}%` }}><RoleGlyph role={id}/></div>
    <svg className="role-status-layer" viewBox="0 0 48 48" aria-hidden="true">
      <path ref={indicator} className="status-line" d="M10 43 H20 L24 45 L28 43 H38" fill="none" stroke={ROLE_COLORS[value]} strokeWidth={box.statusWidth} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </div>;
}

export function HeartPlaceholder({ status, preview }: { status: HeartStatus; preview: boolean }) {
  const text = status === 'error' ? '连接失败' : status === 'loading' ? '连接中' : status === 'loaded' && preview ? '网页已载入' : '--';
  return <div className="heart-placeholder"><HeartGlyph/><div><span className="heart-caption">心率</span><strong>{text}</strong></div></div>;
}
export function Strip({ state, layout = state.layout, status, preview = false, sampleLyrics = false }: { state: AppState; layout?: Layout; status: HeartStatus; preview?: boolean; sampleLyrics?: boolean }) {
  const { heart, lyrics } = layout;
  return <div className={`strip ${layout.background}`} data-testid="strip" style={{ width: layout.width, height: layout.height }}>
    {heart.visible && (preview || status !== 'loaded') && <div className="strip-widget" style={position(heart)}><HeartPlaceholder status={status} preview={preview}/></div>}
    {preview && sampleLyrics && lyrics.visible && <div className="sample-lyrics" style={position(lyrics)}>歌词由直播伴侣显示</div>}
    {ROLE_IDS.map(id => {
      const b = layout.roles[id];
      return b.visible && <div key={id} className="strip-widget" data-testid={`role-${id}`} style={position(b)}><RoleIndicator id={id} value={state.slots[id]} box={b} animations={layout.animations}/></div>;
    })}
  </div>;
}
export function position(box: { x: number; y: number; width: number; height: number }): CSSProperties {
  return { left: box.x, top: box.y, width: box.width, height: box.height };
}
