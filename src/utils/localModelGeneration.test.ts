import assert from 'node:assert/strict';
import test from 'node:test';

import { generateLocalImage } from '../services/localModelService.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

test('local image generation uses the shared persistent task API', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const urls: string[] = [];
  const queued = {
    schemaVersion: 1,
    taskId: 'local-task-1',
    workflowId: null,
    nodeId: 'local-node',
    operation: 'generate-local-image',
    provider: 'local',
    model: 'local-model-1',
    status: 'queued',
    progress: 0,
    inputSnapshot: { nodeId: 'local-node', modelId: 'local-model-1', prompt: 'Local city' },
    inputHash: 'a'.repeat(64),
    parameters: {},
    rootTaskId: 'local-task-1',
    attempt: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const succeeded = {
    ...queued,
    status: 'succeeded',
    progress: 100,
    output: { resultUrl: '/library/images/local.png' }
  };
  const responses = [jsonResponse({ task: queued }, 202), jsonResponse({ task: succeeded })];
  globalThis.fetch = async input => {
    urls.push(String(input));
    const response = responses.shift();
    assert.ok(response);
    return response;
  };
  let announcedTaskId: string | undefined;

  const result = await generateLocalImage({
    nodeId: 'local-node',
    modelId: 'local-model-1',
    prompt: 'Local city'
  }, {
    pollIntervalMs: 0,
    onTaskCreated: task => { announcedTaskId = task.taskId; }
  });

  assert.equal(result.success, true);
  assert.equal(result.resultUrl, '/library/images/local.png');
  assert.equal(result.task?.taskId, 'local-task-1');
  assert.equal(announcedTaskId, 'local-task-1');
  assert.deepEqual(urls, ['/api/generation-tasks', '/api/generation-tasks/local-task-1']);
});
