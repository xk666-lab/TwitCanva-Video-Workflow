import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  createWorkflowData
} from '../domain/workflow/workflowSchema.ts';
import { migrateWorkflow } from '../domain/workflow/migrateWorkflow.ts';

function fixture(name: string): Record<string, unknown> {
  const url = new URL(`../../test/fixtures/workflows/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>;
}

test('new workflow payloads use the current schema version', () => {
  const workflow = createWorkflowData({
    id: null,
    title: 'New Workflow',
    nodes: [],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });

  assert.equal(workflow.schemaVersion, CURRENT_WORKFLOW_SCHEMA_VERSION);
  assert.equal(workflow.title, 'New Workflow');
});

test('migrates a schema-less text workflow from version 1 to the current version', () => {
  const migrated = migrateWorkflow(fixture('legacy-text.json'));

  assert.equal(migrated.schemaVersion, CURRENT_WORKFLOW_SCHEMA_VERSION);
  assert.equal(migrated.nodes[0].type, '文本');
  assert.equal(migrated.nodes[0].status, 'idle');
  assert.deepEqual(migrated.nodes[0].parentIds, []);
});

test('normalizes a legacy successful image into a hero take', () => {
  const migrated = migrateWorkflow(fixture('legacy-image-success.json'));
  const image = migrated.nodes[0];

  assert.equal(image.type, '图片');
  assert.equal(image.heroTakeId, 'legacy-image-1');
  assert.equal(image.takes?.length, 1);
  assert.equal(image.takes?.[0].url, '/library/images/legacy.png');
  assert.equal(image.takes?.[0].isHero, true);
});

test('keeps existing takes normalized and preserves video frame inputs', () => {
  const takesWorkflow = migrateWorkflow(fixture('workflow-with-takes.json'));
  const videoWorkflow = migrateWorkflow(fixture('legacy-video-frames.json'));

  assert.equal(takesWorkflow.nodes[0].heroTakeId, 'take-2');
  assert.equal(takesWorkflow.nodes[0].resultUrl, '/library/images/take-2.png');
  assert.deepEqual(videoWorkflow.nodes[2].frameInputs, [
    { nodeId: 'frame-start', order: 'start' },
    { nodeId: 'frame-end', order: 'end' }
  ]);
  assert.deepEqual(videoWorkflow.nodes[2].parentIds, ['frame-start', 'frame-end']);
});

test('preserves storyboard group context', () => {
  const migrated = migrateWorkflow(fixture('legacy-storyboard-group.json'));

  assert.equal(migrated.groups[0].storyContext?.story, 'A tiny adventure');
  assert.equal(migrated.groups[0].storyContext?.scripts.length, 1);
  assert.deepEqual(migrated.groups[0].nodeIds, ['scene-1']);
});

test('warns about unknown node types without rejecting the workflow', () => {
  const warnings: string[] = [];
  const migrated = migrateWorkflow(fixture('workflow-with-unknown-fields.json'), {
    warn: message => warnings.push(message)
  });

  assert.equal(migrated.nodes.length, 1);
  assert.equal(String(migrated.nodes[0].type), 'Future Node');
  assert.equal(migrated.nodes[0].prompt, '');
  assert.equal(migrated.nodes[0].status, 'idle');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Future Node/);
});

test('migration preserves unknown fields and does not mutate the input', () => {
  const raw = fixture('workflow-with-unknown-fields.json');
  const snapshot = structuredClone(raw);
  const migrated = migrateWorkflow(raw, { warn: () => undefined });

  assert.deepEqual(raw, snapshot);
  assert.deepEqual(migrated.futureRoot, { enabled: true });
  assert.deepEqual((migrated.nodes[0] as unknown as Record<string, unknown>).futureNode, { version: 7 });
  assert.equal((migrated.groups[0] as unknown as Record<string, unknown>).futureGroup, 'kept');
  assert.equal((migrated.viewport as unknown as Record<string, unknown>).futureViewport, 'kept');
});

test('migration is idempotent', () => {
  const once = migrateWorkflow(fixture('workflow-with-unknown-fields.json'), { warn: () => undefined });
  const twice = migrateWorkflow(once, { warn: () => undefined });

  assert.deepEqual(twice, once);
});

test('all bundled public workflows migrate without losing nodes', () => {
  const directory = new URL('../../public/workflows/', import.meta.url);

  for (const name of readdirSync(directory).filter(file => file.endsWith('.json'))) {
    const raw = JSON.parse(readFileSync(new URL(name, directory), 'utf8')) as Record<string, unknown>;
    const originalNodeCount = Array.isArray(raw.nodes) ? raw.nodes.length : 0;
    const migrated = migrateWorkflow(raw, { warn: () => undefined });

    assert.equal(migrated.nodes.length, originalNodeCount, name);
    assert.equal(migrated.schemaVersion, CURRENT_WORKFLOW_SCHEMA_VERSION, name);
  }
});
