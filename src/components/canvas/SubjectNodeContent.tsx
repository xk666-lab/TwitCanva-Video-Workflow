import React, { useEffect, useState } from 'react';
import { RefreshCw, UserRound } from 'lucide-react';

import type { SubjectAsset } from '../../domain/subjects/subjectAsset.ts';
import { listSubjectAssets } from '../../services/subjectAssetService.ts';
import type { NodeData } from '../../types';

interface SubjectNodeContentProps {
  data: NodeData;
  onUpdate?: (nodeId: string, updates: Partial<NodeData>) => void;
}

export function SubjectNodeContent({ data, onUpdate }: SubjectNodeContentProps) {
  const [assets, setAssets] = useState<SubjectAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      setIsLoading(true);
      setError(null);
      try {
        const nextAssets = await listSubjectAssets();
        if (!cancelled) setAssets(nextAssets);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load subjects.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadAssets();
    return () => { cancelled = true; };
  }, [reloadVersion]);

  const selectedAsset = assets.find(asset => asset.id === data.subjectAssetId);
  const primaryUrl = selectedAsset?.url || selectedAsset?.referenceImages[0];

  return (
    <div
      className="w-full min-h-[230px] bg-[#141414] rounded-2xl p-4 flex flex-col gap-3"
      onPointerDown={event => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <UserRound size={16} className="text-amber-300" />
          <span>主体参考</span>
        </div>
        <button
          type="button"
          onClick={() => setReloadVersion(version => version + 1)}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          title="刷新主体列表"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <select
        value={data.subjectAssetId || ''}
        onChange={event => onUpdate?.(data.id, {
          subjectAssetId: event.target.value || undefined
        })}
        disabled={isLoading}
        className="w-full bg-[#1d1d1d] border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-amber-400 disabled:opacity-60"
      >
        <option value="">选择已保存的主体</option>
        {assets.map(asset => (
          <option key={asset.id} value={asset.id}>{asset.name}</option>
        ))}
      </select>

      {selectedAsset && primaryUrl ? (
        <div className="flex gap-3 rounded-xl border border-neutral-800 bg-black/30 p-3">
          <img
            src={primaryUrl}
            alt={selectedAsset.name}
            className="h-20 w-16 rounded-lg object-cover bg-neutral-900"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{selectedAsset.name}</p>
            <p className="mt-1 line-clamp-3 text-xs text-neutral-400">
              {selectedAsset.description || '此主体会作为稳定参考传入连接的生成节点。'}
            </p>
            <p className="mt-2 text-[11px] text-neutral-500">
              {selectedAsset.referenceImages.length} 张参考图
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-neutral-800 px-4 text-center text-xs text-neutral-500">
          {error || (isLoading ? '正在加载主体资产...' : '从已保存的主体资产中选择一个参考。')}
        </div>
      )}
    </div>
  );
}
