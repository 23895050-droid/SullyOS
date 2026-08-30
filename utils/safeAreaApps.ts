import { AppID } from '../types';

// 「自理安全区」的 App 名单：这些 App 自己把内容铺满到刘海/home 条下，并用
// --chrome-top / --safe-bottom 给顶/底控件让位，所以外壳（PhoneShell）不再统一加 padding，
// 刘海那块显示的就是 App 自己的背景色，实现顶部无缝。
// 不在名单里的 App 仍由外壳兜底让位安全区（见 docs：TODO(safe-area-A) 迁移计划）。
export const SELF_SAFE_AREA_APPS: ReadonlySet<AppID> = new Set<AppID>([
    AppID.Launcher,
    AppID.VRWorld,
    AppID.Chat,
    AppID.GroupChat,
    AppID.Social,
    // 批量迁移（顶栏自理 safe-top，外层/内层拆见各 App）：
    AppID.Settings,
    AppID.Character,
    AppID.ThemeMaker,
    AppID.Appearance,
    AppID.Gallery,
    AppID.Date,
    AppID.User,
    AppID.Journal,
    AppID.Schedule,
    AppID.Room,
    AppID.CheckPhone,
    AppID.Study,
    AppID.FAQ,
    AppID.Game,
    AppID.Worldbook,
    AppID.Novel,
    AppID.Bank,
    AppID.XhsStock,
    AppID.XhsFreeRoam,
    AppID.Browser,
    AppID.Songwriting,
    AppID.Music,
    AppID.Call,
    AppID.VoiceDesigner,
    AppID.Guidebook,
    AppID.LifeSim,
    AppID.MemoryPalace,
    AppID.Handbook,
    AppID.QQBridge,
    AppID.HotNews,
    AppID.WorldHome,
    AppID.CharCreatorDev,
    AppID.SpecialMoments,
    // 相机/相册全家桶（2026-08-13 迁移）：顶栏改 --chrome-top 自理
    AppID.ImageGen,
    AppID.ImageReceipts,
    AppID.Album,
    // Nox 的单间（2026-08-18）：全屏铺满，底部导航自己让位 home 条
    AppID.NoxHome,
    // 小助手（2026-08-30）：顶栏 --chrome-top 自理，覆盖状态栏
    AppID.Assistant,
]);

// 外壳是否需要替这个 App 让出安全区：不在自理名单里的才需要。
export const shellHandlesSafeArea = (appId: AppID): boolean => !SELF_SAFE_AREA_APPS.has(appId);
