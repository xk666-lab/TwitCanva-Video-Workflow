export interface CanvasNodeBounds {
  id: string;
  x: number;
  y: number;
}

export interface CanvasNodeSize {
  width: number;
  height: number;
}

export const CONNECTION_TARGET_NODE_WIDTH = 340;
export const CONNECTION_TARGET_NODE_HEIGHT = 400;
export const CONNECTION_PORT_RAIL_WIDTH = 112;
export const CONNECTION_CLICK_MAX_DURATION_MS = 200;
export const CONNECTION_CLICK_MAX_DISTANCE_PX = 8;

export function screenPointToCanvasPoint(
  point: { x: number; y: number },
  canvasRect: { left: number; top: number },
  viewport: { x: number; y: number; zoom: number }
): { x: number; y: number } {
  return {
    x: (point.x - canvasRect.left - viewport.x) / viewport.zoom,
    y: (point.y - canvasRect.top - viewport.y) / viewport.zoom
  };
}

export function isConnectionClick(
  start: { x: number; y: number },
  end: { x: number; y: number },
  durationMs: number
): boolean {
  return durationMs < CONNECTION_CLICK_MAX_DURATION_MS
    && Math.hypot(end.x - start.x, end.y - start.y) <= CONNECTION_CLICK_MAX_DISTANCE_PX;
}

export function findConnectionTargetNode<T extends CanvasNodeBounds>(
  nodes: T[],
  point: { x: number; y: number },
  sourceNodeId?: string,
  nodeSizes: Record<string, CanvasNodeSize> = {}
): T | undefined {
  return nodes.find(node => {
    if (node.id === sourceNodeId) return false;

    const size = nodeSizes[node.id];
    const width = size?.width ?? CONNECTION_TARGET_NODE_WIDTH;
    const height = size?.height ?? CONNECTION_TARGET_NODE_HEIGHT;

    return (
      point.x >= node.x - CONNECTION_PORT_RAIL_WIDTH
      && point.x <= node.x + width + CONNECTION_PORT_RAIL_WIDTH
      && point.y >= node.y
      && point.y <= node.y + height
    );
  });
}
