const { _electron } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
(async () => {
  const records = [];
  for (const factor of [1, 1.25, 1.5]) {
    const data = path.join(root, '.test-data', `dpi-${factor}-${Date.now()}`);
    fs.mkdirSync(data, { recursive: true });
    const env = { ...process.env, KINGLIVE_E2E: '1', KINGLIVE_TEST_DATA: data };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await _electron.launch({ args: [`--force-device-scale-factor=${factor}`, root], env });
    try {
      let overlay;
      for (let i=0;i<100;i++) { overlay = app.windows().find(p=>p.url().endsWith('#overlay')); if (overlay) break; await new Promise(r=>setTimeout(r,100)); }
      await overlay.locator('[data-role="roam"]').waitFor();
      await overlay.screenshot();
      const native = await app.evaluate(async ({ BrowserWindow, screen }) => {
        const w = BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('直播展示'));
        const result = { content: w.getContentBounds(), zoom: w.webContents.getZoomFactor(), monitor: screen.getDisplayMatching(w.getBounds()).scaleFactor };
        try { const shot = await w.webContents.capturePage(); result.capture = shot.getSize(); result.png = shot.toPNG().toString('base64'); }
        catch (error) { result.captureError = error.message; }
        return result;
      });
      if(native.png) fs.writeFileSync(path.join(root, 'artifacts', `native-dpi-${factor}.png`), Buffer.from(native.png, 'base64'));
      delete native.png;
      const dom = await overlay.evaluate(()=>({ dpr: devicePixelRatio, width: innerWidth, height: innerHeight, root: document.querySelector('.strip').getBoundingClientRect().toJSON() }));
      records.push({ factor, native, dom });
    } finally { await app.close(); }
  }
  console.log(JSON.stringify(records, null, 2));
  fs.writeFileSync(path.join(root, 'artifacts', 'dpi-report.json'), JSON.stringify(records, null, 2));
})().catch(e=>{ console.error(e);process.exitCode=1; });
