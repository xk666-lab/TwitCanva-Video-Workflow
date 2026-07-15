import test from 'node:test';
import assert from 'node:assert/strict';

import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import type { NodeData, NodeType } from '../types.ts';

type SemanticCanvasModule = {
  getVisibleNodePorts?: (type: string, direction: 'input' | 'output') => Array<{
    id: string;
    direction: 'input' | 'output';
  }>;
  getConnectionTargetChoices?: (
    sourceNode: NodeData,
    sourcePortId: string,
    targetNode: NodeData,
    existingEdges: CanvasEdge[]
  ) => Array<{
    sourcePort: { id: string };
    targetPort: { id: string };
  }>;
  resolveConnectionDrop?: (
    sourceNode: NodeData,
    sourcePortId: string,
    targetNode: NodeData,
    existingEdges: CanvasEdge[]
  ) => {
    kind: 'connect' | 'choose' | 'invalid';
    targetPort?: { id: string };
    choices?: Array<{ targetPort: { id: string } }>;
  };
  createSemanticEdge?: (input: {
    sourceNode: NodeData;
    sourcePortId: string;
    targetNode: NodeData;
    targetPortId: string;
    existingEdges: CanvasEdge[];
    idFactory?: () => string;
    now?: () => string;
  }) => {
    valid: boolean;
    edge?: CanvasEdge;
  };
  getNodePortCanvasAnchor?: (
    type: string,
    portId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ) => {
    side: 'left' | 'right';
    relativeY: number;
    x: number;
    y: number;
  } | undefined;
  getNodeInspectorData?: (
    node: NodeData,
    nodes: NodeData[],
    edges: CanvasEdge[]
  ) => {
    nodeId: string;
    inputs: Array<{
      portId: string;
      connections: Array<{ edgeId: string; nodeId: string; portId: string }>;
    }>;
    heroTake?: { id: string; url: string; type: 'image' | 'video'; thumbnailUrl?: string };
    activeTaskId?: string;
  };
  getEdgeInspectorData?: (edge: CanvasEdge, nodes: NodeData[]) => {
    id: string;
    source: { nodeId: string; portId: string; nodeLabel: string; portLabel: string; role?: string };
    target: { nodeId: string; portId: string; nodeLabel: string; portLabel: string; role?: string };
    dataType: string;
  };
  createConnectionRenderIndex?: (nodes: NodeData[], edges: CanvasEdge[]) => {
    nodesById: Map<string, NodeData>;
    parallelEdgeLayoutById: Map<string, { index: number; count: number }>;
  };
  getConnectionPortFeedbackKey?: (nodeId: string, portId: string) => string;
  createConnectionPortFeedbackIndex?: (
    nodes: NodeData[],
    edges: CanvasEdge[],
    connectionStart: { nodeId: string; portId: string; direction: 'input' | 'output' } | null
  ) => Map<string, { state: 'source' | 'compatible' | 'incompatible'; code?: string; message?: string }>;
};

async function loadSemanticCanvas(): Promise<SemanticCanvasModule> {
  try {
    return await import('../domain/graph/semanticCanvas.ts') as SemanticCanvasModule;
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  }
}

function node(id: string, type: string): NodeData {
  return {
    ...createDefaultNodeData(type as NodeType),
    id,
    x: 0,
    y: 0,
    parentIds: []
  };
}

test('builds node and parallel-edge indexes in one render preparation pass', async () => {
  const semanticCanvas = await loadSemanticCanvas();
  assert.equal(typeof semanticCanvas.createConnectionRenderIndex, 'function');

  const source = node('source', '图片');
  const target = node('target', '视频');
  const edges = [
    {
      schemaVersion: 1,
      id: 'edge-a',
      sourceNodeId: source.id,
      sourcePortId: 'image-output',
      targetNodeId: target.id,
      targetPortId: 'start-frame',
      dataType: 'image'
    },
    {
      schemaVersion: 1,
      id: 'edge-b',
      sourceNodeId: source.id,
      sourcePortId: 'image-output',
      targetNodeId: target.id,
      targetPortId: 'reference-images',
      dataType: 'image'
    }
  ] as CanvasEdge[];

  const index = semanticCanvas.createConnectionRenderIndex!([source, target], edges);
  assert.equal(index.nodesById.get(source.id), source);
  assert.deepEqual(index.parallelEdgeLayoutById.get('edge-a'), { index: 0, count: 2 });
  assert.deepEqual(index.parallelEdgeLayoutById.get('edge-b'), { index: 1, count: 2 });
});

test('classifies visible ports with the same validation rules used to create connections', async () => {
  const semanticCanvas = await loadSemanticCanvas();
  assert.equal(typeof semanticCanvas.getConnectionPortFeedbackKey, 'function');
  assert.equal(typeof semanticCanvas.createConnectionPortFeedbackIndex, 'function');

  const source = node('prompt', '文本');
  const target = node('video', '视频');
  const feedback = semanticCanvas.createConnectionPortFeedbackIndex!([source, target], [], {
    nodeId: source.id,
    portId: 'text-output',
    direction: 'output'
  });
  const key = semanticCanvas.getConnectionPortFeedbackKey!;

  assert.deepEqual(feedback.get(key(source.id, 'text-output')), { state: 'source' });
  assert.deepEqual(feedback.get(key(target.id, 'prompt-input')), { state: 'compatible' });
  assert.equal(feedback.get(key(target.id, 'start-frame'))?.state, 'incompatible');
  assert.equal(feedback.get(key(target.id, 'start-frame'))?.code, 'incompatible_data_type');
  assert.match(feedback.get(key(target.id, 'start-frame'))?.message || '', /text.*image/);
});

test('shows only enabled registry ports on their matching semantic rail', async () => {
  const semanticCanvas = await loadSemanticCanvas();

  assert.equal(typeof semanticCanvas.getVisibleNodePorts, 'function');

  const videoInputs = semanticCanvas.getVisibleNodePorts!('视频', 'input');
  const videoOutputs = semanticCanvas.getVisibleNodePorts!('视频', 'output');
  const audioInputs = semanticCanvas.getVisibleNodePorts!('音频', 'input');

  assert.deepEqual(
    videoInputs.map(port => port.id),
    ['prompt-input', 'start-frame', 'end-frame', 'reference-images', 'subject-references', 'motion-reference', 'audio-reference']
  );
  assert.ok(videoInputs.every(port => port.direction === 'input'));
  assert.deepEqual(videoOutputs.map(port => port.id), ['video-output', 'last-frame-output']);
  assert.ok(videoOutputs.every(port => port.direction === 'output'));
  assert.deepEqual(audioInputs, []);
});

test('offers explicit image-to-video input choices and excludes occupied single-input ports', async () => {
  const semanticCanvas = await loadSemanticCanvas();
  assert.equal(typeof semanticCanvas.getConnectionTargetChoices, 'function');

  const source = node('image', '图片');
  const target = node('video', '视频');

  const initialChoices = semanticCanvas.getConnectionTargetChoices!(source, 'image-output', target, []);
  assert.deepEqual(
    initialChoices.map(choice => choice.targetPort.id),
    ['start-frame', 'end-frame', 'reference-images']
  );
  assert.ok(initialChoices.every(choice => choice.sourcePort.id === 'image-output'));

  const choicesAfterStartFrame = semanticCanvas.getConnectionTargetChoices!(source, 'image-output', target, [{
    schemaVersion: 1,
    id: 'start-frame-edge',
    sourceNodeId: 'first-image',
    sourcePortId: 'image-output',
    targetNodeId: target.id,
    targetPortId: 'start-frame',
    dataType: 'image'
  }]);
  assert.deepEqual(
    choicesAfterStartFrame.map(choice => choice.targetPort.id),
    ['end-frame', 'reference-images']
  );
});

test('only auto-connects a dropped port when the target has one valid semantic destination', async () => {
  const semanticCanvas = await loadSemanticCanvas();
  assert.equal(typeof semanticCanvas.resolveConnectionDrop, 'function');

  const textToImage = semanticCanvas.resolveConnectionDrop!(
    node('text', '文本'),
    'text-output',
    node('image', '图片'),
    []
  );
  assert.equal(textToImage.kind, 'connect');
  assert.equal(textToImage.targetPort?.id, 'prompt-input');

  const imageToVideo = semanticCanvas.resolveConnectionDrop!(
    node('image', '图片'),
    'image-output',
    node('video', '视频'),
    []
  );
  assert.equal(imageToVideo.kind, 'connect');
  assert.equal(imageToVideo.targetPort?.id, 'reference-images');
});

test('creates an explicit edge with stable ports and ordered multi-input metadata', async () => {
  const semanticCanvas = await loadSemanticCanvas();
  assert.equal(typeof semanticCanvas.createSemanticEdge, 'function');

  const firstImage = node('first-image', '图片');
  const secondImage = node('second-image', '图片');
  const target = node('target-image', '图片');
  const first = semanticCanvas.createSemanticEdge!({
    sourceNode: firstImage,
    sourcePortId: 'image-output',
    targetNode: target,
    targetPortId: 'reference-images',
    existingEdges: [],
    idFactory: () => 'reference-1',
    now: () => '2026-07-15T00:00:00.000Z'
  });

  assert.equal(first.valid, true);
  assert.deepEqual(first.edge, {
    schemaVersion: 1,
    id: 'reference-1',
    sourceNodeId: firstImage.id,
    sourcePortId: 'image-output',
    targetNodeId: target.id,
    targetPortId: 'reference-images',
    dataType: 'image',
    order: 0,
    createdAt: '2026-07-15T00:00:00.000Z'
  });

  const second = semanticCanvas.createSemanticEdge!({
    sourceNode: secondImage,
    sourcePortId: 'image-output',
    targetNode: target,
    targetPortId: 'reference-images',
    existingEdges: [first.edge!],
    idFactory: () => 'reference-2',
    now: () => '2026-07-15T00:00:01.000Z'
  });

  assert.equal(second.valid, true);
  assert.equal(second.edge?.order, 1);
});

test('uses merged midpoint rail placement for visible semantic ports', async () => {
  const semanticCanvas = await loadSemanticCanvas();
  assert.equal(typeof semanticCanvas.getNodePortCanvasAnchor, 'function');

  const bounds = { x: 100, y: 200, width: 400, height: 320 };
  const startFrame = semanticCanvas.getNodePortCanvasAnchor!('视频', 'start-frame', bounds);
  const endFrame = semanticCanvas.getNodePortCanvasAnchor!('视频', 'end-frame', bounds);
  const videoOutput = semanticCanvas.getNodePortCanvasAnchor!('视频', 'video-output', bounds);

  assert.deepEqual(startFrame, { side: 'left', relativeY: 0.5, x: 100, y: 360 });
  assert.deepEqual(endFrame, { side: 'left', relativeY: 0.5, x: 100, y: 360 });
  assert.deepEqual(videoOutput, {
    side: 'right',
    relativeY: 0.5,
    x: 500,
    y: 360
  });
  assert.equal(semanticCanvas.getNodePortCanvasAnchor!('视频', 'missing-port', bounds), undefined);
});

test('derives Inspector input, Hero Take, task, and Edge data from the graph state', async () => {
  const semanticCanvas = await loadSemanticCanvas();
  assert.equal(typeof semanticCanvas.getNodeInspectorData, 'function');
  assert.equal(typeof semanticCanvas.getEdgeInspectorData, 'function');

  const source = { ...node('prompt', '文本'), prompt: 'A rainy city at dawn' };
  const target = {
    ...node('image', '图片'),
    activeTaskId: 'task-image-1',
    heroTakeId: 'take-hero',
    takes: [{
      id: 'take-hero',
      nodeId: 'image',
      type: 'image' as const,
      url: '/library/images/hero.png',
      prompt: 'A rainy city at dawn',
      model: 'gpt-image-2',
      createdAt: '2026-07-15T00:00:00.000Z',
      isHero: true
    }]
  };
  const promptEdge: CanvasEdge = {
    schemaVersion: 1,
    id: 'prompt-edge',
    sourceNodeId: source.id,
    sourcePortId: 'text-output',
    targetNodeId: target.id,
    targetPortId: 'prompt-input',
    dataType: 'text'
  };

  const nodeData = semanticCanvas.getNodeInspectorData!(target, [source, target], [promptEdge]);
  assert.equal(nodeData.nodeId, target.id);
  assert.deepEqual(nodeData.inputs.find(input => input.portId === 'prompt-input')?.connections.map(connection => ({
    edgeId: connection.edgeId,
    nodeId: connection.nodeId,
    portId: connection.portId
  })), [{
    edgeId: promptEdge.id,
    nodeId: source.id,
    portId: 'text-output'
  }]);
  assert.deepEqual(nodeData.heroTake, {
    id: 'take-hero',
    url: '/library/images/hero.png',
    type: 'image'
  });
  assert.equal(nodeData.activeTaskId, 'task-image-1');

  const edgeData = semanticCanvas.getEdgeInspectorData!(promptEdge, [source, target]);
  assert.equal(edgeData.id, 'prompt-edge');
  assert.equal(edgeData.source.nodeId, source.id);
  assert.equal(edgeData.source.portId, 'text-output');
  assert.equal(edgeData.source.role, 'text');
  assert.equal(edgeData.target.nodeId, target.id);
  assert.equal(edgeData.target.portId, 'prompt-input');
  assert.equal(edgeData.target.role, 'prompt');
  assert.equal(edgeData.dataType, 'text');
});
