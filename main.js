const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const { appendFile, existsSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { canRefineDropSurface, advanceDrop } = require('./lib/drop-physics');
const { advanceWalk } = require('./lib/walk-physics');
const { normalizeVisibleSegments, chooseActivityRange } = require('./lib/surface-visibility');
const { shouldDeferAutomaticActivity } = require('./lib/activity-policy');

// The artwork is still authored in 190px cells. A larger transparent window
// gives scaled states enough room without clipping, while the fixed baseline
// keeps every scale anchored to the same window or taskbar top.
const PET_WIDTH = 250;
const PET_HEIGHT = 250;
const VISUAL_BASELINE = 220;
const PET_EDGE_BLEED = 12;
const PET_SUPPORT_LEFT = 9;
const PET_SUPPORT_WIDTH = 232;
const PET_STAND_HALF_WIDTH = PET_SUPPORT_WIDTH / 2 - PET_EDGE_BLEED;
const DROP_QUERY_TIMEOUT_MS = 1000;

let petWindow;
let activityTimer;
let motionTimer;
let landingTimer;
let rideStopTimer;
let recoveringPosition = false;
let tray;
let isQuitting = false;
let backgroundHintShown = false;
let settings = { launchAtStartup: true };
let windowTracker;
let windowTrackerGeneration = 0;
let trackedHwnd = null;
let windowTrackerLastMessageAt = 0;
let windowTrackerHasMessage = false;
let windowTrackerRetryAt = 0;
let dropGeneration = 0;
let windowProbe;
let windowProbeBuffer = '';
let windowProbeRequestId = 0;
const windowProbeRequests = new Map();
let windowProbeRestartTimer;

const pet = {
  x: 80,
  y: 80,
  vx: 1.15,
  vy: 0,
  dragging: false,
  falling: false,
  dragOffsetX: PET_WIDTH / 2,
  dragOffsetY: PET_HEIGHT / 2,
  state: 'idle',
  facing: 'left',
  walkTurnCount: 0,
  surface: null,
  dropX: 80
};

function logRuntimeError(context, error) {
  const message = `[${new Date().toISOString()}] ${context}: ${error?.stack || error}\n`;
  try {
    appendFile(path.join(app.getPath('userData'), 'desktop-pet-errors.log'), message, () => {});
  } catch {
    // Logging must never interrupt the pet.
  }
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function saveSettings() {
  try {
    writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    logRuntimeError('save settings', error);
  }
}

function applyLaunchAtStartup(enabled) {
  settings.launchAtStartup = Boolean(enabled);
  if (app.isPackaged && process.platform === 'win32') {
    try {
      app.setLoginItemSettings({
        openAtLogin: settings.launchAtStartup,
        path: process.execPath
      });
    } catch (error) {
      logRuntimeError('set launch at startup', error);
    }
  }
  saveSettings();
}

function loadSettings() {
  const file = settingsFile();
  if (existsSync(file)) {
    try {
      settings = { ...settings, ...JSON.parse(readFileSync(file, 'utf8')) };
    } catch (error) {
      logRuntimeError('load settings', error);
    }
  }
  applyLaunchAtStartup(settings.launchAtStartup !== false);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSurface(surface, fallback) {
  if (!surface) return fallback;
  const left = finiteNumber(surface.left, NaN);
  const right = finiteNumber(surface.right, NaN);
  const floorY = finiteNumber(surface.floorY, NaN);
  if (![left, right, floorY].every(Number.isFinite) ||
      [left, right, floorY].some((value) => Math.abs(value) > 1000000) || right <= left) return fallback;
  return { ...surface, left, right, floorY };
}

function restoreSafePosition(reason) {
  if (recoveringPosition || !petWindow || petWindow.isDestroyed()) return;
  recoveringPosition = true;
  try {
    stopWindowTracking();
    const bounds = petWindow.getBounds();
    pet.x = finiteNumber(bounds.x, finiteNumber(pet.x, 0));
    pet.y = finiteNumber(bounds.y, finiteNumber(pet.y, 0));
    const surface = displayFloorAt({ x: pet.x + PET_WIDTH / 2, y: pet.y + VISUAL_BASELINE });
    pet.surface = surface;
    pet.dropX = pet.x;
    pet.vx = finiteNumber(pet.vx, 1.15) || 1.15;
    pet.vy = 1.5;
    pet.dragging = false;
    pet.falling = true;
    sendState('fall');
    logRuntimeError(`motion recovery without relocation: ${reason}`, new Error('continued falling from current window position'));
  } catch (error) {
    logRuntimeError(`position recovery after ${reason}`, error);
  } finally {
    recoveringPosition = false;
  }
}

function nativeHelperPath(filename) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', filename)
    : path.join(__dirname, 'bin', filename);
}

function petNativeWindowHandle() {
  if (!petWindow || petWindow.isDestroyed()) return '0';
  const handle = petWindow.getNativeWindowHandle();
  return handle.length >= 8
    ? handle.readBigUInt64LE(0).toString()
    : String(handle.readUInt32LE(0));
}

function activityRangeFor(surface, desiredX) {
  if (!surface) return null;
  const range = chooseActivityRange({
    segments: surface.visibleSegments,
    surfaceLeft: finiteNumber(surface.left, NaN),
    surfaceRight: finiteNumber(surface.right, NaN),
    desiredX: finiteNumber(desiredX, NaN) + PET_SUPPORT_LEFT,
    petWidth: PET_SUPPORT_WIDTH,
    edgeBleed: PET_EDGE_BLEED
  });
  if (!range) return null;
  return {
    ...range,
    x: range.x - PET_SUPPORT_LEFT,
    min: range.min - PET_SUPPORT_LEFT,
    max: range.max - PET_SUPPORT_LEFT
  };
}

function applyActivityRange(surface, range) {
  if (!surface || !range) return;
  surface.visibleLeft = range.segment.left;
  surface.visibleRight = range.segment.right;
  surface.activityLeft = range.min;
  surface.activityRight = range.max;
}

function resolveAllProbeRequests(value = null) {
  for (const { resolve, timer } of windowProbeRequests.values()) {
    clearTimeout(timer);
    resolve(value);
  }
  windowProbeRequests.clear();
}

function stopWindowProbe() {
  clearTimeout(windowProbeRestartTimer);
  windowProbeRestartTimer = null;
  resolveAllProbeRequests(null);
  if (windowProbe) {
    const probe = windowProbe;
    windowProbe = null;
    try { probe.kill(); } catch (error) { logRuntimeError('stop window probe', error); }
  }
  windowProbeBuffer = '';
}

function scheduleWindowProbeRestart() {
  if (isQuitting || windowProbeRestartTimer) return;
  windowProbeRestartTimer = setTimeout(() => {
    windowProbeRestartTimer = null;
    startWindowProbe();
  }, 250);
}

function startWindowProbe() {
  if (windowProbe || isQuitting) return;
  const probe = spawn(nativeHelperPath('WindowProbe.exe'), ['--server'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  windowProbe = probe;
  windowProbeBuffer = '';
  let stderr = '';
  probe.stdout.setEncoding('utf8');
  probe.stderr.setEncoding('utf8');
  probe.stdout.on('data', (chunk) => {
    windowProbeBuffer += chunk;
    const lines = windowProbeBuffer.split(/\r?\n/);
    windowProbeBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const result = JSON.parse(line);
        const pending = windowProbeRequests.get(result.id);
        if (!pending) continue;
        clearTimeout(pending.timer);
        windowProbeRequests.delete(result.id);
        pending.resolve(result.found ? result : null);
      } catch (error) {
        logRuntimeError('parse window probe output', error);
      }
    }
  });
  probe.stderr.on('data', (chunk) => { stderr += chunk; });
  probe.on('error', (error) => {
    if (probe !== windowProbe) return;
    logRuntimeError('window probe process', error);
  });
  probe.on('exit', (code) => {
    if (probe !== windowProbe) return;
    windowProbe = null;
    resolveAllProbeRequests(null);
    if (stderr.trim()) logRuntimeError('window probe stderr', new Error(stderr.trim()));
    if (!isQuitting) {
      logRuntimeError('window probe restart', new Error(`probe exited with code ${code}`));
      scheduleWindowProbeRestart();
    }
  });
}

function stopWindowTracking() {
  windowTrackerGeneration += 1;
  trackedHwnd = null;
  windowTrackerLastMessageAt = 0;
  windowTrackerHasMessage = false;
  if (windowTracker) {
    const tracker = windowTracker;
    windowTracker = null;
    try {
      tracker.kill();
    } catch (error) {
      logRuntimeError('stop window tracker', error);
    }
  }
}

function loseTrackedWindow(reason) {
  clearTimeout(rideStopTimer);
  stopWindowTracking();
  if (pet.dragging || !petWindow || petWindow.isDestroyed()) return;
  if (reason) logRuntimeError('tracked window unavailable', new Error(reason));
  dropGeneration += 1;
  dropPet(dropGeneration);
}

function applyTrackedWindowRect(surface, rect) {
  if (pet.surface !== surface || pet.dragging) return;
  const left = finiteNumber(rect.left, NaN);
  const top = finiteNumber(rect.top, NaN);
  const right = finiteNumber(rect.right, NaN);
  if (![left, top, right].every(Number.isFinite) || right <= left) return;

  const oldLeft = finiteNumber(surface.left, left);
  const relativeX = finiteNumber(surface.relativeX, finiteNumber(pet.x, left) - oldLeft);
  const desiredX = left + relativeX;
  const visibleSegments = normalizeVisibleSegments(rect.segments, left, right);

  surface.left = left;
  surface.right = right;
  surface.floorY = top;
  surface.visibleSegments = visibleSegments;
  const range = activityRangeFor(surface, desiredX);
  if (!range) {
    loseTrackedWindow('window top is fully covered by higher windows');
    return;
  }
  applyActivityRange(surface, range);
  pet.x = range.x;
  surface.relativeX = pet.x - left;

  if (!pet.falling) {
    pet.y = top - VISUAL_BASELINE;
    const deltaX = left - oldLeft;
    if (Math.abs(deltaX) >= 1) {
      const rideState = deltaX > 0 ? 'ride-rear' : 'ride-front';
      if (pet.state !== rideState) sendState(rideState);
      clearTimeout(rideStopTimer);
      rideStopTimer = setTimeout(() => {
        if (pet.state.startsWith('ride-') && !pet.dragging && !pet.falling) sendState('idle');
      }, 180);
    }
  }
  moveWindowSafely(pet.x, pet.y, 'follow tracked window');
}

function startWindowTracking(surface) {
  if (!surface || surface.kind !== 'window' || !surface.hwnd) {
    stopWindowTracking();
    return;
  }

  const hwnd = String(surface.hwnd);
  if (windowTracker && trackedHwnd === hwnd) return;
  stopWindowTracking();
  const generation = windowTrackerGeneration;
  trackedHwnd = hwnd;
  surface.relativeX = finiteNumber(pet.x, surface.left) - surface.left;
  windowTrackerLastMessageAt = Date.now();
  windowTrackerHasMessage = false;
  windowTrackerRetryAt = Date.now() + 500;

  const trackerExecutable = nativeHelperPath('WindowTracker.exe');
  const tracker = spawn(trackerExecutable, [hwnd, '33', petNativeWindowHandle(), String(process.pid)], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  windowTracker = tracker;

  let stdoutBuffer = '';
  let stderrBuffer = '';
  let reportedUnavailable = false;
  tracker.stdout.setEncoding('utf8');
  tracker.stderr.setEncoding('utf8');
  tracker.stdout.on('data', (chunk) => {
    if (generation !== windowTrackerGeneration || pet.surface !== surface) return;
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const update = JSON.parse(line);
        windowTrackerLastMessageAt = Date.now();
        windowTrackerHasMessage = true;
        if (update.available === false) {
          reportedUnavailable = true;
          loseTrackedWindow('window was closed, hidden, or minimized');
          return;
        }
        applyTrackedWindowRect(surface, update);
      } catch (error) {
        logRuntimeError('parse window tracker output', error);
      }
    }
  });
  tracker.stderr.on('data', (chunk) => {
    stderrBuffer += chunk;
  });
  tracker.on('error', (error) => {
    if (generation !== windowTrackerGeneration) return;
    logRuntimeError('window tracker process', error);
    loseTrackedWindow('window tracker could not start');
  });
  tracker.on('exit', (code) => {
    if (generation !== windowTrackerGeneration) return;
    windowTracker = null;
    trackedHwnd = null;
    if (stderrBuffer.trim()) logRuntimeError('window tracker stderr', new Error(stderrBuffer.trim()));
    if (!reportedUnavailable && pet.surface === surface && surface.kind === 'window') {
      windowTrackerRetryAt = Date.now() + 180;
      logRuntimeError('window tracker restart', new Error(`tracker exited with code ${code}`));
    }
  });
}

function ensureWindowTracking() {
  const surface = pet.surface;
  if (!surface || surface.kind !== 'window' || pet.dragging || pet.falling) return;
  const now = Date.now();
  const heartbeatTimeout = windowTrackerHasMessage ? 2200 : 5000;
  if (windowTracker && windowTrackerLastMessageAt && now - windowTrackerLastMessageAt > heartbeatTimeout) {
    logRuntimeError('window tracker heartbeat', new Error('tracker heartbeat timed out; restarting'));
    stopWindowTracking();
    windowTrackerRetryAt = now + 180;
    return;
  }
  if (!windowTracker && now >= windowTrackerRetryAt) startWindowTracking(surface);
}

function moveWindowSafely(x, y, context) {
  if (!petWindow || petWindow.isDestroyed()) return false;
  const safeX = Number(x);
  const safeY = Number(y);
  if (!Number.isFinite(safeX) || !Number.isFinite(safeY) ||
      Math.abs(safeX) > 1000000 || Math.abs(safeY) > 1000000) {
    logRuntimeError(context, new Error(`Rejected invalid position x=${x}, y=${y}`));
    restoreSafePosition(context);
    return false;
  }
  try {
    petWindow.setPosition(Math.round(safeX), Math.round(safeY), false);
    return true;
  } catch (error) {
    logRuntimeError(context, error);
    restoreSafePosition(context);
    return false;
  }
}

function sendState(state, facing = pet.facing, options = {}) {
  const isRideState = state.startsWith('ride-');
  const nextFacing = facing === 'right' ? 'right' : 'left';
  pet.state = state;
  if (!isRideState) pet.facing = nextFacing;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet-state', {
      state,
      facing: isRideState ? 'left' : pet.facing,
      ...options
    });
  }
}

function displayFloorAt(point) {
  const primary = screen.getPrimaryDisplay();
  const safePoint = {
    x: Math.round(finiteNumber(point?.x, primary.bounds.x)),
    y: Math.round(finiteNumber(point?.y, primary.bounds.y))
  };
  const display = screen.getDisplayNearestPoint(safePoint);
  const boundsBottom = display.bounds.y + display.bounds.height;
  const workBottom = display.workArea.y + display.workArea.height;
  const taskbarVisible = workBottom < boundsBottom - 4;
  return {
    kind: taskbarVisible ? 'taskbar' : 'screen',
    left: display.bounds.x,
    right: display.bounds.x + display.bounds.width,
    floorY: taskbarVisible ? workBottom : boundsBottom
  };
}

function queryWindowUnderPet(point) {
  return new Promise((resolve) => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return resolve(null);
    if (!windowProbe || windowProbe.killed || !windowProbe.stdin.writable) {
      startWindowProbe();
    }
    if (!windowProbe || !windowProbe.stdin.writable) return resolve(null);
    const ownHandle = petNativeWindowHandle();
    const id = ++windowProbeRequestId;
    const timer = setTimeout(() => {
      const pending = windowProbeRequests.get(id);
      if (!pending) return;
      windowProbeRequests.delete(id);
      pending.resolve(null);
      logRuntimeError('window probe timeout', new Error(`request ${id} exceeded ${DROP_QUERY_TIMEOUT_MS}ms`));
    }, DROP_QUERY_TIMEOUT_MS);
    windowProbeRequests.set(id, { resolve, timer });
    windowProbe.stdin.write([
      id,
      Math.round(point.x),
      Math.round(point.y),
      8192,
      PET_STAND_HALF_WIDTH,
      ownHandle,
      process.pid
    ].join(',') + '\n', (error) => {
      if (!error) return;
      const pending = windowProbeRequests.get(id);
      if (!pending) return;
      clearTimeout(pending.timer);
      windowProbeRequests.delete(id);
      pending.resolve(null);
      logRuntimeError('write window probe request', error);
    });
  });
}

function landOn(surface) {
  const fallback = displayFloorAt({ x: pet.x, y: pet.y });
  pet.surface = normalizeSurface(surface, fallback);
  // Preserve the release X coordinate so the entire fall remains vertical.
  const desiredX = finiteNumber(pet.dropX, finiteNumber(pet.x, fallback.left + 20));
  const range = activityRangeFor(pet.surface, desiredX);
  if (range) applyActivityRange(pet.surface, range);
  pet.x = range ? range.x : desiredX;
  pet.y = pet.surface.floorY - VISUAL_BASELINE;
  pet.vy = 0;
  pet.falling = false;
  moveWindowSafely(pet.x, pet.y, 'landOn');
  sendState('land');
  if (pet.surface.kind === 'window') {
    pet.surface.relativeX = pet.x - pet.surface.left;
    startWindowTracking(pet.surface);
  }
  clearTimeout(landingTimer);
  landingTimer = setTimeout(() => sendState('idle'), 520);
}

function dropPet(generation) {
  if (!petWindow || petWindow.isDestroyed()) return;
  const footPoint = {
    x: Math.round(pet.x + PET_WIDTH / 2),
    y: Math.round(pet.y + VISUAL_BASELINE)
  };
  const fallback = displayFloorAt(footPoint);
  // Start falling immediately. Window detection is allowed to refine only the
  // landing surface; it never blocks animation or changes the release X/Y.
  pet.surface = fallback;
  pet.dropX = pet.x;
  pet.falling = true;
  pet.vy = 1.5;
  stopWindowTracking();
  sendState('fall');

  queryWindowUnderPet(footPoint).then((target) => {
    if (!target || generation !== dropGeneration || pet.dragging || !pet.falling ||
        !petWindow || petWindow.isDestroyed()) return;
    const candidate = normalizeSurface({
      kind: 'window',
      hwnd: String(target.hwnd),
      left: target.left,
      right: target.right,
      floorY: target.top,
      visibleSegments: [{ left: target.visibleLeft, right: target.visibleRight }],
      title: ''
    }, null);
    if (!candidate) return;
    // Late results behind the falling pet are ignored. This is the core
    // monotonicity rule that prevents upward snaps and vertical rerouting.
    if (!canRefineDropSurface({
      currentY: pet.y,
      baseline: VISUAL_BASELINE,
      candidateFloorY: candidate.floorY,
      fallbackFloorY: fallback.floorY
    })) return;
    candidate.relativeX = pet.dropX - candidate.left;
    pet.surface = candidate;
  }).catch((error) => logRuntimeError('drop target query', error));
}

function moveToBottom() {
  if (!petWindow || petWindow.isDestroyed()) return;
  stopWindowTracking();
  const point = { x: Math.round(pet.x + PET_WIDTH / 2), y: Math.round(pet.y + PET_HEIGHT / 2) };
  const surface = displayFloorAt(point);
  pet.surface = surface;
  pet.dropX = pet.x;
  pet.falling = true;
  pet.vy = 2;
  sendState('fall');
}

function chooseActivity(forced) {
  if (pet.dragging || pet.falling || !pet.surface) return;
  if (pet.state.startsWith('ride-') && !forced) return;
  if (shouldDeferAutomaticActivity({
    forced,
    state: pet.state,
    walkTurnCount: pet.walkTurnCount
  })) return;
  const next = forced || (Math.random() < 0.48 ? 'walk' : Math.random() < 0.6 ? 'idle' : 'eat');
  if (next === 'walk') {
    if (pet.state !== 'walk') pet.walkTurnCount = 0;
    const currentSpeed = finiteNumber(pet.vx, pet.facing === 'right' ? 1.15 : -1.15);
    const direction = currentSpeed < 0 ? -1 : 1;
    pet.vx = direction * Math.max(0.6, Math.abs(currentSpeed));
    sendState('walk', pet.vx < 0 ? 'left' : 'right');
  } else if (next === 'eat') {
    const bites = 2 + Math.floor(Math.random() * 3);
    sendState('eat', pet.facing, { repetitions: bites });
  } else {
    sendState(next);
  }
}

function tickMotion() {
  if (!petWindow || petWindow.isDestroyed()) return;
  ensureWindowTracking();

  if (pet.dragging) {
    const cursor = screen.getCursorScreenPoint();
    pet.x = finiteNumber(cursor.x, pet.x) - finiteNumber(pet.dragOffsetX, PET_WIDTH / 2);
    pet.y = finiteNumber(cursor.y, pet.y) - finiteNumber(pet.dragOffsetY, PET_HEIGHT / 2);
    moveWindowSafely(pet.x, pet.y, 'drag');
    return;
  }

  if (pet.falling && pet.surface) {
    pet.x = finiteNumber(pet.dropX, finiteNumber(pet.x, 0));
    const next = advanceDrop({
      y: pet.y,
      velocity: pet.vy,
      floorY: pet.surface.floorY,
      baseline: VISUAL_BASELINE
    });
    pet.y = next.y;
    pet.vy = next.velocity;
    if (next.landed) {
      landOn(pet.surface);
    } else {
      moveWindowSafely(pet.x, pet.y, 'fall');
    }
    return;
  }

  if (pet.state === 'walk' && pet.surface) {
    const min = finiteNumber(pet.surface.activityLeft, finiteNumber(pet.surface.left, 0) - PET_EDGE_BLEED);
    const max = Math.max(
      min,
      finiteNumber(pet.surface.activityRight, finiteNumber(pet.surface.right, min + PET_WIDTH) - PET_WIDTH + PET_EDGE_BLEED)
    );
    const next = advanceWalk({
      x: finiteNumber(pet.x, min),
      speed: finiteNumber(pet.vx, pet.facing === 'right' ? 1.15 : -1.15),
      leftEdge: min,
      rightEdge: max
    });
    pet.x = next.x;
    pet.vx = next.velocity;
    const nextFacing = next.velocity < 0 ? 'left' : 'right';
    if (next.turned) pet.walkTurnCount += 1;
    if (next.turned || pet.facing !== nextFacing) sendState('walk', nextFacing);
    if (pet.surface.kind === 'window') {
      pet.surface.relativeX = pet.x - pet.surface.left;
    }
    moveWindowSafely(pet.x, pet.y, 'walk');
  }
}

function showPetMenu() {
  const menu = Menu.buildFromTemplate([
    { label: '喂它吃饭', click: () => chooseActivity('eat') },
    { label: '让它散步', click: () => chooseActivity('walk') },
    { label: '安静休息', click: () => chooseActivity('idle') },
    { type: 'separator' },
    { label: '回到屏幕底部', click: moveToBottom },
    { type: 'separator' },
    { label: '隐藏到后台', click: () => hideToTray(true) }
  ]);
  menu.popup({ window: petWindow });
}

function showPet() {
  if (!petWindow || petWindow.isDestroyed()) {
    createWindow();
    return;
  }
  petWindow.showInactive();
  petWindow.setAlwaysOnTop(true, 'floating');
  sendState('idle');
  updateTrayMenu();
}

function hideToTray(showHint = false) {
  if (!petWindow || petWindow.isDestroyed()) return;
  dropGeneration += 1;
  stopWindowTracking();
  pet.dragging = false;
  pet.falling = false;
  petWindow.hide();
  updateTrayMenu();

  if (showHint && !backgroundHintShown && tray && process.platform === 'win32') {
    backgroundHintShown = true;
    tray.displayBalloon({
      iconType: 'info',
      title: 'NJUcsPete 已转入后台',
      content: '双击托盘里的小猫图标可重新显示。'
    });
  }
}

function quitCompletely() {
  isQuitting = true;
  app.quit();
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  const visible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: visible ? '隐藏桌宠' : '显示桌宠',
      click: () => visible ? hideToTray(false) : showPet()
    },
    { label: '喂它吃饭', enabled: visible, click: () => chooseActivity('eat') },
    { label: '让它散步', enabled: visible, click: () => chooseActivity('walk') },
    { type: 'separator' },
    {
      label: '开机自启动',
      type: 'checkbox',
      checked: settings.launchAtStartup,
      click: (item) => {
        applyLaunchAtStartup(item.checked);
        updateTrayMenu();
      }
    },
    { type: 'separator' },
    { label: '完全退出', click: quitCompletely }
  ]));
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'app-icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);
  tray.setToolTip('NJUcsPete');
  tray.on('double-click', showPet);
  tray.on('click', updateTrayMenu);
  updateTrayMenu();
}

function createWindow() {
  const initialDisplay = screen.getPrimaryDisplay();
  const floorY = initialDisplay.workArea.y + initialDisplay.workArea.height;
  pet.x = initialDisplay.workArea.x + Math.round(initialDisplay.workArea.width * 0.72);
  pet.y = floorY - VISUAL_BASELINE;
  pet.surface = {
    kind: 'taskbar',
    left: initialDisplay.bounds.x,
    right: initialDisplay.bounds.x + initialDisplay.bounds.width,
    floorY
  };

  petWindow = new BrowserWindow({
    width: PET_WIDTH,
    height: PET_HEIGHT,
    x: Math.round(pet.x),
    y: Math.round(pet.y),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.setAlwaysOnTop(true, 'floating');
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  petWindow.once('ready-to-show', () => {
    petWindow.showInactive();
    sendState('idle');
    updateTrayMenu();
  });
  petWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideToTray(true);
    }
  });
}

ipcMain.on('drag-start', (_event, offset) => {
  if (!petWindow || petWindow.isDestroyed()) return;
  dropGeneration += 1;
  stopWindowTracking();
  clearTimeout(rideStopTimer);
  pet.dragging = true;
  pet.falling = false;
  pet.dragOffsetX = Math.min(Math.max(Number(offset.x) || PET_WIDTH / 2, 0), PET_WIDTH);
  pet.dragOffsetY = Math.min(Math.max(Number(offset.y) || PET_HEIGHT / 2, 0), PET_HEIGHT);
  sendState('drag');
});

ipcMain.on('drag-end', () => {
  if (!pet.dragging) return;
  const cursor = screen.getCursorScreenPoint();
  // Synchronize the exact pointer-up position before probing. This removes the
  // one-frame lag that could query a different horizontal or vertical column.
  pet.x = cursor.x - pet.dragOffsetX;
  pet.y = cursor.y - pet.dragOffsetY;
  pet.dropX = pet.x;
  moveWindowSafely(pet.x, pet.y, 'drag release');
  pet.dragging = false;
  const generation = dropGeneration;
  dropPet(generation);
});

ipcMain.on('show-menu', showPetMenu);
ipcMain.on('feed-pet', () => chooseActivity('eat'));
ipcMain.on('animation-complete', (_event, completedState) => {
  if (completedState === 'eat' && pet.state === 'eat' && !pet.dragging && !pet.falling) {
    sendState('idle');
  }
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showPet);
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  app.setAppUserModelId('com.nju.cs.pete');
  startWindowProbe();
  loadSettings();
  createTray();
  createWindow();
  motionTimer = setInterval(() => {
    try {
      tickMotion();
    } catch (error) {
      logRuntimeError('motion timer', error);
      restoreSafePosition('motion timer');
    }
  }, 16);
  activityTimer = setInterval(() => chooseActivity(), 5200);
});

app.on('before-quit', () => {
  isQuitting = true;
  stopWindowProbe();
  stopWindowTracking();
  clearInterval(motionTimer);
  clearInterval(activityTimer);
  clearTimeout(landingTimer);
  clearTimeout(rideStopTimer);
});

app.on('window-all-closed', () => {
  // Keep the tray process alive. Only "完全退出" ends the application.
});

process.on('uncaughtException', (error) => {
  logRuntimeError('uncaught exception', error);
  restoreSafePosition('uncaught exception');
});
