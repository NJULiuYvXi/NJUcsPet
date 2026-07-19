const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

function nativeHandle(window) {
  const buffer = window.getNativeWindowHandle();
  return buffer.length >= 8
    ? buffer.readBigUInt64LE(0).toString()
    : String(buffer.readUInt32LE(0));
}

app.whenReady().then(() => {
  const target = new BrowserWindow({
    width: 600,
    height: 100,
    x: 120,
    y: 300,
    opacity: 0.01,
    show: true,
    skipTaskbar: true,
    alwaysOnTop: true
  });
  const blocker = new BrowserWindow({
    width: 220,
    height: 130,
    x: 350,
    y: 240,
    opacity: 0.01,
    show: true,
    skipTaskbar: true,
    alwaysOnTop: true
  });
  blocker.moveTop();

  const tracker = spawn(
    process.env.WINDOW_TRACKER_EXE || path.join(__dirname, '..', 'bin', 'WindowTracker.exe'),
    [nativeHandle(target), '33', '0', '0'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  const updates = [];
  let output = '';
  tracker.stdout.setEncoding('utf8');
  tracker.stdout.on('data', (chunk) => {
    output += chunk;
    const lines = output.split(/\r?\n/);
    output = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const update = JSON.parse(line);
      if (update.available) updates.push(update);
    }
  });

  setTimeout(() => target.setPosition(180, 320), 500);
  setTimeout(() => blocker.moveTop(), 850);
  setTimeout(() => target.moveTop(), 1250);
  setTimeout(() => target.setPosition(620, 340), 1550);
  setTimeout(() => {
    tracker.kill();
    blocker.destroy();
    target.destroy();
    const distinct = new Set(updates.map(({ left, top }) => `${left},${top}`));
    const occludedIndex = updates.findIndex(({ segments }) => Array.isArray(segments) && segments.length >= 2);
    const restored = occludedIndex >= 0 && updates.slice(occludedIndex + 1).some((update) =>
      update.segments?.length === 1 &&
      update.segments[0].left === update.left &&
      update.segments[0].right === update.right
    );
    const ok = distinct.size >= 2 && occludedIndex >= 0 && restored;
    if (!ok) {
      console.error(JSON.stringify({ ok: false, distinct: [...distinct], updates }, null, 2));
      app.exit(1);
      return;
    }
    console.log(JSON.stringify({
      ok: true,
      positions: [...distinct],
      occludedSegments: updates[occludedIndex].segments,
      visibilityRestored: restored
    }, null, 2));
    app.exit(0);
  }, 2300);
});
