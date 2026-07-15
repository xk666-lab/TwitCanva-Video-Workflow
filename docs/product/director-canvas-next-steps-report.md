# Director Canvas 下一阶段实施报告

**日期：** 2026-07-15  
**代码基线：** `86a0296 feat: assemble storyboard videos on timeline`  
**范围：** 本报告依据当前仓库的实际代码、测试和持久化结构编写；不把旧规划文档中的目标当作已实现功能。

## 0. 2026-07-15 执行快照

本报告已根据当前工作区重新核对。`Phase 8B - Semantic Canvas v1` 已有大量未提交实现，**仍处于收尾阶段，不能跳过，也不能视为已发布**。

| 项目 | 现状 | 结论 |
| --- | --- | --- |
| 语义端口与连线 | 已有 `NodePortRail`、端口锚点、显式端口校验与目标端口选择器 | 需要完成真实画布验收 |
| 画布 Inspector | 已可从现有 node/edge/take/task 数据派生只读信息并删除 Edge | 需要人工检查交互、窄屏和旧工作流 |
| 快速添加节点 | `NodeCommandPalette` 与 NodeRegistry 搜索已经创建 | 尚未挂入 `App.tsx`，`Ctrl/Cmd + K` 还不可用 |
| 自动化检查 | `npm run typecheck` 通过；`npm test` 通过，合计 220 项测试 | 语义数据层具备稳定回归保护 |
| 生产构建 | `npm run build` 在 124 秒后超时，`vite build` 持续占用约 2GB 内存 | 是本阶段提交与推送前必须定位的构建健康风险 |
| GitHub 发布 | 当前工作区包含 Phase 8B 未提交文件 | 在完成验收前不得提前提交或推送 |

### 0.1 现在必须完成的收尾清单

1. 将 `NodeCommandPalette` 接入 `App.tsx`：加入打开状态、`Ctrl/Cmd + K`、选择后在当前画布中心调用现有 `addNode`，并关闭弹层。
2. 修正 `semanticCanvas.ts` 中缺失连接节点时的 Inspector fallback，保证悬空旧 Edge 不会显示错误节点 ID。
3. 清理过时的 `NodeConnectors` / `onConnectionMade` 注释；保留兼容文件或明确删除策略，但不要误删旧交互依赖。
4. 完成浏览器手工验收：文本到图片提示词、图片到视频的首帧/尾帧/参考图选择、显式端口拖拽、Edge 删除后的 `parentIds` 双写、旧工作流加载与生成回归。
5. 单独诊断并解决 `vite build` 超时或内存异常，随后重新运行 `npm run typecheck`、`npm test`、`npm run build` 和 `git diff --check`。
6. 只有以上全部通过后，提交 Phase 8B 并推送到 `codex/foundation-refactor` / GitHub；这是可回滚阶段边界。

### 0.2 完成 Phase 8B 后的优先级

| 优先级 | 阶段 | 应完成的能力 | 为什么现在排在这里 |
| --- | --- | --- | --- |
| P0 | Phase 8B 收尾 | 可见端口、语义 Edge、Inspector、命令面板和构建健康 | 已投入实现，且是后续所有画布能力的交互入口 |
| P1 | Phase 9 | `WorkflowRun`、Activity Feed、DAG 执行计划、stale 传播与范围重试 | 已有 `GenerationTask`，缺少跨节点可观察与可控的执行编排 |
| P1 | Phase 10 | Director Workbench、镜头表、批量镜头状态、Take 总览 | 把现有 Script/Storyboard/Subject/Take 数据变成导演可操作的生产界面 |
| P2 | Phase 11 | 真实时间线：时间坐标、裁切、音量、预览和 FFmpeg 导出 | 当前时间线只能排序，尚不能完成成片编辑 |
| P2 | Phase 12 | Provider Capability Registry | 将模型输入、时长、比例、分辨率、进度和取消能力从 UI 分支中集中出来 |
| P3 | Phase 13 | AI Director 的可审阅 Graph Patch | 只能在稳定图模型、任务模型和运行记录之上安全落地 |
| 后置 | Phase 14 | 云端项目、协作、权限、远程队列与计费 | 需要先把本地单人创作闭环与数据契约稳定下来 |

### 0.3 不应抢跑的工作

- 不要先增加更多模型或把音频、时间线做成独立大重构；它们会绕过还未完成的语义画布与运行编排。
- 不要替换自研画布或迁移 React Flow；现有画布已经有足够的扩展落点，迁移会放大兼容与交互回归风险。
- 不要删除 `parentIds`、重写 `App.tsx` 或改变图片、视频、分镜、Seedance 和 API Key 的既有行为。

## 1. 结论

项目已经具备升级为专业 AI 视频创作工作台的关键地基，不应替换现有自研画布，也不应现在迁移到 React Flow。当前最大的瓶颈不是模型数量，而是这些已有能力尚未以清晰、可控、可观察的画布体验呈现给创作者。

下一阶段应实施：**Phase 8B - Semantic Canvas v1（语义化导演画布）**。

它的目标不是新增 AI 模型，也不是重写页面，而是让用户在画布中直接看懂并控制：

1. 一个节点有哪些输入和输出。
2. 一条 Edge 实际传递什么数据，以及连接到哪个用途。
3. 当前节点使用了哪个 Hero Take、正在运行什么任务、为什么失败。
4. 图片连接到视频时究竟是首帧、尾帧还是参考图，而不是由隐藏规则猜测。

这一步会把已经完成的 NodeRegistry、CanvasEdge、GenerationTask 和 Take 数据层变成可用的创作体验，也为后续 Workflow Run、Director Workbench、时间线和 AI Director 提供统一入口。

## 2. 当前代码事实

| 领域 | 当前状态 | 代码证据 |
| --- | --- | --- |
| 工作流兼容 | 已完成 | `WorkflowData` 当前为 schema v8，加载时迁移旧工作流并保留未知字段。参见 [`workflowSchema.ts`](../../src/domain/workflow/workflowSchema.ts) 与 [`migrateWorkflow.ts`](../../src/domain/workflow/migrateWorkflow.ts)。 |
| 节点注册 | 已完成 | 当前 12 类节点由 [`nodeRegistry.ts`](../../src/domain/nodes/nodeRegistry.ts) 集中定义默认值、能力与端口。 |
| Edge 数据模型 | 已完成 | `CanvasEdge` 已保存源/目标节点、端口、数据类型、顺序与元数据；`parentIds` 仍作为兼容字段双写。参见 [`graphTypes.ts`](../../src/domain/graph/graphTypes.ts) 与 [`edgeMigration.ts`](../../src/domain/graph/edgeMigration.ts)。 |
| 连线校验 | 已完成但 UI 不完整 | 数据类型、循环、重复连接、容量都由 [`connectionRules.ts`](../../src/domain/graph/connectionRules.ts) 校验。 |
| 生成任务 | 已完成任务级闭环 | 后端任务队列持久化 JSON，支持恢复、重试、逻辑取消和去重。参见 [`generationTasks.js`](../../server/services/generationTasks.js)。 |
| Script 与 Storyboard | 已完成持久化基础 | Script/Storyboard Document、镜头状态与任务引用已存在；画布节点仍主要打开现有向导 Modal。参见 [`storyboardTypes.ts`](../../src/domain/storyboard/storyboardTypes.ts)。 |
| Take 与 Hero Take | 已完成数据保存，UI 缺口明显 | `takes`、`heroTakeId` 与旧 `resultUrl` 兼容，但没有完整的版本浏览、比较和 Hero 切换界面。参见 [`types.ts`](../../src/types.ts)。 |
| 主体资产与模板 | 部分完成 | Subject Asset、主体端口和可复用工作流模板已存在，但场景、道具、风格和参数化模板仍未形成统一体验。 |
| 时间线 | 粗剪完成 | 可将节点或分镜视频按顺序加入视频/音频轨并重排；尚无时间坐标、片段时长、预览或导出。参见 [`timelineTypes.ts`](../../src/domain/timeline/timelineTypes.ts)。 |
| AI Agent | 未完成导演能力 | 当前聊天 Agent 仅做会话，工具数组为空，不能安全地操作画布或任务。参见 [`server/agent/tools/index.js`](../../server/agent/tools/index.js)。 |

## 3. 当前画布的主要限制

### 3.1 端口已存在于数据层，但不可见

`NodeRegistry` 已定义 `start-frame`、`end-frame`、`reference-images`、`motion-reference`、`audio-reference`、`subject-references` 等稳定端口 ID。可是 [`NodeConnectors.tsx`](../../src/components/canvas/NodeConnectors.tsx) 只显示左右两个通用加号。

因此，`resolveConnectionPorts` 必须依据节点类型、已有连接和模型条件自动猜测目标端口。这个过渡策略能兼容旧工作流，但对专业创作而言不够透明：用户无法在画布上确认“这张图现在是首帧还是参考图”。

### 3.2 Edge 的语义没有被可视化

[`ConnectionsLayer.tsx`](../../src/components/canvas/ConnectionsLayer.tsx) 已按 `edges` 渲染连线，但连线终点仍固定在节点左右中点，不对应真实端口位置，也不显示端口名称、角色、类型或输入顺序。

### 3.3 任务系统没有成为工作流系统

GenerationTask 已具备持久化、恢复、重试和状态机，但它只在单个节点中可见。当前没有：

- Workflow Run：一次“运行当前节点、分组、下游分支或整个画布”的记录。
- Activity Feed：聚合排队、运行、失败、取消与完成结果的用户界面。
- stale 状态：上游输入或 Hero Take 改变后，下游节点需要重新生成的显式标记。
- 依赖执行计划：基于 DAG 计算运行顺序、阻塞原因和可重试范围。

### 3.4 时间线还是有序列表，不是编辑时间轴

`TimelineClip` 目前只有来源节点、来源 Take、URL 和 `order`。它没有 `startTime`、`duration`、`trimIn`、`trimOut`、音量、转场、锁定或媒体波形。因此它适合验证“分镜视频进入粗剪”，尚不能承担成片编辑和导出。

### 3.5 节点呈现与状态协调仍集中

[`App.tsx`](../../src/App.tsx) 负责组合大量画布、连接、历史、生成、分镜、时间线和面板行为；[`CanvasNode.tsx`](../../src/components/canvas/CanvasNode.tsx) 也同时包含多类节点的呈现差异。当前可以继续渐进拆分，但不适合再把 Director、工作流执行和复杂 Inspector 直接堆进这两个文件。

### 3.6 大画布性能尚未经过专门设计

画布目前直接映射所有节点，Edge 渲染中会反复按 ID 查找节点。尚未发现视口裁剪、节点可见性索引、边索引或专门的性能基准。几十个节点可用，但在完整短片、多个镜头和多版本 Take 场景中会成为风险。

## 4. 目标产品形态

项目应发展为独立的 **Director Canvas**：一套从创作 Brief 到成片预览的节点式创作工作台。它只借鉴“无限画布、可组合流程和 AI 协作”的产品思路，不复制任何第三方的商标、代码、文案、接口或页面设计。

推荐的独立工作台结构：

```text
左侧：节点、素材、模板与命令搜索
中央：无限 Director Canvas、语义端口、分组与镜头链路
右侧：Inspector、Take、任务活动、错误与重试
底部：粗剪时间线、预览与未来的渲染导出
```

核心生产流：

```text
创作 Brief -> Script -> Storyboard -> Shot 生产 -> Image/Video Takes -> Rough Cut -> Render
```

`Director Workbench` 应是对整个工作流的派生视图，而不是把所有项目字段复制到一个巨型节点。它可以以后以侧边面板为主，并保留一个轻量画布入口节点用于定位和跳转。

## 5. 建议立即实施：Phase 8B - Semantic Canvas v1

### 用户流程

1. 用户创建或选中一个节点，节点侧边显示来自 NodeRegistry 的命名输入和输出端口。
2. 用户从输出端口拖向另一个节点，兼容端口高亮，不兼容端口显示原因。
3. 当一个输出可以连接到多个用途时，弹出紧凑的目标端口选择器。
4. 用户点击 Edge，在 Inspector 中查看“来源端口 -> 目标端口 -> 数据类型 -> role/顺序”，并可删除连接。
5. 用户选中 Image 或 Video 节点，在 Inspector 中查看输入来源、当前 Hero Take、任务状态、错误和重试入口。
6. 保存并重新加载后，旧工作流继续显示和执行；新工作流仍同时保存 `edges` 与派生 `parentIds`。

### 本阶段实现范围

- 用 `NodeRegistry` 的 `NodePortDefinition` 渲染可见的端口轨道，而不是继续只显示左右通用加号。
- 保持稳定的 `portId`；端口标签仅用于显示，不能成为持久化主键。
- 将连接拖拽改为“源端口 -> 目标端口”的交互；无法确定目标时显示端口选择器。
- Edge 渲染连接到真实端口位置，并在选中或悬停时显示语义标签。
- 新增右侧 `InspectorPanel`，首先只覆盖 Node 输入、Edge 详情、Hero Take 摘要和 Task 摘要。
- 新增快速添加/搜索入口，复用 NodeRegistry，而不是在多个 UI 中硬编码节点列表。
- 为多节点画布建立最小性能保护：稳定的节点 props、节点/边查找索引，以及视口裁剪的技术预研或最小实现。

### 本阶段明确不做

- 不删除 `parentIds`，不修改现有图片、视频、分镜或 Seedance 调用行为。
- 不实现 Workflow Run、全局任务中心、时间线渲染导出或 AI Director。
- 不重写 `App.tsx`，不迁移画布框架。
- 不将所有 `NodeData` 一次性替换为新的 discriminated union。
- 不新增未验证的模型、云端数据库、多人协作或计费能力。

### 推荐文件边界

| 类型 | 文件 |
| --- | --- |
| 修改 | `src/components/canvas/NodeConnectors.tsx`、`CanvasNode.tsx`、`ConnectionsLayer.tsx`、`src/hooks/useConnectionDragging.ts`、`src/App.tsx`。 |
| 新增 | `src/components/canvas/NodePortRail.tsx`、`ConnectionPortPicker.tsx`、`src/components/inspector/InspectorPanel.tsx`。 |
| 复用 | `src/domain/nodes/nodeRegistry.ts`、`src/domain/graph/connectionRules.ts`、`connectionSelectors.ts`、`edgeMigration.ts`、`src/hooks/useNodeManagement.ts`。 |
| 测试 | 端口布局、歧义端口选择、Edge 详情、旧工作流加载、`parentIds` 双写和基础画布交互。 |

### 验收标准

1. 所有已注册节点都显示其启用端口，端口 ID 与 NodeRegistry 一致。
2. `TEXT -> IMAGE.prompt-input`、`IMAGE -> VIDEO.start-frame`、`VIDEO -> VIDEO.motion-reference` 等连接能从 UI 明确创建。
3. IMAGE 连接到 VIDEO 出现首帧/尾帧/参考图歧义时，不再静默猜测。
4. Edge 选中后能看到源、目标、数据类型和用途；删除 Edge 后 `parentIds` 同步更新。
5. 旧工作流加载后仍能显示连线，并且图片、视频、首尾帧和动作参考生成保持可用。
6. 节点 Inspector 不直接调用 Provider，只调用已有状态、selector 和任务服务。
7. `npm run typecheck`、`npm test`、`npm run build` 全部通过。
8. 本阶段独立提交并推送至 GitHub，便于回滚。

## 6. 后续路线图

| 阶段 | 目标 | 关键成果 |
| --- | --- | --- |
| Phase 8B | Semantic Canvas v1 | 可见端口、Edge 语义、Inspector、快速添加入口。 |
| Phase 9 | Workflow Run 与 Activity Feed | 节点/分组/画布运行、DAG 计划、stale、批量执行、统一运行记录。 |
| Phase 10 | Director Workbench 与镜头生产 | 镜头表、批量镜头状态、单镜头重试、素材/Take 总览、粗剪状态。 |
| Phase 11 | 专业时间线与导出 | 时间坐标、入出点、音量、轨道、预览、FFmpeg 渲染导出。 |
| Phase 12 | Provider Capability Registry | 将模型可用输入、时长、比例、分辨率、取消和进度能力从 UI/路由分支集中管理。 |
| Phase 13 | AI Director | 只生成可审阅的 Graph Patch；通过受控工具创建节点、Edge、任务和时间线片段。 |
| Phase 14 | 云端与协作 | 项目权限、对象存储、远程队列、团队协作和审计。 |

## 7. Phase 9 的前置设计结论

Semantic Canvas 完成后，下一优先级不是继续加新节点，而是将已有 `GenerationTask` 聚合为 `WorkflowRun`。

建议的最小模型：

```ts
interface WorkflowRun {
  id: string;
  workflowId: string | null;
  scope: { kind: 'node' | 'group' | 'workflow'; id: string };
  status: 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  nodeIds: string[];
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

该实体只记录一次编排执行，不替代已有 GenerationTask。GenerationTask 仍是 Provider 调用和任务状态的真实来源；节点 `status` 仍只是兼容性的 UI 投影。

## 8. 主要风险与控制方式

| 风险 | 控制方式 |
| --- | --- |
| 端口 UI 改动破坏旧连接 | 加载时继续由 Edge 迁移和 `syncLegacyParentIds` 处理；保留旧 `parentIds`。 |
| 复杂端口导致画布拥挤 | 默认仅显示必要端口，选中或悬停时展开；端口分组与折叠由表现层处理。 |
| Inspector 演变成第二套状态 | Inspector 只能读取已有 node、edge、task 和 selector；不另存重复数据。 |
| 大画布性能下降 | 先建立节点/边索引和性能测试，再渐进加入视口裁剪；不在首版引入新状态库。 |
| 工作流运行覆盖新结果 | Phase 9 必须使用 taskId、inputSnapshot 和 activeTaskId，沿用现有安全回填机制。 |
| AI Agent 绕过安全边界 | Phase 13 前不让聊天 Agent 修改画布；以后只允许受控 Graph Patch 与显式确认。 |

## 9. 决策摘要

**现在做：** 把已存在的端口、Edge、Take 与任务状态做成语义化画布体验。  
**下一步做：** Workflow Run、Activity Feed 和 stale 传播。  
**随后做：** Director Workbench、镜头表与专业时间线。  
**暂不做：** 重写画布、替换框架、多人协作、云端 SaaS、复杂剪辑器和能直接修改画布的 Agent。

这样推进可以保持每个阶段独立测试、独立回滚，并继续兼容已有工作流 JSON、`parentIds`、媒体库和模型调用路径。
