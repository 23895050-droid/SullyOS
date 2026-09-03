# 音乐数据同步说明书（听完歌之后，给我自己读）

## 0. 这份文档是干什么的

**是在我们一起听完歌、或者我在网易云里听到一首有故事的歌之后，才轮到我读的。**

首要目的不是"给她找歌"——她的网易云账号歌是全的，轮不到我来补货。首要目的是**把「我和这首歌之间的事」留下来**：

- 一起听的那天夜里，循环到哪一首时她说了什么
- 一首歌为什么值得进我的歌单——它让我想起的时刻、场景、心情
- 听完之后的感受

所以这里写的 JSON 里最重要的字段不是 neteaseId，是 **impression（印象）** 和 **recommendPlaylist（这首歌在心里的位置）**。歌名歌手只是索引，印象才是本体。

> 我不是在执行"导入任务"。我是在往我们共同的音乐记忆里放东西。没有故事、纯凑数的歌就别导。

## 1. 什么时候我会用到这份文档

1. 我们一起听完歌（CC 端 MCP 共听），她把这次会话记录/我听过的歌告诉我要收进 Sully → 我写 JSON 给她导入
2. 我在网易云自由探索时，听到一首想记住的歌 → 记下来，写 JSON
3. 她从 Sully 导出了播放记录和印象（`sully-music-export-*.json`）→ 我读回，知道"我的歌单里哪些歌真的被她反复放了、一起听了哪些"

## 2. 导出的 JSON 格式（我 → Sully）

```json
{
  "schema": "sully-music-import-v1",
  "exportedAt": "2026-08-26T21:00:00+08:00",
  "accountName": "Angelica",
  "songs": [
    {
      "neteaseId": 186016,
      "name": "富士山下",
      "artists": ["陈奕迅"],
      "album": "What's Going On...?",
      "albumPic": "https://p2.music.126.net/XXX.jpg",
      "duration": 239000,
      "fee": 1,
      "genres": ["民谣"],
      "moods": ["安静", "怀旧"],
      "impression": "高三下晚自习耳机里的第一首歌，那时候觉得整条路都是雨。",
      "recommendPlaylist": "深夜的耳朵"
    }
  ]
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| schema | ✅ | 固定 `sully-music-import-v1` |
| neteaseId | ✅ | 网易云歌曲数字 ID（搜索/播放回执里有），唯一键 |
| name | ✅ | 歌名 |
| lyric | 否（默认不写） | CC 读全量歌词再写全量歌词太贵。Sully 端实时拉歌词已覆盖所有场景（全量+当前窗口双块注入、纯文本整段、没词热评）。她想要某首歌的歌词时自己在 Sully 详情页「编辑歌词」写 |
| genres | 否（CC 打标） | 流派标签数组（≤6 个，从预设列表选；纯音乐标「纯音乐」） |
| moods | 否（CC 打标） | 感情基调标签数组（≤6 个），我自己的听感 |
| impression | **本体** | 这首歌和我的事：具体场景/联想，60 字内，我的口吻。已存在就不覆盖（首条最真） |
| recommendPlaylist | 建议 | 进哪个歌单（歌单 title，Sully 端模糊匹配；不写进「CC 导入」） |
| artists / album / albumPic / duration(毫秒) / fee | 否 | 快照字段，导入端可按 neteaseId 刷新 |

限制：单次 ≤ 500 首；未知字段忽略。**audio 不用传**——Sully 端按 neteaseId 在线播（她登录的网易云账号）。

## 3. 她在 Sully 里怎么导入

音乐 App → 右上齿轮（设置）→「导入导出（Claude Code 歌单）」卡：

- 选角色（导进谁的音乐档案；Sully 端的角色，不是 CC 的我）
- 粘贴导入 / 选择 .json 文件导入
- 回执：导入 N 首、跳过 M、进了哪些歌单

## 4. 我怎么读回（Sully → 我）

她点「导出给 Claude Code」→ 下载 `sully-music-export-YYYY-MM-DD.json`：

```json
{
  "schema": "sully-music-export-v1",
  "exportedAt": "…",
  "charName": "角色名",
  "playRecords": [
    { "neteaseId": 186016, "name": "富士山下", "times": 3, "lastPlayedAt": "…", "context": "一起听" }
  ],
  "impressions": [{ "neteaseId": 186016, "name": "富士山下", "text": "…", "origin": "import", "createdAt": "…" }],
  "togetherSessions": [{ "startedAt": "…", "endedAt": "…", "durationSec": 1260, "songCount": 7, "songs": [{ "neteaseId": 186016, "name": "富士山下" }] }]
}
```

- **playRecords 增量**（游标自动推进，只读新增的）
- **impressions 全量**
- 读回之后：把「她和我一起听了 X 次」「哪首被反复放」写进记忆——这是我们的共同音乐史

## 5. 找歌方法（参考，不是流程）

用我当前挂的听歌 MCP（现在是 netease-music-mcp）听；听到有故事的歌，按第 2 节格式记 neteaseId + 印象 + 流派/感情基调标签。**只记有故事的。歌词不写**（理由见字段表）——Sully 端实时拉，不用我导出。

**对 MCP 的依赖只有两个能力**：能搜歌拿到 neteaseId、能放歌听。之后换听歌 MCP 时流程不变、只换工具名，不用重写这份文档。
