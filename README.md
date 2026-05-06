# Birthday Strands

A small static Strands-style birthday puzzle.

Open `index.html` in a browser to play. No build step is required.

## Customize

Edit `puzzle.js`.

- `title`: shown at the top of the game.
- `recipient`: short dedication line.
- `theme`: the puzzle theme.
- `winTitle` and `winMessage`: shown after every word is found.
- `puzzles`: the separate playable levels.
- each puzzle's `label`, `theme`, `grid`, and `answers`: the visible board and hidden answers for that level.
- each answer can include a `color` hex value used by Color mode and the answer-key images.
- a puzzle can include `clip` with `cells`, `src`, `type`, and `durationMs` to make one or more tiles open a short popup.
- each puzzle's `spangram` answer should connect or run along major grid edges.
- Level 2 stays locked until Level 1 is solved.

Each answer path is a list of `[row, column]` cells, starting from zero. The letters at those cells must spell the answer exactly.
Do not reuse a cell across two answers.
Level 1 has one popup-trigger filler tile. Level 2 has no filler tiles.

For example, this path reads across the first row:

```js
{
  "word": "Atonement",
  "color": "#9f1239",
  "path": [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [1, 7]]
}
```

The current puzzles use only the custom phrase list in `puzzle.js`.
