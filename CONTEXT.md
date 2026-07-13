# Director Canvas Domain

This context defines the shared language for upgrading the current canvas project into an AI creative director workstation. It describes product-domain concepts only, not implementation details.

## Language

**Director Canvas**:
An AI creative workspace where a user can move from story idea to script, storyboard, assets, generated media, and final preview inside one infinite canvas.
_Avoid_: whiteboard, generic canvas, ComfyUI shell

**Canvas**:
The spatial workspace where nodes, edges, groups, and generated media are arranged and edited.
_Avoid_: page, board, document

**Node**:
A typed creative unit on the canvas that can hold input, produce output, and participate in a workflow.
_Avoid_: card, block, widget

**Edge**:
A directed dependency between nodes that passes a specific output into a specific input.
_Avoid_: line, connector when discussing data flow

**Group**:
A first-class workflow unit that contains related nodes and edges, can be moved or run together, and may become a reusable template.
_Avoid_: frame, visual box

**Director Workbench**:
The product mode that summarizes a project across script, storyboard, shots, assets, takes, progress, preview, and export.
_Avoid_: dashboard when referring to the creative control surface

**Script**:
The structured narrative output generated from a user story or brief, including title, logline, characters, scenes, and shot candidates.
_Avoid_: prompt, copy

**Storyboard**:
An ordered set of shots derived from a script, intended to guide image and video generation.
_Avoid_: script, timeline

**Shot**:
A single planned camera unit with action, composition, duration, camera language, references, and generation prompts.
_Avoid_: scene, frame

**Character**:
A reusable identity asset describing a role's appearance, clothing, personality, and reference media.
_Avoid_: person, model

**Scene**:
A reusable environment asset describing location, time, lighting, mood, and visual references.
_Avoid_: shot, background

**Prop**:
A reusable object asset that can appear in one or more shots.
_Avoid_: item when referring to production assets

**Asset**:
A reusable creative resource such as an image, video, audio clip, character, scene, prop, style, or prompt.
_Avoid_: file when referring to creative meaning

**Take**:
One generated version of a node output, preserved non-destructively so the user can compare or regenerate without losing prior results.
_Avoid_: result when versioning matters

**Hero Take**:
The selected take that downstream nodes should use by default.
_Avoid_: selected result, final version

**aiBrief**:
A concise, model-ready summary of a node's creative meaning for downstream prompt generation.
_Avoid_: description when referring to machine-readable creative context

**Graph Patch**:
A proposed canvas mutation that can add, update, connect, group, or layout nodes as one reviewable change.
_Avoid_: direct agent edit

**Workflow Run**:
An execution instance for a node, group, or canvas, with progress, logs, tasks, and final status.
_Avoid_: generation when multiple nodes are involved

**Provider**:
An external or local AI capability that can generate text, images, video, audio, or structured outputs.
_Avoid_: model when referring to the integration boundary

**Activity Feed**:
The visible history of workflow runs, task progress, errors, retries, cancellations, and completed outputs.
_Avoid_: console, logs when referring to user-facing status
