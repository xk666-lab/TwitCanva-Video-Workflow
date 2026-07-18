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

export function appendHeroTakes(node: NodeData, takes: MediaTake[]): NodeData {
  if (takes.length === 0) return node;

  const normalizedNode = normalizeLegacyNodeTakes(node);
  const incomingIds = new Set(takes.map(take => take.id));
  const existingTakes = (normalizedNode.takes || []).filter(existingTake => !incomingIds.has(existingTake.id));
  const heroTake = takes.find(take => take.isHero) || takes[0];

  return {
    ...normalizedNode,
    heroTakeId: heroTake.id,
    resultUrl: heroTake.url,
    takes: [
      ...existingTakes.map(existingTake => ({ ...existingTake, isHero: false })),
      ...takes.map(take => ({ ...take, isHero: take.id === heroTake.id }))
    ]
  };
}

export function selectHeroTake(node: NodeData, takeId: string): NodeData {
  const normalizedNode = normalizeLegacyNodeTakes(node);
  const takes = normalizedNode.takes || [];
  const heroTake = takes.find(take => take.id === takeId);
  if (!heroTake) return normalizedNode;

  return {
    ...normalizedNode,
    heroTakeId: heroTake.id,
    resultUrl: heroTake.url,
    takes: takes.map(take => ({ ...take, isHero: take.id === heroTake.id }))
  };
}

export function deleteTake(node: NodeData, takeId: string): NodeData {
  const normalizedNode = normalizeLegacyNodeTakes(node);
  const remainingTakes = (normalizedNode.takes || []).filter(take => take.id !== takeId);
  const previousHeroId = normalizedNode.heroTakeId || getHeroTake(normalizedNode)?.id;

  if (remainingTakes.length === 0) {
    return {
      ...normalizedNode,
      status: 'idle' as NodeData['status'],
      resultUrl: undefined,
      heroTakeId: undefined,
      takes: [],
      resultAspectRatio: undefined
    };
  }

  const nextHero = previousHeroId === takeId
    ? remainingTakes[remainingTakes.length - 1]
    : remainingTakes.find(take => take.id === previousHeroId) || remainingTakes[remainingTakes.length - 1];

  return {
    ...normalizedNode,
    heroTakeId: nextHero.id,
    resultUrl: nextHero.url,
    takes: remainingTakes.map(take => ({ ...take, isHero: take.id === nextHero.id })),
    resultAspectRatio: previousHeroId === nextHero.id ? normalizedNode.resultAspectRatio : undefined
  };
}

export function updateTakeMetadata(
  node: NodeData,
  takeId: string,
  metadata: Record<string, unknown>
): NodeData {
  const normalizedNode = normalizeLegacyNodeTakes(node);
  const takes = (normalizedNode.takes || []).map(take => take.id === takeId
    ? {
        ...take,
        metadata: {
          ...(take.metadata || {}),
          ...metadata
        }
      }
    : take
  );

  return {
    ...normalizedNode,
    takes
  };
}

export interface GenerationSuccessResult {
  resultUrl: string;
  take?: MediaTake;
  takes?: MediaTake[];
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
    generationProgress: undefined,
    generationProgressMessage: undefined,
    generationStartTime: undefined,
    ...extraUpdates
  };

  if (result.takes && result.takes.length > 0) {
    const nodeWithTakes = appendHeroTakes(node, result.takes);
    return {
      ...updates,
      resultUrl: nodeWithTakes.resultUrl,
      takes: nodeWithTakes.takes,
      heroTakeId: nodeWithTakes.heroTakeId
    };
  }

  if (!result.take) return updates;

  const nodeWithTake = appendHeroTake(node, result.take);
  return {
    ...updates,
    resultUrl: nodeWithTake.resultUrl,
    takes: nodeWithTake.takes,
    heroTakeId: nodeWithTake.heroTakeId
  };
}
