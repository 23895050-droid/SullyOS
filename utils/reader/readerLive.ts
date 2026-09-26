// 读书模块 · 书房里的「实时状态段」（她 09-26 定的：非核心模式带全套生活，核心模式一点不带）
//
// 照原版的分段来：**稳定的在最前**（角色本体 + 书房自己的规矩），**实时的贴着生成点**放在
// 消息末尾（原版 `chatRequestPayload` 的 volatileTail 就是这个位置）。
//
// 这一份 = `ContextBuilder.buildVolatileCoreState`（时间 + 记忆宫殿召回 + 情绪 buff，
// 和聊天同一个实现、同一个开关）+ 日程（`getDailyScheduleForChar` +
// `ContextBuilder.buildScheduleInjection`）。
//
// 核心模式（focused / 核心人设）**不调这个**——那是她要省成本时走的档。

import type { CharacterProfile } from '../../types';
import { ContextBuilder } from '../context';
import { getDailyScheduleForChar } from '../dailySchedule';
import { isScheduleFeatureOn } from '../scheduleFeature';
import { resolveCharTimeZone, nowInTimeZone } from '../timezone';

/** 书房这一轮的实时状态段（非核心模式才用）。取不到的东西就不写，宁缺勿编。 */
export async function buildReaderLiveState(char: CharacterProfile): Promise<string> {
    let out = ContextBuilder.buildVolatileCoreState(char, {
        includeDetailedMemories: true,
        // 读书时旁边没有人在实时说话：时间块不补那句「此刻有人正跟你说话」的语境框定
        timeOptions: { conversational: false },
    });

    if (!isScheduleFeatureOn(char)) return out;
    try {
        const schedule = await getDailyScheduleForChar(char);
        if (!schedule) return out;
        const charNow = nowInTimeZone(resolveCharTimeZone(char));
        const block = ContextBuilder.buildScheduleInjection(schedule, undefined, charNow, {
            includeFullDay: true,
            /** 读书这一轮不给他改日程的入口 */
            includeChangeInstruction: false,
            includeClock: char.timeAwarenessEnabled !== false,
        });
        if (block) out += `\n${block}\n`;
    } catch {
        /* 日程读不到就算了，不影响读书 */
    }
    return out;
}
