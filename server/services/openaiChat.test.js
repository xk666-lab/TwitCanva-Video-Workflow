import test from 'node:test';
import assert from 'node:assert/strict';

import { requestChatCompletion } from './openaiChat.js';

test('requestChatCompletion posts to an OpenAI-compatible chat endpoint', async () => {
    const calls = [];
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({
            choices: [
                { message: { content: 'story package json' } }
            ]
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };

    try {
        const result = await requestChatCompletion({
            apiKey: 'test-key',
            baseURL: 'https://example.test/v1',
            model: 'gpt-test',
            chatCompletionsPath: '/chat/completions',
            messages: [{ role: 'user', content: 'hello' }]
        });

        assert.equal(result, 'story package json');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, 'https://example.test/v1/chat/completions');
        assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key');
        assert.deepEqual(JSON.parse(calls[0].options.body), {
            model: 'gpt-test',
            messages: [{ role: 'user', content: 'hello' }]
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('requestChatCompletion requires an API key', async () => {
    await assert.rejects(
        requestChatCompletion({
            apiKey: '',
            messages: [{ role: 'user', content: 'hello' }]
        }),
        /OpenAI API key is not configured/
    );
});
