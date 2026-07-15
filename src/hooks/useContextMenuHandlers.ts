/**
 * useContextMenuHandlers.ts
 * 
 * Handles context menu operations: double-click, right-click,
 * node context menu, toolbar add button.
 */

import React, { useCallback } from 'react';
import { NodeData, NodeType, ContextMenuState, Viewport } from '../types';

interface UseContextMenuHandlersOptions {
    nodes: NodeData[];
    viewport: Viewport;
    contextMenu: ContextMenuState;
    setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
    handleOpenCreateAsset: (nodeId: string) => void;
    handleSelectTypeFromMenu: (
        type: NodeType | 'DELETE',
        contextMenu: ContextMenuState,
        viewport: Viewport,
        closeMenu: () => void,
        onConnectionError?: (message: string) => void
    ) => void;
    onConnectionError?: (message: string) => void;
}

export const useContextMenuHandlers = ({
    nodes,
    viewport,
    contextMenu,
    setContextMenu,
    handleOpenCreateAsset,
    handleSelectTypeFromMenu,
    onConnectionError
}: UseContextMenuHandlersOptions) => {
    // ============================================================================
    // DOUBLE-CLICK & RIGHT-CLICK
    // ============================================================================

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).id === 'canvas-background') {
            setContextMenu({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                type: 'add-nodes'
            });
        }
    }, [setContextMenu]);

    const handleGlobalContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        if ((e.target as HTMLElement).id === 'canvas-background') {
            setContextMenu({
                isOpen: true,
                x: e.clientX,
                y: e.clientY,
                type: 'global'
            });
        }
    }, [setContextMenu]);

    // ============================================================================
    // NODE OPERATIONS
    // ============================================================================

    const handleAddNext = useCallback((nodeId: string, _direction: 'left' | 'right', point?: { x: number; y: number }) => {
        const sourceNode = nodes.find(n => n.id === nodeId);
        if (!sourceNode) return;

        const MENU_WIDTH = 410;
        const MENU_HEIGHT = 560;
        const GAP = 14;
        const anchorX = point?.x ?? window.innerWidth / 2;
        const anchorY = point?.y ?? window.innerHeight / 2;
        const desiredX = _direction === 'left'
            ? anchorX - MENU_WIDTH - GAP
            : anchorX + GAP;
        const x = Math.min(
            Math.max(12, desiredX),
            Math.max(12, window.innerWidth - MENU_WIDTH - 12)
        );
        const y = Math.min(
            Math.max(12, anchorY - 28),
            Math.max(12, window.innerHeight - MENU_HEIGHT - 12)
        );

        setContextMenu({
            isOpen: true,
            x,
            y,
            type: 'node-connector',
            sourceNodeId: nodeId,
            connectorSide: _direction
        });
    }, [nodes, setContextMenu]);

    const handleNodeContextMenu = useCallback((e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();

        const node = nodes.find(n => n.id === id);
        if (!node) return;

        setContextMenu({
            isOpen: true,
            x: e.clientX,
            y: e.clientY,
            type: 'node-options',
            sourceNodeId: id
        });
    }, [nodes, setContextMenu]);

    // ============================================================================
    // CONTEXT MENU ACTIONS
    // ============================================================================

    const handleContextMenuCreateAsset = useCallback(() => {
        if (contextMenu.sourceNodeId) {
            handleOpenCreateAsset(contextMenu.sourceNodeId);
        }
    }, [contextMenu.sourceNodeId, handleOpenCreateAsset]);

    const handleContextMenuSelect = useCallback((type: NodeType | 'DELETE') => {
        handleSelectTypeFromMenu(
            type,
            contextMenu,
            viewport,
            () => setContextMenu(prev => ({ ...prev, isOpen: false })),
            onConnectionError
        );
    }, [handleSelectTypeFromMenu, contextMenu, viewport, setContextMenu, onConnectionError]);

    const handleToolbarAdd = useCallback((e: React.MouseEvent) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setContextMenu({
            isOpen: true,
            x: rect.right + 10,
            y: rect.top,
            type: 'global'
        });
    }, [setContextMenu]);

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        handleDoubleClick,
        handleGlobalContextMenu,
        handleAddNext,
        handleNodeContextMenu,
        handleContextMenuCreateAsset,
        handleContextMenuSelect,
        handleToolbarAdd
    };
};
