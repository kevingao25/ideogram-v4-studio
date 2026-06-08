export type Bbox = [number, number, number, number];

export type PixelRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const clampCoordinate = (value: number) => Math.min(1000, Math.max(0, Math.round(value)));

export function clampBbox([yMin, xMin, yMax, xMax]: Bbox): Bbox {
  const top = clampCoordinate(Math.min(yMin, yMax));
  const bottom = clampCoordinate(Math.max(yMin, yMax));
  const left = clampCoordinate(Math.min(xMin, xMax));
  const right = clampCoordinate(Math.max(xMin, xMax));

  return [top, left, bottom, right];
}

export function pixelsToBbox(
  rect: PixelRect,
  canvasWidth: number,
  canvasHeight: number,
): Bbox {
  return clampBbox([
    (rect.y / canvasHeight) * 1000,
    (rect.x / canvasWidth) * 1000,
    ((rect.y + rect.height) / canvasHeight) * 1000,
    ((rect.x + rect.width) / canvasWidth) * 1000,
  ]);
}

export function bboxToPixels(
  [yMin, xMin, yMax, xMax]: Bbox,
  canvasWidth: number,
  canvasHeight: number,
): PixelRect {
  return {
    x: (xMin / 1000) * canvasWidth,
    y: (yMin / 1000) * canvasHeight,
    width: ((xMax - xMin) / 1000) * canvasWidth,
    height: ((yMax - yMin) / 1000) * canvasHeight,
  };
}
