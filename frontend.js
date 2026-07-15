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
    if (expr.length === 0 || expr.length > 12000) return false;

    // Strip string literals first, then check for injection vectors outside strings
    const stripped = stripStringLiterals(expr);

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
      "__nodeApiRequest",
      "__nodeApiListMapper",
      "__nodeImageFromLink",
      "__nodeImageFromElement",
      "__nodeCountTrue",
      "__nodeGradient",
      "__nodeUnzip",
      "__nodeCaseEquals",
      "__nodeGetPath",
      "__nodeMemoryGet",
      "__nodeMemorySet",
      "__nodeEvent",
      "__nodeEventProcessor",
      "__nodeFallback",
      "value",
      "label",
      "background",
      "color",
      "disabled",
      "parseInt",
      "String",
      "__nodeToBase",
      // Action node keys used in compiled action plan expressions
      "type",
      "sourceId",
      "eventType",
      "actions",
      "className",
      "pattern",
      "min",
      "max"
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

  function __nodeApiRequest(url, method = "GET", data) {
    const requestUrl = toSafeString(url).trim();
    if (!requestUrl) return null;

    const requestMethod = toSafeString(method).trim().toUpperCase() || "GET";
    const requestBody = requestMethod === "GET" ? "" : JSON.stringify(data ?? {});
    const cacheKey = `${requestMethod}:${requestUrl}:${requestBody}`;
    const cached = apiRequestCache.get(cacheKey);
    if (cached && typeof cached.timestamp === "number" && Date.now() - cached.timestamp < API_REQUEST_CACHE_TTL) {
      return cached.value;
    }

    try {
      if (typeof XMLHttpRequest === "undefined") {
        return null;
      }

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

      xhr.open(requestMethod, finalUrl, false);
      xhr.withCredentials = sameOrigin;

      if (requestMethod !== "GET") {
        xhr.setRequestHeader("Content-Type", "application/json");
      }

      const nonce = sameOrigin ? window?.wpApiSettings?.nonce : "";
      if (nonce) {
        xhr.setRequestHeader("X-WP-Nonce", nonce);
      }

      xhr.send(requestMethod === "GET" ? null : JSON.stringify(data ?? {}));

      const responseText = toSafeString(xhr.responseText || "");
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = tryParseJsonValue(responseText);
        apiRequestCache.set(cacheKey, { timestamp: Date.now(), value: parsed });
        return parsed;
      }
    } catch {
      return null;
    }

    return null;
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

  function resolveNodeElement(rawSelector) {
    let selector = toSafeString(rawSelector).trim();
    if (!selector) return null;

    if (selector.startsWith("[") && selector.endsWith("]") && selector.length > 2) {
      selector = selector.slice(1, -1).trim();
    }

    if (!selector) return null;

    if (selector.startsWith("#") || selector.startsWith(".") || selector.includes("[")) {
      try {
        return document.querySelector(selector);
      } catch {
        return null;
      }
    }

    return document.getElementById(selector)
      || document.querySelector(`[data-nodelogic-id="${CSS.escape(selector)}"]`)
      || document.querySelector(`[data-nodelogic-chart-id="${CSS.escape(selector)}"]`)
      || document.querySelector(`[data-nodelogic-custom-element-id="${CSS.escape(selector)}"]`)
      || document.querySelector(`[data-slider-id="${CSS.escape(selector)}"]`)
      || null;
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

    const leftText = toSafeString(left).trim();
    const rightText = toSafeString(right).trim();

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

  // Memory functions
  window.memoryStore = window.memoryStore || {};

  function __nodeMemoryGet(varName, defaultValue) {
    const key = toSafeString(varName).trim();
    if (!key) return defaultValue;
    return window.memoryStore[key] !== undefined ? window.memoryStore[key] : defaultValue;
  }

  function __nodeMemorySet(varName, value) {
    const key = toSafeString(varName).trim();
    if (!key) return value;
    window.memoryStore[key] = value;
    return value;
  }

  // Event functions
  window.eventStore = window.eventStore || {};

  function __nodeEvent(elementId, eventType) {
    const id = toSafeString(elementId).trim();
    const type = toSafeString(eventType).trim() || 'click';
    if (!id || !type) return null;

    // Handle both ID (with or without #) and selectors
    let element = null;
    if (id.startsWith('#') || id.startsWith('.') || id.includes('[')) {
      // It's a selector
      element = document.querySelector(id);
    } else {
      // It's an ID without #
      element = document.getElementById(id);
    }
    
    if (!element) {
      console.warn(`Element not found: ${id}`);
      return null;
    }

    const key = `${id}_${type}`;
    
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
    }

    return target;
  }

  function findActionSourceElement(sourceId) {
    const id = toSafeString(sourceId).trim();
    if (!id) return null;

    return document.getElementById(id)
      || document.querySelector(`[data-nodelogic-id="${CSS.escape(id)}"]`)
      || document.querySelector(`[data-nodelogic-custom-element-id="${CSS.escape(id)}"]`)
      || document.querySelector(`[data-slider-id="${CSS.escape(id)}"]`);
  }

  function removeActionBinding(targetId) {
    const key = toSafeString(targetId).trim();
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

  function getActionPlanSignature(actionNodes) {
    try {
      return JSON.stringify(actionNodes ?? []);
    } catch {
      return "";
    }
  }

  function applyActionNode(target, inputEl, actionNode) {
    if (!actionNode) return;

    const actionType = toSafeString(actionNode.type || actionNode.kind || "").trim();
    if (!actionType || actionType === "event" || actionType === "block") return;

    const inputTarget = resolveActionTargetElement(inputEl);
    const applyBoth = (fn) => {
      try {
        fn(target);
      } catch {}
      if (inputTarget && inputTarget !== target) {
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
    }
  }

  function executeActionTree(target, inputEl, actionNodes, targetId, bindingState) {
    if (!Array.isArray(actionNodes)) return;

    actionNodes.forEach((actionNode) => {
      try {
        if (!actionNode) return;

        if (Array.isArray(actionNode)) {
          executeActionTree(target, inputEl, actionNode, targetId, bindingState);
          return;
        }

        const actionType = toSafeString(actionNode.type || actionNode.kind || "").trim();
        if (!actionType) return;

        if (actionType === "event") {
          const sourceEl = findActionSourceElement(actionNode.sourceId || actionNode.targetId || actionNode.actionTargetId || "");
          const eventType = toSafeString(actionNode.eventType || "change").trim() || "change";
          const nestedActions = Array.isArray(actionNode.actions) ? actionNode.actions : [];

          if (!sourceEl || nestedActions.length === 0) {
            return;
          }

          const listener = () => {
            try {
              executeActionTree(target, inputEl, nestedActions, targetId, bindingState);
            } catch (error) {
              console.warn("[NodeLogic Runtime] action event execution failed", error);
            }
          };

          sourceEl.addEventListener(eventType, listener);
          bindingState.removers.push(() => {
            try {
              sourceEl.removeEventListener(eventType, listener);
            } catch {}
          });
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

  // Memory functions
  window.memoryStore = window.memoryStore || {};
  window.memoryPersistFlags = window.memoryPersistFlags || {}; // Track which variables should persist

  function __nodeMemoryGet(varName, defaultValue, persist) {
    const key = toSafeString(varName).trim();
    if (!key) return defaultValue;
    
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

  function __nodeMemorySet(varName, value, reset) {
    const key = toSafeString(varName).trim();
    if (!key) return value;
    
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

    prepared = replaceFormulaVarsOutsideStrings(prepared, (_, id) => {
      const raw = values[id];
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

  function createFormulaEvalContext() {
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
      __nodeApiRequest,
      __nodeApiListMapper,
      __nodeImageFromLink,
      __nodeImageFromElement,
      __nodeToBase,
      __nodeCountTrue,
      __nodeGradient,
      __nodeUnzip,
      __nodeCaseEquals,
      __nodeGetPath,
      __nodeMemoryGet,
      __nodeMemorySet,
      __nodeEvent,
      __nodeEventProcessor,
      __nodeFallback
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

  function safeEvaluateExpression(expr) {
    try {
      if (!isPreparedExpressionSafe(expr)) {
        return { valid: false, value: undefined };
      }

      const ast = getCachedFormulaAst(expr);
      if (!ast) {
        return { valid: false, value: undefined };
      }

      const value = evalFormulaNode(ast, createFormulaEvalContext(), 0);
      return { valid: true, value };
    } catch (e) {
      return { valid: false, value: undefined };
    }
  }

  function evaluateFormulaExpression(formula, values) {
    if (!isFormulaString(formula)) {
      return { valid: false, value: NaN, useGrosze: false, prepared: "" };
    }

    const useGrosze = parseFormulaVariables(formula).some(v => v.id === "cost");
    const prepared = prepareFormulaForEval(formula, values);
    const rawResult = safeEvaluateExpression(prepared);

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
    const activeActionTargets = new Set();

    DOM.logicBlocks.forEach((block, blockIndex) => {
      const formula = (block.dataset.formula || "").trim();
      if (!formula) return;

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

      // Evaluate the formula
      const evaluation = evaluateFormulaExpression(formula, values);
      if (!evaluation.valid || !evaluation.value || typeof evaluation.value !== "object") return;

      const map = evaluation.value;
      Object.keys(map).forEach(targetId => {
        const raw = map[targetId];
        if (!raw || typeof raw !== "object") return;

        // Check if this output should execute on first load
        const config = outputConfigs[targetId] || {};
        const executeOnLoad = config.executeOnLoad !== false; // Default true
        if (isFirstExecution && !executeOnLoad) {
          return; // Skip this output on first execution
        }

        // Find target element
        let target = document.getElementById(targetId)
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
        const structuredValue = shouldPreserveStructuredPayload(raw) ? raw : payload.value;
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

        if (imageEl && structuredValue !== undefined) {
          const resolvedImage = Array.isArray(structuredValue)
            ? JSON.stringify(structuredValue)
            : (structuredValue === null || structuredValue === undefined ? "" : String(structuredValue));
          imageEl.src = resolvedImage;
          imageEl.dataset.nodelogicImageSrc = resolvedImage;
        }

        const isLabelEl = !inputEl.matches("input, select, textarea") && !arrayListRoot && !imageEl;

        // --- value ---
        if (payload.value !== undefined && !arrayListRoot && !imageEl) {
          const resolvedValue = payload.value;
          const nextValue = Array.isArray(resolvedValue)
            ? JSON.stringify(resolvedValue)
            : (resolvedValue === null || resolvedValue === undefined ? "" : String(resolvedValue));
          if (isLabelEl) {
            if (inputEl.textContent !== nextValue) inputEl.textContent = nextValue;
          } else {
            const formatted = typeof resolvedValue === "number" && Number.isFinite(resolvedValue)
              ? (inputEl.type === "range" || inputEl.type === "number" ? formatValueForInput(inputEl, resolvedValue) : nextValue)
              : nextValue;
            setControlValue(inputEl, formatted);
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
        const actionSignature = getActionPlanSignature(actionNodes);
        if (actionNodes.length > 0) {
          activeActionTargets.add(targetId);
          const existingBinding = window.nodelogicActionBindings[targetId];
          const bindingChanged =
            !existingBinding
            || existingBinding.signature !== actionSignature
            || existingBinding.target !== target
            || existingBinding.inputEl !== inputEl;

          if (bindingChanged) {
            removeActionBinding(targetId);
            const bindingState = {
              signature: actionSignature,
              target,
              inputEl,
              removers: []
            };
            window.nodelogicActionBindings[targetId] = bindingState;
            executeActionTree(target, inputEl, actionNodes, targetId, bindingState);
          }
        } else {
          removeActionBinding(targetId);
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


