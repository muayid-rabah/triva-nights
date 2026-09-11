export type ArcadeGameSlug = "taqha" | "huroof" | "outsider" | "mafia" | "auction";

export interface ArcadeGame {
  slug: ArcadeGameSlug;
  name: string;
  tagline: string;
  description: string;
  accent: "taqha" | "huroof" | "outsider" | "mafia" | "auction";
  players: string;
}

export const ARCADE_GAMES: ArcadeGame[] = [
  { slug: "taqha", name: "طقّها", tagline: "سؤال وجواب على السريع", description: "اختاروا الفئات، طقّوا الجواب، واجمعوا النقاط.", accent: "taqha", players: "فريقين" },
  { slug: "huroof", name: "حروف", tagline: "شبكة السيطرة الحماسية", description: "جاوبوا على السؤال، خذوا خلية، ووصلوا خط فريقكم قبل الخصم.", accent: "huroof", players: "فريقان" },
  { slug: "outsider", name: "مين برا السالفة", tagline: "اكتشفوا المتخفي", description: "كلّكم عارفين الكلمة… إلا واحد لازم تكتشفوه.", accent: "outsider", players: "٥ لاعبين أو أكثر" },
  { slug: "mafia", name: "مافيا", tagline: "الليل إله حكي ثاني", description: "أدوار سرية، نقاش، وتصويت قبل ما تغمض عيونكم.", accent: "mafia", players: "٥–٢٠ لاعب" },
  { slug: "auction", name: "المزاد", tagline: "قول رقمك وثبّت كلمتك", description: "زايدوا على التحدّي، واكسبوا بالنَفَس والمعرفة.", accent: "auction", players: "فريقان" },
];

export function arcadeGame(slug: string | undefined): ArcadeGame {
  return ARCADE_GAMES.find((game) => game.slug === slug) ?? ARCADE_GAMES[0];
}
