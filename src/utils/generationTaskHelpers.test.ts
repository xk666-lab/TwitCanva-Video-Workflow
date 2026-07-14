import assert from 'node:assert/strict';
import test from 'node:test';

import type { GenerationTask } from '../domain/generation/generationTask.ts';
import type { NodeData } from '../types.ts';
import {
  buildGenerationTaskNodeUpdate,
  canApplyGenerationTaskResult
} from './generationTaskHelpers.ts';

function createNode(overrides: Partial<NodeData> = {}): NodeData {
  return {
    id: 'node-1',
    type: '图片' as NodeData['type'],
    x: 0,
    y: 0,
    prompt: 'A test image',
    status: 'loading' as NodeData['status'],
    model: 'Banana Pro',
    imageModel: 'gpt-image-2',
    aspectRatio: '1:1',
    resolution: '1K',
    activeTaskId: 'task-current',
    ...overrides
  };
}

function createTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schemaVersion: 1,
    taskId: 'task-current',
    workflowId: 'workflow-1',
    nodeId: 'node-1',
    operation: 'generate-image',
    provider: 'openai',
    model: 'gpt-image-2',
    status: 'succeeded',
    progress: 100,
    inputSnapshot: { prompt: 'A test image' },
    inputHash: 'a'.repeat(64),
    parameters: {},
    output: {
      resultUrl: '/library/images/result.png',
      take: {
        id: 'take-1',
        nodeId: 'node-1',
        type: 'image',
        url: '/library/images/result.png',
        prompt: 'A test image',
        model: 'gpt-image-2',
        createdAt: '2026-01-01T00:00:00.000Z',
        isHero: true
      }
    },
    attempt: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    completedAt: '2026-01-01T00:01:00.000Z',
    ...overrides
  };
}

test('only the node active task may apply a generation result', () => {
  assert.equal(canApplyGenerationTaskResult(createNode(), createTask()), true);
  assert.equal(canApplyGenerationTaskResult(createNode({ activeTaskId: 'task-newer' }), createTask()), false);
  assert.equal(canApplyGenerationTaskResult(createNode({ id: 'other-node' }), createTask()), false);
  assert.deepEqual(
    buildGenerationTaskNodeUpdate(createNode({ activeTaskId: 'task-newer' }), createTask()),
    {}
  );
});

test('successful task update appends its take and clears the active task', () => {
  const update = buildGenerationTaskNodeUpdate(createNode(), createTask());
  assert.equal(update.status, 'success');
  assert.equal(update.resultUrl, '/library/images/result.png');
  assert.equal(update.heroTakeId, 'take-1');
  assert.equal(update.activeTaskId, undefined);
  assert.equal(update.lastTaskId, 'task-current');
});

test('story package output does not enter the generic media success path', () => {
  const update = buildGenerationTaskNodeUpdate(createNode(), createTask({
    operation: 'generate-story-package',
    output: {
      kind: 'story-package',
      resultUrl: '/library/images/should-not-be-used.png',
      scriptRevision: 0,
      storyboardRevision: 0,
      scriptData: {} as never,
      storyboardData: {} as never
    } as never
  }));

  assert.equal(update.status, 'loading');
  assert.equal(update.resultUrl, undefined);
  assert.equal(update.activeTaskId, 'task-current');
});

test('failed and cancelled tasks become retryable compatibility errors', () => {
  const failed = buildGenerationTaskNodeUpdate(createNode(), createTask({
    status: 'failed',
    progress: 0,
    output: undefined,
    error: { code: 'PROVIDER_TIMEOUT', message: 'Timed out', retryable: true }
  }));
  assert.equal(failed.status, 'error');
  assert.equal(failed.errorMessage, 'Timed out');
  assert.equal(failed.activeTaskId, undefined);

  const cancelled = buildGenerationTaskNodeUpdate(createNode(), createTask({
    status: 'cancelled',
    progress: 0,
    output: undefined,
    error: { code: 'CANCELLED', message: 'Cancellation requested', retryable: true }
  }));
  assert.equal(cancelled.status, 'error');
  assert.equal(cancelled.errorMessage, 'Cancellation requested');
});
