const assert = require('node:assert/strict');
const { canRefineDropSurface, advanceDrop } = require('../lib/drop-physics');

for (let scenario = 0; scenario < 20000; scenario += 1) {
  const releaseX = -2000 + Math.random() * 6000;
  const releaseY = -500 + Math.random() * 1800;
  const baseline = 220;
  const fallbackFloorY = releaseY + baseline + 50 + Math.random() * 3000;
  const targetFloorY = releaseY + baseline - 100 + Math.random() * 3200;
  const responseFrame = Math.floor(Math.random() * 30);
  let x = releaseX;
  let y = releaseY;
  let velocity = 1.5;
  let floorY = fallbackFloorY;
  let previousY = y;
  let landed = false;

  for (let frame = 0; frame < 1000 && !landed; frame += 1) {
    if (frame === responseFrame && canRefineDropSurface({
      currentY: y, baseline, candidateFloorY: targetFloorY, fallbackFloorY
    })) floorY = targetFloorY;

    const next = advanceDrop({ y, velocity, floorY, baseline });
    y = next.y;
    velocity = next.velocity;
    landed = next.landed;
    assert.equal(x, releaseX, 'x changed during a vertical drop');
    assert.ok(y >= previousY, 'y moved upward during a drop');
    assert.ok(y <= floorY - baseline, 'drop overshot its landing surface');
    previousY = y;
  }
  assert.ok(landed, 'drop did not eventually land');
}

console.log(JSON.stringify({ ok: true, scenarios: 20000 }));
