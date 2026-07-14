import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { NodeData } from '../types.ts';
import {
  appendTimelineClip,
  appendStoryboardVideosToTimeline,
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

export interface AddStoryboardTimelineResult extends AddTimelineClipResult {
  addedCount: number;
  duplicateCount: number;
  pendingCount: number;
  failedCount: number;
  missingCount: number;
}

function heroTakeId(node: NodeData): string | undefined {
  const take = node.takes?.find(candidate => candidate.id === node.heroTakeId)
    || node.takes?.find(candidate => candidate.isHero);
  return take?.id;
}

export function useTimeline({ nodes, timeline, setTimeline }: UseTimelineOptions) {
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

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

    const nextTimeline = appendTimelineClip(timelineRef.current, {
      id: crypto.randomUUID(),
      mediaType,
      sourceNodeId: node.id,
      sourceTakeId: heroTakeId(node),
      sourceUrl: node.resultUrl,
      label: node.title || node.prompt || (mediaType === 'audio' ? '音频片段' : '视频片段')
    });
    timelineRef.current = nextTimeline;
    setTimeline(nextTimeline);
    setIsTimelineOpen(true);
    return { valid: true };
  }, [nodes, setTimeline]);

  const addStoryboardVideosToTimeline = useCallback((storyboardNodeId: string): AddStoryboardTimelineResult => {
    const storyboardNode = nodes.find(node => node.id === storyboardNodeId);
    if (!storyboardNode?.storyboardData) {
      return {
        valid: false,
        message: '未找到可用的分镜节点。',
        addedCount: 0,
        duplicateCount: 0,
        pendingCount: 0,
        failedCount: 0,
        missingCount: 1
      };
    }

    const assembly = appendStoryboardVideosToTimeline(timelineRef.current, {
      storyboardNodeId,
      nodes
    });
    if (assembly.addedCount === 0) {
      const message = assembly.pendingCount > 0
        ? `${assembly.pendingCount} 个镜头仍在生成，完成后再加入时间线。`
        : assembly.failedCount > 0
          ? '没有可加入的视频；失败镜头可在分镜中单独重试。'
          : assembly.duplicateCount > 0
            ? '这些镜头的当前版本已经在时间线中。'
            : '没有可加入的分镜视频。';
      return { valid: false, message, ...assembly };
    }

    timelineRef.current = assembly.timeline;
    setTimeline(assembly.timeline);
    setIsTimelineOpen(true);
    const skippedCount = assembly.pendingCount + assembly.failedCount + assembly.missingCount + assembly.duplicateCount;
    return {
      valid: true,
      message: skippedCount > 0
        ? `已加入 ${assembly.addedCount} 个视频片段；另有 ${skippedCount} 个镜头暂未加入。`
        : `已加入 ${assembly.addedCount} 个视频片段。`,
      ...assembly
    };
  }, [nodes, setTimeline]);

  const moveClip = useCallback((clipId: string, direction: 'up' | 'down') => {
    const nextTimeline = moveTimelineClip(timelineRef.current, clipId, direction);
    timelineRef.current = nextTimeline;
    setTimeline(nextTimeline);
  }, [setTimeline]);

  const removeClip = useCallback((clipId: string) => {
    const nextTimeline = removeTimelineClip(timelineRef.current, clipId);
    timelineRef.current = nextTimeline;
    setTimeline(nextTimeline);
  }, [setTimeline]);

  return {
    timeline,
    isTimelineOpen,
    openTimeline: () => setIsTimelineOpen(true),
    closeTimeline: () => setIsTimelineOpen(false),
    toggleTimeline: () => setIsTimelineOpen(open => !open),
    addNodeResultToTimeline,
    addStoryboardVideosToTimeline,
    moveClip,
    removeClip
  };
}
