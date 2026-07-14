/**
 * useImageEditor.ts
 * 
 * Custom hook for managing image editor modal state and handlers.
 */

import { useState, useCallback } from 'react';
import { NodeData, NodeStatus } from '../types';
import type { CanvasEdge } from '../domain/graph/graphTypes.ts';
import {
    resolveEditorImageSource,
    type ImageEditSource
} from '../domain/imageEditing/imageEdit.ts';

interface EditorModalState {
    isOpen: boolean;
    nodeId: string | null;
    imageUrl?: string;
    source?: ImageEditSource;
}

interface UseImageEditorOptions {
    nodes: NodeData[];
    edges: CanvasEdge[];
    updateNode: (id: string, updates: Partial<NodeData>) => void;
}

export const useImageEditor = ({ nodes, edges, updateNode }: UseImageEditorOptions) => {
    const [editorModal, setEditorModal] = useState<EditorModalState>({
        isOpen: false,
        nodeId: null
    });

    /**
     * Open the image editor for a specific node
     */
    const handleOpenImageEditor = useCallback((nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        const source = resolveEditorImageSource(node, nodes, edges);

        setEditorModal({
            isOpen: true,
            nodeId,
            imageUrl: source?.url,
            source: source || undefined
        });
    }, [nodes, edges]);

    /**
     * Close the image editor
     */
    const handleCloseImageEditor = useCallback(() => {
        setEditorModal({
            isOpen: false,
            nodeId: null
        });
    }, []);

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
     * Handler for image upload in Image nodes
     * Detects the actual aspect ratio of the uploaded image
     */
    const handleUpload = useCallback((nodeId: string, imageDataUrl: string) => {
        // Detect image dimensions and calculate aspect ratio
        const img = new Image();
        img.onload = () => {
            const resultAspectRatio = `${img.naturalWidth}/${img.naturalHeight}`;
            const aspectRatio = getClosestAspectRatio(img.naturalWidth, img.naturalHeight);
            updateNode(nodeId, {
                resultUrl: imageDataUrl,
                resultAspectRatio,
                aspectRatio,
                status: NodeStatus.SUCCESS
            });
        };
        img.onerror = () => {
            // Fallback without aspect ratio
            updateNode(nodeId, {
                resultUrl: imageDataUrl,
                status: NodeStatus.SUCCESS
            });
        };
        img.src = imageDataUrl;
    }, [updateNode]);

    return {
        editorModal,
        handleOpenImageEditor,
        handleCloseImageEditor,
        handleUpload
    };
};
