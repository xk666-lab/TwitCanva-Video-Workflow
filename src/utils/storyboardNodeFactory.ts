import type { NodeData, NodeType } from '../types';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry.ts';

const IMAGE = '图片' as NodeType;

export interface StoryboardImageNodeInput {
  id: string;
  x: number;
  y: number;
  prompt: string;
  title: string;
  groupId: string;
  characterReferenceUrls?: string[];
  imageModel: string;
}

export function createStoryboardImageNode(input: StoryboardImageNodeInput): NodeData {
  return {
    ...createDefaultNodeData(IMAGE),
    id: input.id,
    x: input.x,
    y: input.y,
    prompt: input.prompt,
    model: input.imageModel,
    imageModel: input.imageModel,
    aspectRatio: '16:9',
    resolution: '1K',
    title: input.title,
    parentIds: [],
    groupId: input.groupId,
    characterReferenceUrls: input.characterReferenceUrls
  };
}
