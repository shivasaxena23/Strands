(function () {
  "use strict";

  const puzzle = window.BIRTHDAY_STRANDS_PUZZLE;
  const boardEl = document.getElementById("board");
  const answerListEl = document.getElementById("answer-list");
  const selectionOutputEl = document.getElementById("selection-output");
  const foundCountEl = document.getElementById("found-count");
  const spangramStateEl = document.getElementById("spangram-state");
  const statusEl = document.getElementById("status");
  const winDialog = document.getElementById("win-dialog");
  const confettiCanvas = document.getElementById("confetti");
  const confettiContext = confettiCanvas.getContext("2d");

  const state = {
    selected: [],
    found: new Set(),
    hinted: new Set(),
    dragging: false,
    dragMoved: false
  };

  const cellsByKey = new Map();
  const answerByCell = new Map();

  function keyOf(row, col) {
    return `${row},${col}`;
  }

  function samePoint(a, b) {
    return a[0] === b[0] && a[1] === b[1];
  }

  function reversePath(path) {
    return path.slice().reverse();
  }

  function pathsEqual(a, b) {
    return a.length === b.length && a.every((point, index) => samePoint(point, b[index]));
  }

  function isAdjacent(a, b) {
    const rowDelta = Math.abs(a[0] - b[0]);
    const colDelta = Math.abs(a[1] - b[1]);
    return rowDelta <= 1 && colDelta <= 1 && rowDelta + colDelta > 0;
  }

  function getLettersForPath(path) {
    return path.map(([row, col]) => puzzle.grid[row][col]).join("");
  }

  function getSelectedWord() {
    return state.selected.map(([row, col]) => puzzle.grid[row][col]).join("");
  }

  function normalizeWord(word) {
    return word.replace(/[^a-z]/gi, "").toUpperCase();
  }

  function getDisplayWord(answer) {
    return answer.display || answer.word;
  }

  function validatePuzzle() {
    if (!puzzle || !Array.isArray(puzzle.grid) || !Array.isArray(puzzle.answers)) {
      throw new Error("Missing puzzle data.");
    }

    const cols = puzzle.grid[0].length;
    const invalidRow = puzzle.grid.some((row) => row.length !== cols);

    if (invalidRow) {
      throw new Error("Every puzzle grid row must be the same length.");
    }

    const occupiedCells = new Map();

    puzzle.answers.forEach((answer, answerIndex) => {
      answer.normalizedWord = normalizeWord(answer.word);

      if (getLettersForPath(answer.path) !== answer.normalizedWord) {
        throw new Error(`Answer ${getDisplayWord(answer)} does not match its path in puzzle.js.`);
      }

      answer.path.forEach((point) => {
        const cellKey = keyOf(point[0], point[1]);

        if (occupiedCells.has(cellKey)) {
          throw new Error(`Cell ${cellKey} is used by both ${occupiedCells.get(cellKey)} and ${getDisplayWord(answer)}.`);
        }

        occupiedCells.set(cellKey, getDisplayWord(answer));
        answerByCell.set(cellKey, answerIndex);
      });
    });
  }

  function setHeaderText() {
    document.title = puzzle.title || "Birthday Strands";
    document.getElementById("title").textContent = puzzle.title || "Birthday Strands";
    document.getElementById("recipient").textContent = puzzle.recipient || "For your friend";
    document.getElementById("theme").textContent = puzzle.theme || "Make a wish";
    document.getElementById("win-title").textContent = puzzle.winTitle || "Happy Birthday!";
    document.getElementById("win-message").textContent = puzzle.winMessage || "You found every word.";
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    boardEl.style.setProperty("--rows", puzzle.grid.length);
    boardEl.style.setProperty("--cols", puzzle.grid[0].length);

    puzzle.grid.forEach((rowLetters, row) => {
      rowLetters.split("").forEach((letter, col) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "cell";
        cell.textContent = letter;
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", `Row ${row + 1}, column ${col + 1}, ${letter}`);
        boardEl.append(cell);
        cellsByKey.set(keyOf(row, col), cell);
      });
    });
  }

  function renderAnswers() {
    answerListEl.innerHTML = "";

    puzzle.answers.forEach((answer, index) => {
      const item = document.createElement("li");
      const isFound = state.found.has(index);
      const isSpangram = answer.kind === "spangram";
      item.classList.toggle("is-found", isFound);
      item.classList.toggle("is-spangram", isSpangram);

      const word = document.createElement("span");
      word.className = "answer-word";

      if (isFound) {
        word.textContent = getDisplayWord(answer);
      } else {
        word.className = "answer-slots";
        word.setAttribute("aria-label", `${answer.normalizedWord.length} letters`);

        for (let i = 0; i < answer.normalizedWord.length; i += 1) {
          const slot = document.createElement("span");
          slot.className = "answer-slot";
          word.append(slot);
        }
      }

      const tag = document.createElement("span");
      tag.className = "answer-tag";
      tag.textContent = isSpangram ? "Span" : `${answer.normalizedWord.length}`;

      item.append(word, tag);
      answerListEl.append(item);
    });
  }

  function renderCells() {
    cellsByKey.forEach((cell, key) => {
      const answerIndex = answerByCell.get(key);
      const isFiller = answerIndex === undefined;
      const isFound = state.found.has(answerIndex);
      const isSpangram = isFound && puzzle.answers[answerIndex].kind === "spangram";
      const isSelected = state.selected.some(([row, col]) => keyOf(row, col) === key);
      const isHinted = Array.from(state.hinted).some((hintedIndex) => {
        return puzzle.answers[hintedIndex].path.some(([row, col]) => keyOf(row, col) === key);
      });

      cell.classList.toggle("filler", isFiller);
      cell.classList.toggle("found", isFound && !isSpangram);
      cell.classList.toggle("spangram", isSpangram);
      cell.classList.toggle("selected", isSelected);
      cell.classList.toggle("hinted", isHinted);
      cell.disabled = isFound || isFiller;
    });
  }

  function renderProgress() {
    const foundCount = state.found.size;
    const totalCount = puzzle.answers.length;
    const spangramIndex = puzzle.answers.findIndex((answer) => answer.kind === "spangram");

    foundCountEl.textContent = `${foundCount}/${totalCount}`;
    spangramStateEl.textContent = state.found.has(spangramIndex) ? "Found" : "Hidden";
  }

  function renderSelection() {
    const word = getSelectedWord();
    selectionOutputEl.value = word;
    selectionOutputEl.textContent = word;
  }

  function render() {
    renderCells();
    renderAnswers();
    renderProgress();
    renderSelection();
  }

  function clearSelection(message) {
    state.selected = [];
    renderSelection();
    renderCells();

    if (message !== undefined) {
      statusEl.textContent = message;
    }
  }

  function pointFromCell(cell) {
    return [Number(cell.dataset.row), Number(cell.dataset.col)];
  }

  function isCellFound(point) {
    const answerIndex = answerByCell.get(keyOf(point[0], point[1]));
    return state.found.has(answerIndex);
  }

  function trimSelectionTo(point) {
    const selectedIndex = state.selected.findIndex((selectedPoint) => samePoint(selectedPoint, point));
    state.selected = state.selected.slice(0, selectedIndex + 1);
  }

  function addPoint(point) {
    if (isCellFound(point)) {
      return false;
    }

    const lastPoint = state.selected[state.selected.length - 1];
    const previousPoint = state.selected[state.selected.length - 2];

    if (!lastPoint) {
      state.selected = [point];
      return true;
    }

    if (samePoint(lastPoint, point)) {
      return false;
    }

    if (previousPoint && samePoint(previousPoint, point)) {
      state.selected.pop();
      return true;
    }

    if (state.selected.some((selectedPoint) => samePoint(selectedPoint, point))) {
      trimSelectionTo(point);
      return true;
    }

    if (!isAdjacent(lastPoint, point)) {
      state.selected = [point];
      return true;
    }

    state.selected.push(point);
    return true;
  }

  function handleCellInput(cell) {
    const changed = addPoint(pointFromCell(cell));

    if (changed) {
      statusEl.textContent = "";
      renderSelection();
      renderCells();
    }

    return changed;
  }

  function findSelectedAnswer() {
    const selectedPath = state.selected;
    const selectedWord = getSelectedWord();

    return puzzle.answers.findIndex((answer, index) => {
      if (state.found.has(index)) {
        return false;
      }

      const forwardMatch = selectedWord === answer.normalizedWord && pathsEqual(selectedPath, answer.path);
      const backwardMatch = selectedWord.split("").reverse().join("") === answer.normalizedWord &&
        pathsEqual(selectedPath, reversePath(answer.path));

      return forwardMatch || backwardMatch;
    });
  }

  function submitSelection() {
    if (state.selected.length < 2) {
      clearSelection("");
      return;
    }

    const answerIndex = findSelectedAnswer();

    if (answerIndex === -1) {
      const word = getSelectedWord();
      clearSelection(word.length >= 3 ? `${word} is not on the list.` : "");
      return;
    }

    state.found.add(answerIndex);
    state.hinted.delete(answerIndex);
    clearSelection(`${getDisplayWord(puzzle.answers[answerIndex])} found.`);
    render();

    if (state.found.size === puzzle.answers.length) {
      window.setTimeout(showWin, 250);
    }
  }

  function showHint() {
    const answerIndex = puzzle.answers.findIndex((answer, index) => !state.found.has(index));

    if (answerIndex === -1) {
      statusEl.textContent = "Every word is found.";
      return;
    }

    state.hinted.add(answerIndex);
    statusEl.textContent = puzzle.answers[answerIndex].kind === "spangram" ? "Spangram highlighted." : "A word is highlighted.";
    renderCells();
  }

  function resetGame() {
    state.selected = [];
    state.found.clear();
    state.hinted.clear();
    statusEl.textContent = "";
    render();
  }

  function showWin() {
    startConfetti();

    if (typeof winDialog.showModal === "function") {
      winDialog.showModal();
    }
  }

  function resizeConfettiCanvas() {
    const ratio = window.devicePixelRatio || 1;
    confettiCanvas.width = Math.floor(window.innerWidth * ratio);
    confettiCanvas.height = Math.floor(window.innerHeight * ratio);
    confettiContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function startConfetti() {
    resizeConfettiCanvas();

    const colors = ["#e85d54", "#f7c948", "#3f9b92", "#8a67d0", "#102629"];
    const pieces = Array.from({ length: 130 }, () => ({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.55,
      size: 5 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      speed: 2.2 + Math.random() * 4.4,
      drift: -1.5 + Math.random() * 3,
      rotation: Math.random() * Math.PI,
      spin: -0.14 + Math.random() * 0.28
    }));
    const startedAt = performance.now();

    function draw(now) {
      confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);

      pieces.forEach((piece) => {
        piece.x += piece.drift;
        piece.y += piece.speed;
        piece.rotation += piece.spin;

        confettiContext.save();
        confettiContext.translate(piece.x, piece.y);
        confettiContext.rotate(piece.rotation);
        confettiContext.fillStyle = piece.color;
        confettiContext.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.58);
        confettiContext.restore();
      });

      if (now - startedAt < 4200) {
        requestAnimationFrame(draw);
      } else {
        confettiContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    }

    requestAnimationFrame(draw);
  }

  function bindEvents() {
    boardEl.addEventListener("pointerdown", (event) => {
      const cell = event.target.closest(".cell");

      if (!cell || cell.disabled) {
        return;
      }

      event.preventDefault();
      state.dragging = true;
      state.dragMoved = false;
      boardEl.setPointerCapture(event.pointerId);
      handleCellInput(cell);
    });

    boardEl.addEventListener("pointermove", (event) => {
      if (!state.dragging) {
        return;
      }

      const element = document.elementFromPoint(event.clientX, event.clientY);
      const cell = element ? element.closest(".cell") : null;

      if (!cell || !boardEl.contains(cell) || cell.disabled) {
        return;
      }

      const changed = handleCellInput(cell);
      state.dragMoved = state.dragMoved || changed;
    });

    boardEl.addEventListener("pointerup", (event) => {
      if (!state.dragging) {
        return;
      }

      state.dragging = false;
      boardEl.releasePointerCapture(event.pointerId);

      if (state.dragMoved && state.selected.length > 1) {
        submitSelection();
      }
    });

    boardEl.addEventListener("pointercancel", () => {
      state.dragging = false;
    });

    document.getElementById("submit-selection").addEventListener("click", submitSelection);
    document.getElementById("clear-selection").addEventListener("click", () => clearSelection(""));
    document.getElementById("hint-button").addEventListener("click", showHint);
    document.getElementById("reset-button").addEventListener("click", resetGame);
    window.addEventListener("resize", resizeConfettiCanvas);
  }

  function init() {
    validatePuzzle();
    setHeaderText();
    renderBoard();
    bindEvents();
    render();
  }

  init();
})();
