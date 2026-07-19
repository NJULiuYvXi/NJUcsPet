const assert = require('node:assert/strict');
const { shouldDeferAutomaticActivity } = require('../lib/activity-policy');
const { advanceWalk } = require('../lib/walk-physics');

const TIMER_TICKS = 325; // 5.2 seconds at the runtime's 16 ms motion tick.

const SCENARIOS = 2000;

for (let scenario = 0; scenario < SCENARIOS; scenario += 1) {
  const width = 1280 + Math.random() * 3840;
  const leftEdge = -2560 + Math.random() * 5120;
  const rightEdge = leftEdge + width - 232 + 24;
  let x = leftEdge + Math.random() * (rightEdge - leftEdge);
  let velocity = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 1.4);
  let walkTurnCount = 0;
  let directionChanges = 0;

  for (let tick = 1; tick <= 20000 && directionChanges === 0; tick += 1) {
    if (tick % TIMER_TICKS === 0) {
      assert.equal(shouldDeferAutomaticActivity({
        forced: false,
        state: 'walk',
        walkTurnCount
      }), true, 'automatic activity interrupted a bottom walk before its first turn');
    }

    const previousDirection = Math.sign(velocity);
    const next = advanceWalk({ x, speed: velocity, leftEdge, rightEdge });
    x = next.x;
    velocity = next.velocity;
    if (next.turned) {
      walkTurnCount += 1;
      directionChanges += 1;
      assert.equal(Math.sign(velocity), -previousDirection, 'edge turn did not change direction');
    }
  }

  assert.equal(directionChanges, 1, 'full-width bottom walk never reached a turn');
  assert.equal(shouldDeferAutomaticActivity({
    forced: false,
    state: 'walk',
    walkTurnCount
  }), false, 'automatic activity remained locked after the first turn');
  assert.equal(shouldDeferAutomaticActivity({
    forced: true,
    state: 'walk',
    walkTurnCount: 0
  }), false, 'an explicit user activity was incorrectly deferred');
}

console.log(JSON.stringify({
  ok: true,
  scenarios: SCENARIOS,
  behavior: 'bottom-walk-guarantees-one-turn'
}));
