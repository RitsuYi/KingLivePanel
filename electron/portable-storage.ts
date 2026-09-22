import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// Run synchronously before ready, sessions, windows or the single-instance lock.
// The packaged app always follows its EXE, even when launched from another cwd.
export function configurePortableStorage(testing: boolean) {
  const base = app.isPackaged ? path.dirname(process.execPath) : app.getAppPath();
  const data = testing && process.env.KINGLIVE_TEST_DATA
    ? path.resolve(process.env.KINGLIVE_TEST_DATA)
    : path.join(base, 'data');
  const paths = {
    appData: path.join(data, 'app-data'),
    userData: data,
    sessionData: path.join(data, 'cache'),
    temp: path.join(data, 'temp'),
    logs: path.join(data, 'logs'),
    crashDumps: path.join(data, 'crash-dumps'),
  };
  try {
    for (const directory of Object.values(paths)) {
      fs.mkdirSync(directory, { recursive: true });
      fs.accessSync(directory, fs.constants.W_OK);
    }
    for (const [name, directory] of Object.entries(paths)) app.setPath(name, directory);
    app.setAppLogsPath(paths.logs);
    // Child processes and Node temporary files must use the same portable tree.
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = paths.temp;
    process.env.APPDATA = process.env.LOCALAPPDATA = paths.appData;
    process.env.ELECTRON_LOG_FILE = path.join(paths.logs, 'electron.log');
    app.commandLine.appendSwitch('user-data-dir', paths.userData);
    app.commandLine.appendSwitch('log-file', process.env.ELECTRON_LOG_FILE);
  } catch {
    dialog.showErrorBox('无法启动便携版', `无法写入程序的数据文件夹：\n${data}\n\n请将整个程序文件夹放到可写入的位置后重试。程序不会改用 C 盘的应用数据或临时目录。`);
    app.exit(1);
    throw new Error('Portable storage initialization failed.');
  }
}
