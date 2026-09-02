# CLAUDE.md

给 Claude Code 的项目导航。SullyOS 是装在浏览器里的虚拟手机系统（React + TS + Vite，local-first，IndexedDB 存储）。详细介绍见 [`README.md`](./README.md)。

这份文件只做一件事：**告诉你遇到某类问题该去翻哪份文档**，别在代码里瞎逛。

> 包管理器统一用 **pnpm**：装依赖 `pnpm install`、跑测试 `pnpm vitest run`、跑脚本 `pnpm <script>`。别用 npm / yarn（仓库里是 `pnpm-lock.yaml`）。

## 文档地图

| 主题 | 文档 | 什么时候看 |
|------|------|-----------|
| **开发调试面板 / 开关** | [`docs/dev-debug.md`](./docs/dev-debug.md) | 加 dev-only 开关、加调试日志、排查"角色怎么又不说话了"。含逐步指南 |
| **记忆系统** | [`docs/memory-system-overview.md`](./docs/memory-system-overview.md) | 涉及长期记忆、月度总结、向量化记忆宫殿、情感空间。改记忆相关逻辑前必读 |
| **查手机 · 人际关系系统** | [`docs/relationship-system.md`](./docs/relationship-system.md) | 改「查手机」聊天/通讯录、角色联系人/好感、真假甄别、真角色双向对话、虚构 NPC 约束前必读 |
| **见面 · 观测协议 OBSERVE** | [`docs/date-observe.md`](./docs/date-observe.md) | 改见面（DateApp）的角色观测面板：提示词注入、掉格式解析容错（两层）、全息 HUD 渲染前必读 |
| **彼方 · 信号坠落处（跨用户接龙诗）** | [`docs/signal-poetry.md`](./docs/signal-poetry.md) | 改彼方(VRWorld)「信号坠落处」房间：跨实例合写现代诗、复用漂流瓶后端、`po_poems`/`po_poem_lines` 表与 `/poem/*` 端点、两层容错解析、并发安全前必读 |
| **捏人器 PSD 导入 / 部件投影层** | [`docs/char-creator-psd-import.md`](./docs/char-creator-psd-import.md) | 改捏人器素材管线、部件阴影（正片叠底预转）、PSD 图层组约定前必读 |
| **QQ捏人工坊（神经链接手办柜）** | [`docs/chibi-studio.md`](./docs/chibi-studio.md) | 改小小窝/彼方/520 三处 Q 版形象、捏人器 savedState 还原、`chibiStudio` 字段前必读 |
| **角色自定义时区** | [`docs/character-timezone.md`](./docs/character-timezone.md) | **写任何跟时间有关的代码前先扫一眼**：prompt 里的「现在是」、角色作息/夜间判断、日期 key、界面上的钟。分清「角色那边几点」和「用户自己的时间」，别自己手搓时差。文末列了还没接时区的几处（主动消息 + 几块界面上的钟），**正式发版前记得过一遍** |
| **通用 MCP 工具服务器** | [`docs/mcp-client.md`](./docs/mcp-client.md)（开发者）、[`docs/mcp-user-guide.md`](./docs/mcp-user-guide.md)（用户教程，设置「?」弹窗跳转的就是它，改接入行为要同步） | 改用户自配 MCP 接入（设置板块、握手/session、工具循环、`?target=` 代理约定、worker/mcp-proxy）或排查「工具连不上/角色不调工具」前必读；主动消息 2.0 的后台 MCP 路径（配置上云 / fire 时注入 / worker 直连执行）也在这份 |
| **主动消息 2.0 · 即时对话** | [`plans/amsg2-instant-chat.md`](./plans/amsg2-instant-chat.md)（设计与取舍）、[`plans/amsg2-instant-chat-contract.md`](./plans/amsg2-instant-chat-contract.md)(端点/信封/fire_pack v7 契约) | 改「聊天在用户自己的 CF Worker 上生成」这条路（`POST /instant-chat`、`utils/amsgInstantChat.ts`、fire_pack 的 `chat` 段、chat_outbox 补收、「正在输入」超时）前必读 |
| **主动消息 2.0 · API 凭据引用 credRefs** | [`plans/amsg2-llm-credentials-contract.md`](./plans/amsg2-llm-credentials-contract.md) | 改凭据上云（`llm_credentials` 表、任务 `credRefs`、`utils/amsgLlmCredentials.ts` 的每角色三行）或排查「换 Key 后主动消息 401 / 不来了」前必读；文末「SullyOS 侧落地」是实况 |
| **Instant Push SSE↔Push 契约** | [`docs/instant-push-dual-channel.md`](./docs/instant-push-dual-channel.md) | **改 instant push 路径或排查「报错但收到消息」类 bug 前必读**。SSE ≠ 送达判定通道、catch 不能直接判 send-failed |
| **Instant Push 通道** | [`docs/instant-push-branch-notes.md`](./docs/instant-push-branch-notes.md)、[`worker/instant-push/README.md`](./worker/instant-push/README.md) | LLM-driven Web Push、worker 端 agentic loop / reasoning / 副作用 directive |
| **使用统计** | [`docs/analytics.md`](./docs/analytics.md) | **加任何埋点前必读**。收什么/不收什么的边界、事件名与属性的规矩（属性只能是固定枚举）、构建时门禁与开关、完整事件清单。想加「某功能有多少人开了」看「加新埋点的规矩」第 5 条，别在配置页现场发 |
| **二改 / 加 App / 数据流 / 后端 Worker** | [`README.md`](./README.md) 「给想二改的人」一节 | 新增 App、build badge、sfworker 代理替换、开源协议 |

> README 的「给想二改的人」区域信息量很大（数据流、ContextBuilder、Instant Push Phase 2、sfworker 清单），动后端 / 加功能前先扫一遍。

## 发版前改一下版本号

[`utils/buildInfo.ts`](./utils/buildInfo.ts) 里的 `APP_VERSION`（形如 `v3.0 (Ambient Presence)`）是手工维护的，**做完一轮大功能或者性能优化就改一下**。

它有两个用处：设置页底部显示的就是它；统计还拿版本号那半截当标签，面板按它切分数据。不改的话新旧版本的数字堆在同一个标签下，「这次优化有没有让首屏变快」「新版铺开多少了」就都答不出来。括号里的代号只在界面上显示，不进标签。构建 hash（`BUILD_LABEL`）是自动生成的，不用管。

## 追更状态机（2026-09-02 更新，追上游前先读这里）

> 本仓库是 qegj567-cloud/SullyOS 的 fork。上游两个作者：**NMJ**（qegj567-cloud 账号，偏前端：语音/MCP/见面/外观/协同）与 **Tosd0**（偏存储/后端：存储令牌线/amsg2），两人都用 Claude Code/Codex 提交。**fork 里绝大多数代码是上游的**——冲突裁决先 `git show <hash> --format="%an %ad"` 查作者日期，别把上游旧中间态当「我们的决定」。我们自己的东西只有：相机/相册/NoxHome（含情侣空间）/小助手/音乐 + 她明说过的修复。详见外部计划 `C:\Users\Administrator\.claude\plans\kind-singing-pine.md`（含 9 条已跳清单与补做要点）。

| 功能线 | 上游最新提交 | fork 状态 |
|---|---|---|
| 语音线（TTS 供应商/收藏） | 67a87e49 + 8a71c053 语音部分 | ✅ 已搬（P1-P4）；跳 github 备份/journal 外观/分享迁移/Chat 边缘续载/发图 sourceMessageId（见计划已跳清单） |
| MCP 线 | 8df8e594 + 926ad17f | ✅ **与上游零漂移**（协议协商/接线台/destructive 保护/多步任务策略） |
| 见面线（DateSession/DateSettings/DateApp） | upstream/master | ✅ 对齐（剥掉协作 hunk）；DateApp 零漂移 |
| 聊天模式/外观批 | 2510b97f + 2ef1e245 | ✅ 已搬（模式切换/气泡外观/主动消息日程回传/时间感知）；**CallApp idle-nudge + callPreferences 簇未搬**（call 线她定不搬） |
| 预加载系统 | 8a71c053 重写 | ✅ 已搬（preloadableLazy + 空闲串行预热 + 15 秒卡死判定） |
| 剧情线（诊断/采样开关） | c72a8065 + 16e4e875 | ✅ 早已在 fork（08-31 轻量批 cc0226be 的 #589/#590） |
| 存储线 | 53a79002（特性分支） | ✅ C0-C4 已搬；master 线补件（7e1c5624 等）随「顺手补」逐步收编 |
| Claude 中转兼容重试 | 2510b97f 内 claudeProxyCompat | ✅ 已摘 |
| **协作/协同**（CollaborationWindow +2269 等） | 3d738e75 + a850f484 | ✅ 已搬（5b6c129e：分支 5 提交缺口补完 + #620 重roll/长按删消息 + #623 文件交付/参考图；28325bdd：查手机长按同步私聊/已同步置灰；injectMemoryPalace 降级保留——recall-router 在记忆系统批） |
| 陪伴桌面/Live2D/CallApp 大改 | 0addf2fb 起 | ❌ 她定不搬（Live2D 逐角色画图、视频走官端） |
| 记忆系统/七夕/amsg2 网络降级/emitResult | e69631cc / 089f91ad / e4714884 / 6a24c2de+7d46e9d6 | ⏳ 独立功能批，待她定序 |

**规矩**：每阶段 = 一个提交 + 门禁全绿（`pnpm exec tsc --noEmit` 零错误 / `pnpm vitest run` 仅剩 2 个上游基线失败 amsgStateSync.gaps+check-lockfile-links / `pnpm build`）+ 停下验收她点头。**core.autocrlf=false**（本仓库已设）——git 写文件保持 LF，否则源码锚点测试全挂。搬完更新本表 + 计划文件。