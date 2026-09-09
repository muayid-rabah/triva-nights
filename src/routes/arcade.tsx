import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, CircleHelp, Crown, Eye, Play, Skull, Sparkles, Timer, Vote } from "lucide-react";
import { useEffect, useState } from "react";
import { GameRoomFlow, type PlayMode } from "@/components/game-room-flow";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { arcadeGame, type ArcadeGameSlug } from "@/lib/arcade-catalog";

export const Route = createFileRoute("/arcade")({
  validateSearch: (search: Record<string, unknown>) => ({ game: typeof search.game === "string" ? search.game : "taqha" }),
  component: ArcadePage,
});

type Stage = "room" | "setup" | "play";
type GameSession = { teams: [string, string]; players: string[] };
const EMPTY_SESSION: GameSession = { teams: ["فريق السرو", "فريق الكرمل"], players: [] };

function ArcadePage() {
  const navigate = useNavigate();
  const { game: requestedGame } = Route.useSearch();
  const game = arcadeGame(requestedGame);
  const { user, loading } = useAuth();
  const [stage, setStage] = useState<Stage>("room");
  const [mode, setMode] = useState<PlayMode>("single");
  const [session, setSession] = useState<GameSession>(EMPTY_SESSION);

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
      <main className="heritage-page-shell min-h-[76vh] px-4 py-10 sm:py-14">
        <div className="mx-auto mb-8 flex max-w-6xl items-center justify-between gap-3">
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
  return <MafiaSetup mode={mode} initialPlayers={initialPlayers} onStart={onStart} />;
}

function HuroofSetup({ mode, onStart }: { mode: PlayMode; onStart: (session: GameSession) => void }) {
  const [rounds, setRounds] = useState(1);
  const [cells, setCells] = useState(20);
  const [teamA, setTeamA] = useState("فريق السرو");
  const [teamB, setTeamB] = useState("فريق الكرمل");
  return <section className="arcade-panel arcade-huroof mx-auto max-w-3xl rounded-[2rem] p-6 sm:p-9">
    <span className="eyebrow">حروف · {mode === "online" ? "غرفة جوالات" : "جهاز واحد"}</span><h1 className="mt-3 text-4xl">شبكة سيطرة، مش تكوين كلمات</h1><p className="mt-2 text-muted-foreground">جاوبوا سؤال، اختاروا خلية، ووصلوا خط بلون فريقكم: الأخضر من فوق لتحت والعنابي من اليمين للشمال.</p>
    <div className="mt-7 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold">اسم الفريق الأخضر<Input value={teamA} onChange={(event) => setTeamA(event.target.value)} className="mt-2 h-11 bg-background/45" /></label><label className="block text-sm font-bold">اسم الفريق العنابي<Input value={teamB} onChange={(event) => setTeamB(event.target.value)} className="mt-2 h-11 bg-background/45" /></label></div>
    <div className="mt-6 grid gap-6 sm:grid-cols-2"><SetupChoices title="الجولات للفوز" values={[1, 2, 3]} selected={rounds} onChange={setRounds} /><SetupChoices title="حجم الشبكة" values={[16, 20, 24]} selected={cells} onChange={setCells} /></div>
    <div className="huroof-rules mt-7"><Check className="h-5 w-5" /><p><b>مدير الجلسة</b> بقرأ السؤال للفريق. الجواب الصح بخليه يملك الخلية ويكمل دوره؛ الغلط بمرّر الدور للفريق الثاني.</p></div>
    <Button className="mt-8" onClick={() => onStart({ teams: [teamA.trim() || "فريق السرو", teamB.trim() || "فريق الكرمل"], players: [] })}><Play /> بلّشوا حروف</Button>
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

function GamePlay({ game, mode, session }: { game: ArcadeGameSlug; mode: PlayMode; session: GameSession }) {
  if (game === "huroof") return <HuroofPlay session={session} />;
  if (game === "outsider") return <OutsiderPlay mode={mode} names={session.players} />;
  return <MafiaPlay mode={mode} names={session.players} />;
}

const LETTERS = ["أ", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ر", "س", "ش", "ص", "ض", "ط", "ع", "ف", "ق", "ك", "ل", "م"];
const HUROOF_QUESTIONS: Record<string, string> = {
  "أ": "ما عاصمة الأردن؟", "ب": "ما اسم المدينة الوردية المنحوتة بالصخر؟", "ت": "ما اسم القارة التي تقع فيها الأردن؟", "ث": "كم عدد أشهر السنة؟", "ج": "ما الحيوان المعروف بسفينة الصحراء؟", "ح": "ما العضو الذي يضخ الدم؟", "خ": "ما لون علم الأردن في أعلاه؟", "د": "ما عملة الأردن الرسمية؟", "ر": "ما اسم نهر الأردن الشهير؟", "س": "ما اسم القارة التي تقع فيها فلسطين؟", "ش": "ما الأكلة الفلسطينية المشهورة بالبصل والسماق؟", "ص": "ما عاصمة فلسطين؟", "ض": "ما ضد كلمة طويل؟", "ط": "ما الكوكب المعروف بالكوكب الأحمر؟", "ع": "ما عاصمة الأردن؟", "ف": "ما اسم البحر الذي يحد الأردن غرباً؟", "ق": "ما اسم القلعة الموجودة في عمّان؟", "ك": "كم ضلعاً للمربع؟", "ل": "ما لون ورقة الشجر؟", "م": "ما أكبر حيوان بري؟",
};
type Owner = "A" | "B" | null;
function HuroofPlay({ session }: { session: GameSession }) {
  const [board, setBoard] = useState<Owner[]>(Array(20).fill(null)); const [team, setTeam] = useState<"A" | "B">("A"); const [selected, setSelected] = useState<number | null>(null); const [winner, setWinner] = useState<"A" | "B" | null>(null);
  const [teamA, teamB] = session.teams;
  function choose(index: number) { if (!board[index] && !winner) setSelected(index); }
  function resolve(correct: boolean) {
    if (selected === null) return;
    if (!correct) { setSelected(null); setTeam((current) => current === "A" ? "B" : "A"); return; }
    const next = board.map((owner, index) => index === selected ? team : owner); setBoard(next); setSelected(null);
    if (hasHuroofPath(next, team)) setWinner(team);
  }
  const chosenLetter = selected === null ? null : LETTERS[selected];
  return <section className="huroof-play mx-auto max-w-6xl"><div className="huroof-side"><span>حروف</span><Timer /><strong>الدور على {team === "A" ? teamA : teamB}</strong><ScoreHex team="A" name={teamA} score="من فوق لتحت" active={team === "A"} /><ScoreHex team="B" name={teamB} score="من اليمين للشمال" active={team === "B"} /></div><div className="huroof-board-wrap"><div className="huroof-goal"><i className="team-key team-key-a" /> {teamA} يوصل من فوق لتحت <b>·</b> <i className="team-key team-key-b" /> {teamB} يوصل من اليمين للشمال</div><div className="huroof-board">{Array.from({ length: 4 }, (_, row) => <div key={row} className={`huroof-row ${row % 2 ? "is-offset" : ""}`}>{LETTERS.slice(row * 5, row * 5 + 5).map((letter, column) => { const index = row * 5 + column; return <button key={`${letter}-${index}`} className={`huroof-hex ${board[index] ? `owned-by-${board[index]}` : ""} ${selected === index ? "is-selected" : ""}`} disabled={Boolean(board[index]) || Boolean(winner)} onClick={() => choose(index)}><small>{letter}</small></button>; })}</div>)}</div>{winner ? <div className="huroof-result"><Crown /><h1>{winner === "A" ? teamA : teamB} وصل الخط!</h1><p>طقّيتوها — فازوا بالجولة.</p><Button asChild><Link to="/games">لعبة جديدة</Link></Button></div> : selected !== null ? <div className="huroof-question"><span>سؤال حرف {chosenLetter}</span><strong>{HUROOF_QUESTIONS[chosenLetter!]}</strong><p>مدير الجلسة اسأل الفريق. إذا جاوب صح، ثبّت الخلية بلونه.</p><div><Button onClick={() => resolve(true)}>جاوب صح</Button><Button variant="outline" onClick={() => resolve(false)}>ما زبطت</Button></div></div> : <div className="huroof-word"><span>اختاروا خلية فاضية للفريق اللي عليه الدور.</span></div>}</div></section>;
}
function hasHuroofPath(board: Owner[], owner: "A" | "B") {
  const rows = 4; const cols = 5; const starts = owner === "A" ? Array.from({ length: cols }, (_, col) => col) : Array.from({ length: rows }, (_, row) => row * cols); const seen = new Set<number>(); const queue = starts.filter((index) => board[index] === owner);
  queue.forEach((index) => seen.add(index));
  while (queue.length) { const current = queue.shift()!; const row = Math.floor(current / cols); const col = current % cols; if ((owner === "A" && row === rows - 1) || (owner === "B" && col === cols - 1)) return true; const offsets = row % 2 === 0 ? [[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]] : [[0,-1],[0,1],[-1,0],[-1,1],[1,0],[1,1]]; offsets.forEach(([rowOffset, colOffset]) => { const nextRow = row + rowOffset; const nextCol = col + colOffset; const next = nextRow * cols + nextCol; if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols && board[next] === owner && !seen.has(next)) { seen.add(next); queue.push(next); } }); }
  return false;
}
function ScoreHex({ team, name, score, active }: { team: "A" | "B"; name: string; score: string; active: boolean }) { return <div className={`score-hex team-${team.toLowerCase()} ${active ? "is-active" : ""}`}><small>{name}</small><strong>{score}</strong></div>; }

function OutsiderPlay({ mode, names: sessionNames }: { mode: PlayMode; names: string[] }) {
  const names = sessionNames.length ? sessionNames : ["ليان", "يزن", "تالا", "حمزة", "نور"]; const [step, setStep] = useState(0); const [revealed, setRevealed] = useState(false); const [phase, setPhase] = useState<"secret" | "describe" | "vote" | "result">("secret"); const [outsider, setOutsider] = useState(0); const [voter, setVoter] = useState(0); const [voteRevealed, setVoteRevealed] = useState(false); const [votes, setVotes] = useState<number[]>([]);
  useEffect(() => { setOutsider(Math.floor(Math.random() * names.length)); }, [names.length]);
  if (phase === "secret") return <section className="outsider-play mx-auto max-w-xl rounded-[2rem] p-7 text-center"><span className="eyebrow">بطاقة سرية · {step + 1} من {names.length}</span><h1 className="mt-4 text-4xl">{names[step]}</h1><div className={`secret-card mt-6 ${revealed ? "is-open" : ""}`}>{revealed ? (step === outsider ? <><Search /><strong>إنت برا السالفة!</strong><p>راقب الوصف وحاول تلتقط الكلمة.</p></> : <><CircleHelp /><small>كلمتكم السرية</small><strong>مطعم</strong></>) : <><Eye /><strong>خد الجهاز لحالك</strong><p>تأكد ما حدا شايف الشاشة قبل ما تكشف بطاقتك.</p></>}</div><Button className="mt-6" onClick={() => revealed ? step === names.length - 1 ? (setStep(0), setPhase("describe")) : (setStep(step + 1), setRevealed(false)) : setRevealed(true)}>{revealed ? step === names.length - 1 ? "اخفوا البطاقات وبلّشوا الوصف" : "اخفِ البطاقة وسلّم الجهاز" : "أنا لحالي · اكشف"}</Button></section>;
  if (phase === "describe") return <section className="outsider-play mx-auto max-w-xl rounded-[2rem] p-7 text-center"><span className="eyebrow">جولة الوصف · {step + 1} من {names.length}</span><h1 className="mt-5 text-4xl">دور {names[step]}</h1><p className="mt-3 text-muted-foreground">احكي كلمة أو جملة قصيرة، بدون ما تقول الكلمة السرية.</p><div className="turn-timer mt-7">00:30</div><Button className="mt-6" onClick={() => step === names.length - 1 ? (setVoter(0), setVoteRevealed(false), setPhase("vote")) : setStep(step + 1)}>خلصت · التالي</Button></section>;
  if (phase === "vote") return <section className="outsider-play mx-auto max-w-xl rounded-[2rem] p-7 text-center"><Vote className="mx-auto h-9 w-9 text-gold"/><span className="eyebrow mt-3">تصويت سري · {voter + 1} من {names.length}</span><h1 className="mt-3 text-4xl">{names[voter]}</h1>{!voteRevealed ? <><p className="mt-3 text-muted-foreground">خد الجهاز لحالك. ما حدا غيرك يشوف اختيارك.</p><Button className="mt-6" onClick={() => setVoteRevealed(true)}>أنا لحالي · افتح التصويت</Button></> : <><p className="mt-3 text-muted-foreground">مين شايفه برا السالفة؟</p><div className="mt-6 grid gap-2">{names.map((name, index) => index === voter ? null : <Button key={name} variant="outline" onClick={() => { const nextVotes = [...votes, index]; setVotes(nextVotes); if (voter === names.length - 1) setPhase("result"); else { setVoter(voter + 1); setVoteRevealed(false); } }}>{name}</Button>)}</div></>}</section>;
  const tally = votes.reduce<Record<number, number>>((result, choice) => ({ ...result, [choice]: (result[choice] ?? 0) + 1 }), {}); const accused = Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] ?? -1); const caught = accused === outsider;
  return <section className="outsider-result mx-auto max-w-xl rounded-[2rem] p-8 text-center"><Sparkles className="mx-auto h-10 w-10 text-gold"/><p className="eyebrow mt-3">كشف الحقيقة</p><h1 className="mt-2 text-5xl">البرا كان {names[outsider]}</h1><p className="mt-4 text-lg text-muted-foreground">{caught ? "طقّيتوها! أغلب القعدة عرفت مين كان يلف ويدور." : `التصويت راح على ${names[accused] ?? "ما حدا"} — البرا نجح يخبّي حاله.`}</p><Button asChild className="mt-7"><Link to="/games">لعبة جديدة</Link></Button></section>;
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
