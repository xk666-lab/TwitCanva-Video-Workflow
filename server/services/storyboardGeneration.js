import { GoogleGenerativeAI } from '@google/generative-ai';
import { requestChatCompletion } from './openaiChat.js';
import { generateStoryPackage } from './storyboardText.js';

export function normalizeTextReferences({ characterDescriptions = [], referenceImages = [] }) {
    if (Array.isArray(characterDescriptions) && characterDescriptions.length > 0) {
        return characterDescriptions.map(character => ({
            name: character.name,
            description: [
                character.description,
                character.category ? `category: ${character.category}` : ''
            ].filter(Boolean).join('; ') || 'Reference asset'
        }));
    }
    return Array.isArray(referenceImages)
        ? referenceImages.map(reference => ({
            name: reference.name,
            description: `${reference.category || 'Reference'} visual asset selected from the canvas library`
        }))
        : [];
}

export function resolveStoryboardTextProvider(locals) {
    if (locals.OPENAI_API_KEY) {
        return { provider: 'openai', model: locals.OPENAI_TEXT_MODEL || 'gpt-4.1-mini' };
    }
    if (locals.GEMINI_API_KEY) {
        return { provider: 'gemini', model: 'gemini-2.0-flash' };
    }
    throw new Error('No text generation API key configured. Add OPENAI_API_KEY or GEMINI_API_KEY to .env');
}

export async function retryOperation(operation, maxRetries = 3, initialDelayMs = 2000) {
    let delay = initialDelayMs;
    for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
    throw new Error('Storyboard provider retry loop ended unexpectedly');
}

async function defaultOpenAIRequest(locals, messages) {
    return retryOperation(() => requestChatCompletion({
        messages,
        apiKey: locals.OPENAI_API_KEY,
        baseURL: locals.OPENAI_BASE_URL,
        model: locals.OPENAI_TEXT_MODEL,
        chatCompletionsPath: locals.OPENAI_CHAT_COMPLETIONS_PATH
    }));
}

export function createOpenAIStoryboardRequester(locals) {
    return locals.OPENAI_API_KEY
        ? messages => defaultOpenAIRequest(locals, messages)
        : null;
}

async function defaultGeminiRequest(locals, messages) {
    const genAI = new GoogleGenerativeAI(locals.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const prompt = messages.map(message => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n');
    const result = await retryOperation(() => model.generateContent(prompt));
    return result.response.text();
}

export async function generateStoryPackageWithConfiguredProvider({
    locals,
    payload,
    dependencies = {}
}) {
    const selected = resolveStoryboardTextProvider(locals);
    const requestText = selected.provider === 'openai'
        ? messages => (dependencies.requestOpenAI
            ? dependencies.requestOpenAI(messages)
            : defaultOpenAIRequest(locals, messages))
        : messages => (dependencies.requestGemini
            ? dependencies.requestGemini(messages)
            : defaultGeminiRequest(locals, messages));
    const result = await generateStoryPackage({
        ...payload,
        characterDescriptions: normalizeTextReferences(payload),
        requestText
    });
    return { ...result, provider: selected.provider, model: selected.model };
}
