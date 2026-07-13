# Director Canvas MVP File-Based Implementation Plan

## Goal

在现有 TwitCanva 代码结构上增量增加导演工作台能力，优先跑通“剧情输入 -> 自动建图 -> 自动分组 -> 结构化脚本/分镜 -> Take/Hero Take -> Seedance 视频 -> Director Node 预览”的最短闭环。

## Guiding Rules

- 不替换现有画布引擎。
- 不删除旧 `NodeData`、`parentIds`、`NodeGroup` 工作流兼容字段。
- 新能力优先放进 `features/director`、`features/workflow`、`features/takes`、`features/groups` 等语义目录。
- 旧 hook 只作为桥接层薄改，避免继续膨胀。
- 后端先复用 Express、本地文件、现有 Provider；SQLite/队列/云存储后置。

## Proposed Frontend Structure

```text
src/
  features/
    director/
      director.types.ts
      script.schema.ts
      storyboard.schema.ts
      directorSelectors.ts
      DirectorNode.tsx
      DirectorWorkbenchPanel.tsx
    nodes/
      nodeRegistry.ts
      nodeDefinitions.ts
      handles.ts
      nodeDefaults.ts
    graph/
      graphPatch.types.ts
      graphBuilder.ts
      layout.ts
      legacyNodeAdapter.ts
    workflow/
      workflow.types.ts
      dag.ts
      stale.ts
      runPlanner.ts
      runState.ts
    groups/
      group.types.ts
      groupAdapter.ts
      groupRunner.ts
      groupTemplate.ts
    takes/
      take.types.ts
      takeStore.ts
      heroTake.ts
    activity/
      activity.types.ts
      activityStore.ts
      ActivityFeed.tsx
    assets/
      asset.types.ts
      assetSelectors.ts
```

## Proposed Backend Structure

```text
server/
  routes/
    director.js
    workflow-runs.js
    takes.js
  services/
    director/
      scriptGenerator.js
      scriptSchema.js
      promptComposer.js
    workflow/
      dag.js
      runPlanner.js
      runStore.js
      taskLogger.js
    takes/
      takeStore.js
      heroTake.js
    providers/
      providerRegistry.js
      openaiTextProvider.js
      seedanceVideoProvider.js
```

## Existing Files To Touch Lightly

| Area | Existing responsibility | MVP touch |
| --- | --- | --- |
| Types | Legacy node and group contracts | Add compatibility fields or adapters only; avoid turning it into the full director schema |
| Node management | Create/update/delete selected canvas nodes | Route new node creation through registry defaults |
| Group management | Basic group/ungroup/sort/rename | Wrap with Group v2 adapter and add metadata, status, collapse, run hooks |
| Workflow persistence | Save/load nodes, groups, viewport | Include takes, activity, workflow metadata while preserving old JSON |
| Generation hook | Calls image/video generation | Read Hero Take when present, keep resultUrl fallback |
| Storyboard routes | Existing story brainstorming and scripts | Reuse logic but add stricter structured Script Generator contract |
| Generation routes | Provider calls and media saving | Keep working; add Provider Adapter boundary later |

## Phase Plan

### Phase A: Compatibility Foundation

**Build:**
- Director domain types.
- Node registry defaults for Text, Prompt, Script Generator, Storyboard, Image, Video, Output, Director.
- Legacy adapters from old node/group shape to new semantic shape.

**Acceptance:**
- Old workflows still load and save.
- New node defaults can be created without breaking existing UI.

**Do not:**
- Do not migrate all old nodes at once.
- Do not introduce database storage.

### Phase B: Story Pipeline Contract

**Build:**
- Script schema with fields for script, characters, scenes, shots, aiBrief.
- Script Generator backend route.
- JSON validation and repair path.
- Frontend Script Generator node data model and display state.

**Acceptance:**
- A story input returns valid structured JSON.
- Invalid LLM output surfaces a readable error and does not create broken downstream nodes.

**Do not:**
- Do not generate images/videos in this phase.

### Phase C: Auto Graph and Auto Group

**Build:**
- Graph Patch type.
- Graph Builder for “故事脚本生成”.
- Layout rules for Text -> Script -> Storyboard.
- Group v2 creation and metadata.
- Rollback if graph creation fails.

**Acceptance:**
- Double-click/quick-create story flow creates three connected nodes and one group.
- Group title is AI-generated or falls back safely.

**Do not:**
- Do not build a full template marketplace.

### Phase D: Workflow Planning and Group Run

**Build:**
- DAG planner from current parent/edge compatibility layer.
- Run scope: node, group, canvas.
- Stale marking for downstream nodes.
- Activity feed event model.

**Acceptance:**
- Running a group executes eligible nodes in dependency order.
- Missing inputs and stale downstream states are visible.

**Do not:**
- Do not support cyclic workflows.

### Phase E: Take Store and Hero Take

**Build:**
- Take data structure for image/video versions.
- Hero Take selection.
- Compatibility fallback to existing result URL.
- Downstream stale marking when Hero changes.

**Acceptance:**
- Re-generating an image/video preserves old versions.
- Video node uses upstream Hero Image by default.

**Do not:**
- Do not add automatic quality scoring.

### Phase F: Video Node Seedance Path

**Build:**
- Unified text-to-video and image-to-video input normalization.
- Seedance adapter alignment with existing API.
- Duration/resolution/aspect ratio pass-through.
- Video Take creation.

**Acceptance:**
- Text-to-video and image-to-video both produce Video Takes.
- Public reference URL failures are user-readable.

**Do not:**
- Do not add complex multi-model routing UI beyond existing selector.

### Phase G: Director Node MVP

**Build:**
- Director Node aggregate view.
- Script/storyboard/shot progress summary.
- Hero image/video list.
- Simple preview order and project JSON export.

**Acceptance:**
- A user can inspect the whole project state from one Director Node.
- Export includes graph, groups, takes, and media references.

**Do not:**
- Do not build full timeline editing.

## Shortest Demo Scenario

1. User opens canvas and selects “故事脚本生成”.
2. User enters: “一个流亡皇子在雪夜回到故国都城，发现妹妹已经成为敌国女帝。”
3. Canvas creates Text, Script Generator, Storyboard nodes and groups them.
4. User runs the group.
5. Script Generator outputs structured script and shots.
6. Storyboard displays ordered shots.
7. User creates Image Node from one shot and generates multiple Takes.
8. User selects Hero Image.
9. User creates Seedance Video Node from Hero Image and generates Video Take.
10. Director Node shows script, shot, Hero Image, Hero Video, and status.

## Migration Strategy

- Old workflows remain as legacy mode until a new director field is present.
- New workflows may save both legacy fields and director metadata.
- When reading, adapter computes new semantic shape from old fields.
- When writing, preserve old fields so older screens do not break.
- Only after MVP stabilizes should storage migrate to a separate SQLite schema.

## Risks

- LLM JSON instability can break downstream nodes; schema validation is mandatory.
- Seedance public asset URL requirements can still fail in local-only setups; error handling must explain tunnel/public URL needs.
- Continuing to add fields to the legacy node type will make future refactors expensive; adapters are the guardrail.
- Group v2 behavior can become too broad; MVP should only support run, collapse, move, save, and template-ready export.
