import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';
import assetRoutes from '../routes/assets.js';

async function startAssetServer() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-audio-assets-'));
    const libraryDir = path.join(root, 'library');
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.locals.IMAGES_DIR = path.join(libraryDir, 'images');
    app.locals.VIDEOS_DIR = path.join(libraryDir, 'videos');
    app.locals.AUDIO_DIR = path.join(libraryDir, 'audio');
    for (const directory of [app.locals.IMAGES_DIR, app.locals.VIDEOS_DIR, app.locals.AUDIO_DIR]) {
        fs.mkdirSync(directory, { recursive: true });
    }
    app.use('/api', assetRoutes);

    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        libraryDir,
        close: async () => {
            await new Promise(resolve => server.close(resolve));
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
}

test('audio assets are stored with a safe MIME-derived extension and full lifecycle metadata', async t => {
    const server = await startAssetServer();
    t.after(server.close);
    const bytes = Buffer.from('ID3-audio-data');

    const createResponse = await fetch(`${server.baseUrl}/api/assets/audio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            data: `data:audio/mpeg;base64,${bytes.toString('base64')}`,
            prompt: 'voice-over.mp3'
        })
    });

    assert.equal(createResponse.status, 200);
    const created = await createResponse.json();
    assert.match(created.url, /^\/library\/audio\/[a-f0-9-]+\.mp3$/);
    const filename = created.url.split('/').at(-1);
    assert.deepEqual(fs.readFileSync(path.join(server.libraryDir, 'audio', filename)), bytes);

    const listResponse = await fetch(`${server.baseUrl}/api/assets/audio`);
    assert.equal(listResponse.status, 200);
    const assets = await listResponse.json();
    assert.equal(assets.length, 1);
    assert.equal(assets[0].type, 'audio');
    assert.equal(assets[0].url, created.url);

    const deleteResponse = await fetch(`${server.baseUrl}/api/assets/audio/${created.id}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    assert.equal(fs.existsSync(path.join(server.libraryDir, 'audio', filename)), false);
});

test('audio assets reject unsupported MIME types instead of accepting arbitrary data URLs', async t => {
    const server = await startAssetServer();
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/assets/audio`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: 'data:audio/x-unsafe;base64,QUJD' })
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /unsupported audio mime/i);
});
