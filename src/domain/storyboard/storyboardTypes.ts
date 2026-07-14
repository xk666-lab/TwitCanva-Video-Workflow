export const SCRIPT_DOCUMENT_SCHEMA_VERSION = 1;
export const STORYBOARD_DOCUMENT_SCHEMA_VERSION = 1;

export interface StoryReferenceAsset {
  id: string;
  name: string;
  url: string;
  description?: string;
  category?: string;
  [key: string]: unknown;
}

export interface StoryGenerationProvenance {
  taskId: string;
  provider: string;
  model: string;
}

export interface ScriptDocument {
  schemaVersion: number;
  title: string;
  sourceText: string;
  synopsis: string;
  styleAnchor: string;
  characterDNA: Record<string, string>;
  referenceAssets: StoryReferenceAsset[];
  revision: number;
  generatedBy?: StoryGenerationProvenance;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export type StoryboardShotStatus =
  | 'draft'
  | 'ready'
  | 'image-running'
  | 'image-ready'
  | 'video-running'
  | 'video-ready'
  | 'failed';

export interface StoryboardShot {
  id: string;
  order: number;
  sceneNumber: number;
  description: string;
  cameraAngle: string;
  cameraMovement?: string;
  lighting?: string;
  mood: string;
  imagePrompt?: string;
  videoPrompt?: string;
  imageNodeId?: string;
  videoNodeId?: string;
  activeTaskId?: string;
  lastTaskId?: string;
  status: StoryboardShotStatus;
  error?: string;
  revision: number;
  [key: string]: unknown;
}

export interface StoryboardDocument {
  schemaVersion: number;
  sourceScriptNodeId: string;
  shots: StoryboardShot[];
  selectedImageModel: string;
  selectedVideoModel?: string;
  compositeImageUrl?: string | null;
  revision: number;
  generatedBy?: StoryGenerationProvenance;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface LegacyStoryContext {
  story: string;
  scripts: StoryboardShot[];
  selectedCharacters?: StoryReferenceAsset[];
  sceneCount?: number;
  styleAnchor?: string;
  characterDNA?: Record<string, string>;
  compositeImageUrl?: string | null;
  selectedImageModel?: string;
  scriptNodeId?: string;
  storyboardNodeId?: string;
  [key: string]: unknown;
}

export interface StoryboardSessionSnapshot {
  story: string;
  scripts: StoryboardShot[];
  selectedCharacters: StoryReferenceAsset[];
  sceneCount: number;
  styleAnchor: string;
  characterDNA: Record<string, string>;
  selectedImageModel: string;
  compositeImageUrl: string | null;
}

export type StoryPackageGenerationMode = 'scripts' | 'story-package';

export interface GenerateStoryPackageTaskInput {
  nodeId: string;
  scriptNodeId: string;
  storyboardNodeId: string;
  scriptRevision: number;
  storyboardRevision: number;
  generationMode: StoryPackageGenerationMode;
  sourceText: string;
  sceneCount: number;
  tone?: string;
  referenceAssets: StoryReferenceAsset[];
  selectedImageModel: string;
  scriptData: ScriptDocument;
  storyboardData: StoryboardDocument;
}
