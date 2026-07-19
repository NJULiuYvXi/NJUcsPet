const { app, BrowserWindow } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');

function nativeHandle(window) {
  const buffer = window.getNativeWindowHandle();
  return buffer.length >= 8
    ? buffer.readBigUInt64LE(0).toString()
    : String(buffer.readUInt32LE(0));
}

function probe(executable, x, y) {
  return new Promise((resolve, reject) => {
    execFile(executable, [String(x), String(y), '8192', '83', '0', '0'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 1000
    }, (error, stdout) => {
      if (error) return reject(error);
      resolve(JSON.parse(stdout.trim()));
    });
  });
}

app.whenReady().then(async () => {
  const display = require('electron').screen.getPrimaryDisplay();
  const localX = Math.max(20, Math.min(display.bounds.width - 540, 900));
  const x = display.bounds.x + localX;
  const first = new BrowserWindow({ width: 500, height: 120, x, y: 401, opacity: 0.01, show: true, skipTaskbar: true, alwaysOnTop: true });
  const second = new BrowserWindow({ width: 500, height: 120, x, y: 551, opacity: 0.01, show: true, skipTaskbar: true, alwaysOnTop: true });
  const blocker = new BrowserWindow({ width: 240, height: 120, x: x + 260, y: 330, opacity: 0.01, show: true, skipTaskbar: true, alwaysOnTop: true });
  const executable = process.env.WINDOW_PROBE_EXE || path.join(__dirname, '..', 'bin', 'WindowProbe.exe');

  await new Promise((resolve) => setTimeout(resolve, 300));
  blocker.moveTop();
  await new Promise((resolve) => setTimeout(resolve, 100));

  const visiblePartOfFirst = await probe(executable, x + 120, 390);
  const coveredPartFallsThrough = await probe(executable, x + 370, 390);
  const firstHwnd = nativeHandle(first);
  const secondHwnd = nativeHandle(second);
  const ok = visiblePartOfFirst.hwnd === firstHwnd &&
    coveredPartFallsThrough.hwnd === secondHwnd &&
    visiblePartOfFirst.visibleLeft >= visiblePartOfFirst.left &&
    visiblePartOfFirst.visibleRight < visiblePartOfFirst.right;

  console.log(JSON.stringify({
    ok,
    firstHwnd,
    secondHwnd,
    visiblePartOfFirst,
    coveredPartFallsThrough
  }, null, 2));
  blocker.destroy();
  first.destroy();
  second.destroy();
  app.exit(ok ? 0 : 1);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
