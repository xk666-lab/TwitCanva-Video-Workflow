import type { NodeData, NodeType } from '../types';

const TEXT = '\u6587\u672c' as NodeType;
const IMAGE = '\u56fe\u7247' as NodeType;
const VIDEO = '\u89c6\u9891' as NodeType;
const AUDIO = '\u97f3\u9891' as NodeType;
const IMAGE_EDITOR = '\u56fe\u7247\u7f16\u8f91\u5668' as NodeType;
const VIDEO_EDITOR = '\u89c6\u9891\u7f16\u8f91\u5668' as NodeType;
const SCRIPT = '\u811a\u672c' as NodeType;
const STORYBOARD = '\u5206\u955c\u7ba1\u7406\u5668' as NodeType;
const CAMERA_ANGLE = '\u955c\u5934\u89d2\u5ea6' as NodeType;
const LOCAL_IMAGE_MODEL = '\u672c\u5730\u56fe\u7247\u6a21\u578b' as NodeType;
const LOCAL_VIDEO_MODEL = '\u672c\u5730\u89c6\u9891\u6a21\u578b' as NodeType;

const NODE_TYPE_ALIASES: Record<string, NodeType> = {
  Text: TEXT,
  Image: IMAGE,
  Video: VIDEO,
  Audio: AUDIO,
  'Image Editor': IMAGE_EDITOR,
  'Video Editor': VIDEO_EDITOR,
  Script: SCRIPT,
  'Storyboard Manager': STORYBOARD,
  'Camera Angle': CAMERA_ANGLE,
  'Local Image Model': LOCAL_IMAGE_MODEL,
  'Local Video Model': LOCAL_VIDEO_MODEL,
  [TEXT]: TEXT,
  [IMAGE]: IMAGE,
  [VIDEO]: VIDEO,
  [AUDIO]: AUDIO,
  [IMAGE_EDITOR]: IMAGE_EDITOR,
  [VIDEO_EDITOR]: VIDEO_EDITOR,
  [SCRIPT]: SCRIPT,
  [STORYBOARD]: STORYBOARD,
  [CAMERA_ANGLE]: CAMERA_ANGLE,
  [LOCAL_IMAGE_MODEL]: LOCAL_IMAGE_MODEL,
  [LOCAL_VIDEO_MODEL]: LOCAL_VIDEO_MODEL,
  '\u9365\u5267\u5896': IMAGE,
  '\u7459\u55db\ue576': VIDEO
};

export function normalizeNodeType(type: unknown): NodeType {
  if (typeof type !== 'string') return type as NodeType;
  return NODE_TYPE_ALIASES[type] || type as NodeType;
}

export function normalizeWorkflowNode<T extends NodeData>(node: T): T {
  const normalizedType = normalizeNodeType(node.type);
  if (normalizedType === node.type) return node;
  return { ...node, type: normalizedType };
}
