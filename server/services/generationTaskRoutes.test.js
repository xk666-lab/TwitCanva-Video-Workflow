import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';
import generationRoutes, {
    createGenerationTaskExecutor,
    recoverGenerationTaskOutput
} from '../routes/generation.js';
import { createStoryboardRoutes } from '../routes/storyboard.js';
import {
    GenerationTaskStatus,
    createGenerationTaskManager
} from './generationTasks.js';

function createTask(overrides = {}) {
    const timestamp = '2026-01-01T00:00:00.000Z';
    return {
        schemaVersion: 1,
        taskId: 'task-1',
        workflowId: 'workflow-1',
        nodeId: 'node-1',
        operation: 'generate-image',
        provider: 'openai',
        model: 'gpt-image-2',
        status: 'queued',
        progress: 0,
        inputSnapshot: { prompt: 'A paper city', imageModel: 'gpt-image-2' },
        inputHash: 'a'.repeat(64),
        parameters: {},
        rootTaskId: 'task-1',
        attempt: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...overrides
    };
}

async function startTestServer(manager, libraryDir) {
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.locals.GENERATION_TASK_MANAGER = manager;
    app.locals.LIBRARY_DIR = libraryDir;
    app.locals.IMAGES_DIR = path.join(libraryDir, 'images');
    app.locals.VIDEOS_DIR = path.join(libraryDir, 'videos');
    app.locals.AUDIO_DIR = path.join(libraryDir, 'audio');
    fs.mkdirSync(app.locals.IMAGES_DIR, { recursive: true });
    fs.mkdirSync(app.locals.VIDEOS_DIR, { recursive: true });
    fs.mkdirSync(app.locals.AUDIO_DIR, { recursive: true });
    app.use('/api', generationRoutes);

    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(resolve => server.close(resolve))
    };
}

async function waitForTaskStatus(manager, taskId, expectedStatus, timeoutMs = 2000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const task = manager.getTask(taskId);
        if (task?.status === expectedStatus) return task;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`Task ${taskId} did not reach ${expectedStatus}`);
}

function createStoryPackageSnapshot(overrides = {}) {
    return {
        nodeId: 'script-1',
        scriptNodeId: 'script-1',
        storyboardNodeId: 'storyboard-1',
        sourceText: 'A paper moon',
        sceneCount: 1,
        generationMode: 'story-package',
        scriptRevision: 2,
        storyboardRevision: 4,
        referenceAssets: [],
        selectedImageModel: 'gpt-image-2',
        scriptData: {
            schemaVersion: 1,
            title: 'Paper Moon',
            sourceText: 'A paper moon',
            revision: 2
        },
        storyboardData: {
            schemaVersion: 1,
            sourceScriptNodeId: 'script-1',
            selectedImageModel: 'gpt-image-2',
            revision: 4,
            shots: [{
                id: 'stable-shot',
                imageNodeId: 'image-1',
                revision: 3
            }]
        },
        ...overrides
    };
}

test('POST generation-tasks materializes audio references into the local audio library', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-audio-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let receivedSubmission;
    const server = await startTestServer({
        async submitTask(submission) {
            receivedSubmission = submission;
            return { task: createTask({
                operation: submission.operation,
                provider: submission.provider,
                model: submission.model,
                inputSnapshot: submission.inputSnapshot
            }), reused: false };
        }
    }, libraryDir);
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            nodeId: 'video-node',
            operation: 'generate-video',
            inputSnapshot: {
                nodeId: 'video-node',
                prompt: 'A paper bird speaks.',
                videoModel: 'bytedance/seedance-2.0/text-to-video',
                audioReference: 'data:audio/mpeg;base64,SUQz'
            }
        })
    });

    assert.equal(response.status, 202);
    assert.match(receivedSubmission.inputSnapshot.audioReference, /^\/library\/audio\/task_input_[a-f0-9]+\.mp3$/);
    const savedInput = path.join(libraryDir, receivedSubmission.inputSnapshot.audioReference.replace('/library/', ''));
    assert.equal(fs.existsSync(savedInput), true);
});

test('POST generation-tasks preserves audio/mp4 task inputs as M4A references', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-m4a-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let receivedSubmission;
    const server = await startTestServer({
        async submitTask(submission) {
            receivedSubmission = submission;
            return { task: createTask({
                operation: submission.operation,
                provider: submission.provider,
                model: submission.model,
                inputSnapshot: submission.inputSnapshot
            }), reused: false };
        }
    }, libraryDir);
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            nodeId: 'video-node',
            operation: 'generate-video',
            inputSnapshot: {
                nodeId: 'video-node',
                prompt: 'A paper bird speaks.',
                videoModel: 'bytedance/seedance-2.0/text-to-video',
                audioReference: 'data:audio/mp4;base64,QUJD'
            }
        })
    });

    assert.equal(response.status, 202);
    assert.match(receivedSubmission.inputSnapshot.audioReference, /^\/library\/audio\/task_input_[a-f0-9]+\.m4a$/);
});

test('the Seedance task executor forwards audio references without contacting a real provider', async t => {
    const originalFetch = globalThis.fetch;
    const originalPublicBase = process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL;
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-seedance-audio-'));
    const videosDir = path.join(libraryDir, 'videos');
    fs.mkdirSync(videosDir, { recursive: true });
    t.after(() => {
        globalThis.fetch = originalFetch;
        fs.rmSync(libraryDir, { recursive: true, force: true });
        if (originalPublicBase === undefined) delete process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL;
        else process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL = originalPublicBase;
    });

    process.env.SEEDANCE_PUBLIC_ASSET_BASE_URL = 'https://assets.example.com';
    let submittedBody;
    globalThis.fetch = async (url, options = {}) => {
        if (options.method === 'POST') {
            submittedBody = JSON.parse(options.body);
            return new Response(JSON.stringify({ video_url: 'https://cdn.example.com/result.mp4' }), {
                status: 200,
                headers: { 'content-type': 'application/json' }
            });
        }
        if (String(url) === 'https://cdn.example.com/result.mp4') {
            return new Response(Buffer.from('video-result'), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${String(url)}`);
    };

    const executor = createGenerationTaskExecutor({
        SEEDANCE_API_KEY: 'test-key',
        SEEDANCE_BASE_URL: 'https://seedance.example.com',
        LIBRARY_DIR: libraryDir,
        VIDEOS_DIR: videosDir
    });
    const output = await executor(createTask({
        taskId: 'seedance-audio-task',
        operation: 'generate-video',
        provider: 'seedance',
        model: 'bytedance/seedance-2.0/text-to-video',
        inputSnapshot: {
            nodeId: 'video-node',
            prompt: 'A paper bird speaks.',
            videoModel: 'bytedance/seedance-2.0/text-to-video',
            audioReference: '/library/audio/voice.mp3'
        }
    }));

    assert.equal(output.resultUrl.startsWith('/library/videos/'), true);
    assert.deepEqual(submittedBody.metadata.reference_audios, [
        'https://assets.example.com/library/audio/voice.mp3'
    ]);
});

test('the Seedance task executor forwards provider progress updates to the task manager callback', async t => {
    const originalFetch = globalThis.fetch;
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-seedance-progress-'));
    const videosDir = path.join(libraryDir, 'videos');
    fs.mkdirSync(videosDir, { recursive: true });
    t.after(() => {
        globalThis.fetch = originalFetch;
        fs.rmSync(libraryDir, { recursive: true, force: true });
    });

    globalThis.fetch = async url => {
        if (String(url) === 'https://cdn.example.com/progress-result.mp4') {
            return new Response(Buffer.from('video-result'), { status: 200 });
        }
        throw new Error(`Unexpected fetch: ${String(url)}`);
    };

    const progressEvents = [];
    const executor = createGenerationTaskExecutor({
        SEEDANCE_API_KEY: 'test-key',
        LIBRARY_DIR: libraryDir,
        VIDEOS_DIR: videosDir
    }, {
        generateSeedanceVideo: async ({ onProgress }) => {
            onProgress?.({
                providerTaskId: 'seedance-provider-task',
                progress: 23,
                progressMessage: 'Provider task created'
            });
            return 'https://cdn.example.com/progress-result.mp4';
        }
    });
    const output = await executor(createTask({
        taskId: 'seedance-progress-task',
        operation: 'generate-video',
        provider: 'seedance',
        model: 'bytedance/seedance-2.0/text-to-video',
        inputSnapshot: {
            nodeId: 'video-node',
            prompt: 'A paper bird speaks.',
            videoModel: 'bytedance/seedance-2.0/text-to-video'
        }
    }), update => progressEvents.push(update));

    assert.equal(output.resultUrl.startsWith('/library/videos/'), true);
    assert.deepEqual(progressEvents, [
        {
            providerTaskId: 'seedance-provider-task',
            progress: 23,
            progressMessage: 'Provider task created'
        },
        {
            progress: 96,
            progressMessage: 'Downloading provider result'
        }
    ]);
});

test('POST generation-tasks validates operation before calling the manager', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let submissions = 0;
    const server = await startTestServer({
        async submitTask() {
            submissions += 1;
            return { task: createTask(), reused: false };
        }
    }, libraryDir);
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nodeId: 'node-1', inputSnapshot: { prompt: 'Missing operation' } })
    });

    assert.equal(response.status, 400);
    assert.equal(submissions, 0);
    const body = await response.json();
    assert.equal(body.error.code, 'VALIDATION_ERROR');
});

test('POST generation-tasks derives provider data and materializes data URLs before persistence', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    const receivedSubmissions = [];
    const queuedTask = createTask();
    const server = await startTestServer({
        async submitTask(submission) {
            receivedSubmissions.push(submission);
            return { task: { ...queuedTask, inputSnapshot: submission.inputSnapshot }, reused: false };
        }
    }, libraryDir);
    t.after(server.close);

    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            workflowId: 'workflow-1',
            nodeId: 'node-1',
            operation: 'generate-image',
            inputSnapshot: {
                prompt: 'A paper city',
                imageModel: 'gpt-image-2',
                imageBase64: pixel,
                apiKey: 'must-not-be-persisted'
            }
        })
    });

    assert.equal(response.status, 202);
    const firstSubmission = receivedSubmissions[0];
    assert.equal(firstSubmission.provider, 'openai');
    assert.equal(firstSubmission.model, 'gpt-image-2');
    assert.equal(firstSubmission.inputSnapshot.apiKey, undefined);
    assert.match(firstSubmission.inputSnapshot.imageBase64, /^\/library\/images\//);
    const savedInput = path.join(libraryDir, firstSubmission.inputSnapshot.imageBase64.replace('/library/', ''));
    assert.equal(fs.existsSync(savedInput), true);

    await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            workflowId: 'workflow-1',
            nodeId: 'node-1',
            operation: 'generate-image',
            inputSnapshot: {
                prompt: 'A paper city',
                imageModel: 'gpt-image-2',
                imageBase64: pixel
            }
        })
    });
    assert.equal(
        receivedSubmissions[1].inputSnapshot.imageBase64,
        firstSubmission.inputSnapshot.imageBase64
    );
});

test('POST generation-tasks accepts edit-image with a persisted local source and provenance', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-edit-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let receivedSubmission;
    const server = await startTestServer({
        async submitTask(submission) {
            receivedSubmission = submission;
            return { task: createTask({
                operation: submission.operation,
                provider: submission.provider,
                model: submission.model,
                inputSnapshot: submission.inputSnapshot
            }), reused: false };
        }
    }, libraryDir);
    t.after(server.close);

    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            workflowId: 'workflow-1',
            nodeId: 'derived-image-1',
            operation: 'edit-image',
            inputSnapshot: {
                prompt: 'Replace the backdrop with a paper theatre.',
                imageBase64: pixel,
                imageModel: 'gpt-image-2',
                imageEdit: {
                    mode: 'prompt-edit',
                    sourceNodeId: 'editor-1',
                    sourceTakeId: 'take-source-1',
                    editorNodeId: 'editor-1'
                },
                apiKey: 'must-not-be-persisted'
            }
        })
    });

    assert.equal(response.status, 202);
    assert.equal(receivedSubmission.operation, 'edit-image');
    assert.equal(receivedSubmission.provider, 'openai');
    assert.equal(receivedSubmission.model, 'gpt-image-2');
    assert.match(receivedSubmission.inputSnapshot.imageBase64, /^\/library\/images\//);
    assert.deepEqual(receivedSubmission.inputSnapshot.imageEdit, {
        mode: 'prompt-edit',
        sourceNodeId: 'editor-1',
        sourceTakeId: 'take-source-1',
        editorNodeId: 'editor-1'
    });
    assert.equal(receivedSubmission.inputSnapshot.apiKey, undefined);
});

test('POST generation-tasks rejects edit-image without a source image', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-edit-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let submissions = 0;
    const server = await startTestServer({
        async submitTask() {
            submissions += 1;
            return { task: createTask(), reused: false };
        }
    }, libraryDir);
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            nodeId: 'derived-image-1',
            operation: 'edit-image',
            inputSnapshot: {
                prompt: 'Change the scene.',
                imageModel: 'gpt-image-2',
                imageEdit: { mode: 'prompt-edit', sourceNodeId: 'editor-1' }
            }
        })
    });

    assert.equal(response.status, 400);
    assert.equal(submissions, 0);
    const body = await response.json();
    assert.match(body.error.message, /source image/i);
});

test('POST generation-tasks accepts the existing local image operation without adding a new provider model', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let receivedSubmission;
    const server = await startTestServer({
        async submitTask(submission) {
            receivedSubmission = submission;
            return { task: createTask({
                operation: submission.operation,
                provider: submission.provider,
                model: submission.model
            }), reused: false };
        }
    }, libraryDir);
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            nodeId: 'local-node',
            operation: 'generate-local-image',
            inputSnapshot: {
                nodeId: 'local-node',
                modelId: 'local-model-1',
                prompt: 'A local paper city'
            }
        })
    });

    assert.equal(response.status, 202);
    assert.equal(receivedSubmission.provider, 'local');
    assert.equal(receivedSubmission.model, 'local-model-1');
});

test('task query, cancellation and retry endpoints delegate to the task manager', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    const calls = [];
    const task = createTask();
    const server = await startTestServer({
        queryTasks(filters) {
            calls.push(['query', filters]);
            return [task];
        },
        async cancelTask(taskId) {
            calls.push(['cancel', taskId]);
            return { ...task, status: 'cancelled' };
        },
        async retryTask(taskId) {
            calls.push(['retry', taskId]);
            return { ...task, taskId: 'task-2', retryOfTaskId: taskId };
        }
    }, libraryDir);
    t.after(server.close);

    const queryResponse = await fetch(`${server.baseUrl}/api/generation-tasks/query`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskIds: ['task-1'] })
    });
    assert.deepEqual((await queryResponse.json()).tasks, [task]);

    const cancelResponse = await fetch(`${server.baseUrl}/api/generation-tasks/task-1/cancel`, { method: 'POST' });
    assert.equal((await cancelResponse.json()).task.status, 'cancelled');

    const retryResponse = await fetch(`${server.baseUrl}/api/generation-tasks/task-1/retry`, { method: 'POST' });
    assert.equal((await retryResponse.json()).task.retryOfTaskId, 'task-1');
    assert.deepEqual(calls, [
        ['query', { taskIds: ['task-1'] }],
        ['cancel', 'task-1'],
        ['retry', 'task-1']
    ]);
});

test('generation task APIs reject non-local browser origins before exposing task data', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let queryCalls = 0;
    const server = await startTestServer({
        queryTasks() {
            queryCalls += 1;
            return [createTask()];
        }
    }, libraryDir);
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/generation-tasks/query`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            origin: 'https://malicious.example'
        },
        body: JSON.stringify({})
    });

    assert.equal(response.status, 403);
    assert.equal(queryCalls, 0);
});

test('legacy generate-image endpoint waits on the same task system and preserves its response', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    const take = {
        id: 'take-1',
        nodeId: 'node-1',
        type: 'image',
        url: '/library/images/result.png',
        prompt: 'A paper city',
        model: 'gpt-image-2',
        createdAt: '2026-01-01T00:00:00.000Z',
        isHero: true
    };
    const alternateTake = {
        ...take,
        id: 'take-2',
        url: '/library/images/result-2.png',
        isHero: false
    };
    let submission;
    const server = await startTestServer({
        async submitTask(value) {
            submission = value;
            return { task: createTask({ inputSnapshot: value.inputSnapshot }), reused: false };
        },
        async waitForTask() {
            return createTask({
                status: 'succeeded',
                progress: 100,
                output: { resultUrl: take.url, take, takes: [take, alternateTake] }
            });
        }
    }, libraryDir);
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/generate-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            workflowId: 'workflow-1',
            prompt: 'A paper city',
            imageModel: 'gpt-image-2'
        })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(submission.operation, 'generate-image');
    assert.equal(body.resultUrl, take.url);
    assert.deepEqual(body.take, take);
    assert.deepEqual(body.takes, [take, alternateTake]);
    assert.equal(body.task.taskId, 'task-1');
});

test('legacy generation-status prefers the latest persisted task before scanning take metadata', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    const succeeded = createTask({
        status: 'succeeded',
        progress: 100,
        output: {
            resultUrl: '/library/images/result.png',
            take: {
                id: 'take-1',
                nodeId: 'node-1',
                type: 'image',
                url: '/library/images/result.png',
                prompt: 'A paper city',
                model: 'gpt-image-2',
                createdAt: '2026-01-01T00:00:00.000Z',
                isHero: true
            },
            takes: [
                {
                    id: 'take-1',
                    nodeId: 'node-1',
                    type: 'image',
                    url: '/library/images/result.png',
                    prompt: 'A paper city',
                    model: 'gpt-image-2',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    isHero: true
                },
                {
                    id: 'take-2',
                    nodeId: 'node-1',
                    type: 'image',
                    url: '/library/images/result-2.png',
                    prompt: 'A paper city',
                    model: 'gpt-image-2',
                    createdAt: '2026-01-01T00:00:01.000Z',
                    isHero: false
                }
            ]
        },
        completedAt: '2026-01-01T00:01:00.000Z'
    });
    const server = await startTestServer({
        queryTasks() {
            return [succeeded];
        }
    }, libraryDir);
    t.after(server.close);

    const response = await fetch(`${server.baseUrl}/api/generation-status/node-1`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'success');
    assert.equal(body.resultUrl, '/library/images/result.png');
    assert.equal(body.takes.length, 2);
    assert.equal(body.task.taskId, 'task-1');
});

test('restart reconciliation only adopts media metadata written for the interrupted task', t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-task-recovery-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    const imagesDir = path.join(libraryDir, 'images');
    const videosDir = path.join(libraryDir, 'videos');
    fs.mkdirSync(imagesDir, { recursive: true });
    fs.mkdirSync(videosDir, { recursive: true });
    fs.writeFileSync(path.join(imagesDir, 'take-1.json'), JSON.stringify({
        takeId: 'take-1',
        nodeId: 'node-1',
        generationTaskId: 'task-1',
        filename: 'result.png',
        prompt: 'Recovered',
        model: 'gpt-image-2',
        createdAt: '2026-01-01T00:00:00.000Z',
        mediaType: 'image',
        metadata: {
            operation: 'edit-image',
            mode: 'expand',
            sourceNodeId: 'editor-1',
            sourceTakeId: 'take-source-1',
            sourceUrl: '/library/images/source.png'
        }
    }));
    fs.writeFileSync(path.join(imagesDir, 'take-2.json'), JSON.stringify({
        takeId: 'take-2',
        nodeId: 'node-1',
        generationTaskId: 'task-1',
        filename: 'result-2.png',
        prompt: 'Recovered second candidate',
        model: 'gpt-image-2',
        createdAt: '2026-01-01T00:00:02.000Z',
        mediaType: 'image',
        metadata: {
            batchIndex: 1,
            batchCount: 2
        }
    }));
    fs.writeFileSync(path.join(imagesDir, 'take-newer.json'), JSON.stringify({
        takeId: 'take-newer',
        nodeId: 'node-1',
        generationTaskId: 'task-newer',
        filename: 'newer.png',
        prompt: 'Newer task',
        model: 'gpt-image-2',
        createdAt: '2026-01-01T00:01:00.000Z',
        mediaType: 'image'
    }));

    const recovered = recoverGenerationTaskOutput({ taskId: 'task-1', nodeId: 'node-1' }, {
        IMAGES_DIR: imagesDir,
        VIDEOS_DIR: videosDir
    });
    const unrelated = recoverGenerationTaskOutput({ taskId: 'task-other', nodeId: 'node-1' }, {
        IMAGES_DIR: imagesDir,
        VIDEOS_DIR: videosDir
    });

    assert.equal(recovered.resultUrl, '/library/images/result.png');
    assert.equal(recovered.take.id, 'take-1');
    assert.deepEqual(recovered.takes.map(take => ({
        id: take.id,
        url: take.url,
        isHero: take.isHero
    })), [
        { id: 'take-1', url: '/library/images/result.png', isHero: true },
        { id: 'take-2', url: '/library/images/result-2.png', isHero: false }
    ]);
    assert.deepEqual(recovered.take.metadata, {
        operation: 'edit-image',
        mode: 'expand',
        sourceNodeId: 'editor-1',
        sourceTakeId: 'take-source-1',
        sourceUrl: '/library/images/source.png',
        filename: 'result.png',
        aspectRatio: undefined,
        resolution: undefined
    });
    assert.equal(unrelated, null);
});

test('POST generation-tasks accepts story-package and derives the configured text provider', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-story-task-route-'));
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let submission;
    const app = express();
    app.use(express.json());
    app.locals.GENERATION_TASK_MANAGER = {
        async submitTask(value) {
            submission = value;
            return { task: createTask({ ...value, taskId: 'story-task' }), reused: false };
        }
    };
    app.locals.LIBRARY_DIR = libraryDir;
    app.locals.IMAGES_DIR = path.join(libraryDir, 'images');
    app.locals.VIDEOS_DIR = path.join(libraryDir, 'videos');
    app.locals.OPENAI_API_KEY = 'key';
    app.locals.OPENAI_TEXT_MODEL = 'gpt-4.1-mini';
    fs.mkdirSync(app.locals.IMAGES_DIR, { recursive: true });
    fs.mkdirSync(app.locals.VIDEOS_DIR, { recursive: true });
    app.use('/api', generationRoutes);
    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const address = server.address();

    const response = await fetch(`http://127.0.0.1:${address.port}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            nodeId: 'script-1',
            operation: 'generate-story-package',
            inputSnapshot: {
                nodeId: 'script-1',
                storyboardNodeId: 'storyboard-1',
                sourceText: 'A paper moon',
                sceneCount: 3,
                generationMode: 'story-package',
                scriptRevision: 0,
                storyboardRevision: 0,
                referenceAssets: [],
                selectedImageModel: 'gpt-image-2',
                scriptData: {},
                storyboardData: {}
            }
        })
    });

    assert.equal(response.status, 202);
    assert.equal(submission.provider, 'openai');
    assert.equal(submission.model, 'gpt-4.1-mini');
    assert.equal(submission.operation, 'generate-story-package');
});

test('story-package tasks run through the registered executor without network calls', async t => {
    const tasksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-story-task-executor-'));
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    let providerCalls = 0;
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: createGenerationTaskExecutor({}, {
            generateStoryPackageWithConfiguredProvider: async ({ payload }) => {
                providerCalls += 1;
                assert.equal(payload.story, 'A paper moon');
                return {
                    story: 'A polished paper moon story',
                    styleAnchor: 'paper craft',
                    characterDNA: { Moon: 'folded parchment' },
                    scripts: [{
                        sceneNumber: 1,
                        description: 'The paper moon unfolds',
                        cameraAngle: 'Wide shot',
                        cameraMovement: 'Push in',
                        lighting: 'Blue hour',
                        mood: 'Wonder'
                    }]
                };
            }
        })
    });
    await manager.initialize();

    const submitted = await manager.submitTask({
        workflowId: 'workflow-1',
        nodeId: 'script-1',
        operation: 'generate-story-package',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        inputSnapshot: createStoryPackageSnapshot(),
        parameters: { sceneCount: 1, generationMode: 'story-package' }
    });
    const task = await waitForTaskStatus(manager, submitted.task.taskId, GenerationTaskStatus.SUCCEEDED);

    assert.equal(providerCalls, 1);
    assert.equal(task.provider, 'openai');
    assert.equal(task.model, 'gpt-4.1-mini');
    assert.equal(task.output.kind, 'story-package');
    assert.equal(task.output.scriptRevision, 2);
    assert.equal(task.output.storyboardRevision, 4);
    assert.equal(task.output.scriptData.revision, 3);
    assert.equal(task.output.storyboardData.revision, 5);
    assert.equal(task.output.storyboardData.shots[0].id, 'stable-shot');
    assert.equal(task.output.storyboardData.shots[0].imageNodeId, 'image-1');
    assert.deepEqual(task.output.scriptData.generatedBy, {
        taskId: task.taskId,
        provider: 'openai',
        model: 'gpt-4.1-mini'
    });
    assert.deepEqual(task.output.storyboardData.generatedBy, task.output.scriptData.generatedBy);
});

test('story-package validation rejects invalid fields and provider failures become structured task errors', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-story-task-validation-'));
    const tasksDir = path.join(libraryDir, 'tasks');
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let submissions = 0;
    const server = await startTestServer({
        async submitTask() {
            submissions += 1;
            return { task: createTask(), reused: false };
        }
    }, libraryDir);
    t.after(server.close);

    for (const [inputSnapshot, expectedMessage] of [
        [createStoryPackageSnapshot({ sourceText: '' }), 'sourceText is required'],
        [createStoryPackageSnapshot({ storyboardNodeId: '' }), 'storyboardNodeId is required'],
        [createStoryPackageSnapshot({ sceneCount: 0 }), 'sceneCount must be between 1 and 10'],
        [createStoryPackageSnapshot({ sceneCount: 11 }), 'sceneCount must be between 1 and 10'],
        [createStoryPackageSnapshot({ scriptRevision: -1 }), 'scriptRevision must be a non-negative integer'],
        [createStoryPackageSnapshot({ storyboardRevision: -1 }), 'storyboardRevision must be a non-negative integer'],
        [createStoryPackageSnapshot({ generationMode: 'unknown' }), 'generationMode must be "scripts" or "story-package"']
    ]) {
        const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                nodeId: 'script-1',
                operation: 'generate-story-package',
                inputSnapshot
            })
        });
        const body = await response.json();
        assert.equal(response.status, 400);
        assert.equal(body.error.code, 'VALIDATION_ERROR');
        assert.equal(body.error.message, expectedMessage);
    }
    assert.equal(submissions, 0);

    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: createGenerationTaskExecutor({}, {
            generateStoryPackageWithConfiguredProvider: async () => {
                throw new Error('Provider timeout');
            }
        })
    });
    await manager.initialize();
    const submitted = await manager.submitTask({
        workflowId: 'workflow-1',
        nodeId: 'script-1',
        operation: 'generate-story-package',
        provider: 'openai',
        model: 'gpt-4.1-mini',
        inputSnapshot: createStoryPackageSnapshot(),
        parameters: { sceneCount: 1, generationMode: 'story-package' }
    });
    const failed = await waitForTaskStatus(manager, submitted.task.taskId, GenerationTaskStatus.FAILED);

    assert.deepEqual(failed.error, {
        code: 'PROVIDER_TIMEOUT',
        message: 'Provider timeout',
        retryable: true
    });
    assert.equal(failed.output, undefined);
});

test('story-package task snapshots recursively remove nested API-key-like fields before persistence', async t => {
    const libraryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-story-task-sanitize-'));
    const tasksDir = path.join(libraryDir, 'tasks');
    t.after(() => fs.rmSync(libraryDir, { recursive: true, force: true }));
    let releaseExecution;
    const executionGate = new Promise(resolve => { releaseExecution = resolve; });
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async () => {
            await executionGate;
            return {};
        }
    });
    await manager.initialize();
    const server = await startTestServer(manager, libraryDir);
    t.after(server.close);
    const inputSnapshot = createStoryPackageSnapshot({
        referenceAssets: [{
            name: 'Moon reference',
            metadata: {
                apiKey: 'reference-secret',
                keep: 'reference-metadata'
            }
        }],
        scriptData: {
            revision: 2,
            nested: { openaiApiKey: 'script-secret', keep: 'script-data' }
        },
        storyboardData: {
            revision: 4,
            nested: { bearerToken: 'storyboard-secret', keep: 'storyboard-data' },
            shots: []
        }
    });

    const response = await fetch(`${server.baseUrl}/api/generation-tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            nodeId: 'script-1',
            operation: 'generate-story-package',
            inputSnapshot
        })
    });
    const body = await response.json();
    assert.equal(response.status, 202);

    const stored = manager.getTask(body.task.taskId);
    const persisted = JSON.parse(fs.readFileSync(path.join(tasksDir, `${body.task.taskId}.json`), 'utf8'));
    for (const snapshot of [stored.inputSnapshot, persisted.inputSnapshot]) {
        assert.equal(snapshot.referenceAssets[0].metadata.apiKey, undefined);
        assert.equal(snapshot.referenceAssets[0].metadata.keep, 'reference-metadata');
        assert.equal(snapshot.scriptData.nested.openaiApiKey, undefined);
        assert.equal(snapshot.scriptData.nested.keep, 'script-data');
        assert.equal(snapshot.storyboardData.nested.bearerToken, undefined);
        assert.equal(snapshot.storyboardData.nested.keep, 'storyboard-data');
    }
    releaseExecution();
    await waitForTaskStatus(manager, body.task.taskId, GenerationTaskStatus.SUCCEEDED);
});

test('legacy story-package endpoint keeps the direct shared-provider response shape', async t => {
    const app = express();
    app.use(express.json());
    app.locals.GENERATION_TASK_MANAGER = {
        submitTask: () => assert.fail('Legacy storyboard endpoint must not submit a generation task')
    };
    app.use('/api/storyboard', createStoryboardRoutes({
        generateStoryPackageWithConfiguredProvider: async ({ payload }) => ({
            story: `Polished: ${payload.story}`,
            styleAnchor: 'paper craft',
            characterDNA: {},
            scripts: [{ sceneNumber: 1, description: 'A paper moon rises' }],
            provider: 'openai',
            model: 'gpt-4.1-mini'
        })
    }));
    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const address = server.address();

    const response = await fetch(`http://127.0.0.1:${address.port}/api/storyboard/generate-story-package`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ story: 'A paper moon', sceneCount: 1 })
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.story, 'Polished: A paper moon');
    assert.equal(body.provider, 'openai');
    assert.equal(body.model, 'gpt-4.1-mini');
    assert.equal(body.scripts[0].description, 'A paper moon rises');
    assert.equal(body.task, undefined);
    assert.equal(body.output, undefined);
});
