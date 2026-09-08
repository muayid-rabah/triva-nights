import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { GameState, HelpKey } from "./game-types";

const KEY = "seen-game-state-v1";

interface Ctx {
  game: GameState | null;
  ready: boolean;
  startGame: (game: GameState) => void;
  answer: (questionId: string, team: 0 | 1 | null, points: number) => void;
  useHelp: (team: 0 | 1, key: HelpKey) => void;
  setTurn: (team: 0 | 1) => void;
  finish: () => void;
  reset: () => void;
}

const GameContext = createContext<Ctx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameState | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setGame(JSON.parse(raw) as GameState);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      if (game) sessionStorage.setItem(KEY, JSON.stringify(game));
      else sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, [game, ready]);

  const startGame = useCallback((next: GameState) => setGame(next), []);
  const reset = useCallback(() => setGame(null), []);
  const finish = useCallback(
    () => setGame((g) => (g ? { ...g, finished: true } : g)),
    [],
  );
  const setTurn = useCallback(
    (team: 0 | 1) => setGame((g) => (g ? { ...g, turn: team } : g)),
    [],
  );

  const answer = useCallback((questionId: string, team: 0 | 1 | null, points: number) => {
    setGame((g) => {
      if (!g) return g;
      const teams = [
        { ...g.teams[0], helps: { ...g.teams[0].helps } },
        { ...g.teams[1], helps: { ...g.teams[1].helps } },
      ] as GameState["teams"];
      if (team !== null) teams[team].score += points;
      const used = g.used.includes(questionId) ? g.used : [...g.used, questionId];
      const nextTurn = (g.turn === 0 ? 1 : 0) as 0 | 1;
      return {
        ...g,
        teams,
        used,
        turn: nextTurn,
        finished: used.length >= g.questions.length,
      };
    });
  }, []);

  const useHelp = useCallback((team: 0 | 1, key: HelpKey) => {
    setGame((g) => {
      if (!g) return g;
      const teams = [
        { ...g.teams[0], helps: { ...g.teams[0].helps } },
        { ...g.teams[1], helps: { ...g.teams[1].helps } },
      ] as GameState["teams"];
      teams[team].helps[key] = false;
      return {
        ...g,
        teams,
        trapArmedBy: key === "trap" ? team : g.trapArmedBy,
      };
    });
  }, []);

  const value = useMemo(
    () => ({ game, ready, startGame, answer, useHelp, setTurn, finish, reset }),
    [game, ready, startGame, answer, useHelp, setTurn, finish, reset],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside GameProvider");
  return ctx;
}
