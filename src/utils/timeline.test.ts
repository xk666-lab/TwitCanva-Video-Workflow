import assert from 'node:assert/strict';
import test from 'node:test';

import type { NodeData, NodeType } from '../types.ts';
import * as timelineDocument from '../domain/timeline/timelineDocument.ts';

const NODE_TYPES = {
  IMAGE: '图片' as NodeType,
  VIDEO: '视频' as NodeType,
  STORYBOARD: '分镜管理器' as NodeType
} as const;

const NODE_STATUSES = {
  SUCCESS: 'success' as NodeData['status'],
  LOADING: 'loading' as NodeData['status'],
  ERROR: 'error' as NodeData['status']
} as const;

function node(id: string, type: NodeType, updates: Partial<NodeData> = {}): NodeData {
  return {
    id,
    type,
    x: 0,
    y: 0,
    prompt: '',
    status: NODE_STATUSES.SUCCESS,
    model: 'test-model',
    aspectRatio: '16:9',
    resolution: '720p',
    parentIds: [],
    ...updates
  };
}

function storyboardNode(shots: NonNullable<NodeData['storyboardData']>['shots']): NodeData {
  return node('storyboard-1', NODE_TYPES.STORYBOARD, {
    storyboardData: {
      schemaVersion: 1,
      sourceScriptNodeId: 'script-1',
      shots,
      selectedImageModel: 'gpt-image-2',
      revision: 1,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z'
    }
  });
}

function shot(id: string, order: number, videoNodeId?: string): NonNullable<NodeData['storyboardData']>['shots'][number] {
  return {
    id,
    order,
    sceneNumber: order + 1,
    description: `Shot ${order + 1}`,
    cameraAngle: 'Medium shot',
    mood: 'Focused',
    status: 'video-ready',
    revision: 1,
    ...(videoNodeId ? { videoNodeId } : {})
  };
}

type StoryboardAppend = (
  document: ReturnType<typeof timelineDocument.createEmptyTimelineDocument>,
  options: {
    storyboardNodeId: string;
    nodes: NodeData[];
    idFactory?: () => string;
  }
) => {
  timeline: ReturnType<typeof timelineDocument.createEmptyTimelineDocument>;
  addedCount: number;
  duplicateCount: number;
  pendingCount: number;
  failedCount: number;
  missingCount: number;
};

function storyboardAppend(): StoryboardAppend | undefined {
  return (timelineDocument as unknown as { appendStoryboardVideosToTimeline?: StoryboardAppend })
    .appendStoryboardVideosToTimeline;
}

test('timeline clips retain source snapshots and can be reordered without changing their media URLs', () => {
  const initial = timelineDocument.createEmptyTimelineDocument();
  const withFirst = timelineDocument.appendTimelineClip(initial, {
    id: 'clip-1',
    mediaType: 'audio',
    sourceNodeId: 'audio-1',
    sourceUrl: '/library/audio/one.mp3',
    label: '第一段旁白'
  });
  const withSecond = timelineDocument.appendTimelineClip(withFirst, {
    id: 'clip-2',
    mediaType: 'audio',
    sourceNodeId: 'audio-2',
    sourceUrl: '/library/audio/two.mp3',
    label: '第二段旁白'
  });
  const moveTimelineClip = (timelineDocument as unknown as Record<string, unknown>).moveTimelineClip;

  assert.equal(typeof moveTimelineClip, 'function');
  if (typeof moveTimelineClip !== 'function') return;

  const moved = (moveTimelineClip as (document: typeof withSecond, clipId: string, direction: 'up' | 'down') => typeof withSecond)(
    withSecond,
    'clip-2',
    'up'
  );
  const clips = moved.tracks.find(track => track.id === 'audio-main')!.clips;

  assert.deepEqual(clips.map(clip => ({ id: clip.id, sourceUrl: clip.sourceUrl, order: clip.order })), [
    { id: 'clip-2', sourceUrl: '/library/audio/two.mp3', order: 0 },
    { id: 'clip-1', sourceUrl: '/library/audio/one.mp3', order: 1 }
  ]);
});

test('storyboard assembly appends completed videos by storyboard shot order with hero take snapshots', () => {
  const appendStoryboardVideosToTimeline = storyboardAppend();
  assert.equal(typeof appendStoryboardVideosToTimeline, 'function');
  if (!appendStoryboardVideosToTimeline) return;

  const firstVideo = node('video-first', NODE_TYPES.VIDEO, {
    title: 'Opening shot',
    resultUrl: '/library/videos/first-hero.mp4',
    heroTakeId: 'take-first',
    takes: [{
      id: 'take-first',
      nodeId: 'video-first',
      type: 'video',
      url: '/library/videos/first-hero.mp4',
      prompt: 'Opening',
      model: 'seedance',
      createdAt: '2026-07-15T00:00:00.000Z',
      isHero: true
    }]
  });
  const thirdVideo = node('video-third', NODE_TYPES.VIDEO, {
    title: 'Closing shot',
    resultUrl: '/library/videos/third.mp4'
  });
  const result = appendStoryboardVideosToTimeline(
    timelineDocument.createEmptyTimelineDocument(),
    {
      storyboardNodeId: 'storyboard-1',
      nodes: [
        storyboardNode([
          shot('shot-third', 2, 'video-third'),
          shot('shot-first', 0, 'video-first')
        ]),
        firstVideo,
        thirdVideo
      ],
      idFactory: (() => {
        let index = 0;
        return () => `assembled-${++index}`;
      })()
    }
  );

  const clips = result.timeline.tracks.find(track => track.id === 'video-main')!.clips;
  assert.equal(result.addedCount, 2);
  assert.deepEqual(clips.map(clip => ({
    sourceNodeId: clip.sourceNodeId,
    sourceTakeId: clip.sourceTakeId,
    sourceUrl: clip.sourceUrl,
    sourceStoryboardNodeId: clip.sourceStoryboardNodeId,
    sourceStoryboardShotId: clip.sourceStoryboardShotId
  })), [
    {
      sourceNodeId: 'video-first',
      sourceTakeId: 'take-first',
      sourceUrl: '/library/videos/first-hero.mp4',
      sourceStoryboardNodeId: 'storyboard-1',
      sourceStoryboardShotId: 'shot-first'
    },
    {
      sourceNodeId: 'video-third',
      sourceTakeId: undefined,
      sourceUrl: '/library/videos/third.mp4',
      sourceStoryboardNodeId: 'storyboard-1',
      sourceStoryboardShotId: 'shot-third'
    }
  ]);
});

test('storyboard assembly reports incomplete references without adding unusable clips', () => {
  const appendStoryboardVideosToTimeline = storyboardAppend();
  assert.equal(typeof appendStoryboardVideosToTimeline, 'function');
  if (!appendStoryboardVideosToTimeline) return;

  const result = appendStoryboardVideosToTimeline(
    timelineDocument.createEmptyTimelineDocument(),
    {
      storyboardNodeId: 'storyboard-1',
      nodes: [
        storyboardNode([
          shot('shot-pending', 0, 'video-pending'),
          shot('shot-failed', 1, 'video-failed'),
          shot('shot-missing', 2, 'video-missing')
        ]),
        node('video-pending', NODE_TYPES.VIDEO, { status: NODE_STATUSES.LOADING }),
        node('video-failed', NODE_TYPES.VIDEO, { status: NODE_STATUSES.ERROR })
      ]
    }
  );

  assert.equal(result.addedCount, 0);
  assert.equal(result.pendingCount, 1);
  assert.equal(result.failedCount, 1);
  assert.equal(result.missingCount, 1);
  assert.deepEqual(result.timeline.tracks.find(track => track.id === 'video-main')!.clips, []);
});

test('storyboard assembly rejects non-video nodes even when they have a media result', () => {
  const appendStoryboardVideosToTimeline = storyboardAppend();
  assert.equal(typeof appendStoryboardVideosToTimeline, 'function');
  if (!appendStoryboardVideosToTimeline) return;

  const result = appendStoryboardVideosToTimeline(
    timelineDocument.createEmptyTimelineDocument(),
    {
      storyboardNodeId: 'storyboard-1',
      nodes: [
        storyboardNode([shot('shot-image', 0, 'image-1')]),
        node('image-1', NODE_TYPES.IMAGE, { resultUrl: '/library/images/not-a-video.png' })
      ]
    }
  );

  assert.equal(result.addedCount, 0);
  assert.equal(result.missingCount, 1);
  assert.deepEqual(result.timeline.tracks.find(track => track.id === 'video-main')!.clips, []);
});

test('storyboard assembly is idempotent for the same storyboard shot and hero take', () => {
  const appendStoryboardVideosToTimeline = storyboardAppend();
  assert.equal(typeof appendStoryboardVideosToTimeline, 'function');
  if (!appendStoryboardVideosToTimeline) return;

  const nodes = [
    storyboardNode([shot('shot-1', 0, 'video-1')]),
    node('video-1', NODE_TYPES.VIDEO, {
      resultUrl: '/library/videos/one.mp4',
      heroTakeId: 'take-1',
      takes: [{
        id: 'take-1',
        nodeId: 'video-1',
        type: 'video',
        url: '/library/videos/one.mp4',
        prompt: 'One',
        model: 'seedance',
        createdAt: '2026-07-15T00:00:00.000Z',
        isHero: true
      }]
    })
  ];
  const first = appendStoryboardVideosToTimeline(timelineDocument.createEmptyTimelineDocument(), {
    storyboardNodeId: 'storyboard-1',
    nodes,
    idFactory: () => 'assembled-1'
  });
  const repeated = appendStoryboardVideosToTimeline(first.timeline, {
    storyboardNodeId: 'storyboard-1',
    nodes,
    idFactory: () => 'assembled-2'
  });

  assert.equal(first.addedCount, 1);
  assert.equal(repeated.addedCount, 0);
  assert.equal(repeated.duplicateCount, 1);
  assert.deepEqual(repeated.timeline.tracks.find(track => track.id === 'video-main')!.clips.map(clip => clip.id), ['assembled-1']);
});
