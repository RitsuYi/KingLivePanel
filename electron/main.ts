import { app, BrowserWindow, WebContentsView, ipcMain, screen, shell, session, Menu } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { configurePortableStorage } from './portable-storage';
import { defaultState, isAllowedHeartURL, layoutErrors, parseState, ROLE_IDS, SLOT_STATUSES, type AppState, type HeartStatus, type Layout, type Result, type RuntimeState } from '../shared/model';

const testing = !app.isPackaged && process.env.KINGLIVE_E2E === '1';
configurePortableStorage(testing);
const devURL = !app.isPackaged ? process.env.KINGLIVE_DEV_URL : undefined;
const appIcon = path.join(app.getAppPath(), app.isPackaged ? 'dist' : 'public', 'app-icon.png');
let control: BrowserWindow | null = null;
let display: BrowserWindow | null = null;
let heartView: WebContentsView | null = null;
let guide: BrowserWindow | null = null;
let state = defaultState();
let quitting = false;
let outputScale = 1;
let loadedURL = '';
let retry: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
const runtime: RuntimeState = { heartStatus: 'unconfigured', displayVisible: false, alwaysOnTop: false, storageWarning: '' };

function configPath() { return path.join(app.getPath('userData'), 'panel-config.json'); }
function loadState() {
  try {
    const p = configPath();
    if (fs.existsSync(p)) {
      state = parseState(JSON.parse(fs.readFileSync(p, 'utf8')));
      if (!isAllowedHeartURL(state.heart.url, testing)) state.heart.url = '';
    }
  } catch {
    runtime.storageWarning = '上次配置无法读取，已使用默认设置；原配置保存在程序旁的 data 文件夹。';
    const p = configPath();
    if (fs.existsSync(p)) fs.copyFileSync(p, `${p}.invalid-${Date.now()}`);
  }
}
function persist(next: AppState) {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  const p = configPath();
  fs.writeFileSync(`${p}.tmp`, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(`${p}.tmp`, p);
  state = next;
  runtime.storageWarning = '';
}
function snapshot() { return { state, runtime }; }
function broadcast() {
  for (const win of [control, display]) if (win && !win.isDestroyed()) win.webContents.send('panel:changed', snapshot());
}
function status(value: HeartStatus) { runtime.heartStatus = value; broadcast(); }
function loadPage(win: BrowserWindow, page: string) {
  if (devURL) return win.loadURL(`${devURL}/#${page}`);
  return win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: page });
}
function protectedWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}
function destroyHeart() {
  if (retry) { clearTimeout(retry); retry = null; }
  if (heartView) {
    if (display && !display.isDestroyed()) display.contentView.removeChildView(heartView);
    heartView.webContents.close();
    heartView = null;
  }
  loadedURL = '';
}
function placeHeart() {
  if (!heartView || !display) return;
  const b = state.layout.heart;
  heartView.setBounds({ x: Math.round(b.x * outputScale), y: Math.round(b.y * outputScale), width: Math.max(1, Math.round(b.width * outputScale)), height: Math.max(1, Math.round(b.height * outputScale)) });
  heartView.webContents.setZoomFactor(state.heart.zoom * outputScale);
  heartView.setVisible(b.visible && runtime.heartStatus !== 'error');
}
function syncHeart(force = false) {
  if (!display || display.isDestroyed()) return;
  if (!state.heart.url || !state.layout.heart.visible) {
    destroyHeart(); status('unconfigured'); return;
  }
  if (heartView && loadedURL === state.heart.url && !force) { placeHeart(); return; }
  destroyHeart();
  status('loading');
  const view = new WebContentsView({ webPreferences: {
    partition: 'persist:hyperate-widget', sandbox: true, contextIsolation: true,
    nodeIntegration: false, backgroundThrottling: false,
  } });
  heartView = view;
  loadedURL = state.heart.url;
  view.setBackgroundColor('#00000000');
  display.contentView.addChildView(view);
  placeHeart();
  const isCurrent = () => heartView === view && !view.webContents.isDestroyed();
  let navigationFailed = false;
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const preventUntrustedNavigation = (event: Electron.Event, url: string) => {
    if (!isAllowedHeartURL(url, testing)) event.preventDefault();
  };
  view.webContents.on('will-navigate', preventUntrustedNavigation);
  view.webContents.on('will-redirect', preventUntrustedNavigation);
  const fail = () => {
    if (!isCurrent()) return;
    navigationFailed = true;
    view.setVisible(false); status('error');
    if (retry) clearTimeout(retry);
    retry = setTimeout(() => { retry = null; syncHeart(true); }, Math.min(30000, 5000 * 2 ** Math.min(retryCount++, 3)));
  };
  view.webContents.on('did-fail-load', (_event, code, _description, _url, mainFrame) => { if (mainFrame && code !== -3) fail(); });
  view.webContents.on('did-navigate', (_event, _url, responseCode) => { if (responseCode >= 400) fail(); });
  view.webContents.on('render-process-gone', fail);
  view.webContents.on('did-finish-load', async () => {
    if (!isCurrent() || navigationFailed) return;
    await view.webContents.insertCSS('html, body { background: transparent !important; margin: 0 !important; overflow: hidden !important; }').catch(() => {});
    if (!isCurrent() || navigationFailed) return;
    if (retry) { clearTimeout(retry); retry = null; }
    retryCount = 0; status('loaded'); placeHeart();
  });
  void view.webContents.loadURL(state.heart.url).catch(fail);
}
function sizeDisplay(reposition = false) {
  if (!display) return;
  const monitor = screen.getDisplayMatching(display.getBounds());
  // The design uses output pixels. Convert to DIP so OS scaling does not enlarge the strip.
  outputScale = 1 / monitor.scaleFactor;
  display.webContents.setZoomFactor(outputScale);
  const width = Math.round(state.layout.width * outputScale);
  const height = Math.round(state.layout.height * outputScale);
  display.setContentSize(width, height);
  if (reposition) display.setPosition(monitor.workArea.x, Math.max(monitor.workArea.y, monitor.workArea.y + monitor.workArea.height - height));
  display.setBackgroundColor(state.layout.background === 'black' ? '#000000' : '#00000000');
  placeHeart();
}
function createWindows() {
  control = new BrowserWindow({ width: 1240, height: 850, minWidth: 980, minHeight: 700, show: false,
    title: '王者直播信息屏 · 控制台', backgroundColor: '#f6f7f9', autoHideMenuBar: true,
    icon: appIcon, titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f6f7f9', symbolColor: '#737d8b', height: 36 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  display = new BrowserWindow({ width: 1920, height: 62, minHeight: 1, minWidth: 1, frame: false,
    transparent: true, resizable: false, hasShadow: false, show: false, skipTaskbar: true,
    title: '王者直播信息屏 · 直播展示', backgroundColor: '#00000000', icon: appIcon,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  protectedWindow(control); protectedWindow(display);
  display.setIgnoreMouseEvents(true, { forward: true });
  display.on('close', event => { if (!quitting) { event.preventDefault(); display?.hide(); runtime.displayVisible = false; broadcast(); } });
  display.on('move', () => { if (display && !display.isDestroyed()) sizeDisplay(); });
  display.once('ready-to-show', () => {
    sizeDisplay(true); display?.showInactive(); runtime.displayVisible = true;
    syncHeart(); broadcast();
  });
  control.once('ready-to-show', () => control?.show());
  control.on('closed', () => { control = null; app.quit(); });
  void loadPage(display, 'overlay'); void loadPage(control, 'control');
}
function handlers() {
  ipcMain.handle('panel:snapshot', event => {
    if (![control?.webContents.id, display?.webContents.id].includes(event.sender.id)) throw new Error('Unknown window');
    return snapshot();
  });
  const action = (name: string, fn: (...args: any[]) => void | Promise<void>) => {
    ipcMain.handle(name, async (event, ...args): Promise<Result> => {
      if (event.sender.id !== control?.webContents.id) return { ok: false, error: '此操作只能在控制台执行。' };
      try { await fn(...args); broadcast(); return { ok: true }; }
      catch (error) { return { ok: false, error: error instanceof Error && !('code' in error) ? error.message : '无法保存设置，请检查程序旁 data 文件夹的写入权限。' }; }
    });
  };
  action('panel:set-slot', (id, status) => {
    if (!ROLE_IDS.includes(id) || !SLOT_STATUSES.includes(status)) throw new Error('无效的分路状态。');
    persist({ ...state, slots: { ...state.slots, [id]: status } });
  });
  action('panel:layout', (layout: Layout) => {
    const errors = layoutErrors(layout);
    if (errors.length) throw new Error(errors.join(' '));
    persist(parseState({ ...state, layout })); sizeDisplay(true); syncHeart();
  });
  action('panel:heart', (settings: AppState['heart']) => {
    if (!settings || typeof settings.url !== 'string' || !isAllowedHeartURL(settings.url.trim(), testing)) throw new Error('请填写 app.hyperate.io 或 designer.hyperate.io 的 HTTPS 展示网址。');
    const next = parseState({ ...state, heart: { url: settings.url.trim(), zoom: settings.zoom } });
    persist(next); syncHeart();
  });
  action('panel:heart-refresh', () => { retryCount = 0; syncHeart(true); });
  action('panel:display', (value: string) => {
    if (!display) return;
    if (value === 'show') { display.showInactive(); runtime.displayVisible = true; }
    else if (value === 'hide') { display.hide(); runtime.displayVisible = false; }
    else if (value === 'reposition') { sizeDisplay(true); display.showInactive(); runtime.displayVisible = true; }
    else if (value === 'pin') { runtime.alwaysOnTop = !runtime.alwaysOnTop; display.setAlwaysOnTop(runtime.alwaysOnTop); }
    else throw new Error('无效窗口操作。');
  });
  action('panel:help', async (target: string) => {
    if (target === 'guide') {
      if (guide && !guide.isDestroyed()) { guide.show(); return; }
      guide = new BrowserWindow({ width: 880, height: 760, title: '使用说明 · 王者直播信息屏', autoHideMenuBar: true,
        icon: appIcon, titleBarStyle: 'hidden', backgroundColor: '#ffffff',
        titleBarOverlay: { color: '#ffffff', symbolColor: '#737d8b', height: 36 },
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      protectedWindow(guide); void loadPage(guide, 'guide'); return;
    }
    const url = target === 'hyperate' ? 'https://www.hyperate.io/' : target === 'designer' ? 'https://designer.hyperate.io/' : null;
    if (!url) throw new Error('无效链接。');
    await shell.openExternal(url);
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { control?.restore(); control?.show(); control?.focus(); });
  app.on('before-quit', () => { quitting = true; destroyHeart(); });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    const heartSession = session.fromPartition('persist:hyperate-widget');
    heartSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    heartSession.setPermissionCheckHandler(() => false);
    heartSession.on('will-download', event => event.preventDefault());
    loadState(); handlers(); createWindows();
    screen.on('display-metrics-changed', () => sizeDisplay(true));
  });
  app.on('window-all-closed', () => app.quit());
}
