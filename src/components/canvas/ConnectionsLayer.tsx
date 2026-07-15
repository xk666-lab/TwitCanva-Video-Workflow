/**
 * ConnectionsLayer.tsx
 * 
 * Renders the SVG connections between nodes on the canvas.
 * Includes permanent connections and temporary drag connections.
 */

import React from 'react';
import { NodeData, NodeStatus, NodeType } from '../../types';
import type { CanvasEdge } from '../../domain/graph/graphTypes';
import type { CanvasPortEndpoint } from '../../domain/graph/semanticCanvas.ts';
import {
    createConnectionRenderIndex,
    getNodePortCanvasAnchor
} from '../../domain/graph/semanticCanvas.ts';
import { getNodePort } from '../../domain/nodes/nodeRegistry.ts';
import { calculateConnectionPath } from '../../utils/connectionHelpers';
import type { CanvasNodeSize } from '../../utils/connectionHitTesting.ts';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the width of a node based on its type and content
 * @param node - The node to calculate width for
 * @param parentNode - Optional parent node (used for Editor nodes to determine width when they have input content)
 */
const getNodeWidth = (node: NodeData, parentNode?: NodeData): number => {
    // Image Editor with input from parent: width depends on aspect ratio
    if (node.type === NodeType.IMAGE_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        if (hasInput && parentNode.resultAspectRatio) {
            const parts = parentNode.resultAspectRatio.split('/');
            if (parts.length === 2) {
                const aspectRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
                // For portrait images: height=500px, width=500*aspectRatio
                // For landscape images: width is capped at 500px
                if (aspectRatio < 1) {
                    return 500 * aspectRatio;
                } else {
                    return 500;
                }
            }
        }
        // Empty: width 340px
        return 340;
    }

    // Video Editor with input: uses 16:9 aspect ratio with maxWidth 500px
    if (node.type === NodeType.VIDEO_EDITOR) {
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        if (hasInput) {
            // Video uses 16:9, and width is capped at 500px
            // height = width / (16/9), maxHeight = 500px
            // So width = min(500, height * 16/9) where height is capped at 500
            // Result: width = min(500, 500 * 16/9) = min(500, 888) = 500
            return 500;
        }
        // Empty: width 340px
        return 340;
    }

    // Video nodes are wider
    if (node.type === NodeType.VIDEO) return 385;
    // Camera Angle nodes have fixed width
    if (node.type === NodeType.CAMERA_ANGLE) return 340;
    // Image and other nodes
    return 365;
};

/**
 * Estimate the height of a node based on its type and aspect ratio.
 * The node card height is determined by the content's aspect ratio or min-height for empty states.
 * Note: The title label is positioned ABOVE the card (-top-8), not inside it.
 * @param node - The node to calculate height for
 * @param parentNode - Optional parent node (used for Editor nodes to determine if they have input content)
 */
const getNodeHeight = (node: NodeData, parentNode?: NodeData): number => {
    const baseWidth = getNodeWidth(node, parentNode);
    const hasContent = node.status === NodeStatus.SUCCESS && node.resultUrl;

    // Handle Image Editor nodes
    if (node.type === NodeType.IMAGE_EDITOR) {
        // Check if has input from parent
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        if (hasInput && parentNode.resultAspectRatio) {
            // Use parent's aspect ratio to calculate actual dimensions
            // Image Editor with content: width=auto maxWidth=500px, image has maxHeight=500px
            const parts = parentNode.resultAspectRatio.split('/');
            if (parts.length === 2) {
                const aspectRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
                // For portrait images (aspectRatio < 1): height is capped at 500px
                // For landscape images (aspectRatio >= 1): width is capped at 500px
                if (aspectRatio < 1) {
                    // Portrait: height = 500px, width = 500 * aspectRatio
                    return 500;
                } else {
                    // Landscape: width = 500px, height = 500 / aspectRatio
                    return 500 / aspectRatio;
                }
            }
        }
        // Empty: minHeight 380px
        return 380;
    }

    // Handle Video Editor nodes
    if (node.type === NodeType.VIDEO_EDITOR) {
        // Check if has input from parent
        const hasInput = parentNode && parentNode.status === NodeStatus.SUCCESS && parentNode.resultUrl;
        if (hasInput) {
            // Video editor shows 16:9 when has content (line 301 in CanvasNode.tsx)
            return Math.min(baseWidth / (16 / 9), 500);
        }
        // Empty: minHeight 380px
        return 380;
    }

    // Handle Camera Angle nodes
    if (node.type === NodeType.CAMERA_ANGLE) {
        const hasContent = node.status === NodeStatus.SUCCESS && node.resultUrl;
        if (hasContent && node.resultAspectRatio) {
            // Use actual result dimensions when content exists
            const parts = node.resultAspectRatio.split('/');
            if (parts.length === 2) {
                const aspectRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
                return 340 / aspectRatio; // width is 340px
            }
        }
        // Loading/empty state: minHeight 340px (see CanvasNode.tsx Camera Angle section)
        return 340;
    }

    // Parse aspect ratio to calculate content height for Image/Video nodes
    let aspectRatio: number;

    if (hasContent && node.resultAspectRatio) {
        // Use actual result dimensions when content exists
        const parts = node.resultAspectRatio.split('/');
        if (parts.length === 2) {
            aspectRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
        } else {
            aspectRatio = 16 / 9;
        }
    } else if (hasContent && node.aspectRatio && node.aspectRatio !== 'Auto') {
        // Use selected aspect ratio for content
        const parts = node.aspectRatio.split(':');
        if (parts.length === 2) {
            aspectRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
        } else {
            aspectRatio = 16 / 9;
        }
    } else {
        // Empty/placeholder state: Both Image and Video use 4/3 (see NodeContent.tsx line 307)
        aspectRatio = 4 / 3;
    }

    // Calculate content height from aspect ratio
    return baseWidth / aspectRatio;
};

interface ConnectionsLayerProps {
    nodes: NodeData[];
    edges: CanvasEdge[];
    nodeSizes: Record<string, CanvasNodeSize>;
    // Connection dragging state
    isDraggingConnection: boolean;
    connectionStart: CanvasPortEndpoint | null;
    tempConnectionEnd: { x: number; y: number } | null;
    // Selection
    selectedEdgeId: string | null;
    onEdgeClick: (e: React.MouseEvent, edgeId: string) => void;
    canvasTheme?: 'dark' | 'light';
}

export const ConnectionsLayer: React.FC<ConnectionsLayerProps> = ({
    nodes,
    edges,
    nodeSizes,
    isDraggingConnection,
    connectionStart,
    tempConnectionEnd,
    selectedEdgeId,
    onEdgeClick,
    canvasTheme = 'dark'
}) => {
    const connectionRenderIndex = createConnectionRenderIndex(nodes, edges);

    // Render permanent connections between nodes
    const connections: React.ReactNode[] = [];

    edges.forEach((edge, edgeIndex) => {
            const parent = connectionRenderIndex.nodesById.get(edge.sourceNodeId);
            const node = connectionRenderIndex.nodesById.get(edge.targetNodeId);
            if (!parent || !node) {
                if (import.meta.env.DEV) {
                    console.warn(`[ConnectionsLayer] Ignoring edge ${edge.id} because a node is missing.`);
                }
                return;
            }

            const parallelLayout = connectionRenderIndex.parallelEdgeLayoutById.get(edge.id);
            const parallelIndex = parallelLayout?.index ?? 0;
            const parallelCount = parallelLayout?.count ?? 1;
            const offset = parallelCount > 1
                ? (parallelIndex - (parallelCount - 1) / 2) * 6
                : 0;
            const parentSize = nodeSizes[parent.id];
            const targetSize = nodeSizes[node.id];
            const parentWidth = parentSize?.width ?? getNodeWidth(parent);
            const parentHeight = parentSize?.height ?? getNodeHeight(parent);
            const nodeWidth = targetSize?.width ?? getNodeWidth(node, parent);
            const nodeHeight = targetSize?.height ?? getNodeHeight(node, parent);
            const sourceAnchor = getNodePortCanvasAnchor(parent.type, edge.sourcePortId, {
                x: parent.x,
                y: parent.y,
                width: parentWidth,
                height: parentHeight
            }) || {
                side: 'right' as const,
                x: parent.x + parentWidth,
                y: parent.y + parentHeight / 2
            };
            const targetAnchor = getNodePortCanvasAnchor(node.type, edge.targetPortId, {
                x: node.x,
                y: node.y,
                width: nodeWidth,
                height: nodeHeight
            }) || {
                side: 'left' as const,
                x: node.x,
                y: node.y + nodeHeight / 2
            };
            const startX = sourceAnchor.x;
            const startY = sourceAnchor.y + offset;
            const endX = targetAnchor.x;
            const endY = targetAnchor.y + offset;

            const path = calculateConnectionPath(startX, startY, endX, endY, sourceAnchor.side);
            const isSelected = selectedEdgeId === edge.id;
            const sourcePort = getNodePort(parent.type, edge.sourcePortId);
            const targetPort = getNodePort(node.type, edge.targetPortId);
            const edgeLabel = `${targetPort?.label || edge.targetPortId} · ${edge.dataType}`;
            const labelX = (startX + endX) / 2;
            const labelY = (startY + endY) / 2 - 8;

            connections.push(
                <g
                    key={edge.id || `${parent.id}-${node.id}-${edgeIndex}`}
                    onClick={(e) => onEdgeClick(e, edge.id)}
                    className="cursor-pointer group pointer-events-auto"
                >
                    <path d={path} stroke="transparent" strokeWidth="20" fill="none" />
                    <path
                        d={path}
                        stroke={isSelected
                            ? (canvasTheme === 'dark' ? '#fff' : '#2563eb')
                            : (canvasTheme === 'dark' ? '#444' : '#d1d5db')}
                        strokeWidth="2"
                        fill="none"
                        className={`transition-colors ${!isSelected ? (canvasTheme === 'dark' ? 'group-hover:stroke-neutral-300' : 'group-hover:stroke-neutral-500') : ''}`}
                    />
                    <text
                        x={labelX}
                        y={labelY}
                        textAnchor="middle"
                        fill={canvasTheme === 'dark' ? '#d4d4d8' : '#334155'}
                        stroke={canvasTheme === 'dark' ? '#050505' : '#f8fafc'}
                        strokeWidth="4"
                        paintOrder="stroke"
                        className={`pointer-events-none text-[9px] font-medium tracking-wide transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    >
                        {sourcePort ? edgeLabel : `${edge.dataType} 连接`}
                    </text>
                </g>
            );
    });

    // Render temporary drag connection
    let tempLine = null;
    if (isDraggingConnection && connectionStart && tempConnectionEnd) {
        const startNode = connectionRenderIndex.nodesById.get(connectionStart.nodeId);
        if (startNode) {
            const startSize = nodeSizes[startNode.id];
            const startWidth = startSize?.width ?? getNodeWidth(startNode);
            const startHeight = startSize?.height ?? getNodeHeight(startNode);
            const startAnchor = getNodePortCanvasAnchor(startNode.type, connectionStart.portId, {
                x: startNode.x,
                y: startNode.y,
                width: startWidth,
                height: startHeight
            }) || {
                side: connectionStart.direction === 'input' ? 'left' as const : 'right' as const,
                x: connectionStart.direction === 'input' ? startNode.x : startNode.x + startWidth,
                y: startNode.y + startHeight / 2
            };
            const startX = startAnchor.x;
            const startY = startAnchor.y;
            const endX = tempConnectionEnd.x;
            const endY = tempConnectionEnd.y;

            const path = calculateConnectionPath(
                startX,
                startY,
                endX,
                endY,
                startAnchor.side
            );

            tempLine = (
                <path
                    d={path}
                    stroke={canvasTheme === 'dark' ? '#fff' : '#2563eb'}
                    strokeWidth="2"
                    strokeDasharray="5,5"
                    fill="none"
                    className="pointer-events-none opacity-50"
                />
            );
        }
    }

    return (
        <>
            {connections}
            {tempLine}
        </>
    );
};
