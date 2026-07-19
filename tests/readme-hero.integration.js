const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 360,
    show: false,
    frame: false,
    webPreferences: {
      offscreen: true
    }
  });
  await window.loadFile(path.join(__dirname, '..', 'docs', 'hero.svg'));
  const image = await window.webContents.capturePage();
  const outputDirectory = path.join(__dirname, 'render-output');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(path.join(outputDirectory, 'readme-hero.png'), image.toPNG());
  console.log(JSON.stringify({ ok: !image.isEmpty(), size: image.getSize() }));
  window.destroy();
  app.exit(0);
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
