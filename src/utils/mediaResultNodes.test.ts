import assert from 'node:assert/strict';
import test from 'node:test';

import type { MediaTake, NodeData } from '../types.ts';
import {
  applyMediaResultToCanvasNodes,
  buildPrimaryMediaResultUpdate
} from './mediaResultNodes.ts';

function imageNode(overrides: Partial<NodeData> = {}): NodeData {
  return {
    id: 'image-1',
    type: 'image' as NodeData['type'],
    x: 100,
    y: 200,
    prompt: 'A glass flower in a quiet room',
    status: 'loading' as NodeData['status'],
    model: 'gpt-image-2',
    imageModel: 'gpt-image-2',
    imageCount: 4,
    aspectRatio: '1:1',
    resolution: '2K',
    activeTaskId: 'task-1',
    parentIds: ['prompt-1'],
    groupId: 'group-1',
    generationProgress: 72,
    generationProgressMessage: 'Rendering images',
    generationStartTime: 1784250000000,
    ...overrides
  };
}

function imageTake(index: number, overrides: Partial<MediaTake> = {}): MediaTake {
  return {
    id: `take-${index}`,
    nodeId: 'image-1',
    type: 'image',
    url: `/library/images/${index}.png`,
    prompt: `candidate ${index}`,
    model: 'gpt-image-2',
    createdAt: `2026-07-17T00:00:0${index}.000Z`,
    isHero: index === 1,
    ...overrides
  };
}

test('primary media result update keeps only the selected image take on the source node', () => {
  const takes = [1, 2, 3, 4].map(index => imageTake(index));
  const update = buildPrimaryMediaResultUpdate(imageNode(), {
    resultUrl: '/library/images/1.png',
    take: takes[0],
    takes
  }, {
    clearActiveTask: true,
    lastTaskId: 'task-1'
  });

  assert.equal(update.status, 'success');
  assert.equal(update.resultUrl, '/library/images/1.png');
  assert.equal(update.activeTaskId, undefined);
  assert.equal(update.lastTaskId, 'task-1');
  assert.deepEqual(update.takes?.map(take => take.url), ['/library/images/1.png']);
});

test('multi-image generation results expand into sibling canvas image nodes', () => {
  const takes = [1, 2, 3, 4].map(index => imageTake(index));
  let id = 0;
  const result = applyMediaResultToCanvasNodes([imageNode()], 'image-1', {
    resultUrl: '/library/images/1.png',
    take: takes[0],
    takes
  }, {
    expectedActiveTaskId: 'task-1',
    lastTaskId: 'task-1',
    extraUpdates: { resultAspectRatio: '1024/1024' },
    idFactory: () => `generated-${++id}`
  });

  assert.equal(result.applied, true);
  assert.deepEqual(result.addedNodeIds, ['generated-1', 'generated-2', 'generated-3']);
  assert.equal(result.nodes.length, 4);

  assert.equal(result.nodes[0].id, 'image-1');
  assert.equal(result.nodes[0].resultUrl, '/library/images/1.png');
  assert.equal(result.nodes[0].takes?.length, 1);
  assert.equal(result.nodes[0].activeTaskId, undefined);

  const generatedNodes = result.nodes.slice(1);
  assert.deepEqual(generatedNodes.map(node => node.resultUrl), [
    '/library/images/2.png',
    '/library/images/3.png',
    '/library/images/4.png'
  ]);
  assert.deepEqual(generatedNodes.map(node => [node.x, node.y]), [
    [505, 200],
    [100, 620],
    [505, 620]
  ]);
  assert.deepEqual(generatedNodes.map(node => node.takes?.length), [1, 1, 1]);
  assert.deepEqual(generatedNodes.map(node => node.imageCount), [1, 1, 1]);
  assert.deepEqual(generatedNodes.map(node => node.parentIds), [[], [], []]);
  assert.deepEqual(generatedNodes.map(node => node.groupId), [undefined, undefined, undefined]);
  assert.deepEqual(generatedNodes.map(node => node.activeTaskId), [undefined, undefined, undefined]);
  assert.deepEqual(generatedNodes.map(node => node.lastTaskId), ['task-1', 'task-1', 'task-1']);
});

test('stale media task results do not mutate the canvas', () => {
  const source = imageNode({ activeTaskId: 'newer-task' });
  const originalNodes = [source];
  const result = applyMediaResultToCanvasNodes(originalNodes, 'image-1', {
    resultUrl: '/library/images/1.png',
    take: imageTake(1)
  }, {
    expectedActiveTaskId: 'task-1',
    lastTaskId: 'task-1'
  });

  assert.equal(result.applied, false);
  assert.equal(result.nodes, originalNodes);
  assert.deepEqual(result.nodes, [source]);
});
