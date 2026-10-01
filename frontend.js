(function () {
  if (window.sliderCalculatorInitialized) return;
  // Don't run in the Gutenberg editor context
  if (document.body && (document.body.classList.contains('block-editor-page') || document.body.classList.contains('wp-admin'))) return;
  window.sliderCalculatorInitialized = true;

  const ctx = (sel) => document.querySelector(sel);
  const ctxAll = (sel) => document.querySelectorAll(sel);

  const clamp = (num, min, max) => Math.min(Math.max(num, min), max);

  const FORMULA_VAR_SOURCE =
    String.raw`\[([a-zA-Z0-9_-]+)(?:\s+as\s+\[([^\],]*?)\s*(?:,\s*([^\]]*?))?\])?\]`;

  const CASE_BLOCK_SOURCE =
    String.raw`\{case\s+([^:]+):\s*([\s\S]*?)\}`;

  const priceBrackets = [
    { min: 1, max: 5, price: 40 },
    { min: 6, max: 10, price: 45 },
    { min: 11, max: 15, price: 50 }
  ];

  const DOM = {
    containers: [],
    controls: [],
    controlById: new Map(),
    groups: [],
    formulaBlocks: [],
    tables: [],
    logicBlocks: []
  };

  let recalculationQueued = false;
  let isFirstExecution = true;
  const formulaEvaluationCache = new Map();
  const API_REQUEST_CACHE_TTL = 5000;
  const apiRequestCache = new Map();

  function getFormulaVarRegex(flags = "g") {
    return new RegExp(FORMULA_VAR_SOURCE, flags);
  }

  function getCaseBlockRegex(flags = "gi") {
    return new RegExp(CASE_BLOCK_SOURCE, flags);
  }

  function buildStringLiteralMask(text) {
    const source = String(text || "");
    const mask = new Array(source.length).fill(false);
    let quote = null;
    let escaped = false;

    for (let i = 0; i < source.length; i++) {
      const ch = source[i];

      if (quote) {
        mask[i] = true;

        if (escaped) {
          escaped = false;
          continue;
        }

        if (ch === "\\") {
          escaped = true;
          continue;
        }

        if (ch === quote) {
          quote = null;
        }
        continue;
      }

      if (ch === "\"" || ch === "'" || ch === "`") {
        quote = ch;
        mask[i] = true;
      }
    }

    return mask;
  }

  function replaceFormulaVarsOutsideStrings(formula, replacer) {
    if (!isFormulaString(formula)) return formula;

    const mask = buildStringLiteralMask(formula);
    const regex = getFormulaVarRegex("g");

    return String(formula).replace(regex, (match, id, alias, unit, offset) => {
      if (mask[offset]) {
        return match;
      }
      return replacer(match, id, alias, unit, offset);
    });
  }

  function replaceCaretsOutsideStrings(formula) {
    if (!isFormulaString(formula)) return formula;

    const source = String(formula);
    const mask = buildStringLiteralMask(source);
    let output = "";

    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (ch === "^" && !mask[i]) {
        output += "**";
      } else {
        output += ch;
      }
    }

    return output;
  }

  function stripStringLiterals(source) {
    const text = String(source || "");
    let out = "";
    let quote = null;
    let escaped = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === quote) {
          quote = null;
        }
        continue;
      }

      if (ch === "\"" || ch === "'" || ch === "`") {
        quote = ch;
        continue;
      }

      out += ch;
    }

    return out;
  }

  function isPreparedExpressionSafe(expr) {
    if (typeof expr !== "string") return false;
    // Hard ceiling on the whole formula; the 12000 limit below applies to the
    // CODE part only. String literal content (e.g. a Raw HTML node's markup)
    // is a single token for the parser, so it can't inflate AST work.
    if (expr.length === 0 || expr.length > 262144) return false;

    // Strip string literals first, then check for injection vectors outside strings
    const stripped = stripStringLiterals(expr);
    if (stripped.length > 12000) return false;

    // Block obvious statement/function injection vectors (outside string literals).
    if (/[;`]/.test(stripped)) return false;
    if (/\bfunction\b/i.test(stripped)) return false;
    if (/\bclass\b/i.test(stripped)) return false;
    if (/=>/.test(stripped)) return false;

    // Block access to global/browser/runtime primitives.
    if (/(^|[^A-Za-z0-9_$])(window|document|globalThis|self|Function|constructor|prototype|__proto__|eval|alert|prompt|confirm|fetch|XMLHttpRequest|setTimeout|setInterval)(?=$|[^A-Za-z0-9_$])/i.test(stripped)) {
      return false;
    }

    const allowedIdentifiers = new Set([
      "true",
      "false",
      "null",
      "undefined",
      "NaN",
      "Infinity",
      "Math",
      "Number",
      "__nodeRegex",
      "__nodeConcat",
      "__nodeCutA",
      "__nodeCutB",
      "__nodeCutC",
      "__nodeCountChars",
      "__nodeCountWords",
      "__nodeFindStart",
      "__nodeFindEnd",
      "__nodeToNumber",
      "__nodeToString",
      "__nodeCssJoin",
      "__nodeArrayPush",
      "__nodeArrayPop",
      "__nodeArraySort",
      "__nodeArrayRemove",
      "__nodeArrayReplace",
      "__nodeArrayMap",
      "__nodeArrayFilter",
      "__nodeArrayReduce",
      "__nodeArrayFind",
      "__nodeArrayForEach",
      "__nodeArrayCollect",
      "__nodeArrayContains",
      "__nodeArrayLength",
      "__nodeArrayMerge",
      "__nodeArrayUnique",
      "__nodeArrayMapGraph",
      "__nodeArrayFilterGraph",
      "__nodeLoopItem",
      "__nodeLoopIndex",
      "__nodeApiRequest",
      "__nodeApiStatus",
      "__nodeApiListMapper",
      "__nodeImageFromLink",
      "__nodeImageFromElement",
      "__nodeGetElement",
      "__nodeGetElementProp",
      "__nodeGetChildren",
      "__nodeGetChildAt",
      "__nodeGetChildrenSubset",
      "__nodeCountTrue",
      "__nodeGradient",
      "__nodeUnzip",
      "__nodeCaseEquals",
      "__nodeGetPath",
      "__nodeJsonParse",
      "__nodeMemoryGet",
      "__nodeMemorySet",
      "__nodeMemoryHas",
      "__nodeMemoryDelete",
      "__nodeMemoryIncrement",
      "__nodeMemoryArrayAppend",
      "__nodeMemoryArrayRemove",
      "__nodeEvent",
      "__nodeHoverEvent",
      "__nodePageLoadEvent",
      "__nodeTimerEvent",
      "__nodeCustomEvent",
      "__nodeEventOr",
      "__nodeEventAnd",
      "__nodeFallbackEvent",
      "__nodeEventProcessor",
      "__nodeFallback",
      "__nodeFormData",
      "__nodeSendEmail",
      // Send Email event outputs: (expr).sendingEvent / .sentEvent / .failedEvent
      "sendingEvent",
      "sentEvent",
      "failedEvent",
      "__nodeDbChain",
      "__nodeDbSelect",
      "__nodeDbWrite",
      "__nodeRawHtml",
      "__nodeSetParent",
      "__nodeCloneElement",
      "__nodeElementsByClass",
      "__nodeDebug",
      // Members of __nodeCloneElement's result: (expr).clone / (expr).clones
      "clone",
      "clones",
      // Members read off __nodeDbSelect's result ((expr).rows / .firstRow /
      // .count / .status) -- same member-vs-identifier limitation as below.
      "rows",
      "firstRow",
      "count",
      "status",
      // Property names read via MemberExpression off __nodeFormData's result
      // ((expr).data / (expr).event / (expr).data.values[...]) -- this
      // regex-based scan can't tell a member-access property from a bare
      // context identifier, so all three must be whitelisted here even
      // though none of them is ever resolved against createFormulaEvalContext.
      "data",
      "event",
      "values",
      "value",
      "label",
      "background",
      "color",
      "disabled",
      "parseInt",
      "String",
      "__nodeToBase",
      "__nodeParseRadix",
      // Action node keys used in compiled action plan expressions
      "type",
      "sourceId",
      "eventType",
      "actions",
      "className",
      "pattern",
      "min",
      "max",
      "condition",
      "trueActions",
      "falseActions",
      "name",
      "property",
      "mode",
      "message",
      "duration",
      "target",
      "url"
    ]);

    const allowedMathMembers = new Set([
      "sin", "cos", "tan", "asin", "acos", "atan",
      "sqrt", "abs", "log", "exp", "floor", "ceil", "round",
      "min", "max", "pow",
      // String methods used in generated expressions
      "split", "join", "trim", "toUpperCase", "toLowerCase", "includes",
      "indexOf", "slice", "length",
      // Number methods
      "toString", "toFixed", "toLocaleString"
    ]);

    const identifiers = stripped.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [];
    for (const id of identifiers) {
      if (/^o\d+$/.test(id)) continue;
      if (allowedIdentifiers.has(id)) continue;
      if (allowedMathMembers.has(id)) continue;
      return false;
    }

    return true;
  }

  function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function toGrosze(zl) {
    return Math.round(toNumber(zl) * 100);
  }

  function fromGrosze(gr) {
    return (toNumber(gr) / 100).toFixed(2);
  }

  function isFormulaString(formula) {
    return typeof formula === "string" && formula.trim().length > 0;
  }

  function getStepPrecision(input) {
    const step = input.getAttribute("step");
    if (!step || step === "any") return 2;

    const s = String(step);
    const idx = s.indexOf(".");
    if (idx === -1) return 0;
    return Math.max(0, s.length - idx - 1);
  }

  function formatNumeric(value, precision = 2) {
    if (!Number.isFinite(value)) return "0";

    const rounded = Math.abs(value - Math.round(value)) < 1e-10
      ? Math.round(value)
      : Number(value.toFixed(precision));

    return String(rounded);
  }

  function formatValueForInput(input, value, forceDecimals = false) {
    if (!Number.isFinite(value)) return "0";

    if (forceDecimals) {
      return value.toFixed(2);
    }

    const precision = getStepPrecision(input);
    if (precision <= 0) {
      return String(Math.round(value));
    }

    return String(Number(value.toFixed(Math.min(precision, 8))));
  }

  function formatValueForFormula(value) {
    if (value === null || value === undefined) return "0";
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (Array.isArray(value)) return JSON.stringify(value);
    if (value && typeof value === "object") {
      try {
        return JSON.stringify(value);
      } catch {
        return JSON.stringify(String(value));
      }
    }

    if (typeof value === "string") {
      return JSON.stringify(value);
    }

    return JSON.stringify(String(value));
  }

  function normalizeDynamicLiteral(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) {
      return value;
    }

    if (typeof value === "object") {
      if (Object.prototype.hasOwnProperty.call(value, "value")) {
        return normalizeDynamicLiteral(value.value);
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }

    return String(value);
  }

  function parseScalarValue(raw) {
    const value = normalizeDynamicLiteral(raw);

    if (typeof value === "boolean" || typeof value === "number") {
      return value;
    }

    const str = String(value);
    const trimmed = str.trim();
    const lowered = trimmed.toLowerCase();

    if (lowered === "true") return true;
    if (lowered === "false") return false;

    if (trimmed.length > 0) {
      const num = Number(trimmed);
      if (Number.isFinite(num)) return num;
    }

    return str;
  }

  function toSafeString(value) {
    if (value === null || value === undefined) return "";
    const normalized = normalizeDynamicLiteral(value);
    if (normalized === null || normalized === undefined) return "";
    return String(normalized);
  }

  function escapeHtml(value) {
    return toSafeString(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toSafeIndex(value, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const int = Math.trunc(n);
    return clamp(int, 0, max);
  }

  function parsePattern(rawPattern) {
    const raw = toSafeString(rawPattern).trim();
    const literal = raw.match(/^\/(.+)\/([dgimsuvy]*)$/);
    if (literal) {
      return { source: literal[1], flags: literal[2] || "" };
    }
    return { source: raw, flags: "" };
  }

  function __nodeRegex(value, rawPattern) {
    const text = toSafeString(value);
    const { source, flags } = parsePattern(rawPattern);
    if (!source) return false;

    try {
      const re = new RegExp(source, flags);
      return re.test(text);
    } catch {
      return false;
    }
  }

  function __nodeConcat(...args) {
    return args.map(toSafeString).join('');
  }

  function __nodeCutA(text, needle, reverse) {
    const source = toSafeString(text);
    const token = toSafeString(needle);

    if (!token.length) {
      return reverse ? "" : source;
    }

    const hit = source.indexOf(token);
    if (hit === -1) {
      return reverse ? "" : source;
    }

    if (!reverse) {
      return source.slice(0, hit) + source.slice(hit + token.length);
    }

    return source.slice(hit, hit + token.length);
  }

  function __nodeCutB(text, index, reverse) {
    const source = toSafeString(text);
    const idx = toSafeIndex(index, source.length);
    return reverse ? source.slice(idx) : source.slice(0, idx);
  }

  function __nodeCutC(text, start, end, reverse) {
    const source = toSafeString(text);
    const a = toSafeIndex(start, source.length);
    const b = toSafeIndex(end, source.length);
    const from = Math.min(a, b);
    const to = Math.max(a, b);
    return reverse
      ? source.slice(from, to)
      : source.slice(0, from) + source.slice(to);
  }

  function __nodeCountChars(text) {
    return toSafeString(text).length;
  }

  function __nodeCountWords(text) {
    const source = toSafeString(text).trim();
    if (!source.length) return 0;
    return source.split(/\s+/).filter(Boolean).length;
  }

  function __nodeFindStart(text, needle) {
    const source = toSafeString(text);
    const token = toSafeString(needle);
    if (!token.length) return -1;
    return source.indexOf(token);
  }

  function __nodeFindEnd(text, needle) {
    const source = toSafeString(text);
    const token = toSafeString(needle);
    if (!token.length) return -1;
    const start = source.indexOf(token);
    if (start === -1) return -1;
    return start + token.length;
  }

  function __nodeToNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }

    const source = toSafeString(value).trim().replace(",", ".");
    if (!source.length) return 0;

    const parsed = Number(source);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function __nodeToString(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return toSafeString(value);
  }

  function __nodeCssJoin(...values) {
    const parts = [];
    values.forEach((value) => {
      const text = __nodeToString(value).trim();
      if (!text) return;
      parts.push(text.replace(/;+$/g, ""));
    });
    return parts.join("; ");
  }

  function __nodeArrayPush(arrayValue, item) {
    const list = Array.isArray(arrayValue) ? arrayValue.slice() : [];
    list.push(item);
    return list;
  }

  function __nodeArrayPop(arrayValue) {
    const list = Array.isArray(arrayValue) ? arrayValue.slice() : [];
    list.pop();
    return list;
  }

  function resolveArraySortComparableValue(item, rawFieldPath) {
    const fieldPath = toSafeString(rawFieldPath).trim();
    if (item && typeof item === "object") {
      if (fieldPath) {
        const direct = __nodeGetPath(item, fieldPath, undefined);
        if (direct !== undefined && direct !== null) {
          return direct;
        }
      }

      if (Object.prototype.hasOwnProperty.call(item, "label")) {
        return item.label;
      }
      if (Object.prototype.hasOwnProperty.call(item, "value")) {
        return item.value;
      }

      const values = Object.values(item);
      const stringMatch = values.find((value) => typeof value === "string" && value.trim().length > 0);
      const numberMatch = values.find((value) => typeof value === "number" && Number.isFinite(value));
      const booleanMatch = values.find((value) => typeof value === "boolean");
      return stringMatch ?? numberMatch ?? booleanMatch ?? item;
    }

    return item;
  }

  function compareArraySortValues(leftValue, rightValue, sortMode) {
    const normalizedMode = toSafeString(sortMode).trim() || "number-asc";
    const direction = normalizedMode.endsWith("-desc") ? -1 : 1;
    const comparatorMode = normalizedMode.startsWith("string") ? "string" : normalizedMode.startsWith("custom") ? "custom" : "number";

    if (comparatorMode === "string") {
      return toSafeString(leftValue).localeCompare(toSafeString(rightValue)) * direction;
    }

    if (comparatorMode === "number") {
      const leftNum = Number(leftValue);
      const rightNum = Number(rightValue);
      if (!Number.isFinite(leftNum) && !Number.isFinite(rightNum)) return 0;
      if (!Number.isFinite(leftNum)) return 1 * direction;
      if (!Number.isFinite(rightNum)) return -1 * direction;
      return (leftNum - rightNum) * direction;
    }

    const leftNum = Number(leftValue);
    const rightNum = Number(rightValue);
    const leftHasNumber = Number.isFinite(leftNum);
    const rightHasNumber = Number.isFinite(rightNum);
    if (leftHasNumber || rightHasNumber) {
      if (!leftHasNumber && !rightHasNumber) return 0;
      if (!leftHasNumber) return 1 * direction;
      if (!rightHasNumber) return -1 * direction;
      return (leftNum - rightNum) * direction;
    }

    if (typeof leftValue === "boolean" || typeof rightValue === "boolean") {
      const leftBool = Boolean(leftValue);
      const rightBool = Boolean(rightValue);
      return (Number(leftBool) - Number(rightBool)) * direction;
    }

    return toSafeString(leftValue).localeCompare(toSafeString(rightValue)) * direction;
  }

  function __nodeArraySort(arrayValue, mode, fieldPath) {
    const list = Array.isArray(arrayValue) ? arrayValue.slice() : [];
    const sortConfig = mode && typeof mode === "object"
      ? {
          sortMode: toSafeString(mode.sortMode ?? mode.mode ?? mode.order ?? mode.direction).trim() || "number-asc",
          fieldPath: toSafeString(mode.fieldPath ?? mode.sortField ?? mode.path ?? fieldPath).trim(),
        }
      : {
          sortMode: toSafeString(mode).trim() || "number-asc",
          fieldPath: toSafeString(fieldPath).trim(),
        };

    return list.sort((left, right) => {
      const leftComparable = resolveArraySortComparableValue(left, sortConfig.fieldPath);
      const rightComparable = resolveArraySortComparableValue(right, sortConfig.fieldPath);
      return compareArraySortValues(leftComparable, rightComparable, sortConfig.sortMode);
    });
  }

  function __nodeArrayRemove(arrayValue, indexValue) {
    const list = Array.isArray(arrayValue) ? arrayValue.slice() : [];
    const index = Number.isFinite(Number(indexValue)) ? Math.max(0, Math.floor(Number(indexValue))) : 0;
    if (index < 0 || index >= list.length) return list;
    list.splice(index, 1);
    return list;
  }

  function __nodeArrayReplace(arrayValue, indexValue, nextValue) {
    const list = Array.isArray(arrayValue) ? arrayValue.slice() : [];
    const index = Number.isFinite(Number(indexValue)) ? Math.max(0, Math.floor(Number(indexValue))) : 0;
    if (index < 0 || index >= list.length) return list;
    list[index] = nextValue;
    return list;
  }

  function __nodeArrayMap(arrayValue, mappedValue) {
    const list = Array.isArray(arrayValue) ? arrayValue : [];
    return list.map((item) => mappedValue === undefined ? item : mappedValue);
  }

  function __nodeArrayFilter(arrayValue, condition) {
    const list = Array.isArray(arrayValue) ? arrayValue : [];
    return condition === undefined ? list.slice() : (condition ? list.slice() : []);
  }

  function __nodeArrayReduce(arrayValue, operation, initialValue) {
    const list = Array.isArray(arrayValue) ? arrayValue : [];
    const op = toSafeString(operation).trim() || "sum";
    let result = initialValue;
    if (op === "count") return list.length;
    if (op === "concat") return list.reduce((acc, item) => `${acc}${item ?? ""}`, initialValue ?? "");
    if (op === "product" && (result === undefined || result === null || result === "")) result = 1;
    if ((op === "sum" || op === "min" || op === "max") && (result === undefined || result === null || result === "")) result = op === "min" ? Infinity : op === "max" ? -Infinity : 0;
    return list.reduce((acc, item) => {
      const value = Number(item);
      if (op === "product") return Number(acc) * (Number.isFinite(value) ? value : 0);
      if (op === "min") return Math.min(Number(acc), value);
      if (op === "max") return Math.max(Number(acc), value);
      return Number(acc) + (Number.isFinite(value) ? value : 0);
    }, result);
  }

  function __nodeArrayFind(arrayValue, searchValue, fieldPath) {
    const list = Array.isArray(arrayValue) ? arrayValue : [];
    const indexes = list.reduce((matches, item, index) => {
      const candidate = fieldPath ? __nodeGetPath(item, fieldPath, undefined) : item;
      if (__nodeCaseEquals(candidate, searchValue)) matches.push(index);
      return matches;
    }, []);
    return [indexes, indexes.length];
  }

  function __nodeArrayForEach(arrayValue) {
    return Array.isArray(arrayValue) ? arrayValue.slice() : [];
  }

  function __nodeArrayCollect(itemValue) {
    return [itemValue];
  }

  function __nodeArrayContains(arrayValue, searchValue) {
    const list = Array.isArray(arrayValue) ? arrayValue : [];
    return list.some((item) => __nodeCaseEquals(item, searchValue));
  }

  function __nodeArrayLength(arrayValue) {
    return Array.isArray(arrayValue) ? arrayValue.length : 0;
  }

  function __nodeArrayMerge(firstValue, secondValue, mode) {
    const first = Array.isArray(firstValue) ? firstValue : [];
    const second = Array.isArray(secondValue) ? secondValue : [];
    const merged = first.concat(second);
    return toSafeString(mode).trim() === "union" ? __nodeArrayUnique(merged) : merged;
  }

  function __nodeArrayUnique(arrayValue) {
    const list = Array.isArray(arrayValue) ? arrayValue : [];
    const seenKeys = new Set();
    const seenRefs = new Set();
    return list.filter((item) => {
      if (item && typeof item === "object") {
        // Live DOM nodes (and any non-serialisable object) dedup by identity —
        // JSON.stringify(<element>) is "{}" for every element and would collapse
        // an Array<element> to a single item.
        if (item.nodeType || typeof item.tagName === "string") {
          if (seenRefs.has(item)) return false;
          seenRefs.add(item);
          return true;
        }
        let key;
        try {
          key = "o:" + JSON.stringify(item);
        } catch {
          if (seenRefs.has(item)) return false;
          seenRefs.add(item);
          return true;
        }
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      }
      const key = `${typeof item}:${String(item)}`;
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });
  }

  // Runs `run()` with nlActiveLoopItemElement set to `item` (when it's a live
  // element) for the duration of the call, restoring the previous value
  // afterward (correct for nested maps/filters too, via plain save/restore --
  // each call is synchronous). See nlApplySelfWriteBaseline above for why.
  // Also records the loop index path (nested loops -> "2.0") so stateful DOM
  // nodes inside a For Each body keep one instance per item.
  function nlWithActiveLoopItem(item, run, index) {
    const prev = nlActiveLoopItemElement;
    const prevPath = nlActiveLoopPath;
    nlActiveLoopItemElement = (item && typeof item === "object" && item.nodeType === 1) ? item : null;
    nlActiveLoopPath = prevPath.concat([Number.isInteger(index) ? index : 0]);
    try {
      return run();
    } finally {
      nlActiveLoopItemElement = prev;
      nlActiveLoopPath = prevPath;
    }
  }

  function __nodeArrayMapGraph(arrayValue, bodyExpression) {
    const list = Array.isArray(arrayValue) ? arrayValue : [];
    const expression = toSafeString(bodyExpression).trim();
    if (!expression) return list.slice();
    return list.map((item, index) => nlWithActiveLoopItem(item, () => {
      const result = safeEvaluateExpression(expression, { __nodeLoopItem: item, __nodeLoopIndex: index });
      return result.valid ? result.value : undefined;
    }, index));
  }

  function __nodeArrayFilterGraph(arrayValue, predicateExpression) {
    const list = Array.isArray(arrayValue) ? arrayValue : [];
    const expression = toSafeString(predicateExpression).trim();
    if (!expression) return list.slice();
    return list.filter((item, index) => nlWithActiveLoopItem(item, () => {
      const result = safeEvaluateExpression(expression, { __nodeLoopItem: item, __nodeLoopIndex: index });
      return result.valid && Boolean(result.value);
    }, index));
  }

  function tryParseJsonValue(value) {
    if (typeof value !== "string") return value;

    const text = value.trim();
    if (!text.length) return value;
    if (!((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]")))) {
      return value;
    }

    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }

  // cacheKeys currently in flight, so two nodes requesting the exact same
  // (method, url, body, headers) -- e.g. an api-request and an api-status
  // node pointed at the same endpoint -- share ONE network request instead
  // of firing a duplicate.
  const apiInFlightRequests = new Set();

  function __nodeApiParseHeaders(headersJson) {
    const text = toSafeString(headersJson).trim();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Malformed headers JSON: proceed without the extra headers rather
      // than failing the whole request.
    }
    return {};
  }

  // Real HTTP requests are asynchronous. This used to be a SYNCHRONOUS XHR
  // (xhr.open(method, url, false)), which blocks the page's main thread for
  // every API node on every recalculation -- the "faking synchronous
  // behavior" anti-pattern. Fixed to fire a real async XHR: a fresh request
  // returns a "no value yet" entry immediately (null / loading), and once
  // the response lands, the result is cached and scheduleRecalculation()
  // re-runs the graph so the real value flows through on the next pass --
  // the same "external event -> cache -> recalculate" pattern already used
  // for __nodeEvent. Concurrent identical requests are deduped via
  // apiInFlightRequests; distinct requests get distinct cache keys, so a
  // newer request can never be overwritten by a stale, slower-to-resolve one.
  // A string Body input (raw text, or an already-serialized JSON string) is
  // sent as-is; anything else (object/array/number/boolean) is JSON-encoded.
  // Without this, wiring a pre-built JSON string into Body double-encoded it.
  function __nodeApiSerializeBody(data) {
    if (typeof data === "string") return data;
    return JSON.stringify(data ?? {});
  }

  function __nodeApiFetch(requestUrl, requestMethod, data, headersJson, timeout) {
    const requestBody = (requestMethod === "GET" || requestMethod === "HEAD") ? "" : __nodeApiSerializeBody(data);
    const cacheKey = `${requestMethod}:${requestUrl}:${requestBody}:${toSafeString(headersJson)}`;
    const cached = apiRequestCache.get(cacheKey);
    if (cached && typeof cached.timestamp === "number" && Date.now() - cached.timestamp < API_REQUEST_CACHE_TTL) {
      return cached;
    }
    if (apiInFlightRequests.has(cacheKey) || typeof XMLHttpRequest === "undefined") {
      return cached || null;
    }

    apiInFlightRequests.add(cacheKey);
    const finish = (entry) => {
      apiInFlightRequests.delete(cacheKey);
      apiRequestCache.set(cacheKey, { timestamp: Date.now(), ...entry });
      scheduleRecalculation();
    };

    try {
      let sameOrigin = false;
      try {
        const parsedUrl = new URL(requestUrl, window?.location?.href || document?.baseURI || "");
        sameOrigin = parsedUrl.origin === window?.location?.origin;
      } catch {
        sameOrigin = false;
      }

      const xhr = new XMLHttpRequest();
      const finalUrl = requestMethod === "GET"
        ? `${requestUrl}${requestUrl.includes("?") ? "&" : "?"}_t=${Date.now()}`
        : requestUrl;

      xhr.open(requestMethod, finalUrl, true);
      const timeoutMs = Number.isFinite(Number(timeout)) && Number(timeout) > 0 ? Number(timeout) : 15000;
      xhr.timeout = timeoutMs;
      try { xhr.withCredentials = sameOrigin; } catch { /* strict-browser restriction */ }

      if (requestMethod !== "GET" && requestMethod !== "HEAD") {
        try { xhr.setRequestHeader("Content-Type", "application/json"); } catch { /* ignore */ }
      }
      const nonce = sameOrigin ? window?.wpApiSettings?.nonce : "";
      if (nonce) {
        try { xhr.setRequestHeader("X-WP-Nonce", nonce); } catch { /* ignore */ }
      }
      const extraHeaders = __nodeApiParseHeaders(headersJson);
      Object.keys(extraHeaders).forEach((headerName) => {
        try { xhr.setRequestHeader(headerName, toSafeString(extraHeaders[headerName])); } catch { /* ignore */ }
      });

      xhr.onload = () => {
        const responseText = toSafeString(xhr.responseText || "");
        if (xhr.status >= 200 && xhr.status < 300) {
          finish({ value: tryParseJsonValue(responseText), ok: true, status: xhr.status, statusText: xhr.statusText || "", error: "" });
        } else {
          finish({ value: null, ok: false, status: xhr.status, statusText: xhr.statusText || "", error: `HTTP ${xhr.status}` });
        }
      };
      xhr.onerror = () => finish({ value: null, ok: false, status: 0, statusText: "", error: "Network error" });
      xhr.ontimeout = () => finish({ value: null, ok: false, status: 0, statusText: "", error: "Timeout" });
      xhr.onabort = () => finish({ value: null, ok: false, status: 0, statusText: "", error: "Aborted" });

      xhr.send((requestMethod === "GET" || requestMethod === "HEAD") ? null : __nodeApiSerializeBody(data));
    } catch (e) {
      finish({ value: null, ok: false, status: 0, statusText: "", error: "Request failed" });
    }

    return cached || null;
  }

  function __nodeApiRequest(url, method = "GET", data, headersJson, timeout) {
    const requestUrl = toSafeString(url).trim();
    if (!requestUrl) return null;
    const requestMethod = toSafeString(method).trim().toUpperCase() || "GET";
    const entry = __nodeApiFetch(requestUrl, requestMethod, data, headersJson, timeout);
    return entry ? entry.value : null;
  }

  function __nodeApiStatus(url, method = "GET", data, headersJson, timeout) {
    const requestUrl = toSafeString(url).trim();
    if (!requestUrl) return { ok: false, status: 0, statusText: "", error: "Missing URL", loading: false };
    const requestMethod = toSafeString(method).trim().toUpperCase() || "GET";
    const entry = __nodeApiFetch(requestUrl, requestMethod, data, headersJson, timeout);
    if (!entry) return { ok: false, status: 0, statusText: "", error: "", loading: true };
    return { ok: !!entry.ok, status: entry.status || 0, statusText: entry.statusText || "", error: entry.error || "", loading: false };
  }

  // ---------------------------------------------------------------------------
  // Form Data / Send Email (PRO) runtime.
  //
  // Both are gated on window.calcgraphProFrontendConfig -- PRO's own
  // wp_enqueue_scripts hook localizes this onto the SAME 'nodelogic-frontend'
  // script handle this file is registered under (see nodelogic-graph-
  // builder.php's enqueue). Without PRO active, that global is simply never
  // set, so __nodeFormData never attaches a submit listener / never resumes
  // anything, and __nodeSendEmail never has a URL to call -- the feature is
  // inert by construction, not by a separate license flag this file would
  // have to check itself.
  //
  // Reload-survival design (submit -> capture -> reload -> resume):
  //   1. A 'submit' listener is attached (once) to the form the Form node
  //      points at. On fire, it captures the submitted fields via FormData
  //      and persists them BEFORE the browser's own navigation completes --
  //      NOT during it, since no JS runs once the new document starts
  //      loading. preventDefault() is never called: the site's own form
  //      action / reload proceeds exactly as it would without this plugin.
  //   2. The captured payload is written to localStorage synchronously
  //      (network-independent -- this is what makes resume work even when
  //      the page navigates before any request could complete) AND
  //      best-effort mirrored to a short-lived server-side transient via
  //      sendBeacon (falling back to a synchronous XHR if the browser
  //      refuses to queue the beacon -- sendBeacon's return value only means
  //      "queued", never "delivered", so neither path is treated as a
  //      guarantee; see nlSendFormCapture).
  //   3. On the next page load, __nodeFormData reads back whichever copy is
  //      available (local first; the server copy only matters when the
  //      local payload was too large to embed or localStorage was
  //      unavailable) and hands it to the graph as the Form node's output.
  //      The localStorage entry is deleted on first read (single-use), and
  //      the server transient is single-use + short-TTL + keyed by an
  //      unguessable per-submission id -- a stale or replayed marker can
  //      never resume a second time.
  //   4. Nothing here re-runs the CAPTURE step on the new page -- there is
  //      no synthetic 'submit' dispatch anywhere in this file. The old
  //      page's capture and the new page's resume are two disjoint code
  //      paths that never both execute in the same page load, so whatever
  //      logically belonged to "before submit" cannot re-fire after reload.
  //   5. A genuinely NEW, unrelated submission on the same form always
  //      overwrites the one pending marker for that form (last-submit-wins);
  //      a rapid double-submit on the SAME click/Enter is suppressed by a
  //      per-element lock set synchronously before any capture work runs.

  const NL_FORM_RESUME_MAX_AGE_MS = 30 * 60 * 1000; // stale marker cutoff
  const NL_FORM_LOCAL_EMBED_LIMIT = 8000; // bytes, roughly -- keep the sync localStorage write cheap
  const NL_FORM_VALUE_MAX_LENGTH = 4000; // per-field cap, defends against a pathological huge field

  window.nodelogicFormResumeStore = window.nodelogicFormResumeStore || {};
  window.nodelogicFormResumeFetchState = window.nodelogicFormResumeFetchState || {};
  window.nodelogicFormCaptureAttached = window.nodelogicFormCaptureAttached || new WeakMap();
  window.nodelogicEmailStatusStore = window.nodelogicEmailStatusStore || {};
  window.nodelogicEmailInFlight = window.nodelogicEmailInFlight || new Set();

  function nlGenerateSubmissionId() {
    // Never itself relied on as a security boundary against a same-origin
    // attacker with arbitrary JS execution (nothing client-side can defend
    // against that) -- this only needs to be unguessable to a REMOTE party
    // trying to fetch someone else's pending submission from the server
    // transient it is used to key (see the REST /form-resume endpoint).
    try {
      const bytes = new Uint8Array(16);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    }
  }

  function nlSanitizeFormValue(v) {
    // Length-capped only. XSS-safety is each DOWNSTREAM consumer's own
    // responsibility (a DOM write escapes on its own side; the send-email
    // endpoint sanitizes independently server-side) -- this purely guards
    // against a pathological field size bloating the captured payload.
    return toSafeString(v).slice(0, NL_FORM_VALUE_MAX_LENGTH);
  }

  function nlResolveFormElement(element) {
    if (!element || element.nodeType !== 1) return null;
    if (element.tagName === "FORM") return element;
    if (element.form && element.form.tagName === "FORM") return element.form; // a control inside a form
    return typeof element.querySelector === "function" ? element.querySelector("form") : null;
  }

  function nlCaptureFormData(form) {
    const fd = new FormData(form);
    const values = {};
    const seen = new Set();
    for (const key of fd.keys()) {
      if (seen.has(key)) continue;
      seen.add(key);
      const all = fd.getAll(key).map((v) => (v instanceof File ? "" : nlSanitizeFormValue(v)));
      values[key] = all.length > 1 ? all : (all[0] ?? "");
    }
    try {
      // FormData omits an unchecked checkbox/radio entirely -- include every
      // named control that exists in the form so downstream Validate sees a
      // stable key set regardless of what the visitor left unchecked, not
      // only whatever happened to be submitted.
      form.querySelectorAll("input[name], select[name], textarea[name]").forEach((el) => {
        const name = el.name;
        if (!name || seen.has(name)) return;
        if (el.type === "checkbox" || el.type === "radio") {
          values[name] = false;
          seen.add(name);
        }
      });
      // A plain boolean-style checkbox (no meaningful value attribute, the
      // single control for its name -- not a same-named checkbox GROUP where
      // several can be checked at once and the array-of-values shape above
      // is what's wanted) submits its value as the string "on" when checked.
      // Coerced to a real boolean here so a graph author can write
      // `values.agree === true` instead of comparing against the string
      // "on" -- a checkbox with its OWN meaningful value (e.g. value="yes",
      // used to distinguish options in a group) keeps that value untouched.
      const checkboxNames = {};
      form.querySelectorAll('input[type="checkbox"][name]').forEach((el) => {
        checkboxNames[el.name] = (checkboxNames[el.name] || 0) + 1;
      });
      Object.keys(checkboxNames).forEach((name) => {
        if (checkboxNames[name] !== 1) return; // a real group: leave the array-of-checked-values shape alone
        const el = form.querySelector(`input[type="checkbox"][name="${name.replace(/"/g, '\\"')}"]`);
        if (!el) return;
        const hasCustomValue = el.hasAttribute("value") && el.getAttribute("value") !== "on" && el.getAttribute("value") !== "";
        if (!el.checked) {
          values[name] = false;
        } else if (!hasCustomValue) {
          values[name] = true;
        }
      });
    } catch {
      // Non-fatal -- the FormData-derived values above are still usable.
    }
    return values;
  }

  function nlSendFormCapture(submissionId, formKey, values, capturedAt) {
    const config = window.calcgraphProFrontendConfig;
    if (!config || !config.restUrl) return; // PRO not active -- local-only resume still works.
    const url = `${config.restUrl}form-resume`;
    let body;
    try {
      body = JSON.stringify({ submissionId, formKey, values, capturedAt, nonce: config.formResumeNonce || "" });
    } catch {
      return;
    }
    let queued = false;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        queued = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } catch {
        queued = false;
      }
    }
    if (queued) return;
    // sendBeacon() reports only whether the browser QUEUED the request, never
    // whether it reached the server -- and it can refuse to queue at all
    // (oversized payload, API disabled). A synchronous XHR briefly blocks the
    // page, acceptable here because navigation is already underway, and is
    // the only remaining way to make a best-effort attempt to finish the
    // request before the document unloads. Its own failure is still only
    // ever best-effort: the local-storage copy (see nlPersistCapturedSubmission)
    // is what resume actually depends on in the common case.
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url, false);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(body);
    } catch {
      // Best-effort only.
    }
  }

  function nlPersistCapturedSubmission(formKey, values) {
    const submissionId = nlGenerateSubmissionId();
    const capturedAt = Date.now();
    const localStorageKey = `nodelogic_pending_submit_${formKey}`;
    let embedded = false;
    try {
      const payloadJson = JSON.stringify(values);
      if (payloadJson.length <= NL_FORM_LOCAL_EMBED_LIMIT) {
        localStorage.setItem(localStorageKey, JSON.stringify({ submissionId, capturedAt, values }));
        embedded = true;
      }
    } catch {
      embedded = false;
    }
    // Always also best-effort persist server-side: the backstop for when the
    // local embed above was skipped (oversized / localStorage unavailable),
    // never treated as a delivery guarantee -- see nlSendFormCapture.
    nlSendFormCapture(submissionId, formKey, values, capturedAt);
    if (!embedded) {
      try {
        localStorage.setItem(localStorageKey, JSON.stringify({ submissionId, capturedAt }));
      } catch {
        // localStorage entirely unavailable: resume cannot be detected
        // client-side for this submission. Inherent limit of any client-
        // coordinated reload-resume approach (no browser API guarantees
        // delivery across an unload), not specific to this design -- the
        // graph simply behaves as a fresh, un-submitted page on reload.
      }
    }
    return { submissionId, capturedAt };
  }

  // A submission that does NOT unload this page -- the page's own code
  // called preventDefault() (Elementor Form and most WordPress form plugins
  // submit over AJAX), or the form posts into another window/frame -- must
  // run the graph right here: there is no reload to resume on. Its resume
  // marker is dropped so a later visit can never replay it.
  function nlRunSubmissionOnThisPage(formKey, submission, values) {
    try {
      localStorage.removeItem(`nodelogic_pending_submit_${formKey}`);
    } catch {
      // Nothing to clean up.
    }
    const previous = window.nodelogicFormResumeStore[formKey];
    window.nodelogicFormResumeStore[formKey] = {
      submissionId: submission.submissionId,
      capturedAt: submission.capturedAt,
      values,
      ready: true,
      // Each same-page submission is a NEW firing of the Submitted event.
      sequence: ((previous && previous.sequence) || 0) + 1,
    };
    scheduleRecalculation();
  }

  function nlSubmitStaysOnPage(form, event) {
    if (event.defaultPrevented) return true;
    const submitter = event.submitter;
    const target = String((submitter && submitter.getAttribute && submitter.getAttribute("formtarget")) || form.getAttribute("target") || "").trim().toLowerCase();
    return target !== "" && target !== "_self" && target !== "_top" && target !== "_parent";
  }

  function nlAttachFormSubmitCapture(form, formKey) {
    if (window.nodelogicFormCaptureAttached.has(form)) return;
    window.nodelogicFormCaptureAttached.set(form, true);
    form.addEventListener(
      "submit",
      (event) => {
        // Rapid double-submit / double-click guard: the second of two
        // near-simultaneous submit events on the SAME element is a no-op for
        // OUR bookkeeping (no duplicate beacon, no clobbered localStorage
        // write) -- the browser's own native handling of the double
        // submission itself is unaffected either way, since preventDefault()
        // is never called here. The lock is released shortly after, not left
        // set forever: if the page's OWN validation blocks navigation (calls
        // preventDefault elsewhere), the visitor stays on the same loaded
        // page and can legitimately fix + resubmit -- a permanent lock would
        // silently swallow that second, genuine submission.
        if (form.dataset.nlSubmitLock === "1") return;
        form.dataset.nlSubmitLock = "1";
        setTimeout(() => { delete form.dataset.nlSubmitLock; }, 800);
        try {
          const values = nlCaptureFormData(form);
          const submission = nlPersistCapturedSubmission(formKey, values);
          // This listener runs in the CAPTURE phase, before the page's own
          // submit handlers; only after the whole dispatch is it known
          // whether one of them took over (preventDefault) and the page stays.
          setTimeout(() => {
            if (nlSubmitStaysOnPage(form, event)) {
              nlRunSubmissionOnThisPage(formKey, submission, values);
            }
          }, 0);
        } catch (e) {
          console.warn("[NodeLogic Runtime] form capture failed", e);
        }
      },
      true
    );
  }

  function nlReadFormResumeMarker(formKey) {
    const localStorageKey = `nodelogic_pending_submit_${formKey}`;
    let raw = null;
    try {
      raw = localStorage.getItem(localStorageKey);
    } catch {
      raw = null;
    }
    if (raw === null) return null;
    try {
      localStorage.removeItem(localStorageKey); // single-use at the storage level
    } catch {
      // Non-fatal -- still safe to proceed using the value already read.
    }
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object" || !parsed.submissionId) return null;
    if (typeof parsed.capturedAt !== "number" || Date.now() - parsed.capturedAt > NL_FORM_RESUME_MAX_AGE_MS) {
      return null; // stale (e.g. an abandoned submission that never actually navigated)
    }
    return parsed;
  }

  function nlFetchFormResumeFromServer(formKey, submissionId) {
    if (window.nodelogicFormResumeFetchState[formKey]) return;
    window.nodelogicFormResumeFetchState[formKey] = true;
    const entry = window.nodelogicFormResumeStore[formKey];
    const config = window.calcgraphProFrontendConfig;
    const resolveEmpty = () => {
      if (window.nodelogicFormResumeStore[formKey]) {
        window.nodelogicFormResumeStore[formKey].values = {};
        window.nodelogicFormResumeStore[formKey].ready = true;
      }
      scheduleRecalculation();
    };
    if (!config || !config.restUrl || !entry) {
      resolveEmpty();
      return;
    }
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", `${config.restUrl}form-resume/${encodeURIComponent(submissionId)}`, true);
      // Same nonce action as the capture POST (calcgraph_form_resume), not
      // the general 'wp_rest' one Send Email uses -- both ends of the form
      // capture/resume round trip are verified against one dedicated action.
      try { xhr.setRequestHeader("X-WP-Nonce", config.formResumeNonce || ""); } catch { /* ignore */ }
      xhr.timeout = 10000;
      xhr.onload = () => {
        let values = {};
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText || "{}");
            if (parsed && parsed.values && typeof parsed.values === "object") values = parsed.values;
          } catch {
            // Fall through to empty.
          }
        }
        if (window.nodelogicFormResumeStore[formKey]) {
          window.nodelogicFormResumeStore[formKey].values = values;
          window.nodelogicFormResumeStore[formKey].ready = true;
        }
        scheduleRecalculation();
      };
      xhr.onerror = resolveEmpty;
      xhr.ontimeout = resolveEmpty;
      xhr.send();
    } catch {
      resolveEmpty();
    }
  }

  function __nodeFormData(elementIdOrRef, formNodeId, blockScope) {
    const empty = { data: { values: {}, submissionId: null, capturedAt: null }, event: null };
    if (!window.calcgraphProFrontendConfig) return empty; // PRO not active: feature is inert.

    const element = nlIsElement(elementIdOrRef) ? elementIdOrRef : resolveNodeElement(elementIdOrRef);
    if (!element) return empty;
    // The configured ID often belongs to a WRAPPER, not the <form> itself:
    // Elementor puts a Form widget's CSS ID on the widget's outer div. The
    // editor's field detection already looked inside it, so the runtime must
    // too -- `new FormData(div)` throws, which silently lost every submission.
    const form = nlResolveFormElement(element);
    if (!form) return empty;

    // Folds in blockScope for the same reason __nodeMemoryGet/Set do (see
    // their comments): two duplicated widgets built from the same template
    // share the same graph-node id, so the resume marker's key must be
    // disambiguated per rendered block instance, not just per Form node.
    // Keyed by the element the user configured (stable across reloads).
    const formKey = `${toSafeString(blockScope) || "noscope"}::${nlEnsureElementId(element)}`;
    nlAttachFormSubmitCapture(form, formKey);

    if (!window.nodelogicFormResumeStore[formKey]) {
      const marker = nlReadFormResumeMarker(formKey);
      if (!marker) {
        window.nodelogicFormResumeStore[formKey] = null;
      } else {
        window.nodelogicFormResumeStore[formKey] = {
          submissionId: marker.submissionId,
          capturedAt: marker.capturedAt,
          values: marker.values || null,
          ready: !!marker.values,
        };
        if (!marker.values) nlFetchFormResumeFromServer(formKey, marker.submissionId);
      }
    }

    const entry = window.nodelogicFormResumeStore[formKey];
    if (!entry) return empty;
    if (!entry.ready) {
      // Id/timestamp known, values not yet back from the server fallback --
      // withheld until ready so Validate/Calculate never see a momentarily
      // empty `values` for a submission that is NOT actually empty, and so
      // Send Email's trigger never fires on incomplete data.
      return { data: { values: {}, submissionId: entry.submissionId, capturedAt: entry.capturedAt }, event: null };
    }
    return {
      data: { values: entry.values || {}, submissionId: entry.submissionId, capturedAt: entry.capturedAt },
      // One stable key per Form node (per block); the count grows with every
      // same-page submission, so each one is a new firing for consumers that
      // track "fired since I last looked" (nlConsumeEventOnce, Event
      // Processor). A resumed submission after a reload is firing #1.
      event: { eventKey: `form::${toSafeString(blockScope) || "noscope"}::${formNodeId}`, triggeredCount: entry.sequence || 1 },
    };
  }

  function nlConsumeEventOnce(trigger, consumedKey) {
    // Deliberately UNLIKE __nodeMemoryConsumeTrigger (which treats an
    // unwired trigger as "always apply", matching plain memory-write
    // semantics): a side-effecting action like sending an email must default
    // to NEVER firing when nothing is wired to Trigger at all -- forgetting
    // to wire it should mean "nothing happens", not "an email on every
    // recalculation".
    if (!trigger || typeof trigger !== "object" || !trigger.eventKey) return false;
    const currentCount = trigger.triggeredCount || 0;
    const consumedCount = window.eventProcessorConsumed[consumedKey] || 0;
    if (currentCount > consumedCount) {
      window.eventProcessorConsumed[consumedKey] = currentCount;
      return true;
    }
    return false;
  }

  // Per Send Email node: the current status plus how many times it has
  // started / succeeded / failed -- the counts back its Sending / Sent /
  // Failed event outputs (a new count = a new firing of that event).
  function nlEmailState(statusKey) {
    const store = window.nodelogicEmailStatusStore;
    if (!store[statusKey]) {
      store[statusKey] = { sending: false, ok: false, error: "", sendingCount: 0, sentCount: 0, failedCount: 0 };
    }
    return store[statusKey];
  }

  function nlEmailFinish(statusKey, ok, error) {
    const state = nlEmailState(statusKey);
    state.sending = false;
    state.ok = !!ok;
    state.error = ok ? "" : toSafeString(error || "Send failed");
    if (ok) state.sentCount += 1; else state.failedCount += 1;
  }

  function nlSendEmailRequest(statusKey, payload) {
    if (window.nodelogicEmailInFlight.has(statusKey)) return;
    window.nodelogicEmailInFlight.add(statusKey);
    const finish = (ok, error) => {
      window.nodelogicEmailInFlight.delete(statusKey);
      nlEmailFinish(statusKey, ok, error);
      scheduleRecalculation();
    };
    const config = window.calcgraphProFrontendConfig;
    if (!config || !config.restUrl) {
      finish(false, "NodeLogic Pro is not active");
      return;
    }
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${config.restUrl}send-email`, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      try { xhr.setRequestHeader("X-WP-Nonce", config.nonce || ""); } catch { /* ignore */ }
      xhr.timeout = 20000;
      xhr.onload = () => {
        let parsed = null;
        try { parsed = JSON.parse(xhr.responseText || "{}"); } catch { parsed = null; }
        if (xhr.status < 200 || xhr.status >= 300) {
          // Keep the server's own reason (no license, not allowed for
          // anonymous visitors, page not published, expired nonce...) --
          // it is what tells the site owner WHY nothing was sent.
          finish(false, (parsed && parsed.message) || `HTTP ${xhr.status}`);
          return;
        }
        if (!parsed || typeof parsed !== "object") {
          finish(false, "Malformed response");
          return;
        }
        finish(!!parsed.ok, parsed.ok ? "" : (parsed.error || "Send failed"));
      };
      xhr.onerror = () => finish(false, "Network error");
      xhr.ontimeout = () => finish(false, "Timeout");
      xhr.send(JSON.stringify(payload));
    } catch {
      finish(false, "Request failed");
    }
  }

  function __nodeSendEmail(recipient, subject, message, trigger, sendNodeId, blockScope, editorId, postId) {
    const consumedKey = `sendEmail::${toSafeString(blockScope) || "noscope"}::${toSafeString(sendNodeId)}`;
    const shouldFire = nlConsumeEventOnce(trigger, consumedKey);
    const state = nlEmailState(consumedKey);

    if (shouldFire) {
      if (!window.calcgraphProFrontendConfig) {
        nlEmailFinish(consumedKey, false, "NodeLogic Pro is not active");
      } else {
        const to = toSafeString(recipient).trim();
        if (!to) {
          nlEmailFinish(consumedKey, false, "Missing recipient");
        } else if (!window.nodelogicEmailInFlight.has(consumedKey)) {
          state.sending = true;
          state.ok = false;
          state.error = "";
          state.sendingCount += 1;
          nlSendEmailRequest(consumedKey, {
            to,
            subject: toSafeString(subject),
            message: toSafeString(message),
            postId: toSafeString(postId),
            blockEditorId: toSafeString(editorId),
            nodeId: toSafeString(sendNodeId),
          });
        }
      }
    }

    // A fresh object every evaluation, so downstream nodes always see the
    // current values (never a stale reference compared by identity).
    return {
      sending: state.sending,
      ok: state.ok,
      error: state.error,
      sendingEvent: { eventKey: `${consumedKey}::sending`, triggeredCount: state.sendingCount },
      sentEvent: { eventKey: `${consumedKey}::sent`, triggeredCount: state.sentCount },
      failedEvent: { eventKey: `${consumedKey}::failed`, triggeredCount: state.failedCount },
    };
  }

  // ---- PRO Database nodes (runtime) ----
  //
  // The browser never describes a query: DB Table / Fields / Join / Filter /
  // Sort nodes only carry RUNTIME VALUES (a wired filter's current value)
  // along the Query chain. The server re-derives the whole query shape from
  // the SAVED graph, verifies the administrator's signature on it, and binds
  // these values as SQL parameters -- see the PRO plugin's db-spec.php. Like
  // Send Email, the whole feature is inert without window.calcgraphProFrontendConfig.
  window.nodelogicDbSelectStore = window.nodelogicDbSelectStore || new Map();
  window.nodelogicDbWriteStatus = window.nodelogicDbWriteStatus || {};
  window.nodelogicDbWriteInFlight = window.nodelogicDbWriteInFlight || new Set();
  const NL_DB_SELECT_CACHE_MAX = 200;

  function nlDbPlainValue(value, depth = 0) {
    if (value === null || value === undefined) return null;
    const type = typeof value;
    if (type === "string" || type === "boolean") return value;
    if (type === "number") return Number.isFinite(value) ? value : null;
    if (depth > 2) return null;
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => nlDbPlainValue(item, depth + 1));
    if (value && value.nodeType === 1) {
      // A DOM element feeding a filter means "its value".
      return "value" in value ? toSafeString(value.value) : toSafeString(value.textContent);
    }
    if (type === "object") {
      try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
    }
    return null;
  }

  function __nodeDbChain(nodeId, upstream, value) {
    const base = upstream && typeof upstream === "object" && upstream.__nlDbQuery ? upstream : null;
    const filters = Object.assign({}, base ? base.filters : {});
    if (value !== undefined) {
      filters[toSafeString(nodeId)] = nlDbPlainValue(value);
    }
    return { __nlDbQuery: 1, filters };
  }

  function nlDbRequest(payload, onDone) {
    const config = window.calcgraphProFrontendConfig;
    if (!config || !config.restUrl) {
      onDone({ ok: false, error: "NodeLogic Pro is not active" });
      return;
    }
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${config.restUrl}db/execute`, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      try { xhr.setRequestHeader("X-WP-Nonce", config.nonce || ""); } catch { /* ignore */ }
      xhr.timeout = 20000;
      xhr.onload = () => {
        let parsed = null;
        try { parsed = JSON.parse(xhr.responseText || "{}"); } catch { parsed = null; }
        if (xhr.status < 200 || xhr.status >= 300) {
          onDone({ ok: false, error: toSafeString((parsed && parsed.message) || `HTTP ${xhr.status}`) });
          return;
        }
        onDone(parsed && typeof parsed === "object" ? parsed : { ok: false, error: "Malformed response" });
      };
      xhr.onerror = () => onDone({ ok: false, error: "Network error" });
      xhr.ontimeout = () => onDone({ ok: false, error: "Timeout" });
      xhr.send(JSON.stringify(payload));
    } catch {
      onDone({ ok: false, error: "Request failed" });
    }
  }

  function nlDbEmptySelect(status) {
    return { rows: [], firstRow: {}, count: 0, status };
  }

  function __nodeDbSelect(opNodeId, query, limit, offset, blockScope, editorId, postId) {
    const filters = query && typeof query === "object" && query.__nlDbQuery ? query.filters : {};
    const payload = {
      postId: toSafeString(postId),
      blockEditorId: toSafeString(editorId),
      nodeId: toSafeString(opNodeId),
      filters,
      limit: Number.isFinite(Number(limit)) ? Number(limit) : null,
      offset: Number.isFinite(Number(offset)) ? Number(offset) : null,
    };
    const key = `${toSafeString(blockScope)}::${JSON.stringify(payload)}`;
    const opKey = `${toSafeString(blockScope)}::${toSafeString(opNodeId)}`;
    const store = window.nodelogicDbSelectStore;
    const entry = store.get(key);
    if (entry && entry.done) {
      return entry.result;
    }

    // While a request is pending, keep showing this node's last result
    // (stale-while-revalidate) instead of flashing empty.
    const previous = store.get(`last::${opKey}`);
    const pending = previous
      ? { ...previous, status: { ...previous.status, loading: true } }
      : nlDbEmptySelect({ ok: false, loading: true, error: "", count: 0 });

    if (!entry) {
      if (!window.calcgraphProFrontendConfig) {
        const inactive = nlDbEmptySelect({ ok: false, loading: false, error: "NodeLogic Pro is not active", count: 0 });
        store.set(key, { done: true, result: inactive });
        return inactive;
      }
      store.set(key, { done: false });
      if (store.size > NL_DB_SELECT_CACHE_MAX) {
        store.delete(store.keys().next().value);
      }
      nlDbRequest(payload, (response) => {
        let result;
        if (response && response.ok) {
          const rows = Array.isArray(response.rows) ? response.rows : [];
          result = {
            rows,
            firstRow: rows[0] && typeof rows[0] === "object" ? rows[0] : {},
            count: rows.length,
            status: { ok: true, loading: false, error: "", count: rows.length },
          };
        } else {
          result = nlDbEmptySelect({ ok: false, loading: false, error: toSafeString(response && response.error) || "Query failed", count: 0 });
        }
        store.set(key, { done: true, result });
        store.set(`last::${opKey}`, result);
        scheduleRecalculation();
      });
    }
    return pending;
  }

  // A successful write can change what any SELECT on the page would return.
  function nlDbInvalidateSelects() {
    const store = window.nodelogicDbSelectStore;
    Array.from(store.keys()).forEach((key) => {
      if (!key.startsWith("last::")) store.delete(key);
    });
  }

  function __nodeDbWrite(opNodeId, query, values, trigger, blockScope, editorId, postId) {
    const statusKey = `dbWrite::${toSafeString(blockScope) || "noscope"}::${toSafeString(opNodeId)}`;
    const idle = { sending: false, ok: false, error: "", affectedRows: 0, insertId: 0 };

    // Writes run ONLY on a genuinely new firing of the wired Trigger event
    // (nothing wired = never), exactly like Send Email.
    if (nlConsumeEventOnce(trigger, statusKey)) {
      if (!window.calcgraphProFrontendConfig) {
        window.nodelogicDbWriteStatus[statusKey] = { ...idle, error: "NodeLogic Pro is not active" };
      } else if (!window.nodelogicDbWriteInFlight.has(statusKey)) {
        window.nodelogicDbWriteInFlight.add(statusKey);
        window.nodelogicDbWriteStatus[statusKey] = { ...idle, sending: true };
        nlDbRequest({
          postId: toSafeString(postId),
          blockEditorId: toSafeString(editorId),
          nodeId: toSafeString(opNodeId),
          filters: query && typeof query === "object" && query.__nlDbQuery ? query.filters : {},
          values: Array.isArray(values) ? values.map((value) => nlDbPlainValue(value)) : [],
        }, (response) => {
          window.nodelogicDbWriteInFlight.delete(statusKey);
          window.nodelogicDbWriteStatus[statusKey] = response && response.ok
            ? { ...idle, ok: true, affectedRows: Number(response.affectedRows) || 0, insertId: Number(response.insertId) || 0 }
            : { ...idle, error: toSafeString(response && response.error) || "Operation failed" };
          if (response && response.ok) nlDbInvalidateSelects();
          scheduleRecalculation();
        });
      }
    }

    return window.nodelogicDbWriteStatus[statusKey] || idle;
  }

  function isApiScalarType(type) {
    return type === "string" || type === "number" || type === "boolean" || type === "color" || type === "zip" || type === "case" || type === "chart-data";
  }

  function coerceApiScalar(value, type) {
    const normalizedType = isApiScalarType(type) ? type : "zip";

    if (normalizedType === "zip") {
      return value;
    }

    if (normalizedType === "boolean") {
      if (typeof value === "boolean") return value;
      const text = toSafeString(value).trim().toLowerCase();
      if (text === "true") return true;
      if (text === "false") return false;
      return Boolean(value);
    }

    if (normalizedType === "number") {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    }

    if (normalizedType === "color" || normalizedType === "case" || normalizedType === "string") {
      return toSafeString(value);
    }

    return value;
  }

  function resolveApiFieldByNameOrType(item, fieldName, desiredType, matchMode, fallbackValue) {
    const rawFieldName = toSafeString(fieldName).trim();
    const normalizedMode = toSafeString(matchMode).trim().toLowerCase() || "auto";
    const candidateType = isApiScalarType(desiredType) ? desiredType : "string";

    if (item && typeof item === "object") {
      if (rawFieldName) {
        const direct = __nodeGetPath(item, rawFieldName, undefined);
        if (direct !== undefined && direct !== null) {
          return direct;
        }
      }

      if (normalizedMode !== "names") {
        const values = Object.values(item);
        const stringMatch = values.find((value) => typeof value === "string" && value.trim().length > 0);
        const numberMatch = values.find((value) => typeof value === "number" && Number.isFinite(value));
        const booleanMatch = values.find((value) => typeof value === "boolean");
        const objectMatch = values.find((value) => value && typeof value === "object");

        if (candidateType === "number" && numberMatch !== undefined) return numberMatch;
        if (candidateType === "boolean" && booleanMatch !== undefined) return booleanMatch;
        if (candidateType === "zip" && objectMatch !== undefined) return objectMatch;
        if ((candidateType === "color" || candidateType === "case" || candidateType === "string") && stringMatch !== undefined) return stringMatch;

        if (candidateType === "string") {
          if (stringMatch !== undefined) return stringMatch;
          if (numberMatch !== undefined) return String(numberMatch);
        }
      }
    }

    if (fallbackValue !== undefined) {
      return fallbackValue;
    }

    return item;
  }

  function normalizeApiListSource(source, rawPath) {
    const parsedSource = tryParseJsonValue(source);
    const path = toSafeString(rawPath).trim();
    let collection = parsedSource;

    if (path) {
      collection = __nodeGetPath(parsedSource, path, parsedSource);
    } else if (parsedSource && typeof parsedSource === "object" && !Array.isArray(parsedSource)) {
      const preferredKeys = ["items", "data", "results", "rows", "list", "entries"];
      for (const key of preferredKeys) {
        const candidate = parsedSource[key];
        if (Array.isArray(candidate)) {
          collection = candidate;
          break;
        }
      }
    }

    if (Array.isArray(collection)) {
      return collection;
    }

    if (collection && typeof collection === "object") {
      return [collection];
    }

    if (collection !== undefined && collection !== null) {
      return [collection];
    }

    return [];
  }

  function __nodeApiListMapper(sourceValue, rawPath, labelField, valueField, matchMode, itemType, customNodeIdOrMappings, fieldMappings) {
    const normalizedType = itemType === "chart-data" ? "chart-data" : (isApiScalarType(itemType) ? itemType : "string");
    const list = normalizeApiListSource(sourceValue, rawPath);
    const normalizedLabelField = toSafeString(labelField).trim() || "label";
    const normalizedValueField = toSafeString(valueField).trim() || "value";
    const normalizedMode = toSafeString(matchMode).trim().toLowerCase() || "auto";
    const normalizedFieldMappings = Array.isArray(fieldMappings)
      ? fieldMappings
      : Array.isArray(customNodeIdOrMappings)
        ? customNodeIdOrMappings
        : [];

    return list.map((item, index) => {
      const baseItem = tryParseJsonValue(item);
      const isPlainObject = baseItem && typeof baseItem === "object" && !Array.isArray(baseItem);
      const sourceItem = isPlainObject ? baseItem : { value: baseItem, label: baseItem };

      if (normalizedType === "chart-data") {
        return {
          label: resolveApiFieldByNameOrType(
            sourceItem,
            normalizedLabelField || "label",
            "string",
            normalizedMode,
            ""
          ),
          value: resolveApiFieldByNameOrType(
            sourceItem,
            normalizedValueField || "value",
            "number",
            normalizedMode,
            0
          )
        };
      }

      if (normalizedType === "zip") {
        const activeMappings = normalizedFieldMappings.length > 0
          ? normalizedFieldMappings
          : [
            { fieldId: normalizedLabelField || "label", path: normalizedLabelField || "label" },
            { fieldId: normalizedValueField || "value", path: normalizedValueField || "value" }
          ];

        const mappedItem = {};
        activeMappings.forEach((mapping, mappingIndex) => {
          const fieldId = toSafeString(mapping?.fieldId || mapping?.id || mapping?.label || `field-${mappingIndex + 1}`).trim();
          if (!fieldId) {
            return;
          }
          const mappingPath = toSafeString(mapping?.path || mapping?.valuePath || mapping?.sourcePath || "").trim() || fieldId;
          mappedItem[fieldId] = resolveApiFieldByNameOrType(
            sourceItem,
            mappingPath,
            "string",
            normalizedMode,
            ""
          );
        });
        return mappedItem;
      }

      const rawValue = resolveApiFieldByNameOrType(
        sourceItem,
        normalizedValueField,
        normalizedType,
        normalizedMode,
        isPlainObject ? baseItem : baseItem
      );

      return coerceApiScalar(rawValue, normalizedType);
    });
  }

  // Canonical NodeLogic element-attribute selectors, in resolution priority order.
  const NL_ELEMENT_ATTR_SELECTORS = [
    "data-nodelogic-id",
    "data-nodelogic-chart-id",
    "data-nodelogic-custom-element-id",
    "data-slider-id"
  ];

  // Run the canonical selector chain inside a single document.
  // Preserves the historical behaviour of resolveNodeElement:
  //   - #/./[ selectors  -> querySelector (no id/attr fallback)
  //   - bare token       -> getElementById, then data-* attribute selectors
  function nlQueryElementInDocument(selector, doc) {
    if (!doc || typeof doc.querySelector !== "function") return null;

    if (selector.startsWith("#") || selector.startsWith(".") || selector.includes("[")) {
      try {
        return doc.querySelector(selector) || null;
      } catch {
        return null;
      }
    }

    if (typeof doc.getElementById === "function") {
      const byId = doc.getElementById(selector);
      if (byId) return byId;
    }

    for (let i = 0; i < NL_ELEMENT_ATTR_SELECTORS.length; i++) {
      try {
        const found = doc.querySelector(
          `[${NL_ELEMENT_ATTR_SELECTORS[i]}="${CSS.escape(selector)}"]`
        );
        if (found) return found;
      } catch {
        /* ignore malformed selector for this attribute */
      }
    }

    return null;
  }

  // Safely reach an iframe's document; returns null for cross-origin / unloaded frames.
  function nlAccessibleFrameDocument(frame) {
    try {
      return (
        frame.contentDocument ||
        (frame.contentWindow && frame.contentWindow.document) ||
        null
      );
    } catch {
      return null;
    }
  }

  function resolveNodeElement(rawSelector) {
    let selector = toSafeString(rawSelector).trim();
    if (!selector) return null;

    if (selector.startsWith("[") && selector.endsWith("]") && selector.length > 2) {
      selector = selector.slice(1, -1).trim();
    }

    if (!selector) return null;

    // Primary lookup: the main runtime document (unchanged behaviour).
    const primary = nlQueryElementInDocument(selector, document);
    if (primary) return primary;

    // Fallback only when nothing matched in the main document: scan same-origin
    // iframes (isolated preview / embed containers). Elements that exist in the
    // main document are always returned before this runs, so existing behaviour
    // is preserved.
    let frames = null;
    try {
      frames = document.querySelectorAll("iframe");
    } catch {
      frames = null;
    }
    if (frames) {
      for (let i = 0; i < frames.length; i++) {
        const frameDoc = nlAccessibleFrameDocument(frames[i]);
        if (!frameDoc) continue;
        const inFrame = nlQueryElementInDocument(selector, frameDoc);
        if (inFrame) return inFrame;
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Element Reference / Element Property runtime helpers
  // ---------------------------------------------------------------------------

  // Curated map of lowercase property key -> canonical DOM property name.
  // Only these DOM *properties* are ever read via el[prop]; everything else is
  // restricted to string-only attribute reads, so the formula interpreter can
  // never receive an object / DOM node / function.
  const NL_PROP_CANON = {
    value: "value",
    checked: "checked",
    disabled: "disabled",
    required: "required",
    readonly: "readOnly",
    hidden: "hidden",
    min: "min",
    max: "max",
    step: "step",
    minlength: "minLength",
    maxlength: "maxLength",
    selectedindex: "selectedIndex",
    valueasnumber: "valueAsNumber",
    textcontent: "textContent",
    innerhtml: "innerHTML",
    id: "id",
    classname: "className",
    name: "name",
    type: "type",
    placeholder: "placeholder",
    src: "src",
    alt: "alt",
    width: "width",
    height: "height",
    href: "href",
    title: "title",
    tabindex: "tabIndex"
  };
  // Attribute name to use for the fallback read (null = no meaningful attribute).
  const NL_PROP_ATTR = {
    readonly: "readonly",
    classname: "class",
    tabindex: "tabindex",
    valueasnumber: null,
    selectedindex: null,
    textcontent: null,
    innerhtml: null
  };
  const NL_PROP_BOOLEAN = new Set([
    "checked",
    "disabled",
    "required",
    "readonly",
    "hidden"
  ]);
  const NL_PROP_NUMERIC = new Set([
    "min",
    "max",
    "step",
    "minlength",
    "maxlength",
    "selectedindex",
    "valueasnumber",
    "tabindex",
    "width",
    "height"
  ]);
  // Keys for which a wrapper element (e.g. .slider-container) should be
  // unwrapped to its inner form control before reading.
  const NL_CONTROL_KEYS = new Set([
    "value",
    "checked",
    "disabled",
    "required",
    "readonly",
    "min",
    "max",
    "step",
    "minlength",
    "maxlength",
    "selectedindex",
    "valueasnumber",
    "placeholder",
    "type",
    "selectedoption",
    "selectedtext"
  ]);
  const NL_CONTROL_TAGS = new Set(["INPUT", "SELECT", "TEXTAREA", "BUTTON"]);

  function nlIsElement(node) {
    return !!node && typeof node === "object" && node.nodeType === 1;
  }

  // Stable identity for a live element that some operation genuinely needs a
  // STRING key for (e.g. an event-listener registry keyed by id), even
  // though the element itself may have no HTML id at all -- e.g. a child
  // reached via Get Children / For Each with no id attribute. A real id is
  // always reused as-is (already stable, unique, and independently
  // resolvable). Otherwise a synthetic id is generated ONCE per element,
  // tracked in a WeakMap (garbage-collected with the element, no DOM
  // mutation, no attribute added) so the SAME element always gets back the
  // SAME synthetic id on every later call, and two different elements never
  // share one. Never regenerated, never shared, never touches the DOM --
  // callers that need to re-find the element BY that id later (rather than
  // already holding the live reference) must resolve it themselves; this
  // purely gives an in-memory registry something stable to key on.
  const nlGeneratedElementIds = new WeakMap();
  let nlGeneratedElementIdSeq = 0;
  function nlEnsureElementId(el) {
    if (!nlIsElement(el)) return "";
    if (el.id) return el.id;
    let generated = nlGeneratedElementIds.get(el);
    if (!generated) {
      generated = `__nlgen_${++nlGeneratedElementIdSeq}`;
      nlGeneratedElementIds.set(el, generated);
    }
    return generated;
  }

  // Container-unwrap rule: if the resolved node is a wrapper (not itself a form
  // control) and the requested key is control-oriented, descend to the inner
  // input/select/textarea. Structural / text / attribute keys read the node
  // itself.
  function nlUnwrapForProp(el, lowerKey) {
    if (!nlIsElement(el)) return el;
    if (NL_CONTROL_TAGS.has(el.tagName)) return el;
    if (!NL_CONTROL_KEYS.has(lowerKey)) return el;
    let inner = null;
    try {
      inner = el.querySelector && el.querySelector("input, select, textarea");
    } catch {
      inner = null;
    }
    return inner || el;
  }

  function nlResolveElementRef(ref) {
    if (nlIsElement(ref)) return ref;
    const el = resolveNodeElement(ref);
    return nlIsElement(el) ? el : null;
  }

  // Read an attribute from an element, falling back to its inner form control
  // when the element is a NodeLogic wrapper (id sits on the container, custom
  // attributes may live on the nested input/select/textarea). Returns the raw
  // attribute string, or null when absent.
  function nlGetAttrDeep(el, attrName) {
    if (!nlIsElement(el) || !attrName || typeof el.getAttribute !== "function") {
      return null;
    }
    if (el.hasAttribute(attrName)) {
      return el.getAttribute(attrName);
    }
    if (!NL_CONTROL_TAGS.has(el.tagName)) {
      let inner = null;
      try {
        inner = el.querySelector && el.querySelector("input, select, textarea");
      } catch {
        inner = null;
      }
      if (inner && typeof inner.getAttribute === "function" && inner.hasAttribute(attrName)) {
        return inner.getAttribute(attrName);
      }
    }
    return null;
  }

  // Returns a DOM Element or null. Never returns any other value.
  function __nodeGetElement(elementIdOrSelector) {
    const el = resolveNodeElement(elementIdOrSelector);
    return nlIsElement(el) ? el : null;
  }

  // An Output node's "value" write can land on the exact same element +
  // property that a For Each item read via __nodeGetElementProp(__nodeLoopItem, ...)
  // used to compute that very value (e.g. classify a child by its own
  // textContent, then write the classification back onto that same child).
  // Recalculation re-evaluates the whole formula from scratch on every
  // trigger (any event, action, or async completion elsewhere in the SAME
  // logic block -- not just something touching this element), so the NEXT
  // pass reads back its own previous per-item output instead of the item's
  // real content, permanently corrupting the classification even though
  // nothing about that item or its intended inputs ever changed.
  //
  // This is deliberately scoped to ONLY the active __nodeArrayMapGraph /
  // __nodeArrayFilterGraph loop item (see nlActiveLoopItemElement below), not
  // to element reads in general: a plain Get Element Property -> Calculation
  // -> Set chain reading and writing the same element (e.g. a counter that
  // increments its own displayed value across executions) is an intentional,
  // already-tested accumulator pattern (see
  // get_element_property_freshness_smoke.js) and must keep reading the live,
  // just-written value -- only a per-item map/filter classification is
  // expected to be a pure function of that item's own content.
  const nlSelfWriteTracker = new WeakMap(); // Element -> Map<canonicalKey, {baseline, lastWritten}>
  const NL_SELF_WRITE_TRACKED_PROPS = new Set(["value", "textContent"]);
  let nlActiveLoopItemElement = null;

  function nlRecordSelfWrite(el, canonicalKey, value) {
    if (!el || typeof el !== "object" || !NL_SELF_WRITE_TRACKED_PROPS.has(canonicalKey)) return;
    let byProp = nlSelfWriteTracker.get(el);
    if (!byProp) {
      byProp = new Map();
      nlSelfWriteTracker.set(el, byProp);
    }
    const existing = byProp.get(canonicalKey);
    byProp.set(canonicalKey, { baseline: existing ? existing.baseline : value, lastWritten: value });
  }

  function nlApplySelfWriteBaseline(el, canonicalKey, liveValue) {
    if (
      !el ||
      typeof el !== "object" ||
      el !== nlActiveLoopItemElement ||
      !NL_SELF_WRITE_TRACKED_PROPS.has(canonicalKey)
    ) {
      return liveValue;
    }
    let byProp = nlSelfWriteTracker.get(el);
    if (!byProp) {
      byProp = new Map();
      nlSelfWriteTracker.set(el, byProp);
    }
    const rec = byProp.get(canonicalKey);
    if (!rec) {
      byProp.set(canonicalKey, { baseline: liveValue, lastWritten: undefined });
      return liveValue;
    }
    if (rec.lastWritten !== undefined && liveValue === rec.lastWritten) {
      // Live DOM still holds exactly what we last wrote here -- nothing
      // external touched it since, so this read would just be our own echo.
      return rec.baseline;
    }
    // Never written by us, or genuinely changed by something external since
    // our last write -- this is the new real baseline going forward.
    rec.baseline = liveValue;
    return liveValue;
  }

  // Reads a single property / attribute from an element reference.
  // Returns only string | number | boolean | null (never undefined, never an
  // object / DOM node / function).
  function __nodeGetElementProp(elementRef, propertyKey) {
    const name = toSafeString(propertyKey).trim();
    if (!name) return null;

    let el = nlResolveElementRef(elementRef);
    if (!el) return null;

    const lower = name.toLowerCase();
    el = nlUnwrapForProp(el, lower);
    if (!nlIsElement(el)) return null;

    try {
      // <select> convenience keys
      if (lower === "selectedoption" || lower === "selectedtext") {
        if (el.tagName !== "SELECT" || !el.options) return null;
        const opt = el.options[el.selectedIndex];
        if (!opt) return null;
        const raw = lower === "selectedoption" ? opt.value : opt.text;
        return typeof raw === "string" ? raw : String(raw == null ? "" : raw);
      }

      // Arbitrary data-* / aria-* / custom attributes -> string-only read.
      if (!Object.prototype.hasOwnProperty.call(NL_PROP_CANON, lower)) {
        const av = nlGetAttrDeep(el, name);
        return av === null || av === undefined ? null : String(av);
      }

      const canonical = NL_PROP_CANON[lower];

      // type-aware read for `value`
      if (lower === "value") {
        const tag = el.tagName;
        const itype = (
          (typeof el.getAttribute === "function" && el.getAttribute("type")) ||
          el.type ||
          ""
        )
          .toString()
          .toLowerCase();
        if (tag === "INPUT" && (itype === "number" || itype === "range")) {
          const vn =
            typeof el.valueAsNumber === "number"
              ? el.valueAsNumber
              : Number(el.value);
          return Number.isFinite(vn) ? vn : null;
        }
        const sv = el.value;
        if (sv === null || sv === undefined) return null;
        if (typeof sv === "string") return nlApplySelfWriteBaseline(el, "value", sv);
        if (typeof sv === "number") return Number.isFinite(sv) ? String(sv) : null;
        if (typeof sv === "boolean") return String(sv);
        return null;
      }

      // Curated DOM property present on the element.
      if (canonical in el) {
        const raw = el[canonical];
        if (raw !== null && raw !== undefined) {
          if (typeof raw === "boolean") {
            return NL_PROP_NUMERIC.has(lower) ? (raw ? 1 : 0) : raw;
          }
          if (typeof raw === "number") {
            return Number.isFinite(raw) ? raw : null;
          }
          if (typeof raw === "string") {
            if (NL_PROP_BOOLEAN.has(lower)) return raw.length > 0;
            if (NL_PROP_NUMERIC.has(lower)) {
              if (raw.trim() === "") return null;
              const num = Number(raw);
              return Number.isFinite(num) ? num : null;
            }
            return canonical === "textContent" ? nlApplySelfWriteBaseline(el, "textContent", raw) : raw;
          }
          // Non-primitive property value (e.g. SVGAnimatedString) -> attr fallback.
        }
      }

      // Attribute fallback for curated keys.
      if (NL_PROP_BOOLEAN.has(lower)) {
        const boolAttr = Object.prototype.hasOwnProperty.call(NL_PROP_ATTR, lower)
          ? NL_PROP_ATTR[lower]
          : lower;
        return boolAttr ? nlGetAttrDeep(el, boolAttr) !== null : false;
      }

      const attrName = Object.prototype.hasOwnProperty.call(NL_PROP_ATTR, lower)
        ? NL_PROP_ATTR[lower]
        : lower;
      if (attrName === null) return null;
      const av = nlGetAttrDeep(el, attrName);
      if (av === null || av === undefined) return null;
      if (NL_PROP_NUMERIC.has(lower)) {
        if (String(av).trim() === "") return null;
        const an = Number(av);
        return Number.isFinite(an) ? an : null;
      }
      return String(av);
    } catch {
      return null;
    }
  }

  // Page builders wrap a block's real content in a structural element that
  // carries no authored meaning. Elementor renders every widget as
  //   <div class="elementor-element" id="my-id"><div class="elementor-widget-container">…content…</div></div>
  // and flex containers add an inner <div class="e-con-inner">. "The children
  // of my-id" means the children of that content, not a one-item list holding
  // the wrapper — and the editor preview shows it that way. Descend through
  // such a wrapper while it is the element's only child. Bounded; a no-op on
  // Gutenberg / plain markup (the wrapper classes never appear there).
  const NL_TRANSPARENT_CONTAINER_CLASSES = [
    "elementor-widget-container",
    "e-con-inner"
  ];
  // Elementor's editor/preview injects helper + handle elements as real DOM
  // children that DO NOT exist in the rendered frontend (the overlay with the
  // edit/duplicate/remove controls, jQuery-UI resize handles, add-section
  // affordances, the empty-container placeholder). The editor-side Get Children
  // discovery filters these out before it builds the child list + index
  // mapping, so the stored child index refers to rendered children only. This
  // runtime copy keeps the two enumerations identical (defensive if the shared
  // element resolver ever reaches an editor document); on the rendered frontend
  // none of these classes exist, so it is a no-op.
  const NL_ELEMENTOR_EDITOR_ONLY_CLASSES = [
    "elementor-element-overlay",
    "elementor-editor-element-settings",
    "ui-resizable-handle",
    "elementor-empty-view",
    "elementor-first-add",
    "elementor-widget-empty-icon"
  ];
  function nlIsElementorEditorChrome(el) {
    const cl = el && el.classList;
    if (!cl) return false;
    for (let i = 0; i < NL_ELEMENTOR_EDITOR_ONLY_CLASSES.length; i++) {
      if (cl.contains(NL_ELEMENTOR_EDITOR_ONLY_CLASSES[i])) return true;
    }
    for (let i = 0; i < cl.length; i++) {
      if (String(cl[i]).indexOf("elementor-add-") === 0) return true;
    }
    return false;
  }
  // Direct element children that will exist in the rendered frontend: text
  // nodes and Elementor editor-only helper/handle elements removed.
  function nlRenderedChildElements(node) {
    const out = [];
    const kids = node && node.children;
    if (!kids) return out;
    for (let i = 0; i < kids.length; i++) {
      const child = kids[i];
      if (child && child.nodeType === 1 && !nlIsElementorEditorChrome(child)) out.push(child);
    }
    return out;
  }

  // Descends through a chain of single-element-child wrappers to the
  // innermost element that actually holds content -- e.g. an Elementor
  // Heading/Text widget's real tag lives two levels below the id'd
  // `.elementor-element` div (`.elementor-widget-container` > the real
  // <h2>/<p>), and Elementor commonly gives that inner tag its own explicit
  // color/typography, which blocks CSS inheritance from anything set on an
  // ancestor. Stops as soon as an element has zero or 2+ rendered element
  // children (a fork, or a text leaf), so a multi-paragraph text block still
  // gets styled at its shared container rather than picking one paragraph
  // arbitrarily. Bounded; a no-op when the target already IS the content
  // element (the common Gutenberg case).
  function nlDescendSingleChildContent(node) {
    let cur = node;
    for (let hop = 0; hop < 6; hop++) {
      const kids = nlRenderedChildElements(cur);
      if (kids.length !== 1) return cur;
      cur = kids[0];
    }
    return cur;
  }

  // Returns the direct child DOM Elements of an element reference, as they will
  // exist in the rendered frontend, in DOM order. Text nodes, nested
  // descendants and Elementor editor-only helper/handle elements are never
  // included; a lone structural wrapper is stepped through. Operates on the
  // element's OWN document, so an element resolved from a same-origin iframe
  // yields that iframe's children (no main-document lookup). Returns [] on any
  // failure (including a cross-origin / unresolved reference) — never throws.
  function __nodeGetChildren(elementRef) {
    try {
      const resolved = nlResolveElementRef(elementRef);
      if (!nlIsElement(resolved)) return [];
      let node = resolved;
      for (let hop = 0; hop < 6; hop++) {
        const real = nlRenderedChildElements(node);
        if (real.length !== 1 || !real[0].classList) return real;
        let isWrapper = false;
        for (let i = 0; i < NL_TRANSPARENT_CONTAINER_CLASSES.length; i++) {
          if (real[0].classList.contains(NL_TRANSPARENT_CONTAINER_CLASSES[i])) { isWrapper = true; break; }
        }
        if (!isWrapper) return real;
        node = real[0];
      }
      return nlRenderedChildElements(node);
    } catch {
      return [];
    }
  }

  // Returns the Nth direct child DOM Element (0-based, among element children
  // only), or null. Same iframe / failure semantics as __nodeGetChildren.
  function __nodeGetChildAt(elementRef, indexValue) {
    try {
      const idx = Math.trunc(Number(indexValue));
      if (!Number.isFinite(idx) || idx < 0) return null;
      const kids = __nodeGetChildren(elementRef);
      return idx < kids.length ? kids[idx] : null;
    } catch {
      return null;
    }
  }

  // Returns the direct child DOM Elements at the given 0-based indices, in the
  // order the indices are supplied. Out-of-range indices are skipped. Accepts a
  // real array or a JSON string of numbers. Returns [] on any failure.
  function __nodeGetChildrenSubset(elementRef, indicesValue) {
    try {
      let indices = indicesValue;
      if (typeof indices === "string") {
        try { indices = JSON.parse(indices); } catch { indices = []; }
      }
      if (!Array.isArray(indices)) return [];
      const kids = __nodeGetChildren(elementRef);
      const out = [];
      for (let i = 0; i < indices.length; i++) {
        const idx = Math.trunc(Number(indices[i]));
        if (Number.isFinite(idx) && idx >= 0 && idx < kids.length) {
          out.push(kids[idx]);
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  // =====================
  // DOM NODES: Raw HTML, Set Parent, Clone Element, Elements by Class
  // =====================
  // Allowlist HTML sanitizer -- the SAME rules as the editor's
  // src/components/graphEditor/rawHtmlModel.ts (parity tested). Used by the
  // Raw HTML node and the Set HTML action. Approved policy: scripts, event
  // handlers, javascript:/non-image data: URLs, <style>, plugins and SVG
  // animation are removed; <iframe> only for https YouTube/Vimeo/Google Maps.
  const NL_HTML_DROP_TAGS = new Set([
    "script", "style", "template", "noscript", "object", "embed", "applet", "frame", "frameset",
    "base", "link", "meta", "title", "head", "math", "portal", "foreignobject", "animate",
    "animatemotion", "animatetransform", "set", "discard", "handler", "listener", "xml", "param",
  ]);
  const NL_HTML_ALLOWED_TAGS = new Set([
    "a", "abbr", "address", "article", "aside", "audio", "b", "bdi", "bdo", "blockquote", "br", "button",
    "caption", "cite", "code", "col", "colgroup", "data", "dd", "del", "details", "dfn", "div", "dl", "dt",
    "em", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
    "header", "hgroup", "hr", "i", "iframe", "img", "input", "ins", "kbd", "label", "legend", "li", "main",
    "mark", "meter", "nav", "ol", "optgroup", "option", "output", "p", "picture", "pre", "progress", "q",
    "s", "samp", "section", "select", "small", "source", "span", "strong", "sub", "summary", "sup",
    "table", "tbody", "td", "textarea", "tfoot", "th", "thead", "time", "tr", "track", "u", "ul", "var",
    "video", "wbr",
    "svg", "g", "path", "circle", "ellipse", "line", "polyline", "polygon", "rect", "text", "tspan",
    "defs", "lineargradient", "radialgradient", "stop", "use", "symbol", "clippath", "mask", "pattern",
    "desc", "image", "marker",
  ]);
  const NL_HTML_ALLOWED_ATTRS = new Set([
    "id", "class", "style", "title", "lang", "dir", "role", "hidden", "tabindex", "translate", "draggable",
    "href", "target", "rel", "download", "hreflang", "src", "srcset", "sizes", "alt", "width", "height",
    "loading", "decoding", "poster", "controls", "autoplay", "muted", "loop", "playsinline", "preload",
    "kind", "srclang", "label", "default", "media", "type", "cite", "datetime",
    "name", "value", "placeholder", "checked", "disabled", "readonly", "required", "min", "max", "step",
    "minlength", "maxlength", "pattern", "multiple", "size", "autocomplete", "list", "for", "selected",
    "rows", "cols", "wrap", "action", "method", "enctype", "novalidate", "form", "formaction",
    "colspan", "rowspan", "headers", "scope", "span", "start", "reversed", "open", "low", "high", "optimum",
    "allow", "allowfullscreen", "frameborder", "referrerpolicy",
    "viewbox", "xmlns", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
    "stroke-dasharray", "stroke-dashoffset", "d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2",
    "y2", "points", "transform", "opacity", "fill-opacity", "stroke-opacity", "offset", "stop-color",
    "stop-opacity", "gradientunits", "gradienttransform", "preserveaspectratio", "text-anchor",
    "font-size", "font-family", "font-weight", "dominant-baseline", "clip-path", "mask", "fill-rule",
    "clip-rule", "xlink:href", "patternunits", "markerwidth", "markerheight", "refx", "refy", "orient",
  ]);
  const NL_HTML_URL_ATTRS = new Set(["href", "src", "action", "formaction", "poster", "cite", "xlink:href"]);
  const NL_HTML_BOOLEAN_ATTRS = new Set([
    "checked", "disabled", "selected", "readonly", "required", "hidden", "multiple", "open", "autoplay",
    "muted", "loop", "controls", "playsinline", "reversed", "default", "allowfullscreen", "novalidate",
  ]);
  const NL_IFRAME_HOSTS = new Set([
    "www.youtube.com", "youtube.com", "www.youtube-nocookie.com", "youtube-nocookie.com",
    "player.vimeo.com", "www.google.com", "maps.google.com",
  ]);
  const NL_VOID_TAGS = new Set(["img", "input", "br", "hr", "wbr", "source", "track", "col", "iframe", "area", "embed"]);

  function nlIsReservedAttr(name) {
    return name.indexOf("data-nodelogic") === 0 || name === "data-editor-id" || name === "data-formula" || name === "data-slider-id";
  }

  function nlIsSafeHtmlUrl(value, attr, tag) {
    const compact = String(value).replace(/[\u0000- \u007f-\u009f]/g, "");
    if (attr === "xlink:href" || (attr === "href" && (tag === "use" || tag === "image"))) {
      if (compact.charAt(0) === "#") return true;
      if (tag !== "image") return false;
    }
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(compact);
    if (!scheme) return true;
    const name = scheme[1].toLowerCase();
    if (name === "http" || name === "https") return true;
    if ((name === "mailto" || name === "tel") && attr === "href") return true;
    if (name === "data" && attr === "src" && (tag === "img" || tag === "source" || tag === "image")) {
      return /^data:image\/(png|jpe?g|gif|webp|avif|bmp);/i.test(compact);
    }
    return false;
  }

  function nlIsSafeSrcset(value, tag) {
    return String(value).split(",").every((candidate) => {
      const url = candidate.trim().split(/\s+/)[0] || "";
      return url === "" || nlIsSafeHtmlUrl(url, "src", tag);
    });
  }

  function nlIsAllowedIframeSrc(value) {
    try {
      const url = new URL(String(value).trim());
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || !NL_IFRAME_HOSTS.has(host)) return false;
      if (host.slice(-10) === "google.com") return url.pathname.indexOf("/maps/embed") === 0;
      return true;
    } catch {
      return false;
    }
  }

  function nlIsUnsafeStyle(value) {
    return /expression\s*\(|javascript\s*:|vbscript\s*:|-moz-binding|behavior\s*:|@import/i.test(String(value).replace(/\\/g, ""));
  }

  // Sanitizes an INERT subtree (a <template>'s content) in place.
  function nlSanitizeHtmlTree(root) {
    const walk = (parent) => {
      Array.from(parent.childNodes).forEach((node) => {
        if (node.nodeType === 8) {
          if (node.parentNode) node.parentNode.removeChild(node);
          return;
        }
        if (node.nodeType !== 1) return;
        const el = node;
        const tag = String(el.localName || "").toLowerCase();
        if (NL_HTML_DROP_TAGS.has(tag)) {
          el.remove();
          return;
        }
        if (!NL_HTML_ALLOWED_TAGS.has(tag)) {
          walk(el);
          while (el.firstChild) el.parentNode.insertBefore(el.firstChild, el);
          el.remove();
          return;
        }
        if (tag === "iframe" && !nlIsAllowedIframeSrc(el.getAttribute("src") || "")) {
          el.remove();
          return;
        }
        Array.from(el.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          let drop = false;
          if (name.indexOf("on") === 0) drop = true;
          else if (nlIsReservedAttr(name)) drop = true;
          else if (name.indexOf("aria-") === 0 || name.indexOf("data-") === 0) drop = false;
          else if (!NL_HTML_ALLOWED_ATTRS.has(name)) drop = true;
          else if (NL_HTML_URL_ATTRS.has(name) && !nlIsSafeHtmlUrl(attr.value, name, tag)) drop = true;
          else if (name === "srcset" && !nlIsSafeSrcset(attr.value, tag)) drop = true;
          else if (name === "style" && nlIsUnsafeStyle(attr.value)) drop = true;
          if (drop) el.removeAttribute(attr.name);
        });
        if (tag === "a" && String(el.getAttribute("target") || "").toLowerCase() === "_blank") {
          el.setAttribute("rel", "noopener noreferrer");
        }
        walk(el);
      });
    };
    walk(root);
    return root;
  }

  // Parses + sanitizes an HTML string into an inert fragment (a <template>
  // never runs scripts or loads resources while its content is sanitized).
  function nlSanitizeHtmlFragment(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = String(html == null ? "" : html);
    nlSanitizeHtmlTree(tpl.content);
    return tpl.content;
  }

  // Sanitized HTML as a string (Set HTML action).
  function nlSanitizeHtmlString(html) {
    const holder = document.createElement("div");
    holder.appendChild(nlSanitizeHtmlFragment(html));
    return holder.innerHTML;
  }

  // Same root rule as rawHtmlRootFrom (rawHtmlModel.ts).
  function nlRawHtmlRoot(fragment) {
    const nodes = Array.from(fragment.childNodes).filter((node) =>
      node.nodeType === 1 || (node.nodeType === 3 && String(node.textContent || "").trim() !== ""));
    if (nodes.length === 1 && nodes[0].nodeType === 1) return document.importNode(nodes[0], true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(document.importNode(fragment, true));
    return wrapper;
  }

  // Per-instance state for the stateful DOM nodes. Keys:
  // "<blockScope>::<nodeId>" plus, inside a For Each body, "@<loop path>" so
  // every iteration owns its own element / clone.
  const nlDomInstances = new Map();
  const nlDomPassByScope = new Map();
  let nlEvaluatingBlockScope = "";
  let nlActiveLoopPath = [];
  let nlStructuralChange = false;

  function nlDomInstanceKey(blockScope, nodeId) {
    const base = `${toSafeString(blockScope) || "noscope"}::${toSafeString(nodeId)}`;
    return nlActiveLoopPath.length ? `${base}@${nlActiveLoopPath.join(".")}` : base;
  }

  function nlTouchDomInstance(key, blockScope, create) {
    let inst = nlDomInstances.get(key);
    if (!inst) {
      inst = create();
      inst.scope = toSafeString(blockScope) || "noscope";
      inst.loopKeyed = key.indexOf("@") !== -1;
      nlDomInstances.set(key, inst);
    }
    inst.pass = nlDomPassByScope.get(inst.scope) || 0;
    return inst;
  }

  function nlBeginDomPass(blockScope) {
    const scope = toSafeString(blockScope) || "noscope";
    nlDomPassByScope.set(scope, (nlDomPassByScope.get(scope) || 0) + 1);
  }

  // After a fresh evaluation of a block: per-ITEM instances (inside a For
  // Each) that this pass didn't touch belong to items that no longer exist --
  // remove their elements. Instances outside loops persist.
  function nlSweepDomInstances(blockScope) {
    const scope = toSafeString(blockScope) || "noscope";
    const pass = nlDomPassByScope.get(scope) || 0;
    nlDomInstances.forEach((inst, key) => {
      if (inst.scope !== scope || !inst.loopKeyed || inst.pass >= pass) return;
      const owned = [];
      if (inst.el) owned.push(inst.el);
      if (inst.clone) owned.push(inst.clone);
      (inst.clones || []).forEach((c) => owned.push(c));
      owned.forEach((el) => {
        if (el && el.parentNode) {
          el.parentNode.removeChild(el);
          nlStructuralChange = true;
        }
      });
      nlDomInstances.delete(key);
    });
  }

  function nlResolveSlotTarget(root, path) {
    let node = root;
    const parts = String(path || "").split(".").filter((p) => p !== "");
    for (let i = 0; i < parts.length; i++) {
      const index = Number(parts[i]);
      if (!node || !node.children || !Number.isInteger(index) || index < 0 || index >= node.children.length) return null;
      node = node.children[index];
    }
    return node;
  }

  function nlApplyRawHtmlSlot(target, kind, name, value) {
    const tag = String(target.localName || "").toLowerCase();
    if (kind === "text") {
      const text = value === null || value === undefined ? "" : toSafeString(value);
      if (target.children.length === 0) {
        if (target.textContent !== text) target.textContent = text;
        if (tag === "textarea" && target.value !== text) target.value = text;
      }
      return;
    }
    if (kind === "style") {
      if (!/^-?[a-z][a-z0-9-]*$/i.test(name)) return;
      const css = value === null || value === undefined ? "" : toSafeString(value).trim();
      if (css === "") { target.style.removeProperty(name); return; }
      if (nlIsUnsafeStyle(css)) return;
      target.style.setProperty(name, css);
      return;
    }
    // attribute: same allowlist + URL rules as the sanitizer
    const attr = String(name || "").toLowerCase();
    if (!attr || attr.indexOf("on") === 0 || nlIsReservedAttr(attr) || attr === "style") return;
    if (!NL_HTML_ALLOWED_ATTRS.has(attr) && attr.indexOf("aria-") !== 0 && attr.indexOf("data-") !== 0) return;
    if (NL_HTML_BOOLEAN_ATTRS.has(attr)) {
      const on = value === true || value === "true" || value === 1 || value === "1" || (typeof value === "string" && value !== "" && value !== "false" && value !== "0");
      if (on) target.setAttribute(attr, ""); else target.removeAttribute(attr);
      if (attr in target && typeof target[attr] === "boolean") target[attr] = on;
      return;
    }
    const text = value === null || value === undefined ? "" : toSafeString(value);
    if (NL_HTML_URL_ATTRS.has(attr) && !nlIsSafeHtmlUrl(text, attr, tag)) return;
    if (attr === "srcset" && !nlIsSafeSrcset(text, tag)) return;
    if (tag === "iframe" && attr === "src" && !nlIsAllowedIframeSrc(text)) return;
    if (target.getAttribute(attr) !== text) target.setAttribute(attr, text);
    if (attr === "value" && (tag === "input" || tag === "select" || tag === "textarea") && target.value !== text) target.value = text;
  }

  // Raw HTML node. `slots` = [[path, kind, name], ...] (checked in the
  // editor), `values` = the matching wired values (undefined = pin unwired:
  // keep what the HTML says). Returns ONE stable element per node instance --
  // re-evaluations update it in place, never re-create it.
  function __nodeRawHtml(nodeId, html, slots, values, blockScope) {
    try {
      const source = toSafeString(html);
      const key = nlDomInstanceKey(blockScope, nodeId);
      const inst = nlTouchDomInstance(key, blockScope, () => ({ html: null, el: null, originals: {} }));
      if (inst.html !== source || !inst.el) {
        if (inst.el && inst.el.parentNode) {
          // The node's HTML changed (editor preview): swap in place.
          const next = nlRawHtmlRoot(nlSanitizeHtmlFragment(source));
          inst.el.parentNode.replaceChild(next, inst.el);
          inst.el = next;
          nlStructuralChange = true;
        } else {
          inst.el = source.trim() ? nlRawHtmlRoot(nlSanitizeHtmlFragment(source)) : null;
        }
        inst.html = source;
        inst.originals = {};
      }
      if (!inst.el) return null;
      const list = Array.isArray(slots) ? slots : [];
      const vals = Array.isArray(values) ? values : [];
      for (let i = 0; i < list.length; i++) {
        const spec = Array.isArray(list[i]) ? list[i] : [];
        const kind = spec[1] === "attr" || spec[1] === "style" ? spec[1] : "text";
        const name = toSafeString(spec[2]);
        const target = nlResolveSlotTarget(inst.el, spec[0]);
        if (!nlIsElement(target)) continue;
        const slotKey = `${spec[0]}|${kind}:${name}`;
        if (!(slotKey in inst.originals)) {
          inst.originals[slotKey] = kind === "text"
            ? target.textContent
            : kind === "style" ? target.style.getPropertyValue(name) : target.getAttribute(name);
        }
        let value = vals[i];
        if (value === undefined) value = inst.originals[slotKey];
        if (value && typeof value === "object" && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, "value")) value = value.value;
        nlApplyRawHtmlSlot(target, kind, name, value);
      }
      return inst.el;
    } catch {
      return null;
    }
  }

  function nlCanReceiveChildren(el) {
    if (!nlIsElement(el)) return false;
    return !NL_VOID_TAGS.has(String(el.localName || "").toLowerCase());
  }

  function nlIsDocumentLevelElement(el) {
    const tag = String(el && el.localName || "").toLowerCase();
    return tag === "html" || tag === "head" || tag === "body";
  }

  function nlPlaceInParent(el, parent, position) {
    if (position === "start") parent.insertBefore(el, parent.firstChild);
    else parent.appendChild(el);
    nlStructuralChange = true;
  }

  // Set Parent: moves `element` into `parent`. Without a Trigger it keeps the
  // element there (moves only while it has a different parent -- idempotent);
  // with a Trigger it moves once per event.
  function __nodeSetParent(nodeId, element, parent, position, trigger, hasTrigger, blockScope) {
    try {
      const el = nlResolveElementRef(element);
      const par = nlResolveElementRef(parent);
      if (!el || !par) return el || null;
      if (el === par || el.contains(par) || nlIsDocumentLevelElement(el) || !nlCanReceiveChildren(par)) return el;
      const pos = position === "start" ? "start" : "end";
      if (hasTrigger) {
        const key = nlDomInstanceKey(blockScope, nodeId);
        if (nlConsumeEventOnce(trigger, `${key}::setParent`)) nlPlaceInParent(el, par, pos);
      } else if (el.parentNode !== par) {
        nlPlaceInParent(el, par, pos);
      }
      return el;
    } catch {
      return null;
    }
  }

  let nlCloneSeq = 0;
  const NL_ID_REF_ATTRS = ["for", "aria-labelledby", "aria-describedby", "aria-controls", "aria-owns", "list", "form"];

  // Duplicate ids break id lookups (Output targets, labels): every id in the
  // copy gets a unique suffix, and references inside the copy follow it.
  function nlRenameClonedIds(root) {
    const seq = ++nlCloneSeq;
    const renamed = {};
    const all = [root].concat(Array.from(root.querySelectorAll("[id]")));
    all.forEach((el) => {
      const id = el.getAttribute && el.getAttribute("id");
      if (!id) return;
      renamed[id] = `${id}-nlcopy${seq}`;
      el.setAttribute("id", renamed[id]);
    });
    if (!Object.keys(renamed).length) return;
    [root].concat(Array.from(root.querySelectorAll("*"))).forEach((el) => {
      NL_ID_REF_ATTRS.forEach((attr) => {
        const value = el.getAttribute(attr);
        if (!value) return;
        const next = value.split(/\s+/).map((part) => renamed[part] || part).join(" ");
        if (next !== value) el.setAttribute(attr, next);
      });
      const href = el.getAttribute("href");
      if (href && href.charAt(0) === "#" && renamed[href.slice(1)]) el.setAttribute("href", `#${renamed[href.slice(1)]}`);
    });
  }

  function nlIsCloneable(el) {
    if (!nlIsElement(el) || nlIsDocumentLevelElement(el)) return false;
    // A copied logic block would run its graph twice.
    if (el.matches && el.matches("[data-nodelogic-logic]")) return false;
    if (el.querySelector && el.querySelector("[data-nodelogic-logic]")) return false;
    return true;
  }

  // Clone Element. Without a Trigger: exactly ONE copy per node instance
  // (re-created only if the source element itself changes). With a Trigger:
  // one new copy per event; `clone` is the newest, `clones` all of them.
  // placement: "after" (next to the source / previous copy) or "detached"
  // (for Set Parent / an Output to place).
  function __nodeCloneElement(nodeId, element, placement, trigger, hasTrigger, blockScope) {
    const empty = { clone: null, clones: [] };
    try {
      const key = nlDomInstanceKey(blockScope, nodeId);
      const inst = nlTouchDomInstance(key, blockScope, () => ({ source: null, clone: null, clones: [] }));
      const src = nlResolveElementRef(element);
      const place = (copy, after) => {
        if (placement === "detached" || !after || !after.parentNode) return;
        after.parentNode.insertBefore(copy, after.nextSibling);
        nlStructuralChange = true;
      };
      const makeCopy = () => {
        const copy = src.cloneNode(true);
        nlRenameClonedIds(copy);
        return copy;
      };
      if (hasTrigger) {
        if (src && nlIsCloneable(src) && nlConsumeEventOnce(trigger, `${key}::clone`)) {
          const copy = makeCopy();
          const previous = inst.clones.length ? inst.clones[inst.clones.length - 1] : null;
          place(copy, previous && previous.parentNode ? previous : src);
          inst.clones.push(copy);
        }
        return { clone: inst.clones.length ? inst.clones[inst.clones.length - 1] : null, clones: inst.clones.slice() };
      }
      if (!src || !nlIsCloneable(src)) return inst.clone ? { clone: inst.clone, clones: [inst.clone] } : empty;
      if (inst.source !== src || !inst.clone) {
        if (inst.clone && inst.clone.parentNode) {
          inst.clone.parentNode.removeChild(inst.clone);
          nlStructuralChange = true;
        }
        inst.source = src;
        inst.clone = makeCopy();
        place(inst.clone, src);
      }
      return { clone: inst.clone, clones: [inst.clone] };
    } catch {
      return empty;
    }
  }

  function nlCssEscape(value) {
    if (typeof CSS !== "undefined" && CSS && typeof CSS.escape === "function") return CSS.escape(value);
    return String(value).replace(/[^A-Za-z0-9_-]/g, (ch) => `\\${ch}`);
  }

  // Elements by Class: every element carrying ALL the given classes
  // (space-separated), inside `scope` (an element) or the whole document.
  // Re-queried on every evaluation, so copies / new elements are included.
  function __nodeElementsByClass(classNames, scope) {
    try {
      const tokens = toSafeString(classNames).trim().split(/\s+/).filter(Boolean).slice(0, 10);
      if (!tokens.length || tokens.some((t) => t.length > 100)) return [];
      const selector = tokens.map((t) => `.${nlCssEscape(t)}`).join("");
      const root = scope === undefined || scope === null ? document : nlResolveElementRef(scope);
      if (!root) return [];
      return Array.from(root.querySelectorAll(selector))
        .filter((el) => !nlIsElementorEditorChrome(el))
        .slice(0, 2000);
    } catch {
      return [];
    }
  }

  // Structural changes (a clone / move / mount) re-run the graph ONCE more so
  // readers like Elements by Class see them. Bounded: at most 2 follow-up
  // passes in a row; an outside trigger resets the budget. Guards against
  // ping-pong graphs (two nodes moving one element back and forth).
  let nlStructuralFollowUps = 0;
  let nlInStructuralFollowUp = false;
  function nlAfterRecalculation() {
    const changed = nlStructuralChange;
    nlStructuralChange = false;
    if (!nlInStructuralFollowUp) nlStructuralFollowUps = 0;
    nlInStructuralFollowUp = false;
    if (!changed || nlStructuralFollowUps >= 2) return;
    nlStructuralFollowUps += 1;
    nlInStructuralFollowUp = true;
    scheduleRecalculation();
  }

  // =====================
  // DEBUG NODES: Console Log / Console Warning / Message Log / Message Warning
  // =====================
  // Show whatever reaches them (with its structure) and pass it through.
  // No Trigger: shown whenever the value changes (never on an identical
  // re-evaluation). With Trigger: once per event. Visible only to logged-in
  // content editors unless the node is set to "Everyone".
  const nlDebugLast = new Map();
  const nlDebugBurst = new Map();
  const NL_DEBUG_BURST_LIMIT = 20;
  const NL_DEBUG_BURST_WINDOW_MS = 10000;

  function nlDebugElementSummary(el) {
    const tag = String(el.localName || el.nodeName || "element").toLowerCase();
    const id = el.id ? `#${el.id}` : "";
    const classes = el.classList && el.classList.length ? `.${Array.from(el.classList).slice(0, 3).join(".")}` : "";
    const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
    return `<${tag}${id}${classes}>${text ? ` "${text.length > 60 ? `${text.slice(0, 60)}…` : text}"` : ""}`;
  }

  // Readable, depth/size-limited structure of any graph value.
  function nlDebugFormat(value, depth, seen) {
    const level = depth || 0;
    const visited = seen || new WeakSet();
    const pad = "  ".repeat(level + 1);
    const closePad = "  ".repeat(level);
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    if (typeof value === "string") return JSON.stringify(value.length > 1000 ? `${value.slice(0, 1000)}…` : value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "function") return "[function]";
    if (typeof value !== "object") return String(value);
    if (nlIsElement(value)) return nlDebugElementSummary(value);
    if (visited.has(value)) return "[circular]";
    if (level >= 5) return Array.isArray(value) ? `Array(${value.length}) […]` : "{…}";
    visited.add(value);
    if (Array.isArray(value)) {
      if (!value.length) return "[]";
      const shown = value.slice(0, 50).map((item, index) => `${pad}${index}: ${nlDebugFormat(item, level + 1, visited)}`);
      if (value.length > 50) shown.push(`${pad}… ${value.length - 50} more`);
      return `Array(${value.length}) [\n${shown.join(",\n")}\n${closePad}]`;
    }
    const keys = Object.keys(value);
    if (!keys.length) return "{}";
    const shown = keys.slice(0, 50).map((key) => `${pad}${key}: ${nlDebugFormat(value[key], level + 1, visited)}`);
    if (keys.length > 50) shown.push(`${pad}… ${keys.length - 50} more keys`);
    return `{\n${shown.join(",\n")}\n${closePad}}`;
  }

  // Change detection: like the formatted text, but an element is identified
  // by WHICH element it is, not by how it currently looks.
  function nlDebugSignature(value) {
    try {
      const seen = new WeakSet();
      return JSON.stringify(value === undefined ? "__undefined__" : value, (key, item) => {
        if (nlIsElement(item)) return `__el:${nlEnsureElementId(item)}`;
        if (item && typeof item === "object") {
          if (seen.has(item)) return "__circular__";
          seen.add(item);
        }
        if (typeof item === "function") return "__fn__";
        return item;
      });
    } catch {
      return nlDebugFormat(value);
    }
  }

  function nlDebugCanShow(everyone) {
    if (everyone) return true;
    const config = window.nodelogicFrontendDebug;
    return !!(config && config.canDebug === true);
  }

  function nlDebugMessageHost() {
    let host = document.getElementById("nodelogic-debug-messages");
    if (!host) {
      host = document.createElement("div");
      host.id = "nodelogic-debug-messages";
      host.setAttribute("role", "log");
      host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;gap:8px;max-width:min(460px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;font:12px/1.4 ui-monospace,Consolas,monospace;";
      document.body.appendChild(host);
    }
    return host;
  }

  // A closable message box. Text only (textContent) -- a debugged value can
  // never inject markup.
  function nlDebugShowMessage(label, text, warning) {
    const host = nlDebugMessageHost();
    const box = document.createElement("div");
    box.className = `nodelogic-debug-message${warning ? " nodelogic-debug-message--warning" : ""}`;
    box.style.cssText = `position:relative;padding:10px 32px 10px 12px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.3);border:1px solid ${warning ? "#f59e0b" : "#60a5fa"};background:${warning ? "#451a03" : "#0f172a"};color:${warning ? "#fde68a" : "#e2e8f0"};`;
    const title = document.createElement("div");
    title.style.cssText = "font-weight:700;margin-bottom:4px;font-family:system-ui,sans-serif;";
    title.textContent = `${warning ? "⚠ " : ""}${label}`;
    const body = document.createElement("pre");
    body.style.cssText = "margin:0;white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;";
    body.textContent = text;
    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.style.cssText = "position:absolute;top:4px;right:6px;background:none;border:none;color:inherit;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px;";
    close.addEventListener("click", () => box.remove());
    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(close);
    host.appendChild(box);
    while (host.children.length > 6) host.removeChild(host.firstChild);
  }

  function __nodeDebug(nodeId, kind, label, value, trigger, hasTrigger, everyone, blockScope) {
    try {
      if (!nlDebugCanShow(everyone === true)) return value;
      const key = nlDomInstanceKey(blockScope, nodeId);
      if (hasTrigger) {
        if (!nlConsumeEventOnce(trigger, `${key}::debug`)) return value;
      } else {
        const signature = nlDebugSignature(value);
        if (nlDebugLast.get(key) === signature) return value;
        nlDebugLast.set(key, signature);
      }
      // Burst guard: a value that changes on every pass must not flood.
      const now = Date.now();
      const burst = nlDebugBurst.get(key) || { times: [], noted: false };
      burst.times = burst.times.filter((t) => now - t < NL_DEBUG_BURST_WINDOW_MS);
      if (!burst.times.length) burst.noted = false;
      nlDebugBurst.set(key, burst);
      const title = toSafeString(label) || "Debug";
      if (burst.times.length >= NL_DEBUG_BURST_LIMIT) {
        if (!burst.noted) {
          burst.noted = true;
          console.warn(`[NodeLogic] ${title}: more than ${NL_DEBUG_BURST_LIMIT} outputs in ${NL_DEBUG_BURST_WINDOW_MS / 1000}s -- further ones are skipped for now.`);
        }
        return value;
      }
      burst.times.push(now);
      const text = nlDebugFormat(value);
      if (kind === "warn") console.warn(`[NodeLogic] ${title}:`, value, `\n${text}`);
      else if (kind === "message") nlDebugShowMessage(title, text, false);
      else if (kind === "message-warn") nlDebugShowMessage(title, text, true);
      else console.log(`[NodeLogic] ${title}:`, value, `\n${text}`);
    } catch {
      // debugging must never break the graph
    }
    return value;
  }

  function resolveImageSourceFromElement(element) {
    if (!element) return "";

    if (element.tagName === "IMG") {
      return element.currentSrc || element.src || element.getAttribute("src") || "";
    }

    const dataSrc = element.dataset?.nodelogicImageSrc || element.getAttribute?.("data-nodelogic-image-src") || "";
    if (dataSrc) return dataSrc;

    const img = element.querySelector?.("img");
    if (img) {
      return img.currentSrc || img.src || img.getAttribute("src") || "";
    }

    const style = typeof window !== "undefined" && window.getComputedStyle
      ? window.getComputedStyle(element).backgroundImage
      : "";
    const match = String(style || "").match(/url\((['"]?)(.*?)\1\)/i);
    return match ? match[2] : "";
  }

  function __nodeImageFromLink(url) {
    return toSafeString(url).trim();
  }

  function __nodeImageFromElement(rawSelector) {
    const element = resolveNodeElement(rawSelector);
    return resolveImageSourceFromElement(element);
  }

  function __nodeToBase(value, radix, minLength) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return "0".repeat(minLength || 0) || "0";
    const str = n.toString(radix || 16);
    if (minLength && str.length < minLength) {
      return str.padStart(minLength, '0');
    }
    return str;
  }

  function __nodeParseRadix(value, radix) {
    const str = toSafeString(value).trim();
    if (!str) return 0;
    const parsed = parseInt(str, radix || 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function __nodeCountTrue(...values) {
    return values.reduce((count, value) => {
      return count + (toFormulaBoolean(value) ? 1 : 0);
    }, 0);
  }

  function __nodeGradient(...args) {
    let deg = 90;
    let colors = args.slice();

    if (colors.length > 0) {
      const maybeAngle = Number(colors[0]);
      if (Number.isFinite(maybeAngle)) {
        deg = maybeAngle;
        colors = colors.slice(1);
      } else {
        const maybeAngleLast = Number(colors[colors.length - 1]);
        if (Number.isFinite(maybeAngleLast)) {
          deg = maybeAngleLast;
          colors = colors.slice(0, -1);
        }
      }
    }

    const normalizedColors = colors
      .map((c) => toSafeString(c).trim())
      .filter(Boolean);

    if (normalizedColors.length === 0) {
      normalizedColors.push("#ef4444", "#facc15", "#22c55e");
    } else if (normalizedColors.length === 1) {
      normalizedColors.push(normalizedColors[0]);
    }

    return `linear-gradient(${deg}deg, ${normalizedColors.join(", ")})`;
  }

  function __nodeUnzip(zipValue, indexValue) {
    const index = Number.isFinite(Number(indexValue)) ? Math.max(0, Math.floor(Number(indexValue))) : 0;

    if (zipValue && typeof zipValue === "object") {
      const keyCandidates = [`o${index}`, `out-${index}`, `output-${index}`, `field-${index + 1}`, `output-${index + 1}`, `field-${index}`, `item-${index + 1}`];
      for (const key of keyCandidates) {
        if (Object.prototype.hasOwnProperty.call(zipValue, key)) {
          return zipValue[key];
        }
      }
      if (Array.isArray(zipValue) && index < zipValue.length) {
        return zipValue[index];
      }
      const direct = zipValue[index];
      if (direct !== undefined) {
        return direct;
      }
      return "";
    }

    // If zipValue is a primitive (number, string, boolean), return it directly for index 0
    if (index === 0 && zipValue !== undefined && zipValue !== null && zipValue !== "") {
      return zipValue;
    }

    return "";
  }

  function __nodeCaseEquals(left, right) {
    if (left === right) return true;

    // Unwrap a `{ value: X }` presentation wrapper (a zip/structured scalar)
    // so it still compares as its inner value.
    const scalarize = (value) => {
      let current = value;
      let guard = 0;
      while (
        current !== null && typeof current === "object" && !Array.isArray(current)
        && current.nodeType === undefined
        && Object.prototype.hasOwnProperty.call(current, "value")
        && guard++ < 8
      ) {
        current = current.value;
      }
      return current;
    };
    const leftScalar = scalarize(left);
    const rightScalar = scalarize(right);
    if (leftScalar === rightScalar) return true;

    // Anything still an object (a live DOM node, an array, a plain object) only
    // matches by reference identity — never by string coercion. Every DOM
    // element JSON-stringifies to "{}" and an <a> stringifies to "", so string
    // comparison would report unrelated elements as equal (breaking
    // array-contains / array-find over Array<element>).
    if (
      (leftScalar !== null && typeof leftScalar === "object")
      || (rightScalar !== null && typeof rightScalar === "object")
    ) {
      return false;
    }

    const leftText = toSafeString(leftScalar).trim();
    const rightText = toSafeString(rightScalar).trim();

    const leftNum = Number(leftText);
    const rightNum = Number(rightText);
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum)) {
      return leftNum === rightNum;
    }

    const toBool = (value) => {
      const text = toSafeString(value).trim().toLowerCase();
      if (text === "true" || text === "1") return true;
      if (text === "false" || text === "0") return false;
      return null;
    };

    const leftBool = toBool(left);
    const rightBool = toBool(right);
    if (leftBool !== null && rightBool !== null) {
      return leftBool === rightBool;
    }

    return leftText === rightText;
  }

  // Event functions
  window.eventStore = window.eventStore || {};

  function __nodeEvent(elementIdOrRef, eventType) {
    const type = toSafeString(eventType).trim() || 'click';
    if (!type) return null;

    // A live element reference (e.g. a For Each item with no id of its own,
    // passed straight from a wired Element input) is used directly -- no ID
    // lookup, and no ID is written to the DOM. Otherwise, handle both ID
    // (with or without #) and selectors, plus the canonical NodeLogic data-*
    // attribute fallbacks and same-origin preview frames.
    const isLiveRef = nlIsElement(elementIdOrRef);
    const id = isLiveRef ? "" : toSafeString(elementIdOrRef).trim();
    if (!isLiveRef && !id) return null;
    const element = isLiveRef ? elementIdOrRef : resolveNodeElement(id);

    if (!element) {
      console.warn(`Element not found: ${id}`);
      return null;
    }

    // The registry key must stay stable across recalculations for the SAME
    // element -- an id string when one exists (unchanged from before), or a
    // generated-but-stable id (nlEnsureElementId) for a live reference with
    // none, so an id-less child gets its own persistent registration instead
    // of colliding with every other id-less element under the same event type.
    const key = `${isLiveRef ? nlEnsureElementId(element) : id}_${type}`;
    
    // Initialize event data if not exists
    if (!window.eventStore[key]) {
      window.eventStore[key] = { 
        element, 
        type, 
        triggeredCount: 0,
        eventKey: key
      };
    }
    
    // Set up event listener only once
    if (!window.eventStore[key + '_listener']) {
      element.addEventListener(type, () => {
        // Increment trigger count for THIS specific event
        window.eventStore[key].triggeredCount++;
        window.eventStore[key].lastTriggeredAt = Date.now();
        // Trigger recalculation
        scheduleRecalculation();
      });
      window.eventStore[key + '_listener'] = true;
    }

    // Return event data
    return window.eventStore[key];
  }

  function __nodeHoverEvent(elementId, mode) {
    if (mode === "both") {
      const enter = __nodeEvent(elementId, "mouseenter");
      const leave = __nodeEvent(elementId, "mouseleave");
      if (!enter || !leave) return null;
      return { eventKey: `${enter.eventKey}_both`, triggeredCount: enter.triggeredCount + leave.triggeredCount };
    }
    return __nodeEvent(elementId, mode === "leave" ? "mouseleave" : "mouseenter");
  }

  function __nodePageLoadEvent() {
    const key = "__page_load__";
    if (!window.eventStore[key]) {
      window.eventStore[key] = { eventKey: key, triggeredCount: 1, lastTriggeredAt: Date.now() };
    }
    return window.eventStore[key];
  }

  function __nodeTimerEvent(interval, mode) {
    const safeInterval = Math.max(50, Number(interval) || 1000);
    const key = `__timer_${safeInterval}_${toSafeString(mode).trim() || "interval"}`;
    if (!window.eventStore[key]) {
      window.eventStore[key] = { eventKey: key, triggeredCount: 0 };
      const trigger = () => {
        window.eventStore[key].triggeredCount++;
        window.eventStore[key].lastTriggeredAt = Date.now();
        scheduleRecalculation();
      };
      if (toSafeString(mode).trim() === "timeout") window.setTimeout(trigger, safeInterval);
      else window.setInterval(trigger, safeInterval);
    }
    return window.eventStore[key];
  }

  function __nodeCustomEvent(name) {
    const eventName = toSafeString(name).trim();
    if (!eventName) return null;
    const key = `__custom_${eventName}`;
    if (!window.eventStore[key]) {
      window.eventStore[key] = { eventKey: key, triggeredCount: 0 };
      window.addEventListener(eventName, () => {
        window.eventStore[key].triggeredCount++;
        window.eventStore[key].lastTriggeredAt = Date.now();
        scheduleRecalculation();
      });
    }
    return window.eventStore[key];
  }

  function nlEventTriggeredCount(eventValue) {
    return (eventValue && typeof eventValue === "object" && typeof eventValue.triggeredCount === "number")
      ? eventValue.triggeredCount
      : 0;
  }

  // Event OR: fires (its own triggeredCount increments) whenever EITHER
  // input event's triggeredCount has increased since this node last saw it.
  // State is per-node (keyed by the graph node's own id) so two Event OR
  // nodes never share bookkeeping.
  window.eventCombinerState = window.eventCombinerState || {};
  function __nodeEventOr(nodeId, eventA, eventB) {
    const key = `nlEventOr:${toSafeString(nodeId)}`;
    let state = window.eventCombinerState[key];
    if (!state) state = window.eventCombinerState[key] = { lastA: 0, lastB: 0, count: 0 };

    const curA = nlEventTriggeredCount(eventA);
    const curB = nlEventTriggeredCount(eventB);
    let fired = false;
    if (curA > state.lastA) { fired = true; state.lastA = curA; }
    if (curB > state.lastB) { fired = true; state.lastB = curB; }
    if (fired) state.count++;

    return { eventKey: key, triggeredCount: state.count };
  }

  // Fallback Event: shows Main for `holdMs` from the moment it APPEARS, then
  // the Fallback. "Appears" = Main goes from absent (undefined / null / NaN)
  // to present, or a present Main changes value -- so a gated Event
  // Processor payload (present only on the pass its event fired) restarts
  // the window on every firing, while a plain constant appears exactly once
  // (on load), is held for the window, and after that stays expired for
  // good. Unlike the plain Fallback node, the value no longer flickers back
  // to the fallback on the very next recalculation after an event.
  window.nodelogicFallbackEventState = window.nodelogicFallbackEventState || {};

  function nlFallbackPresent(value) {
    return !(value === undefined || value === null || (typeof value === "number" && Number.isNaN(value)));
  }

  function nlFallbackSignature(value) {
    try {
      return typeof value === "object" ? `o:${JSON.stringify(value)}` : `${typeof value}:${String(value)}`;
    } catch {
      return `x:${String(value)}`;
    }
  }

  function __nodeFallbackEvent(nodeId, main, fallback, holdMs, blockScope) {
    const key = `${toSafeString(blockScope) || "noscope"}::${toSafeString(nodeId)}`;
    const store = window.nodelogicFallbackEventState;
    let state = store[key];
    if (!state) state = store[key] = { present: false, signature: "", held: undefined, until: 0, timer: null };

    const now = Date.now();
    const hold = Math.max(0, Number(holdMs) || 0);
    const present = nlFallbackPresent(main);
    if (present) {
      const signature = nlFallbackSignature(main);
      if (!state.present || signature !== state.signature) {
        state.held = main;
        state.signature = signature;
        state.until = now + hold;
        if (state.timer) clearTimeout(state.timer);
        state.timer = null;
        if (hold > 0) {
          // Re-evaluate once the window ends so the Fallback shows up even
          // if nothing else triggers a recalculation.
          state.timer = setTimeout(() => {
            state.timer = null;
            scheduleRecalculation();
          }, hold + 20);
        }
      }
    }
    state.present = present;
    return now < state.until ? state.held : fallback;
  }

  // Event AND: fires only when BOTH input events occur within `windowMs` of
  // each other. Whichever fires first becomes "pending"; if the other one
  // fires before the window elapses, the combined event fires and the
  // pending state clears. If the window elapses first (checked on the next
  // evaluation that observes a new firing), that pending firing is dropped --
  // a later firing of either side starts a fresh window instead of ever
  // silently carrying a stale "half fired" state forward.
  function __nodeEventAnd(nodeId, eventA, eventB, windowMs) {
    const key = `nlEventAnd:${toSafeString(nodeId)}`;
    let state = window.eventCombinerState[key];
    if (!state) state = window.eventCombinerState[key] = { lastA: 0, lastB: 0, pendingSide: null, pendingAt: 0, count: 0 };

    const curA = nlEventTriggeredCount(eventA);
    const curB = nlEventTriggeredCount(eventB);
    const aFired = curA > state.lastA;
    const bFired = curB > state.lastB;
    if (aFired) state.lastA = curA;
    if (bFired) state.lastB = curB;

    const now = Date.now();
    const win = Math.max(0, Number(windowMs) || 0);
    if (state.pendingSide && (now - state.pendingAt) > win) {
      state.pendingSide = null;
    }

    let fired = false;
    if (aFired && bFired) {
      // Both fired in the same evaluation pass: always within window.
      fired = true;
      state.pendingSide = null;
    } else if (aFired) {
      if (state.pendingSide === "b") { fired = true; state.pendingSide = null; }
      else { state.pendingSide = "a"; state.pendingAt = now; }
    } else if (bFired) {
      if (state.pendingSide === "a") { fired = true; state.pendingSide = null; }
      else { state.pendingSide = "b"; state.pendingAt = now; }
    }

    if (fired) state.count++;
    return { eventKey: key, triggeredCount: state.count };
  }

  // Track which events have been consumed in current evaluation cycle
  window.eventProcessorConsumed = window.eventProcessorConsumed || {};
  // Track if we're currently in an active event flow
  window.activeEventFlow = false;

  function __nodeEventProcessor(eventData, value, passOnlyOnEvent) {
    // If passOnlyOnEvent is false (default), always pass the value
    if (!passOnlyOnEvent) {
      return value;
    }
    
    // Check if THIS SPECIFIC event was triggered
    if (eventData && typeof eventData === 'object' && eventData.eventKey) {
      const key = eventData.eventKey;
      const currentCount = eventData.triggeredCount || 0;
      const consumedCount = window.eventProcessorConsumed[key] || 0;
      
      // If event was triggered since last consumption, pass the value
      if (currentCount > consumedCount) {
        // Mark this event as consumed for this evaluation
        window.eventProcessorConsumed[key] = currentCount;
        // Mark that we're in active event flow
        window.activeEventFlow = true;
        return value;
      }
    }
    
    // Event not triggered or already consumed
    // Mark that we're NOT in active event flow
    window.activeEventFlow = false;
    return undefined;
  }

  window.nodelogicActionBindings = window.nodelogicActionBindings || {};

  function resolveActionTargetElement(target) {
    if (!target) return null;

    if (target.classList.contains("slider-container") || (target.tagName === "DIV" && !target.matches("input, select, textarea, span"))) {
      const inner = target.querySelector("input, select, textarea");
      if (inner) {
        return inner;
      }
      // No form control inside: this is a content container (an Elementor
      // widget's outer `.elementor-element` div, a Gutenberg group block,
      // ...). Descend to the actual text-bearing element so style/text
      // actions land where the page visually reads them from, not on a
      // structural ancestor.
      const content = nlDescendSingleChildContent(target);
      if (content && content !== target) {
        return content;
      }
    }

    return target;
  }

  function findActionSourceElement(sourceId) {
    const id = toSafeString(sourceId).trim();
    if (!id) return null;

    // Canonical resolver (adds data-nodelogic-chart-id + selector support +
    // same-origin preview frames; main-document matches still win first).
    return resolveNodeElement(id);
  }

  function removeActionBinding(targetId) {
    // NOT .trim()'d: entry keys for Element-pin-driven outputs are
    // deliberately space-prefixed (" nlOutEl:<id>" / " nlOutTarget:<id>") so
    // they can never collide with a real target-id string used as a plain
    // dropdown key. window.nodelogicActionBindings is always written with
    // that exact (untrimmed) key -- trimming it here made the lookup miss
    // every such binding, so its listeners/removers were NEVER torn down:
    // a real event-listener leak, not merely a lookup no-op.
    const key = toSafeString(targetId);
    if (!key || !window.nodelogicActionBindings[key]) return;

    const entry = window.nodelogicActionBindings[key];
    if (entry && Array.isArray(entry.removers)) {
      entry.removers.forEach((remove) => {
        try {
          remove();
        } catch {}
      });
    }
    delete window.nodelogicActionBindings[key];
  }

  // Stable identity for ONE Action->Event node (bind nested actions to a DOM
  // event on a source element), independent of any sibling action in the same
  // plan. Used only to decide whether a listener for THIS node already exists
  // -- never to gate re-applying leaf actions (see applyLeafActionNodes).
  // An Action->Event node's source element: a wired Element input pin
  // (actionNode.__element, a live DOM node produced by the SAME resolution
  // mechanism as every other Element-pin node) wins when present; otherwise
  // the existing ID-control fallback (sourceId, resolved through
  // findActionSourceElement). One resolution model, not two.
  function resolveActionEventSourceElement(actionNode) {
    if (actionNode && actionNode.__element && typeof actionNode.__element === "object" && actionNode.__element.nodeType === 1) {
      return actionNode.__element;
    }
    return findActionSourceElement(actionNode.sourceId || actionNode.targetId || actionNode.actionTargetId || "");
  }

  function getEventActionSignature(actionNode) {
    try {
      // A wired Element input pin (actionNode.__element, a live DOM node) has
      // no stable JSON.stringify representation and no sourceId of its own --
      // __nodeId (the compiled action-event node's own graph id) is what
      // disambiguates it from any other wired action-event node instead.
      const key = (actionNode && actionNode.__nodeId)
        || (actionNode && (actionNode.sourceId || actionNode.targetId || actionNode.actionTargetId))
        || "";
      return JSON.stringify({
        key,
        eventType: (actionNode && actionNode.eventType) || "",
        actions: (actionNode && actionNode.actions) || [],
      });
    } catch {
      return "";
    }
  }

  function applyActionNode(target, inputEl, actionNode) {
    if (!actionNode) return;

    const actionType = toSafeString(actionNode.type || actionNode.kind || "").trim();
    if (!actionType || actionType === "event" || actionType === "block") return;

    const actionTarget = target;
    const actionRoot = actionTarget || target;
    const inputTarget = resolveActionTargetElement(actionRoot || inputEl);
    const applyBoth = (fn) => {
      try {
        fn(actionRoot);
      } catch {}
      if (inputTarget && inputTarget !== actionRoot) {
        try {
          fn(inputTarget);
        } catch {}
      }
    };

    if (actionType === "required") {
      const enabled = actionNode.value !== false;
      applyBoth((node) => {
        node.required = enabled;
        if (enabled) {
          node.setAttribute("required", "");
        } else {
          node.removeAttribute("required");
        }
      });
      return;
    }

    if (actionType === "min") {
      const rawValue = toSafeString(actionNode.value ?? "").trim();
      applyBoth((node) => {
        node.min = rawValue;
        if (rawValue) {
          node.setAttribute("min", rawValue);
        } else {
          node.removeAttribute("min");
        }
      });
      const container = inputTarget?.closest?.(".slider-container");
      if (container) {
        updateSliderUI(container);
      }
      return;
    }

    if (actionType === "max") {
      const rawValue = toSafeString(actionNode.value ?? "").trim();
      applyBoth((node) => {
        node.max = rawValue;
        if (rawValue) {
          node.setAttribute("max", rawValue);
        } else {
          node.removeAttribute("max");
        }
      });
      const container = inputTarget?.closest?.(".slider-container");
      if (container) {
        updateSliderUI(container);
      }
      return;
    }

    if (actionType === "length") {
      const minValue = toSafeString(actionNode.min ?? "").trim();
      const maxValue = toSafeString(actionNode.max ?? "").trim();
      applyBoth((node) => {
        if (minValue) {
          node.minLength = Number(minValue);
          node.setAttribute("minlength", minValue);
        } else {
          node.removeAttribute("minlength");
        }
        if (maxValue) {
          node.maxLength = Number(maxValue);
          node.setAttribute("maxlength", maxValue);
        } else {
          node.removeAttribute("maxlength");
        }
      });
      return;
    }

    if (actionType === "regex") {
      const pattern = toSafeString(actionNode.pattern ?? "").trim();
      applyBoth((node) => {
        if (pattern) {
          node.pattern = pattern;
          node.setAttribute("pattern", pattern);
        } else {
          node.removeAttribute("pattern");
        }
      });
      return;
    }

    if (actionType === "addClass" || actionType === "removeClass" || actionType === "toggleClass") {
      const className = toSafeString(actionNode.className ?? "").trim();
      if (!className) return;

      const applyClass = (node) => {
        if (actionType === "addClass") {
          node.classList.add(className);
        } else if (actionType === "removeClass") {
          node.classList.remove(className);
        } else {
          node.classList.toggle(className);
        }
      };

      applyBoth(applyClass);
      return;
    }

    if (actionType === "setText" || actionType === "setHtml" || actionType === "setValue") {
      const value = actionNode.value === undefined ? "" : actionNode.value;
      applyBoth((node) => {
        // Sanitized with the Raw HTML allowlist: a form / API value must not
        // be able to inject a script or event handler.
        if (actionType === "setHtml") node.innerHTML = nlSanitizeHtmlString(toSafeString(value));
        else if (actionType === "setText") node.textContent = toSafeString(value);
        else {
          // Parity with the legacy Output "Value" pin's application logic
          // (isLabelEl, below): setControlValue only knows how to write a
          // REAL form control's .value/.checked -- on a plain label-type
          // element (a <div>/<span> target, no input/select/textarea) it's
          // a silent no-op DOM-expando write. Match textContent for those,
          // same as the legacy pin already did.
          const nextValue = Array.isArray(value) ? JSON.stringify(value) : toSafeString(value);
          const isFormControl = typeof node.matches === "function" && node.matches("input, select, textarea");
          if (isFormControl) setControlValue(node, nextValue);
          else node.textContent = nextValue;
        }
      });
      return;
    }

    if (actionType === "setAttribute") {
      const name = toSafeString(actionNode.name).trim();
      if (name) applyBoth((node) => node.setAttribute(name, toSafeString(actionNode.value ?? "")));
      return;
    }

    if (actionType === "setStyle") {
      const property = toSafeString(actionNode.property).trim();
      const rawValue = toSafeString(actionNode.value ?? "");
      // A wired value can itself be a full "name: value; name2: value2"
      // declaration list -- e.g. from CSS Join combining a color and a
      // display value into one string -- rather than a single opaque value
      // for the one named `property` above. Assigning that whole string to
      // a single property (the old behavior) is invalid CSS and silently
      // does nothing. Detect real "name: value" segments and apply each via
      // setProperty instead; a value with no such segment (the common case:
      // a bare "#rrggbb", "block", a gradient, ...) still goes through the
      // single-property path unchanged.
      const declarations = rawValue.split(";").map((s) => s.trim()).filter(Boolean)
        .map((s) => {
          const i = s.indexOf(":");
          return i > 0 ? [s.slice(0, i).trim(), s.slice(i + 1).trim()] : null;
        })
        .filter((pair) => pair && pair[0] && pair[1]);
      if (declarations.length > 1 || (declarations.length === 1 && !property)) {
        applyBoth((node) => {
          declarations.forEach(([name, val]) => {
            try { node.style.setProperty(name, val); } catch { /* ignore an invalid property name */ }
          });
        });
        return;
      }
      if (property) applyBoth((node) => { node.style[property] = rawValue; });
      return;
    }

    if (actionType === "visibility") {
      applyBoth((node) => {
        const mode = actionNode.mode || "toggle";
        node.hidden = mode === "toggle" ? !node.hidden : mode === "hide";
        if (mode === "show") node.hidden = false;
      });
      return;
    }

    if (actionType === "enable" || actionType === "disable") {
      applyBoth((node) => {
        node.disabled = actionType === "disable";
        node.toggleAttribute("disabled", actionType === "disable");
      });
      return;
    }

    if (actionType === "focus") {
      inputTarget?.focus?.();
      return;
    }

    if (actionType === "scrollTo") {
      (actionTarget || target)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      return;
    }

    if (actionType === "notify") {
      const message = toSafeString(actionNode.message).trim();
      if (!message) return;
      const notice = document.createElement("div");
      notice.textContent = message;
      notice.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:99999;padding:10px 14px;background:#111827;color:#fff;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.25);";
      document.body.appendChild(notice);
      window.setTimeout(() => notice.remove(), Math.max(500, Number(actionNode.duration) || 3000));
      return;
    }

    if (actionType === "redirect") {
      const url = toSafeString(actionNode.url).trim();
      if (url) window.open(url, actionNode.target === "_blank" ? "_blank" : "_self");
      return;
    }

    if (actionType === "triggerEvent") {
      const eventName = toSafeString(actionNode.name).trim();
      if (eventName) (actionTarget || target)?.dispatchEvent?.(new CustomEvent(eventName, { bubbles: true }));
    }
  }

  // Action plans are applied in independent passes with different idempotency
  // rules (see the "event node stops after first execution" bug):
  //
  //  - registerActionListeners: an Action->Event child binds a REAL DOM
  //    listener. That must happen exactly once per distinct node (dedup'd by
  //    its own signature, independent of any sibling action). Never applies a
  //    leaf action, never removes anything -- see collectActionEventKeys /
  //    pruneStaleActionListeners for cleanup. Safe to call again from inside
  //    an already-firing listener's own callback, to lazily register any
  //    nested Action->Event grandchildren the first time their parent fires.
  //  - collectActionEventKeys + pruneStaleActionListeners: run ONCE per
  //    applyLogicBlocks pass, from the top of the CURRENT plan, to tear down
  //    a previously-registered listener whose node no longer appears anywhere
  //    in it (branch flip, deleted node, ...). Deliberately separate from
  //    registerActionListeners's reentrant, partial-subtree walk -- pruning
  //    from a partial walk would treat everything outside that subtree
  //    (including the very listener currently executing) as stale and tear
  //    it down after its first firing, which is its own version of this bug.
  //  - applyLeafActionNodes: every other action (setText, addClass, notify,
  //    ...) is a one-shot effect that must run EVERY time the caller has a
  //    non-empty action plan for this target -- including when the newly
  //    computed plan is byte-identical to the one applied last time, which is
  //    the overwhelmingly common case for a repeating event with a constant
  //    result (a click that always sets the same text, always toggles the
  //    same class, ...). Gating this pass on "did the plan change" silently
  //    drops every occurrence after the first whose result matches a prior
  //    one, which is the primary bug being fixed here.
  //
  // All three recurse the same way through array nesting and actionIf
  // branches (following only the currently-active branch); an Action->Event
  // node's OWN nested actions are only ever run later, from inside that
  // node's listener callback -- never as part of the pass that reached it.
  function registerActionListeners(target, inputEl, actionNodes, targetId, bindingState) {
    if (!Array.isArray(actionNodes)) return;

    actionNodes.forEach((actionNode) => {
      if (!actionNode) return;
      if (Array.isArray(actionNode)) {
        registerActionListeners(target, inputEl, actionNode, targetId, bindingState);
        return;
      }

      const actionType = toSafeString(actionNode.type || actionNode.kind || "").trim();

      if (actionType === "event") {
        const sourceEl = resolveActionEventSourceElement(actionNode);
        const eventType = toSafeString(actionNode.eventType || "change").trim() || "change";
        const nestedActions = Array.isArray(actionNode.actions) ? actionNode.actions : [];
        if (!sourceEl || nestedActions.length === 0) return;

        const nodeKey = getEventActionSignature(actionNode);
        if (bindingState.listeners.has(nodeKey)) return; // already bound

        const listener = () => {
          try {
            registerActionListeners(target, inputEl, nestedActions, targetId, bindingState);
            applyLeafActionNodes(target, inputEl, nestedActions);
            // Mirror __nodeEvent's listener (the older Event-node primitive,
            // see line ~1737): without this, a "connected logic flow" Set
            // Value that reads live DOM state (e.g. __nodeGetElementProp of
            // the same target this Action Event writes to) is computed and
            // baked into THIS closure exactly once -- whenever the block was
            // last freshly evaluated -- and never refreshed again, because a
            // plain trigger element (not a form control, button-group, or
            // [id]-referenced in the formula) is never otherwise wired to
            // scheduleRecalculation. Every later click of this branch, or any
            // sibling branch on the same Output, then silently reapplies that
            // frozen value -- indistinguishable from one branch clobbering
            // another. Scheduling a recalculation here re-registers this
            // listener with a freshly computed value before its NEXT click;
            // it does not re-apply this click's own leaf actions again
            // (applyLeafActionNodes above already ran, and the recalculation
            // pass explicitly skips "event"-typed nodes).
            scheduleRecalculation();
          } catch (error) {
            console.warn("[NodeLogic Runtime] action event execution failed", error);
          }
        };
        sourceEl.addEventListener(eventType, listener);
        const remove = () => {
          try {
            sourceEl.removeEventListener(eventType, listener);
          } catch {}
        };
        bindingState.removers.push(remove);
        bindingState.listeners.set(nodeKey, remove);
        return;
      }

      if (actionType === "actionIf") {
        const branch = actionNode.condition ? actionNode.trueActions : actionNode.falseActions;
        registerActionListeners(target, inputEl, Array.isArray(branch) ? branch : [], targetId, bindingState);
        return;
      }

      if (actionType === "eventGate") {
        // The gate's own firing is driven by an Event VALUE re-evaluated
        // every recalculation pass (applyLeafActionNodes below), not a DOM
        // listener -- but a nested Action->Event still needs its listener
        // registered regardless of whether the gate has fired yet, same as
        // actionIf recurses into its picked branch unconditionally.
        const nestedActions = Array.isArray(actionNode.actions) ? actionNode.actions : [];
        registerActionListeners(target, inputEl, nestedActions, targetId, bindingState);
      }
    });
  }

  // Every Action->Event node signature reachable from the CURRENT plan --
  // unlike registerActionListeners this recurses INTO an event node's own
  // nested actions too, so a listener several events deep is still
  // recognised as desired even before its ancestor(s) have fired and lazily
  // registered it.
  function collectActionEventKeys(actionNodes, into) {
    if (!Array.isArray(actionNodes)) return into;

    actionNodes.forEach((actionNode) => {
      if (!actionNode) return;
      if (Array.isArray(actionNode)) {
        collectActionEventKeys(actionNode, into);
        return;
      }

      const actionType = toSafeString(actionNode.type || actionNode.kind || "").trim();

      if (actionType === "event") {
        const nestedActions = Array.isArray(actionNode.actions) ? actionNode.actions : [];
        const hasSource = !!(actionNode.__nodeId || actionNode.sourceId || actionNode.targetId || actionNode.actionTargetId);
        if (hasSource && nestedActions.length > 0) {
          into.add(getEventActionSignature(actionNode));
        }
        collectActionEventKeys(nestedActions, into);
        return;
      }

      if (actionType === "actionIf") {
        const branch = actionNode.condition ? actionNode.trueActions : actionNode.falseActions;
        collectActionEventKeys(Array.isArray(branch) ? branch : [], into);
        return;
      }

      if (actionType === "eventGate") {
        const nestedActions = Array.isArray(actionNode.actions) ? actionNode.actions : [];
        collectActionEventKeys(nestedActions, into);
      }
    });

    return into;
  }

  function pruneStaleActionListeners(bindingState, desiredKeys) {
    bindingState.listeners.forEach((remove, key) => {
      if (desiredKeys.has(key)) return;
      try {
        remove();
      } catch {}
      bindingState.listeners.delete(key);
      const idx = bindingState.removers.indexOf(remove);
      if (idx !== -1) bindingState.removers.splice(idx, 1);
    });
  }

  function applyLeafActionNodes(target, inputEl, actionNodes) {
    if (!Array.isArray(actionNodes)) return;

    actionNodes.forEach((actionNode) => {
      try {
        if (!actionNode) return;

        if (Array.isArray(actionNode)) {
          applyLeafActionNodes(target, inputEl, actionNode);
          return;
        }

        const actionType = toSafeString(actionNode.type || actionNode.kind || "").trim();
        if (!actionType || actionType === "event") return; // handled by registerActionListeners

        if (actionType === "actionIf") {
          const branch = actionNode.condition ? actionNode.trueActions : actionNode.falseActions;
          applyLeafActionNodes(target, inputEl, Array.isArray(branch) ? branch : []);
          return;
        }

        if (actionType === "eventGate") {
          // Re-evaluated every pass (like actionIf's condition), but gated
          // on a genuinely NEW firing of the trigger event -- nlConsumeEventOnce
          // is the same "increments only once per new triggeredCount"
          // primitive Send Email's own Trigger pin already relies on, so an
          // event that already fired earlier never re-applies these leaf
          // actions on a later, unrelated recalculation.
          const nestedActions = Array.isArray(actionNode.actions) ? actionNode.actions : [];
          const consumedKey = `eventGate::${toSafeString(actionNode.__nodeId)}`;
          if (nlConsumeEventOnce(actionNode.trigger, consumedKey)) {
            applyLeafActionNodes(target, inputEl, nestedActions);
          }
          return;
        }

        applyActionNode(target, inputEl, actionNode);
      } catch (error) {
        console.warn("[NodeLogic Runtime] action execution failed", error);
      }
    });
  }

  function __nodeFallback(primary, fallback) {
    // Check if primary is undefined, null, or NaN
    if (primary === undefined || primary === null || (typeof primary === 'number' && isNaN(primary))) {
      return fallback;
    }
    return primary;
  }

  function __nodeGetPath(value, rawPath, fallback) {
    const path = toSafeString(rawPath).trim();
    if (!path) {
      return fallback;
    }

    const normalized = path
      .replace(/\[(\d+)\]/g, '.$1')
      .split('.')
      .map((part) => part.trim())
      .filter(Boolean);

    let current = value;
    for (const segment of normalized) {
      if (current === undefined || current === null) {
        return fallback;
      }

      if (Array.isArray(current) && /^\d+$/.test(segment)) {
        current = current[Number(segment)];
        continue;
      }

      current = current[segment];
    }

    return current === undefined || current === null ? fallback : current;
  }

  // JSON Body node: parses user-typed/pasted JSON text into the graph's
  // ordinary structured value (a real object/array/string/number/boolean/
  // null -- native JSON.parse output, not a wrapped/tagged type). Invalid or
  // empty JSON safely returns null rather than throwing -- __nodeApiRequest's
  // own body serialization (__nodeApiSerializeBody) already turns a null/
  // undefined body into "{}" via its existing `data ?? {}` fallback, so a
  // bad JSON Body node degrades to an empty request body instead of ever
  // reaching an uncaught exception.
  function __nodeJsonParse(text) {
    if (typeof text !== "string" || text.trim() === "") return null;
    try {
      const parsed = JSON.parse(text);
      return parsed === undefined ? null : parsed;
    } catch (e) {
      return null;
    }
  }

  // Memory functions
  window.memoryStore = window.memoryStore || {};
  window.memoryPersistFlags = window.memoryPersistFlags || {}; // Track which variables should persist

  // Two duplicated Elementor widget instances (native "Duplicate", a saved
  // template inserted twice, a synced/global widget, ...) can share the same
  // user-chosen memory variable name -- e.g. both built from the same
  // template using "counter". window.memoryStore is one GLOBAL, page-wide
  // object, so without scoping those two widgets would silently read and
  // overwrite each other's value. __nodeMemoryResolveKey folds in the
  // runtime blockScope (the same per-logic-block disambiguator already used
  // for window.nodelogicActionBindings -- see applyLogicBlocks) UNLESS the
  // node explicitly opts into the 'page' scope for intentional cross-widget
  // sharing (e.g. a cart counter read by several widgets on one page).
  function __nodeMemoryResolveKey(varName, scope, blockScope) {
    const key = toSafeString(varName).trim();
    if (!key) return "";
    if (scope === "page" || scope === "global") return key;
    return `${blockScope || "noid"}::${key}`;
  }

  function __nodeMemoryGet(varName, defaultValue, persist, scope, blockScope) {
    const rawKey = toSafeString(varName).trim();
    if (!rawKey) return defaultValue;
    const key = __nodeMemoryResolveKey(rawKey, scope, blockScope);

    // Initialize memoryDefaults if not exists
    window.memoryDefaults = window.memoryDefaults || {};

    // Store the default value for potential reset operations
    window.memoryDefaults[key] = defaultValue;

    // Track that this variable should persist
    if (persist) {
      window.memoryPersistFlags[key] = true;
    }

    // If persist is true, try to load from localStorage first
    if (persist) {
      try {
        const stored = localStorage.getItem(`nodelogic_memory_${key}`);
        if (stored !== null) {
          // Parse stored value
          const parsed = JSON.parse(stored);
          window.memoryStore[key] = parsed;
          return parsed;
        }
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    // Return from memory store or default
    return window.memoryStore[key] !== undefined ? window.memoryStore[key] : defaultValue;
  }

  function __nodeMemorySet(varName, value, reset, scope, blockScope) {
    const rawKey = toSafeString(varName).trim();
    if (!rawKey) return value;
    const key = __nodeMemoryResolveKey(rawKey, scope, blockScope);

    // Handle reset logic - check for various reset conditions
    let shouldReset = false;

    // Only reset if reset input is explicitly activated
    if (reset === true || reset === 'true') {
      shouldReset = true;
    } else if (typeof reset === 'object' && reset !== null && reset.eventKey) {
      // It's an event object - check if it was actually triggered
      const eventKey = reset.eventKey;
      const currentCount = reset.triggeredCount || 0;
      const consumedCount = window.eventProcessorConsumed[eventKey] || 0;

      // Only reset if event was triggered since last consumption
      if (currentCount > consumedCount) {
        shouldReset = true;
        // Mark this event as consumed for reset
        window.eventProcessorConsumed[eventKey] = currentCount;
      }
    } else if (typeof reset === 'string' && reset.toLowerCase() === 'event') {
      shouldReset = true;
    }

    if (shouldReset) {
      // For reset, we need to find the default value from Memory Read nodes
      const defaultValue = window.memoryDefaults && window.memoryDefaults[key] !== undefined
        ? window.memoryDefaults[key]
        : (typeof value === 'number' ? 0 : typeof value === 'boolean' ? false : '');

      // Reset both runtime memory and persistent storage
      window.memoryStore[key] = defaultValue;

      // Always clear localStorage for this variable (regardless of persist flag)
      try {
        localStorage.removeItem(`nodelogic_memory_${key}`);
      } catch (e) {
        // Ignore localStorage errors
      }

      // If variable should persist, set it to default value in localStorage
      if (window.memoryPersistFlags[key]) {
        try {
          localStorage.setItem(`nodelogic_memory_${key}`, JSON.stringify(defaultValue));
        } catch (e) {
          // Ignore localStorage errors
        }
      }

      return defaultValue;
    }

    // Normal memory write logic
    // Only write to memory if we're in active event flow OR if reset parameter is undefined/false (backward compatibility)
    if (window.activeEventFlow || reset === false || reset === undefined) {
      window.memoryStore[key] = value;

      // Check if this variable should persist
      if (window.memoryPersistFlags[key]) {
        try {
          localStorage.setItem(`nodelogic_memory_${key}`, JSON.stringify(value));
        } catch (e) {
          // Ignore localStorage errors
        }
      }
    }

    return value;
  }

  function __nodeMemoryHas(varName, scope, blockScope) {
    const rawKey = toSafeString(varName).trim();
    if (!rawKey) return false;
    const key = __nodeMemoryResolveKey(rawKey, scope, blockScope);
    if (window.memoryStore[key] !== undefined) return true;
    if (window.memoryPersistFlags[key]) {
      try {
        return localStorage.getItem(`nodelogic_memory_${key}`) !== null;
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  // Increment / array-append / array-remove / delete all MUTATE the store, so
  // (unlike a plain read or a "Set Value" write, which are meant to reapply
  // their current input on every recalculation pass) they must not fire on
  // every pass -- a graph recalculates on any relevant page change, not just
  // on the user's intended trigger, and "add 1 every recalculation" is not
  // an increment. Gated the same way __nodeMemorySet's reset already is: an
  // Event/Action-Event value wired into the node only fires the mutation on
  // a genuinely NEW occurrence (eventKey + triggeredCount vs. a per-operation
  // consumed count, namespaced so increment/append/remove/delete never share
  // -- and never collide with -- reset's own consumption tracking). Leaving
  // the trigger pin unwired keeps the simpler "apply every evaluation"
  // behavior, matching plain memory-write nodes.
  function __nodeMemoryConsumeTrigger(trigger, namespaceKey) {
    if (trigger === undefined || trigger === null || trigger === false) return trigger !== false;
    if (trigger === true) return true;
    if (typeof trigger === 'object' && trigger.eventKey) {
      const consumedKey = `${namespaceKey}::${trigger.eventKey}`;
      const currentCount = trigger.triggeredCount || 0;
      const consumedCount = window.eventProcessorConsumed[consumedKey] || 0;
      if (currentCount > consumedCount) {
        window.eventProcessorConsumed[consumedKey] = currentCount;
        return true;
      }
      return false;
    }
    return true;
  }

  function __nodeMemoryDelete(varName, trigger, scope, blockScope) {
    const rawKey = toSafeString(varName).trim();
    if (!rawKey) return true;
    if (!__nodeMemoryConsumeTrigger(trigger, `memDelete::${rawKey}`)) return __nodeMemoryHas(varName, scope, blockScope);
    const key = __nodeMemoryResolveKey(rawKey, scope, blockScope);
    delete window.memoryStore[key];
    if (window.memoryDefaults) delete window.memoryDefaults[key];
    delete window.memoryPersistFlags[key];
    try {
      localStorage.removeItem(`nodelogic_memory_${key}`);
    } catch (e) {
      // Ignore localStorage errors
    }
    return true;
  }

  function __nodeMemoryIncrement(varName, step, trigger, persist, scope, blockScope) {
    const current = Number(__nodeMemoryGet(varName, 0, persist, scope, blockScope));
    if (!__nodeMemoryConsumeTrigger(trigger, `memInc::${toSafeString(varName).trim()}`)) {
      return Number.isFinite(current) ? current : 0;
    }
    const stepAmount = Number.isFinite(Number(step)) ? Number(step) : 1;
    const next = (Number.isFinite(current) ? current : 0) + stepAmount;
    return __nodeMemorySet(varName, next, undefined, scope, blockScope);
  }

  function __nodeMemoryArrayAppend(varName, item, trigger, persist, scope, blockScope) {
    const current = __nodeMemoryGet(varName, [], persist, scope, blockScope);
    const currentArray = Array.isArray(current) ? current : [];
    if (!__nodeMemoryConsumeTrigger(trigger, `memAppend::${toSafeString(varName).trim()}`)) return currentArray;
    const nextArray = currentArray.slice();
    nextArray.push(item);
    return __nodeMemorySet(varName, nextArray, undefined, scope, blockScope);
  }

  function __nodeMemoryArrayRemove(varName, item, trigger, persist, scope, blockScope) {
    const current = __nodeMemoryGet(varName, [], persist, scope, blockScope);
    const currentArray = Array.isArray(current) ? current : [];
    if (!__nodeMemoryConsumeTrigger(trigger, `memRemove::${toSafeString(varName).trim()}`)) return currentArray;
    const nextArray = currentArray.filter((entry) => !__nodeCaseEquals(entry, item));
    return __nodeMemorySet(varName, nextArray, undefined, scope, blockScope);
  }

  function readControlValue(input) {
    if (!input) return 0;

    if (input.type === "checkbox") {
      const checked = input.checked;
      const onValue = input.dataset.checkedValue;
      const offValue = input.dataset.uncheckedValue;
      if (checked) {
        return onValue !== undefined ? parseScalarValue(onValue) : 1;
      }
      return offValue !== undefined ? parseScalarValue(offValue) : 0;
    }

    if (input.type === "radio") {
      const group = document.querySelector(`input[name="${input.name}"]:checked`);
      if (group) {
        const raw = group.dataset.value || group.value;
        return parseScalarValue(raw);
      }
      return 0;
    }

    if (input.tagName === "SELECT") {
      const raw = input.options[input.selectedIndex]?.dataset?.value || input.value;
      return parseScalarValue(raw);
    }

    if (input.type === "number" || input.type === "range") {
      return toNumber(input.value, 0);
    }

    return normalizeDynamicLiteral(input.value);
  }

  function setControlValue(input, value) {
    if (!input) return false;

    if (input.type === "checkbox") {
      const checkedValue = input.dataset.checkedValue;
      const text = toSafeString(value).trim().toLowerCase();
      let nextChecked = false;

      if (typeof value === "boolean") {
        nextChecked = value;
      } else if (checkedValue !== undefined && checkedValue !== "") {
        nextChecked = String(value) === String(checkedValue);
      } else {
        nextChecked = text === "true" || text === "1" || text === "yes" || text === "on";
      }

      if (input.checked === nextChecked) return false;
      input.checked = nextChecked;
      return true;
    }

    if (input.type === "radio") {
      const groupName = input.name;
      if (!groupName) return false;
      const next = String(value);
      let changed = false;
      const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${groupName}"]`));
      radios.forEach((radio) => {
        const shouldCheck = String(radio.value) === next;
        if (radio.checked !== shouldCheck) {
          radio.checked = shouldCheck;
          changed = true;
        }
      });
      return changed;
    }

    const next = String(value ?? "");
    if (input.value === next) return false;

    input.value = next;

    const container = input.closest(".slider-container");
    if (container) {
      updateSliderUI(container);
    }

    return true;
  }

  function setFormulaLock(input, locked) {
    input.dataset.formulaLocked = locked ? "1" : "0";

    if (input.type !== "checkbox" && input.type !== "radio" && input.tagName !== "SELECT") {
      input.readOnly = locked;
    }
  }

  function toFormulaBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const text = toSafeString(value).trim().toLowerCase();
    if (!text.length) return false;
    if (text === "true" || text === "1" || text === "yes" || text === "on") return true;
    if (text === "false" || text === "0" || text === "no" || text === "off") return false;
    return Boolean(text);
  }

  function normalizeFormulaPayload(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const payload = raw;
      const hasPayloadKeys =
        Object.prototype.hasOwnProperty.call(payload, "value")
        || Object.prototype.hasOwnProperty.call(payload, "background")
        || Object.prototype.hasOwnProperty.call(payload, "color")
        || Object.prototype.hasOwnProperty.call(payload, "disabled")
        || Object.prototype.hasOwnProperty.call(payload, "font-size")
        || Object.prototype.hasOwnProperty.call(payload, "border-radius")
        || Object.prototype.hasOwnProperty.call(payload, "border-color")
        || Object.prototype.hasOwnProperty.call(payload, "margin")
        || Object.prototype.hasOwnProperty.call(payload, "padding")
        || Object.prototype.hasOwnProperty.call(payload, "opacity")
        || Object.prototype.hasOwnProperty.call(payload, "display")
        || Object.prototype.hasOwnProperty.call(payload, "width")
        || Object.prototype.hasOwnProperty.call(payload, "height")
        || Object.prototype.hasOwnProperty.call(payload, "custom-css")
        || Object.prototype.hasOwnProperty.call(payload, "actions");
      if (hasPayloadKeys) {
        return {
          value: Object.prototype.hasOwnProperty.call(payload, "value") ? payload.value : undefined,
          background: Object.prototype.hasOwnProperty.call(payload, "background") ? payload.background : undefined,
          color: Object.prototype.hasOwnProperty.call(payload, "color") ? payload.color : undefined,
          disabled: Object.prototype.hasOwnProperty.call(payload, "disabled") ? payload.disabled : undefined
        };
      }
    }

    return {
      value: raw,
      background: undefined,
      color: undefined,
      disabled: undefined
    };
  }

  function shouldPreserveStructuredPayload(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return false;
    }

    const presentationKeys = new Set([
      "value",
      "background",
      "color",
      "disabled",
      "font-size",
      "border-radius",
      "border-color",
      "margin",
      "padding",
      "opacity",
      "display",
      "width",
      "height",
      "custom-css",
      "actions",
    ]);

    return Object.keys(raw).some((key) => !presentationKeys.has(key));
  }

  function applyFormulaPresentation(input, payload, fallbackDisabled = false) {
    if (!input) return;

    const container = input.closest(".slider-container");
    const hasExplicitDisabled = payload.disabled !== undefined;
    const shouldDisable = hasExplicitDisabled ? toFormulaBoolean(payload.disabled) : fallbackDisabled;

    if (typeof input.disabled === "boolean") {
      input.disabled = shouldDisable;
    }

    const colorText = payload.color !== undefined ? toSafeString(payload.color).trim() : "";
    const backgroundText = payload.background !== undefined ? toSafeString(payload.background).trim() : "";

    if (container) {
      const progress = container.querySelector(".slider-progress");
      const thumb = container.querySelector(".slider-thumb-value");
      const label = input.closest("label");

      if (input.type === "range") {
        container.classList.toggle("formula-progress-only", shouldDisable);
        if (progress) {
          if (backgroundText) {
            progress.style.background = backgroundText;
            progress.dataset.formulaBackground = backgroundText;
          } else {
            progress.style.background = "";
            delete progress.dataset.formulaBackground;
          }
        }
        if (thumb) {
          if (backgroundText && !thumb.dataset.baseBackground) {
            thumb.dataset.baseBackground = thumb.style.background || "";
          }
          if (colorText) {
            thumb.style.color = colorText;
          }
        }
      }

      if (input.type === "number") {
        if (backgroundText) {
          input.style.background = backgroundText;
        } else {
          input.style.background = "";
        }
        if (colorText) {
          input.style.color = colorText;
        } else {
          input.style.color = "";
        }
      }

      if (input.type === "checkbox") {
        if (backgroundText) {
          container.style.background = backgroundText;
        } else {
          container.style.background = "";
        }
        if (colorText) {
          container.style.color = colorText;
        } else {
          container.style.color = "";
        }

        if (label) {
          label.style.background = "";
          if (colorText) {
            label.style.color = colorText;
          } else {
            label.style.color = "";
          }
        }
      }
    } else {
      if (backgroundText && input.type !== "range" && input.type !== "checkbox") {
        input.style.background = backgroundText;
      } else if (input.type !== "range" && input.type !== "checkbox") {
        input.style.background = "";
      }
      if (colorText) {
        input.style.color = colorText;
      } else {
        input.style.color = "";
      }
    }
  }

  function splitTopLevelCsv(text) {
    const parts = [];
    let current = "";
    let depth = 0;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "(") {
        depth += 1;
        current += ch;
        continue;
      }
      if (ch === ")") {
        depth = Math.max(0, depth - 1);
        current += ch;
        continue;
      }
      if (ch === "," && depth === 0) {
        if (current.trim()) {
          parts.push(current.trim());
        }
        current = "";
        continue;
      }
      current += ch;
    }

    if (current.trim()) {
      parts.push(current.trim());
    }

    return parts;
  }

  function isAngleToken(token) {
    const t = String(token || "").trim().toLowerCase();
    return t.startsWith("to ") || /-?\d+(\.\d+)?deg$/.test(t) || /-?\d+(\.\d+)?rad$/.test(t) || /-?\d+(\.\d+)?turn$/.test(t);
  }

  function parseGradientColorStops(backgroundText) {
    const raw = toSafeString(backgroundText).trim();
    const match = raw.match(/^linear-gradient\(([\s\S]+)\)$/i);
    if (!match) return null;

    const tokens = splitTopLevelCsv(match[1] || "");
    if (!tokens.length) return null;

    const colorTokens = isAngleToken(tokens[0]) ? tokens.slice(1) : tokens.slice();
    const colors = colorTokens
      .map((token) => {
        const cleaned = String(token || "").trim();
        if (!cleaned) return "";
        const first = cleaned.match(/^(.+?)(\s+[-+]?\d+(\.\d+)?%?)?$/);
        return first ? first[1].trim() : cleaned;
      })
      .filter(Boolean);

    return colors.length >= 2 ? colors : null;
  }

  function sampleGradientColor(backgroundText, ratio) {
    const colors = parseGradientColorStops(backgroundText);
    if (!colors || !colors.length) return "";

    const safeRatio = clamp(Number.isFinite(ratio) ? ratio : 0, 0, 1);
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 1;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return "";

    const gradient = ctx2d.createLinearGradient(0, 0, canvas.width, 0);
    const maxIndex = Math.max(1, colors.length - 1);
    colors.forEach((color, index) => {
      gradient.addColorStop(index / maxIndex, color);
    });

    ctx2d.fillStyle = gradient;
    ctx2d.fillRect(0, 0, canvas.width, 1);
    const x = Math.round(safeRatio * (canvas.width - 1));
    const pixel = ctx2d.getImageData(x, 0, 1, 1).data;
    return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
  }

  function parseFormulaVariables(formula) {
    if (!isFormulaString(formula)) return [];

    const source = String(formula);
    const mask = buildStringLiteralMask(source);
    const regex = getFormulaVarRegex("g");
    const items = [];

    for (const match of source.matchAll(regex)) {
      if (mask[match.index]) continue;
      items.push({
        id: match[1],
        alias: (match[2] || "").trim(),
        unit: (match[3] || "").trim()
      });
    }

    return items;
  }

  function extractDependencies(formula) {
    const vars = parseFormulaVariables(formula);
    return [...new Set(vars.map(v => v.id))];
  }

  function evaluateIfBlocks(formula, values) {
    if (!isFormulaString(formula)) return formula;

    return formula.replace(
      /\{if\s*\(([\s\S]*?)\)\s*:\s*([\s\S]*?)\?\s*([\s\S]*?)\}/gi,
      (full, condition, trueExpr, falseExpr) =>
        `((${condition.trim()}) ? (${trueExpr.trim()}) : (${falseExpr.trim()}))`
    );
  }

  function evaluateCaseBlocks(formula, values) {
    if (!isFormulaString(formula)) return "";

    const caseRegex = getCaseBlockRegex("gi");

    const splitCaseClauses = (body) => {
      const chunks = [];
      let current = "";
      let parenDepth = 0;
      let quote = null;

      for (let i = 0; i < body.length; i++) {
        const ch = body[i];
        const prev = i > 0 ? body[i - 1] : "";

        if (quote) {
          current += ch;
          if (ch === quote && prev !== "\\") {
            quote = null;
          }
          continue;
        }

        if (ch === "'" || ch === "\"") {
          quote = ch;
          current += ch;
          continue;
        }

        if (ch === "(") {
          parenDepth += 1;
          current += ch;
          continue;
        }

        if (ch === ")") {
          parenDepth = Math.max(0, parenDepth - 1);
          current += ch;
          continue;
        }

        if (ch === "," && parenDepth === 0) {
          if (current.trim().length > 0) {
            chunks.push(current.trim());
          }
          current = "";
          continue;
        }

        current += ch;
      }

      if (current.trim().length > 0) {
        chunks.push(current.trim());
      }

      return chunks;
    };

    const parseCaseLiteral = (raw) => {
      const text = String(raw || "").trim();
      if (!text.length) return "";
      if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) {
        return text.slice(1, -1);
      }
      if (text === "true") return true;
      if (text === "false") return false;
      const n = Number(text);
      if (Number.isFinite(n)) return n;
      return text;
    };

    return formula.replace(caseRegex, (full, varExpr, body) => {
      const trimmedVarExpr = String(varExpr || "").trim();
      const directVar = trimmedVarExpr.match(/^\[([a-zA-Z0-9_-]+)\]$/);

      let rawValue;
      if (directVar) {
        rawValue = values[directVar[1]];
      } else {
        const preparedExpr = replaceFormulaVarsOutsideStrings(trimmedVarExpr, (_, id) => {
          return formatValueForFormula(values[id]);
        });
        const evaluated = safeEvaluateExpression(preparedExpr);
        rawValue = evaluated.valid ? evaluated.value : trimmedVarExpr;
      }

      const numericValue = toNumber(rawValue, NaN);
      const textValue = String(rawValue).trim();
      const boolValue =
        typeof rawValue === "boolean"
          ? rawValue
          : textValue === "true"
            ? true
            : textValue === "false"
              ? false
              : null;

      const clauses = splitCaseClauses(body);
      for (const clause of clauses) {
        const arrowIdx = clause.indexOf("=>");
        if (arrowIdx === -1) continue;

        const left = clause.slice(0, arrowIdx).trim();
        const outputText = clause.slice(arrowIdx + 2).trim();

        const isRange = left.startsWith("(") && left.endsWith(")");
        if (isRange) {
          const inside = left.slice(1, -1);
          const parts = inside.split(/[;,]/).map(s => s.trim()).filter(Boolean);
          if (parts.length === 2) {
            const start = Number(parts[0]);
            const end = Number(parts[1]);
            if (Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(numericValue)) {
              const low = Math.min(start, end);
              const high = Math.max(start, end);
              if (numericValue >= low && numericValue <= high) {
                return outputText;
              }
            } else {
              const startLiteral = parseCaseLiteral(parts[0]);
              const endLiteral = parseCaseLiteral(parts[1]);
              if (__nodeCaseEquals(startLiteral, endLiteral) && __nodeCaseEquals(rawValue, startLiteral)) {
                return outputText;
              }
            }
          }
          continue;
        }

        const caseValue = parseCaseLiteral(left);

        if (typeof caseValue === "number" && Number.isFinite(numericValue) && numericValue === caseValue) {
          return outputText;
        }

        if (typeof caseValue === "boolean" && boolValue !== null && boolValue === caseValue) {
          return outputText;
        }

        if (String(caseValue).trim() === textValue) {
          return outputText;
        }
      }

      return "0";
    });
  }

  function prepareFormulaForEval(formula, values) {
    if (!isFormulaString(formula)) return "0";

    const useGrosze = parseFormulaVariables(formula).some(v => v.id === "cost");

    let prepared = evaluateIfBlocks(formula, values);
    prepared = evaluateCaseBlocks(prepared, values);
    prepared = evaluateIfBlocks(prepared, values);

    prepared = replaceFormulaVarsOutsideStrings(prepared, (match, id) => {
      const raw = values[id];
      // A bare `[5]` / `[-2]` / `[true]` is a one-element array literal, not a
      // `[id]` dynamic-variable reference. Only treat it as a variable when a
      // real value is bound to that id (i.e. a form control literally named
      // "5"); otherwise leave the array literal untouched.
      if (raw === undefined && /^(-?\d+(?:\.\d+)?|true|false)$/.test(id)) {
        return match;
      }
      if (id === "cost" && useGrosze) {
        return String(toGrosze(toNumber(raw, 0)));
      }
      return formatValueForFormula(raw);
    });

    prepared = replaceCaretsOutsideStrings(prepared);
    // Backward compatibility: migrate legacy CSS Join formulas generated with map/filter/arrow.
    prepared = prepared.replace(
      /\(\[([\s\S]*?)\]\.map\(\(v\) => __nodeToString\(v\)\.trim\(\)\)\.filter\(\(v\) => v\.length > 0\)\.join\(';\s*'\)\)/g,
      "(__nodeCssJoin($1))"
    );

    return prepared;
  }

  // Parse/evaluate prepared formulas without dynamic code execution.
  const FORMULA_AST_CACHE_MAX = 250;
  const formulaAstCache = new Map();

  const FORMULA_FORBIDDEN_MEMBER_KEYS = new Set(["__proto__", "prototype", "constructor"]);
  const FORMULA_SAFE_STRING_MEMBERS = new Set([
    "split",
    "join",
    "trim",
    "toUpperCase",
    "toLowerCase",
    "includes",
    "indexOf",
    "slice",
    "length"
  ]);
  const FORMULA_SAFE_ARRAY_MEMBERS = new Set([
    "join",
    "includes",
    "indexOf",
    "slice",
    "length"
  ]);
  const FORMULA_SAFE_NUMBER_MEMBERS = new Set([
    "toString",
    "toFixed",
    "toLocaleString"
  ]);
  const FORMULA_SAFE_MATH_MEMBERS = new Set([
    "sin", "cos", "tan", "asin", "acos", "atan",
    "sqrt", "abs", "log", "exp", "floor", "ceil", "round",
    "min", "max", "pow"
  ]);
  const FORMULA_MAX_AST_DEPTH = 160;

  function decodeFormulaEscape(char, source, indexRef) {
    switch (char) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      case "\"":
      case "'":
      case "\\":
        return char;
      case "x": {
        const hex = source.slice(indexRef.value + 1, indexRef.value + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          indexRef.value += 2;
          return String.fromCharCode(parseInt(hex, 16));
        }
        return "x";
      }
      case "u": {
        const hex = source.slice(indexRef.value + 1, indexRef.value + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          indexRef.value += 4;
          return String.fromCharCode(parseInt(hex, 16));
        }
        return "u";
      }
      default:
        return char;
    }
  }

  function tokenizeFormulaExpression(expr) {
    const tokens = [];
    const source = String(expr || "");
    let i = 0;

    const numberPattern = /^(?:\d+\.\d*|\d+|\.\d+)(?:[eE][+-]?\d+)?/;
    const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*/;
    const operators = [
      "!==", "===", "<=", ">=", "&&", "||", "??", "==", "!=", "**",
      "+", "-", "*", "/", "%", "<", ">", "!"
    ];
    const punctuators = new Set(["(", ")", "{", "}", "[", "]", ".", ",", ":", "?"]);

    while (i < source.length) {
      const ch = source[i];

      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }

      const numberMatch = source.slice(i).match(numberPattern);
      if (numberMatch) {
        const raw = numberMatch[0];
        tokens.push({ type: "number", value: Number(raw), raw });
        i += raw.length;
        continue;
      }

      if (ch === "\"" || ch === "'") {
        const quote = ch;
        let value = "";
        i += 1;
        while (i < source.length) {
          const current = source[i];
          if (current === "\\") {
            i += 1;
            if (i >= source.length) {
              throw new Error("Unterminated string escape sequence");
            }
            const indexRef = { value: i };
            value += decodeFormulaEscape(source[i], source, indexRef);
            i = indexRef.value + 1;
            continue;
          }
          if (current === quote) {
            i += 1;
            break;
          }
          value += current;
          i += 1;
        }
        if (source[i - 1] !== quote) {
          throw new Error("Unterminated string literal");
        }
        tokens.push({ type: "string", value });
        continue;
      }

      const identMatch = source.slice(i).match(identifierPattern);
      if (identMatch) {
        const ident = identMatch[0];
        tokens.push({ type: "identifier", value: ident });
        i += ident.length;
        continue;
      }

      let matchedOperator = "";
      for (const op of operators) {
        if (source.startsWith(op, i)) {
          matchedOperator = op;
          break;
        }
      }
      if (matchedOperator) {
        tokens.push({ type: "operator", value: matchedOperator });
        i += matchedOperator.length;
        continue;
      }

      if (punctuators.has(ch)) {
        tokens.push({ type: "punct", value: ch });
        i += 1;
        continue;
      }

      throw new Error(`Unsupported token "${ch}"`);
    }

    tokens.push({ type: "eof", value: "" });
    return tokens;
  }

  function createFormulaParser(tokens) {
    let pos = 0;

    const current = () => tokens[pos] || tokens[tokens.length - 1];
    const consume = () => {
      const token = current();
      pos += 1;
      return token;
    };

    const matchOperator = (op) => {
      const token = current();
      if (token.type === "operator" && token.value === op) {
        consume();
        return true;
      }
      return false;
    };

    const matchPunct = (p) => {
      const token = current();
      if (token.type === "punct" && token.value === p) {
        consume();
        return true;
      }
      return false;
    };

    const expectPunct = (p) => {
      if (!matchPunct(p)) {
        throw new Error(`Expected "${p}"`);
      }
    };

    const parseExpression = () => parseConditionalExpression();

    const parseConditionalExpression = () => {
      const test = parseNullishExpression();
      if (matchPunct("?")) {
        const consequent = parseExpression();
        expectPunct(":");
        const alternate = parseExpression();
        return { type: "ConditionalExpression", test, consequent, alternate };
      }
      return test;
    };

    const parseNullishExpression = () => {
      let left = parseLogicalOrExpression();
      while (matchOperator("??")) {
        const right = parseLogicalOrExpression();
        left = { type: "BinaryExpression", operator: "??", left, right };
      }
      return left;
    };

    const parseLogicalOrExpression = () => {
      let left = parseLogicalAndExpression();
      while (matchOperator("||")) {
        const right = parseLogicalAndExpression();
        left = { type: "BinaryExpression", operator: "||", left, right };
      }
      return left;
    };

    const parseLogicalAndExpression = () => {
      let left = parseEqualityExpression();
      while (matchOperator("&&")) {
        const right = parseEqualityExpression();
        left = { type: "BinaryExpression", operator: "&&", left, right };
      }
      return left;
    };

    const parseEqualityExpression = () => {
      let left = parseRelationalExpression();
      while (true) {
        if (matchOperator("===")) {
          left = { type: "BinaryExpression", operator: "===", left, right: parseRelationalExpression() };
        } else if (matchOperator("!==")) {
          left = { type: "BinaryExpression", operator: "!==", left, right: parseRelationalExpression() };
        } else if (matchOperator("==")) {
          left = { type: "BinaryExpression", operator: "==", left, right: parseRelationalExpression() };
        } else if (matchOperator("!=")) {
          left = { type: "BinaryExpression", operator: "!=", left, right: parseRelationalExpression() };
        } else {
          break;
        }
      }
      return left;
    };

    const parseRelationalExpression = () => {
      let left = parseAdditiveExpression();
      while (true) {
        if (matchOperator("<=")) {
          left = { type: "BinaryExpression", operator: "<=", left, right: parseAdditiveExpression() };
        } else if (matchOperator(">=")) {
          left = { type: "BinaryExpression", operator: ">=", left, right: parseAdditiveExpression() };
        } else if (matchOperator("<")) {
          left = { type: "BinaryExpression", operator: "<", left, right: parseAdditiveExpression() };
        } else if (matchOperator(">")) {
          left = { type: "BinaryExpression", operator: ">", left, right: parseAdditiveExpression() };
        } else {
          break;
        }
      }
      return left;
    };

    const parseAdditiveExpression = () => {
      let left = parseMultiplicativeExpression();
      while (true) {
        if (matchOperator("+")) {
          left = { type: "BinaryExpression", operator: "+", left, right: parseMultiplicativeExpression() };
        } else if (matchOperator("-")) {
          left = { type: "BinaryExpression", operator: "-", left, right: parseMultiplicativeExpression() };
        } else {
          break;
        }
      }
      return left;
    };

    const parseMultiplicativeExpression = () => {
      let left = parseExponentExpression();
      while (true) {
        if (matchOperator("*")) {
          left = { type: "BinaryExpression", operator: "*", left, right: parseExponentExpression() };
        } else if (matchOperator("/")) {
          left = { type: "BinaryExpression", operator: "/", left, right: parseExponentExpression() };
        } else if (matchOperator("%")) {
          left = { type: "BinaryExpression", operator: "%", left, right: parseExponentExpression() };
        } else {
          break;
        }
      }
      return left;
    };

    const parseExponentExpression = () => {
      let left = parseUnaryExpression();
      if (matchOperator("**")) {
        const right = parseExponentExpression();
        left = { type: "BinaryExpression", operator: "**", left, right };
      }
      return left;
    };

    const parseUnaryExpression = () => {
      if (matchOperator("!")) {
        return { type: "UnaryExpression", operator: "!", argument: parseUnaryExpression() };
      }
      if (matchOperator("+")) {
        return { type: "UnaryExpression", operator: "+", argument: parseUnaryExpression() };
      }
      if (matchOperator("-")) {
        return { type: "UnaryExpression", operator: "-", argument: parseUnaryExpression() };
      }
      return parsePostfixExpression();
    };

    const parsePostfixExpression = () => {
      let expr = parsePrimaryExpression();

      while (true) {
        if (matchPunct(".")) {
          const token = consume();
          if (token.type !== "identifier") {
            throw new Error("Expected member identifier");
          }
          expr = {
            type: "MemberExpression",
            object: expr,
            property: { type: "Identifier", name: token.value },
            computed: false
          };
          continue;
        }

        if (matchPunct("[")) {
          const property = parseExpression();
          expectPunct("]");
          expr = {
            type: "MemberExpression",
            object: expr,
            property,
            computed: true
          };
          continue;
        }

        if (matchPunct("(")) {
          const args = [];
          if (!matchPunct(")")) {
            do {
              args.push(parseExpression());
            } while (matchPunct(","));
            expectPunct(")");
          }
          expr = {
            type: "CallExpression",
            callee: expr,
            arguments: args
          };
          continue;
        }

        break;
      }

      return expr;
    };

    const parseObjectExpression = () => {
      const properties = [];
      if (matchPunct("}")) {
        return { type: "ObjectExpression", properties };
      }

      while (true) {
        const keyToken = consume();
        let key;
        if (keyToken.type === "identifier") {
          key = keyToken.value;
        } else if (keyToken.type === "string" || keyToken.type === "number") {
          key = String(keyToken.value);
        } else {
          throw new Error("Invalid object key");
        }

        expectPunct(":");
        const value = parseExpression();
        properties.push({ key, value });

        if (matchPunct("}")) {
          break;
        }
        expectPunct(",");
      }

      return { type: "ObjectExpression", properties };
    };

    const parseArrayExpression = () => {
      const elements = [];
      if (matchPunct("]")) {
        return { type: "ArrayExpression", elements };
      }

      while (true) {
        elements.push(parseExpression());
        if (matchPunct("]")) {
          break;
        }
        expectPunct(",");
      }

      return { type: "ArrayExpression", elements };
    };

    const parsePrimaryExpression = () => {
      const token = current();

      if (token.type === "number") {
        consume();
        return { type: "Literal", value: token.value };
      }
      if (token.type === "string") {
        consume();
        return { type: "Literal", value: token.value };
      }
      if (token.type === "identifier") {
        consume();
        switch (token.value) {
          case "true":
            return { type: "Literal", value: true };
          case "false":
            return { type: "Literal", value: false };
          case "null":
            return { type: "Literal", value: null };
          case "undefined":
            return { type: "Literal", value: undefined };
          case "NaN":
            return { type: "Literal", value: NaN };
          case "Infinity":
            return { type: "Literal", value: Infinity };
          default:
            return { type: "Identifier", name: token.value };
        }
      }
      if (matchPunct("(")) {
        const inner = parseExpression();
        expectPunct(")");
        return inner;
      }
      if (matchPunct("{")) {
        return parseObjectExpression();
      }
      if (matchPunct("[")) {
        return parseArrayExpression();
      }

      throw new Error(`Unexpected token "${token.value}"`);
    };

    return {
      parse() {
        const ast = parseExpression();
        const tail = current();
        if (tail.type !== "eof") {
          throw new Error("Unexpected trailing tokens");
        }
        return ast;
      }
    };
  }

  function getCachedFormulaAst(expr) {
    if (formulaAstCache.has(expr)) {
      return formulaAstCache.get(expr);
    }

    let ast = null;
    try {
      const tokens = tokenizeFormulaExpression(expr);
      const parser = createFormulaParser(tokens);
      ast = parser.parse();
    } catch (e) {
      ast = null;
    }

    if (formulaAstCache.size >= FORMULA_AST_CACHE_MAX) {
      const oldestKey = formulaAstCache.keys().next().value;
      if (oldestKey !== undefined) {
        formulaAstCache.delete(oldestKey);
      }
    }

    formulaAstCache.set(expr, ast);
    return ast;
  }

  function createFormulaEvalContext(extraContext = {}) {
    return {
      Math,
      Number,
      parseInt,
      String,
      __nodeRegex,
      __nodeConcat,
      __nodeCutA,
      __nodeCutB,
      __nodeCutC,
      __nodeCountChars,
      __nodeCountWords,
      __nodeFindStart,
      __nodeFindEnd,
      __nodeToNumber,
      __nodeToString,
      __nodeCssJoin,
      __nodeArrayPush,
      __nodeArrayPop,
      __nodeArraySort,
      __nodeArrayRemove,
      __nodeArrayReplace,
      __nodeArrayMap,
      __nodeArrayFilter,
      __nodeArrayReduce,
      __nodeArrayFind,
      __nodeArrayForEach,
      __nodeArrayCollect,
      __nodeArrayContains,
      __nodeArrayLength,
      __nodeArrayMerge,
      __nodeArrayUnique,
      __nodeArrayMapGraph,
      __nodeArrayFilterGraph,
      __nodeLoopItem: extraContext.__nodeLoopItem,
      __nodeLoopIndex: extraContext.__nodeLoopIndex,
      __nodeApiRequest,
      __nodeApiStatus,
      __nodeApiListMapper,
      __nodeImageFromLink,
      __nodeImageFromElement,
      __nodeGetElement,
      __nodeGetElementProp,
      __nodeGetChildren,
      __nodeGetChildAt,
      __nodeGetChildrenSubset,
      __nodeToBase,
      __nodeParseRadix,
      __nodeCountTrue,
      __nodeGradient,
      __nodeUnzip,
      __nodeCaseEquals,
      __nodeGetPath,
      __nodeJsonParse,
      // Bound per-evaluation so the compiled call's own `scope` literal
      // ('widget' | 'page') combines with the runtime blockScope of the
      // logic block actually running this formula -- see __nodeMemoryResolveKey.
      __nodeMemoryGet: (varName, defaultValue, persist, scope) =>
        __nodeMemoryGet(varName, defaultValue, persist, scope, extraContext.__nodeBlockScope),
      __nodeMemorySet: (varName, value, reset, scope) =>
        __nodeMemorySet(varName, value, reset, scope, extraContext.__nodeBlockScope),
      __nodeMemoryHas: (varName, scope) =>
        __nodeMemoryHas(varName, scope, extraContext.__nodeBlockScope),
      __nodeMemoryDelete: (varName, trigger, scope) =>
        __nodeMemoryDelete(varName, trigger, scope, extraContext.__nodeBlockScope),
      __nodeMemoryIncrement: (varName, step, trigger, persist, scope) =>
        __nodeMemoryIncrement(varName, step, trigger, persist, scope, extraContext.__nodeBlockScope),
      __nodeMemoryArrayAppend: (varName, item, trigger, persist, scope) =>
        __nodeMemoryArrayAppend(varName, item, trigger, persist, scope, extraContext.__nodeBlockScope),
      __nodeMemoryArrayRemove: (varName, item, trigger, persist, scope) =>
        __nodeMemoryArrayRemove(varName, item, trigger, persist, scope, extraContext.__nodeBlockScope),
      __nodeEvent,
      __nodeHoverEvent,
      __nodePageLoadEvent,
      __nodeTimerEvent,
      __nodeCustomEvent,
      __nodeEventOr,
      __nodeEventAnd,
      __nodeFallbackEvent: (nodeId, main, fallback, holdMs) =>
        __nodeFallbackEvent(nodeId, main, fallback, holdMs, extraContext.__nodeBlockScope),
      __nodeEventProcessor,
      __nodeFallback,
      // Bound per-evaluation the same way the memory functions above are --
      // the compiled call's own literal args combine with the runtime
      // blockScope (duplicated-widget disambiguation) and, for Send Email,
      // the editor/post id the server needs to re-derive its own
      // authorization from the SAVED graph definition rather than trust
      // anything this client-side call could claim.
      __nodeFormData: (elementIdOrRef, formNodeId) =>
        __nodeFormData(elementIdOrRef, formNodeId, extraContext.__nodeBlockScope),
      __nodeSendEmail: (recipient, subject, message, trigger, sendNodeId) =>
        __nodeSendEmail(recipient, subject, message, trigger, sendNodeId, extraContext.__nodeBlockScope, extraContext.__nodeEditorId, extraContext.__nodePostId),
      __nodeDbChain,
      // DOM nodes: per-instance state is keyed by the block scope (and, in a
      // For Each body -- evaluated without extraContext -- by the scope of the
      // block currently being evaluated).
      __nodeRawHtml: (nodeId, html, slots, values) =>
        __nodeRawHtml(nodeId, html, slots, values, extraContext.__nodeBlockScope || nlEvaluatingBlockScope),
      __nodeSetParent: (nodeId, element, parent, position, trigger, hasTrigger) =>
        __nodeSetParent(nodeId, element, parent, position, trigger, hasTrigger, extraContext.__nodeBlockScope || nlEvaluatingBlockScope),
      __nodeCloneElement: (nodeId, element, placement, trigger, hasTrigger) =>
        __nodeCloneElement(nodeId, element, placement, trigger, hasTrigger, extraContext.__nodeBlockScope || nlEvaluatingBlockScope),
      __nodeElementsByClass,
      __nodeDebug: (nodeId, kind, label, value, trigger, hasTrigger, everyone) =>
        __nodeDebug(nodeId, kind, label, value, trigger, hasTrigger, everyone, extraContext.__nodeBlockScope || nlEvaluatingBlockScope),
      __nodeDbSelect: (opNodeId, query, limit, offset) =>
        __nodeDbSelect(opNodeId, query, limit, offset, extraContext.__nodeBlockScope, extraContext.__nodeEditorId, extraContext.__nodePostId),
      __nodeDbWrite: (opNodeId, query, values, trigger) =>
        __nodeDbWrite(opNodeId, query, values, trigger, extraContext.__nodeBlockScope, extraContext.__nodeEditorId, extraContext.__nodePostId)
    };
  }

  function resolveFormulaIdentifier(name, context) {
    if (Object.prototype.hasOwnProperty.call(context, name)) {
      return context[name];
    }
    if (/^o\d+$/.test(name)) {
      return undefined;
    }
    throw new Error(`Identifier "${name}" is not allowed`);
  }

  function normalizeFormulaMemberKey(rawKey) {
    const key = String(rawKey);
    if (FORMULA_FORBIDDEN_MEMBER_KEYS.has(key)) {
      throw new Error(`Property "${key}" is not allowed`);
    }
    return key;
  }

  function getFormulaMember(baseValue, rawKey) {
    if (baseValue === null || baseValue === undefined) {
      throw new Error("Cannot access member of null/undefined");
    }

    const key = normalizeFormulaMemberKey(rawKey);

    if (baseValue === Math) {
      if (!FORMULA_SAFE_MATH_MEMBERS.has(key)) {
        throw new Error(`Math member "${key}" is not allowed`);
      }
      return baseValue[key];
    }

    if (typeof baseValue === "string") {
      if (/^\d+$/.test(key)) {
        const idx = Number(key);
        return idx >= 0 && idx < baseValue.length ? baseValue[idx] : undefined;
      }
      if (!FORMULA_SAFE_STRING_MEMBERS.has(key)) {
        throw new Error(`String member "${key}" is not allowed`);
      }
      if (key === "length") {
        return baseValue.length;
      }
      return String.prototype[key];
    }

    if (Array.isArray(baseValue)) {
      if (/^\d+$/.test(key)) {
        return baseValue[Number(key)];
      }
      if (!FORMULA_SAFE_ARRAY_MEMBERS.has(key)) {
        throw new Error(`Array member "${key}" is not allowed`);
      }
      if (key === "length") {
        return baseValue.length;
      }
      return Array.prototype[key];
    }

    if (typeof baseValue === "number") {
      if (!FORMULA_SAFE_NUMBER_MEMBERS.has(key)) {
        throw new Error(`Number member "${key}" is not allowed`);
      }
      return Number.prototype[key];
    }

    if (typeof baseValue === "boolean") {
      if (key === "toString") {
        return Boolean.prototype.toString;
      }
      throw new Error(`Boolean member "${key}" is not allowed`);
    }

    if (typeof baseValue === "object") {
      if (!Object.prototype.hasOwnProperty.call(baseValue, key)) {
        return undefined;
      }
      return baseValue[key];
    }

    throw new Error("Unsupported member base type");
  }

  function evalFormulaNode(node, context, depth = 0) {
    if (!node || typeof node !== "object") {
      throw new Error("Invalid AST node");
    }
    if (depth > FORMULA_MAX_AST_DEPTH) {
      throw new Error("Expression too deep");
    }

    switch (node.type) {
      case "Literal":
        return node.value;

      case "Identifier":
        return resolveFormulaIdentifier(node.name, context);

      case "UnaryExpression": {
        const value = evalFormulaNode(node.argument, context, depth + 1);
        switch (node.operator) {
          case "!":
            return !value;
          case "+":
            return +value;
          case "-":
            return -value;
          default:
            throw new Error(`Unsupported unary operator "${node.operator}"`);
        }
      }

      case "BinaryExpression": {
        if (node.operator === "&&") {
          const left = evalFormulaNode(node.left, context, depth + 1);
          return left ? evalFormulaNode(node.right, context, depth + 1) : left;
        }
        if (node.operator === "||") {
          const left = evalFormulaNode(node.left, context, depth + 1);
          return left ? left : evalFormulaNode(node.right, context, depth + 1);
        }
        if (node.operator === "??") {
          const left = evalFormulaNode(node.left, context, depth + 1);
          return left === null || left === undefined
            ? evalFormulaNode(node.right, context, depth + 1)
            : left;
        }

        const left = evalFormulaNode(node.left, context, depth + 1);
        const right = evalFormulaNode(node.right, context, depth + 1);

        switch (node.operator) {
          case "+":
            return left + right;
          case "-":
            return left - right;
          case "*":
            return left * right;
          case "/":
            return left / right;
          case "%":
            return left % right;
          case "**":
            return left ** right;
          case "===":
            return left === right;
          case "!==":
            return left !== right;
          case "==":
            return left == right; // eslint-disable-line eqeqeq
          case "!=":
            return left != right; // eslint-disable-line eqeqeq
          case "<":
            return left < right;
          case "<=":
            return left <= right;
          case ">":
            return left > right;
          case ">=":
            return left >= right;
          default:
            throw new Error(`Unsupported binary operator "${node.operator}"`);
        }
      }

      case "ConditionalExpression":
        return evalFormulaNode(node.test, context, depth + 1)
          ? evalFormulaNode(node.consequent, context, depth + 1)
          : evalFormulaNode(node.alternate, context, depth + 1);

      case "ObjectExpression": {
        const out = {};
        for (const prop of node.properties || []) {
          const key = normalizeFormulaMemberKey(prop.key);
          out[key] = evalFormulaNode(prop.value, context, depth + 1);
        }
        return out;
      }

      case "ArrayExpression":
        return (node.elements || []).map((el) => evalFormulaNode(el, context, depth + 1));

      case "MemberExpression": {
        const base = evalFormulaNode(node.object, context, depth + 1);
        const rawKey = node.computed
          ? evalFormulaNode(node.property, context, depth + 1)
          : node.property.name;
        return getFormulaMember(base, rawKey);
      }

      case "CallExpression": {
        const args = (node.arguments || []).map((arg) => evalFormulaNode(arg, context, depth + 1));

        if (node.callee?.type === "MemberExpression") {
          const base = evalFormulaNode(node.callee.object, context, depth + 1);
          const rawKey = node.callee.computed
            ? evalFormulaNode(node.callee.property, context, depth + 1)
            : node.callee.property.name;
          const fn = getFormulaMember(base, rawKey);
          if (typeof fn !== "function") {
            throw new Error("Attempt to call a non-function member");
          }
          return fn.apply(base, args);
        }

        const fn = evalFormulaNode(node.callee, context, depth + 1);
        if (typeof fn !== "function") {
          throw new Error("Attempt to call a non-function");
        }
        return fn(...args);
      }

      default:
        throw new Error(`Unsupported AST node type "${node.type}"`);
    }
  }

  // A logic block's formula is ONE object of independent entries (one per
  // Output / side-effect node). A single failing entry used to make the whole
  // evaluation invalid -- every Output of the block stopped working, with
  // nothing in the console. Each root entry is now evaluated on its own: a
  // failing one is skipped and reported (once per entry + message), the rest
  // still apply. Only the block ROOT is split (it is the one evaluation that
  // carries __nodeBlockScope); loop bodies and nested objects keep their
  // all-or-nothing semantics, so a half-built per-item payload is never used.
  const nlReportedEntryFailures = new Set();
  function nlReportEntryFailure(key, error) {
    const message = (error && error.message) || String(error);
    const signature = `${key}\u0000${message}`;
    if (nlReportedEntryFailures.has(signature)) return;
    if (nlReportedEntryFailures.size > 200) nlReportedEntryFailures.clear();
    nlReportedEntryFailures.add(signature);
    try {
      console.warn(`NodeLogic: part of a logic graph could not be evaluated and was skipped (${String(key).trim()}): ${message}`);
    } catch (e) {
      // console unavailable: nothing else to do
    }
  }

  function safeEvaluateExpression(expr, extraContext = {}) {
    try {
      if (!isPreparedExpressionSafe(expr)) {
        return { valid: false, value: undefined };
      }

      const ast = getCachedFormulaAst(expr);
      if (!ast) {
        return { valid: false, value: undefined };
      }

      const context = createFormulaEvalContext(extraContext);
      const isBlockRoot = Boolean(extraContext) && Object.prototype.hasOwnProperty.call(extraContext, "__nodeBlockScope");
      if (isBlockRoot && ast.type === "ObjectExpression") {
        const out = {};
        for (const prop of ast.properties || []) {
          let key = "";
          try {
            key = normalizeFormulaMemberKey(prop.key);
            out[key] = evalFormulaNode(prop.value, context, 1);
          } catch (error) {
            nlReportEntryFailure(key, error);
          }
        }
        return { valid: true, value: out };
      }

      const value = evalFormulaNode(ast, context, 0);
      return { valid: true, value };
    } catch (e) {
      return { valid: false, value: undefined };
    }
  }

  function evaluateFormulaExpression(formula, values, extraContext) {
    if (!isFormulaString(formula)) {
      return { valid: false, value: NaN, useGrosze: false, prepared: "" };
    }

    const useGrosze = parseFormulaVariables(formula).some(v => v.id === "cost");
    const prepared = prepareFormulaForEval(formula, values);
    const rawResult = safeEvaluateExpression(prepared, extraContext);

    if (!rawResult.valid) {
      return { valid: false, value: NaN, useGrosze, prepared };
    }

    let value = rawResult.value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return { valid: false, value: NaN, useGrosze, prepared };
      }
      if (useGrosze) {
        value = value / 100;
      }
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      const payload = { ...value };
      if (typeof payload.value === "number") {
        if (!Number.isFinite(payload.value)) {
          return { valid: false, value: NaN, useGrosze, prepared };
        }
        if (useGrosze) {
          payload.value = payload.value / 100;
        }
      }
      value = payload;
    }

    return {
      valid: true,
      value,
      useGrosze,
      prepared
    };
  }

  function parseVariableAliases(formula) {
    const aliases = {};
    const vars = parseFormulaVariables(formula);

    vars.forEach(({ id, alias, unit }) => {
      aliases[id] = {
        label: alias || id,
        unit: unit || ""
      };
    });

    return aliases;
  }

  function buildVariablesDescription(formula) {
    const vars = parseFormulaVariables(formula);

    if (!vars.length) {
      return "No variables in formula";
    }

    return vars
      .map(v => {
        const label = v.alias ? v.alias : v.id;
        const unit = v.unit ? ` (${v.unit})` : "";
        return `${v.id} - ${label}${unit}`;
      })
      .join("\n");
  }

  function buildCalculationPreview(formula, values) {
    if (!isFormulaString(formula)) return "";

    const expanded = evaluateCaseBlocks(evaluateIfBlocks(formula, values), values);

    return replaceFormulaVarsOutsideStrings(expanded, (m, id, alias, unit) => {
      const val = values[id] ?? 0;
      return unit?.trim() ? `${val} ${unit.trim()}` : val;
    });
  }

  function toLatex(expr) {
    if (!expr) return "";

    return String(expr)
      .replace(/\*\*/g, "^")
      .replace(/\*/g, "\\cdot ")
      .replace(/\//g, "\\div ")
      .replace(/\(/g, "\\left(")
      .replace(/\)/g, "\\right)")
      .replace(/_/g, "\\_");
  }

  function setBlockText(block, selector, text) {
    const el = block.querySelector(selector);
    if (el) el.textContent = text;
  }

  function setBlockHTML(block, selector, html) {
    const el = block.querySelector(selector);
    if (el) el.textContent = html;
  }

  function parseJsonAttribute(value, fallback) {
    if (typeof value !== "string" || !value.trim()) {
      return fallback;
    }
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }

  function formatDisplayValue(value) {
    if (value === undefined || value === null) {
      return "";
    }
    if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function resolveValueByPathOrFallback(item, rawPath, fallback, expectedType) {
    const path = toSafeString(rawPath).trim();
    const direct = path ? __nodeGetPath(item, path, undefined) : undefined;
    const hasDirectValue = direct !== undefined && direct !== null && !(typeof direct === "string" && direct.trim() === "");
    if (hasDirectValue) {
      return direct;
    }

    if (!item || typeof item !== "object") {
      return fallback;
    }

    const preferredKeys = expectedType === "number"
      ? ["value", "amount", "count", "total", "number", "qty", "quantity"]
      : ["label", "name", "title", "text", "caption", "value"];

    for (const key of preferredKeys) {
      if (!(key in item)) {
        continue;
      }
      const next = item[key];
      if (next !== undefined && next !== null && !(typeof next === "string" && next.trim() === "")) {
        return next;
      }
    }

    const entries = Object.entries(item);
    if (expectedType === "number") {
      for (const [, value] of entries) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
          return numeric;
        }
      }
    }

    if (expectedType === "string") {
      for (const [, value] of entries) {
        if (typeof value === "string" && value.trim()) {
          return value;
        }
      }
    }

    return fallback;
  }

  function collectChartRecords(rawValue, block) {
    const labelPath = toSafeString(block.dataset.nodelogicChartLabelPath || "").trim();
    const valuePath = toSafeString(block.dataset.nodelogicChartValuePath || "").trim();
    const dataPath = toSafeString(block.dataset.nodelogicChartDataPath || "").trim();
    const topCount = Math.max(0, Number(block.dataset.nodelogicChartTopCount || 0) || 0);

    let source = rawValue;
    if (source === undefined || source === null || source === "") {
      source = parseJsonAttribute(block.dataset.nodelogicChartSample, []);
    }

    if (dataPath) {
      const extracted = __nodeGetPath(source, dataPath, source);
      if (Array.isArray(extracted)) {
        source = extracted;
      } else if (extracted !== undefined && extracted !== null) {
        source = extracted;
      }
    }

    const sourceItems = Array.isArray(source)
      ? source
      : (source && typeof source === "object" ? [source] : [{ label: "Value", value: source }]);

    const records = sourceItems.map((item, index) => {
      const current = item && typeof item === "object" ? item : { label: item, value: item };
      const fallbackLabel = `Item ${index + 1}`;
      const label = resolveValueByPathOrFallback(current, labelPath, fallbackLabel, "string");
      const rawNumber = resolveValueByPathOrFallback(current, valuePath, 0, "number");
      const value = Number(rawNumber);
      return {
        label: toSafeString(label).trim() || fallbackLabel,
        value: Number.isFinite(value) ? value : 0
      };
    });

    if (topCount > 0) {
      return records
        .slice()
        .sort((left, right) => Number(right.value || 0) - Number(left.value || 0))
        .slice(0, topCount);
    }

    return records;
  }

  function trimTrailingZeros(value) {
    return String(value).replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "").replace(/\.$/u, "");
  }

  function formatChartPercentValue(value, decimals) {
    const safeDecimals = Math.max(0, Math.min(4, Number.isFinite(Number(decimals)) ? Math.floor(Number(decimals)) : 0));
    const rounded = Number.isFinite(Number(value)) ? Number(value).toFixed(safeDecimals) : (0).toFixed(safeDecimals);
    return trimTrailingZeros(rounded);
  }

  function calculatePiePercentages(records, decimals) {
    const positiveValues = records.map((record) => Math.max(0, Number(record.value) || 0));
    const total = positiveValues.reduce((sum, value) => sum + value, 0);
    if (total <= 0) {
      return records.map(() => 0);
    }

    const safeDecimals = Math.max(0, Math.min(4, Number.isFinite(Number(decimals)) ? Math.floor(Number(decimals)) : 0));
    const precision = 10 ** safeDecimals;
    const targetUnits = 100 * precision;
    const exactUnits = positiveValues.map((value) => (value / total) * targetUnits);
    const baseUnits = exactUnits.map((value) => Math.floor(value));
    let remaining = targetUnits - baseUnits.reduce((sum, value) => sum + value, 0);

    const order = exactUnits
      .map((value, index) => ({
        index,
        fraction: value - baseUnits[index],
        weight: positiveValues[index],
      }))
      .sort((left, right) => {
        if (right.fraction !== left.fraction) return right.fraction - left.fraction;
        if (right.weight !== left.weight) return right.weight - left.weight;
        return left.index - right.index;
      });

    let cursor = 0;
    while (remaining > 0 && order.length > 0) {
      const entry = order[cursor % order.length];
      baseUnits[entry.index] += 1;
      remaining -= 1;
      cursor += 1;
    }

    return baseUnits.map((units) => units / precision);
  }

  function buildChartSvg(records, variant, axisGap = 10, showScale = true, showGrid = true, showAxisArrow = true, legendGap = 12, percentDecimals = 0) {
    const width = 640;
    const height = 320;
    const safeVariant = toSafeString(variant || "bar").trim().toLowerCase();
    const tickStep = Math.max(1, Number(axisGap) || 10);
    const gridEnabled = showGrid !== false;
    const axisArrowEnabled = showAxisArrow !== false;
    const values = records.map((record) => Number(record.value) || 0);
    const maxValue = Math.max(1, ...values, 1);
    const totalValue = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
    const colors = ["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#f97316", "#ef4444", "#14b8a6", "#60a5fa"];
    const axisVariants = new Set(["bar", "comparison", "line", "function", "scatter"]);
    const axisX = 44;
    const axisTop = 48;
    const axisBottom = safeVariant === "bar"
      ? 236
      : (safeVariant === "scatter" ? height - 48 : (safeVariant === "comparison" ? 236 : height - 58));
    const axisHeight = Math.max(1, axisBottom - axisTop);
    const buildTicks = () => {
      const ticks = [0];
      let current = tickStep;
      let safety = 0;
      while (current < maxValue && safety < 100) {
        ticks.push(current);
        current += tickStep;
        safety += 1;
      }
      if (ticks[ticks.length - 1] !== maxValue) {
        ticks.push(maxValue);
      }
      return ticks;
    };
    const ticks = buildTicks();
    const valueToY = (value) => axisBottom - ((Math.max(0, Math.min(maxValue, Number(value) || 0)) / maxValue) * axisHeight);
    const renderAxis = () => {
      if (!showScale || safeVariant === "comparison" || !axisVariants.has(safeVariant)) {
        return "";
      }

      return `
        <g aria-hidden="true">
          ${gridEnabled ? ticks.map((tickValue) => {
            const y = valueToY(tickValue);
            return `<line x1="${axisX + 12}" y1="${y}" x2="${width - 40}" y2="${y}" stroke="#1f2937" stroke-width="1" stroke-dasharray="4 6" opacity="0.7"></line>`;
          }).join("") : ""}
          <line x1="${axisX}" y1="${axisBottom}" x2="${axisX}" y2="${axisArrowEnabled ? axisTop - 12 : axisTop}" stroke="#94a3b8" stroke-width="2"></line>
          ${axisArrowEnabled ? `<polygon points="${axisX - 5},${axisTop - 4} ${axisX + 5},${axisTop - 4} ${axisX},${axisTop - 14}" fill="#94a3b8"></polygon>` : ""}
          ${ticks.map((tickValue) => {
            const y = valueToY(tickValue);
            return `
              <line x1="${axisX - 6}" y1="${y}" x2="${axisX + 6}" y2="${y}" stroke="#64748b" stroke-width="1.5"></line>
              <text x="${axisX - 10}" y="${y + 4}" fill="#cbd5e1" font-size="10" text-anchor="end">${escapeHtml(formatDisplayValue(tickValue))}</text>
            `;
          }).join("")}
        </g>
      `;
    };

    const escapeLabel = (label) => escapeHtml(label);
    const svgStart = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="NodeLogic chart" xmlns="http://www.w3.org/2000/svg">`;
    const svgEnd = "</svg>";

    if (!records.length) {
      return `${svgStart}<rect width="640" height="320" rx="24" fill="#0f172a"/><text x="50%" y="50%" fill="#94a3b8" font-size="18" text-anchor="middle" dominant-baseline="middle">No data</text>${svgEnd}`;
    }

    if (safeVariant === "comparison") {
      const rowHeight = 34;
      return `${svgStart}
        <rect width="${width}" height="${height}" rx="24" fill="#0f172a"/>
        ${renderAxis()}
        ${records.map((record, index) => {
          const value = Math.max(0, Number(record.value) || 0);
        const barWidth = Math.max(30, (value / maxValue) * Math.max(1, width - 220));
          const y = 42 + index * rowHeight;
          const color = colors[index % colors.length];
          return `
            <text x="40" y="${y + 14}" fill="#e2e8f0" font-size="13" font-weight="700">${escapeLabel(record.label)}</text>
            <rect x="170" y="${y}" width="${barWidth}" height="18" rx="9" fill="${color}"></rect>
            <text x="${180 + barWidth}" y="${y + 14}" fill="#cbd5e1" font-size="12">${escapeHtml(formatDisplayValue(value))}</text>
          `;
        }).join("")}
      ${svgEnd}`;
    }

    if (safeVariant === "line" || safeVariant === "function") {
      const points = records.map((record, index) => {
        const x = 60 + (index * (width - 120)) / Math.max(1, records.length - 1);
        const y = height - 70 - ((Math.max(0, record.value) / maxValue) * 120);
        return { x, y, label: record.label, value: record.value, color: colors[index % colors.length] };
      });
      const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
      const areaPath = points.length > 1
        ? `M ${points[0].x} ${height - 58} ${points.map((point) => `L ${point.x} ${point.y}`).join(" ")} L ${points[points.length - 1].x} ${height - 58} Z`
        : "";
      const stroke = safeVariant === "function" ? "#a78bfa" : "#38bdf8";
      const dash = safeVariant === "function" ? ' stroke-dasharray="8 6"' : "";
      return `${svgStart}
        <rect width="${width}" height="${height}" rx="24" fill="#0f172a"/>
        ${renderAxis()}
        <line x1="48" y1="${height - 58}" x2="${width - 40}" y2="${height - 58}" stroke="#334155" stroke-width="2"></line>
        ${points.length > 1 ? `<path d="${areaPath}" fill="rgba(56, 189, 248, 0.12)" stroke="none"></path>` : ""}
        <path d="${linePath}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"${dash}></path>
        ${points.map((point) => `
          <circle cx="${point.x}" cy="${point.y}" r="7" fill="${point.color}" stroke="#e2e8f0" stroke-width="2"></circle>
          <text x="${point.x}" y="${height - 18}" fill="#cbd5e1" font-size="12" text-anchor="middle">${escapeLabel(point.label)}</text>
        `).join("")}
        ${safeVariant === "function" ? '<text x="56" y="34" fill="#c4b5fd" font-size="13" font-weight="700">f(x)</text>' : ""}
      ${svgEnd}`;
    }

    if (safeVariant === "pie" || safeVariant === "donut") {
      const radius = 112;
      const innerRadius = safeVariant === "donut" ? 62 : 0;
      const cx = 320;
      const cy = 170;
      let startAngle = -Math.PI / 2;
      const percentages = calculatePiePercentages(records, percentDecimals);
      const segments = records.map((record, index) => {
        const slice = (Math.max(0, record.value) / totalValue) * Math.PI * 2;
        const endAngle = startAngle + slice;
        const largeArc = slice > Math.PI ? 1 : 0;
        const x1 = cx + Math.cos(startAngle) * radius;
        const y1 = cy + Math.sin(startAngle) * radius;
        const x2 = cx + Math.cos(endAngle) * radius;
        const y2 = cy + Math.sin(endAngle) * radius;
        const path = innerRadius > 0
          ? [
              `M ${cx + Math.cos(startAngle) * innerRadius} ${cy + Math.sin(startAngle) * innerRadius}`,
              `L ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
              `L ${cx + Math.cos(endAngle) * innerRadius} ${cy + Math.sin(endAngle) * innerRadius}`,
              `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${cx + Math.cos(startAngle) * innerRadius} ${cy + Math.sin(startAngle) * innerRadius}`,
              "Z"
            ].join(" ")
          : [
              `M ${cx} ${cy}`,
              `L ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
              "Z"
            ].join(" ");

        const midAngle = startAngle + slice / 2;
        const legendX = cx + Math.cos(midAngle) * (radius + 28);
        const legendY = cy + Math.sin(midAngle) * (radius + 28);
        const color = colors[index % colors.length];
        const percentage = percentages[index] ?? 0;
        startAngle = endAngle;

        return `
          <path d="${path}" fill="${color}" fill-opacity="0.92"></path>
          <text x="${legendX}" y="${legendY + 4}" fill="#f8fafc" font-size="12" font-weight="700" text-anchor="middle">${formatChartPercentValue(percentage, percentDecimals)}%</text>
        `;
      }).join("");

      const hole = innerRadius > 0
        ? `<circle cx="${cx}" cy="${cy}" r="${innerRadius - 4}" fill="#0f172a"></circle>`
        : "";

      return `${svgStart}<rect width="${width}" height="${height}" rx="24" fill="#0f172a"/>${segments}${hole}${svgEnd}`;
    }

    if (safeVariant === "scatter") {
      const points = records.map((record, index) => {
        const x = 58 + (index * (width - 116)) / Math.max(1, records.length - 1);
        const y = height - 48 - ((Math.max(0, record.value) / maxValue) * 200);
        return { x, y, label: record.label, value: record.value, color: colors[index % colors.length] };
      });
      const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
      return `${svgStart}
        <rect width="${width}" height="${height}" rx="24" fill="#0f172a"/>
        ${renderAxis()}
        <path d="${line}" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"></path>
        ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="7" fill="${point.color}" stroke="#e2e8f0" stroke-width="2"></circle>`).join("")}
        ${points.map((point) => `<text x="${point.x}" y="${height - 18}" fill="#94a3b8" font-size="12" text-anchor="middle">${escapeLabel(point.label)}</text>`).join("")}
      ${svgEnd}`;
    }

    if (safeVariant === "radar") {
      const cx = width / 2;
      const cy = 164;
      const radius = 110;
      const angleStep = (Math.PI * 2) / Math.max(1, records.length);
      const polygon = records.map((record, index) => {
        const angle = -Math.PI / 2 + (index * angleStep);
        const normalized = Math.max(0, record.value) / maxValue;
        const x = cx + Math.cos(angle) * radius * normalized;
        const y = cy + Math.sin(angle) * radius * normalized;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      }).join(" ") + " Z";
      const spokes = records.map((record, index) => {
        const angle = -Math.PI / 2 + (index * angleStep);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#334155" stroke-width="1.5"></line>
          <text x="${cx + Math.cos(angle) * (radius + 18)}" y="${cy + Math.sin(angle) * (radius + 18)}" fill="#cbd5e1" font-size="12" text-anchor="middle" dominant-baseline="middle">${escapeLabel(record.label)}</text>`;
      }).join("");
      return `${svgStart}
        <rect width="${width}" height="${height}" rx="24" fill="#0f172a"/>
        ${spokes}
        <path d="${polygon}" fill="rgba(56, 189, 248, 0.22)" stroke="#38bdf8" stroke-width="3"></path>
      ${svgEnd}`;
    }

    if (safeVariant === "heatmap") {
      const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(records.length))));
      const rows = Math.max(1, Math.ceil(records.length / cols));
      const cellW = 520 / cols;
      const cellH = 220 / rows;
      return `${svgStart}
        <rect width="${width}" height="${height}" rx="24" fill="#0f172a"/>
        ${records.map((record, index) => {
          const col = index % cols;
          const row = Math.floor(index / cols);
          const x = 60 + col * cellW;
          const y = 42 + row * cellH;
          const intensity = Math.max(0.15, Math.min(1, Math.max(0, record.value) / maxValue));
          const fill = `rgba(56, 189, 248, ${0.18 + intensity * 0.72})`;
          return `
            <rect x="${x}" y="${y}" width="${cellW - 10}" height="${cellH - 10}" rx="16" fill="${fill}" stroke="#334155" stroke-width="1.5"></rect>
            <text x="${x + 18}" y="${y + 26}" fill="#e2e8f0" font-size="13" font-weight="700">${escapeLabel(record.label)}</text>
            <text x="${x + 18}" y="${y + 50}" fill="#cbd5e1" font-size="18">${escapeHtml(formatDisplayValue(record.value))}</text>
          `;
        }).join("")}
      ${svgEnd}`;
    }

    const bars = records.map((record, index) => {
      const x = 70 + (index * (width - 120)) / Math.max(1, records.length);
      const barW = Math.max(18, Math.min(72, (width - 140) / Math.max(1, records.length) - 10));
      const barH = Math.max(12, (Math.max(0, record.value) / maxValue) * 178);
      const y = 236 - barH;
      const color = colors[index % colors.length];
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="14" fill="${color}"></rect>
        <text x="${x + barW / 2}" y="258" fill="#cbd5e1" font-size="12" text-anchor="middle">${escapeLabel(record.label)}</text>
        <text x="${x + barW / 2}" y="${y - 8}" fill="#f8fafc" font-size="12" text-anchor="middle">${escapeHtml(formatDisplayValue(record.value))}</text>
      `;
    }).join("");

    return `${svgStart}
      <rect width="${width}" height="${height}" rx="24" fill="#0f172a"/>
      ${renderAxis()}
      <line x1="52" y1="236" x2="${width - 44}" y2="236" stroke="#334155" stroke-width="2"></line>
      ${bars}
    ${svgEnd}`;
  }

  function renderChartBlock(block, rawValue) {
    const variant = toSafeString(block.dataset.nodelogicChartVariant || "bar").trim().toLowerCase();
    const title = toSafeString(block.dataset.nodelogicChartTitle || "Chart").trim() || "Chart";
    const emptyText = toSafeString(block.dataset.nodelogicChartEmptyText || "Chart data will appear here.").trim() || "Chart data will appear here.";
    const showScale = block.dataset.nodelogicChartShowScale !== "0";
    const showLegend = block.dataset.nodelogicChartShowLegend !== "0";
    const axisGap = Math.max(1, Number(block.dataset.nodelogicChartAxisGap || 10) || 10);
    const showGrid = block.dataset.nodelogicChartShowGrid !== "0";
    const showAxisArrow = block.dataset.nodelogicChartShowAxisArrow !== "0";
    const legendGap = Math.max(0, Number(block.dataset.nodelogicChartLegendGap || 12) || 12);
    const percentDecimals = Math.max(0, Math.min(4, Number(block.dataset.nodelogicChartPercentDecimals || 0) || 0));
    const records = collectChartRecords(rawValue, block);
    const canvas = block.querySelector("[data-nodelogic-chart-canvas]") || block;
    const legendMarkup = records.slice(0, 8).map((record, index) => `
      <div class="nodelogic-chart__legend-item">
        <span class="nodelogic-chart__legend-swatch" style="background:${["#38bdf8", "#22c55e", "#f59e0b", "#a78bfa", "#f97316", "#ef4444", "#14b8a6", "#60a5fa"][index % 8]}"></span>
        <span>${escapeHtml(record.label)}</span>
        <strong>${escapeHtml(formatDisplayValue(record.value))}</strong>
      </div>
    `).join("");

    canvas.innerHTML = `
      <div class="nodelogic-chart__header">
        <strong>${escapeHtml(title)}</strong>
      </div>
      <div class="nodelogic-chart__canvas-inner">
        ${records.length > 0 ? buildChartSvg(records, variant, axisGap, showScale, showGrid, showAxisArrow, legendGap, percentDecimals) : `<div class="nodelogic-chart__empty">${escapeHtml(emptyText)}</div>`}
      </div>
      ${showLegend ? `<div class="nodelogic-chart__legend" style="margin-top:${legendGap}px">${legendMarkup}</div>` : ''}
    `;
  }

  function normalizeCustomSharedVariable(item, index) {
    const rawPath = toSafeString(item?.path || "").trim();
    const fieldId = toSafeString(item?.fieldId || "").trim();
    const isLegacyPath = /^o\d+$/i.test(rawPath);
    const path = fieldId && (!rawPath || isLegacyPath)
      ? fieldId
      : (rawPath || fieldId || `o${index}`);
    return {
      id: toSafeString(item?.id || "").trim() || `shared-var-${index + 1}`,
      label: toSafeString(item?.label || "").trim() || path,
      path,
      type: toSafeString(item?.type || "number").trim().toLowerCase() || "number",
      sourceNodeId: toSafeString(item?.sourceNodeId || "").trim()
    };
  }

  function getStructuredNodeDataCandidates(data) {
    const candidates = [];
    const seen = new Set();
    const pushCandidate = (candidate) => {
      if (candidate === undefined || candidate === null) {
        return;
      }
      if (typeof candidate === "object" && candidate !== null) {
        if (seen.has(candidate)) {
          return;
        }
        seen.add(candidate);
      }
      candidates.push(candidate);
    };

    pushCandidate(data);

    if (data && typeof data === "object" && !Array.isArray(data)) {
      ["value", "data", "payload", "result", "results", "output", "outputs", "item", "items"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          pushCandidate(data[key]);
        }
      });
    }

    if (Array.isArray(data)) {
      data.forEach(pushCandidate);
    }

    return candidates;
  }

  function hasRenderableValue(candidate) {
    return candidate !== undefined
      && candidate !== null
      && !(typeof candidate === "string" && candidate.trim() === "");
  }

  function normalizeLookupKey(value) {
    return toSafeString(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function resolveCustomNodeFieldValue(data, node, shared, expectedType, fallbackIndex = 0) {
    const pathCandidates = [
      shared?.path,
      node.fieldId,
      node.label,
      shared?.label,
      shared?.id,
    ]
      .map((value) => toSafeString(value || "").trim())
      .filter(Boolean);

    const directKeyCandidates = [
      node.fieldId,
      node.label,
      shared?.id,
      shared?.label,
      normalizeLookupKey(node.fieldId),
      normalizeLookupKey(node.label),
      `out-${fallbackIndex}`,
      `o${fallbackIndex}`,
      `field-${fallbackIndex + 1}`,
      `output-${fallbackIndex + 1}`,
      `value`,
      `item-${fallbackIndex + 1}`,
    ]
      .map((value) => toSafeString(value || "").trim())
      .filter(Boolean);

    const candidates = getStructuredNodeDataCandidates(data);

    for (const candidate of candidates) {
      for (const path of pathCandidates) {
        const resolved = resolveValueByPathOrFallback(candidate, path, undefined, expectedType);
        if (hasRenderableValue(resolved)) {
          return resolved;
        }
      }

      if (candidate && typeof candidate === "object") {
        const objectValue = Object.prototype.hasOwnProperty.call(candidate, "value") ? candidate.value : undefined;
        if (hasRenderableValue(objectValue)) {
          return objectValue;
        }

        for (const key of directKeyCandidates) {
          if (Object.prototype.hasOwnProperty.call(candidate, key)) {
            const direct = candidate[key];
            if (hasRenderableValue(direct)) {
              return direct;
            }
          }
        }

        const entries = Object.entries(candidate);
        const positional = entries[fallbackIndex]?.[1];
        if (hasRenderableValue(positional)) {
          return positional;
        }
      } else if (Array.isArray(candidate)) {
        const positional = candidate[fallbackIndex];
        if (hasRenderableValue(positional)) {
          return positional;
        }
      }
    }

    return resolveValueByPathOrFallback(data, pathCandidates[0] || "", data?.[node.fieldId] ?? data?.[node.label] ?? "", expectedType);
  }

  function mergeSharedVariables(sourceVariables = [], derivedVariables = []) {
    const merged = [];
    const seen = new Set();
    [...sourceVariables, ...derivedVariables].forEach((item, index) => {
      if (!item || typeof item !== "object") {
        return;
      }
      const rawPath = toSafeString(item.path || "").trim();
      const fieldId = toSafeString(item.fieldId || "").trim();
      const path = rawPath || fieldId || `o${index}`;
      if (!path || seen.has(path)) {
        return;
      }
      seen.add(path);
      merged.push({
        id: toSafeString(item.id || "").trim() || `shared-var-${merged.length + 1}`,
        label: toSafeString(item.label || "").trim() || path,
        path,
        type: toSafeString(item.type || "number").trim().toLowerCase() || "number",
        sourceNodeId: toSafeString(item.sourceNodeId || "").trim()
      });
    });
    return merged;
  }

  function normalizeCustomNodeUiForArrayItem(raw) {
    const source = raw && typeof raw === "object" ? raw : parseJsonAttribute(raw, null);
    if (!source || typeof source !== "object") {
      return { enabled: true, displayMode: "item", nodes: [], sharedVariables: [] };
    }

    const hasUiShape = Array.isArray(source.nodes)
      || Array.isArray(source.layout)
      || Array.isArray(source.sharedVariables)
      || typeof source.displayMode === "string";
    if (!hasUiShape) {
      return { enabled: true, displayMode: "item", nodes: [], sharedVariables: [] };
    }

    const nodesSource = Array.isArray(source.nodes)
      ? source.nodes
      : Array.isArray(source.layout)
        ? source.layout
        : [];

    const nodes = nodesSource.map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const rawKind = toSafeString(item.kind || "").trim().toLowerCase();
      const kind = rawKind === "container" || rawKind === "image" ? rawKind : "field";
      return {
        id: toSafeString(item.id || "").trim() || `${kind}-${index + 1}`,
        kind,
        parentId: toSafeString(item.parentId || "").trim() || null,
        sortOrder: Number.isFinite(Number(item.sortOrder)) ? Number(item.sortOrder) : index,
        slot: Number.isFinite(Number(item.slot)) ? Math.max(0, Math.round(Number(item.slot))) : null,
        label: toSafeString(item.label || "").trim() || (kind === "container" ? "Container" : (kind === "image" ? "Image" : "Field")),
        fieldId: toSafeString(item.fieldId || "").trim(),
        fieldType: kind === "image" ? (toSafeString(item.fieldType || "").trim() || "string") : toSafeString(item.fieldType || "").trim(),
        imageUrl: toSafeString(item.imageUrl || "").trim(),
        imageAlt: toSafeString(item.imageAlt || "").trim(),
        rows: kind === "container" ? Math.max(1, Math.min(12, Number(item.rows) || 1)) : 1,
        columns: kind === "container" ? Math.max(1, Math.min(12, Number(item.columns) || 2)) : 1,
        customCss: toSafeString(item.customCss || "").trim(),
      };
    }).filter(Boolean).sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));

    const derivedSharedVariables = nodes
      .filter((node) => (node.kind === "field" || node.kind === "image") && toSafeString(node.fieldId || "").trim())
      .map((node, index) => ({
        id: toSafeString(node.fieldId || "").trim() || `shared-var-${index + 1}`,
        label: toSafeString(node.label || "").trim() || toSafeString(node.fieldId || "").trim() || `Shared ${index + 1}`,
        path: toSafeString(node.fieldId || "").trim() || `o${index}`,
        type: toSafeString(node.fieldType || "number").trim().toLowerCase() || "number",
        sourceNodeId: toSafeString(node.parentId || "").trim(),
      }));

    const sharedVariables = mergeSharedVariables(
      Array.isArray(source.sharedVariables) ? source.sharedVariables : [],
      derivedSharedVariables
    );

    return {
      enabled: source.enabled !== false,
      displayMode: toSafeString(source.displayMode || "item").trim() === "standalone" ? "standalone" : "item",
      nodes,
      sharedVariables,
    };
  }

  function renderCustomNodeLayout(nodes, sharedVariables, data, parentId = "") {
    const children = nodes
      .filter((node) => String(node.parentId ?? "") === String(parentId ?? ""))
      .sort((left, right) => {
        if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
          return (left.sortOrder || 0) - (right.sortOrder || 0);
        }
        return String(left.label || "").localeCompare(String(right.label || ""));
      });

    const renderNodeMarkup = (node, fallbackIndex = 0) => {
      if (node.kind === "container") {
        const rows = Math.max(1, Number(node.rows) || 1);
        const columns = Math.max(1, Number(node.columns) || 1);
        const totalSlots = Math.max(1, rows * columns);
        const customCss = toSafeString(node.customCss || "").trim();
        const styleAttr = customCss ? ` style="${escapeHtml(customCss)}"` : "";
        const childNodes = nodes
          .filter((child) => toSafeString(child.parentId || "").trim() === toSafeString(node.id || "").trim())
          .sort((left, right) => {
            if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
              return (left.sortOrder || 0) - (right.sortOrder || 0);
            }
            return toSafeString(left.label || "").localeCompare(toSafeString(right.label || ""));
          });
        const childrenBySlot = new Map();
        const fallbackChildren = [];
        childNodes.forEach((child) => {
          const slot = Number.isFinite(Number(child.slot)) ? Math.max(0, Math.round(Number(child.slot))) : null;
          if (slot !== null && slot < totalSlots && !childrenBySlot.has(slot)) {
            childrenBySlot.set(slot, child);
          } else {
            fallbackChildren.push(child);
          }
        });
        let nextSlot = 0;
        fallbackChildren.forEach((child) => {
          while (nextSlot < totalSlots && childrenBySlot.has(nextSlot)) {
            nextSlot += 1;
          }
          if (nextSlot < totalSlots) {
            childrenBySlot.set(nextSlot, child);
            nextSlot += 1;
          }
        });
        return `
          <div class="nodelogic-custom-element__container"${styleAttr}>
            <div class="nodelogic-custom-element__container-body" style="grid-template-columns: repeat(${columns}, minmax(0, 1fr)); grid-template-rows: repeat(${rows}, minmax(0, auto));">
              ${Array.from({ length: totalSlots }, (_, index) => {
                const child = childrenBySlot.get(index) || null;
                const row = Math.floor(index / columns) + 1;
                const column = (index % columns) + 1;
                if (!child) {
                  return '';
                }
                return `
                  <div class="nodelogic-custom-element__slot" style="grid-column:${column}; grid-row:${row};">
                    ${renderNodeMarkup(child, index)}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      const shared = sharedVariables.find((item) => {
        const nodeId = toSafeString(node.fieldId || "").trim();
        return item.id === nodeId || item.path === nodeId || item.label === nodeId;
      });
      if (node.kind === "image") {
        const imageCandidate = toSafeString(node.imageUrl || shared?.path || node.fieldId || node.label || "").trim();
        const isDirectImageSource = (value) => /^(https?:\/\/|data:image\/|blob:|\/\/)/i.test(toSafeString(value || "").trim())
          || /^\/(?!\/)/.test(toSafeString(value || "").trim())
          || /^[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(toSafeString(value || "").trim());
        const resolvedCandidate = resolveCustomNodeFieldValue(
          data,
          node,
          shared,
          "string",
          fallbackIndex
        );
        const nestedImageKeys = ["url", "src", "href", "imageUrl", "image", "value", "path", "thumbnail", "thumb"];
        const resolveNestedImage = (candidate) => {
          if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
            return "";
          }
          for (const key of nestedImageKeys) {
            const nested = candidate[key];
            const nestedValue = toSafeString(nested || "").trim();
            if (isDirectImageSource(nestedValue)) {
              return nestedValue;
            }
          }
          return "";
        };
        const findDirectImageSource = (candidate, visited = new Set()) => {
          if (!candidate) {
            return "";
          }
          if (typeof candidate === "string") {
            return isDirectImageSource(candidate) ? candidate : "";
          }
          if (typeof candidate !== "object" || visited.has(candidate)) {
            return "";
          }
          visited.add(candidate);
          if (Array.isArray(candidate)) {
            for (const entry of candidate) {
              const resolved = findDirectImageSource(entry, visited);
              if (resolved) {
                return resolved;
              }
            }
            return "";
          }
          for (const value of Object.values(candidate)) {
            const resolved = findDirectImageSource(value, visited);
            if (resolved) {
              return resolved;
            }
          }
          return "";
        };
        const resolvedImage = (isDirectImageSource(imageCandidate)
          ? imageCandidate
          : (isDirectImageSource(resolvedCandidate)
            ? toSafeString(resolvedCandidate).trim()
            : resolveNestedImage(resolvedCandidate)))
          || findDirectImageSource(resolvedCandidate)
          || findDirectImageSource(data);
        const imageAlt = toSafeString(node.imageAlt || node.label || "Image").trim() || "Image";
        const customCss = toSafeString(node.customCss || "").trim();
        const styleAttr = customCss ? ` style="${escapeHtml(customCss)}"` : "";
        if (!resolvedImage) {
          return `
            <div class="nodelogic-custom-element__image nodelogic-custom-element__image--empty"${styleAttr}>
              <div class="nodelogic-custom-element__empty">Image URL missing</div>
            </div>
          `;
        }
        return `
          <div class="nodelogic-custom-element__image"${styleAttr}>
            <img src="${escapeHtml(resolvedImage)}" alt="${escapeHtml(imageAlt)}" loading="lazy" />
          </div>
        `;
      }
      const path = toSafeString(shared?.path || node.fieldId || node.label || "").trim();
      const expectedType = toSafeString(node.fieldType || shared?.type || "string").trim() || "string";
      const value = resolveCustomNodeFieldValue(
        data,
        node,
        shared,
        expectedType === "number" ? "number" : "string",
        fallbackIndex
      );
      const customCss = toSafeString(node.customCss || "").trim();
      const styleAttr = customCss ? ` style="${escapeHtml(customCss)}"` : "";
      return `
        <div class="nodelogic-custom-element__field" data-field-id="${escapeHtml(node.fieldId || node.id)}"${styleAttr}>
          <div class="nodelogic-custom-element__field-value type-${escapeHtml(expectedType)}">${escapeHtml(formatDisplayValue(value))}</div>
        </div>
      `;
    };

    return children.map((node) => renderNodeMarkup(node)).join("");
  }

  function renderCustomElementBlock(block, rawValue) {
    const customNodeUi = parseJsonAttribute(block.dataset.nodelogicCustomNodeUi, { enabled: true, displayMode: "item", nodes: [], sharedVariables: [] });
    const title = toSafeString(
      block.dataset.nodelogicCustomElementTitle
      || block.dataset.nodelogicCustomNodeName
      || "Custom Element"
    ).trim() || "Custom Element";
    const showTitle = block.dataset.nodelogicCustomElementShowTitle !== "0";
    const displayTitle = showTitle && title && !/^custom element$/i.test(title) ? title : "";
    const emptyText = toSafeString(block.dataset.nodelogicCustomEmptyText || "Custom node output will appear here.").trim() || "Custom node output will appear here.";
    const normalizedUi = normalizeCustomNodeUiForArrayItem(customNodeUi);
    const nodes = Array.isArray(normalizedUi.nodes) ? normalizedUi.nodes : [];
    const sharedVariables = Array.isArray(normalizedUi.sharedVariables)
      ? normalizedUi.sharedVariables.map((item, index) => normalizeCustomSharedVariable(item, index)).filter(Boolean)
      : [];
    const isStandalone = toSafeString(normalizedUi.displayMode || "item").trim() === "standalone";
    const valueData = rawValue === undefined || rawValue === null || rawValue === ""
      ? parseJsonAttribute(block.dataset.nodelogicCustomSample, {})
      : rawValue;
    const itemList = Array.isArray(valueData) ? valueData : [valueData];
    const layoutData = isStandalone ? (itemList[0] ?? {}) : null;
    const body = itemList.length > 0
      ? (isStandalone
        ? `
            <div class="nodelogic-custom-element__layout">
              ${renderCustomNodeLayout(nodes, sharedVariables, layoutData, "") || `<div class="nodelogic-custom-element__empty">${escapeHtml(emptyText)}</div>`}
            </div>
          `
        : itemList.map((item, index) => `
            <section class="nodelogic-custom-element__item">
              <div class="nodelogic-custom-element__layout">
                ${renderCustomNodeLayout(nodes, sharedVariables, item, "") || `<div class="nodelogic-custom-element__empty">${escapeHtml(emptyText)}</div>`}
              </div>
            </section>
          `).join(""))
      : `<div class="nodelogic-custom-element__empty">${escapeHtml(emptyText)}</div>`;

    block.innerHTML = `
      <div class="nodelogic-custom-element__frame">
        ${displayTitle ? `<div class="nodelogic-custom-element__header"><strong>${escapeHtml(displayTitle)}</strong></div>` : ""}
        <div class="nodelogic-custom-element__body">
          ${body}
        </div>
      </div>
    `;
  }

  // =====================
  // CACHE DOM
  // =====================
  function cacheDOM() {
    DOM.containers = Array.from(ctxAll(".slider-container"));

    const controls = [];
    const seen = new Set();

    const pushControl = (input, container = input.closest(".slider-container") || null) => {
      if (!input || seen.has(input)) return;
      const controlId = input.id || input.name;
      if (!controlId) return;
      seen.add(input);

      controls.push({
        container,
        input,
        id: controlId,
        formula: (input.dataset.formula || "").trim()
      });
    };

    DOM.containers.forEach(container => {
      Array.from(container.querySelectorAll("input, select")).forEach(input => {
        pushControl(input, container);
      });
    });

    Array.from(document.querySelectorAll("input[data-formula]")).forEach(input => {
      pushControl(input);
    });

    DOM.controls = controls;
    DOM.controlById = new Map(controls.map(item => [item.id, item]));

    DOM.groups = Array.from(ctxAll(".btn_container")).map(group => ({
      el: group,
      id: group.id || group.dataset.id,
      buttons: Array.from(group.querySelectorAll(".btn_toggle"))
    }));

    DOM.formulaBlocks = Array.from(ctxAll(".formula-block"));
    DOM.tables = Array.from(ctxAll(".slider-table-block"));
    DOM.logicBlocks = Array.from(ctxAll("[data-nodelogic-logic]"));
  }

  function collectFormulaControls() {
    return DOM.controls
      .filter(({ formula }) => isFormulaString(formula))
      .map(({ id, formula }) => ({ id, formula }));
  }

  function getAllDynamicValues() {
    const values = {};

    DOM.controls.forEach(({ input, id }) => {
      values[id] = readControlValue(input);
    });

    DOM.groups.forEach(({ id, buttons }) => {
      const selected = buttons.find(b => b.classList.contains("active"));
      const multiplier = selected ? Number(selected.dataset.multiplier || 1) : 1;
      values[id] = multiplier;
    });

    return values;
  }

  // A logic block's formula reads event state (__nodeEvent, __nodeTimerEvent,
  // ...) by CALLING those functions during evaluation, not through
  // getAllDynamicValues()/`values` -- so a firing event never, by itself,
  // changes `values`. applyLogicBlocks' formulaEvaluationCache is keyed off
  // `values`, so without this signature a repeated event that doesn't also
  // happen to coincide with some unrelated control changing would key to the
  // SAME cache entry every time: the formula would only ever be evaluated
  // once (for whichever recalculation first produced that key) and every
  // later occurrence of the event would silently reuse that stale, frozen
  // result forever. Folding every event's triggeredCount into the cache key
  // makes a genuinely new event occurrence always force a fresh evaluation.
  function getEventStoreSignature() {
    const store = window.eventStore;
    if (!store) return "";
    const parts = [];
    for (const key in store) {
      if (!Object.prototype.hasOwnProperty.call(store, key)) continue;
      const entry = store[key];
      // Skips the boolean `${key}_listener` registration markers alongside
      // the real {triggeredCount} entries -- only the latter match this shape.
      if (entry && typeof entry === "object" && typeof entry.triggeredCount === "number") {
        parts.push(`${key}:${entry.triggeredCount}`);
      }
    }
    parts.sort();
    return parts.join(",");
  }

  // =====================
  // SLIDER UI
  // =====================
  function updateSliderUI(container) {
    if (!container) return;

    const slider = container.querySelector(".slider, .slider-number");
    if (!slider || slider.type === "number") return;

    const progress = container.querySelector(".slider-progress");
    const thumb = container.querySelector(".slider-thumb-value");
    const track = container.querySelector(".slider-track");

    const value = Number(slider.value || 0);
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);

    const ratio = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;

    if (progress) progress.style.width = `${clamp(ratio * 100, 0, 100)}%`;

    if (thumb && track) {
      const sliderWidth = track.offsetWidth;
      const thumbWidth = 40;

      const pos = track.offsetLeft + clamp(
        ratio * sliderWidth,
        thumbWidth / 2,
        sliderWidth - (thumbWidth / 2)
      );

      thumb.textContent = String(value);
      thumb.style.left = `${pos}px`;
      thumb.style.top = `${track.offsetTop + (track.offsetHeight / 2)}px`;
      if (progress) {
        const formulaBackground = progress.dataset.formulaBackground || "";
        if (formulaBackground) {
          progress.style.background = formulaBackground;
          progress.style.backgroundRepeat = "no-repeat";
          if (parseGradientColorStops(formulaBackground)) {
            progress.style.backgroundSize = `${Math.max(track.offsetWidth, 1)}px 100%`;
            progress.style.backgroundPosition = "left top";
          } else {
            progress.style.backgroundSize = "100% 100%";
            progress.style.backgroundPosition = "left top";
          }
        } else {
          progress.style.backgroundRepeat = "";
          progress.style.backgroundSize = "";
          progress.style.backgroundPosition = "";
        }
      }

      if (thumb) {
        const formulaBackground = progress?.dataset?.formulaBackground || "";
        if (formulaBackground) {
          const sampled = sampleGradientColor(formulaBackground, ratio);
          thumb.style.background = sampled || formulaBackground;
        } else if (thumb.dataset.baseBackground !== undefined) {
          thumb.style.background = thumb.dataset.baseBackground || "";
        }
      }
    }
  }

  // =====================
  // FORMULAS
  // =====================
  function updateFormulaBlock(block, values) {
    const raw = block.dataset.formula || "";
    const unit = block.dataset.resultUnit || "";

    const varsText = buildVariablesDescription(raw);
    setBlockText(block, ".formula-variables", varsText);

    const previewFormula = buildCalculationPreview(raw, values);
    const formulaControls = collectFormulaControls();

    const previewLatex = toLatex(previewFormula || raw);

    const modifiersLatex = formulaControls.map(f => {
      return `${f.id}:\\quad ${toLatex(f.formula)}`;
    });

    const fullLatex = [
      `\\text{Formula: } ${previewLatex}`,
      ...modifiersLatex
    ].join(" \\\\ ");

    setBlockHTML(block, ".formula-preview", `$$ ${previewLatex} $$`);
    setBlockHTML(block, ".formula-calc", `$$ ${fullLatex} $$`);

    //const prepared = prepareFormulaForEval(raw, values);
    const evaluation = evaluateFormulaExpression(raw, values);

    const payload = evaluation.valid ? normalizeFormulaPayload(evaluation.value) : normalizeFormulaPayload(0);
    const result = payload.value;
    const isNumericResult = typeof result === "number" && Number.isFinite(result);
    const resultText = isNumericResult
      ? formatNumeric(result, 2)
      : typeof result === "boolean"
        ? (result ? "true" : "false")
        : (result === null || result === undefined)
          ? "0"
          : String(result);

    block.dataset.generatedFormula = evaluation.prepared || "";

    setBlockText(
      block,
      ".formula-result",
      unit && isNumericResult ? `${resultText} ${unit}` : resultText
    );

    const resultEl = block.querySelector(".formula-result");
    if (resultEl) {
      const colorText = payload.color !== undefined ? toSafeString(payload.color).trim() : "";
      const backgroundText = payload.background !== undefined ? toSafeString(payload.background).trim() : "";
      resultEl.style.color = colorText || "";
      resultEl.style.background = backgroundText || "";
      resultEl.style.padding = backgroundText ? "2px 6px" : "";
      resultEl.style.borderRadius = backgroundText ? "4px" : "";
      resultEl.style.display = backgroundText ? "inline-block" : "";
    }

    if (window.MathJax) {
      try {
        MathJax.typesetPromise([block]);
      } catch (e) {
        // no-op
      }
    }
  }

  function calculateFormulas() {
    const values = getAllDynamicValues();
    DOM.formulaBlocks.forEach(block => {
      updateFormulaBlock(block, values);
    });
  }

  function syncFormulaControls() {
    const formulaControls = DOM.controls.filter(({ formula }) => isFormulaString(formula));
    const maxPasses = Math.max(2, formulaControls.length + 2);

    for (let pass = 0; pass < maxPasses; pass++) {
      const values = getAllDynamicValues();
      let changed = false;

      for (const { input, formula } of formulaControls) {
        const evaluation = evaluateFormulaExpression(formula, values);

        if (!evaluation.valid) {
          setFormulaLock(input, false);
          applyFormulaPresentation(input, normalizeFormulaPayload(undefined), false);
          continue;
        }

        setFormulaLock(input, true);
        const payload = normalizeFormulaPayload(evaluation.value);
        applyFormulaPresentation(input, payload, false);
        const resolvedValue = payload.value;

        const nextValue =
          typeof resolvedValue === "number" && Number.isFinite(resolvedValue)
            ? formatValueForInput(input, resolvedValue, evaluation.useGrosze)
            : resolvedValue === null || resolvedValue === undefined
              ? ""
              : String(resolvedValue);

        const didChange = setControlValue(input, nextValue);

        if (didChange) {
          changed = true;
        }

        values[input.id] = readControlValue(input);
      }

      if (!changed) break;
    }
  }

  // =====================
  // TABLES
  // =====================
  function parseRows(tableEl) {
    try {
      const parsed = JSON.parse(tableEl.dataset.rowConfig || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function parseIds(value) {
    return (value || "")
      .split(",")
      .map(v => v.trim())
      .filter(Boolean);
  }

  function getGroupMultiplier(groupIds, groups) {
    return parseIds(groupIds).reduce((acc, id) => {
      const g = groups[id];
      if (!g || !g.selected) return acc;
      const m = Number(g.selected.dataset.multiplier || 1);
      return acc * (Number.isFinite(m) ? m : 1);
    }, 1);
  }

  function calculateTables() {
    const groups = {};

    DOM.groups.forEach(({ id, buttons }) => {
      const selected = buttons.find(b => b.classList.contains("active")) || null;
      groups[id] = { selected, buttons };
    });

    DOM.containers.forEach(updateSliderUI);

    DOM.tables.forEach(tableEl => {
      const rows = parseRows(tableEl);

      // Table headers
      const colLabel = tableEl.dataset.colLabel || "Item";
      const colRate = tableEl.dataset.colMultiplier || "Rate";
      const colCount = tableEl.dataset.colCount || "Quantity";
      const colPrice = tableEl.dataset.colPrice || "Price";
      const title = tableEl.dataset.title || "";

      let totalInt = 0;

      // =====================
      // THEAD
      // =====================
      const thead = document.createElement("thead");
      const trHead = document.createElement("tr");

      [colLabel, colRate, colCount, colPrice].forEach(text => {
        const th = document.createElement("th");
        th.textContent = text;
        trHead.appendChild(th);
      });

      thead.appendChild(trHead);

      // =====================
      // TBODY
      // =====================
      const tbody = document.createElement("tbody");

      rows.forEach(row => {
        const control = DOM.controlById.get(row.sliderId) || null;
        const value = control ? readControlValue(control.input) : 0;

        const baseMultiplier = control
          ? Number(control.input.dataset.multiplier || control.container?.dataset.multiplier || 1)
          : 1;

        const rowMultiplier = Number(row.multiplier || baseMultiplier);
        const groupMultiplier = getGroupMultiplier(row.buttonGroupIds || "", groups);

        const rateInt = Math.round(rowMultiplier * groupMultiplier * 100);
        const priceInt = Math.round(rateInt * value);

        totalInt += priceInt;

        const tr = document.createElement("tr");

        [
          row.label || row.sliderId,
          `${(rateInt / 100).toFixed(2)} PLN`,
          `${value}${row.unit ? " " + row.unit : ""}`,
          `${(priceInt / 100).toFixed(2)} PLN`
        ].forEach(text => {
          const td = document.createElement("td");
          td.textContent = text;
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });

      // =====================
      // TABLE
      // =====================
      let table = tableEl.querySelector("table");
      if (!table) {
        table = document.createElement("table");
        tableEl.appendChild(table);
      }

      while (table.firstChild) {
        table.removeChild(table.firstChild);
      }

      // Optional title
      if (title) {
        const caption = document.createElement("caption");
        caption.textContent = title;
        table.appendChild(caption);
      }

      table.appendChild(thead);
      table.appendChild(tbody);

      // =====================
      // SUMA
      // =====================
      let sum = tableEl.querySelector(".slider-calc-sum");
      if (!sum) {
        sum = document.createElement("div");
        sum.className = "slider-calc-sum";
        tableEl.appendChild(sum);
      }

      sum.textContent = `Total: ${(totalInt / 100).toFixed(2)} PLN`;
    });
  }

  function applyLogicBlocks() {
    if (!DOM.logicBlocks.length) return;
    const values = getAllDynamicValues();
    // Computed once per pass (matches `values` above): every logic block's
    // cache key folds this in, so any event firing anywhere forces a fresh
    // evaluation for every block that could be affected by it.
    const eventStoreSignature = getEventStoreSignature();
    const activeActionTargets = new Set();

    DOM.logicBlocks.forEach((block, blockIndex) => {
      const formula = (block.dataset.formula || "").trim();
      if (!formula) return;

      // An Output entry's bookkeeping key (entryKey, below) is derived ONLY
      // from that Output NODE's own graph id -- unique within the graph that
      // produced it, but NOT guaranteed unique across separate logic blocks
      // (two widgets built from the same template/duplicated widget keep the
      // same internal node ids). window.nodelogicActionBindings is one GLOBAL,
      // page-wide registry, so two different blocks' Output nodes sharing an
      // entryKey would share one bindingState -- each block's own retarget
      // check ("did THIS node's target change") then misfires on the OTHER
      // block's differing target, tearing its listener down and rebuilding
      // it every single pass. Whichever block is processed last every pass
      // permanently keeps the only working listener -- exactly the
      // "newest Event steals the older one's target" symptom.
      //
      // data-editor-id ALONE is not a safe disambiguator either: it is a
      // value the editor persists into the widget's own saved settings
      // (see assets/elementor/elementor-logic.js's getGraphData -- generated
      // once from the widget's container id, then written back with
      // settings.set so it survives across saves), and a native "Duplicate"
      // of that widget (Elementor duplicate, a saved template inserted
      // twice, a global/synced widget, ...) clones the ENTIRE settings
      // object verbatim -- including that already-persisted editor_id. Two
      // widgets produced that way share the exact same data-editor-id (and,
      // since the graph itself was cloned too, the same internal node ids),
      // silently recreating this exact collision even with the entryKey
      // prefix below. blockIndex -- this block's own fixed position among
      // DOM.logicBlocks for the current page load -- is unaffected by any of
      // that: it is always distinct for two different rendered blocks on one
      // page, no matter what their data-editor-id says. Always fold it in
      // (not merely as a fallback for a missing editor id) so a duplicated
      // widget's stale/shared editor_id can never collapse two blocks back
      // into one binding scope.
      const blockScope = `${String(block.dataset.editorId || "").trim() || "noid"}#${blockIndex}`;

      // Reset active event flow for this logic block
      window.activeEventFlow = false;

      // Parse output configs
      let outputConfigs = {};
      try {
        const configsRaw = block.dataset.outputConfigs || "{}";
        outputConfigs = JSON.parse(configsRaw);
      } catch (e) {
        // Ignore parse errors
      }

      // Reuse unchanged static/dynamic inputs while still applying the cached output payload.
      let valuesSignature = "";
      try {
        valuesSignature = JSON.stringify(values, (key, value) => {
          if (key === "element") return undefined;
          if (value && typeof value === "object" && value.eventKey) {
            return { eventKey: value.eventKey, triggeredCount: value.triggeredCount || 0 };
          }
          if (value && typeof value === "object" && value.nodeType) return undefined;
          return value;
        });
      } catch {
        valuesSignature = "";
      }
      // blockScope is folded into the cache key too: a formula that reads
      // block-scoped memory (__nodeMemoryGet/Set with the default 'widget'
      // scope) produces a DIFFERENT result per logic block even when the
      // formula string, dynamic values, and event signature are otherwise
      // identical (two duplicated widgets). Without this, one block's fresh
      // evaluation would be cached and silently replayed for the other.
      const evaluationKey = `${formula}\u0000${valuesSignature}\u0000${eventStoreSignature}\u0000${blockScope}`;
      let evaluation = formulaEvaluationCache.get(evaluationKey);
      // A cache HIT reuses an evaluation computed for a PRIOR pass (including,
      // e.g., a __nodeEventProcessor-gated "true" from whichever pass first
      // saw a given event occurrence). Replaying that stale, already-applied
      // action plan on every later pass that happens to hash to the same key
      // would re-fire one-shot actions (toggleClass, notify, ...) for nothing
      // -- so only actions computed by a genuinely FRESH evaluation this pass
      // are (re-)applied below; see isFreshEvaluation.
      const isFreshEvaluation = !evaluation;
      if (!evaluation) {
        const usesDomInstances = formula.indexOf("__nodeRawHtml") !== -1 || formula.indexOf("__nodeCloneElement") !== -1;
        if (usesDomInstances) nlBeginDomPass(blockScope);
        const prevEvaluatingScope = nlEvaluatingBlockScope;
        nlEvaluatingBlockScope = blockScope;
        try {
          evaluation = evaluateFormulaExpression(formula, values, {
            __nodeBlockScope: blockScope,
            __nodeEditorId: String(block.dataset.editorId || ""),
            __nodePostId: String(block.dataset.postId || ""),
          });
        } finally {
          nlEvaluatingBlockScope = prevEvaluatingScope;
        }
        if (usesDomInstances && evaluation.valid) nlSweepDomInstances(blockScope);
        // An Output "Element" pin resolves to a live DOM node inside the result
        // (raw.__element). That node can be replaced between recalculations, so
        // its evaluation must NOT be cached — a stale entry would hand a
        // detached node to the value / action path. Everything else caches as
        // before.
        const entryHoldsElement = (v) =>
          v && typeof v === "object" && v.__element && v.__element.nodeType === 1;
        const holdsLiveElement =
          evaluation.valid &&
          evaluation.value &&
          typeof evaluation.value === "object" &&
          Object.keys(evaluation.value).some((k) => {
            const v = evaluation.value[k];
            if (entryHoldsElement(v)) return true;
            // For Each output: an array of per-item payload objects.
            return Array.isArray(v) && v.some(entryHoldsElement);
          });
        // Get Element Property (__nodeGetElementProp) reads a live, mutable
        // DOM property -- one a PRIOR pass of this very formula (Set Element
        // Property / an Output "value" write) can have just changed. Caching
        // this evaluation would freeze every future pass on whatever that
        // property read on the FIRST call, forever, because the cache key
        // (formula + tracked-control/event state) has no way to reflect an
        // arbitrary element's mutated property. A formula that calls it is
        // therefore never persisted, exactly like the live-element case
        // above -- it is always re-evaluated, so each execution reads the
        // current DOM, while unrelated cacheable formulas are unaffected.
        // Detected once per formula text; this has no effect within a single
        // pass, where evaluateFormulaExpression is called exactly once.
        const readsLiveElementProperty = formula.indexOf("__nodeGetElementProp") !== -1;
        // Same staleness hazard as __nodeGetElementProp above, for a
        // different reason: __nodeApiRequest / __nodeApiStatus resolve
        // ASYNCHRONOUSLY. The pass that first evaluates this formula sees
        // "no value yet" (null / loading) and scheduleRecalculation() fires
        // once the response lands -- but the cache key (formula + tracked
        // state) doesn't change between those two passes, so caching the
        // FIRST (pending) evaluation would permanently freeze the node on
        // "loading", the response's own arrival notwithstanding.
        const readsAsyncApi = formula.indexOf("__nodeApiRequest") !== -1 || formula.indexOf("__nodeApiStatus") !== -1;
        // Same staleness hazard as the async-API case above: __nodeFormData's
        // resume value can flip from "nothing pending" to real captured data
        // (or, once fetched from the server fallback, from "id known, values
        // empty" to fully populated) between two passes with an otherwise
        // identical cache key -- and __nodeSendEmail's returned status object
        // changes from "sending" to "sent/failed" the same way. Never cached,
        // exactly like __nodeGetElementProp / the async API nodes.
        const readsFormOrEmail = formula.indexOf("__nodeFormData") !== -1 || formula.indexOf("__nodeSendEmail") !== -1;
        // DB Select resolves asynchronously and DB writes return a changing
        // status object -- same staleness hazard as the async API nodes.
        const readsDatabase = formula.indexOf("__nodeDbSelect") !== -1 || formula.indexOf("__nodeDbWrite") !== -1;
        // Fallback Event depends on the clock (its hold window), not only on
        // the cache key's inputs.
        const readsClock = formula.indexOf("__nodeFallbackEvent") !== -1;
        // DOM nodes create / move / query live elements: never cached.
        const touchesDom = formula.indexOf("__nodeRawHtml") !== -1
          || formula.indexOf("__nodeSetParent") !== -1
          || formula.indexOf("__nodeCloneElement") !== -1
          || formula.indexOf("__nodeElementsByClass") !== -1;
        if (evaluation.valid && !holdsLiveElement && !readsLiveElementProperty && !readsAsyncApi && !readsFormOrEmail && !readsDatabase && !readsClock && !touchesDom) {
          if (formulaEvaluationCache.size > 100) {
            formulaEvaluationCache.delete(formulaEvaluationCache.keys().next().value);
          }
          formulaEvaluationCache.set(evaluationKey, evaluation);
        }
      }
      if (!evaluation.valid || !evaluation.value || typeof evaluation.value !== "object") return;

      const map = evaluation.value;
      // An Output node driven by a For Each loop yields an ARRAY of per-item
      // payload objects under one key (from __nodeArrayMapGraph). Flatten it to
      // one synthetic key per item so every iteration is applied independently;
      // action-binding keys stay unique so iterations can't clobber each other.
      const outputEntries = [];
      Object.keys(map).forEach(key => {
        const value = map[key];
        if (Array.isArray(value)) {
          value.forEach((item, itemIndex) => {
            if (item && typeof item === "object") {
              outputEntries.push([`${key}#${itemIndex}`, item]);
            }
          });
        } else {
          outputEntries.push([key, value]);
        }
      });
      outputEntries.forEach(([entryKey, raw]) => {
        if (!raw || typeof raw !== "object") return;
        // Side-effect root (Send Email / DB write): evaluating the formula
        // already ran it; there is no DOM target to apply anything to.
        if (raw.__nlSideEffect === true) return;

        // The Output node's "Element" input pin, when connected, provides the
        // target as a live element instance (raw.__element) instead of an id.
        const elementInstance =
          raw.__element && typeof raw.__element === "object" && raw.__element.nodeType === 1
            ? raw.__element
            : null;

        // entryKey is unique PER OUTPUT NODE (never the target id/element
        // identity — two different Output nodes can target the same element).
        // The actual DOM target id to look up lives inside the payload
        // (__targetId), falling back to entryKey for formulas compiled before
        // that field existed, where entryKey WAS the literal target id.
        const targetId = typeof raw.__targetId === "string" && raw.__targetId ? raw.__targetId : entryKey;

        // Check if this output should execute on first load
        const config = outputConfigs[targetId] || {};
        const executeOnLoad = elementInstance
          ? (raw.__executeOnLoad !== false)
          : (config.executeOnLoad !== false); // Default true
        if (isFirstExecution && !executeOnLoad) {
          return; // Skip this output on first execution
        }

        // Find target element
        let target = elementInstance
          || document.getElementById(targetId)
          || document.querySelector(`[data-nodelogic-id="${CSS.escape(targetId)}"]`)
          || document.querySelector(`[data-nodelogic-chart-id="${CSS.escape(targetId)}"]`)
          || document.querySelector(`[data-nodelogic-custom-element-id="${CSS.escape(targetId)}"]`)
          || document.querySelector(`[data-slider-id="${CSS.escape(targetId)}"]`);
        if (!target) return;

        // Resolve actual input if we got a container div
        let inputEl = target;
        if (target.classList.contains("slider-container") || (target.tagName === "DIV" && !target.matches("input, select, textarea, span"))) {
          const inner = target.querySelector("input, select, textarea");
          if (inner) inputEl = inner;
        }

        const payload = normalizeFormulaPayload(raw);
        // An element as the VALUE (e.g. from Raw HTML / Clone Element) is
        // mounted inside the target, replacing its content -- only when it
        // isn't already the target's sole content (idempotent), never into
        // itself / its own descendant, never into a NodeLogic block.
        const valueIsElement = nlIsElement(payload.value);
        if (valueIsElement) {
          const mounted = payload.value;
          const host = inputEl.matches("input, select, textarea, img") ? target : inputEl;
          const blocked = mounted === host || mounted.contains(host) || nlIsDocumentLevelElement(mounted)
            || !nlCanReceiveChildren(host)
            || host.matches("[data-nodelogic-chart='1'], .nodelogic-chart, [data-nodelogic-custom-element='1'], .nodelogic-custom-element, [data-nodelogic-array-list='1'], .nodelogic-array-list");
          if (!blocked && !(host.childNodes.length === 1 && host.firstChild === mounted)) {
            host.replaceChildren(mounted);
            nlStructuralChange = true;
          }
        }
        // The Element-pin payload carries meta keys (__element/__executeOnLoad),
        // so its "raw" object is never a structured chart/zip payload — use the
        // extracted value. (Structured targets are NodeLogic blocks addressed by id.)
        const structuredValue = (!elementInstance && shouldPreserveStructuredPayload(raw)) ? raw : payload.value;
        const arrayListRoot = target.matches("[data-nodelogic-array-list='1'], .nodelogic-array-list");
        const imageEl = target.matches("img") ? target : target.querySelector("img");
        const chartRoot = target.matches("[data-nodelogic-chart='1'], .nodelogic-chart");
        const customElementRoot = target.matches("[data-nodelogic-custom-element='1'], .nodelogic-custom-element");

        if (chartRoot) {
          renderChartBlock(target, structuredValue);
          return;
        }

        if (customElementRoot) {
          renderCustomElementBlock(target, structuredValue);
          return;
        }

        if (arrayListRoot) {
          const itemsHost = target.querySelector("[data-nodelogic-array-list-items]") || target;
          const emptyState = target.querySelector("[data-nodelogic-array-list-empty]");
          const rows = Math.max(1, Number(target.dataset.nodelogicRows || 1));
          const columns = Math.max(1, Number(target.dataset.nodelogicColumns || 1));
          const listHeight = Math.max(0, Number(target.dataset.nodelogicListHeight || 0) || 0);
          const normalizedItems = Array.isArray(structuredValue)
            ? structuredValue
            : (structuredValue === undefined || structuredValue === null || structuredValue === "")
              ? []
              : [structuredValue];
          const visibleItems = normalizedItems.slice(0, rows * columns);
          const overflow = Math.max(normalizedItems.length - visibleItems.length, 0);
          if (emptyState) {
            emptyState.style.display = normalizedItems.length > 0 ? "none" : "";
          }
          itemsHost.style.display = "grid";
          itemsHost.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
          itemsHost.style.gap = "8px";
          itemsHost.style.overflow = "auto";
          if (listHeight > 0) {
            itemsHost.style.height = `${listHeight}px`;
            itemsHost.style.maxHeight = `${listHeight}px`;
          } else {
            itemsHost.style.height = "";
            itemsHost.style.maxHeight = `calc(${rows} * 2.4rem + ${(rows - 1) * 8}px)`;
          }
          const arrayListMetaKeys = new Set([
            "customNodeUi",
            "customNodeUI",
            "customElementUi",
            "customElementUI",
            "ui",
            "layout",
            "layoutUi",
            "sharedVariables",
            "customSharedVariables",
            "nodes",
            "displayMode",
            "enabled",
          ]);
          const normalizeFieldLabel = (label) => {
            const text = toSafeString(label || "").trim();
            if (!text) return "Value";
            return text
              .replace(/[_-]+/g, " ")
              .replace(/\s+/g, " ")
              .replace(/^./, (m) => m.toUpperCase());
          };
          const renderArrayListField = (label, value) => `
            <div class="nodelogic-custom-element__field" data-field-label="${escapeHtml(normalizeFieldLabel(label))}">
              <div class="nodelogic-custom-element__field-value">${escapeHtml(formatDisplayValue(value))}</div>
            </div>
          `;
          const renderArrayListPrimitive = (value) => `
            <section class="nodelogic-array-list__item nodelogic-custom-element__item nodelogic-array-list__item--primitive">
              <div class="nodelogic-array-list__primitive-value">${escapeHtml(formatDisplayValue(value))}</div>
            </section>
          `;
          const pickArrayListPrimitiveValue = (item) => {
            if (item === null || item === undefined || item === "") {
              return "";
            }
            if (typeof item !== "object" || Array.isArray(item)) {
              return item;
            }

            const preferredKeys = ["value", "text", "title", "name", "label", "url", "src"];
            for (const key of preferredKeys) {
              if (Object.prototype.hasOwnProperty.call(item, key)) {
                const candidate = item[key];
                if (candidate !== undefined && candidate !== null && candidate !== "") {
                  return candidate;
                }
              }
            }

            const values = Object.values(item).filter((value) => value !== undefined && value !== null && value !== "");
            if (values.length > 0) {
              return values[0];
            }
            return "";
          };
          const findArrayListCustomUi = (item) => {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            const candidates = [
              item.customNodeUi,
              item.customNodeUI,
              item.customElementUi,
              item.customElementUI,
              item.ui,
              item.layout,
              item.layoutUi,
              item.data?.customNodeUi,
              item.data?.customNodeUI,
              item.data?.customElementUi,
              item.data?.customElementUI,
              item.data?.ui,
              item.data?.layout,
            ];
            for (const candidate of candidates) {
              const normalized = normalizeCustomNodeUiForArrayItem(candidate);
              if (normalized && normalized.enabled && Array.isArray(normalized.nodes) && normalized.nodes.length > 0) {
                return normalized;
              }
            }
            return null;
          };
          const renderArrayListObjectItem = (item) => {
            const customUi = findArrayListCustomUi(item);
            if (customUi) {
              const itemData = item && typeof item === "object" && item.data && typeof item.data === "object" ? item.data : item;
              const rendered = renderCustomNodeLayout(customUi.nodes, customUi.sharedVariables, itemData, "") || `<div class="nodelogic-custom-element__empty">${escapeHtml("Custom node output will appear here.")}</div>`;
              return `
                <section class="nodelogic-array-list__item nodelogic-custom-element__item nodelogic-array-list__item--custom">
                  <div class="nodelogic-custom-element__layout">
                    ${rendered}
                  </div>
                </section>
              `;
            }
            const primitiveValue = pickArrayListPrimitiveValue(item);
            return renderArrayListPrimitive(primitiveValue);
          };
          const renderArrayListItem = (item) => {
            if (item && typeof item === "object" && !Array.isArray(item)) {
              return renderArrayListObjectItem(item);
            }

            return renderArrayListPrimitive(item);
          };
          itemsHost.innerHTML = visibleItems
            .map((item, index) => renderArrayListItem(item, index))
            .join("")
            + (overflow > 0 ? `<div class="nodelogic-array-list__item nodelogic-array-list__item--overflow">+${overflow} more</div>` : "");
        }

        if (imageEl && structuredValue !== undefined && !valueIsElement) {
          const resolvedImage = Array.isArray(structuredValue)
            ? JSON.stringify(structuredValue)
            : (structuredValue === null || structuredValue === undefined ? "" : String(structuredValue));
          imageEl.src = resolvedImage;
          imageEl.dataset.nodelogicImageSrc = resolvedImage;
        }

        const isLabelEl = !inputEl.matches("input, select, textarea") && !arrayListRoot && !imageEl;

        // --- value ---
        if (payload.value !== undefined && !arrayListRoot && !imageEl && !valueIsElement) {
          const resolvedValue = payload.value;
          const nextValue = Array.isArray(resolvedValue)
            ? JSON.stringify(resolvedValue)
            : (resolvedValue === null || resolvedValue === undefined ? "" : String(resolvedValue));
          if (isLabelEl) {
            if (inputEl.textContent !== nextValue) inputEl.textContent = nextValue;
            // Track our own write so a LATER recalculation's
            // __nodeGetElementProp(el, "textContent") read of this same
            // element doesn't corrupt its result by reading back this
            // formula's own prior output instead of the element's real
            // content (see nlApplySelfWriteBaseline above).
            nlRecordSelfWrite(inputEl, "textContent", nextValue);
          } else {
            const formatted = typeof resolvedValue === "number" && Number.isFinite(resolvedValue)
              ? (inputEl.type === "range" || inputEl.type === "number" ? formatValueForInput(inputEl, resolvedValue) : nextValue)
              : nextValue;
            setControlValue(inputEl, formatted);
            nlRecordSelfWrite(inputEl, "value", inputEl.value);
          }
        }

        // --- background ---
        if (payload.background !== undefined) {
          const bg = toSafeString(payload.background).trim();
          if (isLabelEl) { target.style.background = bg; }
          else { applyFormulaPresentation(inputEl, { value: undefined, background: bg, color: undefined, disabled: undefined }, false); }
        }

        // --- color (text color) ---
        if (payload.color !== undefined) {
          const rawColor = toSafeString(payload.color).trim();
          const colorDecl = rawColor.match(/^color\s*:\s*(.+)$/i);
          const cl = colorDecl ? String(colorDecl[1] || "").replace(/;+\s*$/, "").trim() : rawColor;
          if (isLabelEl) { target.style.color = cl; }
          else { applyFormulaPresentation(inputEl, { value: undefined, background: undefined, color: cl, disabled: undefined }, false); }
        }

        // --- disabled ---
        if (payload.disabled !== undefined) {
          applyFormulaPresentation(inputEl, { value: undefined, background: undefined, color: undefined, disabled: payload.disabled }, false);
        }

        // --- extended CSS properties ---
        const applyStyle = (prop, val) => {
          const v = toSafeString(val).trim();
          target.style[prop] = v;
          if (inputEl !== target) inputEl.style[prop] = v;
        };

        if (raw["font-size"] !== undefined) {
          const v = toSafeString(raw["font-size"]).trim();
          applyStyle("fontSize", /^\d+(\.\d+)?$/.test(v) ? v + "px" : v);
        }
        if (raw["border-radius"] !== undefined) {
          const v = toSafeString(raw["border-radius"]).trim();
          applyStyle("borderRadius", /^\d+(\.\d+)?$/.test(v) ? v + "px" : v);
        }
        if (raw["border-color"] !== undefined) {
          applyStyle("borderColor", raw["border-color"]);
        }
        if (raw.margin !== undefined) {
          const v = toSafeString(raw.margin).trim();
          applyStyle("margin", /^\d+(\.\d+)?$/.test(v) ? v + "px" : v);
        }
        if (raw.padding !== undefined) {
          const v = toSafeString(raw.padding).trim();
          applyStyle("padding", /^\d+(\.\d+)?$/.test(v) ? v + "px" : v);
        }
        if (raw.opacity !== undefined) {
          const op = Number(raw.opacity);
          const opVal = Number.isFinite(op) ? String(Math.min(1, Math.max(0, op))) : toSafeString(raw.opacity);
          target.style.opacity = opVal;
          if (inputEl !== target) inputEl.style.opacity = opVal;
        }
        if (raw.display !== undefined) {
          applyStyle("display", raw.display);
        }
        if (raw.width !== undefined) {
          const v = toSafeString(raw.width).trim();
          const wVal = /^\d+(\.\d+)?$/.test(v) ? v + "px" : v;
          target.style.width = wVal;
          target.style.maxWidth = wVal;
        }
        if (raw.height !== undefined) {
          const v = toSafeString(raw.height).trim();
          const hVal = /^\d+(\.\d+)?$/.test(v) ? v + "px" : v;
          target.style.height = hVal;
          target.style.minHeight = hVal;
        }
        if (raw.min !== undefined) {
          const v = toSafeString(raw.min).trim();
          target.min = v;
          target.setAttribute("min", v);
          target.dataset.nodelogicMin = v;
          if (inputEl !== target) {
            inputEl.min = v;
            inputEl.setAttribute("min", v);
            inputEl.dataset.nodelogicMin = v;
          }
        }
        if (raw.max !== undefined) {
          const v = toSafeString(raw.max).trim();
          target.max = v;
          target.setAttribute("max", v);
          target.dataset.nodelogicMax = v;
          if (inputEl !== target) {
            inputEl.max = v;
            inputEl.setAttribute("max", v);
            inputEl.dataset.nodelogicMax = v;
          }
        }
        if (raw.min !== undefined || raw.max !== undefined) {
          const sliderContainer = inputEl.closest(".slider-container") || target.closest?.(".slider-container");
          if (sliderContainer) {
            updateSliderUI(sliderContainer);
          }
        }
        const actionNodes = Array.isArray(raw.actions) ? raw.actions : [];
        if (actionNodes.length > 0) {
          // Bookkeeping (listener registration / dedup / cleanup) is keyed by
          // bindingKey = this logic block's own stable identity + entryKey
          // (entryKey alone is unique PER OUTPUT NODE within ONE graph, not
          // across separate logic blocks -- see blockScope above). Two
          // different Output nodes can legitimately target the SAME element;
          // keying by targetId would make them share one bindingState and
          // each one's prune pass would tear down the other's still-current
          // listeners.
          const bindingKey = `${blockScope}::${entryKey}`;
          activeActionTargets.add(bindingKey);
          let bindingState = window.nodelogicActionBindings[bindingKey];
          let bindingJustCreated = false;
          if (!bindingState || bindingState.target !== target || bindingState.inputEl !== inputEl) {
            // New target (or this Output retargeted to a different element):
            // any previously-registered listeners belonged to the old target.
            removeActionBinding(bindingKey);
            bindingState = { target, inputEl, removers: [], listeners: new Map() };
            window.nodelogicActionBindings[bindingKey] = bindingState;
            bindingJustCreated = true;
          }
          // Listener registration is dedup'd per Action->Event node and
          // pruned against the current plan; leaf actions re-apply on every
          // genuinely fresh evaluation so a repeating event keeps producing an
          // effect even when its result is identical to the previous
          // occurrence -- but NOT on a cache hit (isFreshEvaluation false),
          // where `raw` is a stale, already-applied evaluation reused only
          // because this pass happened to hash to the same evaluationKey; a
          // brand new binding still needs its listeners/actions applied once
          // even on a cache hit, since nothing has been applied to it yet.
          if (isFreshEvaluation || bindingJustCreated) {
            pruneStaleActionListeners(bindingState, collectActionEventKeys(actionNodes, new Set()));
            registerActionListeners(target, inputEl, actionNodes, bindingKey, bindingState);
            applyLeafActionNodes(target, inputEl, actionNodes);
          }
        } else {
          removeActionBinding(`${blockScope}::${entryKey}`);
        }
        if (raw["custom-css"] !== undefined) {
          // Apply raw CSS string via cssText append â€” parse key:value pairs
          const css = toSafeString(raw["custom-css"]).trim();
          if (css) {
            css.split(";").forEach(rule => {
              const token = rule.trim();
              if (!token) return;
              const colonIdx = token.indexOf(":");
              if (colonIdx === -1) {
                // Backward-compatible fallback: allow bare color tokens.
                if (/^(#|rgb\(|rgba\(|hsl\(|hsla\(|[a-z])/i.test(token)) {
                  try {
                    target.style.color = token;
                    if (inputEl !== target) inputEl.style.color = token;
                  } catch {}
                }
                return;
              }
              const prop = token.slice(0, colonIdx).trim();
              const val = token.slice(colonIdx + 1).trim();
              if (prop && val) {
                // Convert kebab-case to camelCase
                const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
                try { target.style[camel] = val; if (inputEl !== target) inputEl.style[camel] = val; } catch {}
              }
            });
          }
        }
      });
      });

    Object.keys(window.nodelogicActionBindings || {}).forEach((key) => {
      if (!activeActionTargets.has(key)) {
        removeActionBinding(key);
      }
    });
  }

  function recalculateAll() {
    syncFormulaControls();

    const values = getAllDynamicValues();

    DOM.formulaBlocks.forEach(block => {
      updateFormulaBlock(block, values);
    });

    applyLogicBlocks();

    calculateTables();

    // Mark that first execution is complete
    if (isFirstExecution) {
      isFirstExecution = false;
    }

    nlAfterRecalculation();
  }

  function scheduleRecalculation() {
    if (recalculationQueued) return;
    recalculationQueued = true;

    requestAnimationFrame(() => {
      recalculationQueued = false;
      recalculateAll();
    });
  }

  // =====================
  // EVENTS
  // =====================
  function bindEvents() {
    const bound = new WeakSet();

    DOM.controls.forEach(({ input }) => {
      if (bound.has(input)) return;
      bound.add(input);

      input.addEventListener("input", scheduleRecalculation);
      input.addEventListener("change", scheduleRecalculation);
      input.addEventListener("blur", () => {
        const formula = (input.dataset.formula || "").trim();

        if (formula) {
          scheduleRecalculation();
          return;
        }

        if (input.type === "number") {
          const min = input.min !== "" ? Number(input.min) : -Infinity;
          const max = input.max !== "" ? Number(input.max) : Infinity;

          let val = Number(input.value);
          if (!Number.isFinite(val)) val = Number.isFinite(min) ? min : 0;

          if (Number.isFinite(min) || Number.isFinite(max)) {
            val = clamp(val, min, max);
          }

          input.value = formatValueForInput(input, val);
        }

        scheduleRecalculation();
      });
    });

    DOM.groups.forEach(({ buttons }) => {
      buttons.forEach(btn => {
        btn.addEventListener("click", () => {
          buttons.forEach(b => b.classList.remove("active"));
          btn.classList.add("active");
          scheduleRecalculation();
        });
      });
    });

    // Bind custom event types for elements referenced by logic blocks
    DOM.logicBlocks.forEach(block => {
      const formula = (block.dataset.formula || "").trim();
      if (!formula) return;

      // Extract [elementId] references from the formula
      const varRegex = /\[([a-zA-Z0-9_-]+)\]/g;
      const ids = new Set();
      let m;
      while ((m = varRegex.exec(formula)) !== null) {
        ids.add(m[1]);
      }

      ids.forEach(id => {
        let el = document.getElementById(id)
          || document.querySelector(`[data-nodelogic-id="${CSS.escape(id)}"]`)
          || document.querySelector(`[data-slider-id="${CSS.escape(id)}"]`);
        if (!el) return;
        // Resolve actual input if we got a container div
        if (el.classList.contains("slider-container") || (el.tagName === "DIV" && !el.matches("input, select, textarea, span"))) {
          const inner = el.querySelector("input, select, textarea");
          if (inner) el = inner;
        }
        if (bound.has(el)) return;
        bound.add(el);

        const eventType = el.dataset.nodelogicEvent || "change";
        el.addEventListener(eventType, scheduleRecalculation);
        if (eventType !== "input") {
          el.addEventListener("input", scheduleRecalculation);
        }
      });
    });
  }

  // =====================
  // INIT
  // =====================
  function init() {
    cacheDOM();
    bindEvents();
    recalculateAll();
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init);
  }
})();


