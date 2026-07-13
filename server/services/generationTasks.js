import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

export const GENERATION_TASK_SCHEMA_VERSION = 1;

export const GenerationTaskStatus = Object.freeze({
    DRAFT: 'draft',
    VALIDATING: 'validating',
    QUEUED: 'queued',
    RUNNING: 'running',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
});

const TERMINAL_STATUSES = new Set([
    GenerationTaskStatus.SUCCEEDED,
    GenerationTaskStatus.FAILED,
    GenerationTaskStatus.CANCELLED
]);

const ACTIVE_STATUSES = new Set([
    GenerationTaskStatus.DRAFT,
    GenerationTaskStatus.VALIDATING,
    GenerationTaskStatus.QUEUED,
    GenerationTaskStatus.RUNNING
]);

const SAFE_TASK_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const SENSITIVE_TASK_FIELD_PATTERN = /(api.?key|authorization|access.?key|secret.?key|bearer.?token)/i;

const ALLOWED_TRANSITIONS = new Map([
    [GenerationTaskStatus.DRAFT, new Set([
        GenerationTaskStatus.VALIDATING,
        GenerationTaskStatus.CANCELLED
    ])],
    [GenerationTaskStatus.VALIDATING, new Set([
        GenerationTaskStatus.QUEUED,
        GenerationTaskStatus.FAILED,
        GenerationTaskStatus.CANCELLED
    ])],
    [GenerationTaskStatus.QUEUED, new Set([
        GenerationTaskStatus.RUNNING,
        GenerationTaskStatus.FAILED,
        GenerationTaskStatus.CANCELLED
    ])],
    [GenerationTaskStatus.RUNNING, new Set([
        GenerationTaskStatus.SUCCEEDED,
        GenerationTaskStatus.FAILED,
        GenerationTaskStatus.CANCELLED
    ])]
]);

function cloneJson(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
}

function sanitizeTaskValue(value) {
    if (Array.isArray(value)) return value.map(item => sanitizeTaskValue(item));
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .filter(([key]) => !SENSITIVE_TASK_FIELD_PATTERN.test(key))
                .map(([key, item]) => [key, sanitizeTaskValue(item)])
        );
    }
    return value;
}

function canonicalize(value) {
    if (Array.isArray(value)) {
        return `[${value.map(item => canonicalize(item)).join(',')}]`;
    }

    if (value && typeof value === 'object') {
        const entries = Object.keys(value)
            .sort()
            .filter(key => value[key] !== undefined)
            .map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
        return `{${entries.join(',')}}`;
    }

    return JSON.stringify(value);
}

export function hashGenerationTaskInput(inputSnapshot) {
    return crypto.createHash('sha256').update(canonicalize(inputSnapshot)).digest('hex');
}

export function isGenerationTaskTransitionAllowed(fromStatus, toStatus) {
    return ALLOWED_TRANSITIONS.get(fromStatus)?.has(toStatus) || false;
}

export function isGenerationTaskTerminal(status) {
    return TERMINAL_STATUSES.has(status);
}

function normalizeTaskError(error) {
    const message = error instanceof Error ? error.message : String(error || 'Generation failed');
    const normalized = message.toLowerCase();

    if (error instanceof TypeError) {
        return { code: 'VALIDATION_ERROR', message, retryable: false };
    }
    if (/api key|credentials not configured|missing api/i.test(message)) {
        return {
            code: 'MISSING_API_KEY',
            message,
            retryable: false,
            recoverySuggestion: 'Configure the provider API key on the server before retrying.'
        };
    }
    if (/permission_denied|unauthori[sz]ed|forbidden|\b401\b|\b403\b/.test(normalized)) {
        return { code: 'PROVIDER_AUTH_ERROR', message, retryable: false };
    }
    if (/rate limit|too many requests|\b429\b/.test(normalized)) {
        return { code: 'PROVIDER_RATE_LIMIT', message, retryable: true };
    }
    if (/timeout|timed out/.test(normalized)) {
        return { code: 'PROVIDER_TIMEOUT', message, retryable: true };
    }
    if (/invalid_argument|rejected input|unable to process input/.test(normalized)) {
        return { code: 'PROVIDER_REJECTED_INPUT', message, retryable: false };
    }
    if (/network|failed to fetch|socket|econnreset|enotfound/.test(normalized)) {
        return { code: 'NETWORK_ERROR', message, retryable: true };
    }

    return { code: 'UNKNOWN_ERROR', message, retryable: true };
}

function assertSubmission(submission) {
    if (!submission || typeof submission !== 'object') {
        throw new TypeError('Generation task submission is required');
    }
    if (!submission.nodeId || typeof submission.nodeId !== 'string') {
        throw new TypeError('nodeId is required');
    }
    if (!submission.operation || typeof submission.operation !== 'string') {
        throw new TypeError('operation is required');
    }
    if (!submission.provider || typeof submission.provider !== 'string') {
        throw new TypeError('provider is required');
    }
    if (!submission.model || typeof submission.model !== 'string') {
        throw new TypeError('model is required');
    }
    if (!submission.inputSnapshot || typeof submission.inputSnapshot !== 'object') {
        throw new TypeError('inputSnapshot is required');
    }
}

function writeTaskAtomic(tasksDir, task) {
    if (!SAFE_TASK_ID_PATTERN.test(task.taskId)) {
        throw new Error(`Unsafe generation task id: ${task.taskId}`);
    }
    const targetPath = path.join(tasksDir, `${task.taskId}.json`);
    const temporaryPath = path.join(tasksDir, `${task.taskId}.${crypto.randomUUID()}.tmp`);
    fs.writeFileSync(temporaryPath, JSON.stringify(task, null, 2), 'utf8');
    fs.renameSync(temporaryPath, targetPath);
}

function readPersistedTasks(tasksDir) {
    if (!fs.existsSync(tasksDir)) return [];

    const tasks = [];
    for (const filename of fs.readdirSync(tasksDir)) {
        if (!filename.endsWith('.json')) continue;
        try {
            const task = JSON.parse(fs.readFileSync(path.join(tasksDir, filename), 'utf8'));
            if (task && typeof task.taskId === 'string' && SAFE_TASK_ID_PATTERN.test(task.taskId)) {
                tasks.push(task);
            } else {
                console.warn(`[GenerationTasks] Ignoring task file ${filename} with an unsafe or missing task id.`);
            }
        } catch (error) {
            console.warn(`[GenerationTasks] Ignoring invalid task file ${filename}:`, error.message);
        }
    }
    return tasks;
}

export function createGenerationTaskManager({
    tasksDir,
    executor,
    recoverInterruptedTask,
    concurrency = 2,
    now = () => new Date().toISOString()
}) {
    if (!tasksDir) throw new TypeError('tasksDir is required');
    if (typeof executor !== 'function') throw new TypeError('executor is required');

    const maxConcurrency = Math.max(1, Number(concurrency) || 1);
    const tasks = new Map();
    const queue = [];
    const events = new EventEmitter();
    let activeExecutions = 0;
    let pumpScheduled = false;

    function persist(task) {
        const stored = cloneJson(task);
        writeTaskAtomic(tasksDir, stored);
        tasks.set(stored.taskId, stored);
        events.emit(`task:${stored.taskId}`, cloneJson(stored));
        return cloneJson(stored);
    }

    function getStoredTask(taskId) {
        return tasks.get(taskId) || null;
    }

    function transitionTask(taskId, nextStatus, updates = {}) {
        const current = getStoredTask(taskId);
        if (!current) throw new Error(`Generation task not found: ${taskId}`);
        if (!isGenerationTaskTransitionAllowed(current.status, nextStatus)) {
            throw new Error(`Invalid generation task transition: ${current.status} -> ${nextStatus}`);
        }

        const timestamp = now();
        const next = {
            ...current,
            ...cloneJson(updates),
            status: nextStatus,
            updatedAt: timestamp
        };
        if (nextStatus === GenerationTaskStatus.RUNNING && !next.startedAt) {
            next.startedAt = timestamp;
        }
        if (isGenerationTaskTerminal(nextStatus) && !next.completedAt) {
            next.completedAt = timestamp;
        }
        return persist(next);
    }

    function schedulePump() {
        if (pumpScheduled) return;
        pumpScheduled = true;
        queueMicrotask(() => {
            pumpScheduled = false;
            pump();
        });
    }

    function settleExecution(taskId, status, updates) {
        const current = getStoredTask(taskId);
        if (!current || current.status === GenerationTaskStatus.CANCELLED) return;
        if (current.status !== GenerationTaskStatus.RUNNING) return;
        transitionTask(taskId, status, updates);
    }

    function startExecution(taskId) {
        const runningTask = transitionTask(taskId, GenerationTaskStatus.RUNNING, { progress: 0 });
        activeExecutions += 1;

        let execution;
        try {
            execution = executor(cloneJson(runningTask));
        } catch (error) {
            execution = Promise.reject(error);
        }

        Promise.resolve(execution)
            .then(output => {
                const providerTaskId = output?.providerTaskId;
                const normalizedOutput = output && typeof output === 'object'
                    ? Object.fromEntries(Object.entries(output).filter(([key]) => key !== 'providerTaskId'))
                    : output;
                settleExecution(taskId, GenerationTaskStatus.SUCCEEDED, {
                    progress: 100,
                    output: cloneJson(normalizedOutput),
                    providerTaskId: providerTaskId || runningTask.providerTaskId,
                    error: undefined
                });
            })
            .catch(error => {
                settleExecution(taskId, GenerationTaskStatus.FAILED, {
                    progress: 0,
                    error: normalizeTaskError(error)
                });
            })
            .finally(() => {
                activeExecutions -= 1;
                schedulePump();
            });
    }

    function pump() {
        while (activeExecutions < maxConcurrency && queue.length > 0) {
            const taskId = queue.shift();
            const task = getStoredTask(taskId);
            if (!task || task.status !== GenerationTaskStatus.QUEUED) continue;
            startExecution(taskId);
        }
    }

    async function initialize() {
        fs.mkdirSync(tasksDir, { recursive: true });
        for (const task of readPersistedTasks(tasksDir)) {
            tasks.set(task.taskId, cloneJson(task));
        }

        for (const task of tasks.values()) {
            if (task.status === GenerationTaskStatus.QUEUED) {
                queue.push(task.taskId);
                continue;
            }

            if (task.status === GenerationTaskStatus.RUNNING && typeof recoverInterruptedTask === 'function') {
                try {
                    const recoveredOutput = await recoverInterruptedTask(cloneJson(task));
                    if (recoveredOutput?.resultUrl) {
                        const { providerTaskId, ...output } = recoveredOutput;
                        persist({
                            ...task,
                            status: GenerationTaskStatus.SUCCEEDED,
                            progress: 100,
                            output: cloneJson(output),
                            providerTaskId: providerTaskId || task.providerTaskId,
                            error: undefined,
                            completedAt: now(),
                            updatedAt: now()
                        });
                        continue;
                    }
                } catch (error) {
                    console.warn(`[GenerationTasks] Failed to reconcile interrupted task ${task.taskId}:`, error.message);
                }
            }

            if ([
                GenerationTaskStatus.DRAFT,
                GenerationTaskStatus.VALIDATING,
                GenerationTaskStatus.RUNNING
            ].includes(task.status)) {
                persist({
                    ...task,
                    status: GenerationTaskStatus.FAILED,
                    progress: 0,
                    error: {
                        code: 'SERVER_RESTARTED',
                        message: 'The server restarted before this generation could be completed safely.',
                        retryable: true,
                        recoverySuggestion: 'Retry the task to create a new generation attempt.'
                    },
                    completedAt: now(),
                    updatedAt: now()
                });
            }
        }

        schedulePump();
    }

    async function submitTask(submission, options = {}) {
        assertSubmission(submission);
        const inputSnapshot = cloneJson(sanitizeTaskValue(submission.inputSnapshot));
        const parameters = cloneJson(sanitizeTaskValue(submission.parameters || {}));
        const inputHash = hashGenerationTaskInput(inputSnapshot);
        const idempotencyKey = submission.idempotencyKey || undefined;

        if (idempotencyKey) {
            const idempotentTask = [...tasks.values()].find(task => task.idempotencyKey === idempotencyKey);
            if (idempotentTask) return { task: cloneJson(idempotentTask), reused: true };
        }

        if (options.allowActiveDedupe !== false) {
            const activeDuplicate = [...tasks.values()].find(task =>
                ACTIVE_STATUSES.has(task.status)
                && task.workflowId === (submission.workflowId ?? null)
                && task.nodeId === submission.nodeId
                && task.operation === submission.operation
                && task.inputHash === inputHash
            );
            if (activeDuplicate) return { task: cloneJson(activeDuplicate), reused: true };
        }

        const taskId = crypto.randomUUID();
        const timestamp = now();
        const task = persist({
            schemaVersion: GENERATION_TASK_SCHEMA_VERSION,
            taskId,
            workflowId: submission.workflowId ?? null,
            nodeId: submission.nodeId,
            operation: submission.operation,
            provider: submission.provider,
            model: submission.model,
            status: GenerationTaskStatus.DRAFT,
            progress: 0,
            inputSnapshot,
            inputHash,
            parameters,
            providerTaskId: submission.providerTaskId,
            retryOfTaskId: submission.retryOfTaskId,
            rootTaskId: submission.rootTaskId || taskId,
            attempt: submission.attempt || 1,
            idempotencyKey,
            createdAt: timestamp,
            updatedAt: timestamp
        });

        transitionTask(taskId, GenerationTaskStatus.VALIDATING);
        const queuedTask = transitionTask(taskId, GenerationTaskStatus.QUEUED);
        queue.push(taskId);
        schedulePump();
        return { task: queuedTask, reused: false };
    }

    async function cancelTask(taskId) {
        const current = getStoredTask(taskId);
        if (!current) throw new Error(`Generation task not found: ${taskId}`);
        if (isGenerationTaskTerminal(current.status)) return cloneJson(current);

        return transitionTask(taskId, GenerationTaskStatus.CANCELLED, {
            progress: 0,
            cancelRequestedAt: now(),
            cancellation: {
                requestedAt: now(),
                providerCancellationSupported: false
            },
            error: {
                code: 'CANCELLED',
                message: 'Cancellation requested. The provider may continue processing in the background.',
                retryable: true,
                recoverySuggestion: 'Retry to create a new task if generation is still needed.'
            }
        });
    }

    async function retryTask(taskId) {
        const previous = getStoredTask(taskId);
        if (!previous) throw new Error(`Generation task not found: ${taskId}`);
        if (![GenerationTaskStatus.FAILED, GenerationTaskStatus.CANCELLED].includes(previous.status)) {
            throw new Error(`Only failed or cancelled generation tasks can be retried: ${taskId}`);
        }

        const { task } = await submitTask({
            workflowId: previous.workflowId,
            nodeId: previous.nodeId,
            operation: previous.operation,
            provider: previous.provider,
            model: previous.model,
            inputSnapshot: previous.inputSnapshot,
            parameters: previous.parameters,
            retryOfTaskId: previous.taskId,
            rootTaskId: previous.rootTaskId || previous.taskId,
            attempt: (previous.attempt || 1) + 1
        }, { allowActiveDedupe: false });
        return task;
    }

    function getTask(taskId) {
        return cloneJson(getStoredTask(taskId));
    }

    function queryTasks(filters = {}) {
        const taskIds = Array.isArray(filters.taskIds) ? new Set(filters.taskIds) : null;
        const nodeIds = Array.isArray(filters.nodeIds) ? new Set(filters.nodeIds) : null;
        const statuses = Array.isArray(filters.statuses) ? new Set(filters.statuses) : null;

        return [...tasks.values()]
            .filter(task => !taskIds || taskIds.has(task.taskId))
            .filter(task => !nodeIds || nodeIds.has(task.nodeId))
            .filter(task => filters.workflowId === undefined || task.workflowId === filters.workflowId)
            .filter(task => !statuses || statuses.has(task.status))
            .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
            .map(task => cloneJson(task));
    }

    function waitForTask(taskId) {
        const current = getStoredTask(taskId);
        if (!current) return Promise.reject(new Error(`Generation task not found: ${taskId}`));
        if (isGenerationTaskTerminal(current.status)) return Promise.resolve(cloneJson(current));

        return new Promise(resolve => {
            const eventName = `task:${taskId}`;
            const listener = task => {
                if (!isGenerationTaskTerminal(task.status)) return;
                events.off(eventName, listener);
                resolve(cloneJson(task));
            };
            events.on(eventName, listener);
        });
    }

    return {
        initialize,
        submitTask,
        cancelTask,
        retryTask,
        getTask,
        queryTasks,
        waitForTask
    };
}
