/**
 * NodeContent.tsx
 * 
 * Displays the content area of a canvas node.
 * Handles result display (image/video) and placeholder states.
 */

import React, { useRef, useState, useEffect } from 'react';
import { CheckCircle2, ImageIcon as ImageIcon, Film, Loader2, Upload, Pencil, Video, Expand, Shrink, HardDrive, Music2, Star, Trash2 } from 'lucide-react';
import { NodeData, NodeType, type MediaTake } from '../../types';
import { ScriptNodeContent } from './ScriptNodeContent';
import { StoryboardNodeContent } from './StoryboardNodeContent';
import { SubjectNodeContent } from './SubjectNodeContent';
import { apiPost } from '../../services/apiClient';
import { deleteTake, selectHeroTake, updateTakeMetadata } from '../../utils/takeHelpers';

interface NodeContentProps {
    data: NodeData;
    inputUrl?: string;
    selected: boolean;
    isIdle: boolean;
    isLoading: boolean;
    isSuccess: boolean;
    getAspectRatioStyle: () => { aspectRatio: string };
    onUpload?: (nodeId: string, imageDataUrl: string) => void;
    onAudioUpload?: (nodeId: string, audioDataUrl: string, fileName?: string) => void | Promise<void>;
    onExpand?: (imageUrl: string) => void;
    onDragStart?: (nodeId: string, hasContent: boolean) => void;
    onDragEnd?: () => void;
    // Text node callbacks
    onWriteContent?: (nodeId: string) => void;
    onTextToVideo?: (nodeId: string) => void;
    onTextToImage?: (nodeId: string) => void;
    // Image node callbacks
    onImageToImage?: (nodeId: string) => void;
    onImageToVideo?: (nodeId: string) => void;
    onUpdate?: (nodeId: string, updates: Partial<NodeData>) => void;
    // Social sharing
    onPostToX?: (nodeId: string, mediaUrl: string, mediaType: 'image' | 'video') => void;
    // Story node callbacks
    onOpenStoryNode?: (nodeId: string) => void;
    onCancelStoryTask?: (nodeId: string) => void;
    onRetryStoryTask?: (nodeId: string) => void;
    onAddStoryboardToTimeline?: (nodeId: string) => { valid: boolean; message?: string };
}

function clampProgress(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes <= 0) return `${remainingSeconds}s`;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

function useGenerationElapsedSeconds(isLoading: boolean, startedAt?: number): number {
    const getElapsed = () => {
        if (!isLoading || !startedAt) return 0;
        return Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    };
    const [elapsedSeconds, setElapsedSeconds] = useState(getElapsed);

    useEffect(() => {
        if (!isLoading) {
            setElapsedSeconds(0);
            return;
        }

        const updateElapsed = () => setElapsedSeconds(getElapsed());
        updateElapsed();
        const intervalId = window.setInterval(updateElapsed, 1000);
        return () => window.clearInterval(intervalId);
    }, [isLoading, startedAt]);

    return elapsedSeconds;
}

const GenerationProgressIndicator: React.FC<{
    data: NodeData;
    elapsedSeconds: number;
}> = ({ data, elapsedSeconds }) => {
    const progress = clampProgress(data.generationProgress);
    const hasMeasuredProgress = progress !== undefined && progress > 0;
    const displayProgress = hasMeasuredProgress ? progress : undefined;
    const railWidth = displayProgress !== undefined ? `${Math.max(6, displayProgress)}%` : '46%';
    const operationLabel = data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL
        ? 'Rendering video'
        : data.type === NodeType.AUDIO
            ? 'Processing audio'
            : 'Rendering image';
    const taskLabel = data.activeTaskId ? `Task ${data.activeTaskId.slice(0, 8)}` : 'Preparing task';
    const valueLabel = displayProgress !== undefined ? `${displayProgress}%` : formatDuration(elapsedSeconds);
    const progressMessage = data.generationProgressMessage || 'Provider response';

    return (
        <div className="relative w-[252px] max-w-[82%] overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#07090a]/75 px-3.5 py-3 shadow-[0_18px_55px_rgba(0,0,0,0.45)] backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(103,232,249,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent_46%)]" />
            <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                    <span className="relative mt-1 flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-45" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-200 shadow-[0_0_16px_rgba(103,232,249,0.75)]" />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold text-white/90">{operationLabel}</div>
                        <div className="mt-0.5 truncate text-[10px] text-white/35" title={data.activeTaskId}>{taskLabel}</div>
                    </div>
                </div>
                <div className="shrink-0 text-right">
                    <div className="font-mono text-[12px] font-medium tabular-nums text-cyan-100">{valueLabel}</div>
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-white/30">active</div>
                </div>
            </div>
            <div className="relative mt-3 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
                <div className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
                <div
                    className={`relative h-full rounded-full bg-[linear-gradient(90deg,#67e8f9,#f8fafc,#22d3ee)] shadow-[0_0_18px_rgba(103,232,249,0.45)] transition-[width] duration-700 ${displayProgress === undefined ? 'animate-pulse' : ''}`}
                    style={{ width: railWidth }}
                />
            </div>
            <div className="relative mt-2 flex items-center justify-between gap-2 text-[10px] text-white/35">
                <span className="truncate" title={progressMessage}>{progressMessage}</span>
                <span className="shrink-0 font-mono tabular-nums">{elapsedSeconds > 0 ? formatDuration(elapsedSeconds) : '0s'}</span>
            </div>
        </div>
    );
};

const ImageTakeGallery: React.FC<{
    data: NodeData;
    takes: MediaTake[];
    isLoading: boolean;
    selected: boolean;
    elapsedSeconds: number;
    onUpdate?: (nodeId: string, updates: Partial<NodeData>) => void;
    onExpand?: (imageUrl: string) => void;
}> = ({ data, takes, isLoading, selected, elapsedSeconds, onUpdate, onExpand }) => {
    const [savingTakeIds, setSavingTakeIds] = useState<Set<string>>(new Set());

    const patchNodeFrom = (nextNode: NodeData) => {
        onUpdate?.(data.id, {
            status: nextNode.status,
            resultUrl: nextNode.resultUrl,
            heroTakeId: nextNode.heroTakeId,
            takes: nextNode.takes,
            resultAspectRatio: nextNode.resultAspectRatio
        });
    };

    const handleSelectTake = (take: MediaTake) => {
        patchNodeFrom(selectHeroTake(data, take.id));
    };

    const handleDeleteTake = (event: React.MouseEvent, take: MediaTake) => {
        event.stopPropagation();
        patchNodeFrom(deleteTake(data, take.id));
    };

    const handleSaveTake = async (event: React.MouseEvent, take: MediaTake, index: number) => {
        event.stopPropagation();
        if (take.metadata?.savedToAssetLibrary || savingTakeIds.has(take.id)) return;

        setSavingTakeIds(previous => new Set(previous).add(take.id));
        try {
            const response = await apiPost<{ asset: { id: string } }>('/api/library', {
                sourceUrl: take.url,
                name: `${(data.title || data.prompt || 'generated-image').slice(0, 36) || 'generated-image'}-${index + 1}`,
                category: 'Generated',
                meta: {
                    nodeId: data.id,
                    takeId: take.id,
                    prompt: take.prompt,
                    model: take.model
                }
            });
            const nextNode = updateTakeMetadata(data, take.id, {
                savedToAssetLibrary: true,
                libraryAssetId: response.asset.id,
                savedToAssetLibraryAt: new Date().toISOString()
            });
            patchNodeFrom(nextNode);
        } catch (error) {
            console.error('Failed to save take to asset library:', error);
        } finally {
            setSavingTakeIds(previous => {
                const next = new Set(previous);
                next.delete(take.id);
                return next;
            });
        }
    };

    return (
        <div className={`relative w-full bg-[#050505] ${!selected ? '' : 'rounded-xl overflow-hidden'}`}>
            <div className={`grid gap-2 p-2 ${takes.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {takes.map((take, index) => {
                    const isHero = data.heroTakeId
                        ? data.heroTakeId === take.id
                        : data.resultUrl === take.url || take.isHero;
                    const isSaved = Boolean(take.metadata?.savedToAssetLibrary);
                    const isSaving = savingTakeIds.has(take.id);
                    return (
                        <div
                            key={take.id}
                            onPointerDown={event => event.stopPropagation()}
                            onClick={() => handleSelectTake(take)}
                            onDoubleClick={() => onExpand?.(take.url)}
                            onKeyDown={event => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleSelectTake(take);
                                }
                            }}
                            role="button"
                            tabIndex={0}
                            className={`group/take relative overflow-hidden rounded-xl border bg-black text-left transition-all ${isHero ? 'border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.7),0_0_28px_rgba(34,211,238,0.24)]' : 'border-white/10 hover:border-white/35'}`}
                        >
                            <div className="aspect-square w-full bg-[#080808]">
                                <img src={take.thumbnailUrl || take.url} alt={`Generated candidate ${index + 1}`} className="h-full w-full object-contain" />
                            </div>
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-black/10 opacity-80" />
                            <div className="absolute left-2 top-2 flex items-center gap-1">
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isHero ? 'bg-cyan-300 text-black' : 'bg-black/60 text-white/75'}`}>
                                    {isHero ? '当前' : `#${index + 1}`}
                                </span>
                            </div>
                            <div className={`absolute bottom-2 left-2 right-2 flex items-center justify-between gap-1 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover/take:opacity-100 focus-within:opacity-100'}`}>
                                <button
                                    type="button"
                                    onPointerDown={event => event.stopPropagation()}
                                    onClick={event => {
                                        event.stopPropagation();
                                        handleSelectTake(take);
                                    }}
                                    className="flex h-7 items-center gap-1 rounded-full bg-black/70 px-2 text-[10px] font-medium text-white backdrop-blur hover:bg-cyan-400 hover:text-black"
                                >
                                    <Star size={12} />
                                    选择
                                </button>
                                <div className="flex items-center gap-1">
                                    <button
                                        type="button"
                                        onPointerDown={event => event.stopPropagation()}
                                        onClick={event => handleSaveTake(event, take, index)}
                                        className={`flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-medium backdrop-blur ${isSaved ? 'bg-emerald-400/90 text-black' : 'bg-black/70 text-white hover:bg-white hover:text-black'}`}
                                        title={isSaved ? '已存入素材库' : '存入素材库'}
                                    >
                                        <CheckCircle2 size={12} />
                                        {isSaving ? '保存中' : isSaved ? '已保存' : '素材库'}
                                    </button>
                                    <button
                                        type="button"
                                        onPointerDown={event => event.stopPropagation()}
                                        onClick={event => handleDeleteTake(event, take)}
                                        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-red-500"
                                        title="删除候选"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {isLoading && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[3px]">
                    <div className="pointer-events-none absolute inset-x-10 top-8 h-px bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent" />
                    <GenerationProgressIndicator data={data} elapsedSeconds={elapsedSeconds} />
                </div>
            )}
        </div>
    );
};

export const NodeContent: React.FC<NodeContentProps> = ({
    data,
    inputUrl,
    selected,
    isIdle,
    isLoading,
    isSuccess,
    getAspectRatioStyle,
    onUpload,
    onAudioUpload,
    onExpand,
    onDragStart,
    onDragEnd,
    onWriteContent,
    onTextToVideo,
    onTextToImage,
    onImageToImage,
    onImageToVideo,
    onUpdate,
    onPostToX,
    onOpenStoryNode,
    onCancelStoryTask,
    onRetryStoryTask,
    onAddStoryboardToTimeline
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const audioInputRef = useRef<HTMLInputElement>(null);

    // Local state for text node textarea to prevent lag
    const [localPrompt, setLocalPrompt] = useState(data.prompt || '');
    const updateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSentPromptRef = useRef<string | undefined>(data.prompt); // Track what we sent

    // Helper: Check if node is image-type (includes local image model)
    const isImageType = data.type === NodeType.IMAGE || data.type === NodeType.LOCAL_IMAGE_MODEL;
    // Helper: Check if node is video-type (includes local video model)
    const isVideoType = data.type === NodeType.VIDEO || data.type === NodeType.LOCAL_VIDEO_MODEL;
    // Helper: Check if node is local model
    const isLocalModel = data.type === NodeType.LOCAL_IMAGE_MODEL || data.type === NodeType.LOCAL_VIDEO_MODEL;
    const isAudioType = data.type === NodeType.AUDIO;
    const generationElapsedSeconds = useGenerationElapsedSeconds(isLoading, data.generationStartTime);
    const imageTakes = (data.takes || []).filter(take => take.type === 'image' && take.url);
    const shouldShowImageTakeGallery = imageTakes.some(take => take.metadata?.displayInNodeGallery === true);

    // Sync local state ONLY when data.prompt changes externally (not from our own update)
    useEffect(() => {
        if (data.prompt !== lastSentPromptRef.current) {
            setLocalPrompt(data.prompt || '');
            lastSentPromptRef.current = data.prompt;
        }
    }, [data.prompt]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
            }
        };
    }, []);

    const handleTextChange = (value: string) => {
        setLocalPrompt(value); // Update local state immediately
        lastSentPromptRef.current = value; // Track that we're about to send this

        // Debounce parent update
        if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
        }
        updateTimeoutRef.current = setTimeout(() => {
            onUpdate?.(data.id, { prompt: value });
        }, 150);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onUpload) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            onUpload(data.id, reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onAudioUpload) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            void onAudioUpload(data.id, reader.result as string, file.name);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    if (data.type === NodeType.SCRIPT) {
        return (
            <ScriptNodeContent
                data={data}
                onOpen={onOpenStoryNode || (() => undefined)}
                onCancel={onCancelStoryTask || (() => undefined)}
                onRetry={onRetryStoryTask || (() => undefined)}
            />
        );
    }

    if (data.type === NodeType.STORYBOARD) {
        return (
            <StoryboardNodeContent
                data={data}
                onOpen={onOpenStoryNode || (() => undefined)}
                onCancel={onCancelStoryTask || (() => undefined)}
                onRetry={onRetryStoryTask || (() => undefined)}
                onAddToTimeline={onAddStoryboardToTimeline}
            />
        );
    }

    if (data.type === NodeType.SUBJECT) {
        return <SubjectNodeContent data={data} onUpdate={onUpdate} />;
    }

    if (isAudioType) {
        return (
            <div className={`transition-all duration-200 ${!selected ? 'p-0 rounded-2xl overflow-hidden' : 'p-1'}`}>
                <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/mp4,audio/aac,audio/ogg,audio/webm"
                    className="hidden"
                    onChange={handleAudioFileChange}
                />
                <div className={`relative min-h-44 bg-[#141414] p-5 flex flex-col justify-center gap-4 ${!selected ? 'rounded-2xl' : 'rounded-xl border border-dashed border-neutral-800'}`}>
                    {data.resultUrl ? (
                        <>
                            <div className="flex items-center gap-3 text-neutral-200">
                                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
                                    <Music2 size={20} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{data.title || data.prompt || '音频素材'}</p>
                                    <p className="text-xs text-neutral-500">可作为 Seedance 音频参考</p>
                                </div>
                            </div>
                            <audio src={data.resultUrl} controls className="w-full" />
                            <button
                                onClick={() => audioInputRef.current?.click()}
                                onPointerDown={(event) => event.stopPropagation()}
                                className="self-start text-xs text-neutral-400 hover:text-white transition-colors"
                            >
                                替换音频
                            </button>
                        </>
                    ) : isLoading ? (
                        <div className="flex flex-col items-center gap-2 text-neutral-500">
                            <Loader2 size={30} className="animate-spin text-emerald-400" />
                            <span className="text-xs">正在上传音频...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-center">
                            <div className="text-neutral-700"><Music2 size={42} /></div>
                            <div>
                                <p className="text-sm font-medium text-neutral-400">上传音频</p>
                                <p className="mt-1 text-xs text-neutral-600">MP3、WAV、M4A、AAC、OGG 或 WebM</p>
                            </div>
                            <button
                                onClick={() => audioInputRef.current?.click()}
                                onPointerDown={(event) => event.stopPropagation()}
                                className="flex items-center gap-2 px-4 py-2 bg-neutral-800/80 hover:bg-neutral-700 rounded-lg text-white text-sm font-medium transition-colors"
                            >
                                <Upload size={16} />
                                选择音频
                            </button>
                            {data.errorMessage && <p className="text-xs text-red-300">{data.errorMessage}</p>}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`transition-all duration-200 ${!selected ? 'p-0 rounded-2xl overflow-hidden' : 'p-1'}`}>
            {/* Hidden File Input - Always rendered for upload functionality (image types only) */}
            {isImageType && onUpload && (
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                />
            )}

            {/* Result View - Show when successful OR when regenerating (loading with existing content) */}
            {shouldShowImageTakeGallery && (isSuccess || isLoading) && isImageType && imageTakes.length > 1 ? (
                <ImageTakeGallery
                    data={data}
                    takes={imageTakes}
                    isLoading={isLoading}
                    selected={selected}
                    elapsedSeconds={generationElapsedSeconds}
                    onUpdate={onUpdate}
                    onExpand={onExpand}
                />
            ) : (isSuccess || isLoading) && data.resultUrl ? (
                <div
                    className={`relative w-full bg-black group/image ${!selected ? '' : 'rounded-xl overflow-hidden'}`}
                    style={getAspectRatioStyle()}
                >
                    {isVideoType ? (
                        <video src={data.resultUrl} controls loop className="w-full h-full object-cover" />
                    ) : (
                        <img src={data.resultUrl} alt="Generated" className="w-full h-full object-cover pointer-events-none" />
                    )}

                    {/* Regenerating Overlay - Shows when loading with existing content */}
                    {isLoading && (
                        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/55 backdrop-blur-[3px]">
                            <div className="pointer-events-none absolute inset-x-10 top-8 h-px bg-gradient-to-r from-transparent via-cyan-200/30 to-transparent" />
                            <GenerationProgressIndicator data={data} elapsedSeconds={generationElapsedSeconds} />
                        </div>
                    )}
                </div>
            ) : data.type === NodeType.TEXT ? (
                /* Text Node - Menu or Editing Mode */
                <div className={`relative w-full bg-[#1a1a1a] rounded-2xl overflow-hidden ${selected ? 'ring-1 ring-blue-500/30' : ''}`}>
                    {data.textMode === 'editing' ? (
                        /* Editing Mode - Text Area */
                        <div className="p-4">
                            <textarea
                                value={localPrompt}
                                onChange={(e) => handleTextChange(e.target.value)}
                                onPointerDown={(e) => e.stopPropagation()}
                                onWheel={(e) => e.stopPropagation()}
                                onBlur={() => {
                                    // Ensure final value is saved on blur
                                    if (updateTimeoutRef.current) {
                                        clearTimeout(updateTimeoutRef.current);
                                    }
                                    if (localPrompt !== data.prompt) {
                                        onUpdate?.(data.id, { prompt: localPrompt });
                                    }
                                }}
                                placeholder="Write your text content here..."
                                className="w-full bg-transparent text-white text-sm resize-none outline-none placeholder:text-neutral-600"
                                style={{ minHeight: data.isPromptExpanded ? '300px' : '150px' }}
                                autoFocus
                            />
                            {/* Expand/Shrink Button */}
                            <div className="flex justify-end mt-2">
                                <button
                                    onClick={() => onUpdate?.(data.id, { isPromptExpanded: !data.isPromptExpanded })}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-neutral-500 hover:text-white hover:bg-neutral-700 rounded transition-colors"
                                    title={data.isPromptExpanded ? 'Shrink text area' : 'Expand text area'}
                                >
                                    {data.isPromptExpanded ? <Shrink size={12} /> : <Expand size={12} />}
                                    <span>{data.isPromptExpanded ? 'Shrink' : 'Expand'}</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Menu Mode - Show Options */
                        <div className="p-5 flex flex-col gap-4">
                            {/* Header */}
                            <div className="text-neutral-500 text-sm font-medium">
                                Try to:
                            </div>

                            {/* Menu Options */}
                            <div className="flex flex-col gap-1">
                                <TextNodeMenuItem
                                    icon={<Pencil size={16} />}
                                    label="Write your own content"
                                    onClick={() => onWriteContent?.(data.id)}
                                />
                                <TextNodeMenuItem
                                    icon={<Video size={16} />}
                                    label="Text to Video"
                                    onClick={() => onTextToVideo?.(data.id)}
                                />
                                <TextNodeMenuItem
                                    icon={<ImageIcon size={16} />}
                                    label="Text to Image"
                                    onClick={() => onTextToImage?.(data.id)}
                                />
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                /* Placeholder / Empty State for Image/Video */
                <div className={`relative w-full aspect-[4/3] bg-[#141414] flex flex-col items-center justify-center gap-3 overflow-hidden
            ${!selected ? 'rounded-2xl' : 'rounded-xl border border-dashed border-neutral-800'}`
                }>
                    {/* Input Image Preview for Video Nodes */}
                    {isVideoType && inputUrl && (
                        <div className="absolute inset-0 z-0">
                            <img src={inputUrl} alt="Input Frame" className="w-full h-full object-cover opacity-30 blur-sm" />
                            <div className="absolute inset-0 bg-black/40" />
                            <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-[10px] text-white font-medium flex items-center gap-1">
                                <ImageIcon size={10} />
                                Input Frame
                            </div>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="relative z-10 flex w-full flex-col items-center gap-3 px-4">
                            <div className="absolute inset-x-6 top-1/2 h-20 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-2xl" />
                            <GenerationProgressIndicator data={data} elapsedSeconds={generationElapsedSeconds} />
                        </div>
                    ) : (
                        <div className="relative z-10 flex flex-col items-center gap-3">
                            {/* Upload Button for Image Nodes (including local image models) */}
                            {isImageType && onUpload && (
                                <>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        onPointerDown={(e) => e.stopPropagation()}
                                        className="flex items-center gap-2 px-4 py-2 bg-neutral-800/80 hover:bg-neutral-700 rounded-lg text-white text-sm font-medium transition-colors"
                                    >
                                        <Upload size={16} />
                                        Upload
                                    </button>
                                </>
                            )}

                            <div className="text-neutral-700">
                                {isVideoType ? (
                                    isLocalModel ? <><Film size={40} /><HardDrive size={16} className="absolute -bottom-1 -right-1 text-purple-400" /></> : <Film size={40} />
                                ) : (
                                    isLocalModel ? <><ImageIcon size={40} /><HardDrive size={16} className="absolute -bottom-1 -right-1 text-purple-400" /></> : <ImageIcon size={40} />
                                )}
                            </div>
                            {selected && (
                                <>
                                    <div className="text-neutral-500 text-sm font-medium">
                                        {isVideoType && inputUrl
                                            ? "Ready to animate"
                                            : isVideoType
                                                ? "Waiting for input..."
                                                : isLocalModel
                                                    ? "Select a model and enter prompt"
                                                    : "Try to:"
                                        }
                                    </div>
                                    {!isVideoType && !isLocalModel && (
                                        <div className="flex flex-col gap-1 w-full px-2">
                                            <TextNodeMenuItem
                                                icon={<ImageIcon size={16} />}
                                                label="Image to Image"
                                                onClick={() => onImageToImage?.(data.id)}
                                            />
                                            <TextNodeMenuItem
                                                icon={<Film size={16} />}
                                                label="Image to Video"
                                                onClick={() => onImageToVideo?.(data.id)}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

interface TextNodeMenuItemProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
}

/**
 * Menu item component for Text node options
 */
const TextNodeMenuItem: React.FC<TextNodeMenuItemProps> = ({ icon, label, onClick }) => (
    <button
        className="flex items-center gap-3 w-full p-2.5 rounded-lg text-left text-neutral-400 hover:bg-[#252525] hover:text-white transition-colors"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClick}
    >
        <span className="text-neutral-500">{icon}</span>
        <span className="text-sm font-medium">{label}</span>
    </button>
);
