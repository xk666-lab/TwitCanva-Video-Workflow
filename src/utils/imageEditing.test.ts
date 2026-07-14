import assert from 'node:assert/strict';
import test from 'node:test';

import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import {
  createImageEditDerivations,
  resolveEditorImageSource
} from '../domain/imageEditing/imageEdit.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import type { NodeData, NodeType } from '../types.ts';

const TYPES = {
  IMAGE: '图片' as NodeType,
  IMAGE_EDITOR: '图片编辑器' as NodeType
};

function node(id: string, type: NodeType, overrides: Partial<NodeData> = {}): NodeData {
  return {
    ...createDefaultNodeData(type),
    id,
    x: 0,
    y: 0,
    parentIds: [],
    ...overrides
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string
): CanvasEdge {
  return {
    schemaVersion: 1,
    id,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    dataType: 'image'
  };
}

test('editor source resolution prefers a typed image edge over legacy parentIds', () => {
  const edgeSource = node('edge-source', TYPES.IMAGE, {
    resultUrl: '/library/images/edge-source.png',
    takes: [{
      id: 'take-edge-source',
      nodeId: 'edge-source',
      type: 'image',
      url: '/library/images/edge-source.png',
      prompt: 'edge source',
      model: 'gpt-image-2',
      createdAt: '2026-07-15T00:00:00.000Z',
      isHero: true
    }],
    heroTakeId: 'take-edge-source'
  });
  const legacySource = node('legacy-source', TYPES.IMAGE, {
    resultUrl: '/library/images/legacy-source.png'
  });
  const editor = node('editor-1', TYPES.IMAGE_EDITOR, {
    parentIds: ['legacy-source']
  });

  assert.deepEqual(
    resolveEditorImageSource(editor, [edgeSource, legacySource, editor], [
      edge('editor-input', 'edge-source', 'image-output', 'editor-1', 'image-input')
    ]),
    {
      nodeId: 'edge-source',
      takeId: 'take-edge-source',
      url: '/library/images/edge-source.png'
    }
  );
});

test('image edit derivation creates typed output edges and immutable source provenance', () => {
  const editor = node('editor-1', TYPES.IMAGE_EDITOR, { x: 100, y: 200 });
  const ids = ['derived-1', 'derived-2'];
  const derivation = createImageEditDerivations({
    editorNode: editor,
    source: {
      nodeId: 'source-1',
      takeId: 'take-source-1',
      url: '/library/images/source.png'
    },
    prompt: 'Add a paper theatre in the background.',
    mode: 'expand',
    imageModel: 'gpt-image-2',
    aspectRatio: '1536x1024',
    resolution: '2K',
    count: 2,
    createId: () => ids.shift()!
  });

  assert.deepEqual(derivation.nodes.map(item => item.id), ['derived-1', 'derived-2']);
  assert.deepEqual(derivation.nodes.map(item => item.status), ['idle', 'idle']);
  assert.deepEqual(derivation.nodes.map(item => item.parentIds), [[], []]);
  assert.equal(derivation.nodes[0].x, 460);
  assert.equal(derivation.nodes[0].y, -50);
  assert.equal(derivation.nodes[1].y, 450);
  assert.match(derivation.nodes[0].prompt, /extend/i);
  assert.match(derivation.nodes[0].prompt, /paper theatre/i);

  assert.deepEqual(derivation.edges.map(item => ({
    sourceNodeId: item.sourceNodeId,
    sourcePortId: item.sourcePortId,
    targetNodeId: item.targetNodeId,
    targetPortId: item.targetPortId,
    dataType: item.dataType
  })), [
    {
      sourceNodeId: 'editor-1',
      sourcePortId: 'image-output',
      targetNodeId: 'derived-1',
      targetPortId: 'reference-images',
      dataType: 'image'
    },
    {
      sourceNodeId: 'editor-1',
      sourcePortId: 'image-output',
      targetNodeId: 'derived-2',
      targetPortId: 'reference-images',
      dataType: 'image'
    }
  ]);

  assert.deepEqual(derivation.taskInputs.map(item => item.imageEdit), [
    {
      mode: 'expand',
      sourceNodeId: 'source-1',
      sourceTakeId: 'take-source-1',
      editorNodeId: 'editor-1'
    },
    {
      mode: 'expand',
      sourceNodeId: 'source-1',
      sourceTakeId: 'take-source-1',
      editorNodeId: 'editor-1'
    }
  ]);
  assert.deepEqual(derivation.taskInputs.map(item => item.imageBase64), [
    '/library/images/source.png',
    '/library/images/source.png'
  ]);
});

test('image edit derivation rejects a missing persisted source URL', () => {
  assert.throws(() => createImageEditDerivations({
    editorNode: node('editor-1', TYPES.IMAGE_EDITOR),
    source: { nodeId: 'source-1', url: '' },
    prompt: 'Change the scene.',
    mode: 'prompt-edit',
    imageModel: 'gpt-image-2',
    aspectRatio: 'Auto',
    resolution: '1K',
    count: 1,
    createId: () => 'derived-1'
  }), /source image/i);
});
