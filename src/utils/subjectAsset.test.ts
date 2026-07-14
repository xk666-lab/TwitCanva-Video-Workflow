import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSubjectReferenceSnapshots,
  getSubjectReferenceUrls,
  type SubjectAsset
} from '../domain/subjects/subjectAsset.ts';
import {
  createSubjectAsset,
  getSubjectAsset,
  listSubjectAssets
} from '../services/subjectAssetService.ts';

function subject(id: string, references: string[]): SubjectAsset {
  return {
    schemaVersion: 1,
    id,
    name: `Subject ${id}`,
    description: `Description for ${id}`,
    type: 'image',
    url: references[0],
    referenceImages: references,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z'
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('subject snapshots deduplicate assets and reference URLs', () => {
  const snapshots = buildSubjectReferenceSnapshots([
    subject('subject-1', ['/library/subject-assets/a.png', '/library/subject-assets/b.png']),
    subject('subject-1', ['/library/subject-assets/ignored.png']),
    subject('subject-2', ['/library/subject-assets/b.png', '/library/subject-assets/c.png'])
  ]);

  assert.deepEqual(snapshots.map(snapshot => snapshot.subjectAssetId), ['subject-1', 'subject-2']);
  assert.deepEqual(getSubjectReferenceUrls(snapshots), [
    '/library/subject-assets/a.png',
    '/library/subject-assets/b.png',
    '/library/subject-assets/c.png'
  ]);
});

test('subject URLs honor the generation reference limit', () => {
  const snapshots = buildSubjectReferenceSnapshots([
    subject('subject-1', ['/library/subject-assets/a.png', '/library/subject-assets/b.png'])
  ]);

  assert.deepEqual(getSubjectReferenceUrls(snapshots, 1), ['/library/subject-assets/a.png']);
});

test('subject asset service matches the isolated API contract', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const saved = subject('subject-1', ['/library/subject-assets/paper-hero.png']);
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    jsonResponse([saved]),
    jsonResponse(saved),
    jsonResponse({ success: true, subjectAsset: saved }, 201)
  ];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    assert.ok(response, 'Unexpected fetch request');
    return response;
  };

  assert.deepEqual(await listSubjectAssets(), [saved]);
  assert.deepEqual(await getSubjectAsset('subject-1'), saved);
  assert.deepEqual(await createSubjectAsset({
    name: 'Paper hero',
    description: 'Folded paper silhouette',
    sourceUrl: '/library/images/paper-hero.png'
  }), saved);

  assert.deepEqual(requests.map(request => request.url), [
    '/api/subject-assets',
    '/api/subject-assets/subject-1',
    '/api/subject-assets'
  ]);
  const createBody = JSON.parse(String(requests[2].init?.body));
  assert.equal(createBody.sourceUrl, '/library/images/paper-hero.png');
});
