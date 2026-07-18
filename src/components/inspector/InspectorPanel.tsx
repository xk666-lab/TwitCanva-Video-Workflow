import React from 'react';
import {
  Activity,
  ArrowRight,
  DatabaseZap,
  GitFork,
  Image as ImageIcon,
  Link2,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react';

import type { NodeData } from '../../types.ts';
import type { CanvasEdge } from '../../domain/graph/graphTypes.ts';
import {
  getEdgeInspectorData,
  getNodeInspectorData
} from '../../domain/graph/semanticCanvas.ts';

interface InspectorPanelProps {
  node?: NodeData;
  edge?: CanvasEdge;
  nodes: NodeData[];
  edges: CanvasEdge[];
  onClose: () => void;
  onRemoveEdge: (edgeId: string) => void;
  onRetryNode?: (nodeId: string) => void | Promise<void>;
  canvasTheme: 'dark' | 'light';
}

function DataTypePill({ value, isDark }: { value: string; isDark: boolean }) {
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${isDark ? 'border-cyan-300/20 bg-cyan-300/5 text-cyan-200' : 'border-cyan-200 bg-cyan-50 text-cyan-700'}`}>
      {value}
    </span>
  );
}

function SectionTitle({ icon, children, isDark }: { icon: React.ReactNode; children: React.ReactNode; isDark: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>
      {icon}
      {children}
    </div>
  );
}

export function InspectorPanel({
  node,
  edge,
  nodes,
  edges,
  onClose,
  onRemoveEdge,
  onRetryNode,
  canvasTheme
}: InspectorPanelProps) {
  if (!node && !edge) return null;

  const isDark = canvasTheme === 'dark';
  const panelClassName = isDark
    ? 'border-white/10 bg-[#080d10]/95 text-white shadow-black/50'
    : 'border-slate-200 bg-white/95 text-slate-900 shadow-slate-300/50';
  const mutedClassName = isDark ? 'text-neutral-500' : 'text-slate-500';

  const nodeData = node ? getNodeInspectorData(node, nodes, edges) : undefined;
  const edgeData = edge ? getEdgeInspectorData(edge, nodes) : undefined;

  return (
    <aside
      className={`fixed bottom-3 left-3 right-3 top-[72px] z-[80] flex w-auto flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl sm:bottom-6 sm:left-auto sm:right-6 sm:w-[344px] ${panelClassName}`}
      aria-label="节点与连接检查器"
    >
      <header className={`flex items-start justify-between gap-3 border-b px-4 py-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className="min-w-0">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>
            {edgeData ? 'Edge Inspector' : 'Node Inspector'}
          </p>
          <h2 className="mt-1 truncate text-sm font-semibold">
            {edgeData ? `${edgeData.source.nodeLabel} → ${edgeData.target.nodeLabel}` : nodeData?.nodeLabel}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`rounded-lg p-1.5 transition-colors ${isDark ? 'text-neutral-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}
          aria-label="关闭检查器"
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {nodeData && (
          <>
            <section className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.025]' : 'border-slate-200 bg-slate-50/70'}`}>
              <SectionTitle icon={<Activity size={13} />} isDark={isDark}>运行状态</SectionTitle>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className={mutedClassName}>活动任务</p>
                  <p className="mt-1 truncate font-mono text-[10px]">{nodeData.activeTaskId || '无'}</p>
                </div>
                <div>
                  <p className={mutedClassName}>最近任务</p>
                  <p className="mt-1 truncate font-mono text-[10px]">{nodeData.lastTaskId || '无'}</p>
                </div>
              </div>
              {nodeData.generationProgressMessage && (
                <p className={`mt-3 truncate rounded-lg border px-2.5 py-2 text-xs ${isDark ? 'border-cyan-300/20 bg-cyan-300/10 text-cyan-100' : 'border-cyan-200 bg-cyan-50 text-cyan-700'}`} title={nodeData.generationProgressMessage}>
                  {nodeData.generationProgressMessage}
                </p>
              )}
              {nodeData.errorMessage && (
                <p className={`mt-3 rounded-lg border px-2.5 py-2 text-xs ${isDark ? 'border-red-400/20 bg-red-400/10 text-red-200' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  {nodeData.errorMessage}
                </p>
              )}
              {nodeData.lastTaskId && !nodeData.activeTaskId && onRetryNode && (
                <button
                  type="button"
                  onClick={() => void onRetryNode(nodeData.nodeId)}
                  className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${isDark ? 'border-cyan-300/25 bg-cyan-300/10 text-cyan-200 hover:bg-cyan-300/15' : 'border-cyan-200 bg-cyan-50 text-cyan-700 hover:bg-cyan-100'}`}
                >
                  <RefreshCw size={12} />
                  重试最近任务
                </button>
              )}
            </section>

            <section>
              <SectionTitle icon={<GitFork size={13} />} isDark={isDark}>输入端口</SectionTitle>
              <div className="mt-2 space-y-2">
                {nodeData.inputs.map(input => (
                  <div key={input.portId} className={`rounded-xl border p-2.5 ${isDark ? 'border-white/10 bg-white/[0.025]' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{input.label}</span>
                      <DataTypePill value={input.dataType} isDark={isDark} />
                    </div>
                    {input.connections.length === 0 ? (
                      <p className={`mt-1.5 text-[10px] ${mutedClassName}`}>暂无连接</p>
                    ) : (
                      <div className="mt-2 space-y-1">
                        {input.connections.map(connection => (
                          <div key={connection.edgeId} className={`flex items-center gap-1.5 truncate text-[10px] ${isDark ? 'text-neutral-300' : 'text-slate-600'}`}>
                            <Link2 size={11} className="shrink-0 text-cyan-400" />
                            <span className="truncate">{connection.nodeLabel}</span>
                            <span className={mutedClassName}>/ {connection.portLabel}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <SectionTitle icon={<DatabaseZap size={13} />} isDark={isDark}>输出端口</SectionTitle>
              <div className="mt-2 space-y-2">
                {nodeData.outputs.map(output => (
                  <div key={output.portId} className={`rounded-xl border p-2.5 ${isDark ? 'border-white/10 bg-white/[0.025]' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{output.label}</span>
                      <DataTypePill value={output.dataType} isDark={isDark} />
                    </div>
                    <p className={`mt-1.5 text-[10px] ${mutedClassName}`}>{output.connections.length} 条下游连接</p>
                  </div>
                ))}
              </div>
            </section>

            {nodeData.heroTake && (
              <section>
                <SectionTitle icon={<ImageIcon size={13} />} isDark={isDark}>Hero Take</SectionTitle>
                <div className={`mt-2 overflow-hidden rounded-xl border ${isDark ? 'border-cyan-300/20 bg-cyan-300/5' : 'border-cyan-200 bg-cyan-50/60'}`}>
                  {nodeData.heroTake.type === 'video' ? (
                    <video
                      src={nodeData.heroTake.url}
                      poster={nodeData.heroTake.thumbnailUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="h-28 w-full bg-black object-cover"
                    />
                  ) : (
                    <img
                      src={nodeData.heroTake.url}
                      alt="当前 Hero Take"
                      className="h-28 w-full object-cover"
                    />
                  )}
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className={`truncate font-mono text-[10px] ${mutedClassName}`}>{nodeData.heroTake.id}</span>
                    <span className={`text-[10px] font-semibold ${isDark ? 'text-cyan-200' : 'text-cyan-700'}`}>当前下游版本</span>
                  </div>
                </div>
              </section>
            )}
          </>
        )}

        {edgeData && (
          <section className="space-y-4">
            <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.025]' : 'border-slate-200 bg-slate-50/70'}`}>
              <SectionTitle icon={<Link2 size={13} />} isDark={isDark}>数据映射</SectionTitle>
              <div className="mt-3 flex items-center gap-2">
                <DataTypePill value={edgeData.dataType} isDark={isDark} />
                {edgeData.order !== undefined && <span className={`text-[10px] ${mutedClassName}`}>顺序 {edgeData.order + 1}</span>}
              </div>
            </div>

            <div className={`space-y-2 rounded-xl border p-3 ${isDark ? 'border-white/10 bg-white/[0.025]' : 'border-slate-200 bg-slate-50/70'}`}>
              <div>
                <p className={`text-[10px] ${mutedClassName}`}>来源</p>
                <p className="mt-1 text-sm font-medium">{edgeData.source.nodeLabel}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <p className={`text-xs ${mutedClassName}`}>{edgeData.source.portLabel}</p>
                  {edgeData.source.role && (
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${isDark ? 'bg-white/[0.06] text-neutral-400' : 'bg-slate-200/70 text-slate-500'}`}>
                      {edgeData.source.role}
                    </span>
                  )}
                </div>
              </div>
              <div className={`flex items-center gap-2 text-xs ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>
                <span className={`h-px flex-1 ${isDark ? 'bg-cyan-300/30' : 'bg-cyan-300'}`} />
                <ArrowRight size={14} />
                <span className={`h-px flex-1 ${isDark ? 'bg-cyan-300/30' : 'bg-cyan-300'}`} />
              </div>
              <div>
                <p className={`text-[10px] ${mutedClassName}`}>目标</p>
                <p className="mt-1 text-sm font-medium">{edgeData.target.nodeLabel}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  <p className={`text-xs ${mutedClassName}`}>{edgeData.target.portLabel}</p>
                  {edgeData.target.role && (
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] ${isDark ? 'bg-white/[0.06] text-neutral-400' : 'bg-slate-200/70 text-slate-500'}`}>
                      {edgeData.target.role}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onRemoveEdge(edgeData.id)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-colors ${isDark ? 'border-red-400/30 bg-red-400/10 text-red-200 hover:bg-red-400/20' : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'}`}
            >
              <Trash2 size={13} />
              删除连接
            </button>
          </section>
        )}
      </div>

      <footer className={`flex items-center gap-2 border-t px-4 py-3 text-[10px] ${isDark ? 'border-white/10 text-neutral-500' : 'border-slate-200 text-slate-500'}`}>
        <RefreshCw size={12} />
        该面板读取当前画布状态，不会直接调用模型服务。
      </footer>
    </aside>
  );
}
