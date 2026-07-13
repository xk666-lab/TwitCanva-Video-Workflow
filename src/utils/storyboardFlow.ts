import { normalizeNodeType } from './nodeTypeHelpers.ts';

const IMAGE_TYPE = '\u56fe\u7247';

interface StoryboardReadinessNode {
  id: string;
  type: unknown;
  groupId?: string;
  status?: string;
  resultUrl?: string;
}

export interface StoryboardVideoReadiness {
  isComplete: boolean;
  readyNodeIds: string[];
}

export function getStoryboardVideoReadiness(
  nodes: StoryboardReadinessNode[],
  groupId: string
): StoryboardVideoReadiness {
  const imageNodes = nodes.filter(node =>
    node.groupId === groupId && normalizeNodeType(node.type) === IMAGE_TYPE
  );

  const readyNodeIds = imageNodes
    .filter(node => !!node.resultUrl)
    .map(node => node.id);

  const isComplete = imageNodes.length > 0
    && imageNodes.every(node => !!node.resultUrl || node.status === 'error');

  return {
    isComplete,
    readyNodeIds
  };
}
