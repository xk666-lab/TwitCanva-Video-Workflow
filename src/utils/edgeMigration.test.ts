import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import type { NodeData, NodeType } from '../types.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import {
  deriveParentIdsFromEdges,
  migrateCanvasEdge,
  migrateParentIdsToEdges,
  normalizeEdges,
  reconcileEdgesFromLegacyNodeChanges,
  removeEdgesForNode,
  syncLegacyParentIds
} from '../domain/graph/edgeMigration.ts';
import { createWorkflowData } from '../domain/workflow/workflowSchema.ts';
import { migrateWorkflow } from '../domain/workflow/migrateWorkflow.ts';

function node(id: string, type: string, overrides: Partial<NodeData> = {}): NodeData {
  return {
    ...createDefaultNodeData(type as NodeType),
    id,
    x: 0,
    y: 0,
    parentIds: [],
    ...overrides
  };
}

function edge(id: string, sourceNodeId: string, targetNodeId: string, targetPortId = 'reference-images'): CanvasEdge {
  return {
    schemaVersion: 1,
    id,
    sourceNodeId,
    sourcePortId: 'image-output',
    targetNodeId,
    targetPortId,
    dataType: 'image'
  };
}

test('edge schema migration supplies version 1 and preserves newer versions with a warning', () => {
  const warnings: string[] = [];
  const current = migrateCanvasEdge({ id: 'legacy-edge' }, 0, message => warnings.push(message));
  const future = migrateCanvasEdge({ id: 'future-edge', schemaVersion: 2 }, 1, message => warnings.push(message));

  assert.equal(current.schemaVersion, 1);
  assert.equal(future.schemaVersion, 2);
  assert.equal(warnings.some(message => message.includes('version 2')), true);
});

test('parentIds migrate to typed edges and derive back to the same legacy relation', () => {
  const nodes = [
    node('text', '文本'),
    node('image', '图片', { parentIds: ['text'] })
  ];
  const edges = migrateParentIdsToEdges(nodes);

  assert.equal(edges.length, 1);
  assert.equal(edges[0].sourcePortId, 'text-output');
  assert.equal(edges[0].targetPortId, 'prompt-input');
  assert.deepEqual(deriveParentIdsFromEdges(nodes, edges).image, ['text']);
});

test('frameInputs take precedence when migrating start and end frames', () => {
  const nodes = [
    node('start', '图片'),
    node('end', '图片'),
    node('video', '视频', {
      parentIds: ['end', 'start'],
      frameInputs: [
        { nodeId: 'start', order: 'start' },
        { nodeId: 'end', order: 'end' }
      ]
    })
  ];
  const edges = migrateParentIdsToEdges(nodes);

  assert.equal(edges.find(item => item.sourceNodeId === 'start')?.targetPortId, 'start-frame');
  assert.equal(edges.find(item => item.sourceNodeId === 'end')?.targetPortId, 'end-frame');
});

test('additional legacy image inputs migrate to ordered reference edges', () => {
  const nodes = [
    node('one', '图片'),
    node('two', '图片'),
    node('three', '图片'),
    node('video', '视频', { parentIds: ['one', 'two', 'three'] })
  ];
  const edges = migrateParentIdsToEdges(nodes);
  const reference = edges.find(item => item.sourceNodeId === 'three');

  assert.equal(reference?.targetPortId, 'reference-images');
  assert.equal(reference?.order, 0);
});

test('removing a node removes all incoming and outgoing edges', () => {
  const edges = [
    edge('one', 'a', 'b'),
    edge('two', 'b', 'c'),
    edge('three', 'a', 'c')
  ];

  assert.deepEqual(removeEdgesForNode(edges, 'b').map(item => item.id), ['three']);
});

test('syncLegacyParentIds keeps a parent until all parallel edges are removed', () => {
  const nodes = [node('a', '图片'), node('b', '图片', { parentIds: ['a'] })];
  const edges = [
    edge('one', 'a', 'b'),
    edge('two', 'a', 'b', 'image-input')
  ];

  assert.deepEqual(syncLegacyParentIds(nodes, edges)[1].parentIds, ['a']);
  assert.deepEqual(syncLegacyParentIds(nodes, edges.slice(1))[1].parentIds, ['a']);
  assert.deepEqual(syncLegacyParentIds(nodes, [])[1].parentIds, []);
});

test('normalization removes exact duplicates but preserves unknown ports with a warning', () => {
  const nodes = [node('a', '图片'), node('b', '图片')];
  const warnings: string[] = [];
  const unknown = edge('unknown', 'a', 'b');
  unknown.targetPortId = 'future-port';
  const normalized = normalizeEdges([
    edge('one', 'a', 'b'),
    edge('duplicate', 'a', 'b'),
    unknown
  ], nodes, message => warnings.push(message));

  assert.equal(normalized.length, 2);
  assert.equal(normalized.some(item => item.targetPortId === 'future-port'), true);
  assert.equal(warnings.some(message => message.includes('future-port')), true);
});

test('schema-less workflows migrate edges idempotently', () => {
  const url = new URL('../../test/fixtures/workflows/legacy-video-frames.json', import.meta.url);
  const raw = JSON.parse(readFileSync(url, 'utf8')) as Record<string, unknown>;
  const once = migrateWorkflow(raw, { warn: () => undefined });
  const twice = migrateWorkflow(once, { warn: () => undefined });

  assert.ok(once.edges.length > 0);
  assert.deepEqual(twice, once);
});

test('saving and loading preserves edge ids and ports', () => {
  const nodes = [node('a', '图片'), node('b', '视频', { parentIds: ['a'] })];
  const edges = migrateParentIdsToEdges(nodes);
  const saved = createWorkflowData({
    id: 'edge-workflow',
    title: 'Edges',
    nodes: syncLegacyParentIds(nodes, edges),
    edges,
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  });
  const loaded = migrateWorkflow(saved);

  assert.deepEqual(loaded.edges, edges);
});

test('an explicit edges array is authoritative over stale parentIds', () => {
  const raw = {
    schemaVersion: 3,
    id: 'authoritative-edges',
    title: 'Authoritative Edges',
    nodes: [
      node('a', '图片'),
      node('b', '图片', { parentIds: ['a'] })
    ],
    edges: [],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  };
  const migrated = migrateWorkflow(raw);

  assert.deepEqual(migrated.edges, []);
  assert.deepEqual(migrated.nodes[1].parentIds, []);
});

test('unknown ports survive workflow migration while missing-node edges are removed', () => {
  const nodes = [node('a', '图片'), node('b', '图片')];
  const warnings: string[] = [];
  const migrated = migrateWorkflow({
    schemaVersion: 3,
    id: 'unknown-port',
    title: 'Unknown Port',
    nodes,
    edges: [
      { ...edge('future', 'a', 'b'), targetPortId: 'future-port' },
      edge('dangling', 'missing', 'b')
    ],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 }
  }, { warn: message => warnings.push(message) });

  assert.equal(migrated.edges.length, 1);
  assert.equal(migrated.edges[0].targetPortId, 'future-port');
  assert.equal(warnings.some(message => message.includes('future-port')), true);
  assert.equal(warnings.some(message => message.includes('does not exist')), true);
});

test('legacy node state updates create and remove matching edges centrally', () => {
  const source = node('source', '图片');
  const target = node('target', '视频', { parentIds: ['source'] });
  const added = reconcileEdgesFromLegacyNodeChanges([source], [source, target], [], () => undefined);
  const removed = reconcileEdgesFromLegacyNodeChanges([source, target], [source], added, () => undefined);

  assert.equal(added.length, 1);
  assert.equal(added[0].targetPortId, 'start-frame');
  assert.deepEqual(removed, []);
});
