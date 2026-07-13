import test from 'node:test';
import assert from 'node:assert/strict';

import { getInputPorts, getNodePort, getOutputPorts, listNodeDefinitions } from '../domain/nodes/nodeRegistry.ts';

test('every registered node has stable port ids unique within its definition', () => {
  for (const definition of listNodeDefinitions()) {
    const ids = definition.ports.map(port => port.id);
    assert.equal(new Set(ids).size, ids.length, definition.label);
    assert.ok(ids.every(id => /^[a-z0-9-]+$/.test(id)), definition.label);
  }
});

test('input and output port helpers only return ports in the requested direction', () => {
  for (const definition of listNodeDefinitions()) {
    assert.ok(getInputPorts(definition.type).every(port => port.direction === 'input'));
    assert.ok(getOutputPorts(definition.type).every(port => port.direction === 'output'));
  }
});

test('core generation nodes expose the expected typed ports', () => {
  assert.equal(getNodePort('文本', 'text-output')?.dataType, 'text');
  assert.equal(getNodePort('图片', 'prompt-input')?.dataType, 'text');
  assert.equal(getNodePort('图片', 'reference-images')?.multiple, true);
  assert.equal(getNodePort('视频', 'start-frame')?.dataType, 'image');
  assert.equal(getNodePort('视频', 'end-frame')?.dataType, 'image');
  assert.equal(getNodePort('视频', 'motion-reference')?.dataType, 'video');
  assert.equal(getNodePort('视频', 'last-frame-output')?.dataType, 'image');
});

test('audio and storyboard ports are defined but disabled for this phase', () => {
  assert.ok(getInputPorts('音频').every(port => port.enabled === false));
  assert.ok(getOutputPorts('音频').every(port => port.enabled === false));
  assert.ok(getOutputPorts('分镜管理器').every(port => port.enabled === false));
});
