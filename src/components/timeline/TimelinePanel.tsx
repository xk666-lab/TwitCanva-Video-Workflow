import { ChevronDown, ChevronUp, Film, ListMusic, Trash2, X } from 'lucide-react';

import type { TimelineDocument, TimelineTrack } from '../../domain/timeline/timelineTypes.ts';

interface TimelinePanelProps {
  isOpen: boolean;
  timeline: TimelineDocument;
  onClose: () => void;
  onMoveClip: (clipId: string, direction: 'up' | 'down') => void;
  onRemoveClip: (clipId: string) => void;
  canvasTheme: 'dark' | 'light';
}

function TrackIcon({ track }: { track: TimelineTrack }) {
  return track.kind === 'audio'
    ? <ListMusic size={15} />
    : <Film size={15} />;
}

export function TimelinePanel({
  isOpen,
  timeline,
  onClose,
  onMoveClip,
  onRemoveClip,
  canvasTheme
}: TimelinePanelProps) {
  if (!isOpen) return null;
  const isDark = canvasTheme === 'dark';

  return (
    <aside className={`fixed bottom-4 left-20 right-4 z-[80] max-h-[320px] overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl ${isDark ? 'border-neutral-700 bg-[#121212]/95 text-white' : 'border-neutral-200 bg-white/95 text-neutral-900'}`}>
      <header className={`flex items-center justify-between border-b px-5 py-3 ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`}>
        <div>
          <h2 className="text-sm font-semibold">时间线</h2>
          <p className="mt-0.5 text-xs text-neutral-500">保留音频/视频来源快照，当前不执行混音或导出。</p>
        </div>
        <button
          onClick={onClose}
          className={`rounded-lg p-2 transition-colors ${isDark ? 'text-neutral-400 hover:bg-neutral-800 hover:text-white' : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'}`}
          aria-label="关闭时间线"
        >
          <X size={18} />
        </button>
      </header>

      <div className="max-h-[245px] space-y-3 overflow-y-auto p-4">
        {timeline.tracks.map(track => {
          const clips = [...track.clips].sort((left, right) => left.order - right.order);
          return (
            <section key={track.id} className={`rounded-xl border p-3 ${isDark ? 'border-neutral-800 bg-black/20' : 'border-neutral-200 bg-neutral-50'}`}>
              <div className={`mb-2 flex items-center gap-2 text-xs font-medium ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}>
                <TrackIcon track={track} />
                {track.name}
              </div>
              {clips.length === 0 ? (
                <p className={`py-2 text-xs ${isDark ? 'text-neutral-600' : 'text-neutral-400'}`}>从音频或视频节点的结果工具栏添加片段。</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {clips.map((clip, index) => (
                    <article key={clip.id} className={`min-w-52 rounded-lg border p-2.5 ${isDark ? 'border-neutral-700 bg-neutral-900' : 'border-neutral-200 bg-white'}`}>
                      <div className="flex items-start gap-2">
                        <TrackIcon track={track} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium">{clip.label || clip.sourceUrl}</p>
                          <p className={`mt-1 truncate text-[10px] ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>{clip.sourceUrl}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-[10px] ${isDark ? 'text-neutral-500' : 'text-neutral-400'}`}>#{index + 1}</span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onMoveClip(clip.id, 'up')}
                            disabled={index === 0}
                            className={`rounded p-1 ${isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} disabled:cursor-not-allowed disabled:opacity-30`}
                            aria-label="片段前移"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => onMoveClip(clip.id, 'down')}
                            disabled={index === clips.length - 1}
                            className={`rounded p-1 ${isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'} disabled:cursor-not-allowed disabled:opacity-30`}
                            aria-label="片段后移"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            onClick={() => onRemoveClip(clip.id)}
                            className="rounded p-1 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            aria-label="移除片段"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </aside>
  );
}
