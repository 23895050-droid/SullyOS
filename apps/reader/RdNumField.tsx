// 读书模块 · 数字输入框（她 09-21）
//
// 她原话：「你要允许框里有空值，因为我想把数字删了写别的数字进去太难了，
// 比如原本数字是 5，我现在想要 17，我得先打 51，因为 5 删不掉，然后把 51 的 5 删掉，
// 在 1 后面补一个 7。」
//
// 所以框里存的是**草稿**：清空就是真的空着（不拿旧值把光标顶回去），
// 只有读得出合法数字时才往设置里写；离开框的时候再把草稿对齐回真值。
// 「每次读几页」「每次笔记上限」都用它。

import { useEffect, useState } from 'react';

interface Props {
    value: number;
    min: number;
    max: number;
    onCommit: (v: number) => void;
    ariaLabel?: string;
}

export default function RdNumField({ value, min, max, onCommit, ariaLabel }: Props) {
    const [draft, setDraft] = useState(String(value));

    // 外面把值改了（换人、重取、迁移）→ 草稿跟着走
    useEffect(() => { setDraft(String(value)); }, [value]);

    const clamp = (n: number): number => Math.max(min, Math.min(max, n));

    return (
        <input
            className="rd-field rd-field-num"
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            aria-label={ariaLabel}
            value={draft}
            onChange={(e) => {
                const raw = e.target.value;
                setDraft(raw);
                const n = Number(raw);
                // 空着 / 打了一半（比如只删剩一个负号）→ 先不动真值，等打完再说
                if (raw.trim() === '' || !Number.isFinite(n)) return;
                onCommit(clamp(Math.round(n)));
            }}
            // 离开框：草稿回到真值（空着走的就还回原来那个数，不会留下一个空框）
            onBlur={() => setDraft(String(value))}
        />
    );
}
