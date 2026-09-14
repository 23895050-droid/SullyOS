// 外链图库页（2026-09-14 外链通道）——相册 App 内嵌页：
// 存 URL / 看缩略图 / 复制链接 / 改名 / 删除 + 桶到期倒计时。
// 只存链接不打包图片：渲染层对 http(s) 原样透传，备份只带链接文本。
import React, { useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import TokenImg from '../../components/os/TokenImg';
import { copyToClipboard } from '../../utils/clipboard';
import {
  useUrlGallery, addUrlImages, removeUrlImage, updateUrlImage, setBucketExpiry,
} from './urlGalleryStore';
import { expiryText } from './urlGalleryMath';

const UrlGalleryPage: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { addToast } = useOS();
  const gallery = useUrlGallery();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [expiryDraft, setExpiryDraft] = useState(gallery.bucketExpiry);

  const detail = useMemo(() => gallery.items.find((i) => i.id === detailId) ?? null, [gallery.items, detailId]);
  const exp = expiryText(gallery.bucketExpiry);

  const submitAdd = () => {
    if (!draft.trim()) { addToast('先粘一个链接进来', 'info'); return; }
    const r = addUrlImages(draft);
    const parts: string[] = [];
    if (r.added) parts.push(`加了 ${r.added} 张`);
    if (r.dup) parts.push(`${r.dup} 张已经有了`);
    if (r.invalid) parts.push(`${r.invalid} 条不认（要 http:// 或 https:// 开头）`);
    if (r.added > 0) {
      addToast(parts.join('，') || '已添加', 'success');
      setDraft('');
      setAdding(false);
    } else {
      addToast(parts.join('，') || '没有可加的链接', 'error');
    }
  };

  const doCopy = async (url: string) => {
    const ok = await copyToClipboard(url);
    addToast(ok ? '链接已复制' : '复制失败——长按下面的链接手动复制', ok ? 'success' : 'error');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* 顶栏 */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-100/60 shrink-0 z-10" style={{ paddingTop: 'var(--chrome-top)' }}>
        <div className="h-14 flex items-center px-4">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-slate-600"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
          </button>
          <h1 className="text-base font-semibold text-slate-800 ml-1 tracking-tight">外链图库</h1>
          <button
            onClick={() => setAdding((v) => !v)}
            className="ml-auto text-xs font-semibold text-sky-600 bg-sky-50 rounded-full px-3 py-1.5 active:scale-95 transition-transform"
          >
            {adding ? '收起' : '＋ 添加链接'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* 桶到期倒计时 */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-lg">🪣</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800">
                图片桶{exp ? <> · <span className={exp.urgent ? 'text-rose-500' : 'text-slate-500'}>{exp.text}</span></> : ''}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">到期日 {gallery.bucketExpiry}（腾讯云 COS）</div>
            </div>
            <button onClick={() => { setExpiryDraft(gallery.bucketExpiry); setEditingExpiry((v) => !v); }} className="text-xs text-slate-400 px-2 py-1 rounded-full bg-slate-50 active:scale-95 transition-transform">改</button>
          </div>
          {editingExpiry && (
            <div className="flex items-center gap-2 mt-3">
              <input
                type="date"
                value={expiryDraft}
                onChange={(e) => setExpiryDraft(e.target.value)}
                className="flex-1 text-[13px] text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 outline-none"
              />
              <button
                onClick={() => {
                  if (setBucketExpiry(expiryDraft)) { addToast('到期日已改', 'success'); setEditingExpiry(false); }
                  else addToast('日期格式不对', 'error');
                }}
                className="text-xs font-bold text-white bg-slate-800 rounded-xl px-4 py-2 active:scale-95 transition-transform"
              >
                保存
              </button>
            </div>
          )}
        </div>

        {/* 添加区 */}
        {adding && (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 space-y-2">
            <div className="text-sm font-semibold text-slate-800">粘贴图片链接</div>
            <div className="text-[11px] text-slate-400">一行一个，可以一次粘好几个；存的是链接本身，不占存储。</div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              placeholder={'https://…\nhttps://…'}
              className="w-full text-[12px] text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 outline-none resize-none font-mono break-all"
            />
            <button onClick={submitAdd} className="w-full text-sm font-bold text-white bg-slate-800 rounded-xl py-2.5 active:scale-[0.98] transition-transform">
              加进图库
            </button>
          </div>
        )}

        {/* 网格 */}
        {gallery.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-4xl mb-3">🔗</div>
            <div className="text-sm text-slate-500">还没有存过链接</div>
            <div className="text-[11px] text-slate-400 mt-1 px-8 leading-relaxed">
              往桶里传完图，把链接粘进来，这里就能一眼看全桶里有什么，用的时候一键复制。
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {gallery.items.map((item) => (
              <button
                key={item.id}
                onClick={() => setDetailId(item.id)}
                className="text-left rounded-2xl overflow-hidden bg-white border border-slate-100 shadow-sm active:scale-[0.97] transition-transform"
              >
                <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                  {failed[item.id] ? (
                    <div className="text-[10px] text-slate-400 text-center px-2">打不开<br />（链接失效或没传上去）</div>
                  ) : (
                    <TokenImg
                      value={item.url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                      onError={() => setFailed((f) => ({ ...f, [item.id]: true }))}
                    />
                  )}
                </div>
                <div className="px-2 py-1.5 text-[10px] text-slate-500 truncate">{item.name}</div>
              </button>
            ))}
          </div>
        )}
        <div className="h-2" />
      </div>

      {/* 详情弹层 */}
      {detail && (
        <GalleryDetail
          item={detail}
          onClose={() => setDetailId(null)}
          onCopy={() => doCopy(detail.url)}
          onDelete={() => { removeUrlImage(detail.id); setDetailId(null); addToast('已从图库删除（桶里的文件还在）', 'info'); }}
          onRename={(name) => { const r = updateUrlImage(detail.id, { name }); if (!r.ok) addToast('改名没存上', 'error'); }}
        />
      )}
    </div>
  );
};

// ── 详情弹层：大图 + 复制链接 + 改名 + 删除（两步确认，防误删） ──
const GalleryDetail: React.FC<{
  item: { id: string; url: string; name: string };
  onClose: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onRename: (name: string) => void;
}> = ({ item, onClose, onCopy, onDelete, onRename }) => {
  const [confirmDel, setConfirmDel] = useState(false);
  const [name, setName] = useState(item.name);
  return (
    <div className="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-slate-100 flex items-center justify-center" style={{ maxHeight: '46vh' }}>
          <TokenImg value={item.url} alt="" className="max-w-full object-contain" style={{ maxHeight: '46vh' }} />
        </div>
        <div className="p-4 space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (name.trim() !== item.name) onRename(name); }}
            className="w-full text-sm font-semibold text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 outline-none"
          />
          <div className="text-[10px] text-slate-400 font-mono break-all max-h-16 overflow-y-auto">{item.url}</div>
          <button onClick={onCopy} className="w-full text-sm font-bold text-white bg-slate-800 rounded-xl py-2.5 active:scale-[0.98] transition-transform">
            复制链接
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => { if (confirmDel) onDelete(); else setConfirmDel(true); }}
              className={`flex-1 text-sm font-semibold rounded-xl py-2.5 active:scale-[0.98] transition-transform ${confirmDel ? 'text-white bg-rose-500' : 'text-rose-500 bg-rose-50'}`}
            >
              {confirmDel ? '确认删除？' : '删除'}
            </button>
            <button onClick={onClose} className="flex-1 text-sm font-semibold text-slate-500 bg-slate-100 rounded-xl py-2.5 active:scale-[0.98] transition-transform">
              关闭
            </button>
          </div>
          <div className="text-[10px] text-slate-400 text-center">这里删除只是从图库清单拿掉，桶里的文件不动</div>
        </div>
      </div>
    </div>
  );
};

export default UrlGalleryPage;
