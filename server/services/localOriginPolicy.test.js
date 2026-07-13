import assert from 'node:assert/strict';
import test from 'node:test';

import { isTrustedLocalOrigin } from './localOriginPolicy.js';

test('local origin policy allows same-machine workbench origins and explicit overrides', () => {
    assert.equal(isTrustedLocalOrigin(undefined), true);
    assert.equal(isTrustedLocalOrigin('http://localhost:5173'), true);
    assert.equal(isTrustedLocalOrigin('http://127.0.0.1:3001'), true);
    assert.equal(isTrustedLocalOrigin('https://studio.example', ['https://studio.example']), true);
});

test('local origin policy rejects arbitrary browser origins and malformed values', () => {
    assert.equal(isTrustedLocalOrigin('https://malicious.example'), false);
    assert.equal(isTrustedLocalOrigin('null'), false);
    assert.equal(isTrustedLocalOrigin('not a url'), false);
});
