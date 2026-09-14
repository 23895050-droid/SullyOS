// 读书模块 · 笔记页（骨架，第二批填内容）
//
// 组织维度（v3 §4.3，跟书库页刻意不同）：**按书 → 按阅读顺序 → 完整讨论**，跨角色收录。
// 数据源已就位（rd_annotations / rd_threads），第二批做三级展开与 JSON 导入导出（V10）。
export default function ReaderNotes() {
    return (
        <div className="rd-shelf" data-rd-page="notes">
            <div className="rd-shelf-head">
                <div className="rd-shelf-title">笔记</div>
            </div>
            <div className="rd-empty">
                <div>还没有笔记</div>
                <div className="rd-muted">划线、批注和围绕它们的讨论都会收在这里，一本书一组、按阅读顺序排。</div>
            </div>
        </div>
    );
}
