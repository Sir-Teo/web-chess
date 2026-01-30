import { EngineController, threadsAvailable } from "./engine.js";
import { formatScore, scoreToPercent } from "./uci.js";

const $ = (id) => document.getElementById(id);

const engineName = $("engine-name");
const engineVariant = $("engine-variant");
const engineThreads = $("engine-threads");
const engineHash = $("engine-hash");
const engineNps = $("engine-nps");
const engineWarning = $("engine-warning");
const engineBestmove = $("engine-bestmove");
const consoleEl = $("console");
const optionsEl = $("options");
const pvLinesEl = $("pv-lines");

const fenInput = $("fen-input");
const pgnInput = $("pgn-input");
const uciMovesInput = $("uci-moves");

const evalFill = $("eval-fill");
const evalLabel = $("eval-label");
const kpiDepth = $("kpi-depth");
const kpiSelDepth = $("kpi-seldepth");
const kpiNodes = $("kpi-nodes");
const kpiNps = $("kpi-nps");
const kpiTime = $("kpi-time");
const kpiTbHits = $("kpi-tbhits");
const kpiWdl = $("kpi-wdl");

const engineSelect = $("engine-select");
const btnEngineLoad = $("btn-engine-load");
const btnAnalyze = $("btn-analyze");
const btnStop = $("btn-stop");
const btnIsReady = $("btn-isready");
const btnUciNew = $("btn-ucinewgame");
const btnPonderHit = $("btn-ponderhit");
const btnClearHash = $("btn-clear-hash");
const btnRefreshOptions = $("btn-refresh-options");
const btnMaxPerf = $("btn-max-perf");
const btnSendUci = $("btn-send-uci");
const uciInput = $("uci-input");
const btnCopyConsole = $("btn-copy-console");
const btnClearConsole = $("btn-clear-console");

const btnGoDepth = $("btn-go-depth");
const btnGoTime = $("btn-go-time");
const btnGoNodes = $("btn-go-nodes");
const btnGoMate = $("btn-go-mate");
const depthInput = $("depth-input");
const movetimeInput = $("movetime-input");
const nodesInput = $("nodes-input");
const mateInput = $("mate-input");
const searchmovesInput = $("searchmoves-input");
const wtimeInput = $("wtime-input");
const btimeInput = $("btime-input");
const wincInput = $("winc-input");
const bincInput = $("binc-input");
const movestogoInput = $("movestogo-input");
const ponderSelect = $("ponder-select");
const btnGoClock = $("btn-go-clock");

const btnEval = $("btn-eval");
const btnDisplay = $("btn-display");
const btnCompiler = $("btn-compiler");
const btnPerft = $("btn-perft");
const btnFlipEngine = $("btn-flip-engine");
const perftInput = $("perft-input");

const btnNew = $("btn-new");
const btnFlip = $("btn-flip");
const btnUndo = $("btn-undo");
const btnRedo = $("btn-redo");
const btnLoadFen = $("btn-load-fen");
const btnCopyFen = $("btn-copy-fen");
const btnLoadPgn = $("btn-load-pgn");
const btnCopyPgn = $("btn-copy-pgn");
const btnApplyMoves = $("btn-apply-moves");
const btnClearMoves = $("btn-clear-moves");

const engine = new EngineController();
const pvLines = new Map();
const undoStack = [];
const redoStack = [];
let game = typeof Chess !== "undefined" ? new Chess() : null;
let latestInfo = {};
let pendingFrame = false;
let analysisActive = false;
let boardFlipped = false;
let selectedSquare = null;
let legalTargets = new Set();

function logLine(line, kind = "out") {
  const prefix = kind === "in" ? ">>" : "<<";
  const entry = `${prefix} ${line}`;
  const maxLines = 500;
  const lines = consoleEl.textContent.split("\n").filter(Boolean);
  lines.push(entry);
  if (lines.length > maxLines) {
    lines.splice(0, lines.length - maxLines);
  }
  consoleEl.textContent = lines.join("\n");
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function scheduleUI() {
  if (pendingFrame) return;
  pendingFrame = true;
  requestAnimationFrame(() => {
    pendingFrame = false;
    updateKpis();
    updateEvalBar();
    renderPvLines();
  });
}

function updateKpis() {
  kpiDepth.textContent = latestInfo.depth ?? 0;
  kpiSelDepth.textContent = latestInfo.seldepth ?? 0;
  kpiNodes.textContent = latestInfo.nodes ?? 0;
  kpiNps.textContent = latestInfo.nps ?? 0;
  kpiTime.textContent = latestInfo.time ?? 0;
  kpiTbHits.textContent = latestInfo.tbhits ?? 0;
  if (latestInfo.wdl) {
    kpiWdl.textContent = `${latestInfo.wdl.w} / ${latestInfo.wdl.d} / ${latestInfo.wdl.l}`;
  } else {
    kpiWdl.textContent = "—";
  }
  engineNps.textContent = latestInfo.nps ? `${latestInfo.nps.toLocaleString()} nps` : "—";
}

function updateEvalBar() {
  const score = latestInfo.score;
  const label = formatScore(score);
  evalLabel.textContent = label;
  const percent = scoreToPercent(score);
  evalFill.style.height = `${percent}%`;
}

function renderPvLines() {
  pvLinesEl.innerHTML = "";
  const sorted = [...pvLines.values()].sort((a, b) => (a.multipv || 1) - (b.multipv || 1));
  sorted.forEach((line) => {
    const row = document.createElement("div");
    row.className = "pv-line";
    const head = document.createElement("div");
    head.className = "pv-head";
    const scoreText = formatScore(line.score);
    head.innerHTML = `<span>PV ${line.multipv || 1} • Depth ${line.depth ?? "?"}</span><span>${scoreText}</span>`;
    const moves = document.createElement("div");
    moves.className = "pv-moves";
    moves.textContent = line.pv || "";
    row.appendChild(head);
    row.appendChild(moves);
    pvLinesEl.appendChild(row);
  });
}

function buildOptions() {
  optionsEl.innerHTML = "";
  const options = [...engine.options.values()];
  options.sort((a, b) => a.name.localeCompare(b.name));
  options.forEach((opt) => {
    const card = document.createElement("div");
    card.className = "option-card";
    const label = document.createElement("div");
    label.className = "label";
    label.textContent = opt.name;
    card.appendChild(label);

    if (opt.type === "check") {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = opt.default === "true";
      input.addEventListener("change", () => {
        sendOption(opt.name, input.checked ? "true" : "false");
      });
      card.appendChild(input);
    } else if (opt.type === "spin") {
      const input = document.createElement("input");
      input.type = "number";
      if (Number.isFinite(opt.min)) input.min = opt.min;
      if (Number.isFinite(opt.max)) input.max = opt.max;
      input.value = opt.default ?? "";
      input.addEventListener("change", () => {
        sendOption(opt.name, input.value);
      });
      card.appendChild(input);
    } else if (opt.type === "combo") {
      const select = document.createElement("select");
      const values = opt.vars.length ? opt.vars : [opt.default];
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        if (value === opt.default) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        sendOption(opt.name, select.value);
      });
      card.appendChild(select);
    } else if (opt.type === "string") {
      const input = document.createElement("input");
      input.type = "text";
      input.value = opt.default ?? "";
      input.addEventListener("change", () => {
        sendOption(opt.name, input.value || "<empty>");
      });
      card.appendChild(input);
    } else if (opt.type === "button") {
      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = `Run ${opt.name}`;
      button.addEventListener("click", () => {
        sendOption(opt.name, null);
      });
      card.appendChild(button);
    }

    optionsEl.appendChild(card);
  });
}

function sendOption(name, value) {
  if (value === null) {
    engine.send(`setoption name ${name}`);
    return;
  }
  engine.send(`setoption name ${name} value ${value}`);
  if (name === "Threads") engineThreads.textContent = value;
  if (name === "Hash") engineHash.textContent = `${value} MB`;
}

function updateEngineWarning() {
  const usingThreads = engine.supportsThreads;
  if (usingThreads) {
    engineWarning.textContent = "Cross-origin isolation active. Multi-threaded engine unlocked.";
  } else if (threadsAvailable()) {
    engineWarning.textContent = "Threads available, but current engine is single-threaded.";
  } else {
    engineWarning.textContent = "Cross-origin isolation is unavailable. Falling back to single-threaded engines.";
  }
}

function currentFen() {
  if (game) return game.fen();
  return "startpos";
}

function sendPosition() {
  const fen = currentFen();
  if (fen === "startpos") {
    engine.send("position startpos");
  } else {
    engine.send(`position fen ${fen}`);
  }
}

function startAnalysis(mode = "infinite") {
  sendPosition();
  pvLines.clear();
  const searchmoves = searchmovesInput.value.trim();
  const suffix = searchmoves ? ` searchmoves ${searchmoves}` : "";
  engine.send(`go ${mode}${suffix}`);
  logLine(`go ${mode}${suffix}`.trim(), "in");
  analysisActive = mode === "infinite";
}

function stopAnalysis() {
  engine.send("stop");
  logLine("stop", "in");
  analysisActive = false;
}

function applyPerformanceProfile() {
  const threads = Math.max(1, navigator.hardwareConcurrency || 4);
  const hashOpt = engine.options.get("Hash");
  const maxHash = hashOpt?.max ?? 256;
  const deviceGB = navigator.deviceMemory || 4;
  const targetHash = Math.max(128, Math.floor(deviceGB * 1024 * 0.25));
  const hash = Math.min(maxHash, targetHash);
  if (engine.options.has("Threads")) sendOption("Threads", threads);
  if (engine.options.has("Hash")) sendOption("Hash", hash);
  if (engine.options.has("MultiPV")) sendOption("MultiPV", 3);
  if (engine.options.has("UCI_ShowWDL")) sendOption("UCI_ShowWDL", "true");
  if (engine.options.has("Ponder")) sendOption("Ponder", "false");
  if (engine.options.has("UCI_LimitStrength")) sendOption("UCI_LimitStrength", "false");
  if (engine.options.has("Minimum Thinking Time")) sendOption("Minimum Thinking Time", 0);
  if (engine.options.has("Move Overhead")) sendOption("Move Overhead", 0);
  engineWarning.textContent = "Performance profile applied.";
}

engine.on("line", (line) => logLine(line));
engine.on("id", ({ type, value }) => {
  if (type === "name") engineName.textContent = value;
});
engine.on("option", () => {
  // defer rendering until uciok
});
engine.on("uciok", () => {
  buildOptions();
  applyPerformanceProfile();
  engine.send("isready");
});
engine.on("readyok", () => {
  engineWarning.textContent = "Engine ready for commands.";
});
engine.on("info", (info) => {
  latestInfo = { ...latestInfo, ...info };
  if (info.multipv) {
    pvLines.set(info.multipv, { ...pvLines.get(info.multipv), ...info });
  } else {
    pvLines.set(1, { ...pvLines.get(1), ...info, multipv: 1 });
  }
  scheduleUI();
});
engine.on("infoString", () => {
  // console already receives raw output
});
engine.on("bestmove", (move) => {
  engineBestmove.textContent = move.bestmove || "—";
});
engine.on("error", (err) => {
  engineWarning.textContent = `Engine error: ${err.message || err}`;
});

btnEngineLoad.addEventListener("click", () => {
  const key = engineSelect.value;
  engine.load(key);
  const spec = engine.resolveSpec(key);
  engineVariant.textContent = spec.label;
  engineThreads.textContent = spec.threads ? "auto" : "1";
  engineHash.textContent = "—";
  updateEngineWarning();
});

btnAnalyze.addEventListener("click", () => {
  startAnalysis("infinite");
});

btnStop.addEventListener("click", () => {
  stopAnalysis();
});

btnIsReady.addEventListener("click", () => {
  engine.send("isready");
  logLine("isready", "in");
});

btnUciNew.addEventListener("click", () => {
  engine.send("ucinewgame");
  logLine("ucinewgame", "in");
});

btnPonderHit.addEventListener("click", () => {
  engine.send("ponderhit");
  logLine("ponderhit", "in");
});

btnClearHash.addEventListener("click", () => {
  engine.send("setoption name Clear Hash value true");
  logLine("setoption name Clear Hash value true", "in");
});

btnGoDepth.addEventListener("click", () => {
  const depth = Number(depthInput.value) || 18;
  startAnalysis(`depth ${depth}`);
});

btnGoTime.addEventListener("click", () => {
  const time = Number(movetimeInput.value) || 1000;
  startAnalysis(`movetime ${time}`);
});

btnGoNodes.addEventListener("click", () => {
  const nodes = Number(nodesInput.value) || 100000;
  startAnalysis(`nodes ${nodes}`);
});

btnGoMate.addEventListener("click", () => {
  const mate = Number(mateInput.value) || 4;
  startAnalysis(`mate ${mate}`);
});

btnGoClock.addEventListener("click", () => {
  const wtime = Number(wtimeInput.value) || 0;
  const btime = Number(btimeInput.value) || 0;
  const winc = Number(wincInput.value) || 0;
  const binc = Number(bincInput.value) || 0;
  const movestogo = Number(movestogoInput.value) || 0;
  const ponder = ponderSelect.value === "true" ? "ponder" : "";
  const cmdParts = [
    "go",
    `wtime ${wtime}`,
    `btime ${btime}`,
    `winc ${winc}`,
    `binc ${binc}`,
  ];
  if (movestogo > 0) cmdParts.push(`movestogo ${movestogo}`);
  if (ponder) cmdParts.push(ponder);
  startAnalysis(cmdParts.slice(1).join(" "));
});

btnEval.addEventListener("click", () => {
  sendPosition();
  engine.send("eval");
  logLine("eval", "in");
});

btnDisplay.addEventListener("click", () => {
  sendPosition();
  engine.send("d");
  logLine("d", "in");
});

btnCompiler.addEventListener("click", () => {
  engine.send("compiler");
  logLine("compiler", "in");
});

btnPerft.addEventListener("click", () => {
  const depth = Number(perftInput.value) || 4;
  sendPosition();
  engine.send(`go perft ${depth}`);
  logLine(`go perft ${depth}`, "in");
});

btnFlipEngine.addEventListener("click", () => {
  engine.send("flip");
  logLine("flip", "in");
});

btnRefreshOptions.addEventListener("click", () => {
  engine.send("uci");
  logLine("uci", "in");
});

btnMaxPerf.addEventListener("click", () => {
  applyPerformanceProfile();
});

btnSendUci.addEventListener("click", () => {
  const cmd = uciInput.value.trim();
  if (!cmd) return;
  engine.send(cmd);
  logLine(cmd, "in");
  uciInput.value = "";
});

uciInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    btnSendUci.click();
  }
});

btnCopyConsole.addEventListener("click", () => {
  navigator.clipboard.writeText(consoleEl.textContent).catch(() => {});
});

btnClearConsole.addEventListener("click", () => {
  consoleEl.textContent = "";
});

function renderBoardSquares() {
  const boardEl = $("board");
  if (!boardEl || !game) return;
  boardEl.innerHTML = "";

  const files = boardFlipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = boardFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

  ranks.forEach((rank) => {
    files.forEach((file) => {
      const square = `${file}${rank}`;
      const div = document.createElement("div");
      const fileIndex = "abcdefgh".indexOf(file) + 1;
      const light = (rank + fileIndex) % 2 !== 0;
      div.className = `square ${light ? "light" : "dark"}`;
      div.dataset.square = square;
      div.addEventListener("click", () => onSquareClick(square));
      boardEl.appendChild(div);
    });
  });
}

function updateBoardPieces() {
  if (!game) return;
  const board = game.board();
  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const boardEl = $("board");
  if (!boardEl) return;

  boardEl.querySelectorAll(".square").forEach((squareEl) => {
    squareEl.innerHTML = "";
    const square = squareEl.dataset.square;
    const file = files.indexOf(square[0]);
    const rank = 8 - Number(square[1]);
    const piece = board[rank][file];
    if (piece) {
      const img = document.createElement("img");
      img.alt = `${piece.color}${piece.type}`;
      img.src = `assets/pieces/${piece.color}${piece.type.toUpperCase()}.png`;
      squareEl.appendChild(img);
    }
  });
}

function clearHighlights() {
  document.querySelectorAll(".square").forEach((sq) => {
    sq.classList.remove("selected", "legal", "capture");
  });
}

function highlightMoves(moves) {
  clearHighlights();
  if (!moves.length) return;
  const from = moves[0].from;
  const fromEl = document.querySelector(`.square[data-square='${from}']`);
  if (fromEl) fromEl.classList.add("selected");
  legalTargets.clear();

  moves.forEach((move) => {
    legalTargets.add(move.to);
    const targetEl = document.querySelector(`.square[data-square='${move.to}']`);
    if (!targetEl) return;
    if (move.captured) {
      targetEl.classList.add("capture");
    } else {
      targetEl.classList.add("legal");
    }
  });
}

function onSquareClick(square) {
  if (!game) return;
  const moves = game.moves({ square, verbose: true });

  if (selectedSquare && legalTargets.has(square)) {
    const selectedMoves = game.moves({ square: selectedSquare, verbose: true });
    const promotionMove = selectedMoves.find((m) => m.to === square && m.promotion);
    const promotion = promotionMove ? promotionMove.promotion : "q";
    const move = game.move({ from: selectedSquare, to: square, promotion });
    if (move) {
      undoStack.push(move);
      redoStack.length = 0;
      afterPositionChange();
    }
    selectedSquare = null;
    legalTargets.clear();
    clearHighlights();
    return;
  }

  if (moves.length) {
    selectedSquare = square;
    highlightMoves(moves);
  } else {
    selectedSquare = null;
    legalTargets.clear();
    clearHighlights();
  }
}

function syncFenPgn() {
  if (!game) return;
  fenInput.value = game.fen();
  pgnInput.value = game.pgn();
  uciMovesInput.value = game.history({ verbose: true })
    .map((move) => `${move.from}${move.to}${move.promotion || ""}`)
    .join(" ");
}

function afterPositionChange() {
  updateBoardPieces();
  syncFenPgn();
  clearHighlights();
  selectedSquare = null;
  legalTargets.clear();
  if (analysisActive) {
    stopAnalysis();
    setTimeout(() => startAnalysis("infinite"), 30);
  }
}

function loadFen(fen) {
  if (!game) return;
  const ok = game.load(fen);
  if (!ok) {
    engineWarning.textContent = "Invalid FEN.";
    return;
  }
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
}

function loadPgn(pgn) {
  if (!game) return;
  const ok = game.load_pgn(pgn);
  if (!ok) {
    engineWarning.textContent = "Invalid PGN.";
    return;
  }
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
}

btnNew.addEventListener("click", () => {
  if (!game) return;
  game.reset();
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
});

btnFlip.addEventListener("click", () => {
  boardFlipped = !boardFlipped;
  renderBoardSquares();
  updateBoardPieces();
  clearHighlights();
  selectedSquare = null;
  legalTargets.clear();
});

btnUndo.addEventListener("click", () => {
  if (!game) return;
  const move = game.undo();
  if (move) {
    redoStack.push(move);
    afterPositionChange();
  }
});

btnRedo.addEventListener("click", () => {
  if (!game || !redoStack.length) return;
  const move = redoStack.pop();
  if (!move) return;
  game.move(move);
  afterPositionChange();
});

btnLoadFen.addEventListener("click", () => {
  loadFen(fenInput.value.trim());
});

btnCopyFen.addEventListener("click", () => {
  navigator.clipboard.writeText(fenInput.value).catch(() => {});
});

btnLoadPgn.addEventListener("click", () => {
  loadPgn(pgnInput.value.trim());
});

btnCopyPgn.addEventListener("click", () => {
  navigator.clipboard.writeText(pgnInput.value).catch(() => {});
});

btnApplyMoves.addEventListener("click", () => {
  if (!game) return;
  const moves = uciMovesInput.value.trim().split(/\s+/).filter(Boolean);
  game.reset();
  moves.forEach((move) => {
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);
    const promotion = move[4];
    game.move({ from, to, promotion });
  });
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
});

btnClearMoves.addEventListener("click", () => {
  if (!game) return;
  game.reset();
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
});

function initBoard() {
  renderBoardSquares();
  updateBoardPieces();
  syncFenPgn();
}

initBoard();
updateEngineWarning();
engine.load("auto");
engineVariant.textContent = engine.resolveSpec("auto").label;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
