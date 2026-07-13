import test from 'node:test';
import assert from 'node:assert/strict';

import { getStoryboardVideoReadiness } from './storyboardFlow.ts';

test('getStoryboardVideoReadiness waits until grouped image scenes have finished', () => {
  const result = getStoryboardVideoReadiness([
    { id: 'scene-1', type: '图片', groupId: 'story-1', status: 'success', resultUrl: '/library/images/1.png' },
    { id: 'scene-2', type: '图片', groupId: 'story-1', status: 'loading' },
    { id: 'scene-3', type: '视频', groupId: 'story-1', status: 'success', resultUrl: '/library/videos/1.mp4' }
  ], 'story-1');

  assert.deepEqual(result, {
    isComplete: false,
    readyNodeIds: ['scene-1']
  });
});

test('getStoryboardVideoReadiness completes with successful image scenes and ignores failed scenes', () => {
  const result = getStoryboardVideoReadiness([
    { id: 'scene-1', type: '图片', groupId: 'story-1', status: 'success', resultUrl: '/library/images/1.png' },
    { id: 'scene-2', type: '图片', groupId: 'story-1', status: 'error' },
    { id: 'scene-3', type: '图片', groupId: 'other', status: 'success', resultUrl: '/library/images/3.png' }
  ], 'story-1');

  assert.deepEqual(result, {
    isComplete: true,
    readyNodeIds: ['scene-1']
  });
});
