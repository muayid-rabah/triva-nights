import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, CircleHelp, Crown, Eye, Gavel, Play, Skull, Sparkles, Timer, Trophy, Vote } from "lucide-react";
import { useEffect, useState } from "react";
import "@/billion-auction.css";
import { GameRoomFlow, type PlayMode } from "@/components/game-room-flow";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { arcadeGame, type ArcadeGame, type ArcadeGameSlug } from "@/lib/arcade-catalog";
import { AUCTION_QUESTIONS, AUCTION_TWISTS } from "@/lib/auction-bank";
import { BILLION_AUCTION_PLAYERS, billionPlayerAsset, type BillionAuctionPlayer, type BillionRole } from "@/lib/billion-auction-players";
import { BillionAuctionGame } from "@/components/billion-auction-game";
import { createLetterBoard, findWinningPath, type HuroofOwner } from "@/lib/huroof-engine";

export const Route = createFileRoute("/arcade")({
  validateSearch: (search: Record<string, unknown>) => ({ game: typeof search.game === "string" ? search.game : "taqha" }),
  component: ArcadePage,
});

type Stage = "room" | "setup" | "play";
type AuctionKind = "categories" | "billion";
type GameSession = {
  teams: [string, string];
  players: string[];
  huroof?: { size: 4 | 5 | 6; rounds: number; buzzer: boolean; seed: number };
  auction?: { kind: AuctionKind; rounds: number; slots: number; budget?: number; pool?: string };
};
const EMPTY_SESSION: GameSession = { teams: ["فريق السرو", "فريق الكرمل"], players: [] };

function ArcadePage() {
  const { game: requestedGame } = Route.useSearch();
  const game = arcadeGame(requestedGame);
  return <ArcadeSession key={game.slug} game={game} />;
}

/** A game card always opens a fresh room; old browser saves must never skip setup. */
function ArcadeSession({ game }: { game: ArcadeGame }) {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [stage, setStage] = useState<Stage>("room");
  const [mode, setMode] = useState<PlayMode>("single");
  const [session, setSession] = useState<GameSession>(EMPTY_SESSION);

  useEffect(() => {
    try { window.localStorage.removeItem(`qad-altahadi:v2:arcade:${game.slug}`); } catch { /* Storage is optional. */ }
  }, [game.slug]);

  function startRoom(selectedMode: PlayMode, players: string[] = []) {
    setMode(selectedMode);
    if (game.slug === "taqha") {
      navigate({ to: "/create-game" });
      return;
    }
    setSession((current) => ({ ...current, players }));
    setStage("setup");
  }

  return (
    <div className={`min-h-screen arcade-page arcade-${game.accent}`}>
      <SiteHeader />
      <main className={`heritage-page-shell min-h-[76vh] px-4 py-10 sm:py-14 ${game.slug === "huroof" && stage === "play" ? "huroof-fullscreen-page" : ""}`}>
        <div className={`mx-auto mb-8 flex max-w-6xl items-center justify-between gap-3 ${game.slug === "huroof" && stage === "play" ? "huroof-play-nav" : ""}`}>
          <Link to="/games" className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground transition-colors hover:text-gold"><ChevronLeft className="h-4 w-4" /> كل الألعاب</Link>
          <span className="arcade-game-name">{game.name}</span>
        </div>
        {loading ? <div className="mx-auto max-w-xl py-24 text-center text-muted-foreground">بنجهّز القعدة...</div> : !user ? (
          <section className="arcade-login mx-auto max-w-xl rounded-[2rem] p-8 text-center">
            <Crown className="mx-auto h-10 w-10 text-gold" />
            <h1 className="mt-4 text-4xl">جاهزين للّمة؟</h1>
            <p className="mt-3 text-muted-foreground">سجّل حسابك أول، وبعدها افتح غرفة وخلّوا اللعب يبلّش.</p>
            <Button asChild className="mt-6"><Link to="/auth">سجّل دخولك</Link></Button>
          </section>
        ) : stage === "room" ? <GameRoomFlow game={game} onStart={startRoom} /> : stage === "setup" ? (
          <GameSetup game={game.slug} mode={mode} initialPlayers={session.players} onStart={(nextSession) => { setSession(nextSession); setStage("play"); }} />
        ) : <GamePlay game={game.slug} mode={mode} session={session} />}
      </main>
      <SiteFooter />
    </div>
  );
}

function ChoiceButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className={`arcade-choice ${active ? "is-active" : ""}`}>{children}</button>;
}

function GameSetup({ game, mode, initialPlayers, onStart }: { game: ArcadeGameSlug; mode: PlayMode; initialPlayers: string[]; onStart: (session: GameSession) => void }) {
  if (game === "huroof") return <HuroofSetup mode={mode} onStart={onStart} />;
  if (game === "outsider") return <OutsiderSetup mode={mode} initialPlayers={initialPlayers} onStart={onStart} />;
  if (game === "auction" || game === "auction-billion") return <AuctionSetup mode={mode} initialKind={game === "auction-billion" ? "billion" : "categories"} onStart={onStart} />;
  return <MafiaSetup mode={mode} initialPlayers={initialPlayers} onStart={onStart} />;
}

function HuroofSetup({ mode, onStart }: { mode: PlayMode; onStart: (session: GameSession) => void }) {
  const [rounds, setRounds] = useState(1);
  const [size, setSize] = useState<4 | 5 | 6>(5);
  const [buzzer, setBuzzer] = useState(false);
  const [teamA, setTeamA] = useState("فريق السرو");
  const [teamB, setTeamB] = useState("فريق الكرمل");
  return <section className="arcade-panel arcade-huroof mx-auto max-w-3xl rounded-[2rem] p-6 sm:p-9">
    <span className="eyebrow">حروف · {mode === "online" ? "غرفة جوالات" : "جهاز واحد"}</span><h1 className="mt-3 text-4xl">شبكة سيطرة، مش تكوين كلمات</h1><p className="mt-2 text-muted-foreground">جاوبوا سؤال، اختاروا خلية، ووصلوا خط بلون فريقكم: الأخضر من فوق لتحت والعنابي من اليمين للشمال.</p>
    <div className="mt-7 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">اسم الفريق الأخضر<Input value={teamA} onChange={(event) => setTeamA(event.target.value)} className="mt-2 h-11 bg-background/45" /></label><label className="block text-sm font-bold">اسم الفريق العنابي<Input value={teamB} onChange={(event) => setTeamB(event.target.value)} className="mt-2 h-11 bg-background/45" /></label></div>
    <div className="mt-6 grid gap-6 sm:grid-cols-2"><SetupChoices title="الجولات للفوز" values={[1, 2, 3]} selected={rounds} onChange={setRounds} /><SetupChoices title="حجم الشبكة" values={[4, 5, 6]} selected={size} onChange={(value) => setSize(value as 4 | 5 | 6)} /></div>
    <div className="mt-5 flex flex-wrap gap-2"><ChoiceButton active={!buzzer} onClick={() => setBuzzer(false)}>وضع المقدم</ChoiceButton><ChoiceButton active={buzzer} onClick={() => setBuzzer(true)}>وضع الجرس</ChoiceButton></div>
    <div className="huroof-rules mt-7"><Check className="h-5 w-5" /><p><b>مدير الجلسة</b> بقرأ السؤال للفريق. الجواب الصح بخليه يملك الخلية ويكمل دوره؛ الغلط بمرّر الدور للفريق الثاني.</p></div>
    <Button className="mt-8" onClick={() => onStart({ teams: [teamA.trim() || "فريق السرو", teamB.trim() || "فريق الكرمل"], players: [], huroof: { size, rounds, buzzer, seed: Math.random() } })}><Play /> بلّشوا حروف</Button>
  </section>;
}

function SetupChoices({ title, values, selected, onChange }: { title: string; values: number[]; selected: number; onChange: (n: number) => void }) {
  return <div><p className="mb-2 text-sm font-bold">{title}</p><div className="flex gap-2">{values.map((value) => <ChoiceButton key={value} active={value === selected} onClick={() => onChange(value)}>{value}</ChoiceButton>)}</div></div>;
}

function OutsiderSetup({ mode, initialPlayers, onStart }: { mode: PlayMode; initialPlayers: string[]; onStart: (session: GameSession) => void }) {
  const [names, setNames] = useState(initialPlayers.length >= 5 ? initialPlayers : ["ليان", "يزن", "تالا", "حمزة", "نور"]); const [turns, setTurns] = useState(1); const [category, setCategory] = useState("عام");
  function setPlayers(value: number) { setNames((current) => value > current.length ? [...current, ...Array.from({ length: value - current.length }, (_, index) => `لاعب ${current.length + index + 1}`)] : current.slice(0, value)); }
  return <section className="arcade-panel arcade-outsider mx-auto max-w-3xl rounded-[2rem] p-6 sm:p-9"><span className="eyebrow">مين برا السالفة · {mode === "online" ? "كل واحد بجواله" : "جهاز واحد"}</span><h1 className="mt-3 text-4xl">سرّ واحد... ولاعب برا</h1><p className="mt-2 text-muted-foreground">الكل بيعرف الكلمة إلا واحد. انتبهوا مين بحكي كلام عام كثير.</p>
    <div className="mt-7 grid gap-6 sm:grid-cols-3"><Counter title="عدد اللاعبين" value={names.length} min={5} max={12} onChange={setPlayers} /><SetupChoices title="جولات الوصف" values={[1, 2]} selected={turns} onChange={setTurns} /><div><p className="mb-2 text-sm font-bold">فئة الكلمات</p><div className="flex flex-wrap gap-2">{["عام", "أكل", "أماكن"].map((item) => <ChoiceButton key={item} active={category === item} onClick={() => setCategory(item)}>{item}</ChoiceButton>)}</div></div></div>
    <ParticipantFields names={names} onChange={setNames} />
    <Button className="mt-8" onClick={() => onStart({ ...EMPTY_SESSION, players: names.map((name, index) => name.trim() || `لاعب ${index + 1}`) })}><Eye /> وزّعوا الأسرار</Button>
  </section>;
}

function Counter({ title, value, min, max, onChange }: { title: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return <div><p className="mb-2 text-sm font-bold">{title}</p><div className="counter-control"><button onClick={() => onChange(Math.max(min, value - 1))}>−</button><strong>{value}</strong><button onClick={() => onChange(Math.min(max, value + 1))}>+</button></div></div>;
}

function MafiaSetup({ mode, initialPlayers, onStart }: { mode: PlayMode; initialPlayers: string[]; onStart: (session: GameSession) => void }) {
  const [names, setNames] = useState(initialPlayers.length >= 5 ? initialPlayers : ["ليان", "يزن", "تالا", "حمزة", "نور", "آدم", "رنا"]); const [gameMode, setGameMode] = useState("كلاسيكي");
  function setPlayers(value: number) { setNames((current) => value > current.length ? [...current, ...Array.from({ length: value - current.length }, (_, index) => `لاعب ${current.length + index + 1}`)] : current.slice(0, value)); }
  const mafia = Math.max(1, Math.floor(names.length / 4)); const special = gameMode === "كلاسيكي" ? 2 : gameMode === "كلاسيكي + سفاح" ? 3 : 4;
  return <section className="arcade-panel arcade-mafia mx-auto max-w-3xl rounded-[2rem] p-6 sm:p-9"><span className="eyebrow">مافيا · {mode === "online" ? "كل واحد بجواله" : "راوي واحد"}</span><h1 className="mt-3 text-4xl">الليل إله قوانين</h1><p className="mt-2 text-muted-foreground">اختاروا النمط، والنظام بيوزع الأدوار ويحسب الفوز تلقائياً.</p>
    <div className="mt-7 grid gap-6 sm:grid-cols-[.7fr_1.3fr]"><Counter title="عدد اللاعبين" value={names.length} min={5} max={20} onChange={setPlayers} /><div><p className="mb-2 text-sm font-bold">نمط اللعبة</p><div className="grid grid-cols-2 gap-2">{["كلاسيكي", "كلاسيكي + سفاح", "متقدم", "حرب شاملة", "مخصص"].map((item) => <ChoiceButton key={item} active={gameMode === item} onClick={() => setGameMode(item)}>{item}</ChoiceButton>)}</div></div></div>
    <ParticipantFields names={names} onChange={setNames} />
    <div className="mafia-summary mt-6"><Skull /><div><small>التوزيع التلقائي</small><strong>{mafia} مافيا | {special} أدوار خاصة | {names.length - mafia - special} مواطنين</strong></div></div>
    <Button className="mt-8" onClick={() => onStart({ ...EMPTY_SESSION, players: names.map((name, index) => name.trim() || `لاعب ${index + 1}`) })}><Play /> افتحوا المدينة</Button>
  </section>;
}

function ParticipantFields({ names, onChange }: { names: string[]; onChange: (names: string[]) => void }) {
  return <div className="participant-fields mt-7"><div className="flex items-center justify-between gap-3"><p className="font-bold">أسماء المشاركين</p><span>{names.length} لاعبين</span></div><p className="mt-1 text-sm text-muted-foreground">اكتبوا الأسماء قبل البدء؛ رح تظهر بالأدوار والتصويت.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{names.map((name, index) => <Input key={index} value={name} maxLength={24} onChange={(event) => onChange(names.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`اسم اللاعب ${index + 1}`} />)}</div></div>;
}

function AuctionSetup({ mode, initialKind, onStart }: { mode: PlayMode; initialKind: AuctionKind; onStart: (session: GameSession) => void }) {
  const kind = initialKind;
  const [teamA, setTeamA] = useState(""); const [teamB, setTeamB] = useState("");
  const [rounds, setRounds] = useState(3); const [budget, setBudget] = useState(200); const [pool, setPool] = useState("all");
  return <section className="arcade-panel arcade-auction mx-auto max-w-3xl rounded-[2rem] p-6 sm:p-9">
    <span className="eyebrow">{kind === "billion" ? "مزاد المليار" : "مزاد الأسئلة"} · {mode === "online" ? "غرفة جوالات" : "جهاز واحد"}</span><h1 className="mt-3 text-4xl">{kind === "billion" ? "ابنوا فريقكم بالمزايدة" : "زايدوا وثبّتوا كلمتكم"}</h1>
    <div className="mt-7 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">{kind === "billion" ? "اسم اللاعب الأول" : "اسم الفريق الأول"}<Input value={teamA} onChange={(event) => setTeamA(event.target.value)} className="mt-2 h-11 bg-background/45" /></label><label className="text-sm font-bold">{kind === "billion" ? "اسم اللاعب الثاني" : "اسم الفريق الثاني"}<Input value={teamB} onChange={(event) => setTeamB(event.target.value)} className="mt-2 h-11 bg-background/45" /></label></div>
    <div className="mt-6 grid gap-5 sm:grid-cols-3">{kind === "billion" ? <><SetupChoices title="ميزانية كل لاعب" values={[100, 200]} selected={budget} onChange={setBudget} /><p className="self-end text-sm leading-7 text-muted-foreground">سبع جولات ثابتة: حارس، دفاعان، وسطَان، ومهاجمان. في كل جولة بطاقة علنية وبطاقة خفية من نفس المركز.</p></> : <><SetupChoices title="عدد الجولات" values={[1, 3, 5]} selected={rounds} onChange={setRounds} /><p className="self-end text-sm leading-7 text-muted-foreground">ما في سقف للمزايدة: اكتبوا أي رقم أعلى من العرض. النقاط تُحسب من الإجابات الصحيحة: كل 10 إجابات = نقطة.</p></>}</div>
    {kind === "billion" && <div className="mt-6"><p className="mb-2 text-sm font-bold">اختاروا اللاعبين المعروضين بالمزاد</p><div className="flex flex-wrap gap-2">{[{ id: "all", label: "كل الأندية" }, { id: "premier", label: "الدوري الإنجليزي" }, { id: "laliga", label: "الدوري الإسباني" }, { id: "seriea", label: "الدوري الإيطالي" }, { id: "bundesliga", label: "الدوري الألماني" }, { id: "ligue1", label: "الدوري الفرنسي" }, { id: "legends", label: "الأساطير" }].map((item) => <ChoiceButton key={item.id} active={pool === item.id} onClick={() => setPool(item.id)}>{item.label}</ChoiceButton>)}</div><p className="mt-2 text-xs text-muted-foreground">إذا لم يكفِ المركز المختار لبطاقتين، يضيف النظام بطاقة احتياطية من النجوم لضمان اكتمال الجولة.</p></div>}
    <p className="mt-4 text-sm text-muted-foreground">سمّوا الطرفين أولاً؛ الأسماء تظهر على الملعب ولوحة النقاط طوال اللعبة.</p>
    <Button className="mt-5" disabled={!teamA.trim() || !teamB.trim()} onClick={() => onStart({ teams: [teamA.trim(), teamB.trim()], players: [], auction: { kind, rounds, slots: 7, budget, pool } })}><Gavel /> افتحوا المزاد</Button>
  </section>;
}

function GamePlay({ game, mode, session }: { game: ArcadeGameSlug; mode: PlayMode; session: GameSession }) {
  if (game === "huroof") return <HuroofPlay session={session} />;
  if (game === "outsider") return <OutsiderPlay mode={mode} names={session.players} />;
  if (game === "auction-billion") return <BillionAuctionGame teams={session.teams} budget={session.auction?.budget ?? 200} pool={session.auction?.pool} />;
  if (game === "auction") return <AuctionPlay session={session} />;
  return <MafiaPlay mode={mode} names={session.players} />;
}

const FULL_FORMATION: BillionRole[] = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "ATT", "ATT", "ATT"];
const QUICK_FORMATION: BillionRole[] = ["GK", "DEF", "DEF", "MID", "MID", "ATT", "ATT"];

function formationFor(slots: number) { return slots < 11 ? QUICK_FORMATION : FULL_FORMATION; }

function placeOnPitch(squad: BillionAuctionPlayer[], slots: number) {
  const used = new Set<string>();
  return formationFor(slots).map((role) => {
    const player = squad.find((candidate) => candidate.role === role && !used.has(candidate.id));
    if (player) used.add(player.id);
    return player;
  });
}

function SquadPitch({ name, budget, squad, slots, side }: { name: string; budget: number; squad: BillionAuctionPlayer[]; slots: number; side: "a" | "b" }) {
  const formation = formationFor(slots);
  const starters = placeOnPitch(squad, slots);
  const bench = squad.filter((player) => !starters.some((starter) => starter?.id === player.id));
  const coach = squad.find((player) => player.role === "COACH");
  return <article className={`billion-squad billion-squad-${side}`}>
    <header><div><small>ميزانية متبقية</small><strong>{budget.toLocaleString("en-US")}M</strong></div><h2>{name}</h2><span>{squad.length}/{slots} صفقة</span></header>
    <div className={`billion-pitch slots-${formation.length}`} aria-label={`ملعب ${name}`}>
      {formation.map((role, index) => {
        const player = starters[index];
        return <div className={`pitch-player role-${role.toLowerCase()} ${player ? "is-filled" : ""}`} key={`${role}-${index}`}>
          {player?.asset && <img src={billionPlayerAsset(player.asset)} alt="" />}
          <b>{player?.name ?? "+"}</b><small>{player?.position ?? (role === "GK" ? "حارس" : role === "DEF" ? "دفاع" : role === "MID" ? "وسط" : "هجوم")}</small>
        </div>;
      })}
    </div>
    <footer><span>الاحتياط: {bench.filter((player) => player.role !== "COACH").map((player) => player.name).join(" · ") || "—"}</span><span>المدرب: {coach?.name ?? "—"}</span></footer>
  </article>;
}

function AuctionPlay({ session }: { session: GameSession }) {
  const config = session.auction ?? { kind: "categories" as const, rounds: 3, slots: 19, budget: 200 };
  const [phase, setPhase] = useState<"pick" | "bid" | "challenge" | "result" | "twist">("pick"); const [questionIndex, setQuestionIndex] = useState(0); const [markedAnswers, setMarkedAnswers] = useState<string[]>([]);
  const [bid, setBid] = useState(config.kind === "billion" ? BILLION_AUCTION_PLAYERS[0].price : 3); const [bidder, setBidder] = useState<0 | 1>(0); const [winner, setWinner] = useState<0 | 1 | null>(null);
  const [customBid, setCustomBid] = useState(""); const [bidError, setBidError] = useState("");
  const [correct, setCorrect] = useState(0); const [seconds, setSeconds] = useState(45); const [scores, setScores] = useState<[number, number]>([0, 0]); const [round, setRound] = useState(1); const [lastAward, setLastAward] = useState(0);
  const [playerIndex, setPlayerIndex] = useState(0); const [budgets, setBudgets] = useState<[number, number]>([config.budget ?? 200, config.budget ?? 200]); const [squads, setSquads] = useState<[BillionAuctionPlayer[], BillionAuctionPlayer[]]>([[], []]);
  const teams = session.teams; const featured = BILLION_AUCTION_PLAYERS[playerIndex]; const question = AUCTION_QUESTIONS[questionIndex % AUCTION_QUESTIONS.length];
  useEffect(() => { if (phase !== "challenge" || seconds <= 0) return; const id = window.setInterval(() => setSeconds((value) => value - 1), 1000); return () => window.clearInterval(id); }, [phase, seconds]);
  const answerLimit = question.answers.length;
  function beginBid() { setBid(Math.min(question.suggestedBid, answerLimit)); setCustomBid(""); setBidError(""); setBidder(0); setWinner(null); setPhase("bid"); }
  function placeQuestionBid(amount: number) {
    if (!Number.isInteger(amount) || amount <= bid || amount > answerLimit) { setBidError(`المزايدة يجب أن تكون أكبر من ${bid} ولا تتجاوز ${answerLimit} إجابة متاحة.`); return; }
    setBid(amount); setCustomBid(""); setBidError(""); setBidder((current) => current === 0 ? 1 : 0);
  }
  function placeBillionBid(amount: number) {
    if (!Number.isInteger(amount) || amount <= bid || amount > budgets[bidder]) { setBidError(`العرض لازم يكون أكبر من ${bid} وما يتجاوز رصيد ${teams[bidder]}.`); return; }
    setBid(amount); setCustomBid(""); setBidError(""); setBidder((current) => current === 0 ? 1 : 0);
  }
  function passBillionBid() {
    if (!featured) return;
    const buyer = bidder === 0 ? 1 : 0;
    if (budgets[buyer] < bid) { setBidError(`رصيد ${teams[buyer]} لا يكفي للصفقة.`); return; }
    if (squads[buyer].length >= config.slots) { setBidError(`${teams[buyer]} أكمل خانات تشكيلته؛ مرّروا الصفقة للطرف الثاني.`); return; }
    setBudgets((value) => buyer === 0 ? [value[0] - bid, value[1]] : [value[0], value[1] - bid]);
    setSquads((value) => buyer === 0 ? [[...value[0], featured], value[1]] : [value[0], [...value[1], featured]]);
    const nextIndex = playerIndex + 1;
    setPlayerIndex(nextIndex); setBid(BILLION_AUCTION_PLAYERS[nextIndex]?.price ?? 0); setBidder(bidder); setCustomBid(""); setBidError("");
  }
  function withdraw() { const winningTeam = bidder === 0 ? 1 : 0; setWinner(winningTeam); setSeconds(Math.max(30, bid * 5)); setMarkedAnswers([]); setCorrect(0); setPhase("challenge"); }
  function finishChallenge() {
    if (winner === null) return;
    const successful = correct >= bid;
    // One score point for every ten validated answers: 10 = 1, 20 = 2, 40 = 4.
    const award = Math.floor((successful ? correct : bid) / 10);
    setLastAward(award);
    setScores((current) => {
      const next: [number, number] = [...current] as [number, number];
      next[successful ? winner : winner === 0 ? 1 : 0] += award;
      return next;
    });
    setPhase("result");
  }
  function nextRound() { if (round >= config.rounds) return; const next = round + 1; setRound(next); setQuestionIndex((value) => value + 1); setPhase(next % 4 === 0 ? "twist" : "pick"); }
  if (config.kind === "billion") {
    const completed = squads[0].length >= config.slots && squads[1].length >= config.slots;
    if (!featured || completed) return <section className="auction-play auction-billion mx-auto max-w-5xl rounded-[2rem] p-8 text-center"><Trophy className="mx-auto h-12 w-12 text-gold" /><span className="eyebrow">انتهى المزاد</span><h1 className="mt-4">جاهزة التشكيلات للمقارنة</h1><div className="billion-pitches mt-7"><SquadPitch name={teams[0]} budget={budgets[0]} squad={squads[0]} slots={config.slots} side="a" /><SquadPitch name={teams[1]} budget={budgets[1]} squad={squads[1]} slots={config.slots} side="b" /></div></section>;
    return <section className="auction-play auction-billion mx-auto max-w-[92rem] rounded-[2rem] p-5 text-center sm:p-8">
      <span className="eyebrow">مزاد المليار · الصفقة {playerIndex + 1} من {BILLION_AUCTION_PLAYERS.length}</span>
      <p className="mt-2 text-sm text-muted-foreground">{teams[bidder]} يزايد الآن. مرّر لتذهب الصفقة للطرف الثاني على آخر رقم معلن.</p>
      <div className="billion-pitches mt-6">
        <SquadPitch name={teams[0]} budget={budgets[0]} squad={squads[0]} slots={config.slots} side="a" />
        <div className="billion-auction-desk">
          <article className="football-auction-card">
            {featured.asset ? <img src={billionPlayerAsset(featured.asset)} alt={`بطاقة ${featured.name}`} /> : <Gavel />}
            <small>{featured.position}</small><h1>{featured.name}</h1><p>التقييم {featured.rating} · يبدأ من {featured.price}M</p>
          </article>
          <div className="auction-bid-number">{bid}<small>مليون</small></div>
          <p className="mt-3 font-bold text-gold">الدور على {teams[bidder]}</p>
          <div className="auction-bid-controls mt-5"><Button disabled={bid + 5 > budgets[bidder]} onClick={() => placeBillionBid(bid + 5)}><Gavel /> +٥M</Button><Button disabled={bid + 10 > budgets[bidder]} onClick={() => placeBillionBid(bid + 10)}>+١٠M</Button><Button disabled={bid + 25 > budgets[bidder]} onClick={() => placeBillionBid(bid + 25)}>+٢٥M</Button><Input inputMode="numeric" type="number" min={bid + 1} max={budgets[bidder]} value={customBid} onChange={(event) => setCustomBid(event.target.value)} placeholder="اكتب أي رقم بالملايين" aria-label="مزايدة مخصصة بالملايين" /><Button variant="outline" onClick={() => placeBillionBid(Number(customBid))}>زايد</Button><Button variant="outline" onClick={passBillionBid}>أمرّر</Button></div>
          {bidError && <p className="mt-3 text-sm text-red-200">{bidError}</p>}
        </div>
        <SquadPitch name={teams[1]} budget={budgets[1]} squad={squads[1]} slots={config.slots} side="b" />
      </div>
    </section>;
  }
  if (phase === "pick") return <section className="auction-play mx-auto max-w-4xl rounded-[2rem] p-8 text-center"><span className="eyebrow">مزاد الأسئلة · الجولة {round} من {config.rounds}</span><h1 className="mx-auto mt-6 max-w-3xl text-4xl leading-relaxed">{question.prompt}</h1><p className="mt-5 text-muted-foreground">لا تظهر الإجابات الآن؛ كل فريق يزايد فقط على العدد الذي يقدر يذكره.</p><Button className="mt-8" onClick={beginBid}><Gavel /> ابدأ المزايدة</Button></section>;
  if (phase === "bid") return <section className="auction-play mx-auto max-w-3xl rounded-[2rem] p-8 text-center"><span className="eyebrow">{question.prompt}</span><Gavel className="auction-gavel mx-auto mt-5" /><h1 className="mt-4">الدور على {teams[bidder]}</h1><div className="auction-bid-number">{bid}<small>إجابة</small></div><p className="mt-3 text-muted-foreground">الحد الأقصى لهذا السؤال: {answerLimit} إجابة. زايدوا برقم أعلى من العرض الحالي أو مرّروا للفريق الآخر. كل 10 إجابات صحيحة = نقطة.</p><div className="auction-bid-controls mt-7"><Button disabled={bid + 1 > answerLimit} onClick={() => placeQuestionBid(bid + 1)}>+١</Button><Button disabled={bid + 2 > answerLimit} onClick={() => placeQuestionBid(bid + 2)}>+٢</Button><Button disabled={bid + 5 > answerLimit} onClick={() => placeQuestionBid(bid + 5)}>+٥</Button><Input inputMode="numeric" type="number" min={bid + 1} max={answerLimit} value={customBid} onChange={(event) => setCustomBid(event.target.value)} placeholder={`من ${bid + 1} إلى ${answerLimit}`} aria-label="مزايدة مخصصة" /><Button variant="outline" disabled={bid >= answerLimit} onClick={() => placeQuestionBid(Number(customBid))}>زايد</Button><Button variant="outline" onClick={withdraw}>أمرّر</Button></div>{bidError && <p className="mt-3 text-sm text-red-200">{bidError}</p>}</section>;
  if (phase === "challenge") return <section className="auction-play mx-auto max-w-5xl rounded-[2rem] p-8 text-center"><span className="eyebrow">{question.prompt}</span><h1 className="mt-4">{teams[winner ?? 0]} التزم بـ {bid} إجابات</h1><div className="auction-timer">{seconds}</div><p className="mt-2 font-bold text-gold">الإجابات الصحيحة: {correct} من {bid}</p><p className="mt-1 text-sm text-muted-foreground">مدير اللعبة يعلّم الإجابة التي يسمعها فقط.</p><div className="auction-answer-list mt-7">{question.answers.map((answer) => <button key={answer} className={markedAnswers.includes(answer) ? "is-marked" : ""} onClick={() => setMarkedAnswers((current) => { const next = current.includes(answer) ? current.filter((item) => item !== answer) : [...current, answer]; setCorrect(next.length); return next; })}><Check /> {answer}</button>)}</div><div className="mt-6 flex justify-center gap-3"><Button onClick={finishChallenge} disabled={correct < bid && seconds > 0}>ثبّت النتيجة</Button>{seconds === 0 && <Button variant="outline" onClick={finishChallenge}>انتهى الوقت</Button>}</div></section>;
  if (phase === "twist") { const twist = AUCTION_TWISTS[(round / 4 - 1) % AUCTION_TWISTS.length]; return <section className="auction-play auction-twist mx-auto max-w-xl rounded-[2rem] p-9 text-center"><Gavel className="auction-gavel mx-auto" /><span className="eyebrow">عقوبة مفاجئة</span><div className="twist-card mt-6"><small>اقلبوا الكرت</small><strong>{twist}</strong></div><Button className="mt-7" onClick={() => setPhase("pick")}>السؤال التالي</Button></section>; }
  return <section className="auction-play mx-auto max-w-xl rounded-[2rem] p-8 text-center"><Trophy className="mx-auto h-10 w-10 text-gold" /><h1 className="mt-4">النتيجة</h1><p className="mt-3 text-lg">{correct >= bid ? `${teams[winner ?? 0]} وفّى بالمزايدة!` : `${teams[(winner ?? 0) === 0 ? 1 : 0]} أخذ الهدية.`}</p><p className="mt-2 font-bold text-gold">{lastAward} {lastAward === 1 ? "نقطة" : "نقاط"} لهذه الجولة · كل 10 إجابات = نقطة</p><div className="auction-scoreboard"><strong>{teams[0]} <b>{scores[0]}</b></strong><strong>{teams[1]} <b>{scores[1]}</b></strong></div>{round < config.rounds ? <Button className="mt-7" onClick={nextRound}>الجولة التالية</Button> : <Button asChild className="mt-7"><Link to="/games">لعبة جديدة</Link></Button>}</section>;
}

/**
 * Every prompt is deliberately paired with an answer that starts with the
 * letter printed on its hex.  The presenter sees the answer only after
 * opening it, so this is both a rule check and a useful judging reference.
 */
const HUROOF_QUESTIONS: Record<string, { question: string; answer: string }> = {
  "ا": { question: "ما اسم البلد الذي عاصمته عمّان؟", answer: "الأردن" },
  "ب": { question: "ما اسم المدينة الوردية المنحوتة في الصخر جنوب الأردن؟", answer: "البتراء" },
  "ت": { question: "ما اسم الجهاز المستخدم لقياس درجة الحرارة؟", answer: "ترمومتر" },
  "ث": { question: "ما اسم اللباس الطويل الشائع للرجال في دول الخليج؟", answer: "ثوب" },
  "ج": { question: "ما الحيوان المعروف بلقب سفينة الصحراء؟", answer: "جمل" },
  "ح": { question: "ما الحيوان المخطط الشبيه بالحصان؟", answer: "حمار وحشي" },
  "خ": { question: "ما المادة الطبيعية التي يُصنع منها كثير من الأثاث؟", answer: "خشب" },
  "د": { question: "ما العملة الرسمية في الأردن؟", answer: "دينار" },
  "ذ": { question: "ما الحيوان المفترس الذي يعيش في قطعان ويعوي؟", answer: "ذئب" },
  "ر": { question: "ما عاصمة إيطاليا؟", answer: "روما" },
  "ز": { question: "ما الحيوان المعروف برقبة طويلة جداً؟", answer: "زرافة" },
  "س": { question: "ما الأكلة اليابانية الشهيرة المصنوعة من الأرز والسمك؟", answer: "سوشي" },
  "ش": { question: "ما النجم الذي تدور حوله الأرض؟", answer: "شمس" },
  "ص": { question: "ما عاصمة اليمن؟", answer: "صنعاء" },
  "ض": { question: "ما الحيوان الذي يعيش قرب البرك ويقفز؟", answer: "ضفدع" },
  "ط": { question: "ما اسم الخبز الشامي الذي يُخبز في فرن حجري؟", answer: "طابون" },
  "ظ": { question: "ما وصف الشيء الذي يمكن رؤيته بوضوح؟", answer: "ظاهر" },
  "ع": { question: "ما عاصمة الأردن؟", answer: "عمّان" },
  "غ": { question: "ما الحيوان الرشيق صاحب القرون الصغيرة؟", answer: "غزال" },
  "ف": { question: "ما أكبر حيوان بري في العالم؟", answer: "فيل" },
  "ق": { question: "ما اسم المعلم التاريخي الموجود على جبل القلعة في عمّان؟", answer: "قلعة عمّان" },
  "ك": { question: "ما الأداة المستديرة التي تُلعب بها مباراة كرة القدم؟", answer: "كرة" },
  "ل": { question: "ما الفاكهة الصفراء الحامضة؟", answer: "ليمون" },
  "م": { question: "ما المادة الشفافة التي نشربها كل يوم؟", answer: "ماء" },
  "ن": { question: "ما النهر الشهير الذي يمر في مصر؟", answer: "نيل" },
  "ه": { question: "ما البناء الأثري الشهير في الجيزة؟", answer: "هرم" },
  "و": { question: "ما اسم الزهرة التي ترمز للحب؟", answer: "وردة" },
  "ي": { question: "ما الدولة التي تقع فيها مدينة صنعاء؟", answer: "اليمن" },
};
type HuroofSnapshot = { owners: HuroofOwner[]; turn: "A" | "B" };

const HUROOF_SVG_LAYOUTS = {
  4: { width: 398, height: 336 },
  5: { width: 487, height: 413 },
} as const;

function SuppliedHuroofGrid({ size, letters, owners, selected, winningPath, disabled, onChoose }: { size: 4 | 5; letters: string[]; owners: HuroofOwner[]; selected: number | null; winningPath: number[]; disabled: boolean; onChoose: (index: number) => void }) {
  const layout = HUROOF_SVG_LAYOUTS[size];
  const cellWidth = 88;
  const cellHeight = 102;
  const centerFor = (row: number, column: number) => ({ x: 44 + (row % 2 ? 44 : 0) + column * 88.5, y: 53 + row * 77 });
  const hexPoints = (x: number, y: number) => `${x},${y - cellHeight / 2} ${x + cellWidth / 2},${y - 25} ${x + cellWidth / 2},${y + 24} ${x},${y + cellHeight / 2} ${x - cellWidth / 2},${y + 24} ${x - cellWidth / 2},${y - 25}`;
  return <svg className="huroof-supplied-grid" viewBox={`0 0 ${layout.width} ${layout.height}`} role="grid" aria-label={`شبكة حروف ${size} في ${size}`}>
    {letters.map((_, index) => { const { x, y } = centerFor(Math.floor(index / size), index % size); const owner = owners[index]; return <polygon key={`base-${index}`} className={`huroof-svg-cell-bg ${owner ? `team-${owner}` : ""} ${selected === index ? "is-selected" : ""}`} points={hexPoints(x, y)} />; })}
    <image className="huroof-svg-art" href={`/assets/huroof/mask-group-${size}.svg`} width={layout.width} height={layout.height} />
    {letters.map((letter, index) => {
      const { x, y } = centerFor(Math.floor(index / size), index % size);
      const owner = owners[index];
      const locked = Boolean(owner) || disabled;
      return <g key={`${letter}-${index}`} className={`huroof-svg-cell ${owner ? `team-${owner}` : ""} ${selected === index ? "is-selected" : ""} ${winningPath.includes(index) ? "is-winning" : ""}`} role="gridcell" aria-label={`حرف ${letter}`} aria-disabled={locked} tabIndex={locked ? -1 : 0} onClick={() => !locked && onChoose(index)} onKeyDown={(event) => { if (!locked && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onChoose(index); } }}>
        <polygon className="huroof-svg-hit" points={hexPoints(x, y)} />
        <text className="huroof-svg-letter" x={x} y={y + 2} textAnchor="middle" dominantBaseline="middle">{letter}</text>
      </g>;
    })}
  </svg>;
}

function HuroofPlay({ session }: { session: GameSession }) {
  const config = session.huroof ?? { size: 5 as const, rounds: 1, buzzer: false, seed: 0.42 };
  const [letters] = useState(() => createLetterBoard(config.size, config.seed));
  const [owners, setOwners] = useState<HuroofOwner[]>(() => Array(config.size * config.size).fill(null));
  const [turn, setTurn] = useState<"A" | "B">("A"); const [selected, setSelected] = useState<number | null>(null); const [answerOpen, setAnswerOpen] = useState(false);
  const [winningPath, setWinningPath] = useState<number[]>([]); const [history, setHistory] = useState<HuroofSnapshot[]>([]);
  const [boardRestored, setBoardRestored] = useState(false);
  const [teamA, teamB] = session.teams; const winner = winningPath.length ? owners[winningPath[0]] : null;
  const question = selected === null ? null : HUROOF_QUESTIONS[letters[selected]] ?? { question: `اذكر كلمة عربية تبدأ بحرف ${letters[selected]}`, answer: "يقبلها المقدم" };
  const changeTurn = () => setTurn((current) => current === "A" ? "B" : "A");
  function choose(index: number) { if (!owners[index] && !winner) { setSelected(index); setAnswerOpen(false); } }
  function claim(owner: "A" | "B") {
    if (selected === null || winner) return;
    setHistory((current) => [...current, { owners, turn }]);
    const next = owners.map((cell, index) => index === selected ? owner : cell);
    const path = findWinningPath(next, config.size, owner);
    setOwners(next); setWinningPath(path); setSelected(null); setAnswerOpen(false);
    if (!path.length) setTurn(owner === "A" ? "B" : "A");
  }
  function miss() { setSelected(null); setAnswerOpen(false); changeTurn(); }
  function undo() {
    const previous = history.at(-1); if (!previous) return;
    setOwners(previous.owners); setTurn(previous.turn); setHistory((current) => current.slice(0, -1));
    setWinningPath(findWinningPath(previous.owners, config.size, "A").length ? findWinningPath(previous.owners, config.size, "A") : findWinningPath(previous.owners, config.size, "B"));
  }
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(`taqha:huroof:${config.seed}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<{ owners: HuroofOwner[]; turn: "A" | "B"; winningPath: number[]; history: HuroofSnapshot[] }>;
        if (parsed.owners?.length === config.size * config.size) {
          setOwners(parsed.owners); setTurn(parsed.turn ?? "A"); setWinningPath(parsed.winningPath ?? []); setHistory(parsed.history ?? []);
        }
      }
    } catch { /* Local storage is optional. */ }
    setBoardRestored(true);
  }, [config.seed, config.size]);
  useEffect(() => {
    if (!boardRestored) return;
    try { window.localStorage.setItem(`taqha:huroof:${config.seed}`, JSON.stringify({ owners, turn, winningPath, history })); } catch { /* Keep the round playable if storage is unavailable. */ }
  }, [boardRestored, config.seed, history, owners, turn, winningPath]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (selected === null) return;
      if (event.key.toLowerCase() === "a") claim("A");
      if (event.key.toLowerCase() === "l") claim("B");
      if (event.code === "Space") { event.preventDefault(); setAnswerOpen(true); }
    };
    window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected, owners, turn, winningPath]);
  return <section className="huroof-stage mx-auto w-full max-w-none">
    <header className="huroof-topbar"><ScoreHex team="A" name={teamA} score="0" active={turn === "A"} /><div><span>حروف</span><strong>الجولة 1 من {config.rounds}</strong><small>{config.buzzer ? "وضع الجرس" : "وضع المقدم"}</small></div><ScoreHex team="B" name={teamB} score="0" active={turn === "B"} /></header>
    <div className="huroof-board-shell"><i className="huroof-edge huroof-edge-top" aria-label="هدف الأخضر: أعلى اللوحة" /><i className="huroof-edge huroof-edge-bottom" aria-label="هدف الأخضر: أسفل اللوحة" /><i className="huroof-edge huroof-edge-right" aria-label="هدف العنابي: يمين اللوحة" /><i className="huroof-edge huroof-edge-left" aria-label="هدف العنابي: يسار اللوحة" />
      {config.size === 4 || config.size === 5 ? <SuppliedHuroofGrid size={config.size} letters={letters} owners={owners} selected={selected} winningPath={winningPath} disabled={Boolean(winner)} onChoose={choose} /> : <div className={`huroof-new-grid huroof-grid-${config.size}`} style={{ "--huroof-size": config.size, "--huroof-grid-mask": `url("/assets/huroof/mask-group-${config.size}.svg")` } as React.CSSProperties}><i className="huroof-supplied-mask" aria-hidden="true" />{Array.from({ length: config.size }, (_, row) => <div key={row} className={`huroof-new-row ${row % 2 ? "is-offset" : ""}`}>{letters.slice(row * config.size, row * config.size + config.size).map((letter, column) => { const index = row * config.size + column; return <button key={`${letter}-${index}`} aria-label={`حرف ${letter}`} className={`huroof-new-hex ${owners[index] ? `team-${owners[index]}` : ""} ${selected === index ? "is-selected" : ""} ${winningPath.includes(index) ? "is-winning" : ""}`} disabled={Boolean(owners[index]) || Boolean(winner)} onClick={() => choose(index)}><span>{letter}</span></button>; })}</div>)}</div>}
    </div>
    {winner ? <div className="huroof-win-panel"><Crown /><h1>فريق {winner === "A" ? teamA : teamB} ربط الطرفين!</h1><p>وصلتوها — انتهت الجولة بمسار متصل.</p><div><Button onClick={() => { setOwners(Array(config.size * config.size).fill(null)); setWinningPath([]); setHistory([]); setTurn("A"); }}>إعادة الجولة</Button><Button variant="outline" asChild><Link to="/games">كل الألعاب</Link></Button></div></div> : selected === null ? <footer className="huroof-actionbar"><span>الدور على <b>{turn === "A" ? teamA : teamB}</b> — اختروا خلية لبدء السؤال</span><Button variant="outline" disabled={!history.length} onClick={undo}>تراجع عن آخر حركة</Button></footer> : <section className="huroof-question-stage"><span>حرف: {letters[selected]}</span><h1>{question.question}</h1>{answerOpen && <p className="huroof-answer">الإجابة: <b>{question.answer}</b></p>}<div className="huroof-question-actions"><Button variant="outline" onClick={() => setAnswerOpen(true)}>إظهار الإجابة</Button><Button onClick={() => claim("A")}>✓ الأخضر صح <small>A</small></Button><Button className="bg-[#7e1f35] hover:bg-[#6d192e]" onClick={() => claim("B")}>✓ العنابي صح <small>L</small></Button><Button variant="outline" onClick={miss}>لا أحد أجاب</Button></div><p>اختصارات: A للأخضر · L للعنابي · Space للإجابة</p></section>}</section>;
}
function ScoreHex({ team, name, score, active }: { team: "A" | "B"; name: string; score: string; active: boolean }) { return <div className={`huroof-score team-${team.toLowerCase()} ${active ? "is-active" : ""}`}><small>{name}</small><strong>{score}</strong></div>; }

function OutsiderPlay({ mode, names: sessionNames }: { mode: PlayMode; names: string[] }) {
  const names = sessionNames.length ? sessionNames : ["ليان", "يزن", "تالا", "حمزة", "نور"]; const [step, setStep] = useState(0); const [revealed, setRevealed] = useState(false); const [phase, setPhase] = useState<"secret" | "describe" | "vote" | "result">("secret"); const [outsider, setOutsider] = useState(0); const [voter, setVoter] = useState(0); const [voteRevealed, setVoteRevealed] = useState(false); const [votes, setVotes] = useState<number[]>([]);
  useEffect(() => { setOutsider(Math.floor(Math.random() * names.length)); }, [names.length]);
  if (phase === "secret") return <section className="outsider-play mx-auto max-w-xl rounded-[2rem] p-7 text-center"><span className="eyebrow">بطاقة سرية · {step + 1} من {names.length}</span><h1 className="mt-4 text-4xl">{names[step]}</h1><div className={`secret-card mt-6 ${revealed ? "is-open" : ""}`}>{revealed ? (step === outsider ? <><Search /><strong>إنت برا السالفة!</strong><p>راقب الوصف وحاول تلتقط الكلمة.</p></> : <><CircleHelp /><small>كلمتكم السرية</small><strong>مطعم</strong></>) : <><Eye /><strong>خد الجهاز لحالك</strong><p>تأكد ما حدا شايف الشاشة قبل ما تكشف بطاقتك.</p></>}</div><Button className="mt-6" onClick={() => revealed ? step === names.length - 1 ? (setStep(0), setPhase("describe")) : (setStep(step + 1), setRevealed(false)) : setRevealed(true)}>{revealed ? step === names.length - 1 ? "اخفوا البطاقات وبلّشوا الوصف" : "اخفِ البطاقة وسلّم الجهاز" : "أنا لحالي · اكشف"}</Button></section>;
  if (phase === "describe") return <section className="outsider-play mx-auto max-w-xl rounded-[2rem] p-7 text-center"><span className="eyebrow">جولة الوصف · {step + 1} من {names.length}</span><h1 className="mt-5 text-4xl">دور {names[step]}</h1><p className="mt-3 text-muted-foreground">احكي كلمة أو جملة قصيرة، بدون ما تقول الكلمة السرية.</p><div className="turn-timer mt-7">00:30</div><Button className="mt-6" onClick={() => step === names.length - 1 ? (setVoter(0), setVoteRevealed(false), setPhase("vote")) : setStep(step + 1)}>خلصت · التالي</Button></section>;
  if (phase === "vote") return <section className="outsider-play mx-auto max-w-xl rounded-[2rem] p-7 text-center"><Vote className="mx-auto h-9 w-9 text-gold"/><span className="eyebrow mt-3">تصويت سري · {voter + 1} من {names.length}</span><h1 className="mt-3 text-4xl">{names[voter]}</h1>{!voteRevealed ? <><p className="mt-3 text-muted-foreground">خد الجهاز لحالك. ما حدا غيرك يشوف اختيارك.</p><Button className="mt-6" onClick={() => setVoteRevealed(true)}>أنا لحالي · افتح التصويت</Button></> : <><p className="mt-3 text-muted-foreground">مين شايفه برا السالفة؟</p><div className="mt-6 grid gap-2">{names.map((name, index) => index === voter ? null : <Button key={name} variant="outline" onClick={() => { const nextVotes = [...votes, index]; setVotes(nextVotes); if (voter === names.length - 1) setPhase("result"); else { setVoter(voter + 1); setVoteRevealed(false); } }}>{name}</Button>)}</div></>}</section>;
  const tally = votes.reduce<Record<number, number>>((result, choice) => ({ ...result, [choice]: (result[choice] ?? 0) + 1 }), {}); const accused = Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1); const caught = accused === outsider;
  return <section className="outsider-result mx-auto max-w-xl rounded-[2rem] p-8 text-center"><Sparkles className="mx-auto h-10 w-10 text-gold"/><p className="eyebrow mt-3">كشف الحقيقة</p><h1 className="mt-2 text-5xl">البرا كان {names[outsider]}</h1><p className="mt-4 text-lg text-muted-foreground">{caught ? "كشفتموها! أغلب القعدة عرفت مين كان يلف ويدور." : `التصويت راح على ${names[accused] ?? "ما حدا"} — البرا نجح يخبّي حاله.`}</p><Button asChild className="mt-7"><Link to="/games">لعبة جديدة</Link></Button></section>;
}

function MafiaPlay({ mode, names: sessionNames }: { mode: PlayMode; names: string[] }) {
  const names = sessionNames.length ? sessionNames : ["ليان", "يزن", "تالا", "حمزة", "نور"];
  const [phase, setPhase] = useState<"role" | "night" | "day" | "vote" | "result">("role"); const [roleStep, setRoleStep] = useState(0); const [roleRevealed, setRoleRevealed] = useState(false); const [voter, setVoter] = useState(0); const [voteRevealed, setVoteRevealed] = useState(false); const [votes, setVotes] = useState<number[]>([]);
  const mafiaCount = Math.max(1, Math.floor(names.length / 4)); const roles = [...Array.from({ length: mafiaCount }, () => "مافيا"), "طبيب", "محقق", ...Array.from({ length: Math.max(0, names.length - mafiaCount - 2) }, () => "مواطن")]; const role = roles[roleStep];
  if (phase === "role") return <section className="mafia-play mx-auto max-w-xl rounded-[2rem] p-8 text-center"><p className="eyebrow">بطاقة سرية {roleStep + 1} من {names.length} · {mode === "online" ? "يفتحها صاحب الجوال فقط" : "سلّم الجهاز لصاحب الدور"}</p><h1 className="mt-3 text-3xl">{names[roleStep]}</h1>{roleRevealed ? <div className="mafia-role-card mt-6"><Skull /><small>دورك الليلة</small><h1>{role}</h1><p>{role === "محقق" ? "اختار لاعب واحد واعرف إذا هو من المافيا." : role === "طبيب" ? "اختار لاعب تحميه من ضربة المافيا." : role === "مافيا" ? "اتفقوا بسرّية على اللاعب المستهدف." : "ناقش بالنهار وصوّت لكشف المافيا."}</p></div> : <div className="secret-card mt-6"><Eye /><strong>خذ الجهاز لحالك</strong><p>تأكد أن القعدة ما بتشوف الشاشة، بعدها اكشف بطاقتك.</p></div>}<Button className="mt-7" onClick={() => !roleRevealed ? setRoleRevealed(true) : roleStep === names.length - 1 ? setPhase("night") : (setRoleStep(roleStep + 1), setRoleRevealed(false))}>{!roleRevealed ? "أنا لحالي · اكشف دوري" : roleStep === names.length - 1 ? "اخفوا البطاقات وبلّشوا الليل" : "اخفِ البطاقة وسلّم الجهاز"}</Button></section>;
  if (phase === "night") return <section className="mafia-play mx-auto max-w-xl rounded-[2rem] p-8 text-center"><span className="eyebrow">مرحلة الليل</span><h1 className="mt-3 text-5xl">المدينة نامت</h1><p className="mt-4 text-muted-foreground">المافيا والطبيب والمحقق ياخدوا قرارهم بسرّية.</p><Button className="mt-8" onClick={() => setPhase("day")}>طلّع النهار</Button></section>;
  if (phase === "day") return <section className="mafia-play mx-auto max-w-xl rounded-[2rem] p-8 text-center"><span className="eyebrow">مرحلة النهار</span><h1 className="mt-3 text-4xl">المدينة صحيت</h1><p className="mt-4 text-muted-foreground">في حدا انقتل الليلة؟ احكوا، حلّلوا، وانتبهوا مين مرتبك.</p><div className="turn-timer mt-7">02:00</div><Button className="mt-7" onClick={() => setPhase("vote")}>افتحوا التصويت</Button></section>;
  if (phase === "vote") return <section className="mafia-play mx-auto max-w-xl rounded-[2rem] p-8 text-center"><Vote className="mx-auto h-9 w-9 text-primary"/><span className="eyebrow mt-3">تصويت سري · {voter + 1} من {names.length}</span><h1 className="mt-3 text-4xl">{names[voter]}</h1>{!voteRevealed ? <><p className="mt-3 text-muted-foreground">خذ الجهاز، واختر بصمت. التصويت ما بيظهر للقعدة.</p><Button className="mt-6" onClick={() => setVoteRevealed(true)}>أنا لحالي · افتح التصويت</Button></> : <div className="mt-6 grid gap-2">{names.map((name, index) => index === voter ? null : <Button key={name} variant="outline" onClick={() => { setVotes([...votes, index]); if (voter === names.length - 1) setPhase("result"); else { setVoter(voter + 1); setVoteRevealed(false); } }}>{name}</Button>)}</div>}</section>;
  const tally = votes.reduce<Record<number, number>>((result, choice) => ({ ...result, [choice]: (result[choice] ?? 0) + 1 }), {}); const eliminated = Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1);
  return <section className="mafia-play mx-auto max-w-xl rounded-[2rem] p-8 text-center"><Crown className="mx-auto h-10 w-10 text-gold"/><p className="eyebrow mt-3">نتيجة التصويت</p><h1 className="mt-3 text-4xl">خرج {names[eliminated] ?? "لا أحد"}</h1><p className="mt-4 text-muted-foreground">اكشفوا دوره الآن وكملوا ليلة جديدة إذا ما انتهت اللعبة.</p><Button asChild className="mt-7"><Link to="/games">لعبة جديدة</Link></Button></section>;
}
