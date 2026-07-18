import type { MediaTake, NodeData } from '../types.ts';
import type { MediaGenerationTaskOutput } from '../domain/generation/generationTask.ts';
import { buildGenerationSuccessUpdate } from './takeHelpers.ts';

const RESULT_NODE_HORIZONTAL_GAP = 405;
const RESULT_NODE_VERTICAL_GAP = 420;

function createDefaultNodeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Date.now().toString() + Math.random().toString(36).slice(2, 11);
}

function getImageTakes(result: MediaGenerationTaskOutput): MediaTake[] {
  return (result.takes || [])
    .filter(take => take.type === 'image' && Boolean(take.url));
}

function getPrimaryTakeIndex(result: MediaGenerationTaskOutput, imageTakes: MediaTake[]): number {
  const resultUrlIndex = imageTakes.findIndex(take => take.url === result.resultUrl);
  if (resultUrlIndex >= 0) return resultUrlIndex;

  const heroIndex = imageTakes.findIndex(take => take.isHero);
  if (heroIndex >= 0) return heroIndex;

  return 0;
}

function normalizeTakeForNode(take: MediaTake, nodeId: string): MediaTake {
  return {
    ...take,
    nodeId,
    isHero: true
  };
}

function getAdditionalNodePosition(sourceNode: NodeData, resultIndex: number): Pick<NodeData, 'x' | 'y'> {
  return {
    x: sourceNode.x + (resultIndex % 2) * RESULT_NODE_HORIZONTAL_GAP,
    y: sourceNode.y + Math.floor(resultIndex / 2) * RESULT_NODE_VERTICAL_GAP
  };
}

export interface PrimaryMediaResultUpdateOptions {
  extraUpdates?: Partial<NodeData>;
  clearActiveTask?: boolean;
  lastTaskId?: string;
}

export function buildPrimaryMediaResultUpdate(
  node: NodeData,
  result: MediaGenerationTaskOutput,
  options: PrimaryMediaResultUpdateOptions = {}
): Partial<NodeData> {
  const imageTakes = getImageTakes(result);
  const primaryTake = imageTakes.length > 0
    ? normalizeTakeForNode(imageTakes[getPrimaryTakeIndex(result, imageTakes)], node.id)
    : result.take;
  const primaryResult: MediaGenerationTaskOutput = primaryTake
    ? {
        ...result,
        resultUrl: primaryTake.url,
        take: primaryTake,
        takes: [primaryTake]
      }
    : result;

  return {
    ...buildGenerationSuccessUpdate(node, primaryResult, options.extraUpdates),
    ...(options.clearActiveTask ? { activeTaskId: undefined } : {}),
    ...(options.lastTaskId ? { lastTaskId: options.lastTaskId } : {}),
    generationProgress: undefined,
    generationProgressMessage: undefined,
    generationStartTime: undefined
  };
}

export interface ApplyMediaResultToCanvasNodesOptions extends PrimaryMediaResultUpdateOptions {
  expectedActiveTaskId?: string;
  idFactory?: () => string;
}

export interface ApplyMediaResultToCanvasNodesResult {
  nodes: NodeData[];
  applied: boolean;
  addedNodeIds: string[];
}

export function applyMediaResultToCanvasNodes(
  nodes: NodeData[],
  nodeId: string,
  result: MediaGenerationTaskOutput,
  options: ApplyMediaResultToCanvasNodesOptions = {}
): ApplyMediaResultToCanvasNodesResult {
  const sourceIndex = nodes.findIndex(node => node.id === nodeId);
  if (sourceIndex < 0) return { nodes, applied: false, addedNodeIds: [] };

  const sourceNode = nodes[sourceIndex];
  if (options.expectedActiveTaskId && sourceNode.activeTaskId !== options.expectedActiveTaskId) {
    return { nodes, applied: false, addedNodeIds: [] };
  }

  const imageTakes = getImageTakes(result);
  const primaryTakeIndex = imageTakes.length > 0 ? getPrimaryTakeIndex(result, imageTakes) : -1;
  const primaryUpdate = buildPrimaryMediaResultUpdate(sourceNode, result, {
    extraUpdates: options.extraUpdates,
    clearActiveTask: options.clearActiveTask ?? Boolean(options.expectedActiveTaskId),
    lastTaskId: options.lastTaskId
  });
  const nextNodes = nodes.map(node => node.id === nodeId ? { ...node, ...primaryUpdate } : node);

  if (imageTakes.length <= 1) {
    return { nodes: nextNodes, applied: true, addedNodeIds: [] };
  }

  const idFactory = options.idFactory || createDefaultNodeId;
  const resultAspectRatio = options.extraUpdates?.resultAspectRatio;
  const addedNodes = imageTakes
    .filter((_, index) => index !== primaryTakeIndex)
    .map((take, additionalIndex) => {
      const newNodeId = idFactory();
      const nodeTake = normalizeTakeForNode(take, newNodeId);
      return {
        ...sourceNode,
        ...getAdditionalNodePosition(sourceNode, additionalIndex + 1),
        id: newNodeId,
        status: 'success' as NodeData['status'],
        resultUrl: take.url,
        takes: [nodeTake],
        heroTakeId: nodeTake.id,
        imageCount: 1 as const,
        parentIds: [],
        groupId: undefined,
        activeTaskId: undefined,
        lastTaskId: options.lastTaskId,
        generationProgress: undefined,
        generationProgressMessage: undefined,
        generationStartTime: undefined,
        errorMessage: undefined,
        resultAspectRatio: typeof resultAspectRatio === 'string' ? resultAspectRatio : undefined
      };
    });

  return {
    nodes: [...nextNodes, ...addedNodes],
    applied: true,
    addedNodeIds: addedNodes.map(node => node.id)
  };
}
