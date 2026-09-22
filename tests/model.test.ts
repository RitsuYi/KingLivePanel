import { describe, expect, it } from 'vitest';
import { defaultLayout, defaultState, isAllowedHeartURL, layoutErrors, layoutWarnings, parseState, ROLE_IDS } from '../shared/model';

describe('layout and saved configuration boundaries', () => {
  it('keeps centered lyrics separate from the left heart and five right lane widgets', () => {
    const l = defaultLayout();
    expect(layoutErrors(l)).toEqual([]);
    expect(layoutWarnings(l)).toEqual([]);
    expect(l.lyrics.x + l.lyrics.width / 2).toBe(l.width / 2);
    expect(l.heart.x + l.heart.width).toBeLessThan(l.lyrics.x);
    expect(l.lyrics.x + l.lyrics.width).toBeLessThan(l.roles.clash.x);
    for (const id of ROLE_IDS) expect(l.roles[id].y + l.roles[id].height).toBeLessThanOrEqual(l.height);
  });
  it('rejects out-of-bounds drafts but permits intentionally hidden widgets beyond a resized canvas', () => {
    const l = defaultLayout(); l.width = 500;
    expect(layoutErrors(l)).not.toHaveLength(0);
    l.lyrics.visible = false;
    ROLE_IDS.forEach(id => { l.roles[id].visible = false; });
    expect(layoutErrors(l)).toEqual([]);
  });
  it('warns on overlap without preventing intentional compositing', () => {
    const l = defaultLayout(); l.heart.x = l.lyrics.x;
    expect(layoutWarnings(l)).toContain('心率区域与歌词预留区重叠。');
    expect(layoutErrors(l)).toEqual([]);
  });
  it('rejects partial, non-finite, incorrectly typed and unsupported version configurations', () => {
    const base = defaultState();
    expect(() => parseState({ ...base, version: 3 })).toThrow();
    expect(() => parseState({ ...base, slots: { clash: { current: true, next: true } } })).toThrow();
    expect(() => parseState({ ...base, heart: { url: '', zoom: Infinity } })).toThrow();
    expect(layoutErrors({ ...base.layout, height: 0 })).not.toHaveLength(0);
    expect(layoutErrors({ ...base.layout, width: 1920.5 })).not.toHaveLength(0);
    expect(() => parseState({ ...base, slots: { ...base.slots, mid: { current: 'true', next: false } } })).toThrow();
  });
  it('roundtrips the three exclusive statuses independently across roles', () => {
    const s = defaultState();
    s.slots.clash = 'empty';
    s.slots.jungle = 'current';
    s.slots.mid = 'next';
    s.slots.farm = 'current';
    const restored = parseState(JSON.parse(JSON.stringify(s)));
    expect(restored).toEqual(s);
    s.slots.clash = 'current';
    expect(s.slots.roam).toBe('empty');
    expect(() => parseState({ ...s, slots: { ...s.slots, mid: 'reserved' } })).toThrow();
  });
  it('migrates legacy switches and styles while retaining custom positions and heart settings', () => {
    const base = defaultState();
    const legacy = {
      ...base, version: 1,
      heart: { url: 'https://app.hyperate.io/saved-id', zoom: 1.5 },
      layout: { ...base.layout, roles: Object.fromEntries(ROLE_IDS.map(id => {
        const { statusWidth, ...box } = base.layout.roles[id];
        return [id, { ...box, iconSize: id === 'jungle' ? 22 : 28, x: box.x + 1, arcWidth: statusWidth }];
      })) },
      slots: {
        clash: { current: false, next: false }, jungle: { current: true, next: false },
        mid: { current: false, next: true }, farm: { current: true, next: true }, roam: { current: false, next: false },
      },
    };
    const result = parseState(legacy);
    expect(result.version).toBe(2);
    expect(result.slots).toEqual({ clash: 'empty', jungle: 'current', mid: 'next', farm: 'current', roam: 'empty' });
    expect(result.heart).toEqual(legacy.heart);
    expect(result.layout.heart).toEqual(base.layout.heart);
    expect(result.layout.roles.jungle).toEqual({ ...base.layout.roles.jungle, x: base.layout.roles.jungle.x + 1, iconSize: 22 });
    expect(result.layout.roles.clash.iconSize).toBe(36);
    expect(parseState(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(() => parseState({ ...legacy, slots: { ...legacy.slots, clash: { current: 'true', next: false } } })).toThrow();
  });
});
describe('remote heart page boundary', () => {
  it.each(['https://app.hyperate.io/my-id', 'https://designer.hyperate.io/?id=123&settings=abc%2B123', ''])('accepts a configured official URL: %s', url => expect(isAllowedHeartURL(url)).toBe(true));
  it.each(['javascript:alert(1)', 'file:///C:/Windows/win.ini', 'http://app.hyperate.io/id', 'https://app.hyperate.io.evil.test/id', 'https://other.hyperate.io/id', 'https://example.com/', 'https://x:y@app.hyperate.io/id', 'https://app.hyperate.io:8443/id', 'http://127.0.0.1:4567'])('rejects a non-widget or unsafe URL: %s', url => expect(isAllowedHeartURL(url)).toBe(false));
  it('keeps the local fixture opt-in separate from production', () => expect(isAllowedHeartURL('http://127.0.0.1:4567', true)).toBe(true));
});
