/**
 * TikTokImportModal.tsx
 *
 * Modal overlay for importing TikTok videos without watermark.
 * Allows users to paste a TikTok URL and download the video to the canvas.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, Download, Link2, Loader2, X } from 'lucide-react';
import { apiPost } from '../../services/apiClient';

interface TikTokImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVideoImported: (videoUrl: string, videoInfo: TikTokVideoInfo) => void;
}

export interface TikTokVideoInfo {
    title: string;
    author: string;
    duration: number;
    cover: string | null;
    trimmed: boolean;
}

type ImportStatus = 'idle' | 'loading' | 'success' | 'error';

interface TikTokImportResponse {
    videoUrl: string;
    title?: string;
    author?: string;
    duration?: number;
    cover?: string | null;
    trimmed?: boolean;
}

export const TikTokImportModal: React.FC<TikTokImportModalProps> = ({
    isOpen,
    onClose,
    onVideoImported
}) => {
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState<ImportStatus>('idle');
    const [error, setError] = useState<string | null>(null);
    const [videoInfo, setVideoInfo] = useState<TikTokVideoInfo | null>(null);
    const [importedVideoUrl, setImportedVideoUrl] = useState<string | null>(null);

    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setUrl('');
            setStatus('idle');
            setError(null);
            setVideoInfo(null);
            setImportedVideoUrl(null);
        }
    }, [isOpen]);

    const handleImport = async () => {
        if (!url.trim()) {
            setError('Please paste a TikTok URL.');
            return;
        }

        setStatus('loading');
        setError(null);

        try {
            const data = await apiPost<TikTokImportResponse>('/api/tiktok/import', {
                url: url.trim(),
                enableTrim: true
            });

            const info: TikTokVideoInfo = {
                title: data.title || 'TikTok video',
                author: data.author || 'Unknown author',
                duration: data.duration || 0,
                cover: data.cover || null,
                trimmed: Boolean(data.trimmed)
            };

            setVideoInfo(info);
            setImportedVideoUrl(data.videoUrl);
            setStatus('success');
        } catch (err: any) {
            console.error('TikTok import failed:', err);
            setError(err.message || 'Failed to import TikTok video');
            setStatus('error');
        }
    };

    const handleAddToCanvas = () => {
        if (importedVideoUrl && videoInfo) {
            onVideoImported(importedVideoUrl, videoInfo);
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && status === 'idle') {
            handleImport();
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="bg-[#121212] border border-neutral-800 rounded-2xl w-[500px] shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#ff0050] via-[#00f2ea] to-[#ff0050] flex items-center justify-center">
                            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">Import TikTok Video</h2>
                            <p className="text-xs text-neutral-400">Paste a TikTok link to save it to the canvas.</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
                    >
                        <X size={20} className="text-neutral-400" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="space-y-3">
                        <label className="text-sm font-medium text-neutral-300">
                            TikTok video link
                        </label>
                        <div className="relative">
                            <Link2 size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Paste a TikTok link here"
                                disabled={status === 'loading' || status === 'success'}
                                className="w-full bg-[#1a1a1a] border border-neutral-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-[#00f2ea] transition-colors disabled:opacity-50"
                            />
                        </div>
                        <p className="text-xs text-neutral-500">
                            Supports tiktok.com, vm.tiktok.com, and vt.tiktok.com links.
                        </p>
                    </div>

                    {error && status === 'error' && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3">
                            <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                            <div>
                                <p className="text-sm text-red-400">{error}</p>
                                <button
                                    onClick={() => {
                                        setStatus('idle');
                                        setError(null);
                                    }}
                                    className="text-xs text-red-400/70 hover:text-red-400 mt-1 underline"
                                >
                                    Try again
                                </button>
                            </div>
                        </div>
                    )}

                    {status === 'loading' && (
                        <div className="mt-6 flex flex-col items-center gap-3 py-4">
                            <Loader2 size={32} className="text-[#00f2ea] animate-spin" />
                            <p className="text-neutral-400 text-sm">Downloading video...</p>
                            <p className="text-neutral-500 text-xs">This can take a few moments.</p>
                        </div>
                    )}

                    {status === 'success' && videoInfo && importedVideoUrl && (
                        <div className="mt-6 space-y-4">
                            <div className="flex items-start gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                                <CheckCircle size={20} className="text-green-400 flex-shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-green-400 font-medium">Video imported successfully</p>
                                    <p className="text-xs text-neutral-400 mt-1 truncate" title={videoInfo.title}>
                                        {videoInfo.title}
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        By @{videoInfo.author} | {Math.round(videoInfo.duration)}s
                                        {videoInfo.trimmed && ' | Trimmed'}
                                    </p>
                                </div>
                            </div>

                            <div className="aspect-video bg-black rounded-lg overflow-hidden">
                                <video
                                    src={importedVideoUrl}
                                    className="w-full h-full object-contain"
                                    controls
                                    autoPlay
                                    muted
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-neutral-800 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-neutral-400 hover:text-white transition-colors"
                    >
                        Cancel
                    </button>

                    {status === 'success' ? (
                        <button
                            onClick={handleAddToCanvas}
                            className="flex items-center gap-2 px-6 py-2 bg-[#00f2ea] hover:bg-[#00d4d4] text-black font-medium rounded-lg transition-colors"
                        >
                            <CheckCircle size={18} />
                            Add to canvas
                        </button>
                    ) : (
                        <button
                            onClick={handleImport}
                            disabled={status === 'loading' || !url.trim()}
                            className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-[#ff0050] to-[#00f2ea] hover:opacity-90 text-white font-medium rounded-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {status === 'loading' ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Download size={18} />
                                    Import video
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
