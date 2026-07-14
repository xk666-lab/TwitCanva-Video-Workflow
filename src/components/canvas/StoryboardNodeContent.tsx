import React, { useState } from 'react';
import { Clapperboard, Film, Images, Loader2, RotateCcw, Square } from 'lucide-react';
import { NodeStatus, type NodeData } from '../../types';

interface StoryboardNodeContentProps {
  data: NodeData;
  onOpen: (nodeId: string) => void;
  onCancel: (nodeId: string) => void;
  onRetry: (nodeId: string) => void;
  onAddToTimeline?: (nodeId: string) => { valid: boolean; message?: string };
}

export const StoryboardNodeContent: React.FC<StoryboardNodeContentProps> = ({
  data,
  onOpen,
  onCancel,
  onRetry,
  onAddToTimeline
}) => {
  const shots = data.storyboardData?.shots || [];
  const imageCount = shots.filter(shot => shot.imageNodeId).length;
  const videoCount = shots.filter(shot => shot.videoNodeId).length;
  const isLoading = data.status === NodeStatus.LOADING;
  const [timelineMessage, setTimelineMessage] = useState<string | null>(null);

  return (
    <div className="min-h-[220px] rounded-2xl bg-[#141414] p-4 text-left text-neutral-200">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-cyan-300">
          <Clapperboard size={18} />
          <span className="text-xs font-semibold uppercase tracking-[0.16em]">Storyboard</span>
        </div>
        <span className="text-xs text-neutral-500">{shots.length} 镜头</span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-neutral-400">
        <div className="rounded-lg bg-neutral-900 px-3 py-2">图片 {imageCount}/{shots.length}</div>
        <div className="rounded-lg bg-neutral-900 px-3 py-2">视频 {videoCount}/{shots.length}</div>
      </div>

      <div className="mt-3 space-y-1">
        {shots.slice(0, 3).map(shot => (
          <p key={shot.id} className="truncate text-xs text-neutral-500">
            {shot.sceneNumber}. {shot.description}
          </p>
        ))}
        {shots.length === 0 && <p className="text-xs text-neutral-600">尚未生成镜头。</p>}
      </div>

      {data.errorMessage && <p className="mt-3 text-xs text-red-400">{data.errorMessage}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onPointerDown={event => event.stopPropagation()}
          onClick={() => onOpen(data.id)}
          className="flex-1 rounded-lg bg-cyan-500/15 px-3 py-2 text-xs text-cyan-200 transition-colors hover:bg-cyan-500/25"
        >
          <Images size={13} className="mr-1 inline" />
          打开分镜
        </button>
        {isLoading ? (
          <button
            type="button"
            onPointerDown={event => event.stopPropagation()}
            onClick={() => onCancel(data.id)}
            className="rounded-lg bg-neutral-800 px-3 py-2 text-neutral-300 transition-colors hover:bg-neutral-700"
            title="取消任务"
            aria-label="取消分镜任务"
          >
            <Square size={13} />
          </button>
        ) : data.status === NodeStatus.ERROR && data.lastTaskId ? (
          <button
            type="button"
            onPointerDown={event => event.stopPropagation()}
            onClick={() => onRetry(data.id)}
            className="rounded-lg bg-neutral-800 px-3 py-2 text-neutral-300 transition-colors hover:bg-neutral-700"
            title="重试任务"
            aria-label="重试分镜任务"
          >
            <RotateCcw size={13} />
          </button>
        ) : null}
      </div>

      {videoCount > 0 && onAddToTimeline && (
        <button
          type="button"
          onPointerDown={event => event.stopPropagation()}
          onClick={() => setTimelineMessage(onAddToTimeline(data.id).message || null)}
          className="mt-2 w-full rounded-lg bg-violet-500/15 px-3 py-2 text-xs text-violet-200 transition-colors hover:bg-violet-500/25"
        >
          <Film size={13} className="mr-1 inline" />
          加入时间线
        </button>
      )}
      {timelineMessage && <p className="mt-2 text-xs text-neutral-500">{timelineMessage}</p>}

      {isLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 size={12} className="animate-spin" />
          任务处理中
        </div>
      )}
    </div>
  );
};
