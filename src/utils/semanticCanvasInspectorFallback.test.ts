import test from 'node:test';
import assert from 'node:assert/strict';

import type { NodeData, NodeType } from '../types.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import { getNodeInspectorData } from '../domain/graph/semanticCanvas.ts';
import type { CanvasEdge } from '../domain/graph/graphTypes.ts';

function node(id: string, type: NodeType): NodeData {
  return {
    ...createDefaultNodeData(type),
    id,
    x: 0,
    y: 0,
    parentIds: []
  };
}

test('Inspector keeps the missing Edge target identity for an outgoing connection', () => {
  const source = node('source-text', '文本' as NodeType);
  const edge: CanvasEdge = {
    schemaVersion: 1,
    id: 'edge-to-removed-target',
    sourceNodeId: source.id,
    sourcePortId: 'text-output',
    targetNodeId: 'removed-image',
    targetPortId: 'prompt-input',
    dataType: 'text'
  };

  const inspector = getNodeInspectorData(source, [source], [edge]);
  const connection = inspector.outputs.find(port => port.portId === 'text-output')?.connections[0];

  assert.deepEqual(connection && {
    nodeId: connection.nodeId,
    portId: connection.portId,
    nodeLabel: connection.nodeLabel
  }, {
    nodeId: 'removed-image',
    portId: 'prompt-input',
    nodeLabel: 'removed-image'
  });
});
