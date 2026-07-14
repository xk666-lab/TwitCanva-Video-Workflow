import express from 'express';

import {
    WorkflowTemplateStorageError,
    WorkflowTemplateValidationError,
    createWorkflowTemplateService
} from '../services/workflowTemplates.js';

function sendTemplateError(res, error, action) {
    if (error instanceof WorkflowTemplateValidationError) {
        return res.status(400).json({ error: error.message });
    }
    if (error instanceof WorkflowTemplateStorageError) {
        console.error(`Workflow template ${action} error:`, error.message);
        return res.status(500).json({ error: error.message });
    }
    console.error(`Workflow template ${action} error:`, error);
    return res.status(500).json({ error: `Could not ${action} workflow template.` });
}

export function createWorkflowTemplateRoutes({ createService = createWorkflowTemplateService } = {}) {
    const router = express.Router();

    function serviceFor(req) {
        return createService({ templatesDir: req.app.locals.WORKFLOW_TEMPLATES_DIR });
    }

    router.get('/workflow-templates', (req, res) => {
        try {
            return res.json(serviceFor(req).list());
        } catch (error) {
            return sendTemplateError(res, error, 'list');
        }
    });

    router.get('/workflow-templates/:id', (req, res) => {
        try {
            const template = serviceFor(req).get(req.params.id);
            if (!template) return res.status(404).json({ error: 'Workflow template not found.' });
            return res.json(template);
        } catch (error) {
            return sendTemplateError(res, error, 'load');
        }
    });

    router.post('/workflow-templates', (req, res) => {
        try {
            const template = serviceFor(req).create(req.body);
            return res.status(201).json({ success: true, template });
        } catch (error) {
            return sendTemplateError(res, error, 'save');
        }
    });

    router.delete('/workflow-templates/:id', (req, res) => {
        try {
            const deleted = serviceFor(req).remove(req.params.id);
            if (!deleted) return res.status(404).json({ error: 'Workflow template not found.' });
            return res.json({ success: true });
        } catch (error) {
            return sendTemplateError(res, error, 'delete');
        }
    });

    return router;
}

export default createWorkflowTemplateRoutes();
