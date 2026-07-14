import type { ImageEditMode, NodeData } from '../../types.ts';
import { getHeroTake } from '../../utils/takeHelpers.ts';
import { getConnectedImageInputs } from '../graph/connectionSelectors.ts';
import {
  CURRENT_EDGE_SCHEMA_VERSION,
  type CanvasEdge
} from '../graph/graphTypes.ts';
import { createDefaultNodeData } from '../nodes/nodeRegistry.ts';

export interface ImageEditSource {
  nodeId: string;
  takeId?: string;
  url: string;
}

export interface ImageEditProvenance {
  mode: ImageEditMode;
  sourceNodeId: string;
  sourceTakeId?: string;
  editorNodeId: string;
}

export interface ImageEditTaskInput {
  nodeId: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  imageModel: string;
  imageBase64: string;
  imageEdit: ImageEditProvenance;
}

export interface ImageEditGenerationRequest {
  editorNodeId: string;
  source: ImageEditSource;
  prompt: string;
  mode: ImageEditMode;
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  count: number;
}

export interface CreateImageEditDerivationsInput {
  editorNode: NodeData;
  source: ImageEditSource;
  prompt: string;
  mode: ImageEditMode;
  imageModel: string;
  aspectRatio: string;
  resolution: string;
  count: number;
  createId?: () => string;
}

export interface ImageEditDerivations {
  nodes: NodeData[];
  edges: CanvasEdge[];
  taskInputs: ImageEditTaskInput[];
}

function sourceFromNode(node: NodeData | undefined): ImageEditSource | null {
  if (!node) return null;
  const take = getHeroTake(node);
  if (!take?.url) return null;

  return {
    nodeId: node.id,
    ...(take.id ? { takeId: take.id } : {}),
    url: take.url
  };
}

export function resolveEditorImageSource(
  editorNode: NodeData,
  nodes: NodeData[],
  edges: CanvasEdge[]
): ImageEditSource | null {
  // A persisted editor result is the user's latest non-destructive edit.
  const ownSource = sourceFromNode(editorNode);
  if (ownSource) return ownSource;

  const connectedInput = getConnectedImageInputs(editorNode, nodes, edges)[0];
  return sourceFromNode(connectedInput);
}

export function buildImageEditPrompt(mode: ImageEditMode, prompt: string): string {
  const instruction = prompt.trim();
  if (!instruction) throw new Error('An edit prompt is required');

  if (mode === 'expand') {
    return [
      'Extend the image naturally to fill the requested composition while preserving the main subject and visual style.',
      instruction
    ].join('\n\n');
  }

  return instruction;
}

export function createImageEditDerivations(
  input: CreateImageEditDerivationsInput
): ImageEditDerivations {
  const sourceUrl = input.source.url.trim();
  if (!sourceUrl) throw new Error('A source image is required for image editing');

  const count = Math.max(1, Math.min(4, Math.floor(input.count || 1)));
  const prompt = buildImageEditPrompt(input.mode, input.prompt);
  const createId = input.createId || (() => crypto.randomUUID());
  const startX = input.editorNode.x + 360;
  const yStep = 500;
  const startY = input.editorNode.y - ((count - 1) * yStep) / 2;

  const nodes: NodeData[] = Array.from({ length: count }, (_, index) => ({
    ...createDefaultNodeData('图片' as NodeData['type']),
    id: createId(),
    x: startX,
    y: startY + index * yStep,
    prompt,
    status: 'idle' as NodeData['status'],
    model: input.imageModel,
    imageModel: input.imageModel,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    parentIds: []
  }));

  const createdAt = new Date().toISOString();
  const edges: CanvasEdge[] = nodes.map(node => ({
    schemaVersion: CURRENT_EDGE_SCHEMA_VERSION,
    id: `image-edit-${input.editorNode.id}-${node.id}`,
    sourceNodeId: input.editorNode.id,
    sourcePortId: 'image-output',
    targetNodeId: node.id,
    targetPortId: 'reference-images',
    dataType: 'image',
    metadata: {
      operation: 'edit-image',
      mode: input.mode
    },
    createdAt
  }));

  const taskInputs: ImageEditTaskInput[] = nodes.map(node => ({
    nodeId: node.id,
    prompt,
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    imageModel: input.imageModel,
    imageBase64: sourceUrl,
    imageEdit: {
      mode: input.mode,
      sourceNodeId: input.source.nodeId,
      ...(input.source.takeId ? { sourceTakeId: input.source.takeId } : {}),
      editorNodeId: input.editorNode.id
    }
  }));

  return { nodes, edges, taskInputs };
}
