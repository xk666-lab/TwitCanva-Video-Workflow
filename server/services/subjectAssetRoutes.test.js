import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';
import subjectAssetRoutes from '../routes/subject-assets.js';

function createTempLibrary(t) {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-subject-asset-routes-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    return libraryDir;
}

function writeLibraryFile(libraryDir, relativePath, contents = 'image bytes') {
    const filePath = path.join(libraryDir, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    return `/library/${relativePath}`;
}

async function startTestServer(libraryDir) {
    const app = express();
    app.use(express.json({ limit: '32kb' }));
    app.locals.LIBRARY_DIR = libraryDir;
    app.use('/api', subjectAssetRoutes);

    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(resolve => server.close(resolve))
    };
}

async function requestJson(baseUrl, pathname, options = {}) {
    const response = await fetch(`${baseUrl}${pathname}`, options);
    return { response, body: await response.json() };
}

test('subject asset routes create, list, get, and delete isolated assets', async t => {
    const libraryDir = createTempLibrary(t);
    const primarySource = writeLibraryFile(libraryDir, 'images/primary.png', 'primary');
    const referenceSource = writeLibraryFile(libraryDir, 'images/reference.webp', 'reference');
    const genericManifestPath = path.join(libraryDir, 'assets', 'assets.json');
    fs.mkdirSync(path.dirname(genericManifestPath), { recursive: true });
    fs.writeFileSync(genericManifestPath, JSON.stringify([{ id: 'generic-only' }]));
    const genericManifestBefore = fs.readFileSync(genericManifestPath, 'utf8');
    const server = await startTestServer(libraryDir);
    t.after(server.close);

    const created = await requestJson(server.baseUrl, '/api/subject-assets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            name: 'Paper Fox',
            description: 'A compact reusable character reference.',
            sourceUrls: [primarySource, referenceSource]
        })
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.success, true);
    assert.equal(created.body.subjectAsset.name, 'Paper Fox');
    assert.equal(created.body.subjectAsset.referenceImages.length, 2);
    const subjectAsset = created.body.subjectAsset;

    const listed = await requestJson(server.baseUrl, '/api/subject-assets');
    assert.equal(listed.response.status, 200);
    assert.deepEqual(listed.body, [subjectAsset]);

    const fetched = await requestJson(server.baseUrl, `/api/subject-assets/${subjectAsset.id}`);
    assert.equal(fetched.response.status, 200);
    assert.deepEqual(fetched.body, subjectAsset);

    const deleted = await requestJson(server.baseUrl, `/api/subject-assets/${subjectAsset.id}`, { method: 'DELETE' });
    assert.equal(deleted.response.status, 200);
    assert.deepEqual(deleted.body, { success: true });
    assert.equal(fs.readFileSync(genericManifestPath, 'utf8'), genericManifestBefore);

    const missing = await requestJson(server.baseUrl, `/api/subject-assets/${subjectAsset.id}`);
    assert.equal(missing.response.status, 404);
    assert.match(missing.body.error, /not found/i);
});

test('subject asset routes return clear 400 and 404 errors without copying unsafe payloads', async t => {
    const libraryDir = createTempLibrary(t);
    const validImage = writeLibraryFile(libraryDir, 'images/source.png');
    writeLibraryFile(libraryDir, 'videos/source.mp4', 'video bytes');
    const server = await startTestServer(libraryDir);
    t.after(server.close);

    for (const payload of [
        { name: 'Unsafe', sourceUrl: 'data:image/png;base64,c2VjcmV0' },
        { name: 'Unsafe', sourceUrl: 'https://example.test/image.png' },
        { name: 'Unsafe', sourceUrl: '/library/%2e%2e/escape.png' },
        { name: 'Unsafe', sourceUrl: '/library/videos/source.mp4' },
        { name: 'Unsafe', sourceUrl: '/library/images/missing.png' },
        { name: 'Unsafe', sourceUrl: validImage, meta: { authorization: 'do-not-store' } },
        { name: 'Unsafe', sourceUrls: Array.from({ length: 5 }, () => validImage) }
    ]) {
        const result = await requestJson(server.baseUrl, '/api/subject-assets', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
        });
        assert.equal(result.response.status, 400, JSON.stringify(payload));
        assert.equal(typeof result.body.error, 'string');
    }

    const malformedGet = await requestJson(server.baseUrl, '/api/subject-assets/not-a-uuid');
    assert.equal(malformedGet.response.status, 400);
    assert.match(malformedGet.body.error, /invalid subject asset id/i);

    const malformedDelete = await requestJson(server.baseUrl, '/api/subject-assets/not-a-uuid', { method: 'DELETE' });
    assert.equal(malformedDelete.response.status, 400);
    assert.match(malformedDelete.body.error, /invalid subject asset id/i);

    const missingId = '11111111-1111-4111-8111-111111111111';
    const missingGet = await requestJson(server.baseUrl, `/api/subject-assets/${missingId}`);
    assert.equal(missingGet.response.status, 404);
    assert.match(missingGet.body.error, /not found/i);

    const missingDelete = await requestJson(server.baseUrl, `/api/subject-assets/${missingId}`, { method: 'DELETE' });
    assert.equal(missingDelete.response.status, 404);
    assert.match(missingDelete.body.error, /not found/i);

    const subjectAssetsDir = path.join(libraryDir, 'subject-assets');
    assert.equal(fs.existsSync(subjectAssetsDir), false);
});
