import test from 'node:test';
import assert from 'node:assert/strict';

interface CanvasNodeBounds {
  id: string;
  x: number;
  y: number;
}

type ConnectionHitTestingModule = {
  screenPointToCanvasPoint?: (
    point: { x: number; y: number },
    canvasRect: { left: number; top: number },
    viewport: { x: number; y: number; zoom: number }
  ) => { x: number; y: number };
  findConnectionTargetNode?: (
    nodes: CanvasNodeBounds[],
    point: { x: number; y: number },
    sourceNodeId?: string,
    nodeSizes?: Record<string, { width: number; height: number }>
  ) => CanvasNodeBounds | undefined;
  isConnectionClick?: (
    start: { x: number; y: number },
    end: { x: number; y: number },
    durationMs: number
  ) => boolean;
};

async function loadConnectionHitTesting(): Promise<ConnectionHitTestingModule> {
  try {
    return await import('./connectionHitTesting.ts') as ConnectionHitTestingModule;
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

test('converts a screen point relative to the canvas before applying the viewport', async () => {
  const hitTesting = await loadConnectionHitTesting();
  assert.equal(typeof hitTesting.screenPointToCanvasPoint, 'function');

  assert.deepEqual(
    hitTesting.screenPointToCanvasPoint!(
      { x: 849, y: 480 },
      { left: 649, top: 80 },
      { x: 100, y: 50, zoom: 2 }
    ),
    { x: 50, y: 175 }
  );
});

test('matches a connection target when the pointer is on a visible port rail', async () => {
  const hitTesting = await loadConnectionHitTesting();
  assert.equal(typeof hitTesting.findConnectionTargetNode, 'function');

  const nodes = [
    { id: 'source', x: 100, y: 100 },
    { id: 'target', x: 500, y: 100 }
  ];

  assert.equal(
    hitTesting.findConnectionTargetNode!(nodes, { x: 488, y: 200 }, 'source')?.id,
    'target'
  );
  assert.equal(
    hitTesting.findConnectionTargetNode!(nodes, { x: 852, y: 200 }, 'source')?.id,
    'target'
  );
  assert.equal(
    hitTesting.findConnectionTargetNode!(nodes, { x: 387, y: 200 }, 'source'),
    undefined
  );
  assert.equal(
    hitTesting.findConnectionTargetNode!(nodes, { x: 200, y: 200 }, 'source'),
    undefined
  );
});

test('uses measured node dimensions when the target is taller than the fallback bounds', async () => {
  const hitTesting = await loadConnectionHitTesting();
  assert.equal(typeof hitTesting.findConnectionTargetNode, 'function');

  const nodes = [
    { id: 'source', x: 100, y: 100 },
    { id: 'target', x: 500, y: 100 }
  ];

  assert.equal(
    hitTesting.findConnectionTargetNode!(
      nodes,
      { x: 520, y: 560 },
      'source',
      { target: { width: 500, height: 500 } }
    )?.id,
    'target'
  );
});

test('keeps a stationary short port interaction as an add-next click', async () => {
  const hitTesting = await loadConnectionHitTesting();
  assert.equal(typeof hitTesting.isConnectionClick, 'function');

  assert.equal(
    hitTesting.isConnectionClick!({ x: 100, y: 200 }, { x: 103, y: 204 }, 150),
    true
  );
  assert.equal(
    hitTesting.isConnectionClick!({ x: 100, y: 200 }, { x: 140, y: 200 }, 150),
    false
  );
  assert.equal(
    hitTesting.isConnectionClick!({ x: 100, y: 200 }, { x: 100, y: 200 }, 250),
    false
  );
});
