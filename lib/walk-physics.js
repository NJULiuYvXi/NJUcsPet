function advanceWalk({ x, speed, leftEdge, rightEdge }) {
  if (![x, speed, leftEdge, rightEdge].every(Number.isFinite) || rightEdge < leftEdge) {
    throw new TypeError('Walk physics received invalid bounds');
  }

  const direction = speed < 0 ? -1 : 1;
  const velocity = direction * Math.max(0.6, Math.abs(speed));
  const currentX = Math.min(Math.max(x, leftEdge), rightEdge);
  const proposedX = currentX + velocity;

  if (proposedX <= leftEdge) {
    return { x: leftEdge, velocity: Math.abs(velocity), turned: velocity < 0 };
  }
  if (proposedX >= rightEdge) {
    return { x: rightEdge, velocity: -Math.abs(velocity), turned: velocity > 0 };
  }
  return { x: proposedX, velocity, turned: false };
}

module.exports = { advanceWalk };
