export const CURRENT_TIMELINE_SCHEMA_VERSION = 2;

export type TimelineMediaType = 'video' | 'audio';

export interface TimelineClip {
  id: string;
  mediaType: TimelineMediaType;
  sourceNodeId: string;
  sourceTakeId?: string;
  sourceStoryboardNodeId?: string;
  sourceStoryboardShotId?: string;
  sourceUrl: string;
  label?: string;
  order: number;
  [key: string]: unknown;
}

export interface TimelineTrack {
  id: string;
  kind: TimelineMediaType;
  name: string;
  clips: TimelineClip[];
  [key: string]: unknown;
}

export interface TimelineDocument {
  schemaVersion: number;
  tracks: TimelineTrack[];
  [key: string]: unknown;
}

export interface TimelineClipInput {
  id: string;
  mediaType: TimelineMediaType;
  sourceNodeId: string;
  sourceTakeId?: string;
  sourceStoryboardNodeId?: string;
  sourceStoryboardShotId?: string;
  sourceUrl: string;
  label?: string;
}
