// 读书模块 · 「这一次活动」详情弹卡（2026-09-20，T4；T5 的单次活动详情弹窗也用它）
//
// 活动记录是两层的（她 09-20 钉的口径）：列表表面只写「做了什么」，
// 点开这里是**这次活动里的每一条调用**（读了一段 / 接了几句话 / 总结……），
// 摘要记录（kind:'summary'）也排在里头——它就是这次活动的总结那一趟。
//
// 角色个人页的「最近状态」弹窗也走这张卡：多给一个 title、往期挂在 extra 里。

import { useState, type ReactNode } from 'react';
import type { RdRoamActivity } from '../../utils/reader/readerDb';
import { deleteRoamActivity } from '../../utils/reader/readerDb';
import { fmtTok } from '../../utils/reader/readerDigest';

// 数字口径（1.2k / 3.4w）现在住在 utils/reader/readerDigest，这里只是**转发**一下
// （角色个人页一直从这里 import，别让它改道）
export { fmtTok };

const KIND_LABEL: Record<string, string> = {
    annotate: '读了一段',
    discuss: '接了几句话',
    reread: '重温',
    readon: '往后读',
    browse: '翻笔记',
    idle: '今天没读',
    summary: '总结',
    read: '读书',
};

export const fmtFull = (iso?: string): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 一次活动里的每条调用，排成时间线（详情弹卡和角色个人页共用） */
export function RoamCalls({ calls }: { calls: RdRoamActivity[] }) {
    return (
        <div className="rd-tl">
            {calls.map((a) => (
                <div className="rd-tl-item" key={a.id}>
                    <span className="rd-tl-dot" style={{ background: a.kind === 'summary' ? 'var(--rd-ink-soft)' : 'var(--rd-accent)' }} />
                    <div className="rd-tl-body">
                        <div className="rd-tl-head">
                            <span className="rd-tl-who">{KIND_LABEL[a.kind] ?? a.kind}</span>
                            <span className="rd-tl-time">{fmtFull(a.createdAt).slice(11)}</span>
                        </div>
                        <div className="rd-tl-text">{a.summary}</div>
                        {a.fromPara !== undefined && a.toPara !== undefined && a.fromPara !== a.toPara && (
                            <div className="rd-tl-ex">第 {a.fromPara + 1}–{a.toPara + 1} 段</div>
                        )}
                        {a.excerpt && <div className="rd-tl-ex">{a.excerpt}</div>}
                        {a.replies?.map((line, i) => (
                            <div className="rd-tl-reply" key={i}>{line}</div>
                        ))}
                        {a.feeling && <div className="rd-coread-feel">{a.feeling}</div>}
                        <div className="rd-tl-meta">
                            {[
                                // 摘要那一趟不写「产出」（它本来就不留批注），写「总结」就行
                                a.kind === 'summary'
                                    ? '总结'
                                    : [
                                        a.pages ? `读了 ${a.pages} 页` : '',
                                        a.annCount ? `留下 ${a.annCount} 条批注` : '',
                                        a.replyCount ? `回了 ${a.replyCount} 条讨论` : '',
                                    ].filter(Boolean).join(' · ') || '读了一段',
                                (a.tokensIn || a.tokensOut || a.tokens)
                                    ? `${fmtTok(a.tokens)} token（读进去 ${fmtTok(a.tokensIn)} / 吐出来 ${fmtTok(a.tokensOut)}）`
                                    : '',
                            ].filter(Boolean).join(' · ')}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

interface Props {
    /** 这次活动里的所有调用（按 seq 排好） */
    calls: RdRoamActivity[];
    /** 谁（名字） */
    ownerName: string;
    bookTitle?: string;
    /** 弹卡标题（默认「这一次活动」） */
    title?: string;
    /** 垫在下面的东西（角色个人页在这里挂「往期」） */
    extra?: ReactNode;
    /** 摘要那行上的「补摘」（T5）——不传就是不显示（比如你自己读的那条） */
    onRetry?: () => void;
    /** 正在补（按钮变成「正在补…」） */
    retrying?: boolean;
    /** 补摘的结果 / 为什么补不了，写在按钮下面 */
    retryNote?: string;
    /**
     * 这条活动记录删掉之后叫一声（父组件负责关卡片 + 重新翻一遍）。
     * **传了才有删除入口**——一次活动 = 这个 group 下的所有调用记录，一起删（她 09-21）。
     */
    onDeleted?: () => void;
    onClose: () => void;
}

export default function ActivityDetailSheet({
    calls, ownerName, bookTitle, title, extra, onRetry, retrying, retryNote, onDeleted, onClose,
}: Props) {
    const first = calls[0];
    const mine = first?.charId === 'user';
    const hasSummary = calls.some((a) => a.kind === 'summary');
    const [deleting, setDeleting] = useState(false);

    const doDelete = async () => {
        setDeleting(true);
        try {
            // 一次活动 = 一个 group 下的每一条调用，一起删干净（留着半条会让活动卡少一行）
            for (const a of calls) await deleteRoamActivity(a.id);
            onDeleted?.();
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="rd-sheet-mask" onClick={onClose}>
            <div className="rd-sheet" onClick={(e) => e.stopPropagation()}>
                <div className="rd-sheet-grip" onClick={onClose} />
                <div className="rd-sheet-title">{title ?? '这一次活动'}</div>
                <div className="rd-muted" style={{ marginBottom: 'var(--rd-space-2)' }}>
                    {ownerName}{bookTitle ? ` · 《${bookTitle}》` : ''} · {fmtFull(first?.createdAt)}
                </div>

                <RoamCalls calls={calls} />

                {/* 摘要那行：没摘成时这儿就是补摘的入口（她 09-20 定的位置） */}
                {!hasSummary && !mine && (
                    <div className="rd-sum-miss">
                        <div className="rd-muted">这一次没有总结记录。</div>
                        {onRetry && (
                            <button className="rd-btn rd-btn-soft" onClick={onRetry} disabled={retrying}>
                                {retrying ? '正在补…' : '补摘'}
                            </button>
                        )}
                    </div>
                )}
                {retryNote && <div className="rd-muted" style={{ marginTop: 'var(--rd-space-2)' }}>{retryNote}</div>}

                {extra}

                {/* 原来这儿有一颗「关掉」——点外面、点上面那根把手都能关，是多余的（她 09-21 删的）。
                    换成删除。 */}
                {onDeleted && (
                    <div className="rd-actions" style={{ marginTop: 'var(--rd-space-4)' }}>
                        <button className="rd-btn rd-btn-danger rd-btn-block" onClick={() => void doDelete()} disabled={deleting}>
                            {deleting ? '正在删…' : '删掉这次活动记录'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
