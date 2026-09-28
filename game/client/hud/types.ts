// Снимок интерфейса: простые данные без ссылок на мир. Vue-компоненты только рисуют его и вызывают act(action).
// Действие — строка «вид:арг1:арг2», как в data-a раньше: 'train:12:archer', 'build:house', 'dip:2:3'…

export interface Tip { title: string; lines?: string[]; note?: string }
export interface CmdButton { a: string; icon: string; ok: boolean; badge?: string; hk?: string; tip: Tip }
export type CmdItem = CmdButton | { header: string };
export interface QueueSlot { a: string; icon: string; title: string; progress?: number; count?: number }

export type SelectionPanel =
  | { kind: 'none'; hints: boolean }
  | { kind: 'resource'; icon: string; name: string; left: number; resIcon: string; workers: number }
  | { kind: 'one'; icon: string; name: string; owner: string; hp: number; maxHp: number; stats: string[]; lines: string[]; queue: QueueSlot[] }
  | { kind: 'buildings'; icon: string; name: string; count: number; busy: number; queue: QueueSlot[] }
  | { kind: 'group'; count: number; types: { a: string; icon: string; title: string; count: number }[] };

export interface Alert { text: string; a?: string; kind: 'idle' | 'warn' | 'info' }
export interface DiploRow { id: number; name: string; color: string; rel: string; waiting?: string; buttons: { a: string; label: string }[]; tribute: { a: string; label: string }[] }
export interface EndInfo {
  won: boolean; victory: string; title: string; years: number; culture: string[]; stats: string;
  chronicle: { year: number; text: string }[]; played: number; wins: number;
}

export interface HudState {
  pop: string; res: { icon: string; value: number; key: string }[];
  status: { fps?: number; time: string; regions: string; culture: string };
  age: { name: string; sub: string };
  hover: string; news: string; message: string;
  alerts: Alert[];
  diplomacy: DiploRow[] | null;   // null — панель закрыта
  selection: SelectionPanel;
  commands: CmdItem[];
  box: { x: number; y: number; w: number; h: number } | null; // рамка выделения
  menu: boolean; canPause: boolean; debug: boolean; amove: boolean;
  uiScale: number; hints: boolean;
  end: EndInfo | null;
}
