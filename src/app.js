import {
  EngineController,
  preloadEngineAssets,
  queueEngineAssetPreload,
  threadsAvailable,
} from "./engine.js?v=20260209e";
import { formatScore, scoreToPercent } from "./uci.js?v=20260209e";

const $ = (id) => document.getElementById(id);

const engineName = $("engine-name");
const engineVariant = $("engine-variant");
const engineThreads = $("engine-threads");
const engineHash = $("engine-hash");
const engineNps = $("engine-nps");
const engineWarning = $("engine-warning");
const engineBestmove = $("engine-bestmove");
const metricWinrate = $("metric-winrate");
const metricScore = $("metric-score");
const metricDelta = $("metric-delta");
const panelToolbarStatus = $("panel-toolbar-status");
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
const btnUiMode = $("btn-ui-mode");
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
const panelRight = $("panel-right");
const panelBottom = $("panel-bottom");

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
const engineCommandButtons = [
  btnAnalyze,
  btnStop,
  btnIsReady,
  btnUciNew,
  btnPonderHit,
  btnClearHash,
  btnPlayBest,
  btnAutoPlay,
  btnGoDepth,
  btnGoTime,
  btnGoNodes,
  btnGoMate,
  btnGoClock,
  btnEval,
  btnDisplay,
  btnCompiler,
  btnPerft,
  btnFlipEngine,
  btnSendUci,
  btnPanelAi,
];
const MAX_QUEUED_ENGINE_ACTIONS = 8;

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
let focusedSquare = "e2";
let legalTargets = new Set();
const boardSquareMap = new Map();
const boardPieceMap = new Map();
let selectionHighlightSquares = new Set();
let bestHighlightSquares = new Set();
let lastHighlightSquares = new Set();
let pvHighlightSquares = new Set();
let lastBestMove = null;
let autoPlay = false;
let awaitingBestMoveApply = false;
let evalHistory = [];
let analysisStart = performance.now();
let moveMeta = [];
let historySanCache = [];
let historyVerboseCache = [];
let historyPlyCache = 0;
let historyUciCache = [];
let historyUciJoined = "";
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
const moveRowNodeMap = new WeakMap();
const ENGINE_RECOVERY_LIMIT = 2;
const BATCH_ANALYSIS_TIMEOUT_MS = 20000;
const EVAL_SAMPLE_INTERVAL_MS = 80;
const MOVE_META_UPDATE_INTERVAL_MS = 220;
const PV_SAN_CACHE_LIMIT = 320;
const PV_SAN_DEBOUNCE_MS = 140;
const ENGINE_INFO_FLUSH_INTERVAL_MS = 40;
const CONSOLE_MAX_LINES = 500;
const CONSOLE_FLUSH_INTERVAL_MS = 250;
const CHART_RENDER_INTERVAL_MS = 140;
const OPTIONS_FILTER_DEBOUNCE_MS = 120;
const PGN_SYNC_DEBOUNCE_MS = 180;
const MOBILE_UI_MAX_WIDTH = 900;
const MOBILE_UI_FRAME_INTERVAL_MS = 66;
const LOW_END_MOBILE_UI_FRAME_INTERVAL_MS = 90;
const ENGINE_PREWARM_IDLE_TIMEOUT_MS = 1200;
const UI_MODE_STORAGE_KEY = "vulcan-ui-mode";
const SESSION_STORAGE_KEY = "vulcan-session";
const SESSION_SAVE_DEBOUNCE_MS = 220;
const PIECE_NAMES = {
  P: "pawn",
  N: "knight",
  B: "bishop",
  R: "rook",
  Q: "queen",
  K: "king",
};
let performanceMode = "max";
let engineRecoveryAttempt = 0;
let lastEvalSampleTime = Number.NEGATIVE_INFINITY;
let lastEvalSampleDepth = -1;
let lastMoveMetaUpdateTime = Number.NEGATIVE_INFINITY;
let lastMoveMetaDepth = -1;
let consoleFlushTimer = null;
let consoleNeedsFullRender = true;
let consoleRenderedLineCount = 0;
let uiRescheduleTimer = null;
let uiRescheduleDueAt = Number.POSITIVE_INFINITY;
let lastUiRenderAt = Number.NEGATIVE_INFINITY;
let lastEvalChartRenderAt = Number.NEGATIVE_INFINITY;
let lastWinrateChartRenderAt = Number.NEGATIVE_INFINITY;
let optionsFilterTimer = null;
let pvSanComputeTimer = null;
let pvSanPending = null;
let infoFlushTimer = null;
let pendingInfoPatch = null;
const pendingPvInfoMap = new Map();
let chartResizeObserver = null;
let chartResizeFrame = null;
let pgnDirty = true;
let pgnSyncTimer = null;
let sessionSaveTimer = null;
let batchRowId = 0;
const batchNodeMap = new Map();
let engineLoadPromise = null;
let engineLoadToken = 0;
let engineLoadProgress = { loaded: 0, total: 0 };
let deferredEngineKey = "auto";
let engineUiState = "idle";
let engineFailureMessage = "";
let engineReady = false;
let engineReadyPromise = null;
let resolveEngineReadyPromise = null;
const queuedEngineActions = [];
let analysisRestartTimer = null;
let analysisRestartQueued = false;
const batchStatusStats = {
  total: 0,
  queued: 0,
  running: 0,
  done: 0,
  failed: 0,
};

function normalizeBatchStatus(status) {
  if (status === "running" || status === "done" || status === "failed") {
    return status;
  }
  return "queued";
}

function resetBatchStatusStats() {
  batchStatusStats.total = 0;
  batchStatusStats.queued = 0;
  batchStatusStats.running = 0;
  batchStatusStats.done = 0;
  batchStatusStats.failed = 0;
}

function updateBatchItemStatus(item, nextStatus) {
  if (!item) return;
  const prev = normalizeBatchStatus(item.status);
  const next = normalizeBatchStatus(nextStatus);
  if (prev === next) return;
  if (batchStatusStats[prev] > 0) {
    batchStatusStats[prev] -= 1;
  }
  batchStatusStats[next] += 1;
  item.status = next;
}

function addBatchQueueItem(fen) {
  const item = { id: `batch-${++batchRowId}`, fen, status: "queued" };
  batchQueue.push(item);
  batchStatusStats.total += 1;
  batchStatusStats.queued += 1;
  return item;
}

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

function flushPendingInfo() {
  const info = pendingInfoPatch;
  const pendingPvEntries =
    pendingPvInfoMap.size > 0 ? [...pendingPvInfoMap.entries()] : [];
  pendingInfoPatch = null;
  pendingPvInfoMap.clear();

  if (!info && pendingPvEntries.length === 0) return;

  let shouldRenderUi = false;

  if (info) {
    if (mergeObjectShallow(latestInfo, info)) {
      shouldRenderUi = true;
    }
    if (shouldRecordEvalSample(info)) {
      addEvalSample(info);
      shouldRenderUi = true;
    }
    if (shouldUpdateMoveMeta(info)) {
      updateMoveMetaFromInfo(info);
      shouldRenderUi = true;
    }
    if (batchAwaiting && batchCurrent) {
      mergeObjectShallow(batchCurrent.info, info);
      if (info.pv && isPrimaryPvInfo(info)) {
        batchCurrent.pv = info.pv;
      }
    }
  }

  let pvChanged = false;
  for (const [pvKey, patch] of pendingPvEntries) {
    let line = pvLines.get(pvKey);
    if (!line) {
      line = { multipv: pvKey };
      pvLines.set(pvKey, line);
      pvChanged = true;
    }
    if (mergeObjectShallow(line, patch)) {
      pvChanged = true;
    }
    if (line.multipv !== pvKey) {
      line.multipv = pvKey;
      pvChanged = true;
    }
  }

  if (pvChanged) {
    pvRenderVersion += 1;
    shouldRenderUi = true;
  }

  if (shouldRenderUi) {
    scheduleUI();
  }
}

function scheduleInfoFlush() {
  if (infoFlushTimer) return;
  infoFlushTimer = setTimeout(() => {
    infoFlushTimer = null;
    flushPendingInfo();
  }, ENGINE_INFO_FLUSH_INTERVAL_MS);
}

function clearPendingInfoQueue() {
  if (infoFlushTimer) {
    clearTimeout(infoFlushTimer);
    infoFlushTimer = null;
  }
  pendingInfoPatch = null;
  pendingPvInfoMap.clear();
}

function queueIncomingInfo(info) {
  if (!info) return;
  if (!pendingInfoPatch) {
    pendingInfoPatch = {};
  }
  mergeObjectShallow(pendingInfoPatch, info);

  if (
    info.pv ||
    info.multipv ||
    typeof info.depth === "number" ||
    typeof info.seldepth === "number" ||
    info.score
  ) {
    const pvKey = info.multipv || 1;
    let patch = pendingPvInfoMap.get(pvKey);
    if (!patch) {
      patch = { multipv: pvKey };
      pendingPvInfoMap.set(pvKey, patch);
    }
    mergeObjectShallow(patch, info);
    if (patch.multipv !== pvKey) {
      patch.multipv = pvKey;
    }
  }

  scheduleInfoFlush();
}

function moveToUci(move) {
  if (!move) return "";
  return `${move.from || ""}${move.to || ""}${move.promotion || ""}`;
}

function rebuildHistoryCache() {
  if (!game) {
    historySanCache = [];
    historyVerboseCache = [];
    historyPlyCache = 0;
    historyUciCache = [];
    historyUciJoined = "";
    return;
  }
  historySanCache = game.history();
  historyVerboseCache = game.history({ verbose: true });
  historyPlyCache = historySanCache.length;
  historyUciCache = historyVerboseCache.map((move) => moveToUci(move));
  historyUciJoined = historyUciCache.join(" ");
}

function appendHistoryMove(move) {
  if (!move) return;
  const san = move.san || "";
  historySanCache.push(san);
  historyVerboseCache.push({
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    color: move.color,
    san,
  });
  const uci = moveToUci(move);
  historyUciCache.push(uci);
  historyUciJoined = historyUciJoined ? `${historyUciJoined} ${uci}` : uci;
  historyPlyCache = historySanCache.length;
}

function popHistoryMove() {
  if (!historyPlyCache) return;
  historySanCache.pop();
  historyVerboseCache.pop();
  historyUciCache.pop();
  historyPlyCache = historySanCache.length;
  historyUciJoined = historyUciCache.join(" ");
}

function collectChangedSquaresFromMove(move, into = new Set()) {
  if (!move) return into;
  if (move.from) into.add(move.from);
  if (move.to) into.add(move.to);
  const flags = String(move.flags || "");
  const color = move.color === "b" ? "b" : "w";

  if (flags.includes("e") && move.to && move.to.length === 2) {
    const file = move.to[0];
    const rank = Number(move.to[1]);
    const captureRank = color === "w" ? rank - 1 : rank + 1;
    if (Number.isFinite(captureRank) && captureRank >= 1 && captureRank <= 8) {
      into.add(`${file}${captureRank}`);
    }
  }

  if (flags.includes("k")) {
    if (color === "w") {
      into.add("h1");
      into.add("f1");
    } else {
      into.add("h8");
      into.add("f8");
    }
  } else if (flags.includes("q")) {
    if (color === "w") {
      into.add("a1");
      into.add("d1");
    } else {
      into.add("a8");
      into.add("d8");
    }
  }

  return into;
}

const isTypingTarget = (target) => {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "BUTTON" ||
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
    script.src = "vendor/chess.min.js?v=20260209e";
    script.dataset.chessLib = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
};

const initGame = () => {
  if (!globalThis.Chess) return false;
  if (!game) game = new globalThis.Chess();
  const restoredFen = typeof sessionState.fen === "string" ? sessionState.fen.trim() : "";
  if (restoredFen) {
    const loaded = game.load(restoredFen);
    if (!loaded) {
      game.reset();
    }
  }
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
  const isPlay = mode === "play";
  btnPanelPlay.classList.toggle("active", isPlay);
  btnPanelAnalysis.classList.toggle("active", !isPlay);
  btnPanelPlay.setAttribute("aria-selected", isPlay ? "true" : "false");
  btnPanelAnalysis.setAttribute("aria-selected", isPlay ? "false" : "true");
  btnPanelPlay.tabIndex = isPlay ? 0 : -1;
  btnPanelAnalysis.tabIndex = isPlay ? -1 : 0;
  document.body.classList.toggle("panel-mode-play", isPlay);
  document.body.classList.toggle("panel-mode-analysis", !isPlay);
  if (panelRight) panelRight.setAttribute("aria-hidden", "false");
  if (panelBottom) panelBottom.setAttribute("aria-hidden", isPlay ? "true" : "false");
  scheduleSessionSave();
  scheduleUI();
};

let activeMenuName = "";
let sessionState = readStoredSessionState();

function readStoredSessionState() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function normalizeStoredPanelMode(value) {
  return value === "analysis" ? "analysis" : "play";
}

function normalizeStoredEngineVariant(value) {
  if (typeof value !== "string" || !engineSelect) return "auto";
  const option = [...engineSelect.options].find((entry) => entry.value === value);
  return option ? value : "auto";
}

function persistSessionState() {
  const next = {
    ...sessionState,
    panelMode: normalizeStoredPanelMode(
      document.body.classList.contains("panel-mode-analysis") ? "analysis" : "play"
    ),
    engineVariant: normalizeStoredEngineVariant(deferredEngineKey || engineSelect?.value || "auto"),
    boardFlipped: Boolean(boardFlipped),
  };
  if (game) {
    next.fen = game.fen();
  }
  sessionState = next;
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    // ignore storage failures
  }
}

function scheduleSessionSave() {
  if (sessionSaveTimer) return;
  sessionSaveTimer = setTimeout(() => {
    sessionSaveTimer = null;
    persistSessionState();
  }, SESSION_SAVE_DEBOUNCE_MS);
}

function setUiMode(mode, options = {}) {
  const { persist = true } = options;
  const advanced = mode === "advanced";
  document.body.classList.toggle("ui-advanced", advanced);
  if (btnUiMode) {
    btnUiMode.textContent = advanced ? "Mode: Advanced" : "Mode: Basic";
    btnUiMode.setAttribute("aria-pressed", advanced ? "true" : "false");
  }
  if (!persist) return;
  try {
    localStorage.setItem(UI_MODE_STORAGE_KEY, advanced ? "advanced" : "basic");
  } catch (err) {
    // ignore storage failures
  }
}

function initUiMode() {
  let mode = "basic";
  try {
    const saved = localStorage.getItem(UI_MODE_STORAGE_KEY);
    if (saved === "advanced") mode = "advanced";
  } catch (err) {
    // ignore storage failures
  }
  setUiMode(mode, { persist: false });
  if (btnUiMode) {
    btnUiMode.addEventListener("click", () => {
      const isAdvanced = document.body.classList.contains("ui-advanced");
      setUiMode(isAdvanced ? "basic" : "advanced");
    });
  }
}

const resetMenuAdvancedState = () => {
  document.querySelectorAll(".topbar-menu").forEach((menu) => {
    menu.classList.remove("show-advanced");
  });
  document.querySelectorAll("[data-menu-advanced-toggle]").forEach((button) => {
    button.textContent = "Show Advanced";
    button.setAttribute("aria-expanded", "false");
  });
};

const closeHeaderMenus = () => {
  activeMenuName = "";
  resetMenuAdvancedState();
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

  document.querySelectorAll("[data-menu-advanced-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = button.closest(".topbar-menu");
      if (!menu) return;
      const expanded = menu.classList.toggle("show-advanced");
      button.textContent = expanded ? "Hide Advanced" : "Show Advanced";
      button.setAttribute("aria-expanded", expanded ? "true" : "false");
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
  if (kind === "out" && line.startsWith("info ")) {
    return;
  }
  const prefix = kind === "in" ? ">>" : "<<";
  const entry = `${prefix} ${line}`;
  consoleLines.push(entry);
  if (consoleLines.length > CONSOLE_MAX_LINES) {
    consoleLines.splice(0, consoleLines.length - CONSOLE_MAX_LINES);
    consoleNeedsFullRender = true;
    consoleRenderedLineCount = Math.min(consoleRenderedLineCount, consoleLines.length);
  }
  consoleDirty = true;
  scheduleConsoleFlush();
}

function flushConsole() {
  if (!consoleEl || !consoleDirty) return;
  consoleDirty = false;
  if (consoleNeedsFullRender || consoleRenderedLineCount > consoleLines.length) {
    consoleEl.textContent = consoleLines.join("\n");
    consoleRenderedLineCount = consoleLines.length;
    consoleNeedsFullRender = false;
  } else if (consoleRenderedLineCount < consoleLines.length) {
    const appended = consoleLines.slice(consoleRenderedLineCount).join("\n");
    if (appended) {
      if (consoleEl.textContent) {
        consoleEl.textContent += `\n${appended}`;
      } else {
        consoleEl.textContent = appended;
      }
    }
    consoleRenderedLineCount = consoleLines.length;
  }
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function scheduleConsoleFlush() {
  if (consoleFlushTimer) return;
  consoleFlushTimer = setTimeout(() => {
    consoleFlushTimer = null;
    flushConsole();
  }, CONSOLE_FLUSH_INTERVAL_MS);
}

function scheduleUiResync(delayMs) {
  const delay = Math.max(0, Math.ceil(delayMs));
  const dueAt = performance.now() + delay;
  if (uiRescheduleTimer && dueAt >= uiRescheduleDueAt - 1) return;
  if (uiRescheduleTimer) {
    clearTimeout(uiRescheduleTimer);
    uiRescheduleTimer = null;
  }
  uiRescheduleDueAt = dueAt;
  uiRescheduleTimer = setTimeout(() => {
    uiRescheduleTimer = null;
    uiRescheduleDueAt = Number.POSITIVE_INFINITY;
    scheduleUI();
  }, delay);
}

function getAdaptiveUiFrameIntervalMs() {
  if (typeof window === "undefined") return 0;
  if (window.innerWidth > MOBILE_UI_MAX_WIDTH) return 0;
  const deviceMemory =
    typeof navigator !== "undefined" && typeof navigator.deviceMemory === "number"
      ? navigator.deviceMemory
      : null;
  const hardwareConcurrency =
    typeof navigator !== "undefined" && typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : null;
  const lowEnd =
    (deviceMemory !== null && deviceMemory <= 4) ||
    (hardwareConcurrency !== null && hardwareConcurrency <= 4);
  return lowEnd ? LOW_END_MOBILE_UI_FRAME_INTERVAL_MS : MOBILE_UI_FRAME_INTERVAL_MS;
}

function scheduleUI() {
  if (pendingFrame) return;
  pendingFrame = true;
  requestAnimationFrame(() => {
    pendingFrame = false;
    const now = performance.now();
    let deferredDelay = Number.POSITIVE_INFINITY;
    const uiFrameInterval = getAdaptiveUiFrameIntervalMs();
    const cadenceDelay =
      uiFrameInterval > 0 && Number.isFinite(lastUiRenderAt)
        ? uiFrameInterval - (now - lastUiRenderAt)
        : 0;

    if (cadenceDelay > 0) {
      deferredDelay = Math.min(deferredDelay, cadenceDelay);
    } else {
      lastUiRenderAt = now;
      updateKpis();
      updateEvalBar();
      if (moveListDirty) {
        moveListDirty = false;
        renderMoveList();
      }
      if (pvRenderedVersion !== pvRenderVersion) {
        pvRenderedVersion = pvRenderVersion;
        renderPvLines();
      }
      if (evalRenderedVersion !== evalRenderVersion) {
        const elapsed = now - lastEvalChartRenderAt;
        if (elapsed >= CHART_RENDER_INTERVAL_MS) {
          evalRenderedVersion = evalRenderVersion;
          renderEvalChart();
          lastEvalChartRenderAt = now;
        } else {
          deferredDelay = Math.min(deferredDelay, CHART_RENDER_INTERVAL_MS - elapsed);
        }
      }
      if (winrateRenderedVersion !== winrateRenderVersion) {
        const elapsed = now - lastWinrateChartRenderAt;
        if (elapsed >= CHART_RENDER_INTERVAL_MS) {
          winrateRenderedVersion = winrateRenderVersion;
          renderWinrateChart();
          lastWinrateChartRenderAt = now;
        } else {
          deferredDelay = Math.min(deferredDelay, CHART_RENDER_INTERVAL_MS - elapsed);
        }
      }
    }

    if (Number.isFinite(deferredDelay)) {
      scheduleUiResync(deferredDelay);
    } else if (uiRescheduleTimer) {
      clearTimeout(uiRescheduleTimer);
      uiRescheduleTimer = null;
      uiRescheduleDueAt = Number.POSITIVE_INFINITY;
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

function setMetricTone(metricEl, tone) {
  if (!metricEl) return;
  const nextTone = tone || "neutral";
  if (metricEl.dataset.tone === nextTone) return;
  const prevTone = metricEl.dataset.tone;
  if (prevTone) {
    metricEl.classList.remove(prevTone);
  } else {
    metricEl.classList.remove("success", "warning", "danger", "neutral");
  }
  metricEl.classList.add(nextTone);
  metricEl.dataset.tone = nextTone;
}

function formatClock(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function updateTopMetrics() {
  const score = latestInfo.score;
  const cp = scoreToCp(score);
  const win = scoreToWinrate(score, getSideToMove());
  const scoreText = Number.isFinite(cp)
    ? `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(2)}`
    : null;
  setText(metricWinrate, Number.isFinite(win) ? `Win ${win.toFixed(1)}%` : "Win —");
  setText(metricScore, scoreText ? `Score ${scoreText}` : "Score —");
  const prevSample = evalHistory.length > 1 ? evalHistory[evalHistory.length - 2] : null;
  const lastSample = evalHistory.length ? evalHistory[evalHistory.length - 1] : null;
  const delta = prevSample && lastSample ? lastSample.cp - prevSample.cp : null;
  setText(metricDelta, Number.isFinite(delta) ? `Δ ${(delta / 100).toFixed(2)}` : "Δ —");

  if (Number.isFinite(win)) {
    setMetricTone(metricWinrate, win >= 55 ? "success" : win <= 45 ? "danger" : "warning");
  } else {
    setMetricTone(metricWinrate, "neutral");
  }
  if (Number.isFinite(cp)) {
    setMetricTone(metricScore, cp >= 20 ? "success" : cp <= -20 ? "danger" : "warning");
  } else {
    setMetricTone(metricScore, "neutral");
  }
  if (Number.isFinite(delta)) {
    setMetricTone(metricDelta, delta >= 15 ? "success" : delta <= -15 ? "danger" : "neutral");
  } else {
    setMetricTone(metricDelta, "neutral");
  }
}

function updateSessionStatus() {
  if (!panelToolbarStatus) return;
  if (batchRunning) {
    const total = batchStatusStats.total;
    const done = batchStatusStats.done;
    setText(panelToolbarStatus, total ? `Batch ${done}/${total}` : "Batch");
    return;
  }
  if (engineUiState === "loading" || (!engineReady && engine.worker)) {
    const queued = queuedEngineActions.length;
    setText(panelToolbarStatus, queued ? `Engine starting • queued ${queued}` : "Engine starting");
    return;
  }
  if (analysisActive) {
    setText(panelToolbarStatus, `Analyzing ${formatClock(infoClockMs(latestInfo))}`);
    return;
  }
  if (awaitingBestMoveApply) {
    setText(panelToolbarStatus, "Awaiting engine");
    return;
  }
  if (autoPlay) {
    setText(panelToolbarStatus, "Auto play");
    return;
  }
  setText(panelToolbarStatus, "Idle");
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
  updateTopMetrics();
  updateSessionStatus();
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

function rememberPvSan(cacheKey, san) {
  pvSanCache.set(cacheKey, san);
  while (pvSanCache.size > PV_SAN_CACHE_LIMIT) {
    const oldest = pvSanCache.keys().next().value;
    if (oldest === undefined) break;
    pvSanCache.delete(oldest);
  }
}

function processPendingPvSan() {
  if (!pvSanPending) return;
  const job = pvSanPending;
  pvSanPending = null;
  if (pvSanCache.has(job.cacheKey)) return;
  const san = uciLineToSan(job.pv, job.baseFen);
  rememberPvSan(job.cacheKey, san);
  pvRenderVersion += 1;
  scheduleUI();
}

function schedulePvSanConversion(cacheKey, pv, baseFen) {
  if (!pv || pvSanCache.has(cacheKey)) return;
  pvSanPending = { cacheKey, pv, baseFen };
  if (pvSanComputeTimer) return;
  pvSanComputeTimer = setTimeout(() => {
    pvSanComputeTimer = null;
    processPendingPvSan();
    if (pvSanPending) {
      schedulePvSanConversion(
        pvSanPending.cacheKey,
        pvSanPending.pv,
        pvSanPending.baseFen
      );
    }
  }, PV_SAN_DEBOUNCE_MS);
}

function renderPvLines() {
  const sorted = [...pvLines.values()].sort((a, b) => (a.multipv || 1) - (b.multipv || 1));
  const baseFen = currentFen();
  const cachePrefix = `${baseFen}::`;
  const seen = new Set();
  sorted.forEach((line, index) => {
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
    if (line.pv && key === 1) {
      const cacheKey = `${cachePrefix}${line.pv}`;
      const cachedSan = pvSanCache.get(cacheKey);
      if (cachedSan === undefined) {
        node.san.textContent = "…";
        schedulePvSanConversion(cacheKey, line.pv, baseFen);
      } else {
        node.san.textContent = cachedSan;
      }
    } else {
      node.san.textContent = "";
    }
    const anchor = pvLinesEl.children[index] || null;
    if (node.row !== anchor) {
      pvLinesEl.insertBefore(node.row, anchor);
    }
    seen.add(key);
  });
  for (const [key, node] of pvNodeMap.entries()) {
    if (!seen.has(key)) {
      node.row.remove();
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
  const rowIndex = ply - 1;
  if (
    moveListEl &&
    rowIndex >= 0 &&
    rowIndex < historySanCache.length &&
    moveListEl.children.length > rowIndex
  ) {
    renderMoveRow(rowIndex, historySanCache[rowIndex]);
  } else {
    moveListDirty = true;
  }
}

function highlightPvMove(pv) {
  if (!pv) return;
  const first = pv.split(/\s+/)[0];
  highlightBestMove(first);
}

function getCanvasPixelRatio() {
  if (typeof window === "undefined") return 1;
  const ratio = Number(window.devicePixelRatio) || 1;
  return Math.max(1, Math.min(2, ratio));
}

function resizeCanvasForDisplay(canvas) {
  if (!canvas) return false;
  const ratio = getCanvasPixelRatio();
  const cssWidth = canvas.clientWidth || Number(canvas.getAttribute("width")) || canvas.width || 1;
  const cssHeight = canvas.clientHeight || Number(canvas.getAttribute("height")) || canvas.height || 1;
  const width = Math.max(1, Math.round(cssWidth * ratio));
  const height = Math.max(1, Math.round(cssHeight * ratio));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  canvas.dataset.pixelRatio = String(ratio);
  return true;
}

function getCanvasDrawSize(canvas) {
  const ratio = Number(canvas.dataset.pixelRatio) || 1;
  return {
    ratio,
    width: Math.max(1, canvas.width / ratio),
    height: Math.max(1, canvas.height / ratio),
  };
}

function refreshChartCanvasSizes() {
  let changed = false;
  [evalChart, winrateChart, winrateChartLeft, batchChart].forEach((canvas) => {
    if (resizeCanvasForDisplay(canvas)) {
      changed = true;
    }
  });
  return changed;
}

function scheduleChartResizeRefresh() {
  if (chartResizeFrame || typeof window === "undefined") return;
  chartResizeFrame = window.requestAnimationFrame(() => {
    chartResizeFrame = null;
    if (!refreshChartCanvasSizes()) return;
    evalRenderedVersion = -1;
    winrateRenderedVersion = -1;
    renderBatchChart();
    scheduleUI();
  });
}

function initChartCanvasSizing() {
  refreshChartCanvasSizes();
  if (typeof window === "undefined") return;
  window.addEventListener("resize", scheduleChartResizeRefresh, { passive: true });
  if (typeof window.ResizeObserver === "function") {
    chartResizeObserver = new window.ResizeObserver(() => {
      scheduleChartResizeRefresh();
    });
    [evalChart, winrateChart, winrateChartLeft, batchChart].forEach((canvas) => {
      if (canvas) chartResizeObserver.observe(canvas);
    });
  }
}

function renderEvalChart() {
  if (!evalChart) return;
  resizeCanvasForDisplay(evalChart);
  const ctx = evalChart.getContext("2d");
  if (!ctx) return;
  const { width, height, ratio } = getCanvasDrawSize(evalChart);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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
  resizeCanvasForDisplay(canvas);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height, ratio } = getCanvasDrawSize(canvas);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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
  if (winrateChartLeft && winrateChartLeft.offsetParent !== null) {
    renderWinrateChartTo(winrateChartLeft);
  }
}

function applyOptionsFilter() {
  const filter = optionsFilter?.value?.trim().toLowerCase() || "";
  if (!optionsEl) return;
  optionsEl.querySelectorAll(".option-card").forEach((card) => {
    const name = card.dataset.optionName || "";
    card.hidden = Boolean(filter) && !name.includes(filter);
  });
}

function buildOptions() {
  optionsEl.innerHTML = "";
  const options = [...engine.options.values()];
  options.sort((a, b) => a.name.localeCompare(b.name));
  options.forEach((opt) => {
    const card = document.createElement("div");
    card.className = "option-card";
    card.dataset.optionName = opt.name.toLowerCase();
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

  applyOptionsFilter();
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

function updateCommandAvailability() {
  const disableEngineCommands = batchRunning || engineUiState === "loading";
  engineCommandButtons.forEach((button) => {
    if (!button) return;
    button.disabled = disableEngineCommands;
  });
  if (engineSelect) {
    engineSelect.disabled = batchRunning;
  }
  if (btnBatchRun) {
    btnBatchRun.disabled = batchRunning || engineUiState === "loading";
  }
}

function resolveEngineReady(ready) {
  if (resolveEngineReadyPromise) {
    resolveEngineReadyPromise(Boolean(ready));
  }
  resolveEngineReadyPromise = null;
  engineReadyPromise = null;
}

function createEngineReadyPromise() {
  resolveEngineReady(false);
  engineReadyPromise = new Promise((resolve) => {
    resolveEngineReadyPromise = resolve;
  });
}

function queueEngineAction(action) {
  if (!action || typeof action.run !== "function") return;
  if (engineReady) {
    action.run();
    return;
  }
  const key = action.key || "";
  if (key) {
    const existing = queuedEngineActions.findIndex((item) => item.key === key);
    if (existing >= 0) {
      queuedEngineActions[existing] = { ...action, key };
    } else {
      queuedEngineActions.push({ ...action, key });
    }
  } else {
    queuedEngineActions.push({ ...action, key: "" });
  }
  if (queuedEngineActions.length > MAX_QUEUED_ENGINE_ACTIONS) {
    queuedEngineActions.splice(0, queuedEngineActions.length - MAX_QUEUED_ENGINE_ACTIONS);
  }
  updateEngineWarning();
  scheduleUI();
  ensureEngineReady().catch(() => {});
}

function flushQueuedEngineActions() {
  if (!queuedEngineActions.length || !engineReady) return;
  const pending = queuedEngineActions.splice(0);
  updateEngineWarning();
  pending.forEach((action) => {
    try {
      action.run();
    } catch (err) {
      // ignore queued action failures
    }
  });
}

function updateEngineWarning() {
  updateCommandAvailability();
  const queuedCount = queuedEngineActions.length;
  const queuedSuffix = queuedCount ? ` ${queuedCount} action${queuedCount === 1 ? "" : "s"} queued.` : "";
  if (engineUiState === "loading") {
    const selected = engineVariant?.textContent || "engine";
    const { loaded, total } = engineLoadProgress;
    if (total > 0) {
      const safeLoaded = Math.max(0, Math.min(total, loaded));
      const percent = Math.round((safeLoaded / total) * 100);
      engineWarning.textContent = `Loading ${selected}... ${safeLoaded}/${total} assets (${percent}%).${queuedSuffix}`;
    } else {
      engineWarning.textContent = `Loading ${selected}...${queuedSuffix}`;
    }
    return;
  }
  if (engineUiState === "error") {
    engineWarning.textContent = engineFailureMessage || "Engine failed to load.";
    return;
  }
  if (!engine.worker) {
    const selected = engineVariant?.textContent || "selected variant";
    engineWarning.textContent = `Engine idle. ${selected} will load on first command.`;
    return;
  }
  if (!engineReady) {
    engineWarning.textContent = `Engine starting...${queuedSuffix}`;
    return;
  }
  const usingThreads = engine.supportsThreads;
  const secureContext = typeof window !== "undefined"
    && typeof window.isSecureContext === "boolean"
    ? window.isSecureContext
    : true;
  if (usingThreads) {
    engineWarning.textContent = "Engine ready. Cross-origin isolation active; multi-threaded mode unlocked.";
  } else if (threadsAvailable()) {
    engineWarning.textContent = "Engine ready. Threads are available, but current variant is single-threaded.";
  } else if (!secureContext) {
    engineWarning.textContent = "Engine ready. Threads require HTTPS/localhost + COOP/COEP, so single-threaded mode is active.";
  } else {
    engineWarning.textContent = "Engine ready. Cross-origin isolation is unavailable, so single-threaded mode is active.";
  }
}

async function loadSelectedEngine(key = engineSelect?.value || "auto") {
  const loadToken = ++engineLoadToken;
  deferredEngineKey = key;
  scheduleSessionSave();
  if (engineSelect && engineSelect.value !== key) {
    engineSelect.value = key;
  }
  const spec = engine.resolveSpec(key);
  engineVariant.textContent = spec.label;
  engineThreads.textContent = spec.threads ? "auto" : "1";
  engineHash.textContent = "—";
  optionState.clear();
  engineReady = false;
  engineUiState = "loading";
  engineFailureMessage = "";
  engineLoadProgress = { loaded: 0, total: 0 };
  createEngineReadyPromise();
  updateEngineWarning();
  queueEngineAssetPreload(key);
  await preloadEngineAssets(key, {
    background: false,
    onProgress: (progress) => {
      if (loadToken !== engineLoadToken || engineUiState !== "loading") return;
      const loaded = Number(progress?.loaded) || 0;
      const total = Number(progress?.total) || 0;
      engineLoadProgress = { loaded, total };
      updateEngineWarning();
    },
  }).catch(() => {});
  if (loadToken !== engineLoadToken) return;
  await engine.load(key);
}

function loadEngineAndTrack(key = engineSelect?.value || deferredEngineKey || "auto") {
  const pending = loadSelectedEngine(key)
    .then(() => (engineReadyPromise ? engineReadyPromise : Promise.resolve(false)))
    .then((ready) => Boolean(ready))
    .catch(() => {
      engineReady = false;
      resolveEngineReady(false);
      engineUiState = "error";
      engineFailureMessage = "Engine failed to load.";
      engineLoadProgress = { loaded: 0, total: 0 };
      updateEngineWarning();
      return false;
    });
  engineLoadPromise = pending;
  pending.finally(() => {
    if (engineLoadPromise === pending) {
      engineLoadPromise = null;
    }
  });
  return pending;
}

function ensureEngineReady(key = engineSelect?.value || deferredEngineKey || "auto") {
  if (engineReady) return Promise.resolve(true);
  if (engineLoadPromise) return engineLoadPromise;
  if (engine.worker && engineReadyPromise) return engineReadyPromise;
  return loadEngineAndTrack(key);
}

function scheduleIdleTask(callback, timeoutMs = ENGINE_PREWARM_IDLE_TIMEOUT_MS) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: timeoutMs });
    return;
  }
  setTimeout(callback, Math.min(400, timeoutMs));
}

function shouldPrewarmEngine() {
  if (typeof navigator === "undefined") return true;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (connection) {
    if (connection.saveData) return false;
    const effectiveType = String(connection.effectiveType || "").toLowerCase();
    if (effectiveType.includes("2g") || effectiveType.includes("3g")) {
      return false;
    }
  }
  const deviceMemory =
    typeof navigator.deviceMemory === "number" ? navigator.deviceMemory : null;
  const cores =
    typeof navigator.hardwareConcurrency === "number" ? navigator.hardwareConcurrency : null;
  if (deviceMemory !== null && deviceMemory <= 4) return false;
  if (cores !== null && cores <= 4) return false;
  return true;
}

function queueInitialEnginePrewarm() {
  if (!shouldPrewarmEngine()) return;
  scheduleIdleTask(() => {
    if (engine.worker || engineLoadPromise) return;
    loadEngineAndTrack(deferredEngineKey || "auto").catch(() => {});
  });
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
  if (!engine.worker) return false;
  const fen = currentFen();
  if (fen === "startpos") {
    engine.send("position startpos");
    return true;
  }
  engine.send(`position fen ${fen}`);
  return true;
}

async function sendEngineCommand(cmd, options = {}) {
  const { log = true, includePosition = false, queueIfLoading = true } = options;
  if (!engineReady) {
    if (queueIfLoading) {
      queueEngineAction({
        key: `cmd:${cmd}`,
        label: cmd,
        run: () => {
          sendEngineCommand(cmd, { ...options, queueIfLoading: false }).catch(() => {});
        },
      });
      return true;
    }
    const ready = await ensureEngineReady();
    if (!ready) return false;
  }
  if (includePosition && !sendPosition()) return false;
  engine.send(cmd);
  if (log) logLine(cmd, "in");
  return true;
}

function clearPendingAnalysisRestart() {
  if (analysisRestartTimer) {
    clearTimeout(analysisRestartTimer);
    analysisRestartTimer = null;
  }
  analysisRestartQueued = false;
}

function scheduleAnalysisRestart(delayMs = 40) {
  const delay = Math.max(0, Math.ceil(delayMs));
  analysisRestartQueued = true;
  if (analysisRestartTimer) {
    clearTimeout(analysisRestartTimer);
  }
  analysisRestartTimer = setTimeout(() => {
    analysisRestartTimer = null;
    if (!analysisRestartQueued) return;
    analysisRestartQueued = false;
    startAnalysis("infinite").catch(() => {});
  }, delay);
}

async function startAnalysis(mode = "infinite", options = {}) {
  const { queueIfLoading = true, searchmoves: queuedSearchmoves = null } = options;
  clearPendingAnalysisRestart();
  clearPendingInfoQueue();
  const searchmoves = typeof queuedSearchmoves === "string"
    ? queuedSearchmoves
    : searchmovesInput.value.trim();
  if (!engineReady) {
    if (queueIfLoading) {
      queueEngineAction({
        key: "analysis:start",
        label: `go ${mode}`,
        run: () => {
          startAnalysis(mode, {
            ...options,
            queueIfLoading: false,
            searchmoves,
          }).catch(() => {});
        },
      });
      return;
    }
    const ready = await ensureEngineReady();
    if (!ready) return;
  }
  if (!sendPosition()) return;
  pvLines.clear();
  evalHistory = [];
  pvRenderVersion += 1;
  evalRenderVersion += 1;
  winrateRenderVersion += 1;
  analysisStart = performance.now();
  resetInfoSamplingState();
  const suffix = searchmoves ? ` searchmoves ${searchmoves}` : "";
  engine.send(`go ${mode}${suffix}`);
  logLine(`go ${mode}${suffix}`.trim(), "in");
  analysisActive = mode === "infinite";
  setAnalyzePillState(analysisActive);
  scheduleUI();
}

function stopAnalysis(options = {}) {
  const { keepRestartQueue = false } = options;
  if (!keepRestartQueue) {
    clearPendingAnalysisRestart();
  }
  if (!engine.worker) {
    analysisActive = false;
    setAnalyzePillState(false);
    scheduleUI();
    return;
  }
  engine.send("stop");
  logLine("stop", "in");
  analysisActive = false;
  setAnalyzePillState(false);
  scheduleUI();
}

function stopAutoPlay() {
  autoPlay = false;
  awaitingBestMoveApply = false;
  btnAutoPlay.textContent = "Auto Play: Off";
  scheduleUI();
}

function jumpBack(count) {
  if (!game) return;
  const previousPly = historyPlyCache;
  const changedSquares = new Set();
  let moved = false;
  for (let i = 0; i < count; i += 1) {
    const move = game.undo();
    if (!move) break;
    collectChangedSquaresFromMove(move, changedSquares);
    redoStack.push(move);
    popHistoryMove();
    if (moveMeta.length) moveMeta.pop();
    moved = true;
  }
  if (moved) afterPositionChange({ previousPly, changedSquares });
}

function jumpForward(count) {
  if (!game) return;
  const previousPly = historyPlyCache;
  const changedSquares = new Set();
  let moved = false;
  for (let i = 0; i < count; i += 1) {
    const move = redoStack.pop();
    if (!move) break;
    const replayed = game.move(move);
    if (!replayed) break;
    collectChangedSquaresFromMove(replayed, changedSquares);
    appendHistoryMove(replayed);
    moveMeta.push({});
    moved = true;
  }
  if (moved) afterPositionChange({ previousPly, changedSquares });
}

function navigateStart() {
  if (!game) return;
  const previousPly = historyPlyCache;
  const totalMoves = historyPlyCache;
  for (let i = 0; i < totalMoves; i += 1) {
    const move = game.undo();
    if (!move) break;
    redoStack.push(move);
    popHistoryMove();
    if (moveMeta.length) moveMeta.pop();
  }
  afterPositionChange({ previousPly });
}

function navigateEnd() {
  if (!game) return;
  const previousPly = historyPlyCache;
  while (redoStack.length) {
    const move = redoStack.pop();
    if (!move) break;
    const replayed = game.move(move);
    if (!replayed) break;
    appendHistoryMove(replayed);
    moveMeta.push({});
  }
  afterPositionChange({ previousPly });
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
  if (optionsFilter) optionsFilter.value = "";
  buildOptions();
  applyPerformanceProfile();
  engine.send("isready");
});
engine.on("readyok", () => {
  engineReady = true;
  resolveEngineReady(true);
  engineUiState = "ready";
  engineFailureMessage = "";
  engineLoadProgress = { loaded: 0, total: 0 };
  updateEngineWarning();
  flushQueuedEngineActions();
});
engine.on("info", (info) => {
  queueIncomingInfo(info);
});
engine.on("infoString", () => {
  // console already receives raw output
});
engine.on("bestmove", (move) => {
  flushPendingInfo();
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
  scheduleUI();
});
engine.on("error", (err) => {
  flushPendingInfo();
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
    engineReady = false;
    resolveEngineReady(false);
    engineUiState = "error";
    engineFailureMessage = `Engine error: ${message}`;
    engineLoadProgress = { loaded: 0, total: 0 };
    updateEngineWarning();
  }
});

engineSelect.addEventListener("change", () => {
  deferredEngineKey = engineSelect.value || "auto";
  scheduleSessionSave();
  if (engine.worker || engineLoadPromise) {
    loadEngineAndTrack(deferredEngineKey).catch(() => {});
    return;
  }
  const spec = engine.resolveSpec(deferredEngineKey);
  engineVariant.textContent = spec.label;
  engineThreads.textContent = spec.threads ? "auto" : "1";
  engineHash.textContent = "—";
  optionState.clear();
  queueEngineAssetPreload(deferredEngineKey);
  updateEngineWarning();
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
  [btnPanelPlay, btnPanelAnalysis].forEach((tab) => {
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      setPanelMode(tab === btnPanelPlay ? "analysis" : "play");
      (tab === btnPanelPlay ? btnPanelAnalysis : btnPanelPlay).focus();
    });
  });
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
  scheduleUI();
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
  sendEngineCommand("isready");
});

btnUciNew.addEventListener("click", () => {
  sendEngineCommand("ucinewgame");
});

btnPonderHit.addEventListener("click", () => {
  sendEngineCommand("ponderhit");
});

btnClearHash.addEventListener("click", () => {
  sendEngineCommand("setoption name Clear Hash value true");
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
  sendEngineCommand("eval", { includePosition: true });
});

btnDisplay.addEventListener("click", () => {
  sendEngineCommand("d", { includePosition: true });
});

btnCompiler.addEventListener("click", () => {
  sendEngineCommand("compiler");
});

btnPerft.addEventListener("click", () => {
  const depth = Number(perftInput.value) || 4;
  sendEngineCommand(`go perft ${depth}`, { includePosition: true });
});

btnFlipEngine.addEventListener("click", () => {
  sendEngineCommand("flip");
});

btnRefreshOptions.addEventListener("click", () => {
  sendEngineCommand("uci");
});

optionsFilter.addEventListener("input", () => {
  if (optionsFilterTimer) {
    clearTimeout(optionsFilterTimer);
  }
  optionsFilterTimer = setTimeout(() => {
    optionsFilterTimer = null;
    applyOptionsFilter();
  }, OPTIONS_FILTER_DEBOUNCE_MS);
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
  sendEngineCommand(cmd).then((sent) => {
    if (sent) {
      uciInput.value = "";
    }
  });
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
  if (consoleFlushTimer) {
    clearTimeout(consoleFlushTimer);
    consoleFlushTimer = null;
  }
  consoleLines.length = 0;
  consoleDirty = true;
  consoleNeedsFullRender = true;
  consoleRenderedLineCount = 0;
  flushConsole();
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
  const seen = new Set();
  batchQueue.forEach((item, index) => {
    if (!item.id) item.id = `batch-${++batchRowId}`;
    let node = batchNodeMap.get(item.id);
    if (!node) {
      const row = document.createElement("div");
      row.className = "list-item";
      const idx = document.createElement("strong");
      const fen = document.createElement("span");
      fen.className = "batch-fen";
      const statusTag = document.createElement("span");
      statusTag.className = "move-tag";
      row.appendChild(idx);
      row.appendChild(fen);
      row.appendChild(statusTag);
      node = { row, idx, fen, statusTag };
      batchNodeMap.set(item.id, node);
    }
    const status = normalizeBatchStatus(item.status);
    item.status = status;
    node.idx.textContent = `#${index + 1}`;
    node.fen.textContent = item.fen;
    node.statusTag.textContent = status;
    const anchor = batchList.children[index] || null;
    if (node.row !== anchor) {
      batchList.insertBefore(node.row, anchor);
    }
    seen.add(item.id);
  });
  for (const [id, node] of batchNodeMap.entries()) {
    if (seen.has(id)) continue;
    node.row.remove();
    batchNodeMap.delete(id);
  }
  renderBatchChart();
}

function renderBatchChart() {
  if (!batchChart || !batchStatus) return;
  const total = batchStatusStats.total;
  const done = batchStatusStats.done;
  const running = batchStatusStats.running;
  const queued = batchStatusStats.queued;
  batchStatus.textContent = total
    ? `Completed ${done}/${total} • Running ${running} • Queued ${queued}`
    : "No batch running.";
  resizeCanvasForDisplay(batchChart);
  const ctx = batchChart.getContext("2d");
  if (!ctx) return;
  const { width, height, ratio } = getCanvasDrawSize(batchChart);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
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
  lines.forEach((fen) => addBatchQueueItem(fen));
  batchInput.value = "";
  renderBatchList();
}

btnBatchAddCurrent.addEventListener("click", () => {
  if (!game) return;
  addBatchQueueItem(game.fen());
  renderBatchList();
});

btnBatchClear.addEventListener("click", () => {
  batchQueue = [];
  batchResults = [];
  resetBatchStatusStats();
  renderBatchList();
  renderBatchChart();
  scheduleUI();
});

btnBatchRun.addEventListener("click", async () => {
  if (batchRunning) return;
  parseBatchInput();
  if (!batchQueue.length) return;
  const ready = await ensureEngineReady();
  if (!ready) return;
  batchRunning = true;
  updateCommandAvailability();
  batchResults = [];
  stopAnalysis();
  autoPlay = false;
  awaitingBestMoveApply = false;
  btnAutoPlay.textContent = "Auto Play: Off";
  scheduleUI();
  renderBatchChart();
  for (const item of batchQueue) {
    updateBatchItemStatus(item, "running");
    renderBatchList();
    const result = await analyzeFen(item.fen);
    updateBatchItemStatus(item, result.error ? "failed" : "done");
    batchResults.push(result);
    renderBatchList();
  }
  batchRunning = false;
  updateCommandAvailability();
  renderBatchChart();
  scheduleUI();
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

function squareToScreen(square) {
  if (!square || square.length < 2) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  if (boardFlipped) {
    return { x: 7 - file, y: rank - 1 };
  }
  return { x: file, y: 8 - rank };
}

function screenToSquare(x, y) {
  if (x < 0 || x > 7 || y < 0 || y > 7) return null;
  if (boardFlipped) {
    const file = String.fromCharCode(97 + (7 - x));
    return `${file}${y + 1}`;
  }
  const file = String.fromCharCode(97 + x);
  return `${file}${8 - y}`;
}

function setFocusedSquare(square, options = {}) {
  if (!boardSquareMap.size) return;
  if (!boardSquareMap.has(square)) {
    square = boardSquareMap.keys().next().value;
  }
  if (!square) return;
  focusedSquare = square;
  boardSquareMap.forEach((el, key) => {
    el.tabIndex = key === focusedSquare ? 0 : -1;
  });
  if (options.focus) {
    const el = boardSquareMap.get(focusedSquare);
    if (el) el.focus();
  }
}

function moveBoardFocus(dx, dy) {
  const base = focusedSquare && boardSquareMap.has(focusedSquare)
    ? focusedSquare
    : boardSquareMap.keys().next().value;
  const pos = squareToScreen(base);
  if (!pos) return false;
  const nextSquare = screenToSquare(pos.x + dx, pos.y + dy);
  if (!nextSquare || !boardSquareMap.has(nextSquare)) return false;
  setFocusedSquare(nextSquare, { focus: true });
  return true;
}

function ensureBoardKeyboardBinding() {
  const boardEl = $("board");
  if (!boardEl || boardEl.dataset.boundKeyboard) return;
  boardEl.addEventListener("keydown", (event) => {
    const target = event.target;
    const squareEl = target instanceof Element ? target.closest(".square[data-square]") : null;
    if (squareEl && squareEl.dataset.square) {
      setFocusedSquare(squareEl.dataset.square);
    }
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveBoardFocus(-1, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveBoardFocus(1, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveBoardFocus(0, -1);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveBoardFocus(0, 1);
        break;
      case "Enter":
      case " ":
      case "Spacebar":
        if (!focusedSquare) return;
        event.preventDefault();
        onSquareClick(focusedSquare);
        break;
      default:
        break;
    }
  });
  boardEl.dataset.boundKeyboard = "true";
}

function renderBoardSquares() {
  const boardEl = $("board");
  if (!boardEl || !game) return;
  boardEl.innerHTML = "";
  boardSquareMap.clear();
  boardPieceMap.clear();
  selectionHighlightSquares = new Set();
  bestHighlightSquares = new Set();
  lastHighlightSquares = new Set();
  pvHighlightSquares = new Set();

  const files = boardFlipped ? ["h", "g", "f", "e", "d", "c", "b", "a"] : ["a", "b", "c", "d", "e", "f", "g", "h"];
  const ranks = boardFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];

  ranks.forEach((rank) => {
    files.forEach((file) => {
      const square = `${file}${rank}`;
      const button = document.createElement("button");
      button.type = "button";
      const fileIndex = "abcdefgh".indexOf(file) + 1;
      const light = (rank + fileIndex) % 2 !== 0;
      button.className = `square ${light ? "light" : "dark"}`;
      button.dataset.square = square;
      button.setAttribute("role", "gridcell");
      button.setAttribute("aria-label", `${square}, empty`);
      button.setAttribute("aria-selected", "false");
      button.tabIndex = -1;
      button.addEventListener("click", () => {
        setFocusedSquare(square);
        onSquareClick(square);
      });
      boardEl.appendChild(button);
      boardSquareMap.set(square, button);
    });
  });

  if (!boardSquareMap.has(focusedSquare)) {
    focusedSquare = boardFlipped ? "e7" : "e2";
  }
  setFocusedSquare(focusedSquare);
}

function updateBoardSquare(square) {
  if (!game) return;
  const squareEl = boardSquareMap.get(square);
  if (!squareEl) return;
  const piece = game.get(square);
  const pieceKey = piece ? `${piece.color}${piece.type.toUpperCase()}` : "";
  const color = piece?.color === "w" ? "white" : "black";
  const type = piece ? PIECE_NAMES[piece.type.toUpperCase()] || "piece" : "empty";
  squareEl.setAttribute("aria-label", piece ? `${square}, ${color} ${type}` : `${square}, empty`);
  if (boardPieceMap.get(square) === pieceKey) return;
  boardPieceMap.set(square, pieceKey);
  squareEl.textContent = "";
  if (!pieceKey) return;
  const img = document.createElement("img");
  img.alt = `${color} ${type}`;
  img.src = `./assets/pieces/${pieceKey}.png`;
  squareEl.appendChild(img);
}

function updateBoardPieces(changedSquares = null) {
  if (!game) return;
  if (changedSquares && changedSquares.size) {
    changedSquares.forEach((square) => updateBoardSquare(square));
    return;
  }
  boardSquareMap.forEach((_, square) => {
    updateBoardSquare(square);
  });
}

function clearSelectionHighlights() {
  selectionHighlightSquares.forEach((sq) => {
    sq.classList.remove("selected", "legal", "capture");
    sq.setAttribute("aria-selected", "false");
  });
  selectionHighlightSquares.clear();
}

function clearBestMoveHighlights() {
  bestHighlightSquares.forEach((sq) => {
    sq.classList.remove("best-from", "best-to");
  });
  bestHighlightSquares.clear();
}

function clearLastMoveHighlights() {
  lastHighlightSquares.forEach((sq) => {
    sq.classList.remove("last-from", "last-to");
  });
  lastHighlightSquares.clear();
}

function highlightMoves(moves) {
  clearSelectionHighlights();
  if (!moves.length) return;
  const from = moves[0].from;
  const fromEl = boardSquareMap.get(from);
  if (fromEl) {
    fromEl.classList.add("selected");
    fromEl.setAttribute("aria-selected", "true");
    selectionHighlightSquares.add(fromEl);
  }
  legalTargets.clear();

  moves.forEach((move) => {
    legalTargets.add(move.to);
    const targetEl = boardSquareMap.get(move.to);
    if (!targetEl) return;
    if (move.captured) {
      targetEl.classList.add("capture");
    } else {
      targetEl.classList.add("legal");
    }
    selectionHighlightSquares.add(targetEl);
  });
}

function onSquareClick(square) {
  if (!game) return;
  setFocusedSquare(square);
  const moves = game.moves({ square, verbose: true });

  if (selectedSquare && legalTargets.has(square)) {
    const previousPly = historyPlyCache;
    const selectedMoves = game.moves({ square: selectedSquare, verbose: true });
    const promotionMove = selectedMoves.find((m) => m.to === square && m.promotion);
    const promotion = promotionMove ? promotionMove.promotion : "q";
    const move = game.move({ from: selectedSquare, to: square, promotion });
    if (move) {
      undoStack.push(move);
      redoStack.length = 0;
      appendHistoryMove(move);
      afterPositionChange({
        previousPly,
        changedSquares: collectChangedSquaresFromMove(move),
      });
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

function syncFenPgn(options = {}) {
  if (!game) return;
  const { syncPgn = true, forcePgn = false } = options;
  const fen = game.fen();
  if (fenInput.value !== fen) fenInput.value = fen;
  if (syncPgn) {
    if (forcePgn) {
      if (pgnSyncTimer) {
        clearTimeout(pgnSyncTimer);
        pgnSyncTimer = null;
      }
      flushPgnSync();
    } else {
      schedulePgnSync();
    }
  } else if (pgnSyncTimer) {
    clearTimeout(pgnSyncTimer);
    pgnSyncTimer = null;
  }
  if (uciMovesInput.value !== historyUciJoined) {
    uciMovesInput.value = historyUciJoined;
  }
}

function flushPgnSync() {
  if (!game || !pgnInput || !pgnDirty) return;
  const pgn = game.pgn();
  if (pgnInput.value !== pgn) pgnInput.value = pgn;
  pgnDirty = false;
}

function schedulePgnSync() {
  if (!pgnDirty || pgnSyncTimer) return;
  pgnSyncTimer = setTimeout(() => {
    pgnSyncTimer = null;
    flushPgnSync();
  }, PGN_SYNC_DEBOUNCE_MS);
}

function ensureMoveListClickBinding() {
  if (!moveListEl) return;
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
}

function ensureMoveRowNodes(item) {
  let nodes = moveRowNodeMap.get(item);
  if (nodes) return nodes;

  item.textContent = "";
  const main = document.createElement("span");
  main.className = "move-main";
  const prefix = document.createElement("strong");
  const move = document.createElement("span");
  move.className = "move-san";
  main.appendChild(prefix);
  main.appendChild(move);

  const meta = document.createElement("span");
  meta.className = "move-meta";
  const delta = document.createElement("span");
  delta.className = "delta neutral";
  delta.hidden = true;
  const label = document.createElement("span");
  label.className = "move-tag";
  label.hidden = true;
  meta.appendChild(delta);
  meta.appendChild(label);

  item.appendChild(main);
  item.appendChild(meta);
  nodes = { prefix, move, meta, delta, label };
  moveRowNodeMap.set(item, nodes);
  return nodes;
}

function renderMoveRow(index, move) {
  if (!moveListEl || !move) return;
  let item = moveListEl.children[index];
  if (!item) {
    item = document.createElement("div");
    item.className = "list-item";
    moveListEl.appendChild(item);
  }
  const nodes = ensureMoveRowNodes(item);
  const moveNumber = Math.floor(index / 2) + 1;
  const prefix = index % 2 === 0 ? `${moveNumber}.` : "...";
  const meta = moveMeta[index];
  const delta = meta?.delta;
  const deltaText = Number.isFinite(delta) ? formatDelta(delta) : "";
  const renderKey = `${prefix}|${move}|${deltaText}|${meta?.label || ""}`;
  const ply = String(index + 1);
  if (item.dataset.ply !== ply) item.dataset.ply = ply;
  if (item.dataset.renderKey === renderKey) return;

  item.dataset.renderKey = renderKey;
  setText(nodes.prefix, prefix);
  setText(nodes.move, move);

  if (deltaText) {
    setText(nodes.delta, deltaText);
    const tone = deltaClass(delta) || "neutral";
    if (nodes.delta.dataset.tone !== tone) {
      nodes.delta.classList.remove("neutral", "inaccuracy", "mistake", "blunder", "brilliant");
      nodes.delta.classList.add(tone);
      nodes.delta.dataset.tone = tone;
    }
    nodes.delta.hidden = false;
  } else {
    nodes.delta.hidden = true;
  }

  if (meta?.label) {
    setText(nodes.label, meta.label);
    nodes.label.hidden = false;
  } else {
    nodes.label.hidden = true;
  }
  nodes.meta.hidden = nodes.delta.hidden && nodes.label.hidden;
}

function renderMoveList() {
  if (!game || !moveListEl) return;
  ensureMoveListClickBinding();
  const targetLength = historySanCache.length;
  for (let index = 0; index < targetLength; index += 1) {
    renderMoveRow(index, historySanCache[index]);
  }
  for (let index = moveListEl.children.length - 1; index >= targetLength; index -= 1) {
    const node = moveListEl.children[index];
    if (node) node.remove();
  }
}

function renderMoveListIncremental(previousPly = historyPlyCache) {
  if (!game || !moveListEl) return;
  ensureMoveListClickBinding();
  const targetLength = historySanCache.length;
  const delta = targetLength - previousPly;
  if (Math.abs(delta) > 4) {
    renderMoveList();
    return;
  }
  if (delta > 0) {
    for (let index = previousPly; index < targetLength; index += 1) {
      renderMoveRow(index, historySanCache[index]);
    }
  } else if (delta < 0) {
    for (let index = moveListEl.children.length - 1; index >= targetLength; index -= 1) {
      const node = moveListEl.children[index];
      if (node) node.remove();
    }
  }
  if (targetLength > 0) {
    renderMoveRow(targetLength - 1, historySanCache[targetLength - 1]);
  }
}

function highlightLastMove() {
  clearLastMoveHighlights();
  if (!overlayState.last) return;
  const last = historyVerboseCache[historyPlyCache - 1];
  if (!last) return;
  const fromEl = boardSquareMap.get(last.from);
  const toEl = boardSquareMap.get(last.to);
  if (fromEl) {
    fromEl.classList.add("last-from");
    lastHighlightSquares.add(fromEl);
  }
  if (toEl) {
    toEl.classList.add("last-to");
    lastHighlightSquares.add(toEl);
  }
}

function highlightBestMove(uci) {
  clearBestMoveHighlights();
  if (!overlayState.best) return;
  if (!uci || uci === "(none)" || uci.length < 4) return;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const fromEl = boardSquareMap.get(from);
  const toEl = boardSquareMap.get(to);
  if (fromEl) {
    fromEl.classList.add("best-from");
    bestHighlightSquares.add(fromEl);
  }
  if (toEl) {
    toEl.classList.add("best-to");
    bestHighlightSquares.add(toEl);
  }
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
    const fromEl = boardSquareMap.get(from);
    const toEl = boardSquareMap.get(to);
    if (fromEl) {
      fromEl.classList.add("pv-from");
      fromEl.dataset.pvStep = idx;
      fromEl.style.setProperty("--pv-step", idx);
      pvHighlightSquares.add(fromEl);
    }
    if (toEl) {
      toEl.classList.add("pv-to");
      toEl.dataset.pvStep = idx;
      toEl.style.setProperty("--pv-step", idx);
      pvHighlightSquares.add(toEl);
    }
  });
}

function clearPvHighlights() {
  pvHighlightSquares.forEach((sq) => {
    sq.classList.remove("pv-from", "pv-to");
    sq.removeAttribute("data-pv-step");
    sq.style.removeProperty("--pv-step");
  });
  pvHighlightSquares.clear();
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
  const fromEl = boardSquareMap.get(from);
  const toEl = boardSquareMap.get(to);
  if (fromEl) {
    fromEl.classList.add("pv-from");
    fromEl.style.setProperty("--pv-step", pvPlaybackIndex);
    pvHighlightSquares.add(fromEl);
  }
  if (toEl) {
    toEl.classList.add("pv-to");
    toEl.style.setProperty("--pv-step", pvPlaybackIndex);
    pvHighlightSquares.add(toEl);
  }
}

function jumpToPly(ply) {
  if (!game) return;
  const maxPly = historyPlyCache + redoStack.length;
  const target = Math.max(0, Math.min(maxPly, Number(ply) || 0));
  if (target === historyPlyCache) return;
  if (target < historyPlyCache) {
    jumpBack(historyPlyCache - target);
  } else {
    jumpForward(target - historyPlyCache);
  }
}

function applyUciMove(uci) {
  if (!game || !uci || uci === "(none)" || uci.length < 4) return false;
  const previousPly = historyPlyCache;
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promotion = uci[4];
  const move = game.move({ from, to, promotion });
  if (!move) return false;
  undoStack.push(move);
  redoStack.length = 0;
  appendHistoryMove(move);
  setFocusedSquare(to);
  afterPositionChange({
    previousPly,
    changedSquares: collectChangedSquaresFromMove(move),
  });
  return true;
}

async function requestAutoMove(options = {}) {
  const { queueIfLoading = true } = options;
  if (!engineReady) {
    if (queueIfLoading) {
      queueEngineAction({
        key: "auto-move",
        label: "auto move",
        run: () => {
          requestAutoMove({ ...options, queueIfLoading: false }).catch(() => {});
        },
      });
      return;
    }
    const ready = await ensureEngineReady();
    if (!ready) return;
  }
  if (!autoPlay && !awaitingBestMoveApply) {
    const moveTime = Number(autoMoveTimeInput.value) || 1200;
    const depth = Number(autoDepthInput.value) || 12;
    if (!sendPosition()) return;
    if (moveTime > 0) {
      engine.send(`go movetime ${moveTime}`);
      logLine(`go movetime ${moveTime}`, "in");
    } else {
      engine.send(`go depth ${depth}`);
      logLine(`go depth ${depth}`, "in");
    }
    awaitingBestMoveApply = true;
    scheduleUI();
    return;
  }
  if (autoPlay) {
    const moveTime = Number(autoMoveTimeInput.value) || 1200;
    const depth = Number(autoDepthInput.value) || 12;
    if (!sendPosition()) return;
    if (moveTime > 0) {
      engine.send(`go movetime ${moveTime}`);
      logLine(`go movetime ${moveTime}`, "in");
    } else {
      engine.send(`go depth ${depth}`);
      logLine(`go depth ${depth}`, "in");
    }
    awaitingBestMoveApply = true;
    scheduleUI();
  }
}

function afterPositionChange(options = {}) {
  const {
    previousPly = historyPlyCache,
    rebuildHistory = false,
    forceMoveListRender = false,
    syncPgn = null,
    changedSquares = null,
  } = options;
  if (rebuildHistory) {
    rebuildHistoryCache();
  }
  pgnDirty = true;
  updateBoardPieces(changedSquares);
  const shouldSyncPgn = typeof syncPgn === "boolean"
    ? syncPgn
    : !document.body.classList.contains("collapsed-left") && document.activeElement !== pgnInput;
  syncFenPgn({
    syncPgn: shouldSyncPgn,
    forcePgn: rebuildHistory || forceMoveListRender,
  });
  if (forceMoveListRender || rebuildHistory) {
    renderMoveList();
  } else {
    renderMoveListIncremental(previousPly);
  }
  clearSelectionHighlights();
  clearPvHighlights();
  highlightLastMove();
  selectedSquare = null;
  legalTargets.clear();
  pvSanCache.clear();
  if (pvSanComputeTimer) {
    clearTimeout(pvSanComputeTimer);
    pvSanComputeTimer = null;
  }
  pvSanPending = null;
  if (moveMeta.length > historyPlyCache) {
    moveMeta = moveMeta.slice(0, historyPlyCache);
  }
  if (autoPlay && !awaitingBestMoveApply) {
    setTimeout(() => requestAutoMove(), 60);
  }
  if (analysisActive || analysisRestartQueued) {
    if (analysisActive) {
      stopAnalysis({ keepRestartQueue: true });
    }
    scheduleAnalysisRestart(45);
  }
  scheduleSessionSave();
  scheduleUI();
}

function loadFen(fen) {
  if (!game) return;
  const previousPly = historyPlyCache;
  const ok = game.load(fen);
  if (!ok) {
    engineWarning.textContent = "Invalid FEN.";
    return;
  }
  moveMeta = [];
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange({
    previousPly,
    rebuildHistory: true,
    forceMoveListRender: true,
    syncPgn: true,
  });
}

function loadPgn(pgn) {
  if (!game) return;
  const previousPly = historyPlyCache;
  const ok = game.load_pgn(pgn);
  if (!ok) {
    engineWarning.textContent = "Invalid PGN.";
    return;
  }
  moveMeta = [];
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange({
    previousPly,
    rebuildHistory: true,
    forceMoveListRender: true,
    syncPgn: true,
  });
}

btnNew.addEventListener("click", () => {
  if (!game) return;
  const previousPly = historyPlyCache;
  game.reset();
  moveMeta = [];
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange({
    previousPly,
    rebuildHistory: true,
    forceMoveListRender: true,
    syncPgn: true,
  });
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
  setFocusedSquare(focusedSquare, { focus: true });
  scheduleSessionSave();
});

btnUndo.addEventListener("click", () => {
  jumpBack(1);
});

btnRedo.addEventListener("click", () => {
  jumpForward(1);
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
  flushPgnSync();
  navigator.clipboard.writeText(pgnInput.value).catch(() => {});
});

btnApplyMoves.addEventListener("click", () => {
  if (!game) return;
  const previousPly = historyPlyCache;
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
  afterPositionChange({
    previousPly,
    rebuildHistory: true,
    forceMoveListRender: true,
    syncPgn: true,
  });
});

btnClearMoves.addEventListener("click", () => {
  if (!game) return;
  const previousPly = historyPlyCache;
  game.reset();
  moveMeta = [];
  undoStack.length = 0;
  redoStack.length = 0;
  afterPositionChange({
    previousPly,
    rebuildHistory: true,
    forceMoveListRender: true,
    syncPgn: true,
  });
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
  ensureBoardKeyboardBinding();
  updateBoardPieces();
  rebuildHistoryCache();
  syncFenPgn({ syncPgn: true, forcePgn: true });
  renderMoveList();
  highlightLastMove();
  setFocusedSquare(focusedSquare);
  scheduleUI();
}

boardFlipped = Boolean(sessionState.boardFlipped);
initUiMode();
initPanelToggles();
initHeaderMenus();
initChartCanvasSizing();
setPanelMode(normalizeStoredPanelMode(sessionState.panelMode));
ensureChessReady().then((ready) => {
  if (ready) {
    initGame();
  } else {
    engineWarning.textContent = "Chess library failed to load.";
  }
});
updateEngineWarning();
optionState.clear();
const storedEngineVariant = normalizeStoredEngineVariant(sessionState.engineVariant);
engineSelect.value = storedEngineVariant;
deferredEngineKey = storedEngineVariant;
const initialSpec = engine.resolveSpec(deferredEngineKey);
engineVariant.textContent = initialSpec.label;
engineThreads.textContent = initialSpec.threads ? "auto" : "1";
engineHash.textContent = "—";
queueEngineAssetPreload(deferredEngineKey);
queueInitialEnginePrewarm();
updateEngineWarning();
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
