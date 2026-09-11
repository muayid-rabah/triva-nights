export type HuroofOwner = "A" | "B" | null;

export const ARABIC_LETTERS = [
  "ا",
  "ب",
  "ت",
  "ث",
  "ج",
  "ح",
  "خ",
  "د",
  "ذ",
  "ر",
  "ز",
  "س",
  "ش",
  "ص",
  "ض",
  "ط",
  "ظ",
  "ع",
  "غ",
  "ف",
  "ق",
  "ك",
  "ل",
  "م",
  "ن",
  "ه",
  "و",
  "ي",
];

export function getHexNeighbors(index: number, size: number) {
  const row = Math.floor(index / size);
  const col = index % size;
  const offsets =
    row % 2 === 0
      ? [
          [0, -1],
          [0, 1],
          [-1, -1],
          [-1, 0],
          [1, -1],
          [1, 0],
        ]
      : [
          [0, -1],
          [0, 1],
          [-1, 0],
          [-1, 1],
          [1, 0],
          [1, 1],
        ];

  return offsets
    .map(([rowOffset, colOffset]) => [row + rowOffset, col + colOffset] as const)
    .filter(
      ([nextRow, nextCol]) => nextRow >= 0 && nextRow < size && nextCol >= 0 && nextCol < size,
    )
    .map(([nextRow, nextCol]) => nextRow * size + nextCol);
}

/** Returns the exact winning chain, or an empty list when no side is connected. */
export function findWinningPath(
  board: HuroofOwner[],
  size: number,
  owner: Exclude<HuroofOwner, null>,
) {
  const starts =
    owner === "A"
      ? Array.from({ length: size }, (_, col) => col)
      : Array.from({ length: size }, (_, row) => row * size + size - 1);
  const queue = starts.filter((index) => board[index] === owner);
  const previous = new Map<number, number | null>();
  queue.forEach((index) => previous.set(index, null));

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const row = Math.floor(current / size);
    const col = current % size;
    const reached = owner === "A" ? row === size - 1 : col === 0;
    if (reached) {
      const path: number[] = [];
      let step: number | null = current;
      while (step !== null) {
        path.unshift(step);
        step = previous.get(step) ?? null;
      }
      return path;
    }
    getHexNeighbors(current, size).forEach((next) => {
      if (board[next] === owner && !previous.has(next)) {
        previous.set(next, current);
        queue.push(next);
      }
    });
  }
  return [];
}

export function createLetterBoard(size: number, seed = Math.random()) {
  // A deterministic seed makes rematches reproducible when the host wants it.
  let state = Math.floor(seed * 2_147_483_647) || 1;
  const random = () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
  const letters = Array.from(
    { length: size * size },
    (_, index) => ARABIC_LETTERS[index % ARABIC_LETTERS.length],
  );
  for (let index = letters.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [letters[index], letters[swap]] = [letters[swap], letters[index]];
  }
  return letters;
}
