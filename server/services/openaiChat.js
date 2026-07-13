/**
 * OpenAI-compatible chat service.
 *
 * Uses a plain HTTP call so custom base URLs and chat completion paths from
 * .env work with OpenAI-compatible gateways.
 */

import { CHAT_AGENT_SYSTEM_PROMPT, TOPIC_GENERATION_PROMPT } from "../agent/prompts/system.js";

function normalizeEndpoint(baseURL, chatCompletionsPath) {
    const cleanBaseURL = (baseURL || "https://api.openai.com/v1").replace(/\/+$/, "");
    const normalizedPath = chatCompletionsPath || "/chat/completions";
    const cleanPath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;

    if (/\/chat\/completions\/?$/.test(cleanBaseURL) && cleanPath === "/chat/completions") {
        return cleanBaseURL;
    }

    return `${cleanBaseURL}${cleanPath}`;
}

function extractResponseText(data) {
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === "string") {
        return content;
    }

    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (typeof part === "string") return part;
                if (part?.type === "text") return part.text || "";
                return "";
            })
            .join("")
            .trim();
    }

    if (typeof data?.output_text === "string") {
        return data.output_text;
    }

    return "";
}

function extractErrorMessage(data, fallbackText) {
    if (typeof data?.error?.message === "string") return data.error.message;
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.message === "string") return data.message;
    return fallbackText;
}

function toOpenAIContent(content) {
    if (typeof content === "string") {
        return content || " ";
    }

    if (!Array.isArray(content)) {
        return String(content ?? " ");
    }

    const parts = [];

    for (const part of content) {
        if (part?.type === "text") {
            parts.push({ type: "text", text: part.text || " " });
            continue;
        }

        if (part?.type === "image_url" && part.image_url?.url) {
            const url = part.image_url.url;

            if (url.startsWith("data:video/")) {
                parts.push({
                    type: "text",
                    text: "[A video was attached, but this chat endpoint can only receive text/images.]",
                });
                continue;
            }

            parts.push({
                type: "image_url",
                image_url: { url },
            });
        }
    }

    if (parts.length === 0) {
        return " ";
    }

    if (parts.length === 1 && parts[0].type === "text") {
        return parts[0].text;
    }

    return parts;
}

function toOpenAIMessage(message) {
    const type = message._getType?.();
    const role = type === "human" ? "user" : type === "system" ? "system" : "assistant";

    return {
        role,
        content: toOpenAIContent(message.content),
    };
}

export async function requestChatCompletion({ messages, apiKey, baseURL, model, chatCompletionsPath }) {
    if (!apiKey) {
        throw new Error("OpenAI API key is not configured. Add OPENAI_API_KEY to .env");
    }

    const endpoint = normalizeEndpoint(baseURL, chatCompletionsPath);
    const timeoutMs = Number(process.env.OPENAI_TEXT_TIMEOUT_MS || 120000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: model || process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini",
                messages,
            }),
            signal: controller.signal,
        });

        const responseText = await response.text();
        let data = null;

        try {
            data = responseText ? JSON.parse(responseText) : null;
        } catch {
            data = null;
        }

        if (!response.ok) {
            const details = extractErrorMessage(data, responseText || response.statusText);
            throw new Error(`OpenAI chat failed (${response.status}): ${details}`);
        }

        const text = extractResponseText(data);
        if (!text) {
            throw new Error("OpenAI chat returned an empty response");
        }

        return text.trim();
    } catch (error) {
        if (error?.name === "AbortError") {
            throw new Error(`OpenAI chat timed out after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export async function generateOpenAIChatResponse({ messages, apiKey, baseURL, model, chatCompletionsPath }) {
    const openAIMessages = [
        { role: "system", content: CHAT_AGENT_SYSTEM_PROMPT },
        ...messages.map(toOpenAIMessage),
    ];

    return await requestChatCompletion({
        messages: openAIMessages,
        apiKey,
        baseURL,
        model,
        chatCompletionsPath,
    });
}

export async function generateOpenAITopicTitle({ messages, apiKey, baseURL, model, chatCompletionsPath }) {
    const contextMessages = messages.slice(0, 6);
    const conversationSummary = contextMessages
        .map(m => `${m._getType?.() === "human" ? "User" : "Assistant"}: ${typeof m.content === "string" ? m.content : "[Media message]"}`)
        .join("\n");

    const prompt = `${TOPIC_GENERATION_PROMPT}\n\nConversation:\n${conversationSummary}`;
    const title = await requestChatCompletion({
        messages: [{ role: "user", content: prompt }],
        apiKey,
        baseURL,
        model,
        chatCompletionsPath,
    });

    return title
        .replace(/^["']|["']$/g, "")
        .split("\n")[0]
        .trim()
        .slice(0, 80) || "New Chat";
}
