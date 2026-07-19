function normalizeVisibleSegments(segments, surfaceLeft, surfaceRight) {
  if (![surfaceLeft, surfaceRight].every(Number.isFinite) || surfaceRight <= surfaceLeft) {
    return [];
  }
  const source = Array.isArray(segments)
    ? segments
    : [{ left: surfaceLeft, right: surfaceRight }];
  const normalized = source
    .map((segment) => ({
      left: Math.max(surfaceLeft, Number(segment?.left)),
      right: Math.min(surfaceRight, Number(segment?.right))
    }))
    .filter(({ left, right }) => Number.isFinite(left) && Number.isFinite(right) && right > left)
    .sort((a, b) => a.left - b.left);

  const merged = [];
  for (const segment of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && segment.left <= previous.right) {
      previous.right = Math.max(previous.right, segment.right);
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

function chooseActivityRange({
  segments,
  surfaceLeft,
  surfaceRight,
  desiredX,
  petWidth,
  edgeBleed
}) {
  if (![desiredX, petWidth, edgeBleed].every(Number.isFinite) || petWidth <= 0 || edgeBleed < 0) {
    return null;
  }

  const ranges = normalizeVisibleSegments(segments, surfaceLeft, surfaceRight)
    .map((segment) => ({
      segment,
      min: segment.left - edgeBleed,
      max: segment.right - petWidth + edgeBleed
    }))
    .filter(({ min, max }) => max >= min);

  let best = null;
  for (const range of ranges) {
    const x = Math.min(Math.max(desiredX, range.min), range.max);
    const distance = Math.abs(x - desiredX);
    if (!best || distance < best.distance) best = { ...range, x, distance };
  }
  return best;
}

module.exports = { normalizeVisibleSegments, chooseActivityRange };
