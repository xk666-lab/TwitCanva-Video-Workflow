import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    MAX_SUBJECT_REFERENCE_IMAGES,
    SubjectAssetStorageError,
    SubjectAssetValidationError,
    createSubjectAssetService
} from './subjectAssets.js';

function createTempLibrary(t) {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-subject-assets-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    return libraryDir;
}

function writeLibraryFile(libraryDir, relativePath, contents = 'image bytes') {
    const filePath = path.join(libraryDir, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
    return `/library/${relativePath}`;
}

function subjectAssetFiles(libraryDir) {
    const subjectAssetsDir = path.join(libraryDir, 'subject-assets');
    return fs.existsSync(subjectAssetsDir) ? fs.readdirSync(subjectAssetsDir).sort() : [];
}

test('subject assets copy local images into owned storage with compact atomic records', t => {
    const libraryDir = createTempLibrary(t);
    const primarySource = writeLibraryFile(libraryDir, 'images/original.png', 'primary image');
    const referenceSource = writeLibraryFile(libraryDir, 'images/profile.jpg', 'reference image');
    const genericManifestPath = path.join(libraryDir, 'assets', 'assets.json');
    fs.mkdirSync(path.dirname(genericManifestPath), { recursive: true });
    fs.writeFileSync(genericManifestPath, JSON.stringify([{ id: 'generic-asset', name: 'Keep me' }]));
    const genericManifestBefore = fs.readFileSync(genericManifestPath, 'utf8');
    const service = createSubjectAssetService({ libraryDir });

    const subjectAsset = service.create({
        name: 'Paper Fox',
        description: 'A rust-colored fox with a folded-paper tail.',
        sourceUrls: [primarySource, referenceSource]
    });

    assert.deepEqual(Object.keys(subjectAsset).sort(), [
        'createdAt',
        'description',
        'id',
        'name',
        'referenceImages',
        'schemaVersion',
        'type',
        'updatedAt',
        'url'
    ]);
    assert.equal(subjectAsset.schemaVersion, 1);
    assert.match(subjectAsset.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    assert.equal(subjectAsset.name, 'Paper Fox');
    assert.equal(subjectAsset.description, 'A rust-colored fox with a folded-paper tail.');
    assert.equal(subjectAsset.type, 'image');
    assert.equal(subjectAsset.url, subjectAsset.referenceImages[0]);
    assert.equal(subjectAsset.referenceImages.length, 2);
    assert.match(subjectAsset.referenceImages[0], /^\/library\/subject-assets\/[0-9a-f-]{36}\.png$/i);
    assert.match(subjectAsset.referenceImages[1], /^\/library\/subject-assets\/[0-9a-f-]{36}\.jpg$/i);
    assert.equal(subjectAsset.createdAt, subjectAsset.updatedAt);

    const primaryCopyPath = path.join(libraryDir, ...subjectAsset.referenceImages[0].replace('/library/', '').split('/'));
    const referenceCopyPath = path.join(libraryDir, ...subjectAsset.referenceImages[1].replace('/library/', '').split('/'));
    assert.equal(fs.readFileSync(primaryCopyPath, 'utf8'), 'primary image');
    assert.equal(fs.readFileSync(referenceCopyPath, 'utf8'), 'reference image');
    assert.equal(fs.existsSync(path.join(libraryDir, 'subject-assets', `${subjectAsset.id}.json`)), true);
    assert.equal(subjectAssetFiles(libraryDir).some(file => file.endsWith('.tmp')), false);
    assert.equal(fs.readFileSync(genericManifestPath, 'utf8'), genericManifestBefore);

    fs.unlinkSync(path.join(libraryDir, 'images', 'original.png'));
    fs.unlinkSync(path.join(libraryDir, 'images', 'profile.jpg'));
    assert.equal(fs.readFileSync(primaryCopyPath, 'utf8'), 'primary image');
    assert.equal(fs.readFileSync(referenceCopyPath, 'utf8'), 'reference image');
});

test('subject assets list, get, and delete owned records without deleting generic assets', t => {
    const libraryDir = createTempLibrary(t);
    const sourceUrl = writeLibraryFile(libraryDir, 'images/subject.webp', 'owned subject image');
    const genericManifestPath = path.join(libraryDir, 'assets', 'assets.json');
    fs.mkdirSync(path.dirname(genericManifestPath), { recursive: true });
    fs.writeFileSync(genericManifestPath, JSON.stringify([{ id: 'generic-asset' }]));
    const service = createSubjectAssetService({ libraryDir });
    const subjectAsset = service.create({ name: 'Library Subject', sourceUrl });
    const copiedPath = path.join(libraryDir, ...subjectAsset.url.replace('/library/', '').split('/'));

    assert.deepEqual(service.list(), [subjectAsset]);
    assert.deepEqual(service.get(subjectAsset.id), subjectAsset);
    assert.equal(service.remove(subjectAsset.id), true);
    assert.deepEqual(service.list(), []);
    assert.equal(service.get(subjectAsset.id), null);
    assert.equal(fs.existsSync(path.join(libraryDir, 'subject-assets', `${subjectAsset.id}.json`)), false);
    assert.equal(fs.existsSync(copiedPath), false);
    assert.equal(fs.existsSync(genericManifestPath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(genericManifestPath, 'utf8')), [{ id: 'generic-asset' }]);
});

test('subject assets reject unsafe sources, oversized input, and malformed ids', t => {
    const libraryDir = createTempLibrary(t);
    const validImage = writeLibraryFile(libraryDir, 'images/source.png');
    writeLibraryFile(libraryDir, 'videos/source.mp4', 'video bytes');
    const outsidePath = path.join(path.dirname(libraryDir), 'subject-assets-outside.png');
    fs.writeFileSync(outsidePath, 'outside image');
    t.after(() => fs.rmSync(outsidePath, { force: true }));
    const service = createSubjectAssetService({ libraryDir });

    for (const sourceUrl of [
        'data:image/png;base64,c2VjcmV0',
        'https://example.test/image.png',
        'http://localhost:3001/library/images/source.png',
        '/library/../subject-assets-outside.png',
        '/library/%2e%2e/subject-assets-outside.png',
        '/library/%252e%252e%252fsubject-assets-outside.png',
        '/library/videos/source.mp4',
        '/library/images/missing.png'
    ]) {
        assert.throws(
            () => service.create({ name: 'Unsafe', sourceUrl }),
            SubjectAssetValidationError,
            sourceUrl
        );
    }

    assert.throws(
        () => service.create({ name: 'Unsafe', sourceUrl: validImage, meta: { apiKey: 'do-not-store' } }),
        SubjectAssetValidationError
    );
    assert.throws(
        () => service.create({ name: 'Unsafe', sourceUrl: validImage, description: 'x'.repeat(501) }),
        SubjectAssetValidationError
    );
    assert.throws(
        () => service.create({
            name: 'Unsafe',
            sourceUrls: Array.from({ length: MAX_SUBJECT_REFERENCE_IMAGES + 1 }, () => validImage)
        }),
        SubjectAssetValidationError
    );
    assert.throws(() => service.get('not-a-uuid'), SubjectAssetValidationError);
    assert.throws(() => service.remove('../escape'), SubjectAssetValidationError);
    assert.deepEqual(subjectAssetFiles(libraryDir), []);
});

test('subject asset creation removes copied media when publishing its record fails', t => {
    const libraryDir = createTempLibrary(t);
    const sourceUrl = writeLibraryFile(libraryDir, 'images/source.png', 'source bytes');
    const service = createSubjectAssetService({
        libraryDir,
        writeRecord() {
            throw new Error('simulated record write failure');
        }
    });

    assert.throws(() => service.create({ name: 'Will not publish', sourceUrl }), /simulated record write failure/);
    assert.deepEqual(subjectAssetFiles(libraryDir), []);
});

test('subject asset deletion unpublishes its record before a media cleanup failure', t => {
    const libraryDir = createTempLibrary(t);
    const sourceUrl = writeLibraryFile(libraryDir, 'images/source.png', 'source bytes');
    const created = createSubjectAssetService({ libraryDir }).create({ name: 'Delete ordering', sourceUrl });
    const recordPath = path.join(libraryDir, 'subject-assets', `${created.id}.json`);
    const service = createSubjectAssetService({
        libraryDir,
        unlinkFile(filePath) {
            if (filePath.endsWith('.png')) {
                assert.equal(fs.existsSync(recordPath), false);
                throw new Error('simulated media cleanup failure');
            }
            fs.unlinkSync(filePath);
        }
    });

    assert.throws(() => service.remove(created.id), SubjectAssetStorageError);
    assert.equal(fs.existsSync(recordPath), false);
    assert.equal(service.get(created.id), null);
});
