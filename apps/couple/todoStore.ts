// 日历页待办 store（2026-08-22）——固定待办（每日，按日勾选）+ 短期待办（带日期）
// 规范：version + ISO 时间戳 + owner；弹卡可直接加固定和短期待办；样式同首页待办卡（复选框）
import { createCoupleStore, isoNow, uid } from './coupleStoreBase';
import { addActivity } from './activityStore';
import { getLocalDateKey } from '../../utils/localDate';

export type TodoKind = 'fixed' | 'short';

export interface CoupleTodo {
  id: string;
  text: string;
  kind: TodoKind;
  date?: string;          // 短期：YYYY-MM-DD；固定：无
  done: boolean;          // 短期用
  doneDates: string[];    // 固定用：已勾选的日期列表
  createdAt: string;      // ISO
  updatedAt: string;      // ISO
  owner: string;          // 'her' / 'me'
}

export interface TodoStore {
  version: number;
  updatedAt: string;
  todos: CoupleTodo[];
}

const store = createCoupleStore<TodoStore>('couple_todos_v3', 1, { version: 1, updatedAt: '1970-01-01T00:00:00.000Z', todos: [] });

export const useTodoStore = store.use;
/** 纯 getter（世界书挂载等非 React 代码用） */
export const getTodoStore = store.get;

export function addTodo(input: { text: string; kind: TodoKind; date?: string; owner?: string }): CoupleTodo {
  const t: CoupleTodo = {
    id: uid(),
    text: input.text,
    kind: input.kind,
    date: input.kind === 'short' ? input.date : undefined,
    done: false,
    doneDates: [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
    owner: input.owner ?? 'her',
  };
  store.set((s) => ({ ...s, todos: [...s.todos, t], updatedAt: isoNow() }));
  // 同步活动记录（增加待办）
  addActivity({
    kind: 'todo_add',
    date: input.kind === 'short' ? (input.date ?? getLocalDateKey()) : getLocalDateKey(),
    text: `加了待办「${input.text}」${input.kind === 'fixed' ? '（固定 · 每天）' : ''}`,
    owner: input.owner ?? 'her',
  });
  return t;
}

export function deleteTodo(id: string) {
  store.set((s) => ({ ...s, todos: s.todos.filter((t) => t.id !== id), updatedAt: isoNow() }));
}

/** 勾选/取消：固定按日期记 doneDates，短期翻 done；同步活动记录 */
export function toggleTodo(id: string, dateKey: string) {
  const t = store.get().todos.find((x) => x.id === id);
  if (!t) return;
  const nextChecked = t.kind === 'fixed' ? !t.doneDates.includes(dateKey) : !t.done;
  store.set((s) => ({
    ...s,
    todos: s.todos.map((x) => {
      if (x.id !== id) return x;
      if (x.kind === 'fixed') {
        const has = x.doneDates.includes(dateKey);
        return { ...x, doneDates: has ? x.doneDates.filter((d) => d !== dateKey) : [...x.doneDates, dateKey], updatedAt: isoNow() };
      }
      return { ...x, done: !x.done, updatedAt: isoNow() };
    }),
    updatedAt: isoNow(),
  }));
  // 同步活动记录（勾选/取消勾选）
  addActivity({
    kind: 'todo_toggle',
    date: dateKey,
    text: nextChecked ? `完成了「${t.text}」` : `取消了「${t.text}」`,
    owner: t.owner,
  });
}

/** 固定待办全部（每天都出现） */
export const fixedTodos = (todos: CoupleTodo[]) => todos.filter((t) => t.kind === 'fixed');

/** 某天的短期待办 */
export const shortTodosOn = (todos: CoupleTodo[], dateKey: string) => todos.filter((t) => t.kind === 'short' && t.date === dateKey);
