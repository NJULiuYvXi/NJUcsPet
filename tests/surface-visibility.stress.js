const assert = require('node:assert/strict');
const { normalizeVisibleSegments, chooseActivityRange } = require('../lib/surface-visibility');

const PET_WIDTH = 232;
const EDGE_BLEED = 12;

assert.deepEqual(
  normalizeVisibleSegments([
    { left: 0, right: 300 },
    { left: 500, right: 900 }
  ], 0, 900),
  [{ left: 0, right: 300 }, { left: 500, right: 900 }]
);

const leftSide = chooseActivityRange({
  segments: [{ left: 0, right: 300 }, { left: 500, right: 900 }],
  surfaceLeft: 0,
  surfaceRight: 900,
  desiredX: 250,
  petWidth: PET_WIDTH,
  edgeBleed: EDGE_BLEED
});
assert.equal(leftSide.segment.right, 300);
assert.equal(leftSide.x, 80, 'pet was allowed to enter the covered gap');

for (let scenario = 0; scenario < 20000; scenario += 1) {
  const surfaceLeft = -3000 + Math.random() * 6000;
  const surfaceRight = surfaceLeft + 200 + Math.random() * 2400;
  const split = surfaceLeft + Math.random() * (surfaceRight - surfaceLeft);
  const gap = Math.random() * Math.min(500, surfaceRight - split);
  const segments = [
    { left: surfaceLeft, right: split },
    { left: split + gap, right: surfaceRight }
  ];
  const desiredX = surfaceLeft - PET_WIDTH + Math.random() * (surfaceRight - surfaceLeft + PET_WIDTH * 2);
  const chosen = chooseActivityRange({
    segments,
    surfaceLeft,
    surfaceRight,
    desiredX,
    petWidth: PET_WIDTH,
    edgeBleed: EDGE_BLEED
  });

  if (!chosen) {
    assert.ok(segments.every(({ left, right }) => right - left < PET_WIDTH - EDGE_BLEED * 2));
    continue;
  }
  assert.ok(chosen.x >= chosen.min && chosen.x <= chosen.max);
  assert.ok(chosen.x + EDGE_BLEED >= chosen.segment.left - 1e-9);
  assert.ok(chosen.x + PET_WIDTH - EDGE_BLEED <= chosen.segment.right + 1e-9);
}

console.log(JSON.stringify({ ok: true, scenarios: 20000, behavior: 'occlusion-aware-ranges' }));
