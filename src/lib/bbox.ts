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

export function moveBbox(bbox: Bbox, deltaX: number, deltaY: number): Bbox {
  const [yMin, xMin, yMax, xMax] = bbox;
  const height = yMax - yMin;
  const width = xMax - xMin;
  const nextTop = Math.min(1000 - height, Math.max(0, yMin + deltaY));
  const nextLeft = Math.min(1000 - width, Math.max(0, xMin + deltaX));

  return [
    Math.round(nextTop),
    Math.round(nextLeft),
    Math.round(nextTop + height),
    Math.round(nextLeft + width),
  ];
}

export function defaultBbox(index: number, total: number): Bbox {
  const columns = total > 4 ? 3 : 2;
  const rows = Math.ceil(total / columns);
  const column = index % columns;
  const row = Math.floor(index / columns);
  const gap = 45;
  const cellWidth = (1000 - gap * (columns + 1)) / columns;
  const cellHeight = (1000 - gap * (rows + 1)) / rows;
  const xMin = gap + column * (cellWidth + gap);
  const yMin = gap + row * (cellHeight + gap);

  return [
    Math.round(yMin),
    Math.round(xMin),
    Math.round(yMin + cellHeight),
    Math.round(xMin + cellWidth),
  ];
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
