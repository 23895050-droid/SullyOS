# 音乐 App 自定义 CSS 预设说明

入口（2026-08-30）：音乐 App → 齿轮 ⚙ →「自定义 CSS」卡，按「基础 / 搜索页 / 播放页 / 我的页 / 歌单页 / 角色页 / 聊歌页 / 悬浮窗 / 聊天卡片 / 设置页」分页单独存一份，互不干扰；角色页还能按角色覆盖。注入顺序：内置预设（沉浸夜色）→ 基础 → 当前页 → 角色覆盖，后写的覆盖先写的。
另一个入口：小助手 App（点加号 → 选模块/页面/卡片 → 「CSS 编辑」白框，边写边实时生效，也可以直接聊给 AI 写）。

规则：纯 CSS，≤ 8KB；**禁止 @import / 外链 URL / JavaScript**。作用域建议写 `:root { … }` 或 `.mz-*` 类。

## 1. 主题变量（换肤最快的方式）

音乐 App 的全部颜色都桥接成了 CSS 变量，覆盖它们即可整体换肤：

| 变量 | 默认值 | 管什么 |
|---|---|---|
| `--mz-bg` | #fbfbff | 页面底色（近白） |
| `--mz-bgDeep` | #f3f1fa | 渐变深层 |
| `--mz-bgTint` | #ebe9f5 | 最深层紫雾 |
| `--mz-primary` | #807c9d | 主色（按钮/渐变/强调） |
| `--mz-accent` | #b3a8ce | 渐变第二色 |
| `--mz-soft` | #e0d9f0 | 容器浅底 |
| `--mz-glow` | #cdc6e9 | 发光/阴影色 |
| `--mz-sakura` | #f4c2cf | 樱花粉（装饰） |
| `--mz-lavender` | #cfc3e8 | 薰衣草（装饰） |
| `--mz-surface` | rgba(255,255,255,0.65) | 强玻璃面 |
| `--mz-glass` | rgba(255,255,255,0.35) | 弱玻璃面 |
| `--mz-text` | #22232a | 正文 |
| `--mz-muted` | #7c779a | 弱文字 |
| `--mz-faint` | #bcb8cc | 超弱文字 |
| `--mz-vip` | #d4a06a | VIP 色 |
| `--mz-danger` | #ba1a1a | 危险色 |

**重要**：换色的同时要改对应的 `-rgb` 变量（透明色走的是 rgba(var(--mz-x-rgb), α)）：

| 变量 | 默认值 |
|---|---|
| `--mz-bg-rgb` | 251,251,255 |
| `--mz-bgDeep-rgb` | 243,241,250 |
| `--mz-bgTint-rgb` | 235,233,245 |
| `--mz-primary-rgb` | 128,124,157 |
| `--mz-accent-rgb` | 179,168,206 |
| `--mz-soft-rgb` | 224,217,240 |
| `--mz-glow-rgb` | 205,198,233 |
| `--mz-sakura-rgb` | 244,194,207 |
| `--mz-lavender-rgb` | 207,195,232 |
| `--mz-text-rgb` | 34,35,42 |
| `--mz-muted-rgb` | 124,119,154 |
| `--mz-faint-rgb` | 188,184,204 |
| `--mz-vip-rgb` | 212,160,106 |
| `--mz-danger-rgb` | 186,26,26 |

## 2. 区块类钩子（深度定制）

主要容器挂了稳定类名，可以写结构级样式（清单 2026-08-30 校对，以下类名均已挂载生效）：

**音乐 App 内**：
- `.mz-app` — 音乐 App 根容器（夜色预设时同时有 `.mz-night`）
- `.mz-search` — 搜索页 / `.mz-player` — 播放页 / `.mz-chat` — 聊歌页 / `.mz-settings` — 设置页
- `.mz-songrow` — 歌曲列表行
- `.mz-miniplayer` — App 内迷你播放条（含一起听徽章）
- `.mz-together` — 一起听徽章块（双头像 + Listening Together）
- `.mz-together-strip` — 夜色预设的双人状态区（重叠头像 + 弧线）
- `.mz-vinyl` — 黑胶唱片（内层旋转圆盘 = 第一个子 div）
- `.mz-chat-bubble` / `.mz-chat-bubble-user`（右）/ `.mz-chat-bubble-ai`（左）— 聊歌气泡
- `.mz-chat-voice` — 聊歌语音条 / `.mz-chat-avatar` — 聊歌头像（设置里可开关）
- `.mz-night-tab` — 夜色预设底部「听歌 | 聊歌」切换台按钮

**音乐 App 外（全局）**：
- `.mz-globalmini-ball` — 悬浮窗折叠小球 / `.mz-globalmini-bar` — 展开条 / `.mz-globalmini-expanded` — 展开容器
- `.mz-music-card` — 主聊天里的一起听四张卡（邀请/回应/总结/聊歌小结），渲染在聊天 App，`--mz-*` 变量对它无效

**小助手 App（美化小助手自己）**：
- `.as-app` / `.as-header` / `.as-bubble-user` / `.as-bubble-ai` / `.as-code` / `.as-input-row` / `.as-plus-panel` / `.as-plus-btn` / `.as-send-btn`

示例：给播放页换圆角/歌词字号：

```css
.mz-player { border-radius: 0 !important; }
.mz-player .lyric-line { font-size: 15px; }
```

> 注意：大量样式是组件内联 style，类钩子只能通过 `!important` 或更高优先级选择器覆盖。能走 `--mz-*` 变量的都建议走变量。
>
> 小助手的提示词里给模型的知识清单（每页每块的选择器）与本节同源，改结构后记得两处同步（promptRegistry「美化助手」分类）。

## 3. 三套示例

**淡紫（默认近亲，柔和）**：

```css
:root {
  --mz-primary: #8d7fb8; --mz-primary-rgb: 141,127,184;
  --mz-accent: #c0b4dd; --mz-accent-rgb: 192,180,221;
  --mz-glow: #d8cfea; --mz-glow-rgb: 216,207,234;
}
```

**墨夜（深色纸）**：

```css
:root {
  --mz-bg: #14121c; --mz-bg-rgb: 20,18,28;
  --mz-bgDeep: #1d1a28; --mz-bgDeep-rgb: 29,26,40;
  --mz-bgTint: #262234; --mz-bgTint-rgb: 38,34,52;
  --mz-primary: #b7a9e8; --mz-primary-rgb: 183,169,232;
  --mz-accent: #8f7fc9; --mz-accent-rgb: 143,127,201;
  --mz-glow: #6d5f9e; --mz-glow-rgb: 109,95,158;
  --mz-text: #ece8f7; --mz-text-rgb: 236,232,247;
  --mz-muted: #9a92b8; --mz-muted-rgb: 154,146,184;
  --mz-faint: #5f5a75; --mz-faint-rgb: 95,90,117;
  --mz-surface: rgba(255,255,255,0.08);
  --mz-glass: rgba(255,255,255,0.05);
}
```

**樱（粉调）**：

```css
:root {
  --mz-primary: #d97d9c; --mz-primary-rgb: 217,125,156;
  --mz-accent: #f0a8c0; --mz-accent-rgb: 240,168,192;
  --mz-glow: #f6c3d2; --mz-glow-rgb: 246,195,210;
  --mz-sakura: #f8cdd8; --mz-sakura-rgb: 248,205,216;
  --mz-soft: #fbe3eb; --mz-soft-rgb: 251,227,235;
}
```

## 4. 渐变硬编码说明

角色歌单封面渐变（`gradient-01`~`gradient-06`）是运行时用变量拼的，会跟随变量换色；个别写死的装饰渐变不受预设影响，属正常。
