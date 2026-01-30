import { EngineController, getEngineSpecs, threadsAvailable } from "./engine.js";
import { formatScore, scoreToPercent } from "./uci.js";

const $ = (id) => document.getElementById(id);

const engineName = $("engine-name");
const engineVariant = $("engine-variant");
const engineThreads = $("engine-threads");
const engineHash = $("engine-hash");
const engineNps = $("engine-nps");
const engineWarning = $("engine-warning");
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

const engineSelect = $("engine-select");
const btnEngineLoad = $("btn-engine-load");
const btnAnalyze = $("btn-analyze");
const btnStop = $("btn-stop");
const btnIsReady = $("btn-isready");
const btnUciNew = $("btn-ucinewgame");
const btnRefreshOptions = $("btn-refresh-options");
const btnMaxPerf = $("btn-max-perf");
const btnSendUci = $("btn-send-uci");
const uciInput = $("uci-input");

const btnGoDepth = $("btn-go-depth");
const btnGoTime = $("btn-go-time");
const btnGoNodes = $("btn-go-nodes");
const btnGoMate = $("btn-go-mate");
const depthInput = $("depth-input");
const movetimeInput = $("movetime-input");
const nodesInput = $("nodes-input");
const mateInput = $("mate-input");
const searchmovesInput = $("searchmoves-input");

const engine = new EngineController();
const pvLines = new Map();
let game = typeof Chess !== "undefined" ? new Chess() : null;
let latestInfo = {};
let pendingFrame = false;

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

engine.on("line", (line) => logLine(line));
engine.on("id", ({ type, value }) => {
  if (type === "name") engineName.textContent = value;
});
engine.on("option", () => {
  // no-op; rebuild on uciok
});
engine.on("uciok", () => {
  buildOptions();
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
engine.on("bestmove", (move) => {
  logLine(`bestmove ${move.bestmove}${move.ponder ? ` ponder ${move.ponder}` : ""}`);
});
engine.on("infoString", (text) => {
  logLine(`info string ${text}`);
});
engine.on("error", (err) => {
  engineWarning.textContent = `Engine error: ${err.message || err}`;
});

btnEngineLoad.addEventListener("click", () => {
  const key = engineSelect.value;
  const spec = engine.resolveSpec(key);
  engineVariant.textContent = spec.label;
  engineThreads.textContent = spec.threads ? "auto" : "1";
  engineHash.textContent = "—";
  engine.load(key);
  updateEngineWarning();
});

btnAnalyze.addEventListener("click", () => {
  sendPosition();
  const searchmoves = searchmovesInput.value.trim();
  const suffix = searchmoves ? ` searchmoves ${searchmoves}` : "";
  engine.send(`go infinite${suffix}`);
  logLine("go infinite", "in");
});

btnStop.addEventListener("click", () => {
  engine.send("stop");
  logLine("stop", "in");
});

btnIsReady.addEventListener("click", () => {
  engine.send("isready");
  logLine("isready", "in");
});

btnUciNew.addEventListener("click", () => {
  engine.send("ucinewgame");
  logLine("ucinewgame", "in");
});

btnGoDepth.addEventListener("click", () => {
  sendPosition();
  const depth = Number(depthInput.value) || 18;
  engine.send(`go depth ${depth}`);
  logLine(`go depth ${depth}`, "in");
});

btnGoTime.addEventListener("click", () => {
  sendPosition();
  const time = Number(movetimeInput.value) || 1000;
  engine.send(`go movetime ${time}`);
  logLine(`go movetime ${time}`, "in");
});

btnGoNodes.addEventListener("click", () => {
  sendPosition();
  const nodes = Number(nodesInput.value) || 100000;
  engine.send(`go nodes ${nodes}`);
  logLine(`go nodes ${nodes}`, "in");
});

btnGoMate.addEventListener("click", () => {
  sendPosition();
  const mate = Number(mateInput.value) || 4;
  engine.send(`go mate ${mate}`);
  logLine(`go mate ${mate}`, "in");
});

btnRefreshOptions.addEventListener("click", () => {
  engine.send("uci");
  logLine("uci", "in");
});

btnMaxPerf.addEventListener("click", () => {
  const threads = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
  const hashOpt = engine.options.get("Hash");
  const maxHash = hashOpt?.max ?? 256;
  const hash = Math.min(maxHash, 256);
  if (engine.options.has("Threads")) sendOption("Threads", threads);
  if (engine.options.has("Hash")) sendOption("Hash", hash);
  if (engine.options.has("MultiPV")) sendOption("MultiPV", 3);
  if (engine.options.has("UCI_ShowWDL")) sendOption("UCI_ShowWDL", "true");
  if (engine.options.has("Ponder")) sendOption("Ponder", "false");
  if (engine.options.has("UCI_LimitStrength")) sendOption("UCI_LimitStrength", "false");
  engineWarning.textContent = "Performance profile applied.";
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

function renderBoard() {
  const boardEl = $("board");
  if (!boardEl || !game) return;
  if (boardEl.children.length) return;

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
  for (let rank = 8; rank >= 1; rank -= 1) {
    for (let file = 0; file < files.length; file += 1) {
      const square = `${files[file]}${rank}`;
      const div = document.createElement("div");
      div.className = `square ${((rank + file) % 2 === 0) ? "light" : "dark"}`;
      div.dataset.square = square;
      boardEl.appendChild(div);
    }
  }
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

function syncFenPgn() {
  if (!game) return;
  fenInput.value = game.fen();
  pgnInput.value = game.pgn();
}

function initBoard() {
  renderBoard();
  updateBoardPieces();
  syncFenPgn();
}

initBoard();
updateEngineWarning();
