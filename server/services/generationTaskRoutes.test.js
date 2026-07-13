import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';
import generationRoutes, { recoverGenerationTaskOutput } from '../routes/generation.js';

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
    fs.mkdirSync(app.locals.IMAGES_DIR, { recursive: true });
    fs.mkdirSync(app.locals.VIDEOS_DIR, { recursive: true });
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
                output: { resultUrl: take.url, take }
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
            }
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
        mediaType: 'image'
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
    assert.equal(unrelated, null);
});
