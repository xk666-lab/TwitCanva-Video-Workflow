import test from 'node:test';
import assert from 'node:assert/strict';

import type { NodeData, NodeType } from '../types.ts';
import { normalizeEdges } from '../domain/graph/edgeMigration.ts';
import { resolveConnectionPorts, validateConnection } from '../domain/graph/connectionRules.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';

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

test('subject connections resolve and validate for supported target nodes', () => {
  const source = node('subject', '主体', { subjectAssetId: 'asset-1' });

  for (const type of ['图片', '视频', '脚本', '分镜管理器']) {
    const target = node(`target-${type}`, type);
    const resolution = resolveConnectionPorts(source, target, []);

    assert.equal(resolution.valid, true, type);
    if (!resolution.valid) continue;
    assert.equal(resolution.sourcePort.id, 'subject-output', type);
    assert.equal(resolution.targetPort.id, 'subject-references', type);
    assert.equal(validateConnection({
      sourceNode: source,
      sourcePort: resolution.sourcePort,
      targetNode: target,
      targetPort: resolution.targetPort,
      existingEdges: []
    }).valid, true, type);
  }
});

test('edge normalization retains the subject port data type', () => {
  const source = node('subject', '主体', { subjectAssetId: 'asset-1' });
  const target = node('image', '图片');
  const edges = normalizeEdges([{
    schemaVersion: 1,
    id: 'subject-edge',
    sourceNodeId: source.id,
    sourcePortId: 'subject-output',
    targetNodeId: target.id,
    targetPortId: 'subject-references',
    dataType: 'subject'
  }], [source, target], () => undefined);

  assert.equal(edges.length, 1);
  assert.equal(edges[0].dataType, 'subject');
});
