import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
    GenerationTaskStatus,
    createGenerationTaskManager,
    isGenerationTaskTransitionAllowed
} from './generationTasks.js';

function createTempTasksDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-generation-tasks-'));
}

function createSubmission(overrides = {}) {
    return {
        workflowId: 'workflow-1',
        nodeId: 'node-1',
        operation: 'generate-image',
        provider: 'openai',
        model: 'gpt-image-2',
        inputSnapshot: {
            prompt: 'A paper city at sunrise',
            imageModel: 'gpt-image-2'
        },
        parameters: {
            aspectRatio: '16:9',
            resolution: '1K'
        },
        ...overrides
    };
}

async function waitForStatus(manager, taskId, expectedStatus, timeoutMs = 2000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const task = manager.getTask(taskId);
        if (task?.status === expectedStatus) return task;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail(`Task ${taskId} did not reach ${expectedStatus}`);
}

test('generation task state machine only permits declared forward transitions', () => {
    assert.equal(isGenerationTaskTransitionAllowed(GenerationTaskStatus.DRAFT, GenerationTaskStatus.VALIDATING), true);
    assert.equal(isGenerationTaskTransitionAllowed(GenerationTaskStatus.VALIDATING, GenerationTaskStatus.QUEUED), true);
    assert.equal(isGenerationTaskTransitionAllowed(GenerationTaskStatus.QUEUED, GenerationTaskStatus.RUNNING), true);
    assert.equal(isGenerationTaskTransitionAllowed(GenerationTaskStatus.RUNNING, GenerationTaskStatus.SUCCEEDED), true);
    assert.equal(isGenerationTaskTransitionAllowed(GenerationTaskStatus.SUCCEEDED, GenerationTaskStatus.RUNNING), false);
    assert.equal(isGenerationTaskTransitionAllowed(GenerationTaskStatus.FAILED, GenerationTaskStatus.QUEUED), false);
});

test('task submission persists an immutable input snapshot and stable hash', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    let releaseExecution;
    const executionGate = new Promise(resolve => { releaseExecution = resolve; });
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async () => {
            await executionGate;
            return { resultUrl: '/library/images/result.png' };
        }
    });
    await manager.initialize();

    const inputSnapshot = {
        prompt: 'Original prompt',
        nested: { value: 1, apiKey: 'must-not-be-persisted' }
    };
    const { task } = await manager.submitTask(createSubmission({ inputSnapshot }));
    inputSnapshot.prompt = 'Mutated prompt';
    inputSnapshot.nested.value = 2;

    const stored = manager.getTask(task.taskId);
    assert.equal(stored.inputSnapshot.prompt, 'Original prompt');
    assert.equal(stored.inputSnapshot.nested.value, 1);
    assert.equal(stored.inputSnapshot.nested.apiKey, undefined);
    assert.match(stored.inputHash, /^[a-f0-9]{64}$/);
    assert.equal(stored.schemaVersion, 1);
    assert.equal(fs.existsSync(path.join(tasksDir, `${task.taskId}.json`)), true);
    assert.equal(fs.readdirSync(tasksDir).some(file => file.includes('.tmp')), false);

    releaseExecution();
    await waitForStatus(manager, task.taskId, GenerationTaskStatus.SUCCEEDED);
});

test('active duplicate submissions reuse one task but completed regeneration creates another task', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    let releaseFirst;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    let executions = 0;
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async () => {
            executions += 1;
            if (executions === 1) await firstGate;
            return { resultUrl: `/library/images/result-${executions}.png` };
        }
    });
    await manager.initialize();

    const first = await manager.submitTask(createSubmission());
    const duplicate = await manager.submitTask(createSubmission());
    assert.equal(duplicate.reused, true);
    assert.equal(duplicate.task.taskId, first.task.taskId);

    releaseFirst();
    await waitForStatus(manager, first.task.taskId, GenerationTaskStatus.SUCCEEDED);
    const regenerated = await manager.submitTask(createSubmission());
    assert.notEqual(regenerated.task.taskId, first.task.taskId);
    await waitForStatus(manager, regenerated.task.taskId, GenerationTaskStatus.SUCCEEDED);
});

test('manager hashes, deduplicates, and persists a stubbed task execution', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    let releaseExecution;
    const executionGate = new Promise(resolve => { releaseExecution = resolve; });
    let executions = 0;
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async task => {
            executions += 1;
            await executionGate;
            return { resultUrl: `/library/images/${task.taskId}.png` };
        }
    });
    await manager.initialize();

    const first = await manager.submitTask(createSubmission());
    await waitForStatus(manager, first.task.taskId, GenerationTaskStatus.RUNNING);
    const duplicate = await manager.submitTask(createSubmission());
    const persisted = JSON.parse(fs.readFileSync(path.join(tasksDir, `${first.task.taskId}.json`), 'utf8'));

    assert.equal(duplicate.reused, true);
    assert.equal(duplicate.task.taskId, first.task.taskId);
    assert.match(persisted.inputHash, /^[a-f0-9]{64}$/);
    assert.equal(persisted.inputHash, first.task.inputHash);
    assert.equal(executions, 1);

    releaseExecution();
    const completed = await waitForStatus(manager, first.task.taskId, GenerationTaskStatus.SUCCEEDED);
    assert.equal(completed.output.resultUrl, `/library/images/${first.task.taskId}.png`);
});

test('running task progress updates persist provider task metadata until completion', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    let releaseExecution;
    const executionGate = new Promise(resolve => { releaseExecution = resolve; });
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async (_task, onProgress) => {
            onProgress({
                providerTaskId: 'seedance-provider-task',
                progress: 24,
                progressMessage: 'Provider task created'
            });
            onProgress({ progress: 12, progressMessage: 'Older progress should not rewind' });
            await executionGate;
            return { resultUrl: '/library/videos/result.mp4' };
        }
    });
    await manager.initialize();

    const { task } = await manager.submitTask(createSubmission({
        operation: 'generate-video',
        provider: 'seedance',
        model: 'bytedance/seedance-2.0/text-to-video'
    }));
    const running = await waitForStatus(manager, task.taskId, GenerationTaskStatus.RUNNING);
    assert.equal(running.providerTaskId, 'seedance-provider-task');
    assert.equal(running.progress, 24);
    assert.equal(running.progressMessage, 'Older progress should not rewind');

    releaseExecution();
    const completed = await waitForStatus(manager, task.taskId, GenerationTaskStatus.SUCCEEDED);
    assert.equal(completed.providerTaskId, 'seedance-provider-task');
    assert.equal(completed.progress, 100);
    assert.equal(completed.output.resultUrl, '/library/videos/result.mp4');
});

test('queue enforces concurrency and persists successful output', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    let active = 0;
    let maxActive = 0;
    const releases = [];
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 2,
        executor: task => new Promise(resolve => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            releases.push(() => {
                active -= 1;
                resolve({
                    resultUrl: `/library/images/${task.taskId}.png`,
                    take: { id: `take-${task.taskId}` }
                });
            });
        })
    });
    await manager.initialize();

    const submissions = await Promise.all([
        manager.submitTask(createSubmission({ nodeId: 'node-1' })),
        manager.submitTask(createSubmission({ nodeId: 'node-2' })),
        manager.submitTask(createSubmission({ nodeId: 'node-3' }))
    ]);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(maxActive, 2);
    assert.equal(manager.getTask(submissions[2].task.taskId).status, GenerationTaskStatus.QUEUED);

    releases.splice(0).forEach(release => release());
    await new Promise(resolve => setTimeout(resolve, 20));
    releases.splice(0).forEach(release => release());
    const completed = await waitForStatus(manager, submissions[2].task.taskId, GenerationTaskStatus.SUCCEEDED);
    assert.equal(completed.progress, 100);
    assert.equal(completed.output.take.id, `take-${completed.taskId}`);
});

test('cancelling a running task ignores a late provider result', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    let releaseExecution;
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: () => new Promise(resolve => {
            releaseExecution = () => resolve({ resultUrl: '/library/images/late.png' });
        })
    });
    await manager.initialize();

    const { task } = await manager.submitTask(createSubmission());
    await waitForStatus(manager, task.taskId, GenerationTaskStatus.RUNNING);
    const cancelled = await manager.cancelTask(task.taskId);
    assert.equal(cancelled.status, GenerationTaskStatus.CANCELLED);
    assert.equal(cancelled.error.code, 'CANCELLED');
    assert.equal(cancelled.cancellation.providerCancellationSupported, false);

    releaseExecution();
    await new Promise(resolve => setTimeout(resolve, 20));
    const finalTask = manager.getTask(task.taskId);
    assert.equal(finalTask.status, GenerationTaskStatus.CANCELLED);
    assert.equal(finalTask.output, undefined);
});

test('retry creates a linked task with the original immutable input', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    let attempts = 0;
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('Provider timeout');
            return { resultUrl: '/library/images/retry.png' };
        }
    });
    await manager.initialize();

    const first = await manager.submitTask(createSubmission());
    const failed = await waitForStatus(manager, first.task.taskId, GenerationTaskStatus.FAILED);
    assert.equal(failed.error.retryable, true);

    const retried = await manager.retryTask(failed.taskId);
    assert.equal(retried.retryOfTaskId, failed.taskId);
    assert.equal(retried.rootTaskId, failed.taskId);
    assert.equal(retried.attempt, 2);
    assert.deepEqual(retried.inputSnapshot, failed.inputSnapshot);
    await waitForStatus(manager, retried.taskId, GenerationTaskStatus.SUCCEEDED);
});

test('executor validation errors are terminal and not marked retryable', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async () => {
            throw new TypeError('Prompt is required');
        }
    });
    await manager.initialize();

    const submitted = await manager.submitTask(createSubmission());
    const failed = await waitForStatus(manager, submitted.task.taskId, GenerationTaskStatus.FAILED);
    assert.equal(failed.error.code, 'VALIDATION_ERROR');
    assert.equal(failed.error.retryable, false);
});

test('restart marks interrupted running tasks retryable and resumes queued tasks', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    const now = new Date().toISOString();
    const baseTask = {
        schemaVersion: 1,
        workflowId: 'workflow-1',
        operation: 'generate-image',
        provider: 'openai',
        model: 'gpt-image-2',
        inputSnapshot: { prompt: 'Recover me' },
        inputHash: 'a'.repeat(64),
        parameters: {},
        progress: 0,
        attempt: 1,
        createdAt: now,
        updatedAt: now
    };
    fs.writeFileSync(path.join(tasksDir, 'running-task.json'), JSON.stringify({
        ...baseTask,
        taskId: 'running-task',
        nodeId: 'running-node',
        status: GenerationTaskStatus.RUNNING,
        startedAt: now
    }));
    fs.writeFileSync(path.join(tasksDir, 'queued-task.json'), JSON.stringify({
        ...baseTask,
        taskId: 'queued-task',
        nodeId: 'queued-node',
        status: GenerationTaskStatus.QUEUED
    }));

    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async task => ({ resultUrl: `/library/images/${task.taskId}.png` })
    });
    await manager.initialize();

    const interrupted = manager.getTask('running-task');
    assert.equal(interrupted.status, GenerationTaskStatus.FAILED);
    assert.equal(interrupted.error.code, 'SERVER_RESTARTED');
    assert.equal(interrupted.error.retryable, true);
    await waitForStatus(manager, 'queued-task', GenerationTaskStatus.SUCCEEDED);
});

test('restart promotes a completed temp write when a task stalled before queueing', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    const now = new Date().toISOString();
    const baseTask = {
        schemaVersion: 1,
        taskId: 'stalled-before-queue',
        workflowId: 'workflow-1',
        nodeId: 'video-node',
        operation: 'generate-video',
        provider: 'seedance',
        model: 'bytedance/seedance-2.0/text-to-video',
        progress: 0,
        inputSnapshot: { prompt: 'Render video' },
        inputHash: 'b'.repeat(64),
        parameters: {},
        rootTaskId: 'stalled-before-queue',
        attempt: 1,
        createdAt: now
    };
    fs.writeFileSync(path.join(tasksDir, 'stalled-before-queue.json'), JSON.stringify({
        ...baseTask,
        status: GenerationTaskStatus.VALIDATING,
        updatedAt: now
    }));
    fs.writeFileSync(path.join(tasksDir, 'stalled-before-queue.promote.tmp'), JSON.stringify({
        ...baseTask,
        status: GenerationTaskStatus.QUEUED,
        updatedAt: new Date(Date.parse(now) + 1).toISOString()
    }));

    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async task => ({ resultUrl: `/library/videos/${task.taskId}.mp4` })
    });
    await manager.initialize();

    const completed = await waitForStatus(manager, 'stalled-before-queue', GenerationTaskStatus.SUCCEEDED);
    assert.equal(completed.output.resultUrl, '/library/videos/stalled-before-queue.mp4');
    assert.equal(fs.readdirSync(tasksDir).some(file => file.endsWith('.tmp')), false);
});

test('stalled draft or validating tasks do not block a fresh duplicate submission', async t => {
    const tasksDir = createTempTasksDir();
    const originalRenameSync = fs.renameSync;
    t.after(() => {
        fs.renameSync = originalRenameSync;
        fs.rmSync(tasksDir, { recursive: true, force: true });
    });

    let currentMs = Date.parse('2026-07-16T15:00:00.000Z');
    let failedQueuedWrite = false;
    fs.renameSync = (from, to) => {
        const raw = fs.readFileSync(from, 'utf8');
        if (!failedQueuedWrite && raw.includes(`"status": "${GenerationTaskStatus.QUEUED}"`)) {
            failedQueuedWrite = true;
            throw new Error('simulated queued persist failure');
        }
        return originalRenameSync(from, to);
    };

    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        now: () => new Date(currentMs).toISOString(),
        executor: async task => ({ resultUrl: `/library/images/${task.taskId}.png` })
    });
    await manager.initialize();

    await assert.rejects(
        () => manager.submitTask(createSubmission()),
        /simulated queued persist failure/
    );
    const stalledTask = JSON.parse(fs.readFileSync(
        path.join(tasksDir, fs.readdirSync(tasksDir).find(file => file.endsWith('.json'))),
        'utf8'
    ));
    assert.equal(stalledTask.status, GenerationTaskStatus.VALIDATING);

    fs.renameSync = originalRenameSync;
    currentMs += 31_000;
    const fresh = await manager.submitTask(createSubmission());
    assert.equal(fresh.reused, false);
    assert.notEqual(fresh.task.taskId, stalledTask.taskId);
    await waitForStatus(manager, fresh.task.taskId, GenerationTaskStatus.SUCCEEDED);
});

test('restart reconciles a running task when its media result was already saved', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    const now = new Date().toISOString();
    fs.writeFileSync(path.join(tasksDir, 'recoverable-task.json'), JSON.stringify({
        schemaVersion: 1,
        taskId: 'recoverable-task',
        workflowId: 'workflow-1',
        nodeId: 'node-1',
        operation: 'generate-image',
        provider: 'openai',
        model: 'gpt-image-2',
        status: GenerationTaskStatus.RUNNING,
        progress: 0,
        inputSnapshot: { prompt: 'Already saved' },
        inputHash: 'a'.repeat(64),
        parameters: {},
        rootTaskId: 'recoverable-task',
        attempt: 1,
        createdAt: now,
        startedAt: now,
        updatedAt: now
    }));
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async () => assert.fail('Recovered task must not execute again'),
        recoverInterruptedTask: async task => ({
            resultUrl: `/library/images/${task.taskId}.png`,
            take: { id: 'take-recovered' }
        })
    });
    await manager.initialize();

    const recovered = manager.getTask('recoverable-task');
    assert.equal(recovered.status, GenerationTaskStatus.SUCCEEDED);
    assert.equal(recovered.progress, 100);
    assert.equal(recovered.output.take.id, 'take-recovered');
});

test('repository ignores persisted task ids that are unsafe as filenames', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(tasksDir, 'unsafe.json'), JSON.stringify({
        taskId: '../escape',
        status: GenerationTaskStatus.QUEUED
    }));
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async () => ({ resultUrl: '/library/images/result.png' })
    });
    await manager.initialize();

    assert.equal(manager.getTask('../escape'), null);
});

test('batch query filters tasks without exposing mutable repository objects', async t => {
    const tasksDir = createTempTasksDir();
    t.after(() => fs.rmSync(tasksDir, { recursive: true, force: true }));
    const manager = createGenerationTaskManager({
        tasksDir,
        concurrency: 1,
        executor: async task => ({ resultUrl: `/library/images/${task.taskId}.png` })
    });
    await manager.initialize();

    const first = await manager.submitTask(createSubmission({ nodeId: 'node-a' }));
    const second = await manager.submitTask(createSubmission({ nodeId: 'node-b' }));
    const queried = manager.queryTasks({ taskIds: [first.task.taskId], workflowId: 'workflow-1' });
    assert.equal(queried.length, 1);
    queried[0].nodeId = 'mutated';
    assert.equal(manager.getTask(first.task.taskId).nodeId, 'node-a');
    await waitForStatus(manager, second.task.taskId, GenerationTaskStatus.SUCCEEDED);
});
