import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cancelGenerationTask,
  generateImage,
  queryGenerationTasks,
  retryGenerationTask,
  submitImageGeneration
} from '../services/generationService.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('generateImage submits a persistent task, reports its id, and waits for terminal output', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const queuedTask = {
    schemaVersion: 1,
    taskId: 'task-1',
    workflowId: 'workflow-1',
    nodeId: 'node-1',
    operation: 'generate-image',
    provider: 'openai',
    model: 'gpt-image-2',
    status: 'queued',
    progress: 0,
    inputSnapshot: { prompt: 'A paper city', imageModel: 'gpt-image-2', nodeId: 'node-1' },
    inputHash: 'a'.repeat(64),
    parameters: {},
    rootTaskId: 'task-1',
    attempt: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const succeededTask = {
    ...queuedTask,
    status: 'succeeded',
    progress: 100,
    output: {
      resultUrl: '/library/images/result.png'
    },
    completedAt: '2026-01-01T00:01:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z'
  };
  const responses = [
    jsonResponse({ task: queuedTask, reused: false }, 202),
    jsonResponse({ task: succeededTask })
  ];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    assert.ok(response, 'Unexpected extra fetch call');
    return response;
  };
  let announcedTaskId: string | undefined;

  const result = await generateImage({
    prompt: 'A paper city',
    imageModel: 'gpt-image-2',
    nodeId: 'node-1'
  }, {
    workflowId: 'workflow-1',
    pollIntervalMs: 0,
    onTaskCreated: task => { announcedTaskId = task.taskId; }
  });

  assert.equal(announcedTaskId, 'task-1');
  assert.equal(result.resultUrl, '/library/images/result.png');
  assert.equal(result.task.taskId, 'task-1');
  assert.deepEqual(requests.map(request => request.url), [
    '/api/generation-tasks',
    '/api/generation-tasks/task-1'
  ]);
  const submission = JSON.parse(String(requests[0].init?.body));
  assert.equal(submission.operation, 'generate-image');
  assert.equal(submission.workflowId, 'workflow-1');
});

test('task control helpers use batch query, cancellation, and linked retry endpoints', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const task = {
    schemaVersion: 1,
    taskId: 'task-1',
    workflowId: 'workflow-1',
    nodeId: 'node-1',
    operation: 'generate-image',
    provider: 'openai',
    model: 'gpt-image-2',
    status: 'failed',
    progress: 0,
    inputSnapshot: { prompt: 'A paper city' },
    inputHash: 'a'.repeat(64),
    parameters: {},
    error: { code: 'PROVIDER_TIMEOUT', message: 'Timed out', retryable: true },
    rootTaskId: 'task-1',
    attempt: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z'
  };
  const urls: string[] = [];
  const responses = [
    jsonResponse({ tasks: [task] }),
    jsonResponse({ task: { ...task, status: 'cancelled' } }),
    jsonResponse({ task: { ...task, taskId: 'task-2', status: 'queued', retryOfTaskId: 'task-1' } }, 202)
  ];
  globalThis.fetch = async input => {
    urls.push(String(input));
    const response = responses.shift();
    assert.ok(response);
    return response;
  };

  assert.equal((await queryGenerationTasks({ taskIds: ['task-1'] })).length, 1);
  assert.equal((await cancelGenerationTask('task-1')).status, 'cancelled');
  assert.equal((await retryGenerationTask('task-1')).retryOfTaskId, 'task-1');
  assert.deepEqual(urls, [
    '/api/generation-tasks/query',
    '/api/generation-tasks/task-1/cancel',
    '/api/generation-tasks/task-1/retry'
  ]);
});

test('submitImageGeneration returns after task creation without starting a per-node poll loop', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const queuedTask = {
    schemaVersion: 1,
    taskId: 'task-submit-only',
    workflowId: null,
    nodeId: 'node-1',
    operation: 'generate-image',
    provider: 'openai',
    model: 'gpt-image-2',
    status: 'queued',
    progress: 0,
    inputSnapshot: { nodeId: 'node-1', prompt: 'Submit only' },
    inputHash: 'a'.repeat(64),
    parameters: {},
    rootTaskId: 'task-submit-only',
    attempt: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return jsonResponse({ task: queuedTask }, 202);
  };

  const task = await submitImageGeneration({
    nodeId: 'node-1',
    prompt: 'Submit only',
    imageModel: 'gpt-image-2'
  });

  assert.equal(task.taskId, 'task-submit-only');
  assert.equal(fetchCount, 1);
});

test('submitStoryPackageGeneration uses the shared task endpoint without polling', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return jsonResponse({
      task: {
        schemaVersion: 1,
        taskId: 'story-task',
        workflowId: 'workflow-1',
        nodeId: 'script-1',
        operation: 'generate-story-package',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        status: 'queued',
        progress: 0,
        inputSnapshot: requestBody?.inputSnapshot,
        inputHash: 'a'.repeat(64),
        parameters: {},
        attempt: 1,
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z'
      }
    }, 202);
  };

  const { submitStoryPackageGeneration } = await import('../services/generationService.ts');
  const task = await submitStoryPackageGeneration({
    nodeId: 'script-1',
    scriptNodeId: 'script-1',
    storyboardNodeId: 'storyboard-1',
    scriptRevision: 0,
    storyboardRevision: 0,
    generationMode: 'story-package',
    sourceText: 'A paper moon',
    sceneCount: 3,
    referenceAssets: [],
    selectedImageModel: 'gpt-image-2',
    scriptData: {} as never,
    storyboardData: {} as never
  }, { workflowId: 'workflow-1' });

  assert.equal(task.taskId, 'story-task');
  assert.equal(requestBody?.operation, 'generate-story-package');
});
