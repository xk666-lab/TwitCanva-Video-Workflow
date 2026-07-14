import type { NodeData, NodeGroup, Viewport } from '../../types';
import { createDefaultNodeData, isKnownNodeType } from '../nodes/nodeRegistry.ts';
import { normalizeWorkflowNode } from '../../utils/nodeTypeHelpers.ts';
import { normalizeLegacyNodeTakes } from '../../utils/takeHelpers.ts';
import {
  normalizeLegacyStoryContext,
  normalizeScriptDocument,
  normalizeStoryboardDocument
} from '../storyboard/storyboardDocuments.ts';
import {
  migrateParentIdsToEdges,
  normalizeEdges,
  syncLegacyParentIds
} from '../graph/edgeMigration.ts';
import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  LEGACY_WORKFLOW_SCHEMA_VERSION,
  type WorkflowData
} from './workflowSchema.ts';

export interface WorkflowMigrationOptions {
  warn?: (message: string) => void;
}

type UnknownRecord = Record<string, unknown>;

// Keep legacy document timestamps stable when the source node has no timestamp.
const LEGACY_STORY_DOCUMENT_MIGRATION_NOW = '1970-01-01T00:00:00.000Z';

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function storyDocumentMigrationNow(node: NodeData): string {
  const record = node as unknown as UnknownRecord;
  return typeof record.createdAt === 'string'
    ? record.createdAt
    : typeof record.updatedAt === 'string'
      ? record.updatedAt
      : LEGACY_STORY_DOCUMENT_MIGRATION_NOW;
}

function cloneNode(rawNode: unknown): UnknownRecord {
  const node = asRecord(rawNode);
  return {
    ...node,
    ...(Array.isArray(node.parentIds) ? { parentIds: [...node.parentIds] } : {}),
    ...(Array.isArray(node.frameInputs)
      ? { frameInputs: node.frameInputs.map(input => ({ ...asRecord(input) })) }
      : {}),
    ...(Array.isArray(node.takes)
      ? {
          takes: node.takes.map(take => {
            const takeRecord = asRecord(take);
            return {
              ...takeRecord,
              ...(takeRecord.metadata ? { metadata: { ...asRecord(takeRecord.metadata) } } : {})
            };
          })
        }
      : {})
  };
}

function migrateNode(rawNode: unknown, index: number, warn: (message: string) => void): NodeData {
  const cloned = cloneNode(rawNode);
  const candidate = normalizeWorkflowNode(cloned as unknown as NodeData);
  const normalizedType = candidate.type;
  const knownType = isKnownNodeType(normalizedType);

  if (!knownType) {
    warn(`Unknown node type "${String(normalizedType ?? '')}" on node "${String(cloned.id ?? index)}"; preserving it as-is.`);
  }

  const defaults = knownType
    ? createDefaultNodeData(normalizedType)
    : {
        prompt: '',
        status: 'idle' as NodeData['status'],
        model: 'unknown',
        aspectRatio: 'Auto',
        resolution: 'Auto'
      };

  const node = {
    ...defaults,
    ...candidate,
    id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `legacy-node-${index + 1}`,
    type: normalizedType || ('Unknown Node' as NodeData['type']),
    x: finiteNumber(candidate.x, 0),
    y: finiteNumber(candidate.y, 0),
    prompt: typeof candidate.prompt === 'string' ? candidate.prompt : defaults.prompt,
    status: typeof candidate.status === 'string' ? candidate.status : defaults.status,
    model: typeof candidate.model === 'string' ? candidate.model : defaults.model,
    aspectRatio: typeof candidate.aspectRatio === 'string' ? candidate.aspectRatio : defaults.aspectRatio,
    resolution: typeof candidate.resolution === 'string' ? candidate.resolution : defaults.resolution,
    parentIds: Array.isArray(candidate.parentIds) ? [...candidate.parentIds] : []
  } as NodeData;

  const takeNormalized = normalizeLegacyNodeTakes(node);
  const now = storyDocumentMigrationNow(takeNormalized);
  if (String(takeNormalized.type) === '脚本') {
    return {
      ...takeNormalized,
      scriptData: normalizeScriptDocument(takeNormalized.scriptData, { now })
    };
  }
  if (String(takeNormalized.type) === '分镜管理器') {
    return {
      ...takeNormalized,
      storyboardData: normalizeStoryboardDocument(takeNormalized.storyboardData, {
        ownerId: String(takeNormalized.id),
        now
      })
    };
  }
  return takeNormalized;
}

function migrateGroup(rawGroup: unknown, index: number): NodeGroup {
  const group = asRecord(rawGroup);
  const storyContext = asRecord(group.storyContext);
  const hasStoryContext = Object.keys(storyContext).length > 0;

  return {
    ...group,
    id: typeof group.id === 'string' && group.id ? group.id : `legacy-group-${index + 1}`,
    nodeIds: Array.isArray(group.nodeIds)
      ? group.nodeIds.filter((id): id is string => typeof id === 'string')
      : [],
    label: typeof group.label === 'string' ? group.label : '未命名分组',
    ...(hasStoryContext
      ? {
          storyContext: {
            ...normalizeLegacyStoryContext(storyContext, {
              ownerId: String(group.id || `legacy-group-${index + 1}`)
            })
          } as NodeGroup['storyContext']
        }
      : {})
  } as NodeGroup;
}

function migrateViewport(rawViewport: unknown): Viewport {
  const viewport = asRecord(rawViewport);
  return {
    ...viewport,
    x: finiteNumber(viewport.x, 0),
    y: finiteNumber(viewport.y, 0),
    zoom: finiteNumber(viewport.zoom, 1)
  } as Viewport;
}

export function migrateWorkflow(
  rawWorkflow: unknown,
  options: WorkflowMigrationOptions = {}
): WorkflowData {
  const warn = options.warn || console.warn;
  const raw = asRecord(rawWorkflow);
  const sourceVersion = typeof raw.schemaVersion === 'number'
    ? raw.schemaVersion
    : LEGACY_WORKFLOW_SCHEMA_VERSION;

  if (sourceVersion > CURRENT_WORKFLOW_SCHEMA_VERSION) {
    warn(`Workflow schema version ${sourceVersion} is newer than supported version ${CURRENT_WORKFLOW_SCHEMA_VERSION}; preserving unknown data.`);
  }

  const migratedNodes = Array.isArray(raw.nodes)
    ? raw.nodes.map((node, index) => migrateNode(node, index, warn))
    : [];
  const migratedEdges = Array.isArray(raw.edges)
    ? normalizeEdges(raw.edges, migratedNodes, warn)
    : migrateParentIdsToEdges(migratedNodes, warn);
  const syncedNodes = syncLegacyParentIds(migratedNodes, migratedEdges);

  return {
    ...raw,
    schemaVersion: sourceVersion > CURRENT_WORKFLOW_SCHEMA_VERSION
      ? sourceVersion
      : CURRENT_WORKFLOW_SCHEMA_VERSION,
    id: typeof raw.id === 'string' ? raw.id : null,
    title: typeof raw.title === 'string' && raw.title ? raw.title : '未命名',
    nodes: syncedNodes,
    edges: migratedEdges,
    groups: Array.isArray(raw.groups)
      ? raw.groups.map((group, index) => migrateGroup(group, index))
      : [],
    viewport: migrateViewport(raw.viewport)
  };
}
