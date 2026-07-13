import test from 'node:test';
import assert from 'node:assert/strict';

import { isSeedanceVideoModel } from './videoModelRouting.js';

test('isSeedanceVideoModel accepts exact bytedance Seedance model ids', () => {
    assert.equal(isSeedanceVideoModel('bytedance/seedance-2.0/text-to-video'), true);
    assert.equal(isSeedanceVideoModel('bytedance/seedance-2.0/image-to-video'), true);
});

test('isSeedanceVideoModel keeps legacy frontend aliases compatible', () => {
    assert.equal(isSeedanceVideoModel('seedance-2.0'), true);
    assert.equal(isSeedanceVideoModel('veo-3.1-fast-generate-preview'), false);
});
