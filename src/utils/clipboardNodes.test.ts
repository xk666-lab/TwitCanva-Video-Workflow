import assert from 'node:assert/strict';
import test from 'node:test';

import type { NodeData } from '../types.ts';
import {
  createPastedNodes,
  getClipboardSourceNodes
} from './clipboardNodes.ts';

function node(id: string, overrides: Partial<NodeData> = {}): NodeData {
  return {
    id,
    type: 'image' as NodeData['type'],
    x: 10,
    y: 20,
    prompt: `Prompt ${id}`,
    status: 'success' as NodeData['status'],
    resultUrl: `/library/images/${id}.png`,
    model: 'gpt-image-2',
    imageModel: 'gpt-image-2',
    aspectRatio: '1024x1024',
    resolution: '4K',
    ...overrides
  };
}

test('copying from a node context menu uses the clicked node when it is not selected', () => {
  const nodes = [node('selected'), node('right-clicked')];
  const copied = getClipboardSourceNodes(nodes, ['selected'], 'right-clicked');

  assert.deepEqual(copied.map(item => item.id), ['right-clicked']);
  copied[0].prompt = 'Mutated copy';
  assert.equal(nodes[1].prompt, 'Prompt right-clicked');
});

test('copying from a selected node context menu keeps the whole multi-selection', () => {
  const nodes = [node('first'), node('second'), node('outside')];
  const copied = getClipboardSourceNodes(nodes, ['first', 'second'], 'second');

  assert.deepEqual(copied.map(item => item.id), ['first', 'second']);
});

test('keyboard copy uses the selected nodes when there is no context source', () => {
  const nodes = [node('first'), node('second')];
  const copied = getClipboardSourceNodes(nodes, ['second']);

  assert.deepEqual(copied.map(item => item.id), ['second']);
});

test('pasting duplicates media nodes with fresh ids and without stale runtime task state', () => {
  const pasted = createPastedNodes([
    node('source', {
      parentIds: ['parent'],
      groupId: 'group-1',
      activeTaskId: 'task-active',
      lastTaskId: 'task-last',
      generationProgress: 42,
      generationProgressMessage: 'Provider task created',
      generationStartTime: 123
    })
  ], {
    offset: 30,
    idFactory: () => 'pasted'
  });

  assert.equal(pasted[0].id, 'pasted');
  assert.equal(pasted[0].x, 40);
  assert.equal(pasted[0].y, 50);
  assert.equal(pasted[0].resultUrl, '/library/images/source.png');
  assert.equal(pasted[0].parentIds, undefined);
  assert.equal(pasted[0].groupId, undefined);
  assert.equal(pasted[0].activeTaskId, undefined);
  assert.equal(pasted[0].lastTaskId, undefined);
  assert.equal(pasted[0].generationProgress, undefined);
  assert.equal(pasted[0].generationProgressMessage, undefined);
  assert.equal(pasted[0].generationStartTime, undefined);
});
