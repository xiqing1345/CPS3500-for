const ROWS = 6;
const COLS = 7;
const PLAYER = "X";
const AI = "O";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 20000);

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function isCellEmpty(board, row, col) {
  return board[row]?.[col] === null;
}

function applyMove(board, row, col, token) {
  if (!isCellEmpty(board, row, col)) return null;
  const next = cloneBoard(board);
  next[row][col] = token;
  return next;
}

function collectLineLength(board, row, col, dr, dc, token) {
  let count = 1;

  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === token) {
    count += 1;
    r += dr;
    c += dc;
  }

  r = row - dr;
  c = col - dc;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === token) {
    count += 1;
    r -= dr;
    c -= dc;
  }

  return count;
}

function evaluateBoard(board) {
  let score = 0;
  const center = Math.floor(COLS / 2);

  for (let row = 0; row < ROWS; row += 1) {
    if (board[row][center] === AI) score += 4;
    if (board[row][center] === PLAYER) score -= 4;
  }

  const dirs = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1]
  ];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const token = board[row][col];
      if (!token) continue;

      const sign = token === AI ? 1 : -1;
      for (const [dr, dc] of dirs) {
        const len = collectLineLength(board, row, col, dr, dc, token);
        if (len >= 2) score += sign * len * len;
        if (len >= 4) score += sign * (45 + len * 10);
      }
    }
  }

  return score;
}

function scoreMoves(board, validMoves) {
  const scored = [];
  for (const move of validMoves) {
    const next = applyMove(board, move.row, move.col, AI);
    if (!next) continue;
    scored.push({ ...move, score: evaluateBoard(next) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function fallbackMoveByDifficulty(scoredMoves, difficulty) {
  if (!scoredMoves.length) return null;
  if (difficulty === "hard") return scoredMoves[0];

  if (difficulty === "normal") {
    const top = scoredMoves.slice(0, Math.min(4, scoredMoves.length));
    return pickRandom(top);
  }

  const randomChance = Math.random();
  if (randomChance < 0.65) {
    return pickRandom(scoredMoves);
  }
  const lowerHalfStart = Math.floor(scoredMoves.length / 2);
  const pool = scoredMoves.slice(lowerHalfStart);
  return pickRandom(pool.length ? pool : scoredMoves);
}

function candidatePoolByDifficulty(scoredMoves, difficulty) {
  if (!scoredMoves.length) return [];
  if (difficulty === "hard") return scoredMoves.slice(0, Math.min(3, scoredMoves.length));
  if (difficulty === "normal") return scoredMoves.slice(0, Math.min(6, scoredMoves.length));

  const mid = Math.ceil(scoredMoves.length / 2);
  return scoredMoves.slice(0, Math.max(1, mid));
}

function parseJsonObject(text) {
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

function boardToText(board) {
  return board
    .map((row) =>
      row
        .map((cell) => {
          if (cell === "X") return "X";
          if (cell === "O") return "O";
          return ".";
        })
        .join(" ")
    )
    .join("\n");
}

function moveResponse(row, col, thought, fallback = false, reason = "") {
  return {
    move: { row, col },
    thought,
    fallback,
    reason
  };
}

function extractOutputText(responseJson) {
  if (typeof responseJson?.output_text === "string" && responseJson.output_text.trim()) {
    return responseJson.output_text;
  }

  const output = Array.isArray(responseJson?.output) ? responseJson.output : [];
  const chunks = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join("\n").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server missing OPENAI_API_KEY" });
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { model, board, playerHp, aiHp, validMoves, difficulty } = payload;

    if (!Array.isArray(board) || !Array.isArray(validMoves)) {
      return res.status(400).json({ error: "Invalid board payload" });
    }

    const modelToUse = typeof model === "string" && model.trim() ? model.trim() : DEFAULT_MODEL;
    const difficultyText =
      difficulty === "easy" || difficulty === "normal" || difficulty === "hard"
        ? difficulty
        : "normal";

    const scoredMoves = scoreMoves(board, validMoves);
    if (!scoredMoves.length) {
      return res.json(moveResponse(-1, -1, "No legal moves available.", true, "no_moves"));
    }

    if (difficultyText === "easy") {
      const easyMove = fallbackMoveByDifficulty(scoredMoves, "easy");
      return res.json(
        moveResponse(
          easyMove.row,
          easyMove.col,
          "Easy mode selected a high-variance legal move from the heuristic pool.",
          true,
          "easy_policy"
        )
      );
    }

    const candidates = candidatePoolByDifficulty(scoredMoves, difficultyText);
    const candidatesLite = candidates.map((m) => ({ row: m.row, col: m.col, score: m.score }));
    const boardText = boardToText(board);
    const prompt =
      `You are AI O in a 6x7 free-placement connect game. ` +
      `Return JSON only: {"row": number, "col": number}.\n` +
      `Pick one move only from candidate moves.\n` +
      `Difficulty: ${difficultyText}.\n` +
      `Board:\n${boardText}\n\n` +
      `Player HP: ${playerHp}, AI HP: ${aiHp}.\n` +
      `Candidate moves: ${JSON.stringify(candidatesLite)}\n` +
      `For hard mode prefer strongest tactical move.\n` +
      `Also include a short English explanation under key "thought" (max 1 sentence).`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: modelToUse,
        text: {
          format: {
            type: "json_schema",
            name: "ai_move",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                row: { type: "integer" },
                col: { type: "integer" },
                thought: { type: "string" }
              },
              required: ["row", "col", "thought"]
            }
          }
        },
        input: [
          {
            role: "system",
            content:
              "Return valid JSON only with keys row, col, thought. No markdown, no extra text. Never return a move outside candidate moves."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });
    clearTimeout(timeout);

    const json = await response.json();
    if (!response.ok) {
      const fallback = fallbackMoveByDifficulty(scoredMoves, difficultyText);
      return res.json(
        moveResponse(
          fallback.row,
          fallback.col,
          "OpenAI request failed, so the server used the fallback heuristic move.",
          true,
          `openai_http_${response.status}`
        )
      );
    }

    const modelText = extractOutputText(json);
    const parsed = parseJsonObject(modelText || "");
    if (!parsed) {
      const fallback = fallbackMoveByDifficulty(scoredMoves, difficultyText);
      return res.json(
        moveResponse(
          fallback.row,
          fallback.col,
          "Model output was not valid JSON, fallback move selected by server heuristic.",
          true,
          "invalid_json"
        )
      );
    }

    const row = Number(parsed.row);
    const col = Number(parsed.col);
    const thought = typeof parsed.thought === "string" && parsed.thought.trim()
      ? parsed.thought.trim().slice(0, 260)
      : "I selected a legal move from the candidate pool to improve board control.";

    const legal = candidates.some((m) => m.row === row && m.col === col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || !legal) {
      const fallback = fallbackMoveByDifficulty(scoredMoves, difficultyText);
      return res.json(
        moveResponse(
          fallback.row,
          fallback.col,
          "Model returned an illegal move, fallback heuristic move was applied.",
          true,
          "illegal_move"
        )
      );
    }

    return res.json(
      moveResponse(
        row,
        col,
        `${thought} Heuristic rank among candidates influenced the final selection.`
      )
    );
  } catch (error) {
    try {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
      const { board, validMoves, difficulty } = payload;
      if (Array.isArray(board) && Array.isArray(validMoves) && validMoves.length > 0) {
        const scoredMoves = scoreMoves(board, validMoves);
        const level = difficulty === "easy" || difficulty === "normal" || difficulty === "hard" ? difficulty : "normal";
        const fallback = fallbackMoveByDifficulty(scoredMoves, level);
        if (fallback) {
          return res.json(
            moveResponse(
              fallback.row,
              fallback.col,
              "OpenAI failed in this turn, so fallback policy selected a stable legal move.",
              true,
              String(error?.message || error)
            )
          );
        }
      }
    } catch {
      // If fallback resolution fails, return hard error below.
    }

    return res.status(500).json({ error: String(error?.message || error) });
  }
}
