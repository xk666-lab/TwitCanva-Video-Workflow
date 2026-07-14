import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyScriptDocument,
  createEmptyStoryboardDocument,
  normalizeScriptDocument,
  normalizeStoryboardDocument
} from '../domain/storyboard/storyboardDocuments.ts';

const NOW = '2026-07-14T00:00:00.000Z';

test('document factories return fresh serializable defaults', () => {
  const firstScript = createEmptyScriptDocument({ now: NOW });
  const secondScript = createEmptyScriptDocument({ now: NOW });
  const storyboard = createEmptyStoryboardDocument({
    sourceScriptNodeId: 'script-1',
    now: NOW
  });

  assert.equal(firstScript.schemaVersion, 1);
  assert.equal(firstScript.revision, 0);
  assert.deepEqual(firstScript.referenceAssets, []);
  assert.notEqual(firstScript.referenceAssets, secondScript.referenceAssets);
  assert.equal(storyboard.sourceScriptNodeId, 'script-1');
  assert.equal(storyboard.selectedImageModel, 'gpt-image-2');
  assert.deepEqual(storyboard.shots, []);
});

test('normalization preserves unknown fields and assigns stable shot ids', () => {
  const raw = {
    schemaVersion: 1,
    sourceScriptNodeId: 'script-1',
    selectedImageModel: 'gpt-image-2',
    revision: 3,
    futureDocument: { enabled: true },
    shots: [{
      sceneNumber: 4,
      description: 'A train enters a flooded station',
      cameraAngle: 'Wide shot',
      mood: 'Tense',
      futureShot: 7
    }]
  };

  const once = normalizeStoryboardDocument(raw, {
    ownerId: 'storyboard-1',
    now: NOW
  });
  const twice = normalizeStoryboardDocument(once, {
    ownerId: 'storyboard-1',
    now: NOW
  });

  assert.equal(once.shots[0].id, 'legacy-shot-storyboard-1-1');
  assert.equal(once.shots[0].order, 0);
  assert.equal(once.shots[0].status, 'draft');
  assert.equal((once as Record<string, unknown>).futureDocument instanceof Object, true);
  assert.equal((once.shots[0] as unknown as Record<string, unknown>).futureShot, 7);
  assert.deepEqual(twice, once);
});

test('script normalization does not mutate its input', () => {
  const raw = {
    sourceText: 'A courier finds a lost robot',
    synopsis: 'A short adventure',
    generatedBy: {
      taskId: 'task-1',
      futureProvenance: 'kept'
    },
    futureField: 'kept'
  };
  const snapshot = structuredClone(raw);
  const normalized = normalizeScriptDocument(raw, { now: NOW });

  assert.deepEqual(raw, snapshot);
  assert.equal(normalized.sourceText, raw.sourceText);
  assert.deepEqual(normalized.generatedBy, raw.generatedBy);
  assert.notEqual(normalized.generatedBy, raw.generatedBy);
  assert.equal((normalized as Record<string, unknown>).futureField, 'kept');
});
