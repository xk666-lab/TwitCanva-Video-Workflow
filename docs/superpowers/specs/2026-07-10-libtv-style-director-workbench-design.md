# LibTV 式剧情导演制作台设计规范

> 日期：2026-07-10
> 项目：TwitCanva Video Workflow
> 状态：已通过交互与视觉方向确认，等待实施计划
> 设计原则：复用 LibTV 的创作流程结构，沿用 TwitCanva 的视觉与技术底座

## 1. 目标

在现有 TwitCanva 无限画布中增加一条可落地的剧情导演流程：

```text
故事 / 剧本节点
  -> 脚本生成器节点
  -> 全屏三阶段制作台
       1. 确认镜头
       2. 准备资产
       3. 合成提示词
  -> 保存并应用到画布
  -> 公共资产组 + 按场景组织的镜头组
```

本设计的第一版只生成策划节点和提示词，不自动调用图片或视频模型。用户可以在画布上继续从镜头节点创建图片节点或视频节点。

## 2. 已确认决策

- 使用“画布内导演流程”，不新建独立导演页面，不更换现有画布引擎。
- 画布入口采用 `脚本节点 -> 脚本生成器节点`。
- 点击脚本生成器后，以全屏覆盖层打开制作台，画布保持挂载，不丢失位置和选择状态。
- 制作台采用 LibTV 式三步流程：确认镜头、准备资产、合成提示词。
- 镜头使用横向表格编辑，不使用通用卡片式审核页。
- 资产通过镜头中的 `@角色 / @场景 / @道具 / @风格` 引用。
- 结果按场景分组展开到画布。
- 第一版只创建策划节点，不自动生成图片或视频。
- 信息架构参考 LibTV，视觉完全沿用 TwitCanva 当前风格。
- 保持旧工作流 JSON、旧节点和旧分组可加载。

## 3. 参考边界

第一方资料可以高置信确认 LibTV 具备脚本节点、脚本转分镜组、镜头控制、4/9/25 宫格、批量生成及视频合成能力。角色库、场景库和 Hero Take 的完整数据模型未被第一方资料充分确认，因此这些部分在 TwitCanva 中属于自主增强设计。

详细证据见：[LibTV 公开功能核验与 TwitCanva 复刻映射](../../research/libtv-public-feature-research.md)。

主要来源：

- [LibTV 官网](https://www.liblib.tv/)
- [LibTV CLI](https://www.liblib.tv/cli)
- [libtv-labs/libtv-skills](https://github.com/libtv-labs/libtv-skills)
- [LibTV 官方功能介绍](https://www.bilibili.com/video/BV1jEQzBNE3K/)
- [LibTV Creator + Agent 介绍](https://www.bilibili.com/video/BV1qVwZz2Ez7/)

## 4. 用户流程

### 4.1 创建入口

用户可以通过两种方式进入：

1. 在已有文本/脚本节点右侧连接一个脚本生成器节点。
2. 从空画布快捷入口选择“故事脚本生成”，系统创建文本节点和脚本生成器节点并自动连线。

脚本生成器初始状态显示：

- 输入脚本是否有效。
- 当前制作台步骤。
- 已解析镜头数。
- 已准备资产数。
- 已合成提示词数。
- “打开脚本节点”按钮。

### 4.2 首次打开

首次打开脚本生成器时：

1. 读取上游脚本节点文本。
2. 调用结构化脚本生成接口。
3. 返回项目标题、风格锚点、角色、场景、道具和镜头表。
4. 校验返回结构。
5. 成功后进入“确认镜头”；失败则保留原脚本并显示可重试错误。

### 4.3 再次打开

再次打开时直接恢复上次步骤、滚动位置、镜头编辑结果、资产准备状态和提示词结果，不重复调用模型。

## 5. 三阶段制作台

### 5.1 公共框架

制作台是现有 `App` 内的全屏覆盖层，而不是新路由：

- 顶部左侧：TwitCanva 标识、画布名称、脚本项目名称。
- 顶部右侧：保存草稿、返回画布。
- 主导航：三步进度条及完成计数。
- 中部：当前步骤内容。
- 底部：返回、下一步、保存并应用到画布。
- 所有编辑 800ms 防抖写入当前工作流内存状态；手动保存仍走现有工作流保存入口。

### 5.2 第一步：确认镜头

使用可滚动横向表格，每一行是一个镜头。字段如下：

| 字段 | 类型 | 规则 |
|---|---|---|
| 镜号 | 整数 | 自动排序，拖拽排序后重编号 |
| 时长 | 秒 | 1-30 秒；允许手动调整 |
| 画面描述 | 富文本 | 支持 `@资产` 引用 |
| 景别 | 枚举 | 大远景、远景、全景、中景、近景、特写、大特写 |
| 光影氛围 | 文本 | 时间、主光、色调、气氛 |
| 对白/旁白 | 文本 | 可为空 |
| 音效 | 文本 | 可为空 |
| 运镜 | 文本/预设 | 固定、推进、拉远、横移、跟拍、摇镜、环绕等 |
| 最终提示词 | 只读摘要 | 第三步生成前显示“待合成” |
| 操作 | 菜单 | 复制、拆分、删除、重新生成该镜头 |

交互规则：

- 支持新增、删除、复制、拆分和拖拽排序镜头。
- 编辑任意镜头后，该镜头的提示词状态变为 `stale`，其他镜头不受影响。
- `@` 菜单从当前项目资产和素材库中搜索。
- 第一步通过条件：至少有一个镜头，且每个镜头有画面描述、景别和有效时长。

### 5.3 第二步：准备资产

系统从所有镜头的 `assetRefs` 汇总唯一资产，并按类型分组：

- 角色
- 场景
- 道具
- 风格
- 音效

每个资产可以来自：

- AI 从脚本自动提取的文字设定。
- 现有项目素材库。
- 用户上传的参考图。
- 用户新建或编辑的资产。
- 后续生成的角色板、三视图、表情九宫格或场景参考图。

第一版“资产已准备”的最低条件是：

- 有名称。
- 有非空文字设定。
- 类型明确。

参考图不是强制条件。这样用户可以只做策划，不被图片生成阻塞。

角色资产面板显示：

- 名称、标签、外貌、服装、性格、身份锚点。
- 正面参考、面部参考、三视图、表情表、服装板。
- 从角色库选择、上传参考、编辑设定、生成角色板。

场景资产面板显示：

- 名称、地点、时间、天气、空间布局、光线、氛围和风格锚点。
- 全景、机位参考、空镜参考。
- 从场景库选择、上传参考、编辑设定、生成场景参考。

道具、风格和音效采用同一资产卡规范，但字段按类型精简。

第二步通过条件：所有被镜头引用的资产至少满足最低文字设定要求。

### 5.4 第三步：合成提示词

第三步以镜头表展示：

- 镜号。
- 引用资产。
- 图片提示词。
- 视频提示词。
- 合成状态。
- 单镜头合成/重试操作。

Prompt Compiler 输入：

```text
全局风格锚点
+ 镜头画面描述
+ 景别与构图
+ 光影氛围
+ 对白/音效意图
+ 运镜与时长
+ 角色 aiBrief
+ 场景 aiBrief
+ 道具/风格 aiBrief
```

Prompt Compiler 输出：

- `imagePrompt`：主体、场景、构图、镜头、光线、材质、风格和一致性约束。
- `videoPrompt`：在图片语义基础上增加时长、动作、运镜、节奏、环境动态和音频意图。
- `negativePrompt`：可选，第一版保存但不强制所有 Provider 使用。
- `sourceRevision`：用于判断提示词是否因上游变化而过期。

合成策略：

- 只合成新增或已过期的镜头。
- 支持全量合成和单镜头合成。
- 单镜头失败不清空已成功镜头。
- 提示词可手动编辑；手动编辑后标记 `manualOverride=true`，自动重编译前需要用户确认覆盖。

第三步通过条件：每个镜头至少有图片提示词和视频提示词。

## 6. 应用到画布

### 6.1 生成结构

点击“保存并应用到画布”后创建：

```text
脚本节点
  -> 脚本生成器节点
       -> 公共资产组
            -> 角色节点 x N
            -> 道具节点 x N
            -> 风格节点 x N
       -> 场景组 01
            -> 场景节点
            -> 镜头节点 01
            -> 镜头节点 02
       -> 场景组 02
            -> 场景节点
            -> 镜头节点 03
            -> 镜头节点 04
```

### 6.2 可见边

- 脚本节点连接脚本生成器节点。
- 脚本生成器连接每个场景组中的场景节点。
- 场景节点连接组内镜头节点。
- 资产与镜头的关系保存在 `assetRefs`，默认不绘制角色到所有镜头的交叉边。
- 选中角色或场景资产时，高亮所有引用它的镜头。

### 6.3 布局

- 以脚本生成器右侧为锚点。
- 公共资产组放在右上方。
- 场景组从左到右排列，超过可视宽度后换行。
- 场景节点位于分组顶部，镜头节点使用两列网格。
- 自动布局只决定初始位置，用户之后可自由移动。

### 6.4 幂等与更新

- 每次结构变化使 `DirectorProject.revision` 增加。
- 成功应用后记录 `appliedRevision`。
- 同一修订号重复点击不会创建重复节点。
- 新修订应用时根据稳定实体 ID 更新已有策划节点，而不是全部删除重建。
- 已连接图片/视频节点不会自动删除；上游镜头变化时标记为 `stale`。

## 7. 视觉规范

LibTV 只提供信息架构参考。视觉使用现有 TwitCanva 组件语言：

| 用途 | TwitCanva 现有规范 |
|---|---|
| 画布背景 | `#050505` + 当前点阵网格 |
| 节点背景 | `#0f0f0f` |
| 面板背景 | `#1a1a1a` / neutral-900 |
| 边框 | neutral-800 / neutral-700 |
| 圆角 | `rounded-xl`、`rounded-2xl`、工具栏 `rounded-full` |
| 选中态 | blue/cyan ring；视频节点保留 purple 语义 |
| 主按钮 | 当前分镜入口的 cyan-to-violet 渐变 |
| 次按钮 | neutral-800，neutral-700 hover |
| 错误 | red-900/20 背景、red-800 边框、red-400 文字 |
| 加载 | 现有 blue spinner 与进度文案 |
| 成功 | 绿色文字/图标，不使用大面积绿色底色 |
| 动效 | 200-300ms hover、展开和步骤切换 |

要求：

- 新制作台必须读取现有 `canvasTheme`，同时支持暗色和浅色。
- 不建立第二套全局 CSS Token；优先复用现有 Tailwind 类。
- 表格滚动条沿用 `index.html` 中的 8px 深色滚动条。
- 制作台打开和步骤切换可使用淡入与轻微上移，不添加持续装饰动画。

## 8. 数据模型

### 8.1 WorkflowData 扩展

```ts
interface WorkflowData {
  id: string | null;
  title: string;
  nodes: NodeData[];
  groups: NodeGroup[];
  viewport: Viewport;
  directorProjects?: DirectorProject[];
  directorAssets?: DirectorAsset[];
}
```

新字段全部可选，保证旧工作流加载。

### 8.2 NodeData 兼容扩展

```ts
interface NodeData {
  // Existing fields remain unchanged.
  directorRole?:
    | 'script'
    | 'script-generator'
    | 'character'
    | 'scene'
    | 'prop'
    | 'style'
    | 'shot';
  directorProjectId?: string;
  directorEntityId?: string;
  sourceRevision?: number;
  stale?: boolean;
}
```

第一版保留现有 `NodeType` 作为渲染兼容层，通过 `directorRole` 选择导演节点内容。后续节点注册表稳定后，再决定是否新增独立 `NodeType`。

### 8.3 NodeGroup 兼容扩展

```ts
interface NodeGroup {
  id: string;
  nodeIds: string[];
  label: string;
  directorProjectId?: string;
  groupRole?: 'asset-group' | 'scene-group';
  sceneId?: string;
  status?: 'idle' | 'stale' | 'error';
  collapsed?: boolean;
  sourceRevision?: number;
  storyContext?: LegacyStoryContext;
}
```

### 8.4 DirectorProject

```ts
interface DirectorProject {
  id: string;
  title: string;
  sourceNodeId: string;
  generatorNodeId: string;
  currentStep: 'shots' | 'assets' | 'prompts';
  status: 'draft' | 'generating' | 'ready' | 'error';
  revision: number;
  appliedRevision?: number;
  story: string;
  styleBrief: string;
  targetDuration?: number;
  aspectRatio: string;
  characterIds: string[];
  sceneIds: string[];
  propIds: string[];
  styleIds: string[];
  shots: DirectorShot[];
  createdAt: string;
  updatedAt: string;
}
```

### 8.5 DirectorShot

```ts
interface DirectorShot {
  id: string;
  sceneId: string;
  order: number;
  duration: number;
  visualDescription: string;
  shotSize: string;
  lighting: string;
  dialogue?: string;
  sound?: string;
  cameraMovement: string;
  assetRefs: string[];
  imagePrompt?: string;
  videoPrompt?: string;
  negativePrompt?: string;
  promptStatus: 'missing' | 'generating' | 'ready' | 'stale' | 'error';
  promptError?: string;
  manualOverride?: boolean;
  sourceRevision: number;
}
```

### 8.6 DirectorAsset

```ts
interface DirectorAsset {
  id: string;
  projectId: string;
  type: 'character' | 'scene' | 'prop' | 'style' | 'audio';
  name: string;
  aliases: string[];
  description: string;
  aiBrief: string;
  referenceUrls: string[];
  source: 'generated' | 'library' | 'uploaded' | 'manual';
  status: 'draft' | 'ready' | 'error';
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
```

### 8.7 GraphPatch

```ts
interface DirectorGraphPatch {
  projectId: string;
  revision: number;
  nodesToCreate: NodeData[];
  nodesToUpdate: Array<Partial<NodeData> & { id: string }>;
  groupsToCreate: NodeGroup[];
  groupsToUpdate: Array<Partial<NodeGroup> & { id: string }>;
}
```

Graph Patch 在内存中完成 schema、ID、分组成员和布局冲突检查后，一次性提交到 React state。

## 9. 服务端契约

### 9.1 结构化脚本生成

复用并扩展：

```http
POST /api/storyboard/generate-story-package
```

请求：

```json
{
  "story": "...",
  "targetDuration": 60,
  "sceneCount": 3,
  "shotCount": 8,
  "aspectRatio": "16:9",
  "style": "古风史诗"
}
```

返回必须包含结构化 `characters`、`scenes`、`props` 和 `shots`。服务端负责移除 Markdown fence、解析 JSON、校验字段并返回可读错误。

### 9.2 提示词合成

新增：

```http
POST /api/storyboard/compile-prompts
```

请求传入全局风格、待编译镜头及其引用资产。返回每个镜头的图片提示词、视频提示词和可选负面提示词。

要求：

- 支持一条或多条镜头。
- 以镜头 ID 对齐返回结果，不能依赖数组位置。
- 服务端使用现有 OpenAI-compatible 文本 Provider；未来可切换 Provider。
- 部分镜头失败时返回逐镜头错误，而不是整批 500。

## 10. 状态与错误处理

### 10.1 状态机

```text
idle
  -> generating-script
  -> shots-ready
  -> assets-ready
  -> compiling-prompts
  -> prompts-ready
  -> applying-graph
  -> applied
```

任意异步阶段可以进入 `error`，重试后回到原阶段，不清空已成功结果。

### 10.2 错误规则

- 结构化脚本解析失败：保留原脚本，显示缺失字段或解析原因。
- 网络失败：显示“无法连接本地后端”并允许重试。
- API Key 缺失：明确指出缺失的服务端配置，不显示通用 500。
- 资产缺少参考图：不报错；有文字设定即可继续。
- 资产缺少名称或描述：阻止进入第三步并定位对应资产卡。
- 单镜头提示词失败：只标红该行，支持单行重试。
- Graph Patch 校验失败：不写入任何节点，显示具体冲突。
- 保存失败：保留本地内存状态，显示未保存标记。

### 10.3 取消

- 结构化脚本生成和提示词合成都使用 `AbortController`。
- 取消不会删除已成功的镜头或提示词。
- 关闭制作台时若有进行中任务，先取消请求，再保存当前草稿状态。

## 11. 持久化与兼容

- `directorProjects` 和 `directorAssets` 随现有 Workflow JSON 保存。
- 生成媒体仍按当前 `library/` 与 Supabase Storage 逻辑保存，不在本设计中改变。
- 旧工作流没有导演字段时使用空数组默认值。
- 旧 `storyContext` 继续保留，加载时可以转换为一个只读的 legacy director project；不强制迁移文件。
- 保存脚本生成器时只在节点中存引用 ID，完整镜头与资产数据放在 `directorProjects` / `directorAssets`。
- 自动保存只写当前工作流，不创建新工作流副本。

## 12. 测试策略

### 12.1 纯函数单元测试

- 结构化脚本响应解析和 schema 校验。
- `@mention` 提取、去重、重命名和缺失引用检测。
- Prompt Compiler 请求构建和逐镜头响应解析。
- Graph Patch 创建、布局、ID 稳定性和幂等。
- 修改上游后 stale 传播。
- 旧 Workflow JSON 兼容适配。

### 12.2 组件测试

- 三步步骤门禁。
- 镜头新增、删除、复制、拆分和排序。
- 单元格编辑后只使当前镜头提示词过期。
- 资产最低准备条件。
- 单镜头合成失败与重试。
- 手动提示词覆盖保护。
- 暗色与浅色主题类名。

### 12.3 集成测试

```text
输入故事
-> 生成结构化镜头表
-> 编辑镜头
-> 准备 @资产
-> 合成提示词
-> 按场景应用到画布
-> 保存工作流
-> 重新加载并恢复制作台
```

额外覆盖：

- 同一修订重复应用不产生副本。
- 修改脚本后已应用节点标记过期。
- Graph Patch 失败不产生半张图。
- 后端缺失 API Key 时显示可操作错误。

## 13. MVP 范围

### 必须实现

- 脚本节点与脚本生成器节点。
- 全屏三阶段制作台。
- 镜头表编辑。
- 角色、场景、道具和风格文字资产。
- 从现有素材库选择参考图。
- `@资产` 引用。
- 图片/视频提示词合成。
- 公共资产组。
- 按场景创建场景节点和镜头节点。
- Graph Patch 原子应用与幂等。
- 保存、恢复、取消、单项重试。
- 旧工作流兼容。
- TwitCanva 暗色/浅色主题一致性。

### 本轮不实现

- 自动批量生成图片或视频。
- 4/9/25 宫格图片生成。
- 角色三视图的真实模型调用。
- 场景参考图的真实模型调用。
- Take / Hero Take。
- 视频合成与导出。
- 多人协作、团队权限和云端计费。
- ReactFlow、Next.js 或数据库迁移。

## 14. 验收标准

1. 用户可从脚本节点打开 LibTV 式三阶段制作台。
2. 制作台视觉与当前 TwitCanva 画布、节点、按钮和主题一致。
3. AI 输出为结构化镜头表，而不是一段不可编辑文本。
4. 镜头表支持编辑、排序、新增、复制和删除。
5. 镜头中的 `@资产` 能进入准备资产步骤并关联现有素材。
6. 用户可逐镜头或批量合成图片/视频提示词。
7. 应用后生成公共资产组和按场景划分的策划节点组。
8. 应用过程不会自动调用图片或视频模型。
9. 同一版本重复应用不会创建重复节点。
10. 保存并重新打开工作流后，制作台内容和当前步骤完整恢复。
11. 旧工作流仍能加载、编辑和保存。
12. 错误信息能定位到脚本、资产、镜头或后端配置，而不是只显示 `Internal Server Error`。

## 15. 实施边界

本功能以增量方式加入以下现有边界：

- 前端继续使用 React + TypeScript + Vite。
- 画布继续使用当前自定义 DOM/transform 实现。
- 制作台使用现有模态框与 Tailwind 组件风格。
- 文本生成继续通过本地 Express 后端和现有 OpenAI-compatible Provider。
- 工作流继续保存为本地 JSON。
- 素材继续使用现有 Asset Library 和 Supabase Storage。

实现时应把导演领域对象、制作台 UI、Graph Builder、Prompt Compiler 和持久化适配分成独立模块，避免继续扩大 `App.tsx`、`src/types.ts` 和现有 Storyboard Modal 的职责。
