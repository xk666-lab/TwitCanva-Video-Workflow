import test from 'node:test';
import assert from 'node:assert/strict';

import { isSeedanceVideoModel } from './videoModelRouting.ts';

test('isSeedanceVideoModel accepts exact bytedance Seedance ids and legacy aliases', () => {
  assert.equal(isSeedanceVideoModel('bytedance/seedance-2.0/text-to-video'), true);
  assert.equal(isSeedanceVideoModel('bytedance/seedance-2.0/image-to-video'), true);
  assert.equal(isSeedanceVideoModel('seedance-2.0'), true);
  assert.equal(isSeedanceVideoModel('kling-v2-1'), false);
});
