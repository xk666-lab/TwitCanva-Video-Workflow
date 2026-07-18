import test from 'node:test';
import assert from 'node:assert/strict';

import type { MediaTake, NodeData, NodeStatus, NodeType } from '../types.ts';
import {
  appendHeroTake,
  buildGenerationSuccessUpdate,
  deleteTake,
  getHeroTake,
  normalizeLegacyNodeTakes,
  selectHeroTake
} from './takeHelpers.ts';

function imageNode(overrides: Partial<NodeData> = {}): NodeData {
  return {
    id: 'node-1',
    type: '图片' as NodeType,
    x: 0,
    y: 0,
    prompt: 'legacy prompt',
    status: 'success' as NodeStatus,
    resultUrl: '/library/images/legacy.png',
    model: 'gpt-image-2',
    imageModel: 'gpt-image-2',
    aspectRatio: '16:9',
    resolution: '1K',
    ...overrides
  };
}

test('normalizeLegacyNodeTakes exposes old resultUrl as the hero take', () => {
  const normalized = normalizeLegacyNodeTakes(imageNode());
  const hero = getHeroTake(normalized);

  assert.equal(normalized.heroTakeId, 'legacy-node-1');
  assert.equal(normalized.takes?.length, 1);
  assert.equal(hero?.url, '/library/images/legacy.png');
  assert.equal(hero?.type, 'image');
  assert.equal(hero?.isHero, true);
  assert.equal(normalized.resultUrl, '/library/images/legacy.png');
});

test('buildGenerationSuccessUpdate clears loading metadata and applies hero take invariants', () => {
  const loadingNode = imageNode({
    status: 'loading' as NodeStatus,
    generationProgress: 42,
    generationProgressMessage: 'Provider task created',
    generationStartTime: 1783910000000
  });
  const nextTake: MediaTake = {
    id: 'take-next',
    nodeId: 'node-1',
    type: 'image',
    url: '/library/images/next.png',
    prompt: 'next prompt',
    model: 'gpt-image-2',
    createdAt: '2026-07-13T00:00:00.000Z',
    isHero: true
  };

  const updates = buildGenerationSuccessUpdate(loadingNode, { resultUrl: nextTake.url, take: nextTake });

  assert.equal(updates.status, 'success');
  assert.equal(updates.resultUrl, '/library/images/next.png');
  assert.equal(updates.heroTakeId, 'take-next');
  assert.equal(updates.generationProgress, undefined);
  assert.equal(updates.generationProgressMessage, undefined);
  assert.equal(updates.generationStartTime, undefined);
  assert.equal(updates.errorMessage, undefined);
  assert.deepEqual(updates.takes?.map(take => take.isHero), [false, true]);
});

test('appendHeroTake appends a new take and keeps resultUrl pointed at the hero', () => {
  const legacy = normalizeLegacyNodeTakes(imageNode());
  const nextTake: MediaTake = {
    id: 'take-new',
    nodeId: 'node-1',
    type: 'image',
    url: '/library/images/new.png',
    prompt: 'new prompt',
    model: 'gpt-image-2',
    createdAt: '2026-07-13T00:00:00.000Z',
    isHero: true
  };

  const updated = appendHeroTake(legacy, nextTake);
  const hero = getHeroTake(updated);

  assert.equal(updated.heroTakeId, 'take-new');
  assert.equal(updated.resultUrl, '/library/images/new.png');
  assert.equal(hero?.url, '/library/images/new.png');
  assert.equal(updated.takes?.length, 2);
  assert.deepEqual(updated.takes?.map(take => take.isHero), [false, true]);
});

test('buildGenerationSuccessUpdate appends multiple image takes as selectable candidates', () => {
  const loadingNode = imageNode({
    status: 'loading' as NodeStatus,
    resultUrl: undefined
  });
  const takes: MediaTake[] = [1, 2, 3, 4].map(index => ({
    id: `take-${index}`,
    nodeId: 'node-1',
    type: 'image',
    url: `/library/images/${index}.png`,
    prompt: `candidate ${index}`,
    model: 'gpt-image-2',
    createdAt: `2026-07-13T00:00:0${index}.000Z`,
    isHero: index === 1
  }));

  const updates = buildGenerationSuccessUpdate(loadingNode, {
    resultUrl: takes[0].url,
    take: takes[0],
    takes
  });

  assert.equal(updates.status, 'success');
  assert.equal(updates.resultUrl, '/library/images/1.png');
  assert.equal(updates.heroTakeId, 'take-1');
  assert.equal(updates.takes?.length, 4);
  assert.deepEqual(updates.takes?.map(take => take.isHero), [true, false, false, false]);
});

test('selectHeroTake and deleteTake keep legacy resultUrl synchronized with candidates', () => {
  const node = buildGenerationSuccessUpdate(imageNode({ resultUrl: undefined }), {
    resultUrl: '/library/images/1.png',
    takes: [1, 2, 3].map(index => ({
      id: `take-${index}`,
      nodeId: 'node-1',
      type: 'image',
      url: `/library/images/${index}.png`,
      prompt: `candidate ${index}`,
      model: 'gpt-image-2',
      createdAt: `2026-07-13T00:00:0${index}.000Z`,
      isHero: index === 1
    }))
  }) as NodeData;

  const selected = selectHeroTake({ ...imageNode({ resultUrl: undefined }), ...node }, 'take-2');
  assert.equal(selected.resultUrl, '/library/images/2.png');
  assert.equal(selected.heroTakeId, 'take-2');
  assert.deepEqual(selected.takes?.map(take => take.isHero), [false, true, false]);

  const deleted = deleteTake(selected, 'take-2');
  assert.equal(deleted.resultUrl, '/library/images/3.png');
  assert.equal(deleted.heroTakeId, 'take-3');
  assert.deepEqual(deleted.takes?.map(take => take.id), ['take-1', 'take-3']);
  assert.deepEqual(deleted.takes?.map(take => take.isHero), [false, true]);
});
