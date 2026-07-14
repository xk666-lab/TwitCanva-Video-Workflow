import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

interface WorkflowTemplateSaveModalProps {
  isOpen: boolean;
  initialTitle: string;
  isSaving: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (title: string, description: string) => Promise<void> | void;
}

export function WorkflowTemplateSaveModal({
  isOpen,
  initialTitle,
  isSaving,
  error,
  onClose,
  onSave
}: WorkflowTemplateSaveModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle);
    setDescription('');
  }, [isOpen, initialTitle]);

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || isSaving) return;
    await onSave(title.trim(), description.trim());
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-neutral-700 bg-[#171717] p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">保存为工作流模板</h2>
            <p className="mt-1 text-sm text-neutral-400">模板会保留节点结构、端口连接与默认参数，不会复制生成结果或任务状态。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        <label className="mb-4 block text-sm font-medium text-neutral-200">
          模板名称
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            maxLength={120}
            autoFocus
            className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-blue-500"
            placeholder="例如：产品图转动态镜头"
          />
        </label>

        <label className="block text-sm font-medium text-neutral-200">
          说明（可选）
          <textarea
            value={description}
            onChange={event => setDescription(event.target.value)}
            maxLength={500}
            rows={3}
            className="mt-2 w-full resize-none rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-blue-500"
            placeholder="说明这个模板需要什么输入，以及会产生什么结果。"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!title.trim() || isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving && <Loader2 size={15} className="animate-spin" />}
            保存模板
          </button>
        </div>
      </form>
    </div>
  );
}
