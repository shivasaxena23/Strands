# Birthday Strands

A small static Strands-style birthday puzzle.

Open `index.html` in a browser to play. No build step is required.

## Customize

Edit `puzzle.js`.

- `title`: shown at the top of the game.
- `recipient`: short dedication line.
- `theme`: the puzzle theme.
- `winTitle` and `winMessage`: shown after every word is found.
- `grid`: the visible letter board.
- `answers`: the hidden words and the board path for each word.

Each answer path is a list of `[row, column]` cells, starting from zero. The letters at those cells must spell the answer exactly.
Do not reuse a cell across two answers.
This puzzle has one disabled filler tile because the exact answer-letter total is one short of a practical rectangle.

For example, this path reads across the first row:

```js
{
  word: "Saying Things",
  kind: "spangram",
  path: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [0, 11]]
}
```

The current puzzle uses only the custom phrase list in `puzzle.js`.
