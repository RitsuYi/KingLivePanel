import path from 'node:path';
import fs from 'node:fs';
import electronPath from 'electron';

// Vite and esbuild bundle all application dependencies. Only ship the current
// manifest's assets, never stale bundles or a second copy of node_modules.
const manifest = JSON.parse(fs.readFileSync('dist/.vite/manifest.json', 'utf8'));
const files = [...new Set([
  'dist/index.html', 'dist/app-icon.svg', 'dist/app-icon.png',
  'dist-electron/main.cjs', 'dist-electron/preload.cjs', 'package.json',
  ...Object.values(manifest).flatMap(entry => [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]
    .map(file => `dist/${file}`)),
])];
for (const file of files) {
  if (!fs.statSync(file).isFile()) throw new Error(`Missing release file: ${file}`);
}

// Reuse the verified runtime instead of downloading a second Electron archive.
// A fresh output folder preserves previous releases and avoids clearing an existing directory.
const output = path.join('release', `build-${new Date().toISOString().replace(/[:.]/g, '-')}`);
if (fs.existsSync(output)) throw new Error(`Release directory already exists: ${output}`);
const buildTemp = path.resolve('.builder-cache', `temp-${Date.now()}`);
fs.mkdirSync(buildTemp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = buildTemp;
process.env.ELECTRON_BUILDER_CACHE = path.resolve('.builder-cache');
process.env.ELECTRON_CACHE = path.resolve('.electron-cache');
const { default: builder } = await import('electron-builder');
await builder.build({
  // ZIP contains a directly runnable folder; no self-extractor writes to %TEMP%.
  targets: builder.Platform.WINDOWS.createTarget('zip', builder.Arch.x64),
  config: {
    electronDist: path.dirname(electronPath), directories: { output },
    files: [...files, '!node_modules{,/**/*}'],
  },
});
console.log(`Portable executable: ${path.resolve(output, 'win-unpacked', 'King Live Panel.exe')}`);
