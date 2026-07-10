# LibTV 公开功能核验与 TwitCanva 复刻映射

> 核验日期：2026-07-10
> 研究范围：仅使用 LibTV / LiblibAI 官方网站、官方 CLI 发布物、官方 GitHub 组织及官方哔哩哔哩账号公开材料。未使用导航站、媒体测评、个人教程或其他二手资料作为功能证据。

## 1. 结论摘要

LibTV 公开资料能够高置信确认的核心，并不是一套已经公开数据结构的“角色库 + 场景库 + Hero Take”系统，而是以下产品闭环：

1. 以无限画布和节点连线承载剧本、分镜、镜头、图片、视频与剪辑流程。
2. 提供专属脚本节点，可把剧情节奏和视听要素拆解为分镜，并批量生成分镜图或继续生成视频。
3. 分镜是强能力：官方公开支持 4 / 9 / 25 宫格工具；CLI 可从脚本节点创建分镜图组，并按顺序运行组内图片节点。
4. 镜头创作支持拍摄视角、打光氛围、动作表情和视频运镜控制，但公开材料不足以证明存在独立的结构化 `Shot` 节点。
5. 视频合成、裁切、实时预览和最长 20 分钟导出有官方明确演示和文字说明。
6. 创作资产与工作流可以沉淀复用，官方 CLI 也公开了个人/团队账户作用域和团队项目空间；但团队共享资产目录、权限、实时协作等细节未被公开确认。
7. 多结果生成可以从 CLI 的 `count` 参数和批量生成能力得到支持；“多版本对比、选片、Hero Take 向下游传递”没有找到第一方明确证据。

因此，TwitCanva 最值得复刻的是“剧情输入 -> 脚本节点 -> 分镜组 -> 镜头控制 -> 批量生成 -> 视频合成”的创作闭环；角色库、场景库、Take/Hero Take 与团队资产治理应该作为我们自己的增强设计，而不是宣称照搬 LibTV 的已确认功能。

## 2. 证据与可信度规则

### 2.1 第一方来源

- [LibTV 官网](https://www.liblib.tv/)
- [LibTV 项目页](https://www.liblib.tv/project)
- [LibTV CLI 官方页面](https://www.liblib.tv/cli)
- [LibTV CLI 最新版本清单](https://liblibai-web-static.liblib.cloud/cli/latest/manifest.json)
- [LibTV CLI 1.0.2 Windows 官方发布包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)
- [libtv-labs 官方 GitHub 组织](https://github.com/libtv-labs)
- [libtv-skills 官方仓库](https://github.com/libtv-labs/libtv-skills)
- [官方 Agent Skill 说明](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md)
- [官方功能介绍视频](https://www.bilibili.com/video/BV1jEQzBNE3K/)
- [Creator + Agent 上线视频](https://www.bilibili.com/video/BV1qVwZz2Ez7/)
- [官方“视频合成”演示](https://www.bilibili.com/video/BV1nCXaBZEXB/)

### 2.2 可信度定义

- **高**：至少一项官方材料明确描述该功能，且能由另一个官方页面、CLI 命令或官方演示交叉验证。
- **中**：官方明确提到相关能力，但其数据模型、操作范围或网页端细节未公开。
- **低 / 未确认**：只能推断相邻能力，未找到官方对目标功能的直接表述。此类内容不能作为“LibTV 已有功能”写入产品宣传或需求依据。

### 2.3 CLI 核验说明

核验日官方 `latest/manifest.json` 返回版本 `1.0.2`。研究从官方发布包运行了 `libtv --help`、`libtv node create --help`、`libtv script storyboard --help`、`libtv group create --help`、`libtv download --help`、`libtv account --help` 和 `libtv project list --help`。CLI 是公开可下载的官方产品契约，但 CLI 支持某能力不自动等于网页端拥有同名按钮或完全相同的 UI。

## 3. 分项核验

### 3.1 剧情 / 剧本生成

**公开证据**

- 官方功能介绍明确展示“专属脚本节点”，并说明它可拆解剧情节奏和视听要素，随后批量成图或继续生成成片。[来源](https://www.bilibili.com/video/BV1jEQzBNE3K/)
- 官方上线介绍将“剧本、分镜、镜头和剪辑”列为无限画布中的完整创作流程，并说明 Agent 能理解任务、调用模型、编排工作流并自动完成创作。[来源](https://www.bilibili.com/video/BV1qVwZz2Ez7/)
- 官方 Agent Skill 将“一句话生成完整短剧”定义为“剧本 -> 分镜 -> 成片”的复杂创作，并明确后端 Agent 负责拆解分镜、编排工作流、选择模型与编写 Prompt。[来源](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md)
- 官方 CLI 1.0.2 公开 `script` 节点类型和 `libtv script storyboard <node>`，后者从已有脚本行创建分镜图组并执行生成。[CLI 页面](https://www.liblib.tv/cli)；[版本包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)

**可确认程度：高（流程）；中（具体网页交互）**

可以确认 LibTV 有脚本节点、剧情/视听拆解、脚本转分镜和 Agent 驱动的全流程生成。公开材料没有给出脚本对象的字段 schema，也没有证明网页端一定存在独立的“剧情生成剧本向导”、剧本版本树、段落级锁定或多人编剧审阅。

**TwitCanva 可复刻映射**

- 保留现有故事输入和 `generate-story-package` 能力，将结果从弹窗临时状态升级为持久化的 `Story`、`Script` 和 `Storyboard` 数据。
- 一键创建 `Text Node -> Script Generator Node -> Storyboard Group`，生成时展示阶段进度，完成后允许逐段重写。
- 脚本生成结果必须结构化输出角色、场景、镜头与节奏，而不是只返回一大段文本。
- 将“自动建图”视为 Agent 编排结果：先提交结构化建图计划，再原子化创建节点、连线和分组。

**不要臆测**

- 不要声称 LibTV 已公开具体 LLM、系统提示词、剧本 JSON schema 或上下文窗口策略。
- 不要声称其脚本节点已经具备完整的版本审阅、协同批注或分支合并能力。

### 3.2 角色管理

**公开证据**

- 官方功能介绍说明“创作资产 / 工作流实时沉淀，随取随用”。[来源](https://www.bilibili.com/video/BV1jEQzBNE3K/)
- 官方 CLI 页面使用“视频、图像、角色——随需而至”的产品文案。[来源](https://www.liblib.tv/cli)
- 官方 Agent Skill 的下载工作流把角色设定结果作为 `character` 类生成结果命名示例，说明角色类素材是支持的创作产物。[来源](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md)
- 但 CLI 1.0.2 公开的新建节点类型只有 `text`、`image`、`video`、`audio`、`group`、`script`、`video-clip`，未公开 `character` 节点类型。[版本包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)

**可确认程度：中低**

可以确认角色相关图片/资产能够生成并沉淀；不能据此确认 LibTV 有独立角色数据库、角色 ID、角色三视图专属实体、服装版本、跨项目角色复用或一致性锁定算法。

**TwitCanva 可复刻映射**

- 自主增加一等 `CharacterAsset`，字段至少包含名称、外貌、服装、性格、身份锚点、参考图、版本和默认 Hero 参考。
- 画布上的 `Character Node` 只引用资产 ID；修改资产时，引用该角色的下游镜头标记为过期。
- 提供三视图/表情表/服装变体作为角色资产的生成配方，不把这些图片简单散落为无语义图片节点。

**不要臆测**

- 不要把“角色类素材可生成”写成“LibTV 已有成熟角色库”。
- 不要声称官方已公开角色一致性评分、LoRA 训练、Face ID 或角色 DNA 的实现方式。

### 3.3 场景管理

**公开证据**

- 官方功能介绍确认拍摄视角、打光氛围、动作表情和视频运镜可以被控制，也确认创作资产可以沉淀。[来源](https://www.bilibili.com/video/BV1jEQzBNE3K/)
- 官方 Agent Skill 支持参考图片/视频上传、风格迁移、镜头调整、分镜/故事板等场景相关创作，但没有公开结构化场景实体。[来源](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md)
- CLI 1.0.2 的公开节点类型中没有 `scene`。[版本包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)

**可确认程度：低 / 独立场景管理未确认**

可以确认用户能通过图片、Prompt 和镜头参数塑造环境与氛围；不能确认存在独立场景库、场景节点、场景版本或“一个场景被多个镜头引用”的结构化关系。

**TwitCanva 可复刻映射**

- 将 `SceneAsset` 设计成我们的差异化基础设施，至少包含地点、时间、天气、光线、氛围、空间布局、风格锚点和参考图。
- `Shot Node` 引用 `sceneId`，而不是复制场景描述；场景变化时统一重编译下游 Prompt。
- 场景资产支持全景图、机位图和空镜图等不同 Take。

**不要臆测**

- 不要声称 LibTV 已公开场景资产的数据结构、跨镜头继承规则或空间一致性算法。

### 3.4 分镜

**公开证据**

- 官方功能介绍明确提供 4 / 9 / 25 宫格分镜工具，并说明脚本节点可一键批量成图、全量成片。[来源](https://www.bilibili.com/video/BV1jEQzBNE3K/)
- 官方 CLI 的 `libtv script storyboard <node>` 会校验脚本节点与分镜行，在脚本右侧创建分镜图组，继承或覆盖图片生成配置，并按顺序运行各分镜图片节点，最后返回分镜 `group` 节点详情。[CLI 页面](https://www.liblib.tv/cli)；[版本包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)
- CLI 的 `image shortcut` 与网页图片生成器的 `/` 快捷入口和九宫格工具对齐，说明分镜快捷能力不是纯宣传概念。[CLI 页面](https://www.liblib.tv/cli)
- 官方 Agent Skill 也把分镜/故事板设计和“推演后续故事并生成 16:9 九宫格”列为典型任务。[来源](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md)

**可确认程度：高**

可以确认脚本行、分镜图组、生成配置、顺序批量执行和宫格工具。公开材料没有给出分镜行完整 schema，也未确认分镜卡是否内建对白、音效、时码、焦距等全部字段。

**TwitCanva 可复刻映射**

- `Storyboard` 作为有序镜头集合，画布上以一等 `Storyboard Group` 展示，不只是一个大文本框。
- 每个分镜行创建 `Shot Node + Image Node`，组内按镜头序号自动布局；支持单镜重跑、整组运行和失败续跑。
- 4 / 9 / 25 宫格应作为“视图/导出方式”，底层仍保留独立镜头和独立生成结果，避免把宫格大图当作唯一数据源。

**不要臆测**

- 不要根据宫格能力推断官方拥有完整时间线、镜头版本树或镜头级审批系统。

### 3.5 镜头与导演控制

**公开证据**

- 官方功能介绍明确列出拍摄视角、打光氛围、动作表情和视频运镜的精准控制。[来源](https://www.bilibili.com/video/BV1jEQzBNE3K/)
- 官方上线介绍把“镜头”列为剧本、分镜和剪辑之间的一等创作环节。[来源](https://www.bilibili.com/video/BV1qVwZz2Ez7/)
- 官方 Agent Skill 支持局部修改、元素替换、镜头调整、视频续写和风格迁移，且后端 Agent 负责镜头描述与工作流编排。[来源](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md)
- CLI 支持真实节点边、运行节点及按模型 schema 写入生成参数；但公开节点类型没有独立 `shot`。[CLI 页面](https://www.liblib.tv/cli)；[版本包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)

**可确认程度：高（镜头控制能力）；中低（独立镜头实体）**

可以确认导演式镜头控制是核心卖点；不能确认其内部是否以独立 `Shot` 数据对象保存，也不能确认固定支持焦距、光圈、快门角、机位轨迹等所有电影参数。

**TwitCanva 可复刻映射**

- 增加独立 `Shot Node`，保存景别、机位、角度、焦距、运镜、时长、构图、人物站位、光线、情绪和对白/音效意图。
- Image/Video 节点只保存模型参数与 Take；导演语义保留在 Shot，Prompt Compiler 负责把 Shot + Character + Scene 编译为模型提示词。
- 导演台以镜头表为主视图，画布继续负责探索、依赖关系和版本分叉。

**不要臆测**

- 不要把宣传中的“精准控制”解释为所有模型都能确定性执行镜头参数。
- 不要声称 LibTV 已公开专业摄影参数 schema 或 Director Node 的内部数据模型。

### 3.6 多版本生成与选片

**公开证据**

- CLI 的节点生成参数示例包含 `count=2`，表明模型节点可以请求多结果；分镜和视频也支持批量执行。[版本包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)
- 官方功能介绍强调批量成图、批量成片和资产沉淀，但未明确展示“版本对比 / 选片 / Hero Take”。[来源](https://www.bilibili.com/video/BV1jEQzBNE3K/)

**可确认程度：中（多结果/批量）；低（选片状态模型）**

可以确认一次或一组任务能够产生多个结果；未找到第一方材料证明存在 Take 列表、版本命名、并排对比、Hero Take、锁定版本或选中结果自动传递到下游。

**TwitCanva 可复刻映射**

- 为 Image/Video 节点建立 `Take[]`，每次运行追加 Take 而不是覆盖旧结果。
- 节点保存 `heroTakeId`，下游默认读取 Hero Take；切换 Hero 后只使依赖输出的下游节点过期。
- 支持网格对比、参数差异、成本、生成时间、失败原因和手动备注。

**不要臆测**

- 不要把 CLI 的 `count` 参数等同于完整的版本管理或选片机制。
- Hero Take 应标注为 TwitCanva 自主设计（也可借鉴 Inline Studio），而不是 LibTV 已确认功能。

### 3.7 成片、预览与导出

**公开证据**

- 官方“视频合成”演示明确说明音视频资产可在画布原位剪辑，支持片段自由拖拽、精准裁切、实时播放预览，以及最长 20 分钟的视频合成导出。[来源](https://www.bilibili.com/video/BV1nCXaBZEXB/)
- 官方上线介绍把剪辑流程放在无限画布的完整视频生产链路中。[来源](https://www.bilibili.com/video/BV1qVwZz2Ez7/)
- CLI 1.0.2 的 `download` 支持图片/视频/音频单节点下载；普通分组和多文件场景输出 ZIP，并提供与画布批量下载一致的命名语义。[CLI 页面](https://www.liblib.tv/cli)；[版本包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)
- 官方 Agent Skill 支持将生成会话中的图片和视频批量下载，并同时返回结果链接与项目画布链接。[来源](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md)

**可确认程度：高**

可以确认片段排序/拖拽、裁切、实时预览、合成导出和批量下载。公开材料没有确认复杂转场、字幕轨、多轨混音、关键帧动画、调色、代理媒体、具体编码器/容器或工程交换格式。

**TwitCanva 可复刻映射**

- 第一版 `Video Compose Node` 只实现 Hero 视频片段排序、入出点裁切、预览和单文件导出。
- 第二版再加入转场、旁白、字幕、背景音乐和响度控制；不要一开始扩张为完整 NLE。
- 输出任务应保存时间线快照和所引用的 Take ID，确保之后切换 Hero Take 不会悄悄改变已导出的版本。

**不要臆测**

- 不要声称官方视频合成已经等价于剪映/Premiere 的完整时间线能力。
- 不要把“最长 20 分钟”推导成任意分辨率、帧率或编码格式都支持 20 分钟。

### 3.8 团队空间与团队资产

**公开证据**

- 官方功能介绍说明创作资产和工作流可以实时沉淀并随取随用。[来源](https://www.bilibili.com/video/BV1jEQzBNE3K/)
- CLI 1.0.2 的 `account` 命令公开个人/团队账户切换；`project create/list/update` 支持团队作用域、`teamId` 过滤和团队项目；项目摘要也包含团队空间语义。[CLI 页面](https://www.liblib.tv/cli)；[版本包](https://liblibai-web-static.liblib.cloud/cli/1.0.2/libtv-windows-amd64.zip)
- 官方 Agent Skill 使用 `projectUuid` 隔离项目，并把上传的参考媒体保存到项目路径下的 OSS 地址。[来源](https://github.com/libtv-labs/libtv-skills/blob/main/skills/libtv-skill/SKILL.md)

**可确认程度：中**

可以确认团队账户/团队项目作用域，以及资产与工作流沉淀的产品主张。不能确认团队资产目录的 UI 和数据结构，也不能确认实时多人同屏、角色权限、审批流、评论、锁定、冲突合并、离职资产转移、团队配额或费用治理。

**TwitCanva 可复刻映射**

- 先实现 `Workspace -> Project -> Canvas -> Asset` 的归属关系，并让资产具有 `personal` / `workspace` 作用域。
- 所有资产记录来源节点、生成任务、模型、Prompt、参数、创建者和引用次数；删除时做引用检查。
- MVP 仅做工作区资产复用和项目导入导出；实时协作、RBAC 和审批放到后续云端阶段。

**不要臆测**

- 不要把“团队账户/团队项目”直接写成“团队共享资产库和实时协作已完整上线”。
- 不要声称官方公开了成员角色、权限矩阵、资产版权或费用分摊规则。

## 4. 对 TwitCanva 的复刻优先级

### P0：复刻 LibTV 已被高置信确认的主链路

1. 剧情输入生成结构化脚本。
2. 自动创建并连接 Text、Script Generator、Storyboard Group。
3. Storyboard Group 按脚本行创建有序镜头和图片节点。
4. 分镜整组运行、单镜重跑、失败续跑、运行日志和进度。
5. Shot 参数统一编译为图片/视频 Prompt。
6. Hero 视频片段进入 Video Compose Node，完成裁切、排序、预览和导出。

### P1：把公开能力做成更清晰的数据模型

1. 独立 `Shot` 实体，避免镜头语义散落在 Prompt 中。
2. `Take[] + heroTakeId`，补足公开材料没有明确证明的选片闭环。
3. 一等 `CharacterAsset` 和 `SceneAsset`，让一致性和复用成为真实依赖。
4. 宫格只是分镜视图/导出，不牺牲独立镜头数据。

### P2：团队化

1. 工作区级资产和模板。
2. 项目/画布/资产归属及引用追踪。
3. 后续再做成员权限、评论、审批和实时协作。

## 5. 推荐的 TwitCanva 自动建图模板

```text
剧情 Text
  -> Script Generator
  -> Storyboard Group
       -> Shot 01 -> Image 01 -> Video 01
       -> Shot 02 -> Image 02 -> Video 02
       -> Shot 03 -> Image 03 -> Video 03
  -> Video Compose
  -> Output

共享依赖：
CharacterAsset(s) -> Shot/Image/Video
SceneAsset(s)     -> Shot/Image/Video
```

这个模板复刻了 LibTV 公开确认的脚本、分镜、镜头、生成和合成闭环；`CharacterAsset`、`SceneAsset`、`Take/Hero Take` 则是 TwitCanva 为可控性、可追溯性和长期资产复用增加的独立产品设计。

## 6. 最终判断

LibTV 最值得学习的不是某个孤立按钮，而是把 AI 视频生产从“单次生成”转成“项目画布中的连续生产过程”：脚本负责结构，分镜组负责批量组织，镜头参数负责可控性，节点边负责上下游，视频合成负责交付，资产沉淀负责复用。

对 TwitCanva 而言，近期应优先完成“故事 -> 脚本 -> 自动分镜组 -> 批量图片/视频 -> 合成导出”的可运行闭环。角色库、场景库和 Hero Take 很有价值，但应以我们的领域模型明确实现，并在产品文档中标注为自主增强，而不是未经证实地归因给 LibTV。
