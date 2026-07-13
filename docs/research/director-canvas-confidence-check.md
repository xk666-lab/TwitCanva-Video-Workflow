# Confidence Check: Director Canvas MVP Planning

## Summary

Confidence: **0.92 / 1.00**

Status: **High confidence for PRD, architecture planning, and issue breakdown. Implementation should still start with the compatibility foundation slice, not the full director workflow at once.**

## Checks

### 1. No Duplicate Implementations? 0.20 / 0.25

Result: **Mostly pass**

The project already has related capabilities: storyboard generation, basic node groups, workflow save/load, image/video generation, Seedance integration, asset library, and chat. These are not full duplicates of the proposed Director Canvas MVP, but they overlap enough that implementation must reuse them instead of creating parallel systems.

Risk: creating a second storyboard system or second group system would fragment the project.

Mitigation: add adapters and semantic layers around existing capabilities.

### 2. Architecture Compliance? 0.25 / 0.25

Result: **Pass**

The recommended MVP keeps the existing React/Vite + Express architecture, local media storage, workflow JSON persistence, and current provider integrations. It does not introduce a new canvas engine, database, job queue, or cloud storage in the first implementation phase.

### 3. Official / Primary Sources Verified? 0.18 / 0.20

Result: **Pass with caveat**

Primary or first-party sources were checked for RunningHub, LibTV Skills, Infinite-Canvas-AI-Omnigen, Flowboard, Jaaz, and Inline Studio. LibTV's complete product behavior is less directly documented in an open primary source, so product-level LibTV inspiration should be treated as directional rather than as an exact implementation source.

### 4. Working OSS Implementations Referenced? 0.15 / 0.15

Result: **Pass**

Relevant working open-source references exist:
- Flowboard for local single-user AI media graph workflows.
- Inline Studio for AI filmmaking node canvas, versioned takes, Video Director, hosted models, and ComfyUI.
- Infinite-Canvas-AI-Omnigen for lightweight infinite canvas, video frame extraction, and client-heavy MVP shape.
- Jaaz for multimodal canvas agent and local privacy-first creative workflow.
- LibTV Skills for Agent-to-AIGC service calls.

### 5. Root Cause Identified? 0.14 / 0.15

Result: **Pass**

The core gap is not missing model integrations. The current project can already generate images/videos, but it lacks a director-domain layer that connects story, script, storyboard, assets, shots, takes, groups, execution state, and preview into one coherent workflow.

## Go / No-Go

**Go for planning and issue preparation.**

**Go for implementation only if the first slice is the compatibility foundation.**

Do not start by building Director Node, ComfyUI, timeline editing, or full asset management. Start by defining the director domain types, legacy adapters, node registry, and graph patch contract.

## Required Guardrails Before Coding

- Old workflow JSON must remain loadable.
- Script generation must produce validated structured JSON.
- Group v2 must wrap existing groups instead of replacing them abruptly.
- Take Store must preserve `resultUrl` fallback.
- Provider calls should be mockable for tests.
- Linear publication must wait for confirmed workspace/team/project/labels.
