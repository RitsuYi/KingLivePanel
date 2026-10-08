const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.resolve(__dirname, '..');
const runId = Date.now().toString();
const dataDir = path.join(root, '.test-data', runId);
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(artifacts, { recursive: true });
const roles = ['clash', 'jungle', 'mid', 'farm', 'roam'];
let app, control, overlay;
let offline = false;
const fixture = http.createServer((req, res) => {
  if (offline) { req.socket.destroy(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
  res.end('<!doctype html><html><body style="color:white;background:transparent;font:24px sans-serif;margin:0"><span style="color:#ed174d">♥</span> <span class="tabular-nums">77</span><script>window.setInterval(()=>{},1000)</script></body></html>');
});
async function waitFor(fn, label) {
  const until = Date.now() + 12000;
  while (Date.now() < until) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw Error('Timed out: ' + label);
}
const snap = () => control.evaluate(() => window.panel.snapshot());
const heartViewVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#overlay')).contentView.children[0].getVisible());
const replaceHeartMarkup = markup => app.evaluate(async ({ BrowserWindow }, html) => {
  const view = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#overlay')).contentView.children[0];
  await view.webContents.executeJavaScript(`document.body.innerHTML = ${JSON.stringify(html)}`);
}, markup);
const expectHeartRate = async value => {
  await waitFor(async () => (await snap()).runtime.heartRate === value, `current heart rate ${value}`);
  await waitFor(async () => (await overlay.locator('.heart-placeholder strong').textContent()) === String(value ?? '--'), 'native number rendered');
  await waitFor(async () => (await control.locator('.heart-placeholder strong').textContent()) === String(value ?? '--'), 'preview number rendered');
};
async function launch(extra = []) {
  const env = { ...process.env, KINGLIVE_E2E: '1', KINGLIVE_TEST_DATA: dataDir };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ args: [root, ...extra], env, timeout: 30000 });
  await waitFor(async () => { const pages = app.windows(); control = pages.find(p => p.url().endsWith('#control')); overlay = pages.find(p => p.url().endsWith('#overlay')); return control && overlay; }, 'both windows');
  await control.getByRole('heading', { name: '车队状态', exact: true }).waitFor();
  await overlay.locator('[data-testid="role-roam"]').waitFor();
}
async function closeApp() { if (app) { await app.close(); app = null; } }
async function assertOutputBackground(background) {
  await overlay.locator(`.strip.${background}`).waitFor();
  const expected = background === 'transparent' ? [0, 0, 0, 0] : [0, 0, 0, 255];
  await waitFor(async () => {
    // Read the native rendered pixels without Playwright's background override.
    const samples = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('#overlay'));
      const image = await win.webContents.capturePage();
      const { width, height } = image.getSize();
      const pixels = image.toBitmap();
      return [[0, 0], [Math.floor(width / 2), Math.floor(height / 2)], [width - 1, height - 1]].map(([x, y]) => {
        const offset = (y * width + x) * 4;
        return Array.from(pixels.subarray(offset, offset + 4));
      });
    });
    return samples.every(pixel => pixel.length === 4 && pixel.every((channel, i) => channel === expected[i]));
  }, `${background} native background pixels must be ${expected}`);
}

(async () => {
  await new Promise(r => fixture.listen(0, '127.0.0.1', r));
  const testURL = `http://127.0.0.1:${fixture.address().port}/fixture`;
  try {
    await launch();
    assert.equal((await snap()).state.layout.width, 1920);
    await assertOutputBackground('transparent');
    const scriptErrors = [];
    control.on('pageerror', e => scriptErrors.push(e.message));
    overlay.on('pageerror', e => scriptErrors.push(e.message));
    await control.screenshot({ path: path.join(artifacts, 'control-default.png'), fullPage: true });
    await overlay.screenshot({ path: path.join(artifacts, 'overlay-default.png'), omitBackground: true });
    assert.equal(await overlay.locator('[data-role]').count(), 5);
    assert.deepEqual(await overlay.locator('[data-role]').allTextContents(), ['', '', '', '', '']);
    assert.equal(await overlay.locator('button,input,select,textarea').count(), 0);
    assert.equal(await overlay.locator('.sample-lyrics,.edit-box').count(), 0);
    console.log('PASS: left heart, centered reserved lyrics, five textless lane icons, isolated output.');

    assert.equal(await overlay.locator('.status-line').count(), 5);
    assert.equal(await overlay.locator('.role-arcs,.lane-frame,.status-lamp').count(), 0);
    assert.equal(await control.getByRole('switch').count(), 0);
    const statusColors = { empty: '#40d993', next: '#f5d45b', current: '#ff5c70' };
    for (const id of roles) for (const status of ['next', 'current', 'empty']) {
      const before = (await snap()).state.slots;
      await control.getByTestId(`${id}-${status}`).click();
      await waitFor(async () => (await snap()).state.slots[id] === status, `${id}/${status}`);
      const after = (await snap()).state.slots;
      for (const other of roles) if (other !== id) assert.equal(after[other], before[other]);
      await waitFor(async () => (await overlay.locator(`[data-role="${id}"] .status-line`).getAttribute('stroke')) === statusColors[status], 'single status line');
      await waitFor(async () => (await control.getByTestId(`${id}-${status}`).getAttribute('aria-pressed')) === 'true', 'control state rendered');
      assert.equal(await control.locator(`.role-card:has([data-role="${id}"]) [aria-pressed="true"]`).count(), 1);
    }
    const beforeInvalid = (await snap()).state.slots;
    assert.equal((await control.evaluate(() => window.panel.setSlot('clash', 'bad-status'))).ok, false);
    assert.equal((await control.evaluate(() => window.panel.setSlot('bad-role', 'current'))).ok, false);
    assert.deepEqual((await snap()).state.slots, beforeInvalid);
    const denied = await overlay.evaluate(() => window.panel.setSlot('clash', 'current'));
    assert.equal(denied.ok, false);
    console.log('PASS: five exclusive three-state selectors, one status line per icon, no frames or dot lamps, validated IPC.');

    await control.getByRole('button', { name: '布局编辑', exact: true }).click();
    await control.getByLabel('画布宽度', { exact: true }).fill('1000');
    await control.getByLabel('画布宽度', { exact: true }).blur();
    assert.equal((await snap()).state.layout.width, 1920);
    assert.equal(await control.getByRole('button', { name: '应用到直播', exact: true }).isDisabled(), true);
    await control.getByRole('button', { name: '取消修改', exact: true }).click();
    assert.equal(await control.getByLabel('画布宽度', { exact: true }).inputValue(), '1920');
    await control.getByLabel('选择控件', { exact: true }).selectOption('heart');
    await control.getByLabel('X 位置', { exact: true }).fill('40');
    await control.getByLabel('展示背景', { exact: true }).selectOption('black');
    await control.getByText('启用状态切换渐变', { exact: true }).click();
    assert.equal((await snap()).state.layout.heart.x, 24);
    await control.getByRole('button', { name: '应用到直播', exact: true }).click();
    await waitFor(async () => (await snap()).state.layout.heart.x === 40, 'applied heart position');
    await assertOutputBackground('black');
    assert.equal(await overlay.locator('.animated').count(), 0);
    await control.getByRole('button', { name: '恢复默认布局', exact: true }).click();
    assert.equal((await snap()).state.layout.heart.x, 40);
    await control.getByRole('button', { name: '应用到直播', exact: true }).click();
    await waitFor(async () => (await snap()).state.layout.heart.x === 24, 'restore layout');
    await assertOutputBackground('transparent');
    console.log('PASS: native output background is transparent on launch and after switching back from opaque black.');
    await control.getByLabel('预览缩放', { exact: true }).selectOption('1');
    const handle = control.getByTestId('editor-heart');
    await handle.scrollIntoViewIfNeeded();
    const bb = await handle.boundingBox();
    await control.mouse.move(bb.x + 25, bb.y + 20);
    await control.mouse.down(); await control.mouse.move(bb.x + 37, bb.y + 23, { steps: 4 }); await control.mouse.up();
    assert.equal(await control.getByLabel('X 位置', { exact: true }).inputValue(), '36');
    assert.equal(await control.getByLabel('Y 位置', { exact: true }).inputValue(), '10');
    assert.equal((await snap()).state.layout.heart.x, 24);
    await control.getByRole('button', { name: '取消修改', exact: true }).click();
    await control.getByLabel('预览缩放', { exact: true }).selectOption('fit');
    await control.screenshot({ path: path.join(artifacts, 'layout-editor.png'), fullPage: true });
    console.log('PASS: draft isolation, out-of-bounds validation, apply/cancel/reset, drag coordinates and animation disable.');

    await control.getByRole('button', { name: '心率连接', exact: true }).click();
    await control.getByLabel('心率展示网址', { exact: true }).fill('https://example.com/');
    await control.getByRole('button', { name: '保存并加载', exact: true }).click();
    assert.equal((await snap()).state.heart.url, '');
    await control.getByLabel('心率展示网址', { exact: true }).fill(testURL);
    await control.getByRole('button', { name: '保存并加载', exact: true }).click();
    await waitFor(async () => (await snap()).runtime.heartStatus === 'loaded', 'fixture loaded');
    const child = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find(w => w.getTitle().includes('直播展示'));
      const view = w.contentView.children[0];
      return { bounds: view.getBounds(), prefs: view.webContents.getLastWebPreferences() };
    });
    assert.equal(child.bounds.x, 24);
    assert.equal(child.bounds.y, 7);
    assert.equal(child.prefs.nodeIntegration, false);
    assert.equal(child.prefs.contextIsolation, true);
    assert.equal(child.prefs.sandbox, true);
    assert.equal(await heartViewVisible(), true);
    assert.equal((await snap()).runtime.heartRate, null);
    const mode = control.getByRole('switch', { name: '仅读取网页数字', exact: true });
    await mode.check();
    assert.equal(await control.getByLabel('网页缩放倍数', { exact: true }).isDisabled(), true);
    assert.equal((await snap()).state.heart.numbersOnly, false, 'mode is a draft until saved');
    await control.getByRole('button', { name: '保存并加载', exact: true }).click();
    await expectHeartRate(77);
    assert.equal(await heartViewVisible(), false, 'remote icon is hidden');
    assert.equal(await overlay.locator('.heart-placeholder > svg').count(), 1);
    await overlay.screenshot({ path: path.join(artifacts, 'heart-numbers-only.png'), omitBackground: true, clip: { x: 0, y: 0, width: 210, height: 62 } });
    await replaceHeartMarkup('<span class="tabular-nums">96</span>');
    await expectHeartRate(96);
    await control.getByRole('button', { name: '布局编辑', exact: true }).click();
    await expectHeartRate(96);
    await control.getByRole('button', { name: '心率连接', exact: true }).click();
    // Known outputs take priority over IDs, graph labels and hidden elements.
    for (const [markup, expectedRate] of [
      ['<span>123</span><strong id="heartrate">81 BPM</strong>', 81],
      ['<span>123</span><strong id="heartrate">--</strong>', null],
      ['<span style="display:none">99</span><div><span>85</span></div><canvas></canvas><svg><text>120</text></svg>', 85],
      ['<div><span style="display:none">99</span></div><div style="opacity:0"><span>95</span></div>', null],
      ['<div>84 <span>BPM</span><span hidden>125</span></div>', 84],
      ['<span>70</span><span>90</span>', null],
      ['<span class="tabular-nums">88</span><span style="display:none" class="tabular-nums">125</span>', 88],
      ['<strong id="heartrate">0</strong>', null],
      ['<strong id="heartrate">300</strong>', 300],
      ['<strong id="heartrate">301</strong>', null],
      ['<strong id="heartrate">79</strong>', 79],
      ['<strong id="heartrate">72.5</strong>', null],
      ['<strong id="heartrate">77</strong>', 77],
      ['<p>Device ID: 123</p><p>Connection error 72</p>', null],
    ]) { await replaceHeartMarkup(markup); await expectHeartRate(expectedRate); }
    await replaceHeartMarkup('<span class="tabular-nums">77</span>');
    await expectHeartRate(77);
    const beforeInvalidHeart = (await snap()).state.heart;
    assert.equal((await control.evaluate(() => window.panel.setHeart({ url: '', zoom: 1, numbersOnly: 'true' }))).ok, false);
    assert.deepEqual((await snap()).state.heart, beforeInvalidHeart);
    await mode.uncheck();
    await control.getByRole('button', { name: '保存并加载', exact: true }).click();
    await waitFor(async () => (await snap()).state.heart.numbersOnly === false, 'restore webpage mode');
    assert.equal(await heartViewVisible(), true);
    assert.equal((await snap()).runtime.heartRate, null);
    await waitFor(async () => await overlay.locator('.heart-placeholder').count() === 0, 'webpage replaces native heart');
    await mode.check();
    await control.getByRole('button', { name: '保存并加载', exact: true }).click();
    await expectHeartRate(77);
    console.log('PASS: numbers-only switch, original white heart, live preview/output updates, extraction boundaries and original webpage mode.');
    offline = true;
    await control.getByRole('button', { name: '刷新网页', exact: true }).click();
    await waitFor(async () => (await snap()).runtime.heartStatus === 'error', 'failed load');
    await expectHeartRate(null);
    offline = false;
    await control.getByRole('button', { name: '刷新网页', exact: true }).click();
    await waitFor(async () => (await snap()).runtime.heartStatus === 'loaded', 'network recovery');
    await expectHeartRate(77);
    // Hiding/removing/changing the source must not retain the old reading.
    await control.evaluate(async () => {
      const { state } = await window.panel.snapshot();
      await window.panel.applyLayout({ ...state.layout, heart: { ...state.layout.heart, visible: false } });
    });
    assert.equal((await snap()).runtime.heartRate, null);
    await control.evaluate(async () => {
      const { state } = await window.panel.snapshot();
      await window.panel.applyLayout({ ...state.layout, heart: { ...state.layout.heart, visible: true } });
    });
    await expectHeartRate(77);
    await control.evaluate(() => window.panel.setHeart({ url: '', zoom: 1, numbersOnly: true }));
    await expectHeartRate(null);
    await control.evaluate(url => window.panel.setHeart({ url, zoom: 1, numbersOnly: true }), testURL + '?changed');
    await expectHeartRate(77);
    await control.screenshot({ path: path.join(artifacts, 'heart-settings.png'), fullPage: true });
    console.log('PASS: restricted URL, isolated native heart view, failed load and recovery.');

    // Leave an illustrative status combination only in the isolated test profile.
    await control.evaluate(async () => {
      const ids = ['clash','jungle','mid','farm','roam'];
      for (let i=0;i<ids.length;i++) await window.panel.setSlot(ids[i], ['current','empty','next','current','empty'][i]);
    });
    await control.getByRole('button', { name: '车队状态', exact: true }).click();
    await control.screenshot({ path: path.join(artifacts, 'control-states.png'), fullPage: true });
    await control.locator('.role-cards').screenshot({ path: path.join(artifacts, 'lane-redesign.png') });
    await overlay.screenshot({ path: path.join(artifacts, 'overlay-states.png'), omitBackground: true });
    await overlay.screenshot({ path: path.join(artifacts, 'lane-overlay.png'), omitBackground: true, clip: { x: 1584, y: 0, width: 328, height: 62 } });
    const expected = (await snap()).state;
    await closeApp();
    await launch();
    assert.deepEqual((await snap()).state, expected);
    await expectHeartRate(77);
    assert.equal(await heartViewVisible(), false, 'saved numbers-only mode restored');
    await assertOutputBackground('transparent');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, 'panel-config.json'), 'utf8')), expected);
    await closeApp();
    console.log('PASS: settings and occupancy persist through complete application restart.');
    for (const factor of [1.25, 1.5]) {
      await launch([`--force-device-scale-factor=${factor}`]);
      const dimensions = await overlay.locator('.strip').evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight, scroll: document.documentElement.scrollWidth, textless: [...document.querySelectorAll('[data-role]')].every(el => !el.textContent) }));
      assert.equal(dimensions.width, 1920); assert.equal(dimensions.height, 62); assert.equal(dimensions.textless, true);
      await assertOutputBackground('transparent');
      await overlay.screenshot({ path: path.join(artifacts, `overlay-scale-${factor}.png`), omitBackground: true });
      await closeApp();
    }
    assert.deepEqual(scriptErrors, []);
    console.log('PASS: 125% and 150% scaling preserve layout; no renderer exceptions.');
    fs.writeFileSync(path.join(artifacts, 'e2e-result.json'), JSON.stringify({ passed: true, timestamp: new Date().toISOString(), profile: dataDir, realWatchTested: false }, null, 2));
  } finally { await closeApp(); fixture.closeAllConnections(); await new Promise(r => fixture.close(r)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
