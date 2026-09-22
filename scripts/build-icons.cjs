const fs = require('node:fs');
const path = require('node:path');
const electron = require('electron');

if (typeof electron === 'string') {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electron, [__filename], { env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  const { app, BrowserWindow } = electron;
  const root = path.resolve(__dirname, '..');
  // Rasterize the same vector used by the sidebar and title bar at each Windows icon size.
  const data = path.join(root, '.test-data', 'icon-renderer');
  for (const [name, directory] of Object.entries({ userData: data, sessionData: path.join(data, 'cache'), temp: path.join(data, 'temp'), logs: path.join(data, 'logs'), crashDumps: path.join(data, 'crash-dumps') })) {
    fs.mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  process.env.TEMP = process.env.TMP = process.env.TMPDIR = path.join(data, 'temp');
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, offscreen: true } });
    try {
      await win.loadURL('data:text/html,<html><body></body></html>');
      const svg = fs.readFileSync(path.join(root, 'public/app-icon.svg'), 'utf8');
      const sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
      const images = await win.webContents.executeJavaScript(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)};
        await image.decode();
        return ${JSON.stringify(sizes)}.map(size => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(image, size / 22, 0, size * 10 / 11, size);
          return canvas.toDataURL('image/png').split(',')[1];
        });
      })()`);
      const pngs = images.map(data => Buffer.from(data, 'base64'));
      const header = Buffer.alloc(6 + sizes.length * 16);
      header.writeUInt16LE(1, 2);
      header.writeUInt16LE(sizes.length, 4);
      let offset = header.length;
      sizes.forEach((size, index) => {
        const entry = 6 + index * 16;
        header[entry] = header[entry + 1] = size === 256 ? 0 : size;
        header.writeUInt16LE(1, entry + 4);
        header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(pngs[index].length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += pngs[index].length;
      });
      fs.writeFileSync(path.join(root, 'public/app-icon.png'), pngs.at(-1));
      fs.writeFileSync(path.join(root, 'public/app-icon.ico'), Buffer.concat([header, ...pngs]));
      console.log('Generated application PNG and nine-size Windows ICO from app-icon.svg.');
    } finally { win.destroy(); }
  }).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
}
