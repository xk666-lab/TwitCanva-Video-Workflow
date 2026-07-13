import test from 'node:test';
import assert from 'node:assert/strict';

import { createStoryboardImageNode } from './storyboardNodeFactory.ts';

test('storyboard image nodes inherit registry defaults and preserve storyboard overrides', () => {
  const node = createStoryboardImageNode({
    id: 'scene-1',
    x: 120,
    y: 240,
    prompt: 'Extract panel #1',
    title: 'Scene 1',
    groupId: 'storyboard-1',
    characterReferenceUrls: ['/library/images/composite.png'],
    imageModel: 'gemini-3-pro-image-preview'
  });

  assert.equal(node.type, '图片');
  assert.equal(node.status, 'idle');
  assert.equal(node.model, 'gemini-3-pro-image-preview');
  assert.equal(node.imageModel, 'gemini-3-pro-image-preview');
  assert.equal(node.aspectRatio, '16:9');
  assert.equal(node.resolution, '1K');
  assert.deepEqual(node.parentIds, []);
  assert.equal(node.groupId, 'storyboard-1');
  assert.deepEqual(node.characterReferenceUrls, ['/library/images/composite.png']);
});
