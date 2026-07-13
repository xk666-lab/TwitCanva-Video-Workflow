# AI Director Canvas Reference Projects

This note captures practical ideas from the reference projects and maps them to this codebase.

## Sources

- [SparkSylva/Infinite-Canvas-AI-Omnigen](https://github.com/SparkSylva/Infinite-Canvas-AI-Omnigen)
- [crisng95/flowboard](https://github.com/crisng95/flowboard)
- [11cafe/jaaz README_zh.md](https://github.com/11cafe/jaaz/blob/main/README_zh.md)
- [inlineresearch/Inline-Studio](https://github.com/inlineresearch/Inline-Studio)

## What To Borrow

### Infinite-Canvas-AI-Omnigen

Useful ideas:
- Keep the MVP lightweight: an infinite canvas that can generate/edit images and process video frames without a heavy orchestration layer.
- Client-facing model settings are useful for fast setup, but production API keys should stay behind the local backend when possible.
- Browser-side media utilities such as frame extraction and trimming are worth keeping for quick creator workflows.

How to apply here:
- Keep the current Vite + local Express setup as the MVP shell.
- Add simple creator-facing model settings in the UI, but persist real secrets in `.env` / backend config.
- Reuse this idea for future "extract frame -> image node -> Seedance video node" flows.

### Flowboard

Useful ideas:
- Treat reference images, products, characters, image outputs, and video outputs as real graph nodes instead of loose canvas objects.
- Edges should represent data dependencies: character + product -> composed image -> video.
- Auto-prompts should be synthesized from upstream context, not manually retyped for every node.
- A local agent/worker can own graph state, media cache, generation history, and task execution.

How to apply here:
- Promote `character`, `scene`, `prop`, `storyboard`, `image`, and `video` into first-class node roles.
- Add `aiBrief` to nodes so downstream image/video prompts can be composed automatically.
- Add "run from this node" and "rerun downstream" once node dependency metadata is stable.

### Jaaz

Useful ideas:
- Position the product as a local-first multimodal creative agent, closer to "Canva + Manus" than a raw node editor.
- Chat should be able to insert objects, transfer style, and control canvas actions.
- Hybrid local/remote model support is important: Ollama/ComfyUI locally, OpenAI/Claude/Replicate/etc remotely.
- The user can create images/videos through natural language instead of learning prompt engineering first.

How to apply here:
- Expand the existing chat panel into a canvas agent that can create nodes, connect nodes, and run workflows.
- Keep "story input -> script package -> storyboard nodes" as the first director workflow.
- Add settings that show which provider is active for chat, image, video, storage, and local models.

### Inline Studio

Useful ideas:
- It is a film-making canvas rather than a generic whiteboard: moodboard to final cut on one board.
- Every render should create a versioned non-destructive Take; choosing the keeper should flow downstream.
- Chain frames/shots so one output can feed the next.
- A Video Director node can be a timeline-in-a-node for preview, audio layering, ordering, and export.
- Hosted closed models and bring-your-own ComfyUI can coexist.

How to apply here:
- Introduce `Take[]` and `heroTakeId` on image/video nodes before building complex editing.
- Build a simple Director node after storyboard/video nodes exist: ordered clips, hero takes, preview, export.
- Keep Seedance and GPT as hosted provider nodes now; add ComfyUI later as a provider adapter, not a replacement.

## Immediate Product Direction

The current project should not be rewritten into ReactFlow or Electron right away. Its existing canvas already supports nodes, media, connections, grouping, chat, and local backend services. The best upgrade path is incremental:

1. Add story package generation to the existing Storyboard Generator.
2. Store the generated synopsis, style anchor, character DNA, and scenes as reusable workflow context.
3. Create storyboard/image nodes from that context.
4. Add `aiBrief` to generated nodes so image/video prompts can inherit story, character, scene, and shot context.
5. Add Take/Hero Take metadata to generated media.
6. Add a Director node that reads storyboard/video nodes and assembles a first preview.

## First Batch Added In This Pass

- GPT/OpenAI-compatible story package generation service.
- `/api/storyboard/generate-story-package` backend endpoint.
- OpenAI-compatible fallback for storyboard script generation, brainstorming, and optimization when Gemini is not configured.
- Frontend one-click entry in the Storyboard Generator: story idea -> polished story -> storyboard scripts.

## Next Best Features

- Asset roles: mark library items as character / scene / prop / style and expose that in node data.
- `aiBrief` generation: each text/story/image/asset node should summarize itself for downstream prompt composition.
- Take store: every image/video generation appends a take; user can choose Hero Take.
- Story workflow group: auto-create a visual group containing Text -> Script Generator -> Storyboard/Image nodes.
- Director node MVP: collect clips, order them, preview, and export a simple project JSON.
