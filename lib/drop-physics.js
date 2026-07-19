function canRefineDropSurface({ currentY, baseline, candidateFloorY, fallbackFloorY }) {
  return [currentY, baseline, candidateFloorY, fallbackFloorY].every(Number.isFinite) &&
    candidateFloorY >= currentY + baseline && candidateFloorY <= fallbackFloorY;
}

function advanceDrop({ y, velocity, floorY, baseline, gravity = 0.58, maxVelocity = 24 }) {
  if (![y, velocity, floorY, baseline].every(Number.isFinite)) {
    throw new TypeError('Drop physics received a non-finite value');
  }
  const nextVelocity = Math.min(velocity + gravity, maxVelocity);
  const landingY = floorY - baseline;
  const proposedY = y + nextVelocity;
  if (proposedY >= landingY) {
    return { y: landingY, velocity: 0, landed: true };
  }
  return { y: proposedY, velocity: nextVelocity, landed: false };
}

module.exports = { canRefineDropSurface, advanceDrop };
