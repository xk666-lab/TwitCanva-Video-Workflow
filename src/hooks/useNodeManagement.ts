/**
 * useNodeManagement.ts
 * 
 * Custom hook for managing node state and operations.
 * Handles node creation, updates, selection, and deletion.
 */

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { NodeData, NodeType, Viewport } from '../types';
import { createDefaultNodeData } from '../domain/nodes/nodeRegistry';
import { applyNodeUpdateMap, type NodeUpdateMap } from '../domain/nodes/nodeUpdates';
import { removeNodesAndNormalizeStoryboardMediaReferences } from '../domain/storyboard/storyboardGraph';
import type { CanvasEdge, ConnectionValidationResult } from '../domain/graph/graphTypes';
import { resolveConnectionPorts } from '../domain/graph/connectionRules';
import { createSemanticEdge } from '../domain/graph/semanticCanvas';
import { screenPointToCanvasPoint } from '../utils/connectionHitTesting';
import {
    getIncomingEdges as selectIncomingEdges,
    getInputEdgesByPort as selectInputEdgesByPort,
    getOutgoingEdges as selectOutgoingEdges,
    getOutputEdgesByPort as selectOutputEdgesByPort,
    normalizeEdges,
    reconcileEdgesFromLegacyNodeChanges,
    removeEdgesForNode as withoutEdgesForNode,
    syncLegacyParentIds
} from '../domain/graph/edgeMigration';

export type ValidateAndAddEdgeResult = ConnectionValidationResult & { edge?: CanvasEdge };
export interface ExplicitEdgePorts {
    sourcePortId: string;
    targetPortId: string;
}

export interface AddConnectedNodeFromSourcesResult {
    nodeId: string;
    connectedCount: number;
}

export const useNodeManagement = () => {
    // ============================================================================
    // STATE
    // ============================================================================

    const [nodes, setNodeState] = useState<NodeData[]>([]);
    const [edges, setEdgeState] = useState<CanvasEdge[]>([]);
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const nodesRef = useRef<NodeData[]>(nodes);
    const edgesRef = useRef<CanvasEdge[]>(edges);

    nodesRef.current = nodes;
    edgesRef.current = edges;

    const commitGraph = useCallback((nextNodes: NodeData[], nextEdges: CanvasEdge[]) => {
        nodesRef.current = nextNodes;
        edgesRef.current = nextEdges;
        setNodeState(nextNodes);
        setEdgeState(nextEdges);
    }, []);

    const setNodes: Dispatch<SetStateAction<NodeData[]>> = useCallback((action) => {
        const previousNodes = nodesRef.current;
        const requestedNodes = typeof action === 'function' ? action(previousNodes) : action;
        const nextEdges = reconcileEdgesFromLegacyNodeChanges(previousNodes, requestedNodes, edgesRef.current);
        commitGraph(syncLegacyParentIds(requestedNodes, nextEdges), nextEdges);
    }, [commitGraph]);

    const setEdges: Dispatch<SetStateAction<CanvasEdge[]>> = useCallback((action) => {
        const requestedEdges = typeof action === 'function' ? action(edgesRef.current) : action;
        const nextEdges = normalizeEdges(requestedEdges, nodesRef.current);
        commitGraph(syncLegacyParentIds(nodesRef.current, nextEdges), nextEdges);
    }, [commitGraph]);

    const replaceGraph = useCallback((nextNodes: NodeData[], nextEdges: CanvasEdge[]) => {
        const normalizedEdges = normalizeEdges(nextEdges, nextNodes);
        commitGraph(syncLegacyParentIds(nextNodes, normalizedEdges), normalizedEdges);
    }, [commitGraph]);

    const addEdge = useCallback((edge: CanvasEdge) => {
        const nextEdges = normalizeEdges([...edgesRef.current, edge], nodesRef.current);
        commitGraph(syncLegacyParentIds(nodesRef.current, nextEdges), nextEdges);
    }, [commitGraph]);

    const removeEdge = useCallback((edgeId: string) => {
        const nextEdges = edgesRef.current.filter(edge => edge.id !== edgeId);
        commitGraph(syncLegacyParentIds(nodesRef.current, nextEdges), nextEdges);
    }, [commitGraph]);

    const removeEdgesForNode = useCallback((nodeId: string) => {
        const nextEdges = withoutEdgesForNode(edgesRef.current, nodeId);
        commitGraph(syncLegacyParentIds(nodesRef.current, nextEdges), nextEdges);
    }, [commitGraph]);

    const replaceEdges = useCallback((nextEdges: CanvasEdge[]) => {
        const normalizedEdges = normalizeEdges(nextEdges, nodesRef.current);
        commitGraph(syncLegacyParentIds(nodesRef.current, normalizedEdges), normalizedEdges);
    }, [commitGraph]);

    const validateAndAddEdge = useCallback((
        sourceNodeId: string,
        targetNodeId: string,
        explicitPorts?: ExplicitEdgePorts
    ): ValidateAndAddEdgeResult => {
        const sourceNode = nodesRef.current.find(node => node.id === sourceNodeId);
        const targetNode = nodesRef.current.find(node => node.id === targetNodeId);
        if (!sourceNode || !targetNode) {
            return {
                valid: false,
                code: 'missing_node',
                message: '找不到连接的源节点或目标节点。'
            };
        }

        let sourcePortId: string;
        let targetPortId: string;
        if (explicitPorts) {
            sourcePortId = explicitPorts.sourcePortId;
            targetPortId = explicitPorts.targetPortId;
        } else {
            const resolution = resolveConnectionPorts(sourceNode, targetNode, edgesRef.current);
            if (!resolution.valid) return resolution;
            sourcePortId = resolution.sourcePort.id;
            targetPortId = resolution.targetPort.id;
        }

        const result = createSemanticEdge({
            sourceNode,
            sourcePortId,
            targetNode,
            targetPortId,
            existingEdges: edgesRef.current
        });
        if (!result.valid || !result.edge) return result;

        addEdge(result.edge);
        return result;
    }, [addEdge]);

    // ============================================================================
    // NODE OPERATIONS
    // ============================================================================

    /**
     * Adds a new node to the canvas
     * @param type - Type of node to create
     * @param x - Screen X coordinate
     * @param y - Screen Y coordinate
     * @param parentId - Optional parent node ID for connections
     * @param viewport - Current viewport for coordinate conversion
     */
    const addNode = (
        type: NodeType,
        x: number,
        y: number,
        parentId: string | undefined,
        viewport: Viewport,
        canvasRect: { left: number; top: number } = { left: 0, top: 0 }
    ) => {
        const canvasPoint = screenPointToCanvasPoint({ x, y }, canvasRect, viewport);

        const newNode: NodeData = {
            ...createDefaultNodeData(type),
            id: crypto.randomUUID(),
            x: parentId ? canvasPoint.x : canvasPoint.x - 170,
            y: parentId ? canvasPoint.y : canvasPoint.y - 100,
            parentIds: parentId ? [parentId] : []
        };

        setNodes(prev => [...prev, newNode]);
        setSelectedNodeIds([newNode.id]);

        return newNode.id;
    };

    const addConnectedNodeFromSources = useCallback((
        type: NodeType,
        sourceNodeIds: string[],
        x: number,
        y: number
    ): AddConnectedNodeFromSourcesResult => {
        const currentNodes = nodesRef.current;
        const currentEdges = edgesRef.current;
        const sourceNodes = sourceNodeIds
            .map(sourceId => currentNodes.find(node => node.id === sourceId))
            .filter((node): node is NodeData => Boolean(node));
        const newNode: NodeData = {
            ...createDefaultNodeData(type),
            id: crypto.randomUUID(),
            x,
            y,
            parentIds: []
        };

        let nextEdges = [...currentEdges];
        let connectedCount = 0;
        for (const sourceNode of sourceNodes) {
            const resolution = resolveConnectionPorts(sourceNode, newNode, nextEdges);
            if (!resolution.valid) continue;

            const result = createSemanticEdge({
                sourceNode,
                sourcePortId: resolution.sourcePort.id,
                targetNode: newNode,
                targetPortId: resolution.targetPort.id,
                existingEdges: nextEdges
            });
            if (!result.valid || !result.edge) continue;

            nextEdges = [...nextEdges, result.edge];
            connectedCount += 1;
        }

        const nextNodes = [...currentNodes, newNode];
        const normalizedEdges = normalizeEdges(nextEdges, nextNodes);
        commitGraph(syncLegacyParentIds(nextNodes, normalizedEdges), normalizedEdges);
        setSelectedNodeIds([newNode.id]);

        return { nodeId: newNode.id, connectedCount };
    }, [commitGraph]);

    /**
     * Updates a node with partial data
     * @param id - Node ID to update
     * @param updates - Partial node data to merge
     */
    const updateNode = (id: string, updates: Partial<NodeData>) => {
        setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    };

    const applyNodeUpdates = useCallback((updates: NodeUpdateMap) => {
        setNodes(previous => applyNodeUpdateMap(previous, updates));
    }, [setNodes]);

    /**
     * Deletes a node by ID
     * @param id - Node ID to delete
     */
    const deleteNode = (id: string) => {
        setNodes(prev => removeNodesAndNormalizeStoryboardMediaReferences(prev, [id]));
        setSelectedNodeIds(prev => prev.filter(nodeId => nodeId !== id));
    };

    /**
     * Deletes multiple nodes by IDs
     * @param ids - Array of node IDs to delete
     */
    const deleteNodes = (ids: string[]) => {
        setNodes(prev => removeNodesAndNormalizeStoryboardMediaReferences(prev, ids));
        setSelectedNodeIds([]);
    };

    /**
     * Clears all node selections
     */
    const clearSelection = () => {
        setSelectedNodeIds([]);
    };

    /**
     * Handles node type selection from context menu
     * Creates new node or deletes existing node
     */
    const handleSelectTypeFromMenu = (
        type: NodeType | 'DELETE',
        contextMenu: any,
        viewport: Viewport,
        onCloseMenu: () => void,
        onConnectionError?: (message: string) => void
    ) => {
        // Handle Delete Action
        if (type === 'DELETE') {
            if (contextMenu.sourceNodeId) {
                deleteNode(contextMenu.sourceNodeId);
            }
            onCloseMenu();
            return;
        }

        if (contextMenu.type === 'node-connector' && contextMenu.sourceNodeId) {
            const sourceNode = nodes.find(n => n.id === contextMenu.sourceNodeId);
            if (sourceNode) {
                const direction = contextMenu.connectorSide || 'right';
                const newNodeId = crypto.randomUUID();
                const GAP = 100;
                const NODE_WIDTH = 340;

                let newNode: NodeData;

                if (direction === 'right') {
                    // Append: Source -> New
                    newNode = {
                        ...createDefaultNodeData(type),
                        id: newNodeId,
                        x: sourceNode.x + NODE_WIDTH + GAP,
                        y: sourceNode.y,
                        parentIds: []
                    };
                } else {
                    // Prepend: New -> Source
                    newNode = {
                        ...createDefaultNodeData(type),
                        id: newNodeId,
                        x: sourceNode.x - NODE_WIDTH - GAP,
                        y: sourceNode.y,
                        parentIds: []
                    };
                }

                setNodes(prev => [...prev, newNode]);
                const parentId = direction === 'right' ? sourceNode.id : newNodeId;
                const childId = direction === 'right' ? newNodeId : sourceNode.id;
                const result = validateAndAddEdge(parentId, childId);
                if (!result.valid) {
                    setNodes(prev => prev.filter(node => node.id !== newNodeId));
                    onConnectionError?.(result.message || '无法创建连接。');
                    onCloseMenu();
                    return;
                }
                setSelectedNodeIds([newNodeId]);
            }
        } else {
            // Global menu - add at click position
            addNode(type, contextMenu.x, contextMenu.y, undefined, viewport);
        }

        onCloseMenu();
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        nodes,
        setNodes,
        edges,
        setEdges,
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
        removeEdgesForNode,
        replaceEdges,
        replaceGraph,
        getIncomingEdges: (nodeId: string) => selectIncomingEdges(edgesRef.current, nodeId),
        getOutgoingEdges: (nodeId: string) => selectOutgoingEdges(edgesRef.current, nodeId),
        getInputEdgesByPort: (nodeId: string, portId: string) => selectInputEdgesByPort(edgesRef.current, nodeId, portId),
        getOutputEdgesByPort: (nodeId: string, portId: string) => selectOutputEdgesByPort(edgesRef.current, nodeId, portId),
        validateAndAddEdge,
        clearSelection,
        handleSelectTypeFromMenu
    };
};
