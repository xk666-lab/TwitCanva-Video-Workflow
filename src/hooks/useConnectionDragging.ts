/**
 * useConnectionDragging.ts
 * 
 * Custom hook for managing connection dragging between nodes.
 * Handles drag-to-connect functionality with visual feedback.
 */

import React, { useEffect, useState, useRef } from 'react';
import { NodeData, Viewport } from '../types';
import type { CanvasPortEndpoint } from '../domain/graph/semanticCanvas.ts';
import {
    findConnectionTargetNode,
    isConnectionClick,
    screenPointToCanvasPoint,
    type CanvasNodeSize
} from '../utils/connectionHitTesting.ts';

export interface ConnectionDragDrop {
    start: CanvasPortEndpoint;
    targetNodeId?: string;
    targetPort?: CanvasPortEndpoint;
}

export const useConnectionDragging = () => {
    // ============================================================================
    // STATE
    // ============================================================================

    const [isDraggingConnection, setIsDraggingConnection] = useState(false);
    const [connectionStart, setConnectionStart] = useState<CanvasPortEndpoint | null>(null);
    const [tempConnectionEnd, setTempConnectionEnd] = useState<{ x: number; y: number } | null>(null);
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [hoveredPort, setHoveredPort] = useState<CanvasPortEndpoint | null>(null);
    const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const dragStartTime = useRef<number>(0);
    const isConnectionDragActiveRef = useRef(false);
    const connectionStartRef = useRef<CanvasPortEndpoint | null>(null);
    const connectionStartPoint = useRef<{ x: number; y: number } | null>(null);
    const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hoveredPortRef = useRef<CanvasPortEndpoint | null>(null);

    useEffect(() => () => {
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
    }, []);

    const showConnectionError = (message: string) => {
        setConnectionError(message);
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
        errorTimeout.current = setTimeout(() => setConnectionError(null), 3500);
    };

    const resetConnectionDrag = () => {
        isConnectionDragActiveRef.current = false;
        connectionStartRef.current = null;
        setIsDraggingConnection(false);
        setConnectionStart(null);
        setTempConnectionEnd(null);
        setHoveredNodeId(null);
        setHoveredPort(null);
        connectionStartPoint.current = null;
        hoveredPortRef.current = null;
    };

    // ============================================================================
    // HELPERS
    // ============================================================================

    /**
     * Checks if mouse is hovering over a node (for connection target)
     * @param mouseX - Screen X coordinate
     * @param mouseY - Screen Y coordinate
     * @param nodes - Array of all nodes
     * @param viewport - Current viewport
     */
    const checkHoveredNode = (
        point: { x: number; y: number },
        nodes: NodeData[],
        nodeSizes: Record<string, CanvasNodeSize>
    ) => {
        const found = findConnectionTargetNode(
            nodes,
            point,
            connectionStartRef.current?.nodeId,
            nodeSizes
        );

        if (found) {
            setHoveredNodeId(found.id);
        } else {
            hoveredPortRef.current = null;
            setHoveredNodeId(null);
            setHoveredPort(null);
        }
    };

    // ============================================================================
    // EVENT HANDLERS
    // ============================================================================

    /**
     * Starts connection dragging from a semantic port.
     */
    const handlePortPointerDown = (
        e: React.PointerEvent,
        endpoint: CanvasPortEndpoint
    ) => {
        e.stopPropagation();
        e.preventDefault();
        dragStartTime.current = Date.now();
        isConnectionDragActiveRef.current = true;
        connectionStartRef.current = endpoint;
        connectionStartPoint.current = { x: e.clientX, y: e.clientY };
        setConnectionError(null);
        setIsDraggingConnection(true);
        setConnectionStart(endpoint);
        setHoveredNodeId(null);
        setHoveredPort(null);
        hoveredPortRef.current = null;
        setTempConnectionEnd(null);
    };

    const handlePortPointerEnter = (endpoint: CanvasPortEndpoint) => {
        if (!isConnectionDragActiveRef.current || endpoint.nodeId === connectionStartRef.current?.nodeId) return;
        hoveredPortRef.current = endpoint;
        setHoveredNodeId(endpoint.nodeId);
        setHoveredPort(endpoint);
    };

    const handlePortPointerLeave = (endpoint: CanvasPortEndpoint) => {
        if (hoveredPortRef.current?.nodeId === endpoint.nodeId && hoveredPortRef.current.portId === endpoint.portId) {
            hoveredPortRef.current = null;
            setHoveredPort(null);
        }
    };

    /**
     * Updates temporary connection end point during drag
     */
    const updateConnectionDrag = (
        e: React.PointerEvent,
        nodes: NodeData[],
        viewport: Viewport,
        canvasRect: { left: number; top: number },
        nodeSizes: Record<string, CanvasNodeSize>
    ) => {
        if (!isConnectionDragActiveRef.current) return false;

        const point = screenPointToCanvasPoint(
            { x: e.clientX, y: e.clientY },
            canvasRect,
            viewport
        );
        setTempConnectionEnd(point);
        checkHoveredNode(point, nodes, nodeSizes);
        return true;
    };

    /**
     * Completes a connection drag and lets the canvas resolve semantic ports.
     * Returns true if connection was handled, false otherwise
     * @param onDrop - Callback that resolves the dropped semantic port pair
     */
    const completeConnectionDrag = (
        event: Pick<React.PointerEvent, 'clientX' | 'clientY'>,
        onAddNext: (nodeId: string, direction: 'left' | 'right', point: { x: number; y: number }) => void,
        onDrop: (drop: ConnectionDragDrop) => void,
        nodes: NodeData[],
        viewport: Viewport,
        canvasRect: { left: number; top: number },
        nodeSizes: Record<string, CanvasNodeSize>
    ): boolean => {
        const start = connectionStartRef.current;
        if (!isConnectionDragActiveRef.current || !start) return false;

        // Close the synchronous gate before invoking callbacks so pointer and mouse
        // completion events cannot create the same Edge twice.
        isConnectionDragActiveRef.current = false;

        const dragDuration = Date.now() - dragStartTime.current;
        const point = screenPointToCanvasPoint(
            { x: event.clientX, y: event.clientY },
            canvasRect,
            viewport
        );
        const targetNodeId = findConnectionTargetNode(nodes, point, start.nodeId, nodeSizes)?.id;
        const hoveredPort = hoveredPortRef.current?.nodeId === targetNodeId
            ? hoveredPortRef.current
            : null;

        const wasClick = connectionStartPoint.current
            ? isConnectionClick(connectionStartPoint.current, { x: event.clientX, y: event.clientY }, dragDuration)
            : false;

        if (wasClick) {
            onAddNext(start.nodeId, start.direction === 'input' ? 'left' : 'right', {
                x: event.clientX,
                y: event.clientY
            });
        }
        // Drag to a node or an explicit target port.
        else if (targetNodeId) {
            onDrop({
                start,
                targetNodeId,
                ...(hoveredPort ? { targetPort: hoveredPort } : {})
            });
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
        handlePortPointerDown,
        handlePortPointerEnter,
        handlePortPointerLeave,
        updateConnectionDrag,
        completeConnectionDrag,
        handleEdgeClick,
        deleteSelectedConnection
    };
};
