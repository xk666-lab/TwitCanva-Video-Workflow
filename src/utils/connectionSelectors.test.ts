import test from 'node:test';
import assert from 'node:assert/strict';

import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import type { NodeData, NodeType } from '../types.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import {
  getConnectedImageInputs,
  getConnectedSubjectInputs,
  getConnectedTextInputs,
  getAudioReferenceInput,
  getEndFrameInput,
  getStartFrameInput
} from '../domain/graph/connectionSelectors.ts';

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

function edge(
  id: string,
  sourceNodeId: string,
  sourcePortId: string,
  targetNodeId: string,
  targetPortId: string,
  dataType: CanvasEdge['dataType']
): CanvasEdge {
  return {
    schemaVersion: 1,
    id,
    sourceNodeId,
    sourcePortId,
    targetNodeId,
    targetPortId,
    dataType
  };
}

test('image generation resolves text and reference image inputs from edges', () => {
  const nodes = [
    node('text', '文本', { prompt: 'edge prompt' }),
    node('reference', '图片', { resultUrl: '/reference.png' }),
    node('target', '图片')
  ];
  const edges = [
    edge('text-edge', 'text', 'text-output', 'target', 'prompt-input', 'text'),
    edge('image-edge', 'reference', 'image-output', 'target', 'reference-images', 'image')
  ];

  assert.deepEqual(getConnectedTextInputs(nodes[2], nodes, edges).map(item => item.id), ['text']);
  assert.deepEqual(getConnectedImageInputs(nodes[2], nodes, edges).map(item => item.id), ['reference']);
});

test('video generation resolves start and end frames from typed edges', () => {
  const nodes = [node('start', '图片'), node('end', '图片'), node('video', '视频')];
  const edges = [
    edge('start-edge', 'start', 'image-output', 'video', 'start-frame', 'image'),
    edge('end-edge', 'end', 'image-output', 'video', 'end-frame', 'image')
  ];

  assert.equal(getStartFrameInput(nodes[2], nodes, edges)?.id, 'start');
  assert.equal(getEndFrameInput(nodes[2], nodes, edges)?.id, 'end');
});

test('audio reference selection is explicit to video nodes and ignores malformed targets', () => {
  const nodes = [node('audio', '音频', { resultUrl: '/library/audio/voice.mp3' }), node('video', '视频')];
  const audioEdge = edge('audio-edge', 'audio', 'audio-output', 'video', 'audio-reference', 'audio');

  assert.equal(getAudioReferenceInput(nodes[1], nodes, [audioEdge])?.id, 'audio');

  const malformedTarget = node('image', '图片');
  const malformedEdge = edge('malformed-audio-edge', 'audio', 'audio-output', 'image', 'audio-reference', 'audio');
  assert.equal(getAudioReferenceInput(malformedTarget, [nodes[0], malformedTarget], [malformedEdge]), undefined);
});

test('selectors fall back to parentIds and frameInputs when edges are absent', () => {
  const nodes = [
    node('text', '文本', { prompt: 'legacy prompt' }),
    node('start', '图片'),
    node('end', '图片'),
    node('video', '视频', {
      parentIds: ['text', 'end', 'start'],
      frameInputs: [
        { nodeId: 'start', order: 'start' },
        { nodeId: 'end', order: 'end' }
      ]
    })
  ];

  assert.deepEqual(getConnectedTextInputs(nodes[3], nodes, []).map(item => item.id), ['text']);
  assert.equal(getStartFrameInput(nodes[3], nodes, [])?.id, 'start');
  assert.equal(getEndFrameInput(nodes[3], nodes, [])?.id, 'end');
});

test('subject inputs are edge-first and never inferred from legacy parents', () => {
  const nodes = [
    node('subject', '主体', { subjectAssetId: 'asset-1' }),
    node('text', '文本'),
    node('target', '图片', { parentIds: ['subject'] })
  ];
  const subjectEdge = edge('subject-edge', 'subject', 'subject-output', 'target', 'subject-references', 'subject');
  const textEdge = edge('text-edge', 'text', 'text-output', 'target', 'prompt-input', 'text');

  assert.deepEqual(getConnectedSubjectInputs(nodes[2], nodes, [subjectEdge]).map(item => item.id), ['subject']);
  assert.deepEqual(getConnectedSubjectInputs(nodes[2], nodes, [textEdge]), []);
  assert.deepEqual(getConnectedSubjectInputs(nodes[2], nodes, []), []);
});

test('subject inputs ignore malformed image-output edges', () => {
  const nodes = [node('image', '图片'), node('target', '图片')];
  const malformedEdge = edge(
    'malformed-subject-edge',
    'image',
    'image-output',
    'target',
    'subject-references',
    'image'
  );

  assert.deepEqual(getConnectedSubjectInputs(nodes[1], nodes, [malformedEdge]), []);
});

test('subject inputs ignore malformed target ports on unsupported nodes', () => {
  const nodes = [node('subject', '主体'), node('editor', '图片编辑器')];
  const malformedEdge = edge(
    'malformed-target-port',
    'subject',
    'subject-output',
    'editor',
    'subject-references',
    'subject'
  );

  assert.deepEqual(getConnectedSubjectInputs(nodes[1], nodes, [malformedEdge]), []);
});
