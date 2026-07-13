export const DEFAULT_SEEDANCE_VIDEO_MODEL_ID = 'bytedance/seedance-2.0/text-to-video';

export function isSeedanceVideoModel(modelId?: string): boolean {
  if (!modelId) return false;
  return modelId.startsWith('seedance') || modelId.startsWith('bytedance/seedance-');
}
