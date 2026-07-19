const assert = require('node:assert/strict');
const { advanceWalk } = require('../lib/walk-physics');

for (let scenario = 0; scenario < 20000; scenario += 1) {
  const leftEdge = -2000 + Math.random() * 4000;
  const rightEdge = leftEdge + 20 + Math.random() * 3000;
  let x = leftEdge + Math.random() * (rightEdge - leftEdge);
  let velocity = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 19.4);

  for (let frame = 0; frame < 100; frame += 1) {
    const previousX = x;
    const previousVelocity = velocity;
    const next = advanceWalk({ x, speed: velocity, leftEdge, rightEdge });
    x = next.x;
    velocity = next.velocity;
    assert.ok(x >= leftEdge && x <= rightEdge, 'walk left its surface bounds');
    assert.ok(Math.abs(velocity) >= 0.6, 'walk lost its minimum speed');
    if (next.turned) {
      assert.equal(Math.sign(velocity), -Math.sign(previousVelocity), 'turn did not reverse direction');
      assert.ok(x === leftEdge || x === rightEdge, 'turn happened away from an edge');
    } else if (previousVelocity < 0) {
      assert.ok(x < previousX, 'left-facing cat moved right');
    } else {
      assert.ok(x > previousX, 'right-facing cat moved left');
    }
  }

  const leftTurn = advanceWalk({
    x: leftEdge + 0.1,
    speed: -Math.abs(velocity),
    leftEdge,
    rightEdge
  });
  assert.deepEqual(
    { x: leftTurn.x, direction: Math.sign(leftTurn.velocity), turned: leftTurn.turned },
    { x: leftEdge, direction: 1, turned: true },
    'cat did not turn right at the left edge'
  );

  const rightTurn = advanceWalk({
    x: rightEdge - 0.1,
    speed: Math.abs(velocity),
    leftEdge,
    rightEdge
  });
  assert.deepEqual(
    { x: rightTurn.x, direction: Math.sign(rightTurn.velocity), turned: rightTurn.turned },
    { x: rightEdge, direction: -1, turned: true },
    'cat did not turn left at the right edge'
  );
}

console.log(JSON.stringify({ ok: true, scenarios: 20000, direction: 'bidirectional-with-edge-turns' }));
