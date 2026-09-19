import { EyeOff, Gavel, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BILLION_AUCTION_PLAYERS, billionPlayerAsset, type BillionAuctionPlayer, type BillionRole } from "@/lib/billion-auction-players";
import "@/billion-auction.css";
import "@/billion-auction-v2.css";

type TeamIndex = 0 | 1;
type Pair = { role: Exclude<BillionRole, "COACH">; publicPlayer: BillionAuctionPlayer; hiddenPlayer: BillionAuctionPlayer };
type MatchEvent = { minute: number; team: TeamIndex; text: string; goal?: boolean };
const FORMATION: Array<Exclude<BillionRole, "COACH">> = ["GK", "DEF", "DEF", "MID", "MID", "ATT", "ATT"];

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function makePairs(pool = "all"): Pair[] {
  const used = new Set<string>();
  return shuffle(FORMATION).map((role) => {
    const allForRole = BILLION_AUCTION_PLAYERS.filter((player) => player.role === role && !used.has(player.id));
    const selectedPool = pool === "all" ? allForRole : allForRole.filter((player) => player.league === pool);
    const [publicPlayer, hiddenPlayer] = shuffle(selectedPool.length >= 2 ? selectedPool : allForRole);
    if (!publicPlayer || !hiddenPlayer) throw new Error(`لا توجد بطاقات كافية لمركز ${role}`);
    used.add(publicPlayer.id); used.add(hiddenPlayer.id);
    return { role, publicPlayer, hiddenPlayer };
  });
}

export function labelRole(role: Exclude<BillionRole, "COACH">) {
  return ({ GK: "حارس", DEF: "دفاع", MID: "وسط", ATT: "هجوم" })[role];
}

export function PlayerCard({ player, hidden = false }: { player?: BillionAuctionPlayer; hidden?: boolean }) {
  if (hidden) return <article className="billion-v2-card is-hidden"><EyeOff /><strong>بطاقة مخفية</strong><small>نفس مركز اللاعب المعروض</small></article>;
  if (!player) return <article className="billion-v2-card is-empty"><strong>+</strong><small>خانة فارغة</small></article>;
  const initials = player.name.split(" ").slice(0, 2).map((part) => part[0]).join("");
  return <article className="billion-v2-card">
    <div className="billion-v2-card-image">{player.asset ? <img src={billionPlayerAsset(player.asset)} alt={`صورة ${player.name}`} /> : <span className="billion-v2-card-placeholder">{initials}</span>}</div>
    <strong>{player.name}</strong><small>{player.position} · {player.rating}</small>
  </article>;
}

export function MiniPitch({ name, budget, squad, side }: { name: string; budget: number; squad: BillionAuctionPlayer[]; side: TeamIndex }) {
  const byRole = (role: Exclude<BillionRole, "COACH">) => squad.filter((player) => player.role === role);
  return <article className={`billion-v2-pitch side-${side}`}>
    <header><div><h2>{name}</h2><span>{squad.length}/7 لاعبين</span></div><strong>{budget}M</strong></header>
    <div className="billion-v2-field">
      {FORMATION.map((role, index) => {
        const position = role === "DEF" ? index - 1 : role === "MID" ? index - 3 : role === "ATT" ? index - 5 : 0;
        const player = byRole(role)[position];
        return <div className={`billion-v2-slot role-${role.toLowerCase()} ${player ? "is-filled" : ""}`} key={`${role}-${index}`}><span>{player?.asset && <img src={billionPlayerAsset(player.asset)} alt="" />}</span><b>{player?.name ?? labelRole(role)}</b></div>;
      })}
    </div>
  </article>;
}

function simulate(teams: [string, string], squads: [BillionAuctionPlayer[], BillionAuctionPlayer[]]) {
  const strength = (squad: BillionAuctionPlayer[]) => squad.reduce((sum, player) => sum + player.rating, 0) / Math.max(squad.length, 1);
  const [aStrength, bStrength] = [strength(squads[0]), strength(squads[1])];
  const advantage = Math.max(-1, Math.min(1, Math.round((aStrength - bStrength) / 7)));
  const score: [number, number] = [Math.max(0, 1 + advantage), Math.max(0, 1 - advantage)];
  if (score[0] === score[1]) score[aStrength >= bStrength ? 0 : 1] += 1;
  const events: MatchEvent[] = [{ minute: 1, team: 0, text: `بداية المباراة بين ${teams[0]} و${teams[1]}.` }];
  const minutes = [14, 31, 57, 76]; let goalIndex = 0;
  ([0, 1] as TeamIndex[]).forEach((team) => {
    const attack = squads[team].filter((player) => player.role === "ATT");
    const midfield = squads[team].filter((player) => player.role === "MID");
    for (let index = 0; index < score[team]; index += 1) {
      const scorer = attack[index % attack.length]; const assister = midfield[index % midfield.length] ?? scorer;
      if (scorer) events.push({ minute: minutes[goalIndex++] ?? 88, team, goal: true, text: `${assister?.name ?? scorer.name} يمرر، و${scorer.name} ينهيها في الشباك!` });
    }
  });
  return { score, events: events.sort((a, b) => a.minute - b.minute) };
}

export function BillionAuctionGame({ teams, budget = 200, pool = "all" }: { teams: [string, string]; budget?: number; pool?: string }) {
  const [pairs] = useState(() => makePairs(pool));
  const [round, setRound] = useState(0);
  const [budgets, setBudgets] = useState<[number, number]>([budget, budget]);
  const [squads, setSquads] = useState<[BillionAuctionPlayer[], BillionAuctionPlayer[]]>([[], []]);
  const [bidder, setBidder] = useState<TeamIndex>(0);
  const [lastBidder, setLastBidder] = useState<TeamIndex | null>(null);
  const [bid, setBid] = useState(0);
  const [customBid, setCustomBid] = useState("");
  const [passes, setPasses] = useState(0);
  const [resolution, setResolution] = useState<{ winner: TeamIndex; loser: TeamIndex; paid: number } | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState("");
  const pair = pairs[round];
  const minimum = pair ? Math.max(1, Math.ceil(pair.publicPlayer.price / 10)) : 0;
  const finished = round >= pairs.length;
  const analysis = useMemo(() => finished ? simulate(teams, squads) : null, [finished, squads, teams]);

  function bidNow(amount: number) {
    if (!pair || resolution || transferring) return;
    if (!Number.isInteger(amount) || amount < minimum || amount <= bid || amount > budgets[bidder]) {
      setError(`اكتب مزايدة صحيحة من ${Math.max(minimum, bid + 1)}M وحتى ${budgets[bidder]}M.`); return;
    }
    setBid(amount); setLastBidder(bidder); setBidder(bidder === 0 ? 1 : 0); setPasses(0); setCustomBid(""); setError("");
  }

  function resolve(winner: TeamIndex, paid: number) {
    if (!pair || resolution || transferring) return;
    const loser = winner === 0 ? 1 : 0;
    setTransferring(true); setError("");
    window.setTimeout(() => {
      setBudgets((current) => winner === 0 ? [current[0] - paid, current[1]] : [current[0], current[1] - paid]);
      setSquads((current) => winner === 0 ? [[...current[0], pair.publicPlayer], [...current[1], pair.hiddenPlayer]] : [[...current[0], pair.hiddenPlayer], [...current[1], pair.publicPlayer]]);
      setResolution({ winner, loser, paid }); setTransferring(false);
    }, 720);
  }

  function pass() {
    if (!pair || resolution || transferring) return;
    if (lastBidder !== null) { resolve(lastBidder, bid); return; }
    if (passes === 0) { setPasses(1); setBidder(bidder === 0 ? 1 : 0); return; }
    resolve((round % 2) as TeamIndex, 0);
  }
  function nextRound() {
    setRound((value) => value + 1); setBidder(round % 2 === 0 ? 1 : 0); setLastBidder(null); setBid(0); setPasses(0); setResolution(null); setCustomBid("");
  }

  if (finished && analysis) return <section className="billion-v2-result"><span className="eyebrow">تحليل التشكيلتين</span><h1>{teams[0]} <b>{analysis.score[0]} - {analysis.score[1]}</b> {teams[1]}</h1><div className="billion-v2-pitches"><MiniPitch name={teams[0]} budget={budgets[0]} squad={squads[0]} side={0} /><MiniPitch name={teams[1]} budget={budgets[1]} squad={squads[1]} side={1} /></div><div className="billion-v2-timeline">{analysis.events.map((event) => <p key={`${event.minute}-${event.text}`} className={event.goal ? "is-goal" : ""}><b>{event.minute}'</b> {event.text}</p>)}</div></section>;
  if (!pair) return null;
  const bidControls = <><span className="billion-v2-role">{labelRole(pair.role)}</span><PlayerCard player={pair.publicPlayer} /><div className="billion-v2-hidden-note"><PlayerCard hidden /></div><div className="billion-v2-bid"><strong>{bid || minimum}M</strong><small>{lastBidder === null ? `البداية من ${minimum}M` : `آخر مزايدة من ${teams[lastBidder]}`}</small></div><p>الدور على <b>{teams[bidder]}</b></p><div className="auction-bid-controls"><Button disabled={budgets[bidder] < Math.max(minimum, bid + 5)} onClick={() => bidNow(Math.max(minimum, bid + 5))}><Gavel /> +٥M</Button><Button disabled={budgets[bidder] < Math.max(minimum, bid + 10)} onClick={() => bidNow(Math.max(minimum, bid + 10))}>+١٠M</Button><Input type="number" min={Math.max(minimum, bid + 1)} max={budgets[bidder]} value={customBid} onChange={(event) => setCustomBid(event.target.value)} placeholder="اكتب مزايدتك" /><Button variant="outline" onClick={() => bidNow(Number(customBid))}>زايد</Button><Button variant="outline" onClick={pass}>أمرّر</Button></div>{error && <p className="billion-v2-error">{error}</p>}</>;
  return <section className="billion-v2-game"><header className="billion-v2-title"><span className="eyebrow">مزاد المليار · الجولة {round + 1}/7 · مركز {labelRole(pair.role)}</span><p>البطاقة المخفية لن تظهر إلا بعد انتهاء المزايدة، وهي من نفس المركز دائماً.</p></header><div className="billion-v2-layout"><MiniPitch name={teams[0]} budget={budgets[0]} squad={squads[0]} side={0} /><div className="billion-v2-desk">{transferring ? <div className="billion-v2-transfer" aria-live="polite"><Gavel /><strong>تمت الصفقة</strong><span>تنتقل البطاقات إلى الملعب…</span></div> : resolution ? <><div className="billion-v2-reveal"><div><PlayerCard player={pair.publicPlayer} /><small>{teams[resolution.winner]} دفع {resolution.paid}M</small></div><div><PlayerCard player={pair.hiddenPlayer} /><small>{teams[resolution.loser]} أخذها مجاناً</small></div></div><Button onClick={nextRound}>{round === 6 ? "حلّل المباراة" : "الجولة التالية"} <Play /></Button></> : bidControls}</div><MiniPitch name={teams[1]} budget={budgets[1]} squad={squads[1]} side={1} /></div></section>;
}
