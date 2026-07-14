import type { NodeData, NodeGroup } from '../../types.ts';
import {
  CURRENT_EDGE_SCHEMA_VERSION,
  type CanvasEdge,
  type PortDataType
} from '../graph/graphTypes.ts';
import { normalizeEdges, syncLegacyParentIds } from '../graph/edgeMigration.ts';
import { getNodePort } from '../nodes/nodeRegistry.ts';
import { syncLegacyStoryboardContexts } from '../storyboard/storyboardGraph.ts';
import {
  CURRENT_WORKFLOW_SCHEMA_VERSION
} from '../workflow/workflowSchema.ts';
import {
  migrateWorkflow,
  type WorkflowMigrationOptions
} from '../workflow/migrateWorkflow.ts';

export const CURRENT_WORKFLOW_TEMPLATE_SCHEMA_VERSION = 1;
export const LEGACY_WORKFLOW_TEMPLATE_SCHEMA_VERSION = 1;

export interface WorkflowTemplateGraph {
  schemaVersion: number;
  nodes: NodeData[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  [key: string]: unknown;
}

export interface WorkflowTemplatePort {
  id: string;
  direction: 'input' | 'output';
  nodeId: string;
  portId: string;
  dataType: PortDataType;
  label: string;
  role?: string;
  required?: boolean;
  multiple?: boolean;
  [key: string]: unknown;
}

export interface WorkflowTemplate {
  schemaVersion: number;
  id: string;
  title: string;
  description?: string;
  graph: WorkflowTemplateGraph;
  inputs: WorkflowTemplatePort[];
  outputs: WorkflowTemplatePort[];
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface WorkflowTemplateDraft {
  schemaVersion: number;
  title: string;
  description?: string;
  graph: WorkflowTemplateGraph;
  inputs: WorkflowTemplatePort[];
  outputs: WorkflowTemplatePort[];
  [key: string]: unknown;
}

export interface CreateWorkflowTemplateDraftOptions {
  title: string;
  description?: string;
  nodes: NodeData[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  selectedNodeIds: Iterable<string>;
  now?: string;
}

export interface InstantiateWorkflowTemplateOptions {
  anchor: { x: number; y: number };
  idFactory?: () => string;
  now?: string;
}

export interface InstantiatedWorkflowTemplate {
  nodes: NodeData[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  nodeIdMap: Record<string, string>;
}

type UnknownRecord = Record<string, unknown>;

const TEMPLATE_DEFAULT_TITLE = '未命名模板';

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function cloneSerializable<T>(value: T): T {
  return structuredClone(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function normalizeTemplateVersion(value: unknown, warn: (message: string) => void): number {
  const sourceVersion = typeof value === 'number'
    ? value
    : LEGACY_WORKFLOW_TEMPLATE_SCHEMA_VERSION;
  if (sourceVersion > CURRENT_WORKFLOW_TEMPLATE_SCHEMA_VERSION) {
    warn(`Workflow template schema version ${sourceVersion} is newer than supported version ${CURRENT_WORKFLOW_TEMPLATE_SCHEMA_VERSION}; preserving unknown data.`);
    return sourceVersion;
  }
  return CURRENT_WORKFLOW_TEMPLATE_SCHEMA_VERSION;
}

function isSelectedId(value: unknown, selectedIds: Set<string>): value is string {
  return typeof value === 'string' && selectedIds.has(value);
}

function resetReferenceAsset(value: unknown): UnknownRecord {
  const asset = cloneSerializable(asRecord(value));
  const { url: _url, subjectAssetId: _subjectAssetId, ...safeAsset } = asset;
  return safeAsset;
}

function resetStoryboardShot(value: unknown): UnknownRecord {
  const shot = cloneSerializable(asRecord(value));
  const {
    imageNodeId: _imageNodeId,
    videoNodeId: _videoNodeId,
    activeTaskId: _activeTaskId,
    lastTaskId: _lastTaskId,
    status: _status,
    error: _error,
    ...safeShot
  } = shot;
  return {
    ...safeShot,
    status: 'draft',
    revision: 0
  };
}

function resetScriptDocument(value: unknown): unknown {
  if (value === undefined) return undefined;
  const document = cloneSerializable(asRecord(value));
  const {
    generatedBy: _generatedBy,
    referenceAssets,
    revision: _revision,
    ...safeDocument
  } = document;
  return {
    ...safeDocument,
    referenceAssets: Array.isArray(referenceAssets)
      ? referenceAssets.map(resetReferenceAsset)
      : [],
    revision: 0
  };
}

function resetStoryboardDocument(value: unknown, selectedIds: Set<string>): unknown {
  if (value === undefined) return undefined;
  const document = cloneSerializable(asRecord(value));
  const {
    generatedBy: _generatedBy,
    compositeImageUrl: _compositeImageUrl,
    sourceScriptNodeId,
    shots,
    revision: _revision,
    ...safeDocument
  } = document;
  return {
    ...safeDocument,
    sourceScriptNodeId: isSelectedId(sourceScriptNodeId, selectedIds) ? sourceScriptNodeId : '',
    shots: Array.isArray(shots) ? shots.map(resetStoryboardShot) : [],
    revision: 0
  };
}

function resetLegacyStoryContext(value: unknown, selectedIds: Set<string>): unknown {
  if (value === undefined) return undefined;
  const context = cloneSerializable(asRecord(value));
  const {
    compositeImageUrl: _compositeImageUrl,
    selectedCharacters,
    scripts,
    scriptNodeId,
    storyboardNodeId,
    ...safeContext
  } = context;
  return {
    ...safeContext,
    scripts: Array.isArray(scripts) ? scripts.map(resetStoryboardShot) : [],
    ...(Array.isArray(selectedCharacters)
      ? { selectedCharacters: selectedCharacters.map(resetReferenceAsset) }
      : {}),
    ...(isSelectedId(scriptNodeId, selectedIds) ? { scriptNodeId } : {}),
    ...(isSelectedId(storyboardNodeId, selectedIds) ? { storyboardNodeId } : {})
  };
}

function frameInputsFromEdges(nodeId: string, edges: CanvasEdge[]): NodeData['frameInputs'] {
  const frames = edges
    .filter(edge => edge.targetNodeId === nodeId && (
      edge.targetPortId === 'start-frame' || edge.targetPortId === 'end-frame'
    ))
    .map(edge => ({
      nodeId: edge.sourceNodeId,
      order: edge.targetPortId === 'start-frame' ? 'start' as const : 'end' as const
    }));
  return frames.length > 0 ? frames : undefined;
}

function resetNodeRuntimeState(
  rawNode: NodeData,
  internalEdges: CanvasEdge[],
  selectedIds: Set<string>
): NodeData {
  const node = cloneSerializable(rawNode) as NodeData & UnknownRecord;
  const {
    resultUrl: _resultUrl,
    takes: _takes,
    heroTakeId: _heroTakeId,
    lastFrame: _lastFrame,
    errorMessage: _errorMessage,
    activeTaskId: _activeTaskId,
    lastTaskId: _lastTaskId,
    generationStartTime: _generationStartTime,
    inputUrl: _inputUrl,
    subjectAssetId: _subjectAssetId,
    characterReferenceUrls: _characterReferenceUrls,
    editorElements: _editorElements,
    editorCanvasData: _editorCanvasData,
    editorCanvasSize: _editorCanvasSize,
    editorBackgroundUrl: _editorBackgroundUrl,
    detectedFaces: _detectedFaces,
    faceDetectionStatus: _faceDetectionStatus,
    linkedVideoNodeId,
    frameInputs: _frameInputs,
    scriptData,
    storyboardData,
    ...safeNode
  } = node;
  const frames = frameInputsFromEdges(node.id, internalEdges);

  return {
    ...safeNode,
    status: 'idle' as NodeData['status'],
    parentIds: Array.isArray(node.parentIds) ? [...node.parentIds] : [],
    ...(isSelectedId(linkedVideoNodeId, selectedIds) ? { linkedVideoNodeId } : {}),
    ...(frames ? { frameInputs: frames } : {}),
    ...(scriptData !== undefined ? { scriptData: resetScriptDocument(scriptData) as NodeData['scriptData'] } : {}),
    ...(storyboardData !== undefined
      ? { storyboardData: resetStoryboardDocument(storyboardData, selectedIds) as NodeData['storyboardData'] }
      : {})
  } as NodeData;
}

function normalizeGroupSnapshot(
  group: NodeGroup,
  selectedIds: Set<string>
): NodeGroup | null {
  const cloned = cloneSerializable(group) as NodeGroup & UnknownRecord;
  const nodeIds = Array.isArray(group.nodeIds)
    ? group.nodeIds.filter(nodeId => selectedIds.has(nodeId))
    : [];
  if (nodeIds.length < 2) return null;

  const { storyContext, ...safeGroup } = cloned;
  return {
    ...safeGroup,
    nodeIds,
    ...(storyContext !== undefined
      ? { storyContext: resetLegacyStoryContext(storyContext, selectedIds) as NodeGroup['storyContext'] }
      : {})
  } as NodeGroup;
}

function rebaseNodePositions(nodes: NodeData[]): NodeData[] {
  if (nodes.length === 0) return [];
  const minX = Math.min(...nodes.map(node => finiteNumber(node.x, 0)));
  const minY = Math.min(...nodes.map(node => finiteNumber(node.y, 0)));
  return nodes.map(node => ({
    ...node,
    x: finiteNumber(node.x, 0) - minX,
    y: finiteNumber(node.y, 0) - minY
  }));
}

function portDescription(
  direction: WorkflowTemplatePort['direction'],
  node: NodeData | undefined,
  portId: string,
  dataType: PortDataType
): WorkflowTemplatePort {
  const port = node ? getNodePort(node.type, portId) : undefined;
  return {
    id: `${direction}:${node?.id || 'unknown'}:${portId}`,
    direction,
    nodeId: node?.id || '',
    portId,
    dataType,
    label: port?.label || portId,
    ...(port?.role ? { role: port.role } : {}),
    ...(port?.required ? { required: true } : {}),
    ...(port?.multiple ? { multiple: true } : {})
  };
}

function deriveBoundaryPorts(
  allNodes: NodeData[],
  allEdges: CanvasEdge[],
  selectedIds: Set<string>
): Pick<WorkflowTemplateDraft, 'inputs' | 'outputs'> {
  const nodeById = new Map(allNodes.map(node => [node.id, node]));
  const inputs: WorkflowTemplatePort[] = [];
  const outputs: WorkflowTemplatePort[] = [];
  const seenInputs = new Set<string>();
  const seenOutputs = new Set<string>();

  for (const currentEdge of allEdges) {
    const sourceSelected = selectedIds.has(currentEdge.sourceNodeId);
    const targetSelected = selectedIds.has(currentEdge.targetNodeId);
    if (!sourceSelected && targetSelected) {
      const item = portDescription(
        'input',
        nodeById.get(currentEdge.targetNodeId),
        currentEdge.targetPortId,
        currentEdge.dataType
      );
      if (!seenInputs.has(item.id)) {
        inputs.push(item);
        seenInputs.add(item.id);
      }
    }
    if (sourceSelected && !targetSelected) {
      const item = portDescription(
        'output',
        nodeById.get(currentEdge.sourceNodeId),
        currentEdge.sourcePortId,
        currentEdge.dataType
      );
      if (!seenOutputs.has(item.id)) {
        outputs.push(item);
        seenOutputs.add(item.id);
      }
    }
  }

  return { inputs, outputs };
}

function normalizeTemplatePort(value: unknown, direction: WorkflowTemplatePort['direction']): WorkflowTemplatePort | null {
  const raw = asRecord(value);
  const nodeId = stringValue(raw.nodeId);
  const portId = stringValue(raw.portId);
  const dataType = stringValue(raw.dataType) as PortDataType;
  if (!nodeId || !portId || !dataType) return null;
  return {
    ...cloneSerializable(raw),
    id: stringValue(raw.id, `${direction}:${nodeId}:${portId}`),
    direction,
    nodeId,
    portId,
    dataType,
    label: stringValue(raw.label, portId),
    ...(typeof raw.role === 'string' ? { role: raw.role } : {}),
    ...(raw.required === true ? { required: true } : {}),
    ...(raw.multiple === true ? { multiple: true } : {})
  } as WorkflowTemplatePort;
}

function normalizeTemplatePorts(value: unknown, direction: WorkflowTemplatePort['direction']): WorkflowTemplatePort[] {
  return Array.isArray(value)
    ? value.map(item => normalizeTemplatePort(item, direction)).filter((item): item is WorkflowTemplatePort => Boolean(item))
    : [];
}

function normalizedTemplateGraph(rawGraph: unknown, warn: (message: string) => void): WorkflowTemplateGraph {
  const raw = cloneSerializable(asRecord(rawGraph));
  const migrated = migrateWorkflow({
    ...raw,
    id: null,
    title: stringValue(raw.title, TEMPLATE_DEFAULT_TITLE),
    viewport: asRecord(raw.viewport)
  }, { warn });
  const selectedIds = new Set(migrated.nodes.map(node => node.id));
  const normalizedEdges = normalizeEdges(migrated.edges, migrated.nodes, warn);
  const nodesWithParents = syncLegacyParentIds(migrated.nodes, normalizedEdges);
  const cleanedNodes = nodesWithParents.map(node => resetNodeRuntimeState(node, normalizedEdges, selectedIds));
  const cleanedEdges = normalizeEdges(normalizedEdges, cleanedNodes, warn);
  const syncedNodes = syncLegacyParentIds(cleanedNodes, cleanedEdges);
  const groups = migrated.groups
    .map(group => normalizeGroupSnapshot(group, selectedIds))
    .filter((group): group is NodeGroup => Boolean(group));

  return {
    ...raw,
    schemaVersion: migrated.schemaVersion || CURRENT_WORKFLOW_SCHEMA_VERSION,
    nodes: syncedNodes,
    edges: cleanedEdges,
    groups: syncLegacyStoryboardContexts(syncedNodes, groups)
  };
}

function remapOptionalNodeId(value: unknown, nodeIdMap: Map<string, string>): string | undefined {
  return typeof value === 'string' ? nodeIdMap.get(value) : undefined;
}

function remapStoryboardDocument(value: unknown, nodeIdMap: Map<string, string>): unknown {
  if (value === undefined) return undefined;
  const document = cloneSerializable(asRecord(value));
  const sourceScriptNodeId = remapOptionalNodeId(document.sourceScriptNodeId, nodeIdMap) || '';
  const shots = Array.isArray(document.shots)
    ? document.shots.map(resetStoryboardShot)
    : [];
  return {
    ...document,
    sourceScriptNodeId,
    shots
  };
}

function remapLegacyStoryContext(value: unknown, nodeIdMap: Map<string, string>): unknown {
  if (value === undefined) return undefined;
  const context = cloneSerializable(asRecord(value));
  const scriptNodeId = remapOptionalNodeId(context.scriptNodeId, nodeIdMap);
  const storyboardNodeId = remapOptionalNodeId(context.storyboardNodeId, nodeIdMap);
  return {
    ...context,
    scripts: Array.isArray(context.scripts) ? context.scripts.map(resetStoryboardShot) : [],
    ...(scriptNodeId ? { scriptNodeId } : {}),
    ...(storyboardNodeId ? { storyboardNodeId } : {})
  };
}

function remapNode(
  source: NodeData,
  nodeIdMap: Map<string, string>,
  groupIdMap: Map<string, string>,
  edges: CanvasEdge[],
  anchor: InstantiateWorkflowTemplateOptions['anchor']
): NodeData {
  const id = nodeIdMap.get(source.id)!;
  const linkedVideoNodeId = remapOptionalNodeId(source.linkedVideoNodeId, nodeIdMap);
  const frameInputs = frameInputsFromEdges(source.id, edges)
    ?.map(frame => ({
      nodeId: nodeIdMap.get(frame.nodeId),
      order: frame.order
    }))
    .filter((frame): frame is { nodeId: string; order: 'start' | 'end' } => Boolean(frame.nodeId));
  const {
    scriptData,
    storyboardData,
    groupId,
    ...safeSource
  } = cloneSerializable(source);
  return {
    ...safeSource,
    id,
    x: anchor.x + finiteNumber(source.x, 0),
    y: anchor.y + finiteNumber(source.y, 0),
    parentIds: [],
    ...(groupId && groupIdMap.get(groupId) ? { groupId: groupIdMap.get(groupId) } : {}),
    ...(linkedVideoNodeId ? { linkedVideoNodeId } : {}),
    ...(frameInputs && frameInputs.length > 0 ? { frameInputs } : {}),
    ...(scriptData !== undefined ? { scriptData: resetScriptDocument(scriptData) as NodeData['scriptData'] } : {}),
    ...(storyboardData !== undefined
      ? { storyboardData: remapStoryboardDocument(storyboardData, nodeIdMap) as NodeData['storyboardData'] }
      : {})
  } as NodeData;
}

function remapEdge(source: CanvasEdge, nodeIdMap: Map<string, string>, idFactory: () => string): CanvasEdge {
  return {
    ...cloneSerializable(source),
    schemaVersion: source.schemaVersion || CURRENT_EDGE_SCHEMA_VERSION,
    id: idFactory(),
    sourceNodeId: nodeIdMap.get(source.sourceNodeId)!,
    targetNodeId: nodeIdMap.get(source.targetNodeId)!
  };
}

function remapGroup(
  source: NodeGroup,
  nodeIdMap: Map<string, string>,
  groupIdMap: Map<string, string>
): NodeGroup {
  const cloned = cloneSerializable(source) as NodeGroup & UnknownRecord;
  const { storyContext, ...safeGroup } = cloned;
  return {
    ...safeGroup,
    id: groupIdMap.get(source.id)!,
    nodeIds: source.nodeIds.map(nodeId => nodeIdMap.get(nodeId)).filter((nodeId): nodeId is string => Boolean(nodeId)),
    ...(storyContext !== undefined
      ? { storyContext: remapLegacyStoryContext(storyContext, nodeIdMap) as NodeGroup['storyContext'] }
      : {})
  } as NodeGroup;
}

export function createWorkflowTemplateDraft(options: CreateWorkflowTemplateDraftOptions): WorkflowTemplateDraft {
  const selectedIds = new Set(Array.from(options.selectedNodeIds).filter((id): id is string => typeof id === 'string'));
  const selectedNodes = options.nodes.filter(node => selectedIds.has(node.id));
  if (selectedNodes.length === 0) {
    throw new Error('Select at least one node before saving a workflow template.');
  }

  const internalEdges = options.edges.filter(edge =>
    selectedIds.has(edge.sourceNodeId) && selectedIds.has(edge.targetNodeId)
  );
  const selectedGroups = options.groups
    .map(group => normalizeGroupSnapshot(group, selectedIds))
    .filter((group): group is NodeGroup => Boolean(group));
  const groupIds = new Set(selectedGroups.map(group => group.id));
  const nodesWithGroups = selectedNodes.map(node => ({
    ...cloneSerializable(node),
    ...(node.groupId && groupIds.has(node.groupId) ? {} : { groupId: undefined })
  }));
  const normalizedEdges = normalizeEdges(internalEdges, nodesWithGroups);
  const nodesWithParents = syncLegacyParentIds(nodesWithGroups, normalizedEdges);
  const cleanedNodes = nodesWithParents.map(node => resetNodeRuntimeState(node, normalizedEdges, selectedIds));
  const cleanedEdges = normalizeEdges(normalizedEdges, cleanedNodes);
  const nodes = rebaseNodePositions(syncLegacyParentIds(cleanedNodes, cleanedEdges));
  const groups = syncLegacyStoryboardContexts(nodes, selectedGroups);
  const { inputs, outputs } = deriveBoundaryPorts(options.nodes, options.edges, selectedIds);
  const title = options.title.trim() || TEMPLATE_DEFAULT_TITLE;
  const description = optionalText(options.description);

  return {
    schemaVersion: CURRENT_WORKFLOW_TEMPLATE_SCHEMA_VERSION,
    title,
    ...(description ? { description } : {}),
    graph: {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      nodes,
      edges: cleanedEdges,
      groups
    },
    inputs,
    outputs
  };
}

export function migrateWorkflowTemplate(
  rawTemplate: unknown,
  options: WorkflowMigrationOptions = {}
): WorkflowTemplate {
  const warn = options.warn || console.warn;
  const raw = cloneSerializable(asRecord(rawTemplate));
  const graph = normalizedTemplateGraph(raw.graph, warn);
  const title = optionalText(raw.title) || TEMPLATE_DEFAULT_TITLE;
  const createdAt = stringValue(raw.createdAt);
  const updatedAt = stringValue(raw.updatedAt, createdAt);

  return {
    ...raw,
    schemaVersion: normalizeTemplateVersion(raw.schemaVersion, warn),
    id: stringValue(raw.id),
    title,
    ...(optionalText(raw.description) ? { description: optionalText(raw.description) } : {}),
    graph,
    inputs: normalizeTemplatePorts(raw.inputs, 'input'),
    outputs: normalizeTemplatePorts(raw.outputs, 'output'),
    createdAt,
    updatedAt
  } as WorkflowTemplate;
}

export function instantiateWorkflowTemplate(
  rawTemplate: unknown,
  options: InstantiateWorkflowTemplateOptions
): InstantiatedWorkflowTemplate {
  const template = migrateWorkflowTemplate(rawTemplate, { warn: () => undefined });
  const idFactory = options.idFactory || (() => crypto.randomUUID());
  const nodeIdMap = new Map(template.graph.nodes.map(node => [node.id, idFactory()]));
  const edgeIdMap = new Map(template.graph.edges.map(edge => [edge.id, idFactory()]));
  const groupIdMap = new Map(template.graph.groups.map(group => [group.id, idFactory()]));
  const graphEdges = template.graph.edges.filter(edge =>
    nodeIdMap.has(edge.sourceNodeId) && nodeIdMap.has(edge.targetNodeId)
  );
  const nodes = template.graph.nodes.map(node => remapNode(
    node,
    nodeIdMap,
    groupIdMap,
    graphEdges,
    options.anchor
  ));
  const edges = graphEdges.map(edge => ({
    ...remapEdge(edge, nodeIdMap, () => edgeIdMap.get(edge.id) || idFactory())
  }));
  const groups = template.graph.groups
    .filter(group => groupIdMap.has(group.id))
    .map(group => remapGroup(group, nodeIdMap, groupIdMap));
  const normalizedEdges = normalizeEdges(edges, nodes);
  const syncedNodes = syncLegacyParentIds(nodes, normalizedEdges);
  const syncedGroups = syncLegacyStoryboardContexts(syncedNodes, groups);

  return {
    nodes: syncedNodes,
    edges: normalizedEdges,
    groups: syncedGroups,
    nodeIdMap: Object.fromEntries(nodeIdMap)
  };
}

export function workflowTemplateSummary(template: WorkflowTemplate): Pick<
  WorkflowTemplate,
  'id' | 'title' | 'description' | 'createdAt' | 'updatedAt'
> & {
  nodeCount: number;
  inputCount: number;
  outputCount: number;
} {
  return {
    id: template.id,
    title: template.title,
    ...(template.description ? { description: template.description } : {}),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
    nodeCount: template.graph.nodes.length,
    inputCount: template.inputs.length,
    outputCount: template.outputs.length
  };
}
