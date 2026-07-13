/**
 * WorkflowPanel.tsx
 *
 * Panel for browsing and managing saved workflows.
 * Shows list of workflows with options to load, delete, or edit cover.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileText, Loader2, Maximize2, Pencil, Trash2, X } from 'lucide-react';
import { LazyImage } from './LazyImage';
import { apiDelete, apiGet, apiPut } from '../services/apiClient';

interface WorkflowSummary {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    nodeCount: number;
    coverUrl?: string;
    description?: string;
}

interface AssetMetadata {
    id: string;
    url: string;
    prompt?: string;
    createdAt: string;
}

interface WorkflowPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onLoadWorkflow: (workflowId: string) => void;
    currentWorkflowId?: string;
    panelY?: number;
    canvasTheme?: 'dark' | 'light';
}

export const WorkflowPanel: React.FC<WorkflowPanelProps> = ({
    isOpen,
    onClose,
    onLoadWorkflow,
    currentWorkflowId,
    panelY = 200,
    canvasTheme = 'dark'
}) => {
    const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
    const [publicWorkflows, setPublicWorkflows] = useState<WorkflowSummary[]>([]);
    const [activeTab, setActiveTab] = useState<'my' | 'public'>('my');
    const [loading, setLoading] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [editingCoverFor, setEditingCoverFor] = useState<string | null>(null);
    const [coverAssets, setCoverAssets] = useState<AssetMetadata[]>([]);
    const [loadingAssets, setLoadingAssets] = useState(false);
    const [visibleCoverCount, setVisibleCoverCount] = useState(9);

    const COVERS_PER_PAGE = 9;
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const isDark = canvasTheme === 'dark';

    const fetchWorkflows = async () => {
        setLoading(true);
        try {
            setWorkflows(await apiGet<WorkflowSummary[]>('/api/workflows'));
        } catch (error) {
            console.error('Failed to fetch workflows:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPublicWorkflows = async () => {
        try {
            setPublicWorkflows(await apiGet<WorkflowSummary[]>('/api/public-workflows'));
        } catch (error) {
            console.error('Failed to fetch public workflows:', error);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchWorkflows();
            fetchPublicWorkflows();
        }
    }, [isOpen]);

    const handleDelete = async (id: string) => {
        try {
            await apiDelete(`/api/workflows/${id}`);
            setWorkflows(prev => prev.filter(workflow => workflow.id !== id));
        } catch (error) {
            console.error('Failed to delete workflow:', error);
        } finally {
            setDeleteConfirm(null);
        }
    };

    const loadMoreCovers = useCallback(() => {
        setVisibleCoverCount(prev => Math.min(prev + COVERS_PER_PAGE, coverAssets.length));
    }, [coverAssets.length]);

    useEffect(() => {
        if (!editingCoverFor || loadingAssets) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && visibleCoverCount < coverAssets.length) {
                    loadMoreCovers();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        if (loadMoreRef.current) {
            observer.observe(loadMoreRef.current);
        }

        return () => observer.disconnect();
    }, [editingCoverFor, loadingAssets, visibleCoverCount, coverAssets.length, loadMoreCovers]);

    const openCoverEditor = async (workflowId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingCoverFor(workflowId);
        setLoadingAssets(true);
        setVisibleCoverCount(COVERS_PER_PAGE);

        try {
            setCoverAssets(await apiGet<AssetMetadata[]>('/api/assets/images'));
        } catch (error) {
            console.error('Failed to fetch cover assets:', error);
        } finally {
            setLoadingAssets(false);
        }
    };

    const selectCover = async (assetUrl: string) => {
        if (!editingCoverFor) return;

        try {
            await apiPut(`/api/workflows/${editingCoverFor}/cover`, { coverUrl: assetUrl });
            setWorkflows(prev => prev.map(workflow =>
                workflow.id === editingCoverFor
                    ? { ...workflow, coverUrl: assetUrl }
                    : workflow
            ));
        } catch (error) {
            console.error('Failed to update cover:', error);
        } finally {
            setEditingCoverFor(null);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric'
        });
    };

    const renderWorkflowCard = (workflow: WorkflowSummary, isPublic = false) => (
        <div
            key={workflow.id}
            onClick={() => onLoadWorkflow(isPublic ? `public:${workflow.id}` : workflow.id)}
            className={`rounded-xl overflow-hidden cursor-pointer transition-all group ${workflow.id === currentWorkflowId
                ? 'ring-2 ring-blue-500'
                : ''
                }`}
        >
            <div className={`aspect-[4/3] flex items-center justify-center relative overflow-hidden ${isPublic
                ? 'bg-gradient-to-br from-green-800/30 to-emerald-900/30'
                : 'bg-gradient-to-br from-neutral-800 to-neutral-900'
                }`}
            >
                {workflow.coverUrl ? (
                    <img
                        src={workflow.coverUrl}
                        alt={workflow.title || 'Workflow cover'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <div className={`w-16 h-16 rounded-lg flex items-center justify-center ${isPublic
                        ? 'bg-gradient-to-br from-green-500/20 to-emerald-600/20'
                        : 'bg-gradient-to-br from-blue-500/20 to-purple-600/20'
                        }`}
                    >
                        <FileText size={28} className="text-neutral-500" />
                    </div>
                )}

                {isPublic ? (
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-green-600/80 rounded text-[10px] font-medium text-white">
                        Public
                    </div>
                ) : (
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                            onClick={(e) => openCoverEditor(workflow.id, e)}
                            className="p-1.5 bg-black/50 hover:bg-blue-500 rounded-lg transition-all"
                            title="Edit cover"
                        >
                            <Pencil size={14} className="text-white" />
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(workflow.id);
                            }}
                            className="p-1.5 bg-black/50 hover:bg-red-500 rounded-lg transition-all"
                            title="Delete workflow"
                        >
                            <Trash2 size={14} className="text-white" />
                        </button>
                    </div>
                )}
            </div>

            <div className={`p-3 ${isDark ? 'bg-neutral-900/50' : 'bg-neutral-100/90'}`}>
                <h3 className={`font-medium text-sm truncate ${isDark ? 'text-white' : 'text-neutral-900'}`}>
                    {workflow.title || 'Untitled'}
                </h3>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-neutral-500' : 'text-neutral-600'}`}>
                    {isPublic
                        ? workflow.description || `${workflow.nodeCount} nodes`
                        : `${workflow.nodeCount} nodes | ${formatDate(workflow.updatedAt || workflow.createdAt)}`}
                </p>
            </div>
        </div>
    );

    if (!isOpen) return null;

    return (
        <>
            <div
                className={`fixed left-20 w-[700px] backdrop-blur-xl border rounded-2xl shadow-2xl z-40 flex flex-col overflow-hidden max-h-[500px] transition-colors duration-300 ${isDark ? 'bg-[#0a0a0a]/95 border-neutral-800' : 'bg-white/95 border-neutral-200'}`}
                style={{ top: panelY }}
            >
                <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
                    <div className="flex items-center gap-6">
                        <button
                            onClick={() => setActiveTab('my')}
                            className={`font-medium pb-1 transition-colors ${activeTab === 'my'
                                ? isDark ? 'text-white border-b-2 border-white' : 'text-neutral-900 border-b-2 border-neutral-900'
                                : isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600'
                                }`}
                        >
                            My Workflows
                        </button>
                        <button
                            onClick={() => setActiveTab('public')}
                            className={`font-medium pb-1 transition-colors ${activeTab === 'public'
                                ? isDark ? 'text-white border-b-2 border-white' : 'text-neutral-900 border-b-2 border-neutral-900'
                                : isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-600'
                                }`}
                        >
                            Public Workflows
                        </button>
                    </div>
                    <button
                        onClick={onClose}
                        className={`transition-colors ${isDark ? 'text-neutral-500 hover:text-white' : 'text-neutral-400 hover:text-neutral-900'}`}
                    >
                        <Maximize2 size={18} />
                    </button>
                </div>

                <div
                    className="flex-1 overflow-y-auto p-4"
                    style={{
                        scrollbarWidth: 'thin',
                        scrollbarColor: isDark ? '#525252 #171717' : '#d4d4d4 #fafafa'
                    }}
                >
                    {loading && activeTab === 'my' ? (
                        <div className="flex items-center justify-center h-40">
                            <Loader2 className="animate-spin text-neutral-500" size={24} />
                        </div>
                    ) : activeTab === 'my' ? (
                        workflows.length === 0 ? (
                            <div className="flex items-center justify-center h-40 text-neutral-500">
                                No saved workflows yet
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-4">
                                {workflows.map(workflow => renderWorkflowCard(workflow))}
                            </div>
                        )
                    ) : (
                        publicWorkflows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-neutral-500 gap-2">
                                <FileText size={32} className="opacity-50" />
                                <p>No public workflows</p>
                                <p className="text-xs text-neutral-600">Place workflow JSON files in public/workflows/</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-4">
                                {publicWorkflows.map(workflow => renderWorkflowCard(workflow, true))}
                            </div>
                        )
                    )}
                </div>
            </div>

            {deleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-[#1a1a1a] border border-neutral-700 rounded-2xl p-6 w-[340px] shadow-2xl">
                        <h3 className="text-lg font-semibold text-white mb-2">Delete workflow?</h3>
                        <p className="text-neutral-400 text-sm mb-6">
                            This removes the workflow file from your library. This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-sm transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingCoverFor && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-[#1a1a1a] border border-neutral-700 rounded-2xl p-6 w-[500px] max-h-[500px] shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-white">Choose cover image</h3>
                            <button
                                onClick={() => setEditingCoverFor(null)}
                                className="p-1.5 hover:bg-neutral-800 rounded-lg text-neutral-400 hover:text-white transition-colors"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {loadingAssets ? (
                            <div className="flex items-center justify-center h-40">
                                <Loader2 className="animate-spin text-neutral-500" size={24} />
                            </div>
                        ) : coverAssets.length === 0 ? (
                            <div className="flex items-center justify-center h-40 text-neutral-500">
                                No generated images available
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-3 overflow-y-auto flex-1">
                                {coverAssets.slice(0, visibleCoverCount).map(asset => (
                                    <button
                                        key={asset.id}
                                        onClick={() => selectCover(asset.url)}
                                        className="h-32 w-full rounded-lg overflow-hidden hover:ring-2 hover:ring-blue-500 transition-all relative group bg-neutral-900"
                                    >
                                        <LazyImage
                                            src={asset.url}
                                            alt="Cover option"
                                            className="w-full h-full"
                                            placeholderClassName="rounded-lg"
                                            rootMargin="100px"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                            <Check size={24} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </button>
                                ))}

                                {visibleCoverCount < coverAssets.length && (
                                    <div
                                        ref={loadMoreRef}
                                        className="col-span-3 flex items-center justify-center py-4"
                                    >
                                        <Loader2 className="animate-spin text-neutral-500" size={20} />
                                        <span className="ml-2 text-neutral-500 text-sm">Loading more...</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
