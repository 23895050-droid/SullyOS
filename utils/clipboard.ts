// 复制到剪贴板（带非安全上下文兜底）——2026-09-14 外链通道用。
//
// navigator.clipboard 只在 https / localhost 等安全上下文存在；手机上走
// http://192.168.x.x 打开时它是 undefined——「复制链接」这个最常用的动作
// 会静默失效。所以必须有 execCommand 兜底（临时 textarea + select + copy）。
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // 落到下面的兜底
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, text.length);
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}
