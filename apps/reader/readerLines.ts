// 读书模块 · 轮换的话（2026-09-21，T7③）
//
// 她 09-21 定的：统计页那句固定标语（「继续读下去，遇见更好的自己 ✨」，两处）删掉，
// 换成**几句轮换的**；顺带把那个错字（「点点滴滑都是心意」）一起换掉。
//
// 轮换 = **按天换**，不是每次渲染随机——随机的话切个 tab、翻一屏字就变了，那是闪烁不是轮换。
// 同一天里同一个位置永远是同一句（位置用 salt 区分，两个页面不会老是撞同一句）。

/** 今天的日期键（本地时间，不是 UTC——她那边 0 点换话） */
export function readerDayKey(d = new Date()): string {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 纯函数取一句：同 (位置, 日期) 永远同一句 */
function pick(lines: string[], salt: string, dateKey: string): string {
    const s = `${dateKey}|${salt}`;
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return lines[h % lines.length];
}

/** 统计页「第 N 天」后面那半句 */
const DAY_LINES = [
    '书页翻过去的声音很轻',
    '有几页留下了折角',
    '慢慢读，读给自己听',
    '纸上的字记得你来过',
    '一天里总有一段是给书的',
    '读到哪儿，哪儿就是今天',
];

/** 页面末尾那句 */
const FOOT_LINES = [
    '不急，书不会跑',
    '翻一页是一页',
    '读慢一点也没关系',
    '书在那儿，你也在',
    '今天的字，明天还记得',
    '读到哪儿算哪儿',
];

export const readerDayLine = (dateKey = readerDayKey()): string => pick(DAY_LINES, 'day', dateKey);

/** salt 区分位置：统计页尾和每日页尾各用一句，别老是撞 */
export const readerFootLine = (salt: string, dateKey = readerDayKey()): string => pick(FOOT_LINES, salt, dateKey);
