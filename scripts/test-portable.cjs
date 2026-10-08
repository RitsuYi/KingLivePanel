const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
if (!process.argv[2]) throw new Error('Pass the packaged King Live Panel.exe path.');
const sourceExe = path.resolve(process.argv[2]);
assert.equal(path.basename(sourceExe), 'King Live Panel.exe');
const runDir = path.join(root, '.test-data', `portable-${Date.now()}`);
const originalTemp = process.env.TEMP;
const originalAppData = process.env.APPDATA;
const originalLocalAppData = process.env.LOCALAPPDATA;
const harnessTemp = path.join(runDir, 'test-runner-temp');
fs.mkdirSync(harnessTemp, { recursive: true });
process.env.TEMP = process.env.TMP = process.env.TMPDIR = harnessTemp;

// Watch existing application-specific system profiles without touching them.
const systemProfiles = [...new Set([originalAppData, originalLocalAppData].filter(Boolean))]
  .flatMap(parent => ['king-live-panel', 'King Live Panel', 'Electron'].map(name => path.join(parent, name)));
function fingerprint(directory) {
  if (!fs.existsSync(directory)) return null;
  const entries = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else {
        const info = fs.statSync(file);
        entries.push([path.relative(directory, file), info.size, info.mtimeMs]);
      }
    }
  }
  visit(directory);
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}
const before = systemProfiles.map(directory => [directory, fingerprint(directory)]);
const untouchedProfiles = () => {
  for (const [directory, state] of before) assert.deepEqual(fingerprint(directory), state, `System profile changed: ${directory}`);
};
let folder = path.join(runDir, '首次解压 portable');
fs.cpSync(path.dirname(sourceExe), folder, { recursive: true, errorOnExist: true, force: false });
assert.equal(fs.existsSync(path.join(folder, 'data')), false, 'Release must not include user/test data.');
const results = [];
let app;
async function launch() {
  const env = { ...process.env, TEMP: originalTemp, TMP: originalTemp,
    APPDATA: originalAppData, LOCALAPPDATA: originalLocalAppData,
    KINGLIVE_E2E: '1', KINGLIVE_TEST_DATA: path.join(runDir, 'must-not-be-used'),
    PORTABLE_EXECUTABLE_DIR: path.join(runDir, 'must-not-be-used') };
  delete env.ELECTRON_RUN_AS_NODE;
  app = await electron.launch({ executablePath: path.join(folder, 'King Live Panel.exe'), cwd: root, env, timeout: 30000 });
  let control;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    control = app.windows().find(page => page.url().endsWith('#control'));
    if (control) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(control, 'Packaged control window opened.');
  await control.getByRole('heading', { name: '车队状态', exact: true }).waitFor();
  const actual = await app.evaluate(({ app, session }) => ({
    packaged: app.isPackaged,
    version: app.getVersion(),
    paths: Object.fromEntries(['appData', 'userData', 'sessionData', 'temp', 'logs', 'crashDumps'].map(name => [name, app.getPath(name)])),
    environment: Object.fromEntries(['TEMP', 'TMP', 'TMPDIR', 'APPDATA', 'LOCALAPPDATA', 'ELECTRON_LOG_FILE'].map(name => [name, process.env[name]])),
    nodeTemp: process.getBuiltinModule('node:os').tmpdir(),
    defaultStorage: session.defaultSession.storagePath,
    heartStorage: session.fromPartition('persist:hyperate-widget').storagePath,
  }));
  assert.equal(actual.packaged, true);
  assert.equal(actual.version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
  const data = path.join(folder, 'data');
  const insideData = value => {
    assert.equal(typeof value, 'string');
    const relative = path.relative(data, value);
    assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Path escaped portable data: ${value}`);
    assert.notEqual(path.parse(value).root.toLowerCase(), 'c:\\');
  };
  Object.values(actual.paths).forEach(insideData);
  Object.values(actual.environment).forEach(insideData);
  [actual.nodeTemp, actual.defaultStorage, actual.heartStorage].forEach(insideData);
  assert.equal(actual.paths.userData, data);
  assert.equal(fs.existsSync(path.join(runDir, 'must-not-be-used')), false);
  results.push(actual);
  return control;
}
async function close() {
  if (!app) return;
  await app.evaluate(async ({ session }) => {
    for (const current of [session.defaultSession, session.fromPartition('persist:hyperate-widget')]) {
      current.flushStorageData();
      await current.cookies.flushStore();
    }
  });
  await app.close();
  app = null;
}

(async () => {
  try {
    let control = await launch();
    const result = await control.evaluate(async () => {
      localStorage.setItem('portable-storage-check', 'retained');
      const heart = await window.panel.setHeart({ url: '', zoom: 1, numbersOnly: true });
      if (!heart.ok) return heart;
      return window.panel.setSlot('clash', 'current');
    });
    assert.equal(result.ok, true);
    // Real persistent partition cookies exercise the heart widget's disk storage.
    await app.evaluate(async ({ session }) => {
      await session.fromPartition('persist:hyperate-widget').cookies.set({
        url: 'https://app.hyperate.io', name: 'portable-storage-check', value: 'retained', expirationDate: Date.now() / 1000 + 3600,
      });
    });
    await close();
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, 'data', 'panel-config.json'), 'utf8')).slots.clash, 'current');
    console.log('PASS: packaged EXE paths, Node temp, both browser sessions and configuration stay beside the EXE.');
    control = await launch();
    assert.equal((await control.evaluate(() => window.panel.snapshot())).state.slots.clash, 'current');
    assert.equal((await control.evaluate(() => window.panel.snapshot())).state.heart.numbersOnly, true);
    await close();

    const relocated = path.join(runDir, '搬迁后的便携版 portable');
    for (const candidate of [folder, relocated]) {
      const relative = path.relative(runDir, path.resolve(candidate));
      assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    }
    assert.equal(fs.existsSync(relocated), false);
    fs.renameSync(folder, relocated);
    folder = relocated;
    control = await launch();
    assert.equal((await control.evaluate(() => window.panel.snapshot())).state.slots.clash, 'current');
    assert.equal((await control.evaluate(() => window.panel.snapshot())).state.heart.numbersOnly, true);
    assert.equal(await control.evaluate(() => localStorage.getItem('portable-storage-check')), 'retained');
    const cookies = await app.evaluate(async ({ session }) => session.fromPartition('persist:hyperate-widget').cookies.get({ name: 'portable-storage-check' }));
    assert.equal(cookies[0]?.value, 'retained');
    await close();
    untouchedProfiles();
    console.log('PASS: settings, local storage and heart cookies survive restart and folder relocation; existing system AppData profiles unchanged.');
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts', 'portable-result.json'), JSON.stringify({
      passed: true, timestamp: new Date().toISOString(), sourceExe, runs: results,
      systemProfilesUnchanged: systemProfiles,
    }, null, 2));
  } finally { await close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
