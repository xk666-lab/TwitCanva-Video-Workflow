import type { MediaTake, NodeData } from '../types';

function inferTakeType(node: Pick<NodeData, 'type' | 'resultUrl'>): MediaTake['type'] {
  const resultUrl = node.resultUrl || '';
  if (/\/videos\/|\.mp4(?:\?|$)|data:video\//i.test(resultUrl)) return 'video';

  const typeLabel = String(node.type || '').toLowerCase();
  if (typeLabel.includes('video') || typeLabel.includes('视频')) return 'video';

  return 'image';
}

function legacyTakeForNode(node: NodeData): MediaTake | null {
  if (!node.resultUrl) return null;

  return {
    id: `legacy-${node.id}`,
    nodeId: node.id,
    type: inferTakeType(node),
    url: node.resultUrl,
    prompt: node.prompt || '',
    model: node.videoModel || node.imageModel || node.model || '',
    createdAt: new Date(0).toISOString(),
    isHero: true
  };
}

export function getHeroTake(node: NodeData): MediaTake | null {
  const takes = node.takes || [];
  if (node.heroTakeId) {
    const heroById = takes.find(take => take.id === node.heroTakeId);
    if (heroById) return heroById;
  }

  const flaggedHero = takes.find(take => take.isHero);
  if (flaggedHero) return flaggedHero;

  if (takes.length > 0) return takes[takes.length - 1];

  return legacyTakeForNode(node);
}

export function normalizeLegacyNodeTakes(node: NodeData): NodeData {
  if (!node.resultUrl) return node;

  const existingTakes = node.takes || [];
  if (existingTakes.length > 0) {
    const hero = getHeroTake(node);
    if (!hero) return node;

    return {
      ...node,
      heroTakeId: hero.id,
      resultUrl: hero.url,
      takes: existingTakes.map(take => ({
        ...take,
        isHero: take.id === hero.id
      }))
    };
  }

  const legacyTake = legacyTakeForNode(node);
  if (!legacyTake) return node;

  return {
    ...node,
    heroTakeId: legacyTake.id,
    resultUrl: legacyTake.url,
    takes: [legacyTake]
  };
}

export function appendHeroTake(node: NodeData, take: MediaTake): NodeData {
  const normalizedNode = normalizeLegacyNodeTakes(node);
  const existingTakes = (normalizedNode.takes || []).filter(existingTake => existingTake.id !== take.id);
  const heroTake = { ...take, isHero: true };

  return {
    ...normalizedNode,
    heroTakeId: heroTake.id,
    resultUrl: heroTake.url,
    takes: [
      ...existingTakes.map(existingTake => ({ ...existingTake, isHero: false })),
      heroTake
    ]
  };
}

export interface GenerationSuccessResult {
  resultUrl: string;
  take?: MediaTake;
}

export function buildGenerationSuccessUpdate(
  node: NodeData,
  result: GenerationSuccessResult,
  extraUpdates: Partial<NodeData> = {}
): Partial<NodeData> {
  const updates: Partial<NodeData> = {
    status: 'success' as NodeData['status'],
    resultUrl: result.resultUrl,
    errorMessage: undefined,
    generationStartTime: undefined,
    ...extraUpdates
  };

  if (!result.take) return updates;

  const nodeWithTake = appendHeroTake(node, result.take);
  return {
    ...updates,
    resultUrl: nodeWithTake.resultUrl,
    takes: nodeWithTake.takes,
    heroTakeId: nodeWithTake.heroTakeId
  };
}
