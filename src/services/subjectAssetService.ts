import type { SubjectAsset } from '../domain/subjects/subjectAsset.ts';
import { apiDelete, apiGet, apiPost } from './apiClient.ts';

export interface CreateSubjectAssetInput {
  name: string;
  description?: string;
  sourceUrl?: string;
  sourceUrls?: string[];
}

interface CreateSubjectAssetResponse {
  success: boolean;
  subjectAsset: SubjectAsset;
}

export function listSubjectAssets(): Promise<SubjectAsset[]> {
  return apiGet<SubjectAsset[]>('/api/subject-assets');
}

export async function getSubjectAsset(id: string): Promise<SubjectAsset> {
  return apiGet<SubjectAsset>(`/api/subject-assets/${encodeURIComponent(id)}`);
}

export async function createSubjectAsset(input: CreateSubjectAssetInput): Promise<SubjectAsset> {
  const response = await apiPost<CreateSubjectAssetResponse>('/api/subject-assets', input);
  return response.subjectAsset;
}

export function deleteSubjectAsset(id: string): Promise<void> {
  return apiDelete<void>(`/api/subject-assets/${encodeURIComponent(id)}`);
}

export async function resolveSubjectAssets(ids: string[]): Promise<SubjectAsset[]> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))];
  return Promise.all(uniqueIds.map(getSubjectAsset));
}
