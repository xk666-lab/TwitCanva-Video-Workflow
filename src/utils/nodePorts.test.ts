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

test('audio nodes expose an active output and videos expose an audio reference input', () => {
  const audioOutput = getNodePort('音频', 'audio-output');
  const videoAudioReference = getNodePort('视频', 'audio-reference');

  assert.equal(audioOutput?.direction, 'output');
  assert.equal(audioOutput?.dataType, 'audio');
  assert.notEqual(audioOutput?.enabled, false);
  assert.equal(videoAudioReference?.direction, 'input');
  assert.equal(videoAudioReference?.dataType, 'audio');
  assert.equal(videoAudioReference?.maxConnections, 1);
});

test('script and storyboard expose active typed ports', () => {
  assert.equal(getNodePort('脚本', 'text-input')?.dataType, 'text');
  assert.equal(getNodePort('脚本', 'script-output')?.dataType, 'script');
  assert.equal(getNodePort('分镜管理器', 'script-input')?.dataType, 'script');
  assert.equal(getNodePort('分镜管理器', 'storyboard-output')?.dataType, 'storyboard');
  assert.ok(getInputPorts('分镜管理器').every(port => port.enabled !== false));
  assert.ok(getOutputPorts('分镜管理器').every(port => port.enabled !== false));
});

test('subject node and supported targets expose active multi-subject ports', () => {
  const output = getNodePort('主体', 'subject-output');

  assert.equal(output?.direction, 'output');
  assert.equal(output?.dataType, 'subject');
  assert.equal(output?.multiple, true);

  for (const type of ['图片', '视频', '脚本', '分镜管理器']) {
    const input = getNodePort(type, 'subject-references');
    assert.equal(input?.direction, 'input', type);
    assert.equal(input?.label, '主体参考', type);
    assert.equal(input?.dataType, 'subject', type);
    assert.equal(input?.enabled, true, type);
    assert.equal(input?.multiple, true, type);
  }
});
