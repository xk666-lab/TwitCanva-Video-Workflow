/**
 * SelectionBoundingBox.tsx
 * 
 * Renders a bounding box around selected nodes with resize handles.
 * Shows "Group" button for multi-selection and group toolbar when grouped.
 */

import React, { useState } from 'react';
import {
    BookOpenText,
    HardDrive,
    Image as ImageIcon,
    PanelsTopLeft,
    Type,
    Video
} from 'lucide-react';
import { NodeData, NodeGroup, NodeType } from '../../types';

interface SelectionBoundingBoxProps {
    selectedNodes: NodeData[];
    group?: NodeGroup;
    viewport: { x: number; y: number; zoom: number };
    onGroup: () => void;
    onUngroup: () => void;
    onBoundingBoxPointerDown: (e: React.PointerEvent) => void;
    onRenameGroup?: (groupId: string, newLabel: string) => void;
    onSortNodes?: (direction: 'horizontal' | 'vertical' | 'grid') => void;
    onCreateVideo?: () => void;
    onCreateConnectedNode?: (type: NodeType) => void;
    onEditStoryboard?: (groupId: string) => void;
    onSaveTemplate?: (nodeIds: string[], group?: NodeGroup) => void;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get the width of a node based on its type
 * @param node - The node to calculate width for
 * @param allNodes - All nodes in the selection (to find parent for Editor nodes)
 */
const getNodeWidth = (node: NodeData, allNodes?: NodeData[]): number => {
    // Image Editor with input from parent: width depends on parent's aspect ratio
    if (node.type === NodeType.IMAGE_EDITOR) {
        // Find parent node in the selection
        const parentId = node.parentIds?.[0];
        const parentNode = parentId && allNodes?.find(n => n.id === parentId);
        if (parentNode?.resultUrl && parentNode?.resultAspectRatio) {
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
        // Find parent node in the selection
        const parentId = node.parentIds?.[0];
        const parentNode = parentId && allNodes?.find(n => n.id === parentId);
        if (parentNode?.resultUrl) {
            return 500;
        }
        // Empty: width 340px
        return 340;
    }

    if (node.type === NodeType.VIDEO) return 385;
    return 365;
};

/**
 * Estimate the height of a node based on its type and aspect ratio.
 * This accounts for the content area + any controls/padding.
 * @param node - The node to calculate height for
 * @param allNodes - All nodes in the selection (to find parent for Editor nodes)
 */
const getNodeHeight = (node: NodeData, allNodes?: NodeData[]): number => {
    const baseWidth = getNodeWidth(node, allNodes);

    // Handle Image Editor nodes
    if (node.type === NodeType.IMAGE_EDITOR) {
        // Find parent node in the selection
        const parentId = node.parentIds?.[0];
        const parentNode = parentId && allNodes?.find(n => n.id === parentId);
        if (parentNode?.resultUrl && parentNode?.resultAspectRatio) {
            const parts = parentNode.resultAspectRatio.split('/');
            if (parts.length === 2) {
                const aspectRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
                // For portrait: height = 500px
                // For landscape: height = 500 / aspectRatio
                if (aspectRatio < 1) {
                    return 500;
                } else {
                    return 500 / aspectRatio;
                }
            }
        }
        // Empty: minHeight 380px
        return 380;
    }

    // Handle Video Editor nodes
    if (node.type === NodeType.VIDEO_EDITOR) {
        // Find parent node in the selection
        const parentId = node.parentIds?.[0];
        const parentNode = parentId && allNodes?.find(n => n.id === parentId);
        if (parentNode?.resultUrl) {
            // Video editor shows 16:9 when has content
            return 500 / (16 / 9);
        }
        // Empty: minHeight 380px
        return 380;
    }

    // Parse aspect ratio to calculate content height for Image/Video nodes
    let aspectRatio = 16 / 9; // Default

    // First priority: use resultAspectRatio if available (actual generated content dimensions)
    if (node.resultAspectRatio) {
        const parts = node.resultAspectRatio.split('/');
        if (parts.length === 2) {
            aspectRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
        }
    } else if (node.aspectRatio && node.aspectRatio !== 'Auto') {
        // Use selected aspect ratio
        const parts = node.aspectRatio.split(':');
        if (parts.length === 2) {
            aspectRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
        }
    } else {
        // Empty/placeholder state: Both Image and Video use 4/3
        aspectRatio = 4 / 3;
    }

    // Calculate content height from aspect ratio
    return baseWidth / aspectRatio;
};

export const SelectionBoundingBox: React.FC<SelectionBoundingBoxProps> = ({
    selectedNodes,
    group,
    viewport,
    onGroup,
    onUngroup,
    onBoundingBoxPointerDown,
    onRenameGroup,
    onSortNodes,
    onCreateVideo,
    onCreateConnectedNode,
    onEditStoryboard,
    onSaveTemplate
}) => {
    // ============================================================================
    // STATE
    // ============================================================================

    const [isEditingLabel, setIsEditingLabel] = useState(false);
    const [editedLabel, setEditedLabel] = useState('');
    const [showSortDropdown, setShowSortDropdown] = useState(false);
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    // ============================================================================
    // CALCULATIONS
    // ============================================================================

    // Don't render for 0 nodes or single nodes (unless it's a group)
    if (selectedNodes.length === 0) return null;
    if (selectedNodes.length === 1 && !group) return null;

    // Calculate bounding box from all selected nodes with proper dimensions
    const PADDING_X = 50; // Horizontal padding (accounts for + connectors on sides)
    const PADDING_TOP = 30; // Top padding for node titles
    const PADDING_BOTTOM = 50; // Bottom padding for controls

    const minX = Math.min(...selectedNodes.map(n => n.x)) - PADDING_X;
    const minY = Math.min(...selectedNodes.map(n => n.y)) - PADDING_TOP;
    const maxX = Math.max(...selectedNodes.map(n => n.x + getNodeWidth(n, selectedNodes))) + PADDING_X;
    const maxY = Math.max(...selectedNodes.map(n => n.y + getNodeHeight(n, selectedNodes))) + PADDING_BOTTOM;

    const width = maxX - minX;
    const height = maxY - minY;

    const isGrouped = !!group;
    const showGroupButton = selectedNodes.length > 1 && !isGrouped;

    // Calculate scale factor for UI elements - clamp to prevent elements from getting too large
    // At zoom 1.0: scale = 1.0 (normal size)
    // At zoom 0.5: scale = 1.5 (max clamped, instead of 2.0)
    // At zoom 2.0: scale = 0.5 (smaller)
    const uiScale = Math.min(1 / viewport.zoom, 1.5);

    // ============================================================================
    // RENDER
    // ============================================================================

    return (
        <div
            className="absolute pointer-events-auto cursor-move"
            style={{
                left: minX,
                top: minY,
                width,
                height,
                border: isGrouped ? '2px solid #6366f1' : '2px dashed #6366f1',
                borderRadius: '12px',
                backgroundColor: isGrouped ? 'rgba(55, 55, 55, 0.5)' : 'transparent',
                zIndex: 5
            }}
            onPointerDown={(e) => {
                // Only trigger group drag if clicking on the bounding box itself, not its children
                if (e.target === e.currentTarget) {
                    onBoundingBoxPointerDown(e);
                }
            }}
        >
            {/* Resize Handles */}
            {[
                { pos: 'top-left', cursor: 'nw-resize', top: -4, left: -4 },
                { pos: 'top', cursor: 'n-resize', top: -4, left: '50%', transform: 'translateX(-50%)' },
                { pos: 'top-right', cursor: 'ne-resize', top: -4, right: -4 },
                { pos: 'right', cursor: 'e-resize', top: '50%', right: -4, transform: 'translateY(-50%)' },
                { pos: 'bottom-right', cursor: 'se-resize', bottom: -4, right: -4 },
                { pos: 'bottom', cursor: 's-resize', bottom: -4, left: '50%', transform: 'translateX(-50%)' },
                { pos: 'bottom-left', cursor: 'sw-resize', bottom: -4, left: -4 },
                { pos: 'left', cursor: 'w-resize', top: '50%', left: -4, transform: 'translateY(-50%)' }
            ].map(handle => (
                <div
                    key={handle.pos}
                    className="absolute w-2 h-2 bg-white border border-indigo-500 rounded-sm pointer-events-auto"
                    style={{
                        top: handle.top,
                        left: handle.left,
                        right: handle.right,
                        bottom: handle.bottom,
                        transform: handle.transform,
                        cursor: handle.cursor
                    }}
                />
            ))}

            {/* Group Label (when grouped) - Positioned on left side */}
            {isGrouped && group && (
                isEditingLabel ? (
                    <input
                        type="text"
                        value={editedLabel}
                        onChange={(e) => setEditedLabel(e.target.value)}
                        onBlur={() => {
                            if (editedLabel.trim() && onRenameGroup) {
                                onRenameGroup(group.id, editedLabel.trim());
                            }
                            setIsEditingLabel(false);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                if (editedLabel.trim() && onRenameGroup) {
                                    onRenameGroup(group.id, editedLabel.trim());
                                }
                                setIsEditingLabel(false);
                            } else if (e.key === 'Escape') {
                                setIsEditingLabel(false);
                            }
                        }}
                        autoFocus
                        className="absolute text-sm font-medium text-white bg-indigo-600 px-3 py-1 rounded pointer-events-auto outline-none whitespace-nowrap"
                        style={{
                            top: 8,
                            right: 'calc(100% + 8px)',
                            transform: `scale(${uiScale})`,
                            transformOrigin: 'top right'
                        }}
                    />
                ) : (
                    <div
                        className="absolute text-sm font-medium text-white bg-indigo-600 px-3 py-1 rounded pointer-events-auto cursor-text whitespace-nowrap"
                        style={{
                            top: 8,
                            right: 'calc(100% + 8px)',
                            transform: `scale(${uiScale})`,
                            transformOrigin: 'top right'
                        }}
                        onDoubleClick={() => {
                            setEditedLabel(group.label);
                            setIsEditingLabel(true);
                        }}
                    >
                        {group.label}
                    </div>
                )
            )}

            {isGrouped && onCreateConnectedNode && (
                <div
                    className="absolute pointer-events-auto"
                    style={{
                        top: '50%',
                        right: -18,
                        transform: `translateY(-50%) scale(${uiScale})`,
                        transformOrigin: 'center left'
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            setShowCreateMenu(value => !value);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/35 bg-neutral-950/90 text-white shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-md transition-colors hover:border-cyan-300 hover:bg-cyan-400/20"
                        title="引用该组生成"
                        aria-label="引用该组生成"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14" />
                            <path d="M5 12h14" />
                        </svg>
                    </button>

                    {showCreateMenu && (
                        <div className="absolute left-12 top-1/2 z-[80] w-[410px] max-w-[calc(100vw-24px)] -translate-y-1/2 overflow-hidden rounded-2xl border border-white/10 bg-[#1f1f1f]/95 text-white shadow-2xl backdrop-blur-xl">
                            <div className="border-b border-white/10 px-6 py-4 text-lg font-medium text-neutral-400">
                                基于此节点继续生成
                            </div>
                            <div className="max-h-[560px] overflow-y-auto px-6 py-4">
                                {[
                                    { type: NodeType.TEXT, label: '文本生成', hint: '脚本、文案、品牌文本', icon: <Type size={26} /> },
                                    { type: NodeType.SCRIPT, label: '脚本', hint: '持久化故事与视觉设定', icon: <BookOpenText size={26} /> },
                                    { type: NodeType.STORYBOARD, label: '分镜管理器', hint: '管理结构化镜头与生成结果', icon: <PanelsTopLeft size={26} /> },
                                    { type: NodeType.IMAGE, label: '图片生成', hint: undefined, icon: <ImageIcon size={26} /> },
                                    { type: NodeType.VIDEO, label: '视频生成', hint: undefined, icon: <Video size={26} /> }
                                ].map(item => (
                                    <button
                                        key={item.type}
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setShowCreateMenu(false);
                                            onCreateConnectedNode(item.type);
                                        }}
                                        className="group flex w-full items-center gap-5 rounded-xl px-0 py-3 text-left transition-colors hover:bg-white/[0.04]"
                                    >
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#151515] text-neutral-200 transition-colors group-hover:bg-[#2d2d2d] group-hover:text-white">
                                            {item.icon}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block text-xl font-semibold text-neutral-100">{item.label}</span>
                                            {item.hint && (
                                                <span className="mt-0.5 block truncate text-base text-neutral-500">{item.hint}</span>
                                            )}
                                        </span>
                                    </button>
                                ))}

                                <div className="my-4 border-t border-white/10" />
                                <div className="mb-3 text-base text-neutral-500">本地模型（开源）</div>

                                {[
                                    { type: NodeType.LOCAL_IMAGE_MODEL, label: '本地图片模型', hint: '使用已下载的开源模型' },
                                    { type: NodeType.LOCAL_VIDEO_MODEL, label: '本地视频模型', hint: '支持 AnimateDiff、SVD 等' }
                                ].map(item => (
                                    <button
                                        key={item.type}
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setShowCreateMenu(false);
                                            onCreateConnectedNode(item.type);
                                        }}
                                        className="group flex w-full items-center gap-5 rounded-xl px-0 py-3 text-left transition-colors hover:bg-white/[0.04]"
                                    >
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#151515] text-neutral-200 transition-colors group-hover:bg-[#2d2d2d] group-hover:text-white">
                                            <HardDrive size={26} />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-xl font-semibold text-neutral-100">{item.label}</span>
                                            <span className="mt-0.5 block truncate text-base text-neutral-500">{item.hint}</span>
                                        </span>
                                        <span className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs text-neutral-300">新</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Group Button (when multiple nodes selected but not grouped) */}
            {showGroupButton && (
                <div
                    className="absolute flex gap-2 pointer-events-auto"
                    style={{
                        top: -10,
                        right: 0,
                        transform: `scale(${uiScale}) translateY(-100%)`,
                        transformOrigin: 'bottom right'
                    }}
                >
                    <button
                        onClick={onGroup}
                        className="bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-white text-sm px-4 py-2.5 rounded flex items-center gap-2 transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                        </svg>
                        Group
                    </button>
                    {onSaveTemplate && (
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onSaveTemplate(selectedNodes.map(node => node.id));
                            }}
                            className="bg-blue-600 border border-blue-400/50 hover:bg-blue-500 text-white text-sm px-4 py-2.5 rounded flex items-center gap-2 transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h13l3 3v13H4z" />
                                <path d="M8 4v6h8V4" />
                                <path d="M8 20v-6h8v6" />
                            </svg>
                            保存为模板
                        </button>
                    )}
                </div>
            )}

            {/* Group Toolbar (when grouped) */}
            {false && isGrouped && (
                <div
                    className="absolute flex gap-2 pointer-events-auto"
                    style={{
                        top: -10,
                        left: '50%',
                        transform: `translateX(-50%) scale(${uiScale}) translateY(-100%)`,
                        transformOrigin: 'bottom center'
                    }}
                >
                    {/* Sort Button with Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSortDropdown(!showSortDropdown)}
                            className="bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-white text-sm px-4 py-2.5 rounded flex items-center gap-2 transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="4" y1="6" x2="20" y2="6" />
                                <line x1="4" y1="12" x2="16" y2="12" />
                                <line x1="4" y1="18" x2="12" y2="18" />
                            </svg>
                            Sort
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>
                        {/* Dropdown Menu - Appears above */}
                        {showSortDropdown && (
                            <div className="absolute bottom-full mb-1 left-0 w-36 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl overflow-hidden z-50">
                                <button
                                    onClick={() => {
                                        onSortNodes?.('horizontal');
                                        setShowSortDropdown(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-neutral-700 transition-colors"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="4" y1="12" x2="20" y2="12" />
                                        <polyline points="14 6 20 12 14 18" />
                                    </svg>
                                    Horizontal
                                </button>
                                <button
                                    onClick={() => {
                                        onSortNodes?.('vertical');
                                        setShowSortDropdown(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-neutral-700 transition-colors"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="12" y1="4" x2="12" y2="20" />
                                        <polyline points="6 14 12 20 18 14" />
                                    </svg>
                                    Vertical
                                </button>
                                <button
                                    onClick={() => {
                                        onSortNodes?.('grid');
                                        setShowSortDropdown(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-neutral-700 transition-colors"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="3" width="7" height="7" />
                                        <rect x="14" y="3" width="7" height="7" />
                                        <rect x="3" y="14" width="7" height="7" />
                                        <rect x="14" y="14" width="7" height="7" />
                                    </svg>
                                    Grid (3 cols)
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Ungroup Button */}
                    <button
                        onClick={onUngroup}
                        className="bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-white text-sm px-4 py-2.5 rounded flex items-center gap-2 transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                            <line x1="3" y1="3" x2="21" y2="21" />
                        </svg>
                        Ungroup
                    </button>

                    {onSaveTemplate && (
                        <button
                            onClick={(event) => {
                                event.stopPropagation();
                                onSaveTemplate(selectedNodes.map(node => node.id), group);
                            }}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2.5 rounded flex items-center gap-2 transition-colors"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 4h13l3 3v13H4z" />
                                <path d="M8 4v6h8V4" />
                                <path d="M8 20v-6h8v6" />
                            </svg>
                            保存为模板
                        </button>
                    )}

                    {/* Edit Storyboard Button (only for storyboards) */}
                    {group.storyContext && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onEditStoryboard) onEditStoryboard(group.id);
                            }}
                            className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-white text-sm px-4 py-2.5 rounded flex items-center gap-2 transition-colors mr-2"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Edit Storyboard
                        </button>
                    )}

                    {/* Create Video Button */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onCreateVideo) onCreateVideo();
                        }}
                        className="bg-purple-600 hover:bg-purple-500 text-white text-sm px-4 py-2.5 rounded flex items-center gap-2 transition-colors shadow-lg shadow-purple-600/20"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M15 10l5 5-5 5" />
                            <path d="M4 4v16" />
                        </svg>
                        Create Videos
                    </button>
                </div>
            )}
        </div>
    );
};
