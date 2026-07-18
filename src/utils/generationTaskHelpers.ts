import type {
  GenerationTask,
  MediaGenerationTaskOutput
} from '../domain/generation/generationTask.ts';
import type { NodeData } from '../types.ts';
import { buildPrimaryMediaResultUpdate } from './mediaResultNodes.ts';

function normalizeTaskProgress(progress: unknown): number | undefined {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return undefined;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function isMediaGenerationTaskOutput(
  output: unknown
): output is MediaGenerationTaskOutput {
  if (output === null || typeof output !== 'object' || Array.isArray(output)) {
    return false;
  }

  const candidate = output as { kind?: unknown; resultUrl?: unknown };
  return (candidate.kind === undefined || candidate.kind === 'media')
    && typeof candidate.resultUrl === 'string'
    && candidate.resultUrl.length > 0;
}

export function canApplyGenerationTaskResult(node: NodeData, task: GenerationTask): boolean {
  return node.id === task.nodeId && node.activeTaskId === task.taskId;
}

export function buildGenerationTaskNodeUpdate(
  node: NodeData,
  task: GenerationTask
): Partial<NodeData> {
  if (!canApplyGenerationTaskResult(node, task)) return {};

  if (task.status === 'succeeded' && isMediaGenerationTaskOutput(task.output)) {
    return buildPrimaryMediaResultUpdate(node, task.output, {
      clearActiveTask: true,
      lastTaskId: task.taskId
    });
  }

  if (task.status === 'failed' || task.status === 'cancelled') {
    return {
      status: 'error' as NodeData['status'],
      errorMessage: task.error?.message || (task.status === 'cancelled'
        ? 'Generation was cancelled.'
        : 'Generation failed.'),
      activeTaskId: undefined,
      lastTaskId: task.taskId,
      generationProgress: undefined,
      generationProgressMessage: undefined,
      generationStartTime: undefined
    };
  }

  return {
    status: 'loading' as NodeData['status'],
    activeTaskId: task.taskId,
    generationProgress: normalizeTaskProgress(task.progress),
    generationProgressMessage: task.progressMessage,
    errorMessage: undefined
  };
}
