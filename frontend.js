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
      "__nodeCountTrue",
      "__nodeGradient",
      "__nodeUnzip",
      "__nodeCaseEquals",
      "__nodeMemoryGet",
      "__nodeMemorySet",
      "__nodeEvent",
      "__nodeEventProcessor",
      "__nodeFallback",
      "value",
      "background",
      "color",
      "disabled",
      "parseInt",
      "String",
      "__nodeToBase"
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
      const key = `o${index}`;
      if (Object.prototype.hasOwnProperty.call(zipValue, key)) {
        return zipValue[key];
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

  function __nodeFallback(primary, fallback) {
    // Check if primary is undefined, null, or NaN
    if (primary === undefined || primary === null || (typeof primary === 'number' && isNaN(primary))) {
      return fallback;
    }
    return primary;
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
        || Object.prototype.hasOwnProperty.call(payload, "custom-css");
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
      __nodeToBase,
      __nodeCountTrue,
      __nodeGradient,
      __nodeUnzip,
      __nodeCaseEquals,
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

    const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
    const ratio = clamp(pct / 100, 0, 1);

    if (progress) progress.style.width = `${clamp(pct, 0, 100)}%`;

    if (thumb && track) {
      const sliderWidth = track.offsetWidth;
      const thumbWidth = 40;

      const pos = clamp(
        (pct / 100) * (sliderWidth - thumbWidth),
        0,
        sliderWidth - thumbWidth
      ) + thumbWidth / 2;

      thumb.textContent = String(value);
      thumb.style.left = `${pos}px`;

      const p = pos / (sliderWidth - thumbWidth / 2);
      if (progress) {
        progress.style.width = clamp(p * 100, 0, 100) + "%";

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
      if (!evaluation.valid || !evaluation.value || typeof evaluation.value !== "object") {
        return;
      }

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
          || document.querySelector(`[data-slider-id="${CSS.escape(targetId)}"]`);
        if (!target) return;

        // Resolve actual input if we got a container div
        let inputEl = target;
        if (target.classList.contains("slider-container") || (target.tagName === "DIV" && !target.matches("input, select, textarea, span"))) {
          const inner = target.querySelector("input, select, textarea");
          if (inner) inputEl = inner;
        }

        const isLabelEl = !inputEl.matches("input, select, textarea");
        const payload = normalizeFormulaPayload(raw);

        // --- value ---
        if (payload.value !== undefined) {
          const resolvedValue = payload.value;
          const nextValue = resolvedValue === null || resolvedValue === undefined ? "" : String(resolvedValue);
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
        if (raw["custom-css"] !== undefined) {
          // Apply raw CSS string via cssText append — parse key:value pairs
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
