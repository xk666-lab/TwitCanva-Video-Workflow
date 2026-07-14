import {
  CURRENT_TIMELINE_SCHEMA_VERSION,
  type TimelineClip,
  type TimelineClipInput,
  type TimelineDocument,
  type TimelineMediaType,
  type TimelineTrack
} from './timelineTypes.ts';

type UnknownRecord = Record<string, unknown>;

const DEFAULT_TRACKS: Array<Pick<TimelineTrack, 'id' | 'kind' | 'name'>> = [
  { id: 'video-main', kind: 'video', name: '视频轨' },
  { id: 'audio-main', kind: 'audio', name: '音频轨' }
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mediaType(value: unknown, fallback: TimelineMediaType): TimelineMediaType {
  return value === 'audio' || value === 'video' ? value : fallback;
}

function defaultTrackName(kind: TimelineMediaType): string {
  return kind === 'audio' ? '音频轨' : '视频轨';
}

function normalizeClip(
  rawClip: unknown,
  trackKind: TimelineMediaType,
  trackIndex: number,
  clipIndex: number
): TimelineClip {
  const clip = asRecord(rawClip);
  return {
    ...clip,
    id: typeof clip.id === 'string' && clip.id ? clip.id : `legacy-${trackKind}-clip-${trackIndex + 1}-${clipIndex + 1}`,
    mediaType: mediaType(clip.mediaType, trackKind),
    sourceNodeId: typeof clip.sourceNodeId === 'string' ? clip.sourceNodeId : '',
    ...(typeof clip.sourceTakeId === 'string' && clip.sourceTakeId ? { sourceTakeId: clip.sourceTakeId } : {}),
    sourceUrl: typeof clip.sourceUrl === 'string' ? clip.sourceUrl : '',
    ...(typeof clip.label === 'string' && clip.label ? { label: clip.label } : {}),
    order: finiteNumber(clip.order, clipIndex)
  } as TimelineClip;
}

function normalizeTrack(rawTrack: unknown, index: number): TimelineTrack {
  const track = asRecord(rawTrack);
  const kind = mediaType(track.kind, index === 1 ? 'audio' : 'video');
  return {
    ...track,
    id: typeof track.id === 'string' && track.id ? track.id : `legacy-${kind}-track-${index + 1}`,
    kind,
    name: typeof track.name === 'string' && track.name.trim() ? track.name : defaultTrackName(kind),
    clips: Array.isArray(track.clips)
      ? track.clips.map((clip, clipIndex) => normalizeClip(clip, kind, index, clipIndex))
      : []
  } as TimelineTrack;
}

export function createEmptyTimelineDocument(): TimelineDocument {
  return {
    schemaVersion: CURRENT_TIMELINE_SCHEMA_VERSION,
    tracks: DEFAULT_TRACKS.map(track => ({ ...track, clips: [] }))
  };
}

export function normalizeTimelineDocument(rawTimeline: unknown): TimelineDocument {
  const raw = asRecord(rawTimeline);
  const sourceVersion = typeof raw.schemaVersion === 'number'
    ? raw.schemaVersion
    : CURRENT_TIMELINE_SCHEMA_VERSION;
  const tracks = Array.isArray(raw.tracks)
    ? raw.tracks.map((track, index) => normalizeTrack(track, index))
    : createEmptyTimelineDocument().tracks;

  return {
    ...raw,
    schemaVersion: sourceVersion > CURRENT_TIMELINE_SCHEMA_VERSION
      ? sourceVersion
      : CURRENT_TIMELINE_SCHEMA_VERSION,
    tracks
  } as TimelineDocument;
}

export function appendTimelineClip(
  document: TimelineDocument,
  clip: TimelineClipInput
): TimelineDocument {
  const timeline = normalizeTimelineDocument(document);
  const targetTrack = timeline.tracks.find(track => track.kind === clip.mediaType);
  const fallbackTrack: TimelineTrack = {
    id: `${clip.mediaType}-main`,
    kind: clip.mediaType,
    name: defaultTrackName(clip.mediaType),
    clips: []
  };
  const trackId = targetTrack?.id || fallbackTrack.id;
  const nextClip: TimelineClip = {
    ...clip,
    order: Math.max(-1, ...(targetTrack?.clips || []).map(existing => existing.order)) + 1
  };

  return {
    ...timeline,
    tracks: targetTrack
      ? timeline.tracks.map(track => track.id === targetTrack.id
        ? { ...track, clips: [...track.clips, nextClip] }
        : track)
      : [...timeline.tracks, { ...fallbackTrack, id: trackId, clips: [nextClip] }]
  };
}

export function removeTimelineClip(document: TimelineDocument, clipId: string): TimelineDocument {
  const timeline = normalizeTimelineDocument(document);
  return {
    ...timeline,
    tracks: timeline.tracks.map(track => ({
      ...track,
      clips: track.clips.filter(clip => clip.id !== clipId)
    }))
  };
}

export function moveTimelineClip(
  document: TimelineDocument,
  clipId: string,
  direction: 'up' | 'down'
): TimelineDocument {
  const timeline = normalizeTimelineDocument(document);
  const trackIndex = timeline.tracks.findIndex(track => track.clips.some(clip => clip.id === clipId));
  if (trackIndex < 0) return timeline;

  const track = timeline.tracks[trackIndex];
  const clips = [...track.clips].sort((left, right) => left.order - right.order);
  const clipIndex = clips.findIndex(clip => clip.id === clipId);
  const destinationIndex = direction === 'up' ? clipIndex - 1 : clipIndex + 1;
  if (clipIndex < 0 || destinationIndex < 0 || destinationIndex >= clips.length) return timeline;

  [clips[clipIndex], clips[destinationIndex]] = [clips[destinationIndex], clips[clipIndex]];
  const reordered = clips.map((clip, index) => ({ ...clip, order: index }));
  return {
    ...timeline,
    tracks: timeline.tracks.map((candidate, index) => index === trackIndex
      ? { ...candidate, clips: reordered }
      : candidate)
  };
}
