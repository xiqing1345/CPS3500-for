const ROWS = 6;
const COLS = 7;
const MAX_HP = 100;
const PLAYER = "X";
const AI = "O";

const boardEl = document.getElementById("board");
const dropZoneEl = document.getElementById("dropZone");
const aiEngineEl = document.getElementById("aiEngine");
const difficultyEl = document.getElementById("difficulty");
const modelInputEl = document.getElementById("modelInput");
const undoBtn = document.getElementById("undoBtn");
const restartBtn = document.getElementById("restartBtn");
const statusTextEl = document.getElementById("statusText");
const lastDamageTextEl = document.getElementById("lastDamageText");
const playerHpBarEl = document.getElementById("playerHpBar");
const aiHpBarEl = document.getElementById("aiHpBar");
const playerHpTextEl = document.getElementById("playerHpText");
const aiHpTextEl = document.getElementById("aiHpText");
const thoughtLogEl = document.getElementById("thoughtLog");

const STORAGE_KEY_MODEL = "c4hp_openai_model";

let board = createBoard();
let playerHp = MAX_HP;
let aiHp = MAX_HP;
let currentTurn = PLAYER;
let gameOver = false;
let isThinking = false;
let turnHistory = [];
let aiThoughts = [];

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function resetRound() {
  board = createBoard();
}

function restartGame() {
  playerHp = MAX_HP;
  aiHp = MAX_HP;
  currentTurn = PLAYER;
  gameOver = false;
  isThinking = false;
  resetRound();
  turnHistory = [];
  aiThoughts = [];
  saveTurnSnapshot();
  updateHud();
  statusTextEl.textContent = "Your turn: click any empty cell to place a piece.";
  lastDamageTextEl.textContent = "No damage has been dealt yet.";
  render();
}

function loadModelSetting() {
  const savedModel = localStorage.getItem(STORAGE_KEY_MODEL) || "gpt-4.1-mini";
  modelInputEl.value = savedModel;
}

function saveModelSetting() {
  localStorage.setItem(STORAGE_KEY_MODEL, modelInputEl.value.trim() || "gpt-4.1-mini");
  statusTextEl.textContent = "Model setting saved.";
}

function createSnapshot() {
  return {
    board: cloneBoard(board),
    playerHp,
    aiHp,
    currentTurn,
    gameOver,
    statusText: statusTextEl.textContent,
    lastDamageText: lastDamageTextEl.textContent,
    aiThoughts: aiThoughts.map((item) => ({ ...item }))
  };
}

function saveTurnSnapshot() {
  turnHistory.push(createSnapshot());
}

function restoreSnapshot(snapshot) {
  board = cloneBoard(snapshot.board);
  playerHp = snapshot.playerHp;
  aiHp = snapshot.aiHp;
  currentTurn = snapshot.currentTurn;
  gameOver = snapshot.gameOver;
  isThinking = false;
  statusTextEl.textContent = snapshot.statusText;
  lastDamageTextEl.textContent = snapshot.lastDamageText;
  aiThoughts = snapshot.aiThoughts ? snapshot.aiThoughts.map((item) => ({ ...item })) : [];
  updateHud();
  render();
}

function renderThoughts() {
  if (!thoughtLogEl) return;
  thoughtLogEl.innerHTML = "";

  if (!aiThoughts.length) {
    const empty = document.createElement("p");
    empty.className = "thought-empty";
    empty.textContent = "No AI thoughts yet.";
    thoughtLogEl.appendChild(empty);
    return;
  }

  for (const item of aiThoughts) {
    const card = document.createElement("article");
    card.className = "thought-item";

    const meta = document.createElement("p");
    meta.className = "thought-meta";
    meta.textContent = `Turn ${item.turn} | ${item.engine} | move (${item.row}, ${item.col})`;

    const text = document.createElement("p");
    text.className = "thought-text";
    text.textContent = item.text;

    card.appendChild(meta);
    card.appendChild(text);
    thoughtLogEl.appendChild(card);
  }
}

function pushAiThought(move, text, engine) {
  const turn = aiThoughts.length + 1;
  aiThoughts.push({
    turn,
    row: move.row,
    col: move.col,
    text,
    engine
  });
}

function undoTurn() {
  if (isThinking) {
    statusTextEl.textContent = "AI is thinking. Undo is temporarily disabled.";
    return;
  }

  if (turnHistory.length <= 1) {
    statusTextEl.textContent = "No turn available to undo.";
    return;
  }

  turnHistory.pop();
  const previous = turnHistory[turnHistory.length - 1];
  restoreSnapshot(previous);
  statusTextEl.textContent = "Undo applied: reverted to the previous turn.";
}

function updateHud() {
  const playerPct = Math.max(0, (playerHp / MAX_HP) * 100);
  const aiPct = Math.max(0, (aiHp / MAX_HP) * 100);

  playerHpBarEl.style.width = `${playerPct}%`;
  aiHpBarEl.style.width = `${aiPct}%`;
  playerHpTextEl.textContent = String(Math.max(0, playerHp));
  aiHpTextEl.textContent = String(Math.max(0, aiHp));
}

function render() {
  renderDropInfo();
  renderBoard();
  renderThoughts();
  if (undoBtn) {
    undoBtn.disabled = isThinking || turnHistory.length <= 1;
  }
}

function renderDropInfo() {
  dropZoneEl.textContent = "Free placement mode: both players can place on any empty cell.";
}

function renderBoard() {
  boardEl.innerHTML = "";
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      const slot = board[row][col];
      if (slot === PLAYER) {
        cell.classList.add("red");
      }
      if (slot === AI) {
        cell.classList.add("yellow");
      }
      if (slot) {
        cell.classList.add("occupied");
      }
      boardEl.appendChild(cell);
    }
  }
}

function isCellEmpty(state, row, col) {
  return state[row][col] === null;
}

function isBoardFull(state) {
  return state[0].every((slot) => slot !== null);
}

function cloneBoard(state) {
  return state.map((row) => [...row]);
}

function applyMove(state, row, col, token) {
  if (!isCellEmpty(state, row, col)) {
    return null;
  }
  const next = cloneBoard(state);
  next[row][col] = token;
  return next;
}

function collectLineLength(state, row, col, dr, dc, token) {
  let count = 1;

  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && state[r][c] === token) {
    count += 1;
    r += dr;
    c += dc;
  }

  r = row - dr;
  c = col - dc;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && state[r][c] === token) {
    count += 1;
    r -= dr;
    c -= dc;
  }

  return count;
}

function getAttackLines(state, row, col, token) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  const lines = [];
  for (const [dr, dc] of directions) {
    const length = collectLineLength(state, row, col, dr, dc, token);
    if (length >= 4) {
      lines.push(length);
    }
  }
  return lines;
}

// Returns the coordinates of every cell that belongs to a winning line (≥4) through [row,col].
function collectAttackCells(state, row, col, token) {
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const seen = new Set();

  for (const [dr, dc] of directions) {
    const cells = [[row, col]];

    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && state[r][c] === token) {
      cells.push([r, c]);
      r += dr;
      c += dc;
    }

    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && state[r][c] === token) {
      cells.push([r, c]);
      r -= dr;
      c -= dc;
    }

    if (cells.length >= 4) {
      for (const [cr, cc] of cells) {
        seen.add(`${cr},${cc}`);
      }
    }
  }

  return [...seen].map((key) => {
    const [r, c] = key.split(",").map(Number);
    return [r, c];
  });
}

function computeDamage(lines) {
  if (!lines.length) {
    return 0;
  }

  const baseDamage = lines.reduce((sum, len) => sum + (12 + 8 * (len - 3)), 0);
  const comboBonus = lines.length > 1 ? 1 + 0.2 * (lines.length - 1) : 1;
  return Math.round(baseDamage * comboBonus);
}

function evaluateState(state) {
  let score = 0;

  // Center control is generally strong in Connect Four.
  const center = Math.floor(COLS / 2);
  for (let row = 0; row < ROWS; row += 1) {
    if (state[row][center] === AI) score += 4;
    if (state[row][center] === PLAYER) score -= 4;
  }

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const token = state[row][col];
      if (!token) continue;

      const isAi = token === AI;
      const sign = isAi ? 1 : -1;

      const dirs = [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1]
      ];

      for (const [dr, dc] of dirs) {
        const len = collectLineLength(state, row, col, dr, dc, token);
        if (len >= 2) {
          score += sign * len * len;
        }
        if (len >= 4) {
          score += sign * (45 + len * 10);
        }
      }
    }
  }

  return score;
}

function getValidMoves(state) {
  const valid = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      if (state[row][col] === null) {
        valid.push({ row, col });
      }
    }
  }
  return valid;
}

function getAiMoveLocal() {
  const validMoves = getValidMoves(board);
  if (!validMoves.length) {
    return null;
  }

  const difficulty = difficultyEl.value;

  if (difficulty === "easy") {
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  if (difficulty === "normal") {
    if (Math.random() < 0.35) {
      return validMoves[Math.floor(Math.random() * validMoves.length)];
    }
    return minimax(board, 2, -Infinity, Infinity, true).move;
  }

  return minimax(board, 3, -Infinity, Infinity, true).move;
}

function boardToText(state) {
  return state
    .map((row) =>
      row
        .map((cell) => {
          if (cell === PLAYER) return "X";
          if (cell === AI) return "O";
          return ".";
        })
        .join(" ")
    )
    .join("\n");
}

function safeParseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function getAiMoveFromChatGPT() {
  const validMoves = getValidMoves(board);
  if (!validMoves.length) {
    return null;
  }

  const model = modelInputEl.value.trim() || "gpt-4.1-mini";
  const response = await fetch("/api/ai-move", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      board,
      playerHp,
      aiHp,
      validMoves,
      difficulty: difficultyEl.value
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI HTTP ${response.status}`);
  }

  const data = await response.json();
  const row = Number(data?.move?.row);
  const col = Number(data?.move?.col);

  // Backward compatibility for older server payloads.
  if ((!Number.isInteger(row) || !Number.isInteger(col)) && typeof data?.output_text === "string") {
    const parsed = safeParseJsonObject(data.output_text);
    if (parsed) {
      data.move = { row: Number(parsed.row), col: Number(parsed.col) };
    }
  }

  const finalRow = Number(data?.move?.row);
  const finalCol = Number(data?.move?.col);
  if (!Number.isInteger(finalRow) || !Number.isInteger(finalCol)) {
    throw new Error("ChatGPT move has invalid coordinates");
  }

  const valid = validMoves.some((m) => m.row === finalRow && m.col === finalCol);
  if (!valid) {
    throw new Error("ChatGPT move is not legal");
  }

  const thought = typeof data.thought === "string" && data.thought.trim()
    ? data.thought.trim()
    : "AI selected this move based on tactical candidate evaluation.";

  return { row: finalRow, col: finalCol, thought, engine: data.fallback ? "Server Fallback" : "ChatGPT" };
}

function minimax(state, depth, alpha, beta, maximizingPlayer) {
  const validMoves = getValidMoves(state);
  const terminal = depth === 0 || validMoves.length === 0;

  if (terminal) {
    return { score: evaluateState(state), move: validMoves[0] ?? null };
  }

  if (maximizingPlayer) {
    let bestScore = -Infinity;
    let bestMove = validMoves[0];

    for (const move of validMoves) {
      const next = applyMove(state, move.row, move.col, AI);
      if (!next) continue;
      const result = minimax(next, depth - 1, alpha, beta, false);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMove = move;
      }
      alpha = Math.max(alpha, bestScore);
      if (alpha >= beta) break;
    }

    return { score: bestScore, move: bestMove };
  }

  let bestScore = Infinity;
  let bestMove = validMoves[0];

  for (const move of validMoves) {
    const next = applyMove(state, move.row, move.col, PLAYER);
    if (!next) continue;
    const result = minimax(next, depth - 1, alpha, beta, true);
    if (result.score < bestScore) {
      bestScore = result.score;
      bestMove = move;
    }
    beta = Math.min(beta, bestScore);
    if (alpha >= beta) break;
  }

  return { score: bestScore, move: bestMove };
}

async function getAiMove() {
  if (aiEngineEl.value === "chatgpt") {
    try {
      return await getAiMoveFromChatGPT();
    } catch (error) {
      statusTextEl.textContent = `ChatGPT request failed. Switched to local fallback: ${error.message}`;
      const move = getAiMoveLocal();
      if (!move) return null;
      return {
        ...move,
        thought: "ChatGPT request failed, local algorithm selected a fallback move.",
        engine: "Local Fallback"
      };
    }
  }
  const move = getAiMoveLocal();
  if (!move) return null;
  return {
    ...move,
    thought: "Local minimax policy evaluated this as the strongest practical move.",
    engine: "Local AI"
  };
}

function performMove(row, col, token) {
  if (!isCellEmpty(board, row, col)) return null;

  board[row][col] = token;
  const lines = getAttackLines(board, row, col, token);
  const damage = computeDamage(lines);
  const attackCells = damage > 0 ? collectAttackCells(board, row, col, token) : [];

  return { row, col, lines, damage, attackCells };
}

function checkGameOver() {
  if (playerHp <= 0 || aiHp <= 0) {
    gameOver = true;
    currentTurn = null;
    const playerDown = playerHp <= 0;
    const aiDown = aiHp <= 0;

    if (playerDown && aiDown) {
      statusTextEl.textContent = "Draw: both sides reached 0 HP at the same time.";
    } else if (aiDown) {
      statusTextEl.textContent = "You win! AI HP reached 0.";
    } else {
      statusTextEl.textContent = "You lose! Your HP reached 0.";
    }
    render();
    return true;
  }
  return false;
}

function processCombatResult(token, result) {
  if (!result) return;

  if (result.damage > 0) {
    // Remove all pieces that formed the winning lines.
    for (const [r, c] of result.attackCells) {
      board[r][c] = null;
    }

    if (token === PLAYER) {
      aiHp -= result.damage;
      lastDamageTextEl.textContent = `You dealt ${result.damage} damage (lines: ${result.lines.join("+")}).`;
      statusTextEl.textContent = "Hit confirmed. Matched pieces removed and battle continues.";
    } else {
      playerHp -= result.damage;
      lastDamageTextEl.textContent = `AI dealt ${result.damage} damage (lines: ${result.lines.join("+")}).`;
      statusTextEl.textContent = "AI hit confirmed. Matched pieces removed and battle continues.";
    }

    updateHud();

    if (checkGameOver()) {
      return;
    }
  } else if (isBoardFull(board)) {
    statusTextEl.textContent = "Board is full with no attack this round. Board was reset automatically.";
    lastDamageTextEl.textContent = "Round damage: 0";
    resetRound();
  }
}

function handlePlayerDrop(row, col) {
  if (gameOver || isThinking || currentTurn !== PLAYER) return;

  if (!isCellEmpty(board, row, col)) {
    statusTextEl.textContent = "That cell is occupied. Please choose an empty cell.";
    return;
  }

  const result = performMove(row, col, PLAYER);
  if (!result) return;

  processCombatResult(PLAYER, result);
  if (gameOver) {
    render();
    return;
  }

  currentTurn = AI;
  statusTextEl.textContent = "AI is thinking...";
  render();

  isThinking = true;
  setTimeout(() => {
    handleAiTurn();
  }, 380);
}

async function handleAiTurn() {
  if (gameOver) {
    isThinking = false;
    return;
  }

  const aiMove = await getAiMove();
  if (!aiMove) {
    statusTextEl.textContent = "No legal empty cells left. Board was reset for a new round.";
    resetRound();
    currentTurn = PLAYER;
    isThinking = false;
    render();
    return;
  }

  const result = performMove(aiMove.row, aiMove.col, AI);
  pushAiThought(
    { row: aiMove.row, col: aiMove.col },
    aiMove.thought || "No thought provided.",
    aiMove.engine || "AI"
  );
  processCombatResult(AI, result);

  if (!gameOver) {
    currentTurn = PLAYER;
    if (!result || result.damage === 0) {
      statusTextEl.textContent = "Your turn: choose an empty cell.";
    }
    saveTurnSnapshot();
  }

  isThinking = false;
  render();
}

restartBtn.addEventListener("click", restartGame);
undoBtn.addEventListener("click", undoTurn);
modelInputEl.addEventListener("change", saveModelSetting);
difficultyEl.addEventListener("change", () => {
  if (!gameOver && currentTurn === AI && !isThinking) {
    statusTextEl.textContent = "Difficulty changed. AI will continue with the new setting.";
  }
});

boardEl.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const cell = target.closest(".cell");
  if (!cell || !(cell instanceof HTMLElement)) return;

  const col = Number(cell.dataset.col);
  const row = Number(cell.dataset.row);
  if (Number.isNaN(col) || Number.isNaN(row)) return;

  handlePlayerDrop(row, col);
});

restartGame();
loadModelSetting();
