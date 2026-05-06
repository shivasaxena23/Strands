(function () {
  "use strict";

  const puzzleData = window.BIRTHDAY_STRANDS_PUZZLE;
  const puzzles = Array.isArray(puzzleData.puzzles) ? puzzleData.puzzles : [puzzleData];
  let activePuzzleIndex = 0;
  let puzzle = puzzles[activePuzzleIndex];
  const boardEl = document.getElementById("board");
  const levelTabsEl = document.getElementById("level-tabs");
  const answerListEl = document.getElementById("answer-list");
  const colorModeToggleEl = document.getElementById("color-mode-toggle");
  const selectionOutputEl = document.getElementById("selection-output");
  const foundCountEl = document.getElementById("found-count");
  const spangramStateEl = document.getElementById("spangram-state");
  const statusEl = document.getElementById("status");
  const winDialog = document.getElementById("win-dialog");
  const winActionEl = document.getElementById("win-action");
  const clipDialog = document.getElementById("clip-dialog");
  const clipVideoEl = document.getElementById("clip-video");
  const clipImageEl = document.getElementById("clip-image");
  const confettiCanvas = document.getElementById("confetti");
  const confettiContext = confettiCanvas.getContext("2d");

  const puzzleStates = puzzles.map(createState);
  let state = puzzleStates[activePuzzleIndex];
  let colorModeEnabled = false;
  let clipTimer = null;

  const cellsByKey = new Map();
  const answerByCell = new Map();
  const fallbackColors = [
    "#c2410c", "#2563eb", "#db2777", "#16a34a", "#7c3aed", "#ca8a04",
    "#0891b2", "#be123c", "#4d7c0f", "#9333ea", "#0f766e", "#b45309"
  ];

  function createState() {
    return {
      selected: [],
      found: new Set(),
      hinted: new Set(),
      dragging: false,
      dragMoved: false
    };
  }

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

  function getLettersForPath(path, targetPuzzle = puzzle) {
    return path.map(([row, col]) => targetPuzzle.grid[row][col]).join("");
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

  function getAnswerColor(answer, index) {
    return answer.color || fallbackColors[index % fallbackColors.length];
  }

  function getTextColorForBackground(hex) {
    const normalizedHex = hex.replace("#", "");
    const red = parseInt(normalizedHex.slice(0, 2), 16);
    const green = parseInt(normalizedHex.slice(2, 4), 16);
    const blue = parseInt(normalizedHex.slice(4, 6), 16);
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    return luminance > 0.62 ? "#102629" : "#ffffff";
  }

  function isPuzzleSolved(index) {
    return puzzleStates[index].found.size === puzzles[index].answers.length;
  }

  function isPuzzleUnlocked(index) {
    if (index === 0) {
      return true;
    }

    return puzzles.slice(0, index).every((_, previousIndex) => isPuzzleSolved(previousIndex));
  }

  function getClipConfig() {
    return puzzle.clip || null;
  }

  function getHintClipConfig() {
    return puzzle.hintClip || puzzleData.hintClip || null;
  }

  function isImageClip(clip) {
    return clip.type === "image" || /\.(gif|jpe?g|png|svg|webp)$/i.test(clip.src || "");
  }

  function getClipCells() {
    const clip = getClipConfig();

    if (!clip) {
      return [];
    }

    if (Array.isArray(clip.cells)) {
      return clip.cells.map(([row, col]) => [Number(row), Number(col)]);
    }

    if (clip.row !== undefined && clip.col !== undefined) {
      return [[Number(clip.row), Number(clip.col)]];
    }

    return [];
  }

  function isClipTriggerKey(key) {
    return getClipCells().some(([row, col]) => key === keyOf(row, col));
  }

  function isClipTriggerCell(cell) {
    return isClipTriggerKey(keyOf(Number(cell.dataset.row), Number(cell.dataset.col)));
  }

  function stopClipPlayback() {
    if (clipVideoEl) {
      clipVideoEl.pause();

      try {
        clipVideoEl.currentTime = 0;
      } catch (error) {
        // Some browsers block seeking before metadata is available.
      }
    }

    if (clipImageEl) {
      clipImageEl.removeAttribute("src");
      clipImageEl.alt = "";
    }

    if (clipDialog) {
      clipDialog.classList.remove("is-video", "is-image");
    }
  }

  function closeClipPopup() {
    window.clearTimeout(clipTimer);
    clipTimer = null;
    stopClipPlayback();

    if (!clipDialog) {
      return;
    }

    if (clipDialog.open && typeof clipDialog.close === "function") {
      clipDialog.close();
    } else {
      clipDialog.removeAttribute("open");
    }
  }

  function showMediaPopup(clip, options = {}) {
    if (!clip || !clipDialog) {
      return;
    }

    window.clearTimeout(clipTimer);
    state.dragging = false;
    stopClipPlayback();

    if (options.clearSelection !== false) {
      clearSelection("");
    }

    const showImage = isImageClip(clip);

    if (showImage) {
      if (!clipImageEl) {
        return;
      }

      clipDialog.classList.add("is-image");
      clipImageEl.src = clip.src;
      clipImageEl.alt = clip.alt || clip.label || "Popup image";
    } else {
      if (!clipVideoEl) {
        return;
      }

      clipDialog.classList.add("is-video");

      if (clipVideoEl.getAttribute("src") !== clip.src) {
        clipVideoEl.setAttribute("src", clip.src);
        clipVideoEl.load();
      }

      try {
        clipVideoEl.currentTime = 0;
      } catch (error) {
        // The video will still start from the beginning after load.
      }
    }

    if (!clipDialog.open) {
      if (typeof clipDialog.showModal === "function") {
        clipDialog.showModal();
      } else {
        clipDialog.setAttribute("open", "");
      }
    }

    if (!showImage) {
      const playPromise = clipVideoEl.play();

      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    }

    clipTimer = window.setTimeout(closeClipPopup, Number(clip.durationMs) || 3000);
  }

  function showClipPopup() {
    showMediaPopup(getClipConfig());
  }

  function validatePuzzle(targetPuzzle) {
    if (!targetPuzzle || !Array.isArray(targetPuzzle.grid) || !Array.isArray(targetPuzzle.answers)) {
      throw new Error("Missing puzzle data.");
    }

    const cols = targetPuzzle.grid[0].length;
    const invalidRow = targetPuzzle.grid.some((row) => row.length !== cols);

    if (invalidRow) {
      throw new Error("Every puzzle grid row must be the same length.");
    }

    const occupiedCells = new Map();

    targetPuzzle.answers.forEach((answer) => {
      answer.normalizedWord = normalizeWord(answer.word);

      if (getLettersForPath(answer.path, targetPuzzle) !== answer.normalizedWord) {
        throw new Error(`Answer ${getDisplayWord(answer)} does not match its path in puzzle.js.`);
      }

      answer.path.forEach((point) => {
        const cellKey = keyOf(point[0], point[1]);

        if (occupiedCells.has(cellKey)) {
          throw new Error(`Cell ${cellKey} is used by both ${occupiedCells.get(cellKey)} and ${getDisplayWord(answer)}.`);
        }

        occupiedCells.set(cellKey, getDisplayWord(answer));
      });
    });
  }

  function setHeaderText() {
    document.title = puzzleData.title || "Birthday Strands";
    setText("title", puzzleData.title || "Birthday Strands");
    setText("win-title", puzzleData.winTitle || "Happy Birthday!");
    setText("win-message", puzzleData.winMessage || "You found every word.");
  }

  function setText(id, text) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = text;
    }
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    cellsByKey.clear();
    answerByCell.clear();
    boardEl.style.setProperty("--rows", puzzle.grid.length);
    boardEl.style.setProperty("--cols", puzzle.grid[0].length);

    puzzle.answers.forEach((answer, answerIndex) => {
      answer.path.forEach(([row, col]) => {
        answerByCell.set(keyOf(row, col), answerIndex);
      });
    });

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

  function renderLevelTabs() {
    if (!levelTabsEl || puzzles.length < 2) {
      return;
    }

    levelTabsEl.innerHTML = "";

    puzzles.forEach((levelPuzzle, index) => {
      const levelState = puzzleStates[index];
      const isLocked = !isPuzzleUnlocked(index);
      const button = document.createElement("button");
      const foundCount = levelState.found.size;
      const totalCount = levelPuzzle.answers.length;
      button.type = "button";
      button.className = "level-tab";
      button.classList.toggle("is-active", index === activePuzzleIndex);
      button.classList.toggle("is-locked", isLocked);
      button.disabled = isLocked;
      button.setAttribute("aria-pressed", String(index === activePuzzleIndex));
      button.textContent = isLocked ?
        `${levelPuzzle.label || `Level ${index + 1}`} Locked` :
        `${levelPuzzle.label || `Level ${index + 1}`} ${foundCount}/${totalCount}`;
      button.addEventListener("click", () => switchPuzzle(index));
      levelTabsEl.append(button);
    });
  }

  function switchPuzzle(index) {
    if (index === activePuzzleIndex) {
      return;
    }

    if (!isPuzzleUnlocked(index)) {
      statusEl.textContent = "Finish Level 1 to unlock Level 2.";
      return;
    }

    state.dragging = false;
    activePuzzleIndex = index;
    puzzle = puzzles[activePuzzleIndex];
    state = puzzleStates[activePuzzleIndex];
    state.selected = [];
    statusEl.textContent = "";
    setHeaderText();
    renderBoard();
    render();
  }

  function renderAnswers() {
    answerListEl.innerHTML = "";

    getLevelGroups().forEach((group) => {
      if (group.label) {
        answerListEl.append(createLevelHeading(group));
      }

      group.items.forEach(({ answer, index }) => {
        answerListEl.append(createAnswerItem(answer, index));
      });
    });
  }

  function getLevelGroups() {
    const levelLabels = puzzle.levelLabels || {};
    const groupsByLevel = new Map();

    puzzle.answers.forEach((answer, index) => {
      const level = answer.level || 1;

      if (!groupsByLevel.has(level)) {
        groupsByLevel.set(level, []);
      }

      groupsByLevel.get(level).push({ answer, index });
    });

    return Array.from(groupsByLevel.entries())
      .sort(([levelA], [levelB]) => Number(levelA) - Number(levelB))
      .map(([level, items]) => ({
        level,
        label: levelLabels[level] || (groupsByLevel.size > 1 ? `Level ${level}` : ""),
        items
      }));
  }

  function createLevelHeading(group) {
    const item = document.createElement("li");
    const foundCount = group.items.filter(({ index }) => state.found.has(index)).length;
    item.className = "level-heading";
    item.setAttribute("aria-label", `${group.label}, ${foundCount} of ${group.items.length} found`);

    const label = document.createElement("span");
    label.textContent = group.label;

    const count = document.createElement("strong");
    count.textContent = `${foundCount}/${group.items.length}`;

    item.append(label, count);
    return item;
  }

  function createAnswerItem(answer, index) {
    const item = document.createElement("li");
    const isFound = state.found.has(index);
    const isSpangram = answer.kind === "spangram";
    const answerColor = getAnswerColor(answer, index);
    item.classList.toggle("is-found", isFound);
    item.classList.toggle("is-spangram", isSpangram);
    item.style.setProperty("--answer-color", answerColor);

    const swatch = document.createElement("span");
    swatch.className = "answer-swatch";
    swatch.setAttribute("aria-hidden", "true");

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

    item.append(swatch, word, tag);
    return item;
  }

  function renderCells() {
    cellsByKey.forEach((cell, key) => {
      const answerIndex = answerByCell.get(key);
      const isFiller = answerIndex === undefined;
      const isClipTrigger = isClipTriggerKey(key);
      const answer = isFiller ? null : puzzle.answers[answerIndex];
      const isFound = state.found.has(answerIndex);
      const isSpangram = isFound && answer.kind === "spangram";
      const isSelected = state.selected.some(([row, col]) => keyOf(row, col) === key);
      const isHinted = Array.from(state.hinted).some((hintedIndex) => {
        return puzzle.answers[hintedIndex].path.some(([row, col]) => keyOf(row, col) === key);
      });

      if (answer) {
        const answerColor = getAnswerColor(answer, answerIndex);
        cell.style.setProperty("--answer-color", answerColor);
        cell.style.setProperty("--answer-text-color", getTextColorForBackground(answerColor));
      } else {
        cell.style.removeProperty("--answer-color");
        cell.style.removeProperty("--answer-text-color");
      }

      cell.classList.toggle("found", isFound && !isSpangram);
      cell.classList.toggle("spangram", isSpangram);
      cell.classList.toggle("selected", isSelected);
      cell.classList.toggle("answer-colored", colorModeEnabled && (isSelected || isFound) && !isFiller);
      cell.classList.toggle("hinted", isHinted);
      cell.classList.toggle("clip-trigger", Boolean(isClipTrigger));
      if (isClipTrigger) {
        const rowNumber = Number(cell.dataset.row) + 1;
        const colNumber = Number(cell.dataset.col) + 1;
        const clipLabel = getClipConfig().label || "open birthday popup";
        cell.setAttribute("aria-label", `Row ${rowNumber}, column ${colNumber}, ${cell.textContent}, ${clipLabel}`);
      }
      cell.classList.toggle("filler", isFiller && !isClipTrigger);
      cell.disabled = isFound || (isFiller && !isClipTrigger);
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
    renderLevelTabs();
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
    statusEl.textContent = "";
    showMediaPopup(getHintClipConfig(), { clearSelection: false });
  }

  function resetGame() {
    state.selected = [];
    state.found.clear();
    state.hinted.clear();
    statusEl.textContent = "";
    render();
  }

  function showWin() {
    const allSolved = puzzles.every((_, index) => isPuzzleSolved(index));
    const nextPuzzleIndex = puzzles.findIndex((_, index) => index > activePuzzleIndex && isPuzzleUnlocked(index));
    winDialog.classList.toggle("is-final", allSolved);
    delete winDialog.dataset.nextPuzzleIndex;

    if (allSolved) {
      document.getElementById("win-title").textContent = puzzleData.winTitle || "Happy Birthday!";
      document.getElementById("win-message").textContent = puzzleData.winMessage || "You solved every level.";
      winActionEl.textContent = "Done";
    } else if (nextPuzzleIndex !== -1) {
      document.getElementById("win-title").textContent = "Key Found";
      document.getElementById("win-message").textContent = "Puzzle 2 is unlocked.";
      winActionEl.textContent = "Open Level 2";
      winDialog.dataset.nextPuzzleIndex = String(nextPuzzleIndex);
    } else {
      document.getElementById("win-title").textContent = `${puzzle.label || "Level"} solved`;
      document.getElementById("win-message").textContent = "Move to the next level.";
      winActionEl.textContent = "Done";
    }

    renderLevelTabs();
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
    boardEl.addEventListener("click", (event) => {
      const cell = event.target.closest(".cell");

      if (!cell || !isClipTriggerCell(cell)) {
        return;
      }

      event.preventDefault();
      showClipPopup();
    });

    boardEl.addEventListener("pointerdown", (event) => {
      const cell = event.target.closest(".cell");

      if (!cell || isClipTriggerCell(cell) || cell.disabled) {
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

      if (!cell || !boardEl.contains(cell) || isClipTriggerCell(cell) || cell.disabled) {
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
    winActionEl.addEventListener("click", () => {
      const nextPuzzleIndex = Number(winDialog.dataset.nextPuzzleIndex);

      if (Number.isInteger(nextPuzzleIndex)) {
        window.setTimeout(() => switchPuzzle(nextPuzzleIndex), 0);
      }
    });
    if (clipDialog) {
      clipDialog.addEventListener("close", () => {
        window.clearTimeout(clipTimer);
        clipTimer = null;
        stopClipPlayback();
      });
    }
    if (colorModeToggleEl) {
      colorModeToggleEl.addEventListener("change", () => {
        setColorMode(colorModeToggleEl.checked);
        render();
      });
    }
    window.addEventListener("resize", resizeConfettiCanvas);
  }

  function setColorMode(enabled) {
    colorModeEnabled = enabled;
    document.body.classList.toggle("color-mode", colorModeEnabled);
  }

  function init() {
    puzzles.forEach(validatePuzzle);
    if (colorModeToggleEl) {
      setColorMode(colorModeToggleEl.checked);
    }
    setHeaderText();
    renderBoard();
    bindEvents();
    render();
  }

  init();
})();
