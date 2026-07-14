import test from 'node:test';
import assert from 'node:assert/strict';

import type { NodeType } from '../types.ts';
import { DEFAULT_SEEDANCE_VIDEO_MODEL_ID } from './videoModelRouting.ts';
import {
  createDefaultNodeData,
  getNodeCapabilities,
  getNodeDefinition,
  getNodeLabel,
  isKnownNodeType,
  listNodeDefinitions
} from '../domain/nodes/nodeRegistry.ts';

const NODE_TYPES = [
  '文本',
  '图片',
  '视频',
  '音频',
  '图片编辑器',
  '视频编辑器',
  '脚本',
  '分镜管理器',
  '镜头角度',
  '本地图片模型',
  '本地视频模型',
  '主体'
] as NodeType[];

test('registers every NodeType exactly once', () => {
  const definitions = listNodeDefinitions();
  const registeredTypes = definitions.map(definition => definition.type);

  assert.equal(definitions.length, NODE_TYPES.length);
  assert.deepEqual(new Set(registeredTypes), new Set(NODE_TYPES));

  for (const type of NODE_TYPES) {
    const definition = getNodeDefinition(type);
    assert.equal(definition?.type, type);
    assert.ok(definition?.label);
    assert.ok(definition?.icon);
    assert.ok(definition?.category);
    assert.equal(isKnownNodeType(type), true);
    assert.equal(getNodeLabel(type), definition?.label);
    assert.deepEqual(getNodeCapabilities(type), definition?.capabilities);
  }
});

test('every definition creates fresh, safe node defaults', () => {
  for (const type of NODE_TYPES) {
    const first = createDefaultNodeData(type);
    const second = createDefaultNodeData(type);

    assert.equal(first.type, type);
    assert.equal(first.prompt, '');
    assert.equal(first.status, 'idle');
    assert.equal(typeof first.model, 'string');
    assert.equal(typeof first.aspectRatio, 'string');
    assert.equal(typeof first.resolution, 'string');
    assert.notEqual(first, second);
  }
});

test('image and video defaults use the current production models', () => {
  const image = createDefaultNodeData('图片' as NodeType);
  const video = createDefaultNodeData('视频' as NodeType);

  assert.equal(image.model, 'gpt-image-2');
  assert.equal(image.imageModel, 'gpt-image-2');
  assert.equal(video.model, DEFAULT_SEEDANCE_VIDEO_MODEL_ID);
  assert.equal(video.videoModel, DEFAULT_SEEDANCE_VIDEO_MODEL_ID);
});

test('script and storyboard defaults contain fresh persistent documents', () => {
  const firstScript = createDefaultNodeData('脚本' as NodeType);
  const secondScript = createDefaultNodeData('脚本' as NodeType);
  const storyboard = createDefaultNodeData('分镜管理器' as NodeType);

  assert.equal(firstScript.model, 'auto-text');
  assert.equal(firstScript.scriptData?.sourceText, '');
  assert.notEqual(firstScript.scriptData, secondScript.scriptData);
  assert.equal(storyboard.model, 'auto-storyboard');
  assert.deepEqual(storyboard.storyboardData?.shots, []);
});

test('local model defaults remain specialized', () => {
  const image = createDefaultNodeData('本地图片模型' as NodeType);
  const video = createDefaultNodeData('本地视频模型' as NodeType);

  assert.equal(image.model, 'local');
  assert.equal(image.aspectRatio, '1:1');
  assert.equal(image.localModelType, 'diffusion');
  assert.equal(video.model, 'local');
  assert.equal(video.aspectRatio, '16:9');
  assert.equal(video.videoDuration, 5);
});

test('subject defaults create a typed source node', () => {
  const subject = createDefaultNodeData('主体' as NodeType);
  const text = createDefaultNodeData('文本' as NodeType);

  assert.equal(subject.type, '主体');
  assert.equal(subject.model, 'subject-reference');
  assert.equal(subject.subjectAssetId, undefined);
  assert.equal(text.model, 'Banana Pro');
});

test('unknown values are not treated as registered node types', () => {
  assert.equal(isKnownNodeType('Future Node'), false);
  assert.equal(getNodeDefinition('Future Node'), undefined);
  assert.equal(getNodeLabel('Future Node'), 'Future Node');
});
