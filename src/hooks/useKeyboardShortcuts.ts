/**
 * useKeyboardShortcuts.ts
 * 
 * Handles keyboard shortcuts: undo/redo, copy/paste, delete, escape.
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { NodeData, ContextMenuState } from '../types';
import {
    createPastedNodes,
    getClipboardSourceNodes
} from '../utils/clipboardNodes.ts';

interface UseKeyboardShortcutsOptions {
    nodes: NodeData[];
    selectedNodeIds: string[];
    selectedEdgeId: string | null;
    setNodes: React.Dispatch<React.SetStateAction<NodeData[]>>;
    setSelectedNodeIds: React.Dispatch<React.SetStateAction<string[]>>;
    setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState>>;
    deleteNodes: (ids: string[]) => void;
    deleteSelectedConnection: () => void;
    clearSelection: () => void;
    clearSelectionBox: () => void;
    undo: () => void;
    redo: () => void;
}

export const useKeyboardShortcuts = ({
    nodes,
    selectedNodeIds,
    selectedEdgeId,
    setNodes,
    setSelectedNodeIds,
    setContextMenu,
    deleteNodes,
    deleteSelectedConnection,
    clearSelection,
    clearSelectionBox,
    undo,
    redo
}: UseKeyboardShortcutsOptions) => {
    const clipboardRef = useRef<NodeData[]>([]);
    const [canPaste, setCanPaste] = useState(false);

    // ============================================================================
    // COPY / PASTE / DUPLICATE
    // ============================================================================

    const handleCopy = useCallback((sourceNodeId?: string) => {
        const copiedNodes = getClipboardSourceNodes(nodes, selectedNodeIds, sourceNodeId);
        clipboardRef.current = copiedNodes;
        setCanPaste(copiedNodes.length > 0);
        if (copiedNodes.length > 0) {
            console.log(`Copied ${copiedNodes.length} node(s)`);
        }
    }, [nodes, selectedNodeIds]);

    const handlePaste = useCallback(() => {
        if (clipboardRef.current.length > 0) {
            const newNodes = createPastedNodes(clipboardRef.current, { offset: 50 });

            setNodes(prev => [...prev, ...newNodes]);
            setSelectedNodeIds(newNodes.map(n => n.id));
            console.log(`Pasted ${newNodes.length} node(s)`);
        }
    }, [setNodes, setSelectedNodeIds]);

    const handleDuplicate = useCallback((sourceNodeId?: string) => {
        const nodesToDuplicate = getClipboardSourceNodes(nodes, selectedNodeIds, sourceNodeId);
        if (nodesToDuplicate.length > 0) {
            const newNodes = createPastedNodes(nodesToDuplicate, { offset: 20 });

            setNodes(prev => [...prev, ...newNodes]);
            setSelectedNodeIds(newNodes.map(n => n.id));
        }
    }, [nodes, selectedNodeIds, setNodes, setSelectedNodeIds]);

    // ============================================================================
    // KEYBOARD EVENT EFFECT
    // ============================================================================

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeTag = document.activeElement?.tagName.toLowerCase();
            if (activeTag === 'input' || activeTag === 'textarea') return;

            // Undo: Ctrl+Z (without Shift)
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
                return;
            }

            // Redo: Ctrl+Y or Ctrl+Shift+Z
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                redo();
                return;
            }

            // Copy: Ctrl+C
            if (e.ctrlKey && e.key === 'c') {
                handleCopy();
                return;
            }

            // Paste: Ctrl+V
            if (e.ctrlKey && e.key === 'v') {
                handlePaste();
                return;
            }

            // Delete selected nodes or connection
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeIds.length > 0) {
                    deleteNodes(selectedNodeIds);
                    setContextMenu(prev => ({ ...prev, isOpen: false }));
                } else if (selectedEdgeId) {
                    deleteSelectedConnection();
                }
            } else if (e.key === 'Escape') {
                clearSelection();
                clearSelectionBox();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        selectedNodeIds,
        selectedEdgeId,
        deleteNodes,
        deleteSelectedConnection,
        clearSelection,
        clearSelectionBox,
        undo,
        redo,
        handlePaste,
        handleCopy,
        setNodes,
        setContextMenu
    ]);

    return {
        handleCopy,
        handlePaste,
        handleDuplicate,
        canPaste
    };
};
