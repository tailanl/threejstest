/**
 * View rectangle utility functions for clamping viewport coordinates
 * within a region tile's bounds.
 */

export function clampViewStart(
  center: number,
  size: number,
  maxSize: number
): number {
  if (size >= maxSize) return 0;

  const raw = Math.floor(center - size / 2);

  return Math.max(
    0,
    Math.min(raw, maxSize - size)
  );
}

export function getClampedLocalViewRect(params: {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}) {
  const width = Math.min(params.width, params.maxWidth);
  const height = Math.min(params.height, params.maxHeight);

  const x = clampViewStart(params.centerX, width, params.maxWidth);
  const y = clampViewStart(params.centerY, height, params.maxHeight);

  return {
    x,
    y,
    width,
    height,
  };
}
