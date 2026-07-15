import type {
  LegacyStoryContext,
  ScriptDocument,
  StoryboardDocument
} from './domain/storyboard/storyboardTypes.ts';

export enum NodeType {
  TEXT = '文本',
  IMAGE = '图片',
  VIDEO = '视频',
  AUDIO = '音频',
  SUBJECT = '主体',
  IMAGE_EDITOR = '图片编辑器',
  VIDEO_EDITOR = '视频编辑器',
  SCRIPT = '脚本',
  STORYBOARD = '分镜管理器',
  CAMERA_ANGLE = '镜头角度',
  // Local open-source model nodes
  LOCAL_IMAGE_MODEL = '本地图片模型',
  LOCAL_VIDEO_MODEL = '本地视频模型'
}

export enum NodeStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error'
}

export type ImageEditMode = 'prompt-edit' | 'expand';

export interface MediaTake {
  id: string;
  nodeId: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  model: string;
  createdAt: string;
  isHero: boolean;
  thumbnailUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface NodeData {
  id: string;
  type: NodeType;
  title?: string; // Custom title for the node (defaults to type if not set)
  x: number;
  y: number;
  prompt: string;
  status: NodeStatus;
  resultUrl?: string; // Image URL or Video URL
  subjectAssetId?: string; // Asset selected by a Subject node
  takes?: MediaTake[]; // Generated versions for this node; resultUrl remains the legacy hero URL
  heroTakeId?: string; // Currently selected take that downstream nodes should read
  lastFrame?: string; // For Video nodes: base64/url of the last frame to use as input for next node
  parentIds?: string[]; // For connecting lines (supports multiple inputs)
  groupId?: string; // ID of the group this node belongs to
  errorMessage?: string;
  activeTaskId?: string; // Persisted task currently allowed to update this node
  lastTaskId?: string; // Most recent terminal task, used for linked retry
  generationProgress?: number; // 0-100 task progress for canvas feedback
  scriptData?: ScriptDocument;
  storyboardData?: StoryboardDocument;

  // Text node specific
  textMode?: 'menu' | 'editing'; // For Text nodes: current mode
  linkedVideoNodeId?: string; // For Text nodes: linked video node for prompt sync

  // Video node specific
  videoMode?: 'standard' | 'frame-to-frame' | 'motion-control'; // Video generation mode
  frameInputs?: { nodeId: string; order: 'start' | 'end' }[]; // For frame-to-frame: connected image nodes
  videoModel?: string; // Video model version (e.g., 'veo-3.1', 'kling-v2-1')
  videoDuration?: number; // Video duration in seconds (e.g., 5, 6, 8, 10)
  generateAudio?: boolean; // Whether to generate native audio (Kling 2.6, Veo 3.1)
  inputUrl?: string; // Input URL for video generation (image-to-video)

  // Video Editor specific
  trimStart?: number; // Trim start time in seconds
  trimEnd?: number; // Trim end time in seconds

  // Settings
  model: string;
  imageModel?: string; // Image model version (e.g., 'gemini-pro', 'kling-v2')
  imageCount?: 1 | 2 | 4; // Requested number of image results for future batch generation
  aspectRatio: string;
  resolution: string;
  isPromptExpanded?: boolean; // Whether the prompt editing area is expanded
  resultAspectRatio?: string; // Actual aspect ratio of the generated image (e.g., '16/9')
  generationStartTime?: number; // Timestamp when generation started (for recovery race condition prevention)

  // Kling V1.5 Image Reference Settings
  klingReferenceMode?: 'subject' | 'face'; // Reference type for image-to-image
  klingFaceIntensity?: number; // Face reference intensity (0-100)
  klingSubjectIntensity?: number; // Subject reference intensity (0-100)
  detectedFaces?: { x: number; y: number; width: number; height: number }[]; // Detected face bounding boxes
  faceDetectionStatus?: 'idle' | 'loading' | 'success' | 'error'; // Face detection status

  // Image Editor state persistence
  editorElements?: Array<{
    id: string;
    type: 'arrow' | 'text';
    // Arrow properties
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    color?: string;
    lineWidth?: number;
    // Text properties
    x?: number;
    y?: number;
    text?: string;
    fontSize?: number;
    fontFamily?: string;
  }>; // Elements (arrows, text) drawn in image editor
  editorCanvasData?: string; // Base64 brush/eraser canvas data
  editorCanvasSize?: { width: number; height: number }; // Size of the canvas when elements were saved (for scaling)
  editorBackgroundUrl?: string; // Clean background image URL (without elements) for re-editing
  imageEditMode?: ImageEditMode; // Persisted AI editing intent for Image Editor nodes

  // Change Angle mode (Image nodes only)
  angleMode?: boolean; // Whether the node is in angle editing mode
  angleSettings?: {
    rotation: number;  // Horizontal rotation in degrees (-180 to 180)
    tilt: number;      // Vertical tilt in degrees (-90 to 90)
    scale: number;     // Scale factor (0 to 100)
    wideAngle: boolean; // Whether to use wide-angle lens perspective
  };

  // Local Model node specific
  localModelId?: string;        // ID of the selected local model
  localModelPath?: string;      // Absolute path to model file on disk
  localModelType?: 'diffusion' | 'controlnet' | 'lora' | 'camera-control';
  localModelArchitecture?: string; // Model architecture (e.g., 'sd15', 'sdxl', 'qwen')

  // Storyboard Generator specific
  characterReferenceUrls?: string[]; // URLs of character images for reference in generation
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  type: 'global' | 'node-connector' | 'node-options' | 'add-nodes'; // 'global' = right click on canvas, 'add-nodes' = double click
  sourceNodeId?: string; // If 'node-connector' or 'node-options', which node originated the click
  connectorSide?: 'left' | 'right';
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface SelectionBox {
  isActive: boolean;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface NodeGroup {
  id: string;
  nodeIds: string[];
  label: string;
  storyContext?: LegacyStoryContext;
}
