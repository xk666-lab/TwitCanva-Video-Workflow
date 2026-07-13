import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { makePublicAssetUrls } from './assetStorage.js';

function makeTempLibrary() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-assets-'));
    const libraryDir = path.join(root, 'library');
    fs.mkdirSync(path.join(libraryDir, 'images'), { recursive: true });
    fs.writeFileSync(path.join(libraryDir, 'images', 'ref.png'), Buffer.from('PNGDATA'));
    return { root, libraryDir };
}

test('uploads local library references to S3-compatible storage and returns public URLs', async () => {
    const { root, libraryDir } = makeTempLibrary();
    const putCalls = [];

    try {
        const urls = await makePublicAssetUrls(['/library/images/ref.png'], {
            libraryDir,
            env: {
                ASSET_STORAGE_DRIVER: 's3',
                ASSET_S3_BUCKET: 'twitcanva-test',
                ASSET_S3_ACCESS_KEY_ID: 'test-access-key',
                ASSET_S3_SECRET_ACCESS_KEY: 'test-secret-key',
                ASSET_S3_PUBLIC_BASE_URL: 'https://cdn.example.com/public',
                ASSET_UPLOAD_PREFIX: 'twitcanva/library'
            },
            putObject: async (object) => {
                putCalls.push(object);
            }
        });

        assert.deepEqual(urls, [
            'https://cdn.example.com/public/twitcanva/library/images/ref.png'
        ]);
        assert.equal(putCalls.length, 1);
        assert.equal(putCalls[0].bucket, 'twitcanva-test');
        assert.equal(putCalls[0].key, 'twitcanva/library/images/ref.png');
        assert.equal(putCalls[0].contentType, 'image/png');
        assert.deepEqual(putCalls[0].body, Buffer.from('PNGDATA'));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('keeps existing public HTTP references without uploading', async () => {
    const putCalls = [];

    const urls = await makePublicAssetUrls(['https://cdn.example.com/already-public.png'], {
        env: {
            ASSET_STORAGE_DRIVER: 's3',
            ASSET_S3_BUCKET: 'twitcanva-test',
            ASSET_S3_PUBLIC_BASE_URL: 'https://cdn.example.com/public'
        },
        putObject: async (object) => {
            putCalls.push(object);
        }
    });

    assert.deepEqual(urls, ['https://cdn.example.com/already-public.png']);
    assert.equal(putCalls.length, 0);
});

test('uploads local library references to Supabase Storage and returns public URLs', async () => {
    const { root, libraryDir } = makeTempLibrary();
    const originalFetch = globalThis.fetch;
    const uploadRequests = [];

    globalThis.fetch = async (url, options = {}) => {
        uploadRequests.push({
            url,
            method: options.method,
            headers: options.headers,
            body: options.body
        });
        return new Response(JSON.stringify({ Key: 'seedance/images/ref.png' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };

    try {
        const urls = await makePublicAssetUrls(['/library/images/ref.png'], {
            libraryDir,
            env: {
                ASSET_STORAGE_DRIVER: 'supabase',
                SUPABASE_URL: 'https://project-ref.supabase.co',
                SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
                SUPABASE_STORAGE_BUCKET: 'twitcanva-assets',
                ASSET_UPLOAD_PREFIX: 'seedance'
            }
        });

        assert.deepEqual(urls, [
            'https://project-ref.supabase.co/storage/v1/object/public/twitcanva-assets/seedance/images/ref.png'
        ]);
        assert.equal(uploadRequests.length, 1);
        assert.equal(uploadRequests[0].url, 'https://project-ref.supabase.co/storage/v1/object/twitcanva-assets/seedance/images/ref.png');
        assert.equal(uploadRequests[0].method, 'POST');
        assert.equal(uploadRequests[0].headers.Authorization, 'Bearer service-role-key');
        assert.equal(uploadRequests[0].headers.apikey, 'service-role-key');
        assert.equal(uploadRequests[0].headers['Content-Type'], 'image/png');
        assert.equal(uploadRequests[0].headers['x-upsert'], 'true');
        assert.deepEqual(uploadRequests[0].body, Buffer.from('PNGDATA'));
    } finally {
        globalThis.fetch = originalFetch;
        fs.rmSync(root, { recursive: true, force: true });
    }
});
