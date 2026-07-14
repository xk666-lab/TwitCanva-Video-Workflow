import type { GenerationTask } from '../domain/generation/generationTask.ts';
import type { NodeData } from '../types.ts';
import { buildGenerationSuccessUpdate } from './takeHelpers.ts';

export function canApplyGenerationTaskResult(node: NodeData, task: GenerationTask): boolean {
  return node.id === task.nodeId && node.activeTaskId === task.taskId;
}

export function buildGenerationTaskNodeUpdate(
  node: NodeData,
  task: GenerationTask
): Partial<NodeData> {
  if (!canApplyGenerationTaskResult(node, task)) return {};

  if (
    task.status === 'succeeded'
    && task.output?.kind !== 'story-package'
    && task.output?.resultUrl
  ) {
    return {
      ...buildGenerationSuccessUpdate(node, task.output),
      activeTaskId: undefined,
      lastTaskId: task.taskId
    };
  }

  if (task.status === 'failed' || task.status === 'cancelled') {
    return {
      status: 'error' as NodeData['status'],
      errorMessage: task.error?.message || (task.status === 'cancelled'
        ? 'Generation was cancelled.'
        : 'Generation failed.'),
      activeTaskId: undefined,
      lastTaskId: task.taskId,
      generationStartTime: undefined
    };
  }

  return {
    status: 'loading' as NodeData['status'],
    activeTaskId: task.taskId,
    errorMessage: undefined
  };
}
