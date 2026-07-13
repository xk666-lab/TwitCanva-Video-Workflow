import crypto from 'crypto';

export function createMediaTake({
    id,
    nodeId,
    type,
    url,
    prompt = '',
    model = '',
    createdAt,
    thumbnailUrl,
    metadata = {}
}) {
    return {
        id: id || `take_${crypto.randomUUID()}`,
        nodeId: nodeId || '',
        type,
        url,
        prompt,
        model,
        createdAt: createdAt || new Date().toISOString(),
        isHero: true,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        metadata
    };
}
