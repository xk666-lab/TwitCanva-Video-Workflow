import test from 'node:test';
import assert from 'node:assert/strict';

import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import type { NodeData, NodeType } from '../types.ts';
import { createDefaultNodeData, getNodePort } from '../domain/nodes/nodeRegistry.ts';
import { resolveConnectionPorts, validateConnection } from '../domain/graph/connectionRules.ts';

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

function edge(overrides: Partial<CanvasEdge> = {}): CanvasEdge {
  return {
    schemaVersion: 1,
    id: 'edge-1',
    sourceNodeId: 'source',
    sourcePortId: 'image-output',
    targetNodeId: 'target',
    targetPortId: 'start-frame',
    dataType: 'image',
    ...overrides
  };
}

test('TEXT to IMAGE automatically resolves to prompt-input and validates', () => {
  const source = node('text', '文本');
  const target = node('image', '图片');
  const resolution = resolveConnectionPorts(source, target, []);

  assert.equal(resolution.valid, true);
  if (!resolution.valid) return;
  assert.equal(resolution.sourcePort.id, 'text-output');
  assert.equal(resolution.targetPort.id, 'prompt-input');
  assert.equal(validateConnection({
    sourceNode: source,
    sourcePort: resolution.sourcePort,
    targetNode: target,
    targetPort: resolution.targetPort,
    existingEdges: []
  }).valid, true);
});

test('TEXT to TEXT and VIDEO to IMAGE are rejected', () => {
  assert.equal(resolveConnectionPorts(node('a', '文本'), node('b', '文本'), []).valid, false);
  assert.equal(resolveConnectionPorts(node('video', '视频'), node('image', '图片'), []).valid, false);
});

test('TEXT to SCRIPT and SCRIPT to STORYBOARD resolve through typed ports', () => {
  const textToScript = resolveConnectionPorts(node('text', '文本'), node('script', '脚本'), []);
  assert.equal(textToScript.valid, true);
  if (textToScript.valid) {
    assert.equal(textToScript.sourcePort.id, 'text-output');
    assert.equal(textToScript.targetPort.id, 'text-input');
  }

  const scriptToStoryboard = resolveConnectionPorts(
    node('script', '脚本'),
    node('storyboard', '分镜管理器'),
    []
  );
  assert.equal(scriptToStoryboard.valid, true);
  if (scriptToStoryboard.valid) {
    assert.equal(scriptToStoryboard.sourcePort.id, 'script-output');
    assert.equal(scriptToStoryboard.targetPort.id, 'script-input');
  }
});

test('IMAGE cannot connect to STORYBOARD', () => {
  assert.equal(
    resolveConnectionPorts(node('image', '图片'), node('storyboard', '分镜管理器'), []).valid,
    false
  );
});

test('first IMAGE to VIDEO connection resolves to start-frame', () => {
  const resolution = resolveConnectionPorts(node('image', '图片'), node('video', '视频'), []);

  assert.equal(resolution.valid, true);
  if (resolution.valid) {
    assert.equal(resolution.sourcePort.id, 'image-output');
    assert.equal(resolution.targetPort.id, 'start-frame');
  }
});

test('subsequent IMAGE inputs fill end-frame and then ordered references', () => {
  const target = node('video', '视频');
  const startEdge = edge({ sourceNodeId: 'first', targetNodeId: 'video' });
  const endResolution = resolveConnectionPorts(node('second', '图片'), target, [startEdge]);
  assert.equal(endResolution.valid && endResolution.targetPort.id, 'end-frame');

  const referenceResolution = resolveConnectionPorts(node('third', '图片'), target, [
    startEdge,
    edge({ id: 'end', sourceNodeId: 'second', targetNodeId: 'video', targetPortId: 'end-frame' })
  ]);
  assert.equal(referenceResolution.valid && referenceResolution.targetPort.id, 'reference-images');
});

test('VIDEO chaining uses last frame normally and motion reference for Kling 2.6', () => {
  const source = node('source-video', '视频');
  const standard = resolveConnectionPorts(source, node('standard', '视频'), []);
  const motion = resolveConnectionPorts(source, node('motion', '视频', { videoModel: 'kling-v2-6' }), []);

  assert.equal(standard.valid && standard.sourcePort.id, 'last-frame-output');
  assert.equal(standard.valid && standard.targetPort.id, 'start-frame');
  assert.equal(motion.valid && motion.sourcePort.id, 'video-output');
  assert.equal(motion.valid && motion.targetPort.id, 'motion-reference');
});

test('a completely duplicate edge is rejected', () => {
  const source = node('source', '图片');
  const target = node('target', '视频');
  const sourcePort = getNodePort(source.type, 'image-output');
  const targetPort = getNodePort(target.type, 'start-frame');
  assert.ok(sourcePort && targetPort);

  const result = validateConnection({
    sourceNode: source,
    sourcePort,
    targetNode: target,
    targetPort,
    existingEdges: [edge()]
  });

  assert.equal(result.valid, false);
  assert.equal(result.code, 'duplicate_edge');
});

test('single connection input ports enforce their maximum', () => {
  const source = node('source-2', '图片');
  const target = node('target', '视频');
  const sourcePort = getNodePort(source.type, 'image-output');
  const targetPort = getNodePort(target.type, 'start-frame');
  assert.ok(sourcePort && targetPort);

  const result = validateConnection({
    sourceNode: source,
    sourcePort,
    targetNode: target,
    targetPort,
    existingEdges: [edge({ sourceNodeId: 'source-1' })]
  });

  assert.equal(result.valid, false);
  assert.equal(result.code, 'target_port_full');
});

test('self connections and graph cycles are rejected', () => {
  const image = node('image', '图片');
  const output = getNodePort(image.type, 'image-output');
  const input = getNodePort(image.type, 'reference-images');
  assert.ok(output && input);

  assert.equal(validateConnection({
    sourceNode: image,
    sourcePort: output,
    targetNode: image,
    targetPort: input,
    existingEdges: []
  }).code, 'self_connection');

  const source = node('source', '图片');
  const target = node('target', '图片');
  const result = validateConnection({
    sourceNode: source,
    sourcePort: output,
    targetNode: target,
    targetPort: input,
    existingEdges: [edge({
      id: 'reverse',
      sourceNodeId: 'target',
      sourcePortId: 'image-output',
      targetNodeId: 'source',
      targetPortId: 'reference-images'
    })]
  });

  assert.equal(result.code, 'cycle_detected');
});

test('missing ports and reversed port directions are rejected clearly', () => {
  const source = node('source', '图片');
  const target = node('target', '图片');
  const output = getNodePort(source.type, 'image-output');
  const input = getNodePort(target.type, 'reference-images');
  assert.ok(output && input);

  assert.equal(validateConnection({
    sourceNode: source,
    sourcePort: undefined,
    targetNode: target,
    targetPort: input,
    existingEdges: []
  }).code, 'missing_port');
  assert.equal(validateConnection({
    sourceNode: source,
    sourcePort: input,
    targetNode: target,
    targetPort: output,
    existingEdges: []
  }).code, 'invalid_source_direction');
});
