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
    name: "الفخ",
    short: "تعرف الجواب؟ ريّح الفريق الثاني وأعطه جواب مقلوب يضلله في دوره الجاي.",
    color: "text-gold",
    icon: "shell",
  },
  {
    key: "rest",
    name: "استريح",
    short: "وقّف المؤقت واستشر شخص من عندك، وبعدين كمّل العد.",
    color: "text-destructive",
    icon: "hand",
  },
  {
    key: "two",
    name: "جاوب جوابين",
    short: "اختر جوابين بدل واحد، وإذا أحدهم صح تحسب لك النقطة.",
    color: "text-chart-4",
    icon: "hand-metal",
  },
  {
    key: "dig",
    name: "الحفرة",
    short: "احذف خيارين خاطئين من أربعة وخلّي السؤال أسهل.",
    color: "text-primary",
    icon: "shovel",
  },
  {
    key: "call",
    name: "اتصال بصديق",
    short: "اتصل بصديق ٣٠ ثانية يساعدك بجواب سريع.",
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
