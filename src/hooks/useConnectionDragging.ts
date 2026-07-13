/**
 * useConnectionDragging.ts
 * 
 * Custom hook for managing connection dragging between nodes.
 * Handles drag-to-connect functionality with visual feedback.
 */

import React, { useEffect, useState, useRef } from 'react';
import { NodeData, Viewport } from '../types';
import type { ValidateAndAddEdgeResult } from './useNodeManagement';

interface ConnectionStart {
    nodeId: string;
    handle: 'left' | 'right';
}

export const useConnectionDragging = () => {
    // ============================================================================
    // STATE
    // ============================================================================

    const [isDraggingConnection, setIsDraggingConnection] = useState(false);
    const [connectionStart, setConnectionStart] = useState<ConnectionStart | null>(null);
    const [tempConnectionEnd, setTempConnectionEnd] = useState<{ x: number; y: number } | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredSide, setHoveredSide] = useState<'left' | 'right' | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const dragStartTime = useRef<number>(0);
    const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => () => {
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
    }, []);

    const showConnectionError = (message: string) => {
        setConnectionError(message);
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
        errorTimeout.current = setTimeout(() => setConnectionError(null), 3500);
    };

    const resetConnectionDrag = () => {
        setIsDraggingConnection(false);
        setConnectionStart(null);
        setTempConnectionEnd(null);
        setHoveredNodeId(null);
        setHoveredSide(null);
    };

    // ============================================================================
    // HELPERS
    // ============================================================================

    /**
     * Checks if mouse is hovering over a node (for connection target)
     * Also determines which side (left or right connector) is being hovered
     * @param mouseX - Screen X coordinate
     * @param mouseY - Screen Y coordinate
     * @param nodes - Array of all nodes
     * @param viewport - Current viewport
     */
    const checkHoveredNode = (
        mouseX: number,
        mouseY: number,
        nodes: NodeData[],
        viewport: Viewport
    ) => {
        const canvasX = (mouseX - viewport.x) / viewport.zoom;
        const canvasY = (mouseY - viewport.y) / viewport.zoom;

        const found = nodes.find(n => {
            if (n.id === connectionStart?.nodeId) return false;
            return (
                canvasX >= n.x && canvasX <= n.x + 340 &&
                canvasY >= n.y && canvasY <= n.y + 400
            );
        });

        if (found) {
            setHoveredNodeId(found.id);

            // Determine which side is being hovered
            // Left connector is at x position, right connector is at x + 340
            const nodeCenter = found.x + 170; // Middle of the node
            setHoveredSide(canvasX < nodeCenter ? 'left' : 'right');
        } else {
            setHoveredNodeId(null);
            setHoveredSide(null);
        }
    };

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    /**
     * Starts connection dragging from a connector button
     */
    const handleConnectorPointerDown = (
        e: React.PointerEvent,
        nodeId: string,
        side: 'left' | 'right'
    ) => {
        e.stopPropagation();
        e.preventDefault();
        dragStartTime.current = Date.now();
        setConnectionError(null);
        setIsDraggingConnection(true);
        setConnectionStart({ nodeId, handle: side });
        setTempConnectionEnd({ x: e.clientX, y: e.clientY });
    };

    /**
     * Updates temporary connection end point during drag
     */
    const updateConnectionDrag = (
        e: React.PointerEvent,
        nodes: NodeData[],
        viewport: Viewport
    ) => {
        if (!isDraggingConnection) return false;

        setTempConnectionEnd({ x: e.clientX, y: e.clientY });
        checkHoveredNode(e.clientX, e.clientY, nodes, viewport);
        return true;
    };

    /**
     * Completes connection drag and creates connection if valid
     * Returns true if connection was handled, false otherwise
     * @param onConnectionMade - Optional callback called with (parentId, childId) when connection is created
     */
    const completeConnectionDrag = (
        onAddNext: (nodeId: string, direction: 'left' | 'right') => void,
        validateAndAddEdge: (sourceNodeId: string, targetNodeId: string) => ValidateAndAddEdgeResult,
        onConnectionMade?: (parentId: string, childId: string) => void
    ): boolean => {
        if (!isDraggingConnection || !connectionStart) return false;

        const dragDuration = Date.now() - dragStartTime.current;

        // Short click - open menu
        if (dragDuration < 200 && !hoveredNodeId) {
            onAddNext(connectionStart.nodeId, connectionStart.handle);
        }
        // Drag to node - create connection based on target side
        else if (hoveredNodeId && hoveredSide) {
            if (hoveredSide === 'left') {
                // Connecting to LEFT connector = target receives input (target is child)
                // source is parent, hoveredNode is child
                const result = validateAndAddEdge(connectionStart.nodeId, hoveredNodeId);
                if (!result.valid) {
                    showConnectionError(result.message || '无法创建连接。');
                    resetConnectionDrag();
                    return true;
                }
                // Notify about new connection: source is parent, hoveredNode is child
                onConnectionMade?.(connectionStart.nodeId, hoveredNodeId);
            } else {
                // Connecting to RIGHT connector = target provides output (target is parent)
                // hoveredNode is parent, source is child
                const result = validateAndAddEdge(hoveredNodeId, connectionStart.nodeId);
                if (!result.valid) {
                    showConnectionError(result.message || '无法创建连接。');
                    resetConnectionDrag();
                    return true;
                }
                // Notify about new connection: hoveredNode is parent, source is child
                onConnectionMade?.(hoveredNodeId, connectionStart.nodeId);
            }
        }

        // Reset state
        resetConnectionDrag();
        return true;
    };

    /**
     * Handles clicking on a connection line to select it
     */
    const handleEdgeClick = (e: React.MouseEvent, edgeId: string) => {
        e.stopPropagation();
        setSelectedEdgeId(edgeId);
    };

    /**
     * Deletes the currently selected connection
     */
    const deleteSelectedConnection = (removeEdge: (edgeId: string) => void) => {
        if (!selectedEdgeId) return false;
        removeEdge(selectedEdgeId);
        setSelectedEdgeId(null);
        return true;
    };

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        isDraggingConnection,
        connectionStart,
        tempConnectionEnd,
        hoveredNodeId,
        selectedEdgeId,
        setSelectedEdgeId,
        connectionError,
        reportConnectionError: showConnectionError,
        handleConnectorPointerDown,
        updateConnectionDrag,
        completeConnectionDrag,
        handleEdgeClick,
        deleteSelectedConnection
    };
};
