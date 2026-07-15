/**
 * App.tsx
 * 
 * Main application component for TwitCanva.
 * Orchestrates canvas, nodes, connections, and user interactions.
 * Uses custom hooks for state management and logic separation.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { TopBar } from './components/TopBar';
import { CanvasNode } from './components/canvas/CanvasNode';
import { NodeCommandPalette } from './components/canvas/NodeCommandPalette';
import { ConnectionsLayer } from './components/canvas/ConnectionsLayer';
import { ConnectionPortPicker } from './components/canvas/ConnectionPortPicker';
import { ContextMenu } from './components/ContextMenu';
import { ContextMenuState, NodeData, NodeGroup, NodeStatus, NodeType } from './types';
import { useCanvasNavigation } from './hooks/useCanvasNavigation';
import { useNodeManagement } from './hooks/useNodeManagement';
import { useConnectionDragging, type ConnectionDragDrop } from './hooks/useConnectionDragging';
import { useNodeDragging } from './hooks/useNodeDragging';
import { useGeneration } from './hooks/useGeneration';
import { useImageEditGeneration } from './hooks/useImageEditGeneration';
import { useSelectionBox } from './hooks/useSelectionBox';
import { useGroupManagement } from './hooks/useGroupManagement';
import { areCanvasHistoryStatesEqual, useHistory } from './hooks/useHistory';
import { useCanvasTitle } from './hooks/useCanvasTitle';
import { useWorkflow } from './hooks/useWorkflow';
import { useWorkflowTemplates } from './hooks/useWorkflowTemplates';
import { useImageEditor } from './hooks/useImageEditor';
import { useVideoEditor } from './hooks/useVideoEditor';
import { usePanelState } from './hooks/usePanelState';
import { useAssetHandlers } from './hooks/useAssetHandlers';
import { useTextNodeHandlers } from './hooks/useTextNodeHandlers';
import { useImageNodeHandlers } from './hooks/useImageNodeHandlers';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useContextMenuHandlers } from './hooks/useContextMenuHandlers';
import { useAutoSave } from './hooks/useAutoSave';
import { useGenerationRecovery } from './hooks/useGenerationRecovery';
import { useVideoFrameExtraction } from './hooks/useVideoFrameExtraction';
import { useTimeline } from './hooks/useTimeline';
import { createDefaultNodeData } from './domain/nodes/nodeRegistry';
import {
  createConnectionPortFeedbackIndex,
  resolveConnectionDrop,
  type ConnectionTargetChoice
} from './domain/graph/semanticCanvas';
import {
  CANVAS_WHEEL_LISTENER_OPTIONS,
  preventCanvasWheelDefault
} from './utils/canvasWheel';
import type { CanvasNodeSize } from './utils/connectionHitTesting';
import { isNodeCommandPaletteShortcut } from './utils/nodeCommandPaletteShortcut';
import { createEmptyTimelineDocument } from './domain/timeline/timelineDocument';
import type { TimelineDocument } from './domain/timeline/timelineTypes';
import type { WorkflowData } from './domain/workflow/workflowSchema';
import { extractVideoLastFrame } from './utils/videoHelpers';
import { SelectionBoundingBox } from './components/canvas/SelectionBoundingBox';
import { WorkflowPanel } from './components/WorkflowPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { ChatPanel, ChatBubble } from './components/ChatPanel';
import { ImageEditorModal } from './components/modals/ImageEditorModal';
import { VideoEditorModal } from './components/modals/VideoEditorModal';
import { ExpandedMediaModal } from './components/modals/ExpandedMediaModal';
import { CreateAssetModal } from './components/modals/CreateAssetModal';
import { TikTokImportModal } from './components/modals/TikTokImportModal';
import { TwitterPostModal } from './components/modals/TwitterPostModal';
import { TikTokPostModal } from './components/modals/TikTokPostModal';
import { WorkflowTemplateSaveModal } from './components/modals/WorkflowTemplateSaveModal';
import { AssetLibraryPanel } from './components/AssetLibraryPanel';
import { TimelinePanel } from './components/timeline/TimelinePanel';
import { useTikTokImport } from './hooks/useTikTokImport';
import { useStoryboardGenerator } from './hooks/useStoryboardGenerator';
import { StoryboardGeneratorModal } from './components/modals/StoryboardGeneratorModal';
import { StoryboardVideoModal } from './components/modals/StoryboardVideoModal';
import { attachVideoNodesToShots, getEffectiveStoryContext } from './domain/storyboard/storyboardGraph';
import { getStoryboardVideoReadiness } from './utils/storyboardFlow';
import { isSeedanceVideoModel } from './utils/videoModelRouting';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

interface PendingConnectionPortSelection {
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  choices: ConnectionTargetChoice[];
}

export default function App() {
  // ============================================================================
  // STATE
  // ============================================================================

  const [hasApiKey] = useState(true); // Backend handles API key
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    type: 'global'
  });
  const [pendingConnectionPortSelection, setPendingConnectionPortSelection] = useState<PendingConnectionPortSelection | null>(null);
  const [isNodeCommandPaletteOpen, setIsNodeCommandPaletteOpen] = useState(false);

  const [canvasTheme, setCanvasTheme] = useState<'dark' | 'light'>('dark');

  // Panel state management (history, chat, asset library, expand)
  const {
    isHistoryPanelOpen,
    historyPanelY,
    handleHistoryClick: panelHistoryClick,
    closeHistoryPanel,
    expandedImageUrl,
    handleExpandImage,
    handleCloseExpand,
    isChatOpen,
    toggleChat,
    closeChat,
    isAssetLibraryOpen,
    assetLibraryY,
    assetLibraryVariant,
    handleAssetsClick: panelAssetsClick,
    closeAssetLibrary,
    openAssetLibraryModal,
    isDraggingNodeToChat,
    handleNodeDragStart,
    handleNodeDragEnd
  } = usePanelState();

  const [canvasHoveredNodeId, setCanvasHoveredNodeId] = useState<string | null>(null);


  // Canvas title state (via hook)
  const {
    canvasTitle,
    setCanvasTitle,
    isEditingTitle,
    setIsEditingTitle,
    editingTitleValue,
    setEditingTitleValue,
    canvasTitleInputRef
  } = useCanvasTitle();

  const {
    viewport,
    setViewport,
    canvasRef,
    handleWheel: baseHandleWheel,
    handleSliderZoom
  } = useCanvasNavigation();

  // Wrap handleWheel to pass hovered node for zoom-to-center
  const handleWheel = (e: React.WheelEvent) => {
    const hoveredNode = canvasHoveredNodeId ? nodes.find(n => n.id === canvasHoveredNodeId) : undefined;
    baseHandleWheel(e, hoveredNode);
  };

  const {
    nodes,
    setNodes,
    edges,
    selectedNodeIds,
    setSelectedNodeIds,
    addNode,
    addConnectedNodeFromSources,
    updateNode,
    applyNodeUpdates,
    deleteNode,
    deleteNodes,
    addEdge,
    removeEdge,
    replaceGraph,
    validateAndAddEdge,
    clearSelection,
    handleSelectTypeFromMenu
  } = useNodeManagement();

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const viewportRef = useRef(viewport);
  const [nodeSizes, setNodeSizes] = useState<Record<string, CanvasNodeSize>>({});
  const nodeSizesRef = useRef(nodeSizes);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  viewportRef.current = viewport;
  nodeSizesRef.current = nodeSizes;

  const handleNodeBoundsChange = React.useCallback((nodeId: string, size: CanvasNodeSize) => {
    setNodeSizes(previous => {
      const current = previous[nodeId];
      if (current?.width === size.width && current.height === size.height) return previous;
      return { ...previous, [nodeId]: size };
    });
  }, []);

  const {
    isDraggingConnection,
    connectionStart,
    tempConnectionEnd,
    selectedEdgeId,
    setSelectedEdgeId,
    connectionError,
    reportConnectionError,
    handlePortPointerDown,
    handlePortPointerEnter,
    handlePortPointerLeave,
    updateConnectionDrag,
    completeConnectionDrag,
    handleEdgeClick,
    deleteSelectedConnection
  } = useConnectionDragging();
  const portFeedbackByKey = React.useMemo(
    () => createConnectionPortFeedbackIndex(nodes, edges, connectionStart),
    [nodes, edges, connectionStart]
  );

  const {
    handleNodePointerDown,
    updateNodeDrag,
    endNodeDrag,
    startPanning,
    updatePanning,
    endPanning,
    isDragging,
    releasePointerCapture
  } = useNodeDragging();

  const {
    selectionBox,
    isSelecting,
    startSelection,
    updateSelection,
    endSelection,
    clearSelectionBox
  } = useSelectionBox();

  const {
    groups,
    setGroups, // For workflow loading
    groupNodes,
    ungroupNodes,
    cleanupInvalidGroups,
    getCommonGroup,
    sortGroupNodes,
    renameGroup
  } = useGroupManagement();

  const [timeline, setTimeline] = useState<TimelineDocument>(() => createEmptyTimelineDocument());
  const {
    isTimelineOpen,
    closeTimeline,
    toggleTimeline,
    addNodeResultToTimeline,
    addStoryboardVideosToTimeline,
    moveClip: moveTimelineClip,
    removeClip: removeTimelineClip
  } = useTimeline({ nodes, timeline, setTimeline });

  // History for undo/redo
  const {
    present: historyState,
    undo,
    redo,
    pushHistory,
    reset: resetHistory,
    canUndo,
    canRedo
  } = useHistory({ nodes, edges, groups, timeline }, 50);
  const currentHistoryStateRef = React.useRef({ nodes, edges, groups, timeline });
  currentHistoryStateRef.current = { nodes, edges, groups, timeline };

  const handleWorkflowHistoryReset = React.useCallback((workflow: WorkflowData) => {
    resetHistory({
      nodes: workflow.nodes,
      edges: workflow.edges,
      groups: workflow.groups,
      timeline: workflow.timeline
    });
  }, [resetHistory]);

  // Workflow management
  const {
    workflowId,
    isWorkflowPanelOpen,
    workflowPanelY,
    handleSaveWorkflow,
    handleLoadWorkflow,
    handleWorkflowsClick,
    closeWorkflowPanel,
    resetWorkflowId
  } = useWorkflow({
    nodes,
    edges,
    groups,
    timeline,
    viewport,
    canvasTitle,
    replaceGraph,
    setGroups,
    setTimeline,
    setSelectedNodeIds,
    setCanvasTitle,
    setEditingTitleValue,
    onWorkflowLoaded: handleWorkflowHistoryReset,
    onPanelOpen: () => {
      closeHistoryPanel();
      closeAssetLibrary();
      closeTimeline();
    }
  });

  // Simple dirty flag for unsaved changes tracking
  const [isDirty, setIsDirty] = React.useState(false);
  const hasUnsavedChanges = isDirty && nodes.length > 0;

  React.useEffect(() => {
    if (selectedEdgeId && !edges.some(edge => edge.id === selectedEdgeId)) {
      setSelectedEdgeId(null);
    }
  }, [edges, selectedEdgeId, setSelectedEdgeId]);

  // Mark as dirty when nodes, edges, or title change
  const isInitialMount = React.useRef(true);
  const lastActiveTaskIdsRef = React.useRef('');
  const ignoreNextChange = React.useRef(false);

  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (ignoreNextChange.current) {
      ignoreNextChange.current = false;
      return;
    }

    setIsDirty(true);

    // Persist task references as soon as the backend assigns them.
    const currentActiveTaskIds = nodes
      .filter(node => node.activeTaskId)
      .map(node => `${node.id}:${node.activeTaskId}`)
      .sort()
      .join(',');
    const hasNewTaskReference = Boolean(currentActiveTaskIds)
      && currentActiveTaskIds !== lastActiveTaskIdsRef.current;
    if (hasNewTaskReference) {
      console.log('[App] New generation task detected, triggering immediate save for recovery protection');
      handleSaveWithTracking();
    }
    lastActiveTaskIdsRef.current = currentActiveTaskIds;
  }, [nodes, edges, canvasTitle, timeline]);

  // Update saved state after workflow save
  const handleSaveWithTracking = async () => {
    await handleSaveWorkflow();
    setIsDirty(false);
  };

  // Load workflow and update tracking
  const handleLoadWithTracking = async (id: string) => {
    ignoreNextChange.current = true;
    await handleLoadWorkflow(id);
    setSelectedEdgeId(null);
    setIsDirty(false);
  };

  const { handleGenerate, handleCancelGeneration, handleRetryGeneration } = useGeneration({
    nodes,
    edges,
    workflowId,
    updateNode
  });

  const {
    isSavingTemplate,
    isInsertingTemplate,
    templateError,
    saveWorkflowTemplate,
    insertWorkflowTemplate,
    clearTemplateError
  } = useWorkflowTemplates({
    nodes,
    edges,
    groups,
    viewport,
    replaceGraph,
    setGroups,
    setSelectedNodeIds
  });
  const [templateRevision, setTemplateRevision] = useState(0);
  const [templateSaveDialog, setTemplateSaveDialog] = useState<{
    isOpen: boolean;
    nodeIds: string[];
    initialTitle: string;
  }>({ isOpen: false, nodeIds: [], initialTitle: '未命名模板' });

  const handleOpenTemplateSaveModal = React.useCallback((nodeIds: string[], group?: NodeGroup) => {
    const firstNode = nodes.find(node => node.id === nodeIds[0]);
    clearTemplateError();
    setTemplateSaveDialog({
      isOpen: true,
      nodeIds,
      initialTitle: group?.label || firstNode?.title || '未命名模板'
    });
  }, [nodes, clearTemplateError]);

  const handleCloseTemplateSaveModal = React.useCallback(() => {
    if (isSavingTemplate) return;
    clearTemplateError();
    setTemplateSaveDialog(previous => ({ ...previous, isOpen: false }));
  }, [isSavingTemplate, clearTemplateError]);

  const handleSaveTemplate = React.useCallback(async (title: string, description: string) => {
    try {
      await saveWorkflowTemplate({
        title,
        description,
        selectedNodeIds: templateSaveDialog.nodeIds
      });
      setTemplateRevision(previous => previous + 1);
      setTemplateSaveDialog(previous => ({ ...previous, isOpen: false }));
    } catch (error) {
      console.error('Failed to save workflow template:', error);
    }
  }, [saveWorkflowTemplate, templateSaveDialog.nodeIds]);

  const handleInsertTemplate = React.useCallback(async (templateId: string) => {
    try {
      await insertWorkflowTemplate(templateId);
      closeWorkflowPanel();
    } catch (error) {
      console.error('Failed to insert workflow template:', error);
    }
  }, [insertWorkflowTemplate, closeWorkflowPanel]);

  const { handleImageEditGeneration } = useImageEditGeneration({
    nodes,
    workflowId,
    setNodes,
    addEdge,
    updateNode
  });

  // Keep a ref to handleGenerate so setTimeout callbacks can access the latest version
  const handleGenerateRef = React.useRef(handleGenerate);
  React.useEffect(() => {
    handleGenerateRef.current = handleGenerate;
  }, [handleGenerate]);

  // Create new canvas
  const handleNewCanvas = () => {
    ignoreNextChange.current = true;
    setNodes([]);
    setSelectedEdgeId(null);
    setGroups([]); // Reset groups for new canvas
    setTimeline(createEmptyTimelineDocument());
    setSelectedNodeIds([]);
    setCanvasTitle('未命名画布');
    setEditingTitleValue('未命名画布');
    resetWorkflowId(); // Important: ensures new workflow gets a new ID
    setIsDirty(false);
  };

  // Image editor modal
  const {
    editorModal,
    handleOpenImageEditor,
    handleCloseImageEditor,
    handleUpload
  } = useImageEditor({ nodes, edges, updateNode });

  // Video editor modal
  const {
    videoEditorModal,
    handleOpenVideoEditor,
    handleCloseVideoEditor,
    handleExportTrimmedVideo
  } = useVideoEditor({ nodes, updateNode });

  /**
   * Routes editor open to the correct handler based on node type
   */
  const handleOpenEditor = React.useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    if (node.type === NodeType.VIDEO_EDITOR) {
      handleOpenVideoEditor(nodeId);
    } else {
      handleOpenImageEditor(nodeId);
    }
  }, [nodes, handleOpenVideoEditor, handleOpenImageEditor]);

  // Text node handlers
  const {
    handleWriteContent,
    handleTextToVideo,
    handleTextToImage
  } = useTextNodeHandlers({ nodes, updateNode, setNodes, setSelectedNodeIds });

  // Image node handlers
  const {
    handleImageToImage,
    handleImageToVideo,
    handleChangeAngleGenerate
  } = useImageNodeHandlers({ nodes, setNodes, setSelectedNodeIds, onGenerateNode: handleGenerate });

  // Asset handlers (create asset modal)
  const {
    isCreateAssetModalOpen,
    setIsCreateAssetModalOpen,
    nodeToSnapshot,
    handleOpenCreateAsset,
    handleSaveAssetToLibrary,
    handleSaveSubjectAsset,
    handleAudioNodeUpload,
    handleContextUpload
  } = useAssetHandlers({ nodes, viewport, contextMenu, setNodes });

  const handleDeleteSelectedConnection = React.useCallback(() => {
    deleteSelectedConnection(removeEdge);
  }, [deleteSelectedConnection, removeEdge]);

  // Keyboard shortcuts (copy/paste/delete/undo/redo)
  const {
    handleCopy,
    handlePaste,
    handleDuplicate
  } = useKeyboardShortcuts({
    nodes,
    selectedNodeIds,
    selectedEdgeId,
    setNodes,
    setSelectedNodeIds,
    setContextMenu,
    deleteNodes,
    deleteSelectedConnection: handleDeleteSelectedConnection,
    clearSelection,
    clearSelectionBox,
    undo,
    redo
  });

  // Auto-Save Management
  const { lastSaveTime: lastAutoSaveTime } = useAutoSave({
    isDirty,
    nodes,
    onSave: handleSaveWithTracking,
    interval: 60000 // Save every 60 seconds
  });

  // Generation Recovery Management
  useGenerationRecovery({
    nodes,
    updateNode,
    applyNodeUpdates
  });

  // Video Frame Extraction (auto-extract lastFrame for videos missing thumbnails)
  useVideoFrameExtraction({
    nodes,
    updateNode
  });

  // TikTok Import Tool
  const {
    isModalOpen: isTikTokModalOpen,
    openModal: openTikTokModal,
    closeModal: closeTikTokModal,
    handleVideoImported: handleTikTokVideoImported
  } = useTikTokImport({
    nodes,
    setNodes,
    setSelectedNodeIds,
    viewport
  });

  // Storyboard Generator Tool
  const [pendingStoryboardVideoGroupId, setPendingStoryboardVideoGroupId] = useState<string | null>(null);

  const handleCreateStoryboardNodes = React.useCallback((
    newNodeData: Partial<NodeData>[],
    groupInfo?: {
      groupId: string;
      groupLabel: string;
      storyContext?: NodeGroup['storyContext'];
      openVideoAfterImages?: boolean;
    }
  ) => {
    console.log('[Storyboard] handleCreateStoryboardNodes called with', newNodeData.length, 'nodes, groupInfo:', !!groupInfo);
    const newNodes: NodeData[] = newNodeData.map(data => {
      const type = data.type || NodeType.IMAGE;
      return {
        ...createDefaultNodeData(type),
        ...data,
        id: data.id || crypto.randomUUID(),
        type,
        x: data.x ?? 0,
        y: data.y ?? 0,
        parentIds: data.parentIds || []
      };
    });

    setNodes(prev => [...prev, ...newNodes]);

    // Auto-group the storyboard nodes
    if (groupInfo && newNodes.length > 0) {
      const newGroup = {
        id: groupInfo.groupId,
        nodeIds: newNodes.map(n => n.id),
        label: groupInfo.groupLabel,
        // Save story context if available to help AI understand the full narrative later
        storyContext: groupInfo.storyContext
      };
      setGroups(prev => [...prev, newGroup]);
    }

    if (groupInfo?.openVideoAfterImages) {
      setPendingStoryboardVideoGroupId(groupInfo.groupId);
    }

    if (newNodes.length > 0) {
      setSelectedNodeIds(newNodes.map(n => n.id));
    }

    // Auto-trigger generation for each storyboard node with a small delay
    // to ensure state is updated before generation starts
    if (groupInfo) {
      setTimeout(() => {
        console.log('[Storyboard] Auto-triggering generation for', newNodes.length, 'nodes');
        newNodes.forEach((node, index) => {
          // Stagger generation calls slightly to avoid overwhelming the API
          setTimeout(() => {
            console.log(`[Storyboard] Starting generation for node ${index + 1}:`, node.id);
            // Use ref to get the latest handleGenerate function
            handleGenerateRef.current(node.id);
          }, index * 500); // 500ms delay between each node
        });
      }, 100); // Initial delay to let state settle
    }
  }, [setNodes, setSelectedNodeIds, setGroups]);

  const storyboardGenerator = useStoryboardGenerator({
    nodes,
    edges,
    groups,
    workflowId,
    replaceGraph,
    applyNodeUpdates,
    setGroups,
    onCreateNodes: handleCreateStoryboardNodes,
    viewport
  });

  const handleEditStoryboard = React.useCallback((groupId: string) => {
    storyboardGenerator.editLegacyStoryboard(groupId);
  }, [storyboardGenerator]);

  // Storyboard Video Modal State
  const [storyboardVideoModal, setStoryboardVideoModal] = useState<{
    isOpen: boolean;
    nodes: NodeData[];
    storyContext?: NodeGroup['storyContext'];
  }>({ isOpen: false, nodes: [] });

  const handleCreateStoryboardVideo = React.useCallback((targetNodeIds?: string[]) => {
    // Determine which nodes to use: explicit list or current selection
    const nodeIdsToCheck = targetNodeIds || selectedNodeIds;

    // Filter for Image nodes only (can't make video from text/video directly in this flow)
    const selectedImageNodes = nodes.filter(n => nodeIdsToCheck.includes(n.id) && n.type === NodeType.IMAGE);

    if (selectedImageNodes.length === 0) {
      console.warn("No image nodes selected for video generation. Checked IDs:", nodeIdsToCheck);
      return;
    }

    // Check if nodes belong to a group with story context
    const firstNode = selectedImageNodes[0];
    const group = firstNode.groupId ? groups.find(g => g.id === firstNode.groupId) : undefined;
    const storyContext = group ? getEffectiveStoryContext(group, nodes) : undefined;

    if (storyContext) {
      console.log('[App] Found Story Context for Video Modal:', {
        storyLength: storyContext.story.length,
        scriptsCount: storyContext.scripts.length
      });
    }

    setStoryboardVideoModal({
      isOpen: true,
      nodes: selectedImageNodes,
      storyContext
    });
  }, [nodes, selectedNodeIds, groups]);

  React.useEffect(() => {
    if (!pendingStoryboardVideoGroupId) return;

    const readiness = getStoryboardVideoReadiness(nodes, pendingStoryboardVideoGroupId);
    if (!readiness.isComplete) return;

    setPendingStoryboardVideoGroupId(null);
    if (readiness.readyNodeIds.length === 0) return;

    setSelectedNodeIds(readiness.readyNodeIds);
    handleCreateStoryboardVideo(readiness.readyNodeIds);
  }, [pendingStoryboardVideoGroupId, nodes, handleCreateStoryboardVideo, setSelectedNodeIds]);

  const handleGenerateStoryVideos = React.useCallback((
    prompts: Record<string, string>,
    settings: { model: string; duration: number; resolution: string; },
    activeNodeIds?: string[]
  ) => {
    // Close modal
    setStoryboardVideoModal(prev => ({ ...prev, isOpen: false }));

    const newNodes: NodeData[] = [];
    // Use activeNodeIds to filter source nodes if provided, otherwise use all
    const sourceNodes = activeNodeIds
      ? storyboardVideoModal.nodes.filter(n => activeNodeIds.includes(n.id))
      : storyboardVideoModal.nodes;

    // Calculate layout bounds of the ENTIRE storyboard to position videos to the RIGHT
    // Use all storyboard nodes to properly calculate the bounding box
    const allStoryboardNodes = storyboardVideoModal.nodes;

    // Assume a default width if not present (though images usually have it)
    const DEFAULT_WIDTH = 400;

    // Find the rightmost edge of the entire group
    const groupMaxX = Math.max(...allStoryboardNodes.map(n => n.x + ((n as any).width || DEFAULT_WIDTH)));

    // Calculate the left edge of the group to maintain relative offsets
    const groupMinX = Math.min(...allStoryboardNodes.map(n => n.x));

    // Shift Amount: Move everything to the right of the group with a gap
    const GAP_X = 100;
    const xOffset = groupMaxX + GAP_X - groupMinX;

    sourceNodes.forEach((sourceNode) => {
      // Create a new Video node for each image
      const newNodeId = crypto.randomUUID();
      const PROMPT = prompts[sourceNode.id] || sourceNode.prompt || 'Animated video';

      const newVideoNode: NodeData = {
        ...createDefaultNodeData(NodeType.VIDEO),
        id: newNodeId,
        // Clone the layout pattern but shifted to the right
        x: sourceNode.x + xOffset,
        y: sourceNode.y,
        prompt: PROMPT,
        status: NodeStatus.IDLE, // Will switch to LOADING when generated
        model: settings.model,
        videoModel: settings.model, // Explicitly set video model
        videoDuration: settings.duration,
        aspectRatio: sourceNode.aspectRatio || '16:9',
        resolution: settings.resolution,
        parentIds: [sourceNode.id], // Connect to source image
        // groupId: undefined, // Explicitly NOT in the group
        videoMode: isSeedanceVideoModel(settings.model) ? 'standard' : 'frame-to-frame',
        inputUrl: sourceNode.resultUrl, // Pass image as input
      };

      newNodes.push(newVideoNode);
    });

    // added new nodes to state
    setNodes(prev => [...prev, ...newNodes]);

    const videoByImage = new Map(
      sourceNodes.map((sourceNode, index) => [sourceNode.id, newNodes[index].id])
    );
    const context = storyboardVideoModal.storyContext;
    const storyboardNode = context?.storyboardNodeId
      ? nodes.find(node => node.id === context.storyboardNodeId)
      : undefined;
    if (storyboardNode?.storyboardData) {
      const withPrompts = {
        ...storyboardNode.storyboardData,
        shots: storyboardNode.storyboardData.shots.map(shot =>
          shot.imageNodeId && prompts[shot.imageNodeId]
            ? { ...shot, videoPrompt: prompts[shot.imageNodeId] }
            : shot
        )
      };
      applyNodeUpdates({
        [storyboardNode.id]: {
          storyboardData: attachVideoNodesToShots(withPrompts, videoByImage)
        }
      });
    }

    // Auto-trigger generation (staggered)
    setTimeout(() => {
      newNodes.forEach((node, index) => {
        setTimeout(() => {
          handleGenerateRef.current(node.id);
        }, index * 1000); // 1s delay between each to avoid rate limits
      });
    }, 500);

  }, [applyNodeUpdates, nodes, setNodes, storyboardVideoModal.nodes, storyboardVideoModal.storyContext]);

  // Twitter Post Modal State
  const [twitterModal, setTwitterModal] = useState<{
    isOpen: boolean;
    mediaUrl: string | null;
    mediaType: 'image' | 'video';
  }>({ isOpen: false, mediaUrl: null, mediaType: 'image' });

  const handlePostToX = React.useCallback((nodeId: string, mediaUrl: string, mediaType: 'image' | 'video') => {
    console.log('[Twitter] Opening post modal for:', nodeId, mediaUrl, mediaType);
    setTwitterModal({
      isOpen: true,
      mediaUrl,
      mediaType
    });
  }, []);

  // TikTok Post Modal State
  const [tiktokModal, setTiktokModal] = useState<{
    isOpen: boolean;
    mediaUrl: string | null;
  }>({ isOpen: false, mediaUrl: null });

  const handlePostToTikTok = React.useCallback((nodeId: string, mediaUrl: string) => {
    console.log('[TikTok] Opening post modal for:', nodeId, mediaUrl);
    setTiktokModal({
      isOpen: true,
      mediaUrl
    });
  }, []);

  // Context menu handlers
  const {
    handleDoubleClick,
    handleGlobalContextMenu,
    handleAddNext,
    handleNodeContextMenu,
    handleContextMenuCreateAsset,
    handleContextMenuSelect,
    handleToolbarAdd
  } = useContextMenuHandlers({
    nodes,
    viewport,
    contextMenu,
    setContextMenu,
    handleOpenCreateAsset,
    handleSelectTypeFromMenu,
    onConnectionError: reportConnectionError
  });

  // Wrapper functions that pass closeWorkflowPanel to panel handlers
  const handleHistoryClick = (e: React.MouseEvent) => {
    panelHistoryClick(e, closeWorkflowPanel);
  };

  const handleAssetsClick = (e: React.MouseEvent) => {
    panelAssetsClick(e, closeWorkflowPanel);
  };

  const handleContextMenuAddAssets = () => {
    openAssetLibraryModal(contextMenu.y, closeWorkflowPanel);
  };

  const openNodeCommandPalette = React.useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
    setPendingConnectionPortSelection(null);
    setSelectedEdgeId(null);
    closeWorkflowPanel();
    closeHistoryPanel();
    closeAssetLibrary();
    closeTimeline();
    setIsNodeCommandPaletteOpen(true);
  }, [
    closeAssetLibrary,
    closeHistoryPanel,
    closeTimeline,
    closeWorkflowPanel,
    setSelectedEdgeId
  ]);

  const handleNodeCommandPaletteSelect = React.useCallback((type: NodeType) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    addNode(type, x, y, undefined, viewport, rect || { left: 0, top: 0 });
    setIsNodeCommandPaletteOpen(false);
  }, [addNode, canvasRef, viewport]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isNodeCommandPaletteShortcut(event)) return;
      event.preventDefault();
      openNodeCommandPalette();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openNodeCommandPalette]);

  /**
   * Convert pixel dimensions to closest standard aspect ratio
   */
  const getClosestAspectRatio = (width: number, height: number): string => {
    const ratio = width / height;
    const standardRatios = [
      { label: '1:1', value: 1 },
      { label: '16:9', value: 16 / 9 },
      { label: '9:16', value: 9 / 16 },
      { label: '4:3', value: 4 / 3 },
      { label: '3:4', value: 3 / 4 },
      { label: '3:2', value: 3 / 2 },
      { label: '2:3', value: 2 / 3 },
      { label: '5:4', value: 5 / 4 },
      { label: '4:5', value: 4 / 5 },
      { label: '21:9', value: 21 / 9 }
    ];

    let closest = standardRatios[0];
    let minDiff = Math.abs(ratio - closest.value);

    for (const r of standardRatios) {
      const diff = Math.abs(ratio - r.value);
      if (diff < minDiff) {
        minDiff = diff;
        closest = r;
      }
    }

    return closest.label;
  };

  /**
   * Convert pixel dimensions to closest video aspect ratio (only 16:9 or 9:16)
   */
  const getClosestVideoAspectRatio = (width: number, height: number): string => {
    const ratio = width / height;
    // Video models only support 16:9 (1.78) and 9:16 (0.56)
    // If wider than 1:1 (ratio > 1), use 16:9; otherwise use 9:16
    return ratio >= 1 ? '16:9' : '9:16';
  };

  /**
   * Handle selecting an asset from history - creates new node with the image/video
   */
  const handleSelectAsset = (type: 'images' | 'videos', url: string, prompt: string, model?: string) => {
    // Calculate position at center of canvas
    const centerX = (window.innerWidth / 2 - viewport.x) / viewport.zoom - 170;
    const centerY = (window.innerHeight / 2 - viewport.y) / viewport.zoom - 150;

    // Create node with detected aspect ratio
    const createNode = (resultAspectRatio?: string, aspectRatio?: string) => {
      const isVideo = type === 'videos';
      const nodeType = isVideo ? NodeType.VIDEO : NodeType.IMAGE;
      const defaults = createDefaultNodeData(nodeType);
      // Use the original model from asset metadata, or fall back to defaults
      const nodeModel = model || defaults.model;

      const newNode: NodeData = {
        ...defaults,
        id: Date.now().toString(),
        x: centerX,
        y: centerY,
        prompt: prompt,
        status: NodeStatus.SUCCESS,
        resultUrl: url,
        resultAspectRatio,
        model: nodeModel,
        videoModel: isVideo ? nodeModel : undefined,
        imageModel: !isVideo ? nodeModel : undefined,
        aspectRatio: aspectRatio || '16:9',
        resolution: isVideo ? 'Auto' : '1K'
      };

      setNodes(prev => [...prev, newNode]);
      closeHistoryPanel();
      closeAssetLibrary();
    };

    if (type === 'images') {
      // Detect image dimensions
      const img = new Image();
      img.onload = () => {
        const resultAspectRatio = `${img.naturalWidth}/${img.naturalHeight}`;
        const aspectRatio = getClosestAspectRatio(img.naturalWidth, img.naturalHeight);
        console.log(`[App] Image loaded: ${img.naturalWidth}x${img.naturalHeight} -> ${aspectRatio}`);
        createNode(resultAspectRatio, aspectRatio);
      };
      img.onerror = () => {
        console.log('[App] Image load error, using default 16:9');
        createNode(undefined, '16:9');
      };
      img.src = url;
    } else {
      // Detect video dimensions
      const video = document.createElement('video');
      video.onloadedmetadata = () => {
        const resultAspectRatio = `${video.videoWidth}/${video.videoHeight}`;
        // Use video-specific function that only returns 16:9 or 9:16
        const aspectRatio = getClosestVideoAspectRatio(video.videoWidth, video.videoHeight);
        console.log(`[App] Video loaded: ${video.videoWidth}x${video.videoHeight} -> ${aspectRatio}`);
        createNode(resultAspectRatio, aspectRatio);
      };
      video.onerror = () => {
        console.log('[App] Video load error, using default 16:9');
        createNode(undefined, '16:9');
      };
      video.src = url;
    }
  };

  const handleLibrarySelect = (url: string, type: 'image' | 'video') => {
    handleSelectAsset(type === 'image' ? 'images' : 'videos', url, '素材库条目');
    closeAssetLibrary();
  };

  // Create asset modal (isCreateAssetModalOpen, handleOpenCreateAsset, handleSaveAssetToLibrary) provided by useAssetHandlers hook

  // ============================================================================
  // EFFECTS
  // ============================================================================

  // Prevent default zoom behavior
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleNativeWheel = (e: WheelEvent) => {
      preventCanvasWheelDefault(e);
    };

    canvas.addEventListener('wheel', handleNativeWheel, CANVAS_WHEEL_LISTENER_OPTIONS);
    return () => canvas.removeEventListener('wheel', handleNativeWheel);
  }, []);

  // Keyboard shortcuts (handleCopy, handlePaste, handleDuplicate) provided by useKeyboardShortcuts hook

  // Cleanup invalid groups (groups with less than 2 nodes)
  useEffect(() => {
    cleanupInvalidGroups(nodes, setNodes);
  }, [nodes, cleanupInvalidGroups]);

  // Track state changes for undo/redo (only after drag ends, not during)
  const isApplyingHistory = React.useRef(false);

  useEffect(() => {
    // Don't push to history if we're currently applying history (undo/redo)
    if (isApplyingHistory.current) {
      isApplyingHistory.current = false;
      return;
    }

    // Don't push to history while dragging (wait until drag ends)
    if (isDragging) {
      return;
    }

    // Push graph state to history when nodes, edges, groups, or timeline change
    pushHistory({ nodes, edges, groups, timeline });
  }, [nodes, edges, groups, timeline, isDragging, pushHistory]);

  // Apply history state when undo/redo is triggered
  // IMPORTANT: Don't revert nodes if any node is in LOADING status (generation in progress)
  useEffect(() => {
    const currentState = currentHistoryStateRef.current;
    // Skip if any node is currently generating - don't interrupt the loading state
    const hasLoadingNode = currentState.nodes.some(n => n.status === NodeStatus.LOADING);
    if (hasLoadingNode) {
      return;
    }

    if (!areCanvasHistoryStatesEqual(historyState, currentState)) {
      isApplyingHistory.current = true;
      replaceGraph(historyState.nodes, historyState.edges);
      setGroups(historyState.groups);
      setTimeline(historyState.timeline);
    }
  }, [historyState, replaceGraph, setGroups, setTimeline]);

  // Simple wrapper for updateNode (sync code removed - TEXT node prompts are combined at generation time)
  const updateNodeWithSync = React.useCallback((id: string, updates: Partial<NodeData>) => {
    updateNode(id, updates);
  }, [updateNode]);

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).id === 'canvas-background') {
      // Left-click (button 0): Start selection box
      if (e.button === 0) {
        startSelection(e);
        clearSelection();
        setSelectedEdgeId(null);
        setPendingConnectionPortSelection(null);
        setContextMenu(prev => ({ ...prev, isOpen: false }));
        closeWorkflowPanel();
        closeHistoryPanel();
        closeAssetLibrary();
      }
      // Middle-click (button 1) or other: Start panning
      else {
        startPanning(e);
        setSelectedEdgeId(null);
        setPendingConnectionPortSelection(null);
        setContextMenu(prev => ({ ...prev, isOpen: false }));
      }
    }
  };

  const handleGlobalPointerMove = (e: React.PointerEvent) => {
    // 1. Handle Selection Box Update
    if (updateSelection(e)) return;

    // 2. Handle Node Dragging
    if (updateNodeDrag(e, viewport, setNodes, selectedNodeIds)) return;

    // 3. Handle Connection Dragging
    const canvasRect = canvasRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    if (updateConnectionDrag(
      e,
      nodesRef.current,
      viewportRef.current,
      canvasRect,
      nodeSizesRef.current
    )) return;

    // 4. Handle Canvas Panning (disabled when selection box is active)
    if (!isSelecting) {
      updatePanning(e, setViewport);
    }
  };

  /**
   * Handle when a connection is made between nodes
   * Syncs prompt if parent is a Text node
   */
  const handleConnectionMade = React.useCallback((parentId: string, childId: string) => {
    // Find the parent node
    const parentNode = nodesRef.current.find(n => n.id === parentId);
    if (!parentNode) return;

    // If parent is a Text node, sync its prompt to the child
    if (parentNode.type === NodeType.TEXT && parentNode.prompt) {
      updateNode(childId, { prompt: parentNode.prompt });
    }
  }, [updateNode]);

  const createSemanticConnection = React.useCallback((
    sourceNodeId: string,
    sourcePortId: string,
    targetNodeId: string,
    targetPortId: string
  ): boolean => {
    const result = validateAndAddEdge(sourceNodeId, targetNodeId, { sourcePortId, targetPortId });
    if (!result.valid) {
      reportConnectionError(result.message || '无法创建连接。');
      return false;
    }
    handleConnectionMade(sourceNodeId, targetNodeId);
    return true;
  }, [handleConnectionMade, reportConnectionError, validateAndAddEdge]);

  const connectSelectedImageGroupToNearbyVideo = React.useCallback((): boolean => {
    const group = getCommonGroup(selectedNodeIds);
    if (!group) return false;

    const currentNodes = nodesRef.current;
    const selectedGroupNodes = currentNodes.filter(node =>
      selectedNodeIds.includes(node.id) && node.groupId === group.id
    );
    if (selectedGroupNodes.length < 2) return false;

    const imageNodes = selectedGroupNodes
      .filter(node => node.type === NodeType.IMAGE && Boolean(node.resultUrl))
      .sort((left, right) => (left.x - right.x) || (left.y - right.y));
    if (imageNodes.length === 0) return false;

    const sizeOf = (node: NodeData): CanvasNodeSize => nodeSizesRef.current[node.id] || {
      width: node.type === NodeType.VIDEO ? 385 : 365,
      height: node.type === NodeType.VIDEO ? 220 : 280
    };
    const bounds = selectedGroupNodes.reduce((acc, node) => {
      const size = sizeOf(node);
      return {
        left: Math.min(acc.left, node.x),
        top: Math.min(acc.top, node.y),
        right: Math.max(acc.right, node.x + size.width),
        bottom: Math.max(acc.bottom, node.y + size.height)
      };
    }, {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    });
    const groupCenterY = (bounds.top + bounds.bottom) / 2;

    const target = currentNodes
      .filter(node => node.type === NodeType.VIDEO && node.groupId !== group.id)
      .map(node => {
        const size = sizeOf(node);
        const leftGap = node.x - bounds.right;
        const videoCenterY = node.y + size.height / 2;
        const verticalDistance = Math.abs(videoCenterY - groupCenterY);
        return { node, leftGap, verticalDistance };
      })
      .filter(candidate =>
        candidate.leftGap >= -180 &&
        candidate.leftGap <= 650 &&
        candidate.verticalDistance <= Math.max(260, (bounds.bottom - bounds.top) / 2 + 160)
      )
      .sort((left, right) =>
        Math.abs(left.leftGap) + left.verticalDistance - (Math.abs(right.leftGap) + right.verticalDistance)
      )[0]?.node;

    if (!target) return false;

    const imageInputPortIds = new Set(['start-frame', 'end-frame', 'reference-images']);
    edgesRef.current
      .filter(edge => edge.targetNodeId === target.id && imageInputPortIds.has(edge.targetPortId))
      .forEach(edge => removeEdge(edge.id));

    let createdCount = 0;
    imageNodes.forEach((sourceNode) => {
      const result = validateAndAddEdge(sourceNode.id, target.id, {
        sourcePortId: 'image-output',
        targetPortId: 'reference-images'
      });
      if (result.valid) {
        createdCount += 1;
        handleConnectionMade(sourceNode.id, target.id);
      }
    });
    return createdCount > 0;
  }, [getCommonGroup, handleConnectionMade, removeEdge, selectedNodeIds, validateAndAddEdge]);

  const createConnectedNodeFromSelection = React.useCallback((type: NodeType) => {
    const currentNodes = nodesRef.current;
    const group = getCommonGroup(selectedNodeIds);
    const sourceNodes = currentNodes.filter(node =>
      selectedNodeIds.includes(node.id) && (!group || node.groupId === group.id)
    );
    if (sourceNodes.length === 0) return;

    const sizeOf = (node: NodeData): CanvasNodeSize => nodeSizesRef.current[node.id] || {
      width: node.type === NodeType.VIDEO ? 385 : 365,
      height: node.type === NodeType.VIDEO ? 220 : 280
    };
    const bounds = sourceNodes.reduce((acc, node) => {
      const size = sizeOf(node);
      return {
        left: Math.min(acc.left, node.x),
        top: Math.min(acc.top, node.y),
        right: Math.max(acc.right, node.x + size.width),
        bottom: Math.max(acc.bottom, node.y + size.height)
      };
    }, {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    });
    const targetHeight = type === NodeType.VIDEO ? 220 : 280;
    const targetX = bounds.right + 150;
    const targetY = ((bounds.top + bounds.bottom) / 2) - (targetHeight / 2);
    const result = addConnectedNodeFromSources(
      type,
      sourceNodes.map(node => node.id),
      targetX,
      targetY
    );

    if (result.connectedCount === 0 && type !== NodeType.TEXT) {
      reportConnectionError('已创建节点，但当前组里没有可直接连接到它的素材。');
    }
  }, [addConnectedNodeFromSources, getCommonGroup, reportConnectionError, selectedNodeIds]);

  const handleSemanticConnectionDrop = React.useCallback((drop: ConnectionDragDrop) => {
    if (!drop.targetNodeId) return;

    const startNode = nodesRef.current.find(node => node.id === drop.start.nodeId);
    const targetNode = nodesRef.current.find(node => node.id === drop.targetNodeId);
    if (!startNode || !targetNode) {
      reportConnectionError('找不到连接的源节点或目标节点。');
      return;
    }

    const targetPort = drop.targetPort;
    if (targetPort) {
      if (drop.start.direction === 'output' && targetPort.direction === 'input') {
        createSemanticConnection(startNode.id, drop.start.portId, targetNode.id, targetPort.portId);
        return;
      }
      if (drop.start.direction === 'input' && targetPort.direction === 'output') {
        createSemanticConnection(targetNode.id, targetPort.portId, startNode.id, drop.start.portId);
        return;
      }
      reportConnectionError('请从输出端口连接到另一个节点的输入端口。');
      return;
    }

    if (drop.start.direction !== 'output') {
      reportConnectionError('请将输入端口拖到上游节点的输出端口。');
      return;
    }

    const resolution = resolveConnectionDrop(startNode, drop.start.portId, targetNode, edges);
    if (resolution.kind === 'invalid') {
      reportConnectionError(resolution.message);
      return;
    }
    if (resolution.kind === 'connect') {
      createSemanticConnection(startNode.id, resolution.sourcePort.id, targetNode.id, resolution.targetPort.id);
      return;
    }

    setPendingConnectionPortSelection({
      sourceNodeId: startNode.id,
      sourcePortId: resolution.sourcePort.id,
      targetNodeId: targetNode.id,
      choices: resolution.choices
    });
  }, [createSemanticConnection, edges, reportConnectionError]);

  const handleConnectionPortChoice = React.useCallback((targetPortId: string) => {
    if (!pendingConnectionPortSelection) return;

    const created = createSemanticConnection(
      pendingConnectionPortSelection.sourceNodeId,
      pendingConnectionPortSelection.sourcePortId,
      pendingConnectionPortSelection.targetNodeId,
      targetPortId
    );
    if (created) setPendingConnectionPortSelection(null);
  }, [createSemanticConnection, pendingConnectionPortSelection]);

  const handleGlobalPointerUp = (e: React.PointerEvent) => {
    // 1. Handle Selection Box End
    if (isSelecting) {
      const selectedIds = endSelection(nodes, viewport);
      setSelectedNodeIds(selectedIds);
      releasePointerCapture(e);
      return;
    }

    // 2. Handle Connection Drop
    const canvasRect = canvasRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    if (completeConnectionDrag(
      e,
      handleAddNext,
      handleSemanticConnectionDrop,
      nodesRef.current,
      viewportRef.current,
      canvasRect,
      nodeSizesRef.current
    )) {
      releasePointerCapture(e);
      return;
    }

    // 3. Stop Panning
    endPanning();

    // 4. Auto-connect a dragged image group to the nearby video node.
    if (isDragging) {
      connectSelectedImageGroupToNearbyVideo();
    }

    // 5. Stop Node Dragging
    endNodeDrag();

    // 6. Release capture
    releasePointerCapture(e);
  };

  const handleGlobalMouseUp = (e: React.MouseEvent) => {
    const canvasRect = canvasRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    completeConnectionDrag(
      e,
      handleAddNext,
      handleSemanticConnectionDrop,
      nodesRef.current,
      viewportRef.current,
      canvasRect,
      nodeSizesRef.current
    );
  };

  const pendingConnectionSource = pendingConnectionPortSelection
    ? nodes.find(node => node.id === pendingConnectionPortSelection.sourceNodeId)
    : undefined;
  const pendingConnectionTarget = pendingConnectionPortSelection
    ? nodes.find(node => node.id === pendingConnectionPortSelection.targetNodeId)
    : undefined;

  // Context menu handlers provided by useContextMenuHandlers hook
  // handleDoubleClick, handleGlobalContextMenu, handleAddNext, handleNodeContextMenu,
  // handleContextMenuCreateAsset, handleContextMenuSelect, handleToolbarAdd


  return (
    <div
      className={`w-screen h-screen ${canvasTheme === 'dark' ? 'bg-[#050505] text-white' : 'bg-neutral-50 text-neutral-900'} overflow-hidden select-none font-sans transition-colors duration-300`}
      onPointerUp={handleGlobalPointerUp}
      onMouseUp={handleGlobalMouseUp}
    >
      {!storyboardGenerator.isModalOpen && !isTikTokModalOpen && (
        <Toolbar
          onAddClick={handleToolbarAdd}
          onWorkflowsClick={handleWorkflowsClick}
          onHistoryClick={handleHistoryClick}
          onAssetsClick={handleAssetsClick}
          onTikTokClick={openTikTokModal}
          onStoryboardClick={storyboardGenerator.openModal}
          onTimelineClick={toggleTimeline}
          onToolsOpen={() => {
            closeWorkflowPanel();
            closeHistoryPanel();
            closeAssetLibrary();
            closeTimeline();
          }}
          canvasTheme={canvasTheme}
        />
      )}

      {/* Workflow Panel */}
      <WorkflowPanel
        isOpen={isWorkflowPanelOpen}
        onClose={closeWorkflowPanel}
        onLoadWorkflow={handleLoadWithTracking}
        currentWorkflowId={workflowId || undefined}
        panelY={workflowPanelY}
        canvasTheme={canvasTheme}
        onInsertTemplate={handleInsertTemplate}
        templateRevision={templateRevision}
        isInsertingTemplate={isInsertingTemplate}
      />

      {/* History Panel */}
      <HistoryPanel
        isOpen={isHistoryPanelOpen}
        onClose={closeHistoryPanel}
        onSelectAsset={handleSelectAsset}
        panelY={historyPanelY}
        canvasTheme={canvasTheme}
      />

      <AssetLibraryPanel
        isOpen={isAssetLibraryOpen}
        onClose={closeAssetLibrary}
        onSelectAsset={handleLibrarySelect}
        panelY={assetLibraryY}
        variant={assetLibraryVariant}
        canvasTheme={canvasTheme}
      />

      <TimelinePanel
        isOpen={isTimelineOpen}
        timeline={timeline}
        onClose={closeTimeline}
        onMoveClip={moveTimelineClip}
        onRemoveClip={removeTimelineClip}
        canvasTheme={canvasTheme}
      />

      <CreateAssetModal
        isOpen={isCreateAssetModalOpen}
        onClose={() => setIsCreateAssetModalOpen(false)}
        nodeToSnapshot={nodeToSnapshot}
        onSave={handleSaveAssetToLibrary}
        onSaveSubject={handleSaveSubjectAsset}
      />

      {/* TikTok Import Modal */}
      <TikTokImportModal
        isOpen={isTikTokModalOpen}
        onClose={closeTikTokModal}
        onVideoImported={handleTikTokVideoImported}
      />

      {/* Twitter Post Modal */}
      <TwitterPostModal
        isOpen={twitterModal.isOpen}
        onClose={() => setTwitterModal(prev => ({ ...prev, isOpen: false }))}
        mediaUrl={twitterModal.mediaUrl}
        mediaType={twitterModal.mediaType}
      />

      {/* TikTok Post Modal */}
      <TikTokPostModal
        isOpen={tiktokModal.isOpen}
        onClose={() => setTiktokModal(prev => ({ ...prev, isOpen: false }))}
        mediaUrl={tiktokModal.mediaUrl}
      />

      {/* Storyboard Generator Modal */}
      <StoryboardGeneratorModal
        isOpen={storyboardGenerator.isModalOpen}
        onClose={storyboardGenerator.closeModal}
        state={storyboardGenerator.state}
        onSetStep={storyboardGenerator.setStep}
        onToggleCharacter={storyboardGenerator.toggleCharacter}
        onSetSceneCount={storyboardGenerator.setSceneCount}
        onSetStory={storyboardGenerator.setStory}
        onSetSelectedImageModel={storyboardGenerator.setSelectedImageModel}
        onUpdateScript={storyboardGenerator.updateScript}
        onGenerateScripts={storyboardGenerator.generateScripts}
        onGenerateStoryPackage={storyboardGenerator.generateStoryPackage}
        onBrainstormStory={storyboardGenerator.brainstormStory}
        onOptimizeStory={storyboardGenerator.optimizeStory}
        onGenerateComposite={storyboardGenerator.generateComposite}
        onRegenerateComposite={storyboardGenerator.regenerateComposite}
        onCreateNodes={storyboardGenerator.createStoryboardNodes}
      />

      {/* Agent Chat */}
      {!storyboardGenerator.isModalOpen && !isTikTokModalOpen && (
        <>
          <ChatBubble onClick={toggleChat} isOpen={isChatOpen} />
          <ChatPanel isOpen={isChatOpen} onClose={closeChat} isDraggingNode={isDraggingNodeToChat} canvasTheme={canvasTheme} />
        </>
      )}

      {/* Top Bar */}
      {/* Top Bar */}
      {!storyboardGenerator.isModalOpen && !isTikTokModalOpen && (
        <TopBar
          canvasTitle={canvasTitle}
          isEditingTitle={isEditingTitle}
          editingTitleValue={editingTitleValue}
          canvasTitleInputRef={canvasTitleInputRef}
          setCanvasTitle={setCanvasTitle}
          setIsEditingTitle={setIsEditingTitle}
          setEditingTitleValue={setEditingTitleValue}
          onSave={handleSaveWithTracking}
          onNew={handleNewCanvas}
          hasUnsavedChanges={hasUnsavedChanges}
          isChatOpen={isChatOpen}
          canvasTheme={canvasTheme}
          onToggleTheme={() => setCanvasTheme(prev => prev === 'dark' ? 'light' : 'dark')}
          lastAutoSaveTime={lastAutoSaveTime}
        />
      )}

      {connectionError && (
        <div className="fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-xl border border-red-500/30 bg-red-950/95 px-4 py-2 text-sm text-red-100 shadow-2xl">
          {connectionError}
        </div>
      )}

      {templateError && !templateSaveDialog.isOpen && (
        <div className="fixed left-1/2 top-32 z-[120] flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-xl border border-red-500/30 bg-red-950/95 px-4 py-2 text-sm text-red-100 shadow-2xl">
          <span>{templateError}</span>
          <button
            onClick={clearTemplateError}
            className="text-red-200/70 transition-colors hover:text-white"
            aria-label="关闭模板错误提示"
          >
            ×
          </button>
        </div>
      )}

      {pendingConnectionPortSelection && pendingConnectionSource && pendingConnectionTarget && (
        <ConnectionPortPicker
          sourceNode={pendingConnectionSource}
          sourcePortId={pendingConnectionPortSelection.sourcePortId}
          targetNode={pendingConnectionTarget}
          choices={pendingConnectionPortSelection.choices}
          onSelect={handleConnectionPortChoice}
          onClose={() => setPendingConnectionPortSelection(null)}
          canvasTheme={canvasTheme}
        />
      )}

      <NodeCommandPalette
        isOpen={isNodeCommandPaletteOpen}
        onClose={() => setIsNodeCommandPaletteOpen(false)}
        onSelect={handleNodeCommandPaletteSelect}
        canvasTheme={canvasTheme}
      />

      {/* Canvas */}
      <div
        ref={canvasRef}
        id="canvas-background"
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handleGlobalPointerMove}
        onWheel={handleWheel}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleGlobalContextMenu}
      >
        <div
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%',
            pointerEvents: 'none'
          }}
        >
          {/* Background Grid */}
          <div
            className="absolute -top-[10000px] -left-[10000px] w-[20000px] h-[20000px]"
            style={{
              backgroundImage: canvasTheme === 'dark'
                ? 'radial-gradient(#666 1px, transparent 1px)'
                : 'radial-gradient(#ccc 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              opacity: canvasTheme === 'dark' ? 0.5 : 0.8
            }}
          />

          {/* SVG Layer for Connections */}
          <svg className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none z-0">
            <ConnectionsLayer
              nodes={nodes}
              edges={edges}
              nodeSizes={nodeSizes}
              canvasTheme={canvasTheme}
              isDraggingConnection={isDraggingConnection}
              connectionStart={connectionStart}
              tempConnectionEnd={tempConnectionEnd}
              selectedEdgeId={selectedEdgeId}
              onEdgeClick={(event, edgeId) => {
                setSelectedNodeIds([]);
                handleEdgeClick(event, edgeId);
              }}
            />
          </svg>

          {/* Nodes Layer */}
          <div className="pointer-events-auto">
            {nodes.map(node => (
              <CanvasNode
                key={node.id}
                data={node}
                inputUrl={(() => {
                  // Get first parent's result for display (multiple inputs handled in generation)
                  if (!node.parentIds || node.parentIds.length === 0) return undefined;
                  const parent = nodes.find(n => n.id === node.parentIds![0]);

                  // VIDEO_EDITOR nodes need the actual video URL from parent Video node
                  if (node.type === NodeType.VIDEO_EDITOR && parent?.type === NodeType.VIDEO) {
                    return parent.resultUrl;
                  }

                  // For other nodes, if parent is video, use lastFrame for image preview
                  if (parent?.type === NodeType.VIDEO && parent.lastFrame) {
                    return parent.lastFrame;
                  }
                  return parent?.resultUrl;
                })()}
                connectedImageNodes={(() => {
                  // Gather all connected parent nodes (image or video) with their URLs
                  if (!node.parentIds || node.parentIds.length === 0) return [];
                  return node.parentIds
                    .map(parentId => nodes.find(n => n.id === parentId))
                    .filter(parent => parent && (parent.type === NodeType.IMAGE || parent.type === NodeType.VIDEO) && parent.resultUrl)
                    .map(parent => ({
                      id: parent!.id,
                      url: (parent!.type === NodeType.VIDEO ? parent!.lastFrame : parent!.resultUrl) || parent!.resultUrl!,
                      type: parent!.type
                    }));
                })()}
                onUpdate={updateNodeWithSync}
                onGenerate={handleGenerate}
                onCancelGeneration={handleCancelGeneration}
                onRetryGeneration={handleRetryGeneration}
                onOpenStoryNode={storyboardGenerator.openNode}
                onCancelStoryTask={storyboardGenerator.cancelTaskForNode}
                onRetryStoryTask={storyboardGenerator.retryTaskForNode}
                onAddStoryboardToTimeline={addStoryboardVideosToTimeline}
                selected={selectedNodeIds.includes(node.id)}
                showControls={selectedNodeIds.length === 1 && selectedNodeIds.includes(node.id)}
                onNodePointerDown={(e) => {
                  setSelectedEdgeId(null);
                  // If shift is held, preserve selection for multi-drag/multi-select
                  if (e.shiftKey) {
                    if (selectedNodeIds.includes(node.id)) {
                      handleNodePointerDown(e, node.id, undefined);
                    } else {
                      // Add to selection
                      setSelectedNodeIds(prev => [...prev, node.id]);
                      handleNodePointerDown(e, node.id, undefined);
                    }
                  } else {
                    // No shift: always select just this node (to show its controls)
                    setSelectedNodeIds([node.id]);
                    handleNodePointerDown(e, node.id, undefined);
                  }
                }}
                onContextMenu={handleNodeContextMenu}
                onSelect={(id) => setSelectedNodeIds([id])}
                isConnectionActive={isDraggingConnection}
                portFeedbackByKey={portFeedbackByKey}
                onPortPointerDown={handlePortPointerDown}
                onPortPointerEnter={handlePortPointerEnter}
                onPortPointerLeave={handlePortPointerLeave}
                onBoundsChange={handleNodeBoundsChange}
                onOpenEditor={handleOpenEditor}
                onUpload={handleUpload}
                onAudioUpload={handleAudioNodeUpload}
                onAddToTimeline={addNodeResultToTimeline}
                onExpand={handleExpandImage}
                onDragStart={handleNodeDragStart}
                onDragEnd={handleNodeDragEnd}
                onWriteContent={handleWriteContent}
                onTextToVideo={handleTextToVideo}
                onTextToImage={handleTextToImage}
                onImageToImage={handleImageToImage}
                onImageToVideo={handleImageToVideo}
                onChangeAngleGenerate={handleChangeAngleGenerate}
                zoom={viewport.zoom}
                onMouseEnter={() => setCanvasHoveredNodeId(node.id)}
                onMouseLeave={() => setCanvasHoveredNodeId(null)}
                canvasTheme={canvasTheme}
                onPostToX={handlePostToX}
                onPostToTikTok={handlePostToTikTok}
              />
            ))}
          </div>



          {/* Selection Bounding Box - for selected nodes (2 or more) */}
          {selectedNodeIds.length > 1 && !selectionBox.isActive && (
            <SelectionBoundingBox
              selectedNodes={nodes.filter(n => selectedNodeIds.includes(n.id))}
              group={getCommonGroup(selectedNodeIds)}
              viewport={viewport}
              onGroup={() => groupNodes(selectedNodeIds, setNodes)}
              onUngroup={() => {
                const group = getCommonGroup(selectedNodeIds);
                if (group) ungroupNodes(group.id, setNodes);
              }}
              onCreateConnectedNode={createConnectedNodeFromSelection}
              onBoundingBoxPointerDown={(e) => {
                // Start dragging all selected nodes when clicking on bounding box
                e.stopPropagation();
                if (selectedNodeIds.length > 0) {
                  handleNodePointerDown(e, selectedNodeIds[0], undefined);
                }
              }}
              onRenameGroup={renameGroup}
              onSortNodes={(direction) => {
                const group = getCommonGroup(selectedNodeIds);
                if (group) sortGroupNodes(group.id, direction, nodes, setNodes);
              }}
              onEditStoryboard={handleEditStoryboard}
              onSaveTemplate={handleOpenTemplateSaveModal}
            />
          )}

          {/* Group Bounding Boxes - for all groups (even when not selected) */}
          {groups.map(group => {
            const groupNodes = nodes.filter(n => n.groupId === group.id);

            // Don't render if group has less than 2 nodes
            if (groupNodes.length < 2) return null;

            const isSelected = groupNodes.every(n => selectedNodeIds.includes(n.id)) && groupNodes.length > 0;

            // Don't render if this group is already shown above (when selected)
            if (isSelected) return null;

            return (
              <SelectionBoundingBox
                key={group.id}
                selectedNodes={groupNodes}
                group={group}
                viewport={viewport}
                onGroup={() => { }} // Already grouped
                onUngroup={() => ungroupNodes(group.id, setNodes)}
                onBoundingBoxPointerDown={(e) => {
                  // Select all nodes in this group and start dragging
                  e.stopPropagation();
                  const nodeIds = groupNodes.map(n => n.id);
                  setSelectedNodeIds(nodeIds);
                  if (nodeIds.length > 0) {
                    handleNodePointerDown(e, nodeIds[0], undefined);
                  }
                }}
                onRenameGroup={renameGroup}
                onSortNodes={(direction) => sortGroupNodes(group.id, direction, nodes, setNodes)}
                onCreateVideo={() => {
                  // Pass group nodes directly to avoid selection state race conditions
                  const groupNodeIds = nodes.filter(n => n.groupId === group.id).map(n => n.id);
                  handleCreateStoryboardVideo(groupNodeIds);
                }}
                onEditStoryboard={handleEditStoryboard}
                onSaveTemplate={handleOpenTemplateSaveModal}
              />
            );
          })}
        </div>
      </div >

      {/* Selection Box Overlay - Outside transformed canvas for screen-space coordinates */}
      {selectionBox.isActive && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.endX),
            top: Math.min(selectionBox.startY, selectionBox.endY),
            width: Math.abs(selectionBox.endX - selectionBox.startX),
            height: Math.abs(selectionBox.endY - selectionBox.startY),
            border: '2px solid #3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            zIndex: 1000
          }}
        />
      )}

      {/* Context Menu */}
      <ContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(prev => ({ ...prev, isOpen: false }))}
        onSelectType={handleContextMenuSelect}
        onUpload={handleContextUpload}
        onUndo={undo}
        onRedo={redo}
        onPaste={handlePaste}
        onCopy={handleCopy}
        onDuplicate={handleDuplicate}
        onSaveTemplate={() => {
          if (contextMenu.sourceNodeId) {
            handleOpenTemplateSaveModal([contextMenu.sourceNodeId]);
          }
        }}
        onCreateAsset={handleContextMenuCreateAsset}
        onAddAssets={handleContextMenuAddAssets}
        canUndo={canUndo}
        canRedo={canRedo}
        canvasTheme={canvasTheme}
      />

      {/* Zoom Slider */}
      {/* Zoom Slider */}
      {!storyboardGenerator.isModalOpen && !isTikTokModalOpen && (
        <div className={`fixed bottom-6 left-16 rounded-full px-4 py-2 flex items-center gap-3 z-50 transition-colors duration-300 ${canvasTheme === 'dark' ? 'bg-neutral-900 border border-neutral-700' : 'bg-white/90 backdrop-blur-sm border border-neutral-200'}`} >
          <span className={`text-xs ${canvasTheme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>Zoom</span>
          <input
            type="range"
            min="0.1"
            max="2"
            step="0.1"
            value={viewport.zoom}
            onChange={handleSliderZoom}
            className="w-32"
          />
          <span className={`text-xs w-10 ${canvasTheme === 'dark' ? 'text-neutral-300' : 'text-neutral-600'}`}>{Math.round(viewport.zoom * 100)}%</span>
        </div>
      )}

      <ImageEditorModal
        isOpen={editorModal.isOpen}
        nodeId={editorModal.nodeId || ''}
        imageUrl={editorModal.imageUrl}
        initialPrompt={nodes.find(n => n.id === editorModal.nodeId)?.prompt}
        initialModel={nodes.find(n => n.id === editorModal.nodeId)?.imageModel || 'gpt-image-2'}
        initialAspectRatio={nodes.find(n => n.id === editorModal.nodeId)?.aspectRatio || 'Auto'}
        initialResolution={nodes.find(n => n.id === editorModal.nodeId)?.resolution || '1K'}
        initialElements={nodes.find(n => n.id === editorModal.nodeId)?.editorElements as any}
        initialCanvasData={nodes.find(n => n.id === editorModal.nodeId)?.editorCanvasData}
        initialCanvasSize={nodes.find(n => n.id === editorModal.nodeId)?.editorCanvasSize}
        initialBackgroundUrl={nodes.find(n => n.id === editorModal.nodeId)?.editorBackgroundUrl}
        initialEditMode={nodes.find(n => n.id === editorModal.nodeId)?.imageEditMode}
        source={editorModal.source}
        onClose={handleCloseImageEditor}
        onGenerate={async request => {
          await handleImageEditGeneration(request);
          handleCloseImageEditor();
        }}
        onUpdate={updateNode}
      />

      <WorkflowTemplateSaveModal
        isOpen={templateSaveDialog.isOpen}
        initialTitle={templateSaveDialog.initialTitle}
        isSaving={isSavingTemplate}
        error={templateError}
        onClose={handleCloseTemplateSaveModal}
        onSave={handleSaveTemplate}
      />

      {/* Storyboard Video Generation Modal */}
      <StoryboardVideoModal
        isOpen={storyboardVideoModal.isOpen}
        onClose={() => setStoryboardVideoModal(prev => ({ ...prev, isOpen: false }))}
        scenes={storyboardVideoModal.nodes}
        storyContext={storyboardVideoModal.storyContext}
        onCreateVideos={handleGenerateStoryVideos}
      />

      {/* Video Editor Modal */}
      <VideoEditorModal
        isOpen={videoEditorModal.isOpen}
        nodeId={videoEditorModal.nodeId}
        videoUrl={videoEditorModal.videoUrl}
        initialTrimStart={nodes.find(n => n.id === videoEditorModal.nodeId)?.trimStart}
        initialTrimEnd={nodes.find(n => n.id === videoEditorModal.nodeId)?.trimEnd}
        onClose={handleCloseVideoEditor}
        onExport={handleExportTrimmedVideo}
      />

      {/* Fullscreen Media Preview Modal */}
      <ExpandedMediaModal
        mediaUrl={expandedImageUrl}
        onClose={handleCloseExpand}
      />
    </div >
  );
}
