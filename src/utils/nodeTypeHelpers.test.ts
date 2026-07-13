import test from 'node:test';
import assert from 'node:assert/strict';

import type { NodeData, NodeStatus, NodeType } from '../types.ts';
import { normalizeNodeType, normalizeWorkflowNode } from './nodeTypeHelpers.ts';

function node(overrides: Partial<NodeData> = {}): NodeData {
  return {
    id: 'node-1',
    type: '图片' as NodeType,
    x: 0,
    y: 0,
    prompt: '',
    status: 'idle' as NodeStatus,
    model: 'gpt-image-2',
    aspectRatio: '16:9',
    resolution: '1K',
    ...overrides
  };
}

test('normalizeNodeType maps legacy English and mojibake values to the current enum', () => {
  assert.equal(normalizeNodeType('Image'), '图片');
  assert.equal(normalizeNodeType('Video Editor'), '视频编辑器');
  assert.equal(normalizeNodeType('鍥剧墖'), '图片');
  assert.equal(normalizeNodeType('瑙嗛'), '视频');
  assert.equal(normalizeNodeType('文本'), '文本');
});

test('normalizeWorkflowNode normalizes node type without mutating other node fields', () => {
  const normalized = normalizeWorkflowNode(node({
    type: 'Image' as NodeType,
    title: 'Legacy title'
  }));

  assert.equal(normalized.type, '图片');
  assert.equal(normalized.title, 'Legacy title');
});
