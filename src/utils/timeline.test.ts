import assert from 'node:assert/strict';
import test from 'node:test';

import * as timelineDocument from '../domain/timeline/timelineDocument.ts';

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
