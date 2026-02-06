import { EngineController, threadsAvailable, preloadEngineAssets } from "./engine.js";
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
const moveListEl = $("move-list");
const evalChart = $("eval-chart");
const winrateChart = $("winrate-chart");
const winrateChartLeft = $("winrate-chart-left");
const btnPvPlay = $("btn-pv-play");
const btnPvPause = $("btn-pv-pause");
const btnPvPrev = $("btn-pv-prev");
const btnPvNext = $("btn-pv-next");
const btnPvStop = $("btn-pv-stop");
const pvSpeedInput = $("pv-speed");
const toggleBest = $("toggle-best");
const toggleLast = $("toggle-last");
const togglePv = $("toggle-pv");
const batchInput = $("batch-input");
const batchList = $("batch-list");
const batchStatus = $("batch-status");
const batchChart = $("batch-chart");
const btnBatchAddCurrent = $("btn-batch-add-current");
const btnBatchRun = $("btn-batch-run");
const btnBatchClear = $("btn-batch-clear");
const btnBatchExport = $("btn-batch-export");
const btnBatchExportCsv = $("btn-batch-export-csv");
const batchDepthInput = $("batch-depth");
const batchMoveTimeInput = $("batch-movetime");

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
const kpiHashfull = $("kpi-hashfull");

const engineSelect = $("engine-select");
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
const btnDownloadReport = $("btn-download-report");
const optionsFilter = $("options-filter");
const btnPlayBest = $("btn-play-best");
const btnAutoPlay = $("btn-auto-play");
const autoMoveTimeInput = $("auto-movetime");
const autoDepthInput = $("auto-depth");
const thInaccuracy = $("th-inaccuracy");
const thMistake = $("th-mistake");
const thBlunder = $("th-blunder");
const thBrilliant = $("th-brilliant");
const btnApplyThresholds = $("btn-apply-thresholds");
const quickThreads = $("quick-threads");
const quickHash = $("quick-hash");
const quickMultiPv = $("quick-multipv");
const quickNnue = $("quick-nnue");
const btnQuickThreads = $("btn-quick-threads");
const btnQuickHash = $("btn-quick-hash");
const btnQuickMultiPv = $("btn-quick-multipv");
const btnQuickNnue = $("btn-quick-nnue");
const btnSkillBoost = $("btn-skill-boost");
const btnSkillLimit = $("btn-skill-limit");
const skillInput = $("skill-input");
const eloInput = $("elo-input");
const btnApplyStrength = $("btn-apply-strength");
const syzygyPath = $("syzygy-path");
const syzygyDepth = $("syzygy-depth");
const syzygy50move = $("syzygy-50move");
const btnApplySyzygy = $("btn-apply-syzygy");
const btnChess960 = $("btn-chess960");
const btnShowWdl = $("btn-show-wdl");

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

const btnMenu = $("btn-menu");
const btnView = $("btn-view");
const btnAnalyzePill = $("btn-analyze-pill");
const btnSettings = $("btn-settings");
const menuView = $("menu-view");
const menuSettings = $("menu-settings");
const menuToggleBest = $("menu-toggle-best");
const menuToggleLast = $("menu-toggle-last");
const menuTogglePv = $("menu-toggle-pv");
const btnPanelPlay = $("btn-panel-play");
const btnPanelAnalysis = $("btn-panel-analysis");
const btnPanelUndo = $("btn-panel-undo");
const btnPanelResign = $("btn-panel-resign");
const btnPanelAi = $("btn-panel-ai");

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
const optionState = new Map();
const textCache = new WeakMap();
const undoStack = [];
const redoStack = [];
let game = null;
let latestInfo = {};
let pendingFrame = false;
let pvRenderVersion = 0;
let pvRenderedVersion = -1;
let evalRenderVersion = 0;
let evalRenderedVersion = -1;
let winrateRenderVersion = 0;
let winrateRenderedVersion = -1;
let moveListDirty = false;
let consoleDirty = false;
let analysisActive = false;
let boardFlipped = false;
let selectedSquare = null;
let legalTargets = new Set();
let lastBestMove = null;
let autoPlay = false;
let awaitingBestMoveApply = false;
let evalHistory = [];
let analysisStart = performance.now();
let moveMeta = [];
let historyVerboseCache = [];
let historyPlyCache = 0;
let batchQueue = [];
let batchResults = [];
let batchRunning = false;
let batchAwaiting = false;
let batchResolver = null;
let batchCurrent = null;
let batchTimeoutId = null;
let thresholds = {
  inaccuracy: 30,
  mistake: 80,
  blunder: 150,
  brilliant: 80,
};
let pvPlaybackTimer = null;
let pvPlaybackMoves = [];
let pvPlaybackIndex = 0;
let overlayState = {
  best: true,
  last: true,
  pv: true,
};
const consoleLines = [];
const pvSanCache = new Map();
const pvNodeMap = new Map();
const ENGINE_RECOVERY_LIMIT = 2;
const BATCH_ANALYSIS_TIMEOUT_MS = 20000;
const EVAL_SAMPLE_INTERVAL_MS = 80;
const MOVE_META_UPDATE_INTERVAL_MS = 220;
let performanceMode = "max";
let engineRecoveryAttempt = 0;
let engineLoadRequest = 0;
let lastEvalSampleTime = Number.NEGATIVE_INFINITY;
let lastEvalSampleDepth = -1;
let lastMoveMetaUpdateTime = Number.NEGATIVE_INFINITY;
let lastMoveMetaDepth = -1;

function resolveBatchAnalysis(patch = {}) {
  if (!batchResolver || !batchCurrent) return false;
  if (batchTimeoutId) {
    clearTimeout(batchTimeoutId);
    batchTimeoutId = null;
  }
  const resolve = batchResolver;
  const result = {
    ...batchCurrent,
    ...patch,
    completed: patch.completed || Date.now(),
  };
  batchAwaiting = false;
  batchCurrent = null;
  batchResolver = null;
  resolve(result);
  return true;
}

function mergeObjectShallow(target, patch) {
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (target[key] !== value) {
      target[key] = value;
      changed = true;
    }
  }
  return changed;
}

function isPrimaryPvInfo(info) {
  return !info.multipv || info.multipv === 1;
}

function infoClockMs(info) {
  if (typeof info.time === "number" && Number.isFinite(info.time)) return info.time;
  return Math.max(0, Math.round(performance.now() - analysisStart));
}

function resetInfoSamplingState() {
  lastEvalSampleTime = Number.NEGATIVE_INFINITY;
  lastEvalSampleDepth = -1;
  lastMoveMetaUpdateTime = Number.NEGATIVE_INFINITY;
  lastMoveMetaDepth = -1;
}

function shouldRecordEvalSample(info) {
  if (!info.score || !isPrimaryPvInfo(info)) return false;
  const time = infoClockMs(info);
  const depth = Number(info.depth) || 0;
  if (depth > lastEvalSampleDepth) {
    lastEvalSampleDepth = depth;
    lastEvalSampleTime = time;
    return true;
  }
  if (time - lastEvalSampleTime >= EVAL_SAMPLE_INTERVAL_MS) {
    lastEvalSampleTime = time;
    lastEvalSampleDepth = Math.max(lastEvalSampleDepth, depth);
    return true;
  }
  return false;
}

function shouldUpdateMoveMeta(info) {
  if (!info.score || !isPrimaryPvInfo(info) || !historyPlyCache) return false;
  const time = infoClockMs(info);
  const depth = Number(info.depth) || 0;
  if (depth > lastMoveMetaDepth) {
    lastMoveMetaDepth = depth;
    lastMoveMetaUpdateTime = time;
    return true;
  }
  if (time - lastMoveMetaUpdateTime >= MOVE_META_UPDATE_INTERVAL_MS) {
    lastMoveMetaUpdateTime = time;
    lastMoveMetaDepth = Math.max(lastMoveMetaDepth, depth);
    return true;
  }
  return false;
}

function refreshHistoryCache() {
  if (!game) {
    historyVerboseCache = [];
    historyPlyCache = 0;
    return;
  }
  historyVerboseCache = game.history({ verbose: true });
  historyPlyCache = historyVerboseCache.length;
}

const isTypingTarget = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
};

const triggerButton = (button) => {
  if (!button || button.disabled) return false;
  button.click();
  return true;
};

const toggleCheckbox = (checkbox) => {
  if (!checkbox) return false;
  checkbox.checked = !checkbox.checked;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
};

const ensureChessReady = () => {
  if (globalThis.Chess) return Promise.resolve(true);
  return new Promise((resolve) => {
    const existing = document.querySelector("script[data-chess-lib]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "vendor/chess.min.js";
    script.dataset.chessLib = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
};

const initGame = () => {
  if (!globalThis.Chess) return false;
  if (!game) game = new globalThis.Chess();
  initBoard();
  return true;
};

const setAnalyzePillState = (active) => {
  if (!btnAnalyzePill) return;
  btnAnalyzePill.classList.toggle("is-active", active);
  btnAnalyzePill.setAttribute("aria-pressed", active ? "true" : "false");
  const label = btnAnalyzePill.querySelector(".label");
  if (label) label.textContent = active ? "Stop" : "Analyze";
};

const setPanelMode = (mode) => {
  if (!btnPanelPlay || !btnPanelAnalysis) return;
  btnPanelPlay.classList.toggle("active", mode === "play");
  btnPanelAnalysis.classList.toggle("active", mode === "analysis");
};

let activeMenuName = "";

const closeHeaderMenus = () => {
  activeMenuName = "";
  const items = [
    [btnView, menuView],
    [btnSettings, menuSettings],
  ];
  items.forEach(([button, menu]) => {
    if (button) {
      button.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
    }
    if (menu) menu.classList.remove("is-open");
  });
};

const openHeaderMenu = (name) => {
  closeHeaderMenus();
  if (name === "view" && btnView && menuView) {
    btnView.classList.add("is-open");
    btnView.setAttribute("aria-expanded", "true");
    menuView.classList.add("is-open");
    activeMenuName = name;
    return;
  }
  if (name === "settings" && btnSettings && menuSettings) {
    btnSettings.classList.add("is-open");
    btnSettings.setAttribute("aria-expanded", "true");
    menuSettings.classList.add("is-open");
    activeMenuName = name;
  }
};

const toggleHeaderMenu = (name) => {
  if (activeMenuName === name) {
    closeHeaderMenus();
    return;
  }
  openHeaderMenu(name);
};

const syncMenuToggle = (menuInput, baseInput) => {
  if (!menuInput || !baseInput) return;
  menuInput.checked = baseInput.checked;
  menuInput.addEventListener("change", () => {
    if (menuInput.checked === baseInput.checked) return;
    baseInput.checked = menuInput.checked;
    baseInput.dispatchEvent(new Event("change", { bubbles: true }));
  });
  baseInput.addEventListener("change", () => {
    if (menuInput.checked !== baseInput.checked) {
      menuInput.checked = baseInput.checked;
    }
  });
};

const menuActionTargets = {
  "new-game": btnNew,
  "flip-board": btnFlip,
  undo: btnUndo,
  redo: btnRedo,
  "load-fen": btnLoadFen,
  "copy-fen": btnCopyFen,
  "load-pgn": btnLoadPgn,
  "copy-pgn": btnCopyPgn,
  "apply-moves": btnApplyMoves,
  "clear-moves": btnClearMoves,
  "pv-play": btnPvPlay,
  "pv-pause": btnPvPause,
  "pv-prev": btnPvPrev,
  "pv-next": btnPvNext,
  "pv-stop": btnPvStop,
  "is-ready": btnIsReady,
  "new-search": btnUciNew,
  "ponder-hit": btnPonderHit,
  "clear-hash": btnClearHash,
  "go-infinite": btnAnalyze,
  "stop-search": btnStop,
  "go-depth": btnGoDepth,
  "go-time": btnGoTime,
  "go-nodes": btnGoNodes,
  "go-mate": btnGoMate,
  "go-clock": btnGoClock,
  "play-best": btnPlayBest,
  "toggle-autoplay": btnAutoPlay,
  "panel-undo": btnPanelUndo,
  "panel-ai": btnPanelAi,
  "eval-trace": btnEval,
  "display-board": btnDisplay,
  "compiler-info": btnCompiler,
  "run-perft": btnPerft,
  "flip-engine": btnFlipEngine,
  "refresh-options": btnRefreshOptions,
  "max-performance": btnMaxPerf,
  "apply-threads": btnQuickThreads,
  "apply-hash": btnQuickHash,
  "apply-multipv": btnQuickMultiPv,
  "apply-nnue": btnQuickNnue,
  "max-strength": btnSkillBoost,
  "limit-strength": btnSkillLimit,
  "apply-strength": btnApplyStrength,
  "apply-syzygy": btnApplySyzygy,
  "toggle-chess960": btnChess960,
  "toggle-wdl": btnShowWdl,
  "batch-add-current": btnBatchAddCurrent,
  "batch-run": btnBatchRun,
  "batch-clear": btnBatchClear,
  "batch-export-json": btnBatchExport,
  "batch-export-csv": btnBatchExportCsv,
  "apply-thresholds": btnApplyThresholds,
  "copy-console": btnCopyConsole,
  "clear-console": btnClearConsole,
  "download-report": btnDownloadReport,
  "panel-resign": btnPanelResign,
};

function initHeaderMenus() {
  if (btnView) {
    btnView.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleHeaderMenu("view");
    });
  }

  if (btnSettings) {
    btnSettings.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleHeaderMenu("settings");
    });
  }

  document.querySelectorAll("[data-menu-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.menuAction;
      if (!action) return;
      if (action === "panel-play") {
        setPanelMode("play");
        closeHeaderMenus();
        return;
      }
      if (action === "panel-analysis") {
        setPanelMode("analysis");
        closeHeaderMenus();
        return;
      }
      const target = menuActionTargets[action];
      if (target) triggerButton(target);
      closeHeaderMenus();
    });
  });

  document.querySelectorAll(".topbar-menu [data-panel-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      closeHeaderMenus();
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest(".menu-wrap")) return;
    closeHeaderMenus();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeHeaderMenus();
  });

  syncMenuToggle(menuToggleBest, toggleBest);
  syncMenuToggle(menuToggleLast, toggleLast);
  syncMenuToggle(menuTogglePv, togglePv);
}

function initPanelToggles() {
  const buttons = document.querySelectorAll("[data-panel-toggle]");
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem("vulcan-panels") || "{}");
    } catch (err) {
      return {};
    }
  })();
  const groups = new Map();

  const applyState = (key, collapsed) => {
    const className = `collapsed-${key}`;
    document.body.classList.toggle(className, collapsed);
  };

  const saveState = () => {
    const state = {};
    buttons.forEach((btn) => {
      const key = btn.dataset.panelToggle;
      state[key] = document.body.classList.contains(`collapsed-${key}`);
    });
    localStorage.setItem("vulcan-panels", JSON.stringify(state));
  };

  const updateButton = (btn, collapsed) => {
    const label = btn.dataset.label || btn.dataset.panelToggle;
    const compact = btn.dataset.compact === "true";
    if (compact) {
      const onLabel = btn.dataset.labelOn || "Hide";
      const offLabel = btn.dataset.labelOff || "Show";
      btn.textContent = collapsed ? offLabel : onLabel;
    } else {
      btn.textContent = `${label}: ${collapsed ? "Off" : "On"}`;
    }
    btn.classList.toggle("is-off", collapsed);
    btn.setAttribute("aria-pressed", collapsed ? "true" : "false");
  };

  const updateGroup = (key) => {
    const collapsed = document.body.classList.contains(`collapsed-${key}`);
    (groups.get(key) || []).forEach((btn) => updateButton(btn, collapsed));
  };

  buttons.forEach((btn) => {
    const key = btn.dataset.panelToggle;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(btn);
  });

  Object.entries(saved).forEach(([key, collapsed]) => {
    if (groups.has(key)) applyState(key, collapsed);
  });

  buttons.forEach((btn) => {
    const key = btn.dataset.panelToggle;
    btn.addEventListener("click", () => {
      document.body.classList.toggle(`collapsed-${key}`);
      updateGroup(key);
      saveState();
    });
  });

  groups.forEach((_, key) => updateGroup(key));
}

function logLine(line, kind = "out") {
  const prefix = kind === "in" ? ">>" : "<<";
  const entry = `${prefix} ${line}`;
  const maxLines = 500;
  consoleLines.push(entry);
  if (consoleLines.length > maxLines) {
    consoleLines.splice(0, consoleLines.length - maxLines);
  }
  consoleDirty = true;
  scheduleUI();
}

function scheduleUI() {
  if (pendingFrame) return;
  pendingFrame = true;
  requestAnimationFrame(() => {
    pendingFrame = false;
    updateKpis();
    updateEvalBar();
    if (consoleDirty) {
      consoleDirty = false;
      consoleEl.textContent = consoleLines.join("\n");
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
    if (moveListDirty) {
      moveListDirty = false;
      renderMoveList();
    }
    if (pvRenderedVersion !== pvRenderVersion) {
      pvRenderedVersion = pvRenderVersion;
      renderPvLines();
    }
    if (evalRenderedVersion !== evalRenderVersion) {
      evalRenderedVersion = evalRenderVersion;
      renderEvalChart();
    }
    if (winrateRenderedVersion !== winrateRenderVersion) {
      winrateRenderedVersion = winrateRenderVersion;
      renderWinrateChart();
    }
  });
}

function setText(el, value) {
  if (!el) return;
  const text = value === null || value === undefined ? "" : String(value);
  if (textCache.get(el) !== text) {
    textCache.set(el, text);
    el.textContent = text;
  }
}

function updateKpis() {
  setText(kpiDepth, latestInfo.depth ?? 0);
  setText(kpiSelDepth, latestInfo.seldepth ?? 0);
  setText(kpiNodes, latestInfo.nodes ?? 0);
  setText(kpiNps, latestInfo.nps ?? 0);
  setText(kpiTime, latestInfo.time ?? 0);
  setText(kpiTbHits, latestInfo.tbhits ?? 0);
  setText(kpiHashfull, latestInfo.hashfull ?? 0);
  if (latestInfo.wdl) {
    setText(kpiWdl, `${latestInfo.wdl.w} / ${latestInfo.wdl.d} / ${latestInfo.wdl.l}`);
  } else {
    setText(kpiWdl, "—");
  }
  setText(engineNps, latestInfo.nps ? `${latestInfo.nps.toLocaleString()} nps` : "—");
}

function updateEvalBar() {
  const score = latestInfo.score;
  const label = formatScore(score);
  setText(evalLabel, label);
  const percent = scoreToPercent(score);
  const height = `${percent}%`;
  if (evalFill.dataset.height !== height) {
    evalFill.dataset.height = height;
    evalFill.style.height = height;
  }
}

function renderPvLines() {
  const sorted = [...pvLines.values()].sort((a, b) => (a.multipv || 1) - (b.multipv || 1));
  const fragment = document.createDocumentFragment();
  const baseFen = currentFen();
  const cachePrefix = `${baseFen}::`;
  const seen = new Set();
  sorted.forEach((line) => {
    const key = line.multipv || 1;
    let node = pvNodeMap.get(key);
    if (!node) {
      const row = document.createElement("div");
      row.className = "pv-line";
      const head = document.createElement("div");
      head.className = "pv-head";
      const headLeft = document.createElement("span");
      const headRight = document.createElement("span");
      head.appendChild(headLeft);
      head.appendChild(headRight);
      const moves = document.createElement("div");
      moves.className = "pv-moves";
      const san = document.createElement("div");
      san.className = "pv-san";
      node = {
        row,
        headLeft,
        headRight,
        moves,
        san,
        pv: "",
      };
      san.addEventListener("click", () => {
        if (node.pv) {
          navigator.clipboard.writeText(node.pv).catch(() => {});
        }
      });
      row.addEventListener("mouseenter", () => highlightPvLine(node.pv));
      row.addEventListener("mouseleave", () => restoreHighlights());
      row.appendChild(head);
      row.appendChild(moves);
      row.appendChild(san);
      pvNodeMap.set(key, node);
    }
    const scoreText = formatScore(line.score);
    node.headLeft.textContent = `PV ${key} • Depth ${line.depth ?? "?"}`;
    node.headRight.textContent = scoreText;
    node.moves.textContent = line.pv || "";
    node.pv = line.pv || "";
    if (line.pv) {
      const cacheKey = `${cachePrefix}${line.pv}`;
      let cachedSan = pvSanCache.get(cacheKey);
      if (cachedSan === undefined) {
        cachedSan = uciLineToSan(line.pv, baseFen);
        pvSanCache.set(cacheKey, cachedSan);
      }
      node.san.textContent = cachedSan;
    } else {
      node.san.textContent = "";
    }
    fragment.appendChild(node.row);
    seen.add(key);
  });
  pvLinesEl.innerHTML = "";
  pvLinesEl.appendChild(fragment);
  for (const key of pvNodeMap.keys()) {
    if (!seen.has(key)) {
      pvNodeMap.delete(key);
    }
  }
}

function uciLineToSan(pv, baseFen = "") {
  if (!pv) return "";
  const fen = baseFen || (game ? game.fen() : "");
  if (!fen) return "";
  const temp = new Chess(fen);
  const moves = pv.split(/\s+/);
  const sanMoves = [];
  for (const move of moves) {
    if (!move || move.length < 4) continue;
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);
    const promotion = move[4];
    const result = temp.move({ from, to, promotion });
    if (!result) break;
    sanMoves.push(result.san);
    if (sanMoves.length >= 12) break;
  }
  return sanMoves.join(" ");
}

function addEvalSample(info) {
  if (!info.score) return;
  const cp = info.score.type === "mate" ? (info.score.value > 0 ? 10000 : -10000) : info.score.value;
  const previousTime = evalHistory.length ? evalHistory[evalHistory.length - 1].time : 0;
  const rawTime = infoClockMs(info);
  const time = Math.max(previousTime + 1, rawTime);
  const depth = info.depth || 0;
  const side = getSideToMove();
  const winrate = scoreToWinrate(info.score, side);
  const prev = evalHistory[evalHistory.length - 1];
  if (prev && prev.time === time && prev.cp === cp && prev.depth === depth) return;
  if (evalHistory.length >= 240) {
    evalHistory.shift();
  }
  evalHistory.push({ time, cp, depth, win: winrate });
  evalRenderVersion += 1;
  winrateRenderVersion += 1;
}

function scoreToCp(score) {
  if (!score) return null;
  if (score.type === "mate") return score.value > 0 ? 10000 : -10000;
  return score.value;
}

function getSideToMove() {
  if (game && typeof game.turn === "function") return game.turn();
  const fen = currentFen();
  if (!fen || fen === "startpos") return "w";
  const parts = fen.split(/\s+/);
  return parts[1] === "b" ? "b" : "w";
}

function scoreToWinrate(score, side) {
  if (!score) return null;
  const percent = scoreToPercent(score);
  return side === "w" ? percent : 100 - percent;
}

function formatDelta(delta) {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta / 100).toFixed(2)}`;
}

function deltaClass(delta) {
  if (!Number.isFinite(delta)) return "";
  if (delta <= -thresholds.blunder) return "blunder";
  if (delta <= -thresholds.mistake) return "mistake";
  if (delta <= -thresholds.inaccuracy) return "inaccuracy";
  if (delta >= thresholds.brilliant) return "brilliant";
  return "neutral";
}

function updateMoveMetaFromInfo(info = latestInfo) {
  const ply = historyPlyCache;
  if (!ply) return;
  const cp = scoreToCp(info.score);
  if (!Number.isFinite(cp)) return;
  const lastMove = historyVerboseCache[ply - 1];
  if (!lastMove) return;
  const prevMeta = moveMeta[ply - 2];
  const prevCp = prevMeta?.cp ?? 0;
  const mover = lastMove?.color || "w";
  const delta = (cp - prevCp) * (mover === "w" ? 1 : -1);
  const labelClass = deltaClass(delta);
  const label = labelClass && labelClass !== "neutral" ? labelClass : "";
  const next = { cp, delta, time: info.time || 0, label };
  const prev = moveMeta[ply - 1];
  if (
    prev &&
    prev.cp === next.cp &&
    prev.delta === next.delta &&
    prev.time === next.time &&
    prev.label === next.label
  ) {
    return;
  }
  moveMeta[ply - 1] = next;
  moveListDirty = true;
}

function highlightPvMove(pv) {
  if (!pv) return;
  const first = pv.split(/\s+/)[0];
  highlightBestMove(first);
}

function renderEvalChart() {
  if (!evalChart) return;
  const ctx = evalChart.getContext("2d");
  if (!ctx) return;
  const { width, height } = evalChart;
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  if (!evalHistory.length) return;
  const minTime = evalHistory[0].time;
  const maxTime = evalHistory[evalHistory.length - 1].time;
  const span = Math.max(1, maxTime - minTime);

  ctx.strokeStyle = "rgba(240, 90, 79, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  evalHistory.forEach((sample, index) => {
    const clamped = Math.max(-1000, Math.min(1000, sample.cp));
    const x = ((sample.time - minTime) / span) * width;
    const y = height / 2 - (clamped / 1000) * (height * 0.45);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderWinrateChartTo(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  if (!evalHistory.length) return;
  const minTime = evalHistory[0].time;
  const maxTime = evalHistory[evalHistory.length - 1].time;
  const span = Math.max(1, maxTime - minTime);

  ctx.strokeStyle = "rgba(97, 215, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  evalHistory.forEach((sample, index) => {
    const value = Number.isFinite(sample.win) ? sample.win : 50;
    const clamped = Math.max(0, Math.min(100, value));
    const x = ((sample.time - minTime) / span) * width;
    const y = height * (0.95 - (clamped / 100) * 0.9);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function renderWinrateChart() {
  renderWinrateChartTo(winrateChart);
  renderWinrateChartTo(winrateChartLeft);
}

function buildOptions() {
  optionsEl.innerHTML = "";
  const filter = optionsFilter?.value?.trim().toLowerCase() || "";
  const options = [...engine.options.values()].filter((opt) => !filter || opt.name.toLowerCase().includes(filter));
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

  refreshQuickOptions();
}

function sendOption(name, value) {
  if (value === null) {
    engine.send(`setoption name ${name}`);
    return;
  }
  engine.send(`setoption name ${name} value ${value}`);
  optionState.set(name, String(value));
  if (name === "Threads") engineThreads.textContent = value;
  if (name === "Hash") engineHash.textContent = `${value} MB`;
}

const OPTION_KEYS = {
  threads: ["Threads"],
  hash: ["Hash"],
  multipv: ["MultiPV"],
  nnue: ["Use NNUE", "Use NNUE", "Use NNUE"],
  skill: ["Skill Level"],
  elo: ["UCI_Elo"],
  limitStrength: ["UCI_LimitStrength"],
  chess960: ["UCI_Chess960"],
  showWdl: ["UCI_ShowWDL"],
  syzygyPath: ["SyzygyPath"],
  syzygyDepth: ["SyzygyProbeDepth"],
  syzygy50: ["Syzygy50MoveRule"],
  minThinking: ["Minimum Thinking Time"],
  moveOverhead: ["Move Overhead"],
};

function findOption(names) {
  for (const name of names) {
    if (engine.options.has(name)) return name;
  }
  return null;
}

function getOptionValue(name) {
  if (optionState.has(name)) return optionState.get(name);
  const opt = engine.options.get(name);
  return opt?.default ?? "";
}

function refreshQuickOptions() {
  const threadsKey = findOption(OPTION_KEYS.threads);
  if (threadsKey) {
    quickThreads.value = getOptionValue(threadsKey);
    quickThreads.disabled = false;
    btnQuickThreads.disabled = false;
  } else {
    quickThreads.disabled = true;
    btnQuickThreads.disabled = true;
  }
  const hashKey = findOption(OPTION_KEYS.hash);
  if (hashKey) {
    quickHash.value = getOptionValue(hashKey);
    quickHash.disabled = false;
    btnQuickHash.disabled = false;
  } else {
    quickHash.disabled = true;
    btnQuickHash.disabled = true;
  }
  const mpvKey = findOption(OPTION_KEYS.multipv);
  if (mpvKey) {
    quickMultiPv.value = getOptionValue(mpvKey);
    quickMultiPv.disabled = false;
    btnQuickMultiPv.disabled = false;
  } else {
    quickMultiPv.disabled = true;
    btnQuickMultiPv.disabled = true;
  }
  const nnueKey = findOption(OPTION_KEYS.nnue);
  if (nnueKey) {
    quickNnue.value = getOptionValue(nnueKey) || "true";
    quickNnue.disabled = false;
    btnQuickNnue.disabled = false;
  } else {
    quickNnue.value = "true";
    quickNnue.disabled = true;
    btnQuickNnue.disabled = true;
  }
  const skillKey = findOption(OPTION_KEYS.skill);
  if (skillKey) {
    skillInput.value = getOptionValue(skillKey) || "20";
    skillInput.disabled = false;
  } else {
    skillInput.disabled = true;
  }
  const eloKey = findOption(OPTION_KEYS.elo);
  if (eloKey) {
    eloInput.value = getOptionValue(eloKey) || "2500";
    eloInput.disabled = false;
  } else {
    eloInput.disabled = true;
  }
  const syzygyPathKey = findOption(OPTION_KEYS.syzygyPath);
  if (syzygyPathKey) {
    syzygyPath.value = getOptionValue(syzygyPathKey);
    syzygyPath.disabled = false;
  } else {
    syzygyPath.disabled = true;
  }
  const syzygyDepthKey = findOption(OPTION_KEYS.syzygyDepth);
  if (syzygyDepthKey) {
    syzygyDepth.value = getOptionValue(syzygyDepthKey) || "0";
    syzygyDepth.disabled = false;
  } else {
    syzygyDepth.disabled = true;
  }
  const syzygy50Key = findOption(OPTION_KEYS.syzygy50);
  if (syzygy50Key) {
    syzygy50move.value = getOptionValue(syzygy50Key) || "true";
    syzygy50move.disabled = false;
  } else {
    syzygy50move.disabled = true;
  }
}

function updateEngineWarning() {
  const usingThreads = engine.supportsThreads;
  const secureContext = typeof window !== "undefined"
    && typeof window.isSecureContext === "boolean"
    ? window.isSecureContext
    : true;
  if (usingThreads) {
    engineWarning.textContent = "Cross-origin isolation active. Multi-threaded engine unlocked.";
  } else if (threadsAvailable()) {
    engineWarning.textContent = "Threads available, but current engine is single-threaded.";
  } else if (!secureContext) {
    engineWarning.textContent = "Threads require HTTPS/localhost + COOP/COEP. Falling back to single-threaded engines.";
  } else {
    engineWarning.textContent = "Cross-origin isolation is unavailable. Falling back to single-threaded engines.";
  }
}

async function loadSelectedEngine(key = engineSelect?.value || "auto") {
  const requestId = ++engineLoadRequest;
  if (engineSelect && engineSelect.value !== key) {
    engineSelect.value = key;
  }
  const spec = engine.resolveSpec(key);
  engineVariant.textContent = spec.label;
  engineThreads.textContent = spec.threads ? "auto" : "1";
  engineHash.textContent = "—";
  optionState.clear();
  engineWarning.textContent = `Loading ${spec.label} assets...`;
  try {
    await preloadEngineAssets(key);
  } catch (err) {
    // Best-effort preload only; engine load should still continue.
  }
  if (requestId !== engineLoadRequest) return;
  engine.load(key);
  updateEngineWarning();
}

function clampOptionValue(option, value) {
  if (!option) return value;
  const min = typeof option.min === "number" ? option.min : value;
  const max = typeof option.max === "number" ? option.max : value;
  return Math.min(max, Math.max(min, value));
}

function computeThreadTarget(deviceGB, cores, mode) {
  const safeCap = deviceGB <= 4 ? 2 : deviceGB <= 8 ? 4 : 6;
  const maxCap = deviceGB <= 4 ? 4 : deviceGB <= 8 ? 6 : deviceGB <= 16 ? 10 : 12;
  const cap = mode === "safe" ? safeCap : maxCap;
  return Math.max(1, Math.min(cores, cap));
}

function computeHashTarget(deviceGB, maxHash, minHash, mode) {
  let target;
  if (mode === "safe") {
    target = deviceGB <= 4 ? 64 : deviceGB <= 8 ? 128 : 256;
  } else {
    target = deviceGB <= 4 ? 128 : deviceGB <= 8 ? 256 : deviceGB <= 16 ? 384 : 512;
  }
  return Math.min(maxHash, Math.max(minHash, target));
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
  evalHistory = [];
  pvRenderVersion += 1;
  evalRenderVersion += 1;
  winrateRenderVersion += 1;
  analysisStart = performance.now();
  resetInfoSamplingState();
  const searchmoves = searchmovesInput.value.trim();
  const suffix = searchmoves ? ` searchmoves ${searchmoves}` : "";
  engine.send(`go ${mode}${suffix}`);
  logLine(`go ${mode}${suffix}`.trim(), "in");
  analysisActive = mode === "infinite";
  setAnalyzePillState(analysisActive);
}

function stopAnalysis() {
  engine.send("stop");
  logLine("stop", "in");
  analysisActive = false;
  setAnalyzePillState(false);
}

function stopAutoPlay() {
  autoPlay = false;
  awaitingBestMoveApply = false;
  btnAutoPlay.textContent = "Auto Play: Off";
}

function jumpBack(count) {
  if (!game) return;
  let moved = false;
  for (let i = 0; i < count; i += 1) {
    const move = game.undo();
    if (!move) break;
    redoStack.push(move);
    if (moveMeta.length) moveMeta.pop();
    moved = true;
  }
  if (moved) afterPositionChange();
}

function jumpForward(count) {
  if (!game) return;
  let moved = false;
  for (let i = 0; i < count; i += 1) {
    const move = redoStack.pop();
    if (!move) break;
    game.move(move);
    moveMeta.push({});
    moved = true;
  }
  if (moved) afterPositionChange();
}

function navigateStart() {
  if (!game) return;
  while (game.history().length) {
    const move = game.undo();
    if (!move) break;
    redoStack.push(move);
    if (moveMeta.length) moveMeta.pop();
  }
  afterPositionChange();
}

function navigateEnd() {
  if (!game) return;
  while (redoStack.length) {
    const move = redoStack.pop();
    if (!move) break;
    game.move(move);
    moveMeta.push({});
  }
  afterPositionChange();
}

function applyPerformanceProfile() {
  const deviceGB = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const threadsOpt = engine.options.get("Threads");
  const hashOpt = engine.options.get("Hash");
  const maxHash = hashOpt?.max ?? 256;
  const minHash = hashOpt?.min ?? 1;
  const threads = computeThreadTarget(deviceGB, cores, performanceMode);
  const hash = computeHashTarget(deviceGB, maxHash, minHash, performanceMode);
  const multiPvOpt = engine.options.get("MultiPV");
  const multiPv = performanceMode === "safe" ? 2 : 3;
  if (threadsOpt) sendOption("Threads", clampOptionValue(threadsOpt, threads));
  if (hashOpt) sendOption("Hash", clampOptionValue(hashOpt, hash));
  if (multiPvOpt) sendOption("MultiPV", clampOptionValue(multiPvOpt, multiPv));
  if (engine.options.has("UCI_ShowWDL")) sendOption("UCI_ShowWDL", "true");
  if (engine.options.has("Ponder")) sendOption("Ponder", "false");
  if (engine.options.has("UCI_LimitStrength")) sendOption("UCI_LimitStrength", "false");
  if (engine.options.has("Minimum Thinking Time")) sendOption("Minimum Thinking Time", 0);
  if (engine.options.has("Move Overhead")) sendOption("Move Overhead", 0);
  engineWarning.textContent = performanceMode === "safe"
    ? "Safe profile applied to prevent engine crashes."
    : "Performance profile applied.";
  refreshQuickOptions();
}

function isMemoryError(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("memory access out of bounds") ||
    text.includes("out of memory") ||
    text.includes("cannot enlarge memory") ||
    (text.includes("abort") && text.includes("memory"))
  );
}

function pickRecoveryVariant(currentKey) {
  switch (currentKey) {
    case "standard":
      return "standard-single";
    case "standard-single":
      return "lite-single";
    case "lite":
      return "lite-single";
    case "lite-single":
      return "asm";
    default:
      return "standard-single";
  }
}

function recoverFromEngineError(message) {
  if (!isMemoryError(message)) return false;
  if (engineRecoveryAttempt >= ENGINE_RECOVERY_LIMIT) return false;
  engineRecoveryAttempt += 1;
  performanceMode = "safe";
  stopAnalysis();
  const currentKey = engineSelect.value || "auto";
  const fallbackKey = pickRecoveryVariant(currentKey);
  engineWarning.textContent = "Engine ran out of memory. Reloading with safe settings...";
  loadSelectedEngine(fallbackKey).catch(() => {});
  return true;
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
  if (optionsFilter) optionsFilter.value = "";
});
engine.on("readyok", () => {
  engineWarning.textContent = "Engine ready for commands.";
});
engine.on("info", (info) => {
  mergeObjectShallow(latestInfo, info);
  if (shouldRecordEvalSample(info)) {
    addEvalSample(info);
  }
  if (shouldUpdateMoveMeta(info)) {
    updateMoveMetaFromInfo(info);
  }
  if (batchAwaiting && batchCurrent) {
    mergeObjectShallow(batchCurrent.info, info);
    if (info.pv && isPrimaryPvInfo(info)) {
      batchCurrent.pv = info.pv;
    }
  }
  let pvChanged = false;
  if (
    info.pv ||
    info.multipv ||
    typeof info.depth === "number" ||
    typeof info.seldepth === "number" ||
    info.score
  ) {
    const pvKey = info.multipv || 1;
    let line = pvLines.get(pvKey);
    if (!line) {
      line = { multipv: pvKey };
      pvLines.set(pvKey, line);
      pvChanged = true;
    }
    if (mergeObjectShallow(line, info)) {
      pvChanged = true;
    }
    if (line.multipv !== pvKey) {
      line.multipv = pvKey;
      pvChanged = true;
    }
  }
  if (pvChanged) {
    pvRenderVersion += 1;
  }
  scheduleUI();
});
engine.on("infoString", () => {
  // console already receives raw output
});
engine.on("bestmove", (move) => {
  engineBestmove.textContent = move.bestmove || "—";
  lastBestMove = move.bestmove;
  highlightBestMove(move.bestmove);
  if (batchAwaiting && batchCurrent) {
    resolveBatchAnalysis({
      bestmove: move.bestmove,
      status: "done",
    });
  }
  if (awaitingBestMoveApply && move.bestmove) {
    awaitingBestMoveApply = false;
    applyUciMove(move.bestmove);
    if (autoPlay) {
      setTimeout(() => requestAutoMove(), 80);
    }
  }
});
engine.on("error", (err) => {
  const message = err?.message || err;
  logLine(`engine error: ${message}`, "out");
  if (batchAwaiting && batchCurrent) {
    resolveBatchAnalysis({
      bestmove: null,
      error: String(message || "engine error"),
      status: "error",
    });
  }
  if (!recoverFromEngineError(message)) {
    engineWarning.textContent = `Engine error: ${message}`;
  }
});

engineSelect.addEventListener("change", () => {
  loadSelectedEngine(engineSelect.value).catch(() => {});
});

if (btnMenu) {
  btnMenu.addEventListener("click", () => {
    const toggle = document.querySelector("[data-panel-toggle='left']");
    if (toggle instanceof HTMLElement) toggle.click();
  });
}

if (btnAnalyzePill) {
  btnAnalyzePill.addEventListener("click", () => {
    if (analysisActive) stopAnalysis();
    else startAnalysis("infinite");
  });
}

if (btnPanelUndo) {
  btnPanelUndo.addEventListener("click", () => {
    triggerButton(btnUndo);
  });
}

if (btnPanelAi) {
  btnPanelAi.addEventListener("click", () => {
    triggerButton(btnPlayBest);
  });
}

if (btnPanelResign) {
  btnPanelResign.addEventListener("click", () => {
    stopAnalysis();
    stopAutoPlay();
  });
}

if (btnPanelPlay && btnPanelAnalysis) {
  btnPanelPlay.addEventListener("click", () => setPanelMode("play"));
  btnPanelAnalysis.addEventListener("click", () => setPanelMode("analysis"));
}

btnAnalyze.addEventListener("click", () => {
  startAnalysis("infinite");
});

btnStop.addEventListener("click", () => {
  stopAnalysis();
});

btnPlayBest.addEventListener("click", () => {
  if (lastBestMove && lastBestMove !== "(none)") {
    applyUciMove(lastBestMove);
    return;
  }
  requestAutoMove();
});

btnAutoPlay.addEventListener("click", () => {
  autoPlay = !autoPlay;
  btnAutoPlay.textContent = `Auto Play: ${autoPlay ? "On" : "Off"}`;
  if (autoPlay) {
    analysisActive = false;
    stopAnalysis();
    requestAutoMove();
  } else {
    awaitingBestMoveApply = false;
  }
});

btnPvPlay.addEventListener("click", () => {
  playPvPreview();
});

btnPvPause.addEventListener("click", () => {
  pausePvPlayback();
});

btnPvPrev.addEventListener("click", () => {
  stepPv(-1);
});

btnPvNext.addEventListener("click", () => {
  stepPv(1);
});

btnPvStop.addEventListener("click", () => {
  stopPvPlayback();
});

toggleBest.addEventListener("change", () => {
  overlayState.best = toggleBest.checked;
  restoreHighlights();
});

toggleLast.addEventListener("change", () => {
  overlayState.last = toggleLast.checked;
  restoreHighlights();
});

togglePv.addEventListener("change", () => {
  overlayState.pv = togglePv.checked;
  if (!overlayState.pv) {
    stopPvPlayback();
  }
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

optionsFilter.addEventListener("input", () => {
  buildOptions();
});

btnMaxPerf.addEventListener("click", () => {
  performanceMode = "max";
  engineRecoveryAttempt = 0;
  applyPerformanceProfile();
});

btnQuickThreads.addEventListener("click", () => {
  const key = findOption(OPTION_KEYS.threads);
  if (!key) return;
  const value = Number(quickThreads.value) || 1;
  sendOption(key, value);
});

btnQuickHash.addEventListener("click", () => {
  const key = findOption(OPTION_KEYS.hash);
  if (!key) return;
  const value = Number(quickHash.value) || 64;
  sendOption(key, value);
});

btnQuickMultiPv.addEventListener("click", () => {
  const key = findOption(OPTION_KEYS.multipv);
  if (!key) return;
  const value = Number(quickMultiPv.value) || 1;
  sendOption(key, value);
});

btnQuickNnue.addEventListener("click", () => {
  const key = findOption(OPTION_KEYS.nnue);
  if (!key) return;
  sendOption(key, quickNnue.value);
});

btnSkillBoost.addEventListener("click", () => {
  const limitKey = findOption(OPTION_KEYS.limitStrength);
  if (limitKey) sendOption(limitKey, "false");
  const skillKey = findOption(OPTION_KEYS.skill);
  if (skillKey) sendOption(skillKey, 20);
  const eloKey = findOption(OPTION_KEYS.elo);
  if (eloKey) sendOption(eloKey, 3000);
});

btnSkillLimit.addEventListener("click", () => {
  const limitKey = findOption(OPTION_KEYS.limitStrength);
  if (limitKey) sendOption(limitKey, "true");
});

btnApplyStrength.addEventListener("click", () => {
  const skillKey = findOption(OPTION_KEYS.skill);
  if (skillKey) sendOption(skillKey, Number(skillInput.value) || 20);
  const limitKey = findOption(OPTION_KEYS.limitStrength);
  if (limitKey) sendOption(limitKey, "true");
  const eloKey = findOption(OPTION_KEYS.elo);
  if (eloKey) sendOption(eloKey, Number(eloInput.value) || 2500);
});

btnApplySyzygy.addEventListener("click", () => {
  const pathKey = findOption(OPTION_KEYS.syzygyPath);
  if (pathKey) sendOption(pathKey, syzygyPath.value.trim() || "<empty>");
  const depthKey = findOption(OPTION_KEYS.syzygyDepth);
  if (depthKey) sendOption(depthKey, Number(syzygyDepth.value) || 0);
  const ruleKey = findOption(OPTION_KEYS.syzygy50);
  if (ruleKey) sendOption(ruleKey, syzygy50move.value);
});

btnChess960.addEventListener("click", () => {
  const key = findOption(OPTION_KEYS.chess960);
  if (!key) return;
  const current = getOptionValue(key) || "false";
  const next = current === "true" ? "false" : "true";
  sendOption(key, next);
});

btnShowWdl.addEventListener("click", () => {
  const key = findOption(OPTION_KEYS.showWdl);
  if (!key) return;
  const current = getOptionValue(key) || "false";
  const next = current === "true" ? "false" : "true";
  sendOption(key, next);
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
  consoleLines.length = 0;
  consoleDirty = true;
  scheduleUI();
});

btnDownloadReport.addEventListener("click", () => {
  const report = {
    timestamp: new Date().toISOString(),
    fen: game ? game.fen() : "",
    pgn: game ? game.pgn() : "",
    info: latestInfo,
    pv: [...pvLines.values()],
    evalHistory,
    moveMeta,
    thresholds,
    bestmove: lastBestMove,
    engine: {
      name: engineName.textContent,
      variant: engineVariant.textContent,
      threads: engineThreads.textContent,
      hash: engineHash.textContent,
    },
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vulcan-report-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

btnApplyThresholds.addEventListener("click", () => {
  thresholds = {
    inaccuracy: Number(thInaccuracy.value) || thresholds.inaccuracy,
    mistake: Number(thMistake.value) || thresholds.mistake,
    blunder: Number(thBlunder.value) || thresholds.blunder,
    brilliant: Number(thBrilliant.value) || thresholds.brilliant,
  };
  renderMoveList();
});

function renderBatchList() {
  if (!batchList) return;
  batchList.innerHTML = "";
  batchQueue.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "list-item";
    const status = item.status || "queued";
    const idx = document.createElement("strong");
    idx.textContent = `#${index + 1}`;
    const fenText = document.createTextNode(` ${item.fen} `);
    const statusTag = document.createElement("span");
    statusTag.className = "move-tag";
    statusTag.textContent = status;
    row.appendChild(idx);
    row.appendChild(fenText);
    row.appendChild(statusTag);
    batchList.appendChild(row);
  });
  renderBatchChart();
}

function renderBatchChart() {
  if (!batchChart || !batchStatus) return;
  const total = batchQueue.length;
  const done = batchQueue.filter((item) => item.status === "done").length;
  const running = batchQueue.filter((item) => item.status === "running").length;
  const queued = total - done - running;
  batchStatus.textContent = total
    ? `Completed ${done}/${total} • Running ${running} • Queued ${queued}`
    : "No batch running.";
  const ctx = batchChart.getContext("2d");
  if (!ctx) return;
  const { width, height } = batchChart;
  ctx.clearRect(0, 0, width, height);
  if (!total) return;
  const doneW = (done / total) * width;
  const runW = (running / total) * width;
  ctx.fillStyle = "rgba(89, 200, 165, 0.9)";
  ctx.fillRect(0, 0, doneW, height);
  ctx.fillStyle = "rgba(241, 196, 83, 0.85)";
  ctx.fillRect(doneW, 0, runW, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(doneW + runW, 0, width - doneW - runW, height);
}

function parseBatchInput() {
  const lines = batchInput.value.split(/\n/).map((line) => line.trim()).filter(Boolean);
  lines.forEach((fen) => batchQueue.push({ fen, status: "queued" }));
  batchInput.value = "";
  renderBatchList();
}

btnBatchAddCurrent.addEventListener("click", () => {
  if (!game) return;
  batchQueue.push({ fen: game.fen(), status: "queued" });
  renderBatchList();
});

btnBatchClear.addEventListener("click", () => {
  batchQueue = [];
  batchResults = [];
  renderBatchList();
  renderBatchChart();
});

btnBatchRun.addEventListener("click", async () => {
  if (batchRunning) return;
  parseBatchInput();
  if (!batchQueue.length) return;
  batchRunning = true;
  batchResults = [];
  analysisActive = false;
  stopAnalysis();
  autoPlay = false;
  btnAutoPlay.textContent = "Auto Play: Off";
  renderBatchChart();
  for (const item of batchQueue) {
    item.status = "running";
    renderBatchList();
    const result = await analyzeFen(item.fen);
    item.status = result.error ? "failed" : "done";
    batchResults.push(result);
    renderBatchList();
  }
  batchRunning = false;
  renderBatchChart();
});

btnBatchExport.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(batchResults, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vulcan-batch-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

btnBatchExportCsv.addEventListener("click", () => {
  if (!batchResults.length) return;
  const headers = ["fen", "bestmove", "score", "depth", "time", "pv"];
  const rows = batchResults.map((result) => {
    const score = result.info?.score ? (result.info.score.type === "mate" ? `mate ${result.info.score.value}` : result.info.score.value) : "";
    const depth = result.info?.depth ?? "";
    const time = result.info?.time ?? "";
    const pv = result.pv ?? "";
    return [result.fen, result.bestmove, score, depth, time, pv].map((val) => `"${String(val ?? "").replace(/\"/g, '""')}"`).join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vulcan-batch-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

async function analyzeFen(fen) {
  return new Promise((resolve) => {
    const depth = Number(batchDepthInput.value) || 12;
    const movetime = Number(batchMoveTimeInput.value) || 0;
    const started = Date.now();
    if (!engine.worker) {
      resolve({
        fen,
        bestmove: null,
        info: {},
        pv: "",
        started,
        completed: Date.now(),
        error: "engine not loaded",
        status: "error",
      });
      return;
    }
    batchAwaiting = true;
    batchCurrent = {
      fen,
      bestmove: null,
      info: {},
      pv: "",
      started,
      status: "running",
    };
    batchResolver = resolve;
    batchTimeoutId = setTimeout(() => {
      resolveBatchAnalysis({
        bestmove: null,
        error: `timeout after ${BATCH_ANALYSIS_TIMEOUT_MS}ms`,
        status: "timeout",
      });
    }, BATCH_ANALYSIS_TIMEOUT_MS);
    engine.send(`position fen ${fen}`);
    if (movetime > 0) {
      engine.send(`go movetime ${movetime}`);
    } else {
      engine.send(`go depth ${depth}`);
    }
  });
}

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
  const boardEl = $("board");
  if (!boardEl) return;

  boardEl.querySelectorAll(".square").forEach((squareEl) => {
    squareEl.innerHTML = "";
    const square = squareEl.dataset.square;
    const piece = game.get(square);
    if (piece) {
      const img = document.createElement("img");
      img.alt = `${piece.color}${piece.type}`;
      img.src = `./assets/pieces/${piece.color}${piece.type.toUpperCase()}.png`;
      squareEl.appendChild(img);
    }
  });
}

function clearSelectionHighlights() {
  document.querySelectorAll(".square").forEach((sq) => {
    sq.classList.remove("selected", "legal", "capture");
  });
}

function clearBestMoveHighlights() {
  document.querySelectorAll(".square").forEach((sq) => {
    sq.classList.remove("best-from", "best-to");
  });
}

function clearLastMoveHighlights() {
  document.querySelectorAll(".square").forEach((sq) => {
    sq.classList.remove("last-from", "last-to");
  });
}

function highlightMoves(moves) {
  clearSelectionHighlights();
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
    clearSelectionHighlights();
    return;
  }

  if (moves.length) {
    selectedSquare = square;
    highlightMoves(moves);
  } else {
    selectedSquare = null;
    legalTargets.clear();
    clearSelectionHighlights();
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

function renderMoveList() {
  if (!game || !moveListEl) return;
  if (!moveListEl.dataset.boundClick) {
    moveListEl.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest(".list-item[data-ply]");
      if (!row || !moveListEl.contains(row)) return;
      const ply = Number(row.dataset.ply);
      if (Number.isFinite(ply) && ply > 0) {
        jumpToPly(ply);
      }
    });
    moveListEl.dataset.boundClick = "true";
  }
  const history = game.history();
  const targetLength = history.length;
  for (let index = 0; index < targetLength; index += 1) {
    const move = history[index];
    let item = moveListEl.children[index];
    if (!item) {
      item = document.createElement("div");
      item.className = "list-item";
      moveListEl.appendChild(item);
    }
    const moveNumber = Math.floor(index / 2) + 1;
    const prefix = index % 2 === 0 ? `${moveNumber}.` : "...";
    const meta = moveMeta[index];
    const delta = meta?.delta;
    const deltaText = Number.isFinite(delta) ? formatDelta(delta) : "";
    const tag = deltaText ? `<span class=\"delta ${deltaClass(delta)}\">${deltaText}</span>` : "";
    const label = meta?.label ? `<span class=\"move-tag\">${meta.label}</span>` : "";
    const renderKey = `${prefix}|${move}|${deltaText}|${meta?.label || ""}`;
    const ply = String(index + 1);
    if (item.dataset.ply !== ply) item.dataset.ply = ply;
    if (item.dataset.renderKey !== renderKey) {
      item.dataset.renderKey = renderKey;
      item.innerHTML = `<strong>${prefix}</strong> ${move} ${tag} ${label}`;
    }
  }
  for (let index = moveListEl.children.length - 1; index >= targetLength; index -= 1) {
    const node = moveListEl.children[index];
    if (node) node.remove();
  }
}

function highlightLastMove() {
  clearLastMoveHighlights();
  if (!overlayState.last) return;
  if (!game) return;
  const history = game.history({ verbose: true });
  const last = history[history.length - 1];
  if (!last) return;
  const fromEl = document.querySelector(`.square[data-square='${last.from}']`);
  const toEl = document.querySelector(`.square[data-square='${last.to}']`);
  if (fromEl) fromEl.classList.add("last-from");
  if (toEl) toEl.classList.add("last-to");
}

function highlightBestMove(uci) {
  clearBestMoveHighlights();
  if (!overlayState.best) return;
  if (!uci || uci === "(none)" || uci.length < 4) return;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const fromEl = document.querySelector(`.square[data-square='${from}']`);
  const toEl = document.querySelector(`.square[data-square='${to}']`);
  if (fromEl) fromEl.classList.add("best-from");
  if (toEl) toEl.classList.add("best-to");
}

function highlightPvLine(pv) {
  clearPvHighlights();
  if (!overlayState.pv) return;
  if (!pv) return;
  const moves = pv.split(/\s+/).slice(0, 6);
  moves.forEach((move, idx) => {
    if (move.length < 4) return;
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);
    const fromEl = document.querySelector(`.square[data-square='${from}']`);
    const toEl = document.querySelector(`.square[data-square='${to}']`);
    if (fromEl) {
      fromEl.classList.add("pv-from");
      fromEl.dataset.pvStep = idx;
      fromEl.style.setProperty("--pv-step", idx);
    }
    if (toEl) {
      toEl.classList.add("pv-to");
      toEl.dataset.pvStep = idx;
      toEl.style.setProperty("--pv-step", idx);
    }
  });
}

function clearPvHighlights() {
  document.querySelectorAll(".square.pv-from, .square.pv-to").forEach((sq) => {
    sq.classList.remove("pv-from", "pv-to");
    sq.removeAttribute("data-pv-step");
    sq.style.removeProperty("--pv-step");
  });
}

function restoreHighlights() {
  highlightLastMove();
  highlightBestMove(lastBestMove);
}

function stopPvPlayback() {
  if (pvPlaybackTimer) {
    clearInterval(pvPlaybackTimer);
    pvPlaybackTimer = null;
  }
  pvPlaybackMoves = [];
  pvPlaybackIndex = 0;
  clearPvHighlights();
  restoreHighlights();
}

function playPvPreview() {
  if (!overlayState.pv) return;
  const line = pvLines.get(1);
  if (!line || !line.pv) return;
  if (pvPlaybackTimer) {
    clearInterval(pvPlaybackTimer);
    pvPlaybackTimer = null;
  }
  pvPlaybackMoves = line.pv.split(/\s+/).filter((m) => m.length >= 4);
  if (!pvPlaybackMoves.length) return;
  pvPlaybackIndex = -1;
  const interval = Math.max(120, Number(pvSpeedInput.value) || 600);
  pvPlaybackTimer = setInterval(() => {
    stepPv(1);
  }, interval);
}

function pausePvPlayback() {
  if (pvPlaybackTimer) {
    clearInterval(pvPlaybackTimer);
    pvPlaybackTimer = null;
  }
}

function stepPv(direction) {
  if (!pvPlaybackMoves.length) {
    const line = pvLines.get(1);
    if (!line || !line.pv) return;
    pvPlaybackMoves = line.pv.split(/\s+/).filter((m) => m.length >= 4);
  }
  if (!pvPlaybackMoves.length) return;
  pvPlaybackIndex = (pvPlaybackIndex + direction + pvPlaybackMoves.length) % pvPlaybackMoves.length;
  clearPvHighlights();
  const move = pvPlaybackMoves[pvPlaybackIndex];
  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  const fromEl = document.querySelector(`.square[data-square='${from}']`);
  const toEl = document.querySelector(`.square[data-square='${to}']`);
  if (fromEl) {
    fromEl.classList.add("pv-from");
    fromEl.style.setProperty("--pv-step", pvPlaybackIndex);
  }
  if (toEl) {
    toEl.classList.add("pv-to");
    toEl.style.setProperty("--pv-step", pvPlaybackIndex);
  }
}

function jumpToPly(ply) {
  if (!game) return;
  const history = game.history({ verbose: true });
  game.reset();
  moveMeta = moveMeta.slice(0, ply);
  for (let i = 0; i < ply; i += 1) {
    const move = history[i];
    if (!move) break;
    game.move({ from: move.from, to: move.to, promotion: move.promotion });
  }
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
}

function applyUciMove(uci) {
  if (!game || !uci || uci === "(none)" || uci.length < 4) return false;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci[4];
  const move = game.move({ from, to, promotion });
  if (!move) return false;
  undoStack.push(move);
  redoStack.length = 0;
  afterPositionChange();
  return true;
}

function requestAutoMove() {
  if (!autoPlay && !awaitingBestMoveApply) {
    const moveTime = Number(autoMoveTimeInput.value) || 1200;
    const depth = Number(autoDepthInput.value) || 12;
    sendPosition();
    if (moveTime > 0) {
      engine.send(`go movetime ${moveTime}`);
      logLine(`go movetime ${moveTime}`, "in");
    } else {
      engine.send(`go depth ${depth}`);
      logLine(`go depth ${depth}`, "in");
    }
    awaitingBestMoveApply = true;
    return;
  }
  if (autoPlay) {
    const moveTime = Number(autoMoveTimeInput.value) || 1200;
    const depth = Number(autoDepthInput.value) || 12;
    sendPosition();
    if (moveTime > 0) {
      engine.send(`go movetime ${moveTime}`);
      logLine(`go movetime ${moveTime}`, "in");
    } else {
      engine.send(`go depth ${depth}`);
      logLine(`go depth ${depth}`, "in");
    }
    awaitingBestMoveApply = true;
  }
}

function afterPositionChange() {
  updateBoardPieces();
  syncFenPgn();
  refreshHistoryCache();
  renderMoveList();
  clearSelectionHighlights();
  clearPvHighlights();
  highlightLastMove();
  selectedSquare = null;
  legalTargets.clear();
  pvSanCache.clear();
  if (game) {
    const ply = game.history().length;
    if (moveMeta.length > ply) {
      moveMeta = moveMeta.slice(0, ply);
    }
  }
  if (autoPlay && !awaitingBestMoveApply) {
    setTimeout(() => requestAutoMove(), 60);
  }
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
  moveMeta = [];
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
  moveMeta = [];
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
}

btnNew.addEventListener("click", () => {
  if (!game) return;
  game.reset();
  moveMeta = [];
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
});

btnFlip.addEventListener("click", () => {
  boardFlipped = !boardFlipped;
  renderBoardSquares();
  updateBoardPieces();
  clearSelectionHighlights();
  highlightLastMove();
  highlightBestMove(lastBestMove);
  selectedSquare = null;
  legalTargets.clear();
});

btnUndo.addEventListener("click", () => {
  if (!game) return;
  const move = game.undo();
  if (move) {
    redoStack.push(move);
    if (moveMeta.length) moveMeta.pop();
    afterPositionChange();
  }
});

btnRedo.addEventListener("click", () => {
  if (!game || !redoStack.length) return;
  const move = redoStack.pop();
  if (!move) return;
  game.move(move);
  moveMeta.push({});
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
  moveMeta = [];
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
  moveMeta = [];
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange();
});

function handleGlobalHotkeys(event) {
  if (isTypingTarget(event.target)) return;
  const key = event.key;
  const keyLower = key.toLowerCase();
  const ctrl = event.ctrlKey || event.metaKey;
  const shift = event.shiftKey;

  if (ctrl && keyLower === "n") {
    event.preventDefault();
    triggerButton(btnNew);
    return;
  }

  if (ctrl && keyLower === "z") {
    event.preventDefault();
    if (shift) triggerButton(btnRedo);
    else triggerButton(btnUndo);
    return;
  }

  if (ctrl && keyLower === "y") {
    event.preventDefault();
    triggerButton(btnRedo);
    return;
  }

  if (ctrl && shift && keyLower === "l") {
    event.preventDefault();
    loadSelectedEngine(engineSelect.value || "auto").catch(() => {});
    return;
  }

  if (key === "Escape") {
    event.preventDefault();
    stopAnalysis();
    stopAutoPlay();
    clearSelectionHighlights();
    clearPvHighlights();
    restoreHighlights();
    return;
  }

  if (key === " " || key === "Spacebar") {
    event.preventDefault();
    if (analysisActive) stopAnalysis();
    else startAnalysis("infinite");
    return;
  }

  if (key === "ArrowLeft") {
    event.preventDefault();
    if (shift) jumpBack(10);
    else triggerButton(btnUndo);
    return;
  }

  if (key === "ArrowRight") {
    event.preventDefault();
    if (shift) jumpForward(10);
    else triggerButton(btnRedo);
    return;
  }

  if (key === "Home") {
    event.preventDefault();
    navigateStart();
    return;
  }

  if (key === "End") {
    event.preventDefault();
    navigateEnd();
    return;
  }

  if (key === "Enter") {
    event.preventDefault();
    if (shift) triggerButton(btnAutoPlay);
    else triggerButton(btnPlayBest);
    return;
  }

  if (keyLower === "f") {
    event.preventDefault();
    triggerButton(btnFlip);
    return;
  }

  if (keyLower === "a") {
    event.preventDefault();
    triggerButton(btnAutoPlay);
    return;
  }

  if (keyLower === "b") {
    event.preventDefault();
    toggleCheckbox(toggleBest);
    return;
  }

  if (keyLower === "l") {
    event.preventDefault();
    toggleCheckbox(toggleLast);
    return;
  }

  if (keyLower === "v") {
    event.preventDefault();
    toggleCheckbox(togglePv);
    return;
  }

  if (keyLower === "i") {
    event.preventDefault();
    triggerButton(btnIsReady);
    return;
  }

  if (keyLower === "u") {
    event.preventDefault();
    triggerButton(btnUciNew);
    return;
  }

  if (keyLower === "p") {
    event.preventDefault();
    triggerButton(btnPonderHit);
    return;
  }

  if (keyLower === "h") {
    event.preventDefault();
    triggerButton(btnClearHash);
    return;
  }

  if (keyLower === "g") {
    event.preventDefault();
    triggerButton(btnGoDepth);
    return;
  }

  if (keyLower === "t") {
    event.preventDefault();
    triggerButton(btnGoTime);
    return;
  }

  if (keyLower === "n") {
    event.preventDefault();
    triggerButton(btnGoNodes);
    return;
  }

  if (keyLower === "m") {
    event.preventDefault();
    triggerButton(btnGoMate);
    return;
  }

  if (keyLower === "c") {
    event.preventDefault();
    triggerButton(btnGoClock);
    return;
  }

  if (key === "[") {
    event.preventDefault();
    triggerButton(btnPvPrev);
    return;
  }

  if (key === "]") {
    event.preventDefault();
    triggerButton(btnPvNext);
    return;
  }

  if (keyLower === "r") {
    event.preventDefault();
    triggerButton(btnRefreshOptions);
    return;
  }

  if (keyLower === "e") {
    event.preventDefault();
    triggerButton(btnEval);
    return;
  }

  if (keyLower === "d") {
    event.preventDefault();
    triggerButton(btnDisplay);
    return;
  }

  if (keyLower === "x") {
    event.preventDefault();
    triggerButton(btnStop);
    return;
  }
}

window.addEventListener("keydown", handleGlobalHotkeys);

function initBoard() {
  renderBoardSquares();
  updateBoardPieces();
  syncFenPgn();
  refreshHistoryCache();
  renderMoveList();
  highlightLastMove();
}

initPanelToggles();
initHeaderMenus();
setPanelMode("play");
ensureChessReady().then((ready) => {
  if (ready) {
    initGame();
  } else {
    engineWarning.textContent = "Chess library failed to load.";
  }
});
updateEngineWarning();
optionState.clear();
engineSelect.value = "lite";
loadSelectedEngine("lite").catch(() => {
  engineWarning.textContent = "Engine failed to auto-load.";
});
overlayState = {
  best: toggleBest.checked,
  last: toggleLast.checked,
  pv: togglePv.checked,
};
setAnalyzePillState(false);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
