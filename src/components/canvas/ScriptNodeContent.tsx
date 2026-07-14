import React from 'react';
import { FileText, Loader2, RotateCcw, Square, WandSparkles } from 'lucide-react';
import { NodeStatus, type NodeData } from '../../types';

interface ScriptNodeContentProps {
  data: NodeData;
  onOpen: (nodeId: string) => void;
  onCancel: (nodeId: string) => void;
  onRetry: (nodeId: string) => void;
}

export const ScriptNodeContent: React.FC<ScriptNodeContentProps> = ({
  data,
  onOpen,
  onCancel,
  onRetry
}) => {
  const document = data.scriptData;
  const isLoading = data.status === NodeStatus.LOADING;

  return (
    <div className="min-h-[190px] rounded-2xl bg-[#141414] p-4 text-left text-neutral-200">
      <div className="flex items-center gap-2 text-amber-300">
        <FileText size={18} />
        <span className="text-xs font-semibold uppercase tracking-[0.16em]">Script</span>
      </div>

      <p className="mt-3 line-clamp-3 text-sm">
        {document?.sourceText || '输入故事，创建可持久化脚本。'}
      </p>
      {document?.synopsis && document.synopsis !== document.sourceText && (
        <p className="mt-2 line-clamp-2 text-xs text-neutral-500">{document.synopsis}</p>
      )}
      {data.errorMessage && <p className="mt-3 text-xs text-red-400">{data.errorMessage}</p>}

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onPointerDown={event => event.stopPropagation()}
          onClick={() => onOpen(data.id)}
          className="flex-1 rounded-lg bg-amber-500/15 px-3 py-2 text-xs text-amber-200 transition-colors hover:bg-amber-500/25"
        >
          <WandSparkles size={13} className="mr-1 inline" />
          编辑脚本
        </button>
        {isLoading ? (
          <button
            type="button"
            onPointerDown={event => event.stopPropagation()}
            onClick={() => onCancel(data.id)}
            className="rounded-lg bg-neutral-800 px-3 py-2 text-neutral-300 transition-colors hover:bg-neutral-700"
            title="取消任务"
            aria-label="取消脚本任务"
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
            aria-label="重试脚本任务"
          >
            <RotateCcw size={13} />
          </button>
        ) : null}
      </div>

      {isLoading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 size={12} className="animate-spin" />
          任务处理中
        </div>
      )}
    </div>
  );
};
