export type HelpKey = "trap" | "rest" | "two" | "dig" | "call";

export interface HelpDef {
  key: HelpKey;
  name: string;
  short: string;
  color: string;
  icon: string;
}

export const HELPS: HelpDef[] = [
  {
    key: "trap",
    name: "لبّسهم",
    short: "معلومة مضللة بتوصل للفريق الثاني بالجولة الجاية. استعملها بذكاء.",
    color: "text-gold",
    icon: "shell",
  },
  {
    key: "rest",
    name: "خذوا نفس",
    short: "وقفوا المؤقت وخذوا دقيقة تشاور سريعة قبل ما تكملوا.",
    color: "text-destructive",
    icon: "hand",
  },
  {
    key: "two",
    name: "جوابين",
    short: "اختاروا جوابين بدل واحد، إذا واحد منهم صح النقطة إلكم.",
    color: "text-chart-4",
    icon: "hand-metal",
  },
  {
    key: "dig",
    name: "فزعة",
    short: "بنشلّك خيارين غلط وبنخففها عليكم.",
    color: "text-primary",
    icon: "shovel",
  },
  {
    key: "call",
    name: "رنّة لصاحبك",
    short: "اتصل بصاحبك وخذوا جواب سريع قبل ما يطير الوقت.",
    color: "text-success",
    icon: "phone",
  },
];

export interface QuestionRow {
  id: string;
  category_id: string;
  points: number;
  kind: "mcq" | "open";
  text: string;
  choices: string[] | null;
  answer: string;
  image_url?: string | null;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  image_key: string | null;
  emoji: string | null;
  group_id: string;
  sort_order: number;
}

export interface TeamState {
  name: string;
  score: number;
  helps: Record<HelpKey, boolean>; // true = still available
}

export interface GameState {
  id: string;
  teams: [TeamState, TeamState];
  turn: 0 | 1;
  categories: CategoryRow[];
  questions: QuestionRow[];
  used: string[];
  trapArmedBy: 0 | 1 | null;
  finished: boolean;
}

export const freshHelps = (): Record<HelpKey, boolean> => ({
  trap: true,
  rest: true,
  two: true,
  dig: true,
  call: true,
});
