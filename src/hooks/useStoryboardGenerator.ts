/**
 * Custom hook for the document-backed storyboard generation workflow.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from 'react';
import { NodeStatus, NodeType, type NodeData, type NodeGroup, type Viewport } from '../types';
import type { CanvasEdge } from '../domain/graph/graphTypes';
import type { NodeUpdateMap } from '../domain/nodes/nodeUpdates';
import {
  attachImageNodesToShots,
  buildStoryboardMediaProjectionUpdates,
  ensureStoryboardNodePair,
  materializeLegacyStoryboardGroup,
  syncBoundStoryboardGroupContexts
} from '../domain/storyboard/storyboardGraph';
import {
  createEmptyScriptDocument,
  createEmptyStoryboardDocument,
  legacyStoryContextFromDocuments,
  mergeSessionIntoDocuments,
  sessionFromDocuments
} from '../domain/storyboard/storyboardDocuments';
import type {
  CharacterAsset,
  LegacyStoryContext,
  SceneScript,
  StoryReferenceAsset,
  StoryboardSessionSnapshot,
  StoryPackageGenerationMode
} from '../domain/storyboard/storyboardTypes';
import {
  buildGenerationTaskNodeUpdates,
  buildStoryTaskStartUpdates
} from '../domain/generation/taskResultUpdates';
import {
  cancelGenerationTask,
  retryGenerationTask,
  submitStoryPackageGeneration
} from '../services/generationService';
import { createStoryboardImageNode } from '../utils/storyboardNodeFactory';
import { getConnectedSubjectInputs } from '../domain/graph/connectionSelectors';
import { buildSubjectReferenceSnapshots } from '../domain/subjects/subjectAsset';
import { resolveSubjectAssets } from '../services/subjectAssetService';

export interface StoryboardState {
  step: 'characters' | 'story' | 'scripts' | 'preview' | 'generate';
  selectedCharacters: CharacterAsset[];
  sceneCount: number;
  story: string;
  scripts: SceneScript[];
  styleAnchor: string;
  characterDNA: Record<string, string>;
  selectedImageModel: string;
  compositeImageUrl: string | null;
  isGeneratingPreview: boolean;
  isGenerating: boolean;
  isBrainstorming: boolean;
  isOptimizing: boolean;
  error: string | null;
  scriptNodeId: string | null;
  storyboardNodeId: string | null;
}

export interface StoryboardGroupInfo {
  groupId: string;
  groupLabel: string;
  openVideoAfterImages?: boolean;
  storyContext?: LegacyStoryContext;
}

interface UseStoryboardGeneratorProps {
  nodes: NodeData[];
  edges: CanvasEdge[];
  groups: NodeGroup[];
  workflowId: string | null;
  viewport: Viewport;
  replaceGraph: (nodes: NodeData[], edges: CanvasEdge[]) => void;
  applyNodeUpdates: (updates: NodeUpdateMap) => void;
  setGroups: Dispatch<SetStateAction<NodeGroup[]>>;
  onCreateNodes: (nodes: Partial<NodeData>[], groupInfo?: StoryboardGroupInfo) => void;
}

interface CreateStoryboardNodesOptions {
  continueToVideo?: boolean;
}

interface EnsureBoundNodesOptions {
  scriptNodeId?: string | null;
  storyboardNodeId?: string | null;
  session?: StoryboardSessionSnapshot;
}

interface BoundStoryboardNodes {
  nodes: NodeData[];
  edges: CanvasEdge[];
  scriptNode: NodeData & { scriptData: NonNullable<NodeData['scriptData']> };
  storyboardNode: NodeData & { storyboardData: NonNullable<NodeData['storyboardData']> };
}

function createInitialState(): StoryboardState {
  return {
    step: 'characters',
    selectedCharacters: [],
    sceneCount: 3,
    story: '',
    scripts: [],
    styleAnchor: '',
    characterDNA: {},
    selectedImageModel: 'gpt-image-2',
    compositeImageUrl: null,
    isGeneratingPreview: false,
    isGenerating: false,
    isBrainstorming: false,
    isOptimizing: false,
    error: null,
    scriptNodeId: null,
    storyboardNodeId: null
  };
}

function snapshotFromState(state: StoryboardState): StoryboardSessionSnapshot {
  return {
    story: state.story,
    scripts: state.scripts.map(script => ({ ...script })),
    selectedCharacters: state.selectedCharacters.map(asset => ({ ...asset })),
    sceneCount: state.sceneCount,
    styleAnchor: state.styleAnchor,
    characterDNA: { ...state.characterDNA },
    selectedImageModel: state.selectedImageModel,
    compositeImageUrl: state.compositeImageUrl
  };
}

function isScriptNode(node: NodeData | undefined): node is NodeData {
  return node?.type === NodeType.SCRIPT;
}

function isStoryboardNode(node: NodeData | undefined): node is NodeData {
  return node?.type === NodeType.STORYBOARD;
}

function hasUpdates(updates: NodeUpdateMap): boolean {
  return Object.keys(updates).length > 0;
}

function mergeStoryReferenceAssets(...groups: StoryReferenceAsset[][]): StoryReferenceAsset[] {
  const seen = new Set<string>();
  const merged: StoryReferenceAsset[] = [];

  for (const asset of groups.flat()) {
    const key = asset.subjectAssetId ? `subject:${asset.subjectAssetId}` : `asset:${asset.id || asset.url}`;
    if (seen.has(key) || !asset.url) continue;
    seen.add(key);
    merged.push(asset);
  }

  return merged;
}

function taskAndStatusTuple(
  scriptNode: NodeData | undefined,
  storyboardNode: NodeData | undefined
): string | null {
  if (!scriptNode?.scriptData || !storyboardNode?.storyboardData) return null;
  const shots = storyboardNode.storyboardData.shots.map(shot => [
    shot.id,
    shot.status,
    shot.activeTaskId || '',
    shot.lastTaskId || '',
    shot.error || '',
    shot.imageNodeId || '',
    shot.videoNodeId || ''
  ].join(':')).join(',');
  return [
    scriptNode.id,
    storyboardNode.id,
    scriptNode.scriptData.revision,
    storyboardNode.storyboardData.revision,
    scriptNode.activeTaskId || '',
    storyboardNode.activeTaskId || '',
    scriptNode.status,
    storyboardNode.status,
    scriptNode.errorMessage || '',
    storyboardNode.errorMessage || '',
    shots
  ].join('|');
}

export const useStoryboardGenerator = ({
  nodes,
  edges,
  groups,
  workflowId,
  viewport,
  replaceGraph,
  applyNodeUpdates,
  setGroups,
  onCreateNodes
}: UseStoryboardGeneratorProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [state, setState] = useState<StoryboardState>(createInitialState);
  const skipNextPersistenceTupleRef = useRef<string | null>(null);
  const legacyPairIdsRef = useRef(new Map<string, {
    scriptNodeId: string;
    storyboardNodeId: string;
  }>());
  const syncBoundGroupStoryContext = useCallback((
    scriptNodeId: string,
    storyboardNodeId: string,
    scriptData: NonNullable<NodeData['scriptData']>,
    storyboardData: NonNullable<NodeData['storyboardData']>
  ) => {
    setGroups(previous => syncBoundStoryboardGroupContexts(previous, {
      scriptNodeId,
      storyboardNodeId,
      scriptData,
      storyboardData
    }));
  }, [setGroups]);

  const ensureBoundNodes = useCallback((
    options: EnsureBoundNodesOptions = {}
  ): BoundStoryboardNodes => {
    const session = options.session || snapshotFromState(state);
    const requestedScriptNodeId = options.scriptNodeId === undefined
      ? state.scriptNodeId
      : options.scriptNodeId;
    const requestedStoryboardNodeId = options.storyboardNodeId === undefined
      ? state.storyboardNodeId
      : options.storyboardNodeId;
    const requestedScriptNode = nodes.find(node => node.id === requestedScriptNodeId);
    const requestedStoryboardNode = nodes.find(node => node.id === requestedStoryboardNodeId);
    const existingScript = isScriptNode(requestedScriptNode) ? requestedScriptNode : undefined;
    const existingStoryboard = isStoryboardNode(requestedStoryboardNode)
      ? requestedStoryboardNode
      : undefined;
    const center = {
      x: (window.innerWidth / 2 - viewport.x) / viewport.zoom,
      y: (window.innerHeight / 2 - viewport.y) / viewport.zoom
    };
    const pair = ensureStoryboardNodePair({
      nodes,
      edges,
      scriptNodeId: existingScript?.id,
      storyboardNodeId: existingStoryboard?.id,
      center,
      session
    });
    const scriptNode = pair.nodes.find(node => node.id === pair.scriptNodeId);
    const storyboardNode = pair.nodes.find(node => node.id === pair.storyboardNodeId);
    if (!scriptNode || !storyboardNode) {
      throw new Error('Unable to bind storyboard documents');
    }

    const scriptData = scriptNode.scriptData || createEmptyScriptDocument({
      sourceText: scriptNode.prompt
    });
    const storyboardData = {
      ...(storyboardNode.storyboardData || createEmptyStoryboardDocument({
        sourceScriptNodeId: scriptNode.id,
        selectedImageModel: session.selectedImageModel
      })),
      sourceScriptNodeId: scriptNode.id
    };
    const merged = mergeSessionIntoDocuments({
      scriptData,
      storyboardData,
      session
    });
    const boundNodes = pair.nodes.map(node => {
      if (node.id === scriptNode.id) {
        return {
          ...node,
          prompt: merged.scriptData.sourceText,
          scriptData: merged.scriptData
        };
      }
      if (node.id === storyboardNode.id) {
        return {
          ...node,
          storyboardData: merged.storyboardData
        };
      }
      return node;
    });
    const boundScriptNode = boundNodes.find(node => node.id === scriptNode.id);
    const boundStoryboardNode = boundNodes.find(node => node.id === storyboardNode.id);
    if (!boundScriptNode?.scriptData || !boundStoryboardNode?.storyboardData) {
      throw new Error('Unable to prepare storyboard documents');
    }

    syncBoundGroupStoryContext(
      boundScriptNode.id,
      boundStoryboardNode.id,
      boundScriptNode.scriptData,
      boundStoryboardNode.storyboardData
    );
    replaceGraph(boundNodes, pair.edges);
    setState(previous => (
      previous.scriptNodeId === boundScriptNode.id &&
      previous.storyboardNodeId === boundStoryboardNode.id
        ? previous
        : {
            ...previous,
            scriptNodeId: boundScriptNode.id,
            storyboardNodeId: boundStoryboardNode.id
          }
    ));

    return {
      nodes: boundNodes,
      edges: pair.edges,
      scriptNode: boundScriptNode as BoundStoryboardNodes['scriptNode'],
      storyboardNode: boundStoryboardNode as BoundStoryboardNodes['storyboardNode']
    };
  }, [edges, nodes, replaceGraph, state, syncBoundGroupStoryContext, viewport]);

  const hydrateModalFromNodes = useCallback((
    scriptNode: BoundStoryboardNodes['scriptNode'],
    storyboardNode: BoundStoryboardNodes['storyboardNode']
  ) => {
    const session = sessionFromDocuments(scriptNode.scriptData, storyboardNode.storyboardData);
    const isGenerating = scriptNode.status === NodeStatus.LOADING ||
      storyboardNode.status === NodeStatus.LOADING;
    setState({
      ...createInitialState(),
      ...session,
      step: session.compositeImageUrl ? 'preview' : 'scripts',
      isGenerating,
      error: scriptNode.errorMessage || storyboardNode.errorMessage || null,
      scriptNodeId: scriptNode.id,
      storyboardNodeId: storyboardNode.id
    });
    setIsModalOpen(true);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
    setState(createInitialState());
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const setStep = useCallback((step: StoryboardState['step']) => {
    setState(previous => ({ ...previous, step, error: null }));
  }, []);

  const setSelectedCharacters = useCallback((characters: CharacterAsset[]) => {
    setState(previous => ({ ...previous, selectedCharacters: characters }));
  }, []);

  const toggleCharacter = useCallback((character: CharacterAsset) => {
    setState(previous => {
      const isSelected = previous.selectedCharacters.some(item => item.id === character.id);
      if (isSelected) {
        return {
          ...previous,
          selectedCharacters: previous.selectedCharacters.filter(item => item.id !== character.id)
        };
      }
      if (previous.selectedCharacters.length >= 3) {
        return { ...previous, error: 'Maximum 3 characters allowed' };
      }
      return {
        ...previous,
        selectedCharacters: [...previous.selectedCharacters, character],
        error: null
      };
    });
  }, []);

  const setSceneCount = useCallback((count: number) => {
    setState(previous => ({ ...previous, sceneCount: Math.max(1, Math.min(10, count)) }));
  }, []);

  const setStory = useCallback((story: string) => {
    setState(previous => ({ ...previous, story }));
  }, []);

  const setSelectedImageModel = useCallback((model: string) => {
    setState(previous => ({
      ...previous,
      selectedImageModel: model,
      compositeImageUrl: model === previous.selectedImageModel ? previous.compositeImageUrl : null
    }));
  }, []);

  const updateScript = useCallback((index: number, updates: Partial<SceneScript>) => {
    setState(previous => ({
      ...previous,
      scripts: previous.scripts.map((script, scriptIndex) =>
        scriptIndex === index ? { ...script, ...updates } : script
      )
    }));
  }, []);

  const submitStoryGeneration = useCallback(async (
    generationMode: StoryPackageGenerationMode
  ) => {
    if (!state.story.trim()) {
      setState(previous => ({ ...previous, error: 'Please enter a story' }));
      return;
    }

    let bound: ReturnType<typeof ensureBoundNodes> | undefined;
    try {
      bound = ensureBoundNodes();
      const graphSubjectIds = [
        ...getConnectedSubjectInputs(bound.scriptNode, bound.nodes, bound.edges),
        ...getConnectedSubjectInputs(bound.storyboardNode, bound.nodes, bound.edges)
      ]
        .map(node => node.subjectAssetId)
        .filter((id): id is string => Boolean(id));
      const graphSubjectReferences = buildSubjectReferenceSnapshots(
        graphSubjectIds.length > 0 ? await resolveSubjectAssets(graphSubjectIds) : []
      ).flatMap(snapshot => snapshot.referenceImages.slice(0, 1).map(reference => ({
        id: snapshot.subjectAssetId,
        subjectAssetId: snapshot.subjectAssetId,
        name: snapshot.name,
        url: reference.url,
        ...(snapshot.description ? { description: snapshot.description } : {}),
        category: '主体资产'
      })));
      const referenceAssets = mergeStoryReferenceAssets(
        graphSubjectReferences,
        state.selectedCharacters
      ).slice(0, 3);
      const taskScriptData = {
        ...bound.scriptNode.scriptData,
        referenceAssets
      };
      const task = await submitStoryPackageGeneration({
        nodeId: bound.scriptNode.id,
        scriptNodeId: bound.scriptNode.id,
        storyboardNodeId: bound.storyboardNode.id,
        scriptRevision: bound.scriptNode.scriptData.revision,
        storyboardRevision: bound.storyboardNode.storyboardData.revision,
        generationMode,
        sourceText: state.story,
        sceneCount: state.sceneCount,
        referenceAssets,
        selectedImageModel: state.selectedImageModel,
        scriptData: taskScriptData,
        storyboardData: bound.storyboardNode.storyboardData
      }, { workflowId });
      const updates = buildStoryTaskStartUpdates(bound.nodes, task);
      applyNodeUpdates(updates);
      setState(previous => ({
        ...previous,
        isGenerating: true,
        error: null,
        step: 'scripts',
        scriptNodeId: bound!.scriptNode.id,
        storyboardNodeId: bound!.storyboardNode.id
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to submit story generation';
      if (bound) {
        const failure = {
          status: NodeStatus.ERROR as NodeData['status'],
          activeTaskId: undefined,
          errorMessage: message
        };
        applyNodeUpdates({
          [bound.scriptNode.id]: failure,
          [bound.storyboardNode.id]: failure
        });
      }
      setState(previous => ({ ...previous, isGenerating: false, error: message }));
    }
  }, [applyNodeUpdates, ensureBoundNodes, state, workflowId]);

  const generateScripts = useCallback(async () => {
    await submitStoryGeneration('scripts');
  }, [submitStoryGeneration]);

  const generateStoryPackage = useCallback(async () => {
    await submitStoryGeneration('story-package');
  }, [submitStoryGeneration]);

  const brainstormStory = useCallback(async () => {
    setState(previous => ({ ...previous, isBrainstorming: true, error: null }));

    try {
      const response = await fetch('/api/storyboard/brainstorm-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterDescriptions: state.selectedCharacters.map(character => ({
            name: character.name,
            description: character.description || 'A character'
          })),
          referenceImages: state.selectedCharacters.map(character => ({
            name: character.name,
            url: character.url,
            category: character.category || 'Others'
          }))
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to brainstorm story');
      }

      const data = await response.json();
      setState(previous => ({
        ...previous,
        story: data.story,
        isBrainstorming: false
      }));
    } catch (error) {
      console.error('[Storyboard] Brainstorm error:', error);
      setState(previous => ({
        ...previous,
        error: error instanceof Error ? error.message : 'Failed to brainstorm story',
        isBrainstorming: false
      }));
    }
  }, [state.selectedCharacters]);

  const optimizeStory = useCallback(async () => {
    if (!state.story.trim()) {
      setState(previous => ({ ...previous, error: 'Please enter a story first' }));
      return;
    }

    setState(previous => ({ ...previous, isOptimizing: true, error: null }));

    try {
      const response = await fetch('/api/storyboard/optimize-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          story: state.story,
          characterNames: state.selectedCharacters.map(character => character.name)
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to optimize story');
      }

      const data = await response.json();
      setState(previous => ({
        ...previous,
        story: data.optimizedStory,
        isOptimizing: false
      }));
    } catch (error) {
      console.error('[Storyboard] Optimization error:', error);
      setState(previous => ({
        ...previous,
        error: error instanceof Error ? error.message : 'Failed to optimize story',
        isOptimizing: false
      }));
    }
  }, [state.selectedCharacters, state.story]);

  const generateComposite = useCallback(async () => {
    setState(previous => ({ ...previous, isGeneratingPreview: true, error: null }));

    try {
      const response = await fetch('/api/storyboard/generate-composite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scripts: state.scripts,
          styleAnchor: state.styleAnchor,
          characterDNA: state.characterDNA,
          sceneCount: state.scripts.length,
          imageModel: state.selectedImageModel || 'gpt-image-2',
          referenceImages: state.selectedCharacters.map(character => ({
            name: character.name,
            url: character.url,
            category: character.category || 'Others'
          }))
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate composite preview');
      }

      const data = await response.json();
      setState(previous => ({
        ...previous,
        compositeImageUrl: data.imageUrl,
        step: 'preview',
        isGeneratingPreview: false
      }));
    } catch (error) {
      console.error('[Storyboard] Composite generation error:', error);
      setState(previous => ({
        ...previous,
        error: error instanceof Error ? error.message : 'Failed to generate preview',
        isGeneratingPreview: false
      }));
    }
  }, [
    state.characterDNA,
    state.scripts,
    state.selectedCharacters,
    state.selectedImageModel,
    state.styleAnchor
  ]);

  const regenerateComposite = useCallback(async () => {
    setState(previous => ({ ...previous, step: 'preview' }));
    await generateComposite();
  }, [generateComposite]);

  const createStoryboardNodes = useCallback((options: CreateStoryboardNodesOptions = {}) => {
    if (state.scripts.length === 0) {
      setState(previous => ({ ...previous, error: 'No scripts to create' }));
      return;
    }

    const bound = ensureBoundNodes();
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom;
    const nodeWidth = 340;
    const nodeGap = 100;
    const totalWidth = state.scripts.length * nodeWidth + (state.scripts.length - 1) * nodeGap;
    const startX = centerX - totalWidth / 2;
    const characterImageUrls = state.selectedCharacters
      .filter(character => character.url)
      .map(character => character.url);
    const storyboardGroupId = crypto.randomUUID();
    const selectedImageModel = state.selectedImageModel || 'gpt-image-2';
    const newNodes: Partial<NodeData>[] = state.scripts.map((script, index) => {
      const sceneNumber = script.sceneNumber || (index + 1);
      const prompt = state.compositeImageUrl
        ? `Extract panel #${sceneNumber} from this storyboard reference image. Keep all characters, environment, colors, art style, and composition exactly the same. Recreate only this single panel as a standalone 16:9 image.`
        : `${state.styleAnchor || 'photorealistic, cinematic lighting, high detail'}. ${script.description}. Camera: ${script.cameraAngle}. Mood: ${script.mood}.`;
      const referenceUrls = state.compositeImageUrl
        ? [state.compositeImageUrl]
        : characterImageUrls.length > 0 ? characterImageUrls : undefined;

      return createStoryboardImageNode({
        id: crypto.randomUUID(),
        x: startX + index * (nodeWidth + nodeGap),
        y: centerY - 100,
        prompt,
        imageModel: selectedImageModel,
        title: `Scene ${sceneNumber}`,
        groupId: storyboardGroupId,
        characterReferenceUrls: referenceUrls
      });
    });
    const storyboardData = attachImageNodesToShots(
      bound.storyboardNode.storyboardData,
      newNodes.map(node => node.id!)
    );
    const boundNodes = bound.nodes.map(node => node.id === bound.storyboardNode.id
      ? { ...node, storyboardData }
      : node);
    replaceGraph(boundNodes, bound.edges);

    onCreateNodes(newNodes, {
      groupId: storyboardGroupId,
      groupLabel: `Storyboard ${new Date().toLocaleTimeString()}`,
      openVideoAfterImages: options.continueToVideo === true,
      storyContext: legacyStoryContextFromDocuments(
        bound.scriptNode.scriptData,
        storyboardData,
        {
          scriptNodeId: bound.scriptNode.id,
          storyboardNodeId: bound.storyboardNode.id
        }
      )
    });
    closeModal();
  }, [
    closeModal,
    ensureBoundNodes,
    onCreateNodes,
    replaceGraph,
    state.compositeImageUrl,
    state.scripts,
    state.selectedCharacters,
    state.selectedImageModel,
    state.styleAnchor,
    viewport
  ]);

  const editLegacyStoryboard = useCallback((groupId: string) => {
    const group = groups.find(candidate => candidate.id === groupId);
    if (!group?.storyContext) return;

    const groupNodes = nodes.filter(node => group.nodeIds.includes(node.id));
    const minX = groupNodes.length > 0 ? Math.min(...groupNodes.map(node => node.x)) : 0;
    const minY = groupNodes.length > 0 ? Math.min(...groupNodes.map(node => node.y)) : 0;
    const savedIds = legacyPairIdsRef.current.get(group.id);
    const materializationGroup = savedIds
      ? {
          ...group,
          storyContext: {
            ...group.storyContext,
            ...savedIds
          }
        }
      : group;
    const materialized = materializeLegacyStoryboardGroup({
      group: materializationGroup,
      nodes,
      edges,
      anchor: { x: minX - 460, y: minY }
    });
    const scriptNode = materialized.nodes.find(node => node.id === materialized.scriptNodeId);
    const storyboardNode = materialized.nodes.find(node => node.id === materialized.storyboardNodeId);
    if (!scriptNode?.scriptData || !storyboardNode?.storyboardData) {
      setState(previous => ({ ...previous, error: 'Unable to open storyboard documents' }));
      return;
    }

    legacyPairIdsRef.current.set(group.id, {
      scriptNodeId: scriptNode.id,
      storyboardNodeId: storyboardNode.id
    });
    replaceGraph(materialized.nodes, materialized.edges);
    setGroups(previous => previous.map(candidate => candidate.id === group.id
      ? materialized.group
      : candidate));
    hydrateModalFromNodes(
      scriptNode as BoundStoryboardNodes['scriptNode'],
      storyboardNode as BoundStoryboardNodes['storyboardNode']
    );
  }, [edges, groups, hydrateModalFromNodes, nodes, replaceGraph, setGroups]);

  const openNode = useCallback((nodeId: string) => {
    const selectedNode = nodes.find(node => node.id === nodeId);
    if (!selectedNode) return;

    let scriptNode: NodeData | undefined;
    let storyboardNode: NodeData | undefined;
    if (isScriptNode(selectedNode)) {
      scriptNode = selectedNode;
      storyboardNode = nodes.find(node => isStoryboardNode(node) &&
        node.storyboardData?.sourceScriptNodeId === scriptNode!.id
      ) || nodes.find(node => isStoryboardNode(node) && edges.some(edge =>
        edge.sourceNodeId === scriptNode!.id &&
        edge.sourcePortId === 'script-output' &&
        edge.targetNodeId === node.id &&
        edge.targetPortId === 'script-input'
      ));
    } else if (isStoryboardNode(selectedNode)) {
      storyboardNode = selectedNode;
      scriptNode = nodes.find(node => isScriptNode(node) &&
        node.id === storyboardNode!.storyboardData?.sourceScriptNodeId
      ) || nodes.find(node => isScriptNode(node) && edges.some(edge =>
        edge.sourceNodeId === node.id &&
        edge.sourcePortId === 'script-output' &&
        edge.targetNodeId === storyboardNode!.id &&
        edge.targetPortId === 'script-input'
      ));
    } else {
      return;
    }

    const existingScriptData = scriptNode?.scriptData || createEmptyScriptDocument({
      sourceText: scriptNode?.prompt || ''
    });
    const scriptData = !existingScriptData.sourceText && scriptNode?.prompt
      ? { ...existingScriptData, sourceText: scriptNode.prompt }
      : existingScriptData;
    const storyboardData = storyboardNode?.storyboardData || createEmptyStoryboardDocument({
      sourceScriptNodeId: scriptNode?.id,
      selectedImageModel: state.selectedImageModel
    });
    const bound = ensureBoundNodes({
      scriptNodeId: scriptNode?.id || null,
      storyboardNodeId: storyboardNode?.id || null,
      session: sessionFromDocuments(scriptData, storyboardData)
    });
    hydrateModalFromNodes(bound.scriptNode, bound.storyboardNode);
  }, [edges, ensureBoundNodes, hydrateModalFromNodes, nodes, state.selectedImageModel]);

  const cancelTaskForNode = useCallback(async (nodeId: string): Promise<void> => {
    const node = nodes.find(candidate => candidate.id === nodeId);
    if (!node?.activeTaskId) return;

    try {
      const task = await cancelGenerationTask(node.activeTaskId);
      const updates = buildGenerationTaskNodeUpdates(nodes, task);
      if (hasUpdates(updates)) {
        applyNodeUpdates(updates);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel story generation';
      setState(previous => ({ ...previous, error: message }));
    }
  }, [applyNodeUpdates, nodes]);

  const retryTaskForNode = useCallback(async (nodeId: string): Promise<void> => {
    const node = nodes.find(candidate => candidate.id === nodeId);
    if (!node?.lastTaskId) return;

    try {
      const task = await retryGenerationTask(node.lastTaskId);
      const updates = buildStoryTaskStartUpdates(nodes, task);
      if (!hasUpdates(updates)) {
        setState(previous => ({
          ...previous,
          error: '当前内容已修改，请使用重新生成以提交最新内容。'
        }));
        return;
      }

      applyNodeUpdates(updates);
      const storyboardNodeId = Object.keys(updates).find(id => id !== task.nodeId);
      if (!storyboardNodeId) {
        setState(previous => ({
          ...previous,
          error: '当前内容已修改，请使用重新生成以提交最新内容。'
        }));
        return;
      }
      setState(previous => ({
        ...previous,
        isGenerating: true,
        error: null,
        step: 'scripts',
        scriptNodeId: task.nodeId,
        storyboardNodeId
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to retry story generation';
      setState(previous => ({ ...previous, error: message }));
    }
  }, [applyNodeUpdates, nodes]);

  const boundScriptNode = state.scriptNodeId
    ? nodes.find(node => node.id === state.scriptNodeId && isScriptNode(node))
    : undefined;
  const boundStoryboardNode = state.storyboardNodeId
    ? nodes.find(node => node.id === state.storyboardNodeId && isStoryboardNode(node))
    : undefined;
  const boundNodeTuple = taskAndStatusTuple(boundScriptNode, boundStoryboardNode);

  useEffect(() => {
    if (!boundNodeTuple || !boundScriptNode?.scriptData || !boundStoryboardNode?.storyboardData) {
      return;
    }

    skipNextPersistenceTupleRef.current = boundNodeTuple;
    syncBoundGroupStoryContext(
      boundScriptNode.id,
      boundStoryboardNode.id,
      boundScriptNode.scriptData,
      boundStoryboardNode.storyboardData
    );
    const session = sessionFromDocuments(
      boundScriptNode.scriptData,
      boundStoryboardNode.storyboardData
    );
    const isGenerating = boundScriptNode.status === NodeStatus.LOADING ||
      boundStoryboardNode.status === NodeStatus.LOADING;
    setState(previous => ({
      ...previous,
      ...session,
      isGenerating,
      error: boundScriptNode.errorMessage || boundStoryboardNode.errorMessage || null
    }));
  }, [boundNodeTuple, syncBoundGroupStoryContext]);

  useEffect(() => {
    if (!boundScriptNode?.scriptData || !boundStoryboardNode?.storyboardData) {
      return;
    }
    if (skipNextPersistenceTupleRef.current === boundNodeTuple) {
      skipNextPersistenceTupleRef.current = null;
      return;
    }

    const merged = mergeSessionIntoDocuments({
      scriptData: boundScriptNode.scriptData,
      storyboardData: boundStoryboardNode.storyboardData,
      session: snapshotFromState(state)
    });
    if (
      merged.scriptData === boundScriptNode.scriptData &&
      merged.storyboardData === boundStoryboardNode.storyboardData
    ) {
      return;
    }

    const resetTask = Boolean(boundScriptNode.activeTaskId || boundStoryboardNode.activeTaskId)
      ? {
          status: NodeStatus.IDLE as NodeData['status'],
          activeTaskId: undefined,
          generationStartTime: undefined
        }
      : {};
    syncBoundGroupStoryContext(
      boundScriptNode.id,
      boundStoryboardNode.id,
      merged.scriptData,
      merged.storyboardData
    );
    applyNodeUpdates({
      [boundScriptNode.id]: {
        ...(merged.scriptData !== boundScriptNode.scriptData
          ? {
              prompt: merged.scriptData.sourceText,
              scriptData: merged.scriptData
            }
          : {}),
        ...resetTask
      },
      [boundStoryboardNode.id]: {
        ...(merged.storyboardData !== boundStoryboardNode.storyboardData
          ? { storyboardData: merged.storyboardData }
          : {}),
        ...resetTask
      }
    });
  }, [
    state.story,
    state.scripts,
    state.selectedCharacters,
    state.sceneCount,
    state.styleAnchor,
    state.characterDNA,
    state.selectedImageModel,
    state.compositeImageUrl,
    state.scriptNodeId,
    state.storyboardNodeId,
    syncBoundGroupStoryContext
  ]);

  useEffect(() => {
    const updates = buildStoryboardMediaProjectionUpdates(nodes);
    if (hasUpdates(updates)) {
      applyNodeUpdates(updates);
    }
  }, [applyNodeUpdates, nodes]);

  return {
    isModalOpen,
    openModal,
    closeModal,
    openNode,
    editLegacyStoryboard,
    cancelTaskForNode,
    retryTaskForNode,
    state,
    setStep,
    setSelectedCharacters,
    toggleCharacter,
    setSceneCount,
    setStory,
    setSelectedImageModel,
    updateScript,
    generateScripts,
    generateStoryPackage,
    brainstormStory,
    optimizeStory,
    generateComposite,
    regenerateComposite,
    createStoryboardNodes
  };
};
