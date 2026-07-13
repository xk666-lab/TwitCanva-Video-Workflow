# Linear-Ready Issues: Director Canvas MVP

> These issues are prepared for Linear publication but have not been created in Linear. Before publishing, confirm workspace, team, project, labels, priority, cycle, and due dates.

## Parent

PRD: [AI 创作型无限画布导演工作台 MVP](../prd/director-canvas-mvp-prd.md)

## Issue 1: Add Director Domain Compatibility Foundation

## What to build

Introduce the director-domain compatibility layer so existing canvas workflows can coexist with future director nodes, groups, workflow runs, and takes. This slice should define the core domain contracts and adapters without changing user-visible behavior.

## User stories covered

24, 25, 26, 27

## Acceptance criteria

- [ ] Existing workflows still load, display, and save.
- [ ] Director-domain types exist for Node, Edge, Group, Script, Storyboard, Shot, Character, Scene, Asset, Take, Workflow Run, and Provider.
- [ ] Legacy node and group data can be adapted into the new domain shape.
- [ ] No model generation behavior changes in this slice.

## Blocked by

None - can start immediately.

---

## Issue 2: Add Node Registry and Director Node Defaults

## What to build

Add a node registry that defines defaults, titles, handles, run capability, and Take capability for current and new director nodes. Use it when creating Text, Prompt, Script Generator, Storyboard, Image, Video, Output, and Director nodes.

## User stories covered

4, 17, 24, 25

## Acceptance criteria

- [ ] New nodes can be created from registry defaults.
- [ ] Existing node creation still works.
- [ ] Each MVP node has declared input and output handles.
- [ ] Registry does not force a full migration of old node data.

## Blocked by

- Issue 1: Add Director Domain Compatibility Foundation

---

## Issue 3: Implement Structured Script Generator Contract

## What to build

Build the structured contract for Script Generator output. A story input should produce a validated script object with title, logline, characters, scenes, shots, and aiBrief fields that downstream nodes can consume.

## User stories covered

1, 2, 3, 15

## Acceptance criteria

- [ ] Script Generator can accept story, style, duration, and shot-count inputs.
- [ ] Output validates against a schema.
- [ ] Invalid or incomplete model output produces a readable error.
- [ ] Generated script includes reusable characters, scenes, and ordered shots.

## Blocked by

- Issue 1: Add Director Domain Compatibility Foundation

---

## Issue 4: Create Story Quick-Create Graph Builder

## What to build

Build the Graph Builder path for the “故事脚本生成” shortcut. From a user story, create Text, Script Generator, and Storyboard nodes, connect them, lay them out, and prepare a group around them.

## User stories covered

1, 4, 5, 18

## Acceptance criteria

- [ ] Story quick-create creates exactly the expected initial nodes.
- [ ] Nodes are connected in the correct direction.
- [ ] Layout avoids obvious overlap with the click location.
- [ ] Graph creation is atomic or safely rolls back on failure.

## Blocked by

- Issue 2: Add Node Registry and Director Node Defaults
- Issue 3: Implement Structured Script Generator Contract

---

## Issue 5: Upgrade Group v2 Metadata and Auto Group UI

## What to build

Upgrade groups from simple visual collections into first-class workflow units with metadata, status, collapse state, edge references, template-readiness, and story pipeline context. Use the story quick-create output as the first auto-group use case.

## User stories covered

5, 8, 22

## Acceptance criteria

- [ ] Auto-created story nodes are wrapped in a named group.
- [ ] Group metadata persists through save/load.
- [ ] Group can be moved and renamed without breaking node membership.
- [ ] Group supports collapsed/expanded state in data even if UI is minimal.

## Blocked by

- Issue 4: Create Story Quick-Create Graph Builder

---

## Issue 6: Add Workflow Run Planner and Activity Feed MVP

## What to build

Add a workflow planner that can run a single node, a group, or the canvas in dependency order. Add an Activity Feed model for progress, success, failure, retry, and cancellation records.

## User stories covered

6, 7, 8, 9

## Acceptance criteria

- [ ] Running a group produces an ordered plan from its internal dependencies.
- [ ] Missing required inputs are reported before execution.
- [ ] Upstream changes mark downstream nodes stale.
- [ ] Activity Feed shows run status and readable errors.

## Blocked by

- Issue 5: Upgrade Group v2 Metadata and Auto Group UI

---

## Issue 7: Build Storyboard Node Display and Shot Handoff

## What to build

Create the Storyboard Node MVP that displays ordered shots from Script Generator output and can hand a selected shot to an Image Node as prompt context.

## User stories covered

3, 15, 21

## Acceptance criteria

- [ ] Storyboard Node displays shot order, action, camera, duration, and aiBrief.
- [ ] User can select a shot and create or update an Image Node from it.
- [ ] Shot context is preserved as machine-readable data, not only text.
- [ ] Editing or regenerating upstream script marks the storyboard stale.

## Blocked by

- Issue 3: Implement Structured Script Generator Contract
- Issue 6: Add Workflow Run Planner and Activity Feed MVP

---

## Issue 8: Add Image Take Store MVP

## What to build

Preserve image generations as non-destructive Takes. Regenerating an Image Node should create a new Take instead of losing previous outputs, while retaining compatibility with existing result display.

## User stories covered

10, 11, 25

## Acceptance criteria

- [ ] Each Image Node can list multiple generated Takes.
- [ ] Existing result display still works through fallback.
- [ ] User can select one image as Hero Take.
- [ ] Old image workflows without Take data still display correctly.

## Blocked by

- Issue 1: Add Director Domain Compatibility Foundation

---

## Issue 9: Propagate Hero Image to Video Nodes

## What to build

Make Video Nodes read the upstream Image Node's Hero Take by default, and mark video outputs stale when the upstream Hero Image changes.

## User stories covered

11, 16, 17

## Acceptance criteria

- [ ] Video Node uses upstream Hero Image when present.
- [ ] Video Node falls back to legacy result URL if no Hero Take exists.
- [ ] Changing Hero Image marks connected Video Nodes stale.
- [ ] UI makes the current input image source understandable.

## Blocked by

- Issue 8: Add Image Take Store MVP

---

## Issue 10: Add Video Take Store and Seedance Path

## What to build

Preserve video generations as Takes and align text-to-video and image-to-video behavior under the existing video node. Seedance should remain the first production video provider for the MVP.

## User stories covered

12, 13, 16, 17

## Acceptance criteria

- [ ] Text-to-video generation creates a Video Take.
- [ ] Image-to-video generation from Hero Image creates a Video Take.
- [ ] User can select a Hero Video.
- [ ] Public-reference failures surface actionable guidance.

## Blocked by

- Issue 9: Propagate Hero Image to Video Nodes

---

## Issue 11: Build Director Node MVP

## What to build

Create a Director Node that aggregates the story pipeline state: script, storyboard shots, image Hero Takes, video Hero Takes, run status, and simple preview order.

## User stories covered

14, 22

## Acceptance criteria

- [ ] Director Node can read connected story pipeline data.
- [ ] It shows script summary, shot list, Hero Image, Hero Video, and status per shot.
- [ ] It can preview the ordered video list at a basic level.
- [ ] It does not duplicate all upstream data into its own state.

## Blocked by

- Issue 7: Build Storyboard Node Display and Shot Handoff
- Issue 10: Add Video Take Store and Seedance Path

---

## Issue 12: Export Director Workflow JSON

## What to build

Extend project export/save behavior so a director workflow includes nodes, edges or legacy parent links, groups, takes, activity summary, and media references in a reusable JSON shape.

## User stories covered

22, 25, 26

## Acceptance criteria

- [ ] Export includes director metadata without breaking old workflow fields.
- [ ] Import restores groups, takes, Hero selections, and Director Node summaries.
- [ ] Missing local media references are reported clearly.
- [ ] Exported JSON does not include API keys.

## Blocked by

- Issue 11: Build Director Node MVP

---

## Issue 13: Prepare Linear Publication

## What to build

Confirm Linear workspace, team, project, labels, priority, cycle, and due dates, then publish the approved MVP issue set in dependency order.

## User stories covered

27

## Acceptance criteria

- [ ] User confirms Linear destination details.
- [ ] Issues are published in blocker-first order.
- [ ] Each Linear issue includes What to build, Acceptance criteria, and Blocked by.
- [ ] Local Markdown remains the source of truth if Linear is not connected.

## Blocked by

- User confirmation of Linear workspace/team/project/labels.
