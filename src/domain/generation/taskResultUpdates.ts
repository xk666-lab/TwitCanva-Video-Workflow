import type { NodeData } from '../../types.ts';
import type { NodeUpdateMap } from '../nodes/nodeUpdates.ts';
import type {
  GenerationTask,
  StoryPackageGenerationTaskOutput
} from './generationTask.ts';
import { buildGenerationTaskNodeUpdate } from '../../utils/generationTaskHelpers.ts';

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isStoryOutput(value: unknown): value is StoryPackageGenerationTaskOutput {
  const output = asRecord(value);
  return output.kind === 'story-package' && Boolean(output.scriptData) && Boolean(output.storyboardData);
}

function terminalErrorUpdate(task: GenerationTask): Partial<NodeData> {
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

function normalizeTaskProgress(progress: unknown): number | undefined {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return undefined;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function getUniqueActiveTaskIds(nodes: NodeData[]): string[] {
  return [...new Set(nodes.map(node => node.activeTaskId).filter((id): id is string => Boolean(id)))];
}

export async function recoverMissingMediaTaskNodes(
  nodes: NodeData[],
  requestedTaskIds: readonly string[],
  returnedTaskIds: ReadonlySet<string>,
  recoverNode: (nodeId: string, taskId: string) => Promise<void>
): Promise<void> {
  const requestedTaskIdSet = new Set(requestedTaskIds);
  const missingMediaTasks = nodes.filter(node => {
    const taskId = node.activeTaskId;
    return node.status === 'loading' &&
      Boolean(taskId) &&
      requestedTaskIdSet.has(taskId) &&
      !returnedTaskIds.has(taskId) &&
      !node.scriptData &&
      !node.storyboardData;
  });
  await Promise.all(missingMediaTasks.map(node => recoverNode(node.id, node.activeTaskId!)));
}

export function buildStoryTaskStartUpdates(
  nodes: NodeData[],
  task: GenerationTask
): NodeUpdateMap {
  if (task.operation !== 'generate-story-package') return {};
  const input = asRecord(task.inputSnapshot);
  const storyboardNodeId = typeof input.storyboardNodeId === 'string' ? input.storyboardNodeId : '';
  const script = nodes.find(node => node.id === task.nodeId);
  const storyboard = nodes.find(node => node.id === storyboardNodeId);
  if (!script?.scriptData || !storyboard?.storyboardData) return {};
  if (script.scriptData.revision !== input.scriptRevision) return {};
  if (storyboard.storyboardData.revision !== input.storyboardRevision) return {};
  const update = {
    status: 'loading' as NodeData['status'],
    activeTaskId: task.taskId,
    errorMessage: undefined,
    generationProgress: normalizeTaskProgress(task.progress),
    generationProgressMessage: task.progressMessage,
    generationStartTime: new Date(task.createdAt).getTime()
  };
  return { [script.id]: update, [storyboard.id]: update };
}

export function buildGenerationTaskNodeUpdates(
  nodes: NodeData[],
  task: GenerationTask
): NodeUpdateMap {
  if (task.operation !== 'generate-story-package') {
    const node = nodes.find(candidate => candidate.id === task.nodeId);
    if (!node) return {};
    const update = buildGenerationTaskNodeUpdate(node, task);
    return Object.keys(update).length > 0 ? { [node.id]: update } : {};
  }

  const input = asRecord(task.inputSnapshot);
  const storyboardNodeId = typeof input.storyboardNodeId === 'string' ? input.storyboardNodeId : '';
  const script = nodes.find(node => node.id === task.nodeId);
  const storyboard = nodes.find(node => node.id === storyboardNodeId);
  if (!script?.scriptData || !storyboard?.storyboardData) return {};
  if (script.activeTaskId !== task.taskId || storyboard.activeTaskId !== task.taskId) return {};
  if (script.scriptData.revision !== input.scriptRevision) return {};
  if (storyboard.storyboardData.revision !== input.storyboardRevision) return {};

  if (task.status === 'failed' || task.status === 'cancelled') {
    const error = terminalErrorUpdate(task);
    return { [script.id]: error, [storyboard.id]: error };
  }

  if (task.status !== 'succeeded' || !isStoryOutput(task.output)) {
    const loading = {
      status: 'loading' as NodeData['status'],
      activeTaskId: task.taskId,
      generationProgress: normalizeTaskProgress(task.progress),
      generationProgressMessage: task.progressMessage,
      errorMessage: undefined
    };
    return { [script.id]: loading, [storyboard.id]: loading };
  }

  if (task.output.scriptRevision !== input.scriptRevision) return {};
  if (task.output.storyboardRevision !== input.storyboardRevision) return {};
  return {
    [script.id]: {
      prompt: task.output.scriptData.sourceText,
      scriptData: task.output.scriptData,
      status: 'success' as NodeData['status'],
      activeTaskId: undefined,
      lastTaskId: task.taskId,
      errorMessage: undefined,
      generationProgress: undefined,
      generationProgressMessage: undefined,
      generationStartTime: undefined
    },
    [storyboard.id]: {
      storyboardData: task.output.storyboardData,
      status: 'success' as NodeData['status'],
      activeTaskId: undefined,
      lastTaskId: task.taskId,
      errorMessage: undefined,
      generationProgress: undefined,
      generationProgressMessage: undefined,
      generationStartTime: undefined
    }
  };
}
