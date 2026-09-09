import { Copy, Monitor, QrCode, Smartphone, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { ArcadeGame } from "@/lib/arcade-catalog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type PlayMode = "single" | "online";

function roomCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

export function GameRoomFlow({ game, onStart }: { game: ArcadeGame; onStart: (mode: PlayMode, players?: string[]) => void }) {
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [joined, setJoined] = useState(["صاحب الغرفة"]);
  const [playerName, setPlayerName] = useState("");
  // Random values must be created after hydration, otherwise server and
  // client output disagree before the room is even opened.
  const [code, setCode] = useState("");
  useEffect(() => { setCode(roomCode()); }, []);

  if (mode === "online") {
    const canStart = joined.length >= (game.slug === "taqha" || game.slug === "huroof" ? 2 : 5);
    return (
      <section className={`arcade-skin arcade-${game.accent} mx-auto max-w-3xl rounded-[2rem] border p-6 text-center sm:p-9`}>
        <span className="inline-flex items-center gap-2 rounded-full border border-current/30 px-4 py-2 text-sm font-bold"><UsersRound className="h-4 w-4" /> غرفة {game.name}</span>
        <h1 className="mt-5 text-3xl">لمّتكم جاهزة؟</h1>
        <p className="mt-2 text-muted-foreground">ابعثوا الرمز للشباب، وكل واحد بيدخل من جواله.</p>
        <div className="mx-auto mt-6 grid max-w-xl gap-4 rounded-3xl border border-gold/40 bg-background/45 p-5 sm:grid-cols-[1fr_auto] sm:text-start">
          <div><p className="text-sm text-muted-foreground">رمز الغرفة</p><strong className="room-code">{code}</strong></div>
          <div className="qr-mark mx-auto grid h-24 w-24 place-items-center rounded-xl"><QrCode className="h-14 w-14" /></div>
        </div>
        <Button variant="outline" className="mt-4" onClick={() => { navigator.clipboard?.writeText(code); toast.success("انسخ الرمز وابعتوه للقعدة."); }}><Copy className="h-4 w-4" /> انسخ الرمز</Button>
        <div className="mx-auto mt-7 max-w-xl rounded-2xl bg-background/45 p-4 text-start">
          <p className="font-bold">اللي وصلوا ({joined.length})</p>
          <div className="mt-3 flex flex-wrap gap-2">{joined.map((name, index) => <span key={`${name}-${index}`} title={name} className="player-chip">{name.slice(0, 1)}</span>)}</div>
          <div className="mt-4 flex gap-2"><Input value={playerName} onChange={(event) => setPlayerName(event.target.value)} className="h-9 bg-background/50" placeholder="اسم اللاعب اللي وصل" maxLength={24} /><Button variant="outline" size="sm" onClick={() => { const clean = playerName.trim(); if (!clean) return; setJoined((names) => [...names, clean]); setPlayerName(""); }}>أضف الاسم</Button></div>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">يبدأ صاحب الغرفة بعد اكتمال {game.slug === "taqha" || game.slug === "huroof" ? "لاعبين" : "٥ لاعبين"} على الأقل.</p>
        <Button className="mt-5 min-w-52" disabled={!canStart} onClick={() => onStart("online", joined)}>ابدأ اللعبة</Button>
      </section>
    );
  }

  return (
    <section className={`arcade-skin arcade-${game.accent} mx-auto max-w-4xl rounded-[2rem] border p-6 sm:p-9`}>
      <p className="text-center text-sm font-bold text-gold">{game.tagline}</p>
      <h1 className="mt-2 text-center text-4xl">كيف بدكم تلعبوا؟</h1>
      <p className="mt-3 text-center text-muted-foreground">اختاروا الطريقة اللي تناسب لمّتكم، وبنكمل الإعدادات بعدها.</p>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <button className="play-mode-card text-start" onClick={() => onStart("single")}>
          <span className="mode-icon"><Monitor /></span><h2>جهاز واحد</h2><p>الكل حوالين نفس الشاشة؛ سريعة ومناسبة للقعدة.</p>
          <strong>نبلّش على هالجهاز ←</strong>
        </button>
        <button className="play-mode-card text-start" onClick={() => setMode("online")}>
          <span className="mode-icon"><Smartphone /></span><h2>كل واحد بجواله</h2><p>افتحوا غرفة برمز قصير، وكل لاعب بدخل من جهازه.</p>
          <strong>أنشئ غرفة ←</strong>
        </button>
      </div>
      <div className="mt-7 flex items-center gap-3 rounded-2xl border border-gold/25 bg-background/35 px-4 py-3 text-sm text-muted-foreground"><Input className="h-9 bg-background/50" placeholder="معك رمز غرفة؟" /><Button variant="outline" size="sm">انضم</Button></div>
    </section>
  );
}
