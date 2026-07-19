function shouldDeferAutomaticActivity({ forced, state, walkTurnCount }) {
  return !forced && state === 'walk' && Number(walkTurnCount) < 1;
}

module.exports = { shouldDeferAutomaticActivity };
