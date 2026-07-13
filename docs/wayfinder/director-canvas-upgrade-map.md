# Wayfinder Map: Director Canvas Upgrade

## Destination

Produce an implementation-ready plan for upgrading the existing TwitCanva canvas into an AI creative director workstation MVP, centered on story-driven script generation, storyboard generation, auto graph creation, first-class groups, workflow execution, Take/Hero Take, and a Director Node.

## Notes

Use these skills and constraints for the effort: wayfinder, brainstorming, domain-modeling, research, planning-with-files, confidence-check, to-prd, to-issues, and Linear readiness. The current project should be upgraded incrementally; do not replace the canvas, do not migrate frameworks in the MVP, and do not implement before the PRD and issue breakdown are accepted.

## Decisions so far

- [Incremental Local Agent Architecture for the Director Canvas MVP](../adr/0001-incremental-local-agent-architecture.md) - Build beside the existing React/Vite + Express project using local JSON/file storage first, then migrate later only when needed.
- [Director Canvas Domain](../../CONTEXT.md) - Use consistent domain language for Node, Edge, Group, Shot, Take, Hero Take, Workflow Run, Provider, and Director Workbench.

## Not yet specified

- Exact UI shape of the Director Node and whether it should be a large canvas node, a side panel, or both.
- Exact persistence boundary for Take Store in MVP: embedded workflow JSON versus separate JSON files under `library/takes`.
- Exact model routing for script generation: OpenAI first, Gemini fallback, or user-selectable.
- Whether the first storyboard output should create only a Storyboard Node or also create child Shot Nodes.
- Whether Linear issues should be published under an existing user Linear project or remain as local Markdown until implementation starts.

## Out of scope

- Real-time multi-user collaboration.
- Workflow marketplace or template marketplace.
- Commercial billing, team permissions, or public API platform.
- Full nonlinear video editing suite.
- Replacing the existing canvas engine in the MVP.
