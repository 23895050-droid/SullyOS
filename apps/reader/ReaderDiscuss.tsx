// 读书模块 · 讨论面板（2026-09-15）
//
// 长按一条划线拉起来的那张小卡（她：**不是整屏**）。口径（术语定稿）：
//   · 某人在这条线上的**第一句话** = 批注 → 写进他那条 annotation 的 note
//   · 之后的话 = 讨论 → append 进这条锚点的线程（append-only）
//   · 讨论面板里「同一句被多人标注」→ 两侧箭头切换看谁的批注
//
// ⚡ 触发**只在共读态**有（她 09-15 定的）：先发言、话先落库，点 ⚡ 才叫他回——
// 一句话想拆开发也来得及。非共读没有即时触发，要在聊天里跟他说。
//
// 旧工具条上的「写想法」「讨论」两个按钮已经删了，功能全并到这张卡里。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, CaretRight, Lightning, PaperPlaneRight } from '@phosphor-icons/react';
import { useOS } from '../../context/OSContext';
import type { CharacterProfile } from '../../types';
import {
    appendThreadMessage, listAnnotations, listThreads, putAnnotation, putThread, rdId, threadRowId,
    type RdAnnotation, type RdBook, type RdOwnerId, type RdThread, type RdThreadMsg,
} from '../../utils/reader/readerDb';
import { isSameSentence, participantsOfSentence, threadKeyOf } from '../../utils/reader/readerParticipants';
import { generateThreadReply, resolveReadApi } from '../../utils/reader/readerChat';
import { appendRoamActivity, newRoamGroup } from '../../utils/reader/readerDb';
import { getCoReadStore, readApiSlots, useCoReadStore } from './coreadStore';
import { runArchive } from './coreadArchive';
import { beginJob, endJob } from './readerJobs';
import { highlightColorOf, useReaderPrefs } from './readerPrefs';
import { getCharReadPrefs } from './readerCharPrefs';

interface Props {
    book: RdBook;
    chapterIdx: number;
    chapterTitle: string;
    chapterParas: string[];
    percent: number;
    /** 长按命中的那条划线 */
    ann: RdAnnotation;
    notify: (msg: string) => void;
    onClose: () => void;
    /** 落了新东西 → 阅读页重新拉一遍划线层 */
    onChanged: () => void;
}

const fmtTime = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const actorOf = (msg: RdThreadMsg): string | null =>
    msg.role === 'user' ? 'user' : (msg.role === 'char' ? (msg.charId ?? null) : null);

export default function ReaderDiscuss({
    book, chapterIdx, chapterTitle, chapterParas, percent, ann, notify, onClose, onChanged,
}: Props) {
    const { characters, userProfile, apiConfig } = useOS();
    const prefs = useReaderPrefs();
    const coRead = useCoReadStore();
    const session = coRead.session?.bookId === book.id ? coRead.session : null;

    const [anns, setAnns] = useState<RdAnnotation[]>([]);
    const [threads, setThreads] = useState<RdThread[]>([]);
    const [speaker, setSpeaker] = useState(0);
    const [draft, setDraft] = useState('');
    /** 正在改自己的批注（旧的「写想法/改想法」按钮并入这里：点自己那条批注就改它） */
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState(false);
    const listRef = useRef<HTMLDivElement | null>(null);

    const nameOf = useCallback((ownerId: string): string => (
        ownerId === 'user'
            ? (userProfile?.name ?? 'Angel')
            : (characters.find((c) => c.id === ownerId)?.name ?? ownerId)
    ), [characters, userProfile]);

    const reload = useCallback(async () => {
        try {
            const [rows, ths] = await Promise.all([
                listAnnotations(book.id),
                listThreads(book.id),
            ]);
            setAnns(rows);
            setThreads(ths);
        } catch { /* 读不到就当空的 */ }
    }, [book.id]);

    useEffect(() => { void reload(); }, [reload]);

    /**
     * 这一句上有谁（按谁先来）——箭头就在这些人之间切。
     * **只收「在这一句上有批注」的人**：只进过讨论、自己没批注的（你回他的批注就是这种）
     * 不该多出一张「还没写批注」的卡（她 09-16 报的「又多一个我的批注」）。
     */
    const speakers = useMemo(() => {
        // 只看**这一章**的（段号是章内的，不按章过滤的话别的章同一段会被算进来）
        const mine = anns.filter((a) => a.chapterIdx === chapterIdx);
        const ths = threads.filter((t) => t.chapterIdx === chapterIdx);
        return participantsOfSentence(mine, ths, ann.anchor).filter((p) => (
            mine.some((a) => a.ownerId === p.ownerId && a.kind !== 'bookmark' && isSameSentence(a.anchor, ann.anchor))
        ));
    }, [anns, threads, ann.anchor, chapterIdx]);
    const at = Math.min(speaker, Math.max(0, speakers.length - 1));
    const current = speakers[at];
    const currentAnn = useMemo(
        () => (current ? anns.find((a) => a.ownerId === current.ownerId && isSameSentence(a.anchor, ann.anchor)) ?? null : null),
        [anns, current, ann.anchor],
    );

    /**
     * 讨论跟着批注走：**当前看的是谁的批注，底下就是谁的讨论**。
     * 键用那条批注自己的锚点（不是长按命中的那一条）——同句两个人的选区长短可能不一样，
     * 各按各的锚点建键，各说各的。
     */
    const currentOwner: RdOwnerId = current?.ownerId ?? ann.ownerId;
    const currentAnchor = currentAnn?.anchor ?? ann.anchor;
    const key = threadKeyOf(chapterIdx, currentAnchor, currentOwner);
    const thread = useMemo(
        () => threads.find((t) => t.anchorKey === key && isSameSentence(t.anchor, currentAnchor)) ?? null,
        [threads, key, currentAnchor],
    );

    /** 他回讨论时用哪个角色：当前看的是谁就用谁；看的是 Angel 自己那条就落回共读角色。 */
    const replyCharId = current && current.ownerId !== 'user' ? current.ownerId : session?.charIds[0];

    // 打开时停在**长按的那条批注**上（他划的线就看他那条，别默认跳到别人头上）。
    // 只在「换了一条划线」时定位一次——之后箭头翻到谁、回过谁，都要留在那儿
    // （以前写成每次数据刷新都回位，回完他一句面板自己跳回自己的批注上）。
    const initedFor = useRef<string>('');
    useEffect(() => {
        if (initedFor.current === ann.id) return;
        const i = speakers.findIndex((s) => s.ownerId === ann.ownerId);
        if (i < 0) return;                       // 数据还没读回来，等下一轮
        initedFor.current = ann.id;
        setSpeaker(i);
    }, [speakers, ann.id, ann.ownerId]);

    // 新发言出来滚到底
    useEffect(() => {
        const el = listRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [thread?.messages.length, at]);

    /** 往**某一条批注**的讨论里追加一句（唯一的写入口）。 */
    const post = async (ownerId: RdOwnerId, msg: Omit<RdThreadMsg, 'id' | 'createdAt'> & { createdAt?: string }) => {
        const now = new Date().toISOString();
        const anchor = currentAnchor;
        const thKey = threadKeyOf(chapterIdx, anchor, ownerId);
        const tid = threadRowId(book.id, thKey);
        const skeleton = (): RdThread => ({
            id: tid, bookId: book.id, anchor, anchorKey: thKey, chapterIdx,
            charIds: msg.charId ? [msg.charId] : [], messages: [], createdAt: now, updatedAt: now,
        });
        const th = await appendThreadMessage(tid, { id: rdId('ms'), ...msg, createdAt: msg.createdAt ?? now }, skeleton);
        if (msg.charId && !th.charIds.includes(msg.charId)) {
            await putThread({ ...th, charIds: [...th.charIds, msg.charId] });
        }
        return th;
    };

    /**
     * 发送规则（她 09-16 把口径钉死）：
     *   · 正在改自己的批注 → 改那条批注
     *   · 看的是自己的批注、还没写 → 这一句就是我的批注
     *   · 看的是**别人的**批注 → 这是回复，进**那条批注**的讨论
     *     （以前这里会给她另建一条批注、盖在人家划的线上，她一眼就看出来了）
     */
    const send = async () => {
        const text = draft.trim();
        if (!text || busy) return;
        setBusy(true);
        try {
            const now = new Date().toISOString();
            const mine = current?.ownerId === 'user' ? currentAnn : null;
            if (mine && (editing || !mine.note)) {
                await putAnnotation({ ...mine, note: text, kind: 'note', updatedAt: now });
                setEditing(false);
            } else if (current) {
                await post(current.ownerId, { role: 'user', content: text, kind: 'chat' });
            } else {
                // 这条线上还没有人说过话（正常进不来）：第一句就成我自己的批注
                await putAnnotation({
                    id: rdId('an'), bookId: book.id, ownerId: 'user', anchor: ann.anchor,
                    kind: 'note', note: text, styleSlot: 1, contentRev: book.contentRev, status: 'active',
                    chapterIdx, percent, createdAt: now, updatedAt: now,
                });
            }
            setDraft('');
            await reload();
            onChanged();
            checkArchive();
        } catch (err) {
            notify(`没存上：${err instanceof Error ? err.message : '未知错误'}`);
        } finally {
            setBusy(false);
        }
    };

    /** ⚡ 叫他回（共读态专属） */
    const trigger = async () => {
        if (busy) return;
        if (!replyCharId) { notify('先开共读才能叫他回'); return; }
        const char = characters.find((c) => c.id === replyCharId);
        if (!char || !userProfile) { notify('读不到角色设定'); return; }
        const api = resolveReadApi('reply', replyCharId, readApiSlots(getCoReadStore()), apiConfig);
        if (!api) { notify('还没配置共读模型（共读面板或主 API）'); return; }
        if (!session) { notify('非共读状态没有即时触发——在聊天里跟他说一声'); return; }

        setBusy(true);
        const job = beginJob({
            kind: 'reply', charName: char.name, bookTitle: book.title,
            message: `${char.name}正在想怎么回这条…`,
        });
        try {
            const a = ann.anchor;
            const from = Math.max(0, a.startPara - 2);
            const to = Math.min(chapterParas.length - 1, a.endPara + 2);
            const context = chapterParas.slice(from, to + 1).join('\n');
            const lines = (thread?.messages ?? []).map((m) => {
                const who = actorOf(m);
                return `${who ? nameOf(who) : '（旁白）'}：${m.content}`;
            });
            const mine = anns.find((x) => x.ownerId === 'user' && isSameSentence(x.anchor, a));

            const res = await generateThreadReply({
                char, user: userProfile, book, chapterIdx, chapterTitle,
                quote: a.text, context, threadLines: lines,
                herNote: mine?.note ?? '',
                contextMode: session.contextMode,
                preset: getCharReadPrefs(char.id).promptPreset,
                chatLines: '',
                api,
            });

            // 他回的是**当前这条批注**的讨论（他划的那条就落回他自己那条里）。
            // **分气泡**（她 09-20：回复像聊天那样连着发几条短话）：一句一个气泡，一条一条落。
            const bubbles = res.bubbles.length > 0 ? res.bubbles : [res.text].filter(Boolean);
            for (let i = 0; i < bubbles.length; i += 1) {
                await post(currentOwner, {
                    role: 'char', charId: char.id, content: bubbles[i], kind: 'chat',
                    createdAt: new Date(Date.now() + i).toISOString(),
                });
            }
            await appendRoamActivity({
                id: rdId('rr'), charId: char.id, bookId: book.id, kind: 'discuss',
                group: newRoamGroup(), seq: 0, replyCount: bubbles.length,
                fromPara: a.startPara, toPara: a.endPara,
                summary: `${char.name} 在《${book.title}》里回了一条讨论`,
                // 时间线上要看得见他回了什么（她 09-20：回复记录要显示在上面）
                replies: bubbles,
                feeling: res.feeling || undefined,
                tokens: res.tokens || undefined,
                tokensIn: res.tokensIn || undefined,
                tokensOut: res.tokensOut || undefined,
                mode: 'coread',
                createdAt: new Date().toISOString(),
            });
            await reload();
            onChanged();
            endJob(job, 'ok', `${char.name}回了一条`);
            checkArchive();
        } catch (err) {
            endJob(job, 'error', `他没能回：${err instanceof Error ? err.message : '未知错误'}`);
        } finally {
            setBusy(false);
        }
    };

    /**
     * 讨论落了新话之后顺手看一眼水位线：攒够（31 条）就归档一批。
     * 她 09-16 的规则是**按讨论条数**推水位线，所以触发点就在这儿 + 读完一页那儿。
     */
    const checkArchive = useCallback(() => {
        if (!session || !userProfile) return;
        const chars = session.charIds
            .map((id) => characters.find((c) => c.id === id))
            .filter((c): c is CharacterProfile => !!c);
        if (chars.length === 0) return;
        void runArchive({
            book, chars, user: userProfile, chapterIdx, chapterParas,
            pageTo: ann.anchor.startPara, nameOf,
            // 摘要只认摘要槽（她 09-20：没配置不回退 → null 就是不跑）
            api: resolveReadApi('summary', null, readApiSlots(getCoReadStore()), apiConfig),
        }, { force: false });
    }, [session, ann.anchor.startPara, characters, userProfile, book, chapterIdx, chapterParas, nameOf, apiConfig]);

    const all = thread?.messages ?? [];

    // 点面板外面 = 只关面板（阅读页那边也加了同一道闸，双保险）
    return (
        <div className="rd-discuss-mask" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <div className="rd-discuss" data-rd-page="discuss" onClick={(e) => e.stopPropagation()}>
            {/* 怎么关：点这条横杠、点面板外面（遮罩）都行（右上角那个 ✕ 她 09-16 让删了） */}
            <div className="rd-discuss-head">
                <div className="rd-discuss-grip" onClick={onClose} />
            </div>

            {/* 原文摘录 + 两侧箭头（多人标注同一句时才有） */}
            <div className="rd-discuss-quote-row">
                {speakers.length > 1 && (
                    <button
                        className="rd-discuss-arrow"
                        aria-label="上一个人"
                        onClick={() => setSpeaker((v) => (v - 1 + speakers.length) % speakers.length)}
                    >
                        <CaretLeft size={18} />
                    </button>
                )}
                <div className="rd-discuss-quote">{ann.anchor.text}</div>
                {speakers.length > 1 && (
                    <button
                        className="rd-discuss-arrow"
                        aria-label="下一个人"
                        onClick={() => setSpeaker((v) => (v + 1) % speakers.length)}
                    >
                        <CaretRight size={18} />
                    </button>
                )}
            </div>
            {speakers.length > 1 && (
                <div className="rd-discuss-count">{at + 1} / {speakers.length} 个人的批注</div>
            )}

            {/* 当前这个人的批注 */}
            {current ? (
                <div className="rd-discuss-note">
                    <div className="rd-discuss-who">
                        <span
                            className="rd-discuss-pen"
                            style={{ background: highlightColorOf(prefs, current.ownerId) }}
                        />
                        <span className="rd-discuss-name">{nameOf(current.ownerId)}</span>
                        <span className="rd-discuss-time">{fmtTime(currentAnn?.createdAt ?? current.firstAt)}</span>
                    </div>
                    <div
                        className={`rd-discuss-text${current.ownerId === 'user' && currentAnn?.note ? ' rd-discuss-editable' : ''}`}
                        onClick={() => {
                            if (current.ownerId !== 'user' || !currentAnn?.note) return;
                            setDraft(currentAnn.note);
                            setEditing(true);
                        }}
                    >
                        {currentAnn?.note || <span className="rd-discuss-empty">还没写批注</span>}
                    </div>
                    {editing && <div className="rd-discuss-hint">改自己的批注，改完点发送</div>}
                </div>
            ) : (
                <div className="rd-discuss-note">
                    <div className="rd-discuss-text rd-discuss-empty">这条线上还没有人说过话</div>
                </div>
            )}

            {/* 讨论（时间顺序，每条带作者和笔色）——**这一条批注的**讨论 */}
            <div className="rd-discuss-list" ref={listRef}>
                {all.length === 0 ? (
                    <div className="rd-discuss-hint">
                        {current && current.ownerId !== 'user'
                            ? `底下说一句，就是回${nameOf(current.ownerId)}这条批注。`
                            : '底下说第一句，就成了这条线上的批注。'}
                    </div>
                ) : all.map((m) => {
                    const who = actorOf(m);
                    return (
                        <div key={m.id} className={`rd-discuss-msg${who === 'user' ? ' rd-discuss-msg-me' : ''}`}>
                            <span
                                className="rd-discuss-pen"
                                style={{ background: who ? highlightColorOf(prefs, who) : 'var(--rd-rule)' }}
                            />
                            <div className="rd-discuss-msg-body">
                                <div className="rd-discuss-msg-head">
                                    {who ? nameOf(who) : '旁白'} · {fmtTime(m.createdAt)}
                                </div>
                                <div className="rd-discuss-msg-text">{m.content}</div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 输入 + 发送 + ⚡ */}
            <div className="rd-discuss-input-row">
                <input
                    className="rd-field"
                    placeholder={editing
                        ? '改批注…'
                        : (current && current.ownerId !== 'user' ? `回${nameOf(current.ownerId)}这条批注…` : '说点什么…')}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
                />
                <button className="rd-discuss-send" aria-label="发送" onClick={() => void send()} disabled={busy || !draft.trim()}>
                    <PaperPlaneRight size={18} weight="fill" />
                </button>
                {session && (
                    <button className="rd-discuss-bolt" aria-label="叫他回" onClick={() => void trigger()} disabled={busy}>
                        <Lightning size={18} weight="fill" />
                    </button>
                )}
            </div>
            <div className="rd-discuss-foot">
                {session
                    ? `共读中 · 点 ⚡ 才叫他回（话先落库，可以连发几句）`
                    : '非共读：想让他回，去聊天里跟他说一声'}
            </div>
        </div>
        </div>
    );
}
