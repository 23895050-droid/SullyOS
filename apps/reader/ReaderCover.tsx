// 读书模块 · 封面（没封面时给一张纸样封面，别留白块）
//
// 三个页都用它：书架卡片 / 书详情 / 笔记行的缩略封面。容器负责尺寸与圆角，
// 这里只管往容器里放「图或纸样」。

import { useBlobRefUrl } from '../../utils/blobRef';

interface Props {
    coverRef?: string;
    title: string;
    /** 小尺寸封面（笔记行的缩略图）：纸样上只放两三个字，别把书名挤成竖排 */
    compact?: boolean;
}

/** 小封面上的短名：中文取两个字，西文取第一个词 */
function shortTitle(title: string): string {
    if (/[一-龥]/.test(title)) return title.slice(0, 2);
    return title.split(/\s+/)[0]?.slice(0, 8) || title.slice(0, 2);
}

export default function ReaderCover({ coverRef, title, compact }: Props) {
    const url = useBlobRefUrl(coverRef);
    if (!url) return <div className="rd-book-cover-ph">{compact ? shortTitle(title) : title}</div>;
    return <img className="rd-cover-img" src={url} alt="" loading="lazy" />;
}
