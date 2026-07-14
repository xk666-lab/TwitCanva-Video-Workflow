import assert from 'node:assert/strict';
import test from 'node:test';

import type { GenerationTask } from '../domain/generation/generationTask.ts';
import { buildGenerationTaskNodeUpdates } from '../domain/generation/taskResultUpdates.ts';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';
import { applyNodeUpdateMap } from '../domain/nodes/nodeUpdates.ts';
import type { NodeData } from '../types.ts';

function nodes(): NodeData[] {
  return [
    {
      ...createDefaultNodeData('脚本' as NodeData['type']),
      id: 'script-1',
      x: 0,
      y: 0,
      parentIds: [],
      status: 'loading' as NodeData['status'],
      activeTaskId: 'task-1',
      scriptData: {
        ...createDefaultNodeData('脚本' as NodeData['type']).scriptData!,
        sourceText: 'A paper moon',
        revision: 2
      }
    },
    {
      ...createDefaultNodeData('分镜管理器' as NodeData['type']),
      id: 'storyboard-1',
      x: 440,
      y: 0,
      parentIds: ['script-1'],
      status: 'loading' as NodeData['status'],
      activeTaskId: 'task-1',
      storyboardData: {
        ...createDefaultNodeData('分镜管理器' as NodeData['type']).storyboardData!,
        sourceScriptNodeId: 'script-1',
        revision: 4
      }
    }
  ];
}

function task(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schemaVersion: 1,
    taskId: 'task-1',
    workflowId: 'workflow-1',
    nodeId: 'script-1',
    operation: 'generate-story-package',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    status: 'succeeded',
    progress: 100,
    inputSnapshot: {
      nodeId: 'script-1',
      storyboardNodeId: 'storyboard-1',
      scriptRevision: 2,
      storyboardRevision: 4
    },
    inputHash: 'a'.repeat(64),
    parameters: {},
    output: {
      kind: 'story-package',
      scriptRevision: 2,
      storyboardRevision: 4,
      scriptData: {
        ...nodes()[0].scriptData!,
        synopsis: 'A moon made of paper crosses the city',
        revision: 3,
        generatedBy: { taskId: 'task-1', provider: 'openai', model: 'gpt-4.1-mini' }
      },
      storyboardData: {
        ...nodes()[1].storyboardData!,
        revision: 5,
        shots: [{
          id: 'shot-1',
          order: 0,
          sceneNumber: 1,
          description: 'The moon unfolds above the skyline',
          cameraAngle: 'Wide shot',
          mood: 'Wonder',
          status: 'ready',
          revision: 0
        }],
        generatedBy: { taskId: 'task-1', provider: 'openai', model: 'gpt-4.1-mini' }
      }
    },
    attempt: 1,
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:01:00.000Z',
    completedAt: '2026-07-14T00:01:00.000Z',
    ...overrides
  };
}

test('story package success updates both nodes only when task and revisions match', () => {
  const updates = buildGenerationTaskNodeUpdates(nodes(), task());

  assert.deepEqual(Object.keys(updates).sort(), ['script-1', 'storyboard-1']);
  assert.equal(updates['script-1'].status, 'success');
  assert.equal(updates['script-1'].scriptData?.revision, 3);
  assert.equal(updates['storyboard-1'].storyboardData?.shots.length, 1);
  assert.equal(updates['storyboard-1'].activeTaskId, undefined);
});

test('a stale task returns no partial updates', () => {
  const changed = nodes();
  changed[1] = {
    ...changed[1],
    storyboardData: { ...changed[1].storyboardData!, revision: 5 }
  };

  assert.deepEqual(buildGenerationTaskNodeUpdates(changed, task()), {});
  assert.deepEqual(buildGenerationTaskNodeUpdates(nodes(), task({ taskId: 'task-old' })), {});
});

test('a script revision mismatch returns no partial story package update', () => {
  const changed = nodes();
  changed[0] = {
    ...changed[0],
    scriptData: { ...changed[0].scriptData!, revision: 3 }
  };

  assert.deepEqual(buildGenerationTaskNodeUpdates(changed, task()), {});
});

test('story package failure marks both bound nodes retryable without deleting documents', () => {
  const updates = buildGenerationTaskNodeUpdates(nodes(), task({
    status: 'failed',
    progress: 0,
    output: undefined,
    error: { code: 'PROVIDER_TIMEOUT', message: 'Timed out', retryable: true }
  }));

  assert.equal(updates['script-1'].status, 'error');
  assert.equal(updates['storyboard-1'].status, 'error');
  assert.equal(updates['script-1'].lastTaskId, 'task-1');
  assert.ok(nodes()[0].scriptData);
});

test('story package cancellation marks both matching nodes terminal without replacing documents', () => {
  const currentNodes = nodes();
  const scriptDocument = currentNodes[0].scriptData;
  const storyboardDocument = currentNodes[1].storyboardData;
  const updates = buildGenerationTaskNodeUpdates(currentNodes, task({
    status: 'cancelled',
    progress: 0,
    output: undefined,
    error: { code: 'CANCELLED', message: 'Cancellation requested', retryable: true }
  }));

  assert.deepEqual(Object.keys(updates).sort(), ['script-1', 'storyboard-1']);
  assert.equal(updates['script-1'].status, 'error');
  assert.equal(updates['storyboard-1'].status, 'error');
  assert.equal(updates['script-1'].errorMessage, 'Cancellation requested');
  assert.equal(updates['storyboard-1'].errorMessage, 'Cancellation requested');
  assert.equal(updates['script-1'].activeTaskId, undefined);
  assert.equal(updates['storyboard-1'].activeTaskId, undefined);

  const updatedNodes = applyNodeUpdateMap(currentNodes, updates);
  assert.equal(updatedNodes[0].scriptData, scriptDocument);
  assert.equal(updatedNodes[1].storyboardData, storyboardDocument);
});
