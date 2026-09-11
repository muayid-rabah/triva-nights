import { createFileRoute, Link } from "@tanstack/react-router";
import { Gavel, Search, Skull, Target, Type } from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { ARCADE_GAMES } from "@/lib/arcade-catalog";

export const Route = createFileRoute("/games")({ component: GamesHubPage });

const GAME_ICONS = { taqha: Target, huroof: Type, outsider: Search, mafia: Skull, auction: Gavel };

function GamesHubPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="heritage-page-shell">
        <section className="mx-auto max-w-6xl px-4 pb-12 pt-16 text-center sm:pt-24">
          <p className="eyebrow">اختاروا لعبتكم لليلة</p>
          <h1 className="mt-4 text-5xl sm:text-6xl">الألعاب</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">من نفس اللمّة، بأجواء مختلفة. اختاروا اللعبة وخلوّها تبلّش.</p>
        </section>

        <section className="mx-auto grid max-w-7xl grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-5 px-4 pb-20">
          {ARCADE_GAMES.map((game) => {
            const Icon = GAME_ICONS[game.slug];
            return (
              <article key={game.slug} className={`arcade-card arcade-${game.accent}`}>
                <div className="arcade-card-icon" aria-hidden="true"><Icon /></div>
                <div className="relative z-10 flex h-full flex-col items-start">
                  <span className="arcade-card-kicker">{game.players}</span>
                  <h2 className="mt-4 text-4xl">{game.name}</h2>
                  <p className="mt-2 text-lg font-bold text-gold">{game.tagline}</p>
                  <p className="mt-3 max-w-xl text-muted-foreground">{game.description}</p>
                  <Button asChild className="mt-7"><Link to="/arcade" search={{ game: game.slug }}>العب الآن</Link></Button>
                </div>
              </article>
            );
          })}
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
