import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveImageToBase64 } from '../utils/imageHelpers.js';

test('resolveImageToBase64 resolves owned subject media but contains raw and encoded traversal', t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-image-helper-library-'));
    const parentDir = path.dirname(libraryDir);
    const outsidePath = path.join(parentDir, 'twitcanva-image-helper-outside.png');
    const previousLibraryDir = process.env.LIBRARY_DIR;
    const subjectFilename = '11111111-1111-4111-8111-111111111111.png';
    const subjectPath = path.join(libraryDir, 'subject-assets', subjectFilename);
    fs.mkdirSync(path.dirname(subjectPath), { recursive: true });
    fs.writeFileSync(subjectPath, 'owned subject image');
    fs.writeFileSync(outsidePath, 'outside image');
    process.env.LIBRARY_DIR = libraryDir;
    t.after(() => {
        if (previousLibraryDir === undefined) delete process.env.LIBRARY_DIR;
        else process.env.LIBRARY_DIR = previousLibraryDir;
        fs.rmSync(libraryDir, { recursive: true, force: true });
        fs.rmSync(outsidePath, { force: true });
    });

    const expected = `data:image/png;base64,${Buffer.from('owned subject image').toString('base64')}`;
    assert.equal(resolveImageToBase64(`/library/subject-assets/${subjectFilename}?cache=1`), expected);
    assert.equal(resolveImageToBase64('/library/../twitcanva-image-helper-outside.png'), null);
    assert.equal(resolveImageToBase64('/library/%2e%2e/twitcanva-image-helper-outside.png'), null);
    assert.equal(resolveImageToBase64('/library/%252e%252e%252ftwitcanva-image-helper-outside.png'), null);
    assert.equal(resolveImageToBase64('http://localhost:3001/library/%2e%2e/twitcanva-image-helper-outside.png'), null);
});
