export function parseUciOption(line) {
  const tokens = line.trim().split(/\s+/);
  const nameIndex = tokens.indexOf("name");
  const typeIndex = tokens.indexOf("type");
  if (nameIndex === -1 || typeIndex === -1 || typeIndex <= nameIndex + 1) {
    return null;
  }
  const name = tokens.slice(nameIndex + 1, typeIndex).join(" ");
  const type = tokens[typeIndex + 1];
  let i = typeIndex + 2;
  const option = { name, type, vars: [] };

  const keywords = new Set(["default", "min", "max", "var"]);
  function readValue() {
    const values = [];
    while (i < tokens.length && !keywords.has(tokens[i])) {
      values.push(tokens[i]);
      i += 1;
    }
    return values.join(" ");
  }

  while (i < tokens.length) {
    const key = tokens[i];
    i += 1;
    if (key === "default") {
      option.default = readValue();
    } else if (key === "min") {
      option.min = Number(readValue());
    } else if (key === "max") {
      option.max = Number(readValue());
    } else if (key === "var") {
      const value = readValue();
      if (value) option.vars.push(value);
    } else {
      // skip unknown tokens
      readValue();
    }
  }

  return option;
}

export function parseInfo(line) {
  const tokens = line.trim().split(/\s+/);
  const info = {};
  let parsedFields = 0;

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    switch (token) {
      case "depth":
        info.depth = Number(tokens[++i]);
        parsedFields += 1;
        break;
      case "seldepth":
        info.seldepth = Number(tokens[++i]);
        parsedFields += 1;
        break;
      case "multipv":
        info.multipv = Number(tokens[++i]);
        parsedFields += 1;
        break;
      case "nodes":
        info.nodes = Number(tokens[++i]);
        parsedFields += 1;
        break;
      case "nps":
        info.nps = Number(tokens[++i]);
        parsedFields += 1;
        break;
      case "tbhits":
        info.tbhits = Number(tokens[++i]);
        parsedFields += 1;
        break;
      case "hashfull":
        info.hashfull = Number(tokens[++i]);
        parsedFields += 1;
        break;
      case "time":
        info.time = Number(tokens[++i]);
        parsedFields += 1;
        break;
      case "score": {
        const type = tokens[++i];
        const value = Number(tokens[++i]);
        info.score = { type, value };
        parsedFields += 1;
        if (tokens[i + 1] === "lowerbound" || tokens[i + 1] === "upperbound") {
          info.score.bound = tokens[++i];
        }
        break;
      }
      case "wdl": {
        const w = Number(tokens[++i]);
        const d = Number(tokens[++i]);
        const l = Number(tokens[++i]);
        info.wdl = { w, d, l };
        parsedFields += 1;
        break;
      }
      case "pv":
        info.pv = tokens.slice(i + 1).join(" ");
        parsedFields += 1;
        i = tokens.length;
        break;
      case "string":
        info.string = tokens.slice(i + 1).join(" ");
        parsedFields += 1;
        i = tokens.length;
        break;
      default:
        break;
    }
  }

  return parsedFields > 0 ? info : null;
}

export function parseBestmove(line) {
  const match = line.match(/^bestmove\s+(\S+)(?:\s+ponder\s+(\S+))?/);
  if (!match) return null;
  return { bestmove: match[1], ponder: match[2] };
}

export function formatScore(score) {
  if (!score) return "—";
  if (score.type === "mate") {
    return `Mate ${score.value}`;
  }
  const cp = score.value / 100;
  return cp >= 0 ? `+${cp.toFixed(2)}` : cp.toFixed(2);
}

export function scoreToPercent(score) {
  if (!score) return 50;
  if (score.type === "mate") {
    return score.value > 0 ? 95 : 5;
  }
  const cp = Math.max(-1000, Math.min(1000, score.value));
  const scaled = Math.tanh(cp / 350);
  return 50 + scaled * 45;
}
