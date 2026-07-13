import express from 'express';
import chatAgent from '../agent/index.js';

const router = express.Router();

router.post('/chat', async (req, res) => {
    try {
        const { sessionId, message, media } = req.body;
        const { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_TEXT_MODEL, OPENAI_CHAT_COMPLETIONS_PATH, GEMINI_API_KEY } = req.app.locals;

        if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
        if (!message && !media) return res.status(400).json({ error: "message or media is required" });

        const chatConfig = OPENAI_API_KEY
            ? {
                provider: 'openai',
                apiKey: OPENAI_API_KEY,
                baseURL: OPENAI_BASE_URL,
                model: OPENAI_TEXT_MODEL,
                chatCompletionsPath: OPENAI_CHAT_COMPLETIONS_PATH,
            }
            : GEMINI_API_KEY
                ? { provider: 'gemini', apiKey: GEMINI_API_KEY }
                : null;

        if (!chatConfig) {
            return res.status(500).json({
                error: "Server missing chat API key config. Add OPENAI_API_KEY or GEMINI_API_KEY to .env"
            });
        }

        const result = await chatAgent.sendMessage(sessionId, message, media, chatConfig);
        res.json({
            success: true,
            response: result.response,
            topic: result.topic,
            messageCount: result.messageCount
        });
    } catch (error) {
        console.error("Chat API Error:", error);
        res.status(500).json({ error: error.message || "Chat failed" });
    }
});

router.get('/chat/sessions', async (_req, res) => {
    try {
        res.json(chatAgent.listSessions());
    } catch (error) {
        console.error("List sessions error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.delete('/chat/sessions/:id', async (req, res) => {
    try {
        chatAgent.deleteSession(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error("Delete session error:", error);
        res.status(500).json({ error: error.message });
    }
});

router.get('/chat/sessions/:id', async (req, res) => {
    try {
        const sessionData = chatAgent.getSessionData(req.params.id);
        if (!sessionData) return res.status(404).json({ error: "Session not found" });
        res.json(sessionData);
    } catch (error) {
        console.error("Get session error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
