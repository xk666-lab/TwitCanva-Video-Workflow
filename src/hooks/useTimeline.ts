import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';

import type { NodeData } from '../types.ts';
import {
  appendTimelineClip,
  moveTimelineClip,
  removeTimelineClip
} from '../domain/timeline/timelineDocument.ts';
import type { TimelineDocument } from '../domain/timeline/timelineTypes.ts';

interface UseTimelineOptions {
  nodes: NodeData[];
  timeline: TimelineDocument;
  setTimeline: Dispatch<SetStateAction<TimelineDocument>>;
}

export interface AddTimelineClipResult {
  valid: boolean;
  message?: string;
}

function heroTakeId(node: NodeData): string | undefined {
  const take = node.takes?.find(candidate => candidate.id === node.heroTakeId)
    || node.takes?.find(candidate => candidate.isHero);
  return take?.id;
}

export function useTimeline({ nodes, timeline, setTimeline }: UseTimelineOptions) {
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);

  const addNodeResultToTimeline = useCallback((nodeId: string): AddTimelineClipResult => {
    const node = nodes.find(candidate => candidate.id === nodeId);
    if (!node?.resultUrl) {
      return { valid: false, message: '请先上传或生成可用的音频/视频结果。' };
    }

    const mediaType = node.type === '音频'
      ? 'audio'
      : node.type === '视频'
        ? 'video'
        : undefined;
    if (!mediaType) {
      return { valid: false, message: '当前只有音频和视频结果可以加入时间线。' };
    }

    setTimeline(current => appendTimelineClip(current, {
      id: crypto.randomUUID(),
      mediaType,
      sourceNodeId: node.id,
      sourceTakeId: heroTakeId(node),
      sourceUrl: node.resultUrl,
      label: node.title || node.prompt || (mediaType === 'audio' ? '音频片段' : '视频片段')
    }));
    setIsTimelineOpen(true);
    return { valid: true };
  }, [nodes, setTimeline]);

  const moveClip = useCallback((clipId: string, direction: 'up' | 'down') => {
    setTimeline(current => moveTimelineClip(current, clipId, direction));
  }, [setTimeline]);

  const removeClip = useCallback((clipId: string) => {
    setTimeline(current => removeTimelineClip(current, clipId));
  }, [setTimeline]);

  return {
    timeline,
    isTimelineOpen,
    openTimeline: () => setIsTimelineOpen(true),
    closeTimeline: () => setIsTimelineOpen(false),
    toggleTimeline: () => setIsTimelineOpen(open => !open),
    addNodeResultToTimeline,
    moveClip,
    removeClip
  };
}
