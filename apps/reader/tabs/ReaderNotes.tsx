// 读书模块 · 笔记页（2026-09-15 UI 轮重写）
//
// 组织维度（v3 §4.3，跟书库页刻意不同）：**按书 → 按阅读顺序 → 完整讨论**，跨角色收录。
// 参考图版式：每本书一行（小封面 + 书名 + 「第 N 章 · 日期」 + 摘录两行）。
// 批二接三级展开与 JSON 导入导出（V10）；这一版先把版式和空态做对。

import { useEffect, useState } from 'react';
import { NoteBlank } from '@phosphor-icons/react';
import { listAnnotations, listBooks, type RdAnnotation, type RdBook } from '../../../utils/reader/readerDb';
import ReaderCover from '../ReaderCover';

interface Group { book: RdBook; items: RdAnnotation[] }

/** 段号落在哪一章（book.chapterStartPara 是每章的起始段号） */
function chapterOf(book: RdBook, para: number): number {
    let idx = 0;
    (book.chapterStartPara || []).forEach((start, i) => { if (para >= start) idx = i; });
    return idx + 1;
}

const fmtDate = (iso: string) => (iso || '').slice(0, 10);

export default function ReaderNotes() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void (async () => {
            const books = await listBooks();
            const out: Group[] = [];
            for (const b of books) {
                // 书签不算笔记（她 2026-09-15 报的：笔记页里混进了书签）——
                // 书签归书详情那个「书签」页签，这里只收划线和批注
                const items = (await listAnnotations(b.id))
                    .filter((a) => a.kind !== 'bookmark')
                    .sort((x, y) => x.anchor.startPara - y.anchor.startPara || x.anchor.startOffset - y.anchor.startOffset);
                if (items.length > 0) out.push({ book: b, items });
            }
            setGroups(out);
            setLoading(false);
        })();
    }, []);

    const total = groups.reduce((n, g) => n + g.items.length, 0);

    return (
        <div className="rd-screen" data-rd-page="notes">
            <div className="rd-head">
                <div className="rd-head-main">
                    <div className="rd-head-title">笔记</div>
                    <div className="rd-head-sub">{total > 0 ? `${groups.length} 本书 · ${total} 条` : '划过的地方，都收在这里'}</div>
                </div>
            </div>

            {loading ? null : groups.length === 0 ? (
                <div className="rd-empty">
                    <NoteBlank size={44} weight="thin" />
                    <div className="rd-empty-title">还没有笔记</div>
                    <div className="rd-empty-text">划线、批注和围绕它们的讨论都会收在这里，一本书一组、按阅读顺序排。</div>
                </div>
            ) : (
                <div className="rd-card" style={{ paddingTop: 'var(--rd-space-1)', paddingBottom: 'var(--rd-space-1)' }}>
                    {groups.map((g) => {
                        const first = g.items[0];
                        const note = g.items.find((a) => a.note) ?? first;
                        return (
                            <div className="rd-note" key={g.book.id}>
                                <div className="rd-note-cover">
                                    <ReaderCover coverRef={g.book.coverRef} title={g.book.title} compact />
                                </div>
                                <div className="rd-note-main">
                                    <div className="rd-note-book">{g.book.title}</div>
                                    <div className="rd-note-sub">
                                        第 {chapterOf(g.book, note.anchor.startPara)} 章 · {fmtDate(note.createdAt)} · {g.items.length} 条
                                    </div>
                                    {note.note && <div className="rd-note-text">{note.note}</div>}
                                    <div className="rd-note-quote">“{note.anchor.text}”</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
