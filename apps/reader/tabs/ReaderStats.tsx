// 读书模块 · 统计页（骨架，第二批填内容）
//
// 口径：阅读时长按 owner 分开记（用户一条线、每个角色一条线），数据源在 rd_progress。
export default function ReaderStats() {
    return (
        <div className="rd-shelf" data-rd-page="stats">
            <div className="rd-shelf-head">
                <div className="rd-shelf-title">统计</div>
            </div>
            <div className="rd-empty">
                <div>还没有数据</div>
                <div className="rd-muted">读起来之后，这里会有阅读时长、每天/每周的曲线和里程碑。</div>
            </div>
        </div>
    );
}
