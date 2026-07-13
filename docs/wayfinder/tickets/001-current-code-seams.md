# Current Code Seams for Director Canvas Upgrade

## Question

Which existing frontend hooks, server routes, persistence APIs, and data structures can be reused as the first implementation seams for the Director Canvas MVP, and which seams need prefactoring before new director features are added?

## Type

wayfinder:research

## Initial Direction

Inspect `src/types.ts`, `src/hooks/useNodeManagement.ts`, `src/hooks/useGroupManagement.ts`, `src/hooks/useWorkflow.ts`, `src/hooks/useGeneration.ts`, `server/routes/storyboard.js`, `server/routes/generation.js`, and `server/index.js`.
