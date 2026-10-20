var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);

// node_modules/scheduler/cjs/scheduler.production.js
var exports_scheduler_production = {};
__export(exports_scheduler_production, {
  unstable_wrapCallback: () => $unstable_wrapCallback,
  unstable_shouldYield: () => $unstable_shouldYield,
  unstable_scheduleCallback: () => $unstable_scheduleCallback,
  unstable_runWithPriority: () => $unstable_runWithPriority,
  unstable_requestPaint: () => $unstable_requestPaint,
  unstable_now: () => $unstable_now,
  unstable_next: () => $unstable_next,
  unstable_getCurrentPriorityLevel: () => $unstable_getCurrentPriorityLevel,
  unstable_forceFrameRate: () => $unstable_forceFrameRate,
  unstable_cancelCallback: () => $unstable_cancelCallback,
  unstable_UserBlockingPriority: () => $unstable_UserBlockingPriority,
  unstable_Profiling: () => $unstable_Profiling,
  unstable_NormalPriority: () => $unstable_NormalPriority,
  unstable_LowPriority: () => $unstable_LowPriority,
  unstable_ImmediatePriority: () => $unstable_ImmediatePriority,
  unstable_IdlePriority: () => $unstable_IdlePriority
});
function push(heap, node) {
  var index = heap.length;
  heap.push(node);
  a:
    for (;0 < index; ) {
      var parentIndex = index - 1 >>> 1, parent = heap[parentIndex];
      if (0 < compare(parent, node))
        heap[parentIndex] = node, heap[index] = parent, index = parentIndex;
      else
        break a;
    }
}
function peek(heap) {
  return heap.length === 0 ? null : heap[0];
}
function pop(heap) {
  if (heap.length === 0)
    return null;
  var first = heap[0], last = heap.pop();
  if (last !== first) {
    heap[0] = last;
    a:
      for (var index = 0, length = heap.length, halfLength = length >>> 1;index < halfLength; ) {
        var leftIndex = 2 * (index + 1) - 1, left = heap[leftIndex], rightIndex = leftIndex + 1, right = heap[rightIndex];
        if (0 > compare(left, last))
          rightIndex < length && 0 > compare(right, left) ? (heap[index] = right, heap[rightIndex] = last, index = rightIndex) : (heap[index] = left, heap[leftIndex] = last, index = leftIndex);
        else if (rightIndex < length && 0 > compare(right, last))
          heap[index] = right, heap[rightIndex] = last, index = rightIndex;
        else
          break a;
      }
  }
  return first;
}
function compare(a, b) {
  var diff = a.sortIndex - b.sortIndex;
  return diff !== 0 ? diff : a.id - b.id;
}
function advanceTimers(currentTime) {
  for (var timer = peek(timerQueue);timer !== null; ) {
    if (timer.callback === null)
      pop(timerQueue);
    else if (timer.startTime <= currentTime)
      pop(timerQueue), timer.sortIndex = timer.expirationTime, push(taskQueue, timer);
    else
      break;
    timer = peek(timerQueue);
  }
}
function handleTimeout(currentTime) {
  isHostTimeoutScheduled = false;
  advanceTimers(currentTime);
  if (!isHostCallbackScheduled)
    if (peek(taskQueue) !== null)
      isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline());
    else {
      var firstTimer = peek(timerQueue);
      firstTimer !== null && requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
}
function shouldYieldToHost() {
  return needsPaint ? true : $unstable_now() - startTime < frameInterval ? false : true;
}
function performWorkUntilDeadline() {
  needsPaint = false;
  if (isMessageLoopRunning) {
    var currentTime = $unstable_now();
    startTime = currentTime;
    var hasMoreWork = true;
    try {
      a: {
        isHostCallbackScheduled = false;
        isHostTimeoutScheduled && (isHostTimeoutScheduled = false, localClearTimeout(taskTimeoutID), taskTimeoutID = -1);
        isPerformingWork = true;
        var previousPriorityLevel = currentPriorityLevel;
        try {
          b: {
            advanceTimers(currentTime);
            for (currentTask = peek(taskQueue);currentTask !== null && !(currentTask.expirationTime > currentTime && shouldYieldToHost()); ) {
              var callback = currentTask.callback;
              if (typeof callback === "function") {
                currentTask.callback = null;
                currentPriorityLevel = currentTask.priorityLevel;
                var continuationCallback = callback(currentTask.expirationTime <= currentTime);
                currentTime = $unstable_now();
                if (typeof continuationCallback === "function") {
                  currentTask.callback = continuationCallback;
                  advanceTimers(currentTime);
                  hasMoreWork = true;
                  break b;
                }
                currentTask === peek(taskQueue) && pop(taskQueue);
                advanceTimers(currentTime);
              } else
                pop(taskQueue);
              currentTask = peek(taskQueue);
            }
            if (currentTask !== null)
              hasMoreWork = true;
            else {
              var firstTimer = peek(timerQueue);
              firstTimer !== null && requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
              hasMoreWork = false;
            }
          }
          break a;
        } finally {
          currentTask = null, currentPriorityLevel = previousPriorityLevel, isPerformingWork = false;
        }
        hasMoreWork = undefined;
      }
    } finally {
      hasMoreWork ? schedulePerformWorkUntilDeadline() : isMessageLoopRunning = false;
    }
  }
}
function requestHostTimeout(callback, ms) {
  taskTimeoutID = localSetTimeout(function() {
    callback($unstable_now());
  }, ms);
}
var $unstable_now = undefined, localPerformance, localDate, initialTime, taskQueue, timerQueue, taskIdCounter = 1, currentTask = null, currentPriorityLevel = 3, isPerformingWork = false, isHostCallbackScheduled = false, isHostTimeoutScheduled = false, needsPaint = false, localSetTimeout, localClearTimeout, localSetImmediate, isMessageLoopRunning = false, taskTimeoutID = -1, frameInterval = 5, startTime = -1, schedulePerformWorkUntilDeadline, channel, port, $unstable_IdlePriority = 5, $unstable_ImmediatePriority = 1, $unstable_LowPriority = 4, $unstable_NormalPriority = 3, $unstable_Profiling = null, $unstable_UserBlockingPriority = 2, $unstable_cancelCallback = function(task) {
  task.callback = null;
}, $unstable_forceFrameRate = function(fps) {
  0 > fps || 125 < fps ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : frameInterval = 0 < fps ? Math.floor(1000 / fps) : 5;
}, $unstable_getCurrentPriorityLevel = function() {
  return currentPriorityLevel;
}, $unstable_next = function(eventHandler) {
  switch (currentPriorityLevel) {
    case 1:
    case 2:
    case 3:
      var priorityLevel = 3;
      break;
    default:
      priorityLevel = currentPriorityLevel;
  }
  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;
  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}, $unstable_requestPaint = function() {
  needsPaint = true;
}, $unstable_runWithPriority = function(priorityLevel, eventHandler) {
  switch (priorityLevel) {
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
      break;
    default:
      priorityLevel = 3;
  }
  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;
  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}, $unstable_scheduleCallback = function(priorityLevel, callback, options) {
  var currentTime = $unstable_now();
  typeof options === "object" && options !== null ? (options = options.delay, options = typeof options === "number" && 0 < options ? currentTime + options : currentTime) : options = currentTime;
  switch (priorityLevel) {
    case 1:
      var timeout = -1;
      break;
    case 2:
      timeout = 250;
      break;
    case 5:
      timeout = 1073741823;
      break;
    case 4:
      timeout = 1e4;
      break;
    default:
      timeout = 5000;
  }
  timeout = options + timeout;
  priorityLevel = {
    id: taskIdCounter++,
    callback,
    priorityLevel,
    startTime: options,
    expirationTime: timeout,
    sortIndex: -1
  };
  options > currentTime ? (priorityLevel.sortIndex = options, push(timerQueue, priorityLevel), peek(taskQueue) === null && priorityLevel === peek(timerQueue) && (isHostTimeoutScheduled ? (localClearTimeout(taskTimeoutID), taskTimeoutID = -1) : isHostTimeoutScheduled = true, requestHostTimeout(handleTimeout, options - currentTime))) : (priorityLevel.sortIndex = timeout, push(taskQueue, priorityLevel), isHostCallbackScheduled || isPerformingWork || (isHostCallbackScheduled = true, isMessageLoopRunning || (isMessageLoopRunning = true, schedulePerformWorkUntilDeadline())));
  return priorityLevel;
}, $unstable_shouldYield, $unstable_wrapCallback = function(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    var previousPriorityLevel = currentPriorityLevel;
    currentPriorityLevel = parentPriorityLevel;
    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
    }
  };
};
var init_scheduler_production = __esm(() => {
  if (typeof performance === "object" && typeof performance.now === "function") {
    localPerformance = performance;
    $unstable_now = function() {
      return localPerformance.now();
    };
  } else {
    localDate = Date, initialTime = localDate.now();
    $unstable_now = function() {
      return localDate.now() - initialTime;
    };
  }
  taskQueue = [];
  timerQueue = [];
  localSetTimeout = typeof setTimeout === "function" ? setTimeout : null;
  localClearTimeout = typeof clearTimeout === "function" ? clearTimeout : null;
  localSetImmediate = typeof setImmediate !== "undefined" ? setImmediate : null;
  if (typeof localSetImmediate === "function")
    schedulePerformWorkUntilDeadline = function() {
      localSetImmediate(performWorkUntilDeadline);
    };
  else if (typeof MessageChannel !== "undefined") {
    channel = new MessageChannel, port = channel.port2;
    channel.port1.onmessage = performWorkUntilDeadline;
    schedulePerformWorkUntilDeadline = function() {
      port.postMessage(null);
    };
  } else
    schedulePerformWorkUntilDeadline = function() {
      localSetTimeout(performWorkUntilDeadline, 0);
    };
  $unstable_shouldYield = shouldYieldToHost;
});

// node_modules/scheduler/index.js
var require_scheduler = __commonJS((exports, module) => {
  init_scheduler_production();
  if (true) {
    module.exports = exports_scheduler_production;
  } else {}
});

// node_modules/react-dom/cjs/react-dom-client.production.js
var exports_react_dom_client_production = {};
__export(exports_react_dom_client_production, {
  version: () => $version,
  hydrateRoot: () => $hydrateRoot,
  createRoot: () => $createRoot
});
import * as React from "react";
import * as ReactDOM from "react-dom";
function formatProdErrorMessage(code) {
  var url = "https://react.dev/errors/" + code;
  if (1 < arguments.length) {
    url += "?args[]=" + encodeURIComponent(arguments[1]);
    for (var i = 2;i < arguments.length; i++)
      url += "&args[]=" + encodeURIComponent(arguments[i]);
  }
  return "Minified React error #" + code + "; visit " + url + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
}
function isValidContainer(node) {
  return !(!node || node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11);
}
function getNearestMountedFiber(fiber) {
  var node = fiber, nearestMounted = fiber;
  if (fiber.alternate)
    for (;node.return; )
      node = node.return;
  else {
    fiber = node;
    do
      node = fiber, (node.flags & 4098) !== 0 && (nearestMounted = node.return), fiber = node.return;
    while (fiber);
  }
  return node.tag === 3 ? nearestMounted : null;
}
function getSuspenseInstanceFromFiber(fiber) {
  if (fiber.tag === 13) {
    var suspenseState = fiber.memoizedState;
    suspenseState === null && (fiber = fiber.alternate, fiber !== null && (suspenseState = fiber.memoizedState));
    if (suspenseState !== null)
      return suspenseState.dehydrated;
  }
  return null;
}
function getActivityInstanceFromFiber(fiber) {
  if (fiber.tag === 31) {
    var activityState = fiber.memoizedState;
    activityState === null && (fiber = fiber.alternate, fiber !== null && (activityState = fiber.memoizedState));
    if (activityState !== null)
      return activityState.dehydrated;
  }
  return null;
}
function assertIsMounted(fiber) {
  if (getNearestMountedFiber(fiber) !== fiber)
    throw Error(formatProdErrorMessage(188));
}
function findCurrentFiberUsingSlowPath(fiber) {
  var alternate = fiber.alternate;
  if (!alternate) {
    alternate = getNearestMountedFiber(fiber);
    if (alternate === null)
      throw Error(formatProdErrorMessage(188));
    return alternate !== fiber ? null : fiber;
  }
  for (var a = fiber, b = alternate;; ) {
    var parentA = a.return;
    if (parentA === null)
      break;
    var parentB = parentA.alternate;
    if (parentB === null) {
      b = parentA.return;
      if (b !== null) {
        a = b;
        continue;
      }
      break;
    }
    if (parentA.child === parentB.child) {
      for (parentB = parentA.child;parentB; ) {
        if (parentB === a)
          return assertIsMounted(parentA), fiber;
        if (parentB === b)
          return assertIsMounted(parentA), alternate;
        parentB = parentB.sibling;
      }
      throw Error(formatProdErrorMessage(188));
    }
    if (a.return !== b.return)
      a = parentA, b = parentB;
    else {
      for (var didFindChild = false, child$0 = parentA.child;child$0; ) {
        if (child$0 === a) {
          didFindChild = true;
          a = parentA;
          b = parentB;
          break;
        }
        if (child$0 === b) {
          didFindChild = true;
          b = parentA;
          a = parentB;
          break;
        }
        child$0 = child$0.sibling;
      }
      if (!didFindChild) {
        for (child$0 = parentB.child;child$0; ) {
          if (child$0 === a) {
            didFindChild = true;
            a = parentB;
            b = parentA;
            break;
          }
          if (child$0 === b) {
            didFindChild = true;
            b = parentB;
            a = parentA;
            break;
          }
          child$0 = child$0.sibling;
        }
        if (!didFindChild)
          throw Error(formatProdErrorMessage(189));
      }
    }
    if (a.alternate !== b)
      throw Error(formatProdErrorMessage(190));
  }
  if (a.tag !== 3)
    throw Error(formatProdErrorMessage(188));
  return a.stateNode.current === a ? fiber : alternate;
}
function findCurrentHostFiberImpl(node) {
  var tag = node.tag;
  if (tag === 5 || tag === 26 || tag === 27 || tag === 6)
    return node;
  for (node = node.child;node !== null; ) {
    tag = findCurrentHostFiberImpl(node);
    if (tag !== null)
      return tag;
    node = node.sibling;
  }
  return null;
}
function getIteratorFn(maybeIterable) {
  if (maybeIterable === null || typeof maybeIterable !== "object")
    return null;
  maybeIterable = MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL] || maybeIterable["@@iterator"];
  return typeof maybeIterable === "function" ? maybeIterable : null;
}
function getComponentNameFromType(type) {
  if (type == null)
    return null;
  if (typeof type === "function")
    return type.$$typeof === REACT_CLIENT_REFERENCE ? null : type.displayName || type.name || null;
  if (typeof type === "string")
    return type;
  switch (type) {
    case REACT_FRAGMENT_TYPE:
      return "Fragment";
    case REACT_PROFILER_TYPE:
      return "Profiler";
    case REACT_STRICT_MODE_TYPE:
      return "StrictMode";
    case REACT_SUSPENSE_TYPE:
      return "Suspense";
    case REACT_SUSPENSE_LIST_TYPE:
      return "SuspenseList";
    case REACT_ACTIVITY_TYPE:
      return "Activity";
  }
  if (typeof type === "object")
    switch (type.$$typeof) {
      case REACT_PORTAL_TYPE:
        return "Portal";
      case REACT_CONTEXT_TYPE:
        return type.displayName || "Context";
      case REACT_CONSUMER_TYPE:
        return (type._context.displayName || "Context") + ".Consumer";
      case REACT_FORWARD_REF_TYPE:
        var innerType = type.render;
        type = type.displayName;
        type || (type = innerType.displayName || innerType.name || "", type = type !== "" ? "ForwardRef(" + type + ")" : "ForwardRef");
        return type;
      case REACT_MEMO_TYPE:
        return innerType = type.displayName || null, innerType !== null ? innerType : getComponentNameFromType(type.type) || "Memo";
      case REACT_LAZY_TYPE:
        innerType = type._payload;
        type = type._init;
        try {
          return getComponentNameFromType(type(innerType));
        } catch (x) {}
    }
  return null;
}
function createCursor(defaultValue) {
  return { current: defaultValue };
}
function pop2(cursor) {
  0 > index || (cursor.current = valueStack[index], valueStack[index] = null, index--);
}
function push2(cursor, value) {
  index++;
  valueStack[index] = cursor.current;
  cursor.current = value;
}
function pushHostContainer(fiber, nextRootInstance) {
  push2(rootInstanceStackCursor, nextRootInstance);
  push2(contextFiberStackCursor, fiber);
  push2(contextStackCursor, null);
  switch (nextRootInstance.nodeType) {
    case 9:
    case 11:
      fiber = (fiber = nextRootInstance.documentElement) ? (fiber = fiber.namespaceURI) ? getOwnHostContext(fiber) : 0 : 0;
      break;
    default:
      if (fiber = nextRootInstance.tagName, nextRootInstance = nextRootInstance.namespaceURI)
        nextRootInstance = getOwnHostContext(nextRootInstance), fiber = getChildHostContextProd(nextRootInstance, fiber);
      else
        switch (fiber) {
          case "svg":
            fiber = 1;
            break;
          case "math":
            fiber = 2;
            break;
          default:
            fiber = 0;
        }
  }
  pop2(contextStackCursor);
  push2(contextStackCursor, fiber);
}
function popHostContainer() {
  pop2(contextStackCursor);
  pop2(contextFiberStackCursor);
  pop2(rootInstanceStackCursor);
}
function pushHostContext(fiber) {
  fiber.memoizedState !== null && push2(hostTransitionProviderCursor, fiber);
  var context = contextStackCursor.current;
  var JSCompiler_inline_result = getChildHostContextProd(context, fiber.type);
  context !== JSCompiler_inline_result && (push2(contextFiberStackCursor, fiber), push2(contextStackCursor, JSCompiler_inline_result));
}
function popHostContext(fiber) {
  contextFiberStackCursor.current === fiber && (pop2(contextStackCursor), pop2(contextFiberStackCursor));
  hostTransitionProviderCursor.current === fiber && (pop2(hostTransitionProviderCursor), HostTransitionContext._currentValue = sharedNotPendingObject);
}
function describeBuiltInComponentFrame(name) {
  if (prefix === undefined)
    try {
      throw Error();
    } catch (x) {
      var match = x.stack.trim().match(/\n( *(at )?)/);
      prefix = match && match[1] || "";
      suffix = -1 < x.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < x.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
  return `
` + prefix + name + suffix;
}
function describeNativeComponentFrame(fn, construct) {
  if (!fn || reentry)
    return "";
  reentry = true;
  var previousPrepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = undefined;
  try {
    var RunInRootFrame = {
      DetermineComponentFrameRoot: function() {
        try {
          if (construct) {
            var Fake = function() {
              throw Error();
            };
            Object.defineProperty(Fake.prototype, "props", {
              set: function() {
                throw Error();
              }
            });
            if (typeof Reflect === "object" && Reflect.construct) {
              try {
                Reflect.construct(Fake, []);
              } catch (x) {
                var control = x;
              }
              Reflect.construct(fn, [], Fake);
            } else {
              try {
                Fake.call();
              } catch (x$1) {
                control = x$1;
              }
              fn.call(Fake.prototype);
            }
          } else {
            try {
              throw Error();
            } catch (x$2) {
              control = x$2;
            }
            (Fake = fn()) && typeof Fake.catch === "function" && Fake.catch(function() {});
          }
        } catch (sample) {
          if (sample && control && typeof sample.stack === "string")
            return [sample.stack, control.stack];
        }
        return [null, null];
      }
    };
    RunInRootFrame.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
    var namePropDescriptor = Object.getOwnPropertyDescriptor(RunInRootFrame.DetermineComponentFrameRoot, "name");
    namePropDescriptor && namePropDescriptor.configurable && Object.defineProperty(RunInRootFrame.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
    var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(), sampleStack = _RunInRootFrame$Deter[0], controlStack = _RunInRootFrame$Deter[1];
    if (sampleStack && controlStack) {
      var sampleLines = sampleStack.split(`
`), controlLines = controlStack.split(`
`);
      for (namePropDescriptor = RunInRootFrame = 0;RunInRootFrame < sampleLines.length && !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot"); )
        RunInRootFrame++;
      for (;namePropDescriptor < controlLines.length && !controlLines[namePropDescriptor].includes("DetermineComponentFrameRoot"); )
        namePropDescriptor++;
      if (RunInRootFrame === sampleLines.length || namePropDescriptor === controlLines.length)
        for (RunInRootFrame = sampleLines.length - 1, namePropDescriptor = controlLines.length - 1;1 <= RunInRootFrame && 0 <= namePropDescriptor && sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]; )
          namePropDescriptor--;
      for (;1 <= RunInRootFrame && 0 <= namePropDescriptor; RunInRootFrame--, namePropDescriptor--)
        if (sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
          if (RunInRootFrame !== 1 || namePropDescriptor !== 1) {
            do
              if (RunInRootFrame--, namePropDescriptor--, 0 > namePropDescriptor || sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]) {
                var frame = `
` + sampleLines[RunInRootFrame].replace(" at new ", " at ");
                fn.displayName && frame.includes("<anonymous>") && (frame = frame.replace("<anonymous>", fn.displayName));
                return frame;
              }
            while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
          }
          break;
        }
    }
  } finally {
    reentry = false, Error.prepareStackTrace = previousPrepareStackTrace;
  }
  return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "") ? describeBuiltInComponentFrame(previousPrepareStackTrace) : "";
}
function describeFiber(fiber, childFiber) {
  switch (fiber.tag) {
    case 26:
    case 27:
    case 5:
      return describeBuiltInComponentFrame(fiber.type);
    case 16:
      return describeBuiltInComponentFrame("Lazy");
    case 13:
      return fiber.child !== childFiber && childFiber !== null ? describeBuiltInComponentFrame("Suspense Fallback") : describeBuiltInComponentFrame("Suspense");
    case 19:
      return describeBuiltInComponentFrame("SuspenseList");
    case 0:
    case 15:
      return describeNativeComponentFrame(fiber.type, false);
    case 11:
      return describeNativeComponentFrame(fiber.type.render, false);
    case 1:
      return describeNativeComponentFrame(fiber.type, true);
    case 31:
      return describeBuiltInComponentFrame("Activity");
    default:
      return "";
  }
}
function getStackByFiberInDevAndProd(workInProgress) {
  try {
    var info = "", previous = null;
    do
      info += describeFiber(workInProgress, previous), previous = workInProgress, workInProgress = workInProgress.return;
    while (workInProgress);
    return info;
  } catch (x) {
    return `
Error generating stack: ` + x.message + `
` + x.stack;
  }
}
function setIsStrictModeForDevtools(newIsStrictMode) {
  typeof log$1 === "function" && unstable_setDisableYieldValue2(newIsStrictMode);
  if (injectedHook && typeof injectedHook.setStrictMode === "function")
    try {
      injectedHook.setStrictMode(rendererID, newIsStrictMode);
    } catch (err) {}
}
function clz32Fallback(x) {
  x >>>= 0;
  return x === 0 ? 32 : 31 - (log2(x) / LN2 | 0) | 0;
}
function getHighestPriorityLanes(lanes) {
  var pendingSyncLanes = lanes & 42;
  if (pendingSyncLanes !== 0)
    return pendingSyncLanes;
  switch (lanes & -lanes) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 4:
      return 4;
    case 8:
      return 8;
    case 16:
      return 16;
    case 32:
      return 32;
    case 64:
      return 64;
    case 128:
      return 128;
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
      return lanes & 261888;
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return lanes & 3932160;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
      return lanes & 62914560;
    case 67108864:
      return 67108864;
    case 134217728:
      return 134217728;
    case 268435456:
      return 268435456;
    case 536870912:
      return 536870912;
    case 1073741824:
      return 0;
    default:
      return lanes;
  }
}
function getNextLanes(root, wipLanes, rootHasPendingCommit) {
  var pendingLanes = root.pendingLanes;
  if (pendingLanes === 0)
    return 0;
  var nextLanes = 0, suspendedLanes = root.suspendedLanes, pingedLanes = root.pingedLanes;
  root = root.warmLanes;
  var nonIdlePendingLanes = pendingLanes & 134217727;
  nonIdlePendingLanes !== 0 ? (pendingLanes = nonIdlePendingLanes & ~suspendedLanes, pendingLanes !== 0 ? nextLanes = getHighestPriorityLanes(pendingLanes) : (pingedLanes &= nonIdlePendingLanes, pingedLanes !== 0 ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = nonIdlePendingLanes & ~root, rootHasPendingCommit !== 0 && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))))) : (nonIdlePendingLanes = pendingLanes & ~suspendedLanes, nonIdlePendingLanes !== 0 ? nextLanes = getHighestPriorityLanes(nonIdlePendingLanes) : pingedLanes !== 0 ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = pendingLanes & ~root, rootHasPendingCommit !== 0 && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))));
  return nextLanes === 0 ? 0 : wipLanes !== 0 && wipLanes !== nextLanes && (wipLanes & suspendedLanes) === 0 && (suspendedLanes = nextLanes & -nextLanes, rootHasPendingCommit = wipLanes & -wipLanes, suspendedLanes >= rootHasPendingCommit || suspendedLanes === 32 && (rootHasPendingCommit & 4194048) !== 0) ? wipLanes : nextLanes;
}
function checkIfRootIsPrerendering(root, renderLanes) {
  return (root.pendingLanes & ~(root.suspendedLanes & ~root.pingedLanes) & renderLanes) === 0;
}
function computeExpirationTime(lane, currentTime) {
  switch (lane) {
    case 1:
    case 2:
    case 4:
    case 8:
    case 64:
      return currentTime + 250;
    case 16:
    case 32:
    case 128:
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
      return currentTime + 5000;
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
      return -1;
    case 67108864:
    case 134217728:
    case 268435456:
    case 536870912:
    case 1073741824:
      return -1;
    default:
      return -1;
  }
}
function claimNextRetryLane() {
  var lane = nextRetryLane;
  nextRetryLane <<= 1;
  (nextRetryLane & 62914560) === 0 && (nextRetryLane = 4194304);
  return lane;
}
function createLaneMap(initial) {
  for (var laneMap = [], i = 0;31 > i; i++)
    laneMap.push(initial);
  return laneMap;
}
function markRootUpdated$1(root, updateLane) {
  root.pendingLanes |= updateLane;
  updateLane !== 268435456 && (root.suspendedLanes = 0, root.pingedLanes = 0, root.warmLanes = 0);
}
function markRootFinished(root, finishedLanes, remainingLanes, spawnedLane, updatedLanes, suspendedRetryLanes) {
  var previouslyPendingLanes = root.pendingLanes;
  root.pendingLanes = remainingLanes;
  root.suspendedLanes = 0;
  root.pingedLanes = 0;
  root.warmLanes = 0;
  root.expiredLanes &= remainingLanes;
  root.entangledLanes &= remainingLanes;
  root.errorRecoveryDisabledLanes &= remainingLanes;
  root.shellSuspendCounter = 0;
  var { entanglements, expirationTimes, hiddenUpdates } = root;
  for (remainingLanes = previouslyPendingLanes & ~remainingLanes;0 < remainingLanes; ) {
    var index$7 = 31 - clz32(remainingLanes), lane = 1 << index$7;
    entanglements[index$7] = 0;
    expirationTimes[index$7] = -1;
    var hiddenUpdatesForLane = hiddenUpdates[index$7];
    if (hiddenUpdatesForLane !== null)
      for (hiddenUpdates[index$7] = null, index$7 = 0;index$7 < hiddenUpdatesForLane.length; index$7++) {
        var update = hiddenUpdatesForLane[index$7];
        update !== null && (update.lane &= -536870913);
      }
    remainingLanes &= ~lane;
  }
  spawnedLane !== 0 && markSpawnedDeferredLane(root, spawnedLane, 0);
  suspendedRetryLanes !== 0 && updatedLanes === 0 && root.tag !== 0 && (root.suspendedLanes |= suspendedRetryLanes & ~(previouslyPendingLanes & ~finishedLanes));
}
function markSpawnedDeferredLane(root, spawnedLane, entangledLanes) {
  root.pendingLanes |= spawnedLane;
  root.suspendedLanes &= ~spawnedLane;
  var spawnedLaneIndex = 31 - clz32(spawnedLane);
  root.entangledLanes |= spawnedLane;
  root.entanglements[spawnedLaneIndex] = root.entanglements[spawnedLaneIndex] | 1073741824 | entangledLanes & 261930;
}
function markRootEntangled(root, entangledLanes) {
  var rootEntangledLanes = root.entangledLanes |= entangledLanes;
  for (root = root.entanglements;rootEntangledLanes; ) {
    var index$8 = 31 - clz32(rootEntangledLanes), lane = 1 << index$8;
    lane & entangledLanes | root[index$8] & entangledLanes && (root[index$8] |= entangledLanes);
    rootEntangledLanes &= ~lane;
  }
}
function getBumpedLaneForHydration(root, renderLanes) {
  var renderLane = renderLanes & -renderLanes;
  renderLane = (renderLane & 42) !== 0 ? 1 : getBumpedLaneForHydrationByLane(renderLane);
  return (renderLane & (root.suspendedLanes | renderLanes)) !== 0 ? 0 : renderLane;
}
function getBumpedLaneForHydrationByLane(lane) {
  switch (lane) {
    case 2:
      lane = 1;
      break;
    case 8:
      lane = 4;
      break;
    case 32:
      lane = 16;
      break;
    case 256:
    case 512:
    case 1024:
    case 2048:
    case 4096:
    case 8192:
    case 16384:
    case 32768:
    case 65536:
    case 131072:
    case 262144:
    case 524288:
    case 1048576:
    case 2097152:
    case 4194304:
    case 8388608:
    case 16777216:
    case 33554432:
      lane = 128;
      break;
    case 268435456:
      lane = 134217728;
      break;
    default:
      lane = 0;
  }
  return lane;
}
function lanesToEventPriority(lanes) {
  lanes &= -lanes;
  return 2 < lanes ? 8 < lanes ? (lanes & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
}
function resolveUpdatePriority() {
  var updatePriority = ReactDOMSharedInternals.p;
  if (updatePriority !== 0)
    return updatePriority;
  updatePriority = window.event;
  return updatePriority === undefined ? 32 : getEventPriority(updatePriority.type);
}
function runWithPriority(priority, fn) {
  var previousPriority = ReactDOMSharedInternals.p;
  try {
    return ReactDOMSharedInternals.p = priority, fn();
  } finally {
    ReactDOMSharedInternals.p = previousPriority;
  }
}
function detachDeletedInstance(node) {
  delete node[internalInstanceKey];
  delete node[internalPropsKey];
  delete node[internalEventHandlersKey];
  delete node[internalEventHandlerListenersKey];
  delete node[internalEventHandlesSetKey];
}
function getClosestInstanceFromNode(targetNode) {
  var targetInst = targetNode[internalInstanceKey];
  if (targetInst)
    return targetInst;
  for (var parentNode = targetNode.parentNode;parentNode; ) {
    if (targetInst = parentNode[internalContainerInstanceKey] || parentNode[internalInstanceKey]) {
      parentNode = targetInst.alternate;
      if (targetInst.child !== null || parentNode !== null && parentNode.child !== null)
        for (targetNode = getParentHydrationBoundary(targetNode);targetNode !== null; ) {
          if (parentNode = targetNode[internalInstanceKey])
            return parentNode;
          targetNode = getParentHydrationBoundary(targetNode);
        }
      return targetInst;
    }
    targetNode = parentNode;
    parentNode = targetNode.parentNode;
  }
  return null;
}
function getInstanceFromNode(node) {
  if (node = node[internalInstanceKey] || node[internalContainerInstanceKey]) {
    var tag = node.tag;
    if (tag === 5 || tag === 6 || tag === 13 || tag === 31 || tag === 26 || tag === 27 || tag === 3)
      return node;
  }
  return null;
}
function getNodeFromInstance(inst) {
  var tag = inst.tag;
  if (tag === 5 || tag === 26 || tag === 27 || tag === 6)
    return inst.stateNode;
  throw Error(formatProdErrorMessage(33));
}
function getResourcesFromRoot(root) {
  var resources = root[internalRootNodeResourcesKey];
  resources || (resources = root[internalRootNodeResourcesKey] = { hoistableStyles: new Map, hoistableScripts: new Map });
  return resources;
}
function markNodeAsHoistable(node) {
  node[internalHoistableMarker] = true;
}
function registerTwoPhaseEvent(registrationName, dependencies) {
  registerDirectEvent(registrationName, dependencies);
  registerDirectEvent(registrationName + "Capture", dependencies);
}
function registerDirectEvent(registrationName, dependencies) {
  registrationNameDependencies[registrationName] = dependencies;
  for (registrationName = 0;registrationName < dependencies.length; registrationName++)
    allNativeEvents.add(dependencies[registrationName]);
}
function isAttributeNameSafe(attributeName) {
  if (hasOwnProperty.call(validatedAttributeNameCache, attributeName))
    return true;
  if (hasOwnProperty.call(illegalAttributeNameCache, attributeName))
    return false;
  if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName))
    return validatedAttributeNameCache[attributeName] = true;
  illegalAttributeNameCache[attributeName] = true;
  return false;
}
function setValueForAttribute(node, name, value) {
  if (isAttributeNameSafe(name))
    if (value === null)
      node.removeAttribute(name);
    else {
      switch (typeof value) {
        case "undefined":
        case "function":
        case "symbol":
          node.removeAttribute(name);
          return;
        case "boolean":
          var prefix$10 = name.toLowerCase().slice(0, 5);
          if (prefix$10 !== "data-" && prefix$10 !== "aria-") {
            node.removeAttribute(name);
            return;
          }
      }
      node.setAttribute(name, "" + value);
    }
}
function setValueForKnownAttribute(node, name, value) {
  if (value === null)
    node.removeAttribute(name);
  else {
    switch (typeof value) {
      case "undefined":
      case "function":
      case "symbol":
      case "boolean":
        node.removeAttribute(name);
        return;
    }
    node.setAttribute(name, "" + value);
  }
}
function setValueForNamespacedAttribute(node, namespace, name, value) {
  if (value === null)
    node.removeAttribute(name);
  else {
    switch (typeof value) {
      case "undefined":
      case "function":
      case "symbol":
      case "boolean":
        node.removeAttribute(name);
        return;
    }
    node.setAttributeNS(namespace, name, "" + value);
  }
}
function getToStringValue(value) {
  switch (typeof value) {
    case "bigint":
    case "boolean":
    case "number":
    case "string":
    case "undefined":
      return value;
    case "object":
      return value;
    default:
      return "";
  }
}
function isCheckable(elem) {
  var type = elem.type;
  return (elem = elem.nodeName) && elem.toLowerCase() === "input" && (type === "checkbox" || type === "radio");
}
function trackValueOnNode(node, valueField, currentValue) {
  var descriptor = Object.getOwnPropertyDescriptor(node.constructor.prototype, valueField);
  if (!node.hasOwnProperty(valueField) && typeof descriptor !== "undefined" && typeof descriptor.get === "function" && typeof descriptor.set === "function") {
    var { get, set } = descriptor;
    Object.defineProperty(node, valueField, {
      configurable: true,
      get: function() {
        return get.call(this);
      },
      set: function(value) {
        currentValue = "" + value;
        set.call(this, value);
      }
    });
    Object.defineProperty(node, valueField, {
      enumerable: descriptor.enumerable
    });
    return {
      getValue: function() {
        return currentValue;
      },
      setValue: function(value) {
        currentValue = "" + value;
      },
      stopTracking: function() {
        node._valueTracker = null;
        delete node[valueField];
      }
    };
  }
}
function track(node) {
  if (!node._valueTracker) {
    var valueField = isCheckable(node) ? "checked" : "value";
    node._valueTracker = trackValueOnNode(node, valueField, "" + node[valueField]);
  }
}
function updateValueIfChanged(node) {
  if (!node)
    return false;
  var tracker = node._valueTracker;
  if (!tracker)
    return true;
  var lastValue = tracker.getValue();
  var value = "";
  node && (value = isCheckable(node) ? node.checked ? "true" : "false" : node.value);
  node = value;
  return node !== lastValue ? (tracker.setValue(node), true) : false;
}
function getActiveElement(doc) {
  doc = doc || (typeof document !== "undefined" ? document : undefined);
  if (typeof doc === "undefined")
    return null;
  try {
    return doc.activeElement || doc.body;
  } catch (e) {
    return doc.body;
  }
}
function escapeSelectorAttributeValueInsideDoubleQuotes(value) {
  return value.replace(escapeSelectorAttributeValueInsideDoubleQuotesRegex, function(ch) {
    return "\\" + ch.charCodeAt(0).toString(16) + " ";
  });
}
function updateInput(element, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name) {
  element.name = "";
  type != null && typeof type !== "function" && typeof type !== "symbol" && typeof type !== "boolean" ? element.type = type : element.removeAttribute("type");
  if (value != null)
    if (type === "number") {
      if (value === 0 && element.value === "" || element.value != value)
        element.value = "" + getToStringValue(value);
    } else
      element.value !== "" + getToStringValue(value) && (element.value = "" + getToStringValue(value));
  else
    type !== "submit" && type !== "reset" || element.removeAttribute("value");
  value != null ? setDefaultValue(element, type, getToStringValue(value)) : defaultValue != null ? setDefaultValue(element, type, getToStringValue(defaultValue)) : lastDefaultValue != null && element.removeAttribute("value");
  checked == null && defaultChecked != null && (element.defaultChecked = !!defaultChecked);
  checked != null && (element.checked = checked && typeof checked !== "function" && typeof checked !== "symbol");
  name != null && typeof name !== "function" && typeof name !== "symbol" && typeof name !== "boolean" ? element.name = "" + getToStringValue(name) : element.removeAttribute("name");
}
function initInput(element, value, defaultValue, checked, defaultChecked, type, name, isHydrating) {
  type != null && typeof type !== "function" && typeof type !== "symbol" && typeof type !== "boolean" && (element.type = type);
  if (value != null || defaultValue != null) {
    if (!(type !== "submit" && type !== "reset" || value !== undefined && value !== null)) {
      track(element);
      return;
    }
    defaultValue = defaultValue != null ? "" + getToStringValue(defaultValue) : "";
    value = value != null ? "" + getToStringValue(value) : defaultValue;
    isHydrating || value === element.value || (element.value = value);
    element.defaultValue = value;
  }
  checked = checked != null ? checked : defaultChecked;
  checked = typeof checked !== "function" && typeof checked !== "symbol" && !!checked;
  element.checked = isHydrating ? element.checked : !!checked;
  element.defaultChecked = !!checked;
  name != null && typeof name !== "function" && typeof name !== "symbol" && typeof name !== "boolean" && (element.name = name);
  track(element);
}
function setDefaultValue(node, type, value) {
  type === "number" && getActiveElement(node.ownerDocument) === node || node.defaultValue === "" + value || (node.defaultValue = "" + value);
}
function updateOptions(node, multiple, propValue, setDefaultSelected) {
  node = node.options;
  if (multiple) {
    multiple = {};
    for (var i = 0;i < propValue.length; i++)
      multiple["$" + propValue[i]] = true;
    for (propValue = 0;propValue < node.length; propValue++)
      i = multiple.hasOwnProperty("$" + node[propValue].value), node[propValue].selected !== i && (node[propValue].selected = i), i && setDefaultSelected && (node[propValue].defaultSelected = true);
  } else {
    propValue = "" + getToStringValue(propValue);
    multiple = null;
    for (i = 0;i < node.length; i++) {
      if (node[i].value === propValue) {
        node[i].selected = true;
        setDefaultSelected && (node[i].defaultSelected = true);
        return;
      }
      multiple !== null || node[i].disabled || (multiple = node[i]);
    }
    multiple !== null && (multiple.selected = true);
  }
}
function updateTextarea(element, value, defaultValue) {
  if (value != null && (value = "" + getToStringValue(value), value !== element.value && (element.value = value), defaultValue == null)) {
    element.defaultValue !== value && (element.defaultValue = value);
    return;
  }
  element.defaultValue = defaultValue != null ? "" + getToStringValue(defaultValue) : "";
}
function initTextarea(element, value, defaultValue, children) {
  if (value == null) {
    if (children != null) {
      if (defaultValue != null)
        throw Error(formatProdErrorMessage(92));
      if (isArrayImpl(children)) {
        if (1 < children.length)
          throw Error(formatProdErrorMessage(93));
        children = children[0];
      }
      defaultValue = children;
    }
    defaultValue == null && (defaultValue = "");
    value = defaultValue;
  }
  defaultValue = getToStringValue(value);
  element.defaultValue = defaultValue;
  children = element.textContent;
  children === defaultValue && children !== "" && children !== null && (element.value = children);
  track(element);
}
function setTextContent(node, text) {
  if (text) {
    var firstChild = node.firstChild;
    if (firstChild && firstChild === node.lastChild && firstChild.nodeType === 3) {
      firstChild.nodeValue = text;
      return;
    }
  }
  node.textContent = text;
}
function setValueForStyle(style, styleName, value) {
  var isCustomProperty = styleName.indexOf("--") === 0;
  value == null || typeof value === "boolean" || value === "" ? isCustomProperty ? style.setProperty(styleName, "") : styleName === "float" ? style.cssFloat = "" : style[styleName] = "" : isCustomProperty ? style.setProperty(styleName, value) : typeof value !== "number" || value === 0 || unitlessNumbers.has(styleName) ? styleName === "float" ? style.cssFloat = value : style[styleName] = ("" + value).trim() : style[styleName] = value + "px";
}
function setValueForStyles(node, styles, prevStyles) {
  if (styles != null && typeof styles !== "object")
    throw Error(formatProdErrorMessage(62));
  node = node.style;
  if (prevStyles != null) {
    for (var styleName in prevStyles)
      !prevStyles.hasOwnProperty(styleName) || styles != null && styles.hasOwnProperty(styleName) || (styleName.indexOf("--") === 0 ? node.setProperty(styleName, "") : styleName === "float" ? node.cssFloat = "" : node[styleName] = "");
    for (var styleName$16 in styles)
      styleName = styles[styleName$16], styles.hasOwnProperty(styleName$16) && prevStyles[styleName$16] !== styleName && setValueForStyle(node, styleName$16, styleName);
  } else
    for (var styleName$17 in styles)
      styles.hasOwnProperty(styleName$17) && setValueForStyle(node, styleName$17, styles[styleName$17]);
}
function isCustomElement(tagName) {
  if (tagName.indexOf("-") === -1)
    return false;
  switch (tagName) {
    case "annotation-xml":
    case "color-profile":
    case "font-face":
    case "font-face-src":
    case "font-face-uri":
    case "font-face-format":
    case "font-face-name":
    case "missing-glyph":
      return false;
    default:
      return true;
  }
}
function sanitizeURL(url) {
  return isJavaScriptProtocol.test("" + url) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : url;
}
function noop$1() {}
function getEventTarget(nativeEvent) {
  nativeEvent = nativeEvent.target || nativeEvent.srcElement || window;
  nativeEvent.correspondingUseElement && (nativeEvent = nativeEvent.correspondingUseElement);
  return nativeEvent.nodeType === 3 ? nativeEvent.parentNode : nativeEvent;
}
function restoreStateOfTarget(target) {
  var internalInstance = getInstanceFromNode(target);
  if (internalInstance && (target = internalInstance.stateNode)) {
    var props = target[internalPropsKey] || null;
    a:
      switch (target = internalInstance.stateNode, internalInstance.type) {
        case "input":
          updateInput(target, props.value, props.defaultValue, props.defaultValue, props.checked, props.defaultChecked, props.type, props.name);
          internalInstance = props.name;
          if (props.type === "radio" && internalInstance != null) {
            for (props = target;props.parentNode; )
              props = props.parentNode;
            props = props.querySelectorAll('input[name="' + escapeSelectorAttributeValueInsideDoubleQuotes("" + internalInstance) + '"][type="radio"]');
            for (internalInstance = 0;internalInstance < props.length; internalInstance++) {
              var otherNode = props[internalInstance];
              if (otherNode !== target && otherNode.form === target.form) {
                var otherProps = otherNode[internalPropsKey] || null;
                if (!otherProps)
                  throw Error(formatProdErrorMessage(90));
                updateInput(otherNode, otherProps.value, otherProps.defaultValue, otherProps.defaultValue, otherProps.checked, otherProps.defaultChecked, otherProps.type, otherProps.name);
              }
            }
            for (internalInstance = 0;internalInstance < props.length; internalInstance++)
              otherNode = props[internalInstance], otherNode.form === target.form && updateValueIfChanged(otherNode);
          }
          break a;
        case "textarea":
          updateTextarea(target, props.value, props.defaultValue);
          break a;
        case "select":
          internalInstance = props.value, internalInstance != null && updateOptions(target, !!props.multiple, internalInstance, false);
      }
  }
}
function batchedUpdates$1(fn, a, b) {
  if (isInsideEventHandler)
    return fn(a, b);
  isInsideEventHandler = true;
  try {
    var JSCompiler_inline_result = fn(a);
    return JSCompiler_inline_result;
  } finally {
    if (isInsideEventHandler = false, restoreTarget !== null || restoreQueue !== null) {
      if (flushSyncWork$1(), restoreTarget && (a = restoreTarget, fn = restoreQueue, restoreQueue = restoreTarget = null, restoreStateOfTarget(a), fn))
        for (a = 0;a < fn.length; a++)
          restoreStateOfTarget(fn[a]);
    }
  }
}
function getListener(inst, registrationName) {
  var stateNode = inst.stateNode;
  if (stateNode === null)
    return null;
  var props = stateNode[internalPropsKey] || null;
  if (props === null)
    return null;
  stateNode = props[registrationName];
  a:
    switch (registrationName) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        (props = !props.disabled) || (inst = inst.type, props = !(inst === "button" || inst === "input" || inst === "select" || inst === "textarea"));
        inst = !props;
        break a;
      default:
        inst = false;
    }
  if (inst)
    return null;
  if (stateNode && typeof stateNode !== "function")
    throw Error(formatProdErrorMessage(231, registrationName, typeof stateNode));
  return stateNode;
}
function getData() {
  if (fallbackText)
    return fallbackText;
  var start, startValue = startText, startLength = startValue.length, end, endValue = "value" in root ? root.value : root.textContent, endLength = endValue.length;
  for (start = 0;start < startLength && startValue[start] === endValue[start]; start++)
    ;
  var minEnd = startLength - start;
  for (end = 1;end <= minEnd && startValue[startLength - end] === endValue[endLength - end]; end++)
    ;
  return fallbackText = endValue.slice(start, 1 < end ? 1 - end : undefined);
}
function getEventCharCode(nativeEvent) {
  var keyCode = nativeEvent.keyCode;
  "charCode" in nativeEvent ? (nativeEvent = nativeEvent.charCode, nativeEvent === 0 && keyCode === 13 && (nativeEvent = 13)) : nativeEvent = keyCode;
  nativeEvent === 10 && (nativeEvent = 13);
  return 32 <= nativeEvent || nativeEvent === 13 ? nativeEvent : 0;
}
function functionThatReturnsTrue() {
  return true;
}
function functionThatReturnsFalse() {
  return false;
}
function createSyntheticEvent(Interface) {
  function SyntheticBaseEvent(reactName, reactEventType, targetInst, nativeEvent, nativeEventTarget) {
    this._reactName = reactName;
    this._targetInst = targetInst;
    this.type = reactEventType;
    this.nativeEvent = nativeEvent;
    this.target = nativeEventTarget;
    this.currentTarget = null;
    for (var propName in Interface)
      Interface.hasOwnProperty(propName) && (reactName = Interface[propName], this[propName] = reactName ? reactName(nativeEvent) : nativeEvent[propName]);
    this.isDefaultPrevented = (nativeEvent.defaultPrevented != null ? nativeEvent.defaultPrevented : nativeEvent.returnValue === false) ? functionThatReturnsTrue : functionThatReturnsFalse;
    this.isPropagationStopped = functionThatReturnsFalse;
    return this;
  }
  assign(SyntheticBaseEvent.prototype, {
    preventDefault: function() {
      this.defaultPrevented = true;
      var event = this.nativeEvent;
      event && (event.preventDefault ? event.preventDefault() : typeof event.returnValue !== "unknown" && (event.returnValue = false), this.isDefaultPrevented = functionThatReturnsTrue);
    },
    stopPropagation: function() {
      var event = this.nativeEvent;
      event && (event.stopPropagation ? event.stopPropagation() : typeof event.cancelBubble !== "unknown" && (event.cancelBubble = true), this.isPropagationStopped = functionThatReturnsTrue);
    },
    persist: function() {},
    isPersistent: functionThatReturnsTrue
  });
  return SyntheticBaseEvent;
}
function modifierStateGetter(keyArg) {
  var nativeEvent = this.nativeEvent;
  return nativeEvent.getModifierState ? nativeEvent.getModifierState(keyArg) : (keyArg = modifierKeyToProp[keyArg]) ? !!nativeEvent[keyArg] : false;
}
function getEventModifierState() {
  return modifierStateGetter;
}
function isFallbackCompositionEnd(domEventName, nativeEvent) {
  switch (domEventName) {
    case "keyup":
      return END_KEYCODES.indexOf(nativeEvent.keyCode) !== -1;
    case "keydown":
      return nativeEvent.keyCode !== 229;
    case "keypress":
    case "mousedown":
    case "focusout":
      return true;
    default:
      return false;
  }
}
function getDataFromCustomEvent(nativeEvent) {
  nativeEvent = nativeEvent.detail;
  return typeof nativeEvent === "object" && "data" in nativeEvent ? nativeEvent.data : null;
}
function getNativeBeforeInputChars(domEventName, nativeEvent) {
  switch (domEventName) {
    case "compositionend":
      return getDataFromCustomEvent(nativeEvent);
    case "keypress":
      if (nativeEvent.which !== 32)
        return null;
      hasSpaceKeypress = true;
      return SPACEBAR_CHAR;
    case "textInput":
      return domEventName = nativeEvent.data, domEventName === SPACEBAR_CHAR && hasSpaceKeypress ? null : domEventName;
    default:
      return null;
  }
}
function getFallbackBeforeInputChars(domEventName, nativeEvent) {
  if (isComposing)
    return domEventName === "compositionend" || !canUseCompositionEvent && isFallbackCompositionEnd(domEventName, nativeEvent) ? (domEventName = getData(), fallbackText = startText = root = null, isComposing = false, domEventName) : null;
  switch (domEventName) {
    case "paste":
      return null;
    case "keypress":
      if (!(nativeEvent.ctrlKey || nativeEvent.altKey || nativeEvent.metaKey) || nativeEvent.ctrlKey && nativeEvent.altKey) {
        if (nativeEvent.char && 1 < nativeEvent.char.length)
          return nativeEvent.char;
        if (nativeEvent.which)
          return String.fromCharCode(nativeEvent.which);
      }
      return null;
    case "compositionend":
      return useFallbackCompositionData && nativeEvent.locale !== "ko" ? null : nativeEvent.data;
    default:
      return null;
  }
}
function isTextInputElement(elem) {
  var nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
  return nodeName === "input" ? !!supportedInputTypes[elem.type] : nodeName === "textarea" ? true : false;
}
function createAndAccumulateChangeEvent(dispatchQueue, inst, nativeEvent, target) {
  restoreTarget ? restoreQueue ? restoreQueue.push(target) : restoreQueue = [target] : restoreTarget = target;
  inst = accumulateTwoPhaseListeners(inst, "onChange");
  0 < inst.length && (nativeEvent = new SyntheticEvent("onChange", "change", null, nativeEvent, target), dispatchQueue.push({ event: nativeEvent, listeners: inst }));
}
function runEventInBatch(dispatchQueue) {
  processDispatchQueue(dispatchQueue, 0);
}
function getInstIfValueChanged(targetInst) {
  var targetNode = getNodeFromInstance(targetInst);
  if (updateValueIfChanged(targetNode))
    return targetInst;
}
function getTargetInstForChangeEvent(domEventName, targetInst) {
  if (domEventName === "change")
    return targetInst;
}
function stopWatchingForValueChange() {
  activeElement$1 && (activeElement$1.detachEvent("onpropertychange", handlePropertyChange), activeElementInst$1 = activeElement$1 = null);
}
function handlePropertyChange(nativeEvent) {
  if (nativeEvent.propertyName === "value" && getInstIfValueChanged(activeElementInst$1)) {
    var dispatchQueue = [];
    createAndAccumulateChangeEvent(dispatchQueue, activeElementInst$1, nativeEvent, getEventTarget(nativeEvent));
    batchedUpdates$1(runEventInBatch, dispatchQueue);
  }
}
function handleEventsForInputEventPolyfill(domEventName, target, targetInst) {
  domEventName === "focusin" ? (stopWatchingForValueChange(), activeElement$1 = target, activeElementInst$1 = targetInst, activeElement$1.attachEvent("onpropertychange", handlePropertyChange)) : domEventName === "focusout" && stopWatchingForValueChange();
}
function getTargetInstForInputEventPolyfill(domEventName) {
  if (domEventName === "selectionchange" || domEventName === "keyup" || domEventName === "keydown")
    return getInstIfValueChanged(activeElementInst$1);
}
function getTargetInstForClickEvent(domEventName, targetInst) {
  if (domEventName === "click")
    return getInstIfValueChanged(targetInst);
}
function getTargetInstForInputOrChangeEvent(domEventName, targetInst) {
  if (domEventName === "input" || domEventName === "change")
    return getInstIfValueChanged(targetInst);
}
function is(x, y) {
  return x === y && (x !== 0 || 1 / x === 1 / y) || x !== x && y !== y;
}
function shallowEqual(objA, objB) {
  if (objectIs(objA, objB))
    return true;
  if (typeof objA !== "object" || objA === null || typeof objB !== "object" || objB === null)
    return false;
  var keysA = Object.keys(objA), keysB = Object.keys(objB);
  if (keysA.length !== keysB.length)
    return false;
  for (keysB = 0;keysB < keysA.length; keysB++) {
    var currentKey = keysA[keysB];
    if (!hasOwnProperty.call(objB, currentKey) || !objectIs(objA[currentKey], objB[currentKey]))
      return false;
  }
  return true;
}
function getLeafNode(node) {
  for (;node && node.firstChild; )
    node = node.firstChild;
  return node;
}
function getNodeForCharacterOffset(root2, offset) {
  var node = getLeafNode(root2);
  root2 = 0;
  for (var nodeEnd;node; ) {
    if (node.nodeType === 3) {
      nodeEnd = root2 + node.textContent.length;
      if (root2 <= offset && nodeEnd >= offset)
        return { node, offset: offset - root2 };
      root2 = nodeEnd;
    }
    a: {
      for (;node; ) {
        if (node.nextSibling) {
          node = node.nextSibling;
          break a;
        }
        node = node.parentNode;
      }
      node = undefined;
    }
    node = getLeafNode(node);
  }
}
function containsNode(outerNode, innerNode) {
  return outerNode && innerNode ? outerNode === innerNode ? true : outerNode && outerNode.nodeType === 3 ? false : innerNode && innerNode.nodeType === 3 ? containsNode(outerNode, innerNode.parentNode) : ("contains" in outerNode) ? outerNode.contains(innerNode) : outerNode.compareDocumentPosition ? !!(outerNode.compareDocumentPosition(innerNode) & 16) : false : false;
}
function getActiveElementDeep(containerInfo) {
  containerInfo = containerInfo != null && containerInfo.ownerDocument != null && containerInfo.ownerDocument.defaultView != null ? containerInfo.ownerDocument.defaultView : window;
  for (var element = getActiveElement(containerInfo.document);element instanceof containerInfo.HTMLIFrameElement; ) {
    try {
      var JSCompiler_inline_result = typeof element.contentWindow.location.href === "string";
    } catch (err) {
      JSCompiler_inline_result = false;
    }
    if (JSCompiler_inline_result)
      containerInfo = element.contentWindow;
    else
      break;
    element = getActiveElement(containerInfo.document);
  }
  return element;
}
function hasSelectionCapabilities(elem) {
  var nodeName = elem && elem.nodeName && elem.nodeName.toLowerCase();
  return nodeName && (nodeName === "input" && (elem.type === "text" || elem.type === "search" || elem.type === "tel" || elem.type === "url" || elem.type === "password") || nodeName === "textarea" || elem.contentEditable === "true");
}
function constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget) {
  var doc = nativeEventTarget.window === nativeEventTarget ? nativeEventTarget.document : nativeEventTarget.nodeType === 9 ? nativeEventTarget : nativeEventTarget.ownerDocument;
  mouseDown || activeElement == null || activeElement !== getActiveElement(doc) || (doc = activeElement, ("selectionStart" in doc) && hasSelectionCapabilities(doc) ? doc = { start: doc.selectionStart, end: doc.selectionEnd } : (doc = (doc.ownerDocument && doc.ownerDocument.defaultView || window).getSelection(), doc = {
    anchorNode: doc.anchorNode,
    anchorOffset: doc.anchorOffset,
    focusNode: doc.focusNode,
    focusOffset: doc.focusOffset
  }), lastSelection && shallowEqual(lastSelection, doc) || (lastSelection = doc, doc = accumulateTwoPhaseListeners(activeElementInst, "onSelect"), 0 < doc.length && (nativeEvent = new SyntheticEvent("onSelect", "select", null, nativeEvent, nativeEventTarget), dispatchQueue.push({ event: nativeEvent, listeners: doc }), nativeEvent.target = activeElement)));
}
function makePrefixMap(styleProp, eventName) {
  var prefixes = {};
  prefixes[styleProp.toLowerCase()] = eventName.toLowerCase();
  prefixes["Webkit" + styleProp] = "webkit" + eventName;
  prefixes["Moz" + styleProp] = "moz" + eventName;
  return prefixes;
}
function getVendorPrefixedEventName(eventName) {
  if (prefixedEventNames[eventName])
    return prefixedEventNames[eventName];
  if (!vendorPrefixes[eventName])
    return eventName;
  var prefixMap = vendorPrefixes[eventName], styleProp;
  for (styleProp in prefixMap)
    if (prefixMap.hasOwnProperty(styleProp) && styleProp in style)
      return prefixedEventNames[eventName] = prefixMap[styleProp];
  return eventName;
}
function registerSimpleEvent(domEventName, reactName) {
  topLevelEventsToReactNames.set(domEventName, reactName);
  registerTwoPhaseEvent(reactName, [domEventName]);
}
function finishQueueingConcurrentUpdates() {
  for (var endIndex = concurrentQueuesIndex, i = concurrentlyUpdatedLanes = concurrentQueuesIndex = 0;i < endIndex; ) {
    var fiber = concurrentQueues[i];
    concurrentQueues[i++] = null;
    var queue = concurrentQueues[i];
    concurrentQueues[i++] = null;
    var update = concurrentQueues[i];
    concurrentQueues[i++] = null;
    var lane = concurrentQueues[i];
    concurrentQueues[i++] = null;
    if (queue !== null && update !== null) {
      var pending = queue.pending;
      pending === null ? update.next = update : (update.next = pending.next, pending.next = update);
      queue.pending = update;
    }
    lane !== 0 && markUpdateLaneFromFiberToRoot(fiber, update, lane);
  }
}
function enqueueUpdate$1(fiber, queue, update, lane) {
  concurrentQueues[concurrentQueuesIndex++] = fiber;
  concurrentQueues[concurrentQueuesIndex++] = queue;
  concurrentQueues[concurrentQueuesIndex++] = update;
  concurrentQueues[concurrentQueuesIndex++] = lane;
  concurrentlyUpdatedLanes |= lane;
  fiber.lanes |= lane;
  fiber = fiber.alternate;
  fiber !== null && (fiber.lanes |= lane);
}
function enqueueConcurrentHookUpdate(fiber, queue, update, lane) {
  enqueueUpdate$1(fiber, queue, update, lane);
  return getRootForUpdatedFiber(fiber);
}
function enqueueConcurrentRenderForLane(fiber, lane) {
  enqueueUpdate$1(fiber, null, null, lane);
  return getRootForUpdatedFiber(fiber);
}
function markUpdateLaneFromFiberToRoot(sourceFiber, update, lane) {
  sourceFiber.lanes |= lane;
  var alternate = sourceFiber.alternate;
  alternate !== null && (alternate.lanes |= lane);
  for (var isHidden = false, parent = sourceFiber.return;parent !== null; )
    parent.childLanes |= lane, alternate = parent.alternate, alternate !== null && (alternate.childLanes |= lane), parent.tag === 22 && (sourceFiber = parent.stateNode, sourceFiber === null || sourceFiber._visibility & 1 || (isHidden = true)), sourceFiber = parent, parent = parent.return;
  return sourceFiber.tag === 3 ? (parent = sourceFiber.stateNode, isHidden && update !== null && (isHidden = 31 - clz32(lane), sourceFiber = parent.hiddenUpdates, alternate = sourceFiber[isHidden], alternate === null ? sourceFiber[isHidden] = [update] : alternate.push(update), update.lane = lane | 536870912), parent) : null;
}
function getRootForUpdatedFiber(sourceFiber) {
  if (50 < nestedUpdateCount)
    throw nestedUpdateCount = 0, rootWithNestedUpdates = null, Error(formatProdErrorMessage(185));
  for (var parent = sourceFiber.return;parent !== null; )
    sourceFiber = parent, parent = sourceFiber.return;
  return sourceFiber.tag === 3 ? sourceFiber.stateNode : null;
}
function FiberNode(tag, pendingProps, key, mode) {
  this.tag = tag;
  this.key = key;
  this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null;
  this.index = 0;
  this.refCleanup = this.ref = null;
  this.pendingProps = pendingProps;
  this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null;
  this.mode = mode;
  this.subtreeFlags = this.flags = 0;
  this.deletions = null;
  this.childLanes = this.lanes = 0;
  this.alternate = null;
}
function createFiberImplClass(tag, pendingProps, key, mode) {
  return new FiberNode(tag, pendingProps, key, mode);
}
function shouldConstruct(Component) {
  Component = Component.prototype;
  return !(!Component || !Component.isReactComponent);
}
function createWorkInProgress(current, pendingProps) {
  var workInProgress = current.alternate;
  workInProgress === null ? (workInProgress = createFiberImplClass(current.tag, pendingProps, current.key, current.mode), workInProgress.elementType = current.elementType, workInProgress.type = current.type, workInProgress.stateNode = current.stateNode, workInProgress.alternate = current, current.alternate = workInProgress) : (workInProgress.pendingProps = pendingProps, workInProgress.type = current.type, workInProgress.flags = 0, workInProgress.subtreeFlags = 0, workInProgress.deletions = null);
  workInProgress.flags = current.flags & 65011712;
  workInProgress.childLanes = current.childLanes;
  workInProgress.lanes = current.lanes;
  workInProgress.child = current.child;
  workInProgress.memoizedProps = current.memoizedProps;
  workInProgress.memoizedState = current.memoizedState;
  workInProgress.updateQueue = current.updateQueue;
  pendingProps = current.dependencies;
  workInProgress.dependencies = pendingProps === null ? null : { lanes: pendingProps.lanes, firstContext: pendingProps.firstContext };
  workInProgress.sibling = current.sibling;
  workInProgress.index = current.index;
  workInProgress.ref = current.ref;
  workInProgress.refCleanup = current.refCleanup;
  return workInProgress;
}
function resetWorkInProgress(workInProgress, renderLanes) {
  workInProgress.flags &= 65011714;
  var current = workInProgress.alternate;
  current === null ? (workInProgress.childLanes = 0, workInProgress.lanes = renderLanes, workInProgress.child = null, workInProgress.subtreeFlags = 0, workInProgress.memoizedProps = null, workInProgress.memoizedState = null, workInProgress.updateQueue = null, workInProgress.dependencies = null, workInProgress.stateNode = null) : (workInProgress.childLanes = current.childLanes, workInProgress.lanes = current.lanes, workInProgress.child = current.child, workInProgress.subtreeFlags = 0, workInProgress.deletions = null, workInProgress.memoizedProps = current.memoizedProps, workInProgress.memoizedState = current.memoizedState, workInProgress.updateQueue = current.updateQueue, workInProgress.type = current.type, renderLanes = current.dependencies, workInProgress.dependencies = renderLanes === null ? null : {
    lanes: renderLanes.lanes,
    firstContext: renderLanes.firstContext
  });
  return workInProgress;
}
function createFiberFromTypeAndProps(type, key, pendingProps, owner, mode, lanes) {
  var fiberTag = 0;
  owner = type;
  if (typeof type === "function")
    shouldConstruct(type) && (fiberTag = 1);
  else if (typeof type === "string")
    fiberTag = isHostHoistableType(type, pendingProps, contextStackCursor.current) ? 26 : type === "html" || type === "head" || type === "body" ? 27 : 5;
  else
    a:
      switch (type) {
        case REACT_ACTIVITY_TYPE:
          return type = createFiberImplClass(31, pendingProps, key, mode), type.elementType = REACT_ACTIVITY_TYPE, type.lanes = lanes, type;
        case REACT_FRAGMENT_TYPE:
          return createFiberFromFragment(pendingProps.children, mode, lanes, key);
        case REACT_STRICT_MODE_TYPE:
          fiberTag = 8;
          mode |= 24;
          break;
        case REACT_PROFILER_TYPE:
          return type = createFiberImplClass(12, pendingProps, key, mode | 2), type.elementType = REACT_PROFILER_TYPE, type.lanes = lanes, type;
        case REACT_SUSPENSE_TYPE:
          return type = createFiberImplClass(13, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_TYPE, type.lanes = lanes, type;
        case REACT_SUSPENSE_LIST_TYPE:
          return type = createFiberImplClass(19, pendingProps, key, mode), type.elementType = REACT_SUSPENSE_LIST_TYPE, type.lanes = lanes, type;
        default:
          if (typeof type === "object" && type !== null)
            switch (type.$$typeof) {
              case REACT_CONTEXT_TYPE:
                fiberTag = 10;
                break a;
              case REACT_CONSUMER_TYPE:
                fiberTag = 9;
                break a;
              case REACT_FORWARD_REF_TYPE:
                fiberTag = 11;
                break a;
              case REACT_MEMO_TYPE:
                fiberTag = 14;
                break a;
              case REACT_LAZY_TYPE:
                fiberTag = 16;
                owner = null;
                break a;
            }
          fiberTag = 29;
          pendingProps = Error(formatProdErrorMessage(130, type === null ? "null" : typeof type, ""));
          owner = null;
      }
  key = createFiberImplClass(fiberTag, pendingProps, key, mode);
  key.elementType = type;
  key.type = owner;
  key.lanes = lanes;
  return key;
}
function createFiberFromFragment(elements, mode, lanes, key) {
  elements = createFiberImplClass(7, elements, key, mode);
  elements.lanes = lanes;
  return elements;
}
function createFiberFromText(content, mode, lanes) {
  content = createFiberImplClass(6, content, null, mode);
  content.lanes = lanes;
  return content;
}
function createFiberFromDehydratedFragment(dehydratedNode) {
  var fiber = createFiberImplClass(18, null, null, 0);
  fiber.stateNode = dehydratedNode;
  return fiber;
}
function createFiberFromPortal(portal, mode, lanes) {
  mode = createFiberImplClass(4, portal.children !== null ? portal.children : [], portal.key, mode);
  mode.lanes = lanes;
  mode.stateNode = {
    containerInfo: portal.containerInfo,
    pendingChildren: null,
    implementation: portal.implementation
  };
  return mode;
}
function createCapturedValueAtFiber(value, source) {
  if (typeof value === "object" && value !== null) {
    var existing = CapturedStacks.get(value);
    if (existing !== undefined)
      return existing;
    source = {
      value,
      source,
      stack: getStackByFiberInDevAndProd(source)
    };
    CapturedStacks.set(value, source);
    return source;
  }
  return {
    value,
    source,
    stack: getStackByFiberInDevAndProd(source)
  };
}
function pushTreeFork(workInProgress, totalChildren) {
  forkStack[forkStackIndex++] = treeForkCount;
  forkStack[forkStackIndex++] = treeForkProvider;
  treeForkProvider = workInProgress;
  treeForkCount = totalChildren;
}
function pushTreeId(workInProgress, totalChildren, index2) {
  idStack[idStackIndex++] = treeContextId;
  idStack[idStackIndex++] = treeContextOverflow;
  idStack[idStackIndex++] = treeContextProvider;
  treeContextProvider = workInProgress;
  var baseIdWithLeadingBit = treeContextId;
  workInProgress = treeContextOverflow;
  var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
  baseIdWithLeadingBit &= ~(1 << baseLength);
  index2 += 1;
  var length = 32 - clz32(totalChildren) + baseLength;
  if (30 < length) {
    var numberOfOverflowBits = baseLength - baseLength % 5;
    length = (baseIdWithLeadingBit & (1 << numberOfOverflowBits) - 1).toString(32);
    baseIdWithLeadingBit >>= numberOfOverflowBits;
    baseLength -= numberOfOverflowBits;
    treeContextId = 1 << 32 - clz32(totalChildren) + baseLength | index2 << baseLength | baseIdWithLeadingBit;
    treeContextOverflow = length + workInProgress;
  } else
    treeContextId = 1 << length | index2 << baseLength | baseIdWithLeadingBit, treeContextOverflow = workInProgress;
}
function pushMaterializedTreeId(workInProgress) {
  workInProgress.return !== null && (pushTreeFork(workInProgress, 1), pushTreeId(workInProgress, 1, 0));
}
function popTreeContext(workInProgress) {
  for (;workInProgress === treeForkProvider; )
    treeForkProvider = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null, treeForkCount = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null;
  for (;workInProgress === treeContextProvider; )
    treeContextProvider = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextOverflow = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextId = idStack[--idStackIndex], idStack[idStackIndex] = null;
}
function restoreSuspendedTreeContext(workInProgress, suspendedContext) {
  idStack[idStackIndex++] = treeContextId;
  idStack[idStackIndex++] = treeContextOverflow;
  idStack[idStackIndex++] = treeContextProvider;
  treeContextId = suspendedContext.id;
  treeContextOverflow = suspendedContext.overflow;
  treeContextProvider = workInProgress;
}
function throwOnHydrationMismatch(fiber) {
  var error = Error(formatProdErrorMessage(418, 1 < arguments.length && arguments[1] !== undefined && arguments[1] ? "text" : "HTML", ""));
  queueHydrationError(createCapturedValueAtFiber(error, fiber));
  throw HydrationMismatchException;
}
function prepareToHydrateHostInstance(fiber) {
  var { stateNode: instance, type, memoizedProps: props } = fiber;
  instance[internalInstanceKey] = fiber;
  instance[internalPropsKey] = props;
  switch (type) {
    case "dialog":
      listenToNonDelegatedEvent("cancel", instance);
      listenToNonDelegatedEvent("close", instance);
      break;
    case "iframe":
    case "object":
    case "embed":
      listenToNonDelegatedEvent("load", instance);
      break;
    case "video":
    case "audio":
      for (type = 0;type < mediaEventTypes.length; type++)
        listenToNonDelegatedEvent(mediaEventTypes[type], instance);
      break;
    case "source":
      listenToNonDelegatedEvent("error", instance);
      break;
    case "img":
    case "image":
    case "link":
      listenToNonDelegatedEvent("error", instance);
      listenToNonDelegatedEvent("load", instance);
      break;
    case "details":
      listenToNonDelegatedEvent("toggle", instance);
      break;
    case "input":
      listenToNonDelegatedEvent("invalid", instance);
      initInput(instance, props.value, props.defaultValue, props.checked, props.defaultChecked, props.type, props.name, true);
      break;
    case "select":
      listenToNonDelegatedEvent("invalid", instance);
      break;
    case "textarea":
      listenToNonDelegatedEvent("invalid", instance), initTextarea(instance, props.value, props.defaultValue, props.children);
  }
  type = props.children;
  typeof type !== "string" && typeof type !== "number" && typeof type !== "bigint" || instance.textContent === "" + type || props.suppressHydrationWarning === true || checkForUnmatchedText(instance.textContent, type) ? (props.popover != null && (listenToNonDelegatedEvent("beforetoggle", instance), listenToNonDelegatedEvent("toggle", instance)), props.onScroll != null && listenToNonDelegatedEvent("scroll", instance), props.onScrollEnd != null && listenToNonDelegatedEvent("scrollend", instance), props.onClick != null && (instance.onclick = noop$1), instance = true) : instance = false;
  instance || throwOnHydrationMismatch(fiber, true);
}
function popToNextHostParent(fiber) {
  for (hydrationParentFiber = fiber.return;hydrationParentFiber; )
    switch (hydrationParentFiber.tag) {
      case 5:
      case 31:
      case 13:
        rootOrSingletonContext = false;
        return;
      case 27:
      case 3:
        rootOrSingletonContext = true;
        return;
      default:
        hydrationParentFiber = hydrationParentFiber.return;
    }
}
function popHydrationState(fiber) {
  if (fiber !== hydrationParentFiber)
    return false;
  if (!isHydrating)
    return popToNextHostParent(fiber), isHydrating = true, false;
  var tag = fiber.tag, JSCompiler_temp;
  if (JSCompiler_temp = tag !== 3 && tag !== 27) {
    if (JSCompiler_temp = tag === 5)
      JSCompiler_temp = fiber.type, JSCompiler_temp = !(JSCompiler_temp !== "form" && JSCompiler_temp !== "button") || shouldSetTextContent(fiber.type, fiber.memoizedProps);
    JSCompiler_temp = !JSCompiler_temp;
  }
  JSCompiler_temp && nextHydratableInstance && throwOnHydrationMismatch(fiber);
  popToNextHostParent(fiber);
  if (tag === 13) {
    fiber = fiber.memoizedState;
    fiber = fiber !== null ? fiber.dehydrated : null;
    if (!fiber)
      throw Error(formatProdErrorMessage(317));
    nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
  } else if (tag === 31) {
    fiber = fiber.memoizedState;
    fiber = fiber !== null ? fiber.dehydrated : null;
    if (!fiber)
      throw Error(formatProdErrorMessage(317));
    nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
  } else
    tag === 27 ? (tag = nextHydratableInstance, isSingletonScope(fiber.type) ? (fiber = previousHydratableOnEnteringScopedSingleton, previousHydratableOnEnteringScopedSingleton = null, nextHydratableInstance = fiber) : nextHydratableInstance = tag) : nextHydratableInstance = hydrationParentFiber ? getNextHydratable(fiber.stateNode.nextSibling) : null;
  return true;
}
function resetHydrationState() {
  nextHydratableInstance = hydrationParentFiber = null;
  isHydrating = false;
}
function upgradeHydrationErrorsToRecoverable() {
  var queuedErrors = hydrationErrors;
  queuedErrors !== null && (workInProgressRootRecoverableErrors === null ? workInProgressRootRecoverableErrors = queuedErrors : workInProgressRootRecoverableErrors.push.apply(workInProgressRootRecoverableErrors, queuedErrors), hydrationErrors = null);
  return queuedErrors;
}
function queueHydrationError(error) {
  hydrationErrors === null ? hydrationErrors = [error] : hydrationErrors.push(error);
}
function pushProvider(providerFiber, context, nextValue) {
  push2(valueCursor, context._currentValue);
  context._currentValue = nextValue;
}
function popProvider(context) {
  context._currentValue = valueCursor.current;
  pop2(valueCursor);
}
function scheduleContextWorkOnParentPath(parent, renderLanes, propagationRoot) {
  for (;parent !== null; ) {
    var alternate = parent.alternate;
    (parent.childLanes & renderLanes) !== renderLanes ? (parent.childLanes |= renderLanes, alternate !== null && (alternate.childLanes |= renderLanes)) : alternate !== null && (alternate.childLanes & renderLanes) !== renderLanes && (alternate.childLanes |= renderLanes);
    if (parent === propagationRoot)
      break;
    parent = parent.return;
  }
}
function propagateContextChanges(workInProgress, contexts, renderLanes, forcePropagateEntireTree) {
  var fiber = workInProgress.child;
  fiber !== null && (fiber.return = workInProgress);
  for (;fiber !== null; ) {
    var list = fiber.dependencies;
    if (list !== null) {
      var nextFiber = fiber.child;
      list = list.firstContext;
      a:
        for (;list !== null; ) {
          var dependency = list;
          list = fiber;
          for (var i = 0;i < contexts.length; i++)
            if (dependency.context === contexts[i]) {
              list.lanes |= renderLanes;
              dependency = list.alternate;
              dependency !== null && (dependency.lanes |= renderLanes);
              scheduleContextWorkOnParentPath(list.return, renderLanes, workInProgress);
              forcePropagateEntireTree || (nextFiber = null);
              break a;
            }
          list = dependency.next;
        }
    } else if (fiber.tag === 18) {
      nextFiber = fiber.return;
      if (nextFiber === null)
        throw Error(formatProdErrorMessage(341));
      nextFiber.lanes |= renderLanes;
      list = nextFiber.alternate;
      list !== null && (list.lanes |= renderLanes);
      scheduleContextWorkOnParentPath(nextFiber, renderLanes, workInProgress);
      nextFiber = null;
    } else
      nextFiber = fiber.child;
    if (nextFiber !== null)
      nextFiber.return = fiber;
    else
      for (nextFiber = fiber;nextFiber !== null; ) {
        if (nextFiber === workInProgress) {
          nextFiber = null;
          break;
        }
        fiber = nextFiber.sibling;
        if (fiber !== null) {
          fiber.return = nextFiber.return;
          nextFiber = fiber;
          break;
        }
        nextFiber = nextFiber.return;
      }
    fiber = nextFiber;
  }
}
function propagateParentContextChanges(current, workInProgress, renderLanes, forcePropagateEntireTree) {
  current = null;
  for (var parent = workInProgress, isInsidePropagationBailout = false;parent !== null; ) {
    if (!isInsidePropagationBailout) {
      if ((parent.flags & 524288) !== 0)
        isInsidePropagationBailout = true;
      else if ((parent.flags & 262144) !== 0)
        break;
    }
    if (parent.tag === 10) {
      var currentParent = parent.alternate;
      if (currentParent === null)
        throw Error(formatProdErrorMessage(387));
      currentParent = currentParent.memoizedProps;
      if (currentParent !== null) {
        var context = parent.type;
        objectIs(parent.pendingProps.value, currentParent.value) || (current !== null ? current.push(context) : current = [context]);
      }
    } else if (parent === hostTransitionProviderCursor.current) {
      currentParent = parent.alternate;
      if (currentParent === null)
        throw Error(formatProdErrorMessage(387));
      currentParent.memoizedState.memoizedState !== parent.memoizedState.memoizedState && (current !== null ? current.push(HostTransitionContext) : current = [HostTransitionContext]);
    }
    parent = parent.return;
  }
  current !== null && propagateContextChanges(workInProgress, current, renderLanes, forcePropagateEntireTree);
  workInProgress.flags |= 262144;
}
function checkIfContextChanged(currentDependencies) {
  for (currentDependencies = currentDependencies.firstContext;currentDependencies !== null; ) {
    if (!objectIs(currentDependencies.context._currentValue, currentDependencies.memoizedValue))
      return true;
    currentDependencies = currentDependencies.next;
  }
  return false;
}
function prepareToReadContext(workInProgress) {
  currentlyRenderingFiber$1 = workInProgress;
  lastContextDependency = null;
  workInProgress = workInProgress.dependencies;
  workInProgress !== null && (workInProgress.firstContext = null);
}
function readContext(context) {
  return readContextForConsumer(currentlyRenderingFiber$1, context);
}
function readContextDuringReconciliation(consumer, context) {
  currentlyRenderingFiber$1 === null && prepareToReadContext(consumer);
  return readContextForConsumer(consumer, context);
}
function readContextForConsumer(consumer, context) {
  var value = context._currentValue;
  context = { context, memoizedValue: value, next: null };
  if (lastContextDependency === null) {
    if (consumer === null)
      throw Error(formatProdErrorMessage(308));
    lastContextDependency = context;
    consumer.dependencies = { lanes: 0, firstContext: context };
    consumer.flags |= 524288;
  } else
    lastContextDependency = lastContextDependency.next = context;
  return value;
}
function createCache() {
  return {
    controller: new AbortControllerLocal,
    data: new Map,
    refCount: 0
  };
}
function releaseCache(cache) {
  cache.refCount--;
  cache.refCount === 0 && scheduleCallback$2(NormalPriority, function() {
    cache.controller.abort();
  });
}
function entangleAsyncAction(transition, thenable) {
  if (currentEntangledListeners === null) {
    var entangledListeners = currentEntangledListeners = [];
    currentEntangledPendingCount = 0;
    currentEntangledLane = requestTransitionLane();
    currentEntangledActionThenable = {
      status: "pending",
      value: undefined,
      then: function(resolve) {
        entangledListeners.push(resolve);
      }
    };
  }
  currentEntangledPendingCount++;
  thenable.then(pingEngtangledActionScope, pingEngtangledActionScope);
  return thenable;
}
function pingEngtangledActionScope() {
  if (--currentEntangledPendingCount === 0 && currentEntangledListeners !== null) {
    currentEntangledActionThenable !== null && (currentEntangledActionThenable.status = "fulfilled");
    var listeners = currentEntangledListeners;
    currentEntangledListeners = null;
    currentEntangledLane = 0;
    currentEntangledActionThenable = null;
    for (var i = 0;i < listeners.length; i++)
      (0, listeners[i])();
  }
}
function chainThenableValue(thenable, result) {
  var listeners = [], thenableWithOverride = {
    status: "pending",
    value: null,
    reason: null,
    then: function(resolve) {
      listeners.push(resolve);
    }
  };
  thenable.then(function() {
    thenableWithOverride.status = "fulfilled";
    thenableWithOverride.value = result;
    for (var i = 0;i < listeners.length; i++)
      (0, listeners[i])(result);
  }, function(error) {
    thenableWithOverride.status = "rejected";
    thenableWithOverride.reason = error;
    for (error = 0;error < listeners.length; error++)
      (0, listeners[error])(undefined);
  });
  return thenableWithOverride;
}
function peekCacheFromPool() {
  var cacheResumedFromPreviousRender = resumedCache.current;
  return cacheResumedFromPreviousRender !== null ? cacheResumedFromPreviousRender : workInProgressRoot.pooledCache;
}
function pushTransition(offscreenWorkInProgress, prevCachePool) {
  prevCachePool === null ? push2(resumedCache, resumedCache.current) : push2(resumedCache, prevCachePool.pool);
}
function getSuspendedCache() {
  var cacheFromPool = peekCacheFromPool();
  return cacheFromPool === null ? null : { parent: CacheContext._currentValue, pool: cacheFromPool };
}
function isThenableResolved(thenable) {
  thenable = thenable.status;
  return thenable === "fulfilled" || thenable === "rejected";
}
function trackUsedThenable(thenableState, thenable, index2) {
  index2 = thenableState[index2];
  index2 === undefined ? thenableState.push(thenable) : index2 !== thenable && (thenable.then(noop$1, noop$1), thenable = index2);
  switch (thenable.status) {
    case "fulfilled":
      return thenable.value;
    case "rejected":
      throw thenableState = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState), thenableState;
    default:
      if (typeof thenable.status === "string")
        thenable.then(noop$1, noop$1);
      else {
        thenableState = workInProgressRoot;
        if (thenableState !== null && 100 < thenableState.shellSuspendCounter)
          throw Error(formatProdErrorMessage(482));
        thenableState = thenable;
        thenableState.status = "pending";
        thenableState.then(function(fulfilledValue) {
          if (thenable.status === "pending") {
            var fulfilledThenable = thenable;
            fulfilledThenable.status = "fulfilled";
            fulfilledThenable.value = fulfilledValue;
          }
        }, function(error) {
          if (thenable.status === "pending") {
            var rejectedThenable = thenable;
            rejectedThenable.status = "rejected";
            rejectedThenable.reason = error;
          }
        });
      }
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenableState = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState), thenableState;
      }
      suspendedThenable = thenable;
      throw SuspenseException;
  }
}
function resolveLazy(lazyType) {
  try {
    var init = lazyType._init;
    return init(lazyType._payload);
  } catch (x) {
    if (x !== null && typeof x === "object" && typeof x.then === "function")
      throw suspendedThenable = x, SuspenseException;
    throw x;
  }
}
function getSuspendedThenable() {
  if (suspendedThenable === null)
    throw Error(formatProdErrorMessage(459));
  var thenable = suspendedThenable;
  suspendedThenable = null;
  return thenable;
}
function checkIfUseWrappedInAsyncCatch(rejectedReason) {
  if (rejectedReason === SuspenseException || rejectedReason === SuspenseActionException)
    throw Error(formatProdErrorMessage(483));
}
function unwrapThenable(thenable) {
  var index2 = thenableIndexCounter$1;
  thenableIndexCounter$1 += 1;
  thenableState$1 === null && (thenableState$1 = []);
  return trackUsedThenable(thenableState$1, thenable, index2);
}
function coerceRef(workInProgress, element) {
  element = element.props.ref;
  workInProgress.ref = element !== undefined ? element : null;
}
function throwOnInvalidObjectTypeImpl(returnFiber, newChild) {
  if (newChild.$$typeof === REACT_LEGACY_ELEMENT_TYPE)
    throw Error(formatProdErrorMessage(525));
  returnFiber = Object.prototype.toString.call(newChild);
  throw Error(formatProdErrorMessage(31, returnFiber === "[object Object]" ? "object with keys {" + Object.keys(newChild).join(", ") + "}" : returnFiber));
}
function createChildReconciler(shouldTrackSideEffects) {
  function deleteChild(returnFiber, childToDelete) {
    if (shouldTrackSideEffects) {
      var deletions = returnFiber.deletions;
      deletions === null ? (returnFiber.deletions = [childToDelete], returnFiber.flags |= 16) : deletions.push(childToDelete);
    }
  }
  function deleteRemainingChildren(returnFiber, currentFirstChild) {
    if (!shouldTrackSideEffects)
      return null;
    for (;currentFirstChild !== null; )
      deleteChild(returnFiber, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
    return null;
  }
  function mapRemainingChildren(currentFirstChild) {
    for (var existingChildren = new Map;currentFirstChild !== null; )
      currentFirstChild.key !== null ? existingChildren.set(currentFirstChild.key, currentFirstChild) : existingChildren.set(currentFirstChild.index, currentFirstChild), currentFirstChild = currentFirstChild.sibling;
    return existingChildren;
  }
  function useFiber(fiber, pendingProps) {
    fiber = createWorkInProgress(fiber, pendingProps);
    fiber.index = 0;
    fiber.sibling = null;
    return fiber;
  }
  function placeChild(newFiber, lastPlacedIndex, newIndex) {
    newFiber.index = newIndex;
    if (!shouldTrackSideEffects)
      return newFiber.flags |= 1048576, lastPlacedIndex;
    newIndex = newFiber.alternate;
    if (newIndex !== null)
      return newIndex = newIndex.index, newIndex < lastPlacedIndex ? (newFiber.flags |= 67108866, lastPlacedIndex) : newIndex;
    newFiber.flags |= 67108866;
    return lastPlacedIndex;
  }
  function placeSingleChild(newFiber) {
    shouldTrackSideEffects && newFiber.alternate === null && (newFiber.flags |= 67108866);
    return newFiber;
  }
  function updateTextNode(returnFiber, current, textContent, lanes) {
    if (current === null || current.tag !== 6)
      return current = createFiberFromText(textContent, returnFiber.mode, lanes), current.return = returnFiber, current;
    current = useFiber(current, textContent);
    current.return = returnFiber;
    return current;
  }
  function updateElement(returnFiber, current, element, lanes) {
    var elementType = element.type;
    if (elementType === REACT_FRAGMENT_TYPE)
      return updateFragment(returnFiber, current, element.props.children, lanes, element.key);
    if (current !== null && (current.elementType === elementType || typeof elementType === "object" && elementType !== null && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === current.type))
      return current = useFiber(current, element.props), coerceRef(current, element), current.return = returnFiber, current;
    current = createFiberFromTypeAndProps(element.type, element.key, element.props, null, returnFiber.mode, lanes);
    coerceRef(current, element);
    current.return = returnFiber;
    return current;
  }
  function updatePortal(returnFiber, current, portal, lanes) {
    if (current === null || current.tag !== 4 || current.stateNode.containerInfo !== portal.containerInfo || current.stateNode.implementation !== portal.implementation)
      return current = createFiberFromPortal(portal, returnFiber.mode, lanes), current.return = returnFiber, current;
    current = useFiber(current, portal.children || []);
    current.return = returnFiber;
    return current;
  }
  function updateFragment(returnFiber, current, fragment, lanes, key) {
    if (current === null || current.tag !== 7)
      return current = createFiberFromFragment(fragment, returnFiber.mode, lanes, key), current.return = returnFiber, current;
    current = useFiber(current, fragment);
    current.return = returnFiber;
    return current;
  }
  function createChild(returnFiber, newChild, lanes) {
    if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
      return newChild = createFiberFromText("" + newChild, returnFiber.mode, lanes), newChild.return = returnFiber, newChild;
    if (typeof newChild === "object" && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return lanes = createFiberFromTypeAndProps(newChild.type, newChild.key, newChild.props, null, returnFiber.mode, lanes), coerceRef(lanes, newChild), lanes.return = returnFiber, lanes;
        case REACT_PORTAL_TYPE:
          return newChild = createFiberFromPortal(newChild, returnFiber.mode, lanes), newChild.return = returnFiber, newChild;
        case REACT_LAZY_TYPE:
          return newChild = resolveLazy(newChild), createChild(returnFiber, newChild, lanes);
      }
      if (isArrayImpl(newChild) || getIteratorFn(newChild))
        return newChild = createFiberFromFragment(newChild, returnFiber.mode, lanes, null), newChild.return = returnFiber, newChild;
      if (typeof newChild.then === "function")
        return createChild(returnFiber, unwrapThenable(newChild), lanes);
      if (newChild.$$typeof === REACT_CONTEXT_TYPE)
        return createChild(returnFiber, readContextDuringReconciliation(returnFiber, newChild), lanes);
      throwOnInvalidObjectTypeImpl(returnFiber, newChild);
    }
    return null;
  }
  function updateSlot(returnFiber, oldFiber, newChild, lanes) {
    var key = oldFiber !== null ? oldFiber.key : null;
    if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
      return key !== null ? null : updateTextNode(returnFiber, oldFiber, "" + newChild, lanes);
    if (typeof newChild === "object" && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return newChild.key === key ? updateElement(returnFiber, oldFiber, newChild, lanes) : null;
        case REACT_PORTAL_TYPE:
          return newChild.key === key ? updatePortal(returnFiber, oldFiber, newChild, lanes) : null;
        case REACT_LAZY_TYPE:
          return newChild = resolveLazy(newChild), updateSlot(returnFiber, oldFiber, newChild, lanes);
      }
      if (isArrayImpl(newChild) || getIteratorFn(newChild))
        return key !== null ? null : updateFragment(returnFiber, oldFiber, newChild, lanes, null);
      if (typeof newChild.then === "function")
        return updateSlot(returnFiber, oldFiber, unwrapThenable(newChild), lanes);
      if (newChild.$$typeof === REACT_CONTEXT_TYPE)
        return updateSlot(returnFiber, oldFiber, readContextDuringReconciliation(returnFiber, newChild), lanes);
      throwOnInvalidObjectTypeImpl(returnFiber, newChild);
    }
    return null;
  }
  function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
    if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
      return existingChildren = existingChildren.get(newIdx) || null, updateTextNode(returnFiber, existingChildren, "" + newChild, lanes);
    if (typeof newChild === "object" && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          return existingChildren = existingChildren.get(newChild.key === null ? newIdx : newChild.key) || null, updateElement(returnFiber, existingChildren, newChild, lanes);
        case REACT_PORTAL_TYPE:
          return existingChildren = existingChildren.get(newChild.key === null ? newIdx : newChild.key) || null, updatePortal(returnFiber, existingChildren, newChild, lanes);
        case REACT_LAZY_TYPE:
          return newChild = resolveLazy(newChild), updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes);
      }
      if (isArrayImpl(newChild) || getIteratorFn(newChild))
        return existingChildren = existingChildren.get(newIdx) || null, updateFragment(returnFiber, existingChildren, newChild, lanes, null);
      if (typeof newChild.then === "function")
        return updateFromMap(existingChildren, returnFiber, newIdx, unwrapThenable(newChild), lanes);
      if (newChild.$$typeof === REACT_CONTEXT_TYPE)
        return updateFromMap(existingChildren, returnFiber, newIdx, readContextDuringReconciliation(returnFiber, newChild), lanes);
      throwOnInvalidObjectTypeImpl(returnFiber, newChild);
    }
    return null;
  }
  function reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes) {
    for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null;oldFiber !== null && newIdx < newChildren.length; newIdx++) {
      oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
      var newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], lanes);
      if (newFiber === null) {
        oldFiber === null && (oldFiber = nextOldFiber);
        break;
      }
      shouldTrackSideEffects && oldFiber && newFiber.alternate === null && deleteChild(returnFiber, oldFiber);
      currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
      previousNewFiber === null ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }
    if (newIdx === newChildren.length)
      return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
    if (oldFiber === null) {
      for (;newIdx < newChildren.length; newIdx++)
        oldFiber = createChild(returnFiber, newChildren[newIdx], lanes), oldFiber !== null && (currentFirstChild = placeChild(oldFiber, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = oldFiber : previousNewFiber.sibling = oldFiber, previousNewFiber = oldFiber);
      isHydrating && pushTreeFork(returnFiber, newIdx);
      return resultingFirstChild;
    }
    for (oldFiber = mapRemainingChildren(oldFiber);newIdx < newChildren.length; newIdx++)
      nextOldFiber = updateFromMap(oldFiber, returnFiber, newIdx, newChildren[newIdx], lanes), nextOldFiber !== null && (shouldTrackSideEffects && nextOldFiber.alternate !== null && oldFiber.delete(nextOldFiber.key === null ? newIdx : nextOldFiber.key), currentFirstChild = placeChild(nextOldFiber, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = nextOldFiber : previousNewFiber.sibling = nextOldFiber, previousNewFiber = nextOldFiber);
    shouldTrackSideEffects && oldFiber.forEach(function(child) {
      return deleteChild(returnFiber, child);
    });
    isHydrating && pushTreeFork(returnFiber, newIdx);
    return resultingFirstChild;
  }
  function reconcileChildrenIterator(returnFiber, currentFirstChild, newChildren, lanes) {
    if (newChildren == null)
      throw Error(formatProdErrorMessage(151));
    for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null, step = newChildren.next();oldFiber !== null && !step.done; newIdx++, step = newChildren.next()) {
      oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
      var newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
      if (newFiber === null) {
        oldFiber === null && (oldFiber = nextOldFiber);
        break;
      }
      shouldTrackSideEffects && oldFiber && newFiber.alternate === null && deleteChild(returnFiber, oldFiber);
      currentFirstChild = placeChild(newFiber, currentFirstChild, newIdx);
      previousNewFiber === null ? resultingFirstChild = newFiber : previousNewFiber.sibling = newFiber;
      previousNewFiber = newFiber;
      oldFiber = nextOldFiber;
    }
    if (step.done)
      return deleteRemainingChildren(returnFiber, oldFiber), isHydrating && pushTreeFork(returnFiber, newIdx), resultingFirstChild;
    if (oldFiber === null) {
      for (;!step.done; newIdx++, step = newChildren.next())
        step = createChild(returnFiber, step.value, lanes), step !== null && (currentFirstChild = placeChild(step, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
      isHydrating && pushTreeFork(returnFiber, newIdx);
      return resultingFirstChild;
    }
    for (oldFiber = mapRemainingChildren(oldFiber);!step.done; newIdx++, step = newChildren.next())
      step = updateFromMap(oldFiber, returnFiber, newIdx, step.value, lanes), step !== null && (shouldTrackSideEffects && step.alternate !== null && oldFiber.delete(step.key === null ? newIdx : step.key), currentFirstChild = placeChild(step, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = step : previousNewFiber.sibling = step, previousNewFiber = step);
    shouldTrackSideEffects && oldFiber.forEach(function(child) {
      return deleteChild(returnFiber, child);
    });
    isHydrating && pushTreeFork(returnFiber, newIdx);
    return resultingFirstChild;
  }
  function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
    typeof newChild === "object" && newChild !== null && newChild.type === REACT_FRAGMENT_TYPE && newChild.key === null && (newChild = newChild.props.children);
    if (typeof newChild === "object" && newChild !== null) {
      switch (newChild.$$typeof) {
        case REACT_ELEMENT_TYPE:
          a: {
            for (var key = newChild.key;currentFirstChild !== null; ) {
              if (currentFirstChild.key === key) {
                key = newChild.type;
                if (key === REACT_FRAGMENT_TYPE) {
                  if (currentFirstChild.tag === 7) {
                    deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                    lanes = useFiber(currentFirstChild, newChild.props.children);
                    lanes.return = returnFiber;
                    returnFiber = lanes;
                    break a;
                  }
                } else if (currentFirstChild.elementType === key || typeof key === "object" && key !== null && key.$$typeof === REACT_LAZY_TYPE && resolveLazy(key) === currentFirstChild.type) {
                  deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                  lanes = useFiber(currentFirstChild, newChild.props);
                  coerceRef(lanes, newChild);
                  lanes.return = returnFiber;
                  returnFiber = lanes;
                  break a;
                }
                deleteRemainingChildren(returnFiber, currentFirstChild);
                break;
              } else
                deleteChild(returnFiber, currentFirstChild);
              currentFirstChild = currentFirstChild.sibling;
            }
            newChild.type === REACT_FRAGMENT_TYPE ? (lanes = createFiberFromFragment(newChild.props.children, returnFiber.mode, lanes, newChild.key), lanes.return = returnFiber, returnFiber = lanes) : (lanes = createFiberFromTypeAndProps(newChild.type, newChild.key, newChild.props, null, returnFiber.mode, lanes), coerceRef(lanes, newChild), lanes.return = returnFiber, returnFiber = lanes);
          }
          return placeSingleChild(returnFiber);
        case REACT_PORTAL_TYPE:
          a: {
            for (key = newChild.key;currentFirstChild !== null; ) {
              if (currentFirstChild.key === key)
                if (currentFirstChild.tag === 4 && currentFirstChild.stateNode.containerInfo === newChild.containerInfo && currentFirstChild.stateNode.implementation === newChild.implementation) {
                  deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                  lanes = useFiber(currentFirstChild, newChild.children || []);
                  lanes.return = returnFiber;
                  returnFiber = lanes;
                  break a;
                } else {
                  deleteRemainingChildren(returnFiber, currentFirstChild);
                  break;
                }
              else
                deleteChild(returnFiber, currentFirstChild);
              currentFirstChild = currentFirstChild.sibling;
            }
            lanes = createFiberFromPortal(newChild, returnFiber.mode, lanes);
            lanes.return = returnFiber;
            returnFiber = lanes;
          }
          return placeSingleChild(returnFiber);
        case REACT_LAZY_TYPE:
          return newChild = resolveLazy(newChild), reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes);
      }
      if (isArrayImpl(newChild))
        return reconcileChildrenArray(returnFiber, currentFirstChild, newChild, lanes);
      if (getIteratorFn(newChild)) {
        key = getIteratorFn(newChild);
        if (typeof key !== "function")
          throw Error(formatProdErrorMessage(150));
        newChild = key.call(newChild);
        return reconcileChildrenIterator(returnFiber, currentFirstChild, newChild, lanes);
      }
      if (typeof newChild.then === "function")
        return reconcileChildFibersImpl(returnFiber, currentFirstChild, unwrapThenable(newChild), lanes);
      if (newChild.$$typeof === REACT_CONTEXT_TYPE)
        return reconcileChildFibersImpl(returnFiber, currentFirstChild, readContextDuringReconciliation(returnFiber, newChild), lanes);
      throwOnInvalidObjectTypeImpl(returnFiber, newChild);
    }
    return typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint" ? (newChild = "" + newChild, currentFirstChild !== null && currentFirstChild.tag === 6 ? (deleteRemainingChildren(returnFiber, currentFirstChild.sibling), lanes = useFiber(currentFirstChild, newChild), lanes.return = returnFiber, returnFiber = lanes) : (deleteRemainingChildren(returnFiber, currentFirstChild), lanes = createFiberFromText(newChild, returnFiber.mode, lanes), lanes.return = returnFiber, returnFiber = lanes), placeSingleChild(returnFiber)) : deleteRemainingChildren(returnFiber, currentFirstChild);
  }
  return function(returnFiber, currentFirstChild, newChild, lanes) {
    try {
      thenableIndexCounter$1 = 0;
      var firstChildFiber = reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes);
      thenableState$1 = null;
      return firstChildFiber;
    } catch (x) {
      if (x === SuspenseException || x === SuspenseActionException)
        throw x;
      var fiber = createFiberImplClass(29, x, null, returnFiber.mode);
      fiber.lanes = lanes;
      fiber.return = returnFiber;
      return fiber;
    } finally {}
  };
}
function initializeUpdateQueue(fiber) {
  fiber.updateQueue = {
    baseState: fiber.memoizedState,
    firstBaseUpdate: null,
    lastBaseUpdate: null,
    shared: { pending: null, lanes: 0, hiddenCallbacks: null },
    callbacks: null
  };
}
function cloneUpdateQueue(current, workInProgress) {
  current = current.updateQueue;
  workInProgress.updateQueue === current && (workInProgress.updateQueue = {
    baseState: current.baseState,
    firstBaseUpdate: current.firstBaseUpdate,
    lastBaseUpdate: current.lastBaseUpdate,
    shared: current.shared,
    callbacks: null
  });
}
function createUpdate(lane) {
  return { lane, tag: 0, payload: null, callback: null, next: null };
}
function enqueueUpdate(fiber, update, lane) {
  var updateQueue = fiber.updateQueue;
  if (updateQueue === null)
    return null;
  updateQueue = updateQueue.shared;
  if ((executionContext & 2) !== 0) {
    var pending = updateQueue.pending;
    pending === null ? update.next = update : (update.next = pending.next, pending.next = update);
    updateQueue.pending = update;
    update = getRootForUpdatedFiber(fiber);
    markUpdateLaneFromFiberToRoot(fiber, null, lane);
    return update;
  }
  enqueueUpdate$1(fiber, updateQueue, update, lane);
  return getRootForUpdatedFiber(fiber);
}
function entangleTransitions(root2, fiber, lane) {
  fiber = fiber.updateQueue;
  if (fiber !== null && (fiber = fiber.shared, (lane & 4194048) !== 0)) {
    var queueLanes = fiber.lanes;
    queueLanes &= root2.pendingLanes;
    lane |= queueLanes;
    fiber.lanes = lane;
    markRootEntangled(root2, lane);
  }
}
function enqueueCapturedUpdate(workInProgress, capturedUpdate) {
  var { updateQueue: queue, alternate: current } = workInProgress;
  if (current !== null && (current = current.updateQueue, queue === current)) {
    var newFirst = null, newLast = null;
    queue = queue.firstBaseUpdate;
    if (queue !== null) {
      do {
        var clone = {
          lane: queue.lane,
          tag: queue.tag,
          payload: queue.payload,
          callback: null,
          next: null
        };
        newLast === null ? newFirst = newLast = clone : newLast = newLast.next = clone;
        queue = queue.next;
      } while (queue !== null);
      newLast === null ? newFirst = newLast = capturedUpdate : newLast = newLast.next = capturedUpdate;
    } else
      newFirst = newLast = capturedUpdate;
    queue = {
      baseState: current.baseState,
      firstBaseUpdate: newFirst,
      lastBaseUpdate: newLast,
      shared: current.shared,
      callbacks: current.callbacks
    };
    workInProgress.updateQueue = queue;
    return;
  }
  workInProgress = queue.lastBaseUpdate;
  workInProgress === null ? queue.firstBaseUpdate = capturedUpdate : workInProgress.next = capturedUpdate;
  queue.lastBaseUpdate = capturedUpdate;
}
function suspendIfUpdateReadFromEntangledAsyncAction() {
  if (didReadFromEntangledAsyncAction) {
    var entangledActionThenable = currentEntangledActionThenable;
    if (entangledActionThenable !== null)
      throw entangledActionThenable;
  }
}
function processUpdateQueue(workInProgress$jscomp$0, props, instance$jscomp$0, renderLanes) {
  didReadFromEntangledAsyncAction = false;
  var queue = workInProgress$jscomp$0.updateQueue;
  hasForceUpdate = false;
  var { firstBaseUpdate, lastBaseUpdate } = queue, pendingQueue = queue.shared.pending;
  if (pendingQueue !== null) {
    queue.shared.pending = null;
    var lastPendingUpdate = pendingQueue, firstPendingUpdate = lastPendingUpdate.next;
    lastPendingUpdate.next = null;
    lastBaseUpdate === null ? firstBaseUpdate = firstPendingUpdate : lastBaseUpdate.next = firstPendingUpdate;
    lastBaseUpdate = lastPendingUpdate;
    var current = workInProgress$jscomp$0.alternate;
    current !== null && (current = current.updateQueue, pendingQueue = current.lastBaseUpdate, pendingQueue !== lastBaseUpdate && (pendingQueue === null ? current.firstBaseUpdate = firstPendingUpdate : pendingQueue.next = firstPendingUpdate, current.lastBaseUpdate = lastPendingUpdate));
  }
  if (firstBaseUpdate !== null) {
    var newState = queue.baseState;
    lastBaseUpdate = 0;
    current = firstPendingUpdate = lastPendingUpdate = null;
    pendingQueue = firstBaseUpdate;
    do {
      var updateLane = pendingQueue.lane & -536870913, isHiddenUpdate = updateLane !== pendingQueue.lane;
      if (isHiddenUpdate ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes & updateLane) === updateLane) {
        updateLane !== 0 && updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction = true);
        current !== null && (current = current.next = {
          lane: 0,
          tag: pendingQueue.tag,
          payload: pendingQueue.payload,
          callback: null,
          next: null
        });
        a: {
          var workInProgress = workInProgress$jscomp$0, update = pendingQueue;
          updateLane = props;
          var instance = instance$jscomp$0;
          switch (update.tag) {
            case 1:
              workInProgress = update.payload;
              if (typeof workInProgress === "function") {
                newState = workInProgress.call(instance, newState, updateLane);
                break a;
              }
              newState = workInProgress;
              break a;
            case 3:
              workInProgress.flags = workInProgress.flags & -65537 | 128;
            case 0:
              workInProgress = update.payload;
              updateLane = typeof workInProgress === "function" ? workInProgress.call(instance, newState, updateLane) : workInProgress;
              if (updateLane === null || updateLane === undefined)
                break a;
              newState = assign({}, newState, updateLane);
              break a;
            case 2:
              hasForceUpdate = true;
          }
        }
        updateLane = pendingQueue.callback;
        updateLane !== null && (workInProgress$jscomp$0.flags |= 64, isHiddenUpdate && (workInProgress$jscomp$0.flags |= 8192), isHiddenUpdate = queue.callbacks, isHiddenUpdate === null ? queue.callbacks = [updateLane] : isHiddenUpdate.push(updateLane));
      } else
        isHiddenUpdate = {
          lane: updateLane,
          tag: pendingQueue.tag,
          payload: pendingQueue.payload,
          callback: pendingQueue.callback,
          next: null
        }, current === null ? (firstPendingUpdate = current = isHiddenUpdate, lastPendingUpdate = newState) : current = current.next = isHiddenUpdate, lastBaseUpdate |= updateLane;
      pendingQueue = pendingQueue.next;
      if (pendingQueue === null)
        if (pendingQueue = queue.shared.pending, pendingQueue === null)
          break;
        else
          isHiddenUpdate = pendingQueue, pendingQueue = isHiddenUpdate.next, isHiddenUpdate.next = null, queue.lastBaseUpdate = isHiddenUpdate, queue.shared.pending = null;
    } while (1);
    current === null && (lastPendingUpdate = newState);
    queue.baseState = lastPendingUpdate;
    queue.firstBaseUpdate = firstPendingUpdate;
    queue.lastBaseUpdate = current;
    firstBaseUpdate === null && (queue.shared.lanes = 0);
    workInProgressRootSkippedLanes |= lastBaseUpdate;
    workInProgress$jscomp$0.lanes = lastBaseUpdate;
    workInProgress$jscomp$0.memoizedState = newState;
  }
}
function callCallback(callback, context) {
  if (typeof callback !== "function")
    throw Error(formatProdErrorMessage(191, callback));
  callback.call(context);
}
function commitCallbacks(updateQueue, context) {
  var callbacks = updateQueue.callbacks;
  if (callbacks !== null)
    for (updateQueue.callbacks = null, updateQueue = 0;updateQueue < callbacks.length; updateQueue++)
      callCallback(callbacks[updateQueue], context);
}
function pushHiddenContext(fiber, context) {
  fiber = entangledRenderLanes;
  push2(prevEntangledRenderLanesCursor, fiber);
  push2(currentTreeHiddenStackCursor, context);
  entangledRenderLanes = fiber | context.baseLanes;
}
function reuseHiddenContextOnStack() {
  push2(prevEntangledRenderLanesCursor, entangledRenderLanes);
  push2(currentTreeHiddenStackCursor, currentTreeHiddenStackCursor.current);
}
function popHiddenContext() {
  entangledRenderLanes = prevEntangledRenderLanesCursor.current;
  pop2(currentTreeHiddenStackCursor);
  pop2(prevEntangledRenderLanesCursor);
}
function pushPrimaryTreeSuspenseHandler(handler) {
  var current = handler.alternate;
  push2(suspenseStackCursor, suspenseStackCursor.current & 1);
  push2(suspenseHandlerStackCursor, handler);
  shellBoundary === null && (current === null || currentTreeHiddenStackCursor.current !== null ? shellBoundary = handler : current.memoizedState !== null && (shellBoundary = handler));
}
function pushDehydratedActivitySuspenseHandler(fiber) {
  push2(suspenseStackCursor, suspenseStackCursor.current);
  push2(suspenseHandlerStackCursor, fiber);
  shellBoundary === null && (shellBoundary = fiber);
}
function pushOffscreenSuspenseHandler(fiber) {
  fiber.tag === 22 ? (push2(suspenseStackCursor, suspenseStackCursor.current), push2(suspenseHandlerStackCursor, fiber), shellBoundary === null && (shellBoundary = fiber)) : reuseSuspenseHandlerOnStack(fiber);
}
function reuseSuspenseHandlerOnStack() {
  push2(suspenseStackCursor, suspenseStackCursor.current);
  push2(suspenseHandlerStackCursor, suspenseHandlerStackCursor.current);
}
function popSuspenseHandler(fiber) {
  pop2(suspenseHandlerStackCursor);
  shellBoundary === fiber && (shellBoundary = null);
  pop2(suspenseStackCursor);
}
function findFirstSuspended(row) {
  for (var node = row;node !== null; ) {
    if (node.tag === 13) {
      var state = node.memoizedState;
      if (state !== null && (state = state.dehydrated, state === null || isSuspenseInstancePending(state) || isSuspenseInstanceFallback(state)))
        return node;
    } else if (node.tag === 19 && (node.memoizedProps.revealOrder === "forwards" || node.memoizedProps.revealOrder === "backwards" || node.memoizedProps.revealOrder === "unstable_legacy-backwards" || node.memoizedProps.revealOrder === "together")) {
      if ((node.flags & 128) !== 0)
        return node;
    } else if (node.child !== null) {
      node.child.return = node;
      node = node.child;
      continue;
    }
    if (node === row)
      break;
    for (;node.sibling === null; ) {
      if (node.return === null || node.return === row)
        return null;
      node = node.return;
    }
    node.sibling.return = node.return;
    node = node.sibling;
  }
  return null;
}
function throwInvalidHookError() {
  throw Error(formatProdErrorMessage(321));
}
function areHookInputsEqual(nextDeps, prevDeps) {
  if (prevDeps === null)
    return false;
  for (var i = 0;i < prevDeps.length && i < nextDeps.length; i++)
    if (!objectIs(nextDeps[i], prevDeps[i]))
      return false;
  return true;
}
function renderWithHooks(current, workInProgress, Component, props, secondArg, nextRenderLanes) {
  renderLanes = nextRenderLanes;
  currentlyRenderingFiber = workInProgress;
  workInProgress.memoizedState = null;
  workInProgress.updateQueue = null;
  workInProgress.lanes = 0;
  ReactSharedInternals.H = current === null || current.memoizedState === null ? HooksDispatcherOnMount : HooksDispatcherOnUpdate;
  shouldDoubleInvokeUserFnsInHooksDEV = false;
  nextRenderLanes = Component(props, secondArg);
  shouldDoubleInvokeUserFnsInHooksDEV = false;
  didScheduleRenderPhaseUpdateDuringThisPass && (nextRenderLanes = renderWithHooksAgain(workInProgress, Component, props, secondArg));
  finishRenderingHooks(current);
  return nextRenderLanes;
}
function finishRenderingHooks(current) {
  ReactSharedInternals.H = ContextOnlyDispatcher;
  var didRenderTooFewHooks = currentHook !== null && currentHook.next !== null;
  renderLanes = 0;
  workInProgressHook = currentHook = currentlyRenderingFiber = null;
  didScheduleRenderPhaseUpdate = false;
  thenableIndexCounter = 0;
  thenableState = null;
  if (didRenderTooFewHooks)
    throw Error(formatProdErrorMessage(300));
  current === null || didReceiveUpdate || (current = current.dependencies, current !== null && checkIfContextChanged(current) && (didReceiveUpdate = true));
}
function renderWithHooksAgain(workInProgress, Component, props, secondArg) {
  currentlyRenderingFiber = workInProgress;
  var numberOfReRenders = 0;
  do {
    didScheduleRenderPhaseUpdateDuringThisPass && (thenableState = null);
    thenableIndexCounter = 0;
    didScheduleRenderPhaseUpdateDuringThisPass = false;
    if (25 <= numberOfReRenders)
      throw Error(formatProdErrorMessage(301));
    numberOfReRenders += 1;
    workInProgressHook = currentHook = null;
    if (workInProgress.updateQueue != null) {
      var children = workInProgress.updateQueue;
      children.lastEffect = null;
      children.events = null;
      children.stores = null;
      children.memoCache != null && (children.memoCache.index = 0);
    }
    ReactSharedInternals.H = HooksDispatcherOnRerender;
    children = Component(props, secondArg);
  } while (didScheduleRenderPhaseUpdateDuringThisPass);
  return children;
}
function TransitionAwareHostComponent() {
  var dispatcher = ReactSharedInternals.H, maybeThenable = dispatcher.useState()[0];
  maybeThenable = typeof maybeThenable.then === "function" ? useThenable(maybeThenable) : maybeThenable;
  dispatcher = dispatcher.useState()[0];
  (currentHook !== null ? currentHook.memoizedState : null) !== dispatcher && (currentlyRenderingFiber.flags |= 1024);
  return maybeThenable;
}
function checkDidRenderIdHook() {
  var didRenderIdHook = localIdCounter !== 0;
  localIdCounter = 0;
  return didRenderIdHook;
}
function bailoutHooks(current, workInProgress, lanes) {
  workInProgress.updateQueue = current.updateQueue;
  workInProgress.flags &= -2053;
  current.lanes &= ~lanes;
}
function resetHooksOnUnwind(workInProgress) {
  if (didScheduleRenderPhaseUpdate) {
    for (workInProgress = workInProgress.memoizedState;workInProgress !== null; ) {
      var queue = workInProgress.queue;
      queue !== null && (queue.pending = null);
      workInProgress = workInProgress.next;
    }
    didScheduleRenderPhaseUpdate = false;
  }
  renderLanes = 0;
  workInProgressHook = currentHook = currentlyRenderingFiber = null;
  didScheduleRenderPhaseUpdateDuringThisPass = false;
  thenableIndexCounter = localIdCounter = 0;
  thenableState = null;
}
function mountWorkInProgressHook() {
  var hook = {
    memoizedState: null,
    baseState: null,
    baseQueue: null,
    queue: null,
    next: null
  };
  workInProgressHook === null ? currentlyRenderingFiber.memoizedState = workInProgressHook = hook : workInProgressHook = workInProgressHook.next = hook;
  return workInProgressHook;
}
function updateWorkInProgressHook() {
  if (currentHook === null) {
    var nextCurrentHook = currentlyRenderingFiber.alternate;
    nextCurrentHook = nextCurrentHook !== null ? nextCurrentHook.memoizedState : null;
  } else
    nextCurrentHook = currentHook.next;
  var nextWorkInProgressHook = workInProgressHook === null ? currentlyRenderingFiber.memoizedState : workInProgressHook.next;
  if (nextWorkInProgressHook !== null)
    workInProgressHook = nextWorkInProgressHook, currentHook = nextCurrentHook;
  else {
    if (nextCurrentHook === null) {
      if (currentlyRenderingFiber.alternate === null)
        throw Error(formatProdErrorMessage(467));
      throw Error(formatProdErrorMessage(310));
    }
    currentHook = nextCurrentHook;
    nextCurrentHook = {
      memoizedState: currentHook.memoizedState,
      baseState: currentHook.baseState,
      baseQueue: currentHook.baseQueue,
      queue: currentHook.queue,
      next: null
    };
    workInProgressHook === null ? currentlyRenderingFiber.memoizedState = workInProgressHook = nextCurrentHook : workInProgressHook = workInProgressHook.next = nextCurrentHook;
  }
  return workInProgressHook;
}
function createFunctionComponentUpdateQueue() {
  return { lastEffect: null, events: null, stores: null, memoCache: null };
}
function useThenable(thenable) {
  var index2 = thenableIndexCounter;
  thenableIndexCounter += 1;
  thenableState === null && (thenableState = []);
  thenable = trackUsedThenable(thenableState, thenable, index2);
  index2 = currentlyRenderingFiber;
  (workInProgressHook === null ? index2.memoizedState : workInProgressHook.next) === null && (index2 = index2.alternate, ReactSharedInternals.H = index2 === null || index2.memoizedState === null ? HooksDispatcherOnMount : HooksDispatcherOnUpdate);
  return thenable;
}
function use(usable) {
  if (usable !== null && typeof usable === "object") {
    if (typeof usable.then === "function")
      return useThenable(usable);
    if (usable.$$typeof === REACT_CONTEXT_TYPE)
      return readContext(usable);
  }
  throw Error(formatProdErrorMessage(438, String(usable)));
}
function useMemoCache(size) {
  var memoCache = null, updateQueue = currentlyRenderingFiber.updateQueue;
  updateQueue !== null && (memoCache = updateQueue.memoCache);
  if (memoCache == null) {
    var current = currentlyRenderingFiber.alternate;
    current !== null && (current = current.updateQueue, current !== null && (current = current.memoCache, current != null && (memoCache = {
      data: current.data.map(function(array) {
        return array.slice();
      }),
      index: 0
    })));
  }
  memoCache == null && (memoCache = { data: [], index: 0 });
  updateQueue === null && (updateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = updateQueue);
  updateQueue.memoCache = memoCache;
  updateQueue = memoCache.data[memoCache.index];
  if (updateQueue === undefined)
    for (updateQueue = memoCache.data[memoCache.index] = Array(size), current = 0;current < size; current++)
      updateQueue[current] = REACT_MEMO_CACHE_SENTINEL;
  memoCache.index++;
  return updateQueue;
}
function basicStateReducer(state, action) {
  return typeof action === "function" ? action(state) : action;
}
function updateReducer(reducer) {
  var hook = updateWorkInProgressHook();
  return updateReducerImpl(hook, currentHook, reducer);
}
function updateReducerImpl(hook, current, reducer) {
  var queue = hook.queue;
  if (queue === null)
    throw Error(formatProdErrorMessage(311));
  queue.lastRenderedReducer = reducer;
  var baseQueue = hook.baseQueue, pendingQueue = queue.pending;
  if (pendingQueue !== null) {
    if (baseQueue !== null) {
      var baseFirst = baseQueue.next;
      baseQueue.next = pendingQueue.next;
      pendingQueue.next = baseFirst;
    }
    current.baseQueue = baseQueue = pendingQueue;
    queue.pending = null;
  }
  pendingQueue = hook.baseState;
  if (baseQueue === null)
    hook.memoizedState = pendingQueue;
  else {
    current = baseQueue.next;
    var newBaseQueueFirst = baseFirst = null, newBaseQueueLast = null, update = current, didReadFromEntangledAsyncAction$60 = false;
    do {
      var updateLane = update.lane & -536870913;
      if (updateLane !== update.lane ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes & updateLane) === updateLane) {
        var revertLane = update.revertLane;
        if (revertLane === 0)
          newBaseQueueLast !== null && (newBaseQueueLast = newBaseQueueLast.next = {
            lane: 0,
            revertLane: 0,
            gesture: null,
            action: update.action,
            hasEagerState: update.hasEagerState,
            eagerState: update.eagerState,
            next: null
          }), updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction$60 = true);
        else if ((renderLanes & revertLane) === revertLane) {
          update = update.next;
          revertLane === currentEntangledLane && (didReadFromEntangledAsyncAction$60 = true);
          continue;
        } else
          updateLane = {
            lane: 0,
            revertLane: update.revertLane,
            gesture: null,
            action: update.action,
            hasEagerState: update.hasEagerState,
            eagerState: update.eagerState,
            next: null
          }, newBaseQueueLast === null ? (newBaseQueueFirst = newBaseQueueLast = updateLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = updateLane, currentlyRenderingFiber.lanes |= revertLane, workInProgressRootSkippedLanes |= revertLane;
        updateLane = update.action;
        shouldDoubleInvokeUserFnsInHooksDEV && reducer(pendingQueue, updateLane);
        pendingQueue = update.hasEagerState ? update.eagerState : reducer(pendingQueue, updateLane);
      } else
        revertLane = {
          lane: updateLane,
          revertLane: update.revertLane,
          gesture: update.gesture,
          action: update.action,
          hasEagerState: update.hasEagerState,
          eagerState: update.eagerState,
          next: null
        }, newBaseQueueLast === null ? (newBaseQueueFirst = newBaseQueueLast = revertLane, baseFirst = pendingQueue) : newBaseQueueLast = newBaseQueueLast.next = revertLane, currentlyRenderingFiber.lanes |= updateLane, workInProgressRootSkippedLanes |= updateLane;
      update = update.next;
    } while (update !== null && update !== current);
    newBaseQueueLast === null ? baseFirst = pendingQueue : newBaseQueueLast.next = newBaseQueueFirst;
    if (!objectIs(pendingQueue, hook.memoizedState) && (didReceiveUpdate = true, didReadFromEntangledAsyncAction$60 && (reducer = currentEntangledActionThenable, reducer !== null)))
      throw reducer;
    hook.memoizedState = pendingQueue;
    hook.baseState = baseFirst;
    hook.baseQueue = newBaseQueueLast;
    queue.lastRenderedState = pendingQueue;
  }
  baseQueue === null && (queue.lanes = 0);
  return [hook.memoizedState, queue.dispatch];
}
function rerenderReducer(reducer) {
  var hook = updateWorkInProgressHook(), queue = hook.queue;
  if (queue === null)
    throw Error(formatProdErrorMessage(311));
  queue.lastRenderedReducer = reducer;
  var { dispatch, pending: lastRenderPhaseUpdate } = queue, newState = hook.memoizedState;
  if (lastRenderPhaseUpdate !== null) {
    queue.pending = null;
    var update = lastRenderPhaseUpdate = lastRenderPhaseUpdate.next;
    do
      newState = reducer(newState, update.action), update = update.next;
    while (update !== lastRenderPhaseUpdate);
    objectIs(newState, hook.memoizedState) || (didReceiveUpdate = true);
    hook.memoizedState = newState;
    hook.baseQueue === null && (hook.baseState = newState);
    queue.lastRenderedState = newState;
  }
  return [newState, dispatch];
}
function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
  var fiber = currentlyRenderingFiber, hook = updateWorkInProgressHook(), isHydrating$jscomp$0 = isHydrating;
  if (isHydrating$jscomp$0) {
    if (getServerSnapshot === undefined)
      throw Error(formatProdErrorMessage(407));
    getServerSnapshot = getServerSnapshot();
  } else
    getServerSnapshot = getSnapshot();
  var snapshotChanged = !objectIs((currentHook || hook).memoizedState, getServerSnapshot);
  snapshotChanged && (hook.memoizedState = getServerSnapshot, didReceiveUpdate = true);
  hook = hook.queue;
  updateEffect(subscribeToStore.bind(null, fiber, hook, subscribe), [
    subscribe
  ]);
  if (hook.getSnapshot !== getSnapshot || snapshotChanged || workInProgressHook !== null && workInProgressHook.memoizedState.tag & 1) {
    fiber.flags |= 2048;
    pushSimpleEffect(9, { destroy: undefined }, updateStoreInstance.bind(null, fiber, hook, getServerSnapshot, getSnapshot), null);
    if (workInProgressRoot === null)
      throw Error(formatProdErrorMessage(349));
    isHydrating$jscomp$0 || (renderLanes & 127) !== 0 || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
  }
  return getServerSnapshot;
}
function pushStoreConsistencyCheck(fiber, getSnapshot, renderedSnapshot) {
  fiber.flags |= 16384;
  fiber = { getSnapshot, value: renderedSnapshot };
  getSnapshot = currentlyRenderingFiber.updateQueue;
  getSnapshot === null ? (getSnapshot = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = getSnapshot, getSnapshot.stores = [fiber]) : (renderedSnapshot = getSnapshot.stores, renderedSnapshot === null ? getSnapshot.stores = [fiber] : renderedSnapshot.push(fiber));
}
function updateStoreInstance(fiber, inst, nextSnapshot, getSnapshot) {
  inst.value = nextSnapshot;
  inst.getSnapshot = getSnapshot;
  checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
}
function subscribeToStore(fiber, inst, subscribe) {
  return subscribe(function() {
    checkIfSnapshotChanged(inst) && forceStoreRerender(fiber);
  });
}
function checkIfSnapshotChanged(inst) {
  var latestGetSnapshot = inst.getSnapshot;
  inst = inst.value;
  try {
    var nextValue = latestGetSnapshot();
    return !objectIs(inst, nextValue);
  } catch (error) {
    return true;
  }
}
function forceStoreRerender(fiber) {
  var root2 = enqueueConcurrentRenderForLane(fiber, 2);
  root2 !== null && scheduleUpdateOnFiber(root2, fiber, 2);
}
function mountStateImpl(initialState) {
  var hook = mountWorkInProgressHook();
  if (typeof initialState === "function") {
    var initialStateInitializer = initialState;
    initialState = initialStateInitializer();
    if (shouldDoubleInvokeUserFnsInHooksDEV) {
      setIsStrictModeForDevtools(true);
      try {
        initialStateInitializer();
      } finally {
        setIsStrictModeForDevtools(false);
      }
    }
  }
  hook.memoizedState = hook.baseState = initialState;
  hook.queue = {
    pending: null,
    lanes: 0,
    dispatch: null,
    lastRenderedReducer: basicStateReducer,
    lastRenderedState: initialState
  };
  return hook;
}
function updateOptimisticImpl(hook, current, passthrough, reducer) {
  hook.baseState = passthrough;
  return updateReducerImpl(hook, currentHook, typeof reducer === "function" ? reducer : basicStateReducer);
}
function dispatchActionState(fiber, actionQueue, setPendingState, setState, payload) {
  if (isRenderPhaseUpdate(fiber))
    throw Error(formatProdErrorMessage(485));
  fiber = actionQueue.action;
  if (fiber !== null) {
    var actionNode = {
      payload,
      action: fiber,
      next: null,
      isTransition: true,
      status: "pending",
      value: null,
      reason: null,
      listeners: [],
      then: function(listener) {
        actionNode.listeners.push(listener);
      }
    };
    ReactSharedInternals.T !== null ? setPendingState(true) : actionNode.isTransition = false;
    setState(actionNode);
    setPendingState = actionQueue.pending;
    setPendingState === null ? (actionNode.next = actionQueue.pending = actionNode, runActionStateAction(actionQueue, actionNode)) : (actionNode.next = setPendingState.next, actionQueue.pending = setPendingState.next = actionNode);
  }
}
function runActionStateAction(actionQueue, node) {
  var { action, payload } = node, prevState = actionQueue.state;
  if (node.isTransition) {
    var prevTransition = ReactSharedInternals.T, currentTransition = {};
    ReactSharedInternals.T = currentTransition;
    try {
      var returnValue = action(prevState, payload), onStartTransitionFinish = ReactSharedInternals.S;
      onStartTransitionFinish !== null && onStartTransitionFinish(currentTransition, returnValue);
      handleActionReturnValue(actionQueue, node, returnValue);
    } catch (error) {
      onActionError(actionQueue, node, error);
    } finally {
      prevTransition !== null && currentTransition.types !== null && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
    }
  } else
    try {
      prevTransition = action(prevState, payload), handleActionReturnValue(actionQueue, node, prevTransition);
    } catch (error$66) {
      onActionError(actionQueue, node, error$66);
    }
}
function handleActionReturnValue(actionQueue, node, returnValue) {
  returnValue !== null && typeof returnValue === "object" && typeof returnValue.then === "function" ? returnValue.then(function(nextState) {
    onActionSuccess(actionQueue, node, nextState);
  }, function(error) {
    return onActionError(actionQueue, node, error);
  }) : onActionSuccess(actionQueue, node, returnValue);
}
function onActionSuccess(actionQueue, actionNode, nextState) {
  actionNode.status = "fulfilled";
  actionNode.value = nextState;
  notifyActionListeners(actionNode);
  actionQueue.state = nextState;
  actionNode = actionQueue.pending;
  actionNode !== null && (nextState = actionNode.next, nextState === actionNode ? actionQueue.pending = null : (nextState = nextState.next, actionNode.next = nextState, runActionStateAction(actionQueue, nextState)));
}
function onActionError(actionQueue, actionNode, error) {
  var last = actionQueue.pending;
  actionQueue.pending = null;
  if (last !== null) {
    last = last.next;
    do
      actionNode.status = "rejected", actionNode.reason = error, notifyActionListeners(actionNode), actionNode = actionNode.next;
    while (actionNode !== last);
  }
  actionQueue.action = null;
}
function notifyActionListeners(actionNode) {
  actionNode = actionNode.listeners;
  for (var i = 0;i < actionNode.length; i++)
    (0, actionNode[i])();
}
function actionStateReducer(oldState, newState) {
  return newState;
}
function mountActionState(action, initialStateProp) {
  if (isHydrating) {
    var ssrFormState = workInProgressRoot.formState;
    if (ssrFormState !== null) {
      a: {
        var JSCompiler_inline_result = currentlyRenderingFiber;
        if (isHydrating) {
          if (nextHydratableInstance) {
            b: {
              var JSCompiler_inline_result$jscomp$0 = nextHydratableInstance;
              for (var inRootOrSingleton = rootOrSingletonContext;JSCompiler_inline_result$jscomp$0.nodeType !== 8; ) {
                if (!inRootOrSingleton) {
                  JSCompiler_inline_result$jscomp$0 = null;
                  break b;
                }
                JSCompiler_inline_result$jscomp$0 = getNextHydratable(JSCompiler_inline_result$jscomp$0.nextSibling);
                if (JSCompiler_inline_result$jscomp$0 === null) {
                  JSCompiler_inline_result$jscomp$0 = null;
                  break b;
                }
              }
              inRootOrSingleton = JSCompiler_inline_result$jscomp$0.data;
              JSCompiler_inline_result$jscomp$0 = inRootOrSingleton === "F!" || inRootOrSingleton === "F" ? JSCompiler_inline_result$jscomp$0 : null;
            }
            if (JSCompiler_inline_result$jscomp$0) {
              nextHydratableInstance = getNextHydratable(JSCompiler_inline_result$jscomp$0.nextSibling);
              JSCompiler_inline_result = JSCompiler_inline_result$jscomp$0.data === "F!";
              break a;
            }
          }
          throwOnHydrationMismatch(JSCompiler_inline_result);
        }
        JSCompiler_inline_result = false;
      }
      JSCompiler_inline_result && (initialStateProp = ssrFormState[0]);
    }
  }
  ssrFormState = mountWorkInProgressHook();
  ssrFormState.memoizedState = ssrFormState.baseState = initialStateProp;
  JSCompiler_inline_result = {
    pending: null,
    lanes: 0,
    dispatch: null,
    lastRenderedReducer: actionStateReducer,
    lastRenderedState: initialStateProp
  };
  ssrFormState.queue = JSCompiler_inline_result;
  ssrFormState = dispatchSetState.bind(null, currentlyRenderingFiber, JSCompiler_inline_result);
  JSCompiler_inline_result.dispatch = ssrFormState;
  JSCompiler_inline_result = mountStateImpl(false);
  inRootOrSingleton = dispatchOptimisticSetState.bind(null, currentlyRenderingFiber, false, JSCompiler_inline_result.queue);
  JSCompiler_inline_result = mountWorkInProgressHook();
  JSCompiler_inline_result$jscomp$0 = {
    state: initialStateProp,
    dispatch: null,
    action,
    pending: null
  };
  JSCompiler_inline_result.queue = JSCompiler_inline_result$jscomp$0;
  ssrFormState = dispatchActionState.bind(null, currentlyRenderingFiber, JSCompiler_inline_result$jscomp$0, inRootOrSingleton, ssrFormState);
  JSCompiler_inline_result$jscomp$0.dispatch = ssrFormState;
  JSCompiler_inline_result.memoizedState = action;
  return [initialStateProp, ssrFormState, false];
}
function updateActionState(action) {
  var stateHook = updateWorkInProgressHook();
  return updateActionStateImpl(stateHook, currentHook, action);
}
function updateActionStateImpl(stateHook, currentStateHook, action) {
  currentStateHook = updateReducerImpl(stateHook, currentStateHook, actionStateReducer)[0];
  stateHook = updateReducer(basicStateReducer)[0];
  if (typeof currentStateHook === "object" && currentStateHook !== null && typeof currentStateHook.then === "function")
    try {
      var state = useThenable(currentStateHook);
    } catch (x) {
      if (x === SuspenseException)
        throw SuspenseActionException;
      throw x;
    }
  else
    state = currentStateHook;
  currentStateHook = updateWorkInProgressHook();
  var actionQueue = currentStateHook.queue, dispatch = actionQueue.dispatch;
  action !== currentStateHook.memoizedState && (currentlyRenderingFiber.flags |= 2048, pushSimpleEffect(9, { destroy: undefined }, actionStateActionEffect.bind(null, actionQueue, action), null));
  return [state, dispatch, stateHook];
}
function actionStateActionEffect(actionQueue, action) {
  actionQueue.action = action;
}
function rerenderActionState(action) {
  var stateHook = updateWorkInProgressHook(), currentStateHook = currentHook;
  if (currentStateHook !== null)
    return updateActionStateImpl(stateHook, currentStateHook, action);
  updateWorkInProgressHook();
  stateHook = stateHook.memoizedState;
  currentStateHook = updateWorkInProgressHook();
  var dispatch = currentStateHook.queue.dispatch;
  currentStateHook.memoizedState = action;
  return [stateHook, dispatch, false];
}
function pushSimpleEffect(tag, inst, create, deps) {
  tag = { tag, create, deps, inst, next: null };
  inst = currentlyRenderingFiber.updateQueue;
  inst === null && (inst = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = inst);
  create = inst.lastEffect;
  create === null ? inst.lastEffect = tag.next = tag : (deps = create.next, create.next = tag, tag.next = deps, inst.lastEffect = tag);
  return tag;
}
function updateRef() {
  return updateWorkInProgressHook().memoizedState;
}
function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
  var hook = mountWorkInProgressHook();
  currentlyRenderingFiber.flags |= fiberFlags;
  hook.memoizedState = pushSimpleEffect(1 | hookFlags, { destroy: undefined }, create, deps === undefined ? null : deps);
}
function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
  var hook = updateWorkInProgressHook();
  deps = deps === undefined ? null : deps;
  var inst = hook.memoizedState.inst;
  currentHook !== null && deps !== null && areHookInputsEqual(deps, currentHook.memoizedState.deps) ? hook.memoizedState = pushSimpleEffect(hookFlags, inst, create, deps) : (currentlyRenderingFiber.flags |= fiberFlags, hook.memoizedState = pushSimpleEffect(1 | hookFlags, inst, create, deps));
}
function mountEffect(create, deps) {
  mountEffectImpl(8390656, 8, create, deps);
}
function updateEffect(create, deps) {
  updateEffectImpl(2048, 8, create, deps);
}
function useEffectEventImpl(payload) {
  currentlyRenderingFiber.flags |= 4;
  var componentUpdateQueue = currentlyRenderingFiber.updateQueue;
  if (componentUpdateQueue === null)
    componentUpdateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = componentUpdateQueue, componentUpdateQueue.events = [payload];
  else {
    var events = componentUpdateQueue.events;
    events === null ? componentUpdateQueue.events = [payload] : events.push(payload);
  }
}
function updateEvent(callback) {
  var ref = updateWorkInProgressHook().memoizedState;
  useEffectEventImpl({ ref, nextImpl: callback });
  return function() {
    if ((executionContext & 2) !== 0)
      throw Error(formatProdErrorMessage(440));
    return ref.impl.apply(undefined, arguments);
  };
}
function updateInsertionEffect(create, deps) {
  return updateEffectImpl(4, 2, create, deps);
}
function updateLayoutEffect(create, deps) {
  return updateEffectImpl(4, 4, create, deps);
}
function imperativeHandleEffect(create, ref) {
  if (typeof ref === "function") {
    create = create();
    var refCleanup = ref(create);
    return function() {
      typeof refCleanup === "function" ? refCleanup() : ref(null);
    };
  }
  if (ref !== null && ref !== undefined)
    return create = create(), ref.current = create, function() {
      ref.current = null;
    };
}
function updateImperativeHandle(ref, create, deps) {
  deps = deps !== null && deps !== undefined ? deps.concat([ref]) : null;
  updateEffectImpl(4, 4, imperativeHandleEffect.bind(null, create, ref), deps);
}
function mountDebugValue() {}
function updateCallback(callback, deps) {
  var hook = updateWorkInProgressHook();
  deps = deps === undefined ? null : deps;
  var prevState = hook.memoizedState;
  if (deps !== null && areHookInputsEqual(deps, prevState[1]))
    return prevState[0];
  hook.memoizedState = [callback, deps];
  return callback;
}
function updateMemo(nextCreate, deps) {
  var hook = updateWorkInProgressHook();
  deps = deps === undefined ? null : deps;
  var prevState = hook.memoizedState;
  if (deps !== null && areHookInputsEqual(deps, prevState[1]))
    return prevState[0];
  prevState = nextCreate();
  if (shouldDoubleInvokeUserFnsInHooksDEV) {
    setIsStrictModeForDevtools(true);
    try {
      nextCreate();
    } finally {
      setIsStrictModeForDevtools(false);
    }
  }
  hook.memoizedState = [prevState, deps];
  return prevState;
}
function mountDeferredValueImpl(hook, value, initialValue) {
  if (initialValue === undefined || (renderLanes & 1073741824) !== 0 && (workInProgressRootRenderLanes & 261930) === 0)
    return hook.memoizedState = value;
  hook.memoizedState = initialValue;
  hook = requestDeferredLane();
  currentlyRenderingFiber.lanes |= hook;
  workInProgressRootSkippedLanes |= hook;
  return initialValue;
}
function updateDeferredValueImpl(hook, prevValue, value, initialValue) {
  if (objectIs(value, prevValue))
    return value;
  if (currentTreeHiddenStackCursor.current !== null)
    return hook = mountDeferredValueImpl(hook, value, initialValue), objectIs(hook, prevValue) || (didReceiveUpdate = true), hook;
  if ((renderLanes & 42) === 0 || (renderLanes & 1073741824) !== 0 && (workInProgressRootRenderLanes & 261930) === 0)
    return didReceiveUpdate = true, hook.memoizedState = value;
  hook = requestDeferredLane();
  currentlyRenderingFiber.lanes |= hook;
  workInProgressRootSkippedLanes |= hook;
  return prevValue;
}
function startTransition(fiber, queue, pendingState, finishedState, callback) {
  var previousPriority = ReactDOMSharedInternals.p;
  ReactDOMSharedInternals.p = previousPriority !== 0 && 8 > previousPriority ? previousPriority : 8;
  var prevTransition = ReactSharedInternals.T, currentTransition = {};
  ReactSharedInternals.T = currentTransition;
  dispatchOptimisticSetState(fiber, false, queue, pendingState);
  try {
    var returnValue = callback(), onStartTransitionFinish = ReactSharedInternals.S;
    onStartTransitionFinish !== null && onStartTransitionFinish(currentTransition, returnValue);
    if (returnValue !== null && typeof returnValue === "object" && typeof returnValue.then === "function") {
      var thenableForFinishedState = chainThenableValue(returnValue, finishedState);
      dispatchSetStateInternal(fiber, queue, thenableForFinishedState, requestUpdateLane(fiber));
    } else
      dispatchSetStateInternal(fiber, queue, finishedState, requestUpdateLane(fiber));
  } catch (error) {
    dispatchSetStateInternal(fiber, queue, { then: function() {}, status: "rejected", reason: error }, requestUpdateLane());
  } finally {
    ReactDOMSharedInternals.p = previousPriority, prevTransition !== null && currentTransition.types !== null && (prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition;
  }
}
function noop() {}
function startHostTransition(formFiber, pendingState, action, formData) {
  if (formFiber.tag !== 5)
    throw Error(formatProdErrorMessage(476));
  var queue = ensureFormComponentIsStateful(formFiber).queue;
  startTransition(formFiber, queue, pendingState, sharedNotPendingObject, action === null ? noop : function() {
    requestFormReset$1(formFiber);
    return action(formData);
  });
}
function ensureFormComponentIsStateful(formFiber) {
  var existingStateHook = formFiber.memoizedState;
  if (existingStateHook !== null)
    return existingStateHook;
  existingStateHook = {
    memoizedState: sharedNotPendingObject,
    baseState: sharedNotPendingObject,
    baseQueue: null,
    queue: {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: basicStateReducer,
      lastRenderedState: sharedNotPendingObject
    },
    next: null
  };
  var initialResetState = {};
  existingStateHook.next = {
    memoizedState: initialResetState,
    baseState: initialResetState,
    baseQueue: null,
    queue: {
      pending: null,
      lanes: 0,
      dispatch: null,
      lastRenderedReducer: basicStateReducer,
      lastRenderedState: initialResetState
    },
    next: null
  };
  formFiber.memoizedState = existingStateHook;
  formFiber = formFiber.alternate;
  formFiber !== null && (formFiber.memoizedState = existingStateHook);
  return existingStateHook;
}
function requestFormReset$1(formFiber) {
  var stateHook = ensureFormComponentIsStateful(formFiber);
  stateHook.next === null && (stateHook = formFiber.alternate.memoizedState);
  dispatchSetStateInternal(formFiber, stateHook.next.queue, {}, requestUpdateLane());
}
function useHostTransitionStatus() {
  return readContext(HostTransitionContext);
}
function updateId() {
  return updateWorkInProgressHook().memoizedState;
}
function updateRefresh() {
  return updateWorkInProgressHook().memoizedState;
}
function refreshCache(fiber) {
  for (var provider = fiber.return;provider !== null; ) {
    switch (provider.tag) {
      case 24:
      case 3:
        var lane = requestUpdateLane();
        fiber = createUpdate(lane);
        var root$69 = enqueueUpdate(provider, fiber, lane);
        root$69 !== null && (scheduleUpdateOnFiber(root$69, provider, lane), entangleTransitions(root$69, provider, lane));
        provider = { cache: createCache() };
        fiber.payload = provider;
        return;
    }
    provider = provider.return;
  }
}
function dispatchReducerAction(fiber, queue, action) {
  var lane = requestUpdateLane();
  action = {
    lane,
    revertLane: 0,
    gesture: null,
    action,
    hasEagerState: false,
    eagerState: null,
    next: null
  };
  isRenderPhaseUpdate(fiber) ? enqueueRenderPhaseUpdate(queue, action) : (action = enqueueConcurrentHookUpdate(fiber, queue, action, lane), action !== null && (scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane)));
}
function dispatchSetState(fiber, queue, action) {
  var lane = requestUpdateLane();
  dispatchSetStateInternal(fiber, queue, action, lane);
}
function dispatchSetStateInternal(fiber, queue, action, lane) {
  var update = {
    lane,
    revertLane: 0,
    gesture: null,
    action,
    hasEagerState: false,
    eagerState: null,
    next: null
  };
  if (isRenderPhaseUpdate(fiber))
    enqueueRenderPhaseUpdate(queue, update);
  else {
    var alternate = fiber.alternate;
    if (fiber.lanes === 0 && (alternate === null || alternate.lanes === 0) && (alternate = queue.lastRenderedReducer, alternate !== null))
      try {
        var currentState = queue.lastRenderedState, eagerState = alternate(currentState, action);
        update.hasEagerState = true;
        update.eagerState = eagerState;
        if (objectIs(eagerState, currentState))
          return enqueueUpdate$1(fiber, queue, update, 0), workInProgressRoot === null && finishQueueingConcurrentUpdates(), false;
      } catch (error) {} finally {}
    action = enqueueConcurrentHookUpdate(fiber, queue, update, lane);
    if (action !== null)
      return scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane), true;
  }
  return false;
}
function dispatchOptimisticSetState(fiber, throwIfDuringRender, queue, action) {
  action = {
    lane: 2,
    revertLane: requestTransitionLane(),
    gesture: null,
    action,
    hasEagerState: false,
    eagerState: null,
    next: null
  };
  if (isRenderPhaseUpdate(fiber)) {
    if (throwIfDuringRender)
      throw Error(formatProdErrorMessage(479));
  } else
    throwIfDuringRender = enqueueConcurrentHookUpdate(fiber, queue, action, 2), throwIfDuringRender !== null && scheduleUpdateOnFiber(throwIfDuringRender, fiber, 2);
}
function isRenderPhaseUpdate(fiber) {
  var alternate = fiber.alternate;
  return fiber === currentlyRenderingFiber || alternate !== null && alternate === currentlyRenderingFiber;
}
function enqueueRenderPhaseUpdate(queue, update) {
  didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate = true;
  var pending = queue.pending;
  pending === null ? update.next = update : (update.next = pending.next, pending.next = update);
  queue.pending = update;
}
function entangleTransitionUpdate(root2, queue, lane) {
  if ((lane & 4194048) !== 0) {
    var queueLanes = queue.lanes;
    queueLanes &= root2.pendingLanes;
    lane |= queueLanes;
    queue.lanes = lane;
    markRootEntangled(root2, lane);
  }
}
function applyDerivedStateFromProps(workInProgress, ctor, getDerivedStateFromProps, nextProps) {
  ctor = workInProgress.memoizedState;
  getDerivedStateFromProps = getDerivedStateFromProps(nextProps, ctor);
  getDerivedStateFromProps = getDerivedStateFromProps === null || getDerivedStateFromProps === undefined ? ctor : assign({}, ctor, getDerivedStateFromProps);
  workInProgress.memoizedState = getDerivedStateFromProps;
  workInProgress.lanes === 0 && (workInProgress.updateQueue.baseState = getDerivedStateFromProps);
}
function checkShouldComponentUpdate(workInProgress, ctor, oldProps, newProps, oldState, newState, nextContext) {
  workInProgress = workInProgress.stateNode;
  return typeof workInProgress.shouldComponentUpdate === "function" ? workInProgress.shouldComponentUpdate(newProps, newState, nextContext) : ctor.prototype && ctor.prototype.isPureReactComponent ? !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState) : true;
}
function callComponentWillReceiveProps(workInProgress, instance, newProps, nextContext) {
  workInProgress = instance.state;
  typeof instance.componentWillReceiveProps === "function" && instance.componentWillReceiveProps(newProps, nextContext);
  typeof instance.UNSAFE_componentWillReceiveProps === "function" && instance.UNSAFE_componentWillReceiveProps(newProps, nextContext);
  instance.state !== workInProgress && classComponentUpdater.enqueueReplaceState(instance, instance.state, null);
}
function resolveClassComponentProps(Component, baseProps) {
  var newProps = baseProps;
  if ("ref" in baseProps) {
    newProps = {};
    for (var propName in baseProps)
      propName !== "ref" && (newProps[propName] = baseProps[propName]);
  }
  if (Component = Component.defaultProps) {
    newProps === baseProps && (newProps = assign({}, newProps));
    for (var propName$73 in Component)
      newProps[propName$73] === undefined && (newProps[propName$73] = Component[propName$73]);
  }
  return newProps;
}
function defaultOnUncaughtError(error) {
  reportGlobalError(error);
}
function defaultOnCaughtError(error) {
  console.error(error);
}
function defaultOnRecoverableError(error) {
  reportGlobalError(error);
}
function logUncaughtError(root2, errorInfo) {
  try {
    var onUncaughtError = root2.onUncaughtError;
    onUncaughtError(errorInfo.value, { componentStack: errorInfo.stack });
  } catch (e$74) {
    setTimeout(function() {
      throw e$74;
    });
  }
}
function logCaughtError(root2, boundary, errorInfo) {
  try {
    var onCaughtError = root2.onCaughtError;
    onCaughtError(errorInfo.value, {
      componentStack: errorInfo.stack,
      errorBoundary: boundary.tag === 1 ? boundary.stateNode : null
    });
  } catch (e$75) {
    setTimeout(function() {
      throw e$75;
    });
  }
}
function createRootErrorUpdate(root2, errorInfo, lane) {
  lane = createUpdate(lane);
  lane.tag = 3;
  lane.payload = { element: null };
  lane.callback = function() {
    logUncaughtError(root2, errorInfo);
  };
  return lane;
}
function createClassErrorUpdate(lane) {
  lane = createUpdate(lane);
  lane.tag = 3;
  return lane;
}
function initializeClassErrorUpdate(update, root2, fiber, errorInfo) {
  var getDerivedStateFromError = fiber.type.getDerivedStateFromError;
  if (typeof getDerivedStateFromError === "function") {
    var error = errorInfo.value;
    update.payload = function() {
      return getDerivedStateFromError(error);
    };
    update.callback = function() {
      logCaughtError(root2, fiber, errorInfo);
    };
  }
  var inst = fiber.stateNode;
  inst !== null && typeof inst.componentDidCatch === "function" && (update.callback = function() {
    logCaughtError(root2, fiber, errorInfo);
    typeof getDerivedStateFromError !== "function" && (legacyErrorBoundariesThatAlreadyFailed === null ? legacyErrorBoundariesThatAlreadyFailed = new Set([this]) : legacyErrorBoundariesThatAlreadyFailed.add(this));
    var stack = errorInfo.stack;
    this.componentDidCatch(errorInfo.value, {
      componentStack: stack !== null ? stack : ""
    });
  });
}
function throwException(root2, returnFiber, sourceFiber, value, rootRenderLanes) {
  sourceFiber.flags |= 32768;
  if (value !== null && typeof value === "object" && typeof value.then === "function") {
    returnFiber = sourceFiber.alternate;
    returnFiber !== null && propagateParentContextChanges(returnFiber, sourceFiber, rootRenderLanes, true);
    sourceFiber = suspenseHandlerStackCursor.current;
    if (sourceFiber !== null) {
      switch (sourceFiber.tag) {
        case 31:
        case 13:
          return shellBoundary === null ? renderDidSuspendDelayIfPossible() : sourceFiber.alternate === null && workInProgressRootExitStatus === 0 && (workInProgressRootExitStatus = 3), sourceFiber.flags &= -257, sourceFiber.flags |= 65536, sourceFiber.lanes = rootRenderLanes, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, returnFiber === null ? sourceFiber.updateQueue = new Set([value]) : returnFiber.add(value), attachPingListener(root2, value, rootRenderLanes)), false;
        case 22:
          return sourceFiber.flags |= 65536, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, returnFiber === null ? (returnFiber = {
            transitions: null,
            markerInstances: null,
            retryQueue: new Set([value])
          }, sourceFiber.updateQueue = returnFiber) : (sourceFiber = returnFiber.retryQueue, sourceFiber === null ? returnFiber.retryQueue = new Set([value]) : sourceFiber.add(value)), attachPingListener(root2, value, rootRenderLanes)), false;
      }
      throw Error(formatProdErrorMessage(435, sourceFiber.tag));
    }
    attachPingListener(root2, value, rootRenderLanes);
    renderDidSuspendDelayIfPossible();
    return false;
  }
  if (isHydrating)
    return returnFiber = suspenseHandlerStackCursor.current, returnFiber !== null ? ((returnFiber.flags & 65536) === 0 && (returnFiber.flags |= 256), returnFiber.flags |= 65536, returnFiber.lanes = rootRenderLanes, value !== HydrationMismatchException && (root2 = Error(formatProdErrorMessage(422), { cause: value }), queueHydrationError(createCapturedValueAtFiber(root2, sourceFiber)))) : (value !== HydrationMismatchException && (returnFiber = Error(formatProdErrorMessage(423), {
      cause: value
    }), queueHydrationError(createCapturedValueAtFiber(returnFiber, sourceFiber))), root2 = root2.current.alternate, root2.flags |= 65536, rootRenderLanes &= -rootRenderLanes, root2.lanes |= rootRenderLanes, value = createCapturedValueAtFiber(value, sourceFiber), rootRenderLanes = createRootErrorUpdate(root2.stateNode, value, rootRenderLanes), enqueueCapturedUpdate(root2, rootRenderLanes), workInProgressRootExitStatus !== 4 && (workInProgressRootExitStatus = 2)), false;
  var wrapperError = Error(formatProdErrorMessage(520), { cause: value });
  wrapperError = createCapturedValueAtFiber(wrapperError, sourceFiber);
  workInProgressRootConcurrentErrors === null ? workInProgressRootConcurrentErrors = [wrapperError] : workInProgressRootConcurrentErrors.push(wrapperError);
  workInProgressRootExitStatus !== 4 && (workInProgressRootExitStatus = 2);
  if (returnFiber === null)
    return true;
  value = createCapturedValueAtFiber(value, sourceFiber);
  sourceFiber = returnFiber;
  do {
    switch (sourceFiber.tag) {
      case 3:
        return sourceFiber.flags |= 65536, root2 = rootRenderLanes & -rootRenderLanes, sourceFiber.lanes |= root2, root2 = createRootErrorUpdate(sourceFiber.stateNode, value, root2), enqueueCapturedUpdate(sourceFiber, root2), false;
      case 1:
        if (returnFiber = sourceFiber.type, wrapperError = sourceFiber.stateNode, (sourceFiber.flags & 128) === 0 && (typeof returnFiber.getDerivedStateFromError === "function" || wrapperError !== null && typeof wrapperError.componentDidCatch === "function" && (legacyErrorBoundariesThatAlreadyFailed === null || !legacyErrorBoundariesThatAlreadyFailed.has(wrapperError))))
          return sourceFiber.flags |= 65536, rootRenderLanes &= -rootRenderLanes, sourceFiber.lanes |= rootRenderLanes, rootRenderLanes = createClassErrorUpdate(rootRenderLanes), initializeClassErrorUpdate(rootRenderLanes, root2, sourceFiber, value), enqueueCapturedUpdate(sourceFiber, rootRenderLanes), false;
    }
    sourceFiber = sourceFiber.return;
  } while (sourceFiber !== null);
  return false;
}
function reconcileChildren(current, workInProgress, nextChildren, renderLanes2) {
  workInProgress.child = current === null ? mountChildFibers(workInProgress, null, nextChildren, renderLanes2) : reconcileChildFibers(workInProgress, current.child, nextChildren, renderLanes2);
}
function updateForwardRef(current, workInProgress, Component, nextProps, renderLanes2) {
  Component = Component.render;
  var ref = workInProgress.ref;
  if ("ref" in nextProps) {
    var propsWithoutRef = {};
    for (var key in nextProps)
      key !== "ref" && (propsWithoutRef[key] = nextProps[key]);
  } else
    propsWithoutRef = nextProps;
  prepareToReadContext(workInProgress);
  nextProps = renderWithHooks(current, workInProgress, Component, propsWithoutRef, ref, renderLanes2);
  key = checkDidRenderIdHook();
  if (current !== null && !didReceiveUpdate)
    return bailoutHooks(current, workInProgress, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
  isHydrating && key && pushMaterializedTreeId(workInProgress);
  workInProgress.flags |= 1;
  reconcileChildren(current, workInProgress, nextProps, renderLanes2);
  return workInProgress.child;
}
function updateMemoComponent(current, workInProgress, Component, nextProps, renderLanes2) {
  if (current === null) {
    var type = Component.type;
    if (typeof type === "function" && !shouldConstruct(type) && type.defaultProps === undefined && Component.compare === null)
      return workInProgress.tag = 15, workInProgress.type = type, updateSimpleMemoComponent(current, workInProgress, type, nextProps, renderLanes2);
    current = createFiberFromTypeAndProps(Component.type, null, nextProps, workInProgress, workInProgress.mode, renderLanes2);
    current.ref = workInProgress.ref;
    current.return = workInProgress;
    return workInProgress.child = current;
  }
  type = current.child;
  if (!checkScheduledUpdateOrContext(current, renderLanes2)) {
    var prevProps = type.memoizedProps;
    Component = Component.compare;
    Component = Component !== null ? Component : shallowEqual;
    if (Component(prevProps, nextProps) && current.ref === workInProgress.ref)
      return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
  }
  workInProgress.flags |= 1;
  current = createWorkInProgress(type, nextProps);
  current.ref = workInProgress.ref;
  current.return = workInProgress;
  return workInProgress.child = current;
}
function updateSimpleMemoComponent(current, workInProgress, Component, nextProps, renderLanes2) {
  if (current !== null) {
    var prevProps = current.memoizedProps;
    if (shallowEqual(prevProps, nextProps) && current.ref === workInProgress.ref)
      if (didReceiveUpdate = false, workInProgress.pendingProps = nextProps = prevProps, checkScheduledUpdateOrContext(current, renderLanes2))
        (current.flags & 131072) !== 0 && (didReceiveUpdate = true);
      else
        return workInProgress.lanes = current.lanes, bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
  }
  return updateFunctionComponent(current, workInProgress, Component, nextProps, renderLanes2);
}
function updateOffscreenComponent(current, workInProgress, renderLanes2, nextProps) {
  var nextChildren = nextProps.children, prevState = current !== null ? current.memoizedState : null;
  current === null && workInProgress.stateNode === null && (workInProgress.stateNode = {
    _visibility: 1,
    _pendingMarkers: null,
    _retryCache: null,
    _transitions: null
  });
  if (nextProps.mode === "hidden") {
    if ((workInProgress.flags & 128) !== 0) {
      prevState = prevState !== null ? prevState.baseLanes | renderLanes2 : renderLanes2;
      if (current !== null) {
        nextProps = workInProgress.child = current.child;
        for (nextChildren = 0;nextProps !== null; )
          nextChildren = nextChildren | nextProps.lanes | nextProps.childLanes, nextProps = nextProps.sibling;
        nextProps = nextChildren & ~prevState;
      } else
        nextProps = 0, workInProgress.child = null;
      return deferHiddenOffscreenComponent(current, workInProgress, prevState, renderLanes2, nextProps);
    }
    if ((renderLanes2 & 536870912) !== 0)
      workInProgress.memoizedState = { baseLanes: 0, cachePool: null }, current !== null && pushTransition(workInProgress, prevState !== null ? prevState.cachePool : null), prevState !== null ? pushHiddenContext(workInProgress, prevState) : reuseHiddenContextOnStack(), pushOffscreenSuspenseHandler(workInProgress);
    else
      return nextProps = workInProgress.lanes = 536870912, deferHiddenOffscreenComponent(current, workInProgress, prevState !== null ? prevState.baseLanes | renderLanes2 : renderLanes2, renderLanes2, nextProps);
  } else
    prevState !== null ? (pushTransition(workInProgress, prevState.cachePool), pushHiddenContext(workInProgress, prevState), reuseSuspenseHandlerOnStack(workInProgress), workInProgress.memoizedState = null) : (current !== null && pushTransition(workInProgress, null), reuseHiddenContextOnStack(), reuseSuspenseHandlerOnStack(workInProgress));
  reconcileChildren(current, workInProgress, nextChildren, renderLanes2);
  return workInProgress.child;
}
function bailoutOffscreenComponent(current, workInProgress) {
  current !== null && current.tag === 22 || workInProgress.stateNode !== null || (workInProgress.stateNode = {
    _visibility: 1,
    _pendingMarkers: null,
    _retryCache: null,
    _transitions: null
  });
  return workInProgress.sibling;
}
function deferHiddenOffscreenComponent(current, workInProgress, nextBaseLanes, renderLanes2, remainingChildLanes) {
  var JSCompiler_inline_result = peekCacheFromPool();
  JSCompiler_inline_result = JSCompiler_inline_result === null ? null : { parent: CacheContext._currentValue, pool: JSCompiler_inline_result };
  workInProgress.memoizedState = {
    baseLanes: nextBaseLanes,
    cachePool: JSCompiler_inline_result
  };
  current !== null && pushTransition(workInProgress, null);
  reuseHiddenContextOnStack();
  pushOffscreenSuspenseHandler(workInProgress);
  current !== null && propagateParentContextChanges(current, workInProgress, renderLanes2, true);
  workInProgress.childLanes = remainingChildLanes;
  return null;
}
function mountActivityChildren(workInProgress, nextProps) {
  nextProps = mountWorkInProgressOffscreenFiber({ mode: nextProps.mode, children: nextProps.children }, workInProgress.mode);
  nextProps.ref = workInProgress.ref;
  workInProgress.child = nextProps;
  nextProps.return = workInProgress;
  return nextProps;
}
function retryActivityComponentWithoutHydrating(current, workInProgress, renderLanes2) {
  reconcileChildFibers(workInProgress, current.child, null, renderLanes2);
  current = mountActivityChildren(workInProgress, workInProgress.pendingProps);
  current.flags |= 2;
  popSuspenseHandler(workInProgress);
  workInProgress.memoizedState = null;
  return current;
}
function updateActivityComponent(current, workInProgress, renderLanes2) {
  var nextProps = workInProgress.pendingProps, didSuspend = (workInProgress.flags & 128) !== 0;
  workInProgress.flags &= -129;
  if (current === null) {
    if (isHydrating) {
      if (nextProps.mode === "hidden")
        return current = mountActivityChildren(workInProgress, nextProps), workInProgress.lanes = 536870912, bailoutOffscreenComponent(null, current);
      pushDehydratedActivitySuspenseHandler(workInProgress);
      (current = nextHydratableInstance) ? (current = canHydrateHydrationBoundary(current, rootOrSingletonContext), current = current !== null && current.data === "&" ? current : null, current !== null && (workInProgress.memoizedState = {
        dehydrated: current,
        treeContext: treeContextProvider !== null ? { id: treeContextId, overflow: treeContextOverflow } : null,
        retryLane: 536870912,
        hydrationErrors: null
      }, renderLanes2 = createFiberFromDehydratedFragment(current), renderLanes2.return = workInProgress, workInProgress.child = renderLanes2, hydrationParentFiber = workInProgress, nextHydratableInstance = null)) : current = null;
      if (current === null)
        throw throwOnHydrationMismatch(workInProgress);
      workInProgress.lanes = 536870912;
      return null;
    }
    return mountActivityChildren(workInProgress, nextProps);
  }
  var prevState = current.memoizedState;
  if (prevState !== null) {
    var dehydrated = prevState.dehydrated;
    pushDehydratedActivitySuspenseHandler(workInProgress);
    if (didSuspend)
      if (workInProgress.flags & 256)
        workInProgress.flags &= -257, workInProgress = retryActivityComponentWithoutHydrating(current, workInProgress, renderLanes2);
      else if (workInProgress.memoizedState !== null)
        workInProgress.child = current.child, workInProgress.flags |= 128, workInProgress = null;
      else
        throw Error(formatProdErrorMessage(558));
    else if (didReceiveUpdate || propagateParentContextChanges(current, workInProgress, renderLanes2, false), didSuspend = (renderLanes2 & current.childLanes) !== 0, didReceiveUpdate || didSuspend) {
      nextProps = workInProgressRoot;
      if (nextProps !== null && (dehydrated = getBumpedLaneForHydration(nextProps, renderLanes2), dehydrated !== 0 && dehydrated !== prevState.retryLane))
        throw prevState.retryLane = dehydrated, enqueueConcurrentRenderForLane(current, dehydrated), scheduleUpdateOnFiber(nextProps, current, dehydrated), SelectiveHydrationException;
      renderDidSuspendDelayIfPossible();
      workInProgress = retryActivityComponentWithoutHydrating(current, workInProgress, renderLanes2);
    } else
      current = prevState.treeContext, nextHydratableInstance = getNextHydratable(dehydrated.nextSibling), hydrationParentFiber = workInProgress, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, current !== null && restoreSuspendedTreeContext(workInProgress, current), workInProgress = mountActivityChildren(workInProgress, nextProps), workInProgress.flags |= 4096;
    return workInProgress;
  }
  current = createWorkInProgress(current.child, {
    mode: nextProps.mode,
    children: nextProps.children
  });
  current.ref = workInProgress.ref;
  workInProgress.child = current;
  current.return = workInProgress;
  return current;
}
function markRef(current, workInProgress) {
  var ref = workInProgress.ref;
  if (ref === null)
    current !== null && current.ref !== null && (workInProgress.flags |= 4194816);
  else {
    if (typeof ref !== "function" && typeof ref !== "object")
      throw Error(formatProdErrorMessage(284));
    if (current === null || current.ref !== ref)
      workInProgress.flags |= 4194816;
  }
}
function updateFunctionComponent(current, workInProgress, Component, nextProps, renderLanes2) {
  prepareToReadContext(workInProgress);
  Component = renderWithHooks(current, workInProgress, Component, nextProps, undefined, renderLanes2);
  nextProps = checkDidRenderIdHook();
  if (current !== null && !didReceiveUpdate)
    return bailoutHooks(current, workInProgress, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
  isHydrating && nextProps && pushMaterializedTreeId(workInProgress);
  workInProgress.flags |= 1;
  reconcileChildren(current, workInProgress, Component, renderLanes2);
  return workInProgress.child;
}
function replayFunctionComponent(current, workInProgress, nextProps, Component, secondArg, renderLanes2) {
  prepareToReadContext(workInProgress);
  workInProgress.updateQueue = null;
  nextProps = renderWithHooksAgain(workInProgress, Component, nextProps, secondArg);
  finishRenderingHooks(current);
  Component = checkDidRenderIdHook();
  if (current !== null && !didReceiveUpdate)
    return bailoutHooks(current, workInProgress, renderLanes2), bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
  isHydrating && Component && pushMaterializedTreeId(workInProgress);
  workInProgress.flags |= 1;
  reconcileChildren(current, workInProgress, nextProps, renderLanes2);
  return workInProgress.child;
}
function updateClassComponent(current, workInProgress, Component, nextProps, renderLanes2) {
  prepareToReadContext(workInProgress);
  if (workInProgress.stateNode === null) {
    var context = emptyContextObject, contextType = Component.contextType;
    typeof contextType === "object" && contextType !== null && (context = readContext(contextType));
    context = new Component(nextProps, context);
    workInProgress.memoizedState = context.state !== null && context.state !== undefined ? context.state : null;
    context.updater = classComponentUpdater;
    workInProgress.stateNode = context;
    context._reactInternals = workInProgress;
    context = workInProgress.stateNode;
    context.props = nextProps;
    context.state = workInProgress.memoizedState;
    context.refs = {};
    initializeUpdateQueue(workInProgress);
    contextType = Component.contextType;
    context.context = typeof contextType === "object" && contextType !== null ? readContext(contextType) : emptyContextObject;
    context.state = workInProgress.memoizedState;
    contextType = Component.getDerivedStateFromProps;
    typeof contextType === "function" && (applyDerivedStateFromProps(workInProgress, Component, contextType, nextProps), context.state = workInProgress.memoizedState);
    typeof Component.getDerivedStateFromProps === "function" || typeof context.getSnapshotBeforeUpdate === "function" || typeof context.UNSAFE_componentWillMount !== "function" && typeof context.componentWillMount !== "function" || (contextType = context.state, typeof context.componentWillMount === "function" && context.componentWillMount(), typeof context.UNSAFE_componentWillMount === "function" && context.UNSAFE_componentWillMount(), contextType !== context.state && classComponentUpdater.enqueueReplaceState(context, context.state, null), processUpdateQueue(workInProgress, nextProps, context, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction(), context.state = workInProgress.memoizedState);
    typeof context.componentDidMount === "function" && (workInProgress.flags |= 4194308);
    nextProps = true;
  } else if (current === null) {
    context = workInProgress.stateNode;
    var unresolvedOldProps = workInProgress.memoizedProps, oldProps = resolveClassComponentProps(Component, unresolvedOldProps);
    context.props = oldProps;
    var oldContext = context.context, contextType$jscomp$0 = Component.contextType;
    contextType = emptyContextObject;
    typeof contextType$jscomp$0 === "object" && contextType$jscomp$0 !== null && (contextType = readContext(contextType$jscomp$0));
    var getDerivedStateFromProps = Component.getDerivedStateFromProps;
    contextType$jscomp$0 = typeof getDerivedStateFromProps === "function" || typeof context.getSnapshotBeforeUpdate === "function";
    unresolvedOldProps = workInProgress.pendingProps !== unresolvedOldProps;
    contextType$jscomp$0 || typeof context.UNSAFE_componentWillReceiveProps !== "function" && typeof context.componentWillReceiveProps !== "function" || (unresolvedOldProps || oldContext !== contextType) && callComponentWillReceiveProps(workInProgress, context, nextProps, contextType);
    hasForceUpdate = false;
    var oldState = workInProgress.memoizedState;
    context.state = oldState;
    processUpdateQueue(workInProgress, nextProps, context, renderLanes2);
    suspendIfUpdateReadFromEntangledAsyncAction();
    oldContext = workInProgress.memoizedState;
    unresolvedOldProps || oldState !== oldContext || hasForceUpdate ? (typeof getDerivedStateFromProps === "function" && (applyDerivedStateFromProps(workInProgress, Component, getDerivedStateFromProps, nextProps), oldContext = workInProgress.memoizedState), (oldProps = hasForceUpdate || checkShouldComponentUpdate(workInProgress, Component, oldProps, nextProps, oldState, oldContext, contextType)) ? (contextType$jscomp$0 || typeof context.UNSAFE_componentWillMount !== "function" && typeof context.componentWillMount !== "function" || (typeof context.componentWillMount === "function" && context.componentWillMount(), typeof context.UNSAFE_componentWillMount === "function" && context.UNSAFE_componentWillMount()), typeof context.componentDidMount === "function" && (workInProgress.flags |= 4194308)) : (typeof context.componentDidMount === "function" && (workInProgress.flags |= 4194308), workInProgress.memoizedProps = nextProps, workInProgress.memoizedState = oldContext), context.props = nextProps, context.state = oldContext, context.context = contextType, nextProps = oldProps) : (typeof context.componentDidMount === "function" && (workInProgress.flags |= 4194308), nextProps = false);
  } else {
    context = workInProgress.stateNode;
    cloneUpdateQueue(current, workInProgress);
    contextType = workInProgress.memoizedProps;
    contextType$jscomp$0 = resolveClassComponentProps(Component, contextType);
    context.props = contextType$jscomp$0;
    getDerivedStateFromProps = workInProgress.pendingProps;
    oldState = context.context;
    oldContext = Component.contextType;
    oldProps = emptyContextObject;
    typeof oldContext === "object" && oldContext !== null && (oldProps = readContext(oldContext));
    unresolvedOldProps = Component.getDerivedStateFromProps;
    (oldContext = typeof unresolvedOldProps === "function" || typeof context.getSnapshotBeforeUpdate === "function") || typeof context.UNSAFE_componentWillReceiveProps !== "function" && typeof context.componentWillReceiveProps !== "function" || (contextType !== getDerivedStateFromProps || oldState !== oldProps) && callComponentWillReceiveProps(workInProgress, context, nextProps, oldProps);
    hasForceUpdate = false;
    oldState = workInProgress.memoizedState;
    context.state = oldState;
    processUpdateQueue(workInProgress, nextProps, context, renderLanes2);
    suspendIfUpdateReadFromEntangledAsyncAction();
    var newState = workInProgress.memoizedState;
    contextType !== getDerivedStateFromProps || oldState !== newState || hasForceUpdate || current !== null && current.dependencies !== null && checkIfContextChanged(current.dependencies) ? (typeof unresolvedOldProps === "function" && (applyDerivedStateFromProps(workInProgress, Component, unresolvedOldProps, nextProps), newState = workInProgress.memoizedState), (contextType$jscomp$0 = hasForceUpdate || checkShouldComponentUpdate(workInProgress, Component, contextType$jscomp$0, nextProps, oldState, newState, oldProps) || current !== null && current.dependencies !== null && checkIfContextChanged(current.dependencies)) ? (oldContext || typeof context.UNSAFE_componentWillUpdate !== "function" && typeof context.componentWillUpdate !== "function" || (typeof context.componentWillUpdate === "function" && context.componentWillUpdate(nextProps, newState, oldProps), typeof context.UNSAFE_componentWillUpdate === "function" && context.UNSAFE_componentWillUpdate(nextProps, newState, oldProps)), typeof context.componentDidUpdate === "function" && (workInProgress.flags |= 4), typeof context.getSnapshotBeforeUpdate === "function" && (workInProgress.flags |= 1024)) : (typeof context.componentDidUpdate !== "function" || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress.flags |= 4), typeof context.getSnapshotBeforeUpdate !== "function" || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress.flags |= 1024), workInProgress.memoizedProps = nextProps, workInProgress.memoizedState = newState), context.props = nextProps, context.state = newState, context.context = oldProps, nextProps = contextType$jscomp$0) : (typeof context.componentDidUpdate !== "function" || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress.flags |= 4), typeof context.getSnapshotBeforeUpdate !== "function" || contextType === current.memoizedProps && oldState === current.memoizedState || (workInProgress.flags |= 1024), nextProps = false);
  }
  context = nextProps;
  markRef(current, workInProgress);
  nextProps = (workInProgress.flags & 128) !== 0;
  context || nextProps ? (context = workInProgress.stateNode, Component = nextProps && typeof Component.getDerivedStateFromError !== "function" ? null : context.render(), workInProgress.flags |= 1, current !== null && nextProps ? (workInProgress.child = reconcileChildFibers(workInProgress, current.child, null, renderLanes2), workInProgress.child = reconcileChildFibers(workInProgress, null, Component, renderLanes2)) : reconcileChildren(current, workInProgress, Component, renderLanes2), workInProgress.memoizedState = context.state, current = workInProgress.child) : current = bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
  return current;
}
function mountHostRootWithoutHydrating(current, workInProgress, nextChildren, renderLanes2) {
  resetHydrationState();
  workInProgress.flags |= 256;
  reconcileChildren(current, workInProgress, nextChildren, renderLanes2);
  return workInProgress.child;
}
function mountSuspenseOffscreenState(renderLanes2) {
  return { baseLanes: renderLanes2, cachePool: getSuspendedCache() };
}
function getRemainingWorkInPrimaryTree(current, primaryTreeDidDefer, renderLanes2) {
  current = current !== null ? current.childLanes & ~renderLanes2 : 0;
  primaryTreeDidDefer && (current |= workInProgressDeferredLane);
  return current;
}
function updateSuspenseComponent(current, workInProgress, renderLanes2) {
  var nextProps = workInProgress.pendingProps, showFallback = false, didSuspend = (workInProgress.flags & 128) !== 0, JSCompiler_temp;
  (JSCompiler_temp = didSuspend) || (JSCompiler_temp = current !== null && current.memoizedState === null ? false : (suspenseStackCursor.current & 2) !== 0);
  JSCompiler_temp && (showFallback = true, workInProgress.flags &= -129);
  JSCompiler_temp = (workInProgress.flags & 32) !== 0;
  workInProgress.flags &= -33;
  if (current === null) {
    if (isHydrating) {
      showFallback ? pushPrimaryTreeSuspenseHandler(workInProgress) : reuseSuspenseHandlerOnStack(workInProgress);
      (current = nextHydratableInstance) ? (current = canHydrateHydrationBoundary(current, rootOrSingletonContext), current = current !== null && current.data !== "&" ? current : null, current !== null && (workInProgress.memoizedState = {
        dehydrated: current,
        treeContext: treeContextProvider !== null ? { id: treeContextId, overflow: treeContextOverflow } : null,
        retryLane: 536870912,
        hydrationErrors: null
      }, renderLanes2 = createFiberFromDehydratedFragment(current), renderLanes2.return = workInProgress, workInProgress.child = renderLanes2, hydrationParentFiber = workInProgress, nextHydratableInstance = null)) : current = null;
      if (current === null)
        throw throwOnHydrationMismatch(workInProgress);
      isSuspenseInstanceFallback(current) ? workInProgress.lanes = 32 : workInProgress.lanes = 536870912;
      return null;
    }
    var nextPrimaryChildren = nextProps.children;
    nextProps = nextProps.fallback;
    if (showFallback)
      return reuseSuspenseHandlerOnStack(workInProgress), showFallback = workInProgress.mode, nextPrimaryChildren = mountWorkInProgressOffscreenFiber({ mode: "hidden", children: nextPrimaryChildren }, showFallback), nextProps = createFiberFromFragment(nextProps, showFallback, renderLanes2, null), nextPrimaryChildren.return = workInProgress, nextProps.return = workInProgress, nextPrimaryChildren.sibling = nextProps, workInProgress.child = nextPrimaryChildren, nextProps = workInProgress.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(current, JSCompiler_temp, renderLanes2), workInProgress.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(null, nextProps);
    pushPrimaryTreeSuspenseHandler(workInProgress);
    return mountSuspensePrimaryChildren(workInProgress, nextPrimaryChildren);
  }
  var prevState = current.memoizedState;
  if (prevState !== null && (nextPrimaryChildren = prevState.dehydrated, nextPrimaryChildren !== null)) {
    if (didSuspend)
      workInProgress.flags & 256 ? (pushPrimaryTreeSuspenseHandler(workInProgress), workInProgress.flags &= -257, workInProgress = retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes2)) : workInProgress.memoizedState !== null ? (reuseSuspenseHandlerOnStack(workInProgress), workInProgress.child = current.child, workInProgress.flags |= 128, workInProgress = null) : (reuseSuspenseHandlerOnStack(workInProgress), nextPrimaryChildren = nextProps.fallback, showFallback = workInProgress.mode, nextProps = mountWorkInProgressOffscreenFiber({ mode: "visible", children: nextProps.children }, showFallback), nextPrimaryChildren = createFiberFromFragment(nextPrimaryChildren, showFallback, renderLanes2, null), nextPrimaryChildren.flags |= 2, nextProps.return = workInProgress, nextPrimaryChildren.return = workInProgress, nextProps.sibling = nextPrimaryChildren, workInProgress.child = nextProps, reconcileChildFibers(workInProgress, current.child, null, renderLanes2), nextProps = workInProgress.child, nextProps.memoizedState = mountSuspenseOffscreenState(renderLanes2), nextProps.childLanes = getRemainingWorkInPrimaryTree(current, JSCompiler_temp, renderLanes2), workInProgress.memoizedState = SUSPENDED_MARKER, workInProgress = bailoutOffscreenComponent(null, nextProps));
    else if (pushPrimaryTreeSuspenseHandler(workInProgress), isSuspenseInstanceFallback(nextPrimaryChildren)) {
      JSCompiler_temp = nextPrimaryChildren.nextSibling && nextPrimaryChildren.nextSibling.dataset;
      if (JSCompiler_temp)
        var digest = JSCompiler_temp.dgst;
      JSCompiler_temp = digest;
      nextProps = Error(formatProdErrorMessage(419));
      nextProps.stack = "";
      nextProps.digest = JSCompiler_temp;
      queueHydrationError({ value: nextProps, source: null, stack: null });
      workInProgress = retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes2);
    } else if (didReceiveUpdate || propagateParentContextChanges(current, workInProgress, renderLanes2, false), JSCompiler_temp = (renderLanes2 & current.childLanes) !== 0, didReceiveUpdate || JSCompiler_temp) {
      JSCompiler_temp = workInProgressRoot;
      if (JSCompiler_temp !== null && (nextProps = getBumpedLaneForHydration(JSCompiler_temp, renderLanes2), nextProps !== 0 && nextProps !== prevState.retryLane))
        throw prevState.retryLane = nextProps, enqueueConcurrentRenderForLane(current, nextProps), scheduleUpdateOnFiber(JSCompiler_temp, current, nextProps), SelectiveHydrationException;
      isSuspenseInstancePending(nextPrimaryChildren) || renderDidSuspendDelayIfPossible();
      workInProgress = retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes2);
    } else
      isSuspenseInstancePending(nextPrimaryChildren) ? (workInProgress.flags |= 192, workInProgress.child = current.child, workInProgress = null) : (current = prevState.treeContext, nextHydratableInstance = getNextHydratable(nextPrimaryChildren.nextSibling), hydrationParentFiber = workInProgress, isHydrating = true, hydrationErrors = null, rootOrSingletonContext = false, current !== null && restoreSuspendedTreeContext(workInProgress, current), workInProgress = mountSuspensePrimaryChildren(workInProgress, nextProps.children), workInProgress.flags |= 4096);
    return workInProgress;
  }
  if (showFallback)
    return reuseSuspenseHandlerOnStack(workInProgress), nextPrimaryChildren = nextProps.fallback, showFallback = workInProgress.mode, prevState = current.child, digest = prevState.sibling, nextProps = createWorkInProgress(prevState, {
      mode: "hidden",
      children: nextProps.children
    }), nextProps.subtreeFlags = prevState.subtreeFlags & 65011712, digest !== null ? nextPrimaryChildren = createWorkInProgress(digest, nextPrimaryChildren) : (nextPrimaryChildren = createFiberFromFragment(nextPrimaryChildren, showFallback, renderLanes2, null), nextPrimaryChildren.flags |= 2), nextPrimaryChildren.return = workInProgress, nextProps.return = workInProgress, nextProps.sibling = nextPrimaryChildren, workInProgress.child = nextProps, bailoutOffscreenComponent(null, nextProps), nextProps = workInProgress.child, nextPrimaryChildren = current.child.memoizedState, nextPrimaryChildren === null ? nextPrimaryChildren = mountSuspenseOffscreenState(renderLanes2) : (showFallback = nextPrimaryChildren.cachePool, showFallback !== null ? (prevState = CacheContext._currentValue, showFallback = showFallback.parent !== prevState ? { parent: prevState, pool: prevState } : showFallback) : showFallback = getSuspendedCache(), nextPrimaryChildren = {
      baseLanes: nextPrimaryChildren.baseLanes | renderLanes2,
      cachePool: showFallback
    }), nextProps.memoizedState = nextPrimaryChildren, nextProps.childLanes = getRemainingWorkInPrimaryTree(current, JSCompiler_temp, renderLanes2), workInProgress.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(current.child, nextProps);
  pushPrimaryTreeSuspenseHandler(workInProgress);
  renderLanes2 = current.child;
  current = renderLanes2.sibling;
  renderLanes2 = createWorkInProgress(renderLanes2, {
    mode: "visible",
    children: nextProps.children
  });
  renderLanes2.return = workInProgress;
  renderLanes2.sibling = null;
  current !== null && (JSCompiler_temp = workInProgress.deletions, JSCompiler_temp === null ? (workInProgress.deletions = [current], workInProgress.flags |= 16) : JSCompiler_temp.push(current));
  workInProgress.child = renderLanes2;
  workInProgress.memoizedState = null;
  return renderLanes2;
}
function mountSuspensePrimaryChildren(workInProgress, primaryChildren) {
  primaryChildren = mountWorkInProgressOffscreenFiber({ mode: "visible", children: primaryChildren }, workInProgress.mode);
  primaryChildren.return = workInProgress;
  return workInProgress.child = primaryChildren;
}
function mountWorkInProgressOffscreenFiber(offscreenProps, mode) {
  offscreenProps = createFiberImplClass(22, offscreenProps, null, mode);
  offscreenProps.lanes = 0;
  return offscreenProps;
}
function retrySuspenseComponentWithoutHydrating(current, workInProgress, renderLanes2) {
  reconcileChildFibers(workInProgress, current.child, null, renderLanes2);
  current = mountSuspensePrimaryChildren(workInProgress, workInProgress.pendingProps.children);
  current.flags |= 2;
  workInProgress.memoizedState = null;
  return current;
}
function scheduleSuspenseWorkOnFiber(fiber, renderLanes2, propagationRoot) {
  fiber.lanes |= renderLanes2;
  var alternate = fiber.alternate;
  alternate !== null && (alternate.lanes |= renderLanes2);
  scheduleContextWorkOnParentPath(fiber.return, renderLanes2, propagationRoot);
}
function initSuspenseListRenderState(workInProgress, isBackwards, tail, lastContentRow, tailMode, treeForkCount2) {
  var renderState = workInProgress.memoizedState;
  renderState === null ? workInProgress.memoizedState = {
    isBackwards,
    rendering: null,
    renderingStartTime: 0,
    last: lastContentRow,
    tail,
    tailMode,
    treeForkCount: treeForkCount2
  } : (renderState.isBackwards = isBackwards, renderState.rendering = null, renderState.renderingStartTime = 0, renderState.last = lastContentRow, renderState.tail = tail, renderState.tailMode = tailMode, renderState.treeForkCount = treeForkCount2);
}
function updateSuspenseListComponent(current, workInProgress, renderLanes2) {
  var nextProps = workInProgress.pendingProps, revealOrder = nextProps.revealOrder, tailMode = nextProps.tail;
  nextProps = nextProps.children;
  var suspenseContext = suspenseStackCursor.current, shouldForceFallback = (suspenseContext & 2) !== 0;
  shouldForceFallback ? (suspenseContext = suspenseContext & 1 | 2, workInProgress.flags |= 128) : suspenseContext &= 1;
  push2(suspenseStackCursor, suspenseContext);
  reconcileChildren(current, workInProgress, nextProps, renderLanes2);
  nextProps = isHydrating ? treeForkCount : 0;
  if (!shouldForceFallback && current !== null && (current.flags & 128) !== 0)
    a:
      for (current = workInProgress.child;current !== null; ) {
        if (current.tag === 13)
          current.memoizedState !== null && scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress);
        else if (current.tag === 19)
          scheduleSuspenseWorkOnFiber(current, renderLanes2, workInProgress);
        else if (current.child !== null) {
          current.child.return = current;
          current = current.child;
          continue;
        }
        if (current === workInProgress)
          break a;
        for (;current.sibling === null; ) {
          if (current.return === null || current.return === workInProgress)
            break a;
          current = current.return;
        }
        current.sibling.return = current.return;
        current = current.sibling;
      }
  switch (revealOrder) {
    case "forwards":
      renderLanes2 = workInProgress.child;
      for (revealOrder = null;renderLanes2 !== null; )
        current = renderLanes2.alternate, current !== null && findFirstSuspended(current) === null && (revealOrder = renderLanes2), renderLanes2 = renderLanes2.sibling;
      renderLanes2 = revealOrder;
      renderLanes2 === null ? (revealOrder = workInProgress.child, workInProgress.child = null) : (revealOrder = renderLanes2.sibling, renderLanes2.sibling = null);
      initSuspenseListRenderState(workInProgress, false, revealOrder, renderLanes2, tailMode, nextProps);
      break;
    case "backwards":
    case "unstable_legacy-backwards":
      renderLanes2 = null;
      revealOrder = workInProgress.child;
      for (workInProgress.child = null;revealOrder !== null; ) {
        current = revealOrder.alternate;
        if (current !== null && findFirstSuspended(current) === null) {
          workInProgress.child = revealOrder;
          break;
        }
        current = revealOrder.sibling;
        revealOrder.sibling = renderLanes2;
        renderLanes2 = revealOrder;
        revealOrder = current;
      }
      initSuspenseListRenderState(workInProgress, true, renderLanes2, null, tailMode, nextProps);
      break;
    case "together":
      initSuspenseListRenderState(workInProgress, false, null, null, undefined, nextProps);
      break;
    default:
      workInProgress.memoizedState = null;
  }
  return workInProgress.child;
}
function bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2) {
  current !== null && (workInProgress.dependencies = current.dependencies);
  workInProgressRootSkippedLanes |= workInProgress.lanes;
  if ((renderLanes2 & workInProgress.childLanes) === 0)
    if (current !== null) {
      if (propagateParentContextChanges(current, workInProgress, renderLanes2, false), (renderLanes2 & workInProgress.childLanes) === 0)
        return null;
    } else
      return null;
  if (current !== null && workInProgress.child !== current.child)
    throw Error(formatProdErrorMessage(153));
  if (workInProgress.child !== null) {
    current = workInProgress.child;
    renderLanes2 = createWorkInProgress(current, current.pendingProps);
    workInProgress.child = renderLanes2;
    for (renderLanes2.return = workInProgress;current.sibling !== null; )
      current = current.sibling, renderLanes2 = renderLanes2.sibling = createWorkInProgress(current, current.pendingProps), renderLanes2.return = workInProgress;
    renderLanes2.sibling = null;
  }
  return workInProgress.child;
}
function checkScheduledUpdateOrContext(current, renderLanes2) {
  if ((current.lanes & renderLanes2) !== 0)
    return true;
  current = current.dependencies;
  return current !== null && checkIfContextChanged(current) ? true : false;
}
function attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress, renderLanes2) {
  switch (workInProgress.tag) {
    case 3:
      pushHostContainer(workInProgress, workInProgress.stateNode.containerInfo);
      pushProvider(workInProgress, CacheContext, current.memoizedState.cache);
      resetHydrationState();
      break;
    case 27:
    case 5:
      pushHostContext(workInProgress);
      break;
    case 4:
      pushHostContainer(workInProgress, workInProgress.stateNode.containerInfo);
      break;
    case 10:
      pushProvider(workInProgress, workInProgress.type, workInProgress.memoizedProps.value);
      break;
    case 31:
      if (workInProgress.memoizedState !== null)
        return workInProgress.flags |= 128, pushDehydratedActivitySuspenseHandler(workInProgress), null;
      break;
    case 13:
      var state$102 = workInProgress.memoizedState;
      if (state$102 !== null) {
        if (state$102.dehydrated !== null)
          return pushPrimaryTreeSuspenseHandler(workInProgress), workInProgress.flags |= 128, null;
        if ((renderLanes2 & workInProgress.child.childLanes) !== 0)
          return updateSuspenseComponent(current, workInProgress, renderLanes2);
        pushPrimaryTreeSuspenseHandler(workInProgress);
        current = bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
        return current !== null ? current.sibling : null;
      }
      pushPrimaryTreeSuspenseHandler(workInProgress);
      break;
    case 19:
      var didSuspendBefore = (current.flags & 128) !== 0;
      state$102 = (renderLanes2 & workInProgress.childLanes) !== 0;
      state$102 || (propagateParentContextChanges(current, workInProgress, renderLanes2, false), state$102 = (renderLanes2 & workInProgress.childLanes) !== 0);
      if (didSuspendBefore) {
        if (state$102)
          return updateSuspenseListComponent(current, workInProgress, renderLanes2);
        workInProgress.flags |= 128;
      }
      didSuspendBefore = workInProgress.memoizedState;
      didSuspendBefore !== null && (didSuspendBefore.rendering = null, didSuspendBefore.tail = null, didSuspendBefore.lastEffect = null);
      push2(suspenseStackCursor, suspenseStackCursor.current);
      if (state$102)
        break;
      else
        return null;
    case 22:
      return workInProgress.lanes = 0, updateOffscreenComponent(current, workInProgress, renderLanes2, workInProgress.pendingProps);
    case 24:
      pushProvider(workInProgress, CacheContext, current.memoizedState.cache);
  }
  return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
}
function beginWork(current, workInProgress, renderLanes2) {
  if (current !== null)
    if (current.memoizedProps !== workInProgress.pendingProps)
      didReceiveUpdate = true;
    else {
      if (!checkScheduledUpdateOrContext(current, renderLanes2) && (workInProgress.flags & 128) === 0)
        return didReceiveUpdate = false, attemptEarlyBailoutIfNoScheduledUpdate(current, workInProgress, renderLanes2);
      didReceiveUpdate = (current.flags & 131072) !== 0 ? true : false;
    }
  else
    didReceiveUpdate = false, isHydrating && (workInProgress.flags & 1048576) !== 0 && pushTreeId(workInProgress, treeForkCount, workInProgress.index);
  workInProgress.lanes = 0;
  switch (workInProgress.tag) {
    case 16:
      a: {
        var props = workInProgress.pendingProps;
        current = resolveLazy(workInProgress.elementType);
        workInProgress.type = current;
        if (typeof current === "function")
          shouldConstruct(current) ? (props = resolveClassComponentProps(current, props), workInProgress.tag = 1, workInProgress = updateClassComponent(null, workInProgress, current, props, renderLanes2)) : (workInProgress.tag = 0, workInProgress = updateFunctionComponent(null, workInProgress, current, props, renderLanes2));
        else {
          if (current !== undefined && current !== null) {
            var $$typeof = current.$$typeof;
            if ($$typeof === REACT_FORWARD_REF_TYPE) {
              workInProgress.tag = 11;
              workInProgress = updateForwardRef(null, workInProgress, current, props, renderLanes2);
              break a;
            } else if ($$typeof === REACT_MEMO_TYPE) {
              workInProgress.tag = 14;
              workInProgress = updateMemoComponent(null, workInProgress, current, props, renderLanes2);
              break a;
            }
          }
          workInProgress = getComponentNameFromType(current) || current;
          throw Error(formatProdErrorMessage(306, workInProgress, ""));
        }
      }
      return workInProgress;
    case 0:
      return updateFunctionComponent(current, workInProgress, workInProgress.type, workInProgress.pendingProps, renderLanes2);
    case 1:
      return props = workInProgress.type, $$typeof = resolveClassComponentProps(props, workInProgress.pendingProps), updateClassComponent(current, workInProgress, props, $$typeof, renderLanes2);
    case 3:
      a: {
        pushHostContainer(workInProgress, workInProgress.stateNode.containerInfo);
        if (current === null)
          throw Error(formatProdErrorMessage(387));
        props = workInProgress.pendingProps;
        var prevState = workInProgress.memoizedState;
        $$typeof = prevState.element;
        cloneUpdateQueue(current, workInProgress);
        processUpdateQueue(workInProgress, props, null, renderLanes2);
        var nextState = workInProgress.memoizedState;
        props = nextState.cache;
        pushProvider(workInProgress, CacheContext, props);
        props !== prevState.cache && propagateContextChanges(workInProgress, [CacheContext], renderLanes2, true);
        suspendIfUpdateReadFromEntangledAsyncAction();
        props = nextState.element;
        if (prevState.isDehydrated)
          if (prevState = {
            element: props,
            isDehydrated: false,
            cache: nextState.cache
          }, workInProgress.updateQueue.baseState = prevState, workInProgress.memoizedState = prevState, workInProgress.flags & 256) {
            workInProgress = mountHostRootWithoutHydrating(current, workInProgress, props, renderLanes2);
            break a;
          } else if (props !== $$typeof) {
            $$typeof = createCapturedValueAtFiber(Error(formatProdErrorMessage(424)), workInProgress);
            queueHydrationError($$typeof);
            workInProgress = mountHostRootWithoutHydrating(current, workInProgress, props, renderLanes2);
            break a;
          } else {
            current = workInProgress.stateNode.containerInfo;
            switch (current.nodeType) {
              case 9:
                current = current.body;
                break;
              default:
                current = current.nodeName === "HTML" ? current.ownerDocument.body : current;
            }
            nextHydratableInstance = getNextHydratable(current.firstChild);
            hydrationParentFiber = workInProgress;
            isHydrating = true;
            hydrationErrors = null;
            rootOrSingletonContext = true;
            renderLanes2 = mountChildFibers(workInProgress, null, props, renderLanes2);
            for (workInProgress.child = renderLanes2;renderLanes2; )
              renderLanes2.flags = renderLanes2.flags & -3 | 4096, renderLanes2 = renderLanes2.sibling;
          }
        else {
          resetHydrationState();
          if (props === $$typeof) {
            workInProgress = bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes2);
            break a;
          }
          reconcileChildren(current, workInProgress, props, renderLanes2);
        }
        workInProgress = workInProgress.child;
      }
      return workInProgress;
    case 26:
      return markRef(current, workInProgress), current === null ? (renderLanes2 = getResource(workInProgress.type, null, workInProgress.pendingProps, null)) ? workInProgress.memoizedState = renderLanes2 : isHydrating || (renderLanes2 = workInProgress.type, current = workInProgress.pendingProps, props = getOwnerDocumentFromRootContainer(rootInstanceStackCursor.current).createElement(renderLanes2), props[internalInstanceKey] = workInProgress, props[internalPropsKey] = current, setInitialProperties(props, renderLanes2, current), markNodeAsHoistable(props), workInProgress.stateNode = props) : workInProgress.memoizedState = getResource(workInProgress.type, current.memoizedProps, workInProgress.pendingProps, current.memoizedState), null;
    case 27:
      return pushHostContext(workInProgress), current === null && isHydrating && (props = workInProgress.stateNode = resolveSingletonInstance(workInProgress.type, workInProgress.pendingProps, rootInstanceStackCursor.current), hydrationParentFiber = workInProgress, rootOrSingletonContext = true, $$typeof = nextHydratableInstance, isSingletonScope(workInProgress.type) ? (previousHydratableOnEnteringScopedSingleton = $$typeof, nextHydratableInstance = getNextHydratable(props.firstChild)) : nextHydratableInstance = $$typeof), reconcileChildren(current, workInProgress, workInProgress.pendingProps.children, renderLanes2), markRef(current, workInProgress), current === null && (workInProgress.flags |= 4194304), workInProgress.child;
    case 5:
      if (current === null && isHydrating) {
        if ($$typeof = props = nextHydratableInstance)
          props = canHydrateInstance(props, workInProgress.type, workInProgress.pendingProps, rootOrSingletonContext), props !== null ? (workInProgress.stateNode = props, hydrationParentFiber = workInProgress, nextHydratableInstance = getNextHydratable(props.firstChild), rootOrSingletonContext = false, $$typeof = true) : $$typeof = false;
        $$typeof || throwOnHydrationMismatch(workInProgress);
      }
      pushHostContext(workInProgress);
      $$typeof = workInProgress.type;
      prevState = workInProgress.pendingProps;
      nextState = current !== null ? current.memoizedProps : null;
      props = prevState.children;
      shouldSetTextContent($$typeof, prevState) ? props = null : nextState !== null && shouldSetTextContent($$typeof, nextState) && (workInProgress.flags |= 32);
      workInProgress.memoizedState !== null && ($$typeof = renderWithHooks(current, workInProgress, TransitionAwareHostComponent, null, null, renderLanes2), HostTransitionContext._currentValue = $$typeof);
      markRef(current, workInProgress);
      reconcileChildren(current, workInProgress, props, renderLanes2);
      return workInProgress.child;
    case 6:
      if (current === null && isHydrating) {
        if (current = renderLanes2 = nextHydratableInstance)
          renderLanes2 = canHydrateTextInstance(renderLanes2, workInProgress.pendingProps, rootOrSingletonContext), renderLanes2 !== null ? (workInProgress.stateNode = renderLanes2, hydrationParentFiber = workInProgress, nextHydratableInstance = null, current = true) : current = false;
        current || throwOnHydrationMismatch(workInProgress);
      }
      return null;
    case 13:
      return updateSuspenseComponent(current, workInProgress, renderLanes2);
    case 4:
      return pushHostContainer(workInProgress, workInProgress.stateNode.containerInfo), props = workInProgress.pendingProps, current === null ? workInProgress.child = reconcileChildFibers(workInProgress, null, props, renderLanes2) : reconcileChildren(current, workInProgress, props, renderLanes2), workInProgress.child;
    case 11:
      return updateForwardRef(current, workInProgress, workInProgress.type, workInProgress.pendingProps, renderLanes2);
    case 7:
      return reconcileChildren(current, workInProgress, workInProgress.pendingProps, renderLanes2), workInProgress.child;
    case 8:
      return reconcileChildren(current, workInProgress, workInProgress.pendingProps.children, renderLanes2), workInProgress.child;
    case 12:
      return reconcileChildren(current, workInProgress, workInProgress.pendingProps.children, renderLanes2), workInProgress.child;
    case 10:
      return props = workInProgress.pendingProps, pushProvider(workInProgress, workInProgress.type, props.value), reconcileChildren(current, workInProgress, props.children, renderLanes2), workInProgress.child;
    case 9:
      return $$typeof = workInProgress.type._context, props = workInProgress.pendingProps.children, prepareToReadContext(workInProgress), $$typeof = readContext($$typeof), props = props($$typeof), workInProgress.flags |= 1, reconcileChildren(current, workInProgress, props, renderLanes2), workInProgress.child;
    case 14:
      return updateMemoComponent(current, workInProgress, workInProgress.type, workInProgress.pendingProps, renderLanes2);
    case 15:
      return updateSimpleMemoComponent(current, workInProgress, workInProgress.type, workInProgress.pendingProps, renderLanes2);
    case 19:
      return updateSuspenseListComponent(current, workInProgress, renderLanes2);
    case 31:
      return updateActivityComponent(current, workInProgress, renderLanes2);
    case 22:
      return updateOffscreenComponent(current, workInProgress, renderLanes2, workInProgress.pendingProps);
    case 24:
      return prepareToReadContext(workInProgress), props = readContext(CacheContext), current === null ? ($$typeof = peekCacheFromPool(), $$typeof === null && ($$typeof = workInProgressRoot, prevState = createCache(), $$typeof.pooledCache = prevState, prevState.refCount++, prevState !== null && ($$typeof.pooledCacheLanes |= renderLanes2), $$typeof = prevState), workInProgress.memoizedState = { parent: props, cache: $$typeof }, initializeUpdateQueue(workInProgress), pushProvider(workInProgress, CacheContext, $$typeof)) : ((current.lanes & renderLanes2) !== 0 && (cloneUpdateQueue(current, workInProgress), processUpdateQueue(workInProgress, null, null, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction()), $$typeof = current.memoizedState, prevState = workInProgress.memoizedState, $$typeof.parent !== props ? ($$typeof = { parent: props, cache: props }, workInProgress.memoizedState = $$typeof, workInProgress.lanes === 0 && (workInProgress.memoizedState = workInProgress.updateQueue.baseState = $$typeof), pushProvider(workInProgress, CacheContext, props)) : (props = prevState.cache, pushProvider(workInProgress, CacheContext, props), props !== $$typeof.cache && propagateContextChanges(workInProgress, [CacheContext], renderLanes2, true))), reconcileChildren(current, workInProgress, workInProgress.pendingProps.children, renderLanes2), workInProgress.child;
    case 29:
      throw workInProgress.pendingProps;
  }
  throw Error(formatProdErrorMessage(156, workInProgress.tag));
}
function markUpdate(workInProgress) {
  workInProgress.flags |= 4;
}
function preloadInstanceAndSuspendIfNeeded(workInProgress, type, oldProps, newProps, renderLanes2) {
  if (type = (workInProgress.mode & 32) !== 0)
    type = false;
  if (type) {
    if (workInProgress.flags |= 16777216, (renderLanes2 & 335544128) === renderLanes2)
      if (workInProgress.stateNode.complete)
        workInProgress.flags |= 8192;
      else if (shouldRemainOnPreviousScreen())
        workInProgress.flags |= 8192;
      else
        throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
  } else
    workInProgress.flags &= -16777217;
}
function preloadResourceAndSuspendIfNeeded(workInProgress, resource) {
  if (resource.type !== "stylesheet" || (resource.state.loading & 4) !== 0)
    workInProgress.flags &= -16777217;
  else if (workInProgress.flags |= 16777216, !preloadResource(resource))
    if (shouldRemainOnPreviousScreen())
      workInProgress.flags |= 8192;
    else
      throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
}
function scheduleRetryEffect(workInProgress, retryQueue) {
  retryQueue !== null && (workInProgress.flags |= 4);
  workInProgress.flags & 16384 && (retryQueue = workInProgress.tag !== 22 ? claimNextRetryLane() : 536870912, workInProgress.lanes |= retryQueue, workInProgressSuspendedRetryLanes |= retryQueue);
}
function cutOffTailIfNeeded(renderState, hasRenderedATailFallback) {
  if (!isHydrating)
    switch (renderState.tailMode) {
      case "hidden":
        hasRenderedATailFallback = renderState.tail;
        for (var lastTailNode = null;hasRenderedATailFallback !== null; )
          hasRenderedATailFallback.alternate !== null && (lastTailNode = hasRenderedATailFallback), hasRenderedATailFallback = hasRenderedATailFallback.sibling;
        lastTailNode === null ? renderState.tail = null : lastTailNode.sibling = null;
        break;
      case "collapsed":
        lastTailNode = renderState.tail;
        for (var lastTailNode$106 = null;lastTailNode !== null; )
          lastTailNode.alternate !== null && (lastTailNode$106 = lastTailNode), lastTailNode = lastTailNode.sibling;
        lastTailNode$106 === null ? hasRenderedATailFallback || renderState.tail === null ? renderState.tail = null : renderState.tail.sibling = null : lastTailNode$106.sibling = null;
    }
}
function bubbleProperties(completedWork) {
  var didBailout = completedWork.alternate !== null && completedWork.alternate.child === completedWork.child, newChildLanes = 0, subtreeFlags = 0;
  if (didBailout)
    for (var child$107 = completedWork.child;child$107 !== null; )
      newChildLanes |= child$107.lanes | child$107.childLanes, subtreeFlags |= child$107.subtreeFlags & 65011712, subtreeFlags |= child$107.flags & 65011712, child$107.return = completedWork, child$107 = child$107.sibling;
  else
    for (child$107 = completedWork.child;child$107 !== null; )
      newChildLanes |= child$107.lanes | child$107.childLanes, subtreeFlags |= child$107.subtreeFlags, subtreeFlags |= child$107.flags, child$107.return = completedWork, child$107 = child$107.sibling;
  completedWork.subtreeFlags |= subtreeFlags;
  completedWork.childLanes = newChildLanes;
  return didBailout;
}
function completeWork(current, workInProgress, renderLanes2) {
  var newProps = workInProgress.pendingProps;
  popTreeContext(workInProgress);
  switch (workInProgress.tag) {
    case 16:
    case 15:
    case 0:
    case 11:
    case 7:
    case 8:
    case 12:
    case 9:
    case 14:
      return bubbleProperties(workInProgress), null;
    case 1:
      return bubbleProperties(workInProgress), null;
    case 3:
      renderLanes2 = workInProgress.stateNode;
      newProps = null;
      current !== null && (newProps = current.memoizedState.cache);
      workInProgress.memoizedState.cache !== newProps && (workInProgress.flags |= 2048);
      popProvider(CacheContext);
      popHostContainer();
      renderLanes2.pendingContext && (renderLanes2.context = renderLanes2.pendingContext, renderLanes2.pendingContext = null);
      if (current === null || current.child === null)
        popHydrationState(workInProgress) ? markUpdate(workInProgress) : current === null || current.memoizedState.isDehydrated && (workInProgress.flags & 256) === 0 || (workInProgress.flags |= 1024, upgradeHydrationErrorsToRecoverable());
      bubbleProperties(workInProgress);
      return null;
    case 26:
      var { type, memoizedState: nextResource } = workInProgress;
      current === null ? (markUpdate(workInProgress), nextResource !== null ? (bubbleProperties(workInProgress), preloadResourceAndSuspendIfNeeded(workInProgress, nextResource)) : (bubbleProperties(workInProgress), preloadInstanceAndSuspendIfNeeded(workInProgress, type, null, newProps, renderLanes2))) : nextResource ? nextResource !== current.memoizedState ? (markUpdate(workInProgress), bubbleProperties(workInProgress), preloadResourceAndSuspendIfNeeded(workInProgress, nextResource)) : (bubbleProperties(workInProgress), workInProgress.flags &= -16777217) : (current = current.memoizedProps, current !== newProps && markUpdate(workInProgress), bubbleProperties(workInProgress), preloadInstanceAndSuspendIfNeeded(workInProgress, type, current, newProps, renderLanes2));
      return null;
    case 27:
      popHostContext(workInProgress);
      renderLanes2 = rootInstanceStackCursor.current;
      type = workInProgress.type;
      if (current !== null && workInProgress.stateNode != null)
        current.memoizedProps !== newProps && markUpdate(workInProgress);
      else {
        if (!newProps) {
          if (workInProgress.stateNode === null)
            throw Error(formatProdErrorMessage(166));
          bubbleProperties(workInProgress);
          return null;
        }
        current = contextStackCursor.current;
        popHydrationState(workInProgress) ? prepareToHydrateHostInstance(workInProgress, current) : (current = resolveSingletonInstance(type, newProps, renderLanes2), workInProgress.stateNode = current, markUpdate(workInProgress));
      }
      bubbleProperties(workInProgress);
      return null;
    case 5:
      popHostContext(workInProgress);
      type = workInProgress.type;
      if (current !== null && workInProgress.stateNode != null)
        current.memoizedProps !== newProps && markUpdate(workInProgress);
      else {
        if (!newProps) {
          if (workInProgress.stateNode === null)
            throw Error(formatProdErrorMessage(166));
          bubbleProperties(workInProgress);
          return null;
        }
        nextResource = contextStackCursor.current;
        if (popHydrationState(workInProgress))
          prepareToHydrateHostInstance(workInProgress, nextResource);
        else {
          var ownerDocument = getOwnerDocumentFromRootContainer(rootInstanceStackCursor.current);
          switch (nextResource) {
            case 1:
              nextResource = ownerDocument.createElementNS("http://www.w3.org/2000/svg", type);
              break;
            case 2:
              nextResource = ownerDocument.createElementNS("http://www.w3.org/1998/Math/MathML", type);
              break;
            default:
              switch (type) {
                case "svg":
                  nextResource = ownerDocument.createElementNS("http://www.w3.org/2000/svg", type);
                  break;
                case "math":
                  nextResource = ownerDocument.createElementNS("http://www.w3.org/1998/Math/MathML", type);
                  break;
                case "script":
                  nextResource = ownerDocument.createElement("div");
                  nextResource.innerHTML = "<script></script>";
                  nextResource = nextResource.removeChild(nextResource.firstChild);
                  break;
                case "select":
                  nextResource = typeof newProps.is === "string" ? ownerDocument.createElement("select", {
                    is: newProps.is
                  }) : ownerDocument.createElement("select");
                  newProps.multiple ? nextResource.multiple = true : newProps.size && (nextResource.size = newProps.size);
                  break;
                default:
                  nextResource = typeof newProps.is === "string" ? ownerDocument.createElement(type, { is: newProps.is }) : ownerDocument.createElement(type);
              }
          }
          nextResource[internalInstanceKey] = workInProgress;
          nextResource[internalPropsKey] = newProps;
          a:
            for (ownerDocument = workInProgress.child;ownerDocument !== null; ) {
              if (ownerDocument.tag === 5 || ownerDocument.tag === 6)
                nextResource.appendChild(ownerDocument.stateNode);
              else if (ownerDocument.tag !== 4 && ownerDocument.tag !== 27 && ownerDocument.child !== null) {
                ownerDocument.child.return = ownerDocument;
                ownerDocument = ownerDocument.child;
                continue;
              }
              if (ownerDocument === workInProgress)
                break a;
              for (;ownerDocument.sibling === null; ) {
                if (ownerDocument.return === null || ownerDocument.return === workInProgress)
                  break a;
                ownerDocument = ownerDocument.return;
              }
              ownerDocument.sibling.return = ownerDocument.return;
              ownerDocument = ownerDocument.sibling;
            }
          workInProgress.stateNode = nextResource;
          a:
            switch (setInitialProperties(nextResource, type, newProps), type) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                newProps = !!newProps.autoFocus;
                break a;
              case "img":
                newProps = true;
                break a;
              default:
                newProps = false;
            }
          newProps && markUpdate(workInProgress);
        }
      }
      bubbleProperties(workInProgress);
      preloadInstanceAndSuspendIfNeeded(workInProgress, workInProgress.type, current === null ? null : current.memoizedProps, workInProgress.pendingProps, renderLanes2);
      return null;
    case 6:
      if (current && workInProgress.stateNode != null)
        current.memoizedProps !== newProps && markUpdate(workInProgress);
      else {
        if (typeof newProps !== "string" && workInProgress.stateNode === null)
          throw Error(formatProdErrorMessage(166));
        current = rootInstanceStackCursor.current;
        if (popHydrationState(workInProgress)) {
          current = workInProgress.stateNode;
          renderLanes2 = workInProgress.memoizedProps;
          newProps = null;
          type = hydrationParentFiber;
          if (type !== null)
            switch (type.tag) {
              case 27:
              case 5:
                newProps = type.memoizedProps;
            }
          current[internalInstanceKey] = workInProgress;
          current = current.nodeValue === renderLanes2 || newProps !== null && newProps.suppressHydrationWarning === true || checkForUnmatchedText(current.nodeValue, renderLanes2) ? true : false;
          current || throwOnHydrationMismatch(workInProgress, true);
        } else
          current = getOwnerDocumentFromRootContainer(current).createTextNode(newProps), current[internalInstanceKey] = workInProgress, workInProgress.stateNode = current;
      }
      bubbleProperties(workInProgress);
      return null;
    case 31:
      renderLanes2 = workInProgress.memoizedState;
      if (current === null || current.memoizedState !== null) {
        newProps = popHydrationState(workInProgress);
        if (renderLanes2 !== null) {
          if (current === null) {
            if (!newProps)
              throw Error(formatProdErrorMessage(318));
            current = workInProgress.memoizedState;
            current = current !== null ? current.dehydrated : null;
            if (!current)
              throw Error(formatProdErrorMessage(557));
            current[internalInstanceKey] = workInProgress;
          } else
            resetHydrationState(), (workInProgress.flags & 128) === 0 && (workInProgress.memoizedState = null), workInProgress.flags |= 4;
          bubbleProperties(workInProgress);
          current = false;
        } else
          renderLanes2 = upgradeHydrationErrorsToRecoverable(), current !== null && current.memoizedState !== null && (current.memoizedState.hydrationErrors = renderLanes2), current = true;
        if (!current) {
          if (workInProgress.flags & 256)
            return popSuspenseHandler(workInProgress), workInProgress;
          popSuspenseHandler(workInProgress);
          return null;
        }
        if ((workInProgress.flags & 128) !== 0)
          throw Error(formatProdErrorMessage(558));
      }
      bubbleProperties(workInProgress);
      return null;
    case 13:
      newProps = workInProgress.memoizedState;
      if (current === null || current.memoizedState !== null && current.memoizedState.dehydrated !== null) {
        type = popHydrationState(workInProgress);
        if (newProps !== null && newProps.dehydrated !== null) {
          if (current === null) {
            if (!type)
              throw Error(formatProdErrorMessage(318));
            type = workInProgress.memoizedState;
            type = type !== null ? type.dehydrated : null;
            if (!type)
              throw Error(formatProdErrorMessage(317));
            type[internalInstanceKey] = workInProgress;
          } else
            resetHydrationState(), (workInProgress.flags & 128) === 0 && (workInProgress.memoizedState = null), workInProgress.flags |= 4;
          bubbleProperties(workInProgress);
          type = false;
        } else
          type = upgradeHydrationErrorsToRecoverable(), current !== null && current.memoizedState !== null && (current.memoizedState.hydrationErrors = type), type = true;
        if (!type) {
          if (workInProgress.flags & 256)
            return popSuspenseHandler(workInProgress), workInProgress;
          popSuspenseHandler(workInProgress);
          return null;
        }
      }
      popSuspenseHandler(workInProgress);
      if ((workInProgress.flags & 128) !== 0)
        return workInProgress.lanes = renderLanes2, workInProgress;
      renderLanes2 = newProps !== null;
      current = current !== null && current.memoizedState !== null;
      renderLanes2 && (newProps = workInProgress.child, type = null, newProps.alternate !== null && newProps.alternate.memoizedState !== null && newProps.alternate.memoizedState.cachePool !== null && (type = newProps.alternate.memoizedState.cachePool.pool), nextResource = null, newProps.memoizedState !== null && newProps.memoizedState.cachePool !== null && (nextResource = newProps.memoizedState.cachePool.pool), nextResource !== type && (newProps.flags |= 2048));
      renderLanes2 !== current && renderLanes2 && (workInProgress.child.flags |= 8192);
      scheduleRetryEffect(workInProgress, workInProgress.updateQueue);
      bubbleProperties(workInProgress);
      return null;
    case 4:
      return popHostContainer(), current === null && listenToAllSupportedEvents(workInProgress.stateNode.containerInfo), bubbleProperties(workInProgress), null;
    case 10:
      return popProvider(workInProgress.type), bubbleProperties(workInProgress), null;
    case 19:
      pop2(suspenseStackCursor);
      newProps = workInProgress.memoizedState;
      if (newProps === null)
        return bubbleProperties(workInProgress), null;
      type = (workInProgress.flags & 128) !== 0;
      nextResource = newProps.rendering;
      if (nextResource === null)
        if (type)
          cutOffTailIfNeeded(newProps, false);
        else {
          if (workInProgressRootExitStatus !== 0 || current !== null && (current.flags & 128) !== 0)
            for (current = workInProgress.child;current !== null; ) {
              nextResource = findFirstSuspended(current);
              if (nextResource !== null) {
                workInProgress.flags |= 128;
                cutOffTailIfNeeded(newProps, false);
                current = nextResource.updateQueue;
                workInProgress.updateQueue = current;
                scheduleRetryEffect(workInProgress, current);
                workInProgress.subtreeFlags = 0;
                current = renderLanes2;
                for (renderLanes2 = workInProgress.child;renderLanes2 !== null; )
                  resetWorkInProgress(renderLanes2, current), renderLanes2 = renderLanes2.sibling;
                push2(suspenseStackCursor, suspenseStackCursor.current & 1 | 2);
                isHydrating && pushTreeFork(workInProgress, newProps.treeForkCount);
                return workInProgress.child;
              }
              current = current.sibling;
            }
          newProps.tail !== null && now() > workInProgressRootRenderTargetTime && (workInProgress.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress.lanes = 4194304);
        }
      else {
        if (!type)
          if (current = findFirstSuspended(nextResource), current !== null) {
            if (workInProgress.flags |= 128, type = true, current = current.updateQueue, workInProgress.updateQueue = current, scheduleRetryEffect(workInProgress, current), cutOffTailIfNeeded(newProps, true), newProps.tail === null && newProps.tailMode === "hidden" && !nextResource.alternate && !isHydrating)
              return bubbleProperties(workInProgress), null;
          } else
            2 * now() - newProps.renderingStartTime > workInProgressRootRenderTargetTime && renderLanes2 !== 536870912 && (workInProgress.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress.lanes = 4194304);
        newProps.isBackwards ? (nextResource.sibling = workInProgress.child, workInProgress.child = nextResource) : (current = newProps.last, current !== null ? current.sibling = nextResource : workInProgress.child = nextResource, newProps.last = nextResource);
      }
      if (newProps.tail !== null)
        return current = newProps.tail, newProps.rendering = current, newProps.tail = current.sibling, newProps.renderingStartTime = now(), current.sibling = null, renderLanes2 = suspenseStackCursor.current, push2(suspenseStackCursor, type ? renderLanes2 & 1 | 2 : renderLanes2 & 1), isHydrating && pushTreeFork(workInProgress, newProps.treeForkCount), current;
      bubbleProperties(workInProgress);
      return null;
    case 22:
    case 23:
      return popSuspenseHandler(workInProgress), popHiddenContext(), newProps = workInProgress.memoizedState !== null, current !== null ? current.memoizedState !== null !== newProps && (workInProgress.flags |= 8192) : newProps && (workInProgress.flags |= 8192), newProps ? (renderLanes2 & 536870912) !== 0 && (workInProgress.flags & 128) === 0 && (bubbleProperties(workInProgress), workInProgress.subtreeFlags & 6 && (workInProgress.flags |= 8192)) : bubbleProperties(workInProgress), renderLanes2 = workInProgress.updateQueue, renderLanes2 !== null && scheduleRetryEffect(workInProgress, renderLanes2.retryQueue), renderLanes2 = null, current !== null && current.memoizedState !== null && current.memoizedState.cachePool !== null && (renderLanes2 = current.memoizedState.cachePool.pool), newProps = null, workInProgress.memoizedState !== null && workInProgress.memoizedState.cachePool !== null && (newProps = workInProgress.memoizedState.cachePool.pool), newProps !== renderLanes2 && (workInProgress.flags |= 2048), current !== null && pop2(resumedCache), null;
    case 24:
      return renderLanes2 = null, current !== null && (renderLanes2 = current.memoizedState.cache), workInProgress.memoizedState.cache !== renderLanes2 && (workInProgress.flags |= 2048), popProvider(CacheContext), bubbleProperties(workInProgress), null;
    case 25:
      return null;
    case 30:
      return null;
  }
  throw Error(formatProdErrorMessage(156, workInProgress.tag));
}
function unwindWork(current, workInProgress) {
  popTreeContext(workInProgress);
  switch (workInProgress.tag) {
    case 1:
      return current = workInProgress.flags, current & 65536 ? (workInProgress.flags = current & -65537 | 128, workInProgress) : null;
    case 3:
      return popProvider(CacheContext), popHostContainer(), current = workInProgress.flags, (current & 65536) !== 0 && (current & 128) === 0 ? (workInProgress.flags = current & -65537 | 128, workInProgress) : null;
    case 26:
    case 27:
    case 5:
      return popHostContext(workInProgress), null;
    case 31:
      if (workInProgress.memoizedState !== null) {
        popSuspenseHandler(workInProgress);
        if (workInProgress.alternate === null)
          throw Error(formatProdErrorMessage(340));
        resetHydrationState();
      }
      current = workInProgress.flags;
      return current & 65536 ? (workInProgress.flags = current & -65537 | 128, workInProgress) : null;
    case 13:
      popSuspenseHandler(workInProgress);
      current = workInProgress.memoizedState;
      if (current !== null && current.dehydrated !== null) {
        if (workInProgress.alternate === null)
          throw Error(formatProdErrorMessage(340));
        resetHydrationState();
      }
      current = workInProgress.flags;
      return current & 65536 ? (workInProgress.flags = current & -65537 | 128, workInProgress) : null;
    case 19:
      return pop2(suspenseStackCursor), null;
    case 4:
      return popHostContainer(), null;
    case 10:
      return popProvider(workInProgress.type), null;
    case 22:
    case 23:
      return popSuspenseHandler(workInProgress), popHiddenContext(), current !== null && pop2(resumedCache), current = workInProgress.flags, current & 65536 ? (workInProgress.flags = current & -65537 | 128, workInProgress) : null;
    case 24:
      return popProvider(CacheContext), null;
    case 25:
      return null;
    default:
      return null;
  }
}
function unwindInterruptedWork(current, interruptedWork) {
  popTreeContext(interruptedWork);
  switch (interruptedWork.tag) {
    case 3:
      popProvider(CacheContext);
      popHostContainer();
      break;
    case 26:
    case 27:
    case 5:
      popHostContext(interruptedWork);
      break;
    case 4:
      popHostContainer();
      break;
    case 31:
      interruptedWork.memoizedState !== null && popSuspenseHandler(interruptedWork);
      break;
    case 13:
      popSuspenseHandler(interruptedWork);
      break;
    case 19:
      pop2(suspenseStackCursor);
      break;
    case 10:
      popProvider(interruptedWork.type);
      break;
    case 22:
    case 23:
      popSuspenseHandler(interruptedWork);
      popHiddenContext();
      current !== null && pop2(resumedCache);
      break;
    case 24:
      popProvider(CacheContext);
  }
}
function commitHookEffectListMount(flags, finishedWork) {
  try {
    var updateQueue = finishedWork.updateQueue, lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
    if (lastEffect !== null) {
      var firstEffect = lastEffect.next;
      updateQueue = firstEffect;
      do {
        if ((updateQueue.tag & flags) === flags) {
          lastEffect = undefined;
          var { create, inst } = updateQueue;
          lastEffect = create();
          inst.destroy = lastEffect;
        }
        updateQueue = updateQueue.next;
      } while (updateQueue !== firstEffect);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}
function commitHookEffectListUnmount(flags, finishedWork, nearestMountedAncestor$jscomp$0) {
  try {
    var updateQueue = finishedWork.updateQueue, lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
    if (lastEffect !== null) {
      var firstEffect = lastEffect.next;
      updateQueue = firstEffect;
      do {
        if ((updateQueue.tag & flags) === flags) {
          var inst = updateQueue.inst, destroy = inst.destroy;
          if (destroy !== undefined) {
            inst.destroy = undefined;
            lastEffect = finishedWork;
            var nearestMountedAncestor = nearestMountedAncestor$jscomp$0, destroy_ = destroy;
            try {
              destroy_();
            } catch (error) {
              captureCommitPhaseError(lastEffect, nearestMountedAncestor, error);
            }
          }
        }
        updateQueue = updateQueue.next;
      } while (updateQueue !== firstEffect);
    }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}
function commitClassCallbacks(finishedWork) {
  var updateQueue = finishedWork.updateQueue;
  if (updateQueue !== null) {
    var instance = finishedWork.stateNode;
    try {
      commitCallbacks(updateQueue, instance);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
  }
}
function safelyCallComponentWillUnmount(current, nearestMountedAncestor, instance) {
  instance.props = resolveClassComponentProps(current.type, current.memoizedProps);
  instance.state = current.memoizedState;
  try {
    instance.componentWillUnmount();
  } catch (error) {
    captureCommitPhaseError(current, nearestMountedAncestor, error);
  }
}
function safelyAttachRef(current, nearestMountedAncestor) {
  try {
    var ref = current.ref;
    if (ref !== null) {
      switch (current.tag) {
        case 26:
        case 27:
        case 5:
          var instanceToUse = current.stateNode;
          break;
        case 30:
          instanceToUse = current.stateNode;
          break;
        default:
          instanceToUse = current.stateNode;
      }
      typeof ref === "function" ? current.refCleanup = ref(instanceToUse) : ref.current = instanceToUse;
    }
  } catch (error) {
    captureCommitPhaseError(current, nearestMountedAncestor, error);
  }
}
function safelyDetachRef(current, nearestMountedAncestor) {
  var { ref, refCleanup } = current;
  if (ref !== null)
    if (typeof refCleanup === "function")
      try {
        refCleanup();
      } catch (error) {
        captureCommitPhaseError(current, nearestMountedAncestor, error);
      } finally {
        current.refCleanup = null, current = current.alternate, current != null && (current.refCleanup = null);
      }
    else if (typeof ref === "function")
      try {
        ref(null);
      } catch (error$140) {
        captureCommitPhaseError(current, nearestMountedAncestor, error$140);
      }
    else
      ref.current = null;
}
function commitHostMount(finishedWork) {
  var { type, memoizedProps: props, stateNode: instance } = finishedWork;
  try {
    a:
      switch (type) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          props.autoFocus && instance.focus();
          break a;
        case "img":
          props.src ? instance.src = props.src : props.srcSet && (instance.srcset = props.srcSet);
      }
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}
function commitHostUpdate(finishedWork, newProps, oldProps) {
  try {
    var domElement = finishedWork.stateNode;
    updateProperties(domElement, finishedWork.type, oldProps, newProps);
    domElement[internalPropsKey] = newProps;
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}
function isHostParent(fiber) {
  return fiber.tag === 5 || fiber.tag === 3 || fiber.tag === 26 || fiber.tag === 27 && isSingletonScope(fiber.type) || fiber.tag === 4;
}
function getHostSibling(fiber) {
  a:
    for (;; ) {
      for (;fiber.sibling === null; ) {
        if (fiber.return === null || isHostParent(fiber.return))
          return null;
        fiber = fiber.return;
      }
      fiber.sibling.return = fiber.return;
      for (fiber = fiber.sibling;fiber.tag !== 5 && fiber.tag !== 6 && fiber.tag !== 18; ) {
        if (fiber.tag === 27 && isSingletonScope(fiber.type))
          continue a;
        if (fiber.flags & 2)
          continue a;
        if (fiber.child === null || fiber.tag === 4)
          continue a;
        else
          fiber.child.return = fiber, fiber = fiber.child;
      }
      if (!(fiber.flags & 2))
        return fiber.stateNode;
    }
}
function insertOrAppendPlacementNodeIntoContainer(node, before, parent) {
  var tag = node.tag;
  if (tag === 5 || tag === 6)
    node = node.stateNode, before ? (parent.nodeType === 9 ? parent.body : parent.nodeName === "HTML" ? parent.ownerDocument.body : parent).insertBefore(node, before) : (before = parent.nodeType === 9 ? parent.body : parent.nodeName === "HTML" ? parent.ownerDocument.body : parent, before.appendChild(node), parent = parent._reactRootContainer, parent !== null && parent !== undefined || before.onclick !== null || (before.onclick = noop$1));
  else if (tag !== 4 && (tag === 27 && isSingletonScope(node.type) && (parent = node.stateNode, before = null), node = node.child, node !== null))
    for (insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling;node !== null; )
      insertOrAppendPlacementNodeIntoContainer(node, before, parent), node = node.sibling;
}
function insertOrAppendPlacementNode(node, before, parent) {
  var tag = node.tag;
  if (tag === 5 || tag === 6)
    node = node.stateNode, before ? parent.insertBefore(node, before) : parent.appendChild(node);
  else if (tag !== 4 && (tag === 27 && isSingletonScope(node.type) && (parent = node.stateNode), node = node.child, node !== null))
    for (insertOrAppendPlacementNode(node, before, parent), node = node.sibling;node !== null; )
      insertOrAppendPlacementNode(node, before, parent), node = node.sibling;
}
function commitHostSingletonAcquisition(finishedWork) {
  var { stateNode: singleton, memoizedProps: props } = finishedWork;
  try {
    for (var type = finishedWork.type, attributes = singleton.attributes;attributes.length; )
      singleton.removeAttributeNode(attributes[0]);
    setInitialProperties(singleton, type, props);
    singleton[internalInstanceKey] = finishedWork;
    singleton[internalPropsKey] = props;
  } catch (error) {
    captureCommitPhaseError(finishedWork, finishedWork.return, error);
  }
}
function commitBeforeMutationEffects(root2, firstChild) {
  root2 = root2.containerInfo;
  eventsEnabled = _enabled;
  root2 = getActiveElementDeep(root2);
  if (hasSelectionCapabilities(root2)) {
    if ("selectionStart" in root2)
      var JSCompiler_temp = {
        start: root2.selectionStart,
        end: root2.selectionEnd
      };
    else
      a: {
        JSCompiler_temp = (JSCompiler_temp = root2.ownerDocument) && JSCompiler_temp.defaultView || window;
        var selection = JSCompiler_temp.getSelection && JSCompiler_temp.getSelection();
        if (selection && selection.rangeCount !== 0) {
          JSCompiler_temp = selection.anchorNode;
          var { anchorOffset, focusNode } = selection;
          selection = selection.focusOffset;
          try {
            JSCompiler_temp.nodeType, focusNode.nodeType;
          } catch (e$20) {
            JSCompiler_temp = null;
            break a;
          }
          var length = 0, start = -1, end = -1, indexWithinAnchor = 0, indexWithinFocus = 0, node = root2, parentNode = null;
          b:
            for (;; ) {
              for (var next;; ) {
                node !== JSCompiler_temp || anchorOffset !== 0 && node.nodeType !== 3 || (start = length + anchorOffset);
                node !== focusNode || selection !== 0 && node.nodeType !== 3 || (end = length + selection);
                node.nodeType === 3 && (length += node.nodeValue.length);
                if ((next = node.firstChild) === null)
                  break;
                parentNode = node;
                node = next;
              }
              for (;; ) {
                if (node === root2)
                  break b;
                parentNode === JSCompiler_temp && ++indexWithinAnchor === anchorOffset && (start = length);
                parentNode === focusNode && ++indexWithinFocus === selection && (end = length);
                if ((next = node.nextSibling) !== null)
                  break;
                node = parentNode;
                parentNode = node.parentNode;
              }
              node = next;
            }
          JSCompiler_temp = start === -1 || end === -1 ? null : { start, end };
        } else
          JSCompiler_temp = null;
      }
    JSCompiler_temp = JSCompiler_temp || { start: 0, end: 0 };
  } else
    JSCompiler_temp = null;
  selectionInformation = { focusedElem: root2, selectionRange: JSCompiler_temp };
  _enabled = false;
  for (nextEffect = firstChild;nextEffect !== null; )
    if (firstChild = nextEffect, root2 = firstChild.child, (firstChild.subtreeFlags & 1028) !== 0 && root2 !== null)
      root2.return = firstChild, nextEffect = root2;
    else
      for (;nextEffect !== null; ) {
        firstChild = nextEffect;
        focusNode = firstChild.alternate;
        root2 = firstChild.flags;
        switch (firstChild.tag) {
          case 0:
            if ((root2 & 4) !== 0 && (root2 = firstChild.updateQueue, root2 = root2 !== null ? root2.events : null, root2 !== null))
              for (JSCompiler_temp = 0;JSCompiler_temp < root2.length; JSCompiler_temp++)
                anchorOffset = root2[JSCompiler_temp], anchorOffset.ref.impl = anchorOffset.nextImpl;
            break;
          case 11:
          case 15:
            break;
          case 1:
            if ((root2 & 1024) !== 0 && focusNode !== null) {
              root2 = undefined;
              JSCompiler_temp = firstChild;
              anchorOffset = focusNode.memoizedProps;
              focusNode = focusNode.memoizedState;
              selection = JSCompiler_temp.stateNode;
              try {
                var resolvedPrevProps = resolveClassComponentProps(JSCompiler_temp.type, anchorOffset);
                root2 = selection.getSnapshotBeforeUpdate(resolvedPrevProps, focusNode);
                selection.__reactInternalSnapshotBeforeUpdate = root2;
              } catch (error) {
                captureCommitPhaseError(JSCompiler_temp, JSCompiler_temp.return, error);
              }
            }
            break;
          case 3:
            if ((root2 & 1024) !== 0) {
              if (root2 = firstChild.stateNode.containerInfo, JSCompiler_temp = root2.nodeType, JSCompiler_temp === 9)
                clearContainerSparingly(root2);
              else if (JSCompiler_temp === 1)
                switch (root2.nodeName) {
                  case "HEAD":
                  case "HTML":
                  case "BODY":
                    clearContainerSparingly(root2);
                    break;
                  default:
                    root2.textContent = "";
                }
            }
            break;
          case 5:
          case 26:
          case 27:
          case 6:
          case 4:
          case 17:
            break;
          default:
            if ((root2 & 1024) !== 0)
              throw Error(formatProdErrorMessage(163));
        }
        root2 = firstChild.sibling;
        if (root2 !== null) {
          root2.return = firstChild.return;
          nextEffect = root2;
          break;
        }
        nextEffect = firstChild.return;
      }
}
function commitLayoutEffectOnFiber(finishedRoot, current, finishedWork) {
  var flags = finishedWork.flags;
  switch (finishedWork.tag) {
    case 0:
    case 11:
    case 15:
      recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      flags & 4 && commitHookEffectListMount(5, finishedWork);
      break;
    case 1:
      recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      if (flags & 4)
        if (finishedRoot = finishedWork.stateNode, current === null)
          try {
            finishedRoot.componentDidMount();
          } catch (error) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error);
          }
        else {
          var prevProps = resolveClassComponentProps(finishedWork.type, current.memoizedProps);
          current = current.memoizedState;
          try {
            finishedRoot.componentDidUpdate(prevProps, current, finishedRoot.__reactInternalSnapshotBeforeUpdate);
          } catch (error$139) {
            captureCommitPhaseError(finishedWork, finishedWork.return, error$139);
          }
        }
      flags & 64 && commitClassCallbacks(finishedWork);
      flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
      break;
    case 3:
      recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      if (flags & 64 && (finishedRoot = finishedWork.updateQueue, finishedRoot !== null)) {
        current = null;
        if (finishedWork.child !== null)
          switch (finishedWork.child.tag) {
            case 27:
            case 5:
              current = finishedWork.child.stateNode;
              break;
            case 1:
              current = finishedWork.child.stateNode;
          }
        try {
          commitCallbacks(finishedRoot, current);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
      break;
    case 27:
      current === null && flags & 4 && commitHostSingletonAcquisition(finishedWork);
    case 26:
    case 5:
      recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      current === null && flags & 4 && commitHostMount(finishedWork);
      flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
      break;
    case 12:
      recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      break;
    case 31:
      recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
      break;
    case 13:
      recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
      flags & 64 && (finishedRoot = finishedWork.memoizedState, finishedRoot !== null && (finishedRoot = finishedRoot.dehydrated, finishedRoot !== null && (finishedWork = retryDehydratedSuspenseBoundary.bind(null, finishedWork), registerSuspenseInstanceRetry(finishedRoot, finishedWork))));
      break;
    case 22:
      flags = finishedWork.memoizedState !== null || offscreenSubtreeIsHidden;
      if (!flags) {
        current = current !== null && current.memoizedState !== null || offscreenSubtreeWasHidden;
        prevProps = offscreenSubtreeIsHidden;
        var prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
        offscreenSubtreeIsHidden = flags;
        (offscreenSubtreeWasHidden = current) && !prevOffscreenSubtreeWasHidden ? recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, (finishedWork.subtreeFlags & 8772) !== 0) : recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
        offscreenSubtreeIsHidden = prevProps;
        offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
      }
      break;
    case 30:
      break;
    default:
      recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
  }
}
function detachFiberAfterEffects(fiber) {
  var alternate = fiber.alternate;
  alternate !== null && (fiber.alternate = null, detachFiberAfterEffects(alternate));
  fiber.child = null;
  fiber.deletions = null;
  fiber.sibling = null;
  fiber.tag === 5 && (alternate = fiber.stateNode, alternate !== null && detachDeletedInstance(alternate));
  fiber.stateNode = null;
  fiber.return = null;
  fiber.dependencies = null;
  fiber.memoizedProps = null;
  fiber.memoizedState = null;
  fiber.pendingProps = null;
  fiber.stateNode = null;
  fiber.updateQueue = null;
}
function recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, parent) {
  for (parent = parent.child;parent !== null; )
    commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, parent), parent = parent.sibling;
}
function commitDeletionEffectsOnFiber(finishedRoot, nearestMountedAncestor, deletedFiber) {
  if (injectedHook && typeof injectedHook.onCommitFiberUnmount === "function")
    try {
      injectedHook.onCommitFiberUnmount(rendererID, deletedFiber);
    } catch (err) {}
  switch (deletedFiber.tag) {
    case 26:
      offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      deletedFiber.memoizedState ? deletedFiber.memoizedState.count-- : deletedFiber.stateNode && (deletedFiber = deletedFiber.stateNode, deletedFiber.parentNode.removeChild(deletedFiber));
      break;
    case 27:
      offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
      var prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer;
      isSingletonScope(deletedFiber.type) && (hostParent = deletedFiber.stateNode, hostParentIsContainer = false);
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      releaseSingletonInstance(deletedFiber.stateNode);
      hostParent = prevHostParent;
      hostParentIsContainer = prevHostParentIsContainer;
      break;
    case 5:
      offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
    case 6:
      prevHostParent = hostParent;
      prevHostParentIsContainer = hostParentIsContainer;
      hostParent = null;
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      hostParent = prevHostParent;
      hostParentIsContainer = prevHostParentIsContainer;
      if (hostParent !== null)
        if (hostParentIsContainer)
          try {
            (hostParent.nodeType === 9 ? hostParent.body : hostParent.nodeName === "HTML" ? hostParent.ownerDocument.body : hostParent).removeChild(deletedFiber.stateNode);
          } catch (error) {
            captureCommitPhaseError(deletedFiber, nearestMountedAncestor, error);
          }
        else
          try {
            hostParent.removeChild(deletedFiber.stateNode);
          } catch (error) {
            captureCommitPhaseError(deletedFiber, nearestMountedAncestor, error);
          }
      break;
    case 18:
      hostParent !== null && (hostParentIsContainer ? (finishedRoot = hostParent, clearHydrationBoundary(finishedRoot.nodeType === 9 ? finishedRoot.body : finishedRoot.nodeName === "HTML" ? finishedRoot.ownerDocument.body : finishedRoot, deletedFiber.stateNode), retryIfBlockedOn(finishedRoot)) : clearHydrationBoundary(hostParent, deletedFiber.stateNode));
      break;
    case 4:
      prevHostParent = hostParent;
      prevHostParentIsContainer = hostParentIsContainer;
      hostParent = deletedFiber.stateNode.containerInfo;
      hostParentIsContainer = true;
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      hostParent = prevHostParent;
      hostParentIsContainer = prevHostParentIsContainer;
      break;
    case 0:
    case 11:
    case 14:
    case 15:
      commitHookEffectListUnmount(2, deletedFiber, nearestMountedAncestor);
      offscreenSubtreeWasHidden || commitHookEffectListUnmount(4, deletedFiber, nearestMountedAncestor);
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      break;
    case 1:
      offscreenSubtreeWasHidden || (safelyDetachRef(deletedFiber, nearestMountedAncestor), prevHostParent = deletedFiber.stateNode, typeof prevHostParent.componentWillUnmount === "function" && safelyCallComponentWillUnmount(deletedFiber, nearestMountedAncestor, prevHostParent));
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      break;
    case 21:
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      break;
    case 22:
      offscreenSubtreeWasHidden = (prevHostParent = offscreenSubtreeWasHidden) || deletedFiber.memoizedState !== null;
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
      offscreenSubtreeWasHidden = prevHostParent;
      break;
    default:
      recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
  }
}
function commitActivityHydrationCallbacks(finishedRoot, finishedWork) {
  if (finishedWork.memoizedState === null && (finishedRoot = finishedWork.alternate, finishedRoot !== null && (finishedRoot = finishedRoot.memoizedState, finishedRoot !== null))) {
    finishedRoot = finishedRoot.dehydrated;
    try {
      retryIfBlockedOn(finishedRoot);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
  }
}
function commitSuspenseHydrationCallbacks(finishedRoot, finishedWork) {
  if (finishedWork.memoizedState === null && (finishedRoot = finishedWork.alternate, finishedRoot !== null && (finishedRoot = finishedRoot.memoizedState, finishedRoot !== null && (finishedRoot = finishedRoot.dehydrated, finishedRoot !== null))))
    try {
      retryIfBlockedOn(finishedRoot);
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
}
function getRetryCache(finishedWork) {
  switch (finishedWork.tag) {
    case 31:
    case 13:
    case 19:
      var retryCache = finishedWork.stateNode;
      retryCache === null && (retryCache = finishedWork.stateNode = new PossiblyWeakSet);
      return retryCache;
    case 22:
      return finishedWork = finishedWork.stateNode, retryCache = finishedWork._retryCache, retryCache === null && (retryCache = finishedWork._retryCache = new PossiblyWeakSet), retryCache;
    default:
      throw Error(formatProdErrorMessage(435, finishedWork.tag));
  }
}
function attachSuspenseRetryListeners(finishedWork, wakeables) {
  var retryCache = getRetryCache(finishedWork);
  wakeables.forEach(function(wakeable) {
    if (!retryCache.has(wakeable)) {
      retryCache.add(wakeable);
      var retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
      wakeable.then(retry, retry);
    }
  });
}
function recursivelyTraverseMutationEffects(root$jscomp$0, parentFiber) {
  var deletions = parentFiber.deletions;
  if (deletions !== null)
    for (var i = 0;i < deletions.length; i++) {
      var childToDelete = deletions[i], root2 = root$jscomp$0, returnFiber = parentFiber, parent = returnFiber;
      a:
        for (;parent !== null; ) {
          switch (parent.tag) {
            case 27:
              if (isSingletonScope(parent.type)) {
                hostParent = parent.stateNode;
                hostParentIsContainer = false;
                break a;
              }
              break;
            case 5:
              hostParent = parent.stateNode;
              hostParentIsContainer = false;
              break a;
            case 3:
            case 4:
              hostParent = parent.stateNode.containerInfo;
              hostParentIsContainer = true;
              break a;
          }
          parent = parent.return;
        }
      if (hostParent === null)
        throw Error(formatProdErrorMessage(160));
      commitDeletionEffectsOnFiber(root2, returnFiber, childToDelete);
      hostParent = null;
      hostParentIsContainer = false;
      root2 = childToDelete.alternate;
      root2 !== null && (root2.return = null);
      childToDelete.return = null;
    }
  if (parentFiber.subtreeFlags & 13886)
    for (parentFiber = parentFiber.child;parentFiber !== null; )
      commitMutationEffectsOnFiber(parentFiber, root$jscomp$0), parentFiber = parentFiber.sibling;
}
function commitMutationEffectsOnFiber(finishedWork, root2) {
  var { alternate: current, flags } = finishedWork;
  switch (finishedWork.tag) {
    case 0:
    case 11:
    case 14:
    case 15:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      flags & 4 && (commitHookEffectListUnmount(3, finishedWork, finishedWork.return), commitHookEffectListMount(3, finishedWork), commitHookEffectListUnmount(5, finishedWork, finishedWork.return));
      break;
    case 1:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      flags & 512 && (offscreenSubtreeWasHidden || current === null || safelyDetachRef(current, current.return));
      flags & 64 && offscreenSubtreeIsHidden && (finishedWork = finishedWork.updateQueue, finishedWork !== null && (flags = finishedWork.callbacks, flags !== null && (current = finishedWork.shared.hiddenCallbacks, finishedWork.shared.hiddenCallbacks = current === null ? flags : current.concat(flags))));
      break;
    case 26:
      var hoistableRoot = currentHoistableRoot;
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      flags & 512 && (offscreenSubtreeWasHidden || current === null || safelyDetachRef(current, current.return));
      if (flags & 4) {
        var currentResource = current !== null ? current.memoizedState : null;
        flags = finishedWork.memoizedState;
        if (current === null)
          if (flags === null)
            if (finishedWork.stateNode === null) {
              a: {
                flags = finishedWork.type;
                current = finishedWork.memoizedProps;
                hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
                b:
                  switch (flags) {
                    case "title":
                      currentResource = hoistableRoot.getElementsByTagName("title")[0];
                      if (!currentResource || currentResource[internalHoistableMarker] || currentResource[internalInstanceKey] || currentResource.namespaceURI === "http://www.w3.org/2000/svg" || currentResource.hasAttribute("itemprop"))
                        currentResource = hoistableRoot.createElement(flags), hoistableRoot.head.insertBefore(currentResource, hoistableRoot.querySelector("head > title"));
                      setInitialProperties(currentResource, flags, current);
                      currentResource[internalInstanceKey] = finishedWork;
                      markNodeAsHoistable(currentResource);
                      flags = currentResource;
                      break a;
                    case "link":
                      var maybeNodes = getHydratableHoistableCache("link", "href", hoistableRoot).get(flags + (current.href || ""));
                      if (maybeNodes) {
                        for (var i = 0;i < maybeNodes.length; i++)
                          if (currentResource = maybeNodes[i], currentResource.getAttribute("href") === (current.href == null || current.href === "" ? null : current.href) && currentResource.getAttribute("rel") === (current.rel == null ? null : current.rel) && currentResource.getAttribute("title") === (current.title == null ? null : current.title) && currentResource.getAttribute("crossorigin") === (current.crossOrigin == null ? null : current.crossOrigin)) {
                            maybeNodes.splice(i, 1);
                            break b;
                          }
                      }
                      currentResource = hoistableRoot.createElement(flags);
                      setInitialProperties(currentResource, flags, current);
                      hoistableRoot.head.appendChild(currentResource);
                      break;
                    case "meta":
                      if (maybeNodes = getHydratableHoistableCache("meta", "content", hoistableRoot).get(flags + (current.content || ""))) {
                        for (i = 0;i < maybeNodes.length; i++)
                          if (currentResource = maybeNodes[i], currentResource.getAttribute("content") === (current.content == null ? null : "" + current.content) && currentResource.getAttribute("name") === (current.name == null ? null : current.name) && currentResource.getAttribute("property") === (current.property == null ? null : current.property) && currentResource.getAttribute("http-equiv") === (current.httpEquiv == null ? null : current.httpEquiv) && currentResource.getAttribute("charset") === (current.charSet == null ? null : current.charSet)) {
                            maybeNodes.splice(i, 1);
                            break b;
                          }
                      }
                      currentResource = hoistableRoot.createElement(flags);
                      setInitialProperties(currentResource, flags, current);
                      hoistableRoot.head.appendChild(currentResource);
                      break;
                    default:
                      throw Error(formatProdErrorMessage(468, flags));
                  }
                currentResource[internalInstanceKey] = finishedWork;
                markNodeAsHoistable(currentResource);
                flags = currentResource;
              }
              finishedWork.stateNode = flags;
            } else
              mountHoistable(hoistableRoot, finishedWork.type, finishedWork.stateNode);
          else
            finishedWork.stateNode = acquireResource(hoistableRoot, flags, finishedWork.memoizedProps);
        else
          currentResource !== flags ? (currentResource === null ? current.stateNode !== null && (current = current.stateNode, current.parentNode.removeChild(current)) : currentResource.count--, flags === null ? mountHoistable(hoistableRoot, finishedWork.type, finishedWork.stateNode) : acquireResource(hoistableRoot, flags, finishedWork.memoizedProps)) : flags === null && finishedWork.stateNode !== null && commitHostUpdate(finishedWork, finishedWork.memoizedProps, current.memoizedProps);
      }
      break;
    case 27:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      flags & 512 && (offscreenSubtreeWasHidden || current === null || safelyDetachRef(current, current.return));
      current !== null && flags & 4 && commitHostUpdate(finishedWork, finishedWork.memoizedProps, current.memoizedProps);
      break;
    case 5:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      flags & 512 && (offscreenSubtreeWasHidden || current === null || safelyDetachRef(current, current.return));
      if (finishedWork.flags & 32) {
        hoistableRoot = finishedWork.stateNode;
        try {
          setTextContent(hoistableRoot, "");
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
      flags & 4 && finishedWork.stateNode != null && (hoistableRoot = finishedWork.memoizedProps, commitHostUpdate(finishedWork, hoistableRoot, current !== null ? current.memoizedProps : hoistableRoot));
      flags & 1024 && (needsFormReset = true);
      break;
    case 6:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      if (flags & 4) {
        if (finishedWork.stateNode === null)
          throw Error(formatProdErrorMessage(162));
        flags = finishedWork.memoizedProps;
        current = finishedWork.stateNode;
        try {
          current.nodeValue = flags;
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
      break;
    case 3:
      tagCaches = null;
      hoistableRoot = currentHoistableRoot;
      currentHoistableRoot = getHoistableRoot(root2.containerInfo);
      recursivelyTraverseMutationEffects(root2, finishedWork);
      currentHoistableRoot = hoistableRoot;
      commitReconciliationEffects(finishedWork);
      if (flags & 4 && current !== null && current.memoizedState.isDehydrated)
        try {
          retryIfBlockedOn(root2.containerInfo);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      needsFormReset && (needsFormReset = false, recursivelyResetForms(finishedWork));
      break;
    case 4:
      flags = currentHoistableRoot;
      currentHoistableRoot = getHoistableRoot(finishedWork.stateNode.containerInfo);
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      currentHoistableRoot = flags;
      break;
    case 12:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      break;
    case 31:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
      break;
    case 13:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      finishedWork.child.flags & 8192 && finishedWork.memoizedState !== null !== (current !== null && current.memoizedState !== null) && (globalMostRecentFallbackTime = now());
      flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
      break;
    case 22:
      hoistableRoot = finishedWork.memoizedState !== null;
      var wasHidden = current !== null && current.memoizedState !== null, prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden, prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
      offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || hoistableRoot;
      offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden;
      recursivelyTraverseMutationEffects(root2, finishedWork);
      offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
      offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
      commitReconciliationEffects(finishedWork);
      if (flags & 8192)
        a:
          for (root2 = finishedWork.stateNode, root2._visibility = hoistableRoot ? root2._visibility & -2 : root2._visibility | 1, hoistableRoot && (current === null || wasHidden || offscreenSubtreeIsHidden || offscreenSubtreeWasHidden || recursivelyTraverseDisappearLayoutEffects(finishedWork)), current = null, root2 = finishedWork;; ) {
            if (root2.tag === 5 || root2.tag === 26) {
              if (current === null) {
                wasHidden = current = root2;
                try {
                  if (currentResource = wasHidden.stateNode, hoistableRoot)
                    maybeNodes = currentResource.style, typeof maybeNodes.setProperty === "function" ? maybeNodes.setProperty("display", "none", "important") : maybeNodes.display = "none";
                  else {
                    i = wasHidden.stateNode;
                    var styleProp = wasHidden.memoizedProps.style, display = styleProp !== undefined && styleProp !== null && styleProp.hasOwnProperty("display") ? styleProp.display : null;
                    i.style.display = display == null || typeof display === "boolean" ? "" : ("" + display).trim();
                  }
                } catch (error) {
                  captureCommitPhaseError(wasHidden, wasHidden.return, error);
                }
              }
            } else if (root2.tag === 6) {
              if (current === null) {
                wasHidden = root2;
                try {
                  wasHidden.stateNode.nodeValue = hoistableRoot ? "" : wasHidden.memoizedProps;
                } catch (error) {
                  captureCommitPhaseError(wasHidden, wasHidden.return, error);
                }
              }
            } else if (root2.tag === 18) {
              if (current === null) {
                wasHidden = root2;
                try {
                  var instance = wasHidden.stateNode;
                  hoistableRoot ? hideOrUnhideDehydratedBoundary(instance, true) : hideOrUnhideDehydratedBoundary(wasHidden.stateNode, false);
                } catch (error) {
                  captureCommitPhaseError(wasHidden, wasHidden.return, error);
                }
              }
            } else if ((root2.tag !== 22 && root2.tag !== 23 || root2.memoizedState === null || root2 === finishedWork) && root2.child !== null) {
              root2.child.return = root2;
              root2 = root2.child;
              continue;
            }
            if (root2 === finishedWork)
              break a;
            for (;root2.sibling === null; ) {
              if (root2.return === null || root2.return === finishedWork)
                break a;
              current === root2 && (current = null);
              root2 = root2.return;
            }
            current === root2 && (current = null);
            root2.sibling.return = root2.return;
            root2 = root2.sibling;
          }
      flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (current = flags.retryQueue, current !== null && (flags.retryQueue = null, attachSuspenseRetryListeners(finishedWork, current))));
      break;
    case 19:
      recursivelyTraverseMutationEffects(root2, finishedWork);
      commitReconciliationEffects(finishedWork);
      flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
      break;
    case 30:
      break;
    case 21:
      break;
    default:
      recursivelyTraverseMutationEffects(root2, finishedWork), commitReconciliationEffects(finishedWork);
  }
}
function commitReconciliationEffects(finishedWork) {
  var flags = finishedWork.flags;
  if (flags & 2) {
    try {
      for (var hostParentFiber, parentFiber = finishedWork.return;parentFiber !== null; ) {
        if (isHostParent(parentFiber)) {
          hostParentFiber = parentFiber;
          break;
        }
        parentFiber = parentFiber.return;
      }
      if (hostParentFiber == null)
        throw Error(formatProdErrorMessage(160));
      switch (hostParentFiber.tag) {
        case 27:
          var parent = hostParentFiber.stateNode, before = getHostSibling(finishedWork);
          insertOrAppendPlacementNode(finishedWork, before, parent);
          break;
        case 5:
          var parent$141 = hostParentFiber.stateNode;
          hostParentFiber.flags & 32 && (setTextContent(parent$141, ""), hostParentFiber.flags &= -33);
          var before$142 = getHostSibling(finishedWork);
          insertOrAppendPlacementNode(finishedWork, before$142, parent$141);
          break;
        case 3:
        case 4:
          var parent$143 = hostParentFiber.stateNode.containerInfo, before$144 = getHostSibling(finishedWork);
          insertOrAppendPlacementNodeIntoContainer(finishedWork, before$144, parent$143);
          break;
        default:
          throw Error(formatProdErrorMessage(161));
      }
    } catch (error) {
      captureCommitPhaseError(finishedWork, finishedWork.return, error);
    }
    finishedWork.flags &= -3;
  }
  flags & 4096 && (finishedWork.flags &= -4097);
}
function recursivelyResetForms(parentFiber) {
  if (parentFiber.subtreeFlags & 1024)
    for (parentFiber = parentFiber.child;parentFiber !== null; ) {
      var fiber = parentFiber;
      recursivelyResetForms(fiber);
      fiber.tag === 5 && fiber.flags & 1024 && fiber.stateNode.reset();
      parentFiber = parentFiber.sibling;
    }
}
function recursivelyTraverseLayoutEffects(root2, parentFiber) {
  if (parentFiber.subtreeFlags & 8772)
    for (parentFiber = parentFiber.child;parentFiber !== null; )
      commitLayoutEffectOnFiber(root2, parentFiber.alternate, parentFiber), parentFiber = parentFiber.sibling;
}
function recursivelyTraverseDisappearLayoutEffects(parentFiber) {
  for (parentFiber = parentFiber.child;parentFiber !== null; ) {
    var finishedWork = parentFiber;
    switch (finishedWork.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        commitHookEffectListUnmount(4, finishedWork, finishedWork.return);
        recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      case 1:
        safelyDetachRef(finishedWork, finishedWork.return);
        var instance = finishedWork.stateNode;
        typeof instance.componentWillUnmount === "function" && safelyCallComponentWillUnmount(finishedWork, finishedWork.return, instance);
        recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      case 27:
        releaseSingletonInstance(finishedWork.stateNode);
      case 26:
      case 5:
        safelyDetachRef(finishedWork, finishedWork.return);
        recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      case 22:
        finishedWork.memoizedState === null && recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      case 30:
        recursivelyTraverseDisappearLayoutEffects(finishedWork);
        break;
      default:
        recursivelyTraverseDisappearLayoutEffects(finishedWork);
    }
    parentFiber = parentFiber.sibling;
  }
}
function recursivelyTraverseReappearLayoutEffects(finishedRoot$jscomp$0, parentFiber, includeWorkInProgressEffects) {
  includeWorkInProgressEffects = includeWorkInProgressEffects && (parentFiber.subtreeFlags & 8772) !== 0;
  for (parentFiber = parentFiber.child;parentFiber !== null; ) {
    var current = parentFiber.alternate, finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
    switch (finishedWork.tag) {
      case 0:
      case 11:
      case 15:
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        commitHookEffectListMount(4, finishedWork);
        break;
      case 1:
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        current = finishedWork;
        finishedRoot = current.stateNode;
        if (typeof finishedRoot.componentDidMount === "function")
          try {
            finishedRoot.componentDidMount();
          } catch (error) {
            captureCommitPhaseError(current, current.return, error);
          }
        current = finishedWork;
        finishedRoot = current.updateQueue;
        if (finishedRoot !== null) {
          var instance = current.stateNode;
          try {
            var hiddenCallbacks = finishedRoot.shared.hiddenCallbacks;
            if (hiddenCallbacks !== null)
              for (finishedRoot.shared.hiddenCallbacks = null, finishedRoot = 0;finishedRoot < hiddenCallbacks.length; finishedRoot++)
                callCallback(hiddenCallbacks[finishedRoot], instance);
          } catch (error) {
            captureCommitPhaseError(current, current.return, error);
          }
        }
        includeWorkInProgressEffects && flags & 64 && commitClassCallbacks(finishedWork);
        safelyAttachRef(finishedWork, finishedWork.return);
        break;
      case 27:
        commitHostSingletonAcquisition(finishedWork);
      case 26:
      case 5:
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        includeWorkInProgressEffects && current === null && flags & 4 && commitHostMount(finishedWork);
        safelyAttachRef(finishedWork, finishedWork.return);
        break;
      case 12:
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        break;
      case 31:
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        includeWorkInProgressEffects && flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
        break;
      case 13:
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        includeWorkInProgressEffects && flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
        break;
      case 22:
        finishedWork.memoizedState === null && recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
        safelyAttachRef(finishedWork, finishedWork.return);
        break;
      case 30:
        break;
      default:
        recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
    }
    parentFiber = parentFiber.sibling;
  }
}
function commitOffscreenPassiveMountEffects(current, finishedWork) {
  var previousCache = null;
  current !== null && current.memoizedState !== null && current.memoizedState.cachePool !== null && (previousCache = current.memoizedState.cachePool.pool);
  current = null;
  finishedWork.memoizedState !== null && finishedWork.memoizedState.cachePool !== null && (current = finishedWork.memoizedState.cachePool.pool);
  current !== previousCache && (current != null && current.refCount++, previousCache != null && releaseCache(previousCache));
}
function commitCachePassiveMountEffect(current, finishedWork) {
  current = null;
  finishedWork.alternate !== null && (current = finishedWork.alternate.memoizedState.cache);
  finishedWork = finishedWork.memoizedState.cache;
  finishedWork !== current && (finishedWork.refCount++, current != null && releaseCache(current));
}
function recursivelyTraversePassiveMountEffects(root2, parentFiber, committedLanes, committedTransitions) {
  if (parentFiber.subtreeFlags & 10256)
    for (parentFiber = parentFiber.child;parentFiber !== null; )
      commitPassiveMountOnFiber(root2, parentFiber, committedLanes, committedTransitions), parentFiber = parentFiber.sibling;
}
function commitPassiveMountOnFiber(finishedRoot, finishedWork, committedLanes, committedTransitions) {
  var flags = finishedWork.flags;
  switch (finishedWork.tag) {
    case 0:
    case 11:
    case 15:
      recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
      flags & 2048 && commitHookEffectListMount(9, finishedWork);
      break;
    case 1:
      recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
      break;
    case 3:
      recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
      flags & 2048 && (finishedRoot = null, finishedWork.alternate !== null && (finishedRoot = finishedWork.alternate.memoizedState.cache), finishedWork = finishedWork.memoizedState.cache, finishedWork !== finishedRoot && (finishedWork.refCount++, finishedRoot != null && releaseCache(finishedRoot)));
      break;
    case 12:
      if (flags & 2048) {
        recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
        finishedRoot = finishedWork.stateNode;
        try {
          var _finishedWork$memoize2 = finishedWork.memoizedProps, id = _finishedWork$memoize2.id, onPostCommit = _finishedWork$memoize2.onPostCommit;
          typeof onPostCommit === "function" && onPostCommit(id, finishedWork.alternate === null ? "mount" : "update", finishedRoot.passiveEffectDuration, -0);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      } else
        recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
      break;
    case 31:
      recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
      break;
    case 13:
      recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
      break;
    case 23:
      break;
    case 22:
      _finishedWork$memoize2 = finishedWork.stateNode;
      id = finishedWork.alternate;
      finishedWork.memoizedState !== null ? _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions) : recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork) : _finishedWork$memoize2._visibility & 2 ? recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions) : (_finishedWork$memoize2._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, (finishedWork.subtreeFlags & 10256) !== 0 || false));
      flags & 2048 && commitOffscreenPassiveMountEffects(id, finishedWork);
      break;
    case 24:
      recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
      flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
      break;
    default:
      recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions);
  }
}
function recursivelyTraverseReconnectPassiveEffects(finishedRoot$jscomp$0, parentFiber, committedLanes$jscomp$0, committedTransitions$jscomp$0, includeWorkInProgressEffects) {
  includeWorkInProgressEffects = includeWorkInProgressEffects && ((parentFiber.subtreeFlags & 10256) !== 0 || false);
  for (parentFiber = parentFiber.child;parentFiber !== null; ) {
    var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, committedLanes = committedLanes$jscomp$0, committedTransitions = committedTransitions$jscomp$0, flags = finishedWork.flags;
    switch (finishedWork.tag) {
      case 0:
      case 11:
      case 15:
        recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
        commitHookEffectListMount(8, finishedWork);
        break;
      case 23:
        break;
      case 22:
        var instance = finishedWork.stateNode;
        finishedWork.memoizedState !== null ? instance._visibility & 2 ? recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects) : recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork) : (instance._visibility |= 2, recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects));
        includeWorkInProgressEffects && flags & 2048 && commitOffscreenPassiveMountEffects(finishedWork.alternate, finishedWork);
        break;
      case 24:
        recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
        includeWorkInProgressEffects && flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
        break;
      default:
        recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects);
    }
    parentFiber = parentFiber.sibling;
  }
}
function recursivelyTraverseAtomicPassiveEffects(finishedRoot$jscomp$0, parentFiber) {
  if (parentFiber.subtreeFlags & 10256)
    for (parentFiber = parentFiber.child;parentFiber !== null; ) {
      var finishedRoot = finishedRoot$jscomp$0, finishedWork = parentFiber, flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 22:
          recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
          flags & 2048 && commitOffscreenPassiveMountEffects(finishedWork.alternate, finishedWork);
          break;
        case 24:
          recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
          flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
          break;
        default:
          recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork);
      }
      parentFiber = parentFiber.sibling;
    }
}
function recursivelyAccumulateSuspenseyCommit(parentFiber, committedLanes, suspendedState) {
  if (parentFiber.subtreeFlags & suspenseyCommitFlag)
    for (parentFiber = parentFiber.child;parentFiber !== null; )
      accumulateSuspenseyCommitOnFiber(parentFiber, committedLanes, suspendedState), parentFiber = parentFiber.sibling;
}
function accumulateSuspenseyCommitOnFiber(fiber, committedLanes, suspendedState) {
  switch (fiber.tag) {
    case 26:
      recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState);
      fiber.flags & suspenseyCommitFlag && fiber.memoizedState !== null && suspendResource(suspendedState, currentHoistableRoot, fiber.memoizedState, fiber.memoizedProps);
      break;
    case 5:
      recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState);
      break;
    case 3:
    case 4:
      var previousHoistableRoot = currentHoistableRoot;
      currentHoistableRoot = getHoistableRoot(fiber.stateNode.containerInfo);
      recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState);
      currentHoistableRoot = previousHoistableRoot;
      break;
    case 22:
      fiber.memoizedState === null && (previousHoistableRoot = fiber.alternate, previousHoistableRoot !== null && previousHoistableRoot.memoizedState !== null ? (previousHoistableRoot = suspenseyCommitFlag, suspenseyCommitFlag = 16777216, recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState), suspenseyCommitFlag = previousHoistableRoot) : recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState));
      break;
    default:
      recursivelyAccumulateSuspenseyCommit(fiber, committedLanes, suspendedState);
  }
}
function detachAlternateSiblings(parentFiber) {
  var previousFiber = parentFiber.alternate;
  if (previousFiber !== null && (parentFiber = previousFiber.child, parentFiber !== null)) {
    previousFiber.child = null;
    do
      previousFiber = parentFiber.sibling, parentFiber.sibling = null, parentFiber = previousFiber;
    while (parentFiber !== null);
  }
}
function recursivelyTraversePassiveUnmountEffects(parentFiber) {
  var deletions = parentFiber.deletions;
  if ((parentFiber.flags & 16) !== 0) {
    if (deletions !== null)
      for (var i = 0;i < deletions.length; i++) {
        var childToDelete = deletions[i];
        nextEffect = childToDelete;
        commitPassiveUnmountEffectsInsideOfDeletedTree_begin(childToDelete, parentFiber);
      }
    detachAlternateSiblings(parentFiber);
  }
  if (parentFiber.subtreeFlags & 10256)
    for (parentFiber = parentFiber.child;parentFiber !== null; )
      commitPassiveUnmountOnFiber(parentFiber), parentFiber = parentFiber.sibling;
}
function commitPassiveUnmountOnFiber(finishedWork) {
  switch (finishedWork.tag) {
    case 0:
    case 11:
    case 15:
      recursivelyTraversePassiveUnmountEffects(finishedWork);
      finishedWork.flags & 2048 && commitHookEffectListUnmount(9, finishedWork, finishedWork.return);
      break;
    case 3:
      recursivelyTraversePassiveUnmountEffects(finishedWork);
      break;
    case 12:
      recursivelyTraversePassiveUnmountEffects(finishedWork);
      break;
    case 22:
      var instance = finishedWork.stateNode;
      finishedWork.memoizedState !== null && instance._visibility & 2 && (finishedWork.return === null || finishedWork.return.tag !== 13) ? (instance._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(finishedWork)) : recursivelyTraversePassiveUnmountEffects(finishedWork);
      break;
    default:
      recursivelyTraversePassiveUnmountEffects(finishedWork);
  }
}
function recursivelyTraverseDisconnectPassiveEffects(parentFiber) {
  var deletions = parentFiber.deletions;
  if ((parentFiber.flags & 16) !== 0) {
    if (deletions !== null)
      for (var i = 0;i < deletions.length; i++) {
        var childToDelete = deletions[i];
        nextEffect = childToDelete;
        commitPassiveUnmountEffectsInsideOfDeletedTree_begin(childToDelete, parentFiber);
      }
    detachAlternateSiblings(parentFiber);
  }
  for (parentFiber = parentFiber.child;parentFiber !== null; ) {
    deletions = parentFiber;
    switch (deletions.tag) {
      case 0:
      case 11:
      case 15:
        commitHookEffectListUnmount(8, deletions, deletions.return);
        recursivelyTraverseDisconnectPassiveEffects(deletions);
        break;
      case 22:
        i = deletions.stateNode;
        i._visibility & 2 && (i._visibility &= -3, recursivelyTraverseDisconnectPassiveEffects(deletions));
        break;
      default:
        recursivelyTraverseDisconnectPassiveEffects(deletions);
    }
    parentFiber = parentFiber.sibling;
  }
}
function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(deletedSubtreeRoot, nearestMountedAncestor) {
  for (;nextEffect !== null; ) {
    var fiber = nextEffect;
    switch (fiber.tag) {
      case 0:
      case 11:
      case 15:
        commitHookEffectListUnmount(8, fiber, nearestMountedAncestor);
        break;
      case 23:
      case 22:
        if (fiber.memoizedState !== null && fiber.memoizedState.cachePool !== null) {
          var cache = fiber.memoizedState.cachePool.pool;
          cache != null && cache.refCount++;
        }
        break;
      case 24:
        releaseCache(fiber.memoizedState.cache);
    }
    cache = fiber.child;
    if (cache !== null)
      cache.return = fiber, nextEffect = cache;
    else
      a:
        for (fiber = deletedSubtreeRoot;nextEffect !== null; ) {
          cache = nextEffect;
          var { sibling, return: returnFiber } = cache;
          detachFiberAfterEffects(cache);
          if (cache === fiber) {
            nextEffect = null;
            break a;
          }
          if (sibling !== null) {
            sibling.return = returnFiber;
            nextEffect = sibling;
            break a;
          }
          nextEffect = returnFiber;
        }
  }
}
function requestUpdateLane() {
  return (executionContext & 2) !== 0 && workInProgressRootRenderLanes !== 0 ? workInProgressRootRenderLanes & -workInProgressRootRenderLanes : ReactSharedInternals.T !== null ? requestTransitionLane() : resolveUpdatePriority();
}
function requestDeferredLane() {
  if (workInProgressDeferredLane === 0)
    if ((workInProgressRootRenderLanes & 536870912) === 0 || isHydrating) {
      var lane = nextTransitionDeferredLane;
      nextTransitionDeferredLane <<= 1;
      (nextTransitionDeferredLane & 3932160) === 0 && (nextTransitionDeferredLane = 262144);
      workInProgressDeferredLane = lane;
    } else
      workInProgressDeferredLane = 536870912;
  lane = suspenseHandlerStackCursor.current;
  lane !== null && (lane.flags |= 32);
  return workInProgressDeferredLane;
}
function scheduleUpdateOnFiber(root2, fiber, lane) {
  if (root2 === workInProgressRoot && (workInProgressSuspendedReason === 2 || workInProgressSuspendedReason === 9) || root2.cancelPendingCommit !== null)
    prepareFreshStack(root2, 0), markRootSuspended(root2, workInProgressRootRenderLanes, workInProgressDeferredLane, false);
  markRootUpdated$1(root2, lane);
  if ((executionContext & 2) === 0 || root2 !== workInProgressRoot)
    root2 === workInProgressRoot && ((executionContext & 2) === 0 && (workInProgressRootInterleavedUpdatedLanes |= lane), workInProgressRootExitStatus === 4 && markRootSuspended(root2, workInProgressRootRenderLanes, workInProgressDeferredLane, false)), ensureRootIsScheduled(root2);
}
function performWorkOnRoot(root$jscomp$0, lanes, forceSync) {
  if ((executionContext & 6) !== 0)
    throw Error(formatProdErrorMessage(327));
  var shouldTimeSlice = !forceSync && (lanes & 127) === 0 && (lanes & root$jscomp$0.expiredLanes) === 0 || checkIfRootIsPrerendering(root$jscomp$0, lanes), exitStatus = shouldTimeSlice ? renderRootConcurrent(root$jscomp$0, lanes) : renderRootSync(root$jscomp$0, lanes, true), renderWasConcurrent = shouldTimeSlice;
  do {
    if (exitStatus === 0) {
      workInProgressRootIsPrerendering && !shouldTimeSlice && markRootSuspended(root$jscomp$0, lanes, 0, false);
      break;
    } else {
      forceSync = root$jscomp$0.current.alternate;
      if (renderWasConcurrent && !isRenderConsistentWithExternalStores(forceSync)) {
        exitStatus = renderRootSync(root$jscomp$0, lanes, false);
        renderWasConcurrent = false;
        continue;
      }
      if (exitStatus === 2) {
        renderWasConcurrent = lanes;
        if (root$jscomp$0.errorRecoveryDisabledLanes & renderWasConcurrent)
          var JSCompiler_inline_result = 0;
        else
          JSCompiler_inline_result = root$jscomp$0.pendingLanes & -536870913, JSCompiler_inline_result = JSCompiler_inline_result !== 0 ? JSCompiler_inline_result : JSCompiler_inline_result & 536870912 ? 536870912 : 0;
        if (JSCompiler_inline_result !== 0) {
          lanes = JSCompiler_inline_result;
          a: {
            var root2 = root$jscomp$0;
            exitStatus = workInProgressRootConcurrentErrors;
            var wasRootDehydrated = root2.current.memoizedState.isDehydrated;
            wasRootDehydrated && (prepareFreshStack(root2, JSCompiler_inline_result).flags |= 256);
            JSCompiler_inline_result = renderRootSync(root2, JSCompiler_inline_result, false);
            if (JSCompiler_inline_result !== 2) {
              if (workInProgressRootDidAttachPingListener && !wasRootDehydrated) {
                root2.errorRecoveryDisabledLanes |= renderWasConcurrent;
                workInProgressRootInterleavedUpdatedLanes |= renderWasConcurrent;
                exitStatus = 4;
                break a;
              }
              renderWasConcurrent = workInProgressRootRecoverableErrors;
              workInProgressRootRecoverableErrors = exitStatus;
              renderWasConcurrent !== null && (workInProgressRootRecoverableErrors === null ? workInProgressRootRecoverableErrors = renderWasConcurrent : workInProgressRootRecoverableErrors.push.apply(workInProgressRootRecoverableErrors, renderWasConcurrent));
            }
            exitStatus = JSCompiler_inline_result;
          }
          renderWasConcurrent = false;
          if (exitStatus !== 2)
            continue;
        }
      }
      if (exitStatus === 1) {
        prepareFreshStack(root$jscomp$0, 0);
        markRootSuspended(root$jscomp$0, lanes, 0, true);
        break;
      }
      a: {
        shouldTimeSlice = root$jscomp$0;
        renderWasConcurrent = exitStatus;
        switch (renderWasConcurrent) {
          case 0:
          case 1:
            throw Error(formatProdErrorMessage(345));
          case 4:
            if ((lanes & 4194048) !== lanes)
              break;
          case 6:
            markRootSuspended(shouldTimeSlice, lanes, workInProgressDeferredLane, !workInProgressRootDidSkipSuspendedSiblings);
            break a;
          case 2:
            workInProgressRootRecoverableErrors = null;
            break;
          case 3:
          case 5:
            break;
          default:
            throw Error(formatProdErrorMessage(329));
        }
        if ((lanes & 62914560) === lanes && (exitStatus = globalMostRecentFallbackTime + 300 - now(), 10 < exitStatus)) {
          markRootSuspended(shouldTimeSlice, lanes, workInProgressDeferredLane, !workInProgressRootDidSkipSuspendedSiblings);
          if (getNextLanes(shouldTimeSlice, 0, true) !== 0)
            break a;
          pendingEffectsLanes = lanes;
          shouldTimeSlice.timeoutHandle = scheduleTimeout(commitRootWhenReady.bind(null, shouldTimeSlice, forceSync, workInProgressRootRecoverableErrors, workInProgressTransitions, workInProgressRootDidIncludeRecursiveRenderUpdate, lanes, workInProgressDeferredLane, workInProgressRootInterleavedUpdatedLanes, workInProgressSuspendedRetryLanes, workInProgressRootDidSkipSuspendedSiblings, renderWasConcurrent, "Throttled", -0, 0), exitStatus);
          break a;
        }
        commitRootWhenReady(shouldTimeSlice, forceSync, workInProgressRootRecoverableErrors, workInProgressTransitions, workInProgressRootDidIncludeRecursiveRenderUpdate, lanes, workInProgressDeferredLane, workInProgressRootInterleavedUpdatedLanes, workInProgressSuspendedRetryLanes, workInProgressRootDidSkipSuspendedSiblings, renderWasConcurrent, null, -0, 0);
      }
    }
    break;
  } while (1);
  ensureRootIsScheduled(root$jscomp$0);
}
function commitRootWhenReady(root2, finishedWork, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, lanes, spawnedLane, updatedLanes, suspendedRetryLanes, didSkipSuspendedSiblings, exitStatus, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
  root2.timeoutHandle = -1;
  suspendedCommitReason = finishedWork.subtreeFlags;
  if (suspendedCommitReason & 8192 || (suspendedCommitReason & 16785408) === 16785408) {
    suspendedCommitReason = {
      stylesheets: null,
      count: 0,
      imgCount: 0,
      imgBytes: 0,
      suspenseyImages: [],
      waitingForImages: true,
      waitingForViewTransition: false,
      unsuspend: noop$1
    };
    accumulateSuspenseyCommitOnFiber(finishedWork, lanes, suspendedCommitReason);
    var timeoutOffset = (lanes & 62914560) === lanes ? globalMostRecentFallbackTime - now() : (lanes & 4194048) === lanes ? globalMostRecentTransitionTime - now() : 0;
    timeoutOffset = waitForCommitToBeReady(suspendedCommitReason, timeoutOffset);
    if (timeoutOffset !== null) {
      pendingEffectsLanes = lanes;
      root2.cancelPendingCommit = timeoutOffset(commitRoot.bind(null, root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes, exitStatus, suspendedCommitReason, null, completedRenderStartTime, completedRenderEndTime));
      markRootSuspended(root2, lanes, spawnedLane, !didSkipSuspendedSiblings);
      return;
    }
  }
  commitRoot(root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes);
}
function isRenderConsistentWithExternalStores(finishedWork) {
  for (var node = finishedWork;; ) {
    var tag = node.tag;
    if ((tag === 0 || tag === 11 || tag === 15) && node.flags & 16384 && (tag = node.updateQueue, tag !== null && (tag = tag.stores, tag !== null)))
      for (var i = 0;i < tag.length; i++) {
        var check = tag[i], getSnapshot = check.getSnapshot;
        check = check.value;
        try {
          if (!objectIs(getSnapshot(), check))
            return false;
        } catch (error) {
          return false;
        }
      }
    tag = node.child;
    if (node.subtreeFlags & 16384 && tag !== null)
      tag.return = node, node = tag;
    else {
      if (node === finishedWork)
        break;
      for (;node.sibling === null; ) {
        if (node.return === null || node.return === finishedWork)
          return true;
        node = node.return;
      }
      node.sibling.return = node.return;
      node = node.sibling;
    }
  }
  return true;
}
function markRootSuspended(root2, suspendedLanes, spawnedLane, didAttemptEntireTree) {
  suspendedLanes &= ~workInProgressRootPingedLanes;
  suspendedLanes &= ~workInProgressRootInterleavedUpdatedLanes;
  root2.suspendedLanes |= suspendedLanes;
  root2.pingedLanes &= ~suspendedLanes;
  didAttemptEntireTree && (root2.warmLanes |= suspendedLanes);
  didAttemptEntireTree = root2.expirationTimes;
  for (var lanes = suspendedLanes;0 < lanes; ) {
    var index$6 = 31 - clz32(lanes), lane = 1 << index$6;
    didAttemptEntireTree[index$6] = -1;
    lanes &= ~lane;
  }
  spawnedLane !== 0 && markSpawnedDeferredLane(root2, spawnedLane, suspendedLanes);
}
function flushSyncWork$1() {
  return (executionContext & 6) === 0 ? (flushSyncWorkAcrossRoots_impl(0, false), false) : true;
}
function resetWorkInProgressStack() {
  if (workInProgress !== null) {
    if (workInProgressSuspendedReason === 0)
      var interruptedWork = workInProgress.return;
    else
      interruptedWork = workInProgress, lastContextDependency = currentlyRenderingFiber$1 = null, resetHooksOnUnwind(interruptedWork), thenableState$1 = null, thenableIndexCounter$1 = 0, interruptedWork = workInProgress;
    for (;interruptedWork !== null; )
      unwindInterruptedWork(interruptedWork.alternate, interruptedWork), interruptedWork = interruptedWork.return;
    workInProgress = null;
  }
}
function prepareFreshStack(root2, lanes) {
  var timeoutHandle = root2.timeoutHandle;
  timeoutHandle !== -1 && (root2.timeoutHandle = -1, cancelTimeout(timeoutHandle));
  timeoutHandle = root2.cancelPendingCommit;
  timeoutHandle !== null && (root2.cancelPendingCommit = null, timeoutHandle());
  pendingEffectsLanes = 0;
  resetWorkInProgressStack();
  workInProgressRoot = root2;
  workInProgress = timeoutHandle = createWorkInProgress(root2.current, null);
  workInProgressRootRenderLanes = lanes;
  workInProgressSuspendedReason = 0;
  workInProgressThrownValue = null;
  workInProgressRootDidSkipSuspendedSiblings = false;
  workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root2, lanes);
  workInProgressRootDidAttachPingListener = false;
  workInProgressSuspendedRetryLanes = workInProgressDeferredLane = workInProgressRootPingedLanes = workInProgressRootInterleavedUpdatedLanes = workInProgressRootSkippedLanes = workInProgressRootExitStatus = 0;
  workInProgressRootRecoverableErrors = workInProgressRootConcurrentErrors = null;
  workInProgressRootDidIncludeRecursiveRenderUpdate = false;
  (lanes & 8) !== 0 && (lanes |= lanes & 32);
  var allEntangledLanes = root2.entangledLanes;
  if (allEntangledLanes !== 0)
    for (root2 = root2.entanglements, allEntangledLanes &= lanes;0 < allEntangledLanes; ) {
      var index$4 = 31 - clz32(allEntangledLanes), lane = 1 << index$4;
      lanes |= root2[index$4];
      allEntangledLanes &= ~lane;
    }
  entangledRenderLanes = lanes;
  finishQueueingConcurrentUpdates();
  return timeoutHandle;
}
function handleThrow(root2, thrownValue) {
  currentlyRenderingFiber = null;
  ReactSharedInternals.H = ContextOnlyDispatcher;
  thrownValue === SuspenseException || thrownValue === SuspenseActionException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 3) : thrownValue === SuspenseyCommitException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = 4) : workInProgressSuspendedReason = thrownValue === SelectiveHydrationException ? 8 : thrownValue !== null && typeof thrownValue === "object" && typeof thrownValue.then === "function" ? 6 : 1;
  workInProgressThrownValue = thrownValue;
  workInProgress === null && (workInProgressRootExitStatus = 1, logUncaughtError(root2, createCapturedValueAtFiber(thrownValue, root2.current)));
}
function shouldRemainOnPreviousScreen() {
  var handler = suspenseHandlerStackCursor.current;
  return handler === null ? true : (workInProgressRootRenderLanes & 4194048) === workInProgressRootRenderLanes ? shellBoundary === null ? true : false : (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes || (workInProgressRootRenderLanes & 536870912) !== 0 ? handler === shellBoundary : false;
}
function pushDispatcher() {
  var prevDispatcher = ReactSharedInternals.H;
  ReactSharedInternals.H = ContextOnlyDispatcher;
  return prevDispatcher === null ? ContextOnlyDispatcher : prevDispatcher;
}
function pushAsyncDispatcher() {
  var prevAsyncDispatcher = ReactSharedInternals.A;
  ReactSharedInternals.A = DefaultAsyncDispatcher;
  return prevAsyncDispatcher;
}
function renderDidSuspendDelayIfPossible() {
  workInProgressRootExitStatus = 4;
  workInProgressRootDidSkipSuspendedSiblings || (workInProgressRootRenderLanes & 4194048) !== workInProgressRootRenderLanes && suspenseHandlerStackCursor.current !== null || (workInProgressRootIsPrerendering = true);
  (workInProgressRootSkippedLanes & 134217727) === 0 && (workInProgressRootInterleavedUpdatedLanes & 134217727) === 0 || workInProgressRoot === null || markRootSuspended(workInProgressRoot, workInProgressRootRenderLanes, workInProgressDeferredLane, false);
}
function renderRootSync(root2, lanes, shouldYieldForPrerendering) {
  var prevExecutionContext = executionContext;
  executionContext |= 2;
  var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
  if (workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes)
    workInProgressTransitions = null, prepareFreshStack(root2, lanes);
  lanes = false;
  var exitStatus = workInProgressRootExitStatus;
  a:
    do
      try {
        if (workInProgressSuspendedReason !== 0 && workInProgress !== null) {
          var unitOfWork = workInProgress, thrownValue = workInProgressThrownValue;
          switch (workInProgressSuspendedReason) {
            case 8:
              resetWorkInProgressStack();
              exitStatus = 6;
              break a;
            case 3:
            case 2:
            case 9:
            case 6:
              suspenseHandlerStackCursor.current === null && (lanes = true);
              var reason = workInProgressSuspendedReason;
              workInProgressSuspendedReason = 0;
              workInProgressThrownValue = null;
              throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
              if (shouldYieldForPrerendering && workInProgressRootIsPrerendering) {
                exitStatus = 0;
                break a;
              }
              break;
            default:
              reason = workInProgressSuspendedReason, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
          }
        }
        workLoopSync();
        exitStatus = workInProgressRootExitStatus;
        break;
      } catch (thrownValue$165) {
        handleThrow(root2, thrownValue$165);
      }
    while (1);
  lanes && root2.shellSuspendCounter++;
  lastContextDependency = currentlyRenderingFiber$1 = null;
  executionContext = prevExecutionContext;
  ReactSharedInternals.H = prevDispatcher;
  ReactSharedInternals.A = prevAsyncDispatcher;
  workInProgress === null && (workInProgressRoot = null, workInProgressRootRenderLanes = 0, finishQueueingConcurrentUpdates());
  return exitStatus;
}
function workLoopSync() {
  for (;workInProgress !== null; )
    performUnitOfWork(workInProgress);
}
function renderRootConcurrent(root2, lanes) {
  var prevExecutionContext = executionContext;
  executionContext |= 2;
  var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
  workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes ? (workInProgressTransitions = null, workInProgressRootRenderTargetTime = now() + 500, prepareFreshStack(root2, lanes)) : workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root2, lanes);
  a:
    do
      try {
        if (workInProgressSuspendedReason !== 0 && workInProgress !== null) {
          lanes = workInProgress;
          var thrownValue = workInProgressThrownValue;
          b:
            switch (workInProgressSuspendedReason) {
              case 1:
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 1);
                break;
              case 2:
              case 9:
                if (isThenableResolved(thrownValue)) {
                  workInProgressSuspendedReason = 0;
                  workInProgressThrownValue = null;
                  replaySuspendedUnitOfWork(lanes);
                  break;
                }
                lanes = function() {
                  workInProgressSuspendedReason !== 2 && workInProgressSuspendedReason !== 9 || workInProgressRoot !== root2 || (workInProgressSuspendedReason = 7);
                  ensureRootIsScheduled(root2);
                };
                thrownValue.then(lanes, lanes);
                break a;
              case 3:
                workInProgressSuspendedReason = 7;
                break a;
              case 4:
                workInProgressSuspendedReason = 5;
                break a;
              case 7:
                isThenableResolved(thrownValue) ? (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, replaySuspendedUnitOfWork(lanes)) : (workInProgressSuspendedReason = 0, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, lanes, thrownValue, 7));
                break;
              case 5:
                var resource = null;
                switch (workInProgress.tag) {
                  case 26:
                    resource = workInProgress.memoizedState;
                  case 5:
                  case 27:
                    var hostFiber = workInProgress;
                    if (resource ? preloadResource(resource) : hostFiber.stateNode.complete) {
                      workInProgressSuspendedReason = 0;
                      workInProgressThrownValue = null;
                      var sibling = hostFiber.sibling;
                      if (sibling !== null)
                        workInProgress = sibling;
                      else {
                        var returnFiber = hostFiber.return;
                        returnFiber !== null ? (workInProgress = returnFiber, completeUnitOfWork(returnFiber)) : workInProgress = null;
                      }
                      break b;
                    }
                }
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 5);
                break;
              case 6:
                workInProgressSuspendedReason = 0;
                workInProgressThrownValue = null;
                throwAndUnwindWorkLoop(root2, lanes, thrownValue, 6);
                break;
              case 8:
                resetWorkInProgressStack();
                workInProgressRootExitStatus = 6;
                break a;
              default:
                throw Error(formatProdErrorMessage(462));
            }
        }
        workLoopConcurrentByScheduler();
        break;
      } catch (thrownValue$167) {
        handleThrow(root2, thrownValue$167);
      }
    while (1);
  lastContextDependency = currentlyRenderingFiber$1 = null;
  ReactSharedInternals.H = prevDispatcher;
  ReactSharedInternals.A = prevAsyncDispatcher;
  executionContext = prevExecutionContext;
  if (workInProgress !== null)
    return 0;
  workInProgressRoot = null;
  workInProgressRootRenderLanes = 0;
  finishQueueingConcurrentUpdates();
  return workInProgressRootExitStatus;
}
function workLoopConcurrentByScheduler() {
  for (;workInProgress !== null && !shouldYield(); )
    performUnitOfWork(workInProgress);
}
function performUnitOfWork(unitOfWork) {
  var next = beginWork(unitOfWork.alternate, unitOfWork, entangledRenderLanes);
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  next === null ? completeUnitOfWork(unitOfWork) : workInProgress = next;
}
function replaySuspendedUnitOfWork(unitOfWork) {
  var next = unitOfWork;
  var current = next.alternate;
  switch (next.tag) {
    case 15:
    case 0:
      next = replayFunctionComponent(current, next, next.pendingProps, next.type, undefined, workInProgressRootRenderLanes);
      break;
    case 11:
      next = replayFunctionComponent(current, next, next.pendingProps, next.type.render, next.ref, workInProgressRootRenderLanes);
      break;
    case 5:
      resetHooksOnUnwind(next);
    default:
      unwindInterruptedWork(current, next), next = workInProgress = resetWorkInProgress(next, entangledRenderLanes), next = beginWork(current, next, entangledRenderLanes);
  }
  unitOfWork.memoizedProps = unitOfWork.pendingProps;
  next === null ? completeUnitOfWork(unitOfWork) : workInProgress = next;
}
function throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, suspendedReason) {
  lastContextDependency = currentlyRenderingFiber$1 = null;
  resetHooksOnUnwind(unitOfWork);
  thenableState$1 = null;
  thenableIndexCounter$1 = 0;
  var returnFiber = unitOfWork.return;
  try {
    if (throwException(root2, returnFiber, unitOfWork, thrownValue, workInProgressRootRenderLanes)) {
      workInProgressRootExitStatus = 1;
      logUncaughtError(root2, createCapturedValueAtFiber(thrownValue, root2.current));
      workInProgress = null;
      return;
    }
  } catch (error) {
    if (returnFiber !== null)
      throw workInProgress = returnFiber, error;
    workInProgressRootExitStatus = 1;
    logUncaughtError(root2, createCapturedValueAtFiber(thrownValue, root2.current));
    workInProgress = null;
    return;
  }
  if (unitOfWork.flags & 32768) {
    if (isHydrating || suspendedReason === 1)
      root2 = true;
    else if (workInProgressRootIsPrerendering || (workInProgressRootRenderLanes & 536870912) !== 0)
      root2 = false;
    else if (workInProgressRootDidSkipSuspendedSiblings = root2 = true, suspendedReason === 2 || suspendedReason === 9 || suspendedReason === 3 || suspendedReason === 6)
      suspendedReason = suspenseHandlerStackCursor.current, suspendedReason !== null && suspendedReason.tag === 13 && (suspendedReason.flags |= 16384);
    unwindUnitOfWork(unitOfWork, root2);
  } else
    completeUnitOfWork(unitOfWork);
}
function completeUnitOfWork(unitOfWork) {
  var completedWork = unitOfWork;
  do {
    if ((completedWork.flags & 32768) !== 0) {
      unwindUnitOfWork(completedWork, workInProgressRootDidSkipSuspendedSiblings);
      return;
    }
    unitOfWork = completedWork.return;
    var next = completeWork(completedWork.alternate, completedWork, entangledRenderLanes);
    if (next !== null) {
      workInProgress = next;
      return;
    }
    completedWork = completedWork.sibling;
    if (completedWork !== null) {
      workInProgress = completedWork;
      return;
    }
    workInProgress = completedWork = unitOfWork;
  } while (completedWork !== null);
  workInProgressRootExitStatus === 0 && (workInProgressRootExitStatus = 5);
}
function unwindUnitOfWork(unitOfWork, skipSiblings) {
  do {
    var next = unwindWork(unitOfWork.alternate, unitOfWork);
    if (next !== null) {
      next.flags &= 32767;
      workInProgress = next;
      return;
    }
    next = unitOfWork.return;
    next !== null && (next.flags |= 32768, next.subtreeFlags = 0, next.deletions = null);
    if (!skipSiblings && (unitOfWork = unitOfWork.sibling, unitOfWork !== null)) {
      workInProgress = unitOfWork;
      return;
    }
    workInProgress = unitOfWork = next;
  } while (unitOfWork !== null);
  workInProgressRootExitStatus = 6;
  workInProgress = null;
}
function commitRoot(root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes) {
  root2.cancelPendingCommit = null;
  do
    flushPendingEffects();
  while (pendingEffectsStatus !== 0);
  if ((executionContext & 6) !== 0)
    throw Error(formatProdErrorMessage(327));
  if (finishedWork !== null) {
    if (finishedWork === root2.current)
      throw Error(formatProdErrorMessage(177));
    didIncludeRenderPhaseUpdate = finishedWork.lanes | finishedWork.childLanes;
    didIncludeRenderPhaseUpdate |= concurrentlyUpdatedLanes;
    markRootFinished(root2, lanes, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes);
    root2 === workInProgressRoot && (workInProgress = workInProgressRoot = null, workInProgressRootRenderLanes = 0);
    pendingFinishedWork = finishedWork;
    pendingEffectsRoot = root2;
    pendingEffectsLanes = lanes;
    pendingEffectsRemainingLanes = didIncludeRenderPhaseUpdate;
    pendingPassiveTransitions = transitions;
    pendingRecoverableErrors = recoverableErrors;
    (finishedWork.subtreeFlags & 10256) !== 0 || (finishedWork.flags & 10256) !== 0 ? (root2.callbackNode = null, root2.callbackPriority = 0, scheduleCallback$1(NormalPriority$1, function() {
      flushPassiveEffects();
      return null;
    })) : (root2.callbackNode = null, root2.callbackPriority = 0);
    recoverableErrors = (finishedWork.flags & 13878) !== 0;
    if ((finishedWork.subtreeFlags & 13878) !== 0 || recoverableErrors) {
      recoverableErrors = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      transitions = ReactDOMSharedInternals.p;
      ReactDOMSharedInternals.p = 2;
      spawnedLane = executionContext;
      executionContext |= 4;
      try {
        commitBeforeMutationEffects(root2, finishedWork, lanes);
      } finally {
        executionContext = spawnedLane, ReactDOMSharedInternals.p = transitions, ReactSharedInternals.T = recoverableErrors;
      }
    }
    pendingEffectsStatus = 1;
    flushMutationEffects();
    flushLayoutEffects();
    flushSpawnedWork();
  }
}
function flushMutationEffects() {
  if (pendingEffectsStatus === 1) {
    pendingEffectsStatus = 0;
    var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootMutationHasEffect = (finishedWork.flags & 13878) !== 0;
    if ((finishedWork.subtreeFlags & 13878) !== 0 || rootMutationHasEffect) {
      rootMutationHasEffect = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      var previousPriority = ReactDOMSharedInternals.p;
      ReactDOMSharedInternals.p = 2;
      var prevExecutionContext = executionContext;
      executionContext |= 4;
      try {
        commitMutationEffectsOnFiber(finishedWork, root2);
        var priorSelectionInformation = selectionInformation, curFocusedElem = getActiveElementDeep(root2.containerInfo), priorFocusedElem = priorSelectionInformation.focusedElem, priorSelectionRange = priorSelectionInformation.selectionRange;
        if (curFocusedElem !== priorFocusedElem && priorFocusedElem && priorFocusedElem.ownerDocument && containsNode(priorFocusedElem.ownerDocument.documentElement, priorFocusedElem)) {
          if (priorSelectionRange !== null && hasSelectionCapabilities(priorFocusedElem)) {
            var { start, end } = priorSelectionRange;
            end === undefined && (end = start);
            if ("selectionStart" in priorFocusedElem)
              priorFocusedElem.selectionStart = start, priorFocusedElem.selectionEnd = Math.min(end, priorFocusedElem.value.length);
            else {
              var doc = priorFocusedElem.ownerDocument || document, win = doc && doc.defaultView || window;
              if (win.getSelection) {
                var selection = win.getSelection(), length = priorFocusedElem.textContent.length, start$jscomp$0 = Math.min(priorSelectionRange.start, length), end$jscomp$0 = priorSelectionRange.end === undefined ? start$jscomp$0 : Math.min(priorSelectionRange.end, length);
                !selection.extend && start$jscomp$0 > end$jscomp$0 && (curFocusedElem = end$jscomp$0, end$jscomp$0 = start$jscomp$0, start$jscomp$0 = curFocusedElem);
                var startMarker = getNodeForCharacterOffset(priorFocusedElem, start$jscomp$0), endMarker = getNodeForCharacterOffset(priorFocusedElem, end$jscomp$0);
                if (startMarker && endMarker && (selection.rangeCount !== 1 || selection.anchorNode !== startMarker.node || selection.anchorOffset !== startMarker.offset || selection.focusNode !== endMarker.node || selection.focusOffset !== endMarker.offset)) {
                  var range = doc.createRange();
                  range.setStart(startMarker.node, startMarker.offset);
                  selection.removeAllRanges();
                  start$jscomp$0 > end$jscomp$0 ? (selection.addRange(range), selection.extend(endMarker.node, endMarker.offset)) : (range.setEnd(endMarker.node, endMarker.offset), selection.addRange(range));
                }
              }
            }
          }
          doc = [];
          for (selection = priorFocusedElem;selection = selection.parentNode; )
            selection.nodeType === 1 && doc.push({
              element: selection,
              left: selection.scrollLeft,
              top: selection.scrollTop
            });
          typeof priorFocusedElem.focus === "function" && priorFocusedElem.focus();
          for (priorFocusedElem = 0;priorFocusedElem < doc.length; priorFocusedElem++) {
            var info = doc[priorFocusedElem];
            info.element.scrollLeft = info.left;
            info.element.scrollTop = info.top;
          }
        }
        _enabled = !!eventsEnabled;
        selectionInformation = eventsEnabled = null;
      } finally {
        executionContext = prevExecutionContext, ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = rootMutationHasEffect;
      }
    }
    root2.current = finishedWork;
    pendingEffectsStatus = 2;
  }
}
function flushLayoutEffects() {
  if (pendingEffectsStatus === 2) {
    pendingEffectsStatus = 0;
    var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, rootHasLayoutEffect = (finishedWork.flags & 8772) !== 0;
    if ((finishedWork.subtreeFlags & 8772) !== 0 || rootHasLayoutEffect) {
      rootHasLayoutEffect = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      var previousPriority = ReactDOMSharedInternals.p;
      ReactDOMSharedInternals.p = 2;
      var prevExecutionContext = executionContext;
      executionContext |= 4;
      try {
        commitLayoutEffectOnFiber(root2, finishedWork.alternate, finishedWork);
      } finally {
        executionContext = prevExecutionContext, ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = rootHasLayoutEffect;
      }
    }
    pendingEffectsStatus = 3;
  }
}
function flushSpawnedWork() {
  if (pendingEffectsStatus === 4 || pendingEffectsStatus === 3) {
    pendingEffectsStatus = 0;
    requestPaint();
    var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, lanes = pendingEffectsLanes, recoverableErrors = pendingRecoverableErrors;
    (finishedWork.subtreeFlags & 10256) !== 0 || (finishedWork.flags & 10256) !== 0 ? pendingEffectsStatus = 5 : (pendingEffectsStatus = 0, pendingFinishedWork = pendingEffectsRoot = null, releaseRootPooledCache(root2, root2.pendingLanes));
    var remainingLanes = root2.pendingLanes;
    remainingLanes === 0 && (legacyErrorBoundariesThatAlreadyFailed = null);
    lanesToEventPriority(lanes);
    finishedWork = finishedWork.stateNode;
    if (injectedHook && typeof injectedHook.onCommitFiberRoot === "function")
      try {
        injectedHook.onCommitFiberRoot(rendererID, finishedWork, undefined, (finishedWork.current.flags & 128) === 128);
      } catch (err) {}
    if (recoverableErrors !== null) {
      finishedWork = ReactSharedInternals.T;
      remainingLanes = ReactDOMSharedInternals.p;
      ReactDOMSharedInternals.p = 2;
      ReactSharedInternals.T = null;
      try {
        for (var onRecoverableError = root2.onRecoverableError, i = 0;i < recoverableErrors.length; i++) {
          var recoverableError = recoverableErrors[i];
          onRecoverableError(recoverableError.value, {
            componentStack: recoverableError.stack
          });
        }
      } finally {
        ReactSharedInternals.T = finishedWork, ReactDOMSharedInternals.p = remainingLanes;
      }
    }
    (pendingEffectsLanes & 3) !== 0 && flushPendingEffects();
    ensureRootIsScheduled(root2);
    remainingLanes = root2.pendingLanes;
    (lanes & 261930) !== 0 && (remainingLanes & 42) !== 0 ? root2 === rootWithNestedUpdates ? nestedUpdateCount++ : (nestedUpdateCount = 0, rootWithNestedUpdates = root2) : nestedUpdateCount = 0;
    flushSyncWorkAcrossRoots_impl(0, false);
  }
}
function releaseRootPooledCache(root2, remainingLanes) {
  (root2.pooledCacheLanes &= remainingLanes) === 0 && (remainingLanes = root2.pooledCache, remainingLanes != null && (root2.pooledCache = null, releaseCache(remainingLanes)));
}
function flushPendingEffects() {
  flushMutationEffects();
  flushLayoutEffects();
  flushSpawnedWork();
  return flushPassiveEffects();
}
function flushPassiveEffects() {
  if (pendingEffectsStatus !== 5)
    return false;
  var root2 = pendingEffectsRoot, remainingLanes = pendingEffectsRemainingLanes;
  pendingEffectsRemainingLanes = 0;
  var renderPriority = lanesToEventPriority(pendingEffectsLanes), prevTransition = ReactSharedInternals.T, previousPriority = ReactDOMSharedInternals.p;
  try {
    ReactDOMSharedInternals.p = 32 > renderPriority ? 32 : renderPriority;
    ReactSharedInternals.T = null;
    renderPriority = pendingPassiveTransitions;
    pendingPassiveTransitions = null;
    var root$jscomp$0 = pendingEffectsRoot, lanes = pendingEffectsLanes;
    pendingEffectsStatus = 0;
    pendingFinishedWork = pendingEffectsRoot = null;
    pendingEffectsLanes = 0;
    if ((executionContext & 6) !== 0)
      throw Error(formatProdErrorMessage(331));
    var prevExecutionContext = executionContext;
    executionContext |= 4;
    commitPassiveUnmountOnFiber(root$jscomp$0.current);
    commitPassiveMountOnFiber(root$jscomp$0, root$jscomp$0.current, lanes, renderPriority);
    executionContext = prevExecutionContext;
    flushSyncWorkAcrossRoots_impl(0, false);
    if (injectedHook && typeof injectedHook.onPostCommitFiberRoot === "function")
      try {
        injectedHook.onPostCommitFiberRoot(rendererID, root$jscomp$0);
      } catch (err) {}
    return true;
  } finally {
    ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition, releaseRootPooledCache(root2, remainingLanes);
  }
}
function captureCommitPhaseErrorOnRoot(rootFiber, sourceFiber, error) {
  sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
  sourceFiber = createRootErrorUpdate(rootFiber.stateNode, sourceFiber, 2);
  rootFiber = enqueueUpdate(rootFiber, sourceFiber, 2);
  rootFiber !== null && (markRootUpdated$1(rootFiber, 2), ensureRootIsScheduled(rootFiber));
}
function captureCommitPhaseError(sourceFiber, nearestMountedAncestor, error) {
  if (sourceFiber.tag === 3)
    captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
  else
    for (;nearestMountedAncestor !== null; ) {
      if (nearestMountedAncestor.tag === 3) {
        captureCommitPhaseErrorOnRoot(nearestMountedAncestor, sourceFiber, error);
        break;
      } else if (nearestMountedAncestor.tag === 1) {
        var instance = nearestMountedAncestor.stateNode;
        if (typeof nearestMountedAncestor.type.getDerivedStateFromError === "function" || typeof instance.componentDidCatch === "function" && (legacyErrorBoundariesThatAlreadyFailed === null || !legacyErrorBoundariesThatAlreadyFailed.has(instance))) {
          sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
          error = createClassErrorUpdate(2);
          instance = enqueueUpdate(nearestMountedAncestor, error, 2);
          instance !== null && (initializeClassErrorUpdate(error, instance, nearestMountedAncestor, sourceFiber), markRootUpdated$1(instance, 2), ensureRootIsScheduled(instance));
          break;
        }
      }
      nearestMountedAncestor = nearestMountedAncestor.return;
    }
}
function attachPingListener(root2, wakeable, lanes) {
  var pingCache = root2.pingCache;
  if (pingCache === null) {
    pingCache = root2.pingCache = new PossiblyWeakMap;
    var threadIDs = new Set;
    pingCache.set(wakeable, threadIDs);
  } else
    threadIDs = pingCache.get(wakeable), threadIDs === undefined && (threadIDs = new Set, pingCache.set(wakeable, threadIDs));
  threadIDs.has(lanes) || (workInProgressRootDidAttachPingListener = true, threadIDs.add(lanes), root2 = pingSuspendedRoot.bind(null, root2, wakeable, lanes), wakeable.then(root2, root2));
}
function pingSuspendedRoot(root2, wakeable, pingedLanes) {
  var pingCache = root2.pingCache;
  pingCache !== null && pingCache.delete(wakeable);
  root2.pingedLanes |= root2.suspendedLanes & pingedLanes;
  root2.warmLanes &= ~pingedLanes;
  workInProgressRoot === root2 && (workInProgressRootRenderLanes & pingedLanes) === pingedLanes && (workInProgressRootExitStatus === 4 || workInProgressRootExitStatus === 3 && (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes && 300 > now() - globalMostRecentFallbackTime ? (executionContext & 2) === 0 && prepareFreshStack(root2, 0) : workInProgressRootPingedLanes |= pingedLanes, workInProgressSuspendedRetryLanes === workInProgressRootRenderLanes && (workInProgressSuspendedRetryLanes = 0));
  ensureRootIsScheduled(root2);
}
function retryTimedOutBoundary(boundaryFiber, retryLane) {
  retryLane === 0 && (retryLane = claimNextRetryLane());
  boundaryFiber = enqueueConcurrentRenderForLane(boundaryFiber, retryLane);
  boundaryFiber !== null && (markRootUpdated$1(boundaryFiber, retryLane), ensureRootIsScheduled(boundaryFiber));
}
function retryDehydratedSuspenseBoundary(boundaryFiber) {
  var suspenseState = boundaryFiber.memoizedState, retryLane = 0;
  suspenseState !== null && (retryLane = suspenseState.retryLane);
  retryTimedOutBoundary(boundaryFiber, retryLane);
}
function resolveRetryWakeable(boundaryFiber, wakeable) {
  var retryLane = 0;
  switch (boundaryFiber.tag) {
    case 31:
    case 13:
      var retryCache = boundaryFiber.stateNode;
      var suspenseState = boundaryFiber.memoizedState;
      suspenseState !== null && (retryLane = suspenseState.retryLane);
      break;
    case 19:
      retryCache = boundaryFiber.stateNode;
      break;
    case 22:
      retryCache = boundaryFiber.stateNode._retryCache;
      break;
    default:
      throw Error(formatProdErrorMessage(314));
  }
  retryCache !== null && retryCache.delete(wakeable);
  retryTimedOutBoundary(boundaryFiber, retryLane);
}
function scheduleCallback$1(priorityLevel, callback) {
  return scheduleCallback$3(priorityLevel, callback);
}
function ensureRootIsScheduled(root2) {
  root2 !== lastScheduledRoot && root2.next === null && (lastScheduledRoot === null ? firstScheduledRoot = lastScheduledRoot = root2 : lastScheduledRoot = lastScheduledRoot.next = root2);
  mightHavePendingSyncWork = true;
  didScheduleMicrotask || (didScheduleMicrotask = true, scheduleImmediateRootScheduleTask());
}
function flushSyncWorkAcrossRoots_impl(syncTransitionLanes, onlyLegacy) {
  if (!isFlushingWork && mightHavePendingSyncWork) {
    isFlushingWork = true;
    do {
      var didPerformSomeWork = false;
      for (var root$170 = firstScheduledRoot;root$170 !== null; ) {
        if (!onlyLegacy)
          if (syncTransitionLanes !== 0) {
            var pendingLanes = root$170.pendingLanes;
            if (pendingLanes === 0)
              var JSCompiler_inline_result = 0;
            else {
              var { suspendedLanes, pingedLanes } = root$170;
              JSCompiler_inline_result = (1 << 31 - clz32(42 | syncTransitionLanes) + 1) - 1;
              JSCompiler_inline_result &= pendingLanes & ~(suspendedLanes & ~pingedLanes);
              JSCompiler_inline_result = JSCompiler_inline_result & 201326741 ? JSCompiler_inline_result & 201326741 | 1 : JSCompiler_inline_result ? JSCompiler_inline_result | 2 : 0;
            }
            JSCompiler_inline_result !== 0 && (didPerformSomeWork = true, performSyncWorkOnRoot(root$170, JSCompiler_inline_result));
          } else
            JSCompiler_inline_result = workInProgressRootRenderLanes, JSCompiler_inline_result = getNextLanes(root$170, root$170 === workInProgressRoot ? JSCompiler_inline_result : 0, root$170.cancelPendingCommit !== null || root$170.timeoutHandle !== -1), (JSCompiler_inline_result & 3) === 0 || checkIfRootIsPrerendering(root$170, JSCompiler_inline_result) || (didPerformSomeWork = true, performSyncWorkOnRoot(root$170, JSCompiler_inline_result));
        root$170 = root$170.next;
      }
    } while (didPerformSomeWork);
    isFlushingWork = false;
  }
}
function processRootScheduleInImmediateTask() {
  processRootScheduleInMicrotask();
}
function processRootScheduleInMicrotask() {
  mightHavePendingSyncWork = didScheduleMicrotask = false;
  var syncTransitionLanes = 0;
  currentEventTransitionLane !== 0 && shouldAttemptEagerTransition() && (syncTransitionLanes = currentEventTransitionLane);
  for (var currentTime = now(), prev = null, root2 = firstScheduledRoot;root2 !== null; ) {
    var next = root2.next, nextLanes = scheduleTaskForRootDuringMicrotask(root2, currentTime);
    if (nextLanes === 0)
      root2.next = null, prev === null ? firstScheduledRoot = next : prev.next = next, next === null && (lastScheduledRoot = prev);
    else if (prev = root2, syncTransitionLanes !== 0 || (nextLanes & 3) !== 0)
      mightHavePendingSyncWork = true;
    root2 = next;
  }
  pendingEffectsStatus !== 0 && pendingEffectsStatus !== 5 || flushSyncWorkAcrossRoots_impl(syncTransitionLanes, false);
  currentEventTransitionLane !== 0 && (currentEventTransitionLane = 0);
}
function scheduleTaskForRootDuringMicrotask(root2, currentTime) {
  for (var { suspendedLanes, pingedLanes, expirationTimes } = root2, lanes = root2.pendingLanes & -62914561;0 < lanes; ) {
    var index$5 = 31 - clz32(lanes), lane = 1 << index$5, expirationTime = expirationTimes[index$5];
    if (expirationTime === -1) {
      if ((lane & suspendedLanes) === 0 || (lane & pingedLanes) !== 0)
        expirationTimes[index$5] = computeExpirationTime(lane, currentTime);
    } else
      expirationTime <= currentTime && (root2.expiredLanes |= lane);
    lanes &= ~lane;
  }
  currentTime = workInProgressRoot;
  suspendedLanes = workInProgressRootRenderLanes;
  suspendedLanes = getNextLanes(root2, root2 === currentTime ? suspendedLanes : 0, root2.cancelPendingCommit !== null || root2.timeoutHandle !== -1);
  pingedLanes = root2.callbackNode;
  if (suspendedLanes === 0 || root2 === currentTime && (workInProgressSuspendedReason === 2 || workInProgressSuspendedReason === 9) || root2.cancelPendingCommit !== null)
    return pingedLanes !== null && pingedLanes !== null && cancelCallback$1(pingedLanes), root2.callbackNode = null, root2.callbackPriority = 0;
  if ((suspendedLanes & 3) === 0 || checkIfRootIsPrerendering(root2, suspendedLanes)) {
    currentTime = suspendedLanes & -suspendedLanes;
    if (currentTime === root2.callbackPriority)
      return currentTime;
    pingedLanes !== null && cancelCallback$1(pingedLanes);
    switch (lanesToEventPriority(suspendedLanes)) {
      case 2:
      case 8:
        suspendedLanes = UserBlockingPriority;
        break;
      case 32:
        suspendedLanes = NormalPriority$1;
        break;
      case 268435456:
        suspendedLanes = IdlePriority;
        break;
      default:
        suspendedLanes = NormalPriority$1;
    }
    pingedLanes = performWorkOnRootViaSchedulerTask.bind(null, root2);
    suspendedLanes = scheduleCallback$3(suspendedLanes, pingedLanes);
    root2.callbackPriority = currentTime;
    root2.callbackNode = suspendedLanes;
    return currentTime;
  }
  pingedLanes !== null && pingedLanes !== null && cancelCallback$1(pingedLanes);
  root2.callbackPriority = 2;
  root2.callbackNode = null;
  return 2;
}
function performWorkOnRootViaSchedulerTask(root2, didTimeout) {
  if (pendingEffectsStatus !== 0 && pendingEffectsStatus !== 5)
    return root2.callbackNode = null, root2.callbackPriority = 0, null;
  var originalCallbackNode = root2.callbackNode;
  if (flushPendingEffects() && root2.callbackNode !== originalCallbackNode)
    return null;
  var workInProgressRootRenderLanes$jscomp$0 = workInProgressRootRenderLanes;
  workInProgressRootRenderLanes$jscomp$0 = getNextLanes(root2, root2 === workInProgressRoot ? workInProgressRootRenderLanes$jscomp$0 : 0, root2.cancelPendingCommit !== null || root2.timeoutHandle !== -1);
  if (workInProgressRootRenderLanes$jscomp$0 === 0)
    return null;
  performWorkOnRoot(root2, workInProgressRootRenderLanes$jscomp$0, didTimeout);
  scheduleTaskForRootDuringMicrotask(root2, now());
  return root2.callbackNode != null && root2.callbackNode === originalCallbackNode ? performWorkOnRootViaSchedulerTask.bind(null, root2) : null;
}
function performSyncWorkOnRoot(root2, lanes) {
  if (flushPendingEffects())
    return null;
  performWorkOnRoot(root2, lanes, true);
}
function scheduleImmediateRootScheduleTask() {
  scheduleMicrotask(function() {
    (executionContext & 6) !== 0 ? scheduleCallback$3(ImmediatePriority, processRootScheduleInImmediateTask) : processRootScheduleInMicrotask();
  });
}
function requestTransitionLane() {
  if (currentEventTransitionLane === 0) {
    var actionScopeLane = currentEntangledLane;
    actionScopeLane === 0 && (actionScopeLane = nextTransitionUpdateLane, nextTransitionUpdateLane <<= 1, (nextTransitionUpdateLane & 261888) === 0 && (nextTransitionUpdateLane = 256));
    currentEventTransitionLane = actionScopeLane;
  }
  return currentEventTransitionLane;
}
function coerceFormActionProp(actionProp) {
  return actionProp == null || typeof actionProp === "symbol" || typeof actionProp === "boolean" ? null : typeof actionProp === "function" ? actionProp : sanitizeURL("" + actionProp);
}
function createFormDataWithSubmitter(form, submitter) {
  var temp = submitter.ownerDocument.createElement("input");
  temp.name = submitter.name;
  temp.value = submitter.value;
  form.id && temp.setAttribute("form", form.id);
  submitter.parentNode.insertBefore(temp, submitter);
  form = new FormData(form);
  temp.parentNode.removeChild(temp);
  return form;
}
function extractEvents$1(dispatchQueue, domEventName, maybeTargetInst, nativeEvent, nativeEventTarget) {
  if (domEventName === "submit" && maybeTargetInst && maybeTargetInst.stateNode === nativeEventTarget) {
    var action = coerceFormActionProp((nativeEventTarget[internalPropsKey] || null).action), submitter = nativeEvent.submitter;
    submitter && (domEventName = (domEventName = submitter[internalPropsKey] || null) ? coerceFormActionProp(domEventName.formAction) : submitter.getAttribute("formAction"), domEventName !== null && (action = domEventName, submitter = null));
    var event = new SyntheticEvent("action", "action", null, nativeEvent, nativeEventTarget);
    dispatchQueue.push({
      event,
      listeners: [
        {
          instance: null,
          listener: function() {
            if (nativeEvent.defaultPrevented) {
              if (currentEventTransitionLane !== 0) {
                var formData = submitter ? createFormDataWithSubmitter(nativeEventTarget, submitter) : new FormData(nativeEventTarget);
                startHostTransition(maybeTargetInst, {
                  pending: true,
                  data: formData,
                  method: nativeEventTarget.method,
                  action
                }, null, formData);
              }
            } else
              typeof action === "function" && (event.preventDefault(), formData = submitter ? createFormDataWithSubmitter(nativeEventTarget, submitter) : new FormData(nativeEventTarget), startHostTransition(maybeTargetInst, {
                pending: true,
                data: formData,
                method: nativeEventTarget.method,
                action
              }, action, formData));
          },
          currentTarget: nativeEventTarget
        }
      ]
    });
  }
}
function processDispatchQueue(dispatchQueue, eventSystemFlags) {
  eventSystemFlags = (eventSystemFlags & 4) !== 0;
  for (var i = 0;i < dispatchQueue.length; i++) {
    var _dispatchQueue$i = dispatchQueue[i], event = _dispatchQueue$i.event;
    _dispatchQueue$i = _dispatchQueue$i.listeners;
    a: {
      var previousInstance = undefined;
      if (eventSystemFlags)
        for (var i$jscomp$0 = _dispatchQueue$i.length - 1;0 <= i$jscomp$0; i$jscomp$0--) {
          var _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0], instance = _dispatchListeners$i.instance, currentTarget = _dispatchListeners$i.currentTarget;
          _dispatchListeners$i = _dispatchListeners$i.listener;
          if (instance !== previousInstance && event.isPropagationStopped())
            break a;
          previousInstance = _dispatchListeners$i;
          event.currentTarget = currentTarget;
          try {
            previousInstance(event);
          } catch (error) {
            reportGlobalError(error);
          }
          event.currentTarget = null;
          previousInstance = instance;
        }
      else
        for (i$jscomp$0 = 0;i$jscomp$0 < _dispatchQueue$i.length; i$jscomp$0++) {
          _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0];
          instance = _dispatchListeners$i.instance;
          currentTarget = _dispatchListeners$i.currentTarget;
          _dispatchListeners$i = _dispatchListeners$i.listener;
          if (instance !== previousInstance && event.isPropagationStopped())
            break a;
          previousInstance = _dispatchListeners$i;
          event.currentTarget = currentTarget;
          try {
            previousInstance(event);
          } catch (error) {
            reportGlobalError(error);
          }
          event.currentTarget = null;
          previousInstance = instance;
        }
    }
  }
}
function listenToNonDelegatedEvent(domEventName, targetElement) {
  var JSCompiler_inline_result = targetElement[internalEventHandlersKey];
  JSCompiler_inline_result === undefined && (JSCompiler_inline_result = targetElement[internalEventHandlersKey] = new Set);
  var listenerSetKey = domEventName + "__bubble";
  JSCompiler_inline_result.has(listenerSetKey) || (addTrappedEventListener(targetElement, domEventName, 2, false), JSCompiler_inline_result.add(listenerSetKey));
}
function listenToNativeEvent(domEventName, isCapturePhaseListener, target) {
  var eventSystemFlags = 0;
  isCapturePhaseListener && (eventSystemFlags |= 4);
  addTrappedEventListener(target, domEventName, eventSystemFlags, isCapturePhaseListener);
}
function listenToAllSupportedEvents(rootContainerElement) {
  if (!rootContainerElement[listeningMarker]) {
    rootContainerElement[listeningMarker] = true;
    allNativeEvents.forEach(function(domEventName) {
      domEventName !== "selectionchange" && (nonDelegatedEvents.has(domEventName) || listenToNativeEvent(domEventName, false, rootContainerElement), listenToNativeEvent(domEventName, true, rootContainerElement));
    });
    var ownerDocument = rootContainerElement.nodeType === 9 ? rootContainerElement : rootContainerElement.ownerDocument;
    ownerDocument === null || ownerDocument[listeningMarker] || (ownerDocument[listeningMarker] = true, listenToNativeEvent("selectionchange", false, ownerDocument));
  }
}
function addTrappedEventListener(targetContainer, domEventName, eventSystemFlags, isCapturePhaseListener) {
  switch (getEventPriority(domEventName)) {
    case 2:
      var listenerWrapper = dispatchDiscreteEvent;
      break;
    case 8:
      listenerWrapper = dispatchContinuousEvent;
      break;
    default:
      listenerWrapper = dispatchEvent;
  }
  eventSystemFlags = listenerWrapper.bind(null, domEventName, eventSystemFlags, targetContainer);
  listenerWrapper = undefined;
  !passiveBrowserEventsSupported || domEventName !== "touchstart" && domEventName !== "touchmove" && domEventName !== "wheel" || (listenerWrapper = true);
  isCapturePhaseListener ? listenerWrapper !== undefined ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
    capture: true,
    passive: listenerWrapper
  }) : targetContainer.addEventListener(domEventName, eventSystemFlags, true) : listenerWrapper !== undefined ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
    passive: listenerWrapper
  }) : targetContainer.addEventListener(domEventName, eventSystemFlags, false);
}
function dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, targetInst$jscomp$0, targetContainer) {
  var ancestorInst = targetInst$jscomp$0;
  if ((eventSystemFlags & 1) === 0 && (eventSystemFlags & 2) === 0 && targetInst$jscomp$0 !== null)
    a:
      for (;; ) {
        if (targetInst$jscomp$0 === null)
          return;
        var nodeTag = targetInst$jscomp$0.tag;
        if (nodeTag === 3 || nodeTag === 4) {
          var container = targetInst$jscomp$0.stateNode.containerInfo;
          if (container === targetContainer)
            break;
          if (nodeTag === 4)
            for (nodeTag = targetInst$jscomp$0.return;nodeTag !== null; ) {
              var grandTag = nodeTag.tag;
              if ((grandTag === 3 || grandTag === 4) && nodeTag.stateNode.containerInfo === targetContainer)
                return;
              nodeTag = nodeTag.return;
            }
          for (;container !== null; ) {
            nodeTag = getClosestInstanceFromNode(container);
            if (nodeTag === null)
              return;
            grandTag = nodeTag.tag;
            if (grandTag === 5 || grandTag === 6 || grandTag === 26 || grandTag === 27) {
              targetInst$jscomp$0 = ancestorInst = nodeTag;
              continue a;
            }
            container = container.parentNode;
          }
        }
        targetInst$jscomp$0 = targetInst$jscomp$0.return;
      }
  batchedUpdates$1(function() {
    var targetInst = ancestorInst, nativeEventTarget = getEventTarget(nativeEvent), dispatchQueue = [];
    a: {
      var reactName = topLevelEventsToReactNames.get(domEventName);
      if (reactName !== undefined) {
        var SyntheticEventCtor = SyntheticEvent, reactEventType = domEventName;
        switch (domEventName) {
          case "keypress":
            if (getEventCharCode(nativeEvent) === 0)
              break a;
          case "keydown":
          case "keyup":
            SyntheticEventCtor = SyntheticKeyboardEvent;
            break;
          case "focusin":
            reactEventType = "focus";
            SyntheticEventCtor = SyntheticFocusEvent;
            break;
          case "focusout":
            reactEventType = "blur";
            SyntheticEventCtor = SyntheticFocusEvent;
            break;
          case "beforeblur":
          case "afterblur":
            SyntheticEventCtor = SyntheticFocusEvent;
            break;
          case "click":
            if (nativeEvent.button === 2)
              break a;
          case "auxclick":
          case "dblclick":
          case "mousedown":
          case "mousemove":
          case "mouseup":
          case "mouseout":
          case "mouseover":
          case "contextmenu":
            SyntheticEventCtor = SyntheticMouseEvent;
            break;
          case "drag":
          case "dragend":
          case "dragenter":
          case "dragexit":
          case "dragleave":
          case "dragover":
          case "dragstart":
          case "drop":
            SyntheticEventCtor = SyntheticDragEvent;
            break;
          case "touchcancel":
          case "touchend":
          case "touchmove":
          case "touchstart":
            SyntheticEventCtor = SyntheticTouchEvent;
            break;
          case ANIMATION_END:
          case ANIMATION_ITERATION:
          case ANIMATION_START:
            SyntheticEventCtor = SyntheticAnimationEvent;
            break;
          case TRANSITION_END:
            SyntheticEventCtor = SyntheticTransitionEvent;
            break;
          case "scroll":
          case "scrollend":
            SyntheticEventCtor = SyntheticUIEvent;
            break;
          case "wheel":
            SyntheticEventCtor = SyntheticWheelEvent;
            break;
          case "copy":
          case "cut":
          case "paste":
            SyntheticEventCtor = SyntheticClipboardEvent;
            break;
          case "gotpointercapture":
          case "lostpointercapture":
          case "pointercancel":
          case "pointerdown":
          case "pointermove":
          case "pointerout":
          case "pointerover":
          case "pointerup":
            SyntheticEventCtor = SyntheticPointerEvent;
            break;
          case "toggle":
          case "beforetoggle":
            SyntheticEventCtor = SyntheticToggleEvent;
        }
        var inCapturePhase = (eventSystemFlags & 4) !== 0, accumulateTargetOnly = !inCapturePhase && (domEventName === "scroll" || domEventName === "scrollend"), reactEventName = inCapturePhase ? reactName !== null ? reactName + "Capture" : null : reactName;
        inCapturePhase = [];
        for (var instance = targetInst, lastHostComponent;instance !== null; ) {
          var _instance = instance;
          lastHostComponent = _instance.stateNode;
          _instance = _instance.tag;
          _instance !== 5 && _instance !== 26 && _instance !== 27 || lastHostComponent === null || reactEventName === null || (_instance = getListener(instance, reactEventName), _instance != null && inCapturePhase.push(createDispatchListener(instance, _instance, lastHostComponent)));
          if (accumulateTargetOnly)
            break;
          instance = instance.return;
        }
        0 < inCapturePhase.length && (reactName = new SyntheticEventCtor(reactName, reactEventType, null, nativeEvent, nativeEventTarget), dispatchQueue.push({ event: reactName, listeners: inCapturePhase }));
      }
    }
    if ((eventSystemFlags & 7) === 0) {
      a: {
        reactName = domEventName === "mouseover" || domEventName === "pointerover";
        SyntheticEventCtor = domEventName === "mouseout" || domEventName === "pointerout";
        if (reactName && nativeEvent !== currentReplayingEvent && (reactEventType = nativeEvent.relatedTarget || nativeEvent.fromElement) && (getClosestInstanceFromNode(reactEventType) || reactEventType[internalContainerInstanceKey]))
          break a;
        if (SyntheticEventCtor || reactName) {
          reactName = nativeEventTarget.window === nativeEventTarget ? nativeEventTarget : (reactName = nativeEventTarget.ownerDocument) ? reactName.defaultView || reactName.parentWindow : window;
          if (SyntheticEventCtor) {
            if (reactEventType = nativeEvent.relatedTarget || nativeEvent.toElement, SyntheticEventCtor = targetInst, reactEventType = reactEventType ? getClosestInstanceFromNode(reactEventType) : null, reactEventType !== null && (accumulateTargetOnly = getNearestMountedFiber(reactEventType), inCapturePhase = reactEventType.tag, reactEventType !== accumulateTargetOnly || inCapturePhase !== 5 && inCapturePhase !== 27 && inCapturePhase !== 6))
              reactEventType = null;
          } else
            SyntheticEventCtor = null, reactEventType = targetInst;
          if (SyntheticEventCtor !== reactEventType) {
            inCapturePhase = SyntheticMouseEvent;
            _instance = "onMouseLeave";
            reactEventName = "onMouseEnter";
            instance = "mouse";
            if (domEventName === "pointerout" || domEventName === "pointerover")
              inCapturePhase = SyntheticPointerEvent, _instance = "onPointerLeave", reactEventName = "onPointerEnter", instance = "pointer";
            accumulateTargetOnly = SyntheticEventCtor == null ? reactName : getNodeFromInstance(SyntheticEventCtor);
            lastHostComponent = reactEventType == null ? reactName : getNodeFromInstance(reactEventType);
            reactName = new inCapturePhase(_instance, instance + "leave", SyntheticEventCtor, nativeEvent, nativeEventTarget);
            reactName.target = accumulateTargetOnly;
            reactName.relatedTarget = lastHostComponent;
            _instance = null;
            getClosestInstanceFromNode(nativeEventTarget) === targetInst && (inCapturePhase = new inCapturePhase(reactEventName, instance + "enter", reactEventType, nativeEvent, nativeEventTarget), inCapturePhase.target = lastHostComponent, inCapturePhase.relatedTarget = accumulateTargetOnly, _instance = inCapturePhase);
            accumulateTargetOnly = _instance;
            if (SyntheticEventCtor && reactEventType)
              b: {
                inCapturePhase = getParent;
                reactEventName = SyntheticEventCtor;
                instance = reactEventType;
                lastHostComponent = 0;
                for (_instance = reactEventName;_instance; _instance = inCapturePhase(_instance))
                  lastHostComponent++;
                _instance = 0;
                for (var tempB = instance;tempB; tempB = inCapturePhase(tempB))
                  _instance++;
                for (;0 < lastHostComponent - _instance; )
                  reactEventName = inCapturePhase(reactEventName), lastHostComponent--;
                for (;0 < _instance - lastHostComponent; )
                  instance = inCapturePhase(instance), _instance--;
                for (;lastHostComponent--; ) {
                  if (reactEventName === instance || instance !== null && reactEventName === instance.alternate) {
                    inCapturePhase = reactEventName;
                    break b;
                  }
                  reactEventName = inCapturePhase(reactEventName);
                  instance = inCapturePhase(instance);
                }
                inCapturePhase = null;
              }
            else
              inCapturePhase = null;
            SyntheticEventCtor !== null && accumulateEnterLeaveListenersForEvent(dispatchQueue, reactName, SyntheticEventCtor, inCapturePhase, false);
            reactEventType !== null && accumulateTargetOnly !== null && accumulateEnterLeaveListenersForEvent(dispatchQueue, accumulateTargetOnly, reactEventType, inCapturePhase, true);
          }
        }
      }
      a: {
        reactName = targetInst ? getNodeFromInstance(targetInst) : window;
        SyntheticEventCtor = reactName.nodeName && reactName.nodeName.toLowerCase();
        if (SyntheticEventCtor === "select" || SyntheticEventCtor === "input" && reactName.type === "file")
          var getTargetInstFunc = getTargetInstForChangeEvent;
        else if (isTextInputElement(reactName))
          if (isInputEventSupported)
            getTargetInstFunc = getTargetInstForInputOrChangeEvent;
          else {
            getTargetInstFunc = getTargetInstForInputEventPolyfill;
            var handleEventFunc = handleEventsForInputEventPolyfill;
          }
        else
          SyntheticEventCtor = reactName.nodeName, !SyntheticEventCtor || SyntheticEventCtor.toLowerCase() !== "input" || reactName.type !== "checkbox" && reactName.type !== "radio" ? targetInst && isCustomElement(targetInst.elementType) && (getTargetInstFunc = getTargetInstForChangeEvent) : getTargetInstFunc = getTargetInstForClickEvent;
        if (getTargetInstFunc && (getTargetInstFunc = getTargetInstFunc(domEventName, targetInst))) {
          createAndAccumulateChangeEvent(dispatchQueue, getTargetInstFunc, nativeEvent, nativeEventTarget);
          break a;
        }
        handleEventFunc && handleEventFunc(domEventName, reactName, targetInst);
        domEventName === "focusout" && targetInst && reactName.type === "number" && targetInst.memoizedProps.value != null && setDefaultValue(reactName, "number", reactName.value);
      }
      handleEventFunc = targetInst ? getNodeFromInstance(targetInst) : window;
      switch (domEventName) {
        case "focusin":
          if (isTextInputElement(handleEventFunc) || handleEventFunc.contentEditable === "true")
            activeElement = handleEventFunc, activeElementInst = targetInst, lastSelection = null;
          break;
        case "focusout":
          lastSelection = activeElementInst = activeElement = null;
          break;
        case "mousedown":
          mouseDown = true;
          break;
        case "contextmenu":
        case "mouseup":
        case "dragend":
          mouseDown = false;
          constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
          break;
        case "selectionchange":
          if (skipSelectionChangeEvent)
            break;
        case "keydown":
        case "keyup":
          constructSelectEvent(dispatchQueue, nativeEvent, nativeEventTarget);
      }
      var fallbackData;
      if (canUseCompositionEvent)
        b: {
          switch (domEventName) {
            case "compositionstart":
              var eventType = "onCompositionStart";
              break b;
            case "compositionend":
              eventType = "onCompositionEnd";
              break b;
            case "compositionupdate":
              eventType = "onCompositionUpdate";
              break b;
          }
          eventType = undefined;
        }
      else
        isComposing ? isFallbackCompositionEnd(domEventName, nativeEvent) && (eventType = "onCompositionEnd") : domEventName === "keydown" && nativeEvent.keyCode === 229 && (eventType = "onCompositionStart");
      eventType && (useFallbackCompositionData && nativeEvent.locale !== "ko" && (isComposing || eventType !== "onCompositionStart" ? eventType === "onCompositionEnd" && isComposing && (fallbackData = getData()) : (root = nativeEventTarget, startText = ("value" in root) ? root.value : root.textContent, isComposing = true)), handleEventFunc = accumulateTwoPhaseListeners(targetInst, eventType), 0 < handleEventFunc.length && (eventType = new SyntheticCompositionEvent(eventType, domEventName, null, nativeEvent, nativeEventTarget), dispatchQueue.push({ event: eventType, listeners: handleEventFunc }), fallbackData ? eventType.data = fallbackData : (fallbackData = getDataFromCustomEvent(nativeEvent), fallbackData !== null && (eventType.data = fallbackData))));
      if (fallbackData = canUseTextInputEvent ? getNativeBeforeInputChars(domEventName, nativeEvent) : getFallbackBeforeInputChars(domEventName, nativeEvent))
        eventType = accumulateTwoPhaseListeners(targetInst, "onBeforeInput"), 0 < eventType.length && (handleEventFunc = new SyntheticCompositionEvent("onBeforeInput", "beforeinput", null, nativeEvent, nativeEventTarget), dispatchQueue.push({
          event: handleEventFunc,
          listeners: eventType
        }), handleEventFunc.data = fallbackData);
      extractEvents$1(dispatchQueue, domEventName, targetInst, nativeEvent, nativeEventTarget);
    }
    processDispatchQueue(dispatchQueue, eventSystemFlags);
  });
}
function createDispatchListener(instance, listener, currentTarget) {
  return {
    instance,
    listener,
    currentTarget
  };
}
function accumulateTwoPhaseListeners(targetFiber, reactName) {
  for (var captureName = reactName + "Capture", listeners = [];targetFiber !== null; ) {
    var _instance2 = targetFiber, stateNode = _instance2.stateNode;
    _instance2 = _instance2.tag;
    _instance2 !== 5 && _instance2 !== 26 && _instance2 !== 27 || stateNode === null || (_instance2 = getListener(targetFiber, captureName), _instance2 != null && listeners.unshift(createDispatchListener(targetFiber, _instance2, stateNode)), _instance2 = getListener(targetFiber, reactName), _instance2 != null && listeners.push(createDispatchListener(targetFiber, _instance2, stateNode)));
    if (targetFiber.tag === 3)
      return listeners;
    targetFiber = targetFiber.return;
  }
  return [];
}
function getParent(inst) {
  if (inst === null)
    return null;
  do
    inst = inst.return;
  while (inst && inst.tag !== 5 && inst.tag !== 27);
  return inst ? inst : null;
}
function accumulateEnterLeaveListenersForEvent(dispatchQueue, event, target, common, inCapturePhase) {
  for (var registrationName = event._reactName, listeners = [];target !== null && target !== common; ) {
    var _instance3 = target, alternate = _instance3.alternate, stateNode = _instance3.stateNode;
    _instance3 = _instance3.tag;
    if (alternate !== null && alternate === common)
      break;
    _instance3 !== 5 && _instance3 !== 26 && _instance3 !== 27 || stateNode === null || (alternate = stateNode, inCapturePhase ? (stateNode = getListener(target, registrationName), stateNode != null && listeners.unshift(createDispatchListener(target, stateNode, alternate))) : inCapturePhase || (stateNode = getListener(target, registrationName), stateNode != null && listeners.push(createDispatchListener(target, stateNode, alternate))));
    target = target.return;
  }
  listeners.length !== 0 && dispatchQueue.push({ event, listeners });
}
function normalizeMarkupForTextOrAttribute(markup) {
  return (typeof markup === "string" ? markup : "" + markup).replace(NORMALIZE_NEWLINES_REGEX, `
`).replace(NORMALIZE_NULL_AND_REPLACEMENT_REGEX, "");
}
function checkForUnmatchedText(serverText, clientText) {
  clientText = normalizeMarkupForTextOrAttribute(clientText);
  return normalizeMarkupForTextOrAttribute(serverText) === clientText ? true : false;
}
function setProp(domElement, tag, key, value, props, prevValue) {
  switch (key) {
    case "children":
      typeof value === "string" ? tag === "body" || tag === "textarea" && value === "" || setTextContent(domElement, value) : (typeof value === "number" || typeof value === "bigint") && tag !== "body" && setTextContent(domElement, "" + value);
      break;
    case "className":
      setValueForKnownAttribute(domElement, "class", value);
      break;
    case "tabIndex":
      setValueForKnownAttribute(domElement, "tabindex", value);
      break;
    case "dir":
    case "role":
    case "viewBox":
    case "width":
    case "height":
      setValueForKnownAttribute(domElement, key, value);
      break;
    case "style":
      setValueForStyles(domElement, value, prevValue);
      break;
    case "data":
      if (tag !== "object") {
        setValueForKnownAttribute(domElement, "data", value);
        break;
      }
    case "src":
    case "href":
      if (value === "" && (tag !== "a" || key !== "href")) {
        domElement.removeAttribute(key);
        break;
      }
      if (value == null || typeof value === "function" || typeof value === "symbol" || typeof value === "boolean") {
        domElement.removeAttribute(key);
        break;
      }
      value = sanitizeURL("" + value);
      domElement.setAttribute(key, value);
      break;
    case "action":
    case "formAction":
      if (typeof value === "function") {
        domElement.setAttribute(key, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
        break;
      } else
        typeof prevValue === "function" && (key === "formAction" ? (tag !== "input" && setProp(domElement, tag, "name", props.name, props, null), setProp(domElement, tag, "formEncType", props.formEncType, props, null), setProp(domElement, tag, "formMethod", props.formMethod, props, null), setProp(domElement, tag, "formTarget", props.formTarget, props, null)) : (setProp(domElement, tag, "encType", props.encType, props, null), setProp(domElement, tag, "method", props.method, props, null), setProp(domElement, tag, "target", props.target, props, null)));
      if (value == null || typeof value === "symbol" || typeof value === "boolean") {
        domElement.removeAttribute(key);
        break;
      }
      value = sanitizeURL("" + value);
      domElement.setAttribute(key, value);
      break;
    case "onClick":
      value != null && (domElement.onclick = noop$1);
      break;
    case "onScroll":
      value != null && listenToNonDelegatedEvent("scroll", domElement);
      break;
    case "onScrollEnd":
      value != null && listenToNonDelegatedEvent("scrollend", domElement);
      break;
    case "dangerouslySetInnerHTML":
      if (value != null) {
        if (typeof value !== "object" || !("__html" in value))
          throw Error(formatProdErrorMessage(61));
        key = value.__html;
        if (key != null) {
          if (props.children != null)
            throw Error(formatProdErrorMessage(60));
          domElement.innerHTML = key;
        }
      }
      break;
    case "multiple":
      domElement.multiple = value && typeof value !== "function" && typeof value !== "symbol";
      break;
    case "muted":
      domElement.muted = value && typeof value !== "function" && typeof value !== "symbol";
      break;
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
    case "defaultValue":
    case "defaultChecked":
    case "innerHTML":
    case "ref":
      break;
    case "autoFocus":
      break;
    case "xlinkHref":
      if (value == null || typeof value === "function" || typeof value === "boolean" || typeof value === "symbol") {
        domElement.removeAttribute("xlink:href");
        break;
      }
      key = sanitizeURL("" + value);
      domElement.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", key);
      break;
    case "contentEditable":
    case "spellCheck":
    case "draggable":
    case "value":
    case "autoReverse":
    case "externalResourcesRequired":
    case "focusable":
    case "preserveAlpha":
      value != null && typeof value !== "function" && typeof value !== "symbol" ? domElement.setAttribute(key, "" + value) : domElement.removeAttribute(key);
      break;
    case "inert":
    case "allowFullScreen":
    case "async":
    case "autoPlay":
    case "controls":
    case "default":
    case "defer":
    case "disabled":
    case "disablePictureInPicture":
    case "disableRemotePlayback":
    case "formNoValidate":
    case "hidden":
    case "loop":
    case "noModule":
    case "noValidate":
    case "open":
    case "playsInline":
    case "readOnly":
    case "required":
    case "reversed":
    case "scoped":
    case "seamless":
    case "itemScope":
      value && typeof value !== "function" && typeof value !== "symbol" ? domElement.setAttribute(key, "") : domElement.removeAttribute(key);
      break;
    case "capture":
    case "download":
      value === true ? domElement.setAttribute(key, "") : value !== false && value != null && typeof value !== "function" && typeof value !== "symbol" ? domElement.setAttribute(key, value) : domElement.removeAttribute(key);
      break;
    case "cols":
    case "rows":
    case "size":
    case "span":
      value != null && typeof value !== "function" && typeof value !== "symbol" && !isNaN(value) && 1 <= value ? domElement.setAttribute(key, value) : domElement.removeAttribute(key);
      break;
    case "rowSpan":
    case "start":
      value == null || typeof value === "function" || typeof value === "symbol" || isNaN(value) ? domElement.removeAttribute(key) : domElement.setAttribute(key, value);
      break;
    case "popover":
      listenToNonDelegatedEvent("beforetoggle", domElement);
      listenToNonDelegatedEvent("toggle", domElement);
      setValueForAttribute(domElement, "popover", value);
      break;
    case "xlinkActuate":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/1999/xlink", "xlink:actuate", value);
      break;
    case "xlinkArcrole":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/1999/xlink", "xlink:arcrole", value);
      break;
    case "xlinkRole":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/1999/xlink", "xlink:role", value);
      break;
    case "xlinkShow":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/1999/xlink", "xlink:show", value);
      break;
    case "xlinkTitle":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/1999/xlink", "xlink:title", value);
      break;
    case "xlinkType":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/1999/xlink", "xlink:type", value);
      break;
    case "xmlBase":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/XML/1998/namespace", "xml:base", value);
      break;
    case "xmlLang":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/XML/1998/namespace", "xml:lang", value);
      break;
    case "xmlSpace":
      setValueForNamespacedAttribute(domElement, "http://www.w3.org/XML/1998/namespace", "xml:space", value);
      break;
    case "is":
      setValueForAttribute(domElement, "is", value);
      break;
    case "innerText":
    case "textContent":
      break;
    default:
      if (!(2 < key.length) || key[0] !== "o" && key[0] !== "O" || key[1] !== "n" && key[1] !== "N")
        key = aliases.get(key) || key, setValueForAttribute(domElement, key, value);
  }
}
function setPropOnCustomElement(domElement, tag, key, value, props, prevValue) {
  switch (key) {
    case "style":
      setValueForStyles(domElement, value, prevValue);
      break;
    case "dangerouslySetInnerHTML":
      if (value != null) {
        if (typeof value !== "object" || !("__html" in value))
          throw Error(formatProdErrorMessage(61));
        key = value.__html;
        if (key != null) {
          if (props.children != null)
            throw Error(formatProdErrorMessage(60));
          domElement.innerHTML = key;
        }
      }
      break;
    case "children":
      typeof value === "string" ? setTextContent(domElement, value) : (typeof value === "number" || typeof value === "bigint") && setTextContent(domElement, "" + value);
      break;
    case "onScroll":
      value != null && listenToNonDelegatedEvent("scroll", domElement);
      break;
    case "onScrollEnd":
      value != null && listenToNonDelegatedEvent("scrollend", domElement);
      break;
    case "onClick":
      value != null && (domElement.onclick = noop$1);
      break;
    case "suppressContentEditableWarning":
    case "suppressHydrationWarning":
    case "innerHTML":
    case "ref":
      break;
    case "innerText":
    case "textContent":
      break;
    default:
      if (!registrationNameDependencies.hasOwnProperty(key))
        a: {
          if (key[0] === "o" && key[1] === "n" && (props = key.endsWith("Capture"), tag = key.slice(2, props ? key.length - 7 : undefined), prevValue = domElement[internalPropsKey] || null, prevValue = prevValue != null ? prevValue[key] : null, typeof prevValue === "function" && domElement.removeEventListener(tag, prevValue, props), typeof value === "function")) {
            typeof prevValue !== "function" && prevValue !== null && (key in domElement ? domElement[key] = null : domElement.hasAttribute(key) && domElement.removeAttribute(key));
            domElement.addEventListener(tag, value, props);
            break a;
          }
          key in domElement ? domElement[key] = value : value === true ? domElement.setAttribute(key, "") : setValueForAttribute(domElement, key, value);
        }
  }
}
function setInitialProperties(domElement, tag, props) {
  switch (tag) {
    case "div":
    case "span":
    case "svg":
    case "path":
    case "a":
    case "g":
    case "p":
    case "li":
      break;
    case "img":
      listenToNonDelegatedEvent("error", domElement);
      listenToNonDelegatedEvent("load", domElement);
      var hasSrc = false, hasSrcSet = false, propKey;
      for (propKey in props)
        if (props.hasOwnProperty(propKey)) {
          var propValue = props[propKey];
          if (propValue != null)
            switch (propKey) {
              case "src":
                hasSrc = true;
                break;
              case "srcSet":
                hasSrcSet = true;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                throw Error(formatProdErrorMessage(137, tag));
              default:
                setProp(domElement, tag, propKey, propValue, props, null);
            }
        }
      hasSrcSet && setProp(domElement, tag, "srcSet", props.srcSet, props, null);
      hasSrc && setProp(domElement, tag, "src", props.src, props, null);
      return;
    case "input":
      listenToNonDelegatedEvent("invalid", domElement);
      var defaultValue = propKey = propValue = hasSrcSet = null, checked = null, defaultChecked = null;
      for (hasSrc in props)
        if (props.hasOwnProperty(hasSrc)) {
          var propValue$184 = props[hasSrc];
          if (propValue$184 != null)
            switch (hasSrc) {
              case "name":
                hasSrcSet = propValue$184;
                break;
              case "type":
                propValue = propValue$184;
                break;
              case "checked":
                checked = propValue$184;
                break;
              case "defaultChecked":
                defaultChecked = propValue$184;
                break;
              case "value":
                propKey = propValue$184;
                break;
              case "defaultValue":
                defaultValue = propValue$184;
                break;
              case "children":
              case "dangerouslySetInnerHTML":
                if (propValue$184 != null)
                  throw Error(formatProdErrorMessage(137, tag));
                break;
              default:
                setProp(domElement, tag, hasSrc, propValue$184, props, null);
            }
        }
      initInput(domElement, propKey, defaultValue, checked, defaultChecked, propValue, hasSrcSet, false);
      return;
    case "select":
      listenToNonDelegatedEvent("invalid", domElement);
      hasSrc = propValue = propKey = null;
      for (hasSrcSet in props)
        if (props.hasOwnProperty(hasSrcSet) && (defaultValue = props[hasSrcSet], defaultValue != null))
          switch (hasSrcSet) {
            case "value":
              propKey = defaultValue;
              break;
            case "defaultValue":
              propValue = defaultValue;
              break;
            case "multiple":
              hasSrc = defaultValue;
            default:
              setProp(domElement, tag, hasSrcSet, defaultValue, props, null);
          }
      tag = propKey;
      props = propValue;
      domElement.multiple = !!hasSrc;
      tag != null ? updateOptions(domElement, !!hasSrc, tag, false) : props != null && updateOptions(domElement, !!hasSrc, props, true);
      return;
    case "textarea":
      listenToNonDelegatedEvent("invalid", domElement);
      propKey = hasSrcSet = hasSrc = null;
      for (propValue in props)
        if (props.hasOwnProperty(propValue) && (defaultValue = props[propValue], defaultValue != null))
          switch (propValue) {
            case "value":
              hasSrc = defaultValue;
              break;
            case "defaultValue":
              hasSrcSet = defaultValue;
              break;
            case "children":
              propKey = defaultValue;
              break;
            case "dangerouslySetInnerHTML":
              if (defaultValue != null)
                throw Error(formatProdErrorMessage(91));
              break;
            default:
              setProp(domElement, tag, propValue, defaultValue, props, null);
          }
      initTextarea(domElement, hasSrc, hasSrcSet, propKey);
      return;
    case "option":
      for (checked in props)
        if (props.hasOwnProperty(checked) && (hasSrc = props[checked], hasSrc != null))
          switch (checked) {
            case "selected":
              domElement.selected = hasSrc && typeof hasSrc !== "function" && typeof hasSrc !== "symbol";
              break;
            default:
              setProp(domElement, tag, checked, hasSrc, props, null);
          }
      return;
    case "dialog":
      listenToNonDelegatedEvent("beforetoggle", domElement);
      listenToNonDelegatedEvent("toggle", domElement);
      listenToNonDelegatedEvent("cancel", domElement);
      listenToNonDelegatedEvent("close", domElement);
      break;
    case "iframe":
    case "object":
      listenToNonDelegatedEvent("load", domElement);
      break;
    case "video":
    case "audio":
      for (hasSrc = 0;hasSrc < mediaEventTypes.length; hasSrc++)
        listenToNonDelegatedEvent(mediaEventTypes[hasSrc], domElement);
      break;
    case "image":
      listenToNonDelegatedEvent("error", domElement);
      listenToNonDelegatedEvent("load", domElement);
      break;
    case "details":
      listenToNonDelegatedEvent("toggle", domElement);
      break;
    case "embed":
    case "source":
    case "link":
      listenToNonDelegatedEvent("error", domElement), listenToNonDelegatedEvent("load", domElement);
    case "area":
    case "base":
    case "br":
    case "col":
    case "hr":
    case "keygen":
    case "meta":
    case "param":
    case "track":
    case "wbr":
    case "menuitem":
      for (defaultChecked in props)
        if (props.hasOwnProperty(defaultChecked) && (hasSrc = props[defaultChecked], hasSrc != null))
          switch (defaultChecked) {
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(formatProdErrorMessage(137, tag));
            default:
              setProp(domElement, tag, defaultChecked, hasSrc, props, null);
          }
      return;
    default:
      if (isCustomElement(tag)) {
        for (propValue$184 in props)
          props.hasOwnProperty(propValue$184) && (hasSrc = props[propValue$184], hasSrc !== undefined && setPropOnCustomElement(domElement, tag, propValue$184, hasSrc, props, undefined));
        return;
      }
  }
  for (defaultValue in props)
    props.hasOwnProperty(defaultValue) && (hasSrc = props[defaultValue], hasSrc != null && setProp(domElement, tag, defaultValue, hasSrc, props, null));
}
function updateProperties(domElement, tag, lastProps, nextProps) {
  switch (tag) {
    case "div":
    case "span":
    case "svg":
    case "path":
    case "a":
    case "g":
    case "p":
    case "li":
      break;
    case "input":
      var name = null, type = null, value = null, defaultValue = null, lastDefaultValue = null, checked = null, defaultChecked = null;
      for (propKey in lastProps) {
        var lastProp = lastProps[propKey];
        if (lastProps.hasOwnProperty(propKey) && lastProp != null)
          switch (propKey) {
            case "checked":
              break;
            case "value":
              break;
            case "defaultValue":
              lastDefaultValue = lastProp;
            default:
              nextProps.hasOwnProperty(propKey) || setProp(domElement, tag, propKey, null, nextProps, lastProp);
          }
      }
      for (var propKey$201 in nextProps) {
        var propKey = nextProps[propKey$201];
        lastProp = lastProps[propKey$201];
        if (nextProps.hasOwnProperty(propKey$201) && (propKey != null || lastProp != null))
          switch (propKey$201) {
            case "type":
              type = propKey;
              break;
            case "name":
              name = propKey;
              break;
            case "checked":
              checked = propKey;
              break;
            case "defaultChecked":
              defaultChecked = propKey;
              break;
            case "value":
              value = propKey;
              break;
            case "defaultValue":
              defaultValue = propKey;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (propKey != null)
                throw Error(formatProdErrorMessage(137, tag));
              break;
            default:
              propKey !== lastProp && setProp(domElement, tag, propKey$201, propKey, nextProps, lastProp);
          }
      }
      updateInput(domElement, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name);
      return;
    case "select":
      propKey = value = defaultValue = propKey$201 = null;
      for (type in lastProps)
        if (lastDefaultValue = lastProps[type], lastProps.hasOwnProperty(type) && lastDefaultValue != null)
          switch (type) {
            case "value":
              break;
            case "multiple":
              propKey = lastDefaultValue;
            default:
              nextProps.hasOwnProperty(type) || setProp(domElement, tag, type, null, nextProps, lastDefaultValue);
          }
      for (name in nextProps)
        if (type = nextProps[name], lastDefaultValue = lastProps[name], nextProps.hasOwnProperty(name) && (type != null || lastDefaultValue != null))
          switch (name) {
            case "value":
              propKey$201 = type;
              break;
            case "defaultValue":
              defaultValue = type;
              break;
            case "multiple":
              value = type;
            default:
              type !== lastDefaultValue && setProp(domElement, tag, name, type, nextProps, lastDefaultValue);
          }
      tag = defaultValue;
      lastProps = value;
      nextProps = propKey;
      propKey$201 != null ? updateOptions(domElement, !!lastProps, propKey$201, false) : !!nextProps !== !!lastProps && (tag != null ? updateOptions(domElement, !!lastProps, tag, true) : updateOptions(domElement, !!lastProps, lastProps ? [] : "", false));
      return;
    case "textarea":
      propKey = propKey$201 = null;
      for (defaultValue in lastProps)
        if (name = lastProps[defaultValue], lastProps.hasOwnProperty(defaultValue) && name != null && !nextProps.hasOwnProperty(defaultValue))
          switch (defaultValue) {
            case "value":
              break;
            case "children":
              break;
            default:
              setProp(domElement, tag, defaultValue, null, nextProps, name);
          }
      for (value in nextProps)
        if (name = nextProps[value], type = lastProps[value], nextProps.hasOwnProperty(value) && (name != null || type != null))
          switch (value) {
            case "value":
              propKey$201 = name;
              break;
            case "defaultValue":
              propKey = name;
              break;
            case "children":
              break;
            case "dangerouslySetInnerHTML":
              if (name != null)
                throw Error(formatProdErrorMessage(91));
              break;
            default:
              name !== type && setProp(domElement, tag, value, name, nextProps, type);
          }
      updateTextarea(domElement, propKey$201, propKey);
      return;
    case "option":
      for (var propKey$217 in lastProps)
        if (propKey$201 = lastProps[propKey$217], lastProps.hasOwnProperty(propKey$217) && propKey$201 != null && !nextProps.hasOwnProperty(propKey$217))
          switch (propKey$217) {
            case "selected":
              domElement.selected = false;
              break;
            default:
              setProp(domElement, tag, propKey$217, null, nextProps, propKey$201);
          }
      for (lastDefaultValue in nextProps)
        if (propKey$201 = nextProps[lastDefaultValue], propKey = lastProps[lastDefaultValue], nextProps.hasOwnProperty(lastDefaultValue) && propKey$201 !== propKey && (propKey$201 != null || propKey != null))
          switch (lastDefaultValue) {
            case "selected":
              domElement.selected = propKey$201 && typeof propKey$201 !== "function" && typeof propKey$201 !== "symbol";
              break;
            default:
              setProp(domElement, tag, lastDefaultValue, propKey$201, nextProps, propKey);
          }
      return;
    case "img":
    case "link":
    case "area":
    case "base":
    case "br":
    case "col":
    case "embed":
    case "hr":
    case "keygen":
    case "meta":
    case "param":
    case "source":
    case "track":
    case "wbr":
    case "menuitem":
      for (var propKey$222 in lastProps)
        propKey$201 = lastProps[propKey$222], lastProps.hasOwnProperty(propKey$222) && propKey$201 != null && !nextProps.hasOwnProperty(propKey$222) && setProp(domElement, tag, propKey$222, null, nextProps, propKey$201);
      for (checked in nextProps)
        if (propKey$201 = nextProps[checked], propKey = lastProps[checked], nextProps.hasOwnProperty(checked) && propKey$201 !== propKey && (propKey$201 != null || propKey != null))
          switch (checked) {
            case "children":
            case "dangerouslySetInnerHTML":
              if (propKey$201 != null)
                throw Error(formatProdErrorMessage(137, tag));
              break;
            default:
              setProp(domElement, tag, checked, propKey$201, nextProps, propKey);
          }
      return;
    default:
      if (isCustomElement(tag)) {
        for (var propKey$227 in lastProps)
          propKey$201 = lastProps[propKey$227], lastProps.hasOwnProperty(propKey$227) && propKey$201 !== undefined && !nextProps.hasOwnProperty(propKey$227) && setPropOnCustomElement(domElement, tag, propKey$227, undefined, nextProps, propKey$201);
        for (defaultChecked in nextProps)
          propKey$201 = nextProps[defaultChecked], propKey = lastProps[defaultChecked], !nextProps.hasOwnProperty(defaultChecked) || propKey$201 === propKey || propKey$201 === undefined && propKey === undefined || setPropOnCustomElement(domElement, tag, defaultChecked, propKey$201, nextProps, propKey);
        return;
      }
  }
  for (var propKey$232 in lastProps)
    propKey$201 = lastProps[propKey$232], lastProps.hasOwnProperty(propKey$232) && propKey$201 != null && !nextProps.hasOwnProperty(propKey$232) && setProp(domElement, tag, propKey$232, null, nextProps, propKey$201);
  for (lastProp in nextProps)
    propKey$201 = nextProps[lastProp], propKey = lastProps[lastProp], !nextProps.hasOwnProperty(lastProp) || propKey$201 === propKey || propKey$201 == null && propKey == null || setProp(domElement, tag, lastProp, propKey$201, nextProps, propKey);
}
function isLikelyStaticResource(initiatorType) {
  switch (initiatorType) {
    case "css":
    case "script":
    case "font":
    case "img":
    case "image":
    case "input":
    case "link":
      return true;
    default:
      return false;
  }
}
function estimateBandwidth() {
  if (typeof performance.getEntriesByType === "function") {
    for (var count = 0, bits = 0, resourceEntries = performance.getEntriesByType("resource"), i = 0;i < resourceEntries.length; i++) {
      var entry = resourceEntries[i], transferSize = entry.transferSize, initiatorType = entry.initiatorType, duration = entry.duration;
      if (transferSize && duration && isLikelyStaticResource(initiatorType)) {
        initiatorType = 0;
        duration = entry.responseEnd;
        for (i += 1;i < resourceEntries.length; i++) {
          var overlapEntry = resourceEntries[i], overlapStartTime = overlapEntry.startTime;
          if (overlapStartTime > duration)
            break;
          var { transferSize: overlapTransferSize, initiatorType: overlapInitiatorType } = overlapEntry;
          overlapTransferSize && isLikelyStaticResource(overlapInitiatorType) && (overlapEntry = overlapEntry.responseEnd, initiatorType += overlapTransferSize * (overlapEntry < duration ? 1 : (duration - overlapStartTime) / (overlapEntry - overlapStartTime)));
        }
        --i;
        bits += 8 * (transferSize + initiatorType) / (entry.duration / 1000);
        count++;
        if (10 < count)
          break;
      }
    }
    if (0 < count)
      return bits / count / 1e6;
  }
  return navigator.connection && (count = navigator.connection.downlink, typeof count === "number") ? count : 5;
}
function getOwnerDocumentFromRootContainer(rootContainerElement) {
  return rootContainerElement.nodeType === 9 ? rootContainerElement : rootContainerElement.ownerDocument;
}
function getOwnHostContext(namespaceURI) {
  switch (namespaceURI) {
    case "http://www.w3.org/2000/svg":
      return 1;
    case "http://www.w3.org/1998/Math/MathML":
      return 2;
    default:
      return 0;
  }
}
function getChildHostContextProd(parentNamespace, type) {
  if (parentNamespace === 0)
    switch (type) {
      case "svg":
        return 1;
      case "math":
        return 2;
      default:
        return 0;
    }
  return parentNamespace === 1 && type === "foreignObject" ? 0 : parentNamespace;
}
function shouldSetTextContent(type, props) {
  return type === "textarea" || type === "noscript" || typeof props.children === "string" || typeof props.children === "number" || typeof props.children === "bigint" || typeof props.dangerouslySetInnerHTML === "object" && props.dangerouslySetInnerHTML !== null && props.dangerouslySetInnerHTML.__html != null;
}
function shouldAttemptEagerTransition() {
  var event = window.event;
  if (event && event.type === "popstate") {
    if (event === currentPopstateTransitionEvent)
      return false;
    currentPopstateTransitionEvent = event;
    return true;
  }
  currentPopstateTransitionEvent = null;
  return false;
}
function handleErrorInNextTick(error) {
  setTimeout(function() {
    throw error;
  });
}
function isSingletonScope(type) {
  return type === "head";
}
function clearHydrationBoundary(parentInstance, hydrationInstance) {
  var node = hydrationInstance, depth = 0;
  do {
    var nextNode = node.nextSibling;
    parentInstance.removeChild(node);
    if (nextNode && nextNode.nodeType === 8)
      if (node = nextNode.data, node === "/$" || node === "/&") {
        if (depth === 0) {
          parentInstance.removeChild(nextNode);
          retryIfBlockedOn(hydrationInstance);
          return;
        }
        depth--;
      } else if (node === "$" || node === "$?" || node === "$~" || node === "$!" || node === "&")
        depth++;
      else if (node === "html")
        releaseSingletonInstance(parentInstance.ownerDocument.documentElement);
      else if (node === "head") {
        node = parentInstance.ownerDocument.head;
        releaseSingletonInstance(node);
        for (var node$jscomp$0 = node.firstChild;node$jscomp$0; ) {
          var { nextSibling: nextNode$jscomp$0, nodeName } = node$jscomp$0;
          node$jscomp$0[internalHoistableMarker] || nodeName === "SCRIPT" || nodeName === "STYLE" || nodeName === "LINK" && node$jscomp$0.rel.toLowerCase() === "stylesheet" || node.removeChild(node$jscomp$0);
          node$jscomp$0 = nextNode$jscomp$0;
        }
      } else
        node === "body" && releaseSingletonInstance(parentInstance.ownerDocument.body);
    node = nextNode;
  } while (node);
  retryIfBlockedOn(hydrationInstance);
}
function hideOrUnhideDehydratedBoundary(suspenseInstance, isHidden) {
  var node = suspenseInstance;
  suspenseInstance = 0;
  do {
    var nextNode = node.nextSibling;
    node.nodeType === 1 ? isHidden ? (node._stashedDisplay = node.style.display, node.style.display = "none") : (node.style.display = node._stashedDisplay || "", node.getAttribute("style") === "" && node.removeAttribute("style")) : node.nodeType === 3 && (isHidden ? (node._stashedText = node.nodeValue, node.nodeValue = "") : node.nodeValue = node._stashedText || "");
    if (nextNode && nextNode.nodeType === 8)
      if (node = nextNode.data, node === "/$")
        if (suspenseInstance === 0)
          break;
        else
          suspenseInstance--;
      else
        node !== "$" && node !== "$?" && node !== "$~" && node !== "$!" || suspenseInstance++;
    node = nextNode;
  } while (node);
}
function clearContainerSparingly(container) {
  var nextNode = container.firstChild;
  nextNode && nextNode.nodeType === 10 && (nextNode = nextNode.nextSibling);
  for (;nextNode; ) {
    var node = nextNode;
    nextNode = nextNode.nextSibling;
    switch (node.nodeName) {
      case "HTML":
      case "HEAD":
      case "BODY":
        clearContainerSparingly(node);
        detachDeletedInstance(node);
        continue;
      case "SCRIPT":
      case "STYLE":
        continue;
      case "LINK":
        if (node.rel.toLowerCase() === "stylesheet")
          continue;
    }
    container.removeChild(node);
  }
}
function canHydrateInstance(instance, type, props, inRootOrSingleton) {
  for (;instance.nodeType === 1; ) {
    var anyProps = props;
    if (instance.nodeName.toLowerCase() !== type.toLowerCase()) {
      if (!inRootOrSingleton && (instance.nodeName !== "INPUT" || instance.type !== "hidden"))
        break;
    } else if (!inRootOrSingleton)
      if (type === "input" && instance.type === "hidden") {
        var name = anyProps.name == null ? null : "" + anyProps.name;
        if (anyProps.type === "hidden" && instance.getAttribute("name") === name)
          return instance;
      } else
        return instance;
    else if (!instance[internalHoistableMarker])
      switch (type) {
        case "meta":
          if (!instance.hasAttribute("itemprop"))
            break;
          return instance;
        case "link":
          name = instance.getAttribute("rel");
          if (name === "stylesheet" && instance.hasAttribute("data-precedence"))
            break;
          else if (name !== anyProps.rel || instance.getAttribute("href") !== (anyProps.href == null || anyProps.href === "" ? null : anyProps.href) || instance.getAttribute("crossorigin") !== (anyProps.crossOrigin == null ? null : anyProps.crossOrigin) || instance.getAttribute("title") !== (anyProps.title == null ? null : anyProps.title))
            break;
          return instance;
        case "style":
          if (instance.hasAttribute("data-precedence"))
            break;
          return instance;
        case "script":
          name = instance.getAttribute("src");
          if ((name !== (anyProps.src == null ? null : anyProps.src) || instance.getAttribute("type") !== (anyProps.type == null ? null : anyProps.type) || instance.getAttribute("crossorigin") !== (anyProps.crossOrigin == null ? null : anyProps.crossOrigin)) && name && instance.hasAttribute("async") && !instance.hasAttribute("itemprop"))
            break;
          return instance;
        default:
          return instance;
      }
    instance = getNextHydratable(instance.nextSibling);
    if (instance === null)
      break;
  }
  return null;
}
function canHydrateTextInstance(instance, text, inRootOrSingleton) {
  if (text === "")
    return null;
  for (;instance.nodeType !== 3; ) {
    if ((instance.nodeType !== 1 || instance.nodeName !== "INPUT" || instance.type !== "hidden") && !inRootOrSingleton)
      return null;
    instance = getNextHydratable(instance.nextSibling);
    if (instance === null)
      return null;
  }
  return instance;
}
function canHydrateHydrationBoundary(instance, inRootOrSingleton) {
  for (;instance.nodeType !== 8; ) {
    if ((instance.nodeType !== 1 || instance.nodeName !== "INPUT" || instance.type !== "hidden") && !inRootOrSingleton)
      return null;
    instance = getNextHydratable(instance.nextSibling);
    if (instance === null)
      return null;
  }
  return instance;
}
function isSuspenseInstancePending(instance) {
  return instance.data === "$?" || instance.data === "$~";
}
function isSuspenseInstanceFallback(instance) {
  return instance.data === "$!" || instance.data === "$?" && instance.ownerDocument.readyState !== "loading";
}
function registerSuspenseInstanceRetry(instance, callback) {
  var ownerDocument = instance.ownerDocument;
  if (instance.data === "$~")
    instance._reactRetry = callback;
  else if (instance.data !== "$?" || ownerDocument.readyState !== "loading")
    callback();
  else {
    var listener = function() {
      callback();
      ownerDocument.removeEventListener("DOMContentLoaded", listener);
    };
    ownerDocument.addEventListener("DOMContentLoaded", listener);
    instance._reactRetry = listener;
  }
}
function getNextHydratable(node) {
  for (;node != null; node = node.nextSibling) {
    var nodeType = node.nodeType;
    if (nodeType === 1 || nodeType === 3)
      break;
    if (nodeType === 8) {
      nodeType = node.data;
      if (nodeType === "$" || nodeType === "$!" || nodeType === "$?" || nodeType === "$~" || nodeType === "&" || nodeType === "F!" || nodeType === "F")
        break;
      if (nodeType === "/$" || nodeType === "/&")
        return null;
    }
  }
  return node;
}
function getNextHydratableInstanceAfterHydrationBoundary(hydrationInstance) {
  hydrationInstance = hydrationInstance.nextSibling;
  for (var depth = 0;hydrationInstance; ) {
    if (hydrationInstance.nodeType === 8) {
      var data = hydrationInstance.data;
      if (data === "/$" || data === "/&") {
        if (depth === 0)
          return getNextHydratable(hydrationInstance.nextSibling);
        depth--;
      } else
        data !== "$" && data !== "$!" && data !== "$?" && data !== "$~" && data !== "&" || depth++;
    }
    hydrationInstance = hydrationInstance.nextSibling;
  }
  return null;
}
function getParentHydrationBoundary(targetInstance) {
  targetInstance = targetInstance.previousSibling;
  for (var depth = 0;targetInstance; ) {
    if (targetInstance.nodeType === 8) {
      var data = targetInstance.data;
      if (data === "$" || data === "$!" || data === "$?" || data === "$~" || data === "&") {
        if (depth === 0)
          return targetInstance;
        depth--;
      } else
        data !== "/$" && data !== "/&" || depth++;
    }
    targetInstance = targetInstance.previousSibling;
  }
  return null;
}
function resolveSingletonInstance(type, props, rootContainerInstance) {
  props = getOwnerDocumentFromRootContainer(rootContainerInstance);
  switch (type) {
    case "html":
      type = props.documentElement;
      if (!type)
        throw Error(formatProdErrorMessage(452));
      return type;
    case "head":
      type = props.head;
      if (!type)
        throw Error(formatProdErrorMessage(453));
      return type;
    case "body":
      type = props.body;
      if (!type)
        throw Error(formatProdErrorMessage(454));
      return type;
    default:
      throw Error(formatProdErrorMessage(451));
  }
}
function releaseSingletonInstance(instance) {
  for (var attributes = instance.attributes;attributes.length; )
    instance.removeAttributeNode(attributes[0]);
  detachDeletedInstance(instance);
}
function getHoistableRoot(container) {
  return typeof container.getRootNode === "function" ? container.getRootNode() : container.nodeType === 9 ? container : container.ownerDocument;
}
function flushSyncWork() {
  var previousWasRendering = previousDispatcher.f(), wasRendering = flushSyncWork$1();
  return previousWasRendering || wasRendering;
}
function requestFormReset(form) {
  var formInst = getInstanceFromNode(form);
  formInst !== null && formInst.tag === 5 && formInst.type === "form" ? requestFormReset$1(formInst) : previousDispatcher.r(form);
}
function preconnectAs(rel, href, crossOrigin) {
  var ownerDocument = globalDocument;
  if (ownerDocument && typeof href === "string" && href) {
    var limitedEscapedHref = escapeSelectorAttributeValueInsideDoubleQuotes(href);
    limitedEscapedHref = 'link[rel="' + rel + '"][href="' + limitedEscapedHref + '"]';
    typeof crossOrigin === "string" && (limitedEscapedHref += '[crossorigin="' + crossOrigin + '"]');
    preconnectsSet.has(limitedEscapedHref) || (preconnectsSet.add(limitedEscapedHref), rel = { rel, crossOrigin, href }, ownerDocument.querySelector(limitedEscapedHref) === null && (href = ownerDocument.createElement("link"), setInitialProperties(href, "link", rel), markNodeAsHoistable(href), ownerDocument.head.appendChild(href)));
  }
}
function prefetchDNS(href) {
  previousDispatcher.D(href);
  preconnectAs("dns-prefetch", href, null);
}
function preconnect(href, crossOrigin) {
  previousDispatcher.C(href, crossOrigin);
  preconnectAs("preconnect", href, crossOrigin);
}
function preload(href, as, options2) {
  previousDispatcher.L(href, as, options2);
  var ownerDocument = globalDocument;
  if (ownerDocument && href && as) {
    var preloadSelector = 'link[rel="preload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"]';
    as === "image" ? options2 && options2.imageSrcSet ? (preloadSelector += '[imagesrcset="' + escapeSelectorAttributeValueInsideDoubleQuotes(options2.imageSrcSet) + '"]', typeof options2.imageSizes === "string" && (preloadSelector += '[imagesizes="' + escapeSelectorAttributeValueInsideDoubleQuotes(options2.imageSizes) + '"]')) : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]' : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]';
    var key = preloadSelector;
    switch (as) {
      case "style":
        key = getStyleKey(href);
        break;
      case "script":
        key = getScriptKey(href);
    }
    preloadPropsMap.has(key) || (href = assign({
      rel: "preload",
      href: as === "image" && options2 && options2.imageSrcSet ? undefined : href,
      as
    }, options2), preloadPropsMap.set(key, href), ownerDocument.querySelector(preloadSelector) !== null || as === "style" && ownerDocument.querySelector(getStylesheetSelectorFromKey(key)) || as === "script" && ownerDocument.querySelector(getScriptSelectorFromKey(key)) || (as = ownerDocument.createElement("link"), setInitialProperties(as, "link", href), markNodeAsHoistable(as), ownerDocument.head.appendChild(as)));
  }
}
function preloadModule(href, options2) {
  previousDispatcher.m(href, options2);
  var ownerDocument = globalDocument;
  if (ownerDocument && href) {
    var as = options2 && typeof options2.as === "string" ? options2.as : "script", preloadSelector = 'link[rel="modulepreload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"][href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]', key = preloadSelector;
    switch (as) {
      case "audioworklet":
      case "paintworklet":
      case "serviceworker":
      case "sharedworker":
      case "worker":
      case "script":
        key = getScriptKey(href);
    }
    if (!preloadPropsMap.has(key) && (href = assign({ rel: "modulepreload", href }, options2), preloadPropsMap.set(key, href), ownerDocument.querySelector(preloadSelector) === null)) {
      switch (as) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          if (ownerDocument.querySelector(getScriptSelectorFromKey(key)))
            return;
      }
      as = ownerDocument.createElement("link");
      setInitialProperties(as, "link", href);
      markNodeAsHoistable(as);
      ownerDocument.head.appendChild(as);
    }
  }
}
function preinitStyle(href, precedence, options2) {
  previousDispatcher.S(href, precedence, options2);
  var ownerDocument = globalDocument;
  if (ownerDocument && href) {
    var styles = getResourcesFromRoot(ownerDocument).hoistableStyles, key = getStyleKey(href);
    precedence = precedence || "default";
    var resource = styles.get(key);
    if (!resource) {
      var state = { loading: 0, preload: null };
      if (resource = ownerDocument.querySelector(getStylesheetSelectorFromKey(key)))
        state.loading = 5;
      else {
        href = assign({ rel: "stylesheet", href, "data-precedence": precedence }, options2);
        (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForStylesheet(href, options2);
        var link = resource = ownerDocument.createElement("link");
        markNodeAsHoistable(link);
        setInitialProperties(link, "link", href);
        link._p = new Promise(function(resolve, reject) {
          link.onload = resolve;
          link.onerror = reject;
        });
        link.addEventListener("load", function() {
          state.loading |= 1;
        });
        link.addEventListener("error", function() {
          state.loading |= 2;
        });
        state.loading |= 4;
        insertStylesheet(resource, precedence, ownerDocument);
      }
      resource = {
        type: "stylesheet",
        instance: resource,
        count: 1,
        state
      };
      styles.set(key, resource);
    }
  }
}
function preinitScript(src, options2) {
  previousDispatcher.X(src, options2);
  var ownerDocument = globalDocument;
  if (ownerDocument && src) {
    var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key = getScriptKey(src), resource = scripts.get(key);
    resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key)), resource || (src = assign({ src, async: true }, options2), (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForScript(src, options2), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
      type: "script",
      instance: resource,
      count: 1,
      state: null
    }, scripts.set(key, resource));
  }
}
function preinitModuleScript(src, options2) {
  previousDispatcher.M(src, options2);
  var ownerDocument = globalDocument;
  if (ownerDocument && src) {
    var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key = getScriptKey(src), resource = scripts.get(key);
    resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key)), resource || (src = assign({ src, async: true, type: "module" }, options2), (options2 = preloadPropsMap.get(key)) && adoptPreloadPropsForScript(src, options2), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
      type: "script",
      instance: resource,
      count: 1,
      state: null
    }, scripts.set(key, resource));
  }
}
function getResource(type, currentProps, pendingProps, currentResource) {
  var JSCompiler_inline_result = (JSCompiler_inline_result = rootInstanceStackCursor.current) ? getHoistableRoot(JSCompiler_inline_result) : null;
  if (!JSCompiler_inline_result)
    throw Error(formatProdErrorMessage(446));
  switch (type) {
    case "meta":
    case "title":
      return null;
    case "style":
      return typeof pendingProps.precedence === "string" && typeof pendingProps.href === "string" ? (currentProps = getStyleKey(pendingProps.href), pendingProps = getResourcesFromRoot(JSCompiler_inline_result).hoistableStyles, currentResource = pendingProps.get(currentProps), currentResource || (currentResource = {
        type: "style",
        instance: null,
        count: 0,
        state: null
      }, pendingProps.set(currentProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
    case "link":
      if (pendingProps.rel === "stylesheet" && typeof pendingProps.href === "string" && typeof pendingProps.precedence === "string") {
        type = getStyleKey(pendingProps.href);
        var styles$243 = getResourcesFromRoot(JSCompiler_inline_result).hoistableStyles, resource$244 = styles$243.get(type);
        resource$244 || (JSCompiler_inline_result = JSCompiler_inline_result.ownerDocument || JSCompiler_inline_result, resource$244 = {
          type: "stylesheet",
          instance: null,
          count: 0,
          state: { loading: 0, preload: null }
        }, styles$243.set(type, resource$244), (styles$243 = JSCompiler_inline_result.querySelector(getStylesheetSelectorFromKey(type))) && !styles$243._p && (resource$244.instance = styles$243, resource$244.state.loading = 5), preloadPropsMap.has(type) || (pendingProps = {
          rel: "preload",
          as: "style",
          href: pendingProps.href,
          crossOrigin: pendingProps.crossOrigin,
          integrity: pendingProps.integrity,
          media: pendingProps.media,
          hrefLang: pendingProps.hrefLang,
          referrerPolicy: pendingProps.referrerPolicy
        }, preloadPropsMap.set(type, pendingProps), styles$243 || preloadStylesheet(JSCompiler_inline_result, type, pendingProps, resource$244.state)));
        if (currentProps && currentResource === null)
          throw Error(formatProdErrorMessage(528, ""));
        return resource$244;
      }
      if (currentProps && currentResource !== null)
        throw Error(formatProdErrorMessage(529, ""));
      return null;
    case "script":
      return currentProps = pendingProps.async, pendingProps = pendingProps.src, typeof pendingProps === "string" && currentProps && typeof currentProps !== "function" && typeof currentProps !== "symbol" ? (currentProps = getScriptKey(pendingProps), pendingProps = getResourcesFromRoot(JSCompiler_inline_result).hoistableScripts, currentResource = pendingProps.get(currentProps), currentResource || (currentResource = {
        type: "script",
        instance: null,
        count: 0,
        state: null
      }, pendingProps.set(currentProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
    default:
      throw Error(formatProdErrorMessage(444, type));
  }
}
function getStyleKey(href) {
  return 'href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"';
}
function getStylesheetSelectorFromKey(key) {
  return 'link[rel="stylesheet"][' + key + "]";
}
function stylesheetPropsFromRawProps(rawProps) {
  return assign({}, rawProps, {
    "data-precedence": rawProps.precedence,
    precedence: null
  });
}
function preloadStylesheet(ownerDocument, key, preloadProps, state) {
  ownerDocument.querySelector('link[rel="preload"][as="style"][' + key + "]") ? state.loading = 1 : (key = ownerDocument.createElement("link"), state.preload = key, key.addEventListener("load", function() {
    return state.loading |= 1;
  }), key.addEventListener("error", function() {
    return state.loading |= 2;
  }), setInitialProperties(key, "link", preloadProps), markNodeAsHoistable(key), ownerDocument.head.appendChild(key));
}
function getScriptKey(src) {
  return '[src="' + escapeSelectorAttributeValueInsideDoubleQuotes(src) + '"]';
}
function getScriptSelectorFromKey(key) {
  return "script[async]" + key;
}
function acquireResource(hoistableRoot, resource, props) {
  resource.count++;
  if (resource.instance === null)
    switch (resource.type) {
      case "style":
        var instance = hoistableRoot.querySelector('style[data-href~="' + escapeSelectorAttributeValueInsideDoubleQuotes(props.href) + '"]');
        if (instance)
          return resource.instance = instance, markNodeAsHoistable(instance), instance;
        var styleProps = assign({}, props, {
          "data-href": props.href,
          "data-precedence": props.precedence,
          href: null,
          precedence: null
        });
        instance = (hoistableRoot.ownerDocument || hoistableRoot).createElement("style");
        markNodeAsHoistable(instance);
        setInitialProperties(instance, "style", styleProps);
        insertStylesheet(instance, props.precedence, hoistableRoot);
        return resource.instance = instance;
      case "stylesheet":
        styleProps = getStyleKey(props.href);
        var instance$249 = hoistableRoot.querySelector(getStylesheetSelectorFromKey(styleProps));
        if (instance$249)
          return resource.state.loading |= 4, resource.instance = instance$249, markNodeAsHoistable(instance$249), instance$249;
        instance = stylesheetPropsFromRawProps(props);
        (styleProps = preloadPropsMap.get(styleProps)) && adoptPreloadPropsForStylesheet(instance, styleProps);
        instance$249 = (hoistableRoot.ownerDocument || hoistableRoot).createElement("link");
        markNodeAsHoistable(instance$249);
        var linkInstance = instance$249;
        linkInstance._p = new Promise(function(resolve, reject) {
          linkInstance.onload = resolve;
          linkInstance.onerror = reject;
        });
        setInitialProperties(instance$249, "link", instance);
        resource.state.loading |= 4;
        insertStylesheet(instance$249, props.precedence, hoistableRoot);
        return resource.instance = instance$249;
      case "script":
        instance$249 = getScriptKey(props.src);
        if (styleProps = hoistableRoot.querySelector(getScriptSelectorFromKey(instance$249)))
          return resource.instance = styleProps, markNodeAsHoistable(styleProps), styleProps;
        instance = props;
        if (styleProps = preloadPropsMap.get(instance$249))
          instance = assign({}, props), adoptPreloadPropsForScript(instance, styleProps);
        hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
        styleProps = hoistableRoot.createElement("script");
        markNodeAsHoistable(styleProps);
        setInitialProperties(styleProps, "link", instance);
        hoistableRoot.head.appendChild(styleProps);
        return resource.instance = styleProps;
      case "void":
        return null;
      default:
        throw Error(formatProdErrorMessage(443, resource.type));
    }
  else
    resource.type === "stylesheet" && (resource.state.loading & 4) === 0 && (instance = resource.instance, resource.state.loading |= 4, insertStylesheet(instance, props.precedence, hoistableRoot));
  return resource.instance;
}
function insertStylesheet(instance, precedence, root2) {
  for (var nodes = root2.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), last = nodes.length ? nodes[nodes.length - 1] : null, prior = last, i = 0;i < nodes.length; i++) {
    var node = nodes[i];
    if (node.dataset.precedence === precedence)
      prior = node;
    else if (prior !== last)
      break;
  }
  prior ? prior.parentNode.insertBefore(instance, prior.nextSibling) : (precedence = root2.nodeType === 9 ? root2.head : root2, precedence.insertBefore(instance, precedence.firstChild));
}
function adoptPreloadPropsForStylesheet(stylesheetProps, preloadProps) {
  stylesheetProps.crossOrigin == null && (stylesheetProps.crossOrigin = preloadProps.crossOrigin);
  stylesheetProps.referrerPolicy == null && (stylesheetProps.referrerPolicy = preloadProps.referrerPolicy);
  stylesheetProps.title == null && (stylesheetProps.title = preloadProps.title);
}
function adoptPreloadPropsForScript(scriptProps, preloadProps) {
  scriptProps.crossOrigin == null && (scriptProps.crossOrigin = preloadProps.crossOrigin);
  scriptProps.referrerPolicy == null && (scriptProps.referrerPolicy = preloadProps.referrerPolicy);
  scriptProps.integrity == null && (scriptProps.integrity = preloadProps.integrity);
}
function getHydratableHoistableCache(type, keyAttribute, ownerDocument) {
  if (tagCaches === null) {
    var cache = new Map;
    var caches = tagCaches = new Map;
    caches.set(ownerDocument, cache);
  } else
    caches = tagCaches, cache = caches.get(ownerDocument), cache || (cache = new Map, caches.set(ownerDocument, cache));
  if (cache.has(type))
    return cache;
  cache.set(type, null);
  ownerDocument = ownerDocument.getElementsByTagName(type);
  for (caches = 0;caches < ownerDocument.length; caches++) {
    var node = ownerDocument[caches];
    if (!(node[internalHoistableMarker] || node[internalInstanceKey] || type === "link" && node.getAttribute("rel") === "stylesheet") && node.namespaceURI !== "http://www.w3.org/2000/svg") {
      var nodeKey = node.getAttribute(keyAttribute) || "";
      nodeKey = type + nodeKey;
      var existing = cache.get(nodeKey);
      existing ? existing.push(node) : cache.set(nodeKey, [node]);
    }
  }
  return cache;
}
function mountHoistable(hoistableRoot, type, instance) {
  hoistableRoot = hoistableRoot.ownerDocument || hoistableRoot;
  hoistableRoot.head.insertBefore(instance, type === "title" ? hoistableRoot.querySelector("head > title") : null);
}
function isHostHoistableType(type, props, hostContext) {
  if (hostContext === 1 || props.itemProp != null)
    return false;
  switch (type) {
    case "meta":
    case "title":
      return true;
    case "style":
      if (typeof props.precedence !== "string" || typeof props.href !== "string" || props.href === "")
        break;
      return true;
    case "link":
      if (typeof props.rel !== "string" || typeof props.href !== "string" || props.href === "" || props.onLoad || props.onError)
        break;
      switch (props.rel) {
        case "stylesheet":
          return type = props.disabled, typeof props.precedence === "string" && type == null;
        default:
          return true;
      }
    case "script":
      if (props.async && typeof props.async !== "function" && typeof props.async !== "symbol" && !props.onLoad && !props.onError && props.src && typeof props.src === "string")
        return true;
  }
  return false;
}
function preloadResource(resource) {
  return resource.type === "stylesheet" && (resource.state.loading & 3) === 0 ? false : true;
}
function suspendResource(state, hoistableRoot, resource, props) {
  if (resource.type === "stylesheet" && (typeof props.media !== "string" || matchMedia(props.media).matches !== false) && (resource.state.loading & 4) === 0) {
    if (resource.instance === null) {
      var key = getStyleKey(props.href), instance = hoistableRoot.querySelector(getStylesheetSelectorFromKey(key));
      if (instance) {
        hoistableRoot = instance._p;
        hoistableRoot !== null && typeof hoistableRoot === "object" && typeof hoistableRoot.then === "function" && (state.count++, state = onUnsuspend.bind(state), hoistableRoot.then(state, state));
        resource.state.loading |= 4;
        resource.instance = instance;
        markNodeAsHoistable(instance);
        return;
      }
      instance = hoistableRoot.ownerDocument || hoistableRoot;
      props = stylesheetPropsFromRawProps(props);
      (key = preloadPropsMap.get(key)) && adoptPreloadPropsForStylesheet(props, key);
      instance = instance.createElement("link");
      markNodeAsHoistable(instance);
      var linkInstance = instance;
      linkInstance._p = new Promise(function(resolve, reject) {
        linkInstance.onload = resolve;
        linkInstance.onerror = reject;
      });
      setInitialProperties(instance, "link", props);
      resource.instance = instance;
    }
    state.stylesheets === null && (state.stylesheets = new Map);
    state.stylesheets.set(resource, hoistableRoot);
    (hoistableRoot = resource.state.preload) && (resource.state.loading & 3) === 0 && (state.count++, resource = onUnsuspend.bind(state), hoistableRoot.addEventListener("load", resource), hoistableRoot.addEventListener("error", resource));
  }
}
function waitForCommitToBeReady(state, timeoutOffset) {
  state.stylesheets && state.count === 0 && insertSuspendedStylesheets(state, state.stylesheets);
  return 0 < state.count || 0 < state.imgCount ? function(commit) {
    var stylesheetTimer = setTimeout(function() {
      state.stylesheets && insertSuspendedStylesheets(state, state.stylesheets);
      if (state.unsuspend) {
        var unsuspend = state.unsuspend;
        state.unsuspend = null;
        unsuspend();
      }
    }, 60000 + timeoutOffset);
    0 < state.imgBytes && estimatedBytesWithinLimit === 0 && (estimatedBytesWithinLimit = 62500 * estimateBandwidth());
    var imgTimer = setTimeout(function() {
      state.waitingForImages = false;
      if (state.count === 0 && (state.stylesheets && insertSuspendedStylesheets(state, state.stylesheets), state.unsuspend)) {
        var unsuspend = state.unsuspend;
        state.unsuspend = null;
        unsuspend();
      }
    }, (state.imgBytes > estimatedBytesWithinLimit ? 50 : 800) + timeoutOffset);
    state.unsuspend = commit;
    return function() {
      state.unsuspend = null;
      clearTimeout(stylesheetTimer);
      clearTimeout(imgTimer);
    };
  } : null;
}
function onUnsuspend() {
  this.count--;
  if (this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
    if (this.stylesheets)
      insertSuspendedStylesheets(this, this.stylesheets);
    else if (this.unsuspend) {
      var unsuspend = this.unsuspend;
      this.unsuspend = null;
      unsuspend();
    }
  }
}
function insertSuspendedStylesheets(state, resources) {
  state.stylesheets = null;
  state.unsuspend !== null && (state.count++, precedencesByRoot = new Map, resources.forEach(insertStylesheetIntoRoot, state), precedencesByRoot = null, onUnsuspend.call(state));
}
function insertStylesheetIntoRoot(root2, resource) {
  if (!(resource.state.loading & 4)) {
    var precedences = precedencesByRoot.get(root2);
    if (precedences)
      var last = precedences.get(null);
    else {
      precedences = new Map;
      precedencesByRoot.set(root2, precedences);
      for (var nodes = root2.querySelectorAll("link[data-precedence],style[data-precedence]"), i = 0;i < nodes.length; i++) {
        var node = nodes[i];
        if (node.nodeName === "LINK" || node.getAttribute("media") !== "not all")
          precedences.set(node.dataset.precedence, node), last = node;
      }
      last && precedences.set(null, last);
    }
    nodes = resource.instance;
    node = nodes.getAttribute("data-precedence");
    i = precedences.get(node) || last;
    i === last && precedences.set(null, nodes);
    precedences.set(node, nodes);
    this.count++;
    last = onUnsuspend.bind(this);
    nodes.addEventListener("load", last);
    nodes.addEventListener("error", last);
    i ? i.parentNode.insertBefore(nodes, i.nextSibling) : (root2 = root2.nodeType === 9 ? root2.head : root2, root2.insertBefore(nodes, root2.firstChild));
    resource.state.loading |= 4;
  }
}
function FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState) {
  this.tag = 1;
  this.containerInfo = containerInfo;
  this.pingCache = this.current = this.pendingChildren = null;
  this.timeoutHandle = -1;
  this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null;
  this.callbackPriority = 0;
  this.expirationTimes = createLaneMap(-1);
  this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0;
  this.entanglements = createLaneMap(0);
  this.hiddenUpdates = createLaneMap(null);
  this.identifierPrefix = identifierPrefix;
  this.onUncaughtError = onUncaughtError;
  this.onCaughtError = onCaughtError;
  this.onRecoverableError = onRecoverableError;
  this.pooledCache = null;
  this.pooledCacheLanes = 0;
  this.formState = formState;
  this.incompleteTransitions = new Map;
}
function createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator) {
  containerInfo = new FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState);
  tag = 1;
  isStrictMode === true && (tag |= 24);
  isStrictMode = createFiberImplClass(3, null, null, tag);
  containerInfo.current = isStrictMode;
  isStrictMode.stateNode = containerInfo;
  tag = createCache();
  tag.refCount++;
  containerInfo.pooledCache = tag;
  tag.refCount++;
  isStrictMode.memoizedState = {
    element: initialChildren,
    isDehydrated: hydrate,
    cache: tag
  };
  initializeUpdateQueue(isStrictMode);
  return containerInfo;
}
function getContextForSubtree(parentComponent) {
  if (!parentComponent)
    return emptyContextObject;
  parentComponent = emptyContextObject;
  return parentComponent;
}
function updateContainerImpl(rootFiber, lane, element, container, parentComponent, callback) {
  parentComponent = getContextForSubtree(parentComponent);
  container.context === null ? container.context = parentComponent : container.pendingContext = parentComponent;
  container = createUpdate(lane);
  container.payload = { element };
  callback = callback === undefined ? null : callback;
  callback !== null && (container.callback = callback);
  element = enqueueUpdate(rootFiber, container, lane);
  element !== null && (scheduleUpdateOnFiber(element, rootFiber, lane), entangleTransitions(element, rootFiber, lane));
}
function markRetryLaneImpl(fiber, retryLane) {
  fiber = fiber.memoizedState;
  if (fiber !== null && fiber.dehydrated !== null) {
    var a = fiber.retryLane;
    fiber.retryLane = a !== 0 && a < retryLane ? a : retryLane;
  }
}
function markRetryLaneIfNotHydrated(fiber, retryLane) {
  markRetryLaneImpl(fiber, retryLane);
  (fiber = fiber.alternate) && markRetryLaneImpl(fiber, retryLane);
}
function attemptContinuousHydration(fiber) {
  if (fiber.tag === 13 || fiber.tag === 31) {
    var root2 = enqueueConcurrentRenderForLane(fiber, 67108864);
    root2 !== null && scheduleUpdateOnFiber(root2, fiber, 67108864);
    markRetryLaneIfNotHydrated(fiber, 67108864);
  }
}
function attemptHydrationAtCurrentPriority(fiber) {
  if (fiber.tag === 13 || fiber.tag === 31) {
    var lane = requestUpdateLane();
    lane = getBumpedLaneForHydrationByLane(lane);
    var root2 = enqueueConcurrentRenderForLane(fiber, lane);
    root2 !== null && scheduleUpdateOnFiber(root2, fiber, lane);
    markRetryLaneIfNotHydrated(fiber, lane);
  }
}
function dispatchDiscreteEvent(domEventName, eventSystemFlags, container, nativeEvent) {
  var prevTransition = ReactSharedInternals.T;
  ReactSharedInternals.T = null;
  var previousPriority = ReactDOMSharedInternals.p;
  try {
    ReactDOMSharedInternals.p = 2, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
  } finally {
    ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
  }
}
function dispatchContinuousEvent(domEventName, eventSystemFlags, container, nativeEvent) {
  var prevTransition = ReactSharedInternals.T;
  ReactSharedInternals.T = null;
  var previousPriority = ReactDOMSharedInternals.p;
  try {
    ReactDOMSharedInternals.p = 8, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
  } finally {
    ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
  }
}
function dispatchEvent(domEventName, eventSystemFlags, targetContainer, nativeEvent) {
  if (_enabled) {
    var blockedOn = findInstanceBlockingEvent(nativeEvent);
    if (blockedOn === null)
      dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, return_targetInst, targetContainer), clearIfContinuousEvent(domEventName, nativeEvent);
    else if (queueIfContinuousEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent))
      nativeEvent.stopPropagation();
    else if (clearIfContinuousEvent(domEventName, nativeEvent), eventSystemFlags & 4 && -1 < discreteReplayableEvents.indexOf(domEventName)) {
      for (;blockedOn !== null; ) {
        var fiber = getInstanceFromNode(blockedOn);
        if (fiber !== null)
          switch (fiber.tag) {
            case 3:
              fiber = fiber.stateNode;
              if (fiber.current.memoizedState.isDehydrated) {
                var lanes = getHighestPriorityLanes(fiber.pendingLanes);
                if (lanes !== 0) {
                  var root2 = fiber;
                  root2.pendingLanes |= 2;
                  for (root2.entangledLanes |= 2;lanes; ) {
                    var lane = 1 << 31 - clz32(lanes);
                    root2.entanglements[1] |= lane;
                    lanes &= ~lane;
                  }
                  ensureRootIsScheduled(fiber);
                  (executionContext & 6) === 0 && (workInProgressRootRenderTargetTime = now() + 500, flushSyncWorkAcrossRoots_impl(0, false));
                }
              }
              break;
            case 31:
            case 13:
              root2 = enqueueConcurrentRenderForLane(fiber, 2), root2 !== null && scheduleUpdateOnFiber(root2, fiber, 2), flushSyncWork$1(), markRetryLaneIfNotHydrated(fiber, 2);
          }
        fiber = findInstanceBlockingEvent(nativeEvent);
        fiber === null && dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, return_targetInst, targetContainer);
        if (fiber === blockedOn)
          break;
        blockedOn = fiber;
      }
      blockedOn !== null && nativeEvent.stopPropagation();
    } else
      dispatchEventForPluginEventSystem(domEventName, eventSystemFlags, nativeEvent, null, targetContainer);
  }
}
function findInstanceBlockingEvent(nativeEvent) {
  nativeEvent = getEventTarget(nativeEvent);
  return findInstanceBlockingTarget(nativeEvent);
}
function findInstanceBlockingTarget(targetNode) {
  return_targetInst = null;
  targetNode = getClosestInstanceFromNode(targetNode);
  if (targetNode !== null) {
    var nearestMounted = getNearestMountedFiber(targetNode);
    if (nearestMounted === null)
      targetNode = null;
    else {
      var tag = nearestMounted.tag;
      if (tag === 13) {
        targetNode = getSuspenseInstanceFromFiber(nearestMounted);
        if (targetNode !== null)
          return targetNode;
        targetNode = null;
      } else if (tag === 31) {
        targetNode = getActivityInstanceFromFiber(nearestMounted);
        if (targetNode !== null)
          return targetNode;
        targetNode = null;
      } else if (tag === 3) {
        if (nearestMounted.stateNode.current.memoizedState.isDehydrated)
          return nearestMounted.tag === 3 ? nearestMounted.stateNode.containerInfo : null;
        targetNode = null;
      } else
        nearestMounted !== targetNode && (targetNode = null);
    }
  }
  return_targetInst = targetNode;
  return null;
}
function getEventPriority(domEventName) {
  switch (domEventName) {
    case "beforetoggle":
    case "cancel":
    case "click":
    case "close":
    case "contextmenu":
    case "copy":
    case "cut":
    case "auxclick":
    case "dblclick":
    case "dragend":
    case "dragstart":
    case "drop":
    case "focusin":
    case "focusout":
    case "input":
    case "invalid":
    case "keydown":
    case "keypress":
    case "keyup":
    case "mousedown":
    case "mouseup":
    case "paste":
    case "pause":
    case "play":
    case "pointercancel":
    case "pointerdown":
    case "pointerup":
    case "ratechange":
    case "reset":
    case "resize":
    case "seeked":
    case "submit":
    case "toggle":
    case "touchcancel":
    case "touchend":
    case "touchstart":
    case "volumechange":
    case "change":
    case "selectionchange":
    case "textInput":
    case "compositionstart":
    case "compositionend":
    case "compositionupdate":
    case "beforeblur":
    case "afterblur":
    case "beforeinput":
    case "blur":
    case "fullscreenchange":
    case "focus":
    case "hashchange":
    case "popstate":
    case "select":
    case "selectstart":
      return 2;
    case "drag":
    case "dragenter":
    case "dragexit":
    case "dragleave":
    case "dragover":
    case "mousemove":
    case "mouseout":
    case "mouseover":
    case "pointermove":
    case "pointerout":
    case "pointerover":
    case "scroll":
    case "touchmove":
    case "wheel":
    case "mouseenter":
    case "mouseleave":
    case "pointerenter":
    case "pointerleave":
      return 8;
    case "message":
      switch (getCurrentPriorityLevel()) {
        case ImmediatePriority:
          return 2;
        case UserBlockingPriority:
          return 8;
        case NormalPriority$1:
        case LowPriority:
          return 32;
        case IdlePriority:
          return 268435456;
        default:
          return 32;
      }
    default:
      return 32;
  }
}
function clearIfContinuousEvent(domEventName, nativeEvent) {
  switch (domEventName) {
    case "focusin":
    case "focusout":
      queuedFocus = null;
      break;
    case "dragenter":
    case "dragleave":
      queuedDrag = null;
      break;
    case "mouseover":
    case "mouseout":
      queuedMouse = null;
      break;
    case "pointerover":
    case "pointerout":
      queuedPointers.delete(nativeEvent.pointerId);
      break;
    case "gotpointercapture":
    case "lostpointercapture":
      queuedPointerCaptures.delete(nativeEvent.pointerId);
  }
}
function accumulateOrCreateContinuousQueuedReplayableEvent(existingQueuedEvent, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
  if (existingQueuedEvent === null || existingQueuedEvent.nativeEvent !== nativeEvent)
    return existingQueuedEvent = {
      blockedOn,
      domEventName,
      eventSystemFlags,
      nativeEvent,
      targetContainers: [targetContainer]
    }, blockedOn !== null && (blockedOn = getInstanceFromNode(blockedOn), blockedOn !== null && attemptContinuousHydration(blockedOn)), existingQueuedEvent;
  existingQueuedEvent.eventSystemFlags |= eventSystemFlags;
  blockedOn = existingQueuedEvent.targetContainers;
  targetContainer !== null && blockedOn.indexOf(targetContainer) === -1 && blockedOn.push(targetContainer);
  return existingQueuedEvent;
}
function queueIfContinuousEvent(blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent) {
  switch (domEventName) {
    case "focusin":
      return queuedFocus = accumulateOrCreateContinuousQueuedReplayableEvent(queuedFocus, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent), true;
    case "dragenter":
      return queuedDrag = accumulateOrCreateContinuousQueuedReplayableEvent(queuedDrag, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent), true;
    case "mouseover":
      return queuedMouse = accumulateOrCreateContinuousQueuedReplayableEvent(queuedMouse, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent), true;
    case "pointerover":
      var pointerId = nativeEvent.pointerId;
      queuedPointers.set(pointerId, accumulateOrCreateContinuousQueuedReplayableEvent(queuedPointers.get(pointerId) || null, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent));
      return true;
    case "gotpointercapture":
      return pointerId = nativeEvent.pointerId, queuedPointerCaptures.set(pointerId, accumulateOrCreateContinuousQueuedReplayableEvent(queuedPointerCaptures.get(pointerId) || null, blockedOn, domEventName, eventSystemFlags, targetContainer, nativeEvent)), true;
  }
  return false;
}
function attemptExplicitHydrationTarget(queuedTarget) {
  var targetInst = getClosestInstanceFromNode(queuedTarget.target);
  if (targetInst !== null) {
    var nearestMounted = getNearestMountedFiber(targetInst);
    if (nearestMounted !== null) {
      if (targetInst = nearestMounted.tag, targetInst === 13) {
        if (targetInst = getSuspenseInstanceFromFiber(nearestMounted), targetInst !== null) {
          queuedTarget.blockedOn = targetInst;
          runWithPriority(queuedTarget.priority, function() {
            attemptHydrationAtCurrentPriority(nearestMounted);
          });
          return;
        }
      } else if (targetInst === 31) {
        if (targetInst = getActivityInstanceFromFiber(nearestMounted), targetInst !== null) {
          queuedTarget.blockedOn = targetInst;
          runWithPriority(queuedTarget.priority, function() {
            attemptHydrationAtCurrentPriority(nearestMounted);
          });
          return;
        }
      } else if (targetInst === 3 && nearestMounted.stateNode.current.memoizedState.isDehydrated) {
        queuedTarget.blockedOn = nearestMounted.tag === 3 ? nearestMounted.stateNode.containerInfo : null;
        return;
      }
    }
  }
  queuedTarget.blockedOn = null;
}
function attemptReplayContinuousQueuedEvent(queuedEvent) {
  if (queuedEvent.blockedOn !== null)
    return false;
  for (var targetContainers = queuedEvent.targetContainers;0 < targetContainers.length; ) {
    var nextBlockedOn = findInstanceBlockingEvent(queuedEvent.nativeEvent);
    if (nextBlockedOn === null) {
      nextBlockedOn = queuedEvent.nativeEvent;
      var nativeEventClone = new nextBlockedOn.constructor(nextBlockedOn.type, nextBlockedOn);
      currentReplayingEvent = nativeEventClone;
      nextBlockedOn.target.dispatchEvent(nativeEventClone);
      currentReplayingEvent = null;
    } else
      return targetContainers = getInstanceFromNode(nextBlockedOn), targetContainers !== null && attemptContinuousHydration(targetContainers), queuedEvent.blockedOn = nextBlockedOn, false;
    targetContainers.shift();
  }
  return true;
}
function attemptReplayContinuousQueuedEventInMap(queuedEvent, key, map) {
  attemptReplayContinuousQueuedEvent(queuedEvent) && map.delete(key);
}
function replayUnblockedEvents() {
  hasScheduledReplayAttempt = false;
  queuedFocus !== null && attemptReplayContinuousQueuedEvent(queuedFocus) && (queuedFocus = null);
  queuedDrag !== null && attemptReplayContinuousQueuedEvent(queuedDrag) && (queuedDrag = null);
  queuedMouse !== null && attemptReplayContinuousQueuedEvent(queuedMouse) && (queuedMouse = null);
  queuedPointers.forEach(attemptReplayContinuousQueuedEventInMap);
  queuedPointerCaptures.forEach(attemptReplayContinuousQueuedEventInMap);
}
function scheduleCallbackIfUnblocked(queuedEvent, unblocked) {
  queuedEvent.blockedOn === unblocked && (queuedEvent.blockedOn = null, hasScheduledReplayAttempt || (hasScheduledReplayAttempt = true, Scheduler.unstable_scheduleCallback(Scheduler.unstable_NormalPriority, replayUnblockedEvents)));
}
function scheduleReplayQueueIfNeeded(formReplayingQueue) {
  lastScheduledReplayQueue !== formReplayingQueue && (lastScheduledReplayQueue = formReplayingQueue, Scheduler.unstable_scheduleCallback(Scheduler.unstable_NormalPriority, function() {
    lastScheduledReplayQueue === formReplayingQueue && (lastScheduledReplayQueue = null);
    for (var i = 0;i < formReplayingQueue.length; i += 3) {
      var form = formReplayingQueue[i], submitterOrAction = formReplayingQueue[i + 1], formData = formReplayingQueue[i + 2];
      if (typeof submitterOrAction !== "function")
        if (findInstanceBlockingTarget(submitterOrAction || form) === null)
          continue;
        else
          break;
      var formInst = getInstanceFromNode(form);
      formInst !== null && (formReplayingQueue.splice(i, 3), i -= 3, startHostTransition(formInst, {
        pending: true,
        data: formData,
        method: form.method,
        action: submitterOrAction
      }, submitterOrAction, formData));
    }
  }));
}
function retryIfBlockedOn(unblocked) {
  function unblock(queuedEvent) {
    return scheduleCallbackIfUnblocked(queuedEvent, unblocked);
  }
  queuedFocus !== null && scheduleCallbackIfUnblocked(queuedFocus, unblocked);
  queuedDrag !== null && scheduleCallbackIfUnblocked(queuedDrag, unblocked);
  queuedMouse !== null && scheduleCallbackIfUnblocked(queuedMouse, unblocked);
  queuedPointers.forEach(unblock);
  queuedPointerCaptures.forEach(unblock);
  for (var i = 0;i < queuedExplicitHydrationTargets.length; i++) {
    var queuedTarget = queuedExplicitHydrationTargets[i];
    queuedTarget.blockedOn === unblocked && (queuedTarget.blockedOn = null);
  }
  for (;0 < queuedExplicitHydrationTargets.length && (i = queuedExplicitHydrationTargets[0], i.blockedOn === null); )
    attemptExplicitHydrationTarget(i), i.blockedOn === null && queuedExplicitHydrationTargets.shift();
  i = (unblocked.ownerDocument || unblocked).$$reactFormReplay;
  if (i != null)
    for (queuedTarget = 0;queuedTarget < i.length; queuedTarget += 3) {
      var form = i[queuedTarget], submitterOrAction = i[queuedTarget + 1], formProps = form[internalPropsKey] || null;
      if (typeof submitterOrAction === "function")
        formProps || scheduleReplayQueueIfNeeded(i);
      else if (formProps) {
        var action = null;
        if (submitterOrAction && submitterOrAction.hasAttribute("formAction"))
          if (form = submitterOrAction, formProps = submitterOrAction[internalPropsKey] || null)
            action = formProps.formAction;
          else {
            if (findInstanceBlockingTarget(form) !== null)
              continue;
          }
        else
          action = formProps.action;
        typeof action === "function" ? i[queuedTarget + 1] = action : (i.splice(queuedTarget, 3), queuedTarget -= 3);
        scheduleReplayQueueIfNeeded(i);
      }
    }
}
function defaultOnDefaultTransitionIndicator() {
  function handleNavigate(event) {
    event.canIntercept && event.info === "react-transition" && event.intercept({
      handler: function() {
        return new Promise(function(resolve) {
          return pendingResolve = resolve;
        });
      },
      focusReset: "manual",
      scroll: "manual"
    });
  }
  function handleNavigateComplete() {
    pendingResolve !== null && (pendingResolve(), pendingResolve = null);
    isCancelled || setTimeout(startFakeNavigation, 20);
  }
  function startFakeNavigation() {
    if (!isCancelled && !navigation.transition) {
      var currentEntry = navigation.currentEntry;
      currentEntry && currentEntry.url != null && navigation.navigate(currentEntry.url, {
        state: currentEntry.getState(),
        info: "react-transition",
        history: "replace"
      });
    }
  }
  if (typeof navigation === "object") {
    var isCancelled = false, pendingResolve = null;
    navigation.addEventListener("navigate", handleNavigate);
    navigation.addEventListener("navigatesuccess", handleNavigateComplete);
    navigation.addEventListener("navigateerror", handleNavigateComplete);
    setTimeout(startFakeNavigation, 100);
    return function() {
      isCancelled = true;
      navigation.removeEventListener("navigate", handleNavigate);
      navigation.removeEventListener("navigatesuccess", handleNavigateComplete);
      navigation.removeEventListener("navigateerror", handleNavigateComplete);
      pendingResolve !== null && (pendingResolve(), pendingResolve = null);
    };
  }
}
function ReactDOMRoot(internalRoot) {
  this._internalRoot = internalRoot;
}
function ReactDOMHydrationRoot(internalRoot) {
  this._internalRoot = internalRoot;
}
var Scheduler, assign, REACT_LEGACY_ELEMENT_TYPE, REACT_ELEMENT_TYPE, REACT_PORTAL_TYPE, REACT_FRAGMENT_TYPE, REACT_STRICT_MODE_TYPE, REACT_PROFILER_TYPE, REACT_CONSUMER_TYPE, REACT_CONTEXT_TYPE, REACT_FORWARD_REF_TYPE, REACT_SUSPENSE_TYPE, REACT_SUSPENSE_LIST_TYPE, REACT_MEMO_TYPE, REACT_LAZY_TYPE, REACT_ACTIVITY_TYPE, REACT_MEMO_CACHE_SENTINEL, MAYBE_ITERATOR_SYMBOL, REACT_CLIENT_REFERENCE, isArrayImpl, ReactSharedInternals, ReactDOMSharedInternals, sharedNotPendingObject, valueStack, index = -1, contextStackCursor, contextFiberStackCursor, rootInstanceStackCursor, hostTransitionProviderCursor, prefix, suffix, reentry = false, hasOwnProperty, scheduleCallback$3, cancelCallback$1, shouldYield, requestPaint, now, getCurrentPriorityLevel, ImmediatePriority, UserBlockingPriority, NormalPriority$1, LowPriority, IdlePriority, log$1, unstable_setDisableYieldValue2, rendererID = null, injectedHook = null, clz32, log2, LN2, nextTransitionUpdateLane = 256, nextTransitionDeferredLane = 262144, nextRetryLane = 4194304, randomKey, internalInstanceKey, internalPropsKey, internalContainerInstanceKey, internalEventHandlersKey, internalEventHandlerListenersKey, internalEventHandlesSetKey, internalRootNodeResourcesKey, internalHoistableMarker, allNativeEvents, registrationNameDependencies, VALID_ATTRIBUTE_NAME_REGEX, illegalAttributeNameCache, validatedAttributeNameCache, escapeSelectorAttributeValueInsideDoubleQuotesRegex, unitlessNumbers, aliases, isJavaScriptProtocol, currentReplayingEvent = null, restoreTarget = null, restoreQueue = null, isInsideEventHandler = false, canUseDOM, passiveBrowserEventsSupported = false, options, root = null, startText = null, fallbackText = null, EventInterface, SyntheticEvent, UIEventInterface, SyntheticUIEvent, lastMovementX, lastMovementY, lastMouseEvent, MouseEventInterface, SyntheticMouseEvent, DragEventInterface, SyntheticDragEvent, FocusEventInterface, SyntheticFocusEvent, AnimationEventInterface, SyntheticAnimationEvent, ClipboardEventInterface, SyntheticClipboardEvent, CompositionEventInterface, SyntheticCompositionEvent, normalizeKey, translateToKey, modifierKeyToProp, KeyboardEventInterface, SyntheticKeyboardEvent, PointerEventInterface, SyntheticPointerEvent, TouchEventInterface, SyntheticTouchEvent, TransitionEventInterface, SyntheticTransitionEvent, WheelEventInterface, SyntheticWheelEvent, ToggleEventInterface, SyntheticToggleEvent, END_KEYCODES, canUseCompositionEvent, documentMode = null, canUseTextInputEvent, useFallbackCompositionData, SPACEBAR_CHAR, hasSpaceKeypress = false, isComposing = false, supportedInputTypes, activeElement$1 = null, activeElementInst$1 = null, isInputEventSupported = false, JSCompiler_inline_result$jscomp$286, isSupported$jscomp$inline_427, element$jscomp$inline_428, objectIs, skipSelectionChangeEvent, activeElement = null, activeElementInst = null, lastSelection = null, mouseDown = false, vendorPrefixes, prefixedEventNames, style, ANIMATION_END, ANIMATION_ITERATION, ANIMATION_START, TRANSITION_RUN, TRANSITION_START, TRANSITION_CANCEL, TRANSITION_END, topLevelEventsToReactNames, simpleEventPluginEvents, reportGlobalError, concurrentQueues, concurrentQueuesIndex = 0, concurrentlyUpdatedLanes = 0, emptyContextObject, CapturedStacks, forkStack, forkStackIndex = 0, treeForkProvider = null, treeForkCount = 0, idStack, idStackIndex = 0, treeContextProvider = null, treeContextId = 1, treeContextOverflow = "", hydrationParentFiber = null, nextHydratableInstance = null, isHydrating = false, hydrationErrors = null, rootOrSingletonContext = false, HydrationMismatchException, valueCursor, currentlyRenderingFiber$1 = null, lastContextDependency = null, AbortControllerLocal, scheduleCallback$2, NormalPriority, CacheContext, currentEntangledListeners = null, currentEntangledPendingCount = 0, currentEntangledLane = 0, currentEntangledActionThenable = null, prevOnStartTransitionFinish, resumedCache, SuspenseException, SuspenseyCommitException, SuspenseActionException, noopSuspenseyCommitThenable, suspendedThenable = null, thenableState$1 = null, thenableIndexCounter$1 = 0, reconcileChildFibers, mountChildFibers, hasForceUpdate = false, didReadFromEntangledAsyncAction = false, currentTreeHiddenStackCursor, prevEntangledRenderLanesCursor, suspenseHandlerStackCursor, shellBoundary = null, suspenseStackCursor, renderLanes = 0, currentlyRenderingFiber = null, currentHook = null, workInProgressHook = null, didScheduleRenderPhaseUpdate = false, didScheduleRenderPhaseUpdateDuringThisPass = false, shouldDoubleInvokeUserFnsInHooksDEV = false, localIdCounter = 0, thenableIndexCounter = 0, thenableState = null, globalClientIdCounter = 0, ContextOnlyDispatcher, HooksDispatcherOnMount, HooksDispatcherOnUpdate, HooksDispatcherOnRerender, classComponentUpdater, SelectiveHydrationException, didReceiveUpdate = false, SUSPENDED_MARKER, offscreenSubtreeIsHidden = false, offscreenSubtreeWasHidden = false, needsFormReset = false, PossiblyWeakSet, nextEffect = null, hostParent = null, hostParentIsContainer = false, currentHoistableRoot = null, suspenseyCommitFlag = 8192, DefaultAsyncDispatcher, PossiblyWeakMap, executionContext = 0, workInProgressRoot = null, workInProgress = null, workInProgressRootRenderLanes = 0, workInProgressSuspendedReason = 0, workInProgressThrownValue = null, workInProgressRootDidSkipSuspendedSiblings = false, workInProgressRootIsPrerendering = false, workInProgressRootDidAttachPingListener = false, entangledRenderLanes = 0, workInProgressRootExitStatus = 0, workInProgressRootSkippedLanes = 0, workInProgressRootInterleavedUpdatedLanes = 0, workInProgressRootPingedLanes = 0, workInProgressDeferredLane = 0, workInProgressSuspendedRetryLanes = 0, workInProgressRootConcurrentErrors = null, workInProgressRootRecoverableErrors = null, workInProgressRootDidIncludeRecursiveRenderUpdate = false, globalMostRecentFallbackTime = 0, globalMostRecentTransitionTime = 0, workInProgressRootRenderTargetTime = Infinity, workInProgressTransitions = null, legacyErrorBoundariesThatAlreadyFailed = null, pendingEffectsStatus = 0, pendingEffectsRoot = null, pendingFinishedWork = null, pendingEffectsLanes = 0, pendingEffectsRemainingLanes = 0, pendingPassiveTransitions = null, pendingRecoverableErrors = null, nestedUpdateCount = 0, rootWithNestedUpdates = null, firstScheduledRoot = null, lastScheduledRoot = null, didScheduleMicrotask = false, mightHavePendingSyncWork = false, isFlushingWork = false, currentEventTransitionLane = 0, eventName$jscomp$inline_1578, domEventName$jscomp$inline_1579, capitalizedEvent$jscomp$inline_1580, i$jscomp$inline_1577, mediaEventTypes, nonDelegatedEvents, listeningMarker, NORMALIZE_NEWLINES_REGEX, NORMALIZE_NULL_AND_REPLACEMENT_REGEX, eventsEnabled = null, selectionInformation = null, currentPopstateTransitionEvent = null, scheduleTimeout, cancelTimeout, localPromise, scheduleMicrotask, previousHydratableOnEnteringScopedSingleton = null, preloadPropsMap, preconnectsSet, previousDispatcher, globalDocument, tagCaches = null, estimatedBytesWithinLimit = 0, precedencesByRoot = null, HostTransitionContext, _enabled = true, return_targetInst = null, hasScheduledReplayAttempt = false, queuedFocus = null, queuedDrag = null, queuedMouse = null, queuedPointers, queuedPointerCaptures, queuedExplicitHydrationTargets, discreteReplayableEvents, lastScheduledReplayQueue = null, isomorphicReactPackageVersion$jscomp$inline_1840, internals$jscomp$inline_2347, hook$jscomp$inline_2348, $createRoot = function(container, options2) {
  if (!isValidContainer(container))
    throw Error(formatProdErrorMessage(299));
  var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError;
  options2 !== null && options2 !== undefined && (options2.unstable_strictMode === true && (isStrictMode = true), options2.identifierPrefix !== undefined && (identifierPrefix = options2.identifierPrefix), options2.onUncaughtError !== undefined && (onUncaughtError = options2.onUncaughtError), options2.onCaughtError !== undefined && (onCaughtError = options2.onCaughtError), options2.onRecoverableError !== undefined && (onRecoverableError = options2.onRecoverableError));
  options2 = createFiberRoot(container, 1, false, null, null, isStrictMode, identifierPrefix, null, onUncaughtError, onCaughtError, onRecoverableError, defaultOnDefaultTransitionIndicator);
  container[internalContainerInstanceKey] = options2.current;
  listenToAllSupportedEvents(container);
  return new ReactDOMRoot(options2);
}, $hydrateRoot = function(container, initialChildren, options2) {
  if (!isValidContainer(container))
    throw Error(formatProdErrorMessage(299));
  var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError, formState = null;
  options2 !== null && options2 !== undefined && (options2.unstable_strictMode === true && (isStrictMode = true), options2.identifierPrefix !== undefined && (identifierPrefix = options2.identifierPrefix), options2.onUncaughtError !== undefined && (onUncaughtError = options2.onUncaughtError), options2.onCaughtError !== undefined && (onCaughtError = options2.onCaughtError), options2.onRecoverableError !== undefined && (onRecoverableError = options2.onRecoverableError), options2.formState !== undefined && (formState = options2.formState));
  initialChildren = createFiberRoot(container, 1, true, initialChildren, options2 != null ? options2 : null, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, defaultOnDefaultTransitionIndicator);
  initialChildren.context = getContextForSubtree(null);
  options2 = initialChildren.current;
  isStrictMode = requestUpdateLane();
  isStrictMode = getBumpedLaneForHydrationByLane(isStrictMode);
  identifierPrefix = createUpdate(isStrictMode);
  identifierPrefix.callback = null;
  enqueueUpdate(options2, identifierPrefix, isStrictMode);
  options2 = isStrictMode;
  initialChildren.current.lanes = options2;
  markRootUpdated$1(initialChildren, options2);
  ensureRootIsScheduled(initialChildren);
  container[internalContainerInstanceKey] = initialChildren.current;
  listenToAllSupportedEvents(container);
  return new ReactDOMHydrationRoot(initialChildren);
}, $version = "19.2.4";
var init_react_dom_client_production = __esm(() => {
  Scheduler = __toESM(require_scheduler(), 1);
  assign = Object.assign;
  REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element");
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
  REACT_PORTAL_TYPE = Symbol.for("react.portal");
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
  REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode");
  REACT_PROFILER_TYPE = Symbol.for("react.profiler");
  REACT_CONSUMER_TYPE = Symbol.for("react.consumer");
  REACT_CONTEXT_TYPE = Symbol.for("react.context");
  REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref");
  REACT_SUSPENSE_TYPE = Symbol.for("react.suspense");
  REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list");
  REACT_MEMO_TYPE = Symbol.for("react.memo");
  REACT_LAZY_TYPE = Symbol.for("react.lazy");
  Symbol.for("react.scope");
  REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
  Symbol.for("react.legacy_hidden");
  Symbol.for("react.tracing_marker");
  REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel");
  Symbol.for("react.view_transition");
  MAYBE_ITERATOR_SYMBOL = Symbol.iterator;
  REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference");
  isArrayImpl = Array.isArray;
  ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  ReactDOMSharedInternals = ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  sharedNotPendingObject = {
    pending: false,
    data: null,
    method: null,
    action: null
  };
  valueStack = [];
  contextStackCursor = createCursor(null);
  contextFiberStackCursor = createCursor(null);
  rootInstanceStackCursor = createCursor(null);
  hostTransitionProviderCursor = createCursor(null);
  hasOwnProperty = Object.prototype.hasOwnProperty;
  scheduleCallback$3 = Scheduler.unstable_scheduleCallback;
  cancelCallback$1 = Scheduler.unstable_cancelCallback;
  shouldYield = Scheduler.unstable_shouldYield;
  requestPaint = Scheduler.unstable_requestPaint;
  now = Scheduler.unstable_now;
  getCurrentPriorityLevel = Scheduler.unstable_getCurrentPriorityLevel;
  ImmediatePriority = Scheduler.unstable_ImmediatePriority;
  UserBlockingPriority = Scheduler.unstable_UserBlockingPriority;
  NormalPriority$1 = Scheduler.unstable_NormalPriority;
  LowPriority = Scheduler.unstable_LowPriority;
  IdlePriority = Scheduler.unstable_IdlePriority;
  log$1 = Scheduler.log;
  unstable_setDisableYieldValue2 = Scheduler.unstable_setDisableYieldValue;
  clz32 = Math.clz32 ? Math.clz32 : clz32Fallback;
  log2 = Math.log;
  LN2 = Math.LN2;
  randomKey = Math.random().toString(36).slice(2);
  internalInstanceKey = "__reactFiber$" + randomKey;
  internalPropsKey = "__reactProps$" + randomKey;
  internalContainerInstanceKey = "__reactContainer$" + randomKey;
  internalEventHandlersKey = "__reactEvents$" + randomKey;
  internalEventHandlerListenersKey = "__reactListeners$" + randomKey;
  internalEventHandlesSetKey = "__reactHandles$" + randomKey;
  internalRootNodeResourcesKey = "__reactResources$" + randomKey;
  internalHoistableMarker = "__reactMarker$" + randomKey;
  allNativeEvents = new Set;
  registrationNameDependencies = {};
  VALID_ATTRIBUTE_NAME_REGEX = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$");
  illegalAttributeNameCache = {};
  validatedAttributeNameCache = {};
  escapeSelectorAttributeValueInsideDoubleQuotesRegex = /[\n"\\]/g;
  unitlessNumbers = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  aliases = new Map([
    ["acceptCharset", "accept-charset"],
    ["htmlFor", "for"],
    ["httpEquiv", "http-equiv"],
    ["crossOrigin", "crossorigin"],
    ["accentHeight", "accent-height"],
    ["alignmentBaseline", "alignment-baseline"],
    ["arabicForm", "arabic-form"],
    ["baselineShift", "baseline-shift"],
    ["capHeight", "cap-height"],
    ["clipPath", "clip-path"],
    ["clipRule", "clip-rule"],
    ["colorInterpolation", "color-interpolation"],
    ["colorInterpolationFilters", "color-interpolation-filters"],
    ["colorProfile", "color-profile"],
    ["colorRendering", "color-rendering"],
    ["dominantBaseline", "dominant-baseline"],
    ["enableBackground", "enable-background"],
    ["fillOpacity", "fill-opacity"],
    ["fillRule", "fill-rule"],
    ["floodColor", "flood-color"],
    ["floodOpacity", "flood-opacity"],
    ["fontFamily", "font-family"],
    ["fontSize", "font-size"],
    ["fontSizeAdjust", "font-size-adjust"],
    ["fontStretch", "font-stretch"],
    ["fontStyle", "font-style"],
    ["fontVariant", "font-variant"],
    ["fontWeight", "font-weight"],
    ["glyphName", "glyph-name"],
    ["glyphOrientationHorizontal", "glyph-orientation-horizontal"],
    ["glyphOrientationVertical", "glyph-orientation-vertical"],
    ["horizAdvX", "horiz-adv-x"],
    ["horizOriginX", "horiz-origin-x"],
    ["imageRendering", "image-rendering"],
    ["letterSpacing", "letter-spacing"],
    ["lightingColor", "lighting-color"],
    ["markerEnd", "marker-end"],
    ["markerMid", "marker-mid"],
    ["markerStart", "marker-start"],
    ["overlinePosition", "overline-position"],
    ["overlineThickness", "overline-thickness"],
    ["paintOrder", "paint-order"],
    ["panose-1", "panose-1"],
    ["pointerEvents", "pointer-events"],
    ["renderingIntent", "rendering-intent"],
    ["shapeRendering", "shape-rendering"],
    ["stopColor", "stop-color"],
    ["stopOpacity", "stop-opacity"],
    ["strikethroughPosition", "strikethrough-position"],
    ["strikethroughThickness", "strikethrough-thickness"],
    ["strokeDasharray", "stroke-dasharray"],
    ["strokeDashoffset", "stroke-dashoffset"],
    ["strokeLinecap", "stroke-linecap"],
    ["strokeLinejoin", "stroke-linejoin"],
    ["strokeMiterlimit", "stroke-miterlimit"],
    ["strokeOpacity", "stroke-opacity"],
    ["strokeWidth", "stroke-width"],
    ["textAnchor", "text-anchor"],
    ["textDecoration", "text-decoration"],
    ["textRendering", "text-rendering"],
    ["transformOrigin", "transform-origin"],
    ["underlinePosition", "underline-position"],
    ["underlineThickness", "underline-thickness"],
    ["unicodeBidi", "unicode-bidi"],
    ["unicodeRange", "unicode-range"],
    ["unitsPerEm", "units-per-em"],
    ["vAlphabetic", "v-alphabetic"],
    ["vHanging", "v-hanging"],
    ["vIdeographic", "v-ideographic"],
    ["vMathematical", "v-mathematical"],
    ["vectorEffect", "vector-effect"],
    ["vertAdvY", "vert-adv-y"],
    ["vertOriginX", "vert-origin-x"],
    ["vertOriginY", "vert-origin-y"],
    ["wordSpacing", "word-spacing"],
    ["writingMode", "writing-mode"],
    ["xmlnsXlink", "xmlns:xlink"],
    ["xHeight", "x-height"]
  ]);
  isJavaScriptProtocol = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  canUseDOM = !(typeof window === "undefined" || typeof window.document === "undefined" || typeof window.document.createElement === "undefined");
  if (canUseDOM)
    try {
      options = {};
      Object.defineProperty(options, "passive", {
        get: function() {
          passiveBrowserEventsSupported = true;
        }
      });
      window.addEventListener("test", options, options);
      window.removeEventListener("test", options, options);
    } catch (e) {
      passiveBrowserEventsSupported = false;
    }
  EventInterface = {
    eventPhase: 0,
    bubbles: 0,
    cancelable: 0,
    timeStamp: function(event) {
      return event.timeStamp || Date.now();
    },
    defaultPrevented: 0,
    isTrusted: 0
  };
  SyntheticEvent = createSyntheticEvent(EventInterface);
  UIEventInterface = assign({}, EventInterface, { view: 0, detail: 0 });
  SyntheticUIEvent = createSyntheticEvent(UIEventInterface);
  MouseEventInterface = assign({}, UIEventInterface, {
    screenX: 0,
    screenY: 0,
    clientX: 0,
    clientY: 0,
    pageX: 0,
    pageY: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    getModifierState: getEventModifierState,
    button: 0,
    buttons: 0,
    relatedTarget: function(event) {
      return event.relatedTarget === undefined ? event.fromElement === event.srcElement ? event.toElement : event.fromElement : event.relatedTarget;
    },
    movementX: function(event) {
      if ("movementX" in event)
        return event.movementX;
      event !== lastMouseEvent && (lastMouseEvent && event.type === "mousemove" ? (lastMovementX = event.screenX - lastMouseEvent.screenX, lastMovementY = event.screenY - lastMouseEvent.screenY) : lastMovementY = lastMovementX = 0, lastMouseEvent = event);
      return lastMovementX;
    },
    movementY: function(event) {
      return "movementY" in event ? event.movementY : lastMovementY;
    }
  });
  SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface);
  DragEventInterface = assign({}, MouseEventInterface, { dataTransfer: 0 });
  SyntheticDragEvent = createSyntheticEvent(DragEventInterface);
  FocusEventInterface = assign({}, UIEventInterface, { relatedTarget: 0 });
  SyntheticFocusEvent = createSyntheticEvent(FocusEventInterface);
  AnimationEventInterface = assign({}, EventInterface, {
    animationName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  });
  SyntheticAnimationEvent = createSyntheticEvent(AnimationEventInterface);
  ClipboardEventInterface = assign({}, EventInterface, {
    clipboardData: function(event) {
      return "clipboardData" in event ? event.clipboardData : window.clipboardData;
    }
  });
  SyntheticClipboardEvent = createSyntheticEvent(ClipboardEventInterface);
  CompositionEventInterface = assign({}, EventInterface, { data: 0 });
  SyntheticCompositionEvent = createSyntheticEvent(CompositionEventInterface);
  normalizeKey = {
    Esc: "Escape",
    Spacebar: " ",
    Left: "ArrowLeft",
    Up: "ArrowUp",
    Right: "ArrowRight",
    Down: "ArrowDown",
    Del: "Delete",
    Win: "OS",
    Menu: "ContextMenu",
    Apps: "ContextMenu",
    Scroll: "ScrollLock",
    MozPrintableKey: "Unidentified"
  };
  translateToKey = {
    8: "Backspace",
    9: "Tab",
    12: "Clear",
    13: "Enter",
    16: "Shift",
    17: "Control",
    18: "Alt",
    19: "Pause",
    20: "CapsLock",
    27: "Escape",
    32: " ",
    33: "PageUp",
    34: "PageDown",
    35: "End",
    36: "Home",
    37: "ArrowLeft",
    38: "ArrowUp",
    39: "ArrowRight",
    40: "ArrowDown",
    45: "Insert",
    46: "Delete",
    112: "F1",
    113: "F2",
    114: "F3",
    115: "F4",
    116: "F5",
    117: "F6",
    118: "F7",
    119: "F8",
    120: "F9",
    121: "F10",
    122: "F11",
    123: "F12",
    144: "NumLock",
    145: "ScrollLock",
    224: "Meta"
  };
  modifierKeyToProp = {
    Alt: "altKey",
    Control: "ctrlKey",
    Meta: "metaKey",
    Shift: "shiftKey"
  };
  KeyboardEventInterface = assign({}, UIEventInterface, {
    key: function(nativeEvent) {
      if (nativeEvent.key) {
        var key = normalizeKey[nativeEvent.key] || nativeEvent.key;
        if (key !== "Unidentified")
          return key;
      }
      return nativeEvent.type === "keypress" ? (nativeEvent = getEventCharCode(nativeEvent), nativeEvent === 13 ? "Enter" : String.fromCharCode(nativeEvent)) : nativeEvent.type === "keydown" || nativeEvent.type === "keyup" ? translateToKey[nativeEvent.keyCode] || "Unidentified" : "";
    },
    code: 0,
    location: 0,
    ctrlKey: 0,
    shiftKey: 0,
    altKey: 0,
    metaKey: 0,
    repeat: 0,
    locale: 0,
    getModifierState: getEventModifierState,
    charCode: function(event) {
      return event.type === "keypress" ? getEventCharCode(event) : 0;
    },
    keyCode: function(event) {
      return event.type === "keydown" || event.type === "keyup" ? event.keyCode : 0;
    },
    which: function(event) {
      return event.type === "keypress" ? getEventCharCode(event) : event.type === "keydown" || event.type === "keyup" ? event.keyCode : 0;
    }
  });
  SyntheticKeyboardEvent = createSyntheticEvent(KeyboardEventInterface);
  PointerEventInterface = assign({}, MouseEventInterface, {
    pointerId: 0,
    width: 0,
    height: 0,
    pressure: 0,
    tangentialPressure: 0,
    tiltX: 0,
    tiltY: 0,
    twist: 0,
    pointerType: 0,
    isPrimary: 0
  });
  SyntheticPointerEvent = createSyntheticEvent(PointerEventInterface);
  TouchEventInterface = assign({}, UIEventInterface, {
    touches: 0,
    targetTouches: 0,
    changedTouches: 0,
    altKey: 0,
    metaKey: 0,
    ctrlKey: 0,
    shiftKey: 0,
    getModifierState: getEventModifierState
  });
  SyntheticTouchEvent = createSyntheticEvent(TouchEventInterface);
  TransitionEventInterface = assign({}, EventInterface, {
    propertyName: 0,
    elapsedTime: 0,
    pseudoElement: 0
  });
  SyntheticTransitionEvent = createSyntheticEvent(TransitionEventInterface);
  WheelEventInterface = assign({}, MouseEventInterface, {
    deltaX: function(event) {
      return "deltaX" in event ? event.deltaX : ("wheelDeltaX" in event) ? -event.wheelDeltaX : 0;
    },
    deltaY: function(event) {
      return "deltaY" in event ? event.deltaY : ("wheelDeltaY" in event) ? -event.wheelDeltaY : ("wheelDelta" in event) ? -event.wheelDelta : 0;
    },
    deltaZ: 0,
    deltaMode: 0
  });
  SyntheticWheelEvent = createSyntheticEvent(WheelEventInterface);
  ToggleEventInterface = assign({}, EventInterface, {
    newState: 0,
    oldState: 0
  });
  SyntheticToggleEvent = createSyntheticEvent(ToggleEventInterface);
  END_KEYCODES = [9, 13, 27, 32];
  canUseCompositionEvent = canUseDOM && "CompositionEvent" in window;
  canUseDOM && "documentMode" in document && (documentMode = document.documentMode);
  canUseTextInputEvent = canUseDOM && "TextEvent" in window && !documentMode;
  useFallbackCompositionData = canUseDOM && (!canUseCompositionEvent || documentMode && 8 < documentMode && 11 >= documentMode);
  SPACEBAR_CHAR = String.fromCharCode(32);
  supportedInputTypes = {
    color: true,
    date: true,
    datetime: true,
    "datetime-local": true,
    email: true,
    month: true,
    number: true,
    password: true,
    range: true,
    search: true,
    tel: true,
    text: true,
    time: true,
    url: true,
    week: true
  };
  if (canUseDOM) {
    if (canUseDOM) {
      isSupported$jscomp$inline_427 = "oninput" in document;
      if (!isSupported$jscomp$inline_427) {
        element$jscomp$inline_428 = document.createElement("div");
        element$jscomp$inline_428.setAttribute("oninput", "return;");
        isSupported$jscomp$inline_427 = typeof element$jscomp$inline_428.oninput === "function";
      }
      JSCompiler_inline_result$jscomp$286 = isSupported$jscomp$inline_427;
    } else
      JSCompiler_inline_result$jscomp$286 = false;
    isInputEventSupported = JSCompiler_inline_result$jscomp$286 && (!document.documentMode || 9 < document.documentMode);
  }
  objectIs = typeof Object.is === "function" ? Object.is : is;
  skipSelectionChangeEvent = canUseDOM && "documentMode" in document && 11 >= document.documentMode;
  vendorPrefixes = {
    animationend: makePrefixMap("Animation", "AnimationEnd"),
    animationiteration: makePrefixMap("Animation", "AnimationIteration"),
    animationstart: makePrefixMap("Animation", "AnimationStart"),
    transitionrun: makePrefixMap("Transition", "TransitionRun"),
    transitionstart: makePrefixMap("Transition", "TransitionStart"),
    transitioncancel: makePrefixMap("Transition", "TransitionCancel"),
    transitionend: makePrefixMap("Transition", "TransitionEnd")
  };
  prefixedEventNames = {};
  style = {};
  canUseDOM && (style = document.createElement("div").style, ("AnimationEvent" in window) || (delete vendorPrefixes.animationend.animation, delete vendorPrefixes.animationiteration.animation, delete vendorPrefixes.animationstart.animation), ("TransitionEvent" in window) || delete vendorPrefixes.transitionend.transition);
  ANIMATION_END = getVendorPrefixedEventName("animationend");
  ANIMATION_ITERATION = getVendorPrefixedEventName("animationiteration");
  ANIMATION_START = getVendorPrefixedEventName("animationstart");
  TRANSITION_RUN = getVendorPrefixedEventName("transitionrun");
  TRANSITION_START = getVendorPrefixedEventName("transitionstart");
  TRANSITION_CANCEL = getVendorPrefixedEventName("transitioncancel");
  TRANSITION_END = getVendorPrefixedEventName("transitionend");
  topLevelEventsToReactNames = new Map;
  simpleEventPluginEvents = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  simpleEventPluginEvents.push("scrollEnd");
  reportGlobalError = typeof reportError === "function" ? reportError : function(error) {
    if (typeof window === "object" && typeof window.ErrorEvent === "function") {
      var event = new window.ErrorEvent("error", {
        bubbles: true,
        cancelable: true,
        message: typeof error === "object" && error !== null && typeof error.message === "string" ? String(error.message) : String(error),
        error
      });
      if (!window.dispatchEvent(event))
        return;
    } else if (typeof process === "object" && typeof process.emit === "function") {
      process.emit("uncaughtException", error);
      return;
    }
    console.error(error);
  };
  concurrentQueues = [];
  emptyContextObject = {};
  CapturedStacks = new WeakMap;
  forkStack = [];
  idStack = [];
  HydrationMismatchException = Error(formatProdErrorMessage(519));
  valueCursor = createCursor(null);
  AbortControllerLocal = typeof AbortController !== "undefined" ? AbortController : function() {
    var listeners = [], signal = this.signal = {
      aborted: false,
      addEventListener: function(type, listener) {
        listeners.push(listener);
      }
    };
    this.abort = function() {
      signal.aborted = true;
      listeners.forEach(function(listener) {
        return listener();
      });
    };
  };
  scheduleCallback$2 = Scheduler.unstable_scheduleCallback;
  NormalPriority = Scheduler.unstable_NormalPriority;
  CacheContext = {
    $$typeof: REACT_CONTEXT_TYPE,
    Consumer: null,
    Provider: null,
    _currentValue: null,
    _currentValue2: null,
    _threadCount: 0
  };
  prevOnStartTransitionFinish = ReactSharedInternals.S;
  ReactSharedInternals.S = function(transition, returnValue) {
    globalMostRecentTransitionTime = now();
    typeof returnValue === "object" && returnValue !== null && typeof returnValue.then === "function" && entangleAsyncAction(transition, returnValue);
    prevOnStartTransitionFinish !== null && prevOnStartTransitionFinish(transition, returnValue);
  };
  resumedCache = createCursor(null);
  SuspenseException = Error(formatProdErrorMessage(460));
  SuspenseyCommitException = Error(formatProdErrorMessage(474));
  SuspenseActionException = Error(formatProdErrorMessage(542));
  noopSuspenseyCommitThenable = { then: function() {} };
  reconcileChildFibers = createChildReconciler(true);
  mountChildFibers = createChildReconciler(false);
  currentTreeHiddenStackCursor = createCursor(null);
  prevEntangledRenderLanesCursor = createCursor(0);
  suspenseHandlerStackCursor = createCursor(null);
  suspenseStackCursor = createCursor(0);
  ContextOnlyDispatcher = {
    readContext,
    use,
    useCallback: throwInvalidHookError,
    useContext: throwInvalidHookError,
    useEffect: throwInvalidHookError,
    useImperativeHandle: throwInvalidHookError,
    useLayoutEffect: throwInvalidHookError,
    useInsertionEffect: throwInvalidHookError,
    useMemo: throwInvalidHookError,
    useReducer: throwInvalidHookError,
    useRef: throwInvalidHookError,
    useState: throwInvalidHookError,
    useDebugValue: throwInvalidHookError,
    useDeferredValue: throwInvalidHookError,
    useTransition: throwInvalidHookError,
    useSyncExternalStore: throwInvalidHookError,
    useId: throwInvalidHookError,
    useHostTransitionStatus: throwInvalidHookError,
    useFormState: throwInvalidHookError,
    useActionState: throwInvalidHookError,
    useOptimistic: throwInvalidHookError,
    useMemoCache: throwInvalidHookError,
    useCacheRefresh: throwInvalidHookError
  };
  ContextOnlyDispatcher.useEffectEvent = throwInvalidHookError;
  HooksDispatcherOnMount = {
    readContext,
    use,
    useCallback: function(callback, deps) {
      mountWorkInProgressHook().memoizedState = [
        callback,
        deps === undefined ? null : deps
      ];
      return callback;
    },
    useContext: readContext,
    useEffect: mountEffect,
    useImperativeHandle: function(ref, create, deps) {
      deps = deps !== null && deps !== undefined ? deps.concat([ref]) : null;
      mountEffectImpl(4194308, 4, imperativeHandleEffect.bind(null, create, ref), deps);
    },
    useLayoutEffect: function(create, deps) {
      return mountEffectImpl(4194308, 4, create, deps);
    },
    useInsertionEffect: function(create, deps) {
      mountEffectImpl(4, 2, create, deps);
    },
    useMemo: function(nextCreate, deps) {
      var hook = mountWorkInProgressHook();
      deps = deps === undefined ? null : deps;
      var nextValue = nextCreate();
      if (shouldDoubleInvokeUserFnsInHooksDEV) {
        setIsStrictModeForDevtools(true);
        try {
          nextCreate();
        } finally {
          setIsStrictModeForDevtools(false);
        }
      }
      hook.memoizedState = [nextValue, deps];
      return nextValue;
    },
    useReducer: function(reducer, initialArg, init) {
      var hook = mountWorkInProgressHook();
      if (init !== undefined) {
        var initialState = init(initialArg);
        if (shouldDoubleInvokeUserFnsInHooksDEV) {
          setIsStrictModeForDevtools(true);
          try {
            init(initialArg);
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
      } else
        initialState = initialArg;
      hook.memoizedState = hook.baseState = initialState;
      reducer = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: reducer,
        lastRenderedState: initialState
      };
      hook.queue = reducer;
      reducer = reducer.dispatch = dispatchReducerAction.bind(null, currentlyRenderingFiber, reducer);
      return [hook.memoizedState, reducer];
    },
    useRef: function(initialValue) {
      var hook = mountWorkInProgressHook();
      initialValue = { current: initialValue };
      return hook.memoizedState = initialValue;
    },
    useState: function(initialState) {
      initialState = mountStateImpl(initialState);
      var queue = initialState.queue, dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
      queue.dispatch = dispatch;
      return [initialState.memoizedState, dispatch];
    },
    useDebugValue: mountDebugValue,
    useDeferredValue: function(value, initialValue) {
      var hook = mountWorkInProgressHook();
      return mountDeferredValueImpl(hook, value, initialValue);
    },
    useTransition: function() {
      var stateHook = mountStateImpl(false);
      stateHook = startTransition.bind(null, currentlyRenderingFiber, stateHook.queue, true, false);
      mountWorkInProgressHook().memoizedState = stateHook;
      return [false, stateHook];
    },
    useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
      var fiber = currentlyRenderingFiber, hook = mountWorkInProgressHook();
      if (isHydrating) {
        if (getServerSnapshot === undefined)
          throw Error(formatProdErrorMessage(407));
        getServerSnapshot = getServerSnapshot();
      } else {
        getServerSnapshot = getSnapshot();
        if (workInProgressRoot === null)
          throw Error(formatProdErrorMessage(349));
        (workInProgressRootRenderLanes & 127) !== 0 || pushStoreConsistencyCheck(fiber, getSnapshot, getServerSnapshot);
      }
      hook.memoizedState = getServerSnapshot;
      var inst = { value: getServerSnapshot, getSnapshot };
      hook.queue = inst;
      mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [
        subscribe
      ]);
      fiber.flags |= 2048;
      pushSimpleEffect(9, { destroy: undefined }, updateStoreInstance.bind(null, fiber, inst, getServerSnapshot, getSnapshot), null);
      return getServerSnapshot;
    },
    useId: function() {
      var hook = mountWorkInProgressHook(), identifierPrefix = workInProgressRoot.identifierPrefix;
      if (isHydrating) {
        var JSCompiler_inline_result = treeContextOverflow;
        var idWithLeadingBit = treeContextId;
        JSCompiler_inline_result = (idWithLeadingBit & ~(1 << 32 - clz32(idWithLeadingBit) - 1)).toString(32) + JSCompiler_inline_result;
        identifierPrefix = "_" + identifierPrefix + "R_" + JSCompiler_inline_result;
        JSCompiler_inline_result = localIdCounter++;
        0 < JSCompiler_inline_result && (identifierPrefix += "H" + JSCompiler_inline_result.toString(32));
        identifierPrefix += "_";
      } else
        JSCompiler_inline_result = globalClientIdCounter++, identifierPrefix = "_" + identifierPrefix + "r_" + JSCompiler_inline_result.toString(32) + "_";
      return hook.memoizedState = identifierPrefix;
    },
    useHostTransitionStatus,
    useFormState: mountActionState,
    useActionState: mountActionState,
    useOptimistic: function(passthrough) {
      var hook = mountWorkInProgressHook();
      hook.memoizedState = hook.baseState = passthrough;
      var queue = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: null,
        lastRenderedState: null
      };
      hook.queue = queue;
      hook = dispatchOptimisticSetState.bind(null, currentlyRenderingFiber, true, queue);
      queue.dispatch = hook;
      return [passthrough, hook];
    },
    useMemoCache,
    useCacheRefresh: function() {
      return mountWorkInProgressHook().memoizedState = refreshCache.bind(null, currentlyRenderingFiber);
    },
    useEffectEvent: function(callback) {
      var hook = mountWorkInProgressHook(), ref = { impl: callback };
      hook.memoizedState = ref;
      return function() {
        if ((executionContext & 2) !== 0)
          throw Error(formatProdErrorMessage(440));
        return ref.impl.apply(undefined, arguments);
      };
    }
  };
  HooksDispatcherOnUpdate = {
    readContext,
    use,
    useCallback: updateCallback,
    useContext: readContext,
    useEffect: updateEffect,
    useImperativeHandle: updateImperativeHandle,
    useInsertionEffect: updateInsertionEffect,
    useLayoutEffect: updateLayoutEffect,
    useMemo: updateMemo,
    useReducer: updateReducer,
    useRef: updateRef,
    useState: function() {
      return updateReducer(basicStateReducer);
    },
    useDebugValue: mountDebugValue,
    useDeferredValue: function(value, initialValue) {
      var hook = updateWorkInProgressHook();
      return updateDeferredValueImpl(hook, currentHook.memoizedState, value, initialValue);
    },
    useTransition: function() {
      var booleanOrThenable = updateReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
      return [
        typeof booleanOrThenable === "boolean" ? booleanOrThenable : useThenable(booleanOrThenable),
        start
      ];
    },
    useSyncExternalStore: updateSyncExternalStore,
    useId: updateId,
    useHostTransitionStatus,
    useFormState: updateActionState,
    useActionState: updateActionState,
    useOptimistic: function(passthrough, reducer) {
      var hook = updateWorkInProgressHook();
      return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
    },
    useMemoCache,
    useCacheRefresh: updateRefresh
  };
  HooksDispatcherOnUpdate.useEffectEvent = updateEvent;
  HooksDispatcherOnRerender = {
    readContext,
    use,
    useCallback: updateCallback,
    useContext: readContext,
    useEffect: updateEffect,
    useImperativeHandle: updateImperativeHandle,
    useInsertionEffect: updateInsertionEffect,
    useLayoutEffect: updateLayoutEffect,
    useMemo: updateMemo,
    useReducer: rerenderReducer,
    useRef: updateRef,
    useState: function() {
      return rerenderReducer(basicStateReducer);
    },
    useDebugValue: mountDebugValue,
    useDeferredValue: function(value, initialValue) {
      var hook = updateWorkInProgressHook();
      return currentHook === null ? mountDeferredValueImpl(hook, value, initialValue) : updateDeferredValueImpl(hook, currentHook.memoizedState, value, initialValue);
    },
    useTransition: function() {
      var booleanOrThenable = rerenderReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
      return [
        typeof booleanOrThenable === "boolean" ? booleanOrThenable : useThenable(booleanOrThenable),
        start
      ];
    },
    useSyncExternalStore: updateSyncExternalStore,
    useId: updateId,
    useHostTransitionStatus,
    useFormState: rerenderActionState,
    useActionState: rerenderActionState,
    useOptimistic: function(passthrough, reducer) {
      var hook = updateWorkInProgressHook();
      if (currentHook !== null)
        return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
      hook.baseState = passthrough;
      return [passthrough, hook.queue.dispatch];
    },
    useMemoCache,
    useCacheRefresh: updateRefresh
  };
  HooksDispatcherOnRerender.useEffectEvent = updateEvent;
  classComponentUpdater = {
    enqueueSetState: function(inst, payload, callback) {
      inst = inst._reactInternals;
      var lane = requestUpdateLane(), update = createUpdate(lane);
      update.payload = payload;
      callback !== undefined && callback !== null && (update.callback = callback);
      payload = enqueueUpdate(inst, update, lane);
      payload !== null && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
    },
    enqueueReplaceState: function(inst, payload, callback) {
      inst = inst._reactInternals;
      var lane = requestUpdateLane(), update = createUpdate(lane);
      update.tag = 1;
      update.payload = payload;
      callback !== undefined && callback !== null && (update.callback = callback);
      payload = enqueueUpdate(inst, update, lane);
      payload !== null && (scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
    },
    enqueueForceUpdate: function(inst, callback) {
      inst = inst._reactInternals;
      var lane = requestUpdateLane(), update = createUpdate(lane);
      update.tag = 2;
      callback !== undefined && callback !== null && (update.callback = callback);
      callback = enqueueUpdate(inst, update, lane);
      callback !== null && (scheduleUpdateOnFiber(callback, inst, lane), entangleTransitions(callback, inst, lane));
    }
  };
  SelectiveHydrationException = Error(formatProdErrorMessage(461));
  SUSPENDED_MARKER = {
    dehydrated: null,
    treeContext: null,
    retryLane: 0,
    hydrationErrors: null
  };
  PossiblyWeakSet = typeof WeakSet === "function" ? WeakSet : Set;
  DefaultAsyncDispatcher = {
    getCacheForType: function(resourceType) {
      var cache = readContext(CacheContext), cacheForType = cache.data.get(resourceType);
      cacheForType === undefined && (cacheForType = resourceType(), cache.data.set(resourceType, cacheForType));
      return cacheForType;
    },
    cacheSignal: function() {
      return readContext(CacheContext).controller.signal;
    }
  };
  PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map;
  for (i$jscomp$inline_1577 = 0;i$jscomp$inline_1577 < simpleEventPluginEvents.length; i$jscomp$inline_1577++) {
    eventName$jscomp$inline_1578 = simpleEventPluginEvents[i$jscomp$inline_1577], domEventName$jscomp$inline_1579 = eventName$jscomp$inline_1578.toLowerCase(), capitalizedEvent$jscomp$inline_1580 = eventName$jscomp$inline_1578[0].toUpperCase() + eventName$jscomp$inline_1578.slice(1);
    registerSimpleEvent(domEventName$jscomp$inline_1579, "on" + capitalizedEvent$jscomp$inline_1580);
  }
  registerSimpleEvent(ANIMATION_END, "onAnimationEnd");
  registerSimpleEvent(ANIMATION_ITERATION, "onAnimationIteration");
  registerSimpleEvent(ANIMATION_START, "onAnimationStart");
  registerSimpleEvent("dblclick", "onDoubleClick");
  registerSimpleEvent("focusin", "onFocus");
  registerSimpleEvent("focusout", "onBlur");
  registerSimpleEvent(TRANSITION_RUN, "onTransitionRun");
  registerSimpleEvent(TRANSITION_START, "onTransitionStart");
  registerSimpleEvent(TRANSITION_CANCEL, "onTransitionCancel");
  registerSimpleEvent(TRANSITION_END, "onTransitionEnd");
  registerDirectEvent("onMouseEnter", ["mouseout", "mouseover"]);
  registerDirectEvent("onMouseLeave", ["mouseout", "mouseover"]);
  registerDirectEvent("onPointerEnter", ["pointerout", "pointerover"]);
  registerDirectEvent("onPointerLeave", ["pointerout", "pointerover"]);
  registerTwoPhaseEvent("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" "));
  registerTwoPhaseEvent("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" "));
  registerTwoPhaseEvent("onBeforeInput", [
    "compositionend",
    "keypress",
    "textInput",
    "paste"
  ]);
  registerTwoPhaseEvent("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" "));
  registerTwoPhaseEvent("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" "));
  registerTwoPhaseEvent("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  mediaEventTypes = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" ");
  nonDelegatedEvents = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(mediaEventTypes));
  listeningMarker = "_reactListening" + Math.random().toString(36).slice(2);
  NORMALIZE_NEWLINES_REGEX = /\r\n?/g;
  NORMALIZE_NULL_AND_REPLACEMENT_REGEX = /\u0000|\uFFFD/g;
  scheduleTimeout = typeof setTimeout === "function" ? setTimeout : undefined;
  cancelTimeout = typeof clearTimeout === "function" ? clearTimeout : undefined;
  localPromise = typeof Promise === "function" ? Promise : undefined;
  scheduleMicrotask = typeof queueMicrotask === "function" ? queueMicrotask : typeof localPromise !== "undefined" ? function(callback) {
    return localPromise.resolve(null).then(callback).catch(handleErrorInNextTick);
  } : scheduleTimeout;
  preloadPropsMap = new Map;
  preconnectsSet = new Set;
  previousDispatcher = ReactDOMSharedInternals.d;
  ReactDOMSharedInternals.d = {
    f: flushSyncWork,
    r: requestFormReset,
    D: prefetchDNS,
    C: preconnect,
    L: preload,
    m: preloadModule,
    X: preinitScript,
    S: preinitStyle,
    M: preinitModuleScript
  };
  globalDocument = typeof document === "undefined" ? null : document;
  HostTransitionContext = {
    $$typeof: REACT_CONTEXT_TYPE,
    Provider: null,
    Consumer: null,
    _currentValue: sharedNotPendingObject,
    _currentValue2: sharedNotPendingObject,
    _threadCount: 0
  };
  queuedPointers = new Map;
  queuedPointerCaptures = new Map;
  queuedExplicitHydrationTargets = [];
  discreteReplayableEvents = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function(children) {
    var root2 = this._internalRoot;
    if (root2 === null)
      throw Error(formatProdErrorMessage(409));
    var current = root2.current, lane = requestUpdateLane();
    updateContainerImpl(current, lane, children, root2, null, null);
  };
  ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function() {
    var root2 = this._internalRoot;
    if (root2 !== null) {
      this._internalRoot = null;
      var container = root2.containerInfo;
      updateContainerImpl(root2.current, 2, null, root2, null, null);
      flushSyncWork$1();
      container[internalContainerInstanceKey] = null;
    }
  };
  ReactDOMHydrationRoot.prototype.unstable_scheduleHydration = function(target) {
    if (target) {
      var updatePriority = resolveUpdatePriority();
      target = { blockedOn: null, target, priority: updatePriority };
      for (var i = 0;i < queuedExplicitHydrationTargets.length && updatePriority !== 0 && updatePriority < queuedExplicitHydrationTargets[i].priority; i++)
        ;
      queuedExplicitHydrationTargets.splice(i, 0, target);
      i === 0 && attemptExplicitHydrationTarget(target);
    }
  };
  isomorphicReactPackageVersion$jscomp$inline_1840 = React.version;
  if (isomorphicReactPackageVersion$jscomp$inline_1840 !== "19.2.4")
    throw Error(formatProdErrorMessage(527, isomorphicReactPackageVersion$jscomp$inline_1840, "19.2.4"));
  ReactDOMSharedInternals.findDOMNode = function(componentOrElement) {
    var fiber = componentOrElement._reactInternals;
    if (fiber === undefined) {
      if (typeof componentOrElement.render === "function")
        throw Error(formatProdErrorMessage(188));
      componentOrElement = Object.keys(componentOrElement).join(",");
      throw Error(formatProdErrorMessage(268, componentOrElement));
    }
    componentOrElement = findCurrentFiberUsingSlowPath(fiber);
    componentOrElement = componentOrElement !== null ? findCurrentHostFiberImpl(componentOrElement) : null;
    componentOrElement = componentOrElement === null ? null : componentOrElement.stateNode;
    return componentOrElement;
  };
  internals$jscomp$inline_2347 = {
    bundleType: 0,
    version: "19.2.4",
    rendererPackageName: "react-dom",
    currentDispatcherRef: ReactSharedInternals,
    reconcilerVersion: "19.2.4"
  };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined") {
    hook$jscomp$inline_2348 = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!hook$jscomp$inline_2348.isDisabled && hook$jscomp$inline_2348.supportsFiber)
      try {
        rendererID = hook$jscomp$inline_2348.inject(internals$jscomp$inline_2347), injectedHook = hook$jscomp$inline_2348;
      } catch (err) {}
  }
});

// node_modules/react-dom/client.js
var require_client = __commonJS((exports, module) => {
  init_react_dom_client_production();
  function checkDCE() {
    if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== "function") {
      return;
    }
    if (false) {}
    try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
    } catch (err) {
      console.error(err);
    }
  }
  if (true) {
    checkDCE();
    module.exports = exports_react_dom_client_production;
  } else {}
});
export default require_client();
