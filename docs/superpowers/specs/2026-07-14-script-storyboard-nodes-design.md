# 阶段 4：持久化 ScriptNode 与 StoryboardNode 设计规范

> 日期：2026-07-14
> 项目：TwitCanva Video Workflow
> 状态：方案 A 已获用户批准，等待规格复核和实施计划
> 目标分支：`codex/foundation-refactor`

## 1. 文档定位

本规范实现路线图阶段 4 的地基：把目前只存在于 Modal 和 `NodeGroup.storyContext` 中的故事与分镜数据，升级为画布中可保存、可连接、可恢复的 `ScriptNode` 和 `StoryboardNode`。

本规范是 `2026-07-10-libtv-style-director-workbench-design.md` 的前置实现，不替代其中的三阶段制作台、主体资产、Prompt Compiler 和专业镜头表。现有文档中的“脚本生成器节点”在本阶段映射为 `StoryboardNode`，不再增加第三个功能重叠的核心节点类型。

本阶段必须保持独立设计，不复制任何第三方产品的代码、接口、文案、商标、素材或页面布局。

## 2. 仓库事实

实施前已从当前代码确认：

- 当前分支是 `codex/foundation-refactor`，工作区无未提交修改。
- 阶段 1 已提供 `NodeRegistry`、集中默认值、workflow schema 和迁移入口。
- 阶段 2 已提供稳定端口、`CanvasEdge`、连接校验以及 `parentIds` 双写兼容。
- 阶段 3 已提供持久化 `GenerationTask`、队列、并发限制、取消、重试、任务查询和刷新恢复。
- 当前 workflow schemaVersion 是 `4`，edge schemaVersion 是 `1`，task schemaVersion 是 `1`。
- `NodeType.STORYBOARD` 已存在，值为 `分镜管理器`，但只注册了禁用的 `storyboard-output` 占位端口。
- 当前没有 `NodeType.SCRIPT`，也没有 Script 节点渲染或创建入口。
- `useStoryboardGenerator` 使用 React 本地状态保存故事、人物引用、镜头脚本、模型和预览图。
- 分镜最终数据保存在 `NodeGroup.storyContext`，其中 `scripts` 和 `selectedCharacters` 仍使用弱类型。
- 旧分镜向导最终创建一组普通 Image 节点，并由 App 自动触发已有图片生成链路。
- StoryboardVideoModal 根据这些 Image 节点创建普通 Video 节点，并沿用已有视频生成链路。
- 图片和视频生成已经通过 GenerationTask；故事包、故事优化、故事脑暴和分镜预览仍直接调用 `/api/storyboard/*`。
- `useGenerationRecovery` 已统一批量查询处于 loading 状态的媒体节点任务，但成功回填目前要求 `output.resultUrl`。
- `NodeContent` 和 `CanvasNode` 尚无 Script/Storyboard 专用内容分支。
- 旧 workflow 在加载时会保留未知字段，并对节点、takes、edges 和 `storyContext` 做兼容规范化。

## 3. 当前调用链

```text
工具栏“分镜生成器”
  -> App.tsx
  -> useStoryboardGenerator.openModal
  -> StoryboardGeneratorModal
  -> useStoryboardGenerator.generateScripts / generateStoryPackage
  -> POST /api/storyboard/generate-scripts 或 generate-story-package
  -> server/routes/storyboard.js
  -> OpenAI-compatible text provider 或 Gemini
  -> Modal 本地 StoryboardState
  -> createStoryboardNodes
  -> 普通 Image 节点 + NodeGroup.storyContext
  -> App.handleGenerateRef
  -> useGeneration
  -> GenerationTask
  -> 图片 Provider
  -> take/resultUrl 回填 Image 节点
  -> StoryboardVideoModal
  -> 普通 Video 节点
  -> GenerationTask
  -> 视频 Provider
  -> take/resultUrl 回填 Video 节点
  -> workflow 自动保存
```

当前问题不是缺少生成能力，而是故事与分镜本身没有成为持久化领域对象。页面刷新、分组拆散、跨工作流复用和后续 Agent 编排都没有稳定落点。

## 4. 用户流程

### 4.1 触发入口

保留现有工具栏“分镜生成器”入口，同时在节点创建菜单增加“脚本”和“分镜管理器”。

用户还可以：

- 从 Text 节点连接创建 Script 节点。
- 从 Script 节点连接创建 Storyboard 节点。
- 双击或点击 Script/Storyboard 节点上的编辑按钮重新打开现有分镜向导。
- 继续使用旧分镜 Group 上的“Edit Storyboard”按钮。

### 4.2 用户输入

本阶段沿用现有向导输入：

- 一句话故事或完整故事文本。
- 1 到 10 个镜头。
- 最多 3 个现有素材引用。
- 图片生成模型。
- AI 返回后可编辑的镜头描述、机位、运镜、光线和情绪。

不新增主体资产库、音频、时间线或模型参数。

### 4.3 系统行为

1. 打开全新向导时不立即污染画布。
2. 用户首次提交需要付费或耗时的故事包生成时，系统创建一对草稿节点：ScriptNode 和 StoryboardNode。
3. 系统创建 `ScriptNode.script-output -> StoryboardNode.script-input` Edge。
4. 当前向导状态写入两个节点，并提交 `generate-story-package` GenerationTask。
5. Task 成功后，结构化 ScriptDocument 回填 ScriptNode，StoryboardDocument 回填 StoryboardNode。
6. Modal 从节点数据恢复并显示可编辑镜头。
7. 用户点击“生成分镜”或“生成分镜并继续视频”时，继续创建现有 Image 节点和兼容 Group。
8. 每个 StoryboardShot 保存对应 Image/Video 节点引用，现有媒体生成行为不变。
9. 自动保存继续走现有 workflow API，同时保存新节点、Edge 和旧 `storyContext` 兼容镜像。

如果用户未调用 AI、直接关闭空白向导，则不创建节点。AI 请求一旦提交，草稿节点会保留，以便刷新恢复和任务追踪。

### 4.4 中间状态

ScriptNode 和 StoryboardNode 使用现有节点状态兼容视图：

- `idle`：可编辑，未执行任务。
- `loading`：任务处于 draft、validating、queued 或 running。
- `success`：结构化结果已安全回填。
- `error`：任务失败或取消，可重试。

UI 不显示虚假的精确进度。Provider 没有真实进度时只显示“校验中、排队中、生成中”等阶段状态。

### 4.5 最终结果与后续用途

最终 workflow 中存在：

```text
TextNode（可选）
  -> ScriptNode
  -> StoryboardNode
       -> 通过 shot 引用关联 ImageNode / VideoNode
```

ScriptNode 可被后续 AI Director、模板和脚本优化能力复用。StoryboardNode 可继续生成图片、视频，并为后续专业镜头表和时间线提供稳定数据源。

### 4.6 异常流程

- 缺少故事文本：客户端和服务端均返回 `VALIDATION_ERROR`，不提交 Provider。
- 缺少 API key：任务失败为 `MISSING_API_KEY`，保留草稿节点和输入。
- 网络中断：前端保留 activeTaskId，恢复后继续批量查询。
- 页面刷新：workflow 恢复节点，GenerationTask 恢复任务状态和结果。
- 服务重启：无法恢复的文本 Provider 调用按现有规则失败为 `SERVER_RESTARTED`，允许重试。
- 用户取消：任务标记 cancelled；不声称已真正终止不支持取消的远端 Provider。
- 用户重试：创建新 taskId，复用旧任务不可变 inputSnapshot，并记录 retry 链。
- 用户重新生成：使用当前节点数据创建新任务，不复用旧快照。
- 用户在任务期间改变源内容：当前任务结果不得覆盖新修订。
- 单个镜头媒体失败：只影响对应 Image/Video 节点和 StoryboardShot 投影，不清空其他镜头。

## 5. 功能所属架构层

本阶段同时扩展以下已有抽象：

- 新节点类型：新增 ScriptNode，激活现有 StoryboardNode。
- 新端口数据类型：新增 `script`，不使用 NodeType 代替数据类型。
- 新 GenerationTask operation：新增 `generate-story-package`。
- 新持久化领域数据：ScriptDocument、StoryboardDocument、StoryboardShot。
- 现有 Modal 的数据适配：Modal 继续存在，但成为节点数据编辑器。

这不是工作流模板，因为用户需要长期编辑、连接和恢复脚本与镜头。它也不是单纯 Task operation，因为任务结果需要成为画布上的可持久化业务对象。

## 6. 可复用能力

直接复用：

- NodeRegistry 默认值和端口注册。
- CanvasEdge 校验、循环检测、删除清理和 parentIds 双写。
- migrateWorkflow 的未知字段保留和幂等入口。
- GenerationTask repository、队列、状态机、重试、取消、去重和批量查询。
- `/api/storyboard/generate-story-package` 已有 Provider 选择和 `storyboardText` 结构化解析。
- StoryboardGeneratorModal 的现有五步交互。
- Storyboard Image 节点工厂和图片批量生成。
- StoryboardVideoModal 和视频批量生成。
- MediaTake 和 Hero Take 行为。

需要扩展：

- NodeData 的嵌套故事字段。
- NodeRegistry 的 Script/Storyboard 定义和端口。
- ConnectionRules 的 Text -> Script 和 Script -> Storyboard 自动映射。
- GenerationTask output 类型和恢复分发。
- useStoryboardGenerator 的节点托管与任务提交。
- workflow migration 的故事领域规范化。

需要新增：

- 纯数据故事领域类型与规范化函数。
- Script/Storyboard 紧凑节点内容组件。
- 结构化任务结果到多个节点的纯函数更新映射。
- 旧 Group 到新节点对的惰性转换函数。

## 7. 领域模型

### 7.1 NodeType 与 PortDataType

```ts
enum NodeType {
  SCRIPT = "脚本",
  STORYBOARD = "分镜管理器"
}

type PortDataType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "script"
  | "storyboard"
  | "any";
```

现有 NodeType 值不修改。`SCRIPT` 是唯一新增枚举值。

### 7.2 引用素材

本阶段不创建正式 Asset/SubjectAsset。为兼容现有向导，使用最小可序列化快照：

```ts
interface StoryReferenceAsset {
  id: string;
  name: string;
  url: string;
  description?: string;
  category?: string;
}
```

后续阶段 5 会将其迁移为 assetId 引用。当前不得复制 Base64 到 workflow；只保存 library URL 或已经物化的本地 URL。

### 7.3 ScriptDocument

```ts
interface ScriptDocument {
  schemaVersion: 1;
  title: string;
  sourceText: string;
  synopsis: string;
  styleAnchor: string;
  characterDNA: Record<string, string>;
  referenceAssets: StoryReferenceAsset[];
  revision: number;
  generatedBy?: {
    taskId: string;
    provider: string;
    model: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

`sourceText` 是用户输入，`synopsis` 是 AI 整理后的故事。手动修改任一字段都会递增 revision。

### 7.4 StoryboardShot

```ts
type StoryboardShotStatus =
  | "draft"
  | "ready"
  | "image-running"
  | "image-ready"
  | "video-running"
  | "video-ready"
  | "failed";

interface StoryboardShot {
  id: string;
  order: number;
  sceneNumber: number;
  description: string;
  cameraAngle: string;
  cameraMovement?: string;
  lighting?: string;
  mood: string;
  imagePrompt?: string;
  videoPrompt?: string;
  imageNodeId?: string;
  videoNodeId?: string;
  activeTaskId?: string;
  lastTaskId?: string;
  status: StoryboardShotStatus;
  error?: string;
  revision: number;
}
```

Shot status、activeTaskId 和 error 是便于分镜 UI 恢复的持久化投影，GenerationTask 和关联媒体节点仍是任务状态真实来源。加载和任务回填时必须重新校准投影，不能让旧 Shot 状态覆盖新 Task。

### 7.5 StoryboardDocument

```ts
interface StoryboardDocument {
  schemaVersion: 1;
  sourceScriptNodeId: string;
  shots: StoryboardShot[];
  selectedImageModel: string;
  selectedVideoModel?: string;
  compositeImageUrl?: string | null;
  revision: number;
  generatedBy?: {
    taskId: string;
    provider: string;
    model: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

风格、人物 DNA 和引用素材由 ScriptDocument 持有，StoryboardDocument 通过 `sourceScriptNodeId` 读取，避免两份主数据。旧 storyContext 仍会包含这些字段作为兼容镜像。

### 7.6 NodeData 兼容扩展

NodeData 只增加两个嵌套可选字段，不删除现有字段：

```ts
interface NodeData {
  scriptData?: ScriptDocument;
  storyboardData?: StoryboardDocument;
}
```

本阶段不一次性改造完整 discriminated union，但会导出以下收窄类型，供新代码使用：

```ts
type ScriptNodeData = NodeData & {
  type: NodeType.SCRIPT;
  scriptData: ScriptDocument;
};

type StoryboardNodeData = NodeData & {
  type: NodeType.STORYBOARD;
  storyboardData: StoryboardDocument;
};
```

## 8. NodeRegistry 与端口契约

ScriptNode：

- `text-input`：input、text、最多 1 条、role=`source-text`。
- `script-output`：output、script、可连接多个下游、role=`script`。
- capabilities：acceptsPrompt、supportsGeneration。

StoryboardNode：

- `script-input`：input、script、必需、最多 1 条、role=`script`。
- `storyboard-output`：output、storyboard、可连接多个下游、role=`storyboard`，从占位状态启用。
- capabilities：supportsGeneration、supportsEditor。

自动连接规则：

- Text -> Script 自动映射 `text-output -> text-input`。
- Script -> Storyboard 自动映射 `script-output -> script-input`。
- 其他类型不得通过 `any` 绕过明确端口。
- 本阶段不开放 Storyboard -> Image 自动 Edge；Shot 与媒体节点使用稳定 nodeId 关联，避免没有 shotId 的模糊连接。

## 9. GenerationTask 输入输出契约

### 9.1 提交

继续使用现有统一 endpoint：

```http
POST /api/generation-tasks
```

```ts
interface GenerateStoryPackageInput {
  scriptNodeId: string;
  storyboardNodeId: string;
  scriptRevision: number;
  storyboardRevision: number;
  generationMode: "scripts" | "story-package";
  sourceText: string;
  sceneCount: number;
  tone?: string;
  referenceAssets: StoryReferenceAsset[];
  selectedImageModel: string;
}
```

Task 的 `nodeId` 使用 ScriptNode ID，`storyboardNodeId` 保存在不可变 inputSnapshot 中。现有 `onGenerateScripts` 和 `onGenerateStoryPackage` 都提交该 operation，并通过 `generationMode` 选择原有的脚本生成或完整故事包语义。Provider 选择保持现状：优先已配置的 OpenAI-compatible 文本 Provider，否则使用 Gemini；`scripts` 模式继续保留当前 Gemini 多模态引用处理。

### 9.2 输出

GenerationTask output 改为兼容联合类型：

```ts
type GenerationTaskOutput =
  | {
      kind?: "media";
      resultUrl: string;
      take?: MediaTake;
    }
  | {
      kind: "story-package";
      scriptRevision: number;
      storyboardRevision: number;
      scriptData: ScriptDocument;
      storyboardData: StoryboardDocument;
    };
```

旧媒体任务没有 `kind` 时仍按 `resultUrl` 识别为 media。Task envelope 未改变，因此本阶段不递增 task schemaVersion；新 operation 的 output 由 operation-specific normalizer 校验。

### 9.3 旧 API

以下公开 endpoint 保留：

- `/api/storyboard/generate-story-package`
- `/api/storyboard/generate-scripts`
- `/api/storyboard/brainstorm-story`
- `/api/storyboard/optimize-story`
- `/api/storyboard/generate-composite`

新节点流程的两个现有生成按钮都使用 `generate-story-package` Task。旧 `generate-story-package` 和 `generate-scripts` endpoint 与 Task executor 共享提取后的服务函数，并继续返回各自旧扁平响应结构。其他旧 endpoint 本阶段保持行为不变，避免扩大改造和改变 Provider 行为。

## 10. 状态机

GenerationTask 继续使用阶段 3 的状态机：

```text
draft -> validating -> queued -> running -> succeeded
                                      \-> failed
draft/validating/queued/running       \-> cancelled
```

节点状态映射：

```text
无任务                     -> idle
draft/validating/queued/running -> loading
succeeded 且结果已应用       -> success
failed/cancelled             -> error
```

允许操作：

- idle：编辑、生成。
- loading：取消；不允许重复提交同一节点当前输入。
- success：编辑、重新生成、生成镜头图片。
- error：修复输入、重试旧快照或使用当前输入重新生成。

页面刷新后由统一任务批量查询恢复。服务重启无法恢复 Provider 文本请求时，任务转为可重试 `SERVER_RESTARTED`。

## 11. 数据流

```text
用户提交故事包生成
  -> useStoryboardGenerator 校验 sourceText
  -> ensureStoryboardDraftNodes 创建/复用节点对和 Edge
  -> 将当前 Modal 输入写入 ScriptDocument/StoryboardDocument
  -> 构建不可变 inputSnapshot + 两个节点 revision
  -> POST /api/generation-tasks
  -> 服务端再次校验
  -> GenerationTaskManager 创建并持久化任务
  -> 队列执行 generate-story-package executor
  -> executor 调用共享 storyboard text service
  -> 规范化 ScriptDocument 和 StoryboardDocument
  -> Task succeeded，持久化结构化 output
  -> useGenerationRecovery 批量查询任务
  -> taskResult mapper 检查 taskId、nodeId、storyboardNodeId 和两个 revision
  -> 安全回填 ScriptNode 和 StoryboardNode
  -> Modal 从节点恢复
  -> 用户创建 Image/Video 节点
  -> 现有媒体 GenerationTask 链路执行
  -> Shot 投影同步关联节点和任务状态
  -> workflow 自动保存
```

React 组件只负责展示和用户事件。Provider 选择、任务持久化、结果规范化和迁移不得进入组件。

## 12. 数据所有权与不变量

必须始终成立：

- ScriptNode 是故事文本、风格、人物 DNA 和引用素材的主数据源。
- StoryboardNode 是 Shot 顺序和镜头字段的主数据源。
- NodeGroup.storyContext 只是兼容镜像，不得反向覆盖已有新节点数据。
- 一个 AI 请求只有一个稳定 taskId。
- 重新生成创建新任务；重试使用旧任务不可变快照。
- taskId 不匹配的结果不得更新节点。
- Script 或 Storyboard 任一 revision 不匹配时，整包结果不得回填，避免只更新一个节点。
- 结构化 Task 结果必须同时通过 schema normalizer 后才允许回填。
- GenerationTask 是任务状态真实来源；节点和 Shot 状态只是兼容投影。
- 删除 ScriptNode 时，由现有 Edge 管理清理连接，但不级联删除 StoryboardNode 或媒体节点。
- 删除 StoryboardNode 时，不自动删除已生成的 Image/Video 节点。
- 删除媒体节点时，对应 Shot 引用在下一次规范化中清空，不导致崩溃。
- workflow 中不得长期保存大型 Base64。
- API key 不得进入前端、workflow 或 task inputSnapshot。
- 新旧 parentIds 继续由 Edge 派生，不删除兼容字段。
- 旧 workflow 加载不得自动改变可见画布布局。

## 13. 旧工作流迁移

workflow schemaVersion 从 `4` 升到 `5`。

### 13.1 新节点规范化

- ScriptNode 缺少 scriptData 时填充安全空文档。
- StoryboardNode 缺少 storyboardData 时填充安全空文档。
- 缺少 Shot ID 时使用稳定、可重复的 ID 生成规则。
- Shot order 规范为连续序号，但保留未知字段。
- 所有嵌套数组和对象深拷贝，不修改原对象。
- 迁移可重复调用，结果保持一致。

### 13.2 旧 storyContext

加载旧 Group 时：

- 保留原 `storyContext` 和所有未知字段。
- 不自动创建新节点，不移动旧节点。
- 对 scripts 做 StoryboardShot 兼容规范化，仅在内存中提供 selector 读取。

用户首次点击旧 Group 的 Edit Storyboard 时：

1. 检查 `storyContext.scriptNodeId` 和 `storyContext.storyboardNodeId` 是否仍有效。
2. 无有效节点时，在旧 Group 左侧创建 ScriptNode 和 StoryboardNode。
3. 从 storyContext 构建两个领域文档。
4. 创建 Script -> Storyboard Edge。
5. 把新节点 ID 写回 storyContext。
6. 后续再次编辑复用同一节点，不重复创建。

### 13.3 双写策略

新节点数据是主数据。读取旧 Group 时使用 `getEffectiveStoryContext(group, nodes)`：有有效节点则投影节点数据，否则读取旧字段。

保存 workflow 前调用集中式 `syncLegacyStoryboardContexts(nodes, groups)`，把有效节点投影回旧字段：

- story
- scripts
- selectedCharacters
- sceneCount
- styleAnchor
- characterDNA
- compositeImageUrl
- selectedImageModel
- scriptNodeId
- storyboardNodeId

不得在多个 UI 组件中分别维护这套双写。

## 14. 节点 UI

本阶段只增加紧凑画布卡片，不实现专业镜头表。

ScriptNode 显示：

- 标题。
- 原始故事摘要。
- AI 整理后的 synopsis 摘要。
- 当前任务阶段或错误。
- “编辑脚本”“生成/重新生成”“取消/重试”。

StoryboardNode 显示：

- 标题。
- 镜头总数。
- 图片完成数和视频完成数。
- 最多三条镜头摘要。
- 当前任务阶段或错误。
- “打开分镜”“生成图片”“生成视频”。

现有 StoryboardGeneratorModal 继续承担完整编辑。打开 ScriptNode 时优先进入故事或脚本步骤；打开 StoryboardNode 时优先进入脚本或预览步骤。

NodeRegistry 继续保持纯数据。专用 React 渲染通过单独的轻量 renderer 映射或 NodeContent 分支完成，不把组件引用塞入 NodeRegistry，避免循环依赖。

## 15. 方案比较

### 15.1 方案 A：节点托管现有向导（采用）

- 修改范围：中等，覆盖领域模型、节点 UI、任务 operation 和迁移。
- 兼容性：保留 Modal、Group、旧 API、图片和视频行为。
- 可恢复性：AI 请求提交后可刷新恢复。
- 可扩展性：可直接承接专业镜头表、资产、模板和 Agent。
- 风险：需要集中处理两个节点与一个任务的原子回填。
- 回滚：单阶段 commit 可整体回滚，旧 storyContext 仍保留。

### 15.2 方案 B：Modal 完成后才创建节点（不采用）

- 修改范围最小。
- 不改变现有向导开始行为。
- AI 运行期间仍没有持久节点，刷新会失去编辑上下文。
- 无法完整利用阶段 3 的任务恢复能力。
- 会把“持久化节点”降级为结束后的导出格式，不满足目标。

### 15.3 方案 C：只使用 StoryboardNode（不采用）

- 实现最快，数据集中。
- 无法形成可独立输入、输出和优化的 ScriptNode。
- 后续 AI Director 仍需拆分数据，制造二次迁移。
- 与明确的 ScriptNode + StoryboardNode 路线图不一致。

## 16. 本次实现范围

- 新增 Script NodeType、定义、默认值、图标键和创建入口。
- 激活 StoryboardNode 的数据、端口、创建入口和专用 UI。
- 新增 `script` PortDataType 与两条明确连接规则。
- 新增故事领域类型、工厂、normalizer 和 selector。
- workflow schema v5 及幂等迁移。
- 旧 storyContext 的读取兼容、惰性节点化和保存镜像。
- 现有向导改为节点托管。
- `generate-story-package` GenerationTask operation。
- 结构化 Task output、恢复、取消和重试。
- Shot 与现有 Image/Video 节点的稳定关联。
- 原有分镜批量生图、批量生视频行为回归。
- 单元测试、后端测试、typecheck、完整 test、build 和手动冒烟。

## 17. 本次不实现

- 独立 Asset/SubjectAsset 和跨项目主体库。
- 专业横向镜头表、字段显示隐藏、拖拽排序 UI。
- Prompt Compiler 和提示词版本历史。
- 新图片或视频模型。
- 音频、旁白、音乐、音效或时间线。
- Agent API 或自然语言画布编排。
- 团队、权限、云数据库或多人协作。
- Storyboard -> Image 的新 Edge 语义。
- 全面 NodeData discriminated union 替换。
- 重写 App.tsx、CanvasNode 或现有画布。

## 18. 准备新增和修改的文件

预计新增：

- `src/domain/storyboard/storyboardTypes.ts`
- `src/domain/storyboard/storyboardNormalization.ts`
- `src/domain/storyboard/storyboardFactories.ts`
- `src/domain/storyboard/storyboardSelectors.ts`
- `src/domain/generation/taskResultUpdates.ts`
- `src/components/canvas/ScriptNodeContent.tsx`
- `src/components/canvas/StoryboardNodeContent.tsx`
- `src/utils/storyboardDomain.test.ts`
- `server/services/storyboardGenerationTasks.test.js`

预计修改：

- `src/types.ts`
- `src/domain/graph/graphTypes.ts`
- `src/domain/nodes/nodeDefinition.ts`
- `src/domain/nodes/nodeRegistry.ts`
- `src/domain/graph/connectionRules.ts`
- `src/domain/graph/edgeMigration.ts`
- `src/domain/workflow/workflowSchema.ts`
- `src/domain/workflow/migrateWorkflow.ts`
- `src/hooks/useStoryboardGenerator.ts`
- `src/hooks/useGenerationRecovery.ts`
- `src/hooks/useNodeManagement.ts`
- `src/services/generationService.ts`
- `src/domain/generation/generationTask.ts`
- `src/components/ContextMenu.tsx`
- `src/components/canvas/NodeContent.tsx`
- `src/components/canvas/CanvasNode.tsx`
- `src/components/modals/StoryboardGeneratorModal.tsx`
- `src/components/modals/StoryboardVideoModal.tsx`
- `src/App.tsx`
- `server/routes/generation.js`
- `server/routes/storyboard.js`
- `server/services/storyboardText.js`
- 相关现有测试文件

实施时可根据真实依赖合并纯函数文件，但不得把领域逻辑重新塞入 App 或 React 组件。

## 19. 测试计划

### 19.1 纯函数测试

- NodeRegistry 包含所有 NodeType，包括 SCRIPT。
- Script/Storyboard 默认数据有效且每次创建互不共享引用。
- Script 和 Storyboard 端口 ID 唯一、方向和 dataType 正确。
- Text -> Script 合法，Script -> Storyboard 合法，Image -> Storyboard 非法。
- ScriptDocument 和 StoryboardDocument normalizer 保留未知字段并幂等。
- 缺失 Shot ID 时生成稳定 ID。
- Shot 顺序规范化不丢失未知字段。
- 新节点数据可投影为旧 storyContext。
- 旧 storyContext 可惰性转换为新节点数据。
- 重复惰性转换不创建重复节点或 Edge。
- taskId、Script revision 或 Storyboard revision 不匹配时不应用结构化结果。
- 成功、失败、取消任务能生成正确的双节点更新。
- 双节点更新通过一次图状态提交完成，不暴露只更新一半的中间状态。
- 删除关联媒体节点后 Shot 规范化清理悬空引用。

### 19.2 后端测试

- generate-story-package task 校验必填字段和 sceneCount。
- scripts 与 story-package 两种 generationMode 保持各自现有响应语义。
- Provider 与 model 选择遵循现有配置优先级。
- 任务 inputSnapshot 不包含 API key。
- executor 返回规范化的 story-package output。
- 旧 `/api/storyboard/generate-story-package` 响应结构不变。
- Task 失败映射统一错误类型。
- 取消、重试和 restart failure 保持阶段 3 行为。
- 结构化 output 能原子写入并重新读取。

### 19.3 前端行为测试或纯逻辑替代测试

- 首次 AI 提交只创建一对节点和一条 Edge。
- 重复点击不会重复提交活动任务。
- 任务创建后两个节点保存 activeTaskId。
- 成功只回填匹配任务与修订的节点。
- 刷新后 loading 节点可以通过批量查询恢复。
- 旧 Group 点击编辑时创建节点并恢复 Modal。
- 新节点重新打开时恢复 story、scripts、模型和预览图。
- Script/Storyboard 节点删除不级联删除媒体节点。
- 旧 Group 的 Create Videos 行为保持可用。

### 19.4 回归测试

- 旧纯文本、图片、视频 workflow 加载。
- 旧 storyboard group workflow 加载和保存。
- 图片生成、视频生成、首尾帧、动作参考。
- MediaTake、Hero Take 和任务恢复。
- Edge 与 parentIds 双写。
- 现有分镜批量图片生成。
- 现有分镜批量视频生成。

### 19.5 完整验证

按顺序运行：

```bash
npm run typecheck
npm test
npm run build
```

随后检查 git diff、无关修改、旧 workflow fixture、新 workflow 往返保存，以及前后端运行时冒烟。

## 20. 验收标准

- 现有工具栏分镜入口和五步 Modal 可继续使用。
- 可以从菜单创建 ScriptNode 和 StoryboardNode。
- ScriptNode 和 StoryboardNode 可通过明确端口连接。
- AI 故事包生成通过 GenerationTask 提交、排队、恢复、取消和重试。
- 刷新后已提交的故事包任务不会丢失；相同 taskId 只查询和分发一次。
- 旧任务不能覆盖新的节点修订。
- 新 workflow 保存 scriptData、storyboardData、Edge 和 schemaVersion 5。
- 新 workflow 保存后重新加载，故事、镜头顺序、模型和关联节点不变。
- 旧 storyboard group 不改变布局即可加载。
- 旧 group 首次编辑可以惰性升级且不会重复创建节点。
- 新节点数据能生成旧 storyContext 兼容镜像。
- 原有分镜图片生成和视频生成行为不变。
- 删除 Script/Storyboard 节点不会误删已有媒体。
- `npm run typecheck`、`npm test`、`npm run build` 全部通过。
- 阶段完成后独立 commit 并推送到 `codex/foundation-refactor`。

## 21. 风险与缓解

### 21.1 双数据源漂移

风险：新节点和旧 storyContext 同时存在。

缓解：节点是唯一主数据；读取和保存镜像通过集中 selector/同步函数完成，UI 不自行双写。

### 21.2 一个任务更新两个节点

风险：只更新一个节点造成部分状态。

缓解：使用纯函数一次生成 `{ nodeId -> updates }` 映射，生成映射前同时检查两个节点的 taskId 和 revision。任一检查失败就不返回任何更新。图状态层通过一次 `setNodes` functional update 应用整份映射，恢复可重复执行并保持幂等。

### 21.3 旧 workflow 画布变化

风险：加载时自动增加节点会改变布局和选择。

缓解：只在用户主动编辑旧 Group 时惰性创建节点。

### 21.4 任务 output 类型扩展影响媒体恢复

风险：现有代码假设所有成功结果都有 resultUrl。

缓解：按 `operation` 和 `output.kind` 分发；无 kind 且有 resultUrl 的旧任务继续按 media 处理。

### 21.5 Modal 状态与节点状态竞态

风险：异步任务完成时 Modal 仍持有旧闭包。

缓解：Modal 显示状态从绑定节点派生；提交和回填使用节点 ID、taskId 和两个 revision，不依赖请求发起时的 React state 引用。统一恢复层先去重 taskId，再分发结构化结果。

### 21.6 范围膨胀

风险：顺手实现资产、镜头表、Prompt Compiler 或 Agent。

缓解：本阶段验收只覆盖持久化节点和现有向导闭环，后续能力留在既定阶段。

## 22. 回滚方案

- 阶段 4 使用独立 commit，不修改已有阶段提交。
- 回滚代码后，旧 storyContext 仍保留，原分镜向导和媒体节点仍可读取。
- schemaVersion 5 workflow 中的 scriptData、storyboardData 和未知 NodeType 在旧代码中会被迁移层保留；旧客户端可能无法渲染新节点，但不得删除其字段。
- 不执行破坏性数据迁移，不删除 parentIds、旧 API、旧 Group 字段或媒体文件。
- 若结构化 Task operation 出现运行问题，可以临时让新节点提交回退到旧同步 story-package endpoint，而不改变保存的数据模型；正式回滚仍以撤销阶段 commit 为准。

## 23. 实施顺序

1. 先为领域 normalizer、registry、端口和迁移编写失败测试。
2. 实现 Script/Storyboard 类型、默认值和 workflow v5 迁移。
3. 实现连接规则和旧 Group 兼容 selector/惰性转换。
4. 为结构化 Task output 和双节点安全回填编写失败测试。
5. 实现后端 generate-story-package task executor 和旧 API 共享服务。
6. 实现前端 task 提交与统一恢复分发。
7. 改造 useStoryboardGenerator 为节点托管。
8. 增加紧凑节点 UI 和最小 App 接线。
9. 验证现有批量图片和视频流程。
10. 运行完整验证、代码审查、提交并推送。

每个里程碑只运行相关最小测试，最终再运行 typecheck、全部测试和 build。
