import { z } from 'zod';

export const ROLE_IDS = ['clash', 'jungle', 'mid', 'farm', 'roam'] as const;
export type RoleId = typeof ROLE_IDS[number];
export const ROLE_NAMES: Record<RoleId, string> = { clash: '对抗路', jungle: '打野', mid: '中路', farm: '发育路', roam: '游走' };
export const SLOT_STATUSES = ['empty', 'next', 'current'] as const;
export type SlotStatus = typeof SLOT_STATUSES[number];
export const STATUS_NAMES: Record<SlotStatus, string> = { empty: '空位', next: '下局有人', current: '有人' };
export const ROLE_COLORS: Record<SlotStatus, string> = { empty: '#40d993', next: '#f5d45b', current: '#ff5c70' };
const boxSchema = z.object({
  x: z.number().int().min(0).max(8192), y: z.number().int().min(0).max(4320),
  width: z.number().int().min(8).max(8192), height: z.number().int().min(8).max(4320),
  visible: z.boolean(),
}).strict();
const roleBoxSchema = boxSchema.extend({ iconSize: z.number().min(8).max(40), statusWidth: z.number().min(1).max(4) });
export const layoutSchema = z.object({
  width: z.number().int().min(320).max(8192), height: z.number().int().min(32).max(2160),
  background: z.enum(['transparent', 'black']), animations: z.boolean(),
  roles: z.object({ clash: roleBoxSchema, jungle: roleBoxSchema, mid: roleBoxSchema, farm: roleBoxSchema, roam: roleBoxSchema }).strict(),
  heart: boxSchema, lyrics: boxSchema,
}).strict();
// Explicit interfaces keep per-widget access strongly typed independently of the schema factory.
export interface Box { x: number; y: number; width: number; height: number; visible: boolean }
export interface RoleBox extends Box { iconSize: number; statusWidth: number }
export interface Layout {
  width: number; height: number; background: 'transparent' | 'black'; animations: boolean;
  roles: Record<RoleId, RoleBox>; heart: Box; lyrics: Box;
}
export interface AppState {
  version: 2; layout: Layout; slots: Record<RoleId, SlotStatus>; heart: { url: string; zoom: number };
}
export type WidgetId = RoleId | 'heart' | 'lyrics';
export type HeartStatus = 'unconfigured' | 'loading' | 'loaded' | 'error';
export interface RuntimeState {
  heartStatus: HeartStatus; displayVisible: boolean; alwaysOnTop: boolean; storageWarning: string;
}
export interface Snapshot { state: AppState; runtime: RuntimeState }
export interface Result { ok: boolean; error?: string }
export interface PanelAPI {
  snapshot(): Promise<Snapshot>;
  subscribe(fn: (snapshot: Snapshot) => void): () => void;
  setSlot(id: RoleId, status: SlotStatus): Promise<Result>;
  applyLayout(layout: Layout): Promise<Result>;
  setHeart(settings: AppState['heart']): Promise<Result>;
  refreshHeart(): Promise<Result>;
  display(action: 'show' | 'hide' | 'reposition' | 'pin'): Promise<Result>;
  openHelp(target: 'hyperate' | 'designer' | 'guide'): Promise<Result>;
}

export function defaultLayout(): Layout {
  return {
    width: 1920, height: 62, background: 'transparent', animations: true,
    roles: Object.fromEntries(ROLE_IDS.map((id, i) => [id, {
      x: 1592 + 64 * i, y: 7, width: 48, height: 48, visible: true, iconSize: 36, statusWidth: 2.2,
    }])) as Layout['roles'],
    heart: { x: 24, y: 7, width: 160, height: 48, visible: true },
    lyrics: { x: 400, y: 0, width: 1120, height: 62, visible: true },
  };
}
export function defaultState(): AppState {
  return { version: 2, layout: defaultLayout(), slots: Object.fromEntries(ROLE_IDS.map(id => [id, 'empty'])) as AppState['slots'], heart: { url: '', zoom: 1 } };
}
export function widgets(layout: Layout): [WidgetId, Box][] {
  return [['heart', layout.heart], ['lyrics', layout.lyrics], ...ROLE_IDS.map(id => [id, layout.roles[id]] as [RoleId, RoleBox])];
}
export function widgetName(id: WidgetId): string {
  return id === 'heart' ? '心率区域' : id === 'lyrics' ? '歌词预留区' : ROLE_NAMES[id];
}
export function layoutErrors(input: unknown): string[] {
  const parsed = layoutSchema.safeParse(input);
  if (!parsed.success) return ['尺寸或样式数值无效。画布支持320–8192 × 32–2160，控件最小8，图标8–40，状态线1–4。'];
  const layout = parsed.data as Layout;
  return widgets(layout).filter(([, b]) => b.visible && (b.x + b.width > layout.width || b.y + b.height > layout.height))
    .map(([id]) => `${widgetName(id)}超出画布，请调整位置或尺寸。`);
}
export function layoutWarnings(layout: Layout): string[] {
  const all = widgets(layout).filter(([, b]) => b.visible);
  const warnings: string[] = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const [aId, a] = all[i], [bId, b] = all[j];
    if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y)
      warnings.push(`${widgetName(aId)}与${widgetName(bId)}重叠。`);
  }
  return warnings;
}
export function isAllowedHeartURL(value: string, allowLocalTest = false): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    if (allowLocalTest && url.protocol === 'http:' && url.hostname === '127.0.0.1') return true;
    return url.protocol === 'https:' && !url.port && ['app.hyperate.io', 'designer.hyperate.io'].includes(url.hostname);
  } catch { return false; }
}
const slotSchema = z.enum(SLOT_STATUSES);
const slotsSchema = z.object({ clash: slotSchema, jungle: slotSchema, mid: slotSchema, farm: slotSchema, roam: slotSchema }).strict();
const heartSchema = z.object({ url: z.string().max(32000), zoom: z.number().min(0.1).max(5) }).strict();
const stateSchema = z.object({ version: z.literal(2), layout: layoutSchema, slots: slotsSchema, heart: heartSchema }).strict();
const legacyRoleBoxSchema = boxSchema.extend({ iconSize: z.number().min(8).max(36), arcWidth: z.number().min(1).max(4) });
const legacySlotSchema = z.object({ current: z.boolean(), next: z.boolean() }).strict();
const legacyStateSchema = z.object({
  version: z.literal(1), heart: heartSchema,
  layout: layoutSchema.extend({ roles: z.object({ clash: legacyRoleBoxSchema, jungle: legacyRoleBoxSchema, mid: legacyRoleBoxSchema, farm: legacyRoleBoxSchema, roam: legacyRoleBoxSchema }).strict() }),
  slots: z.object({ clash: legacySlotSchema, jungle: legacySlotSchema, mid: legacySlotSchema, farm: legacySlotSchema, roam: legacySlotSchema }).strict(),
}).strict();
export function parseState(input: unknown): AppState {
  let state: AppState;
  if (input && typeof input === 'object' && 'version' in input && input.version === 1) {
    const old = legacyStateSchema.parse(input);
    state = stateSchema.parse({
      ...old, version: 2,
      layout: { ...old.layout, roles: Object.fromEntries(ROLE_IDS.map(id => {
        const { arcWidth, ...box } = old.layout.roles[id];
        return [id, { ...box, iconSize: box.iconSize === 28 ? 36 : box.iconSize, statusWidth: arcWidth }];
      })) },
      // A live occupant takes priority when both legacy switches were enabled.
      slots: Object.fromEntries(ROLE_IDS.map(id => [id, old.slots[id].current ? 'current' : old.slots[id].next ? 'next' : 'empty'])),
    });
  } else state = stateSchema.parse(input);
  if (layoutErrors(state.layout).length) throw new Error('布局越界');
  return state;
}
