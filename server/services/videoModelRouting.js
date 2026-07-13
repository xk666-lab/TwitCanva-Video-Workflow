export function isSeedanceVideoModel(modelId) {
    if (!modelId || typeof modelId !== 'string') return false;
    return modelId.startsWith('seedance') || modelId.startsWith('bytedance/seedance-');
}
