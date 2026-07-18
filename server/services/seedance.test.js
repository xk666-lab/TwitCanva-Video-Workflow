import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { generateSeedanceVideo } from './seedance.js';

function makeTempLibrary() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedance-assets-'));
    const libraryDir = path.join(root, 'library');
    fs.mkdirSync(path.join(libraryDir, 'images'), { recursive: true });
    fs.writeFileSync(path.join(libraryDir, 'images', 'reference.png'), Buffer.from('PNGDATA'));
    return { root, libraryDir };
}

test('converts absolute localhost library image URLs to the configured public asset base', async () => {
    const originalFetch = globalThis.fetch;
    const originalPublicBase = process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL;
    let submittedBody;

    process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL = 'https://assets.example.com';
    globalThis.fetch = async (_url, options) => {
        submittedBody = JSON.parse(options.body);
        return new Response(JSON.stringify({ video_url: 'https://cdn.example.com/result.mp4' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };

    try {
        const result = await generateSeedanceVideo({
            prompt: 'A short camera move',
            imageBase64: 'data:image/png;base64,AAAA',
            imageReference: 'http://localhost:3001/library/images/reference.png',
            modelId: 'seedance-2.0',
            resolution: '720p',
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com'
        });

        assert.equal(result, 'https://cdn.example.com/result.mp4');
        assert.deepEqual(submittedBody.images, [
            'https://assets.example.com/library/images/reference.png'
        ]);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalPublicBase === undefined) {
            delete process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL;
        } else {
            process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL = originalPublicBase;
        }
    }
});

test('uploads local image references to object storage before submitting Seedance job', async () => {
    const originalFetch = globalThis.fetch;
    const originalPublicBase = process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL;
    const { root, libraryDir } = makeTempLibrary();
    const putCalls = [];
    let submittedBody;

    delete process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL;
    globalThis.fetch = async (_url, options) => {
        submittedBody = JSON.parse(options.body);
        return new Response(JSON.stringify({ video_url: 'https://cdn.example.com/result.mp4' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };

    try {
        const result = await generateSeedanceVideo({
            prompt: 'A short camera move',
            imageBase64: 'data:image/png;base64,AAAA',
            imageReference: '/library/images/reference.png',
            modelId: 'seedance-2.0',
            resolution: '720p',
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com',
            assetStorage: {
                libraryDir,
                env: {
                    ASSET_STORAGE_DRIVER: 's3',
                    ASSET_S3_BUCKET: 'twitcanva-test',
                    ASSET_S3_ACCESS_KEY_ID: 'test-access-key',
                    ASSET_S3_SECRET_ACCESS_KEY: 'test-secret-key',
                    ASSET_S3_PUBLIC_BASE_URL: 'https://public.example.com',
                    ASSET_UPLOAD_PREFIX: 'seedance'
                },
                putObject: async (object) => {
                    putCalls.push(object);
                }
            }
        });

        assert.equal(result, 'https://cdn.example.com/result.mp4');
        assert.deepEqual(submittedBody.images, [
            'https://public.example.com/seedance/images/reference.png'
        ]);
        assert.deepEqual(submittedBody.metadata.reference_images, submittedBody.images);
        assert.equal(putCalls.length, 1);
        assert.equal(putCalls[0].key, 'seedance/images/reference.png');
    } finally {
        globalThis.fetch = originalFetch;
        fs.rmSync(root, { recursive: true, force: true });
        if (originalPublicBase === undefined) {
            delete process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL;
        } else {
            process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL = originalPublicBase;
        }
    }
});

test('keeps polling after a transient status network failure', async () => {
    const originalFetch = globalThis.fetch;
    const originalInterval = process.env.SEEDANCE_POLL_INTERVAL_MS;
    const originalTimeout = process.env.SEEDANCE_POLL_TIMEOUT_MS;
    let requestCount = 0;

    process.env.SEEDANCE_POLL_INTERVAL_MS = '0';
    process.env.SEEDANCE_POLL_TIMEOUT_MS = '1000';
    globalThis.fetch = async (_url, options = {}) => {
        requestCount += 1;
        if (options.method === 'POST') {
            return new Response(JSON.stringify({ task_id: 'task-123' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (requestCount === 2) {
            const error = new TypeError('fetch failed');
            error.cause = { code: 'ECONNRESET' };
            throw error;
        }
        return new Response(JSON.stringify({
            status: 'SUCCESS',
            video_url: 'https://cdn.example.com/recovered.mp4'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };

    try {
        const result = await generateSeedanceVideo({
            prompt: 'A short camera move',
            modelId: 'seedance-2.0',
            resolution: '720p',
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com'
        });

        assert.equal(result, 'https://cdn.example.com/recovered.mp4');
        assert.equal(requestCount, 3);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalInterval === undefined) delete process.env.SEEDANCE_POLL_INTERVAL_MS;
        else process.env.SEEDANCE_POLL_INTERVAL_MS = originalInterval;
        if (originalTimeout === undefined) delete process.env.SEEDANCE_POLL_TIMEOUT_MS;
        else process.env.SEEDANCE_POLL_TIMEOUT_MS = originalTimeout;
    }
});

test('reports provider task progress while polling Seedance', async () => {
    const originalFetch = globalThis.fetch;
    const originalInterval = process.env.SEEDANCE_POLL_INTERVAL_MS;
    const originalTimeout = process.env.SEEDANCE_POLL_TIMEOUT_MS;
    const progressEvents = [];
    let statusCalls = 0;

    process.env.SEEDANCE_POLL_INTERVAL_MS = '0';
    process.env.SEEDANCE_POLL_TIMEOUT_MS = '1000';
    globalThis.fetch = async (_url, options = {}) => {
        if (options.method === 'POST') {
            return new Response(JSON.stringify({ task_id: 'task-progress' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        statusCalls += 1;
        if (statusCalls === 1) {
            return new Response(JSON.stringify({ status: 'RUNNING' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({
            status: 'SUCCESS',
            video_url: 'https://cdn.example.com/progress-result.mp4'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };

    try {
        const result = await generateSeedanceVideo({
            prompt: 'A short camera move',
            modelId: 'seedance-2.0',
            resolution: '720p',
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com',
            onProgress: update => progressEvents.push(update)
        });

        assert.equal(result, 'https://cdn.example.com/progress-result.mp4');
        assert.deepEqual(progressEvents[0], {
            providerTaskId: 'task-progress',
            progress: 5,
            progressMessage: 'Provider task created'
        });
        assert.equal(progressEvents.some(update => update.providerTaskId === 'task-progress' && update.progressMessage === 'RUNNING'), true);
        assert.equal(progressEvents.at(-1).progress, 95);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalInterval === undefined) delete process.env.SEEDANCE_POLL_INTERVAL_MS;
        else process.env.SEEDANCE_POLL_INTERVAL_MS = originalInterval;
        if (originalTimeout === undefined) delete process.env.SEEDANCE_POLL_TIMEOUT_MS;
        else process.env.SEEDANCE_POLL_TIMEOUT_MS = originalTimeout;
    }
});

test('keeps polling after a temporary provider 502 response', async () => {
    const originalFetch = globalThis.fetch;
    const originalInterval = process.env.SEEDANCE_POLL_INTERVAL_MS;
    const originalTimeout = process.env.SEEDANCE_POLL_TIMEOUT_MS;
    let requestCount = 0;

    process.env.SEEDANCE_POLL_INTERVAL_MS = '0';
    process.env.SEEDANCE_POLL_TIMEOUT_MS = '1000';
    globalThis.fetch = async (_url, options = {}) => {
        requestCount += 1;
        if (options.method === 'POST') {
            return new Response(JSON.stringify({ task_id: 'task-502' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        if (requestCount === 2) {
            return new Response(JSON.stringify({ error: 'temporary upstream failure' }), {
                status: 502,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        return new Response(JSON.stringify({
            status: 'SUCCESS',
            video_url: 'https://cdn.example.com/recovered-from-502.mp4'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };

    try {
        const result = await generateSeedanceVideo({
            prompt: 'A short camera move',
            modelId: 'seedance-2.0',
            resolution: '720p',
            apiKey: 'test-key',
            baseUrl: 'https://api.example.com'
        });

        assert.equal(result, 'https://cdn.example.com/recovered-from-502.mp4');
        assert.equal(requestCount, 3);
    } finally {
        globalThis.fetch = originalFetch;
        if (originalInterval === undefined) delete process.env.SEEDANCE_POLL_INTERVAL_MS;
        else process.env.SEEDANCE_POLL_INTERVAL_MS = originalInterval;
        if (originalTimeout === undefined) delete process.env.SEEDANCE_POLL_TIMEOUT_MS;
        else process.env.SEEDANCE_POLL_TIMEOUT_MS = originalTimeout;
    }
});
