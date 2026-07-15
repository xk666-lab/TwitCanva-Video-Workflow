import React from 'react';
import {
  Aperture,
  BookOpenText,
  Camera,
  Clapperboard,
  Command,
  CornerDownLeft,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Music2,
  Search,
  SlidersHorizontal,
  Type,
  UserRound,
  Video
} from 'lucide-react';

import type { NodeType } from '../../types.ts';
import { searchNodeDefinitions } from '../../domain/nodes/nodeRegistry.ts';
import type { NodeDefinition, NodeIconKey } from '../../domain/nodes/nodeDefinition.ts';
import { moveNodeCommandPaletteSelection } from '../../utils/nodeCommandPaletteShortcut.ts';

interface NodeCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (type: NodeType) => void;
  canvasTheme: 'dark' | 'light';
}

function DefinitionIcon({ icon }: { icon: NodeIconKey }) {
  const props = { size: 16, strokeWidth: 1.8 };
  switch (icon) {
    case 'type': return <Type {...props} />;
    case 'image': return <ImageIcon {...props} />;
    case 'video': return <Video {...props} />;
    case 'audio': return <Music2 {...props} />;
    case 'image-editor': return <SlidersHorizontal {...props} />;
    case 'video-editor': return <Clapperboard {...props} />;
    case 'script': return <BookOpenText {...props} />;
    case 'storyboard': return <FileText {...props} />;
    case 'camera-angle': return <Camera {...props} />;
    case 'local-image-model': return <HardDrive {...props} />;
    case 'local-video-model': return <Aperture {...props} />;
    default: return <UserRound {...props} />;
  }
}

function CategoryLabel({ definition }: { definition: NodeDefinition }) {
  const labels: Record<NodeDefinition['category'], string> = {
    input: '输入',
    generation: '生成',
    editing: '编辑',
    story: '叙事',
    utility: '工具'
  };
  return <span className="text-[9px] font-semibold uppercase tracking-[0.16em] opacity-60">{labels[definition.category]}</span>;
}

export function NodeCommandPalette({ isOpen, onClose, onSelect, canvasTheme }: NodeCommandPaletteProps) {
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const isDark = canvasTheme === 'dark';
  const definitions = searchNodeDefinitions(query);

  React.useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  React.useEffect(() => {
    if (activeIndex >= definitions.length) setActiveIndex(Math.max(0, definitions.length - 1));
  }, [activeIndex, definitions.length]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex(index => moveNodeCommandPaletteSelection(index, definitions.length, 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex(index => moveNodeCommandPaletteSelection(index, definitions.length, -1));
      } else if (event.key === 'Enter' && definitions[activeIndex]) {
        event.preventDefault();
        onSelect(definitions[activeIndex].type);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, definitions, isOpen, onClose, onSelect]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-start justify-center bg-black/45 px-4 pt-[14vh] backdrop-blur-sm"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`w-full max-w-[620px] overflow-hidden rounded-[22px] border shadow-[0_30px_90px_rgba(0,0,0,0.45)] ${isDark ? 'border-cyan-300/20 bg-[#071015] text-white' : 'border-slate-200 bg-white text-slate-900'}`}
        role="dialog"
        aria-modal="true"
        aria-label="添加节点"
      >
        <div className={`flex items-center gap-3 border-b px-4 py-3 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isDark ? 'bg-cyan-300/10 text-cyan-200' : 'bg-cyan-50 text-cyan-700'}`}>
            <Search size={17} />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="搜索节点、用途或能力..."
            className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${isDark ? 'placeholder:text-neutral-600' : 'placeholder:text-slate-400'}`}
          />
          <span className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] ${isDark ? 'border-white/10 text-neutral-500' : 'border-slate-200 text-slate-500'}`}>
            <Command size={11} />K
          </span>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {definitions.length === 0 ? (
            <div className={`px-4 py-10 text-center text-sm ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>没有匹配的节点</div>
          ) : definitions.map((definition, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={definition.type}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onSelect(definition.type)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active
                  ? isDark ? 'bg-cyan-300/10 text-white' : 'bg-cyan-50 text-slate-900'
                  : isDark ? 'text-neutral-300 hover:bg-white/[0.04]' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${active
                  ? isDark ? 'border-cyan-300/25 bg-cyan-300/15 text-cyan-100' : 'border-cyan-200 bg-white text-cyan-700'
                  : isDark ? 'border-white/10 bg-white/[0.03] text-neutral-400' : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}>
                  <DefinitionIcon icon={definition.icon} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{definition.label}</span>
                    <CategoryLabel definition={definition} />
                  </span>
                  {definition.description && <span className={`mt-0.5 block truncate text-xs ${isDark ? 'text-neutral-500' : 'text-slate-500'}`}>{definition.description}</span>}
                </span>
                {active && <CornerDownLeft size={15} className={isDark ? 'text-cyan-200' : 'text-cyan-700'} />}
              </button>
            );
          })}
        </div>

        <footer className={`flex items-center justify-between border-t px-4 py-2.5 text-[10px] ${isDark ? 'border-white/10 text-neutral-500' : 'border-slate-200 text-slate-500'}`}>
          <span>NodeRegistry 驱动的快速添加</span>
          <span>↑ ↓ 选择 · Enter 添加 · Esc 关闭</span>
        </footer>
      </section>
    </div>
  );
}
