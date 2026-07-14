import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import express from 'express';
import workflowRoutes from '../routes/workflows.js';

async function startWorkflowServer() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'twitcanva-workflow-audio-'));
    const libraryDir = path.join(root, 'library');
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.locals.WORKFLOWS_DIR = path.join(libraryDir, 'workflows');
    app.locals.IMAGES_DIR = path.join(libraryDir, 'images');
    app.locals.VIDEOS_DIR = path.join(libraryDir, 'videos');
    app.locals.AUDIO_DIR = path.join(libraryDir, 'audio');
    for (const directory of [app.locals.WORKFLOWS_DIR, app.locals.IMAGES_DIR, app.locals.VIDEOS_DIR, app.locals.AUDIO_DIR]) {
        fs.mkdirSync(directory, { recursive: true });
    }
    app.use('/api', workflowRoutes);
    const server = await new Promise(resolve => {
        const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });
    const address = server.address();
    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        libraryDir,
        close: async () => {
            await new Promise(resolve => server.close(resolve));
            fs.rmSync(root, { recursive: true, force: true });
        }
    };
}

test('workflow saves normalize legacy audio data URLs into the audio library', async t => {
    const server = await startWorkflowServer();
    t.after(server.close);
    const audio = Buffer.from('ID3-legacy-audio');

    const response = await fetch(`${server.baseUrl}/api/workflows`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            id: 'audio-workflow',
            title: 'Legacy audio workflow',
            nodes: [{
                id: 'audio-node',
                type: '音频',
                resultUrl: `data:audio/mpeg;base64,${audio.toString('base64')}`
            }]
        })
    });

    assert.equal(response.status, 200);
    const workflow = JSON.parse(fs.readFileSync(path.join(server.libraryDir, 'workflows', 'audio-workflow.json'), 'utf8'));
    assert.match(workflow.nodes[0].resultUrl, /^\/library\/audio\/wf_.*\.mp3$/);
    const filename = workflow.nodes[0].resultUrl.split('/').at(-1);
    assert.deepEqual(fs.readFileSync(path.join(server.libraryDir, 'audio', filename)), audio);
    assert.equal(fs.readdirSync(path.join(server.libraryDir, 'images')).length, 0);
});
