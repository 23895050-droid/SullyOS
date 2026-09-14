/**
 * 一起听卡片基础样式层（2026-09-13）。
 *
 * 背景：四张一起听卡（邀请/回应/总结/聊歌小结）的底色渐变、边框、文字色
 * 原先是 JSX 里 inline style 写死的。inline 优先级最高，美化小助手/自定义
 * CSS 的 class 规则覆盖不掉，只能到处用 !important——「听歌卡片改不动」的根源。
 *
 * 现在：这些视觉全部搬到这里（值与原来逐一对应，外观零变化），JSX 只留语义
 * class。用户 CSS（cssGlobal / cssPages.cards）注入在本层之后，同权重时后者
 * 胜——直接写类名覆盖即可，不再需要 !important。
 *
 * 类名速查：
 *   卡片根：.mz-music-card（钩子）+ 五张卡各自 .mz-music-card-invite /
 *          -accept / -summary / -chatsummary / -song（收歌单/分享歌卡）
 *   零件：-glow（邀请卡光晕）/ -heart / -names / -label / -title / -sub /
 *        -text / -strong / -head / -count / -cover（-cover-note）/ -dim /
 *        -chip（-accepted/-declined/-cancelled/-pending）/
 *        -btn（-btn-accept/-btn-decline）/ -foot（-foot-ok）/
 *        -tag / -badge / -songname / -note / -footer / -brand
 */

export const MUSIC_CARD_BASE_CSS = `
/* ══ 邀请卡（含「等你回应」与状态 chip 两个渲染路径，共用同一套类） ══ */
.mz-music-card-invite{border-color:#f3d9e6;background:linear-gradient(135deg,#fff2f7 0%,#f5edff 55%,#eaf1ff 100%)}
.mz-music-card-glow{background:radial-gradient(ellipse at 30% 50%,rgba(255,170,200,0.32) 0%,transparent 52%),radial-gradient(ellipse at 70% 50%,rgba(195,178,255,0.32) 0%,transparent 55%)}
.mz-music-card-heart{color:#ff7fae;filter:drop-shadow(0 0 5px rgba(255,127,174,0.55))}
.mz-music-card-names{color:#5a49a8;font-family:'Noto Serif','Georgia',serif}

/* ══ 回应卡（接受/婉拒/结束） ══ */
.mz-music-card-accept{border-color:#f3d9e6;background:linear-gradient(135deg,#fff7fa 0%,#f7f1ff 100%)}
.mz-music-card-accept .mz-music-card-title{color:#383639}

/* ══ 一起听总结卡 ══ */
.mz-music-card-summary{border:1.5px solid #f3d9e6;background:linear-gradient(135deg,#fff2f7 0%,#f5edff 55%,#eaf1ff 100%)}
.mz-music-card-summary .mz-music-card-sub{color:#9c8ab8}
.mz-music-card-summary .mz-music-card-text{color:#5a49a8;border-top:1px dashed rgba(156,111,194,0.25)}
.mz-music-card-head{border-bottom:1px solid rgba(156,111,194,0.15)}
.mz-music-card-count{background:rgba(195,178,255,0.3);color:#7a5db0}
.mz-music-card-cover{background:linear-gradient(135deg,#8b7ab8 0%,#6b95c7 100%)}

/* ══ 聊歌小结卡 ══ */
.mz-music-card-chatsummary{border-color:#dbe7f4;background:linear-gradient(180deg,#f6faff 0%,#f0f6ff 100%)}
.mz-music-card-chatsummary .mz-music-card-label{color:#7c93b8;opacity:1}
.mz-music-card-chatsummary .mz-music-card-text{color:#4a5f80}
.mz-music-card-dim{color:#a8b8d0}

/* ══ 收歌单/分享歌卡（music_card：join / add / join_and_add） ══ */
.mz-music-card-song{border-color:#f3d9e6;background:linear-gradient(135deg,#fff2f7 0%,#f5edff 55%,#eaf1ff 100%)}
.mz-music-card-tag{background:rgba(195,178,255,0.3);color:#7a5db0;border:1px solid rgba(195,178,255,0.5)}
.mz-music-card-cover-note{color:rgba(255,255,255,0.9);font-size:28px}
.mz-music-card-badge{background:rgba(255,255,255,0.85);color:#5a49a8}
.mz-music-card-songname{color:#2a1f4d;font-family:'Noto Serif','Georgia',serif}
.mz-music-card-note{color:#5a49a8}
.mz-music-card-footer{color:#a89bc5;border-color:#e0d9f0}
.mz-music-card-brand{color:#5a49a8;font-weight:600}

/* ══ 共享零件 ══ */
.mz-music-card-label{color:#9c6fc2;opacity:0.8}
.mz-music-card-title{color:#2a1f4d}
.mz-music-card-sub{color:#9c6fc2}
.mz-music-card-text{color:#6b5b8f}
.mz-music-card-strong{color:#2a1f4d}

/* ══ 状态 chip（邀请卡底部四种态） ══ */
.mz-music-card-chip-accepted{background:rgba(195,178,255,0.3);color:#7a5db0;border:1px solid rgba(195,178,255,0.5)}
.mz-music-card-chip-declined{background:rgba(148,163,184,0.15);color:#7a7a85;border:1px solid rgba(148,163,184,0.3)}
.mz-music-card-chip-cancelled{background:rgba(148,163,184,0.15);color:#7a7a85;border:1px solid rgba(148,163,184,0.3)}
.mz-music-card-chip-pending{background:rgba(255,181,207,0.25);color:#b06a8d;border:1px solid rgba(255,181,207,0.4)}

/* ══ 回应按钮（只改外观可以，别动行为） ══ */
.mz-music-card-btn-accept{background:linear-gradient(135deg,#ff9dbb,#c9b3ff);color:#fff;box-shadow:0 2px 8px rgba(201,141,255,0.35)}
.mz-music-card-btn-decline{background:rgba(148,163,184,0.12);color:#7a7a85;border:1px solid rgba(148,163,184,0.3)}

/* ══ 回应后的一行状态文字 ══ */
.mz-music-card-foot{color:#7a7a85}
.mz-music-card-foot-ok{color:#7a5db0}
`.trim();
