import type { NodeData, NodeGroup } from '../../types.ts';
import type { CanvasEdge } from '../graph/graphTypes.ts';
import { CURRENT_EDGE_SCHEMA_VERSION } from '../graph/graphTypes.ts';
import { syncLegacyParentIds } from '../graph/edgeMigration.ts';
import { createDefaultNodeData } from '../nodes/nodeRegistry.ts';
import {
  documentsFromSession,
  legacyStoryContextFromDocuments,
  normalizeLegacyStoryContext,
  sessionFromLegacyStoryContext
} from './storyboardDocuments.ts';
import type { StoryboardDocument, StoryboardSessionSnapshot } from './storyboardTypes.ts';
import type { NodeUpdateMap } from '../nodes/nodeUpdates.ts';

interface GraphResult {
  nodes: NodeData[];
  edges: CanvasEdge[];
  scriptNodeId: string;
  storyboardNodeId: string;
}

export function createStoryboardDraftGraph(options: {
  nodes: NodeData[];
  edges: CanvasEdge[];
  center: { x: number; y: number };
  session: StoryboardSessionSnapshot;
  idFactory?: () => string;
  now?: string;
}): GraphResult {
  const idFactory = options.idFactory || (() => crypto.randomUUID());
  const now = options.now || new Date().toISOString();
  const scriptNodeId = idFactory();
  const storyboardNodeId = idFactory();
  const edgeId = idFactory();
  const documents = documentsFromSession({
    session: options.session,
    scriptNodeId,
    storyboardNodeId,
    now
  });
  const scriptNode: NodeData = {
    ...createDefaultNodeData('脚本' as NodeData['type']),
    id: scriptNodeId,
    title: '故事脚本',
    x: options.center.x - 420,
    y: options.center.y,
    prompt: options.session.story,
    parentIds: [],
    scriptData: documents.scriptData
  };
  const storyboardNode: NodeData = {
    ...createDefaultNodeData('分镜管理器' as NodeData['type']),
    id: storyboardNodeId,
    title: '分镜管理器',
    x: options.center.x + 20,
    y: options.center.y,
    parentIds: [],
    storyboardData: documents.storyboardData
  };
  const edge: CanvasEdge = {
    schemaVersion: CURRENT_EDGE_SCHEMA_VERSION,
    id: edgeId,
    sourceNodeId: scriptNodeId,
    sourcePortId: 'script-output',
    targetNodeId: storyboardNodeId,
    targetPortId: 'script-input',
    dataType: 'script',
    createdAt: now
  };
  const edges = [...options.edges, edge];
  const nodes = syncLegacyParentIds([...options.nodes, scriptNode, storyboardNode], edges);
  return { nodes, edges, scriptNodeId, storyboardNodeId };
}

export function ensureStoryboardNodePair(options: {
  nodes: NodeData[];
  edges: CanvasEdge[];
  scriptNodeId?: string | null;
  storyboardNodeId?: string | null;
  center: { x: number; y: number };
  session: StoryboardSessionSnapshot;
  idFactory?: () => string;
  now?: string;
}): GraphResult {
  const idFactory = options.idFactory || (() => crypto.randomUUID());
  const now = options.now || new Date().toISOString();
  const existingScript = options.scriptNodeId
    ? options.nodes.find(node => node.id === options.scriptNodeId && String(node.type) === '脚本')
    : undefined;
  const existingStoryboard = options.storyboardNodeId
    ? options.nodes.find(node => node.id === options.storyboardNodeId && String(node.type) === '分镜管理器')
    : undefined;

  if (!existingScript && !existingStoryboard) {
    return createStoryboardDraftGraph({ ...options, idFactory, now });
  }

  const scriptNodeId = existingScript?.id || idFactory();
  const storyboardNodeId = existingStoryboard?.id || idFactory();
  const documents = documentsFromSession({
    session: options.session,
    scriptNodeId,
    storyboardNodeId,
    now
  });
  const scriptNode = existingScript || {
    ...createDefaultNodeData('脚本' as NodeData['type']),
    id: scriptNodeId,
    title: '故事脚本',
    x: existingStoryboard ? existingStoryboard.x - 440 : options.center.x - 420,
    y: existingStoryboard ? existingStoryboard.y : options.center.y,
    prompt: options.session.story,
    parentIds: [],
    scriptData: documents.scriptData
  };
  const storyboardNode = existingStoryboard ? {
    ...existingStoryboard,
    storyboardData: {
      ...(existingStoryboard.storyboardData || documents.storyboardData),
      sourceScriptNodeId: scriptNodeId
    }
  } : {
    ...createDefaultNodeData('分镜管理器' as NodeData['type']),
    id: storyboardNodeId,
    title: '分镜管理器',
    x: scriptNode.x + 440,
    y: scriptNode.y,
    parentIds: [],
    storyboardData: documents.storyboardData
  };
  const hasEdge = options.edges.some(edge =>
    edge.sourceNodeId === scriptNodeId &&
    edge.sourcePortId === 'script-output' &&
    edge.targetNodeId === storyboardNodeId &&
    edge.targetPortId === 'script-input'
  );
  const scriptToStoryboardEdge: CanvasEdge = {
    schemaVersion: CURRENT_EDGE_SCHEMA_VERSION,
    id: idFactory(),
    sourceNodeId: scriptNodeId,
    sourcePortId: 'script-output',
    targetNodeId: storyboardNodeId,
    targetPortId: 'script-input',
    dataType: 'script',
    createdAt: now
  };
  const edges = hasEdge ? options.edges : [...options.edges, scriptToStoryboardEdge];
  const replacements = new Map([
    [scriptNodeId, scriptNode],
    [storyboardNodeId, storyboardNode]
  ]);
  const existingIds = new Set(options.nodes.map(node => node.id));
  const nodes = syncLegacyParentIds([
    ...options.nodes.map(node => replacements.get(node.id) || node),
    ...[scriptNode, storyboardNode].filter(node => !existingIds.has(node.id))
  ], edges);
  return { nodes, edges, scriptNodeId, storyboardNodeId };
}

export function materializeLegacyStoryboardGroup(options: {
  group: NodeGroup;
  nodes: NodeData[];
  edges: CanvasEdge[];
  anchor: { x: number; y: number };
  idFactory?: () => string;
  now?: string;
}): GraphResult & { group: NodeGroup } {
  const context = normalizeLegacyStoryContext(options.group.storyContext, { ownerId: options.group.id });
  const created = ensureStoryboardNodePair({
    nodes: options.nodes,
    edges: options.edges,
    scriptNodeId: context.scriptNodeId,
    storyboardNodeId: context.storyboardNodeId,
    center: options.anchor,
    session: sessionFromLegacyStoryContext(context),
    idFactory: options.idFactory,
    now: options.now
  });
  return {
    ...created,
    group: {
      ...options.group,
      storyContext: {
        ...context,
        scriptNodeId: created.scriptNodeId,
        storyboardNodeId: created.storyboardNodeId
      }
    }
  };
}

export function getEffectiveStoryContext(group: NodeGroup, nodes: NodeData[]) {
  const fallback = normalizeLegacyStoryContext(group.storyContext, { ownerId: group.id });
  const script = nodes.find(node => node.id === fallback.scriptNodeId)?.scriptData;
  const storyboard = nodes.find(node => node.id === fallback.storyboardNodeId)?.storyboardData;
  return script && storyboard
    ? legacyStoryContextFromDocuments(script, storyboard, {
        scriptNodeId: fallback.scriptNodeId!,
        storyboardNodeId: fallback.storyboardNodeId!
      })
    : fallback;
}

export function syncLegacyStoryboardContexts(nodes: NodeData[], groups: NodeGroup[]): NodeGroup[] {
  return groups.map(group => group.storyContext
    ? { ...group, storyContext: getEffectiveStoryContext(group, nodes) }
    : group);
}

export function attachImageNodesToShots(
  document: StoryboardDocument,
  imageNodeIds: string[],
  now = new Date().toISOString()
): StoryboardDocument {
  return {
    ...document,
    shots: document.shots.map((shot, index) => imageNodeIds[index]
      ? { ...shot, imageNodeId: imageNodeIds[index], status: 'image-running', error: undefined }
      : shot),
    revision: document.revision + 1,
    updatedAt: now
  };
}

export function attachVideoNodesToShots(
  document: StoryboardDocument,
  videoNodeIdByImageNodeId: Map<string, string>,
  now = new Date().toISOString()
): StoryboardDocument {
  return {
    ...document,
    shots: document.shots.map(shot => {
      const videoNodeId = shot.imageNodeId ? videoNodeIdByImageNodeId.get(shot.imageNodeId) : undefined;
      return videoNodeId
        ? { ...shot, videoNodeId, status: 'video-running', error: undefined }
        : shot;
    }),
    revision: document.revision + 1,
    updatedAt: now
  };
}

function mediaStatus(node: NodeData, kind: 'image' | 'video') {
  if (node.status === 'loading') return kind === 'video' ? 'video-running' as const : 'image-running' as const;
  if (node.status === 'error') return 'failed' as const;
  if (node.status === 'success') return kind === 'video' ? 'video-ready' as const : 'image-ready' as const;
  return kind === 'video' ? 'image-ready' as const : 'ready' as const;
}

export function buildStoryboardMediaProjectionUpdates(
  nodes: NodeData[],
  now = new Date().toISOString()
): NodeUpdateMap {
  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const updates: NodeUpdateMap = {};
  for (const storyboardNode of nodes.filter(node => String(node.type) === '分镜管理器' && node.storyboardData)) {
    let changed = false;
    const shots = storyboardNode.storyboardData!.shots.map(shot => {
      const imageNode = shot.imageNodeId ? nodeById.get(shot.imageNodeId) : undefined;
      const videoNode = shot.videoNodeId ? nodeById.get(shot.videoNodeId) : undefined;
      const source = videoNode || imageNode;
      const kind = videoNode ? 'video' as const : 'image' as const;
      const next = {
        ...shot,
        ...(shot.imageNodeId && !imageNode ? { imageNodeId: undefined } : {}),
        ...(shot.videoNodeId && !videoNode ? { videoNodeId: undefined } : {}),
        ...(source ? {
          status: mediaStatus(source, kind),
          activeTaskId: source.activeTaskId,
          lastTaskId: source.lastTaskId,
          error: source.errorMessage
        } : {
          status: 'ready' as const,
          activeTaskId: undefined,
          error: undefined
        })
      };
      if (JSON.stringify(next) !== JSON.stringify(shot)) changed = true;
      return next;
    });
    if (changed) {
      updates[storyboardNode.id] = {
        storyboardData: {
          ...storyboardNode.storyboardData!,
          shots,
          updatedAt: now
        }
      };
    }
  }
  return updates;
}
