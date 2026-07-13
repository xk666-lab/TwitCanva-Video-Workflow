import test from 'node:test';
import assert from 'node:assert/strict';

import { createMediaTake } from './takeMetadata.js';

test('createMediaTake returns image take metadata that preserves legacy resultUrl fields', () => {
    const take = createMediaTake({
        nodeId: 'node-1',
        type: 'image',
        url: '/library/images/img_1.png',
        prompt: 'cinematic frame',
        model: 'gpt-image-2',
        createdAt: '2026-07-13T00:00:00.000Z',
        metadata: {
            filename: 'img_1.png'
        }
    });

    assert.equal(take.nodeId, 'node-1');
    assert.equal(take.type, 'image');
    assert.equal(take.url, '/library/images/img_1.png');
    assert.equal(take.prompt, 'cinematic frame');
    assert.equal(take.model, 'gpt-image-2');
    assert.equal(take.createdAt, '2026-07-13T00:00:00.000Z');
    assert.equal(take.isHero, true);
    assert.equal(take.metadata.filename, 'img_1.png');
    assert.match(take.id, /^take_/);
});

test('createMediaTake creates unique ids when called repeatedly', () => {
    const first = createMediaTake({
        nodeId: 'node-1',
        type: 'video',
        url: '/library/videos/vid_1.mp4',
        prompt: 'slow dolly',
        model: 'veo-3.1'
    });
    const second = createMediaTake({
        nodeId: 'node-1',
        type: 'video',
        url: '/library/videos/vid_2.mp4',
        prompt: 'slow dolly',
        model: 'veo-3.1'
    });

    assert.notEqual(first.id, second.id);
    assert.equal(first.type, 'video');
    assert.equal(second.type, 'video');
});
