# PRD: AI 创作型无限画布导演工作台 MVP

## Problem Statement

当前画布已经可以生成图片、生成视频、保存工作流、管理基础素材，但创作者仍然需要在“剧情构思、脚本拆解、分镜规划、角色/场景/镜头设定、图片生成、视频生成、版本选择、成片预览”之间手动跳转。用户真正想要的不是一个普通节点编辑器，而是一张能理解创作上下文、自动搭建工作流、自动分组、能把剧情变成视频生产链路的 AI 导演工作台。

## Solution

在现有画布项目上增量升级，不推倒重来。MVP 先完成一条可演示闭环：用户输入剧情后，系统自动创建 Text Node、Script Generator Node、Storyboard Node，并自动连线、布局、分组；Script Generator 生成结构化脚本和分镜；Storyboard 可继续驱动图片节点和视频节点；图片/视频生成结果以 Take 保存，用户选择 Hero Take 后传给下游；Director Node 汇总脚本、分镜、镜头、Hero 图片、Hero 视频和执行进度。

MVP 的产品重点是“剧情驱动的自动建图”和“分组作为可运行创作单元”。它不追求一开始成为完整 SaaS、ComfyUI 替代品或专业剪辑软件。

## User Stories

1. As an AI 视频创作者, I want 输入一句剧情后自动生成脚本工作流, so that 我不用手动搭建节点链路。
2. As an AI 视频创作者, I want 系统把剧情拆成结构化脚本, so that 后续节点可以稳定读取角色、场景和镜头。
3. As an AI 视频创作者, I want 自动生成分镜列表, so that 我可以按镜头推进图片和视频生成。
4. As an AI 视频创作者, I want 自动创建 Text、Script Generator、Storyboard 节点, so that 我可以快速进入创作而不是先搭图。
5. As an AI 视频创作者, I want 自动分组相关节点, so that 一个故事创作单元可以被整体移动、保存和运行。
6. As an AI 视频创作者, I want 修改上游剧情后下游节点标记过期, so that 我知道哪些结果需要重新生成。
7. As an AI 视频创作者, I want 单独运行一个节点, so that 我可以只重试失败的生成步骤。
8. As an AI 视频创作者, I want 运行一个分组, so that 我可以一键执行一段完整创作链路。
9. As an AI 视频创作者, I want 看到任务进度和错误原因, so that 我能判断是模型、素材、网络还是参数问题。
10. As an AI 视频创作者, I want 每次图片生成都保留为 Take, so that 我不会覆盖之前满意的版本。
11. As an AI 视频创作者, I want 选择 Hero Image, so that 视频节点默认使用我选中的最佳首帧。
12. As an AI 视频创作者, I want 每次视频生成都保留为 Take, so that 我可以比较不同运镜、时长和提示词版本。
13. As an AI 视频创作者, I want 选择 Hero Video, so that 导演台和合成节点使用正确片段。
14. As an AI 视频创作者, I want Director Node 汇总项目状态, so that 我能快速知道哪些镜头完成、失败或待生成。
15. As an AI 视频创作者, I want 从 Storyboard 继续生成图片节点, so that 每个镜头都能进入视觉生产。
16. As an AI 视频创作者, I want 从图片 Hero Take 生成 Seedance 视频, so that 我可以稳定进行图生视频。
17. As an AI 视频创作者, I want 文生视频和图生视频都走统一视频节点, so that 模型选择和参数体验一致。
18. As a 短视频创作者, I want 快捷入口“故事脚本生成”, so that 我可以从空画布快速开始。
19. As a 短视频创作者, I want 快捷入口“首帧图生视频”, so that 我可以从现有图片快速做动态片段。
20. As a 电商广告创作者, I want 角色、场景、道具后续可保存为素材, so that 同一套品牌资产可以复用。
21. As a 设计师, I want 节点保留在自由画布上, so that 我可以用空间关系组织灵感和版本。
22. As a 小团队创作者, I want 本地项目可导入导出, so that 我能备份、迁移和交给别人继续做。
23. As a 模型调试者, I want Provider 差异被封装, so that 我不用记住每个模型的接口格式。
24. As a 产品维护者, I want 新导演节点通过注册方式加入, so that 后续扩展角色、场景、镜头、合成不会继续塞进一个大类型。
25. As a 产品维护者, I want 旧工作流仍可打开, so that 升级不会破坏用户已有画布。
26. As a 产品维护者, I want 本地 JSON 先跑通 MVP, so that 不需要先引入数据库、队列和云存储。
27. As a 后续 AI 编程工具, I want 清晰的垂直切片 Issue, so that 可以按依赖顺序独立实现和验收。

## Implementation Decisions

- MVP 采用增量升级，不更换现有前端框架、不迁移画布引擎、不引入云端 SaaS 架构。
- 保留旧节点数据兼容层，同时新增导演语义层，避免把脚本、分镜、镜头、Take、运行日志继续塞进旧节点字段。
- 新增节点注册概念，用于定义节点类型、默认数据、输入输出 handle、执行能力和 Take 能力。
- 新增 Graph Builder 概念，用于从“故事脚本生成”等快捷入口生成节点、边、布局和分组。
- 新增 Workflow Runner 概念，用于运行节点、分组或画布，并处理 DAG 顺序、过期状态、取消、重试和日志。
- Group 升级为一等工作流单元，而不是只作为视觉框；它需要支持运行、折叠、导出模板和保存运行状态。
- Take Store 是图片和视频生成的版本层；旧结果字段继续兼容，新能力通过 Take 和 Hero Take 向下游传递。
- Script Generator 输出必须是结构化 JSON，至少包含标题、logline、角色、场景、镜头列表和每个镜头的 aiBrief。
- Storyboard 是镜头列表的编辑和派发节点；第一版可以先展示和派发镜头，不做复杂时间线。
- Director Node 是聚合视图，不复制所有业务数据；它读取上游脚本、分镜、镜头、Take 和运行状态。
- Provider Adapter 隔离 GPT、Gemini、Seedance、Kling、Hailuo、ComfyUI 等差异；MVP 先复用现有生成接口。
- 项目持久化继续使用本地工作流 JSON 和本地媒体文件；SQLite、任务队列、云存储放到后续阶段。
- Linear 发布不是 MVP 代码依赖；本 PRD 先生成本地 Issue 清单，确认 Linear 团队/项目/标签后再发布。

## Testing Decisions

- 最高优先级测试接缝是“故事到画布 Graph Patch”：输入剧情和参数，输出确定的节点、边、分组和布局，不依赖真实模型。
- 第二个测试接缝是“结构化脚本合同”：脚本生成结果必须通过 schema 校验，缺字段时可被拒绝或修复。
- 第三个测试接缝是“分组运行计划”：输入一个分组，生成按依赖排序的节点执行计划，并能识别缺失输入或过期下游。
- 第四个测试接缝是“Take/Hero Take 传递”：切换 Hero Take 后，下游视频或合成节点应标记为过期并读取新的 Hero。
- 第五个测试接缝是“旧工作流兼容”：没有新字段的旧节点和旧分组仍能加载、展示、保存。
- UI 测试只覆盖外部行为：快捷入口创建节点、节点连线可见、分组框可见、运行状态和错误信息可见。
- Provider 测试应使用 mock provider，真实 GPT/Seedance 调用只作为手动验收或集成检查，避免测试依赖外部费用和网络。

## Out of Scope

- 不做多人实时协作。
- 不做工作流市场或模板市场。
- 不做商业化计费、团队权限或 API 开放平台。
- 不做完整专业剪辑软件能力。
- 不在 MVP 阶段迁移到 ReactFlow、Next.js、PostgreSQL、Redis 或云对象存储。
- 不在第一版实现所有角色、场景、道具、音频、ComfyUI、素材库增强能力。
- 不自动发布到 Linear，除非用户确认 Linear workspace、team、project、labels、priority 和 cycle。

## Further Notes

- RunningHub 适合作为后期平台化参照：AI 应用中心、模型中心、API 中心、ComfyUI 工作流中心。
- Flowboard 和 Inline Studio 是 MVP 架构上最接近的参考：真实数据依赖、版本化 Take、本地单用户、节点画布。
- Jaaz 适合作为聊天驱动画布和本地多模态 Agent 参考，但本产品应聚焦导演工作流，不做通用 Canva。
- Infinite-Canvas-AI-Omnigen 适合借鉴轻量画布、视频帧处理和 Web MVP，但客户端 API Key 方案不适合长期产品。
- LibTV Skills 说明 LibTV/LibLib.tv 有 Agent 调用生图/生视频的开放能力，但完整 LibTV 产品形态不能简单视为开源底座。

## Source Links

- [RunningHub](https://www.runninghub.ai/)
- [RunningHub Model/API Page](https://www.runninghub.ai/page-api)
- [libtv-labs/libtv-skills](https://github.com/libtv-labs/libtv-skills)
- [SparkSylva/Infinite-Canvas-AI-Omnigen](https://github.com/SparkSylva/Infinite-Canvas-AI-Omnigen)
- [crisng95/flowboard](https://github.com/crisng95/flowboard)
- [11cafe/jaaz](https://github.com/11cafe/jaaz)
- [inlineresearch/Inline-Studio](https://github.com/inlineresearch/Inline-Studio)
