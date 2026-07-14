import {
  SCRIPT_DOCUMENT_SCHEMA_VERSION,
  STORYBOARD_DOCUMENT_SCHEMA_VERSION,
  type LegacyStoryContext,
  type ScriptDocument,
  type StoryReferenceAsset,
  type StoryboardDocument,
  type StoryboardShot,
  type StoryboardShotStatus,
  type StoryboardSessionSnapshot
} from './storyboardTypes.ts';

type UnknownRecord = Record<string, unknown>;

const SHOT_STATUSES = new Set<StoryboardShotStatus>([
  'draft',
  'ready',
  'image-running',
  'image-ready',
  'video-running',
  'video-ready',
  'failed'
]);

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeReferenceAsset(value: unknown, index: number): StoryReferenceAsset {
  const asset = asRecord(value);
  const { subjectAssetId, ...assetWithoutSubjectAssetId } = asset;
  return {
    ...assetWithoutSubjectAssetId,
    id: stringValue(asset.id, `legacy-reference-${index + 1}`),
    name: stringValue(asset.name, `Reference ${index + 1}`),
    url: stringValue(asset.url),
    ...(typeof subjectAssetId === 'string' && subjectAssetId.trim()
      ? { subjectAssetId: subjectAssetId.trim() }
      : {}),
    ...(typeof asset.description === 'string' ? { description: asset.description } : {}),
    ...(typeof asset.category === 'string' ? { category: asset.category } : {})
  };
}

export function createEmptyScriptDocument(options: {
  sourceText?: string;
  title?: string;
  now?: string;
} = {}): ScriptDocument {
  const now = options.now || new Date().toISOString();
  return {
    schemaVersion: SCRIPT_DOCUMENT_SCHEMA_VERSION,
    title: options.title || '未命名脚本',
    sourceText: options.sourceText || '',
    synopsis: '',
    styleAnchor: '',
    characterDNA: {},
    referenceAssets: [],
    revision: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function createEmptyStoryboardDocument(options: {
  sourceScriptNodeId?: string;
  selectedImageModel?: string;
  now?: string;
} = {}): StoryboardDocument {
  const now = options.now || new Date().toISOString();
  return {
    schemaVersion: STORYBOARD_DOCUMENT_SCHEMA_VERSION,
    sourceScriptNodeId: options.sourceScriptNodeId || '',
    shots: [],
    selectedImageModel: options.selectedImageModel || 'gpt-image-2',
    revision: 0,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeScriptDocument(
  value: unknown,
  options: { now?: string } = {}
): ScriptDocument {
  const raw = asRecord(value);
  const defaults = createEmptyScriptDocument({ now: options.now });
  const dna = asRecord(raw.characterDNA);
  return {
    ...raw,
    schemaVersion: numberValue(raw.schemaVersion, SCRIPT_DOCUMENT_SCHEMA_VERSION),
    title: stringValue(raw.title, defaults.title),
    sourceText: stringValue(raw.sourceText),
    synopsis: stringValue(raw.synopsis),
    styleAnchor: stringValue(raw.styleAnchor),
    characterDNA: Object.fromEntries(
      Object.entries(dna).map(([key, item]) => [key, stringValue(item)])
    ),
    referenceAssets: Array.isArray(raw.referenceAssets)
      ? raw.referenceAssets.map(normalizeReferenceAsset)
      : [],
    revision: Math.max(0, Math.trunc(numberValue(raw.revision, 0))),
    ...(raw.generatedBy ? { generatedBy: { ...asRecord(raw.generatedBy) } as unknown as ScriptDocument['generatedBy'] } : {}),
    createdAt: stringValue(raw.createdAt, defaults.createdAt),
    updatedAt: stringValue(raw.updatedAt, defaults.updatedAt)
  };
}

export function normalizeStoryboardShot(
  value: unknown,
  index: number,
  ownerId: string
): StoryboardShot {
  const raw = asRecord(value);
  const status = SHOT_STATUSES.has(raw.status as StoryboardShotStatus)
    ? raw.status as StoryboardShotStatus
    : 'draft';
  return {
    ...raw,
    id: stringValue(raw.id, `legacy-shot-${ownerId}-${index + 1}`),
    order: index,
    sceneNumber: Math.max(1, Math.trunc(numberValue(raw.sceneNumber, index + 1))),
    description: stringValue(raw.description),
    cameraAngle: stringValue(raw.cameraAngle, 'Medium shot'),
    ...(typeof raw.cameraMovement === 'string' ? { cameraMovement: raw.cameraMovement } : {}),
    ...(typeof raw.lighting === 'string' ? { lighting: raw.lighting } : {}),
    mood: stringValue(raw.mood),
    ...(typeof raw.imagePrompt === 'string' ? { imagePrompt: raw.imagePrompt } : {}),
    ...(typeof raw.videoPrompt === 'string' ? { videoPrompt: raw.videoPrompt } : {}),
    ...(typeof raw.imageNodeId === 'string' ? { imageNodeId: raw.imageNodeId } : {}),
    ...(typeof raw.videoNodeId === 'string' ? { videoNodeId: raw.videoNodeId } : {}),
    ...(typeof raw.activeTaskId === 'string' ? { activeTaskId: raw.activeTaskId } : {}),
    ...(typeof raw.lastTaskId === 'string' ? { lastTaskId: raw.lastTaskId } : {}),
    status,
    ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
    revision: Math.max(0, Math.trunc(numberValue(raw.revision, 0)))
  };
}

export function normalizeStoryboardDocument(
  value: unknown,
  options: { ownerId: string; now?: string }
): StoryboardDocument {
  const raw = asRecord(value);
  const defaults = createEmptyStoryboardDocument({ now: options.now });
  return {
    ...raw,
    schemaVersion: numberValue(raw.schemaVersion, STORYBOARD_DOCUMENT_SCHEMA_VERSION),
    sourceScriptNodeId: stringValue(raw.sourceScriptNodeId),
    shots: Array.isArray(raw.shots)
      ? raw.shots.map((shot, index) => normalizeStoryboardShot(shot, index, options.ownerId))
      : [],
    selectedImageModel: stringValue(raw.selectedImageModel, defaults.selectedImageModel),
    ...(typeof raw.selectedVideoModel === 'string' ? { selectedVideoModel: raw.selectedVideoModel } : {}),
    ...(raw.compositeImageUrl === null || typeof raw.compositeImageUrl === 'string'
      ? { compositeImageUrl: raw.compositeImageUrl as string | null }
      : {}),
    revision: Math.max(0, Math.trunc(numberValue(raw.revision, 0))),
    ...(raw.generatedBy ? { generatedBy: { ...asRecord(raw.generatedBy) } as unknown as StoryboardDocument['generatedBy'] } : {}),
    createdAt: stringValue(raw.createdAt, defaults.createdAt),
    updatedAt: stringValue(raw.updatedAt, defaults.updatedAt)
  };
}

export function normalizeLegacyStoryContext(
  value: unknown,
  options: { ownerId: string }
): LegacyStoryContext {
  const raw = asRecord(value);
  return {
    ...raw,
    story: stringValue(raw.story),
    scripts: Array.isArray(raw.scripts)
      ? raw.scripts.map((shot, index) => normalizeStoryboardShot(shot, index, options.ownerId))
      : [],
    ...(Array.isArray(raw.selectedCharacters)
      ? { selectedCharacters: raw.selectedCharacters.map(normalizeReferenceAsset) }
      : {}),
    ...(typeof raw.sceneCount === 'number' ? { sceneCount: raw.sceneCount } : {}),
    ...(typeof raw.styleAnchor === 'string' ? { styleAnchor: raw.styleAnchor } : {}),
    ...(raw.characterDNA ? {
      characterDNA: Object.fromEntries(
        Object.entries(asRecord(raw.characterDNA)).map(([key, item]) => [key, stringValue(item)])
      )
    } : {}),
    ...(raw.compositeImageUrl === null || typeof raw.compositeImageUrl === 'string'
      ? { compositeImageUrl: raw.compositeImageUrl as string | null }
      : {}),
    ...(typeof raw.selectedImageModel === 'string' ? { selectedImageModel: raw.selectedImageModel } : {}),
    ...(typeof raw.scriptNodeId === 'string' ? { scriptNodeId: raw.scriptNodeId } : {}),
    ...(typeof raw.storyboardNodeId === 'string' ? { storyboardNodeId: raw.storyboardNodeId } : {})
  };
}

export function sessionFromLegacyStoryContext(context: LegacyStoryContext): StoryboardSessionSnapshot {
  return {
    story: context.story,
    scripts: context.scripts.map(shot => ({ ...shot })),
    selectedCharacters: (context.selectedCharacters || []).map(asset => ({ ...asset })),
    sceneCount: context.sceneCount || Math.max(1, context.scripts.length || 3),
    styleAnchor: context.styleAnchor || '',
    characterDNA: { ...(context.characterDNA || {}) },
    selectedImageModel: context.selectedImageModel || 'gpt-image-2',
    compositeImageUrl: context.compositeImageUrl || null
  };
}

export function documentsFromSession(options: {
  session: StoryboardSessionSnapshot;
  scriptNodeId: string;
  storyboardNodeId: string;
  now: string;
}): { scriptData: ScriptDocument; storyboardData: StoryboardDocument } {
  const { session, scriptNodeId, storyboardNodeId, now } = options;
  return {
    scriptData: {
      ...createEmptyScriptDocument({ sourceText: session.story, now }),
      synopsis: session.story,
      styleAnchor: session.styleAnchor,
      characterDNA: { ...session.characterDNA },
      referenceAssets: session.selectedCharacters.map(asset => ({ ...asset }))
    },
    storyboardData: {
      ...createEmptyStoryboardDocument({
        sourceScriptNodeId: scriptNodeId,
        selectedImageModel: session.selectedImageModel,
        now
      }),
      shots: session.scripts.map((shot, index) => normalizeStoryboardShot(shot, index, storyboardNodeId)),
      compositeImageUrl: session.compositeImageUrl
    }
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function sessionFromDocuments(
  scriptData: ScriptDocument,
  storyboardData: StoryboardDocument
): StoryboardSessionSnapshot {
  return {
    story: scriptData.sourceText || scriptData.synopsis,
    scripts: storyboardData.shots.map(shot => ({ ...shot })),
    selectedCharacters: scriptData.referenceAssets.map(asset => ({ ...asset })),
    sceneCount: Math.max(1, storyboardData.shots.length || 3),
    styleAnchor: scriptData.styleAnchor,
    characterDNA: { ...scriptData.characterDNA },
    selectedImageModel: storyboardData.selectedImageModel,
    compositeImageUrl: storyboardData.compositeImageUrl || null
  };
}

export function mergeSessionIntoDocuments(options: {
  scriptData: ScriptDocument;
  storyboardData: StoryboardDocument;
  session: StoryboardSessionSnapshot;
  now?: string;
}): { scriptData: ScriptDocument; storyboardData: StoryboardDocument } {
  const now = options.now || new Date().toISOString();
  const scriptFields = {
    sourceText: options.session.story,
    styleAnchor: options.session.styleAnchor,
    characterDNA: options.session.characterDNA,
    referenceAssets: options.session.selectedCharacters
  };
  const previousScriptFields = {
    sourceText: options.scriptData.sourceText,
    styleAnchor: options.scriptData.styleAnchor,
    characterDNA: options.scriptData.characterDNA,
    referenceAssets: options.scriptData.referenceAssets
  };
  const shots = options.session.scripts.map((incoming, index) => {
    const previous = options.storyboardData.shots.find(shot => shot.id === incoming.id)
      || options.storyboardData.shots[index];
    const normalized = normalizeStoryboardShot({ ...previous, ...incoming }, index, 'session');
    const changed = !previous || !sameJson(
      { ...previous, order: index },
      { ...normalized, order: index }
    );
    return {
      ...normalized,
      revision: changed ? (previous?.revision || 0) + 1 : (previous?.revision || 0)
    };
  });
  const storyboardFields = {
    shots,
    selectedImageModel: options.session.selectedImageModel,
    compositeImageUrl: options.session.compositeImageUrl
  };
  const previousStoryboardFields = {
    shots: options.storyboardData.shots,
    selectedImageModel: options.storyboardData.selectedImageModel,
    compositeImageUrl: options.storyboardData.compositeImageUrl || null
  };
  const scriptChanged = !sameJson(scriptFields, previousScriptFields);
  const storyboardChanged = !sameJson(storyboardFields, previousStoryboardFields);
  return {
    scriptData: scriptChanged ? {
      ...options.scriptData,
      ...scriptFields,
      revision: options.scriptData.revision + 1,
      updatedAt: now
    } : options.scriptData,
    storyboardData: storyboardChanged ? {
      ...options.storyboardData,
      ...storyboardFields,
      revision: options.storyboardData.revision + 1,
      updatedAt: now
    } : options.storyboardData
  };
}

export function legacyStoryContextFromDocuments(
  scriptData: ScriptDocument,
  storyboardData: StoryboardDocument,
  ids: { scriptNodeId: string; storyboardNodeId: string }
): LegacyStoryContext {
  return {
    story: scriptData.sourceText || scriptData.synopsis,
    scripts: storyboardData.shots.map(shot => ({ ...shot })),
    selectedCharacters: scriptData.referenceAssets.map(asset => ({ ...asset })),
    sceneCount: storyboardData.shots.length,
    styleAnchor: scriptData.styleAnchor,
    characterDNA: { ...scriptData.characterDNA },
    compositeImageUrl: storyboardData.compositeImageUrl || null,
    selectedImageModel: storyboardData.selectedImageModel,
    scriptNodeId: ids.scriptNodeId,
    storyboardNodeId: ids.storyboardNodeId
  };
}
