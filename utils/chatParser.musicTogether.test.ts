// 一起听状态机单测（2026-08-26 批 2）：invite/accept/decline/exit + join 系 defuse
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatParser, MusicActionSnapshot } from './chatParser';
import { DB } from './db';
import { addPendingInvite, clearDeclinedInviteStamp, getMusicStore, pendingInviteOf, removePendingInvite } from '../apps/couple/musicStore';

const noop = () => {};

const SONG = {
  songId: 1, name: '富士山下', artists: '陈奕迅', album: '', albumPic: '', duration: 0, fee: 0,
};

const mkHooks = (over: Partial<{
  getListeningSnapshot: () => MusicActionSnapshot | null;
  joinListeningTogether: (charId: string) => void;
  endListeningTogether: (charId: string) => void;
  addSongToCharPlaylist: (charId: string, song: any, target?: any) => Promise<{ playlistTitle: string; created: boolean } | null>;
}> = {}) => ({
  getListeningSnapshot: () => null as MusicActionSnapshot | null,
  joinListeningTogether: vi.fn(),
  endListeningTogether: vi.fn(),
  addSongToCharPlaylist: vi.fn().mockResolvedValue({ playlistTitle: '深夜', created: false }),
  ...over,
});

afterEach(() => {
  // couple_music_v1 是模块级单例（node 环境无 localStorage 走内存态），清掉测试残留
  for (const p of [...getMusicStore().pendingInvites]) removePendingInvite(p.charId);
  clearDeclinedInviteStamp();
});

describe('invite（他主动邀请，方向 B）', () => {
  it('落 music_invite 卡 + 登记 pendingInvites；没有播放快照也允许', async () => {
    const charId = `c-together-invite-${Date.now()}`;
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions(
      '想听歌吗[[MUSIC_ACTION:invite|夜航星]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('想听歌吗');
    const [card] = await DB.getMessagesByCharId(charId, true);
    expect(card.type).toBe('music_invite');
    expect(card.metadata?.invite).toMatchObject({ direction: 'char', inviteSongName: '夜航星', status: 'pending' });
    expect(pendingInviteOf(charId)).toMatchObject({ direction: 'char', inviteSongName: '夜航星' });
    expect(hooks.joinListeningTogether).not.toHaveBeenCalled();
  });

  it('已经在听 → 剥标签，不落卡不登记', async () => {
    const charId = `c-together-invite-dup-${Date.now()}`;
    const hooks = mkHooks({
      getListeningSnapshot: () => ({ ...SONG, listeningTogetherWith: [charId] }),
    });
    const out = await ChatParser.parseAndExecuteActions(
      '再听一首[[MUSIC_ACTION:invite]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('再听一首');
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
    expect(pendingInviteOf(charId)).toBeUndefined();
  });
});

describe('accept / decline（回应她的邀请，方向 A）', () => {
  const setupUserInvite = async (charId: string) => {
    const cardId = await DB.saveMessage({
      charId, role: 'system', type: 'music_invite',
      content: '[你邀请 Ta 一起听：《富士山下》]',
      metadata: { source: 'music_invite', invite: { direction: 'user', song: null, status: 'pending' } },
    });
    addPendingInvite({ charId, direction: 'user', cardMessageId: String(cardId) });
    return String(cardId);
  };

  it('有 pending 记录才激活：accept → join + 接受卡 + 清 pending + 邀请卡状态更新', async () => {
    const charId = `c-together-accept-${Date.now()}`;
    await setupUserInvite(charId);
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions(
      '好呀，一起听[[MUSIC_ACTION:accept]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('好呀，一起听');
    expect(hooks.joinListeningTogether).toHaveBeenCalledWith(charId);
    expect(pendingInviteOf(charId)).toBeUndefined();
    const msgs = await DB.getMessagesByCharId(charId, true);
    expect(msgs.find((m) => m.type === 'music_accept')?.metadata?.acceptCard?.action).toBe('accept');
    expect(msgs.find((m) => m.type === 'music_invite')?.metadata?.invite?.status).toBe('accepted');
  });

  it('没有 pending 记录 → 模型自作主张，剥标签忽略', async () => {
    const charId = `c-together-accept-rogue-${Date.now()}`;
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions(
      '我接受[[MUSIC_ACTION:accept]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('我接受');
    expect(hooks.joinListeningTogether).not.toHaveBeenCalled();
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
  });

  it('decline → 拒绝卡 + 清 pending，不 join', async () => {
    const charId = `c-together-decline-${Date.now()}`;
    await setupUserInvite(charId);
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions(
      '改天吧[[MUSIC_ACTION:decline]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('改天吧');
    expect(hooks.joinListeningTogether).not.toHaveBeenCalled();
    expect(pendingInviteOf(charId)).toBeUndefined();
    const msgs = await DB.getMessagesByCharId(charId, true);
    expect(msgs.find((m) => m.type === 'music_accept')?.metadata?.acceptCard?.action).toBe('decline');
    expect(msgs.find((m) => m.type === 'music_invite')?.metadata?.invite?.status).toBe('declined');
  });
});

describe('exit（他主动结束）', () => {
  it('在一起听中 → endListeningTogether + 退出卡', async () => {
    const charId = `c-together-exit-${Date.now()}`;
    const hooks = mkHooks({
      getListeningSnapshot: () => ({ ...SONG, listeningTogetherWith: [charId] }),
    });
    const out = await ChatParser.parseAndExecuteActions(
      '今天就到这吧[[MUSIC_ACTION:exit]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('今天就到这吧');
    expect(hooks.endListeningTogether).toHaveBeenCalledWith(charId);
    const [card] = await DB.getMessagesByCharId(charId, true);
    expect(card.type).toBe('music_accept');
    expect(card.metadata?.acceptCard?.action).toBe('exit');
  });

  it('没在一起听 → 剥标签忽略', async () => {
    const charId = `c-together-exit-nope-${Date.now()}`;
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions(
      '[[MUSIC_ACTION:exit]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('');
    expect(hooks.endListeningTogether).not.toHaveBeenCalled();
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
  });
});

describe('关键词判定（2026-08-27 定；2026-09-08 反馈3 邀请改指令化，只剩结束关键词）', () => {
  it('他自然说出邀请话术 → 不再落卡（发起只能走 [[MUSIC_ACTION:invite]]）', async () => {
    const charId = `c-together-kw-invite-${Date.now()}`;
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions(
      '想听歌吗，一起听首富士山下？', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('想听歌吗，一起听首富士山下？');
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
    expect(pendingInviteOf(charId)).toBeUndefined();
    expect(hooks.joinListeningTogether).not.toHaveBeenCalled();
  });

  it('他自然说出结束 → endListeningTogether + 退出卡', async () => {
    const charId = `c-together-kw-exit-${Date.now()}`;
    const hooks = mkHooks({ getListeningSnapshot: () => ({ ...SONG, listeningTogetherWith: [charId] }) });
    const out = await ChatParser.parseAndExecuteActions(
      '今天就到这吧，你先忙', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('今天就到这吧，你先忙');
    expect(hooks.endListeningTogether).toHaveBeenCalledWith(charId);
    const [card] = await DB.getMessagesByCharId(charId, true);
    expect(card.type).toBe('music_accept');
    expect(card.metadata?.acceptCard?.action).toBe('exit');
  });

  it('没在一起听 → 结束话术不触发', async () => {
    const charId = `c-together-kw-exit-nope-${Date.now()}`;
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions('今天就到这吧', charId, '阿一', noop, hooks);
    expect(out).toBe('今天就到这吧');
    expect(hooks.endListeningTogether).not.toHaveBeenCalled();
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
  });

  it('日常说法不误判：听我说/你还在听歌吗 不落卡', async () => {
    const charId = `c-together-kw-miss-${Date.now()}`;
    const hooks = mkHooks();
    await ChatParser.parseAndExecuteActions('你先听我说，你还在听歌吗？', charId, '阿一', noop, hooks);
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
  });

  it('反馈3：裸「一起听」只是普通聊天，不再弹卡（发起改指令化）', async () => {
    const charId = `c-together-kw-bare-${Date.now()}`;
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions('好啊，一起听吧', charId, '阿一', noop, hooks);
    expect(out).toBe('好啊，一起听吧');
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
  });

  it('刚被婉拒 → 冷却期内 invite 标签被剥（防连环邀请）', async () => {
    const charId = `c-together-kw-cooldown-${Date.now()}`;
    // 模拟一轮「他邀请 → 她点拒绝」的落档：拒绝时 store 记下冷却起点
    addPendingInvite({ charId, direction: 'char' });
    removePendingInvite(charId, 'declined');
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions('再试一次[[MUSIC_ACTION:invite]]', charId, '阿一', noop, hooks);
    expect(out).toBe('再试一次');
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
    expect(pendingInviteOf(charId)).toBeUndefined();
  });

  it('接受了上一轮 → 冷却不生效，标签邀请照常出卡', async () => {
    const charId = `c-together-kw-cooldown-ok-${Date.now()}`;
    addPendingInvite({ charId, direction: 'char' });
    removePendingInvite(charId, 'accepted');
    const hooks = mkHooks();
    const out = await ChatParser.parseAndExecuteActions('再听一首[[MUSIC_ACTION:invite]]', charId, '阿一', noop, hooks);
    expect(out).toBe('再听一首');
    const msgs = await DB.getMessagesByCharId(charId, true);
    expect(msgs.find((m) => m.type === 'music_invite')).toBeTruthy();
  });

  it('她的邀请还挂着 → 他再输出 invite 标签也不重复落卡', async () => {
    const charId = `c-together-kw-invite-pending-${Date.now()}`;
    addPendingInvite({ charId, direction: 'user' });
    const hooks = mkHooks();
    await ChatParser.parseAndExecuteActions('好啊[[MUSIC_ACTION:invite]]', charId, '阿一', noop, hooks);
    const msgs = await DB.getMessagesByCharId(charId, true);
    expect(msgs.find((m) => m.type === 'music_invite' && m.metadata?.invite?.direction === 'char')).toBeUndefined();
  });
});

describe('join 系列（已废弃：一起听全显式）', () => {
  it('join 剥标签 defuse：不 join、不落卡', async () => {
    const charId = `c-together-join-${Date.now()}`;
    const hooks = mkHooks({
      getListeningSnapshot: () => ({ ...SONG, listeningTogetherWith: [] }),
    });
    const out = await ChatParser.parseAndExecuteActions(
      '好呀[[MUSIC_ACTION:join]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('好呀');
    expect(hooks.joinListeningTogether).not.toHaveBeenCalled();
    expect(await DB.getMessagesByCharId(charId, true)).toHaveLength(0);
  });

  it('add 系列照旧工作（只收歌，不 join）', async () => {
    const charId = `c-together-add-${Date.now()}`;
    const hooks = mkHooks({
      getListeningSnapshot: () => ({ ...SONG, listeningTogetherWith: [] }),
    });
    const out = await ChatParser.parseAndExecuteActions(
      '这首收下了[[MUSIC_ACTION:add|深夜]]', charId, '阿一', noop, hooks,
    );
    expect(out).toBe('这首收下了');
    expect(hooks.joinListeningTogether).not.toHaveBeenCalled();
    expect(hooks.addSongToCharPlaylist).toHaveBeenCalledTimes(1);
    const [card] = await DB.getMessagesByCharId(charId, true);
    expect(card.type).toBe('music_card');
    expect(card.metadata?.intent).toBe('add');
  });
});
