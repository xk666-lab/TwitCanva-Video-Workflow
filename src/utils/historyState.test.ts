import assert from 'node:assert/strict';
import test from 'node:test';

import * as history from '../hooks/useHistory.ts';

type HistoryStateComparator = (left: unknown, right: unknown) => boolean;

function comparator(): HistoryStateComparator | undefined {
  return (history as unknown as { areCanvasHistoryStatesEqual?: HistoryStateComparator })
    .areCanvasHistoryStatesEqual;
}

test('history treats a rehydrated workflow snapshot with equal content as already applied', () => {
  const areCanvasHistoryStatesEqual = comparator();
  assert.equal(typeof areCanvasHistoryStatesEqual, 'function');
  if (!areCanvasHistoryStatesEqual) return;

  const current = {
    nodes: [{ id: 'storyboard-1', parentIds: [] }],
    edges: [],
    groups: [],
    timeline: {
      schemaVersion: 2,
      tracks: [{ id: 'video-main', kind: 'video', name: 'Video', clips: [] }]
    }
  };

  assert.equal(areCanvasHistoryStatesEqual(current, structuredClone(current)), true);
});

test('history detects a timeline change so undo and redo still have work to apply', () => {
  const areCanvasHistoryStatesEqual = comparator();
  assert.equal(typeof areCanvasHistoryStatesEqual, 'function');
  if (!areCanvasHistoryStatesEqual) return;

  const current = {
    nodes: [],
    edges: [],
    groups: [],
    timeline: {
      schemaVersion: 2,
      tracks: [{ id: 'video-main', kind: 'video', name: 'Video', clips: [] }]
    }
  };
  const historical = structuredClone(current);
  historical.timeline.tracks[0].clips.push({ id: 'clip-1', sourceUrl: '/library/videos/one.mp4' });

  assert.equal(areCanvasHistoryStatesEqual(current, historical), false);
});
