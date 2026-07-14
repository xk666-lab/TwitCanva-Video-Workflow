export interface SubjectAssetReference {
  id: string;
  url: string;
  label?: string;
}

export interface SubjectAsset {
  schemaVersion: number;
  id: string;
  name: string;
  description?: string;
  type: 'image';
  url: string;
  referenceImages: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SubjectReferenceSnapshot {
  subjectAssetId: string;
  name: string;
  description?: string;
  referenceImages: SubjectAssetReference[];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizedReferenceImages(asset: SubjectAsset): SubjectAssetReference[] {
  const references = Array.isArray(asset.referenceImages) ? asset.referenceImages : [];
  const seen = new Set<string>();
  const normalized: SubjectAssetReference[] = references.flatMap((reference, index) => {
    const url = nonEmptyString(reference);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [{
      id: `${asset.id}-reference-${index + 1}`,
      url
    }];
  });

  const primaryUrl = nonEmptyString(asset.url);
  if (primaryUrl && !seen.has(primaryUrl)) {
    normalized.unshift({ id: `${asset.id}-primary`, url: primaryUrl, label: 'Primary reference' });
  }
  return normalized;
}

export function buildSubjectReferenceSnapshots(assets: SubjectAsset[]): SubjectReferenceSnapshot[] {
  const seen = new Set<string>();
  return assets.flatMap(asset => {
    if (!asset?.id || seen.has(asset.id)) return [];
    seen.add(asset.id);
    const referenceImages = normalizedReferenceImages(asset);
    if (referenceImages.length === 0) return [];
    return [{
      subjectAssetId: asset.id,
      name: nonEmptyString(asset.name) || asset.id,
      ...(nonEmptyString(asset.description) ? { description: nonEmptyString(asset.description) } : {}),
      referenceImages
    }];
  });
}

export function getSubjectReferenceUrls(
  snapshots: SubjectReferenceSnapshot[],
  maxReferences = 14
): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const snapshot of snapshots) {
    for (const reference of snapshot.referenceImages) {
      if (!reference.url || seen.has(reference.url)) continue;
      seen.add(reference.url);
      urls.push(reference.url);
      if (urls.length >= maxReferences) return urls;
    }
  }

  return urls;
}
