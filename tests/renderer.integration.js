const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

app.whenReady().then(async () => {
  const outputDirectory = path.join(__dirname, 'render-output');
  mkdirSync(outputDirectory, { recursive: true });
  const window = new BrowserWindow({
    width: 250,
    height: 250,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      offscreen: true
    }
  });

  await window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  window.webContents.send('pet-state', { state: 'walk', facing: 'left' });
  await wait(50);
  const timingStart = Number(await window.webContents.executeJavaScript(
    "document.querySelector('#sprite').dataset.frame"
  ));
  await wait(500);
  const timingEnd = Number(await window.webContents.executeJavaScript(
    "document.querySelector('#sprite').dataset.frame"
  ));
  const timingAdvance = (timingEnd - timingStart + 18) % 18;
  if (timingAdvance < 5 || timingAdvance > 7) {
    throw new Error(`walk timing mismatch: advanced ${timingAdvance} frames in 500 ms`);
  }

  const states = ['idle', 'walk', 'eat', 'drag', 'fall', 'ride-front', 'ride-rear'];
  const captures = [];
  for (const state of states) {
    window.webContents.send('pet-state', { state, facing: 'left' });
    await wait(180);
    const image = await window.webContents.capturePage();
    const size = image.getSize();
    if (image.isEmpty() || size.width !== 250 || size.height !== 250) {
      throw new Error(`invalid ${state} render: empty=${image.isEmpty()} size=${size.width}x${size.height}`);
    }
    const file = path.join(outputDirectory, `${state}.png`);
    writeFileSync(file, image.toPNG());
    captures.push({ state, size, bytes: image.toPNG().length });
  }

  console.log(JSON.stringify({ ok: true, walkFramesPer500ms: timingAdvance, captures }, null, 2));
  window.destroy();
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
