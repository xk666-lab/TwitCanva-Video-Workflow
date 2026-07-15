import React from 'react';
import { ArrowRight, CircleDotDashed, X } from 'lucide-react';

import type { NodeData } from '../../types.ts';
import { getNodeLabel } from '../../domain/nodes/nodeRegistry.ts';
import type { ConnectionTargetChoice } from '../../domain/graph/semanticCanvas.ts';

interface ConnectionPortPickerProps {
  sourceNode: NodeData;
  sourcePortId: string;
  targetNode: NodeData;
  choices: ConnectionTargetChoice[];
  onSelect: (targetPortId: string) => void;
  onClose: () => void;
  canvasTheme: 'dark' | 'light';
}

function nodeLabel(node: NodeData): string {
  return node.title || getNodeLabel(node.type) || node.id;
}

export function ConnectionPortPicker({
  sourceNode,
  sourcePortId,
  targetNode,
  choices,
  onSelect,
  onClose,
  canvasTheme
}: ConnectionPortPickerProps) {
  const isDark = canvasTheme === 'dark';

  return (
    <aside
      className={`fixed left-3 right-3 top-[72px] z-[90] w-auto overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl sm:left-auto sm:right-6 sm:w-[300px] ${isDark ? 'border-cyan-500/30 bg-[#0a1014]/95 text-white shadow-cyan-950/50' : 'border-cyan-200 bg-white/95 text-slate-900 shadow-slate-300/60'}`}
      aria-label="选择连接用途"
    >
      <div className={`flex items-start justify-between gap-3 border-b px-4 py-3 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>连接用途</p>
          <p className="mt-1 text-sm font-semibold">选择要写入的输入端口</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`rounded-lg p-1.5 transition-colors ${isDark ? 'text-neutral-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
          aria-label="关闭端口选择"
        >
          <X size={16} />
        </button>
      </div>

      <div className={`px-4 py-3 text-xs ${isDark ? 'text-neutral-400' : 'text-slate-500'}`}>
        <div className="flex items-center gap-2 truncate">
          <span className="truncate">{nodeLabel(sourceNode)} / {sourcePortId}</span>
          <ArrowRight size={13} className="shrink-0" />
          <span className="truncate">{nodeLabel(targetNode)}</span>
        </div>
      </div>

      <div className="space-y-1 px-2 pb-2">
        {choices.map(choice => (
          <button
            key={choice.targetPort.id}
            type="button"
            onClick={() => onSelect(choice.targetPort.id)}
            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${isDark ? 'hover:bg-cyan-400/10' : 'hover:bg-cyan-50'}`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${isDark ? 'border-cyan-300/20 bg-cyan-400/10 text-cyan-200' : 'border-cyan-200 bg-cyan-50 text-cyan-700'}`}>
              <CircleDotDashed size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{choice.targetPort.label}</span>
              <span className={`mt-0.5 block truncate text-[10px] ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>
                {choice.targetPort.role || choice.targetPort.dataType}
              </span>
            </span>
            <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${isDark ? 'border-white/10 text-neutral-400 group-hover:text-cyan-200' : 'border-slate-200 text-slate-500 group-hover:text-cyan-700'}`}>
              {choice.targetPort.dataType}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}
