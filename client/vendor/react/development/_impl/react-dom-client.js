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

// node_modules/scheduler/cjs/scheduler.development.js
var require_scheduler_development = __commonJS((exports) => {
  (function() {
    function performWorkUntilDeadline() {
      needsPaint = false;
      if (isMessageLoopRunning) {
        var currentTime = exports.unstable_now();
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
                    currentTime = exports.unstable_now();
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
      return needsPaint ? true : exports.unstable_now() - startTime < frameInterval ? false : true;
    }
    function requestHostTimeout(callback, ms) {
      taskTimeoutID = localSetTimeout(function() {
        callback(exports.unstable_now());
      }, ms);
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
    exports.unstable_now = undefined;
    if (typeof performance === "object" && typeof performance.now === "function") {
      var localPerformance = performance;
      exports.unstable_now = function() {
        return localPerformance.now();
      };
    } else {
      var localDate = Date, initialTime = localDate.now();
      exports.unstable_now = function() {
        return localDate.now() - initialTime;
      };
    }
    var taskQueue = [], timerQueue = [], taskIdCounter = 1, currentTask = null, currentPriorityLevel = 3, isPerformingWork = false, isHostCallbackScheduled = false, isHostTimeoutScheduled = false, needsPaint = false, localSetTimeout = typeof setTimeout === "function" ? setTimeout : null, localClearTimeout = typeof clearTimeout === "function" ? clearTimeout : null, localSetImmediate = typeof setImmediate !== "undefined" ? setImmediate : null, isMessageLoopRunning = false, taskTimeoutID = -1, frameInterval = 5, startTime = -1;
    if (typeof localSetImmediate === "function")
      var schedulePerformWorkUntilDeadline = function() {
        localSetImmediate(performWorkUntilDeadline);
      };
    else if (typeof MessageChannel !== "undefined") {
      var channel = new MessageChannel, port = channel.port2;
      channel.port1.onmessage = performWorkUntilDeadline;
      schedulePerformWorkUntilDeadline = function() {
        port.postMessage(null);
      };
    } else
      schedulePerformWorkUntilDeadline = function() {
        localSetTimeout(performWorkUntilDeadline, 0);
      };
    exports.unstable_IdlePriority = 5;
    exports.unstable_ImmediatePriority = 1;
    exports.unstable_LowPriority = 4;
    exports.unstable_NormalPriority = 3;
    exports.unstable_Profiling = null;
    exports.unstable_UserBlockingPriority = 2;
    exports.unstable_cancelCallback = function(task) {
      task.callback = null;
    };
    exports.unstable_forceFrameRate = function(fps) {
      0 > fps || 125 < fps ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : frameInterval = 0 < fps ? Math.floor(1000 / fps) : 5;
    };
    exports.unstable_getCurrentPriorityLevel = function() {
      return currentPriorityLevel;
    };
    exports.unstable_next = function(eventHandler) {
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
    };
    exports.unstable_requestPaint = function() {
      needsPaint = true;
    };
    exports.unstable_runWithPriority = function(priorityLevel, eventHandler) {
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
    };
    exports.unstable_scheduleCallback = function(priorityLevel, callback, options) {
      var currentTime = exports.unstable_now();
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
    };
    exports.unstable_shouldYield = shouldYieldToHost;
    exports.unstable_wrapCallback = function(callback) {
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
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })();
});

// node_modules/scheduler/index.js
var require_scheduler = __commonJS((exports, module) => {
  var scheduler_development = __toESM(require_scheduler_development());
  if (false) {} else {
    module.exports = scheduler_development;
  }
});

// node_modules/react-dom/cjs/react-dom-client.development.js
import * as React from "react";
import * as ReactDOM from "react-dom";
var require_react_dom_client_development = __commonJS((exports) => {
  var Scheduler = __toESM(require_scheduler());
  (function() {
    function findHook(fiber, id) {
      for (fiber = fiber.memoizedState;fiber !== null && 0 < id; )
        fiber = fiber.next, id--;
      return fiber;
    }
    function copyWithSetImpl(obj, path, index, value) {
      if (index >= path.length)
        return value;
      var key = path[index], updated = isArrayImpl(obj) ? obj.slice() : assign({}, obj);
      updated[key] = copyWithSetImpl(obj[key], path, index + 1, value);
      return updated;
    }
    function copyWithRename(obj, oldPath, newPath) {
      if (oldPath.length !== newPath.length)
        console.warn("copyWithRename() expects paths of the same length");
      else {
        for (var i = 0;i < newPath.length - 1; i++)
          if (oldPath[i] !== newPath[i]) {
            console.warn("copyWithRename() expects paths to be the same except for the deepest key");
            return;
          }
        return copyWithRenameImpl(obj, oldPath, newPath, 0);
      }
    }
    function copyWithRenameImpl(obj, oldPath, newPath, index) {
      var oldKey = oldPath[index], updated = isArrayImpl(obj) ? obj.slice() : assign({}, obj);
      index + 1 === oldPath.length ? (updated[newPath[index]] = updated[oldKey], isArrayImpl(updated) ? updated.splice(oldKey, 1) : delete updated[oldKey]) : updated[oldKey] = copyWithRenameImpl(obj[oldKey], oldPath, newPath, index + 1);
      return updated;
    }
    function copyWithDeleteImpl(obj, path, index) {
      var key = path[index], updated = isArrayImpl(obj) ? obj.slice() : assign({}, obj);
      if (index + 1 === path.length)
        return isArrayImpl(updated) ? updated.splice(key, 1) : delete updated[key], updated;
      updated[key] = copyWithDeleteImpl(obj[key], path, index + 1);
      return updated;
    }
    function shouldSuspendImpl() {
      return false;
    }
    function shouldErrorImpl() {
      return null;
    }
    function warnInvalidHookAccess() {
      console.error("Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks");
    }
    function warnInvalidContextAccess() {
      console.error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().");
    }
    function noop() {}
    function warnForMissingKey() {}
    function setToSortedString(set) {
      var array = [];
      set.forEach(function(value) {
        array.push(value);
      });
      return array.sort().join(", ");
    }
    function createFiber(tag, pendingProps, key, mode) {
      return new FiberNode(tag, pendingProps, key, mode);
    }
    function scheduleRoot(root2, element) {
      root2.context === emptyContextObject && (updateContainerImpl(root2.current, 2, element, root2, null, null), flushSyncWork$1());
    }
    function scheduleRefresh(root2, update) {
      if (resolveFamily !== null) {
        var staleFamilies = update.staleFamilies;
        update = update.updatedFamilies;
        flushPendingEffects();
        scheduleFibersWithFamiliesRecursively(root2.current, update, staleFamilies);
        flushSyncWork$1();
      }
    }
    function setRefreshHandler(handler) {
      resolveFamily = handler;
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
        throw Error("Unable to find node on an unmounted component.");
    }
    function findCurrentFiberUsingSlowPath(fiber) {
      var alternate = fiber.alternate;
      if (!alternate) {
        alternate = getNearestMountedFiber(fiber);
        if (alternate === null)
          throw Error("Unable to find node on an unmounted component.");
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
          throw Error("Unable to find node on an unmounted component.");
        }
        if (a.return !== b.return)
          a = parentA, b = parentB;
        else {
          for (var didFindChild = false, _child = parentA.child;_child; ) {
            if (_child === a) {
              didFindChild = true;
              a = parentA;
              b = parentB;
              break;
            }
            if (_child === b) {
              didFindChild = true;
              b = parentA;
              a = parentB;
              break;
            }
            _child = _child.sibling;
          }
          if (!didFindChild) {
            for (_child = parentB.child;_child; ) {
              if (_child === a) {
                didFindChild = true;
                a = parentB;
                b = parentA;
                break;
              }
              if (_child === b) {
                didFindChild = true;
                b = parentB;
                a = parentA;
                break;
              }
              _child = _child.sibling;
            }
            if (!didFindChild)
              throw Error("Child was not found in either parent set. This indicates a bug in React related to the return pointer. Please file an issue.");
          }
        }
        if (a.alternate !== b)
          throw Error("Return fibers should always be each others' alternates. This error is likely caused by a bug in React. Please file an issue.");
      }
      if (a.tag !== 3)
        throw Error("Unable to find node on an unmounted component.");
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
        switch (typeof type.tag === "number" && console.error("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), type.$$typeof) {
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
    function getComponentNameFromOwner(owner) {
      return typeof owner.tag === "number" ? getComponentNameFromFiber(owner) : typeof owner.name === "string" ? owner.name : null;
    }
    function getComponentNameFromFiber(fiber) {
      var type = fiber.type;
      switch (fiber.tag) {
        case 31:
          return "Activity";
        case 24:
          return "Cache";
        case 9:
          return (type._context.displayName || "Context") + ".Consumer";
        case 10:
          return type.displayName || "Context";
        case 18:
          return "DehydratedFragment";
        case 11:
          return fiber = type.render, fiber = fiber.displayName || fiber.name || "", type.displayName || (fiber !== "" ? "ForwardRef(" + fiber + ")" : "ForwardRef");
        case 7:
          return "Fragment";
        case 26:
        case 27:
        case 5:
          return type;
        case 4:
          return "Portal";
        case 3:
          return "Root";
        case 6:
          return "Text";
        case 16:
          return getComponentNameFromType(type);
        case 8:
          return type === REACT_STRICT_MODE_TYPE ? "StrictMode" : "Mode";
        case 22:
          return "Offscreen";
        case 12:
          return "Profiler";
        case 21:
          return "Scope";
        case 13:
          return "Suspense";
        case 19:
          return "SuspenseList";
        case 25:
          return "TracingMarker";
        case 1:
        case 0:
        case 14:
        case 15:
          if (typeof type === "function")
            return type.displayName || type.name || null;
          if (typeof type === "string")
            return type;
          break;
        case 29:
          type = fiber._debugInfo;
          if (type != null) {
            for (var i = type.length - 1;0 <= i; i--)
              if (typeof type[i].name === "string")
                return type[i].name;
          }
          if (fiber.return !== null)
            return getComponentNameFromFiber(fiber.return);
      }
      return null;
    }
    function createCursor(defaultValue) {
      return { current: defaultValue };
    }
    function pop(cursor, fiber) {
      0 > index$jscomp$0 ? console.error("Unexpected pop.") : (fiber !== fiberStack[index$jscomp$0] && console.error("Unexpected Fiber popped."), cursor.current = valueStack[index$jscomp$0], valueStack[index$jscomp$0] = null, fiberStack[index$jscomp$0] = null, index$jscomp$0--);
    }
    function push(cursor, value, fiber) {
      index$jscomp$0++;
      valueStack[index$jscomp$0] = cursor.current;
      fiberStack[index$jscomp$0] = fiber;
      cursor.current = value;
    }
    function requiredContext(c) {
      c === null && console.error("Expected host context to exist. This error is likely caused by a bug in React. Please file an issue.");
      return c;
    }
    function pushHostContainer(fiber, nextRootInstance) {
      push(rootInstanceStackCursor, nextRootInstance, fiber);
      push(contextFiberStackCursor, fiber, fiber);
      push(contextStackCursor, null, fiber);
      var nextRootContext = nextRootInstance.nodeType;
      switch (nextRootContext) {
        case 9:
        case 11:
          nextRootContext = nextRootContext === 9 ? "#document" : "#fragment";
          nextRootInstance = (nextRootInstance = nextRootInstance.documentElement) ? (nextRootInstance = nextRootInstance.namespaceURI) ? getOwnHostContext(nextRootInstance) : HostContextNamespaceNone : HostContextNamespaceNone;
          break;
        default:
          if (nextRootContext = nextRootInstance.tagName, nextRootInstance = nextRootInstance.namespaceURI)
            nextRootInstance = getOwnHostContext(nextRootInstance), nextRootInstance = getChildHostContextProd(nextRootInstance, nextRootContext);
          else
            switch (nextRootContext) {
              case "svg":
                nextRootInstance = HostContextNamespaceSvg;
                break;
              case "math":
                nextRootInstance = HostContextNamespaceMath;
                break;
              default:
                nextRootInstance = HostContextNamespaceNone;
            }
      }
      nextRootContext = nextRootContext.toLowerCase();
      nextRootContext = updatedAncestorInfoDev(null, nextRootContext);
      nextRootContext = {
        context: nextRootInstance,
        ancestorInfo: nextRootContext
      };
      pop(contextStackCursor, fiber);
      push(contextStackCursor, nextRootContext, fiber);
    }
    function popHostContainer(fiber) {
      pop(contextStackCursor, fiber);
      pop(contextFiberStackCursor, fiber);
      pop(rootInstanceStackCursor, fiber);
    }
    function getHostContext() {
      return requiredContext(contextStackCursor.current);
    }
    function pushHostContext(fiber) {
      fiber.memoizedState !== null && push(hostTransitionProviderCursor, fiber, fiber);
      var context = requiredContext(contextStackCursor.current);
      var type = fiber.type;
      var nextContext = getChildHostContextProd(context.context, type);
      type = updatedAncestorInfoDev(context.ancestorInfo, type);
      nextContext = { context: nextContext, ancestorInfo: type };
      context !== nextContext && (push(contextFiberStackCursor, fiber, fiber), push(contextStackCursor, nextContext, fiber));
    }
    function popHostContext(fiber) {
      contextFiberStackCursor.current === fiber && (pop(contextStackCursor, fiber), pop(contextFiberStackCursor, fiber));
      hostTransitionProviderCursor.current === fiber && (pop(hostTransitionProviderCursor, fiber), HostTransitionContext._currentValue = NotPendingTransition);
    }
    function disabledLog() {}
    function disableLogs() {
      if (disabledDepth === 0) {
        prevLog = console.log;
        prevInfo = console.info;
        prevWarn = console.warn;
        prevError = console.error;
        prevGroup = console.group;
        prevGroupCollapsed = console.groupCollapsed;
        prevGroupEnd = console.groupEnd;
        var props = {
          configurable: true,
          enumerable: true,
          value: disabledLog,
          writable: true
        };
        Object.defineProperties(console, {
          info: props,
          log: props,
          warn: props,
          error: props,
          group: props,
          groupCollapsed: props,
          groupEnd: props
        });
      }
      disabledDepth++;
    }
    function reenableLogs() {
      disabledDepth--;
      if (disabledDepth === 0) {
        var props = { configurable: true, enumerable: true, writable: true };
        Object.defineProperties(console, {
          log: assign({}, props, { value: prevLog }),
          info: assign({}, props, { value: prevInfo }),
          warn: assign({}, props, { value: prevWarn }),
          error: assign({}, props, { value: prevError }),
          group: assign({}, props, { value: prevGroup }),
          groupCollapsed: assign({}, props, { value: prevGroupCollapsed }),
          groupEnd: assign({}, props, { value: prevGroupEnd })
        });
      }
      0 > disabledDepth && console.error("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
    }
    function formatOwnerStack(error) {
      var prevPrepareStackTrace = Error.prepareStackTrace;
      Error.prepareStackTrace = undefined;
      error = error.stack;
      Error.prepareStackTrace = prevPrepareStackTrace;
      error.startsWith(`Error: react-stack-top-frame
`) && (error = error.slice(29));
      prevPrepareStackTrace = error.indexOf(`
`);
      prevPrepareStackTrace !== -1 && (error = error.slice(prevPrepareStackTrace + 1));
      prevPrepareStackTrace = error.indexOf("react_stack_bottom_frame");
      prevPrepareStackTrace !== -1 && (prevPrepareStackTrace = error.lastIndexOf(`
`, prevPrepareStackTrace));
      if (prevPrepareStackTrace !== -1)
        error = error.slice(0, prevPrepareStackTrace);
      else
        return "";
      return error;
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
      var frame = componentFrameCache.get(fn);
      if (frame !== undefined)
        return frame;
      reentry = true;
      frame = Error.prepareStackTrace;
      Error.prepareStackTrace = undefined;
      var previousDispatcher2 = null;
      previousDispatcher2 = ReactSharedInternals.H;
      ReactSharedInternals.H = null;
      disableLogs();
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
                  } catch (x$0) {
                    control = x$0;
                  }
                  fn.call(Fake.prototype);
                }
              } else {
                try {
                  throw Error();
                } catch (x$1) {
                  control = x$1;
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
          for (_RunInRootFrame$Deter = namePropDescriptor = 0;namePropDescriptor < sampleLines.length && !sampleLines[namePropDescriptor].includes("DetermineComponentFrameRoot"); )
            namePropDescriptor++;
          for (;_RunInRootFrame$Deter < controlLines.length && !controlLines[_RunInRootFrame$Deter].includes("DetermineComponentFrameRoot"); )
            _RunInRootFrame$Deter++;
          if (namePropDescriptor === sampleLines.length || _RunInRootFrame$Deter === controlLines.length)
            for (namePropDescriptor = sampleLines.length - 1, _RunInRootFrame$Deter = controlLines.length - 1;1 <= namePropDescriptor && 0 <= _RunInRootFrame$Deter && sampleLines[namePropDescriptor] !== controlLines[_RunInRootFrame$Deter]; )
              _RunInRootFrame$Deter--;
          for (;1 <= namePropDescriptor && 0 <= _RunInRootFrame$Deter; namePropDescriptor--, _RunInRootFrame$Deter--)
            if (sampleLines[namePropDescriptor] !== controlLines[_RunInRootFrame$Deter]) {
              if (namePropDescriptor !== 1 || _RunInRootFrame$Deter !== 1) {
                do
                  if (namePropDescriptor--, _RunInRootFrame$Deter--, 0 > _RunInRootFrame$Deter || sampleLines[namePropDescriptor] !== controlLines[_RunInRootFrame$Deter]) {
                    var _frame = `
` + sampleLines[namePropDescriptor].replace(" at new ", " at ");
                    fn.displayName && _frame.includes("<anonymous>") && (_frame = _frame.replace("<anonymous>", fn.displayName));
                    typeof fn === "function" && componentFrameCache.set(fn, _frame);
                    return _frame;
                  }
                while (1 <= namePropDescriptor && 0 <= _RunInRootFrame$Deter);
              }
              break;
            }
        }
      } finally {
        reentry = false, ReactSharedInternals.H = previousDispatcher2, reenableLogs(), Error.prepareStackTrace = frame;
      }
      sampleLines = (sampleLines = fn ? fn.displayName || fn.name : "") ? describeBuiltInComponentFrame(sampleLines) : "";
      typeof fn === "function" && componentFrameCache.set(fn, sampleLines);
      return sampleLines;
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
    function getStackByFiberInDevAndProd(workInProgress2) {
      try {
        var info = "", previous = null;
        do {
          info += describeFiber(workInProgress2, previous);
          var debugInfo = workInProgress2._debugInfo;
          if (debugInfo)
            for (var i = debugInfo.length - 1;0 <= i; i--) {
              var entry = debugInfo[i];
              if (typeof entry.name === "string") {
                var JSCompiler_temp_const = info;
                a: {
                  var { name, env, debugLocation: location } = entry;
                  if (location != null) {
                    var childStack = formatOwnerStack(location), idx = childStack.lastIndexOf(`
`), lastLine = idx === -1 ? childStack : childStack.slice(idx + 1);
                    if (lastLine.indexOf(name) !== -1) {
                      var JSCompiler_inline_result = `
` + lastLine;
                      break a;
                    }
                  }
                  JSCompiler_inline_result = describeBuiltInComponentFrame(name + (env ? " [" + env + "]" : ""));
                }
                info = JSCompiler_temp_const + JSCompiler_inline_result;
              }
            }
          previous = workInProgress2;
          workInProgress2 = workInProgress2.return;
        } while (workInProgress2);
        return info;
      } catch (x) {
        return `
Error generating stack: ` + x.message + `
` + x.stack;
      }
    }
    function describeFunctionComponentFrameWithoutLineNumber(fn) {
      return (fn = fn ? fn.displayName || fn.name : "") ? describeBuiltInComponentFrame(fn) : "";
    }
    function getCurrentFiberOwnerNameInDevOrNull() {
      if (current === null)
        return null;
      var owner = current._debugOwner;
      return owner != null ? getComponentNameFromOwner(owner) : null;
    }
    function getCurrentFiberStackInDev() {
      if (current === null)
        return "";
      var workInProgress2 = current;
      try {
        var info = "";
        workInProgress2.tag === 6 && (workInProgress2 = workInProgress2.return);
        switch (workInProgress2.tag) {
          case 26:
          case 27:
          case 5:
            info += describeBuiltInComponentFrame(workInProgress2.type);
            break;
          case 13:
            info += describeBuiltInComponentFrame("Suspense");
            break;
          case 19:
            info += describeBuiltInComponentFrame("SuspenseList");
            break;
          case 31:
            info += describeBuiltInComponentFrame("Activity");
            break;
          case 30:
          case 0:
          case 15:
          case 1:
            workInProgress2._debugOwner || info !== "" || (info += describeFunctionComponentFrameWithoutLineNumber(workInProgress2.type));
            break;
          case 11:
            workInProgress2._debugOwner || info !== "" || (info += describeFunctionComponentFrameWithoutLineNumber(workInProgress2.type.render));
        }
        for (;workInProgress2; )
          if (typeof workInProgress2.tag === "number") {
            var fiber = workInProgress2;
            workInProgress2 = fiber._debugOwner;
            var debugStack = fiber._debugStack;
            if (workInProgress2 && debugStack) {
              var formattedStack = formatOwnerStack(debugStack);
              formattedStack !== "" && (info += `
` + formattedStack);
            }
          } else if (workInProgress2.debugStack != null) {
            var ownerStack = workInProgress2.debugStack;
            (workInProgress2 = workInProgress2.owner) && ownerStack && (info += `
` + formatOwnerStack(ownerStack));
          } else
            break;
        var JSCompiler_inline_result = info;
      } catch (x) {
        JSCompiler_inline_result = `
Error generating stack: ` + x.message + `
` + x.stack;
      }
      return JSCompiler_inline_result;
    }
    function runWithFiberInDEV(fiber, callback, arg0, arg1, arg2, arg3, arg4) {
      var previousFiber = current;
      setCurrentFiber(fiber);
      try {
        return fiber !== null && fiber._debugTask ? fiber._debugTask.run(callback.bind(null, arg0, arg1, arg2, arg3, arg4)) : callback(arg0, arg1, arg2, arg3, arg4);
      } finally {
        setCurrentFiber(previousFiber);
      }
      throw Error("runWithFiberInDEV should never be called in production. This is a bug in React.");
    }
    function setCurrentFiber(fiber) {
      ReactSharedInternals.getCurrentStack = fiber === null ? null : getCurrentFiberStackInDev;
      isRendering = false;
      current = fiber;
    }
    function typeName(value) {
      return typeof Symbol === "function" && Symbol.toStringTag && value[Symbol.toStringTag] || value.constructor.name || "Object";
    }
    function willCoercionThrow(value) {
      try {
        return testStringCoercion(value), false;
      } catch (e) {
        return true;
      }
    }
    function testStringCoercion(value) {
      return "" + value;
    }
    function checkAttributeStringCoercion(value, attributeName) {
      if (willCoercionThrow(value))
        return console.error("The provided `%s` attribute is an unsupported type %s. This value must be coerced to a string before using it here.", attributeName, typeName(value)), testStringCoercion(value);
    }
    function checkCSSPropertyStringCoercion(value, propName) {
      if (willCoercionThrow(value))
        return console.error("The provided `%s` CSS property is an unsupported type %s. This value must be coerced to a string before using it here.", propName, typeName(value)), testStringCoercion(value);
    }
    function checkFormFieldValueStringCoercion(value) {
      if (willCoercionThrow(value))
        return console.error("Form field values (value, checked, defaultValue, or defaultChecked props) must be strings, not %s. This value must be coerced to a string before using it here.", typeName(value)), testStringCoercion(value);
    }
    function injectInternals(internals) {
      if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === "undefined")
        return false;
      var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (hook.isDisabled)
        return true;
      if (!hook.supportsFiber)
        return console.error("The installed version of React DevTools is too old and will not work with the current version of React. Please update React DevTools. https://react.dev/link/react-devtools"), true;
      try {
        rendererID = hook.inject(internals), injectedHook = hook;
      } catch (err) {
        console.error("React instrumentation encountered an error: %o.", err);
      }
      return hook.checkDCE ? true : false;
    }
    function setIsStrictModeForDevtools(newIsStrictMode) {
      typeof log$1 === "function" && unstable_setDisableYieldValue2(newIsStrictMode);
      if (injectedHook && typeof injectedHook.setStrictMode === "function")
        try {
          injectedHook.setStrictMode(rendererID, newIsStrictMode);
        } catch (err) {
          hasLoggedError || (hasLoggedError = true, console.error("React instrumentation encountered an error: %o", err));
        }
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
          return console.error("Should have found matching lanes. This is a bug in React."), lanes;
      }
    }
    function getNextLanes(root2, wipLanes, rootHasPendingCommit) {
      var pendingLanes = root2.pendingLanes;
      if (pendingLanes === 0)
        return 0;
      var nextLanes = 0, suspendedLanes = root2.suspendedLanes, pingedLanes = root2.pingedLanes;
      root2 = root2.warmLanes;
      var nonIdlePendingLanes = pendingLanes & 134217727;
      nonIdlePendingLanes !== 0 ? (pendingLanes = nonIdlePendingLanes & ~suspendedLanes, pendingLanes !== 0 ? nextLanes = getHighestPriorityLanes(pendingLanes) : (pingedLanes &= nonIdlePendingLanes, pingedLanes !== 0 ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = nonIdlePendingLanes & ~root2, rootHasPendingCommit !== 0 && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))))) : (nonIdlePendingLanes = pendingLanes & ~suspendedLanes, nonIdlePendingLanes !== 0 ? nextLanes = getHighestPriorityLanes(nonIdlePendingLanes) : pingedLanes !== 0 ? nextLanes = getHighestPriorityLanes(pingedLanes) : rootHasPendingCommit || (rootHasPendingCommit = pendingLanes & ~root2, rootHasPendingCommit !== 0 && (nextLanes = getHighestPriorityLanes(rootHasPendingCommit))));
      return nextLanes === 0 ? 0 : wipLanes !== 0 && wipLanes !== nextLanes && (wipLanes & suspendedLanes) === 0 && (suspendedLanes = nextLanes & -nextLanes, rootHasPendingCommit = wipLanes & -wipLanes, suspendedLanes >= rootHasPendingCommit || suspendedLanes === 32 && (rootHasPendingCommit & 4194048) !== 0) ? wipLanes : nextLanes;
    }
    function checkIfRootIsPrerendering(root2, renderLanes2) {
      return (root2.pendingLanes & ~(root2.suspendedLanes & ~root2.pingedLanes) & renderLanes2) === 0;
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
          return console.error("Should have found matching lanes. This is a bug in React."), -1;
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
    function markRootUpdated$1(root2, updateLane) {
      root2.pendingLanes |= updateLane;
      updateLane !== 268435456 && (root2.suspendedLanes = 0, root2.pingedLanes = 0, root2.warmLanes = 0);
    }
    function markRootFinished(root2, finishedLanes, remainingLanes, spawnedLane, updatedLanes, suspendedRetryLanes) {
      var previouslyPendingLanes = root2.pendingLanes;
      root2.pendingLanes = remainingLanes;
      root2.suspendedLanes = 0;
      root2.pingedLanes = 0;
      root2.warmLanes = 0;
      root2.expiredLanes &= remainingLanes;
      root2.entangledLanes &= remainingLanes;
      root2.errorRecoveryDisabledLanes &= remainingLanes;
      root2.shellSuspendCounter = 0;
      var { entanglements, expirationTimes, hiddenUpdates } = root2;
      for (remainingLanes = previouslyPendingLanes & ~remainingLanes;0 < remainingLanes; ) {
        var index = 31 - clz32(remainingLanes), lane = 1 << index;
        entanglements[index] = 0;
        expirationTimes[index] = -1;
        var hiddenUpdatesForLane = hiddenUpdates[index];
        if (hiddenUpdatesForLane !== null)
          for (hiddenUpdates[index] = null, index = 0;index < hiddenUpdatesForLane.length; index++) {
            var update = hiddenUpdatesForLane[index];
            update !== null && (update.lane &= -536870913);
          }
        remainingLanes &= ~lane;
      }
      spawnedLane !== 0 && markSpawnedDeferredLane(root2, spawnedLane, 0);
      suspendedRetryLanes !== 0 && updatedLanes === 0 && root2.tag !== 0 && (root2.suspendedLanes |= suspendedRetryLanes & ~(previouslyPendingLanes & ~finishedLanes));
    }
    function markSpawnedDeferredLane(root2, spawnedLane, entangledLanes) {
      root2.pendingLanes |= spawnedLane;
      root2.suspendedLanes &= ~spawnedLane;
      var spawnedLaneIndex = 31 - clz32(spawnedLane);
      root2.entangledLanes |= spawnedLane;
      root2.entanglements[spawnedLaneIndex] = root2.entanglements[spawnedLaneIndex] | 1073741824 | entangledLanes & 261930;
    }
    function markRootEntangled(root2, entangledLanes) {
      var rootEntangledLanes = root2.entangledLanes |= entangledLanes;
      for (root2 = root2.entanglements;rootEntangledLanes; ) {
        var index = 31 - clz32(rootEntangledLanes), lane = 1 << index;
        lane & entangledLanes | root2[index] & entangledLanes && (root2[index] |= entangledLanes);
        rootEntangledLanes &= ~lane;
      }
    }
    function getBumpedLaneForHydration(root2, renderLanes2) {
      var renderLane = renderLanes2 & -renderLanes2;
      renderLane = (renderLane & 42) !== 0 ? 1 : getBumpedLaneForHydrationByLane(renderLane);
      return (renderLane & (root2.suspendedLanes | renderLanes2)) !== 0 ? 0 : renderLane;
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
    function addFiberToLanesMap(root2, fiber, lanes) {
      if (isDevToolsPresent)
        for (root2 = root2.pendingUpdatersLaneMap;0 < lanes; ) {
          var index = 31 - clz32(lanes), lane = 1 << index;
          root2[index].add(fiber);
          lanes &= ~lane;
        }
    }
    function movePendingFibersToMemoized(root2, lanes) {
      if (isDevToolsPresent)
        for (var { pendingUpdatersLaneMap, memoizedUpdaters } = root2;0 < lanes; ) {
          var index = 31 - clz32(lanes);
          root2 = 1 << index;
          index = pendingUpdatersLaneMap[index];
          0 < index.size && (index.forEach(function(fiber) {
            var alternate = fiber.alternate;
            alternate !== null && memoizedUpdaters.has(alternate) || memoizedUpdaters.add(fiber);
          }), index.clear());
          lanes &= ~root2;
        }
    }
    function lanesToEventPriority(lanes) {
      lanes &= -lanes;
      return DiscreteEventPriority !== 0 && DiscreteEventPriority < lanes ? ContinuousEventPriority !== 0 && ContinuousEventPriority < lanes ? (lanes & 134217727) !== 0 ? DefaultEventPriority : IdleEventPriority : ContinuousEventPriority : DiscreteEventPriority;
    }
    function resolveUpdatePriority() {
      var updatePriority = ReactDOMSharedInternals.p;
      if (updatePriority !== 0)
        return updatePriority;
      updatePriority = window.event;
      return updatePriority === undefined ? DefaultEventPriority : getEventPriority(updatePriority.type);
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
      throw Error("getNodeFromInstance: Invalid argument.");
    }
    function getResourcesFromRoot(root2) {
      var resources = root2[internalRootNodeResourcesKey];
      resources || (resources = root2[internalRootNodeResourcesKey] = { hoistableStyles: new Map, hoistableScripts: new Map });
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
      registrationNameDependencies[registrationName] && console.error("EventRegistry: More than one plugin attempted to publish the same registration name, `%s`.", registrationName);
      registrationNameDependencies[registrationName] = dependencies;
      var lowerCasedName = registrationName.toLowerCase();
      possibleRegistrationNames[lowerCasedName] = registrationName;
      registrationName === "onDoubleClick" && (possibleRegistrationNames.ondblclick = registrationName);
      for (registrationName = 0;registrationName < dependencies.length; registrationName++)
        allNativeEvents.add(dependencies[registrationName]);
    }
    function checkControlledValueProps(tagName, props) {
      hasReadOnlyValue[props.type] || props.onChange || props.onInput || props.readOnly || props.disabled || props.value == null || (tagName === "select" ? console.error("You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set `onChange`.") : console.error("You provided a `value` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultValue`. Otherwise, set either `onChange` or `readOnly`."));
      props.onChange || props.readOnly || props.disabled || props.checked == null || console.error("You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field. If the field should be mutable use `defaultChecked`. Otherwise, set either `onChange` or `readOnly`.");
    }
    function isAttributeNameSafe(attributeName) {
      if (hasOwnProperty.call(validatedAttributeNameCache, attributeName))
        return true;
      if (hasOwnProperty.call(illegalAttributeNameCache, attributeName))
        return false;
      if (VALID_ATTRIBUTE_NAME_REGEX.test(attributeName))
        return validatedAttributeNameCache[attributeName] = true;
      illegalAttributeNameCache[attributeName] = true;
      console.error("Invalid attribute name: `%s`", attributeName);
      return false;
    }
    function getValueForAttributeOnCustomComponent(node, name, expected) {
      if (isAttributeNameSafe(name)) {
        if (!node.hasAttribute(name)) {
          switch (typeof expected) {
            case "symbol":
            case "object":
              return expected;
            case "function":
              return expected;
            case "boolean":
              if (expected === false)
                return expected;
          }
          return expected === undefined ? undefined : null;
        }
        node = node.getAttribute(name);
        if (node === "" && expected === true)
          return true;
        checkAttributeStringCoercion(expected, name);
        return node === "" + expected ? expected : node;
      }
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
              var prefix2 = name.toLowerCase().slice(0, 5);
              if (prefix2 !== "data-" && prefix2 !== "aria-") {
                node.removeAttribute(name);
                return;
              }
          }
          checkAttributeStringCoercion(value, name);
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
        checkAttributeStringCoercion(value, name);
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
        checkAttributeStringCoercion(value, name);
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
          return checkFormFieldValueStringCoercion(value), value;
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
            checkFormFieldValueStringCoercion(value);
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
            checkFormFieldValueStringCoercion(value);
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
    function validateInputProps(element, props) {
      props.checked === undefined || props.defaultChecked === undefined || didWarnCheckedDefaultChecked || (console.error("%s contains an input of type %s with both checked and defaultChecked props. Input elements must be either controlled or uncontrolled (specify either the checked prop, or the defaultChecked prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components", getCurrentFiberOwnerNameInDevOrNull() || "A component", props.type), didWarnCheckedDefaultChecked = true);
      props.value === undefined || props.defaultValue === undefined || didWarnValueDefaultValue$1 || (console.error("%s contains an input of type %s with both value and defaultValue props. Input elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled input element and remove one of these props. More info: https://react.dev/link/controlled-components", getCurrentFiberOwnerNameInDevOrNull() || "A component", props.type), didWarnValueDefaultValue$1 = true);
    }
    function updateInput(element, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name) {
      element.name = "";
      type != null && typeof type !== "function" && typeof type !== "symbol" && typeof type !== "boolean" ? (checkAttributeStringCoercion(type, "type"), element.type = type) : element.removeAttribute("type");
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
      name != null && typeof name !== "function" && typeof name !== "symbol" && typeof name !== "boolean" ? (checkAttributeStringCoercion(name, "name"), element.name = "" + getToStringValue(name)) : element.removeAttribute("name");
    }
    function initInput(element, value, defaultValue, checked, defaultChecked, type, name, isHydrating2) {
      type != null && typeof type !== "function" && typeof type !== "symbol" && typeof type !== "boolean" && (checkAttributeStringCoercion(type, "type"), element.type = type);
      if (value != null || defaultValue != null) {
        if (!(type !== "submit" && type !== "reset" || value !== undefined && value !== null)) {
          track(element);
          return;
        }
        defaultValue = defaultValue != null ? "" + getToStringValue(defaultValue) : "";
        value = value != null ? "" + getToStringValue(value) : defaultValue;
        isHydrating2 || value === element.value || (element.value = value);
        element.defaultValue = value;
      }
      checked = checked != null ? checked : defaultChecked;
      checked = typeof checked !== "function" && typeof checked !== "symbol" && !!checked;
      element.checked = isHydrating2 ? element.checked : !!checked;
      element.defaultChecked = !!checked;
      name != null && typeof name !== "function" && typeof name !== "symbol" && typeof name !== "boolean" && (checkAttributeStringCoercion(name, "name"), element.name = name);
      track(element);
    }
    function setDefaultValue(node, type, value) {
      type === "number" && getActiveElement(node.ownerDocument) === node || node.defaultValue === "" + value || (node.defaultValue = "" + value);
    }
    function validateOptionProps(element, props) {
      props.value == null && (typeof props.children === "object" && props.children !== null ? React.Children.forEach(props.children, function(child) {
        child == null || typeof child === "string" || typeof child === "number" || typeof child === "bigint" || didWarnInvalidChild || (didWarnInvalidChild = true, console.error("Cannot infer the option value of complex children. Pass a `value` prop or use a plain string as children to <option>."));
      }) : props.dangerouslySetInnerHTML == null || didWarnInvalidInnerHTML || (didWarnInvalidInnerHTML = true, console.error("Pass a `value` prop if you set dangerouslyInnerHTML so React knows which value should be selected.")));
      props.selected == null || didWarnSelectedSetOnOption || (console.error("Use the `defaultValue` or `value` props on <select> instead of setting `selected` on <option>."), didWarnSelectedSetOnOption = true);
    }
    function getDeclarationErrorAddendum() {
      var ownerName = getCurrentFiberOwnerNameInDevOrNull();
      return ownerName ? `

Check the render method of \`` + ownerName + "`." : "";
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
    function validateSelectProps(element, props) {
      for (element = 0;element < valuePropNames.length; element++) {
        var propName = valuePropNames[element];
        if (props[propName] != null) {
          var propNameIsArray = isArrayImpl(props[propName]);
          props.multiple && !propNameIsArray ? console.error("The `%s` prop supplied to <select> must be an array if `multiple` is true.%s", propName, getDeclarationErrorAddendum()) : !props.multiple && propNameIsArray && console.error("The `%s` prop supplied to <select> must be a scalar value if `multiple` is false.%s", propName, getDeclarationErrorAddendum());
        }
      }
      props.value === undefined || props.defaultValue === undefined || didWarnValueDefaultValue || (console.error("Select elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled select element and remove one of these props. More info: https://react.dev/link/controlled-components"), didWarnValueDefaultValue = true);
    }
    function validateTextareaProps(element, props) {
      props.value === undefined || props.defaultValue === undefined || didWarnValDefaultVal || (console.error("%s contains a textarea with both value and defaultValue props. Textarea elements must be either controlled or uncontrolled (specify either the value prop, or the defaultValue prop, but not both). Decide between using a controlled or uncontrolled textarea and remove one of these props. More info: https://react.dev/link/controlled-components", getCurrentFiberOwnerNameInDevOrNull() || "A component"), didWarnValDefaultVal = true);
      props.children != null && props.value == null && console.error("Use the `defaultValue` or `value` props instead of setting children on <textarea>.");
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
            throw Error("If you supply `defaultValue` on a <textarea>, do not pass children.");
          if (isArrayImpl(children)) {
            if (1 < children.length)
              throw Error("<textarea> can only have at most one child.");
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
    function findNotableNode(node, indent) {
      return node.serverProps === undefined && node.serverTail.length === 0 && node.children.length === 1 && 3 < node.distanceFromLeaf && node.distanceFromLeaf > 15 - indent ? findNotableNode(node.children[0], indent) : node;
    }
    function indentation(indent) {
      return "  " + "  ".repeat(indent);
    }
    function added(indent) {
      return "+ " + "  ".repeat(indent);
    }
    function removed(indent) {
      return "- " + "  ".repeat(indent);
    }
    function describeFiberType(fiber) {
      switch (fiber.tag) {
        case 26:
        case 27:
        case 5:
          return fiber.type;
        case 16:
          return "Lazy";
        case 31:
          return "Activity";
        case 13:
          return "Suspense";
        case 19:
          return "SuspenseList";
        case 0:
        case 15:
          return fiber = fiber.type, fiber.displayName || fiber.name || null;
        case 11:
          return fiber = fiber.type.render, fiber.displayName || fiber.name || null;
        case 1:
          return fiber = fiber.type, fiber.displayName || fiber.name || null;
        default:
          return null;
      }
    }
    function describeTextNode(content, maxLength) {
      return needsEscaping.test(content) ? (content = JSON.stringify(content), content.length > maxLength - 2 ? 8 > maxLength ? '{"..."}' : "{" + content.slice(0, maxLength - 7) + '..."}' : "{" + content + "}") : content.length > maxLength ? 5 > maxLength ? '{"..."}' : content.slice(0, maxLength - 3) + "..." : content;
    }
    function describeTextDiff(clientText, serverProps, indent) {
      var maxLength = 120 - 2 * indent;
      if (serverProps === null)
        return added(indent) + describeTextNode(clientText, maxLength) + `
`;
      if (typeof serverProps === "string") {
        for (var firstDiff = 0;firstDiff < serverProps.length && firstDiff < clientText.length && serverProps.charCodeAt(firstDiff) === clientText.charCodeAt(firstDiff); firstDiff++)
          ;
        firstDiff > maxLength - 8 && 10 < firstDiff && (clientText = "..." + clientText.slice(firstDiff - 8), serverProps = "..." + serverProps.slice(firstDiff - 8));
        return added(indent) + describeTextNode(clientText, maxLength) + `
` + removed(indent) + describeTextNode(serverProps, maxLength) + `
`;
      }
      return indentation(indent) + describeTextNode(clientText, maxLength) + `
`;
    }
    function objectName(object) {
      return Object.prototype.toString.call(object).replace(/^\[object (.*)\]$/, function(m, p0) {
        return p0;
      });
    }
    function describeValue(value, maxLength) {
      switch (typeof value) {
        case "string":
          return value = JSON.stringify(value), value.length > maxLength ? 5 > maxLength ? '"..."' : value.slice(0, maxLength - 4) + '..."' : value;
        case "object":
          if (value === null)
            return "null";
          if (isArrayImpl(value))
            return "[...]";
          if (value.$$typeof === REACT_ELEMENT_TYPE)
            return (maxLength = getComponentNameFromType(value.type)) ? "<" + maxLength + ">" : "<...>";
          var name = objectName(value);
          if (name === "Object") {
            name = "";
            maxLength -= 2;
            for (var propName in value)
              if (value.hasOwnProperty(propName)) {
                var jsonPropName = JSON.stringify(propName);
                jsonPropName !== '"' + propName + '"' && (propName = jsonPropName);
                maxLength -= propName.length - 2;
                jsonPropName = describeValue(value[propName], 15 > maxLength ? maxLength : 15);
                maxLength -= jsonPropName.length;
                if (0 > maxLength) {
                  name += name === "" ? "..." : ", ...";
                  break;
                }
                name += (name === "" ? "" : ",") + propName + ":" + jsonPropName;
              }
            return "{" + name + "}";
          }
          return name;
        case "function":
          return (maxLength = value.displayName || value.name) ? "function " + maxLength : "function";
        default:
          return String(value);
      }
    }
    function describePropValue(value, maxLength) {
      return typeof value !== "string" || needsEscaping.test(value) ? "{" + describeValue(value, maxLength - 2) + "}" : value.length > maxLength - 2 ? 5 > maxLength ? '"..."' : '"' + value.slice(0, maxLength - 5) + '..."' : '"' + value + '"';
    }
    function describeExpandedElement(type, props, rowPrefix) {
      var remainingRowLength = 120 - rowPrefix.length - type.length, properties = [], propName;
      for (propName in props)
        if (props.hasOwnProperty(propName) && propName !== "children") {
          var propValue = describePropValue(props[propName], 120 - rowPrefix.length - propName.length - 1);
          remainingRowLength -= propName.length + propValue.length + 2;
          properties.push(propName + "=" + propValue);
        }
      return properties.length === 0 ? rowPrefix + "<" + type + `>
` : 0 < remainingRowLength ? rowPrefix + "<" + type + " " + properties.join(" ") + `>
` : rowPrefix + "<" + type + `
` + rowPrefix + "  " + properties.join(`
` + rowPrefix + "  ") + `
` + rowPrefix + `>
`;
    }
    function describePropertiesDiff(clientObject, serverObject, indent) {
      var properties = "", remainingServerProperties = assign({}, serverObject), propName;
      for (propName in clientObject)
        if (clientObject.hasOwnProperty(propName)) {
          delete remainingServerProperties[propName];
          var maxLength = 120 - 2 * indent - propName.length - 2, clientPropValue = describeValue(clientObject[propName], maxLength);
          serverObject.hasOwnProperty(propName) ? (maxLength = describeValue(serverObject[propName], maxLength), properties += added(indent) + propName + ": " + clientPropValue + `
`, properties += removed(indent) + propName + ": " + maxLength + `
`) : properties += added(indent) + propName + ": " + clientPropValue + `
`;
        }
      for (var _propName in remainingServerProperties)
        remainingServerProperties.hasOwnProperty(_propName) && (clientObject = describeValue(remainingServerProperties[_propName], 120 - 2 * indent - _propName.length - 2), properties += removed(indent) + _propName + ": " + clientObject + `
`);
      return properties;
    }
    function describeElementDiff(type, clientProps, serverProps, indent) {
      var content = "", serverPropNames = new Map;
      for (propName$jscomp$0 in serverProps)
        serverProps.hasOwnProperty(propName$jscomp$0) && serverPropNames.set(propName$jscomp$0.toLowerCase(), propName$jscomp$0);
      if (serverPropNames.size === 1 && serverPropNames.has("children"))
        content += describeExpandedElement(type, clientProps, indentation(indent));
      else {
        for (var _propName2 in clientProps)
          if (clientProps.hasOwnProperty(_propName2) && _propName2 !== "children") {
            var maxLength$jscomp$0 = 120 - 2 * (indent + 1) - _propName2.length - 1, serverPropName = serverPropNames.get(_propName2.toLowerCase());
            if (serverPropName !== undefined) {
              serverPropNames.delete(_propName2.toLowerCase());
              var propName$jscomp$0 = clientProps[_propName2];
              serverPropName = serverProps[serverPropName];
              var clientPropValue = describePropValue(propName$jscomp$0, maxLength$jscomp$0);
              maxLength$jscomp$0 = describePropValue(serverPropName, maxLength$jscomp$0);
              typeof propName$jscomp$0 === "object" && propName$jscomp$0 !== null && typeof serverPropName === "object" && serverPropName !== null && objectName(propName$jscomp$0) === "Object" && objectName(serverPropName) === "Object" && (2 < Object.keys(propName$jscomp$0).length || 2 < Object.keys(serverPropName).length || -1 < clientPropValue.indexOf("...") || -1 < maxLength$jscomp$0.indexOf("...")) ? content += indentation(indent + 1) + _propName2 + `={{
` + describePropertiesDiff(propName$jscomp$0, serverPropName, indent + 2) + indentation(indent + 1) + `}}
` : (content += added(indent + 1) + _propName2 + "=" + clientPropValue + `
`, content += removed(indent + 1) + _propName2 + "=" + maxLength$jscomp$0 + `
`);
            } else
              content += indentation(indent + 1) + _propName2 + "=" + describePropValue(clientProps[_propName2], maxLength$jscomp$0) + `
`;
          }
        serverPropNames.forEach(function(propName) {
          if (propName !== "children") {
            var maxLength = 120 - 2 * (indent + 1) - propName.length - 1;
            content += removed(indent + 1) + propName + "=" + describePropValue(serverProps[propName], maxLength) + `
`;
          }
        });
        content = content === "" ? indentation(indent) + "<" + type + `>
` : indentation(indent) + "<" + type + `
` + content + indentation(indent) + `>
`;
      }
      type = serverProps.children;
      clientProps = clientProps.children;
      if (typeof type === "string" || typeof type === "number" || typeof type === "bigint") {
        serverPropNames = "";
        if (typeof clientProps === "string" || typeof clientProps === "number" || typeof clientProps === "bigint")
          serverPropNames = "" + clientProps;
        content += describeTextDiff(serverPropNames, "" + type, indent + 1);
      } else if (typeof clientProps === "string" || typeof clientProps === "number" || typeof clientProps === "bigint")
        content = type == null ? content + describeTextDiff("" + clientProps, null, indent + 1) : content + describeTextDiff("" + clientProps, undefined, indent + 1);
      return content;
    }
    function describeSiblingFiber(fiber, indent) {
      var type = describeFiberType(fiber);
      if (type === null) {
        type = "";
        for (fiber = fiber.child;fiber; )
          type += describeSiblingFiber(fiber, indent), fiber = fiber.sibling;
        return type;
      }
      return indentation(indent) + "<" + type + `>
`;
    }
    function describeNode(node, indent) {
      var skipToNode = findNotableNode(node, indent);
      if (skipToNode !== node && (node.children.length !== 1 || node.children[0] !== skipToNode))
        return indentation(indent) + `...
` + describeNode(skipToNode, indent + 1);
      skipToNode = "";
      var debugInfo = node.fiber._debugInfo;
      if (debugInfo)
        for (var i = 0;i < debugInfo.length; i++) {
          var serverComponentName = debugInfo[i].name;
          typeof serverComponentName === "string" && (skipToNode += indentation(indent) + "<" + serverComponentName + `>
`, indent++);
        }
      debugInfo = "";
      i = node.fiber.pendingProps;
      if (node.fiber.tag === 6)
        debugInfo = describeTextDiff(i, node.serverProps, indent), indent++;
      else if (serverComponentName = describeFiberType(node.fiber), serverComponentName !== null)
        if (node.serverProps === undefined) {
          debugInfo = indent;
          var maxLength = 120 - 2 * debugInfo - serverComponentName.length - 2, content = "";
          for (propName in i)
            if (i.hasOwnProperty(propName) && propName !== "children") {
              var propValue = describePropValue(i[propName], 15);
              maxLength -= propName.length + propValue.length + 2;
              if (0 > maxLength) {
                content += " ...";
                break;
              }
              content += " " + propName + "=" + propValue;
            }
          debugInfo = indentation(debugInfo) + "<" + serverComponentName + content + `>
`;
          indent++;
        } else
          node.serverProps === null ? (debugInfo = describeExpandedElement(serverComponentName, i, added(indent)), indent++) : typeof node.serverProps === "string" ? console.error("Should not have matched a non HostText fiber to a Text node. This is a bug in React.") : (debugInfo = describeElementDiff(serverComponentName, i, node.serverProps, indent), indent++);
      var propName = "";
      i = node.fiber.child;
      for (serverComponentName = 0;i && serverComponentName < node.children.length; )
        maxLength = node.children[serverComponentName], maxLength.fiber === i ? (propName += describeNode(maxLength, indent), serverComponentName++) : propName += describeSiblingFiber(i, indent), i = i.sibling;
      i && 0 < node.children.length && (propName += indentation(indent) + `...
`);
      i = node.serverTail;
      node.serverProps === null && indent--;
      for (node = 0;node < i.length; node++)
        serverComponentName = i[node], propName = typeof serverComponentName === "string" ? propName + (removed(indent) + describeTextNode(serverComponentName, 120 - 2 * indent) + `
`) : propName + describeExpandedElement(serverComponentName.type, serverComponentName.props, removed(indent));
      return skipToNode + debugInfo + propName;
    }
    function describeDiff(rootNode) {
      try {
        return `

` + describeNode(rootNode, 0);
      } catch (x) {
        return "";
      }
    }
    function describeAncestors(ancestor, child, props) {
      for (var fiber = child, node = null, distanceFromLeaf = 0;fiber; )
        fiber === ancestor && (distanceFromLeaf = 0), node = {
          fiber,
          children: node !== null ? [node] : [],
          serverProps: fiber === child ? props : fiber === ancestor ? null : undefined,
          serverTail: [],
          distanceFromLeaf
        }, distanceFromLeaf++, fiber = fiber.return;
      return node !== null ? describeDiff(node).replaceAll(/^[+-]/gm, ">") : "";
    }
    function updatedAncestorInfoDev(oldInfo, tag) {
      var ancestorInfo = assign({}, oldInfo || emptyAncestorInfoDev), info = { tag };
      inScopeTags.indexOf(tag) !== -1 && (ancestorInfo.aTagInScope = null, ancestorInfo.buttonTagInScope = null, ancestorInfo.nobrTagInScope = null);
      buttonScopeTags.indexOf(tag) !== -1 && (ancestorInfo.pTagInButtonScope = null);
      specialTags.indexOf(tag) !== -1 && tag !== "address" && tag !== "div" && tag !== "p" && (ancestorInfo.listItemTagAutoclosing = null, ancestorInfo.dlItemTagAutoclosing = null);
      ancestorInfo.current = info;
      tag === "form" && (ancestorInfo.formTag = info);
      tag === "a" && (ancestorInfo.aTagInScope = info);
      tag === "button" && (ancestorInfo.buttonTagInScope = info);
      tag === "nobr" && (ancestorInfo.nobrTagInScope = info);
      tag === "p" && (ancestorInfo.pTagInButtonScope = info);
      tag === "li" && (ancestorInfo.listItemTagAutoclosing = info);
      if (tag === "dd" || tag === "dt")
        ancestorInfo.dlItemTagAutoclosing = info;
      tag === "#document" || tag === "html" ? ancestorInfo.containerTagInScope = null : ancestorInfo.containerTagInScope || (ancestorInfo.containerTagInScope = info);
      oldInfo !== null || tag !== "#document" && tag !== "html" && tag !== "body" ? ancestorInfo.implicitRootScope === true && (ancestorInfo.implicitRootScope = false) : ancestorInfo.implicitRootScope = true;
      return ancestorInfo;
    }
    function isTagValidWithParent(tag, parentTag, implicitRootScope) {
      switch (parentTag) {
        case "select":
          return tag === "hr" || tag === "option" || tag === "optgroup" || tag === "script" || tag === "template" || tag === "#text";
        case "optgroup":
          return tag === "option" || tag === "#text";
        case "option":
          return tag === "#text";
        case "tr":
          return tag === "th" || tag === "td" || tag === "style" || tag === "script" || tag === "template";
        case "tbody":
        case "thead":
        case "tfoot":
          return tag === "tr" || tag === "style" || tag === "script" || tag === "template";
        case "colgroup":
          return tag === "col" || tag === "template";
        case "table":
          return tag === "caption" || tag === "colgroup" || tag === "tbody" || tag === "tfoot" || tag === "thead" || tag === "style" || tag === "script" || tag === "template";
        case "head":
          return tag === "base" || tag === "basefont" || tag === "bgsound" || tag === "link" || tag === "meta" || tag === "title" || tag === "noscript" || tag === "noframes" || tag === "style" || tag === "script" || tag === "template";
        case "html":
          if (implicitRootScope)
            break;
          return tag === "head" || tag === "body" || tag === "frameset";
        case "frameset":
          return tag === "frame";
        case "#document":
          if (!implicitRootScope)
            return tag === "html";
      }
      switch (tag) {
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          return parentTag !== "h1" && parentTag !== "h2" && parentTag !== "h3" && parentTag !== "h4" && parentTag !== "h5" && parentTag !== "h6";
        case "rp":
        case "rt":
          return impliedEndTags.indexOf(parentTag) === -1;
        case "caption":
        case "col":
        case "colgroup":
        case "frameset":
        case "frame":
        case "tbody":
        case "td":
        case "tfoot":
        case "th":
        case "thead":
        case "tr":
          return parentTag == null;
        case "head":
          return implicitRootScope || parentTag === null;
        case "html":
          return implicitRootScope && parentTag === "#document" || parentTag === null;
        case "body":
          return implicitRootScope && (parentTag === "#document" || parentTag === "html") || parentTag === null;
      }
      return true;
    }
    function findInvalidAncestorForTag(tag, ancestorInfo) {
      switch (tag) {
        case "address":
        case "article":
        case "aside":
        case "blockquote":
        case "center":
        case "details":
        case "dialog":
        case "dir":
        case "div":
        case "dl":
        case "fieldset":
        case "figcaption":
        case "figure":
        case "footer":
        case "header":
        case "hgroup":
        case "main":
        case "menu":
        case "nav":
        case "ol":
        case "p":
        case "section":
        case "summary":
        case "ul":
        case "pre":
        case "listing":
        case "table":
        case "hr":
        case "xmp":
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          return ancestorInfo.pTagInButtonScope;
        case "form":
          return ancestorInfo.formTag || ancestorInfo.pTagInButtonScope;
        case "li":
          return ancestorInfo.listItemTagAutoclosing;
        case "dd":
        case "dt":
          return ancestorInfo.dlItemTagAutoclosing;
        case "button":
          return ancestorInfo.buttonTagInScope;
        case "a":
          return ancestorInfo.aTagInScope;
        case "nobr":
          return ancestorInfo.nobrTagInScope;
      }
      return null;
    }
    function findAncestor(parent, tagName) {
      for (;parent; ) {
        switch (parent.tag) {
          case 5:
          case 26:
          case 27:
            if (parent.type === tagName)
              return parent;
        }
        parent = parent.return;
      }
      return null;
    }
    function validateDOMNesting(childTag, ancestorInfo) {
      ancestorInfo = ancestorInfo || emptyAncestorInfoDev;
      var parentInfo = ancestorInfo.current;
      ancestorInfo = (parentInfo = isTagValidWithParent(childTag, parentInfo && parentInfo.tag, ancestorInfo.implicitRootScope) ? null : parentInfo) ? null : findInvalidAncestorForTag(childTag, ancestorInfo);
      ancestorInfo = parentInfo || ancestorInfo;
      if (!ancestorInfo)
        return true;
      var ancestorTag = ancestorInfo.tag;
      ancestorInfo = String(!!parentInfo) + "|" + childTag + "|" + ancestorTag;
      if (didWarn[ancestorInfo])
        return false;
      didWarn[ancestorInfo] = true;
      var ancestor = (ancestorInfo = current) ? findAncestor(ancestorInfo.return, ancestorTag) : null, ancestorDescription = ancestorInfo !== null && ancestor !== null ? describeAncestors(ancestor, ancestorInfo, null) : "", tagDisplayName = "<" + childTag + ">";
      parentInfo ? (parentInfo = "", ancestorTag === "table" && childTag === "tr" && (parentInfo += " Add a <tbody>, <thead> or <tfoot> to your code to match the DOM tree generated by the browser."), console.error(`In HTML, %s cannot be a child of <%s>.%s
This will cause a hydration error.%s`, tagDisplayName, ancestorTag, parentInfo, ancestorDescription)) : console.error(`In HTML, %s cannot be a descendant of <%s>.
This will cause a hydration error.%s`, tagDisplayName, ancestorTag, ancestorDescription);
      ancestorInfo && (childTag = ancestorInfo.return, ancestor === null || childTag === null || ancestor === childTag && childTag._debugOwner === ancestorInfo._debugOwner || runWithFiberInDEV(ancestor, function() {
        console.error(`<%s> cannot contain a nested %s.
See this log for the ancestor stack trace.`, ancestorTag, tagDisplayName);
      }));
      return false;
    }
    function validateTextNesting(childText, parentTag, implicitRootScope) {
      if (implicitRootScope || isTagValidWithParent("#text", parentTag, false))
        return true;
      implicitRootScope = "#text|" + parentTag;
      if (didWarn[implicitRootScope])
        return false;
      didWarn[implicitRootScope] = true;
      var ancestor = (implicitRootScope = current) ? findAncestor(implicitRootScope, parentTag) : null;
      implicitRootScope = implicitRootScope !== null && ancestor !== null ? describeAncestors(ancestor, implicitRootScope, implicitRootScope.tag !== 6 ? { children: null } : null) : "";
      /\S/.test(childText) ? console.error(`In HTML, text nodes cannot be a child of <%s>.
This will cause a hydration error.%s`, parentTag, implicitRootScope) : console.error(`In HTML, whitespace text nodes cannot be a child of <%s>. Make sure you don't have any extra whitespace between tags on each line of your source code.
This will cause a hydration error.%s`, parentTag, implicitRootScope);
      return false;
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
    function camelize(string) {
      return string.replace(hyphenPattern, function(_, character) {
        return character.toUpperCase();
      });
    }
    function setValueForStyle(style2, styleName, value) {
      var isCustomProperty = styleName.indexOf("--") === 0;
      isCustomProperty || (-1 < styleName.indexOf("-") ? warnedStyleNames.hasOwnProperty(styleName) && warnedStyleNames[styleName] || (warnedStyleNames[styleName] = true, console.error("Unsupported style property %s. Did you mean %s?", styleName, camelize(styleName.replace(msPattern, "ms-")))) : badVendoredStyleNamePattern.test(styleName) ? warnedStyleNames.hasOwnProperty(styleName) && warnedStyleNames[styleName] || (warnedStyleNames[styleName] = true, console.error("Unsupported vendor-prefixed style property %s. Did you mean %s?", styleName, styleName.charAt(0).toUpperCase() + styleName.slice(1))) : !badStyleValueWithSemicolonPattern.test(value) || warnedStyleValues.hasOwnProperty(value) && warnedStyleValues[value] || (warnedStyleValues[value] = true, console.error(`Style property values shouldn't contain a semicolon. Try "%s: %s" instead.`, styleName, value.replace(badStyleValueWithSemicolonPattern, ""))), typeof value === "number" && (isNaN(value) ? warnedForNaNValue || (warnedForNaNValue = true, console.error("`NaN` is an invalid value for the `%s` css style property.", styleName)) : isFinite(value) || warnedForInfinityValue || (warnedForInfinityValue = true, console.error("`Infinity` is an invalid value for the `%s` css style property.", styleName))));
      value == null || typeof value === "boolean" || value === "" ? isCustomProperty ? style2.setProperty(styleName, "") : styleName === "float" ? style2.cssFloat = "" : style2[styleName] = "" : isCustomProperty ? style2.setProperty(styleName, value) : typeof value !== "number" || value === 0 || unitlessNumbers.has(styleName) ? styleName === "float" ? style2.cssFloat = value : (checkCSSPropertyStringCoercion(value, styleName), style2[styleName] = ("" + value).trim()) : style2[styleName] = value + "px";
    }
    function setValueForStyles(node, styles, prevStyles) {
      if (styles != null && typeof styles !== "object")
        throw Error("The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX.");
      styles && Object.freeze(styles);
      node = node.style;
      if (prevStyles != null) {
        if (styles) {
          var expandedUpdates = {};
          if (prevStyles) {
            for (var key in prevStyles)
              if (prevStyles.hasOwnProperty(key) && !styles.hasOwnProperty(key))
                for (var longhands = shorthandToLonghand[key] || [key], i = 0;i < longhands.length; i++)
                  expandedUpdates[longhands[i]] = key;
          }
          for (var _key in styles)
            if (styles.hasOwnProperty(_key) && (!prevStyles || prevStyles[_key] !== styles[_key]))
              for (key = shorthandToLonghand[_key] || [_key], longhands = 0;longhands < key.length; longhands++)
                expandedUpdates[key[longhands]] = _key;
          _key = {};
          for (var key$jscomp$0 in styles)
            for (key = shorthandToLonghand[key$jscomp$0] || [key$jscomp$0], longhands = 0;longhands < key.length; longhands++)
              _key[key[longhands]] = key$jscomp$0;
          key$jscomp$0 = {};
          for (var _key2 in expandedUpdates)
            if (key = expandedUpdates[_key2], (longhands = _key[_key2]) && key !== longhands && (i = key + "," + longhands, !key$jscomp$0[i])) {
              key$jscomp$0[i] = true;
              i = console;
              var value = styles[key];
              i.error.call(i, "%s a style property during rerender (%s) when a conflicting property is set (%s) can lead to styling bugs. To avoid this, don't mix shorthand and non-shorthand properties for the same value; instead, replace the shorthand with separate values.", value == null || typeof value === "boolean" || value === "" ? "Removing" : "Updating", key, longhands);
            }
        }
        for (var styleName in prevStyles)
          !prevStyles.hasOwnProperty(styleName) || styles != null && styles.hasOwnProperty(styleName) || (styleName.indexOf("--") === 0 ? node.setProperty(styleName, "") : styleName === "float" ? node.cssFloat = "" : node[styleName] = "");
        for (var _styleName in styles)
          _key2 = styles[_styleName], styles.hasOwnProperty(_styleName) && prevStyles[_styleName] !== _key2 && setValueForStyle(node, _styleName, _key2);
      } else
        for (expandedUpdates in styles)
          styles.hasOwnProperty(expandedUpdates) && setValueForStyle(node, expandedUpdates, styles[expandedUpdates]);
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
    function getAttributeAlias(name) {
      return aliases.get(name) || name;
    }
    function validateProperty$1(tagName, name) {
      if (hasOwnProperty.call(warnedProperties$1, name) && warnedProperties$1[name])
        return true;
      if (rARIACamel$1.test(name)) {
        tagName = "aria-" + name.slice(4).toLowerCase();
        tagName = ariaProperties.hasOwnProperty(tagName) ? tagName : null;
        if (tagName == null)
          return console.error("Invalid ARIA attribute `%s`. ARIA attributes follow the pattern aria-* and must be lowercase.", name), warnedProperties$1[name] = true;
        if (name !== tagName)
          return console.error("Invalid ARIA attribute `%s`. Did you mean `%s`?", name, tagName), warnedProperties$1[name] = true;
      }
      if (rARIA$1.test(name)) {
        tagName = name.toLowerCase();
        tagName = ariaProperties.hasOwnProperty(tagName) ? tagName : null;
        if (tagName == null)
          return warnedProperties$1[name] = true, false;
        name !== tagName && (console.error("Unknown ARIA attribute `%s`. Did you mean `%s`?", name, tagName), warnedProperties$1[name] = true);
      }
      return true;
    }
    function validateProperties$2(type, props) {
      var invalidProps = [], key;
      for (key in props)
        validateProperty$1(type, key) || invalidProps.push(key);
      props = invalidProps.map(function(prop) {
        return "`" + prop + "`";
      }).join(", ");
      invalidProps.length === 1 ? console.error("Invalid aria prop %s on <%s> tag. For details, see https://react.dev/link/invalid-aria-props", props, type) : 1 < invalidProps.length && console.error("Invalid aria props %s on <%s> tag. For details, see https://react.dev/link/invalid-aria-props", props, type);
    }
    function validateProperty(tagName, name, value, eventRegistry) {
      if (hasOwnProperty.call(warnedProperties, name) && warnedProperties[name])
        return true;
      var lowerCasedName = name.toLowerCase();
      if (lowerCasedName === "onfocusin" || lowerCasedName === "onfocusout")
        return console.error("React uses onFocus and onBlur instead of onFocusIn and onFocusOut. All React events are normalized to bubble, so onFocusIn and onFocusOut are not needed/supported by React."), warnedProperties[name] = true;
      if (typeof value === "function" && (tagName === "form" && name === "action" || tagName === "input" && name === "formAction" || tagName === "button" && name === "formAction"))
        return true;
      if (eventRegistry != null) {
        tagName = eventRegistry.possibleRegistrationNames;
        if (eventRegistry.registrationNameDependencies.hasOwnProperty(name))
          return true;
        eventRegistry = tagName.hasOwnProperty(lowerCasedName) ? tagName[lowerCasedName] : null;
        if (eventRegistry != null)
          return console.error("Invalid event handler property `%s`. Did you mean `%s`?", name, eventRegistry), warnedProperties[name] = true;
        if (EVENT_NAME_REGEX.test(name))
          return console.error("Unknown event handler property `%s`. It will be ignored.", name), warnedProperties[name] = true;
      } else if (EVENT_NAME_REGEX.test(name))
        return INVALID_EVENT_NAME_REGEX.test(name) && console.error("Invalid event handler property `%s`. React events use the camelCase naming convention, for example `onClick`.", name), warnedProperties[name] = true;
      if (rARIA.test(name) || rARIACamel.test(name))
        return true;
      if (lowerCasedName === "innerhtml")
        return console.error("Directly setting property `innerHTML` is not permitted. For more information, lookup documentation on `dangerouslySetInnerHTML`."), warnedProperties[name] = true;
      if (lowerCasedName === "aria")
        return console.error("The `aria` attribute is reserved for future use in React. Pass individual `aria-` attributes instead."), warnedProperties[name] = true;
      if (lowerCasedName === "is" && value !== null && value !== undefined && typeof value !== "string")
        return console.error("Received a `%s` for a string attribute `is`. If this is expected, cast the value to a string.", typeof value), warnedProperties[name] = true;
      if (typeof value === "number" && isNaN(value))
        return console.error("Received NaN for the `%s` attribute. If this is expected, cast the value to a string.", name), warnedProperties[name] = true;
      if (possibleStandardNames.hasOwnProperty(lowerCasedName)) {
        if (lowerCasedName = possibleStandardNames[lowerCasedName], lowerCasedName !== name)
          return console.error("Invalid DOM property `%s`. Did you mean `%s`?", name, lowerCasedName), warnedProperties[name] = true;
      } else if (name !== lowerCasedName)
        return console.error("React does not recognize the `%s` prop on a DOM element. If you intentionally want it to appear in the DOM as a custom attribute, spell it as lowercase `%s` instead. If you accidentally passed it from a parent component, remove it from the DOM element.", name, lowerCasedName), warnedProperties[name] = true;
      switch (name) {
        case "dangerouslySetInnerHTML":
        case "children":
        case "style":
        case "suppressContentEditableWarning":
        case "suppressHydrationWarning":
        case "defaultValue":
        case "defaultChecked":
        case "innerHTML":
        case "ref":
          return true;
        case "innerText":
        case "textContent":
          return true;
      }
      switch (typeof value) {
        case "boolean":
          switch (name) {
            case "autoFocus":
            case "checked":
            case "multiple":
            case "muted":
            case "selected":
            case "contentEditable":
            case "spellCheck":
            case "draggable":
            case "value":
            case "autoReverse":
            case "externalResourcesRequired":
            case "focusable":
            case "preserveAlpha":
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
            case "capture":
            case "download":
            case "inert":
              return true;
            default:
              lowerCasedName = name.toLowerCase().slice(0, 5);
              if (lowerCasedName === "data-" || lowerCasedName === "aria-")
                return true;
              value ? console.error('Received `%s` for a non-boolean attribute `%s`.\n\nIf you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.', value, name, name, value, name) : console.error('Received `%s` for a non-boolean attribute `%s`.\n\nIf you want to write it to the DOM, pass a string instead: %s="%s" or %s={value.toString()}.\n\nIf you used to conditionally omit it with %s={condition && value}, pass %s={condition ? value : undefined} instead.', value, name, name, value, name, name, name);
              return warnedProperties[name] = true;
          }
        case "function":
        case "symbol":
          return warnedProperties[name] = true, false;
        case "string":
          if (value === "false" || value === "true") {
            switch (name) {
              case "checked":
              case "selected":
              case "multiple":
              case "muted":
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
              case "inert":
                break;
              default:
                return true;
            }
            console.error("Received the string `%s` for the boolean attribute `%s`. %s Did you mean %s={%s}?", value, name, value === "false" ? "The browser will interpret it as a truthy value." : 'Although this works, it will not work as expected if you pass the string "false".', name, value);
            warnedProperties[name] = true;
          }
      }
      return true;
    }
    function warnUnknownProperties(type, props, eventRegistry) {
      var unknownProps = [], key;
      for (key in props)
        validateProperty(type, key, props[key], eventRegistry) || unknownProps.push(key);
      props = unknownProps.map(function(prop) {
        return "`" + prop + "`";
      }).join(", ");
      unknownProps.length === 1 ? console.error("Invalid value for prop %s on <%s> tag. Either remove it from the element, or pass a string or number value to keep it in the DOM. For details, see https://react.dev/link/attribute-behavior ", props, type) : 1 < unknownProps.length && console.error("Invalid values for props %s on <%s> tag. Either remove them from the element, or pass a string or number value to keep them in the DOM. For details, see https://react.dev/link/attribute-behavior ", props, type);
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
                checkAttributeStringCoercion(internalInstance, "name");
                props = props.querySelectorAll('input[name="' + escapeSelectorAttributeValueInsideDoubleQuotes("" + internalInstance) + '"][type="radio"]');
                for (internalInstance = 0;internalInstance < props.length; internalInstance++) {
                  var otherNode = props[internalInstance];
                  if (otherNode !== target && otherNode.form === target.form) {
                    var otherProps = otherNode[internalPropsKey] || null;
                    if (!otherProps)
                      throw Error("ReactDOMInput: Mixing React and non-React radio inputs with the same `name` is not supported.");
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
        throw Error("Expected `" + registrationName + "` listener to be a function, instead got a value of `" + typeof stateNode + "` type.");
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
          return nativeEvent.keyCode !== START_KEYCODE;
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
          if (nativeEvent.which !== SPACEBAR_CODE)
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
    function isEventSupported(eventNameSuffix) {
      if (!canUseDOM)
        return false;
      eventNameSuffix = "on" + eventNameSuffix;
      var isSupported = eventNameSuffix in document;
      isSupported || (isSupported = document.createElement("div"), isSupported.setAttribute(eventNameSuffix, "return;"), isSupported = typeof isSupported[eventNameSuffix] === "function");
      return isSupported;
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
    function getArrayKind(array) {
      for (var kind = EMPTY_ARRAY, i = 0;i < array.length; i++) {
        var value = array[i];
        if (typeof value === "object" && value !== null)
          if (isArrayImpl(value) && value.length === 2 && typeof value[0] === "string") {
            if (kind !== EMPTY_ARRAY && kind !== ENTRIES_ARRAY)
              return COMPLEX_ARRAY;
            kind = ENTRIES_ARRAY;
          } else
            return COMPLEX_ARRAY;
        else {
          if (typeof value === "function" || typeof value === "string" && 50 < value.length || kind !== EMPTY_ARRAY && kind !== PRIMITIVE_ARRAY)
            return COMPLEX_ARRAY;
          kind = PRIMITIVE_ARRAY;
        }
      }
      return kind;
    }
    function addObjectToProperties(object, properties, indent, prefix2) {
      for (var key in object)
        hasOwnProperty.call(object, key) && key[0] !== "_" && addValueToProperties(key, object[key], properties, indent, prefix2);
    }
    function addValueToProperties(propertyName, value, properties, indent, prefix2) {
      switch (typeof value) {
        case "object":
          if (value === null) {
            value = "null";
            break;
          } else {
            if (value.$$typeof === REACT_ELEMENT_TYPE) {
              var typeName2 = getComponentNameFromType(value.type) || "…", key = value.key;
              value = value.props;
              var propsKeys = Object.keys(value), propsLength = propsKeys.length;
              if (key == null && propsLength === 0) {
                value = "<" + typeName2 + " />";
                break;
              }
              if (3 > indent || propsLength === 1 && propsKeys[0] === "children" && key == null) {
                value = "<" + typeName2 + " … />";
                break;
              }
              properties.push([
                prefix2 + "  ".repeat(indent) + propertyName,
                "<" + typeName2
              ]);
              key !== null && addValueToProperties("key", key, properties, indent + 1, prefix2);
              propertyName = false;
              for (var propKey in value)
                propKey === "children" ? value.children != null && (!isArrayImpl(value.children) || 0 < value.children.length) && (propertyName = true) : hasOwnProperty.call(value, propKey) && propKey[0] !== "_" && addValueToProperties(propKey, value[propKey], properties, indent + 1, prefix2);
              properties.push([
                "",
                propertyName ? ">…</" + typeName2 + ">" : "/>"
              ]);
              return;
            }
            typeName2 = Object.prototype.toString.call(value);
            typeName2 = typeName2.slice(8, typeName2.length - 1);
            if (typeName2 === "Array") {
              if (propKey = getArrayKind(value), propKey === PRIMITIVE_ARRAY || propKey === EMPTY_ARRAY) {
                value = JSON.stringify(value);
                break;
              } else if (propKey === ENTRIES_ARRAY) {
                properties.push([
                  prefix2 + "  ".repeat(indent) + propertyName,
                  ""
                ]);
                for (propertyName = 0;propertyName < value.length; propertyName++)
                  typeName2 = value[propertyName], addValueToProperties(typeName2[0], typeName2[1], properties, indent + 1, prefix2);
                return;
              }
            }
            if (typeName2 === "Promise") {
              if (value.status === "fulfilled") {
                if (typeName2 = properties.length, addValueToProperties(propertyName, value.value, properties, indent, prefix2), properties.length > typeName2) {
                  properties = properties[typeName2];
                  properties[1] = "Promise<" + (properties[1] || "Object") + ">";
                  return;
                }
              } else if (value.status === "rejected" && (typeName2 = properties.length, addValueToProperties(propertyName, value.reason, properties, indent, prefix2), properties.length > typeName2)) {
                properties = properties[typeName2];
                properties[1] = "Rejected Promise<" + properties[1] + ">";
                return;
              }
              properties.push([
                "  ".repeat(indent) + propertyName,
                "Promise"
              ]);
              return;
            }
            typeName2 === "Object" && (propKey = Object.getPrototypeOf(value)) && typeof propKey.constructor === "function" && (typeName2 = propKey.constructor.name);
            properties.push([
              prefix2 + "  ".repeat(indent) + propertyName,
              typeName2 === "Object" ? 3 > indent ? "" : "…" : typeName2
            ]);
            3 > indent && addObjectToProperties(value, properties, indent + 1, prefix2);
            return;
          }
        case "function":
          value = value.name === "" ? "() => {}" : value.name + "() {}";
          break;
        case "string":
          value = value === OMITTED_PROP_ERROR ? "…" : JSON.stringify(value);
          break;
        case "undefined":
          value = "undefined";
          break;
        case "boolean":
          value = value ? "true" : "false";
          break;
        default:
          value = String(value);
      }
      properties.push([
        prefix2 + "  ".repeat(indent) + propertyName,
        value
      ]);
    }
    function addObjectDiffToProperties(prev, next, properties, indent) {
      var isDeeplyEqual = true;
      for (key in prev)
        key in next || (properties.push([
          REMOVED + "  ".repeat(indent) + key,
          "…"
        ]), isDeeplyEqual = false);
      for (var _key in next)
        if (_key in prev) {
          var key = prev[_key];
          var nextValue = next[_key];
          if (key !== nextValue) {
            if (indent === 0 && _key === "children")
              isDeeplyEqual = "  ".repeat(indent) + _key, properties.push([REMOVED + isDeeplyEqual, "…"], [ADDED + isDeeplyEqual, "…"]);
            else {
              if (!(3 <= indent)) {
                if (typeof key === "object" && typeof nextValue === "object" && key !== null && nextValue !== null && key.$$typeof === nextValue.$$typeof)
                  if (nextValue.$$typeof === REACT_ELEMENT_TYPE) {
                    if (key.type === nextValue.type && key.key === nextValue.key) {
                      key = getComponentNameFromType(nextValue.type) || "…";
                      isDeeplyEqual = "  ".repeat(indent) + _key;
                      key = "<" + key + " … />";
                      properties.push([REMOVED + isDeeplyEqual, key], [ADDED + isDeeplyEqual, key]);
                      isDeeplyEqual = false;
                      continue;
                    }
                  } else {
                    var prevKind = Object.prototype.toString.call(key), nextKind = Object.prototype.toString.call(nextValue);
                    if (prevKind === nextKind && (nextKind === "[object Object]" || nextKind === "[object Array]")) {
                      prevKind = [
                        UNCHANGED + "  ".repeat(indent) + _key,
                        nextKind === "[object Array]" ? "Array" : ""
                      ];
                      properties.push(prevKind);
                      nextKind = properties.length;
                      addObjectDiffToProperties(key, nextValue, properties, indent + 1) ? nextKind === properties.length && (prevKind[1] = "Referentially unequal but deeply equal objects. Consider memoization.") : isDeeplyEqual = false;
                      continue;
                    }
                  }
                else if (typeof key === "function" && typeof nextValue === "function" && key.name === nextValue.name && key.length === nextValue.length && (prevKind = Function.prototype.toString.call(key), nextKind = Function.prototype.toString.call(nextValue), prevKind === nextKind)) {
                  key = nextValue.name === "" ? "() => {}" : nextValue.name + "() {}";
                  properties.push([
                    UNCHANGED + "  ".repeat(indent) + _key,
                    key + " Referentially unequal function closure. Consider memoization."
                  ]);
                  continue;
                }
              }
              addValueToProperties(_key, key, properties, indent, REMOVED);
              addValueToProperties(_key, nextValue, properties, indent, ADDED);
            }
            isDeeplyEqual = false;
          }
        } else
          properties.push([
            ADDED + "  ".repeat(indent) + _key,
            "…"
          ]), isDeeplyEqual = false;
      return isDeeplyEqual;
    }
    function setCurrentTrackFromLanes(lanes) {
      currentTrack = lanes & 63 ? "Blocking" : lanes & 64 ? "Gesture" : lanes & 4194176 ? "Transition" : lanes & 62914560 ? "Suspense" : lanes & 2080374784 ? "Idle" : "Other";
    }
    function logComponentTrigger(fiber, startTime, endTime, trigger) {
      supportsUserTiming && (reusableComponentOptions.start = startTime, reusableComponentOptions.end = endTime, reusableComponentDevToolDetails.color = "warning", reusableComponentDevToolDetails.tooltipText = trigger, reusableComponentDevToolDetails.properties = null, (fiber = fiber._debugTask) ? fiber.run(performance.measure.bind(performance, trigger, reusableComponentOptions)) : performance.measure(trigger, reusableComponentOptions));
    }
    function logComponentReappeared(fiber, startTime, endTime) {
      logComponentTrigger(fiber, startTime, endTime, "Reconnect");
    }
    function logComponentRender(fiber, startTime, endTime, wasHydrated, committedLanes) {
      var name = getComponentNameFromFiber(fiber);
      if (name !== null && supportsUserTiming) {
        var { alternate, actualDuration: selfTime } = fiber;
        if (alternate === null || alternate.child !== fiber.child)
          for (var child = fiber.child;child !== null; child = child.sibling)
            selfTime -= child.actualDuration;
        wasHydrated = 0.5 > selfTime ? wasHydrated ? "tertiary-light" : "primary-light" : 10 > selfTime ? wasHydrated ? "tertiary" : "primary" : 100 > selfTime ? wasHydrated ? "tertiary-dark" : "primary-dark" : "error";
        var props = fiber.memoizedProps;
        selfTime = fiber._debugTask;
        props !== null && alternate !== null && alternate.memoizedProps !== props ? (child = [resuableChangedPropsEntry], props = addObjectDiffToProperties(alternate.memoizedProps, props, child, 0), 1 < child.length && (props && !alreadyWarnedForDeepEquality && (alternate.lanes & committedLanes) === 0 && 100 < fiber.actualDuration ? (alreadyWarnedForDeepEquality = true, child[0] = reusableDeeplyEqualPropsEntry, reusableComponentDevToolDetails.color = "warning", reusableComponentDevToolDetails.tooltipText = DEEP_EQUALITY_WARNING) : (reusableComponentDevToolDetails.color = wasHydrated, reusableComponentDevToolDetails.tooltipText = name), reusableComponentDevToolDetails.properties = child, reusableComponentOptions.start = startTime, reusableComponentOptions.end = endTime, selfTime != null ? selfTime.run(performance.measure.bind(performance, "​" + name, reusableComponentOptions)) : performance.measure("​" + name, reusableComponentOptions))) : selfTime != null ? selfTime.run(console.timeStamp.bind(console, name, startTime, endTime, COMPONENTS_TRACK, undefined, wasHydrated)) : console.timeStamp(name, startTime, endTime, COMPONENTS_TRACK, undefined, wasHydrated);
      }
    }
    function logComponentErrored(fiber, startTime, endTime, errors) {
      if (supportsUserTiming) {
        var name = getComponentNameFromFiber(fiber);
        if (name !== null) {
          for (var debugTask = null, properties = [], i = 0;i < errors.length; i++) {
            var capturedValue = errors[i];
            debugTask == null && capturedValue.source !== null && (debugTask = capturedValue.source._debugTask);
            capturedValue = capturedValue.value;
            properties.push([
              "Error",
              typeof capturedValue === "object" && capturedValue !== null && typeof capturedValue.message === "string" ? String(capturedValue.message) : String(capturedValue)
            ]);
          }
          fiber.key !== null && addValueToProperties("key", fiber.key, properties, 0, "");
          fiber.memoizedProps !== null && addObjectToProperties(fiber.memoizedProps, properties, 0, "");
          debugTask == null && (debugTask = fiber._debugTask);
          fiber = {
            start: startTime,
            end: endTime,
            detail: {
              devtools: {
                color: "error",
                track: COMPONENTS_TRACK,
                tooltipText: fiber.tag === 13 ? "Hydration failed" : "Error boundary caught an error",
                properties
              }
            }
          };
          debugTask ? debugTask.run(performance.measure.bind(performance, "​" + name, fiber)) : performance.measure("​" + name, fiber);
        }
      }
    }
    function logComponentEffect(fiber, startTime, endTime, selfTime, errors) {
      if (errors !== null) {
        if (supportsUserTiming) {
          var name = getComponentNameFromFiber(fiber);
          if (name !== null) {
            selfTime = [];
            for (var i = 0;i < errors.length; i++) {
              var error = errors[i].value;
              selfTime.push([
                "Error",
                typeof error === "object" && error !== null && typeof error.message === "string" ? String(error.message) : String(error)
              ]);
            }
            fiber.key !== null && addValueToProperties("key", fiber.key, selfTime, 0, "");
            fiber.memoizedProps !== null && addObjectToProperties(fiber.memoizedProps, selfTime, 0, "");
            startTime = {
              start: startTime,
              end: endTime,
              detail: {
                devtools: {
                  color: "error",
                  track: COMPONENTS_TRACK,
                  tooltipText: "A lifecycle or effect errored",
                  properties: selfTime
                }
              }
            };
            (fiber = fiber._debugTask) ? fiber.run(performance.measure.bind(performance, "​" + name, startTime)) : performance.measure("​" + name, startTime);
          }
        }
      } else
        name = getComponentNameFromFiber(fiber), name !== null && supportsUserTiming && (errors = 1 > selfTime ? "secondary-light" : 100 > selfTime ? "secondary" : 500 > selfTime ? "secondary-dark" : "error", (fiber = fiber._debugTask) ? fiber.run(console.timeStamp.bind(console, name, startTime, endTime, COMPONENTS_TRACK, undefined, errors)) : console.timeStamp(name, startTime, endTime, COMPONENTS_TRACK, undefined, errors));
    }
    function logRenderPhase(startTime, endTime, lanes, debugTask) {
      if (supportsUserTiming && !(endTime <= startTime)) {
        var color = (lanes & 738197653) === lanes ? "tertiary-dark" : "primary-dark";
        lanes = (lanes & 536870912) === lanes ? "Prepared" : (lanes & 201326741) === lanes ? "Hydrated" : "Render";
        debugTask ? debugTask.run(console.timeStamp.bind(console, lanes, startTime, endTime, currentTrack, LANES_TRACK_GROUP, color)) : console.timeStamp(lanes, startTime, endTime, currentTrack, LANES_TRACK_GROUP, color);
      }
    }
    function logSuspendedRenderPhase(startTime, endTime, lanes, debugTask) {
      !supportsUserTiming || endTime <= startTime || (lanes = (lanes & 738197653) === lanes ? "tertiary-dark" : "primary-dark", debugTask ? debugTask.run(console.timeStamp.bind(console, "Prewarm", startTime, endTime, currentTrack, LANES_TRACK_GROUP, lanes)) : console.timeStamp("Prewarm", startTime, endTime, currentTrack, LANES_TRACK_GROUP, lanes));
    }
    function logSuspendedWithDelayPhase(startTime, endTime, lanes, debugTask) {
      !supportsUserTiming || endTime <= startTime || (lanes = (lanes & 738197653) === lanes ? "tertiary-dark" : "primary-dark", debugTask ? debugTask.run(console.timeStamp.bind(console, "Suspended", startTime, endTime, currentTrack, LANES_TRACK_GROUP, lanes)) : console.timeStamp("Suspended", startTime, endTime, currentTrack, LANES_TRACK_GROUP, lanes));
    }
    function logRecoveredRenderPhase(startTime, endTime, lanes, recoverableErrors, hydrationFailed, debugTask) {
      if (supportsUserTiming && !(endTime <= startTime)) {
        lanes = [];
        for (var i = 0;i < recoverableErrors.length; i++) {
          var error = recoverableErrors[i].value;
          lanes.push([
            "Recoverable Error",
            typeof error === "object" && error !== null && typeof error.message === "string" ? String(error.message) : String(error)
          ]);
        }
        startTime = {
          start: startTime,
          end: endTime,
          detail: {
            devtools: {
              color: "primary-dark",
              track: currentTrack,
              trackGroup: LANES_TRACK_GROUP,
              tooltipText: hydrationFailed ? "Hydration Failed" : "Recovered after Error",
              properties: lanes
            }
          }
        };
        debugTask ? debugTask.run(performance.measure.bind(performance, "Recovered", startTime)) : performance.measure("Recovered", startTime);
      }
    }
    function logErroredRenderPhase(startTime, endTime, lanes, debugTask) {
      !supportsUserTiming || endTime <= startTime || (debugTask ? debugTask.run(console.timeStamp.bind(console, "Errored", startTime, endTime, currentTrack, LANES_TRACK_GROUP, "error")) : console.timeStamp("Errored", startTime, endTime, currentTrack, LANES_TRACK_GROUP, "error"));
    }
    function logSuspendedCommitPhase(startTime, endTime, reason, debugTask) {
      !supportsUserTiming || endTime <= startTime || (debugTask ? debugTask.run(console.timeStamp.bind(console, reason, startTime, endTime, currentTrack, LANES_TRACK_GROUP, "secondary-light")) : console.timeStamp(reason, startTime, endTime, currentTrack, LANES_TRACK_GROUP, "secondary-light"));
    }
    function logCommitErrored(startTime, endTime, errors, passive, debugTask) {
      if (supportsUserTiming && !(endTime <= startTime)) {
        for (var properties = [], i = 0;i < errors.length; i++) {
          var error = errors[i].value;
          properties.push([
            "Error",
            typeof error === "object" && error !== null && typeof error.message === "string" ? String(error.message) : String(error)
          ]);
        }
        startTime = {
          start: startTime,
          end: endTime,
          detail: {
            devtools: {
              color: "error",
              track: currentTrack,
              trackGroup: LANES_TRACK_GROUP,
              tooltipText: passive ? "Remaining Effects Errored" : "Commit Errored",
              properties
            }
          }
        };
        debugTask ? debugTask.run(performance.measure.bind(performance, "Errored", startTime)) : performance.measure("Errored", startTime);
      }
    }
    function logAnimatingPhase(startTime, endTime, debugTask) {
      !supportsUserTiming || endTime <= startTime || (debugTask ? debugTask.run(console.timeStamp.bind(console, "Animating", startTime, endTime, currentTrack, LANES_TRACK_GROUP, "secondary-dark")) : console.timeStamp("Animating", startTime, endTime, currentTrack, LANES_TRACK_GROUP, "secondary-dark"));
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
        parent.childLanes |= lane, alternate = parent.alternate, alternate !== null && (alternate.childLanes |= lane), parent.tag === 22 && (sourceFiber = parent.stateNode, sourceFiber === null || sourceFiber._visibility & OffscreenVisible || (isHidden = true)), sourceFiber = parent, parent = parent.return;
      return sourceFiber.tag === 3 ? (parent = sourceFiber.stateNode, isHidden && update !== null && (isHidden = 31 - clz32(lane), sourceFiber = parent.hiddenUpdates, alternate = sourceFiber[isHidden], alternate === null ? sourceFiber[isHidden] = [update] : alternate.push(update), update.lane = lane | 536870912), parent) : null;
    }
    function getRootForUpdatedFiber(sourceFiber) {
      if (nestedUpdateCount > NESTED_UPDATE_LIMIT)
        throw nestedPassiveUpdateCount = nestedUpdateCount = 0, rootWithPassiveNestedUpdates = rootWithNestedUpdates = null, Error("Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.");
      nestedPassiveUpdateCount > NESTED_PASSIVE_UPDATE_LIMIT && (nestedPassiveUpdateCount = 0, rootWithPassiveNestedUpdates = null, console.error("Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render."));
      sourceFiber.alternate === null && (sourceFiber.flags & 4098) !== 0 && warnAboutUpdateOnNotYetMountedFiberInDEV(sourceFiber);
      for (var node = sourceFiber, parent = node.return;parent !== null; )
        node.alternate === null && (node.flags & 4098) !== 0 && warnAboutUpdateOnNotYetMountedFiberInDEV(sourceFiber), node = parent, parent = node.return;
      return node.tag === 3 ? node.stateNode : null;
    }
    function resolveFunctionForHotReloading(type) {
      if (resolveFamily === null)
        return type;
      var family = resolveFamily(type);
      return family === undefined ? type : family.current;
    }
    function resolveForwardRefForHotReloading(type) {
      if (resolveFamily === null)
        return type;
      var family = resolveFamily(type);
      return family === undefined ? type !== null && type !== undefined && typeof type.render === "function" && (family = resolveFunctionForHotReloading(type.render), type.render !== family) ? (family = { $$typeof: REACT_FORWARD_REF_TYPE, render: family }, type.displayName !== undefined && (family.displayName = type.displayName), family) : type : family.current;
    }
    function isCompatibleFamilyForHotReloading(fiber, element) {
      if (resolveFamily === null)
        return false;
      var prevType = fiber.elementType;
      element = element.type;
      var needsCompareFamilies = false, $$typeofNextType = typeof element === "object" && element !== null ? element.$$typeof : null;
      switch (fiber.tag) {
        case 1:
          typeof element === "function" && (needsCompareFamilies = true);
          break;
        case 0:
          typeof element === "function" ? needsCompareFamilies = true : $$typeofNextType === REACT_LAZY_TYPE && (needsCompareFamilies = true);
          break;
        case 11:
          $$typeofNextType === REACT_FORWARD_REF_TYPE ? needsCompareFamilies = true : $$typeofNextType === REACT_LAZY_TYPE && (needsCompareFamilies = true);
          break;
        case 14:
        case 15:
          $$typeofNextType === REACT_MEMO_TYPE ? needsCompareFamilies = true : $$typeofNextType === REACT_LAZY_TYPE && (needsCompareFamilies = true);
          break;
        default:
          return false;
      }
      return needsCompareFamilies && (fiber = resolveFamily(prevType), fiber !== undefined && fiber === resolveFamily(element)) ? true : false;
    }
    function markFailedErrorBoundaryForHotReloading(fiber) {
      resolveFamily !== null && typeof WeakSet === "function" && (failedBoundaries === null && (failedBoundaries = new WeakSet), failedBoundaries.add(fiber));
    }
    function scheduleFibersWithFamiliesRecursively(fiber, updatedFamilies, staleFamilies) {
      do {
        var _fiber = fiber, alternate = _fiber.alternate, child = _fiber.child, sibling = _fiber.sibling, tag = _fiber.tag;
        _fiber = _fiber.type;
        var candidateType = null;
        switch (tag) {
          case 0:
          case 15:
          case 1:
            candidateType = _fiber;
            break;
          case 11:
            candidateType = _fiber.render;
        }
        if (resolveFamily === null)
          throw Error("Expected resolveFamily to be set during hot reload.");
        var needsRender = false;
        _fiber = false;
        candidateType !== null && (candidateType = resolveFamily(candidateType), candidateType !== undefined && (staleFamilies.has(candidateType) ? _fiber = true : updatedFamilies.has(candidateType) && (tag === 1 ? _fiber = true : needsRender = true)));
        failedBoundaries !== null && (failedBoundaries.has(fiber) || alternate !== null && failedBoundaries.has(alternate)) && (_fiber = true);
        _fiber && (fiber._debugNeedsRemount = true);
        if (_fiber || needsRender)
          alternate = enqueueConcurrentRenderForLane(fiber, 2), alternate !== null && scheduleUpdateOnFiber(alternate, fiber, 2);
        child === null || _fiber || scheduleFibersWithFamiliesRecursively(child, updatedFamilies, staleFamilies);
        if (sibling === null)
          break;
        fiber = sibling;
      } while (1);
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
      this.actualDuration = -0;
      this.actualStartTime = -1.1;
      this.treeBaseDuration = this.selfBaseDuration = -0;
      this._debugTask = this._debugStack = this._debugOwner = this._debugInfo = null;
      this._debugNeedsRemount = false;
      this._debugHookTypes = null;
      hasBadMapPolyfill || typeof Object.preventExtensions !== "function" || Object.preventExtensions(this);
    }
    function shouldConstruct(Component) {
      Component = Component.prototype;
      return !(!Component || !Component.isReactComponent);
    }
    function createWorkInProgress(current2, pendingProps) {
      var workInProgress2 = current2.alternate;
      workInProgress2 === null ? (workInProgress2 = createFiber(current2.tag, pendingProps, current2.key, current2.mode), workInProgress2.elementType = current2.elementType, workInProgress2.type = current2.type, workInProgress2.stateNode = current2.stateNode, workInProgress2._debugOwner = current2._debugOwner, workInProgress2._debugStack = current2._debugStack, workInProgress2._debugTask = current2._debugTask, workInProgress2._debugHookTypes = current2._debugHookTypes, workInProgress2.alternate = current2, current2.alternate = workInProgress2) : (workInProgress2.pendingProps = pendingProps, workInProgress2.type = current2.type, workInProgress2.flags = 0, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null, workInProgress2.actualDuration = -0, workInProgress2.actualStartTime = -1.1);
      workInProgress2.flags = current2.flags & 65011712;
      workInProgress2.childLanes = current2.childLanes;
      workInProgress2.lanes = current2.lanes;
      workInProgress2.child = current2.child;
      workInProgress2.memoizedProps = current2.memoizedProps;
      workInProgress2.memoizedState = current2.memoizedState;
      workInProgress2.updateQueue = current2.updateQueue;
      pendingProps = current2.dependencies;
      workInProgress2.dependencies = pendingProps === null ? null : {
        lanes: pendingProps.lanes,
        firstContext: pendingProps.firstContext,
        _debugThenableState: pendingProps._debugThenableState
      };
      workInProgress2.sibling = current2.sibling;
      workInProgress2.index = current2.index;
      workInProgress2.ref = current2.ref;
      workInProgress2.refCleanup = current2.refCleanup;
      workInProgress2.selfBaseDuration = current2.selfBaseDuration;
      workInProgress2.treeBaseDuration = current2.treeBaseDuration;
      workInProgress2._debugInfo = current2._debugInfo;
      workInProgress2._debugNeedsRemount = current2._debugNeedsRemount;
      switch (workInProgress2.tag) {
        case 0:
        case 15:
          workInProgress2.type = resolveFunctionForHotReloading(current2.type);
          break;
        case 1:
          workInProgress2.type = resolveFunctionForHotReloading(current2.type);
          break;
        case 11:
          workInProgress2.type = resolveForwardRefForHotReloading(current2.type);
      }
      return workInProgress2;
    }
    function resetWorkInProgress(workInProgress2, renderLanes2) {
      workInProgress2.flags &= 65011714;
      var current2 = workInProgress2.alternate;
      current2 === null ? (workInProgress2.childLanes = 0, workInProgress2.lanes = renderLanes2, workInProgress2.child = null, workInProgress2.subtreeFlags = 0, workInProgress2.memoizedProps = null, workInProgress2.memoizedState = null, workInProgress2.updateQueue = null, workInProgress2.dependencies = null, workInProgress2.stateNode = null, workInProgress2.selfBaseDuration = 0, workInProgress2.treeBaseDuration = 0) : (workInProgress2.childLanes = current2.childLanes, workInProgress2.lanes = current2.lanes, workInProgress2.child = current2.child, workInProgress2.subtreeFlags = 0, workInProgress2.deletions = null, workInProgress2.memoizedProps = current2.memoizedProps, workInProgress2.memoizedState = current2.memoizedState, workInProgress2.updateQueue = current2.updateQueue, workInProgress2.type = current2.type, renderLanes2 = current2.dependencies, workInProgress2.dependencies = renderLanes2 === null ? null : {
        lanes: renderLanes2.lanes,
        firstContext: renderLanes2.firstContext,
        _debugThenableState: renderLanes2._debugThenableState
      }, workInProgress2.selfBaseDuration = current2.selfBaseDuration, workInProgress2.treeBaseDuration = current2.treeBaseDuration);
      return workInProgress2;
    }
    function createFiberFromTypeAndProps(type, key, pendingProps, owner, mode, lanes) {
      var fiberTag = 0, resolvedType = type;
      if (typeof type === "function")
        shouldConstruct(type) && (fiberTag = 1), resolvedType = resolveFunctionForHotReloading(resolvedType);
      else if (typeof type === "string")
        fiberTag = getHostContext(), fiberTag = isHostHoistableType(type, pendingProps, fiberTag) ? 26 : type === "html" || type === "head" || type === "body" ? 27 : 5;
      else
        a:
          switch (type) {
            case REACT_ACTIVITY_TYPE:
              return key = createFiber(31, pendingProps, key, mode), key.elementType = REACT_ACTIVITY_TYPE, key.lanes = lanes, key;
            case REACT_FRAGMENT_TYPE:
              return createFiberFromFragment(pendingProps.children, mode, lanes, key);
            case REACT_STRICT_MODE_TYPE:
              fiberTag = 8;
              mode |= StrictLegacyMode;
              mode |= StrictEffectsMode;
              break;
            case REACT_PROFILER_TYPE:
              return type = pendingProps, owner = mode, typeof type.id !== "string" && console.error('Profiler must specify an "id" of type `string` as a prop. Received the type `%s` instead.', typeof type.id), key = createFiber(12, type, key, owner | ProfileMode), key.elementType = REACT_PROFILER_TYPE, key.lanes = lanes, key.stateNode = { effectDuration: 0, passiveEffectDuration: 0 }, key;
            case REACT_SUSPENSE_TYPE:
              return key = createFiber(13, pendingProps, key, mode), key.elementType = REACT_SUSPENSE_TYPE, key.lanes = lanes, key;
            case REACT_SUSPENSE_LIST_TYPE:
              return key = createFiber(19, pendingProps, key, mode), key.elementType = REACT_SUSPENSE_LIST_TYPE, key.lanes = lanes, key;
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
                    resolvedType = resolveForwardRefForHotReloading(resolvedType);
                    break a;
                  case REACT_MEMO_TYPE:
                    fiberTag = 14;
                    break a;
                  case REACT_LAZY_TYPE:
                    fiberTag = 16;
                    resolvedType = null;
                    break a;
                }
              resolvedType = "";
              if (type === undefined || typeof type === "object" && type !== null && Object.keys(type).length === 0)
                resolvedType += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
              type === null ? pendingProps = "null" : isArrayImpl(type) ? pendingProps = "array" : type !== undefined && type.$$typeof === REACT_ELEMENT_TYPE ? (pendingProps = "<" + (getComponentNameFromType(type.type) || "Unknown") + " />", resolvedType = " Did you accidentally export a JSX literal instead of a component?") : pendingProps = typeof type;
              (fiberTag = owner ? getComponentNameFromOwner(owner) : null) && (resolvedType += `

Check the render method of \`` + fiberTag + "`.");
              fiberTag = 29;
              pendingProps = Error("Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " + (pendingProps + "." + resolvedType));
              resolvedType = null;
          }
      key = createFiber(fiberTag, pendingProps, key, mode);
      key.elementType = type;
      key.type = resolvedType;
      key.lanes = lanes;
      key._debugOwner = owner;
      return key;
    }
    function createFiberFromElement(element, mode, lanes) {
      mode = createFiberFromTypeAndProps(element.type, element.key, element.props, element._owner, mode, lanes);
      mode._debugOwner = element._owner;
      mode._debugStack = element._debugStack;
      mode._debugTask = element._debugTask;
      return mode;
    }
    function createFiberFromFragment(elements, mode, lanes, key) {
      elements = createFiber(7, elements, key, mode);
      elements.lanes = lanes;
      return elements;
    }
    function createFiberFromText(content, mode, lanes) {
      content = createFiber(6, content, null, mode);
      content.lanes = lanes;
      return content;
    }
    function createFiberFromDehydratedFragment(dehydratedNode) {
      var fiber = createFiber(18, null, null, NoMode);
      fiber.stateNode = dehydratedNode;
      return fiber;
    }
    function createFiberFromPortal(portal, mode, lanes) {
      mode = createFiber(4, portal.children !== null ? portal.children : [], portal.key, mode);
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
    function pushTreeFork(workInProgress2, totalChildren) {
      warnIfNotHydrating();
      forkStack[forkStackIndex++] = treeForkCount;
      forkStack[forkStackIndex++] = treeForkProvider;
      treeForkProvider = workInProgress2;
      treeForkCount = totalChildren;
    }
    function pushTreeId(workInProgress2, totalChildren, index) {
      warnIfNotHydrating();
      idStack[idStackIndex++] = treeContextId;
      idStack[idStackIndex++] = treeContextOverflow;
      idStack[idStackIndex++] = treeContextProvider;
      treeContextProvider = workInProgress2;
      var baseIdWithLeadingBit = treeContextId;
      workInProgress2 = treeContextOverflow;
      var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
      baseIdWithLeadingBit &= ~(1 << baseLength);
      index += 1;
      var length = 32 - clz32(totalChildren) + baseLength;
      if (30 < length) {
        var numberOfOverflowBits = baseLength - baseLength % 5;
        length = (baseIdWithLeadingBit & (1 << numberOfOverflowBits) - 1).toString(32);
        baseIdWithLeadingBit >>= numberOfOverflowBits;
        baseLength -= numberOfOverflowBits;
        treeContextId = 1 << 32 - clz32(totalChildren) + baseLength | index << baseLength | baseIdWithLeadingBit;
        treeContextOverflow = length + workInProgress2;
      } else
        treeContextId = 1 << length | index << baseLength | baseIdWithLeadingBit, treeContextOverflow = workInProgress2;
    }
    function pushMaterializedTreeId(workInProgress2) {
      warnIfNotHydrating();
      workInProgress2.return !== null && (pushTreeFork(workInProgress2, 1), pushTreeId(workInProgress2, 1, 0));
    }
    function popTreeContext(workInProgress2) {
      for (;workInProgress2 === treeForkProvider; )
        treeForkProvider = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null, treeForkCount = forkStack[--forkStackIndex], forkStack[forkStackIndex] = null;
      for (;workInProgress2 === treeContextProvider; )
        treeContextProvider = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextOverflow = idStack[--idStackIndex], idStack[idStackIndex] = null, treeContextId = idStack[--idStackIndex], idStack[idStackIndex] = null;
    }
    function getSuspendedTreeContext() {
      warnIfNotHydrating();
      return treeContextProvider !== null ? { id: treeContextId, overflow: treeContextOverflow } : null;
    }
    function restoreSuspendedTreeContext(workInProgress2, suspendedContext) {
      warnIfNotHydrating();
      idStack[idStackIndex++] = treeContextId;
      idStack[idStackIndex++] = treeContextOverflow;
      idStack[idStackIndex++] = treeContextProvider;
      treeContextId = suspendedContext.id;
      treeContextOverflow = suspendedContext.overflow;
      treeContextProvider = workInProgress2;
    }
    function warnIfNotHydrating() {
      isHydrating || console.error("Expected to be hydrating. This is a bug in React. Please file an issue.");
    }
    function buildHydrationDiffNode(fiber, distanceFromLeaf) {
      if (fiber.return === null) {
        if (hydrationDiffRootDEV === null)
          hydrationDiffRootDEV = {
            fiber,
            children: [],
            serverProps: undefined,
            serverTail: [],
            distanceFromLeaf
          };
        else {
          if (hydrationDiffRootDEV.fiber !== fiber)
            throw Error("Saw multiple hydration diff roots in a pass. This is a bug in React.");
          hydrationDiffRootDEV.distanceFromLeaf > distanceFromLeaf && (hydrationDiffRootDEV.distanceFromLeaf = distanceFromLeaf);
        }
        return hydrationDiffRootDEV;
      }
      var siblings = buildHydrationDiffNode(fiber.return, distanceFromLeaf + 1).children;
      if (0 < siblings.length && siblings[siblings.length - 1].fiber === fiber)
        return siblings = siblings[siblings.length - 1], siblings.distanceFromLeaf > distanceFromLeaf && (siblings.distanceFromLeaf = distanceFromLeaf), siblings;
      distanceFromLeaf = {
        fiber,
        children: [],
        serverProps: undefined,
        serverTail: [],
        distanceFromLeaf
      };
      siblings.push(distanceFromLeaf);
      return distanceFromLeaf;
    }
    function warnIfHydrating() {
      isHydrating && console.error("We should not be hydrating here. This is a bug in React. Please file a bug.");
    }
    function warnNonHydratedInstance(fiber, rejectedCandidate) {
      didSuspendOrErrorDEV || (fiber = buildHydrationDiffNode(fiber, 0), fiber.serverProps = null, rejectedCandidate !== null && (rejectedCandidate = describeHydratableInstanceForDevWarnings(rejectedCandidate), fiber.serverTail.push(rejectedCandidate)));
    }
    function throwOnHydrationMismatch(fiber) {
      var fromText = 1 < arguments.length && arguments[1] !== undefined ? arguments[1] : false, diff = "", diffRoot = hydrationDiffRootDEV;
      diffRoot !== null && (hydrationDiffRootDEV = null, diff = describeDiff(diffRoot));
      queueHydrationError(createCapturedValueAtFiber(Error("Hydration failed because the server rendered " + (fromText ? "text" : "HTML") + ` didn't match the client. As a result this tree will be regenerated on the client. This can happen if a SSR-ed Client Component used:

- A server/client branch \`if (typeof window !== 'undefined')\`.
- Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

https://react.dev/link/hydration-mismatch` + diff), fiber));
      throw HydrationMismatchException;
    }
    function prepareToHydrateHostInstance(fiber) {
      var didHydrate = fiber.stateNode;
      var { type, memoizedProps: props } = fiber;
      didHydrate[internalInstanceKey] = fiber;
      didHydrate[internalPropsKey] = props;
      validatePropertiesInDevelopment(type, props);
      switch (type) {
        case "dialog":
          listenToNonDelegatedEvent("cancel", didHydrate);
          listenToNonDelegatedEvent("close", didHydrate);
          break;
        case "iframe":
        case "object":
        case "embed":
          listenToNonDelegatedEvent("load", didHydrate);
          break;
        case "video":
        case "audio":
          for (type = 0;type < mediaEventTypes.length; type++)
            listenToNonDelegatedEvent(mediaEventTypes[type], didHydrate);
          break;
        case "source":
          listenToNonDelegatedEvent("error", didHydrate);
          break;
        case "img":
        case "image":
        case "link":
          listenToNonDelegatedEvent("error", didHydrate);
          listenToNonDelegatedEvent("load", didHydrate);
          break;
        case "details":
          listenToNonDelegatedEvent("toggle", didHydrate);
          break;
        case "input":
          checkControlledValueProps("input", props);
          listenToNonDelegatedEvent("invalid", didHydrate);
          validateInputProps(didHydrate, props);
          initInput(didHydrate, props.value, props.defaultValue, props.checked, props.defaultChecked, props.type, props.name, true);
          break;
        case "option":
          validateOptionProps(didHydrate, props);
          break;
        case "select":
          checkControlledValueProps("select", props);
          listenToNonDelegatedEvent("invalid", didHydrate);
          validateSelectProps(didHydrate, props);
          break;
        case "textarea":
          checkControlledValueProps("textarea", props), listenToNonDelegatedEvent("invalid", didHydrate), validateTextareaProps(didHydrate, props), initTextarea(didHydrate, props.value, props.defaultValue, props.children);
      }
      type = props.children;
      typeof type !== "string" && typeof type !== "number" && typeof type !== "bigint" || didHydrate.textContent === "" + type || props.suppressHydrationWarning === true || checkForUnmatchedText(didHydrate.textContent, type) ? (props.popover != null && (listenToNonDelegatedEvent("beforetoggle", didHydrate), listenToNonDelegatedEvent("toggle", didHydrate)), props.onScroll != null && listenToNonDelegatedEvent("scroll", didHydrate), props.onScrollEnd != null && listenToNonDelegatedEvent("scrollend", didHydrate), props.onClick != null && (didHydrate.onclick = noop$1), didHydrate = true) : didHydrate = false;
      didHydrate || throwOnHydrationMismatch(fiber, true);
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
      if (JSCompiler_temp && nextHydratableInstance) {
        for (JSCompiler_temp = nextHydratableInstance;JSCompiler_temp; ) {
          var diffNode = buildHydrationDiffNode(fiber, 0), description = describeHydratableInstanceForDevWarnings(JSCompiler_temp);
          diffNode.serverTail.push(description);
          JSCompiler_temp = description.type === "Suspense" ? getNextHydratableInstanceAfterHydrationBoundary(JSCompiler_temp) : getNextHydratable(JSCompiler_temp.nextSibling);
        }
        throwOnHydrationMismatch(fiber);
      }
      popToNextHostParent(fiber);
      if (tag === 13) {
        fiber = fiber.memoizedState;
        fiber = fiber !== null ? fiber.dehydrated : null;
        if (!fiber)
          throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
        nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
      } else if (tag === 31) {
        fiber = fiber.memoizedState;
        fiber = fiber !== null ? fiber.dehydrated : null;
        if (!fiber)
          throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
        nextHydratableInstance = getNextHydratableInstanceAfterHydrationBoundary(fiber);
      } else
        tag === 27 ? (tag = nextHydratableInstance, isSingletonScope(fiber.type) ? (fiber = previousHydratableOnEnteringScopedSingleton, previousHydratableOnEnteringScopedSingleton = null, nextHydratableInstance = fiber) : nextHydratableInstance = tag) : nextHydratableInstance = hydrationParentFiber ? getNextHydratable(fiber.stateNode.nextSibling) : null;
      return true;
    }
    function resetHydrationState() {
      nextHydratableInstance = hydrationParentFiber = null;
      didSuspendOrErrorDEV = isHydrating = false;
    }
    function upgradeHydrationErrorsToRecoverable() {
      var queuedErrors = hydrationErrors;
      queuedErrors !== null && (workInProgressRootRecoverableErrors === null ? workInProgressRootRecoverableErrors = queuedErrors : workInProgressRootRecoverableErrors.push.apply(workInProgressRootRecoverableErrors, queuedErrors), hydrationErrors = null);
      return queuedErrors;
    }
    function queueHydrationError(error) {
      hydrationErrors === null ? hydrationErrors = [error] : hydrationErrors.push(error);
    }
    function emitPendingHydrationWarnings() {
      var diffRoot = hydrationDiffRootDEV;
      if (diffRoot !== null) {
        hydrationDiffRootDEV = null;
        for (var diff = describeDiff(diffRoot);0 < diffRoot.children.length; )
          diffRoot = diffRoot.children[0];
        runWithFiberInDEV(diffRoot.fiber, function() {
          console.error(`A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch \`if (typeof window !== 'undefined')\`.
- Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.
- Date formatting in a user's locale which doesn't match the server.
- External changing data without sending a snapshot of it along with the HTML.
- Invalid HTML tag nesting.

It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.

%s%s`, "https://react.dev/link/hydration-mismatch", diff);
        });
      }
    }
    function resetContextDependencies() {
      lastContextDependency = currentlyRenderingFiber$1 = null;
      isDisallowedContextReadInDEV = false;
    }
    function pushProvider(providerFiber, context, nextValue) {
      push(valueCursor, context._currentValue, providerFiber);
      context._currentValue = nextValue;
      push(rendererCursorDEV, context._currentRenderer, providerFiber);
      context._currentRenderer !== undefined && context._currentRenderer !== null && context._currentRenderer !== rendererSigil && console.error("Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported.");
      context._currentRenderer = rendererSigil;
    }
    function popProvider(context, providerFiber) {
      context._currentValue = valueCursor.current;
      var currentRenderer = rendererCursorDEV.current;
      pop(rendererCursorDEV, providerFiber);
      context._currentRenderer = currentRenderer;
      pop(valueCursor, providerFiber);
    }
    function scheduleContextWorkOnParentPath(parent, renderLanes2, propagationRoot) {
      for (;parent !== null; ) {
        var alternate = parent.alternate;
        (parent.childLanes & renderLanes2) !== renderLanes2 ? (parent.childLanes |= renderLanes2, alternate !== null && (alternate.childLanes |= renderLanes2)) : alternate !== null && (alternate.childLanes & renderLanes2) !== renderLanes2 && (alternate.childLanes |= renderLanes2);
        if (parent === propagationRoot)
          break;
        parent = parent.return;
      }
      parent !== propagationRoot && console.error("Expected to find the propagation root when scheduling context work. This error is likely caused by a bug in React. Please file an issue.");
    }
    function propagateContextChanges(workInProgress2, contexts, renderLanes2, forcePropagateEntireTree) {
      var fiber = workInProgress2.child;
      fiber !== null && (fiber.return = workInProgress2);
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
                  list.lanes |= renderLanes2;
                  dependency = list.alternate;
                  dependency !== null && (dependency.lanes |= renderLanes2);
                  scheduleContextWorkOnParentPath(list.return, renderLanes2, workInProgress2);
                  forcePropagateEntireTree || (nextFiber = null);
                  break a;
                }
              list = dependency.next;
            }
        } else if (fiber.tag === 18) {
          nextFiber = fiber.return;
          if (nextFiber === null)
            throw Error("We just came from a parent so we must have had a parent. This is a bug in React.");
          nextFiber.lanes |= renderLanes2;
          list = nextFiber.alternate;
          list !== null && (list.lanes |= renderLanes2);
          scheduleContextWorkOnParentPath(nextFiber, renderLanes2, workInProgress2);
          nextFiber = null;
        } else
          nextFiber = fiber.child;
        if (nextFiber !== null)
          nextFiber.return = fiber;
        else
          for (nextFiber = fiber;nextFiber !== null; ) {
            if (nextFiber === workInProgress2) {
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
    function propagateParentContextChanges(current2, workInProgress2, renderLanes2, forcePropagateEntireTree) {
      current2 = null;
      for (var parent = workInProgress2, isInsidePropagationBailout = false;parent !== null; ) {
        if (!isInsidePropagationBailout) {
          if ((parent.flags & 524288) !== 0)
            isInsidePropagationBailout = true;
          else if ((parent.flags & 262144) !== 0)
            break;
        }
        if (parent.tag === 10) {
          var currentParent = parent.alternate;
          if (currentParent === null)
            throw Error("Should have a current fiber. This is a bug in React.");
          currentParent = currentParent.memoizedProps;
          if (currentParent !== null) {
            var context = parent.type;
            objectIs(parent.pendingProps.value, currentParent.value) || (current2 !== null ? current2.push(context) : current2 = [context]);
          }
        } else if (parent === hostTransitionProviderCursor.current) {
          currentParent = parent.alternate;
          if (currentParent === null)
            throw Error("Should have a current fiber. This is a bug in React.");
          currentParent.memoizedState.memoizedState !== parent.memoizedState.memoizedState && (current2 !== null ? current2.push(HostTransitionContext) : current2 = [HostTransitionContext]);
        }
        parent = parent.return;
      }
      current2 !== null && propagateContextChanges(workInProgress2, current2, renderLanes2, forcePropagateEntireTree);
      workInProgress2.flags |= 262144;
    }
    function checkIfContextChanged(currentDependencies) {
      for (currentDependencies = currentDependencies.firstContext;currentDependencies !== null; ) {
        if (!objectIs(currentDependencies.context._currentValue, currentDependencies.memoizedValue))
          return true;
        currentDependencies = currentDependencies.next;
      }
      return false;
    }
    function prepareToReadContext(workInProgress2) {
      currentlyRenderingFiber$1 = workInProgress2;
      lastContextDependency = null;
      workInProgress2 = workInProgress2.dependencies;
      workInProgress2 !== null && (workInProgress2.firstContext = null);
    }
    function readContext(context) {
      isDisallowedContextReadInDEV && console.error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().");
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
          throw Error("Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo().");
        lastContextDependency = context;
        consumer.dependencies = {
          lanes: 0,
          firstContext: context,
          _debugThenableState: null
        };
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
    function retainCache(cache) {
      cache.controller.signal.aborted && console.warn("A cache instance was retained after it was already freed. This likely indicates a bug in React.");
      cache.refCount++;
    }
    function releaseCache(cache) {
      cache.refCount--;
      0 > cache.refCount && console.warn("A cache instance was released after it was already freed. This likely indicates a bug in React.");
      cache.refCount === 0 && scheduleCallback$2(NormalPriority, function() {
        cache.controller.abort();
      });
    }
    function startUpdateTimerByLane(lane, method, fiber) {
      if ((lane & 127) !== 0)
        0 > blockingUpdateTime && (blockingUpdateTime = now(), blockingUpdateTask = createTask(method), blockingUpdateMethodName = method, fiber != null && (blockingUpdateComponentName = getComponentNameFromFiber(fiber)), (executionContext & (RenderContext | CommitContext)) !== NoContext && (componentEffectSpawnedUpdate = true, blockingUpdateType = SPAWNED_UPDATE), lane = resolveEventTimeStamp(), method = resolveEventType(), lane !== blockingEventRepeatTime || method !== blockingEventType ? blockingEventRepeatTime = -1.1 : method !== null && (blockingUpdateType = SPAWNED_UPDATE), blockingEventTime = lane, blockingEventType = method);
      else if ((lane & 4194048) !== 0 && 0 > transitionUpdateTime && (transitionUpdateTime = now(), transitionUpdateTask = createTask(method), transitionUpdateMethodName = method, fiber != null && (transitionUpdateComponentName = getComponentNameFromFiber(fiber)), 0 > transitionStartTime)) {
        lane = resolveEventTimeStamp();
        method = resolveEventType();
        if (lane !== transitionEventRepeatTime || method !== transitionEventType)
          transitionEventRepeatTime = -1.1;
        transitionEventTime = lane;
        transitionEventType = method;
      }
    }
    function startHostActionTimer(fiber) {
      if (0 > blockingUpdateTime) {
        blockingUpdateTime = now();
        blockingUpdateTask = fiber._debugTask != null ? fiber._debugTask : null;
        (executionContext & (RenderContext | CommitContext)) !== NoContext && (blockingUpdateType = SPAWNED_UPDATE);
        var newEventTime = resolveEventTimeStamp(), newEventType = resolveEventType();
        newEventTime !== blockingEventRepeatTime || newEventType !== blockingEventType ? blockingEventRepeatTime = -1.1 : newEventType !== null && (blockingUpdateType = SPAWNED_UPDATE);
        blockingEventTime = newEventTime;
        blockingEventType = newEventType;
      }
      if (0 > transitionUpdateTime && (transitionUpdateTime = now(), transitionUpdateTask = fiber._debugTask != null ? fiber._debugTask : null, 0 > transitionStartTime)) {
        fiber = resolveEventTimeStamp();
        newEventTime = resolveEventType();
        if (fiber !== transitionEventRepeatTime || newEventTime !== transitionEventType)
          transitionEventRepeatTime = -1.1;
        transitionEventTime = fiber;
        transitionEventType = newEventTime;
      }
    }
    function pushNestedEffectDurations() {
      var prevEffectDuration = profilerEffectDuration;
      profilerEffectDuration = 0;
      return prevEffectDuration;
    }
    function popNestedEffectDurations(prevEffectDuration) {
      var elapsedTime = profilerEffectDuration;
      profilerEffectDuration = prevEffectDuration;
      return elapsedTime;
    }
    function bubbleNestedEffectDurations(prevEffectDuration) {
      var elapsedTime = profilerEffectDuration;
      profilerEffectDuration += prevEffectDuration;
      return elapsedTime;
    }
    function resetComponentEffectTimers() {
      componentEffectEndTime = componentEffectStartTime = -1.1;
    }
    function pushComponentEffectStart() {
      var prevEffectStart = componentEffectStartTime;
      componentEffectStartTime = -1.1;
      return prevEffectStart;
    }
    function popComponentEffectStart(prevEffectStart) {
      0 <= prevEffectStart && (componentEffectStartTime = prevEffectStart);
    }
    function pushComponentEffectDuration() {
      var prevEffectDuration = componentEffectDuration;
      componentEffectDuration = -0;
      return prevEffectDuration;
    }
    function popComponentEffectDuration(prevEffectDuration) {
      0 <= prevEffectDuration && (componentEffectDuration = prevEffectDuration);
    }
    function pushComponentEffectErrors() {
      var prevErrors = componentEffectErrors;
      componentEffectErrors = null;
      return prevErrors;
    }
    function pushComponentEffectDidSpawnUpdate() {
      var prev = componentEffectSpawnedUpdate;
      componentEffectSpawnedUpdate = false;
      return prev;
    }
    function startProfilerTimer(fiber) {
      profilerStartTime = now();
      0 > fiber.actualStartTime && (fiber.actualStartTime = profilerStartTime);
    }
    function stopProfilerTimerIfRunningAndRecordDuration(fiber) {
      if (0 <= profilerStartTime) {
        var elapsedTime = now() - profilerStartTime;
        fiber.actualDuration += elapsedTime;
        fiber.selfBaseDuration = elapsedTime;
        profilerStartTime = -1;
      }
    }
    function stopProfilerTimerIfRunningAndRecordIncompleteDuration(fiber) {
      if (0 <= profilerStartTime) {
        var elapsedTime = now() - profilerStartTime;
        fiber.actualDuration += elapsedTime;
        profilerStartTime = -1;
      }
    }
    function recordEffectDuration() {
      if (0 <= profilerStartTime) {
        var endTime = now(), elapsedTime = endTime - profilerStartTime;
        profilerStartTime = -1;
        profilerEffectDuration += elapsedTime;
        componentEffectDuration += elapsedTime;
        componentEffectEndTime = endTime;
      }
    }
    function recordEffectError(errorInfo) {
      componentEffectErrors === null && (componentEffectErrors = []);
      componentEffectErrors.push(errorInfo);
      commitErrors === null && (commitErrors = []);
      commitErrors.push(errorInfo);
    }
    function startEffectTimer() {
      profilerStartTime = now();
      0 > componentEffectStartTime && (componentEffectStartTime = profilerStartTime);
    }
    function transferActualDuration(fiber) {
      for (var child = fiber.child;child; )
        fiber.actualDuration += child.actualDuration, child = child.sibling;
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
      if (--currentEntangledPendingCount === 0 && (-1 < transitionUpdateTime || (transitionStartTime = -1.1), currentEntangledListeners !== null)) {
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
      prevCachePool === null ? push(resumedCache, resumedCache.current, offscreenWorkInProgress) : push(resumedCache, prevCachePool.pool, offscreenWorkInProgress);
    }
    function getSuspendedCache() {
      var cacheFromPool = peekCacheFromPool();
      return cacheFromPool === null ? null : { parent: CacheContext._currentValue, pool: cacheFromPool };
    }
    function createThenableState() {
      return { didWarnAboutUncachedPromise: false, thenables: [] };
    }
    function isThenableResolved(thenable) {
      thenable = thenable.status;
      return thenable === "fulfilled" || thenable === "rejected";
    }
    function trackUsedThenable(thenableState2, thenable, index) {
      ReactSharedInternals.actQueue !== null && (ReactSharedInternals.didUsePromise = true);
      var trackedThenables = thenableState2.thenables;
      index = trackedThenables[index];
      index === undefined ? trackedThenables.push(thenable) : index !== thenable && (thenableState2.didWarnAboutUncachedPromise || (thenableState2.didWarnAboutUncachedPromise = true, console.error("A component was suspended by an uncached promise. Creating promises inside a Client Component or hook is not yet supported, except via a Suspense-compatible library or framework.")), thenable.then(noop$1, noop$1), thenable = index);
      if (thenable._debugInfo === undefined) {
        thenableState2 = performance.now();
        trackedThenables = thenable.displayName;
        var ioInfo = {
          name: typeof trackedThenables === "string" ? trackedThenables : "Promise",
          start: thenableState2,
          end: thenableState2,
          value: thenable
        };
        thenable._debugInfo = [{ awaited: ioInfo }];
        thenable.status !== "fulfilled" && thenable.status !== "rejected" && (thenableState2 = function() {
          ioInfo.end = performance.now();
        }, thenable.then(thenableState2, thenableState2));
      }
      switch (thenable.status) {
        case "fulfilled":
          return thenable.value;
        case "rejected":
          throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
        default:
          if (typeof thenable.status === "string")
            thenable.then(noop$1, noop$1);
          else {
            thenableState2 = workInProgressRoot;
            if (thenableState2 !== null && 100 < thenableState2.shellSuspendCounter)
              throw Error("An unknown Component is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.");
            thenableState2 = thenable;
            thenableState2.status = "pending";
            thenableState2.then(function(fulfilledValue) {
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
              throw thenableState2 = thenable.reason, checkIfUseWrappedInAsyncCatch(thenableState2), thenableState2;
          }
          suspendedThenable = thenable;
          needsToResetSuspendedThenableDEV = true;
          throw SuspenseException;
      }
    }
    function resolveLazy(lazyType) {
      try {
        return callLazyInitInDEV(lazyType);
      } catch (x) {
        if (x !== null && typeof x === "object" && typeof x.then === "function")
          throw suspendedThenable = x, needsToResetSuspendedThenableDEV = true, SuspenseException;
        throw x;
      }
    }
    function getSuspendedThenable() {
      if (suspendedThenable === null)
        throw Error("Expected a suspended thenable. This is a bug in React. Please file an issue.");
      var thenable = suspendedThenable;
      suspendedThenable = null;
      needsToResetSuspendedThenableDEV = false;
      return thenable;
    }
    function checkIfUseWrappedInAsyncCatch(rejectedReason) {
      if (rejectedReason === SuspenseException || rejectedReason === SuspenseActionException)
        throw Error("Hooks are not supported inside an async component. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.");
    }
    function pushDebugInfo(debugInfo) {
      var previousDebugInfo = currentDebugInfo;
      debugInfo != null && (currentDebugInfo = previousDebugInfo === null ? debugInfo : previousDebugInfo.concat(debugInfo));
      return previousDebugInfo;
    }
    function getCurrentDebugTask() {
      var debugInfo = currentDebugInfo;
      if (debugInfo != null) {
        for (var i = debugInfo.length - 1;0 <= i; i--)
          if (debugInfo[i].name != null) {
            var debugTask = debugInfo[i].debugTask;
            if (debugTask != null)
              return debugTask;
          }
      }
      return null;
    }
    function validateFragmentProps(element, fiber, returnFiber) {
      for (var keys = Object.keys(element.props), i = 0;i < keys.length; i++) {
        var key = keys[i];
        if (key !== "children" && key !== "key") {
          fiber === null && (fiber = createFiberFromElement(element, returnFiber.mode, 0), fiber._debugInfo = currentDebugInfo, fiber.return = returnFiber);
          runWithFiberInDEV(fiber, function(erroredKey) {
            console.error("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", erroredKey);
          }, key);
          break;
        }
      }
    }
    function unwrapThenable(thenable) {
      var index = thenableIndexCounter$1;
      thenableIndexCounter$1 += 1;
      thenableState$1 === null && (thenableState$1 = createThenableState());
      return trackUsedThenable(thenableState$1, thenable, index);
    }
    function coerceRef(workInProgress2, element) {
      element = element.props.ref;
      workInProgress2.ref = element !== undefined ? element : null;
    }
    function throwOnInvalidObjectTypeImpl(returnFiber, newChild) {
      if (newChild.$$typeof === REACT_LEGACY_ELEMENT_TYPE)
        throw Error(`A React Element from an older version of React was rendered. This is not supported. It can happen if:
- Multiple copies of the "react" package is used.
- A library pre-bundled an old copy of "react" or "react/jsx-runtime".
- A compiler tries to "inline" JSX instead of using the runtime.`);
      returnFiber = Object.prototype.toString.call(newChild);
      throw Error("Objects are not valid as a React child (found: " + (returnFiber === "[object Object]" ? "object with keys {" + Object.keys(newChild).join(", ") + "}" : returnFiber) + "). If you meant to render a collection of children, use an array instead.");
    }
    function throwOnInvalidObjectType(returnFiber, newChild) {
      var debugTask = getCurrentDebugTask();
      debugTask !== null ? debugTask.run(throwOnInvalidObjectTypeImpl.bind(null, returnFiber, newChild)) : throwOnInvalidObjectTypeImpl(returnFiber, newChild);
    }
    function warnOnFunctionTypeImpl(returnFiber, invalidChild) {
      var parentName = getComponentNameFromFiber(returnFiber) || "Component";
      ownerHasFunctionTypeWarning[parentName] || (ownerHasFunctionTypeWarning[parentName] = true, invalidChild = invalidChild.displayName || invalidChild.name || "Component", returnFiber.tag === 3 ? console.error(`Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.
  root.render(%s)`, invalidChild, invalidChild, invalidChild) : console.error(`Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.
  <%s>{%s}</%s>`, invalidChild, invalidChild, parentName, invalidChild, parentName));
    }
    function warnOnFunctionType(returnFiber, invalidChild) {
      var debugTask = getCurrentDebugTask();
      debugTask !== null ? debugTask.run(warnOnFunctionTypeImpl.bind(null, returnFiber, invalidChild)) : warnOnFunctionTypeImpl(returnFiber, invalidChild);
    }
    function warnOnSymbolTypeImpl(returnFiber, invalidChild) {
      var parentName = getComponentNameFromFiber(returnFiber) || "Component";
      ownerHasSymbolTypeWarning[parentName] || (ownerHasSymbolTypeWarning[parentName] = true, invalidChild = String(invalidChild), returnFiber.tag === 3 ? console.error(`Symbols are not valid as a React child.
  root.render(%s)`, invalidChild) : console.error(`Symbols are not valid as a React child.
  <%s>%s</%s>`, parentName, invalidChild, parentName));
    }
    function warnOnSymbolType(returnFiber, invalidChild) {
      var debugTask = getCurrentDebugTask();
      debugTask !== null ? debugTask.run(warnOnSymbolTypeImpl.bind(null, returnFiber, invalidChild)) : warnOnSymbolTypeImpl(returnFiber, invalidChild);
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
      function updateTextNode(returnFiber, current2, textContent, lanes) {
        if (current2 === null || current2.tag !== 6)
          return current2 = createFiberFromText(textContent, returnFiber.mode, lanes), current2.return = returnFiber, current2._debugOwner = returnFiber, current2._debugTask = returnFiber._debugTask, current2._debugInfo = currentDebugInfo, current2;
        current2 = useFiber(current2, textContent);
        current2.return = returnFiber;
        current2._debugInfo = currentDebugInfo;
        return current2;
      }
      function updateElement(returnFiber, current2, element, lanes) {
        var elementType = element.type;
        if (elementType === REACT_FRAGMENT_TYPE)
          return current2 = updateFragment(returnFiber, current2, element.props.children, lanes, element.key), validateFragmentProps(element, current2, returnFiber), current2;
        if (current2 !== null && (current2.elementType === elementType || isCompatibleFamilyForHotReloading(current2, element) || typeof elementType === "object" && elementType !== null && elementType.$$typeof === REACT_LAZY_TYPE && resolveLazy(elementType) === current2.type))
          return current2 = useFiber(current2, element.props), coerceRef(current2, element), current2.return = returnFiber, current2._debugOwner = element._owner, current2._debugInfo = currentDebugInfo, current2;
        current2 = createFiberFromElement(element, returnFiber.mode, lanes);
        coerceRef(current2, element);
        current2.return = returnFiber;
        current2._debugInfo = currentDebugInfo;
        return current2;
      }
      function updatePortal(returnFiber, current2, portal, lanes) {
        if (current2 === null || current2.tag !== 4 || current2.stateNode.containerInfo !== portal.containerInfo || current2.stateNode.implementation !== portal.implementation)
          return current2 = createFiberFromPortal(portal, returnFiber.mode, lanes), current2.return = returnFiber, current2._debugInfo = currentDebugInfo, current2;
        current2 = useFiber(current2, portal.children || []);
        current2.return = returnFiber;
        current2._debugInfo = currentDebugInfo;
        return current2;
      }
      function updateFragment(returnFiber, current2, fragment, lanes, key) {
        if (current2 === null || current2.tag !== 7)
          return current2 = createFiberFromFragment(fragment, returnFiber.mode, lanes, key), current2.return = returnFiber, current2._debugOwner = returnFiber, current2._debugTask = returnFiber._debugTask, current2._debugInfo = currentDebugInfo, current2;
        current2 = useFiber(current2, fragment);
        current2.return = returnFiber;
        current2._debugInfo = currentDebugInfo;
        return current2;
      }
      function createChild(returnFiber, newChild, lanes) {
        if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
          return newChild = createFiberFromText("" + newChild, returnFiber.mode, lanes), newChild.return = returnFiber, newChild._debugOwner = returnFiber, newChild._debugTask = returnFiber._debugTask, newChild._debugInfo = currentDebugInfo, newChild;
        if (typeof newChild === "object" && newChild !== null) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return lanes = createFiberFromElement(newChild, returnFiber.mode, lanes), coerceRef(lanes, newChild), lanes.return = returnFiber, returnFiber = pushDebugInfo(newChild._debugInfo), lanes._debugInfo = currentDebugInfo, currentDebugInfo = returnFiber, lanes;
            case REACT_PORTAL_TYPE:
              return newChild = createFiberFromPortal(newChild, returnFiber.mode, lanes), newChild.return = returnFiber, newChild._debugInfo = currentDebugInfo, newChild;
            case REACT_LAZY_TYPE:
              var _prevDebugInfo = pushDebugInfo(newChild._debugInfo);
              newChild = resolveLazy(newChild);
              returnFiber = createChild(returnFiber, newChild, lanes);
              currentDebugInfo = _prevDebugInfo;
              return returnFiber;
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild))
            return lanes = createFiberFromFragment(newChild, returnFiber.mode, lanes, null), lanes.return = returnFiber, lanes._debugOwner = returnFiber, lanes._debugTask = returnFiber._debugTask, returnFiber = pushDebugInfo(newChild._debugInfo), lanes._debugInfo = currentDebugInfo, currentDebugInfo = returnFiber, lanes;
          if (typeof newChild.then === "function")
            return _prevDebugInfo = pushDebugInfo(newChild._debugInfo), returnFiber = createChild(returnFiber, unwrapThenable(newChild), lanes), currentDebugInfo = _prevDebugInfo, returnFiber;
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return createChild(returnFiber, readContextDuringReconciliation(returnFiber, newChild), lanes);
          throwOnInvalidObjectType(returnFiber, newChild);
        }
        typeof newChild === "function" && warnOnFunctionType(returnFiber, newChild);
        typeof newChild === "symbol" && warnOnSymbolType(returnFiber, newChild);
        return null;
      }
      function updateSlot(returnFiber, oldFiber, newChild, lanes) {
        var key = oldFiber !== null ? oldFiber.key : null;
        if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
          return key !== null ? null : updateTextNode(returnFiber, oldFiber, "" + newChild, lanes);
        if (typeof newChild === "object" && newChild !== null) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return newChild.key === key ? (key = pushDebugInfo(newChild._debugInfo), returnFiber = updateElement(returnFiber, oldFiber, newChild, lanes), currentDebugInfo = key, returnFiber) : null;
            case REACT_PORTAL_TYPE:
              return newChild.key === key ? updatePortal(returnFiber, oldFiber, newChild, lanes) : null;
            case REACT_LAZY_TYPE:
              return key = pushDebugInfo(newChild._debugInfo), newChild = resolveLazy(newChild), returnFiber = updateSlot(returnFiber, oldFiber, newChild, lanes), currentDebugInfo = key, returnFiber;
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild)) {
            if (key !== null)
              return null;
            key = pushDebugInfo(newChild._debugInfo);
            returnFiber = updateFragment(returnFiber, oldFiber, newChild, lanes, null);
            currentDebugInfo = key;
            return returnFiber;
          }
          if (typeof newChild.then === "function")
            return key = pushDebugInfo(newChild._debugInfo), returnFiber = updateSlot(returnFiber, oldFiber, unwrapThenable(newChild), lanes), currentDebugInfo = key, returnFiber;
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return updateSlot(returnFiber, oldFiber, readContextDuringReconciliation(returnFiber, newChild), lanes);
          throwOnInvalidObjectType(returnFiber, newChild);
        }
        typeof newChild === "function" && warnOnFunctionType(returnFiber, newChild);
        typeof newChild === "symbol" && warnOnSymbolType(returnFiber, newChild);
        return null;
      }
      function updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes) {
        if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
          return existingChildren = existingChildren.get(newIdx) || null, updateTextNode(returnFiber, existingChildren, "" + newChild, lanes);
        if (typeof newChild === "object" && newChild !== null) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              return newIdx = existingChildren.get(newChild.key === null ? newIdx : newChild.key) || null, existingChildren = pushDebugInfo(newChild._debugInfo), returnFiber = updateElement(returnFiber, newIdx, newChild, lanes), currentDebugInfo = existingChildren, returnFiber;
            case REACT_PORTAL_TYPE:
              return existingChildren = existingChildren.get(newChild.key === null ? newIdx : newChild.key) || null, updatePortal(returnFiber, existingChildren, newChild, lanes);
            case REACT_LAZY_TYPE:
              var _prevDebugInfo7 = pushDebugInfo(newChild._debugInfo);
              newChild = resolveLazy(newChild);
              returnFiber = updateFromMap(existingChildren, returnFiber, newIdx, newChild, lanes);
              currentDebugInfo = _prevDebugInfo7;
              return returnFiber;
          }
          if (isArrayImpl(newChild) || getIteratorFn(newChild))
            return newIdx = existingChildren.get(newIdx) || null, existingChildren = pushDebugInfo(newChild._debugInfo), returnFiber = updateFragment(returnFiber, newIdx, newChild, lanes, null), currentDebugInfo = existingChildren, returnFiber;
          if (typeof newChild.then === "function")
            return _prevDebugInfo7 = pushDebugInfo(newChild._debugInfo), returnFiber = updateFromMap(existingChildren, returnFiber, newIdx, unwrapThenable(newChild), lanes), currentDebugInfo = _prevDebugInfo7, returnFiber;
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return updateFromMap(existingChildren, returnFiber, newIdx, readContextDuringReconciliation(returnFiber, newChild), lanes);
          throwOnInvalidObjectType(returnFiber, newChild);
        }
        typeof newChild === "function" && warnOnFunctionType(returnFiber, newChild);
        typeof newChild === "symbol" && warnOnSymbolType(returnFiber, newChild);
        return null;
      }
      function warnOnInvalidKey(returnFiber, workInProgress2, child, knownKeys) {
        if (typeof child !== "object" || child === null)
          return knownKeys;
        switch (child.$$typeof) {
          case REACT_ELEMENT_TYPE:
          case REACT_PORTAL_TYPE:
            warnForMissingKey(returnFiber, workInProgress2, child);
            var key = child.key;
            if (typeof key !== "string")
              break;
            if (knownKeys === null) {
              knownKeys = new Set;
              knownKeys.add(key);
              break;
            }
            if (!knownKeys.has(key)) {
              knownKeys.add(key);
              break;
            }
            runWithFiberInDEV(workInProgress2, function() {
              console.error("Encountered two children with the same key, `%s`. Keys should be unique so that components maintain their identity across updates. Non-unique keys may cause children to be duplicated and/or omitted — the behavior is unsupported and could change in a future version.", key);
            });
            break;
          case REACT_LAZY_TYPE:
            child = resolveLazy(child), warnOnInvalidKey(returnFiber, workInProgress2, child, knownKeys);
        }
        return knownKeys;
      }
      function reconcileChildrenArray(returnFiber, currentFirstChild, newChildren, lanes) {
        for (var knownKeys = null, resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null;oldFiber !== null && newIdx < newChildren.length; newIdx++) {
          oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
          var newFiber = updateSlot(returnFiber, oldFiber, newChildren[newIdx], lanes);
          if (newFiber === null) {
            oldFiber === null && (oldFiber = nextOldFiber);
            break;
          }
          knownKeys = warnOnInvalidKey(returnFiber, newFiber, newChildren[newIdx], knownKeys);
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
            oldFiber = createChild(returnFiber, newChildren[newIdx], lanes), oldFiber !== null && (knownKeys = warnOnInvalidKey(returnFiber, oldFiber, newChildren[newIdx], knownKeys), currentFirstChild = placeChild(oldFiber, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = oldFiber : previousNewFiber.sibling = oldFiber, previousNewFiber = oldFiber);
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        for (oldFiber = mapRemainingChildren(oldFiber);newIdx < newChildren.length; newIdx++)
          nextOldFiber = updateFromMap(oldFiber, returnFiber, newIdx, newChildren[newIdx], lanes), nextOldFiber !== null && (knownKeys = warnOnInvalidKey(returnFiber, nextOldFiber, newChildren[newIdx], knownKeys), shouldTrackSideEffects && nextOldFiber.alternate !== null && oldFiber.delete(nextOldFiber.key === null ? newIdx : nextOldFiber.key), currentFirstChild = placeChild(nextOldFiber, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = nextOldFiber : previousNewFiber.sibling = nextOldFiber, previousNewFiber = nextOldFiber);
        shouldTrackSideEffects && oldFiber.forEach(function(child) {
          return deleteChild(returnFiber, child);
        });
        isHydrating && pushTreeFork(returnFiber, newIdx);
        return resultingFirstChild;
      }
      function reconcileChildrenIterator(returnFiber, currentFirstChild, newChildren, lanes) {
        if (newChildren == null)
          throw Error("An iterable object provided no iterator.");
        for (var resultingFirstChild = null, previousNewFiber = null, oldFiber = currentFirstChild, newIdx = currentFirstChild = 0, nextOldFiber = null, knownKeys = null, step = newChildren.next();oldFiber !== null && !step.done; newIdx++, step = newChildren.next()) {
          oldFiber.index > newIdx ? (nextOldFiber = oldFiber, oldFiber = null) : nextOldFiber = oldFiber.sibling;
          var newFiber = updateSlot(returnFiber, oldFiber, step.value, lanes);
          if (newFiber === null) {
            oldFiber === null && (oldFiber = nextOldFiber);
            break;
          }
          knownKeys = warnOnInvalidKey(returnFiber, newFiber, step.value, knownKeys);
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
            oldFiber = createChild(returnFiber, step.value, lanes), oldFiber !== null && (knownKeys = warnOnInvalidKey(returnFiber, oldFiber, step.value, knownKeys), currentFirstChild = placeChild(oldFiber, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = oldFiber : previousNewFiber.sibling = oldFiber, previousNewFiber = oldFiber);
          isHydrating && pushTreeFork(returnFiber, newIdx);
          return resultingFirstChild;
        }
        for (oldFiber = mapRemainingChildren(oldFiber);!step.done; newIdx++, step = newChildren.next())
          nextOldFiber = updateFromMap(oldFiber, returnFiber, newIdx, step.value, lanes), nextOldFiber !== null && (knownKeys = warnOnInvalidKey(returnFiber, nextOldFiber, step.value, knownKeys), shouldTrackSideEffects && nextOldFiber.alternate !== null && oldFiber.delete(nextOldFiber.key === null ? newIdx : nextOldFiber.key), currentFirstChild = placeChild(nextOldFiber, currentFirstChild, newIdx), previousNewFiber === null ? resultingFirstChild = nextOldFiber : previousNewFiber.sibling = nextOldFiber, previousNewFiber = nextOldFiber);
        shouldTrackSideEffects && oldFiber.forEach(function(child) {
          return deleteChild(returnFiber, child);
        });
        isHydrating && pushTreeFork(returnFiber, newIdx);
        return resultingFirstChild;
      }
      function reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes) {
        typeof newChild === "object" && newChild !== null && newChild.type === REACT_FRAGMENT_TYPE && newChild.key === null && (validateFragmentProps(newChild, null, returnFiber), newChild = newChild.props.children);
        if (typeof newChild === "object" && newChild !== null) {
          switch (newChild.$$typeof) {
            case REACT_ELEMENT_TYPE:
              var prevDebugInfo = pushDebugInfo(newChild._debugInfo);
              a: {
                for (var key = newChild.key;currentFirstChild !== null; ) {
                  if (currentFirstChild.key === key) {
                    key = newChild.type;
                    if (key === REACT_FRAGMENT_TYPE) {
                      if (currentFirstChild.tag === 7) {
                        deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                        lanes = useFiber(currentFirstChild, newChild.props.children);
                        lanes.return = returnFiber;
                        lanes._debugOwner = newChild._owner;
                        lanes._debugInfo = currentDebugInfo;
                        validateFragmentProps(newChild, lanes, returnFiber);
                        returnFiber = lanes;
                        break a;
                      }
                    } else if (currentFirstChild.elementType === key || isCompatibleFamilyForHotReloading(currentFirstChild, newChild) || typeof key === "object" && key !== null && key.$$typeof === REACT_LAZY_TYPE && resolveLazy(key) === currentFirstChild.type) {
                      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                      lanes = useFiber(currentFirstChild, newChild.props);
                      coerceRef(lanes, newChild);
                      lanes.return = returnFiber;
                      lanes._debugOwner = newChild._owner;
                      lanes._debugInfo = currentDebugInfo;
                      returnFiber = lanes;
                      break a;
                    }
                    deleteRemainingChildren(returnFiber, currentFirstChild);
                    break;
                  } else
                    deleteChild(returnFiber, currentFirstChild);
                  currentFirstChild = currentFirstChild.sibling;
                }
                newChild.type === REACT_FRAGMENT_TYPE ? (lanes = createFiberFromFragment(newChild.props.children, returnFiber.mode, lanes, newChild.key), lanes.return = returnFiber, lanes._debugOwner = returnFiber, lanes._debugTask = returnFiber._debugTask, lanes._debugInfo = currentDebugInfo, validateFragmentProps(newChild, lanes, returnFiber), returnFiber = lanes) : (lanes = createFiberFromElement(newChild, returnFiber.mode, lanes), coerceRef(lanes, newChild), lanes.return = returnFiber, lanes._debugInfo = currentDebugInfo, returnFiber = lanes);
              }
              returnFiber = placeSingleChild(returnFiber);
              currentDebugInfo = prevDebugInfo;
              return returnFiber;
            case REACT_PORTAL_TYPE:
              a: {
                prevDebugInfo = newChild;
                for (newChild = prevDebugInfo.key;currentFirstChild !== null; ) {
                  if (currentFirstChild.key === newChild)
                    if (currentFirstChild.tag === 4 && currentFirstChild.stateNode.containerInfo === prevDebugInfo.containerInfo && currentFirstChild.stateNode.implementation === prevDebugInfo.implementation) {
                      deleteRemainingChildren(returnFiber, currentFirstChild.sibling);
                      lanes = useFiber(currentFirstChild, prevDebugInfo.children || []);
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
                lanes = createFiberFromPortal(prevDebugInfo, returnFiber.mode, lanes);
                lanes.return = returnFiber;
                returnFiber = lanes;
              }
              return placeSingleChild(returnFiber);
            case REACT_LAZY_TYPE:
              return prevDebugInfo = pushDebugInfo(newChild._debugInfo), newChild = resolveLazy(newChild), returnFiber = reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes), currentDebugInfo = prevDebugInfo, returnFiber;
          }
          if (isArrayImpl(newChild))
            return prevDebugInfo = pushDebugInfo(newChild._debugInfo), returnFiber = reconcileChildrenArray(returnFiber, currentFirstChild, newChild, lanes), currentDebugInfo = prevDebugInfo, returnFiber;
          if (getIteratorFn(newChild)) {
            prevDebugInfo = pushDebugInfo(newChild._debugInfo);
            key = getIteratorFn(newChild);
            if (typeof key !== "function")
              throw Error("An object is not an iterable. This error is likely caused by a bug in React. Please file an issue.");
            var newChildren = key.call(newChild);
            if (newChildren === newChild) {
              if (returnFiber.tag !== 0 || Object.prototype.toString.call(returnFiber.type) !== "[object GeneratorFunction]" || Object.prototype.toString.call(newChildren) !== "[object Generator]")
                didWarnAboutGenerators || console.error("Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."), didWarnAboutGenerators = true;
            } else
              newChild.entries !== key || didWarnAboutMaps || (console.error("Using Maps as children is not supported. Use an array of keyed ReactElements instead."), didWarnAboutMaps = true);
            returnFiber = reconcileChildrenIterator(returnFiber, currentFirstChild, newChildren, lanes);
            currentDebugInfo = prevDebugInfo;
            return returnFiber;
          }
          if (typeof newChild.then === "function")
            return prevDebugInfo = pushDebugInfo(newChild._debugInfo), returnFiber = reconcileChildFibersImpl(returnFiber, currentFirstChild, unwrapThenable(newChild), lanes), currentDebugInfo = prevDebugInfo, returnFiber;
          if (newChild.$$typeof === REACT_CONTEXT_TYPE)
            return reconcileChildFibersImpl(returnFiber, currentFirstChild, readContextDuringReconciliation(returnFiber, newChild), lanes);
          throwOnInvalidObjectType(returnFiber, newChild);
        }
        if (typeof newChild === "string" && newChild !== "" || typeof newChild === "number" || typeof newChild === "bigint")
          return prevDebugInfo = "" + newChild, currentFirstChild !== null && currentFirstChild.tag === 6 ? (deleteRemainingChildren(returnFiber, currentFirstChild.sibling), lanes = useFiber(currentFirstChild, prevDebugInfo), lanes.return = returnFiber, returnFiber = lanes) : (deleteRemainingChildren(returnFiber, currentFirstChild), lanes = createFiberFromText(prevDebugInfo, returnFiber.mode, lanes), lanes.return = returnFiber, lanes._debugOwner = returnFiber, lanes._debugTask = returnFiber._debugTask, lanes._debugInfo = currentDebugInfo, returnFiber = lanes), placeSingleChild(returnFiber);
        typeof newChild === "function" && warnOnFunctionType(returnFiber, newChild);
        typeof newChild === "symbol" && warnOnSymbolType(returnFiber, newChild);
        return deleteRemainingChildren(returnFiber, currentFirstChild);
      }
      return function(returnFiber, currentFirstChild, newChild, lanes) {
        var prevDebugInfo = currentDebugInfo;
        currentDebugInfo = null;
        try {
          thenableIndexCounter$1 = 0;
          var firstChildFiber = reconcileChildFibersImpl(returnFiber, currentFirstChild, newChild, lanes);
          thenableState$1 = null;
          return firstChildFiber;
        } catch (x) {
          if (x === SuspenseException || x === SuspenseActionException)
            throw x;
          var fiber = createFiber(29, x, null, returnFiber.mode);
          fiber.lanes = lanes;
          fiber.return = returnFiber;
          var debugInfo = fiber._debugInfo = currentDebugInfo;
          fiber._debugOwner = returnFiber._debugOwner;
          fiber._debugTask = returnFiber._debugTask;
          if (debugInfo != null) {
            for (var i = debugInfo.length - 1;0 <= i; i--)
              if (typeof debugInfo[i].stack === "string") {
                fiber._debugOwner = debugInfo[i];
                fiber._debugTask = debugInfo[i].debugTask;
                break;
              }
          }
          return fiber;
        } finally {
          currentDebugInfo = prevDebugInfo;
        }
      };
    }
    function validateSuspenseListNestedChild(childSlot, index) {
      var isAnArray = isArrayImpl(childSlot);
      childSlot = !isAnArray && typeof getIteratorFn(childSlot) === "function";
      return isAnArray || childSlot ? (isAnArray = isAnArray ? "array" : "iterable", console.error("A nested %s was passed to row #%s in <SuspenseList />. Wrap it in an additional SuspenseList to configure its revealOrder: <SuspenseList revealOrder=...> ... <SuspenseList revealOrder=...>{%s}</SuspenseList> ... </SuspenseList>", isAnArray, index, isAnArray), false) : true;
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
    function cloneUpdateQueue(current2, workInProgress2) {
      current2 = current2.updateQueue;
      workInProgress2.updateQueue === current2 && (workInProgress2.updateQueue = {
        baseState: current2.baseState,
        firstBaseUpdate: current2.firstBaseUpdate,
        lastBaseUpdate: current2.lastBaseUpdate,
        shared: current2.shared,
        callbacks: null
      });
    }
    function createUpdate(lane) {
      return {
        lane,
        tag: UpdateState,
        payload: null,
        callback: null,
        next: null
      };
    }
    function enqueueUpdate(fiber, update, lane) {
      var updateQueue = fiber.updateQueue;
      if (updateQueue === null)
        return null;
      updateQueue = updateQueue.shared;
      if (currentlyProcessingQueue === updateQueue && !didWarnUpdateInsideUpdate) {
        var componentName2 = getComponentNameFromFiber(fiber);
        console.error(`An update (setState, replaceState, or forceUpdate) was scheduled from inside an update function. Update functions should be pure, with zero side-effects. Consider using componentDidUpdate or a callback.

Please update the following component: %s`, componentName2);
        didWarnUpdateInsideUpdate = true;
      }
      if ((executionContext & RenderContext) !== NoContext)
        return componentName2 = updateQueue.pending, componentName2 === null ? update.next = update : (update.next = componentName2.next, componentName2.next = update), updateQueue.pending = update, update = getRootForUpdatedFiber(fiber), markUpdateLaneFromFiberToRoot(fiber, null, lane), update;
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
    function enqueueCapturedUpdate(workInProgress2, capturedUpdate) {
      var { updateQueue: queue, alternate: current2 } = workInProgress2;
      if (current2 !== null && (current2 = current2.updateQueue, queue === current2)) {
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
          baseState: current2.baseState,
          firstBaseUpdate: newFirst,
          lastBaseUpdate: newLast,
          shared: current2.shared,
          callbacks: current2.callbacks
        };
        workInProgress2.updateQueue = queue;
        return;
      }
      workInProgress2 = queue.lastBaseUpdate;
      workInProgress2 === null ? queue.firstBaseUpdate = capturedUpdate : workInProgress2.next = capturedUpdate;
      queue.lastBaseUpdate = capturedUpdate;
    }
    function suspendIfUpdateReadFromEntangledAsyncAction() {
      if (didReadFromEntangledAsyncAction) {
        var entangledActionThenable = currentEntangledActionThenable;
        if (entangledActionThenable !== null)
          throw entangledActionThenable;
      }
    }
    function processUpdateQueue(workInProgress2, props, instance$jscomp$0, renderLanes2) {
      didReadFromEntangledAsyncAction = false;
      var queue = workInProgress2.updateQueue;
      hasForceUpdate = false;
      currentlyProcessingQueue = queue.shared;
      var { firstBaseUpdate, lastBaseUpdate } = queue, pendingQueue = queue.shared.pending;
      if (pendingQueue !== null) {
        queue.shared.pending = null;
        var lastPendingUpdate = pendingQueue, firstPendingUpdate = lastPendingUpdate.next;
        lastPendingUpdate.next = null;
        lastBaseUpdate === null ? firstBaseUpdate = firstPendingUpdate : lastBaseUpdate.next = firstPendingUpdate;
        lastBaseUpdate = lastPendingUpdate;
        var current2 = workInProgress2.alternate;
        current2 !== null && (current2 = current2.updateQueue, pendingQueue = current2.lastBaseUpdate, pendingQueue !== lastBaseUpdate && (pendingQueue === null ? current2.firstBaseUpdate = firstPendingUpdate : pendingQueue.next = firstPendingUpdate, current2.lastBaseUpdate = lastPendingUpdate));
      }
      if (firstBaseUpdate !== null) {
        var newState = queue.baseState;
        lastBaseUpdate = 0;
        current2 = firstPendingUpdate = lastPendingUpdate = null;
        pendingQueue = firstBaseUpdate;
        do {
          var updateLane = pendingQueue.lane & -536870913, isHiddenUpdate = updateLane !== pendingQueue.lane;
          if (isHiddenUpdate ? (workInProgressRootRenderLanes & updateLane) === updateLane : (renderLanes2 & updateLane) === updateLane) {
            updateLane !== 0 && updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction = true);
            current2 !== null && (current2 = current2.next = {
              lane: 0,
              tag: pendingQueue.tag,
              payload: pendingQueue.payload,
              callback: null,
              next: null
            });
            a: {
              updateLane = workInProgress2;
              var partialState = pendingQueue;
              var nextProps = props, instance = instance$jscomp$0;
              switch (partialState.tag) {
                case ReplaceState:
                  partialState = partialState.payload;
                  if (typeof partialState === "function") {
                    isDisallowedContextReadInDEV = true;
                    var nextState = partialState.call(instance, newState, nextProps);
                    if (updateLane.mode & StrictLegacyMode) {
                      setIsStrictModeForDevtools(true);
                      try {
                        partialState.call(instance, newState, nextProps);
                      } finally {
                        setIsStrictModeForDevtools(false);
                      }
                    }
                    isDisallowedContextReadInDEV = false;
                    newState = nextState;
                    break a;
                  }
                  newState = partialState;
                  break a;
                case CaptureUpdate:
                  updateLane.flags = updateLane.flags & -65537 | 128;
                case UpdateState:
                  nextState = partialState.payload;
                  if (typeof nextState === "function") {
                    isDisallowedContextReadInDEV = true;
                    partialState = nextState.call(instance, newState, nextProps);
                    if (updateLane.mode & StrictLegacyMode) {
                      setIsStrictModeForDevtools(true);
                      try {
                        nextState.call(instance, newState, nextProps);
                      } finally {
                        setIsStrictModeForDevtools(false);
                      }
                    }
                    isDisallowedContextReadInDEV = false;
                  } else
                    partialState = nextState;
                  if (partialState === null || partialState === undefined)
                    break a;
                  newState = assign({}, newState, partialState);
                  break a;
                case ForceUpdate:
                  hasForceUpdate = true;
              }
            }
            updateLane = pendingQueue.callback;
            updateLane !== null && (workInProgress2.flags |= 64, isHiddenUpdate && (workInProgress2.flags |= 8192), isHiddenUpdate = queue.callbacks, isHiddenUpdate === null ? queue.callbacks = [updateLane] : isHiddenUpdate.push(updateLane));
          } else
            isHiddenUpdate = {
              lane: updateLane,
              tag: pendingQueue.tag,
              payload: pendingQueue.payload,
              callback: pendingQueue.callback,
              next: null
            }, current2 === null ? (firstPendingUpdate = current2 = isHiddenUpdate, lastPendingUpdate = newState) : current2 = current2.next = isHiddenUpdate, lastBaseUpdate |= updateLane;
          pendingQueue = pendingQueue.next;
          if (pendingQueue === null)
            if (pendingQueue = queue.shared.pending, pendingQueue === null)
              break;
            else
              isHiddenUpdate = pendingQueue, pendingQueue = isHiddenUpdate.next, isHiddenUpdate.next = null, queue.lastBaseUpdate = isHiddenUpdate, queue.shared.pending = null;
        } while (1);
        current2 === null && (lastPendingUpdate = newState);
        queue.baseState = lastPendingUpdate;
        queue.firstBaseUpdate = firstPendingUpdate;
        queue.lastBaseUpdate = current2;
        firstBaseUpdate === null && (queue.shared.lanes = 0);
        workInProgressRootSkippedLanes |= lastBaseUpdate;
        workInProgress2.lanes = lastBaseUpdate;
        workInProgress2.memoizedState = newState;
      }
      currentlyProcessingQueue = null;
    }
    function callCallback(callback, context) {
      if (typeof callback !== "function")
        throw Error("Invalid argument passed as callback. Expected a function. Instead received: " + callback);
      callback.call(context);
    }
    function commitHiddenCallbacks(updateQueue, context) {
      var hiddenCallbacks = updateQueue.shared.hiddenCallbacks;
      if (hiddenCallbacks !== null)
        for (updateQueue.shared.hiddenCallbacks = null, updateQueue = 0;updateQueue < hiddenCallbacks.length; updateQueue++)
          callCallback(hiddenCallbacks[updateQueue], context);
    }
    function commitCallbacks(updateQueue, context) {
      var callbacks = updateQueue.callbacks;
      if (callbacks !== null)
        for (updateQueue.callbacks = null, updateQueue = 0;updateQueue < callbacks.length; updateQueue++)
          callCallback(callbacks[updateQueue], context);
    }
    function pushHiddenContext(fiber, context) {
      var prevEntangledRenderLanes = entangledRenderLanes;
      push(prevEntangledRenderLanesCursor, prevEntangledRenderLanes, fiber);
      push(currentTreeHiddenStackCursor, context, fiber);
      entangledRenderLanes = prevEntangledRenderLanes | context.baseLanes;
    }
    function reuseHiddenContextOnStack(fiber) {
      push(prevEntangledRenderLanesCursor, entangledRenderLanes, fiber);
      push(currentTreeHiddenStackCursor, currentTreeHiddenStackCursor.current, fiber);
    }
    function popHiddenContext(fiber) {
      entangledRenderLanes = prevEntangledRenderLanesCursor.current;
      pop(currentTreeHiddenStackCursor, fiber);
      pop(prevEntangledRenderLanesCursor, fiber);
    }
    function pushPrimaryTreeSuspenseHandler(handler) {
      var current2 = handler.alternate;
      push(suspenseStackCursor, suspenseStackCursor.current & SubtreeSuspenseContextMask, handler);
      push(suspenseHandlerStackCursor, handler, handler);
      shellBoundary === null && (current2 === null || currentTreeHiddenStackCursor.current !== null ? shellBoundary = handler : current2.memoizedState !== null && (shellBoundary = handler));
    }
    function pushDehydratedActivitySuspenseHandler(fiber) {
      push(suspenseStackCursor, suspenseStackCursor.current, fiber);
      push(suspenseHandlerStackCursor, fiber, fiber);
      shellBoundary === null && (shellBoundary = fiber);
    }
    function pushOffscreenSuspenseHandler(fiber) {
      fiber.tag === 22 ? (push(suspenseStackCursor, suspenseStackCursor.current, fiber), push(suspenseHandlerStackCursor, fiber, fiber), shellBoundary === null && (shellBoundary = fiber)) : reuseSuspenseHandlerOnStack(fiber);
    }
    function reuseSuspenseHandlerOnStack(fiber) {
      push(suspenseStackCursor, suspenseStackCursor.current, fiber);
      push(suspenseHandlerStackCursor, suspenseHandlerStackCursor.current, fiber);
    }
    function popSuspenseHandler(fiber) {
      pop(suspenseHandlerStackCursor, fiber);
      shellBoundary === fiber && (shellBoundary = null);
      pop(suspenseStackCursor, fiber);
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
    function mountHookTypesDev() {
      var hookName = currentHookNameInDev;
      hookTypesDev === null ? hookTypesDev = [hookName] : hookTypesDev.push(hookName);
    }
    function updateHookTypesDev() {
      var hookName = currentHookNameInDev;
      if (hookTypesDev !== null && (hookTypesUpdateIndexDev++, hookTypesDev[hookTypesUpdateIndexDev] !== hookName)) {
        var componentName2 = getComponentNameFromFiber(currentlyRenderingFiber);
        if (!didWarnAboutMismatchedHooksForComponent.has(componentName2) && (didWarnAboutMismatchedHooksForComponent.add(componentName2), hookTypesDev !== null)) {
          for (var table = "", i = 0;i <= hookTypesUpdateIndexDev; i++) {
            var oldHookName = hookTypesDev[i], newHookName = i === hookTypesUpdateIndexDev ? hookName : oldHookName;
            for (oldHookName = i + 1 + ". " + oldHookName;30 > oldHookName.length; )
              oldHookName += " ";
            oldHookName += newHookName + `
`;
            table += oldHookName;
          }
          console.error(`React has detected a change in the order of Hooks called by %s. This will lead to bugs and errors if not fixed. For more information, read the Rules of Hooks: https://react.dev/link/rules-of-hooks

   Previous render            Next render
   ------------------------------------------------------
%s   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
`, componentName2, table);
        }
      }
    }
    function checkDepsAreArrayDev(deps) {
      deps === undefined || deps === null || isArrayImpl(deps) || console.error("%s received a final argument that is not an array (instead, received `%s`). When specified, the final argument must be an array.", currentHookNameInDev, typeof deps);
    }
    function warnOnUseFormStateInDev() {
      var componentName2 = getComponentNameFromFiber(currentlyRenderingFiber);
      didWarnAboutUseFormState.has(componentName2) || (didWarnAboutUseFormState.add(componentName2), console.error("ReactDOM.useFormState has been renamed to React.useActionState. Please update %s to use React.useActionState.", componentName2));
    }
    function throwInvalidHookError() {
      throw Error(`Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:
1. You might have mismatching versions of React and the renderer (such as React DOM)
2. You might be breaking the Rules of Hooks
3. You might have more than one copy of React in the same app
See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.`);
    }
    function areHookInputsEqual(nextDeps, prevDeps) {
      if (ignorePreviousDependencies)
        return false;
      if (prevDeps === null)
        return console.error("%s received a final argument during this render, but not during the previous render. Even though the final argument is optional, its type cannot change between renders.", currentHookNameInDev), false;
      nextDeps.length !== prevDeps.length && console.error(`The final argument passed to %s changed size between renders. The order and size of this array must remain constant.

Previous: %s
Incoming: %s`, currentHookNameInDev, "[" + prevDeps.join(", ") + "]", "[" + nextDeps.join(", ") + "]");
      for (var i = 0;i < prevDeps.length && i < nextDeps.length; i++)
        if (!objectIs(nextDeps[i], prevDeps[i]))
          return false;
      return true;
    }
    function renderWithHooks(current2, workInProgress2, Component, props, secondArg, nextRenderLanes) {
      renderLanes = nextRenderLanes;
      currentlyRenderingFiber = workInProgress2;
      hookTypesDev = current2 !== null ? current2._debugHookTypes : null;
      hookTypesUpdateIndexDev = -1;
      ignorePreviousDependencies = current2 !== null && current2.type !== workInProgress2.type;
      if (Object.prototype.toString.call(Component) === "[object AsyncFunction]" || Object.prototype.toString.call(Component) === "[object AsyncGeneratorFunction]")
        nextRenderLanes = getComponentNameFromFiber(currentlyRenderingFiber), didWarnAboutAsyncClientComponent.has(nextRenderLanes) || (didWarnAboutAsyncClientComponent.add(nextRenderLanes), console.error("%s is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.", nextRenderLanes === null ? "An unknown Component" : "<" + nextRenderLanes + ">"));
      workInProgress2.memoizedState = null;
      workInProgress2.updateQueue = null;
      workInProgress2.lanes = 0;
      ReactSharedInternals.H = current2 !== null && current2.memoizedState !== null ? HooksDispatcherOnUpdateInDEV : hookTypesDev !== null ? HooksDispatcherOnMountWithHookTypesInDEV : HooksDispatcherOnMountInDEV;
      shouldDoubleInvokeUserFnsInHooksDEV = nextRenderLanes = (workInProgress2.mode & StrictLegacyMode) !== NoMode;
      var children = callComponentInDEV(Component, props, secondArg);
      shouldDoubleInvokeUserFnsInHooksDEV = false;
      didScheduleRenderPhaseUpdateDuringThisPass && (children = renderWithHooksAgain(workInProgress2, Component, props, secondArg));
      if (nextRenderLanes) {
        setIsStrictModeForDevtools(true);
        try {
          children = renderWithHooksAgain(workInProgress2, Component, props, secondArg);
        } finally {
          setIsStrictModeForDevtools(false);
        }
      }
      finishRenderingHooks(current2, workInProgress2);
      return children;
    }
    function finishRenderingHooks(current2, workInProgress2) {
      workInProgress2._debugHookTypes = hookTypesDev;
      workInProgress2.dependencies === null ? thenableState !== null && (workInProgress2.dependencies = {
        lanes: 0,
        firstContext: null,
        _debugThenableState: thenableState
      }) : workInProgress2.dependencies._debugThenableState = thenableState;
      ReactSharedInternals.H = ContextOnlyDispatcher;
      var didRenderTooFewHooks = currentHook !== null && currentHook.next !== null;
      renderLanes = 0;
      hookTypesDev = currentHookNameInDev = workInProgressHook = currentHook = currentlyRenderingFiber = null;
      hookTypesUpdateIndexDev = -1;
      current2 !== null && (current2.flags & 65011712) !== (workInProgress2.flags & 65011712) && console.error("Internal React error: Expected static flag was missing. Please notify the React team.");
      didScheduleRenderPhaseUpdate = false;
      thenableIndexCounter = 0;
      thenableState = null;
      if (didRenderTooFewHooks)
        throw Error("Rendered fewer hooks than expected. This may be caused by an accidental early return statement.");
      current2 === null || didReceiveUpdate || (current2 = current2.dependencies, current2 !== null && checkIfContextChanged(current2) && (didReceiveUpdate = true));
      needsToResetSuspendedThenableDEV ? (needsToResetSuspendedThenableDEV = false, current2 = true) : current2 = false;
      current2 && (workInProgress2 = getComponentNameFromFiber(workInProgress2) || "Unknown", didWarnAboutUseWrappedInTryCatch.has(workInProgress2) || didWarnAboutAsyncClientComponent.has(workInProgress2) || (didWarnAboutUseWrappedInTryCatch.add(workInProgress2), console.error("`use` was called from inside a try/catch block. This is not allowed and can lead to unexpected behavior. To handle errors triggered by `use`, wrap your component in a error boundary.")));
    }
    function renderWithHooksAgain(workInProgress2, Component, props, secondArg) {
      currentlyRenderingFiber = workInProgress2;
      var numberOfReRenders = 0;
      do {
        didScheduleRenderPhaseUpdateDuringThisPass && (thenableState = null);
        thenableIndexCounter = 0;
        didScheduleRenderPhaseUpdateDuringThisPass = false;
        if (numberOfReRenders >= RE_RENDER_LIMIT)
          throw Error("Too many re-renders. React limits the number of renders to prevent an infinite loop.");
        numberOfReRenders += 1;
        ignorePreviousDependencies = false;
        workInProgressHook = currentHook = null;
        if (workInProgress2.updateQueue != null) {
          var children = workInProgress2.updateQueue;
          children.lastEffect = null;
          children.events = null;
          children.stores = null;
          children.memoCache != null && (children.memoCache.index = 0);
        }
        hookTypesUpdateIndexDev = -1;
        ReactSharedInternals.H = HooksDispatcherOnRerenderInDEV;
        children = callComponentInDEV(Component, props, secondArg);
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
    function bailoutHooks(current2, workInProgress2, lanes) {
      workInProgress2.updateQueue = current2.updateQueue;
      workInProgress2.flags = (workInProgress2.mode & StrictEffectsMode) !== NoMode ? workInProgress2.flags & -402655237 : workInProgress2.flags & -2053;
      current2.lanes &= ~lanes;
    }
    function resetHooksOnUnwind(workInProgress2) {
      if (didScheduleRenderPhaseUpdate) {
        for (workInProgress2 = workInProgress2.memoizedState;workInProgress2 !== null; ) {
          var queue = workInProgress2.queue;
          queue !== null && (queue.pending = null);
          workInProgress2 = workInProgress2.next;
        }
        didScheduleRenderPhaseUpdate = false;
      }
      renderLanes = 0;
      hookTypesDev = workInProgressHook = currentHook = currentlyRenderingFiber = null;
      hookTypesUpdateIndexDev = -1;
      currentHookNameInDev = null;
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
            throw Error("Update hook called on initial render. This is likely a bug in React. Please file an issue.");
          throw Error("Rendered more hooks than during the previous render.");
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
      var index = thenableIndexCounter;
      thenableIndexCounter += 1;
      thenableState === null && (thenableState = createThenableState());
      thenable = trackUsedThenable(thenableState, thenable, index);
      index = currentlyRenderingFiber;
      (workInProgressHook === null ? index.memoizedState : workInProgressHook.next) === null && (index = index.alternate, ReactSharedInternals.H = index !== null && index.memoizedState !== null ? HooksDispatcherOnUpdateInDEV : HooksDispatcherOnMountInDEV);
      return thenable;
    }
    function use(usable) {
      if (usable !== null && typeof usable === "object") {
        if (typeof usable.then === "function")
          return useThenable(usable);
        if (usable.$$typeof === REACT_CONTEXT_TYPE)
          return readContext(usable);
      }
      throw Error("An unsupported type was passed to use(): " + String(usable));
    }
    function useMemoCache(size) {
      var memoCache = null, updateQueue = currentlyRenderingFiber.updateQueue;
      updateQueue !== null && (memoCache = updateQueue.memoCache);
      if (memoCache == null) {
        var current2 = currentlyRenderingFiber.alternate;
        current2 !== null && (current2 = current2.updateQueue, current2 !== null && (current2 = current2.memoCache, current2 != null && (memoCache = {
          data: current2.data.map(function(array) {
            return array.slice();
          }),
          index: 0
        })));
      }
      memoCache == null && (memoCache = { data: [], index: 0 });
      updateQueue === null && (updateQueue = createFunctionComponentUpdateQueue(), currentlyRenderingFiber.updateQueue = updateQueue);
      updateQueue.memoCache = memoCache;
      updateQueue = memoCache.data[memoCache.index];
      if (updateQueue === undefined || ignorePreviousDependencies)
        for (updateQueue = memoCache.data[memoCache.index] = Array(size), current2 = 0;current2 < size; current2++)
          updateQueue[current2] = REACT_MEMO_CACHE_SENTINEL;
      else
        updateQueue.length !== size && console.error("Expected a constant size argument for each invocation of useMemoCache. The previous cache was allocated with size %s but size %s was requested.", updateQueue.length, size);
      memoCache.index++;
      return updateQueue;
    }
    function basicStateReducer(state, action) {
      return typeof action === "function" ? action(state) : action;
    }
    function mountReducer(reducer, initialArg, init) {
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
    }
    function updateReducer(reducer) {
      var hook = updateWorkInProgressHook();
      return updateReducerImpl(hook, currentHook, reducer);
    }
    function updateReducerImpl(hook, current2, reducer) {
      var queue = hook.queue;
      if (queue === null)
        throw Error("Should have a queue. You are likely calling Hooks conditionally, which is not allowed. (https://react.dev/link/invalid-hook-call)");
      queue.lastRenderedReducer = reducer;
      var baseQueue = hook.baseQueue, pendingQueue = queue.pending;
      if (pendingQueue !== null) {
        if (baseQueue !== null) {
          var baseFirst = baseQueue.next;
          baseQueue.next = pendingQueue.next;
          pendingQueue.next = baseFirst;
        }
        current2.baseQueue !== baseQueue && console.error("Internal error: Expected work-in-progress queue to be a clone. This is a bug in React.");
        current2.baseQueue = baseQueue = pendingQueue;
        queue.pending = null;
      }
      pendingQueue = hook.baseState;
      if (baseQueue === null)
        hook.memoizedState = pendingQueue;
      else {
        current2 = baseQueue.next;
        var newBaseQueueFirst = baseFirst = null, newBaseQueueLast = null, update = current2, didReadFromEntangledAsyncAction2 = false;
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
              }), updateLane === currentEntangledLane && (didReadFromEntangledAsyncAction2 = true);
            else if ((renderLanes & revertLane) === revertLane) {
              update = update.next;
              revertLane === currentEntangledLane && (didReadFromEntangledAsyncAction2 = true);
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
        } while (update !== null && update !== current2);
        newBaseQueueLast === null ? baseFirst = pendingQueue : newBaseQueueLast.next = newBaseQueueFirst;
        if (!objectIs(pendingQueue, hook.memoizedState) && (didReceiveUpdate = true, didReadFromEntangledAsyncAction2 && (reducer = currentEntangledActionThenable, reducer !== null)))
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
        throw Error("Should have a queue. You are likely calling Hooks conditionally, which is not allowed. (https://react.dev/link/invalid-hook-call)");
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
    function mountSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      var fiber = currentlyRenderingFiber, hook = mountWorkInProgressHook();
      if (isHydrating) {
        if (getServerSnapshot === undefined)
          throw Error("Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.");
        var nextSnapshot = getServerSnapshot();
        didWarnUncachedGetSnapshot || nextSnapshot === getServerSnapshot() || (console.error("The result of getServerSnapshot should be cached to avoid an infinite loop"), didWarnUncachedGetSnapshot = true);
      } else {
        nextSnapshot = getSnapshot();
        didWarnUncachedGetSnapshot || (getServerSnapshot = getSnapshot(), objectIs(nextSnapshot, getServerSnapshot) || (console.error("The result of getSnapshot should be cached to avoid an infinite loop"), didWarnUncachedGetSnapshot = true));
        if (workInProgressRoot === null)
          throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
        (workInProgressRootRenderLanes & 127) !== 0 || pushStoreConsistencyCheck(fiber, getSnapshot, nextSnapshot);
      }
      hook.memoizedState = nextSnapshot;
      getServerSnapshot = { value: nextSnapshot, getSnapshot };
      hook.queue = getServerSnapshot;
      mountEffect(subscribeToStore.bind(null, fiber, getServerSnapshot, subscribe), [subscribe]);
      fiber.flags |= 2048;
      pushSimpleEffect(HasEffect | Passive, { destroy: undefined }, updateStoreInstance.bind(null, fiber, getServerSnapshot, nextSnapshot, getSnapshot), null);
      return nextSnapshot;
    }
    function updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) {
      var fiber = currentlyRenderingFiber, hook = updateWorkInProgressHook(), isHydrating$jscomp$0 = isHydrating;
      if (isHydrating$jscomp$0) {
        if (getServerSnapshot === undefined)
          throw Error("Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.");
        getServerSnapshot = getServerSnapshot();
      } else if (getServerSnapshot = getSnapshot(), !didWarnUncachedGetSnapshot) {
        var cachedSnapshot = getSnapshot();
        objectIs(getServerSnapshot, cachedSnapshot) || (console.error("The result of getSnapshot should be cached to avoid an infinite loop"), didWarnUncachedGetSnapshot = true);
      }
      if (cachedSnapshot = !objectIs((currentHook || hook).memoizedState, getServerSnapshot))
        hook.memoizedState = getServerSnapshot, didReceiveUpdate = true;
      hook = hook.queue;
      var create = subscribeToStore.bind(null, fiber, hook, subscribe);
      updateEffectImpl(2048, Passive, create, [subscribe]);
      if (hook.getSnapshot !== getSnapshot || cachedSnapshot || workInProgressHook !== null && workInProgressHook.memoizedState.tag & HasEffect) {
        fiber.flags |= 2048;
        pushSimpleEffect(HasEffect | Passive, { destroy: undefined }, updateStoreInstance.bind(null, fiber, hook, getServerSnapshot, getSnapshot), null);
        if (workInProgressRoot === null)
          throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
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
        checkIfSnapshotChanged(inst) && (startUpdateTimerByLane(2, "updateSyncExternalStore()", fiber), forceStoreRerender(fiber));
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
    function mountState(initialState) {
      initialState = mountStateImpl(initialState);
      var queue = initialState.queue, dispatch = dispatchSetState.bind(null, currentlyRenderingFiber, queue);
      queue.dispatch = dispatch;
      return [initialState.memoizedState, dispatch];
    }
    function mountOptimistic(passthrough) {
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
    }
    function updateOptimistic(passthrough, reducer) {
      var hook = updateWorkInProgressHook();
      return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
    }
    function updateOptimisticImpl(hook, current2, passthrough, reducer) {
      hook.baseState = passthrough;
      return updateReducerImpl(hook, currentHook, typeof reducer === "function" ? reducer : basicStateReducer);
    }
    function rerenderOptimistic(passthrough, reducer) {
      var hook = updateWorkInProgressHook();
      if (currentHook !== null)
        return updateOptimisticImpl(hook, currentHook, passthrough, reducer);
      hook.baseState = passthrough;
      return [passthrough, hook.queue.dispatch];
    }
    function dispatchActionState(fiber, actionQueue, setPendingState, setState, payload) {
      if (isRenderPhaseUpdate(fiber))
        throw Error("Cannot update form state while rendering.");
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
        currentTransition._updatedFibers = new Set;
        ReactSharedInternals.T = currentTransition;
        try {
          var returnValue = action(prevState, payload), onStartTransitionFinish = ReactSharedInternals.S;
          onStartTransitionFinish !== null && onStartTransitionFinish(currentTransition, returnValue);
          handleActionReturnValue(actionQueue, node, returnValue);
        } catch (error) {
          onActionError(actionQueue, node, error);
        } finally {
          prevTransition !== null && currentTransition.types !== null && (prevTransition.types !== null && prevTransition.types !== currentTransition.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition, prevTransition === null && currentTransition._updatedFibers && (actionQueue = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < actionQueue && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."));
        }
      } else
        try {
          currentTransition = action(prevState, payload), handleActionReturnValue(actionQueue, node, currentTransition);
        } catch (error$4) {
          onActionError(actionQueue, node, error$4);
        }
    }
    function handleActionReturnValue(actionQueue, node, returnValue) {
      returnValue !== null && typeof returnValue === "object" && typeof returnValue.then === "function" ? (ReactSharedInternals.asyncTransitions++, returnValue.then(releaseAsyncTransition, releaseAsyncTransition), returnValue.then(function(nextState) {
        onActionSuccess(actionQueue, node, nextState);
      }, function(error) {
        return onActionError(actionQueue, node, error);
      }), node.isTransition || console.error("An async function with useActionState was called outside of a transition. This is likely not what you intended (for example, isPending will not update correctly). Either call the returned function inside startTransition, or pass it to an `action` or `formAction` prop.")) : onActionSuccess(actionQueue, node, returnValue);
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
            var isMatching = currentlyRenderingFiber;
            if (isHydrating) {
              if (nextHydratableInstance) {
                b: {
                  var markerInstance = nextHydratableInstance;
                  for (var inRootOrSingleton = rootOrSingletonContext;markerInstance.nodeType !== 8; ) {
                    if (!inRootOrSingleton) {
                      markerInstance = null;
                      break b;
                    }
                    markerInstance = getNextHydratable(markerInstance.nextSibling);
                    if (markerInstance === null) {
                      markerInstance = null;
                      break b;
                    }
                  }
                  inRootOrSingleton = markerInstance.data;
                  markerInstance = inRootOrSingleton === FORM_STATE_IS_MATCHING || inRootOrSingleton === FORM_STATE_IS_NOT_MATCHING ? markerInstance : null;
                }
                if (markerInstance) {
                  nextHydratableInstance = getNextHydratable(markerInstance.nextSibling);
                  isMatching = markerInstance.data === FORM_STATE_IS_MATCHING;
                  break a;
                }
              }
              throwOnHydrationMismatch(isMatching);
            }
            isMatching = false;
          }
          isMatching && (initialStateProp = ssrFormState[0]);
        }
      }
      ssrFormState = mountWorkInProgressHook();
      ssrFormState.memoizedState = ssrFormState.baseState = initialStateProp;
      isMatching = {
        pending: null,
        lanes: 0,
        dispatch: null,
        lastRenderedReducer: actionStateReducer,
        lastRenderedState: initialStateProp
      };
      ssrFormState.queue = isMatching;
      ssrFormState = dispatchSetState.bind(null, currentlyRenderingFiber, isMatching);
      isMatching.dispatch = ssrFormState;
      isMatching = mountStateImpl(false);
      inRootOrSingleton = dispatchOptimisticSetState.bind(null, currentlyRenderingFiber, false, isMatching.queue);
      isMatching = mountWorkInProgressHook();
      markerInstance = {
        state: initialStateProp,
        dispatch: null,
        action,
        pending: null
      };
      isMatching.queue = markerInstance;
      ssrFormState = dispatchActionState.bind(null, currentlyRenderingFiber, markerInstance, inRootOrSingleton, ssrFormState);
      markerInstance.dispatch = ssrFormState;
      isMatching.memoizedState = action;
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
      action !== currentStateHook.memoizedState && (currentlyRenderingFiber.flags |= 2048, pushSimpleEffect(HasEffect | Passive, { destroy: undefined }, actionStateActionEffect.bind(null, actionQueue, action), null));
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
    function mountRef(initialValue) {
      var hook = mountWorkInProgressHook();
      initialValue = { current: initialValue };
      return hook.memoizedState = initialValue;
    }
    function mountEffectImpl(fiberFlags, hookFlags, create, deps) {
      var hook = mountWorkInProgressHook();
      currentlyRenderingFiber.flags |= fiberFlags;
      hook.memoizedState = pushSimpleEffect(HasEffect | hookFlags, { destroy: undefined }, create, deps === undefined ? null : deps);
    }
    function updateEffectImpl(fiberFlags, hookFlags, create, deps) {
      var hook = updateWorkInProgressHook();
      deps = deps === undefined ? null : deps;
      var inst = hook.memoizedState.inst;
      currentHook !== null && deps !== null && areHookInputsEqual(deps, currentHook.memoizedState.deps) ? hook.memoizedState = pushSimpleEffect(hookFlags, inst, create, deps) : (currentlyRenderingFiber.flags |= fiberFlags, hook.memoizedState = pushSimpleEffect(HasEffect | hookFlags, inst, create, deps));
    }
    function mountEffect(create, deps) {
      (currentlyRenderingFiber.mode & StrictEffectsMode) !== NoMode ? mountEffectImpl(276826112, Passive, create, deps) : mountEffectImpl(8390656, Passive, create, deps);
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
    function mountEvent(callback) {
      var hook = mountWorkInProgressHook(), ref = { impl: callback };
      hook.memoizedState = ref;
      return function() {
        if ((executionContext & RenderContext) !== NoContext)
          throw Error("A function wrapped in useEffectEvent can't be called during rendering.");
        return ref.impl.apply(undefined, arguments);
      };
    }
    function updateEvent(callback) {
      var ref = updateWorkInProgressHook().memoizedState;
      useEffectEventImpl({ ref, nextImpl: callback });
      return function() {
        if ((executionContext & RenderContext) !== NoContext)
          throw Error("A function wrapped in useEffectEvent can't be called during rendering.");
        return ref.impl.apply(undefined, arguments);
      };
    }
    function mountLayoutEffect(create, deps) {
      var fiberFlags = 4194308;
      (currentlyRenderingFiber.mode & StrictEffectsMode) !== NoMode && (fiberFlags |= 134217728);
      return mountEffectImpl(fiberFlags, Layout, create, deps);
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
        return ref.hasOwnProperty("current") || console.error("Expected useImperativeHandle() first argument to either be a ref callback or React.createRef() object. Instead received: %s.", "an object with keys {" + Object.keys(ref).join(", ") + "}"), create = create(), ref.current = create, function() {
          ref.current = null;
        };
    }
    function mountImperativeHandle(ref, create, deps) {
      typeof create !== "function" && console.error("Expected useImperativeHandle() second argument to be a function that creates a handle. Instead received: %s.", create !== null ? typeof create : "null");
      deps = deps !== null && deps !== undefined ? deps.concat([ref]) : null;
      var fiberFlags = 4194308;
      (currentlyRenderingFiber.mode & StrictEffectsMode) !== NoMode && (fiberFlags |= 134217728);
      mountEffectImpl(fiberFlags, Layout, imperativeHandleEffect.bind(null, create, ref), deps);
    }
    function updateImperativeHandle(ref, create, deps) {
      typeof create !== "function" && console.error("Expected useImperativeHandle() second argument to be a function that creates a handle. Instead received: %s.", create !== null ? typeof create : "null");
      deps = deps !== null && deps !== undefined ? deps.concat([ref]) : null;
      updateEffectImpl(4, Layout, imperativeHandleEffect.bind(null, create, ref), deps);
    }
    function mountCallback(callback, deps) {
      mountWorkInProgressHook().memoizedState = [
        callback,
        deps === undefined ? null : deps
      ];
      return callback;
    }
    function updateCallback(callback, deps) {
      var hook = updateWorkInProgressHook();
      deps = deps === undefined ? null : deps;
      var prevState = hook.memoizedState;
      if (deps !== null && areHookInputsEqual(deps, prevState[1]))
        return prevState[0];
      hook.memoizedState = [callback, deps];
      return callback;
    }
    function mountMemo(nextCreate, deps) {
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
    function mountDeferredValue(value, initialValue) {
      var hook = mountWorkInProgressHook();
      return mountDeferredValueImpl(hook, value, initialValue);
    }
    function updateDeferredValue(value, initialValue) {
      var hook = updateWorkInProgressHook();
      return updateDeferredValueImpl(hook, currentHook.memoizedState, value, initialValue);
    }
    function rerenderDeferredValue(value, initialValue) {
      var hook = updateWorkInProgressHook();
      return currentHook === null ? mountDeferredValueImpl(hook, value, initialValue) : updateDeferredValueImpl(hook, currentHook.memoizedState, value, initialValue);
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
    function releaseAsyncTransition() {
      ReactSharedInternals.asyncTransitions--;
    }
    function startTransition(fiber, queue, pendingState, finishedState, callback) {
      var previousPriority = ReactDOMSharedInternals.p;
      ReactDOMSharedInternals.p = previousPriority !== 0 && previousPriority < ContinuousEventPriority ? previousPriority : ContinuousEventPriority;
      var prevTransition = ReactSharedInternals.T, currentTransition = {};
      currentTransition._updatedFibers = new Set;
      ReactSharedInternals.T = currentTransition;
      dispatchOptimisticSetState(fiber, false, queue, pendingState);
      try {
        var returnValue = callback(), onStartTransitionFinish = ReactSharedInternals.S;
        onStartTransitionFinish !== null && onStartTransitionFinish(currentTransition, returnValue);
        if (returnValue !== null && typeof returnValue === "object" && typeof returnValue.then === "function") {
          ReactSharedInternals.asyncTransitions++;
          returnValue.then(releaseAsyncTransition, releaseAsyncTransition);
          var thenableForFinishedState = chainThenableValue(returnValue, finishedState);
          dispatchSetStateInternal(fiber, queue, thenableForFinishedState, requestUpdateLane(fiber));
        } else
          dispatchSetStateInternal(fiber, queue, finishedState, requestUpdateLane(fiber));
      } catch (error) {
        dispatchSetStateInternal(fiber, queue, { then: function() {}, status: "rejected", reason: error }, requestUpdateLane(fiber));
      } finally {
        ReactDOMSharedInternals.p = previousPriority, prevTransition !== null && currentTransition.types !== null && (prevTransition.types !== null && prevTransition.types !== currentTransition.types && console.error("We expected inner Transitions to have transferred the outer types set and that you cannot add to the outer Transition while inside the inner.This is a bug in React."), prevTransition.types = currentTransition.types), ReactSharedInternals.T = prevTransition, prevTransition === null && currentTransition._updatedFibers && (fiber = currentTransition._updatedFibers.size, currentTransition._updatedFibers.clear(), 10 < fiber && console.warn("Detected a large number of updates inside startTransition. If this is due to a subscription please re-write it to use React provided hooks. Otherwise concurrent mode guarantees are off the table."));
      }
    }
    function startHostTransition(formFiber, pendingState, action, formData) {
      if (formFiber.tag !== 5)
        throw Error("Expected the form instance to be a HostComponent. This is a bug in React.");
      var queue = ensureFormComponentIsStateful(formFiber).queue;
      startHostActionTimer(formFiber);
      startTransition(formFiber, queue, pendingState, NotPendingTransition, action === null ? noop : function() {
        requestFormReset$1(formFiber);
        return action(formData);
      });
    }
    function ensureFormComponentIsStateful(formFiber) {
      var existingStateHook = formFiber.memoizedState;
      if (existingStateHook !== null)
        return existingStateHook;
      existingStateHook = {
        memoizedState: NotPendingTransition,
        baseState: NotPendingTransition,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: basicStateReducer,
          lastRenderedState: NotPendingTransition
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
      ReactSharedInternals.T === null && console.error("requestFormReset was called outside a transition or action. To fix, move to an action, or wrap with startTransition.");
      var stateHook = ensureFormComponentIsStateful(formFiber);
      stateHook.next === null && (stateHook = formFiber.alternate.memoizedState);
      dispatchSetStateInternal(formFiber, stateHook.next.queue, {}, requestUpdateLane(formFiber));
    }
    function mountTransition() {
      var stateHook = mountStateImpl(false);
      stateHook = startTransition.bind(null, currentlyRenderingFiber, stateHook.queue, true, false);
      mountWorkInProgressHook().memoizedState = stateHook;
      return [false, stateHook];
    }
    function updateTransition() {
      var booleanOrThenable = updateReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
      return [
        typeof booleanOrThenable === "boolean" ? booleanOrThenable : useThenable(booleanOrThenable),
        start
      ];
    }
    function rerenderTransition() {
      var booleanOrThenable = rerenderReducer(basicStateReducer)[0], start = updateWorkInProgressHook().memoizedState;
      return [
        typeof booleanOrThenable === "boolean" ? booleanOrThenable : useThenable(booleanOrThenable),
        start
      ];
    }
    function useHostTransitionStatus() {
      return readContext(HostTransitionContext);
    }
    function mountId() {
      var hook = mountWorkInProgressHook(), identifierPrefix = workInProgressRoot.identifierPrefix;
      if (isHydrating) {
        var treeId = treeContextOverflow;
        var idWithLeadingBit = treeContextId;
        treeId = (idWithLeadingBit & ~(1 << 32 - clz32(idWithLeadingBit) - 1)).toString(32) + treeId;
        identifierPrefix = "_" + identifierPrefix + "R_" + treeId;
        treeId = localIdCounter++;
        0 < treeId && (identifierPrefix += "H" + treeId.toString(32));
        identifierPrefix += "_";
      } else
        treeId = globalClientIdCounter++, identifierPrefix = "_" + identifierPrefix + "r_" + treeId.toString(32) + "_";
      return hook.memoizedState = identifierPrefix;
    }
    function mountRefresh() {
      return mountWorkInProgressHook().memoizedState = refreshCache.bind(null, currentlyRenderingFiber);
    }
    function refreshCache(fiber, seedKey) {
      for (var provider = fiber.return;provider !== null; ) {
        switch (provider.tag) {
          case 24:
          case 3:
            var lane = requestUpdateLane(provider), refreshUpdate = createUpdate(lane), root2 = enqueueUpdate(provider, refreshUpdate, lane);
            root2 !== null && (startUpdateTimerByLane(lane, "refresh()", fiber), scheduleUpdateOnFiber(root2, provider, lane), entangleTransitions(root2, provider, lane));
            fiber = createCache();
            seedKey !== null && seedKey !== undefined && root2 !== null && console.error("The seed argument is not enabled outside experimental channels.");
            refreshUpdate.payload = { cache: fiber };
            return;
        }
        provider = provider.return;
      }
    }
    function dispatchReducerAction(fiber, queue, action) {
      var args = arguments;
      typeof args[3] === "function" && console.error("State updates from the useState() and useReducer() Hooks don't support the second callback argument. To execute a side effect after rendering, declare it in the component body with useEffect().");
      args = requestUpdateLane(fiber);
      var update = {
        lane: args,
        revertLane: 0,
        gesture: null,
        action,
        hasEagerState: false,
        eagerState: null,
        next: null
      };
      isRenderPhaseUpdate(fiber) ? enqueueRenderPhaseUpdate(queue, update) : (update = enqueueConcurrentHookUpdate(fiber, queue, update, args), update !== null && (startUpdateTimerByLane(args, "dispatch()", fiber), scheduleUpdateOnFiber(update, fiber, args), entangleTransitionUpdate(update, queue, args)));
    }
    function dispatchSetState(fiber, queue, action) {
      var args = arguments;
      typeof args[3] === "function" && console.error("State updates from the useState() and useReducer() Hooks don't support the second callback argument. To execute a side effect after rendering, declare it in the component body with useEffect().");
      args = requestUpdateLane(fiber);
      dispatchSetStateInternal(fiber, queue, action, args) && startUpdateTimerByLane(args, "setState()", fiber);
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
        if (fiber.lanes === 0 && (alternate === null || alternate.lanes === 0) && (alternate = queue.lastRenderedReducer, alternate !== null)) {
          var prevDispatcher = ReactSharedInternals.H;
          ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
          try {
            var currentState = queue.lastRenderedState, eagerState = alternate(currentState, action);
            update.hasEagerState = true;
            update.eagerState = eagerState;
            if (objectIs(eagerState, currentState))
              return enqueueUpdate$1(fiber, queue, update, 0), workInProgressRoot === null && finishQueueingConcurrentUpdates(), false;
          } catch (error) {} finally {
            ReactSharedInternals.H = prevDispatcher;
          }
        }
        action = enqueueConcurrentHookUpdate(fiber, queue, update, lane);
        if (action !== null)
          return scheduleUpdateOnFiber(action, fiber, lane), entangleTransitionUpdate(action, queue, lane), true;
      }
      return false;
    }
    function dispatchOptimisticSetState(fiber, throwIfDuringRender, queue, action) {
      ReactSharedInternals.T === null && currentEntangledLane === 0 && console.error("An optimistic state update occurred outside a transition or action. To fix, move the update to an action, or wrap with startTransition.");
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
          throw Error("Cannot update optimistic state while rendering.");
        console.error("Cannot call startTransition while rendering.");
      } else
        throwIfDuringRender = enqueueConcurrentHookUpdate(fiber, queue, action, 2), throwIfDuringRender !== null && (startUpdateTimerByLane(2, "setOptimistic()", fiber), scheduleUpdateOnFiber(throwIfDuringRender, fiber, 2));
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
    function warnOnInvalidCallback(callback) {
      if (callback !== null && typeof callback !== "function") {
        var key = String(callback);
        didWarnOnInvalidCallback.has(key) || (didWarnOnInvalidCallback.add(key), console.error("Expected the last optional `callback` argument to be a function. Instead received: %s.", callback));
      }
    }
    function applyDerivedStateFromProps(workInProgress2, ctor, getDerivedStateFromProps, nextProps) {
      var prevState = workInProgress2.memoizedState, partialState = getDerivedStateFromProps(nextProps, prevState);
      if (workInProgress2.mode & StrictLegacyMode) {
        setIsStrictModeForDevtools(true);
        try {
          partialState = getDerivedStateFromProps(nextProps, prevState);
        } finally {
          setIsStrictModeForDevtools(false);
        }
      }
      partialState === undefined && (ctor = getComponentNameFromType(ctor) || "Component", didWarnAboutUndefinedDerivedState.has(ctor) || (didWarnAboutUndefinedDerivedState.add(ctor), console.error("%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.", ctor)));
      prevState = partialState === null || partialState === undefined ? prevState : assign({}, prevState, partialState);
      workInProgress2.memoizedState = prevState;
      workInProgress2.lanes === 0 && (workInProgress2.updateQueue.baseState = prevState);
    }
    function checkShouldComponentUpdate(workInProgress2, ctor, oldProps, newProps, oldState, newState, nextContext) {
      var instance = workInProgress2.stateNode;
      if (typeof instance.shouldComponentUpdate === "function") {
        oldProps = instance.shouldComponentUpdate(newProps, newState, nextContext);
        if (workInProgress2.mode & StrictLegacyMode) {
          setIsStrictModeForDevtools(true);
          try {
            oldProps = instance.shouldComponentUpdate(newProps, newState, nextContext);
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
        oldProps === undefined && console.error("%s.shouldComponentUpdate(): Returned undefined instead of a boolean value. Make sure to return true or false.", getComponentNameFromType(ctor) || "Component");
        return oldProps;
      }
      return ctor.prototype && ctor.prototype.isPureReactComponent ? !shallowEqual(oldProps, newProps) || !shallowEqual(oldState, newState) : true;
    }
    function callComponentWillReceiveProps(workInProgress2, instance, newProps, nextContext) {
      var oldState = instance.state;
      typeof instance.componentWillReceiveProps === "function" && instance.componentWillReceiveProps(newProps, nextContext);
      typeof instance.UNSAFE_componentWillReceiveProps === "function" && instance.UNSAFE_componentWillReceiveProps(newProps, nextContext);
      instance.state !== oldState && (workInProgress2 = getComponentNameFromFiber(workInProgress2) || "Component", didWarnAboutStateAssignmentForComponent.has(workInProgress2) || (didWarnAboutStateAssignmentForComponent.add(workInProgress2), console.error("%s.componentWillReceiveProps(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.", workInProgress2)), classComponentUpdater.enqueueReplaceState(instance, instance.state, null));
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
        for (var _propName in Component)
          newProps[_propName] === undefined && (newProps[_propName] = Component[_propName]);
      }
      return newProps;
    }
    function defaultOnUncaughtError(error) {
      reportGlobalError(error);
      console.warn(`%s

%s
`, componentName ? "An error occurred in the <" + componentName + "> component." : "An error occurred in one of your React components.", `Consider adding an error boundary to your tree to customize error handling behavior.
Visit https://react.dev/link/error-boundaries to learn more about error boundaries.`);
    }
    function defaultOnCaughtError(error) {
      var componentNameMessage = componentName ? "The above error occurred in the <" + componentName + "> component." : "The above error occurred in one of your React components.", recreateMessage = "React will try to recreate this component tree from scratch using the error boundary you provided, " + ((errorBoundaryName || "Anonymous") + ".");
      if (typeof error === "object" && error !== null && typeof error.environmentName === "string") {
        var JSCompiler_inline_result = error.environmentName;
        error = [
          `%o

%s

%s
`,
          error,
          componentNameMessage,
          recreateMessage
        ].slice(0);
        typeof error[0] === "string" ? error.splice(0, 1, badgeFormat + " " + error[0], badgeStyle, pad + JSCompiler_inline_result + pad, resetStyle) : error.splice(0, 0, badgeFormat, badgeStyle, pad + JSCompiler_inline_result + pad, resetStyle);
        error.unshift(console);
        JSCompiler_inline_result = bind.apply(console.error, error);
        JSCompiler_inline_result();
      } else
        console.error(`%o

%s

%s
`, error, componentNameMessage, recreateMessage);
    }
    function defaultOnRecoverableError(error) {
      reportGlobalError(error);
    }
    function logUncaughtError(root2, errorInfo) {
      try {
        componentName = errorInfo.source ? getComponentNameFromFiber(errorInfo.source) : null;
        errorBoundaryName = null;
        var error = errorInfo.value;
        if (ReactSharedInternals.actQueue !== null)
          ReactSharedInternals.thrownErrors.push(error);
        else {
          var onUncaughtError = root2.onUncaughtError;
          onUncaughtError(error, { componentStack: errorInfo.stack });
        }
      } catch (e$5) {
        setTimeout(function() {
          throw e$5;
        });
      }
    }
    function logCaughtError(root2, boundary, errorInfo) {
      try {
        componentName = errorInfo.source ? getComponentNameFromFiber(errorInfo.source) : null;
        errorBoundaryName = getComponentNameFromFiber(boundary);
        var onCaughtError = root2.onCaughtError;
        onCaughtError(errorInfo.value, {
          componentStack: errorInfo.stack,
          errorBoundary: boundary.tag === 1 ? boundary.stateNode : null
        });
      } catch (e$6) {
        setTimeout(function() {
          throw e$6;
        });
      }
    }
    function createRootErrorUpdate(root2, errorInfo, lane) {
      lane = createUpdate(lane);
      lane.tag = CaptureUpdate;
      lane.payload = { element: null };
      lane.callback = function() {
        runWithFiberInDEV(errorInfo.source, logUncaughtError, root2, errorInfo);
      };
      return lane;
    }
    function createClassErrorUpdate(lane) {
      lane = createUpdate(lane);
      lane.tag = CaptureUpdate;
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
          markFailedErrorBoundaryForHotReloading(fiber);
          runWithFiberInDEV(errorInfo.source, logCaughtError, root2, fiber, errorInfo);
        };
      }
      var inst = fiber.stateNode;
      inst !== null && typeof inst.componentDidCatch === "function" && (update.callback = function() {
        markFailedErrorBoundaryForHotReloading(fiber);
        runWithFiberInDEV(errorInfo.source, logCaughtError, root2, fiber, errorInfo);
        typeof getDerivedStateFromError !== "function" && (legacyErrorBoundariesThatAlreadyFailed === null ? legacyErrorBoundariesThatAlreadyFailed = new Set([this]) : legacyErrorBoundariesThatAlreadyFailed.add(this));
        callComponentDidCatchInDEV(this, errorInfo);
        typeof getDerivedStateFromError === "function" || (fiber.lanes & 2) === 0 && console.error("%s: Error boundaries should implement getDerivedStateFromError(). In that method, return a state update to display an error message or fallback UI.", getComponentNameFromFiber(fiber) || "Unknown");
      });
    }
    function throwException(root2, returnFiber, sourceFiber, value, rootRenderLanes) {
      sourceFiber.flags |= 32768;
      isDevToolsPresent && restorePendingUpdaters(root2, rootRenderLanes);
      if (value !== null && typeof value === "object" && typeof value.then === "function") {
        returnFiber = sourceFiber.alternate;
        returnFiber !== null && propagateParentContextChanges(returnFiber, sourceFiber, rootRenderLanes, true);
        isHydrating && (didSuspendOrErrorDEV = true);
        sourceFiber = suspenseHandlerStackCursor.current;
        if (sourceFiber !== null) {
          switch (sourceFiber.tag) {
            case 31:
            case 13:
              return shellBoundary === null ? renderDidSuspendDelayIfPossible() : sourceFiber.alternate === null && workInProgressRootExitStatus === RootInProgress && (workInProgressRootExitStatus = RootSuspended), sourceFiber.flags &= -257, sourceFiber.flags |= 65536, sourceFiber.lanes = rootRenderLanes, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, returnFiber === null ? sourceFiber.updateQueue = new Set([value]) : returnFiber.add(value), attachPingListener(root2, value, rootRenderLanes)), false;
            case 22:
              return sourceFiber.flags |= 65536, value === noopSuspenseyCommitThenable ? sourceFiber.flags |= 16384 : (returnFiber = sourceFiber.updateQueue, returnFiber === null ? (returnFiber = {
                transitions: null,
                markerInstances: null,
                retryQueue: new Set([value])
              }, sourceFiber.updateQueue = returnFiber) : (sourceFiber = returnFiber.retryQueue, sourceFiber === null ? returnFiber.retryQueue = new Set([value]) : sourceFiber.add(value)), attachPingListener(root2, value, rootRenderLanes)), false;
          }
          throw Error("Unexpected Suspense handler tag (" + sourceFiber.tag + "). This is a bug in React.");
        }
        attachPingListener(root2, value, rootRenderLanes);
        renderDidSuspendDelayIfPossible();
        return false;
      }
      if (isHydrating)
        return didSuspendOrErrorDEV = true, returnFiber = suspenseHandlerStackCursor.current, returnFiber !== null ? ((returnFiber.flags & 65536) === 0 && (returnFiber.flags |= 256), returnFiber.flags |= 65536, returnFiber.lanes = rootRenderLanes, value !== HydrationMismatchException && queueHydrationError(createCapturedValueAtFiber(Error("There was an error while hydrating but React was able to recover by instead client rendering from the nearest Suspense boundary.", { cause: value }), sourceFiber))) : (value !== HydrationMismatchException && queueHydrationError(createCapturedValueAtFiber(Error("There was an error while hydrating but React was able to recover by instead client rendering the entire root.", { cause: value }), sourceFiber)), root2 = root2.current.alternate, root2.flags |= 65536, rootRenderLanes &= -rootRenderLanes, root2.lanes |= rootRenderLanes, value = createCapturedValueAtFiber(value, sourceFiber), rootRenderLanes = createRootErrorUpdate(root2.stateNode, value, rootRenderLanes), enqueueCapturedUpdate(root2, rootRenderLanes), workInProgressRootExitStatus !== RootSuspendedWithDelay && (workInProgressRootExitStatus = RootErrored)), false;
      var error = createCapturedValueAtFiber(Error("There was an error during concurrent rendering but React was able to recover by instead synchronously rendering the entire root.", { cause: value }), sourceFiber);
      workInProgressRootConcurrentErrors === null ? workInProgressRootConcurrentErrors = [error] : workInProgressRootConcurrentErrors.push(error);
      workInProgressRootExitStatus !== RootSuspendedWithDelay && (workInProgressRootExitStatus = RootErrored);
      if (returnFiber === null)
        return true;
      value = createCapturedValueAtFiber(value, sourceFiber);
      sourceFiber = returnFiber;
      do {
        switch (sourceFiber.tag) {
          case 3:
            return sourceFiber.flags |= 65536, root2 = rootRenderLanes & -rootRenderLanes, sourceFiber.lanes |= root2, root2 = createRootErrorUpdate(sourceFiber.stateNode, value, root2), enqueueCapturedUpdate(sourceFiber, root2), false;
          case 1:
            if (returnFiber = sourceFiber.type, error = sourceFiber.stateNode, (sourceFiber.flags & 128) === 0 && (typeof returnFiber.getDerivedStateFromError === "function" || error !== null && typeof error.componentDidCatch === "function" && (legacyErrorBoundariesThatAlreadyFailed === null || !legacyErrorBoundariesThatAlreadyFailed.has(error))))
              return sourceFiber.flags |= 65536, rootRenderLanes &= -rootRenderLanes, sourceFiber.lanes |= rootRenderLanes, rootRenderLanes = createClassErrorUpdate(rootRenderLanes), initializeClassErrorUpdate(rootRenderLanes, root2, sourceFiber, value), enqueueCapturedUpdate(sourceFiber, rootRenderLanes), false;
        }
        sourceFiber = sourceFiber.return;
      } while (sourceFiber !== null);
      return false;
    }
    function reconcileChildren(current2, workInProgress2, nextChildren, renderLanes2) {
      workInProgress2.child = current2 === null ? mountChildFibers(workInProgress2, null, nextChildren, renderLanes2) : reconcileChildFibers(workInProgress2, current2.child, nextChildren, renderLanes2);
    }
    function updateForwardRef(current2, workInProgress2, Component, nextProps, renderLanes2) {
      Component = Component.render;
      var ref = workInProgress2.ref;
      if ("ref" in nextProps) {
        var propsWithoutRef = {};
        for (var key in nextProps)
          key !== "ref" && (propsWithoutRef[key] = nextProps[key]);
      } else
        propsWithoutRef = nextProps;
      prepareToReadContext(workInProgress2);
      nextProps = renderWithHooks(current2, workInProgress2, Component, propsWithoutRef, ref, renderLanes2);
      key = checkDidRenderIdHook();
      if (current2 !== null && !didReceiveUpdate)
        return bailoutHooks(current2, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      isHydrating && key && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current2, workInProgress2, nextProps, renderLanes2);
      return workInProgress2.child;
    }
    function updateMemoComponent(current2, workInProgress2, Component, nextProps, renderLanes2) {
      if (current2 === null) {
        var type = Component.type;
        if (typeof type === "function" && !shouldConstruct(type) && type.defaultProps === undefined && Component.compare === null)
          return Component = resolveFunctionForHotReloading(type), workInProgress2.tag = 15, workInProgress2.type = Component, validateFunctionComponentInDev(workInProgress2, type), updateSimpleMemoComponent(current2, workInProgress2, Component, nextProps, renderLanes2);
        current2 = createFiberFromTypeAndProps(Component.type, null, nextProps, workInProgress2, workInProgress2.mode, renderLanes2);
        current2.ref = workInProgress2.ref;
        current2.return = workInProgress2;
        return workInProgress2.child = current2;
      }
      type = current2.child;
      if (!checkScheduledUpdateOrContext(current2, renderLanes2)) {
        var prevProps = type.memoizedProps;
        Component = Component.compare;
        Component = Component !== null ? Component : shallowEqual;
        if (Component(prevProps, nextProps) && current2.ref === workInProgress2.ref)
          return bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      }
      workInProgress2.flags |= 1;
      current2 = createWorkInProgress(type, nextProps);
      current2.ref = workInProgress2.ref;
      current2.return = workInProgress2;
      return workInProgress2.child = current2;
    }
    function updateSimpleMemoComponent(current2, workInProgress2, Component, nextProps, renderLanes2) {
      if (current2 !== null) {
        var prevProps = current2.memoizedProps;
        if (shallowEqual(prevProps, nextProps) && current2.ref === workInProgress2.ref && workInProgress2.type === current2.type)
          if (didReceiveUpdate = false, workInProgress2.pendingProps = nextProps = prevProps, checkScheduledUpdateOrContext(current2, renderLanes2))
            (current2.flags & 131072) !== 0 && (didReceiveUpdate = true);
          else
            return workInProgress2.lanes = current2.lanes, bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      }
      return updateFunctionComponent(current2, workInProgress2, Component, nextProps, renderLanes2);
    }
    function updateOffscreenComponent(current2, workInProgress2, renderLanes2, nextProps) {
      var nextChildren = nextProps.children, prevState = current2 !== null ? current2.memoizedState : null;
      current2 === null && workInProgress2.stateNode === null && (workInProgress2.stateNode = {
        _visibility: OffscreenVisible,
        _pendingMarkers: null,
        _retryCache: null,
        _transitions: null
      });
      if (nextProps.mode === "hidden") {
        if ((workInProgress2.flags & 128) !== 0) {
          prevState = prevState !== null ? prevState.baseLanes | renderLanes2 : renderLanes2;
          if (current2 !== null) {
            nextProps = workInProgress2.child = current2.child;
            for (nextChildren = 0;nextProps !== null; )
              nextChildren = nextChildren | nextProps.lanes | nextProps.childLanes, nextProps = nextProps.sibling;
            nextProps = nextChildren & ~prevState;
          } else
            nextProps = 0, workInProgress2.child = null;
          return deferHiddenOffscreenComponent(current2, workInProgress2, prevState, renderLanes2, nextProps);
        }
        if ((renderLanes2 & 536870912) !== 0)
          workInProgress2.memoizedState = { baseLanes: 0, cachePool: null }, current2 !== null && pushTransition(workInProgress2, prevState !== null ? prevState.cachePool : null), prevState !== null ? pushHiddenContext(workInProgress2, prevState) : reuseHiddenContextOnStack(workInProgress2), pushOffscreenSuspenseHandler(workInProgress2);
        else
          return nextProps = workInProgress2.lanes = 536870912, deferHiddenOffscreenComponent(current2, workInProgress2, prevState !== null ? prevState.baseLanes | renderLanes2 : renderLanes2, renderLanes2, nextProps);
      } else
        prevState !== null ? (pushTransition(workInProgress2, prevState.cachePool), pushHiddenContext(workInProgress2, prevState), reuseSuspenseHandlerOnStack(workInProgress2), workInProgress2.memoizedState = null) : (current2 !== null && pushTransition(workInProgress2, null), reuseHiddenContextOnStack(workInProgress2), reuseSuspenseHandlerOnStack(workInProgress2));
      reconcileChildren(current2, workInProgress2, nextChildren, renderLanes2);
      return workInProgress2.child;
    }
    function bailoutOffscreenComponent(current2, workInProgress2) {
      current2 !== null && current2.tag === 22 || workInProgress2.stateNode !== null || (workInProgress2.stateNode = {
        _visibility: OffscreenVisible,
        _pendingMarkers: null,
        _retryCache: null,
        _transitions: null
      });
      return workInProgress2.sibling;
    }
    function deferHiddenOffscreenComponent(current2, workInProgress2, nextBaseLanes, renderLanes2, remainingChildLanes) {
      var JSCompiler_inline_result = peekCacheFromPool();
      JSCompiler_inline_result = JSCompiler_inline_result === null ? null : {
        parent: CacheContext._currentValue,
        pool: JSCompiler_inline_result
      };
      workInProgress2.memoizedState = {
        baseLanes: nextBaseLanes,
        cachePool: JSCompiler_inline_result
      };
      current2 !== null && pushTransition(workInProgress2, null);
      reuseHiddenContextOnStack(workInProgress2);
      pushOffscreenSuspenseHandler(workInProgress2);
      current2 !== null && propagateParentContextChanges(current2, workInProgress2, renderLanes2, true);
      workInProgress2.childLanes = remainingChildLanes;
      return null;
    }
    function mountActivityChildren(workInProgress2, nextProps) {
      var hiddenProp = nextProps.hidden;
      hiddenProp !== undefined && console.error(`<Activity> doesn't accept a hidden prop. Use mode="hidden" instead.
- <Activity %s>
+ <Activity %s>`, hiddenProp === true ? "hidden" : hiddenProp === false ? "hidden={false}" : "hidden={...}", hiddenProp ? 'mode="hidden"' : 'mode="visible"');
      nextProps = mountWorkInProgressOffscreenFiber({ mode: nextProps.mode, children: nextProps.children }, workInProgress2.mode);
      nextProps.ref = workInProgress2.ref;
      workInProgress2.child = nextProps;
      nextProps.return = workInProgress2;
      return nextProps;
    }
    function retryActivityComponentWithoutHydrating(current2, workInProgress2, renderLanes2) {
      reconcileChildFibers(workInProgress2, current2.child, null, renderLanes2);
      current2 = mountActivityChildren(workInProgress2, workInProgress2.pendingProps);
      current2.flags |= 2;
      popSuspenseHandler(workInProgress2);
      workInProgress2.memoizedState = null;
      return current2;
    }
    function updateActivityComponent(current2, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, didSuspend = (workInProgress2.flags & 128) !== 0;
      workInProgress2.flags &= -129;
      if (current2 === null) {
        if (isHydrating) {
          if (nextProps.mode === "hidden")
            return current2 = mountActivityChildren(workInProgress2, nextProps), workInProgress2.lanes = 536870912, bailoutOffscreenComponent(null, current2);
          pushDehydratedActivitySuspenseHandler(workInProgress2);
          (current2 = nextHydratableInstance) ? (renderLanes2 = canHydrateHydrationBoundary(current2, rootOrSingletonContext), renderLanes2 = renderLanes2 !== null && renderLanes2.data === ACTIVITY_START_DATA ? renderLanes2 : null, renderLanes2 !== null && (nextProps = {
            dehydrated: renderLanes2,
            treeContext: getSuspendedTreeContext(),
            retryLane: 536870912,
            hydrationErrors: null
          }, workInProgress2.memoizedState = nextProps, nextProps = createFiberFromDehydratedFragment(renderLanes2), nextProps.return = workInProgress2, workInProgress2.child = nextProps, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : renderLanes2 = null;
          if (renderLanes2 === null)
            throw warnNonHydratedInstance(workInProgress2, current2), throwOnHydrationMismatch(workInProgress2);
          workInProgress2.lanes = 536870912;
          return null;
        }
        return mountActivityChildren(workInProgress2, nextProps);
      }
      var prevState = current2.memoizedState;
      if (prevState !== null) {
        var activityInstance = prevState.dehydrated;
        pushDehydratedActivitySuspenseHandler(workInProgress2);
        if (didSuspend)
          if (workInProgress2.flags & 256)
            workInProgress2.flags &= -257, workInProgress2 = retryActivityComponentWithoutHydrating(current2, workInProgress2, renderLanes2);
          else if (workInProgress2.memoizedState !== null)
            workInProgress2.child = current2.child, workInProgress2.flags |= 128, workInProgress2 = null;
          else
            throw Error("Client rendering an Activity suspended it again. This is a bug in React.");
        else if (warnIfHydrating(), (renderLanes2 & 536870912) !== 0 && markRenderDerivedCause(workInProgress2), didReceiveUpdate || propagateParentContextChanges(current2, workInProgress2, renderLanes2, false), didSuspend = (renderLanes2 & current2.childLanes) !== 0, didReceiveUpdate || didSuspend) {
          nextProps = workInProgressRoot;
          if (nextProps !== null && (activityInstance = getBumpedLaneForHydration(nextProps, renderLanes2), activityInstance !== 0 && activityInstance !== prevState.retryLane))
            throw prevState.retryLane = activityInstance, enqueueConcurrentRenderForLane(current2, activityInstance), scheduleUpdateOnFiber(nextProps, current2, activityInstance), SelectiveHydrationException;
          renderDidSuspendDelayIfPossible();
          workInProgress2 = retryActivityComponentWithoutHydrating(current2, workInProgress2, renderLanes2);
        } else
          current2 = prevState.treeContext, nextHydratableInstance = getNextHydratable(activityInstance.nextSibling), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, didSuspendOrErrorDEV = false, hydrationDiffRootDEV = null, rootOrSingletonContext = false, current2 !== null && restoreSuspendedTreeContext(workInProgress2, current2), workInProgress2 = mountActivityChildren(workInProgress2, nextProps), workInProgress2.flags |= 4096;
        return workInProgress2;
      }
      prevState = current2.child;
      nextProps = { mode: nextProps.mode, children: nextProps.children };
      (renderLanes2 & 536870912) !== 0 && (renderLanes2 & current2.lanes) !== 0 && markRenderDerivedCause(workInProgress2);
      current2 = createWorkInProgress(prevState, nextProps);
      current2.ref = workInProgress2.ref;
      workInProgress2.child = current2;
      current2.return = workInProgress2;
      return current2;
    }
    function markRef(current2, workInProgress2) {
      var ref = workInProgress2.ref;
      if (ref === null)
        current2 !== null && current2.ref !== null && (workInProgress2.flags |= 4194816);
      else {
        if (typeof ref !== "function" && typeof ref !== "object")
          throw Error("Expected ref to be a function, an object returned by React.createRef(), or undefined/null.");
        if (current2 === null || current2.ref !== ref)
          workInProgress2.flags |= 4194816;
      }
    }
    function updateFunctionComponent(current2, workInProgress2, Component, nextProps, renderLanes2) {
      if (Component.prototype && typeof Component.prototype.render === "function") {
        var componentName2 = getComponentNameFromType(Component) || "Unknown";
        didWarnAboutBadClass[componentName2] || (console.error("The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.", componentName2, componentName2), didWarnAboutBadClass[componentName2] = true);
      }
      workInProgress2.mode & StrictLegacyMode && ReactStrictModeWarnings.recordLegacyContextWarning(workInProgress2, null);
      current2 === null && (validateFunctionComponentInDev(workInProgress2, workInProgress2.type), Component.contextTypes && (componentName2 = getComponentNameFromType(Component) || "Unknown", didWarnAboutContextTypes[componentName2] || (didWarnAboutContextTypes[componentName2] = true, console.error("%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with React.useContext() instead. (https://react.dev/link/legacy-context)", componentName2))));
      prepareToReadContext(workInProgress2);
      Component = renderWithHooks(current2, workInProgress2, Component, nextProps, undefined, renderLanes2);
      nextProps = checkDidRenderIdHook();
      if (current2 !== null && !didReceiveUpdate)
        return bailoutHooks(current2, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      isHydrating && nextProps && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current2, workInProgress2, Component, renderLanes2);
      return workInProgress2.child;
    }
    function replayFunctionComponent(current2, workInProgress2, nextProps, Component, secondArg, renderLanes2) {
      prepareToReadContext(workInProgress2);
      hookTypesUpdateIndexDev = -1;
      ignorePreviousDependencies = current2 !== null && current2.type !== workInProgress2.type;
      workInProgress2.updateQueue = null;
      nextProps = renderWithHooksAgain(workInProgress2, Component, nextProps, secondArg);
      finishRenderingHooks(current2, workInProgress2);
      Component = checkDidRenderIdHook();
      if (current2 !== null && !didReceiveUpdate)
        return bailoutHooks(current2, workInProgress2, renderLanes2), bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      isHydrating && Component && pushMaterializedTreeId(workInProgress2);
      workInProgress2.flags |= 1;
      reconcileChildren(current2, workInProgress2, nextProps, renderLanes2);
      return workInProgress2.child;
    }
    function updateClassComponent(current2, workInProgress2, Component, nextProps, renderLanes2) {
      switch (shouldErrorImpl(workInProgress2)) {
        case false:
          var _instance = workInProgress2.stateNode, state = new workInProgress2.type(workInProgress2.memoizedProps, _instance.context).state;
          _instance.updater.enqueueSetState(_instance, state, null);
          break;
        case true:
          workInProgress2.flags |= 128;
          workInProgress2.flags |= 65536;
          _instance = Error("Simulated error coming from DevTools");
          var lane = renderLanes2 & -renderLanes2;
          workInProgress2.lanes |= lane;
          state = workInProgressRoot;
          if (state === null)
            throw Error("Expected a work-in-progress root. This is a bug in React. Please file an issue.");
          lane = createClassErrorUpdate(lane);
          initializeClassErrorUpdate(lane, state, workInProgress2, createCapturedValueAtFiber(_instance, workInProgress2));
          enqueueCapturedUpdate(workInProgress2, lane);
      }
      prepareToReadContext(workInProgress2);
      if (workInProgress2.stateNode === null) {
        state = emptyContextObject;
        _instance = Component.contextType;
        "contextType" in Component && _instance !== null && (_instance === undefined || _instance.$$typeof !== REACT_CONTEXT_TYPE) && !didWarnAboutInvalidateContextType.has(Component) && (didWarnAboutInvalidateContextType.add(Component), lane = _instance === undefined ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file." : typeof _instance !== "object" ? " However, it is set to a " + typeof _instance + "." : _instance.$$typeof === REACT_CONSUMER_TYPE ? " Did you accidentally pass the Context.Consumer instead?" : " However, it is set to an object with keys {" + Object.keys(_instance).join(", ") + "}.", console.error("%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s", getComponentNameFromType(Component) || "Component", lane));
        typeof _instance === "object" && _instance !== null && (state = readContext(_instance));
        _instance = new Component(nextProps, state);
        if (workInProgress2.mode & StrictLegacyMode) {
          setIsStrictModeForDevtools(true);
          try {
            _instance = new Component(nextProps, state);
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
        state = workInProgress2.memoizedState = _instance.state !== null && _instance.state !== undefined ? _instance.state : null;
        _instance.updater = classComponentUpdater;
        workInProgress2.stateNode = _instance;
        _instance._reactInternals = workInProgress2;
        _instance._reactInternalInstance = fakeInternalInstance;
        typeof Component.getDerivedStateFromProps === "function" && state === null && (state = getComponentNameFromType(Component) || "Component", didWarnAboutUninitializedState.has(state) || (didWarnAboutUninitializedState.add(state), console.error("`%s` uses `getDerivedStateFromProps` but its initial state is %s. This is not recommended. Instead, define the initial state by assigning an object to `this.state` in the constructor of `%s`. This ensures that `getDerivedStateFromProps` arguments have a consistent shape.", state, _instance.state === null ? "null" : "undefined", state)));
        if (typeof Component.getDerivedStateFromProps === "function" || typeof _instance.getSnapshotBeforeUpdate === "function") {
          var foundWillUpdateName = lane = state = null;
          typeof _instance.componentWillMount === "function" && _instance.componentWillMount.__suppressDeprecationWarning !== true ? state = "componentWillMount" : typeof _instance.UNSAFE_componentWillMount === "function" && (state = "UNSAFE_componentWillMount");
          typeof _instance.componentWillReceiveProps === "function" && _instance.componentWillReceiveProps.__suppressDeprecationWarning !== true ? lane = "componentWillReceiveProps" : typeof _instance.UNSAFE_componentWillReceiveProps === "function" && (lane = "UNSAFE_componentWillReceiveProps");
          typeof _instance.componentWillUpdate === "function" && _instance.componentWillUpdate.__suppressDeprecationWarning !== true ? foundWillUpdateName = "componentWillUpdate" : typeof _instance.UNSAFE_componentWillUpdate === "function" && (foundWillUpdateName = "UNSAFE_componentWillUpdate");
          if (state !== null || lane !== null || foundWillUpdateName !== null) {
            _instance = getComponentNameFromType(Component) || "Component";
            var newApiName = typeof Component.getDerivedStateFromProps === "function" ? "getDerivedStateFromProps()" : "getSnapshotBeforeUpdate()";
            didWarnAboutLegacyLifecyclesAndDerivedState.has(_instance) || (didWarnAboutLegacyLifecyclesAndDerivedState.add(_instance), console.error(`Unsafe legacy lifecycles will not be called for components using new component APIs.

%s uses %s but also contains the following legacy lifecycles:%s%s%s

The above lifecycles should be removed. Learn more about this warning here:
https://react.dev/link/unsafe-component-lifecycles`, _instance, newApiName, state !== null ? `
  ` + state : "", lane !== null ? `
  ` + lane : "", foundWillUpdateName !== null ? `
  ` + foundWillUpdateName : ""));
          }
        }
        _instance = workInProgress2.stateNode;
        state = getComponentNameFromType(Component) || "Component";
        _instance.render || (Component.prototype && typeof Component.prototype.render === "function" ? console.error("No `render` method found on the %s instance: did you accidentally return an object from the constructor?", state) : console.error("No `render` method found on the %s instance: you may have forgotten to define `render`.", state));
        !_instance.getInitialState || _instance.getInitialState.isReactClassApproved || _instance.state || console.error("getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?", state);
        _instance.getDefaultProps && !_instance.getDefaultProps.isReactClassApproved && console.error("getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.", state);
        _instance.contextType && console.error("contextType was defined as an instance property on %s. Use a static property to define contextType instead.", state);
        Component.childContextTypes && !didWarnAboutChildContextTypes.has(Component) && (didWarnAboutChildContextTypes.add(Component), console.error("%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)", state));
        Component.contextTypes && !didWarnAboutContextTypes$1.has(Component) && (didWarnAboutContextTypes$1.add(Component), console.error("%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)", state));
        typeof _instance.componentShouldUpdate === "function" && console.error("%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.", state);
        Component.prototype && Component.prototype.isPureReactComponent && typeof _instance.shouldComponentUpdate !== "undefined" && console.error("%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.", getComponentNameFromType(Component) || "A pure component");
        typeof _instance.componentDidUnmount === "function" && console.error("%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?", state);
        typeof _instance.componentDidReceiveProps === "function" && console.error("%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().", state);
        typeof _instance.componentWillRecieveProps === "function" && console.error("%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?", state);
        typeof _instance.UNSAFE_componentWillRecieveProps === "function" && console.error("%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?", state);
        lane = _instance.props !== nextProps;
        _instance.props !== undefined && lane && console.error("When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.", state);
        _instance.defaultProps && console.error("Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.", state, state);
        typeof _instance.getSnapshotBeforeUpdate !== "function" || typeof _instance.componentDidUpdate === "function" || didWarnAboutGetSnapshotBeforeUpdateWithoutDidUpdate.has(Component) || (didWarnAboutGetSnapshotBeforeUpdateWithoutDidUpdate.add(Component), console.error("%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.", getComponentNameFromType(Component)));
        typeof _instance.getDerivedStateFromProps === "function" && console.error("%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.", state);
        typeof _instance.getDerivedStateFromError === "function" && console.error("%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.", state);
        typeof Component.getSnapshotBeforeUpdate === "function" && console.error("%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.", state);
        (lane = _instance.state) && (typeof lane !== "object" || isArrayImpl(lane)) && console.error("%s.state: must be set to an object or null", state);
        typeof _instance.getChildContext === "function" && typeof Component.childContextTypes !== "object" && console.error("%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().", state);
        _instance = workInProgress2.stateNode;
        _instance.props = nextProps;
        _instance.state = workInProgress2.memoizedState;
        _instance.refs = {};
        initializeUpdateQueue(workInProgress2);
        state = Component.contextType;
        _instance.context = typeof state === "object" && state !== null ? readContext(state) : emptyContextObject;
        _instance.state === nextProps && (state = getComponentNameFromType(Component) || "Component", didWarnAboutDirectlyAssigningPropsToState.has(state) || (didWarnAboutDirectlyAssigningPropsToState.add(state), console.error("%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.", state)));
        workInProgress2.mode & StrictLegacyMode && ReactStrictModeWarnings.recordLegacyContextWarning(workInProgress2, _instance);
        ReactStrictModeWarnings.recordUnsafeLifecycleWarnings(workInProgress2, _instance);
        _instance.state = workInProgress2.memoizedState;
        state = Component.getDerivedStateFromProps;
        typeof state === "function" && (applyDerivedStateFromProps(workInProgress2, Component, state, nextProps), _instance.state = workInProgress2.memoizedState);
        typeof Component.getDerivedStateFromProps === "function" || typeof _instance.getSnapshotBeforeUpdate === "function" || typeof _instance.UNSAFE_componentWillMount !== "function" && typeof _instance.componentWillMount !== "function" || (state = _instance.state, typeof _instance.componentWillMount === "function" && _instance.componentWillMount(), typeof _instance.UNSAFE_componentWillMount === "function" && _instance.UNSAFE_componentWillMount(), state !== _instance.state && (console.error("%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.", getComponentNameFromFiber(workInProgress2) || "Component"), classComponentUpdater.enqueueReplaceState(_instance, _instance.state, null)), processUpdateQueue(workInProgress2, nextProps, _instance, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction(), _instance.state = workInProgress2.memoizedState);
        typeof _instance.componentDidMount === "function" && (workInProgress2.flags |= 4194308);
        (workInProgress2.mode & StrictEffectsMode) !== NoMode && (workInProgress2.flags |= 134217728);
        _instance = true;
      } else if (current2 === null) {
        _instance = workInProgress2.stateNode;
        var unresolvedOldProps = workInProgress2.memoizedProps;
        lane = resolveClassComponentProps(Component, unresolvedOldProps);
        _instance.props = lane;
        var oldContext = _instance.context;
        foundWillUpdateName = Component.contextType;
        state = emptyContextObject;
        typeof foundWillUpdateName === "object" && foundWillUpdateName !== null && (state = readContext(foundWillUpdateName));
        newApiName = Component.getDerivedStateFromProps;
        foundWillUpdateName = typeof newApiName === "function" || typeof _instance.getSnapshotBeforeUpdate === "function";
        unresolvedOldProps = workInProgress2.pendingProps !== unresolvedOldProps;
        foundWillUpdateName || typeof _instance.UNSAFE_componentWillReceiveProps !== "function" && typeof _instance.componentWillReceiveProps !== "function" || (unresolvedOldProps || oldContext !== state) && callComponentWillReceiveProps(workInProgress2, _instance, nextProps, state);
        hasForceUpdate = false;
        var oldState = workInProgress2.memoizedState;
        _instance.state = oldState;
        processUpdateQueue(workInProgress2, nextProps, _instance, renderLanes2);
        suspendIfUpdateReadFromEntangledAsyncAction();
        oldContext = workInProgress2.memoizedState;
        unresolvedOldProps || oldState !== oldContext || hasForceUpdate ? (typeof newApiName === "function" && (applyDerivedStateFromProps(workInProgress2, Component, newApiName, nextProps), oldContext = workInProgress2.memoizedState), (lane = hasForceUpdate || checkShouldComponentUpdate(workInProgress2, Component, lane, nextProps, oldState, oldContext, state)) ? (foundWillUpdateName || typeof _instance.UNSAFE_componentWillMount !== "function" && typeof _instance.componentWillMount !== "function" || (typeof _instance.componentWillMount === "function" && _instance.componentWillMount(), typeof _instance.UNSAFE_componentWillMount === "function" && _instance.UNSAFE_componentWillMount()), typeof _instance.componentDidMount === "function" && (workInProgress2.flags |= 4194308), (workInProgress2.mode & StrictEffectsMode) !== NoMode && (workInProgress2.flags |= 134217728)) : (typeof _instance.componentDidMount === "function" && (workInProgress2.flags |= 4194308), (workInProgress2.mode & StrictEffectsMode) !== NoMode && (workInProgress2.flags |= 134217728), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = oldContext), _instance.props = nextProps, _instance.state = oldContext, _instance.context = state, _instance = lane) : (typeof _instance.componentDidMount === "function" && (workInProgress2.flags |= 4194308), (workInProgress2.mode & StrictEffectsMode) !== NoMode && (workInProgress2.flags |= 134217728), _instance = false);
      } else {
        _instance = workInProgress2.stateNode;
        cloneUpdateQueue(current2, workInProgress2);
        state = workInProgress2.memoizedProps;
        foundWillUpdateName = resolveClassComponentProps(Component, state);
        _instance.props = foundWillUpdateName;
        newApiName = workInProgress2.pendingProps;
        oldState = _instance.context;
        oldContext = Component.contextType;
        lane = emptyContextObject;
        typeof oldContext === "object" && oldContext !== null && (lane = readContext(oldContext));
        unresolvedOldProps = Component.getDerivedStateFromProps;
        (oldContext = typeof unresolvedOldProps === "function" || typeof _instance.getSnapshotBeforeUpdate === "function") || typeof _instance.UNSAFE_componentWillReceiveProps !== "function" && typeof _instance.componentWillReceiveProps !== "function" || (state !== newApiName || oldState !== lane) && callComponentWillReceiveProps(workInProgress2, _instance, nextProps, lane);
        hasForceUpdate = false;
        oldState = workInProgress2.memoizedState;
        _instance.state = oldState;
        processUpdateQueue(workInProgress2, nextProps, _instance, renderLanes2);
        suspendIfUpdateReadFromEntangledAsyncAction();
        var newState = workInProgress2.memoizedState;
        state !== newApiName || oldState !== newState || hasForceUpdate || current2 !== null && current2.dependencies !== null && checkIfContextChanged(current2.dependencies) ? (typeof unresolvedOldProps === "function" && (applyDerivedStateFromProps(workInProgress2, Component, unresolvedOldProps, nextProps), newState = workInProgress2.memoizedState), (foundWillUpdateName = hasForceUpdate || checkShouldComponentUpdate(workInProgress2, Component, foundWillUpdateName, nextProps, oldState, newState, lane) || current2 !== null && current2.dependencies !== null && checkIfContextChanged(current2.dependencies)) ? (oldContext || typeof _instance.UNSAFE_componentWillUpdate !== "function" && typeof _instance.componentWillUpdate !== "function" || (typeof _instance.componentWillUpdate === "function" && _instance.componentWillUpdate(nextProps, newState, lane), typeof _instance.UNSAFE_componentWillUpdate === "function" && _instance.UNSAFE_componentWillUpdate(nextProps, newState, lane)), typeof _instance.componentDidUpdate === "function" && (workInProgress2.flags |= 4), typeof _instance.getSnapshotBeforeUpdate === "function" && (workInProgress2.flags |= 1024)) : (typeof _instance.componentDidUpdate !== "function" || state === current2.memoizedProps && oldState === current2.memoizedState || (workInProgress2.flags |= 4), typeof _instance.getSnapshotBeforeUpdate !== "function" || state === current2.memoizedProps && oldState === current2.memoizedState || (workInProgress2.flags |= 1024), workInProgress2.memoizedProps = nextProps, workInProgress2.memoizedState = newState), _instance.props = nextProps, _instance.state = newState, _instance.context = lane, _instance = foundWillUpdateName) : (typeof _instance.componentDidUpdate !== "function" || state === current2.memoizedProps && oldState === current2.memoizedState || (workInProgress2.flags |= 4), typeof _instance.getSnapshotBeforeUpdate !== "function" || state === current2.memoizedProps && oldState === current2.memoizedState || (workInProgress2.flags |= 1024), _instance = false);
      }
      lane = _instance;
      markRef(current2, workInProgress2);
      state = (workInProgress2.flags & 128) !== 0;
      if (lane || state) {
        lane = workInProgress2.stateNode;
        setCurrentFiber(workInProgress2);
        if (state && typeof Component.getDerivedStateFromError !== "function")
          Component = null, profilerStartTime = -1;
        else if (Component = callRenderInDEV(lane), workInProgress2.mode & StrictLegacyMode) {
          setIsStrictModeForDevtools(true);
          try {
            callRenderInDEV(lane);
          } finally {
            setIsStrictModeForDevtools(false);
          }
        }
        workInProgress2.flags |= 1;
        current2 !== null && state ? (workInProgress2.child = reconcileChildFibers(workInProgress2, current2.child, null, renderLanes2), workInProgress2.child = reconcileChildFibers(workInProgress2, null, Component, renderLanes2)) : reconcileChildren(current2, workInProgress2, Component, renderLanes2);
        workInProgress2.memoizedState = lane.state;
        current2 = workInProgress2.child;
      } else
        current2 = bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
      renderLanes2 = workInProgress2.stateNode;
      _instance && renderLanes2.props !== nextProps && (didWarnAboutReassigningProps || console.error("It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.", getComponentNameFromFiber(workInProgress2) || "a component"), didWarnAboutReassigningProps = true);
      return current2;
    }
    function mountHostRootWithoutHydrating(current2, workInProgress2, nextChildren, renderLanes2) {
      resetHydrationState();
      workInProgress2.flags |= 256;
      reconcileChildren(current2, workInProgress2, nextChildren, renderLanes2);
      return workInProgress2.child;
    }
    function validateFunctionComponentInDev(workInProgress2, Component) {
      Component && Component.childContextTypes && console.error(`childContextTypes cannot be defined on a function component.
  %s.childContextTypes = ...`, Component.displayName || Component.name || "Component");
      typeof Component.getDerivedStateFromProps === "function" && (workInProgress2 = getComponentNameFromType(Component) || "Unknown", didWarnAboutGetDerivedStateOnFunctionComponent[workInProgress2] || (console.error("%s: Function components do not support getDerivedStateFromProps.", workInProgress2), didWarnAboutGetDerivedStateOnFunctionComponent[workInProgress2] = true));
      typeof Component.contextType === "object" && Component.contextType !== null && (Component = getComponentNameFromType(Component) || "Unknown", didWarnAboutContextTypeOnFunctionComponent[Component] || (console.error("%s: Function components do not support contextType.", Component), didWarnAboutContextTypeOnFunctionComponent[Component] = true));
    }
    function mountSuspenseOffscreenState(renderLanes2) {
      return { baseLanes: renderLanes2, cachePool: getSuspendedCache() };
    }
    function getRemainingWorkInPrimaryTree(current2, primaryTreeDidDefer, renderLanes2) {
      current2 = current2 !== null ? current2.childLanes & ~renderLanes2 : 0;
      primaryTreeDidDefer && (current2 |= workInProgressDeferredLane);
      return current2;
    }
    function updateSuspenseComponent(current2, workInProgress2, renderLanes2) {
      var JSCompiler_object_inline_digest_2724;
      var JSCompiler_object_inline_stack_2725 = workInProgress2.pendingProps;
      shouldSuspendImpl(workInProgress2) && (workInProgress2.flags |= 128);
      var JSCompiler_object_inline_message_2723 = false;
      var didSuspend = (workInProgress2.flags & 128) !== 0;
      (JSCompiler_object_inline_digest_2724 = didSuspend) || (JSCompiler_object_inline_digest_2724 = current2 !== null && current2.memoizedState === null ? false : (suspenseStackCursor.current & ForceSuspenseFallback) !== 0);
      JSCompiler_object_inline_digest_2724 && (JSCompiler_object_inline_message_2723 = true, workInProgress2.flags &= -129);
      JSCompiler_object_inline_digest_2724 = (workInProgress2.flags & 32) !== 0;
      workInProgress2.flags &= -33;
      if (current2 === null) {
        if (isHydrating) {
          JSCompiler_object_inline_message_2723 ? pushPrimaryTreeSuspenseHandler(workInProgress2) : reuseSuspenseHandlerOnStack(workInProgress2);
          (current2 = nextHydratableInstance) ? (renderLanes2 = canHydrateHydrationBoundary(current2, rootOrSingletonContext), renderLanes2 = renderLanes2 !== null && renderLanes2.data !== ACTIVITY_START_DATA ? renderLanes2 : null, renderLanes2 !== null && (JSCompiler_object_inline_digest_2724 = {
            dehydrated: renderLanes2,
            treeContext: getSuspendedTreeContext(),
            retryLane: 536870912,
            hydrationErrors: null
          }, workInProgress2.memoizedState = JSCompiler_object_inline_digest_2724, JSCompiler_object_inline_digest_2724 = createFiberFromDehydratedFragment(renderLanes2), JSCompiler_object_inline_digest_2724.return = workInProgress2, workInProgress2.child = JSCompiler_object_inline_digest_2724, hydrationParentFiber = workInProgress2, nextHydratableInstance = null)) : renderLanes2 = null;
          if (renderLanes2 === null)
            throw warnNonHydratedInstance(workInProgress2, current2), throwOnHydrationMismatch(workInProgress2);
          isSuspenseInstanceFallback(renderLanes2) ? workInProgress2.lanes = 32 : workInProgress2.lanes = 536870912;
          return null;
        }
        var nextPrimaryChildren = JSCompiler_object_inline_stack_2725.children;
        JSCompiler_object_inline_stack_2725 = JSCompiler_object_inline_stack_2725.fallback;
        if (JSCompiler_object_inline_message_2723) {
          reuseSuspenseHandlerOnStack(workInProgress2);
          var mode = workInProgress2.mode;
          nextPrimaryChildren = mountWorkInProgressOffscreenFiber({ mode: "hidden", children: nextPrimaryChildren }, mode);
          JSCompiler_object_inline_stack_2725 = createFiberFromFragment(JSCompiler_object_inline_stack_2725, mode, renderLanes2, null);
          nextPrimaryChildren.return = workInProgress2;
          JSCompiler_object_inline_stack_2725.return = workInProgress2;
          nextPrimaryChildren.sibling = JSCompiler_object_inline_stack_2725;
          workInProgress2.child = nextPrimaryChildren;
          JSCompiler_object_inline_stack_2725 = workInProgress2.child;
          JSCompiler_object_inline_stack_2725.memoizedState = mountSuspenseOffscreenState(renderLanes2);
          JSCompiler_object_inline_stack_2725.childLanes = getRemainingWorkInPrimaryTree(current2, JSCompiler_object_inline_digest_2724, renderLanes2);
          workInProgress2.memoizedState = SUSPENDED_MARKER;
          return bailoutOffscreenComponent(null, JSCompiler_object_inline_stack_2725);
        }
        pushPrimaryTreeSuspenseHandler(workInProgress2);
        return mountSuspensePrimaryChildren(workInProgress2, nextPrimaryChildren);
      }
      var prevState = current2.memoizedState;
      if (prevState !== null) {
        var JSCompiler_object_inline_componentStack_2726 = prevState.dehydrated;
        if (JSCompiler_object_inline_componentStack_2726 !== null) {
          if (didSuspend)
            workInProgress2.flags & 256 ? (pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags &= -257, workInProgress2 = retrySuspenseComponentWithoutHydrating(current2, workInProgress2, renderLanes2)) : workInProgress2.memoizedState !== null ? (reuseSuspenseHandlerOnStack(workInProgress2), workInProgress2.child = current2.child, workInProgress2.flags |= 128, workInProgress2 = null) : (reuseSuspenseHandlerOnStack(workInProgress2), nextPrimaryChildren = JSCompiler_object_inline_stack_2725.fallback, mode = workInProgress2.mode, JSCompiler_object_inline_stack_2725 = mountWorkInProgressOffscreenFiber({
              mode: "visible",
              children: JSCompiler_object_inline_stack_2725.children
            }, mode), nextPrimaryChildren = createFiberFromFragment(nextPrimaryChildren, mode, renderLanes2, null), nextPrimaryChildren.flags |= 2, JSCompiler_object_inline_stack_2725.return = workInProgress2, nextPrimaryChildren.return = workInProgress2, JSCompiler_object_inline_stack_2725.sibling = nextPrimaryChildren, workInProgress2.child = JSCompiler_object_inline_stack_2725, reconcileChildFibers(workInProgress2, current2.child, null, renderLanes2), JSCompiler_object_inline_stack_2725 = workInProgress2.child, JSCompiler_object_inline_stack_2725.memoizedState = mountSuspenseOffscreenState(renderLanes2), JSCompiler_object_inline_stack_2725.childLanes = getRemainingWorkInPrimaryTree(current2, JSCompiler_object_inline_digest_2724, renderLanes2), workInProgress2.memoizedState = SUSPENDED_MARKER, workInProgress2 = bailoutOffscreenComponent(null, JSCompiler_object_inline_stack_2725));
          else if (pushPrimaryTreeSuspenseHandler(workInProgress2), warnIfHydrating(), (renderLanes2 & 536870912) !== 0 && markRenderDerivedCause(workInProgress2), isSuspenseInstanceFallback(JSCompiler_object_inline_componentStack_2726)) {
            JSCompiler_object_inline_digest_2724 = JSCompiler_object_inline_componentStack_2726.nextSibling && JSCompiler_object_inline_componentStack_2726.nextSibling.dataset;
            if (JSCompiler_object_inline_digest_2724) {
              nextPrimaryChildren = JSCompiler_object_inline_digest_2724.dgst;
              var message = JSCompiler_object_inline_digest_2724.msg;
              mode = JSCompiler_object_inline_digest_2724.stck;
              var componentStack = JSCompiler_object_inline_digest_2724.cstck;
            }
            JSCompiler_object_inline_message_2723 = message;
            JSCompiler_object_inline_digest_2724 = nextPrimaryChildren;
            JSCompiler_object_inline_stack_2725 = mode;
            JSCompiler_object_inline_componentStack_2726 = componentStack;
            nextPrimaryChildren = JSCompiler_object_inline_message_2723;
            mode = JSCompiler_object_inline_componentStack_2726;
            nextPrimaryChildren = nextPrimaryChildren ? Error(nextPrimaryChildren) : Error("The server could not finish this Suspense boundary, likely due to an error during server rendering. Switched to client rendering.");
            nextPrimaryChildren.stack = JSCompiler_object_inline_stack_2725 || "";
            nextPrimaryChildren.digest = JSCompiler_object_inline_digest_2724;
            JSCompiler_object_inline_digest_2724 = mode === undefined ? null : mode;
            JSCompiler_object_inline_stack_2725 = {
              value: nextPrimaryChildren,
              source: null,
              stack: JSCompiler_object_inline_digest_2724
            };
            typeof JSCompiler_object_inline_digest_2724 === "string" && CapturedStacks.set(nextPrimaryChildren, JSCompiler_object_inline_stack_2725);
            queueHydrationError(JSCompiler_object_inline_stack_2725);
            workInProgress2 = retrySuspenseComponentWithoutHydrating(current2, workInProgress2, renderLanes2);
          } else if (didReceiveUpdate || propagateParentContextChanges(current2, workInProgress2, renderLanes2, false), JSCompiler_object_inline_digest_2724 = (renderLanes2 & current2.childLanes) !== 0, didReceiveUpdate || JSCompiler_object_inline_digest_2724) {
            JSCompiler_object_inline_digest_2724 = workInProgressRoot;
            if (JSCompiler_object_inline_digest_2724 !== null && (JSCompiler_object_inline_stack_2725 = getBumpedLaneForHydration(JSCompiler_object_inline_digest_2724, renderLanes2), JSCompiler_object_inline_stack_2725 !== 0 && JSCompiler_object_inline_stack_2725 !== prevState.retryLane))
              throw prevState.retryLane = JSCompiler_object_inline_stack_2725, enqueueConcurrentRenderForLane(current2, JSCompiler_object_inline_stack_2725), scheduleUpdateOnFiber(JSCompiler_object_inline_digest_2724, current2, JSCompiler_object_inline_stack_2725), SelectiveHydrationException;
            isSuspenseInstancePending(JSCompiler_object_inline_componentStack_2726) || renderDidSuspendDelayIfPossible();
            workInProgress2 = retrySuspenseComponentWithoutHydrating(current2, workInProgress2, renderLanes2);
          } else
            isSuspenseInstancePending(JSCompiler_object_inline_componentStack_2726) ? (workInProgress2.flags |= 192, workInProgress2.child = current2.child, workInProgress2 = null) : (current2 = prevState.treeContext, nextHydratableInstance = getNextHydratable(JSCompiler_object_inline_componentStack_2726.nextSibling), hydrationParentFiber = workInProgress2, isHydrating = true, hydrationErrors = null, didSuspendOrErrorDEV = false, hydrationDiffRootDEV = null, rootOrSingletonContext = false, current2 !== null && restoreSuspendedTreeContext(workInProgress2, current2), workInProgress2 = mountSuspensePrimaryChildren(workInProgress2, JSCompiler_object_inline_stack_2725.children), workInProgress2.flags |= 4096);
          return workInProgress2;
        }
      }
      if (JSCompiler_object_inline_message_2723)
        return reuseSuspenseHandlerOnStack(workInProgress2), nextPrimaryChildren = JSCompiler_object_inline_stack_2725.fallback, mode = workInProgress2.mode, componentStack = current2.child, JSCompiler_object_inline_componentStack_2726 = componentStack.sibling, JSCompiler_object_inline_stack_2725 = createWorkInProgress(componentStack, {
          mode: "hidden",
          children: JSCompiler_object_inline_stack_2725.children
        }), JSCompiler_object_inline_stack_2725.subtreeFlags = componentStack.subtreeFlags & 65011712, JSCompiler_object_inline_componentStack_2726 !== null ? nextPrimaryChildren = createWorkInProgress(JSCompiler_object_inline_componentStack_2726, nextPrimaryChildren) : (nextPrimaryChildren = createFiberFromFragment(nextPrimaryChildren, mode, renderLanes2, null), nextPrimaryChildren.flags |= 2), nextPrimaryChildren.return = workInProgress2, JSCompiler_object_inline_stack_2725.return = workInProgress2, JSCompiler_object_inline_stack_2725.sibling = nextPrimaryChildren, workInProgress2.child = JSCompiler_object_inline_stack_2725, bailoutOffscreenComponent(null, JSCompiler_object_inline_stack_2725), JSCompiler_object_inline_stack_2725 = workInProgress2.child, nextPrimaryChildren = current2.child.memoizedState, nextPrimaryChildren === null ? nextPrimaryChildren = mountSuspenseOffscreenState(renderLanes2) : (mode = nextPrimaryChildren.cachePool, mode !== null ? (componentStack = CacheContext._currentValue, mode = mode.parent !== componentStack ? { parent: componentStack, pool: componentStack } : mode) : mode = getSuspendedCache(), nextPrimaryChildren = {
          baseLanes: nextPrimaryChildren.baseLanes | renderLanes2,
          cachePool: mode
        }), JSCompiler_object_inline_stack_2725.memoizedState = nextPrimaryChildren, JSCompiler_object_inline_stack_2725.childLanes = getRemainingWorkInPrimaryTree(current2, JSCompiler_object_inline_digest_2724, renderLanes2), workInProgress2.memoizedState = SUSPENDED_MARKER, bailoutOffscreenComponent(current2.child, JSCompiler_object_inline_stack_2725);
      prevState !== null && (renderLanes2 & 62914560) === renderLanes2 && (renderLanes2 & current2.lanes) !== 0 && markRenderDerivedCause(workInProgress2);
      pushPrimaryTreeSuspenseHandler(workInProgress2);
      renderLanes2 = current2.child;
      current2 = renderLanes2.sibling;
      renderLanes2 = createWorkInProgress(renderLanes2, {
        mode: "visible",
        children: JSCompiler_object_inline_stack_2725.children
      });
      renderLanes2.return = workInProgress2;
      renderLanes2.sibling = null;
      current2 !== null && (JSCompiler_object_inline_digest_2724 = workInProgress2.deletions, JSCompiler_object_inline_digest_2724 === null ? (workInProgress2.deletions = [current2], workInProgress2.flags |= 16) : JSCompiler_object_inline_digest_2724.push(current2));
      workInProgress2.child = renderLanes2;
      workInProgress2.memoizedState = null;
      return renderLanes2;
    }
    function mountSuspensePrimaryChildren(workInProgress2, primaryChildren) {
      primaryChildren = mountWorkInProgressOffscreenFiber({ mode: "visible", children: primaryChildren }, workInProgress2.mode);
      primaryChildren.return = workInProgress2;
      return workInProgress2.child = primaryChildren;
    }
    function mountWorkInProgressOffscreenFiber(offscreenProps, mode) {
      offscreenProps = createFiber(22, offscreenProps, null, mode);
      offscreenProps.lanes = 0;
      return offscreenProps;
    }
    function retrySuspenseComponentWithoutHydrating(current2, workInProgress2, renderLanes2) {
      reconcileChildFibers(workInProgress2, current2.child, null, renderLanes2);
      current2 = mountSuspensePrimaryChildren(workInProgress2, workInProgress2.pendingProps.children);
      current2.flags |= 2;
      workInProgress2.memoizedState = null;
      return current2;
    }
    function scheduleSuspenseWorkOnFiber(fiber, renderLanes2, propagationRoot) {
      fiber.lanes |= renderLanes2;
      var alternate = fiber.alternate;
      alternate !== null && (alternate.lanes |= renderLanes2);
      scheduleContextWorkOnParentPath(fiber.return, renderLanes2, propagationRoot);
    }
    function initSuspenseListRenderState(workInProgress2, isBackwards, tail, lastContentRow, tailMode, treeForkCount2) {
      var renderState = workInProgress2.memoizedState;
      renderState === null ? workInProgress2.memoizedState = {
        isBackwards,
        rendering: null,
        renderingStartTime: 0,
        last: lastContentRow,
        tail,
        tailMode,
        treeForkCount: treeForkCount2
      } : (renderState.isBackwards = isBackwards, renderState.rendering = null, renderState.renderingStartTime = 0, renderState.last = lastContentRow, renderState.tail = tail, renderState.tailMode = tailMode, renderState.treeForkCount = treeForkCount2);
    }
    function updateSuspenseListComponent(current2, workInProgress2, renderLanes2) {
      var nextProps = workInProgress2.pendingProps, revealOrder = nextProps.revealOrder, tailMode = nextProps.tail, newChildren = nextProps.children, suspenseContext = suspenseStackCursor.current;
      (nextProps = (suspenseContext & ForceSuspenseFallback) !== 0) ? (suspenseContext = suspenseContext & SubtreeSuspenseContextMask | ForceSuspenseFallback, workInProgress2.flags |= 128) : suspenseContext &= SubtreeSuspenseContextMask;
      push(suspenseStackCursor, suspenseContext, workInProgress2);
      suspenseContext = revealOrder == null ? "null" : revealOrder;
      if (revealOrder !== "forwards" && revealOrder !== "unstable_legacy-backwards" && revealOrder !== "together" && revealOrder !== "independent" && !didWarnAboutRevealOrder[suspenseContext])
        if (didWarnAboutRevealOrder[suspenseContext] = true, revealOrder == null)
          console.error('The default for the <SuspenseList revealOrder="..."> prop is changing. To be future compatible you must explictly specify either "independent" (the current default), "together", "forwards" or "legacy_unstable-backwards".');
        else if (revealOrder === "backwards")
          console.error('The rendering order of <SuspenseList revealOrder="backwards"> is changing. To be future compatible you must specify revealOrder="legacy_unstable-backwards" instead.');
        else if (typeof revealOrder === "string")
          switch (revealOrder.toLowerCase()) {
            case "together":
            case "forwards":
            case "backwards":
            case "independent":
              console.error('"%s" is not a valid value for revealOrder on <SuspenseList />. Use lowercase "%s" instead.', revealOrder, revealOrder.toLowerCase());
              break;
            case "forward":
            case "backward":
              console.error('"%s" is not a valid value for revealOrder on <SuspenseList />. React uses the -s suffix in the spelling. Use "%ss" instead.', revealOrder, revealOrder.toLowerCase());
              break;
            default:
              console.error('"%s" is not a supported revealOrder on <SuspenseList />. Did you mean "independent", "together", "forwards" or "backwards"?', revealOrder);
          }
        else
          console.error('%s is not a supported value for revealOrder on <SuspenseList />. Did you mean "independent", "together", "forwards" or "backwards"?', revealOrder);
      suspenseContext = tailMode == null ? "null" : tailMode;
      if (!didWarnAboutTailOptions[suspenseContext])
        if (tailMode == null) {
          if (revealOrder === "forwards" || revealOrder === "backwards" || revealOrder === "unstable_legacy-backwards")
            didWarnAboutTailOptions[suspenseContext] = true, console.error('The default for the <SuspenseList tail="..."> prop is changing. To be future compatible you must explictly specify either "visible" (the current default), "collapsed" or "hidden".');
        } else
          tailMode !== "visible" && tailMode !== "collapsed" && tailMode !== "hidden" ? (didWarnAboutTailOptions[suspenseContext] = true, console.error('"%s" is not a supported value for tail on <SuspenseList />. Did you mean "visible", "collapsed" or "hidden"?', tailMode)) : revealOrder !== "forwards" && revealOrder !== "backwards" && revealOrder !== "unstable_legacy-backwards" && (didWarnAboutTailOptions[suspenseContext] = true, console.error('<SuspenseList tail="%s" /> is only valid if revealOrder is "forwards" or "backwards". Did you mean to specify revealOrder="forwards"?', tailMode));
      a:
        if ((revealOrder === "forwards" || revealOrder === "backwards" || revealOrder === "unstable_legacy-backwards") && newChildren !== undefined && newChildren !== null && newChildren !== false)
          if (isArrayImpl(newChildren))
            for (suspenseContext = 0;suspenseContext < newChildren.length; suspenseContext++) {
              if (!validateSuspenseListNestedChild(newChildren[suspenseContext], suspenseContext))
                break a;
            }
          else if (suspenseContext = getIteratorFn(newChildren), typeof suspenseContext === "function") {
            if (suspenseContext = suspenseContext.call(newChildren))
              for (var step = suspenseContext.next(), _i = 0;!step.done; step = suspenseContext.next()) {
                if (!validateSuspenseListNestedChild(step.value, _i))
                  break a;
                _i++;
              }
          } else
            console.error('A single row was passed to a <SuspenseList revealOrder="%s" />. This is not useful since it needs multiple rows. Did you mean to pass multiple children or an array?', revealOrder);
      reconcileChildren(current2, workInProgress2, newChildren, renderLanes2);
      isHydrating ? (warnIfNotHydrating(), newChildren = treeForkCount) : newChildren = 0;
      if (!nextProps && current2 !== null && (current2.flags & 128) !== 0)
        a:
          for (current2 = workInProgress2.child;current2 !== null; ) {
            if (current2.tag === 13)
              current2.memoizedState !== null && scheduleSuspenseWorkOnFiber(current2, renderLanes2, workInProgress2);
            else if (current2.tag === 19)
              scheduleSuspenseWorkOnFiber(current2, renderLanes2, workInProgress2);
            else if (current2.child !== null) {
              current2.child.return = current2;
              current2 = current2.child;
              continue;
            }
            if (current2 === workInProgress2)
              break a;
            for (;current2.sibling === null; ) {
              if (current2.return === null || current2.return === workInProgress2)
                break a;
              current2 = current2.return;
            }
            current2.sibling.return = current2.return;
            current2 = current2.sibling;
          }
      switch (revealOrder) {
        case "forwards":
          renderLanes2 = workInProgress2.child;
          for (revealOrder = null;renderLanes2 !== null; )
            current2 = renderLanes2.alternate, current2 !== null && findFirstSuspended(current2) === null && (revealOrder = renderLanes2), renderLanes2 = renderLanes2.sibling;
          renderLanes2 = revealOrder;
          renderLanes2 === null ? (revealOrder = workInProgress2.child, workInProgress2.child = null) : (revealOrder = renderLanes2.sibling, renderLanes2.sibling = null);
          initSuspenseListRenderState(workInProgress2, false, revealOrder, renderLanes2, tailMode, newChildren);
          break;
        case "backwards":
        case "unstable_legacy-backwards":
          renderLanes2 = null;
          revealOrder = workInProgress2.child;
          for (workInProgress2.child = null;revealOrder !== null; ) {
            current2 = revealOrder.alternate;
            if (current2 !== null && findFirstSuspended(current2) === null) {
              workInProgress2.child = revealOrder;
              break;
            }
            current2 = revealOrder.sibling;
            revealOrder.sibling = renderLanes2;
            renderLanes2 = revealOrder;
            revealOrder = current2;
          }
          initSuspenseListRenderState(workInProgress2, true, renderLanes2, null, tailMode, newChildren);
          break;
        case "together":
          initSuspenseListRenderState(workInProgress2, false, null, null, undefined, newChildren);
          break;
        default:
          workInProgress2.memoizedState = null;
      }
      return workInProgress2.child;
    }
    function bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2) {
      current2 !== null && (workInProgress2.dependencies = current2.dependencies);
      profilerStartTime = -1;
      workInProgressRootSkippedLanes |= workInProgress2.lanes;
      if ((renderLanes2 & workInProgress2.childLanes) === 0)
        if (current2 !== null) {
          if (propagateParentContextChanges(current2, workInProgress2, renderLanes2, false), (renderLanes2 & workInProgress2.childLanes) === 0)
            return null;
        } else
          return null;
      if (current2 !== null && workInProgress2.child !== current2.child)
        throw Error("Resuming work not yet implemented.");
      if (workInProgress2.child !== null) {
        current2 = workInProgress2.child;
        renderLanes2 = createWorkInProgress(current2, current2.pendingProps);
        workInProgress2.child = renderLanes2;
        for (renderLanes2.return = workInProgress2;current2.sibling !== null; )
          current2 = current2.sibling, renderLanes2 = renderLanes2.sibling = createWorkInProgress(current2, current2.pendingProps), renderLanes2.return = workInProgress2;
        renderLanes2.sibling = null;
      }
      return workInProgress2.child;
    }
    function checkScheduledUpdateOrContext(current2, renderLanes2) {
      if ((current2.lanes & renderLanes2) !== 0)
        return true;
      current2 = current2.dependencies;
      return current2 !== null && checkIfContextChanged(current2) ? true : false;
    }
    function attemptEarlyBailoutIfNoScheduledUpdate(current2, workInProgress2, renderLanes2) {
      switch (workInProgress2.tag) {
        case 3:
          pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
          pushProvider(workInProgress2, CacheContext, current2.memoizedState.cache);
          resetHydrationState();
          break;
        case 27:
        case 5:
          pushHostContext(workInProgress2);
          break;
        case 4:
          pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
          break;
        case 10:
          pushProvider(workInProgress2, workInProgress2.type, workInProgress2.memoizedProps.value);
          break;
        case 12:
          (renderLanes2 & workInProgress2.childLanes) !== 0 && (workInProgress2.flags |= 4);
          workInProgress2.flags |= 2048;
          var stateNode = workInProgress2.stateNode;
          stateNode.effectDuration = -0;
          stateNode.passiveEffectDuration = -0;
          break;
        case 31:
          if (workInProgress2.memoizedState !== null)
            return workInProgress2.flags |= 128, pushDehydratedActivitySuspenseHandler(workInProgress2), null;
          break;
        case 13:
          stateNode = workInProgress2.memoizedState;
          if (stateNode !== null) {
            if (stateNode.dehydrated !== null)
              return pushPrimaryTreeSuspenseHandler(workInProgress2), workInProgress2.flags |= 128, null;
            if ((renderLanes2 & workInProgress2.child.childLanes) !== 0)
              return updateSuspenseComponent(current2, workInProgress2, renderLanes2);
            pushPrimaryTreeSuspenseHandler(workInProgress2);
            current2 = bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
            return current2 !== null ? current2.sibling : null;
          }
          pushPrimaryTreeSuspenseHandler(workInProgress2);
          break;
        case 19:
          var didSuspendBefore = (current2.flags & 128) !== 0;
          stateNode = (renderLanes2 & workInProgress2.childLanes) !== 0;
          stateNode || (propagateParentContextChanges(current2, workInProgress2, renderLanes2, false), stateNode = (renderLanes2 & workInProgress2.childLanes) !== 0);
          if (didSuspendBefore) {
            if (stateNode)
              return updateSuspenseListComponent(current2, workInProgress2, renderLanes2);
            workInProgress2.flags |= 128;
          }
          didSuspendBefore = workInProgress2.memoizedState;
          didSuspendBefore !== null && (didSuspendBefore.rendering = null, didSuspendBefore.tail = null, didSuspendBefore.lastEffect = null);
          push(suspenseStackCursor, suspenseStackCursor.current, workInProgress2);
          if (stateNode)
            break;
          else
            return null;
        case 22:
          return workInProgress2.lanes = 0, updateOffscreenComponent(current2, workInProgress2, renderLanes2, workInProgress2.pendingProps);
        case 24:
          pushProvider(workInProgress2, CacheContext, current2.memoizedState.cache);
      }
      return bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
    }
    function beginWork(current2, workInProgress2, renderLanes2) {
      if (workInProgress2._debugNeedsRemount && current2 !== null) {
        renderLanes2 = createFiberFromTypeAndProps(workInProgress2.type, workInProgress2.key, workInProgress2.pendingProps, workInProgress2._debugOwner || null, workInProgress2.mode, workInProgress2.lanes);
        renderLanes2._debugStack = workInProgress2._debugStack;
        renderLanes2._debugTask = workInProgress2._debugTask;
        var returnFiber = workInProgress2.return;
        if (returnFiber === null)
          throw Error("Cannot swap the root fiber.");
        current2.alternate = null;
        workInProgress2.alternate = null;
        renderLanes2.index = workInProgress2.index;
        renderLanes2.sibling = workInProgress2.sibling;
        renderLanes2.return = workInProgress2.return;
        renderLanes2.ref = workInProgress2.ref;
        renderLanes2._debugInfo = workInProgress2._debugInfo;
        if (workInProgress2 === returnFiber.child)
          returnFiber.child = renderLanes2;
        else {
          var prevSibling = returnFiber.child;
          if (prevSibling === null)
            throw Error("Expected parent to have a child.");
          for (;prevSibling.sibling !== workInProgress2; )
            if (prevSibling = prevSibling.sibling, prevSibling === null)
              throw Error("Expected to find the previous sibling.");
          prevSibling.sibling = renderLanes2;
        }
        workInProgress2 = returnFiber.deletions;
        workInProgress2 === null ? (returnFiber.deletions = [current2], returnFiber.flags |= 16) : workInProgress2.push(current2);
        renderLanes2.flags |= 2;
        return renderLanes2;
      }
      if (current2 !== null)
        if (current2.memoizedProps !== workInProgress2.pendingProps || workInProgress2.type !== current2.type)
          didReceiveUpdate = true;
        else {
          if (!checkScheduledUpdateOrContext(current2, renderLanes2) && (workInProgress2.flags & 128) === 0)
            return didReceiveUpdate = false, attemptEarlyBailoutIfNoScheduledUpdate(current2, workInProgress2, renderLanes2);
          didReceiveUpdate = (current2.flags & 131072) !== 0 ? true : false;
        }
      else {
        didReceiveUpdate = false;
        if (returnFiber = isHydrating)
          warnIfNotHydrating(), returnFiber = (workInProgress2.flags & 1048576) !== 0;
        returnFiber && (returnFiber = workInProgress2.index, warnIfNotHydrating(), pushTreeId(workInProgress2, treeForkCount, returnFiber));
      }
      workInProgress2.lanes = 0;
      switch (workInProgress2.tag) {
        case 16:
          a:
            if (returnFiber = workInProgress2.pendingProps, current2 = resolveLazy(workInProgress2.elementType), workInProgress2.type = current2, typeof current2 === "function")
              shouldConstruct(current2) ? (returnFiber = resolveClassComponentProps(current2, returnFiber), workInProgress2.tag = 1, workInProgress2.type = current2 = resolveFunctionForHotReloading(current2), workInProgress2 = updateClassComponent(null, workInProgress2, current2, returnFiber, renderLanes2)) : (workInProgress2.tag = 0, validateFunctionComponentInDev(workInProgress2, current2), workInProgress2.type = current2 = resolveFunctionForHotReloading(current2), workInProgress2 = updateFunctionComponent(null, workInProgress2, current2, returnFiber, renderLanes2));
            else {
              if (current2 !== undefined && current2 !== null) {
                if (prevSibling = current2.$$typeof, prevSibling === REACT_FORWARD_REF_TYPE) {
                  workInProgress2.tag = 11;
                  workInProgress2.type = current2 = resolveForwardRefForHotReloading(current2);
                  workInProgress2 = updateForwardRef(null, workInProgress2, current2, returnFiber, renderLanes2);
                  break a;
                } else if (prevSibling === REACT_MEMO_TYPE) {
                  workInProgress2.tag = 14;
                  workInProgress2 = updateMemoComponent(null, workInProgress2, current2, returnFiber, renderLanes2);
                  break a;
                }
              }
              workInProgress2 = "";
              current2 !== null && typeof current2 === "object" && current2.$$typeof === REACT_LAZY_TYPE && (workInProgress2 = " Did you wrap a component in React.lazy() more than once?");
              renderLanes2 = getComponentNameFromType(current2) || current2;
              throw Error("Element type is invalid. Received a promise that resolves to: " + renderLanes2 + ". Lazy element type must resolve to a class or function." + workInProgress2);
            }
          return workInProgress2;
        case 0:
          return updateFunctionComponent(current2, workInProgress2, workInProgress2.type, workInProgress2.pendingProps, renderLanes2);
        case 1:
          return returnFiber = workInProgress2.type, prevSibling = resolveClassComponentProps(returnFiber, workInProgress2.pendingProps), updateClassComponent(current2, workInProgress2, returnFiber, prevSibling, renderLanes2);
        case 3:
          a: {
            pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo);
            if (current2 === null)
              throw Error("Should have a current fiber. This is a bug in React.");
            returnFiber = workInProgress2.pendingProps;
            var prevState = workInProgress2.memoizedState;
            prevSibling = prevState.element;
            cloneUpdateQueue(current2, workInProgress2);
            processUpdateQueue(workInProgress2, returnFiber, null, renderLanes2);
            var nextState = workInProgress2.memoizedState;
            returnFiber = nextState.cache;
            pushProvider(workInProgress2, CacheContext, returnFiber);
            returnFiber !== prevState.cache && propagateContextChanges(workInProgress2, [CacheContext], renderLanes2, true);
            suspendIfUpdateReadFromEntangledAsyncAction();
            returnFiber = nextState.element;
            if (prevState.isDehydrated)
              if (prevState = {
                element: returnFiber,
                isDehydrated: false,
                cache: nextState.cache
              }, workInProgress2.updateQueue.baseState = prevState, workInProgress2.memoizedState = prevState, workInProgress2.flags & 256) {
                workInProgress2 = mountHostRootWithoutHydrating(current2, workInProgress2, returnFiber, renderLanes2);
                break a;
              } else if (returnFiber !== prevSibling) {
                prevSibling = createCapturedValueAtFiber(Error("This root received an early update, before anything was able hydrate. Switched the entire root to client rendering."), workInProgress2);
                queueHydrationError(prevSibling);
                workInProgress2 = mountHostRootWithoutHydrating(current2, workInProgress2, returnFiber, renderLanes2);
                break a;
              } else {
                current2 = workInProgress2.stateNode.containerInfo;
                switch (current2.nodeType) {
                  case 9:
                    current2 = current2.body;
                    break;
                  default:
                    current2 = current2.nodeName === "HTML" ? current2.ownerDocument.body : current2;
                }
                nextHydratableInstance = getNextHydratable(current2.firstChild);
                hydrationParentFiber = workInProgress2;
                isHydrating = true;
                hydrationErrors = null;
                didSuspendOrErrorDEV = false;
                hydrationDiffRootDEV = null;
                rootOrSingletonContext = true;
                renderLanes2 = mountChildFibers(workInProgress2, null, returnFiber, renderLanes2);
                for (workInProgress2.child = renderLanes2;renderLanes2; )
                  renderLanes2.flags = renderLanes2.flags & -3 | 4096, renderLanes2 = renderLanes2.sibling;
              }
            else {
              resetHydrationState();
              if (returnFiber === prevSibling) {
                workInProgress2 = bailoutOnAlreadyFinishedWork(current2, workInProgress2, renderLanes2);
                break a;
              }
              reconcileChildren(current2, workInProgress2, returnFiber, renderLanes2);
            }
            workInProgress2 = workInProgress2.child;
          }
          return workInProgress2;
        case 26:
          return markRef(current2, workInProgress2), current2 === null ? (renderLanes2 = getResource(workInProgress2.type, null, workInProgress2.pendingProps, null)) ? workInProgress2.memoizedState = renderLanes2 : isHydrating || (renderLanes2 = workInProgress2.type, current2 = workInProgress2.pendingProps, returnFiber = requiredContext(rootInstanceStackCursor.current), returnFiber = getOwnerDocumentFromRootContainer(returnFiber).createElement(renderLanes2), returnFiber[internalInstanceKey] = workInProgress2, returnFiber[internalPropsKey] = current2, setInitialProperties(returnFiber, renderLanes2, current2), markNodeAsHoistable(returnFiber), workInProgress2.stateNode = returnFiber) : workInProgress2.memoizedState = getResource(workInProgress2.type, current2.memoizedProps, workInProgress2.pendingProps, current2.memoizedState), null;
        case 27:
          return pushHostContext(workInProgress2), current2 === null && isHydrating && (returnFiber = requiredContext(rootInstanceStackCursor.current), prevSibling = getHostContext(), returnFiber = workInProgress2.stateNode = resolveSingletonInstance(workInProgress2.type, workInProgress2.pendingProps, returnFiber, prevSibling, false), didSuspendOrErrorDEV || (prevSibling = diffHydratedProperties(returnFiber, workInProgress2.type, workInProgress2.pendingProps, prevSibling), prevSibling !== null && (buildHydrationDiffNode(workInProgress2, 0).serverProps = prevSibling)), hydrationParentFiber = workInProgress2, rootOrSingletonContext = true, prevSibling = nextHydratableInstance, isSingletonScope(workInProgress2.type) ? (previousHydratableOnEnteringScopedSingleton = prevSibling, nextHydratableInstance = getNextHydratable(returnFiber.firstChild)) : nextHydratableInstance = prevSibling), reconcileChildren(current2, workInProgress2, workInProgress2.pendingProps.children, renderLanes2), markRef(current2, workInProgress2), current2 === null && (workInProgress2.flags |= 4194304), workInProgress2.child;
        case 5:
          return current2 === null && isHydrating && (prevState = getHostContext(), returnFiber = validateDOMNesting(workInProgress2.type, prevState.ancestorInfo), prevSibling = nextHydratableInstance, (nextState = !prevSibling) || (nextState = canHydrateInstance(prevSibling, workInProgress2.type, workInProgress2.pendingProps, rootOrSingletonContext), nextState !== null ? (workInProgress2.stateNode = nextState, didSuspendOrErrorDEV || (prevState = diffHydratedProperties(nextState, workInProgress2.type, workInProgress2.pendingProps, prevState), prevState !== null && (buildHydrationDiffNode(workInProgress2, 0).serverProps = prevState)), hydrationParentFiber = workInProgress2, nextHydratableInstance = getNextHydratable(nextState.firstChild), rootOrSingletonContext = false, prevState = true) : prevState = false, nextState = !prevState), nextState && (returnFiber && warnNonHydratedInstance(workInProgress2, prevSibling), throwOnHydrationMismatch(workInProgress2))), pushHostContext(workInProgress2), prevSibling = workInProgress2.type, prevState = workInProgress2.pendingProps, nextState = current2 !== null ? current2.memoizedProps : null, returnFiber = prevState.children, shouldSetTextContent(prevSibling, prevState) ? returnFiber = null : nextState !== null && shouldSetTextContent(prevSibling, nextState) && (workInProgress2.flags |= 32), workInProgress2.memoizedState !== null && (prevSibling = renderWithHooks(current2, workInProgress2, TransitionAwareHostComponent, null, null, renderLanes2), HostTransitionContext._currentValue = prevSibling), markRef(current2, workInProgress2), reconcileChildren(current2, workInProgress2, returnFiber, renderLanes2), workInProgress2.child;
        case 6:
          return current2 === null && isHydrating && (renderLanes2 = workInProgress2.pendingProps, current2 = getHostContext(), returnFiber = current2.ancestorInfo.current, renderLanes2 = returnFiber != null ? validateTextNesting(renderLanes2, returnFiber.tag, current2.ancestorInfo.implicitRootScope) : true, current2 = nextHydratableInstance, (returnFiber = !current2) || (returnFiber = canHydrateTextInstance(current2, workInProgress2.pendingProps, rootOrSingletonContext), returnFiber !== null ? (workInProgress2.stateNode = returnFiber, hydrationParentFiber = workInProgress2, nextHydratableInstance = null, returnFiber = true) : returnFiber = false, returnFiber = !returnFiber), returnFiber && (renderLanes2 && warnNonHydratedInstance(workInProgress2, current2), throwOnHydrationMismatch(workInProgress2))), null;
        case 13:
          return updateSuspenseComponent(current2, workInProgress2, renderLanes2);
        case 4:
          return pushHostContainer(workInProgress2, workInProgress2.stateNode.containerInfo), returnFiber = workInProgress2.pendingProps, current2 === null ? workInProgress2.child = reconcileChildFibers(workInProgress2, null, returnFiber, renderLanes2) : reconcileChildren(current2, workInProgress2, returnFiber, renderLanes2), workInProgress2.child;
        case 11:
          return updateForwardRef(current2, workInProgress2, workInProgress2.type, workInProgress2.pendingProps, renderLanes2);
        case 7:
          return reconcileChildren(current2, workInProgress2, workInProgress2.pendingProps, renderLanes2), workInProgress2.child;
        case 8:
          return reconcileChildren(current2, workInProgress2, workInProgress2.pendingProps.children, renderLanes2), workInProgress2.child;
        case 12:
          return workInProgress2.flags |= 4, workInProgress2.flags |= 2048, returnFiber = workInProgress2.stateNode, returnFiber.effectDuration = -0, returnFiber.passiveEffectDuration = -0, reconcileChildren(current2, workInProgress2, workInProgress2.pendingProps.children, renderLanes2), workInProgress2.child;
        case 10:
          return returnFiber = workInProgress2.type, prevSibling = workInProgress2.pendingProps, prevState = prevSibling.value, "value" in prevSibling || hasWarnedAboutUsingNoValuePropOnContextProvider || (hasWarnedAboutUsingNoValuePropOnContextProvider = true, console.error("The `value` prop is required for the `<Context.Provider>`. Did you misspell it or forget to pass it?")), pushProvider(workInProgress2, returnFiber, prevState), reconcileChildren(current2, workInProgress2, prevSibling.children, renderLanes2), workInProgress2.child;
        case 9:
          return prevSibling = workInProgress2.type._context, returnFiber = workInProgress2.pendingProps.children, typeof returnFiber !== "function" && console.error("A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."), prepareToReadContext(workInProgress2), prevSibling = readContext(prevSibling), returnFiber = callComponentInDEV(returnFiber, prevSibling, undefined), workInProgress2.flags |= 1, reconcileChildren(current2, workInProgress2, returnFiber, renderLanes2), workInProgress2.child;
        case 14:
          return updateMemoComponent(current2, workInProgress2, workInProgress2.type, workInProgress2.pendingProps, renderLanes2);
        case 15:
          return updateSimpleMemoComponent(current2, workInProgress2, workInProgress2.type, workInProgress2.pendingProps, renderLanes2);
        case 19:
          return updateSuspenseListComponent(current2, workInProgress2, renderLanes2);
        case 31:
          return updateActivityComponent(current2, workInProgress2, renderLanes2);
        case 22:
          return updateOffscreenComponent(current2, workInProgress2, renderLanes2, workInProgress2.pendingProps);
        case 24:
          return prepareToReadContext(workInProgress2), returnFiber = readContext(CacheContext), current2 === null ? (prevSibling = peekCacheFromPool(), prevSibling === null && (prevSibling = workInProgressRoot, prevState = createCache(), prevSibling.pooledCache = prevState, retainCache(prevState), prevState !== null && (prevSibling.pooledCacheLanes |= renderLanes2), prevSibling = prevState), workInProgress2.memoizedState = {
            parent: returnFiber,
            cache: prevSibling
          }, initializeUpdateQueue(workInProgress2), pushProvider(workInProgress2, CacheContext, prevSibling)) : ((current2.lanes & renderLanes2) !== 0 && (cloneUpdateQueue(current2, workInProgress2), processUpdateQueue(workInProgress2, null, null, renderLanes2), suspendIfUpdateReadFromEntangledAsyncAction()), prevSibling = current2.memoizedState, prevState = workInProgress2.memoizedState, prevSibling.parent !== returnFiber ? (prevSibling = {
            parent: returnFiber,
            cache: returnFiber
          }, workInProgress2.memoizedState = prevSibling, workInProgress2.lanes === 0 && (workInProgress2.memoizedState = workInProgress2.updateQueue.baseState = prevSibling), pushProvider(workInProgress2, CacheContext, returnFiber)) : (returnFiber = prevState.cache, pushProvider(workInProgress2, CacheContext, returnFiber), returnFiber !== prevSibling.cache && propagateContextChanges(workInProgress2, [CacheContext], renderLanes2, true))), reconcileChildren(current2, workInProgress2, workInProgress2.pendingProps.children, renderLanes2), workInProgress2.child;
        case 29:
          throw workInProgress2.pendingProps;
      }
      throw Error("Unknown unit of work tag (" + workInProgress2.tag + "). This error is likely caused by a bug in React. Please file an issue.");
    }
    function markUpdate(workInProgress2) {
      workInProgress2.flags |= 4;
    }
    function preloadInstanceAndSuspendIfNeeded(workInProgress2, type, oldProps, newProps, renderLanes2) {
      if (type = (workInProgress2.mode & SuspenseyImagesMode) !== NoMode)
        type = false;
      if (type) {
        if (workInProgress2.flags |= 16777216, (renderLanes2 & 335544128) === renderLanes2)
          if (workInProgress2.stateNode.complete)
            workInProgress2.flags |= 8192;
          else if (shouldRemainOnPreviousScreen())
            workInProgress2.flags |= 8192;
          else
            throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
      } else
        workInProgress2.flags &= -16777217;
    }
    function preloadResourceAndSuspendIfNeeded(workInProgress2, resource) {
      if (resource.type !== "stylesheet" || (resource.state.loading & Inserted) !== NotLoaded)
        workInProgress2.flags &= -16777217;
      else if (workInProgress2.flags |= 16777216, !preloadResource(resource))
        if (shouldRemainOnPreviousScreen())
          workInProgress2.flags |= 8192;
        else
          throw suspendedThenable = noopSuspenseyCommitThenable, SuspenseyCommitException;
    }
    function scheduleRetryEffect(workInProgress2, retryQueue) {
      retryQueue !== null && (workInProgress2.flags |= 4);
      workInProgress2.flags & 16384 && (retryQueue = workInProgress2.tag !== 22 ? claimNextRetryLane() : 536870912, workInProgress2.lanes |= retryQueue, workInProgressSuspendedRetryLanes |= retryQueue);
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
            for (var _lastTailNode = null;lastTailNode !== null; )
              lastTailNode.alternate !== null && (_lastTailNode = lastTailNode), lastTailNode = lastTailNode.sibling;
            _lastTailNode === null ? hasRenderedATailFallback || renderState.tail === null ? renderState.tail = null : renderState.tail.sibling = null : _lastTailNode.sibling = null;
        }
    }
    function bubbleProperties(completedWork) {
      var didBailout = completedWork.alternate !== null && completedWork.alternate.child === completedWork.child, newChildLanes = 0, subtreeFlags = 0;
      if (didBailout)
        if ((completedWork.mode & ProfileMode) !== NoMode) {
          for (var { selfBaseDuration: _treeBaseDuration, child: _child2 } = completedWork;_child2 !== null; )
            newChildLanes |= _child2.lanes | _child2.childLanes, subtreeFlags |= _child2.subtreeFlags & 65011712, subtreeFlags |= _child2.flags & 65011712, _treeBaseDuration += _child2.treeBaseDuration, _child2 = _child2.sibling;
          completedWork.treeBaseDuration = _treeBaseDuration;
        } else
          for (_treeBaseDuration = completedWork.child;_treeBaseDuration !== null; )
            newChildLanes |= _treeBaseDuration.lanes | _treeBaseDuration.childLanes, subtreeFlags |= _treeBaseDuration.subtreeFlags & 65011712, subtreeFlags |= _treeBaseDuration.flags & 65011712, _treeBaseDuration.return = completedWork, _treeBaseDuration = _treeBaseDuration.sibling;
      else if ((completedWork.mode & ProfileMode) !== NoMode) {
        _treeBaseDuration = completedWork.actualDuration;
        _child2 = completedWork.selfBaseDuration;
        for (var child = completedWork.child;child !== null; )
          newChildLanes |= child.lanes | child.childLanes, subtreeFlags |= child.subtreeFlags, subtreeFlags |= child.flags, _treeBaseDuration += child.actualDuration, _child2 += child.treeBaseDuration, child = child.sibling;
        completedWork.actualDuration = _treeBaseDuration;
        completedWork.treeBaseDuration = _child2;
      } else
        for (_treeBaseDuration = completedWork.child;_treeBaseDuration !== null; )
          newChildLanes |= _treeBaseDuration.lanes | _treeBaseDuration.childLanes, subtreeFlags |= _treeBaseDuration.subtreeFlags, subtreeFlags |= _treeBaseDuration.flags, _treeBaseDuration.return = completedWork, _treeBaseDuration = _treeBaseDuration.sibling;
      completedWork.subtreeFlags |= subtreeFlags;
      completedWork.childLanes = newChildLanes;
      return didBailout;
    }
    function completeWork(current2, workInProgress2, renderLanes2) {
      var newProps = workInProgress2.pendingProps;
      popTreeContext(workInProgress2);
      switch (workInProgress2.tag) {
        case 16:
        case 15:
        case 0:
        case 11:
        case 7:
        case 8:
        case 12:
        case 9:
        case 14:
          return bubbleProperties(workInProgress2), null;
        case 1:
          return bubbleProperties(workInProgress2), null;
        case 3:
          renderLanes2 = workInProgress2.stateNode;
          newProps = null;
          current2 !== null && (newProps = current2.memoizedState.cache);
          workInProgress2.memoizedState.cache !== newProps && (workInProgress2.flags |= 2048);
          popProvider(CacheContext, workInProgress2);
          popHostContainer(workInProgress2);
          renderLanes2.pendingContext && (renderLanes2.context = renderLanes2.pendingContext, renderLanes2.pendingContext = null);
          if (current2 === null || current2.child === null)
            popHydrationState(workInProgress2) ? (emitPendingHydrationWarnings(), markUpdate(workInProgress2)) : current2 === null || current2.memoizedState.isDehydrated && (workInProgress2.flags & 256) === 0 || (workInProgress2.flags |= 1024, upgradeHydrationErrorsToRecoverable());
          bubbleProperties(workInProgress2);
          return null;
        case 26:
          var { type, memoizedState: nextResource } = workInProgress2;
          current2 === null ? (markUpdate(workInProgress2), nextResource !== null ? (bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(workInProgress2, type, null, newProps, renderLanes2))) : nextResource ? nextResource !== current2.memoizedState ? (markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadResourceAndSuspendIfNeeded(workInProgress2, nextResource)) : (bubbleProperties(workInProgress2), workInProgress2.flags &= -16777217) : (current2 = current2.memoizedProps, current2 !== newProps && markUpdate(workInProgress2), bubbleProperties(workInProgress2), preloadInstanceAndSuspendIfNeeded(workInProgress2, type, current2, newProps, renderLanes2));
          return null;
        case 27:
          popHostContext(workInProgress2);
          renderLanes2 = requiredContext(rootInstanceStackCursor.current);
          type = workInProgress2.type;
          if (current2 !== null && workInProgress2.stateNode != null)
            current2.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if (!newProps) {
              if (workInProgress2.stateNode === null)
                throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
              bubbleProperties(workInProgress2);
              return null;
            }
            current2 = getHostContext();
            popHydrationState(workInProgress2) ? prepareToHydrateHostInstance(workInProgress2, current2) : (current2 = resolveSingletonInstance(type, newProps, renderLanes2, current2, true), workInProgress2.stateNode = current2, markUpdate(workInProgress2));
          }
          bubbleProperties(workInProgress2);
          return null;
        case 5:
          popHostContext(workInProgress2);
          type = workInProgress2.type;
          if (current2 !== null && workInProgress2.stateNode != null)
            current2.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if (!newProps) {
              if (workInProgress2.stateNode === null)
                throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
              bubbleProperties(workInProgress2);
              return null;
            }
            var _currentHostContext = getHostContext();
            if (popHydrationState(workInProgress2))
              prepareToHydrateHostInstance(workInProgress2, _currentHostContext);
            else {
              nextResource = requiredContext(rootInstanceStackCursor.current);
              validateDOMNesting(type, _currentHostContext.ancestorInfo);
              _currentHostContext = _currentHostContext.context;
              nextResource = getOwnerDocumentFromRootContainer(nextResource);
              switch (_currentHostContext) {
                case HostContextNamespaceSvg:
                  nextResource = nextResource.createElementNS(SVG_NAMESPACE, type);
                  break;
                case HostContextNamespaceMath:
                  nextResource = nextResource.createElementNS(MATH_NAMESPACE, type);
                  break;
                default:
                  switch (type) {
                    case "svg":
                      nextResource = nextResource.createElementNS(SVG_NAMESPACE, type);
                      break;
                    case "math":
                      nextResource = nextResource.createElementNS(MATH_NAMESPACE, type);
                      break;
                    case "script":
                      nextResource = nextResource.createElement("div");
                      nextResource.innerHTML = "<script></script>";
                      nextResource = nextResource.removeChild(nextResource.firstChild);
                      break;
                    case "select":
                      nextResource = typeof newProps.is === "string" ? nextResource.createElement("select", {
                        is: newProps.is
                      }) : nextResource.createElement("select");
                      newProps.multiple ? nextResource.multiple = true : newProps.size && (nextResource.size = newProps.size);
                      break;
                    default:
                      nextResource = typeof newProps.is === "string" ? nextResource.createElement(type, {
                        is: newProps.is
                      }) : nextResource.createElement(type), type.indexOf("-") === -1 && (type !== type.toLowerCase() && console.error("<%s /> is using incorrect casing. Use PascalCase for React components, or lowercase for HTML elements.", type), Object.prototype.toString.call(nextResource) !== "[object HTMLUnknownElement]" || hasOwnProperty.call(warnedUnknownTags, type) || (warnedUnknownTags[type] = true, console.error("The tag <%s> is unrecognized in this browser. If you meant to render a React component, start its name with an uppercase letter.", type)));
                  }
              }
              nextResource[internalInstanceKey] = workInProgress2;
              nextResource[internalPropsKey] = newProps;
              a:
                for (_currentHostContext = workInProgress2.child;_currentHostContext !== null; ) {
                  if (_currentHostContext.tag === 5 || _currentHostContext.tag === 6)
                    nextResource.appendChild(_currentHostContext.stateNode);
                  else if (_currentHostContext.tag !== 4 && _currentHostContext.tag !== 27 && _currentHostContext.child !== null) {
                    _currentHostContext.child.return = _currentHostContext;
                    _currentHostContext = _currentHostContext.child;
                    continue;
                  }
                  if (_currentHostContext === workInProgress2)
                    break a;
                  for (;_currentHostContext.sibling === null; ) {
                    if (_currentHostContext.return === null || _currentHostContext.return === workInProgress2)
                      break a;
                    _currentHostContext = _currentHostContext.return;
                  }
                  _currentHostContext.sibling.return = _currentHostContext.return;
                  _currentHostContext = _currentHostContext.sibling;
                }
              workInProgress2.stateNode = nextResource;
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
              newProps && markUpdate(workInProgress2);
            }
          }
          bubbleProperties(workInProgress2);
          preloadInstanceAndSuspendIfNeeded(workInProgress2, workInProgress2.type, current2 === null ? null : current2.memoizedProps, workInProgress2.pendingProps, renderLanes2);
          return null;
        case 6:
          if (current2 && workInProgress2.stateNode != null)
            current2.memoizedProps !== newProps && markUpdate(workInProgress2);
          else {
            if (typeof newProps !== "string" && workInProgress2.stateNode === null)
              throw Error("We must have new props for new mounts. This error is likely caused by a bug in React. Please file an issue.");
            current2 = requiredContext(rootInstanceStackCursor.current);
            renderLanes2 = getHostContext();
            if (popHydrationState(workInProgress2)) {
              current2 = workInProgress2.stateNode;
              renderLanes2 = workInProgress2.memoizedProps;
              type = !didSuspendOrErrorDEV;
              newProps = null;
              nextResource = hydrationParentFiber;
              if (nextResource !== null)
                switch (nextResource.tag) {
                  case 3:
                    type && (type = diffHydratedTextForDevWarnings(current2, renderLanes2, newProps), type !== null && (buildHydrationDiffNode(workInProgress2, 0).serverProps = type));
                    break;
                  case 27:
                  case 5:
                    newProps = nextResource.memoizedProps, type && (type = diffHydratedTextForDevWarnings(current2, renderLanes2, newProps), type !== null && (buildHydrationDiffNode(workInProgress2, 0).serverProps = type));
                }
              current2[internalInstanceKey] = workInProgress2;
              current2 = current2.nodeValue === renderLanes2 || newProps !== null && newProps.suppressHydrationWarning === true || checkForUnmatchedText(current2.nodeValue, renderLanes2) ? true : false;
              current2 || throwOnHydrationMismatch(workInProgress2, true);
            } else
              type = renderLanes2.ancestorInfo.current, type != null && validateTextNesting(newProps, type.tag, renderLanes2.ancestorInfo.implicitRootScope), current2 = getOwnerDocumentFromRootContainer(current2).createTextNode(newProps), current2[internalInstanceKey] = workInProgress2, workInProgress2.stateNode = current2;
          }
          bubbleProperties(workInProgress2);
          return null;
        case 31:
          renderLanes2 = workInProgress2.memoizedState;
          if (current2 === null || current2.memoizedState !== null) {
            newProps = popHydrationState(workInProgress2);
            if (renderLanes2 !== null) {
              if (current2 === null) {
                if (!newProps)
                  throw Error("A dehydrated suspense component was completed without a hydrated node. This is probably a bug in React.");
                current2 = workInProgress2.memoizedState;
                current2 = current2 !== null ? current2.dehydrated : null;
                if (!current2)
                  throw Error("Expected to have a hydrated activity instance. This error is likely caused by a bug in React. Please file an issue.");
                current2[internalInstanceKey] = workInProgress2;
                bubbleProperties(workInProgress2);
                (workInProgress2.mode & ProfileMode) !== NoMode && renderLanes2 !== null && (current2 = workInProgress2.child, current2 !== null && (workInProgress2.treeBaseDuration -= current2.treeBaseDuration));
              } else
                emitPendingHydrationWarnings(), resetHydrationState(), (workInProgress2.flags & 128) === 0 && (renderLanes2 = workInProgress2.memoizedState = null), workInProgress2.flags |= 4, bubbleProperties(workInProgress2), (workInProgress2.mode & ProfileMode) !== NoMode && renderLanes2 !== null && (current2 = workInProgress2.child, current2 !== null && (workInProgress2.treeBaseDuration -= current2.treeBaseDuration));
              current2 = false;
            } else
              renderLanes2 = upgradeHydrationErrorsToRecoverable(), current2 !== null && current2.memoizedState !== null && (current2.memoizedState.hydrationErrors = renderLanes2), current2 = true;
            if (!current2) {
              if (workInProgress2.flags & 256)
                return popSuspenseHandler(workInProgress2), workInProgress2;
              popSuspenseHandler(workInProgress2);
              return null;
            }
            if ((workInProgress2.flags & 128) !== 0)
              throw Error("Client rendering an Activity suspended it again. This is a bug in React.");
          }
          bubbleProperties(workInProgress2);
          return null;
        case 13:
          newProps = workInProgress2.memoizedState;
          if (current2 === null || current2.memoizedState !== null && current2.memoizedState.dehydrated !== null) {
            type = newProps;
            nextResource = popHydrationState(workInProgress2);
            if (type !== null && type.dehydrated !== null) {
              if (current2 === null) {
                if (!nextResource)
                  throw Error("A dehydrated suspense component was completed without a hydrated node. This is probably a bug in React.");
                nextResource = workInProgress2.memoizedState;
                nextResource = nextResource !== null ? nextResource.dehydrated : null;
                if (!nextResource)
                  throw Error("Expected to have a hydrated suspense instance. This error is likely caused by a bug in React. Please file an issue.");
                nextResource[internalInstanceKey] = workInProgress2;
                bubbleProperties(workInProgress2);
                (workInProgress2.mode & ProfileMode) !== NoMode && type !== null && (type = workInProgress2.child, type !== null && (workInProgress2.treeBaseDuration -= type.treeBaseDuration));
              } else
                emitPendingHydrationWarnings(), resetHydrationState(), (workInProgress2.flags & 128) === 0 && (type = workInProgress2.memoizedState = null), workInProgress2.flags |= 4, bubbleProperties(workInProgress2), (workInProgress2.mode & ProfileMode) !== NoMode && type !== null && (type = workInProgress2.child, type !== null && (workInProgress2.treeBaseDuration -= type.treeBaseDuration));
              type = false;
            } else
              type = upgradeHydrationErrorsToRecoverable(), current2 !== null && current2.memoizedState !== null && (current2.memoizedState.hydrationErrors = type), type = true;
            if (!type) {
              if (workInProgress2.flags & 256)
                return popSuspenseHandler(workInProgress2), workInProgress2;
              popSuspenseHandler(workInProgress2);
              return null;
            }
          }
          popSuspenseHandler(workInProgress2);
          if ((workInProgress2.flags & 128) !== 0)
            return workInProgress2.lanes = renderLanes2, (workInProgress2.mode & ProfileMode) !== NoMode && transferActualDuration(workInProgress2), workInProgress2;
          renderLanes2 = newProps !== null;
          current2 = current2 !== null && current2.memoizedState !== null;
          renderLanes2 && (newProps = workInProgress2.child, type = null, newProps.alternate !== null && newProps.alternate.memoizedState !== null && newProps.alternate.memoizedState.cachePool !== null && (type = newProps.alternate.memoizedState.cachePool.pool), nextResource = null, newProps.memoizedState !== null && newProps.memoizedState.cachePool !== null && (nextResource = newProps.memoizedState.cachePool.pool), nextResource !== type && (newProps.flags |= 2048));
          renderLanes2 !== current2 && renderLanes2 && (workInProgress2.child.flags |= 8192);
          scheduleRetryEffect(workInProgress2, workInProgress2.updateQueue);
          bubbleProperties(workInProgress2);
          (workInProgress2.mode & ProfileMode) !== NoMode && renderLanes2 && (current2 = workInProgress2.child, current2 !== null && (workInProgress2.treeBaseDuration -= current2.treeBaseDuration));
          return null;
        case 4:
          return popHostContainer(workInProgress2), current2 === null && listenToAllSupportedEvents(workInProgress2.stateNode.containerInfo), bubbleProperties(workInProgress2), null;
        case 10:
          return popProvider(workInProgress2.type, workInProgress2), bubbleProperties(workInProgress2), null;
        case 19:
          pop(suspenseStackCursor, workInProgress2);
          newProps = workInProgress2.memoizedState;
          if (newProps === null)
            return bubbleProperties(workInProgress2), null;
          type = (workInProgress2.flags & 128) !== 0;
          nextResource = newProps.rendering;
          if (nextResource === null)
            if (type)
              cutOffTailIfNeeded(newProps, false);
            else {
              if (workInProgressRootExitStatus !== RootInProgress || current2 !== null && (current2.flags & 128) !== 0)
                for (current2 = workInProgress2.child;current2 !== null; ) {
                  nextResource = findFirstSuspended(current2);
                  if (nextResource !== null) {
                    workInProgress2.flags |= 128;
                    cutOffTailIfNeeded(newProps, false);
                    current2 = nextResource.updateQueue;
                    workInProgress2.updateQueue = current2;
                    scheduleRetryEffect(workInProgress2, current2);
                    workInProgress2.subtreeFlags = 0;
                    current2 = renderLanes2;
                    for (renderLanes2 = workInProgress2.child;renderLanes2 !== null; )
                      resetWorkInProgress(renderLanes2, current2), renderLanes2 = renderLanes2.sibling;
                    push(suspenseStackCursor, suspenseStackCursor.current & SubtreeSuspenseContextMask | ForceSuspenseFallback, workInProgress2);
                    isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount);
                    return workInProgress2.child;
                  }
                  current2 = current2.sibling;
                }
              newProps.tail !== null && now$1() > workInProgressRootRenderTargetTime && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
            }
          else {
            if (!type)
              if (current2 = findFirstSuspended(nextResource), current2 !== null) {
                if (workInProgress2.flags |= 128, type = true, current2 = current2.updateQueue, workInProgress2.updateQueue = current2, scheduleRetryEffect(workInProgress2, current2), cutOffTailIfNeeded(newProps, true), newProps.tail === null && newProps.tailMode === "hidden" && !nextResource.alternate && !isHydrating)
                  return bubbleProperties(workInProgress2), null;
              } else
                2 * now$1() - newProps.renderingStartTime > workInProgressRootRenderTargetTime && renderLanes2 !== 536870912 && (workInProgress2.flags |= 128, type = true, cutOffTailIfNeeded(newProps, false), workInProgress2.lanes = 4194304);
            newProps.isBackwards ? (nextResource.sibling = workInProgress2.child, workInProgress2.child = nextResource) : (current2 = newProps.last, current2 !== null ? current2.sibling = nextResource : workInProgress2.child = nextResource, newProps.last = nextResource);
          }
          if (newProps.tail !== null)
            return current2 = newProps.tail, newProps.rendering = current2, newProps.tail = current2.sibling, newProps.renderingStartTime = now$1(), current2.sibling = null, renderLanes2 = suspenseStackCursor.current, renderLanes2 = type ? renderLanes2 & SubtreeSuspenseContextMask | ForceSuspenseFallback : renderLanes2 & SubtreeSuspenseContextMask, push(suspenseStackCursor, renderLanes2, workInProgress2), isHydrating && pushTreeFork(workInProgress2, newProps.treeForkCount), current2;
          bubbleProperties(workInProgress2);
          return null;
        case 22:
        case 23:
          return popSuspenseHandler(workInProgress2), popHiddenContext(workInProgress2), newProps = workInProgress2.memoizedState !== null, current2 !== null ? current2.memoizedState !== null !== newProps && (workInProgress2.flags |= 8192) : newProps && (workInProgress2.flags |= 8192), newProps ? (renderLanes2 & 536870912) !== 0 && (workInProgress2.flags & 128) === 0 && (bubbleProperties(workInProgress2), workInProgress2.subtreeFlags & 6 && (workInProgress2.flags |= 8192)) : bubbleProperties(workInProgress2), renderLanes2 = workInProgress2.updateQueue, renderLanes2 !== null && scheduleRetryEffect(workInProgress2, renderLanes2.retryQueue), renderLanes2 = null, current2 !== null && current2.memoizedState !== null && current2.memoizedState.cachePool !== null && (renderLanes2 = current2.memoizedState.cachePool.pool), newProps = null, workInProgress2.memoizedState !== null && workInProgress2.memoizedState.cachePool !== null && (newProps = workInProgress2.memoizedState.cachePool.pool), newProps !== renderLanes2 && (workInProgress2.flags |= 2048), current2 !== null && pop(resumedCache, workInProgress2), null;
        case 24:
          return renderLanes2 = null, current2 !== null && (renderLanes2 = current2.memoizedState.cache), workInProgress2.memoizedState.cache !== renderLanes2 && (workInProgress2.flags |= 2048), popProvider(CacheContext, workInProgress2), bubbleProperties(workInProgress2), null;
        case 25:
          return null;
        case 30:
          return null;
      }
      throw Error("Unknown unit of work tag (" + workInProgress2.tag + "). This error is likely caused by a bug in React. Please file an issue.");
    }
    function unwindWork(current2, workInProgress2) {
      popTreeContext(workInProgress2);
      switch (workInProgress2.tag) {
        case 1:
          return current2 = workInProgress2.flags, current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, (workInProgress2.mode & ProfileMode) !== NoMode && transferActualDuration(workInProgress2), workInProgress2) : null;
        case 3:
          return popProvider(CacheContext, workInProgress2), popHostContainer(workInProgress2), current2 = workInProgress2.flags, (current2 & 65536) !== 0 && (current2 & 128) === 0 ? (workInProgress2.flags = current2 & -65537 | 128, workInProgress2) : null;
        case 26:
        case 27:
        case 5:
          return popHostContext(workInProgress2), null;
        case 31:
          if (workInProgress2.memoizedState !== null) {
            popSuspenseHandler(workInProgress2);
            if (workInProgress2.alternate === null)
              throw Error("Threw in newly mounted dehydrated component. This is likely a bug in React. Please file an issue.");
            resetHydrationState();
          }
          current2 = workInProgress2.flags;
          return current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, (workInProgress2.mode & ProfileMode) !== NoMode && transferActualDuration(workInProgress2), workInProgress2) : null;
        case 13:
          popSuspenseHandler(workInProgress2);
          current2 = workInProgress2.memoizedState;
          if (current2 !== null && current2.dehydrated !== null) {
            if (workInProgress2.alternate === null)
              throw Error("Threw in newly mounted dehydrated component. This is likely a bug in React. Please file an issue.");
            resetHydrationState();
          }
          current2 = workInProgress2.flags;
          return current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, (workInProgress2.mode & ProfileMode) !== NoMode && transferActualDuration(workInProgress2), workInProgress2) : null;
        case 19:
          return pop(suspenseStackCursor, workInProgress2), null;
        case 4:
          return popHostContainer(workInProgress2), null;
        case 10:
          return popProvider(workInProgress2.type, workInProgress2), null;
        case 22:
        case 23:
          return popSuspenseHandler(workInProgress2), popHiddenContext(workInProgress2), current2 !== null && pop(resumedCache, workInProgress2), current2 = workInProgress2.flags, current2 & 65536 ? (workInProgress2.flags = current2 & -65537 | 128, (workInProgress2.mode & ProfileMode) !== NoMode && transferActualDuration(workInProgress2), workInProgress2) : null;
        case 24:
          return popProvider(CacheContext, workInProgress2), null;
        case 25:
          return null;
        default:
          return null;
      }
    }
    function unwindInterruptedWork(current2, interruptedWork) {
      popTreeContext(interruptedWork);
      switch (interruptedWork.tag) {
        case 3:
          popProvider(CacheContext, interruptedWork);
          popHostContainer(interruptedWork);
          break;
        case 26:
        case 27:
        case 5:
          popHostContext(interruptedWork);
          break;
        case 4:
          popHostContainer(interruptedWork);
          break;
        case 31:
          interruptedWork.memoizedState !== null && popSuspenseHandler(interruptedWork);
          break;
        case 13:
          popSuspenseHandler(interruptedWork);
          break;
        case 19:
          pop(suspenseStackCursor, interruptedWork);
          break;
        case 10:
          popProvider(interruptedWork.type, interruptedWork);
          break;
        case 22:
        case 23:
          popSuspenseHandler(interruptedWork);
          popHiddenContext(interruptedWork);
          current2 !== null && pop(resumedCache, interruptedWork);
          break;
        case 24:
          popProvider(CacheContext, interruptedWork);
      }
    }
    function shouldProfile(current2) {
      return (current2.mode & ProfileMode) !== NoMode;
    }
    function commitHookLayoutEffects(finishedWork, hookFlags) {
      shouldProfile(finishedWork) ? (startEffectTimer(), commitHookEffectListMount(hookFlags, finishedWork), recordEffectDuration()) : commitHookEffectListMount(hookFlags, finishedWork);
    }
    function commitHookLayoutUnmountEffects(finishedWork, nearestMountedAncestor, hookFlags) {
      shouldProfile(finishedWork) ? (startEffectTimer(), commitHookEffectListUnmount(hookFlags, finishedWork, nearestMountedAncestor), recordEffectDuration()) : commitHookEffectListUnmount(hookFlags, finishedWork, nearestMountedAncestor);
    }
    function commitHookEffectListMount(flags, finishedWork) {
      try {
        var updateQueue = finishedWork.updateQueue, lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
        if (lastEffect !== null) {
          var firstEffect = lastEffect.next;
          updateQueue = firstEffect;
          do {
            if ((updateQueue.tag & flags) === flags && (lastEffect = undefined, (flags & Insertion) !== NoFlags && (isRunningInsertionEffect = true), lastEffect = runWithFiberInDEV(finishedWork, callCreateInDEV, updateQueue), (flags & Insertion) !== NoFlags && (isRunningInsertionEffect = false), lastEffect !== undefined && typeof lastEffect !== "function")) {
              var hookName = undefined;
              hookName = (updateQueue.tag & Layout) !== 0 ? "useLayoutEffect" : (updateQueue.tag & Insertion) !== 0 ? "useInsertionEffect" : "useEffect";
              var addendum = undefined;
              addendum = lastEffect === null ? " You returned null. If your effect does not require clean up, return undefined (or nothing)." : typeof lastEffect.then === "function" ? `

It looks like you wrote ` + hookName + `(async () => ...) or returned a Promise. Instead, write the async function inside your effect and call it immediately:

` + hookName + `(() => {
  async function fetchData() {
    // You can await here
    const response = await MyAPI.getData(someId);
    // ...
  }
  fetchData();
}, [someId]); // Or [] if effect doesn't need props or state

Learn more about data fetching with Hooks: https://react.dev/link/hooks-data-fetching` : " You returned: " + lastEffect;
              runWithFiberInDEV(finishedWork, function(n, a) {
                console.error("%s must not return anything besides a function, which is used for clean-up.%s", n, a);
              }, hookName, addendum);
            }
            updateQueue = updateQueue.next;
          } while (updateQueue !== firstEffect);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHookEffectListUnmount(flags, finishedWork, nearestMountedAncestor) {
      try {
        var updateQueue = finishedWork.updateQueue, lastEffect = updateQueue !== null ? updateQueue.lastEffect : null;
        if (lastEffect !== null) {
          var firstEffect = lastEffect.next;
          updateQueue = firstEffect;
          do {
            if ((updateQueue.tag & flags) === flags) {
              var inst = updateQueue.inst, destroy = inst.destroy;
              destroy !== undefined && (inst.destroy = undefined, (flags & Insertion) !== NoFlags && (isRunningInsertionEffect = true), lastEffect = finishedWork, runWithFiberInDEV(lastEffect, callDestroyInDEV, lastEffect, nearestMountedAncestor, destroy), (flags & Insertion) !== NoFlags && (isRunningInsertionEffect = false));
            }
            updateQueue = updateQueue.next;
          } while (updateQueue !== firstEffect);
        }
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHookPassiveMountEffects(finishedWork, hookFlags) {
      shouldProfile(finishedWork) ? (startEffectTimer(), commitHookEffectListMount(hookFlags, finishedWork), recordEffectDuration()) : commitHookEffectListMount(hookFlags, finishedWork);
    }
    function commitHookPassiveUnmountEffects(finishedWork, nearestMountedAncestor, hookFlags) {
      shouldProfile(finishedWork) ? (startEffectTimer(), commitHookEffectListUnmount(hookFlags, finishedWork, nearestMountedAncestor), recordEffectDuration()) : commitHookEffectListUnmount(hookFlags, finishedWork, nearestMountedAncestor);
    }
    function commitClassCallbacks(finishedWork) {
      var updateQueue = finishedWork.updateQueue;
      if (updateQueue !== null) {
        var instance = finishedWork.stateNode;
        finishedWork.type.defaultProps || "ref" in finishedWork.memoizedProps || didWarnAboutReassigningProps || (instance.props !== finishedWork.memoizedProps && console.error("Expected %s props to match memoized props before processing the update queue. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", getComponentNameFromFiber(finishedWork) || "instance"), instance.state !== finishedWork.memoizedState && console.error("Expected %s state to match memoized state before processing the update queue. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", getComponentNameFromFiber(finishedWork) || "instance"));
        try {
          runWithFiberInDEV(finishedWork, commitCallbacks, updateQueue, instance);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }
    function callGetSnapshotBeforeUpdates(instance, prevProps, prevState) {
      return instance.getSnapshotBeforeUpdate(prevProps, prevState);
    }
    function commitClassSnapshot(finishedWork, current2) {
      var { memoizedProps: prevProps, memoizedState: prevState } = current2;
      current2 = finishedWork.stateNode;
      finishedWork.type.defaultProps || "ref" in finishedWork.memoizedProps || didWarnAboutReassigningProps || (current2.props !== finishedWork.memoizedProps && console.error("Expected %s props to match memoized props before getSnapshotBeforeUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", getComponentNameFromFiber(finishedWork) || "instance"), current2.state !== finishedWork.memoizedState && console.error("Expected %s state to match memoized state before getSnapshotBeforeUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", getComponentNameFromFiber(finishedWork) || "instance"));
      try {
        var resolvedPrevProps = resolveClassComponentProps(finishedWork.type, prevProps);
        var snapshot = runWithFiberInDEV(finishedWork, callGetSnapshotBeforeUpdates, current2, resolvedPrevProps, prevState);
        prevProps = didWarnAboutUndefinedSnapshotBeforeUpdate;
        snapshot !== undefined || prevProps.has(finishedWork.type) || (prevProps.add(finishedWork.type), runWithFiberInDEV(finishedWork, function() {
          console.error("%s.getSnapshotBeforeUpdate(): A snapshot value (or null) must be returned. You have returned undefined.", getComponentNameFromFiber(finishedWork));
        }));
        current2.__reactInternalSnapshotBeforeUpdate = snapshot;
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function safelyCallComponentWillUnmount(current2, nearestMountedAncestor, instance) {
      instance.props = resolveClassComponentProps(current2.type, current2.memoizedProps);
      instance.state = current2.memoizedState;
      shouldProfile(current2) ? (startEffectTimer(), runWithFiberInDEV(current2, callComponentWillUnmountInDEV, current2, nearestMountedAncestor, instance), recordEffectDuration()) : runWithFiberInDEV(current2, callComponentWillUnmountInDEV, current2, nearestMountedAncestor, instance);
    }
    function commitAttachRef(finishedWork) {
      var ref = finishedWork.ref;
      if (ref !== null) {
        switch (finishedWork.tag) {
          case 26:
          case 27:
          case 5:
            var instanceToUse = finishedWork.stateNode;
            break;
          case 30:
            instanceToUse = finishedWork.stateNode;
            break;
          default:
            instanceToUse = finishedWork.stateNode;
        }
        if (typeof ref === "function")
          if (shouldProfile(finishedWork))
            try {
              startEffectTimer(), finishedWork.refCleanup = ref(instanceToUse);
            } finally {
              recordEffectDuration();
            }
          else
            finishedWork.refCleanup = ref(instanceToUse);
        else
          typeof ref === "string" ? console.error("String refs are no longer supported.") : ref.hasOwnProperty("current") || console.error("Unexpected ref object provided for %s. Use either a ref-setter function or React.createRef().", getComponentNameFromFiber(finishedWork)), ref.current = instanceToUse;
      }
    }
    function safelyAttachRef(current2, nearestMountedAncestor) {
      try {
        runWithFiberInDEV(current2, commitAttachRef, current2);
      } catch (error) {
        captureCommitPhaseError(current2, nearestMountedAncestor, error);
      }
    }
    function safelyDetachRef(current2, nearestMountedAncestor) {
      var { ref, refCleanup } = current2;
      if (ref !== null)
        if (typeof refCleanup === "function")
          try {
            if (shouldProfile(current2))
              try {
                startEffectTimer(), runWithFiberInDEV(current2, refCleanup);
              } finally {
                recordEffectDuration(current2);
              }
            else
              runWithFiberInDEV(current2, refCleanup);
          } catch (error) {
            captureCommitPhaseError(current2, nearestMountedAncestor, error);
          } finally {
            current2.refCleanup = null, current2 = current2.alternate, current2 != null && (current2.refCleanup = null);
          }
        else if (typeof ref === "function")
          try {
            if (shouldProfile(current2))
              try {
                startEffectTimer(), runWithFiberInDEV(current2, ref, null);
              } finally {
                recordEffectDuration(current2);
              }
            else
              runWithFiberInDEV(current2, ref, null);
          } catch (error$7) {
            captureCommitPhaseError(current2, nearestMountedAncestor, error$7);
          }
        else
          ref.current = null;
    }
    function commitProfiler(finishedWork, current2, commitStartTime2, effectDuration) {
      var _finishedWork$memoize = finishedWork.memoizedProps, id = _finishedWork$memoize.id, onCommit = _finishedWork$memoize.onCommit;
      _finishedWork$memoize = _finishedWork$memoize.onRender;
      current2 = current2 === null ? "mount" : "update";
      currentUpdateIsNested && (current2 = "nested-update");
      typeof _finishedWork$memoize === "function" && _finishedWork$memoize(id, current2, finishedWork.actualDuration, finishedWork.treeBaseDuration, finishedWork.actualStartTime, commitStartTime2);
      typeof onCommit === "function" && onCommit(id, current2, effectDuration, commitStartTime2);
    }
    function commitProfilerPostCommitImpl(finishedWork, current2, commitStartTime2, passiveEffectDuration) {
      var _finishedWork$memoize2 = finishedWork.memoizedProps;
      finishedWork = _finishedWork$memoize2.id;
      _finishedWork$memoize2 = _finishedWork$memoize2.onPostCommit;
      current2 = current2 === null ? "mount" : "update";
      currentUpdateIsNested && (current2 = "nested-update");
      typeof _finishedWork$memoize2 === "function" && _finishedWork$memoize2(finishedWork, current2, passiveEffectDuration, commitStartTime2);
    }
    function commitHostMount(finishedWork) {
      var { type, memoizedProps: props, stateNode: instance } = finishedWork;
      try {
        runWithFiberInDEV(finishedWork, commitMount, instance, type, props, finishedWork);
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function commitHostUpdate(finishedWork, newProps, oldProps) {
      try {
        runWithFiberInDEV(finishedWork, commitUpdate, finishedWork.stateNode, finishedWork.type, oldProps, newProps, finishedWork);
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
        node = node.stateNode, before ? (warnForReactChildrenConflict(parent), (parent.nodeType === 9 ? parent.body : parent.nodeName === "HTML" ? parent.ownerDocument.body : parent).insertBefore(node, before)) : (warnForReactChildrenConflict(parent), before = parent.nodeType === 9 ? parent.body : parent.nodeName === "HTML" ? parent.ownerDocument.body : parent, before.appendChild(node), parent = parent._reactRootContainer, parent !== null && parent !== undefined || before.onclick !== null || (before.onclick = noop$1));
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
    function commitPlacement(finishedWork) {
      for (var hostParentFiber, parentFiber = finishedWork.return;parentFiber !== null; ) {
        if (isHostParent(parentFiber)) {
          hostParentFiber = parentFiber;
          break;
        }
        parentFiber = parentFiber.return;
      }
      if (hostParentFiber == null)
        throw Error("Expected to find a host parent. This error is likely caused by a bug in React. Please file an issue.");
      switch (hostParentFiber.tag) {
        case 27:
          hostParentFiber = hostParentFiber.stateNode;
          parentFiber = getHostSibling(finishedWork);
          insertOrAppendPlacementNode(finishedWork, parentFiber, hostParentFiber);
          break;
        case 5:
          parentFiber = hostParentFiber.stateNode;
          hostParentFiber.flags & 32 && (resetTextContent(parentFiber), hostParentFiber.flags &= -33);
          hostParentFiber = getHostSibling(finishedWork);
          insertOrAppendPlacementNode(finishedWork, hostParentFiber, parentFiber);
          break;
        case 3:
        case 4:
          hostParentFiber = hostParentFiber.stateNode.containerInfo;
          parentFiber = getHostSibling(finishedWork);
          insertOrAppendPlacementNodeIntoContainer(finishedWork, parentFiber, hostParentFiber);
          break;
        default:
          throw Error("Invalid host parent fiber. This error is likely caused by a bug in React. Please file an issue.");
      }
    }
    function commitHostSingletonAcquisition(finishedWork) {
      var { stateNode: singleton, memoizedProps: props } = finishedWork;
      try {
        runWithFiberInDEV(finishedWork, acquireSingletonInstance, finishedWork.type, props, singleton, finishedWork);
      } catch (error) {
        captureCommitPhaseError(finishedWork, finishedWork.return, error);
      }
    }
    function isHydratingParent(current2, finishedWork) {
      return finishedWork.tag === 31 ? (finishedWork = finishedWork.memoizedState, current2.memoizedState !== null && finishedWork === null) : finishedWork.tag === 13 ? (current2 = current2.memoizedState, finishedWork = finishedWork.memoizedState, current2 !== null && current2.dehydrated !== null && (finishedWork === null || finishedWork.dehydrated === null)) : finishedWork.tag === 3 ? current2.memoizedState.isDehydrated && (finishedWork.flags & 256) === 0 : false;
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
              } catch (e$2) {
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
      selectionInformation = {
        focusedElem: root2,
        selectionRange: JSCompiler_temp
      };
      _enabled = false;
      for (nextEffect = firstChild;nextEffect !== null; )
        if (firstChild = nextEffect, root2 = firstChild.child, (firstChild.subtreeFlags & 1028) !== 0 && root2 !== null)
          root2.return = firstChild, nextEffect = root2;
        else
          for (;nextEffect !== null; ) {
            root2 = firstChild = nextEffect;
            JSCompiler_temp = root2.alternate;
            anchorOffset = root2.flags;
            switch (root2.tag) {
              case 0:
                if ((anchorOffset & 4) !== 0 && (root2 = root2.updateQueue, root2 = root2 !== null ? root2.events : null, root2 !== null))
                  for (JSCompiler_temp = 0;JSCompiler_temp < root2.length; JSCompiler_temp++)
                    anchorOffset = root2[JSCompiler_temp], anchorOffset.ref.impl = anchorOffset.nextImpl;
                break;
              case 11:
              case 15:
                break;
              case 1:
                (anchorOffset & 1024) !== 0 && JSCompiler_temp !== null && commitClassSnapshot(root2, JSCompiler_temp);
                break;
              case 3:
                if ((anchorOffset & 1024) !== 0) {
                  if (root2 = root2.stateNode.containerInfo, JSCompiler_temp = root2.nodeType, JSCompiler_temp === 9)
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
                if ((anchorOffset & 1024) !== 0)
                  throw Error("This unit of work tag should not have side-effects. This error is likely caused by a bug in React. Please file an issue.");
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
    function commitLayoutEffectOnFiber(finishedRoot, current2, finishedWork) {
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate(), flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitHookLayoutEffects(finishedWork, Layout | HasEffect);
          break;
        case 1:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (flags & 4)
            if (finishedRoot = finishedWork.stateNode, current2 === null)
              finishedWork.type.defaultProps || "ref" in finishedWork.memoizedProps || didWarnAboutReassigningProps || (finishedRoot.props !== finishedWork.memoizedProps && console.error("Expected %s props to match memoized props before componentDidMount. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", getComponentNameFromFiber(finishedWork) || "instance"), finishedRoot.state !== finishedWork.memoizedState && console.error("Expected %s state to match memoized state before componentDidMount. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", getComponentNameFromFiber(finishedWork) || "instance")), shouldProfile(finishedWork) ? (startEffectTimer(), runWithFiberInDEV(finishedWork, callComponentDidMountInDEV, finishedWork, finishedRoot), recordEffectDuration()) : runWithFiberInDEV(finishedWork, callComponentDidMountInDEV, finishedWork, finishedRoot);
            else {
              var prevProps = resolveClassComponentProps(finishedWork.type, current2.memoizedProps);
              current2 = current2.memoizedState;
              finishedWork.type.defaultProps || "ref" in finishedWork.memoizedProps || didWarnAboutReassigningProps || (finishedRoot.props !== finishedWork.memoizedProps && console.error("Expected %s props to match memoized props before componentDidUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.props`. Please file an issue.", getComponentNameFromFiber(finishedWork) || "instance"), finishedRoot.state !== finishedWork.memoizedState && console.error("Expected %s state to match memoized state before componentDidUpdate. This might either be because of a bug in React, or because a component reassigns its own `this.state`. Please file an issue.", getComponentNameFromFiber(finishedWork) || "instance"));
              shouldProfile(finishedWork) ? (startEffectTimer(), runWithFiberInDEV(finishedWork, callComponentDidUpdateInDEV, finishedWork, finishedRoot, prevProps, current2, finishedRoot.__reactInternalSnapshotBeforeUpdate), recordEffectDuration()) : runWithFiberInDEV(finishedWork, callComponentDidUpdateInDEV, finishedWork, finishedRoot, prevProps, current2, finishedRoot.__reactInternalSnapshotBeforeUpdate);
            }
          flags & 64 && commitClassCallbacks(finishedWork);
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 3:
          current2 = pushNestedEffectDurations();
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (flags & 64 && (flags = finishedWork.updateQueue, flags !== null)) {
            prevProps = null;
            if (finishedWork.child !== null)
              switch (finishedWork.child.tag) {
                case 27:
                case 5:
                  prevProps = finishedWork.child.stateNode;
                  break;
                case 1:
                  prevProps = finishedWork.child.stateNode;
              }
            try {
              runWithFiberInDEV(finishedWork, commitCallbacks, flags, prevProps);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          finishedRoot.effectDuration += popNestedEffectDurations(current2);
          break;
        case 27:
          current2 === null && flags & 4 && commitHostSingletonAcquisition(finishedWork);
        case 26:
        case 5:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          if (current2 === null) {
            if (flags & 4)
              commitHostMount(finishedWork);
            else if (flags & 64) {
              finishedRoot = finishedWork.type;
              current2 = finishedWork.memoizedProps;
              prevProps = finishedWork.stateNode;
              try {
                runWithFiberInDEV(finishedWork, commitHydratedInstance, prevProps, finishedRoot, current2, finishedWork);
              } catch (error) {
                captureCommitPhaseError(finishedWork, finishedWork.return, error);
              }
            }
          }
          flags & 512 && safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 12:
          if (flags & 4) {
            flags = pushNestedEffectDurations();
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            finishedRoot = finishedWork.stateNode;
            finishedRoot.effectDuration += bubbleNestedEffectDurations(flags);
            try {
              runWithFiberInDEV(finishedWork, commitProfiler, finishedWork, current2, commitStartTime, finishedRoot.effectDuration);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          } else
            recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          break;
        case 31:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitActivityHydrationCallbacks(finishedRoot, finishedWork);
          break;
        case 13:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
          flags & 4 && commitSuspenseHydrationCallbacks(finishedRoot, finishedWork);
          flags & 64 && (finishedRoot = finishedWork.memoizedState, finishedRoot !== null && (finishedRoot = finishedRoot.dehydrated, finishedRoot !== null && (flags = retryDehydratedSuspenseBoundary.bind(null, finishedWork), registerSuspenseInstanceRetry(finishedRoot, flags))));
          break;
        case 22:
          flags = finishedWork.memoizedState !== null || offscreenSubtreeIsHidden;
          if (!flags) {
            current2 = current2 !== null && current2.memoizedState !== null || offscreenSubtreeWasHidden;
            prevProps = offscreenSubtreeIsHidden;
            var prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
            offscreenSubtreeIsHidden = flags;
            (offscreenSubtreeWasHidden = current2) && !prevOffscreenSubtreeWasHidden ? (recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, (finishedWork.subtreeFlags & 8772) !== 0), (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentReappeared(finishedWork, componentEffectStartTime, componentEffectEndTime)) : recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
            offscreenSubtreeIsHidden = prevProps;
            offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          }
          break;
        case 30:
          break;
        default:
          recursivelyTraverseLayoutEffects(finishedRoot, finishedWork);
      }
      (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && ((componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(finishedWork, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors), finishedWork.alternate === null && finishedWork.return !== null && finishedWork.return.alternate !== null && 0.05 < componentEffectEndTime - componentEffectStartTime && (isHydratingParent(finishedWork.return.alternate, finishedWork.return) || logComponentTrigger(finishedWork, componentEffectStartTime, componentEffectEndTime, "Mount")));
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectErrors = prevEffectErrors;
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
    }
    function detachFiberAfterEffects(fiber) {
      var alternate = fiber.alternate;
      alternate !== null && (fiber.alternate = null, detachFiberAfterEffects(alternate));
      fiber.child = null;
      fiber.deletions = null;
      fiber.sibling = null;
      fiber.tag === 5 && (alternate = fiber.stateNode, alternate !== null && detachDeletedInstance(alternate));
      fiber.stateNode = null;
      fiber._debugOwner = null;
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
        } catch (err) {
          hasLoggedError || (hasLoggedError = true, console.error("React instrumentation encountered an error: %o", err));
        }
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate();
      switch (deletedFiber.tag) {
        case 26:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          deletedFiber.memoizedState ? deletedFiber.memoizedState.count-- : deletedFiber.stateNode && (finishedRoot = deletedFiber.stateNode, finishedRoot.parentNode.removeChild(finishedRoot));
          break;
        case 27:
          offscreenSubtreeWasHidden || safelyDetachRef(deletedFiber, nearestMountedAncestor);
          var prevHostParent = hostParent, prevHostParentIsContainer = hostParentIsContainer;
          isSingletonScope(deletedFiber.type) && (hostParent = deletedFiber.stateNode, hostParentIsContainer = false);
          recursivelyTraverseDeletionEffects(finishedRoot, nearestMountedAncestor, deletedFiber);
          runWithFiberInDEV(deletedFiber, releaseSingletonInstance, deletedFiber.stateNode);
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
                runWithFiberInDEV(deletedFiber, removeChildFromContainer, hostParent, deletedFiber.stateNode);
              } catch (error) {
                captureCommitPhaseError(deletedFiber, nearestMountedAncestor, error);
              }
            else
              try {
                runWithFiberInDEV(deletedFiber, removeChild, hostParent, deletedFiber.stateNode);
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
          commitHookEffectListUnmount(Insertion, deletedFiber, nearestMountedAncestor);
          offscreenSubtreeWasHidden || commitHookLayoutUnmountEffects(deletedFiber, nearestMountedAncestor, Layout);
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
      (deletedFiber.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && (componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(deletedFiber, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors);
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectErrors = prevEffectErrors;
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
    }
    function commitActivityHydrationCallbacks(finishedRoot, finishedWork) {
      if (finishedWork.memoizedState === null && (finishedRoot = finishedWork.alternate, finishedRoot !== null && (finishedRoot = finishedRoot.memoizedState, finishedRoot !== null))) {
        finishedRoot = finishedRoot.dehydrated;
        try {
          runWithFiberInDEV(finishedWork, commitHydratedActivityInstance, finishedRoot);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }
    function commitSuspenseHydrationCallbacks(finishedRoot, finishedWork) {
      if (finishedWork.memoizedState === null && (finishedRoot = finishedWork.alternate, finishedRoot !== null && (finishedRoot = finishedRoot.memoizedState, finishedRoot !== null && (finishedRoot = finishedRoot.dehydrated, finishedRoot !== null))))
        try {
          runWithFiberInDEV(finishedWork, commitHydratedSuspenseInstance, finishedRoot);
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
          throw Error("Unexpected Suspense handler tag (" + finishedWork.tag + "). This is a bug in React.");
      }
    }
    function attachSuspenseRetryListeners(finishedWork, wakeables) {
      var retryCache = getRetryCache(finishedWork);
      wakeables.forEach(function(wakeable) {
        if (!retryCache.has(wakeable)) {
          retryCache.add(wakeable);
          if (isDevToolsPresent)
            if (inProgressLanes !== null && inProgressRoot !== null)
              restorePendingUpdaters(inProgressRoot, inProgressLanes);
            else
              throw Error("Expected finished root and lanes to be set. This is a bug in React.");
          var retry = resolveRetryWakeable.bind(null, finishedWork, wakeable);
          wakeable.then(retry, retry);
        }
      });
    }
    function recursivelyTraverseMutationEffects(root$jscomp$0, parentFiber) {
      var deletions = parentFiber.deletions;
      if (deletions !== null)
        for (var i = 0;i < deletions.length; i++) {
          var root2 = root$jscomp$0, returnFiber = parentFiber, deletedFiber = deletions[i], prevEffectStart = pushComponentEffectStart(), parent = returnFiber;
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
            throw Error("Expected to find a host parent. This error is likely caused by a bug in React. Please file an issue.");
          commitDeletionEffectsOnFiber(root2, returnFiber, deletedFiber);
          hostParent = null;
          hostParentIsContainer = false;
          (deletedFiber.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentTrigger(deletedFiber, componentEffectStartTime, componentEffectEndTime, "Unmount");
          popComponentEffectStart(prevEffectStart);
          root2 = deletedFiber;
          returnFiber = root2.alternate;
          returnFiber !== null && (returnFiber.return = null);
          root2.return = null;
        }
      if (parentFiber.subtreeFlags & 13886)
        for (parentFiber = parentFiber.child;parentFiber !== null; )
          commitMutationEffectsOnFiber(parentFiber, root$jscomp$0), parentFiber = parentFiber.sibling;
    }
    function commitMutationEffectsOnFiber(finishedWork, root2) {
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate(), current2 = finishedWork.alternate, flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (commitHookEffectListUnmount(Insertion | HasEffect, finishedWork, finishedWork.return), commitHookEffectListMount(Insertion | HasEffect, finishedWork), commitHookLayoutUnmountEffects(finishedWork, finishedWork.return, Layout | HasEffect));
          break;
        case 1:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || current2 === null || safelyDetachRef(current2, current2.return));
          if (flags & 64 && offscreenSubtreeIsHidden && (flags = finishedWork.updateQueue, flags !== null && (current2 = flags.callbacks, current2 !== null))) {
            var existingHiddenCallbacks = flags.shared.hiddenCallbacks;
            flags.shared.hiddenCallbacks = existingHiddenCallbacks === null ? current2 : existingHiddenCallbacks.concat(current2);
          }
          break;
        case 26:
          existingHiddenCallbacks = currentHoistableRoot;
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || current2 === null || safelyDetachRef(current2, current2.return));
          if (flags & 4) {
            var currentResource = current2 !== null ? current2.memoizedState : null;
            flags = finishedWork.memoizedState;
            if (current2 === null)
              if (flags === null)
                if (finishedWork.stateNode === null) {
                  a: {
                    flags = finishedWork.type;
                    current2 = finishedWork.memoizedProps;
                    existingHiddenCallbacks = existingHiddenCallbacks.ownerDocument || existingHiddenCallbacks;
                    b:
                      switch (flags) {
                        case "title":
                          currentResource = existingHiddenCallbacks.getElementsByTagName("title")[0];
                          if (!currentResource || currentResource[internalHoistableMarker] || currentResource[internalInstanceKey] || currentResource.namespaceURI === SVG_NAMESPACE || currentResource.hasAttribute("itemprop"))
                            currentResource = existingHiddenCallbacks.createElement(flags), existingHiddenCallbacks.head.insertBefore(currentResource, existingHiddenCallbacks.querySelector("head > title"));
                          setInitialProperties(currentResource, flags, current2);
                          currentResource[internalInstanceKey] = finishedWork;
                          markNodeAsHoistable(currentResource);
                          flags = currentResource;
                          break a;
                        case "link":
                          var maybeNodes = getHydratableHoistableCache("link", "href", existingHiddenCallbacks).get(flags + (current2.href || ""));
                          if (maybeNodes) {
                            for (var i = 0;i < maybeNodes.length; i++)
                              if (currentResource = maybeNodes[i], currentResource.getAttribute("href") === (current2.href == null || current2.href === "" ? null : current2.href) && currentResource.getAttribute("rel") === (current2.rel == null ? null : current2.rel) && currentResource.getAttribute("title") === (current2.title == null ? null : current2.title) && currentResource.getAttribute("crossorigin") === (current2.crossOrigin == null ? null : current2.crossOrigin)) {
                                maybeNodes.splice(i, 1);
                                break b;
                              }
                          }
                          currentResource = existingHiddenCallbacks.createElement(flags);
                          setInitialProperties(currentResource, flags, current2);
                          existingHiddenCallbacks.head.appendChild(currentResource);
                          break;
                        case "meta":
                          if (maybeNodes = getHydratableHoistableCache("meta", "content", existingHiddenCallbacks).get(flags + (current2.content || ""))) {
                            for (i = 0;i < maybeNodes.length; i++)
                              if (currentResource = maybeNodes[i], checkAttributeStringCoercion(current2.content, "content"), currentResource.getAttribute("content") === (current2.content == null ? null : "" + current2.content) && currentResource.getAttribute("name") === (current2.name == null ? null : current2.name) && currentResource.getAttribute("property") === (current2.property == null ? null : current2.property) && currentResource.getAttribute("http-equiv") === (current2.httpEquiv == null ? null : current2.httpEquiv) && currentResource.getAttribute("charset") === (current2.charSet == null ? null : current2.charSet)) {
                                maybeNodes.splice(i, 1);
                                break b;
                              }
                          }
                          currentResource = existingHiddenCallbacks.createElement(flags);
                          setInitialProperties(currentResource, flags, current2);
                          existingHiddenCallbacks.head.appendChild(currentResource);
                          break;
                        default:
                          throw Error('getNodesForType encountered a type it did not expect: "' + flags + '". This is a bug in React.');
                      }
                    currentResource[internalInstanceKey] = finishedWork;
                    markNodeAsHoistable(currentResource);
                    flags = currentResource;
                  }
                  finishedWork.stateNode = flags;
                } else
                  mountHoistable(existingHiddenCallbacks, finishedWork.type, finishedWork.stateNode);
              else
                finishedWork.stateNode = acquireResource(existingHiddenCallbacks, flags, finishedWork.memoizedProps);
            else
              currentResource !== flags ? (currentResource === null ? current2.stateNode !== null && (current2 = current2.stateNode, current2.parentNode.removeChild(current2)) : currentResource.count--, flags === null ? mountHoistable(existingHiddenCallbacks, finishedWork.type, finishedWork.stateNode) : acquireResource(existingHiddenCallbacks, flags, finishedWork.memoizedProps)) : flags === null && finishedWork.stateNode !== null && commitHostUpdate(finishedWork, finishedWork.memoizedProps, current2.memoizedProps);
          }
          break;
        case 27:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || current2 === null || safelyDetachRef(current2, current2.return));
          current2 !== null && flags & 4 && commitHostUpdate(finishedWork, finishedWork.memoizedProps, current2.memoizedProps);
          break;
        case 5:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 512 && (offscreenSubtreeWasHidden || current2 === null || safelyDetachRef(current2, current2.return));
          if (finishedWork.flags & 32) {
            existingHiddenCallbacks = finishedWork.stateNode;
            try {
              runWithFiberInDEV(finishedWork, resetTextContent, existingHiddenCallbacks);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          flags & 4 && finishedWork.stateNode != null && (existingHiddenCallbacks = finishedWork.memoizedProps, commitHostUpdate(finishedWork, existingHiddenCallbacks, current2 !== null ? current2.memoizedProps : existingHiddenCallbacks));
          flags & 1024 && (needsFormReset = true, finishedWork.type !== "form" && console.error("Unexpected host component type. Expected a form. This is a bug in React."));
          break;
        case 6:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          if (flags & 4) {
            if (finishedWork.stateNode === null)
              throw Error("This should have a text node initialized. This error is likely caused by a bug in React. Please file an issue.");
            flags = finishedWork.memoizedProps;
            current2 = current2 !== null ? current2.memoizedProps : flags;
            existingHiddenCallbacks = finishedWork.stateNode;
            try {
              runWithFiberInDEV(finishedWork, commitTextUpdate, existingHiddenCallbacks, current2, flags);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          }
          break;
        case 3:
          existingHiddenCallbacks = pushNestedEffectDurations();
          tagCaches = null;
          currentResource = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(root2.containerInfo);
          recursivelyTraverseMutationEffects(root2, finishedWork);
          currentHoistableRoot = currentResource;
          commitReconciliationEffects(finishedWork);
          if (flags & 4 && current2 !== null && current2.memoizedState.isDehydrated)
            try {
              runWithFiberInDEV(finishedWork, commitHydratedContainer, root2.containerInfo);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          needsFormReset && (needsFormReset = false, recursivelyResetForms(finishedWork));
          root2.effectDuration += popNestedEffectDurations(existingHiddenCallbacks);
          break;
        case 4:
          flags = currentHoistableRoot;
          currentHoistableRoot = getHoistableRoot(finishedWork.stateNode.containerInfo);
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          currentHoistableRoot = flags;
          break;
        case 12:
          flags = pushNestedEffectDurations();
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          finishedWork.stateNode.effectDuration += bubbleNestedEffectDurations(flags);
          break;
        case 31:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
          break;
        case 13:
          recursivelyTraverseMutationEffects(root2, finishedWork);
          commitReconciliationEffects(finishedWork);
          finishedWork.child.flags & 8192 && finishedWork.memoizedState !== null !== (current2 !== null && current2.memoizedState !== null) && (globalMostRecentFallbackTime = now$1());
          flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (finishedWork.updateQueue = null, attachSuspenseRetryListeners(finishedWork, flags)));
          break;
        case 22:
          existingHiddenCallbacks = finishedWork.memoizedState !== null;
          var wasHidden = current2 !== null && current2.memoizedState !== null, prevOffscreenSubtreeIsHidden = offscreenSubtreeIsHidden, prevOffscreenSubtreeWasHidden = offscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden || existingHiddenCallbacks;
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden || wasHidden;
          recursivelyTraverseMutationEffects(root2, finishedWork);
          offscreenSubtreeWasHidden = prevOffscreenSubtreeWasHidden;
          offscreenSubtreeIsHidden = prevOffscreenSubtreeIsHidden;
          wasHidden && !existingHiddenCallbacks && !prevOffscreenSubtreeIsHidden && !prevOffscreenSubtreeWasHidden && (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentReappeared(finishedWork, componentEffectStartTime, componentEffectEndTime);
          commitReconciliationEffects(finishedWork);
          if (flags & 8192)
            a:
              for (root2 = finishedWork.stateNode, root2._visibility = existingHiddenCallbacks ? root2._visibility & ~OffscreenVisible : root2._visibility | OffscreenVisible, !existingHiddenCallbacks || current2 === null || wasHidden || offscreenSubtreeIsHidden || offscreenSubtreeWasHidden || (recursivelyTraverseDisappearLayoutEffects(finishedWork), (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentTrigger(finishedWork, componentEffectStartTime, componentEffectEndTime, "Disconnect")), current2 = null, root2 = finishedWork;; ) {
                if (root2.tag === 5 || root2.tag === 26) {
                  if (current2 === null) {
                    wasHidden = current2 = root2;
                    try {
                      currentResource = wasHidden.stateNode, existingHiddenCallbacks ? runWithFiberInDEV(wasHidden, hideInstance, currentResource) : runWithFiberInDEV(wasHidden, unhideInstance, wasHidden.stateNode, wasHidden.memoizedProps);
                    } catch (error) {
                      captureCommitPhaseError(wasHidden, wasHidden.return, error);
                    }
                  }
                } else if (root2.tag === 6) {
                  if (current2 === null) {
                    wasHidden = root2;
                    try {
                      maybeNodes = wasHidden.stateNode, existingHiddenCallbacks ? runWithFiberInDEV(wasHidden, hideTextInstance, maybeNodes) : runWithFiberInDEV(wasHidden, unhideTextInstance, maybeNodes, wasHidden.memoizedProps);
                    } catch (error) {
                      captureCommitPhaseError(wasHidden, wasHidden.return, error);
                    }
                  }
                } else if (root2.tag === 18) {
                  if (current2 === null) {
                    wasHidden = root2;
                    try {
                      i = wasHidden.stateNode, existingHiddenCallbacks ? runWithFiberInDEV(wasHidden, hideDehydratedBoundary, i) : runWithFiberInDEV(wasHidden, unhideDehydratedBoundary, wasHidden.stateNode);
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
                  current2 === root2 && (current2 = null);
                  root2 = root2.return;
                }
                current2 === root2 && (current2 = null);
                root2.sibling.return = root2.return;
                root2 = root2.sibling;
              }
          flags & 4 && (flags = finishedWork.updateQueue, flags !== null && (current2 = flags.retryQueue, current2 !== null && (flags.retryQueue = null, attachSuspenseRetryListeners(finishedWork, current2))));
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
      (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && ((componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(finishedWork, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors), finishedWork.alternate === null && finishedWork.return !== null && finishedWork.return.alternate !== null && 0.05 < componentEffectEndTime - componentEffectStartTime && (isHydratingParent(finishedWork.return.alternate, finishedWork.return) || logComponentTrigger(finishedWork, componentEffectStartTime, componentEffectEndTime, "Mount")));
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectErrors = prevEffectErrors;
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
    }
    function commitReconciliationEffects(finishedWork) {
      var flags = finishedWork.flags;
      if (flags & 2) {
        try {
          runWithFiberInDEV(finishedWork, commitPlacement, finishedWork);
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
    function disappearLayoutEffects(finishedWork) {
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate();
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          commitHookLayoutUnmountEffects(finishedWork, finishedWork.return, Layout);
          recursivelyTraverseDisappearLayoutEffects(finishedWork);
          break;
        case 1:
          safelyDetachRef(finishedWork, finishedWork.return);
          var instance = finishedWork.stateNode;
          typeof instance.componentWillUnmount === "function" && safelyCallComponentWillUnmount(finishedWork, finishedWork.return, instance);
          recursivelyTraverseDisappearLayoutEffects(finishedWork);
          break;
        case 27:
          runWithFiberInDEV(finishedWork, releaseSingletonInstance, finishedWork.stateNode);
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
      (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && (componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(finishedWork, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors);
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectErrors = prevEffectErrors;
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
    }
    function recursivelyTraverseDisappearLayoutEffects(parentFiber) {
      for (parentFiber = parentFiber.child;parentFiber !== null; )
        disappearLayoutEffects(parentFiber), parentFiber = parentFiber.sibling;
    }
    function reappearLayoutEffects(finishedRoot, current2, finishedWork, includeWorkInProgressEffects) {
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate(), flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
          commitHookLayoutEffects(finishedWork, Layout);
          break;
        case 1:
          recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
          current2 = finishedWork.stateNode;
          typeof current2.componentDidMount === "function" && runWithFiberInDEV(finishedWork, callComponentDidMountInDEV, finishedWork, current2);
          current2 = finishedWork.updateQueue;
          if (current2 !== null) {
            finishedRoot = finishedWork.stateNode;
            try {
              runWithFiberInDEV(finishedWork, commitHiddenCallbacks, current2, finishedRoot);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
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
          includeWorkInProgressEffects && current2 === null && flags & 4 && commitHostMount(finishedWork);
          safelyAttachRef(finishedWork, finishedWork.return);
          break;
        case 12:
          if (includeWorkInProgressEffects && flags & 4) {
            flags = pushNestedEffectDurations();
            recursivelyTraverseReappearLayoutEffects(finishedRoot, finishedWork, includeWorkInProgressEffects);
            includeWorkInProgressEffects = finishedWork.stateNode;
            includeWorkInProgressEffects.effectDuration += bubbleNestedEffectDurations(flags);
            try {
              runWithFiberInDEV(finishedWork, commitProfiler, finishedWork, current2, commitStartTime, includeWorkInProgressEffects.effectDuration);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          } else
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
      (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && (componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(finishedWork, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors);
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectErrors = prevEffectErrors;
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
    }
    function recursivelyTraverseReappearLayoutEffects(finishedRoot, parentFiber, includeWorkInProgressEffects) {
      includeWorkInProgressEffects = includeWorkInProgressEffects && (parentFiber.subtreeFlags & 8772) !== 0;
      for (parentFiber = parentFiber.child;parentFiber !== null; )
        reappearLayoutEffects(finishedRoot, parentFiber.alternate, parentFiber, includeWorkInProgressEffects), parentFiber = parentFiber.sibling;
    }
    function commitOffscreenPassiveMountEffects(current2, finishedWork) {
      var previousCache = null;
      current2 !== null && current2.memoizedState !== null && current2.memoizedState.cachePool !== null && (previousCache = current2.memoizedState.cachePool.pool);
      current2 = null;
      finishedWork.memoizedState !== null && finishedWork.memoizedState.cachePool !== null && (current2 = finishedWork.memoizedState.cachePool.pool);
      current2 !== previousCache && (current2 != null && retainCache(current2), previousCache != null && releaseCache(previousCache));
    }
    function commitCachePassiveMountEffect(current2, finishedWork) {
      current2 = null;
      finishedWork.alternate !== null && (current2 = finishedWork.alternate.memoizedState.cache);
      finishedWork = finishedWork.memoizedState.cache;
      finishedWork !== current2 && (retainCache(finishedWork), current2 != null && releaseCache(current2));
    }
    function recursivelyTraversePassiveMountEffects(root2, parentFiber, committedLanes, committedTransitions, endTime) {
      if (parentFiber.subtreeFlags & 10256 || parentFiber.actualDuration !== 0 && (parentFiber.alternate === null || parentFiber.alternate.child !== parentFiber.child))
        for (parentFiber = parentFiber.child;parentFiber !== null; ) {
          var nextSibling = parentFiber.sibling;
          commitPassiveMountOnFiber(root2, parentFiber, committedLanes, committedTransitions, nextSibling !== null ? nextSibling.actualStartTime : endTime);
          parentFiber = nextSibling;
        }
    }
    function commitPassiveMountOnFiber(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime) {
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate(), prevDeepEquality = alreadyWarnedForDeepEquality, flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          (finishedWork.mode & ProfileMode) !== NoMode && 0 < finishedWork.actualStartTime && (finishedWork.flags & 1) !== 0 && logComponentRender(finishedWork, finishedWork.actualStartTime, endTime, inHydratedSubtree, committedLanes);
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
          flags & 2048 && commitHookPassiveMountEffects(finishedWork, Passive | HasEffect);
          break;
        case 1:
          (finishedWork.mode & ProfileMode) !== NoMode && 0 < finishedWork.actualStartTime && ((finishedWork.flags & 128) !== 0 ? logComponentErrored(finishedWork, finishedWork.actualStartTime, endTime, []) : (finishedWork.flags & 1) !== 0 && logComponentRender(finishedWork, finishedWork.actualStartTime, endTime, inHydratedSubtree, committedLanes));
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
          break;
        case 3:
          var prevProfilerEffectDuration = pushNestedEffectDurations(), wasInHydratedSubtree = inHydratedSubtree;
          inHydratedSubtree = finishedWork.alternate !== null && finishedWork.alternate.memoizedState.isDehydrated && (finishedWork.flags & 256) === 0;
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
          inHydratedSubtree = wasInHydratedSubtree;
          flags & 2048 && (committedLanes = null, finishedWork.alternate !== null && (committedLanes = finishedWork.alternate.memoizedState.cache), committedTransitions = finishedWork.memoizedState.cache, committedTransitions !== committedLanes && (retainCache(committedTransitions), committedLanes != null && releaseCache(committedLanes)));
          finishedRoot.passiveEffectDuration += popNestedEffectDurations(prevProfilerEffectDuration);
          break;
        case 12:
          if (flags & 2048) {
            flags = pushNestedEffectDurations();
            recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
            finishedRoot = finishedWork.stateNode;
            finishedRoot.passiveEffectDuration += bubbleNestedEffectDurations(flags);
            try {
              runWithFiberInDEV(finishedWork, commitProfilerPostCommitImpl, finishedWork, finishedWork.alternate, commitStartTime, finishedRoot.passiveEffectDuration);
            } catch (error) {
              captureCommitPhaseError(finishedWork, finishedWork.return, error);
            }
          } else
            recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
          break;
        case 31:
          flags = inHydratedSubtree;
          prevProfilerEffectDuration = finishedWork.alternate !== null ? finishedWork.alternate.memoizedState : null;
          wasInHydratedSubtree = finishedWork.memoizedState;
          prevProfilerEffectDuration !== null && wasInHydratedSubtree === null ? (wasInHydratedSubtree = finishedWork.deletions, wasInHydratedSubtree !== null && 0 < wasInHydratedSubtree.length && wasInHydratedSubtree[0].tag === 18 ? (inHydratedSubtree = false, prevProfilerEffectDuration = prevProfilerEffectDuration.hydrationErrors, prevProfilerEffectDuration !== null && logComponentErrored(finishedWork, finishedWork.actualStartTime, endTime, prevProfilerEffectDuration)) : inHydratedSubtree = true) : inHydratedSubtree = false;
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
          inHydratedSubtree = flags;
          break;
        case 13:
          flags = inHydratedSubtree;
          prevProfilerEffectDuration = finishedWork.alternate !== null ? finishedWork.alternate.memoizedState : null;
          wasInHydratedSubtree = finishedWork.memoizedState;
          prevProfilerEffectDuration === null || prevProfilerEffectDuration.dehydrated === null || wasInHydratedSubtree !== null && wasInHydratedSubtree.dehydrated !== null ? inHydratedSubtree = false : (wasInHydratedSubtree = finishedWork.deletions, wasInHydratedSubtree !== null && 0 < wasInHydratedSubtree.length && wasInHydratedSubtree[0].tag === 18 ? (inHydratedSubtree = false, prevProfilerEffectDuration = prevProfilerEffectDuration.hydrationErrors, prevProfilerEffectDuration !== null && logComponentErrored(finishedWork, finishedWork.actualStartTime, endTime, prevProfilerEffectDuration)) : inHydratedSubtree = true);
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
          inHydratedSubtree = flags;
          break;
        case 23:
          break;
        case 22:
          wasInHydratedSubtree = finishedWork.stateNode;
          prevProfilerEffectDuration = finishedWork.alternate;
          finishedWork.memoizedState !== null ? wasInHydratedSubtree._visibility & OffscreenPassiveEffectsConnected ? recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime) : recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime) : wasInHydratedSubtree._visibility & OffscreenPassiveEffectsConnected ? recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime) : (wasInHydratedSubtree._visibility |= OffscreenPassiveEffectsConnected, recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, (finishedWork.subtreeFlags & 10256) !== 0 || finishedWork.actualDuration !== 0 && (finishedWork.alternate === null || finishedWork.alternate.child !== finishedWork.child), endTime), (finishedWork.mode & ProfileMode) === NoMode || inHydratedSubtree || (finishedRoot = finishedWork.actualStartTime, 0 <= finishedRoot && 0.05 < endTime - finishedRoot && logComponentReappeared(finishedWork, finishedRoot, endTime), 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentReappeared(finishedWork, componentEffectStartTime, componentEffectEndTime)));
          flags & 2048 && commitOffscreenPassiveMountEffects(prevProfilerEffectDuration, finishedWork);
          break;
        case 24:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
          flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
          break;
        default:
          recursivelyTraversePassiveMountEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime);
      }
      if ((finishedWork.mode & ProfileMode) !== NoMode) {
        if (finishedRoot = !inHydratedSubtree && finishedWork.alternate === null && finishedWork.return !== null && finishedWork.return.alternate !== null)
          committedLanes = finishedWork.actualStartTime, 0 <= committedLanes && 0.05 < endTime - committedLanes && logComponentTrigger(finishedWork, committedLanes, endTime, "Mount");
        0 <= componentEffectStartTime && 0 <= componentEffectEndTime && ((componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(finishedWork, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors), finishedRoot && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentTrigger(finishedWork, componentEffectStartTime, componentEffectEndTime, "Mount"));
      }
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectErrors = prevEffectErrors;
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
      alreadyWarnedForDeepEquality = prevDeepEquality;
    }
    function recursivelyTraverseReconnectPassiveEffects(finishedRoot, parentFiber, committedLanes, committedTransitions, includeWorkInProgressEffects, endTime) {
      includeWorkInProgressEffects = includeWorkInProgressEffects && ((parentFiber.subtreeFlags & 10256) !== 0 || parentFiber.actualDuration !== 0 && (parentFiber.alternate === null || parentFiber.alternate.child !== parentFiber.child));
      for (parentFiber = parentFiber.child;parentFiber !== null; ) {
        var nextSibling = parentFiber.sibling;
        reconnectPassiveEffects(finishedRoot, parentFiber, committedLanes, committedTransitions, includeWorkInProgressEffects, nextSibling !== null ? nextSibling.actualStartTime : endTime);
        parentFiber = nextSibling;
      }
    }
    function reconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects, endTime) {
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate(), prevDeepEquality = alreadyWarnedForDeepEquality;
      includeWorkInProgressEffects && (finishedWork.mode & ProfileMode) !== NoMode && 0 < finishedWork.actualStartTime && (finishedWork.flags & 1) !== 0 && logComponentRender(finishedWork, finishedWork.actualStartTime, endTime, inHydratedSubtree, committedLanes);
      var flags = finishedWork.flags;
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects, endTime);
          commitHookPassiveMountEffects(finishedWork, Passive);
          break;
        case 23:
          break;
        case 22:
          var _instance2 = finishedWork.stateNode;
          finishedWork.memoizedState !== null ? _instance2._visibility & OffscreenPassiveEffectsConnected ? recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects, endTime) : recursivelyTraverseAtomicPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, endTime) : (_instance2._visibility |= OffscreenPassiveEffectsConnected, recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects, endTime));
          includeWorkInProgressEffects && flags & 2048 && commitOffscreenPassiveMountEffects(finishedWork.alternate, finishedWork);
          break;
        case 24:
          recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects, endTime);
          includeWorkInProgressEffects && flags & 2048 && commitCachePassiveMountEffect(finishedWork.alternate, finishedWork);
          break;
        default:
          recursivelyTraverseReconnectPassiveEffects(finishedRoot, finishedWork, committedLanes, committedTransitions, includeWorkInProgressEffects, endTime);
      }
      (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && (componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(finishedWork, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors);
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectErrors = prevEffectErrors;
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
      alreadyWarnedForDeepEquality = prevDeepEquality;
    }
    function recursivelyTraverseAtomicPassiveEffects(finishedRoot$jscomp$0, parentFiber, committedLanes$jscomp$0, committedTransitions$jscomp$0, endTime$jscomp$0) {
      if (parentFiber.subtreeFlags & 10256 || parentFiber.actualDuration !== 0 && (parentFiber.alternate === null || parentFiber.alternate.child !== parentFiber.child))
        for (var child = parentFiber.child;child !== null; ) {
          parentFiber = child.sibling;
          var finishedRoot = finishedRoot$jscomp$0, committedLanes = committedLanes$jscomp$0, committedTransitions = committedTransitions$jscomp$0, endTime = parentFiber !== null ? parentFiber.actualStartTime : endTime$jscomp$0, prevDeepEquality = alreadyWarnedForDeepEquality;
          (child.mode & ProfileMode) !== NoMode && 0 < child.actualStartTime && (child.flags & 1) !== 0 && logComponentRender(child, child.actualStartTime, endTime, inHydratedSubtree, committedLanes);
          var flags = child.flags;
          switch (child.tag) {
            case 22:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, child, committedLanes, committedTransitions, endTime);
              flags & 2048 && commitOffscreenPassiveMountEffects(child.alternate, child);
              break;
            case 24:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, child, committedLanes, committedTransitions, endTime);
              flags & 2048 && commitCachePassiveMountEffect(child.alternate, child);
              break;
            default:
              recursivelyTraverseAtomicPassiveEffects(finishedRoot, child, committedLanes, committedTransitions, endTime);
          }
          alreadyWarnedForDeepEquality = prevDeepEquality;
          child = parentFiber;
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
            var childToDelete = deletions[i], prevEffectStart = pushComponentEffectStart();
            nextEffect = childToDelete;
            commitPassiveUnmountEffectsInsideOfDeletedTree_begin(childToDelete, parentFiber);
            (childToDelete.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentTrigger(childToDelete, componentEffectStartTime, componentEffectEndTime, "Unmount");
            popComponentEffectStart(prevEffectStart);
          }
        detachAlternateSiblings(parentFiber);
      }
      if (parentFiber.subtreeFlags & 10256)
        for (parentFiber = parentFiber.child;parentFiber !== null; )
          commitPassiveUnmountOnFiber(parentFiber), parentFiber = parentFiber.sibling;
    }
    function commitPassiveUnmountOnFiber(finishedWork) {
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate();
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          finishedWork.flags & 2048 && commitHookPassiveUnmountEffects(finishedWork, finishedWork.return, Passive | HasEffect);
          break;
        case 3:
          var prevProfilerEffectDuration = pushNestedEffectDurations();
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          finishedWork.stateNode.passiveEffectDuration += popNestedEffectDurations(prevProfilerEffectDuration);
          break;
        case 12:
          prevProfilerEffectDuration = pushNestedEffectDurations();
          recursivelyTraversePassiveUnmountEffects(finishedWork);
          finishedWork.stateNode.passiveEffectDuration += bubbleNestedEffectDurations(prevProfilerEffectDuration);
          break;
        case 22:
          prevProfilerEffectDuration = finishedWork.stateNode;
          finishedWork.memoizedState !== null && prevProfilerEffectDuration._visibility & OffscreenPassiveEffectsConnected && (finishedWork.return === null || finishedWork.return.tag !== 13) ? (prevProfilerEffectDuration._visibility &= ~OffscreenPassiveEffectsConnected, recursivelyTraverseDisconnectPassiveEffects(finishedWork), (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentTrigger(finishedWork, componentEffectStartTime, componentEffectEndTime, "Disconnect")) : recursivelyTraversePassiveUnmountEffects(finishedWork);
          break;
        default:
          recursivelyTraversePassiveUnmountEffects(finishedWork);
      }
      (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && (componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(finishedWork, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors);
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
      componentEffectErrors = prevEffectErrors;
    }
    function recursivelyTraverseDisconnectPassiveEffects(parentFiber) {
      var deletions = parentFiber.deletions;
      if ((parentFiber.flags & 16) !== 0) {
        if (deletions !== null)
          for (var i = 0;i < deletions.length; i++) {
            var childToDelete = deletions[i], prevEffectStart = pushComponentEffectStart();
            nextEffect = childToDelete;
            commitPassiveUnmountEffectsInsideOfDeletedTree_begin(childToDelete, parentFiber);
            (childToDelete.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && 0.05 < componentEffectEndTime - componentEffectStartTime && logComponentTrigger(childToDelete, componentEffectStartTime, componentEffectEndTime, "Unmount");
            popComponentEffectStart(prevEffectStart);
          }
        detachAlternateSiblings(parentFiber);
      }
      for (parentFiber = parentFiber.child;parentFiber !== null; )
        disconnectPassiveEffect(parentFiber), parentFiber = parentFiber.sibling;
    }
    function disconnectPassiveEffect(finishedWork) {
      var prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate();
      switch (finishedWork.tag) {
        case 0:
        case 11:
        case 15:
          commitHookPassiveUnmountEffects(finishedWork, finishedWork.return, Passive);
          recursivelyTraverseDisconnectPassiveEffects(finishedWork);
          break;
        case 22:
          var instance = finishedWork.stateNode;
          instance._visibility & OffscreenPassiveEffectsConnected && (instance._visibility &= ~OffscreenPassiveEffectsConnected, recursivelyTraverseDisconnectPassiveEffects(finishedWork));
          break;
        default:
          recursivelyTraverseDisconnectPassiveEffects(finishedWork);
      }
      (finishedWork.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && (componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(finishedWork, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors);
      popComponentEffectStart(prevEffectStart);
      popComponentEffectDuration(prevEffectDuration);
      componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
      componentEffectErrors = prevEffectErrors;
    }
    function commitPassiveUnmountEffectsInsideOfDeletedTree_begin(deletedSubtreeRoot, nearestMountedAncestor$jscomp$0) {
      for (;nextEffect !== null; ) {
        var fiber = nextEffect, current2 = fiber, nearestMountedAncestor = nearestMountedAncestor$jscomp$0, prevEffectStart = pushComponentEffectStart(), prevEffectDuration = pushComponentEffectDuration(), prevEffectErrors = pushComponentEffectErrors(), prevEffectDidSpawnUpdate = pushComponentEffectDidSpawnUpdate();
        switch (current2.tag) {
          case 0:
          case 11:
          case 15:
            commitHookPassiveUnmountEffects(current2, nearestMountedAncestor, Passive);
            break;
          case 23:
          case 22:
            current2.memoizedState !== null && current2.memoizedState.cachePool !== null && (nearestMountedAncestor = current2.memoizedState.cachePool.pool, nearestMountedAncestor != null && retainCache(nearestMountedAncestor));
            break;
          case 24:
            releaseCache(current2.memoizedState.cache);
        }
        (current2.mode & ProfileMode) !== NoMode && 0 <= componentEffectStartTime && 0 <= componentEffectEndTime && (componentEffectSpawnedUpdate || 0.05 < componentEffectDuration) && logComponentEffect(current2, componentEffectStartTime, componentEffectEndTime, componentEffectDuration, componentEffectErrors);
        popComponentEffectStart(prevEffectStart);
        popComponentEffectDuration(prevEffectDuration);
        componentEffectSpawnedUpdate = prevEffectDidSpawnUpdate;
        componentEffectErrors = prevEffectErrors;
        current2 = fiber.child;
        if (current2 !== null)
          current2.return = fiber, nextEffect = current2;
        else
          a:
            for (fiber = deletedSubtreeRoot;nextEffect !== null; ) {
              current2 = nextEffect;
              prevEffectStart = current2.sibling;
              prevEffectDuration = current2.return;
              detachFiberAfterEffects(current2);
              if (current2 === fiber) {
                nextEffect = null;
                break a;
              }
              if (prevEffectStart !== null) {
                prevEffectStart.return = prevEffectDuration;
                nextEffect = prevEffectStart;
                break a;
              }
              nextEffect = prevEffectDuration;
            }
      }
    }
    function onCommitRoot() {
      commitHooks.forEach(function(commitHook) {
        return commitHook();
      });
    }
    function isConcurrentActEnvironment() {
      var isReactActEnvironmentGlobal = typeof IS_REACT_ACT_ENVIRONMENT !== "undefined" ? IS_REACT_ACT_ENVIRONMENT : undefined;
      isReactActEnvironmentGlobal || ReactSharedInternals.actQueue === null || console.error("The current testing environment is not configured to support act(...)");
      return isReactActEnvironmentGlobal;
    }
    function requestUpdateLane(fiber) {
      if ((executionContext & RenderContext) !== NoContext && workInProgressRootRenderLanes !== 0)
        return workInProgressRootRenderLanes & -workInProgressRootRenderLanes;
      var transition = ReactSharedInternals.T;
      return transition !== null ? (transition._updatedFibers || (transition._updatedFibers = new Set), transition._updatedFibers.add(fiber), requestTransitionLane()) : resolveUpdatePriority();
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
      isRunningInsertionEffect && console.error("useInsertionEffect must not schedule updates.");
      isFlushingPassiveEffects && (didScheduleUpdateDuringPassiveEffects = true);
      if (root2 === workInProgressRoot && (workInProgressSuspendedReason === SuspendedOnData || workInProgressSuspendedReason === SuspendedOnAction) || root2.cancelPendingCommit !== null)
        prepareFreshStack(root2, 0), markRootSuspended(root2, workInProgressRootRenderLanes, workInProgressDeferredLane, false);
      markRootUpdated$1(root2, lane);
      if ((executionContext & RenderContext) !== NoContext && root2 === workInProgressRoot) {
        if (isRendering)
          switch (fiber.tag) {
            case 0:
            case 11:
            case 15:
              root2 = workInProgress && getComponentNameFromFiber(workInProgress) || "Unknown";
              didWarnAboutUpdateInRenderForAnotherComponent.has(root2) || (didWarnAboutUpdateInRenderForAnotherComponent.add(root2), fiber = getComponentNameFromFiber(fiber) || "Unknown", console.error("Cannot update a component (`%s`) while rendering a different component (`%s`). To locate the bad setState() call inside `%s`, follow the stack trace as described in https://react.dev/link/setstate-in-render", fiber, root2, root2));
              break;
            case 1:
              didWarnAboutUpdateInRender || (console.error("Cannot update during an existing state transition (such as within `render`). Render methods should be a pure function of props and state."), didWarnAboutUpdateInRender = true);
          }
      } else
        isDevToolsPresent && addFiberToLanesMap(root2, fiber, lane), warnIfUpdatesNotWrappedWithActDEV(fiber), root2 === workInProgressRoot && ((executionContext & RenderContext) === NoContext && (workInProgressRootInterleavedUpdatedLanes |= lane), workInProgressRootExitStatus === RootSuspendedWithDelay && markRootSuspended(root2, workInProgressRootRenderLanes, workInProgressDeferredLane, false)), ensureRootIsScheduled(root2);
    }
    function performWorkOnRoot(root2, lanes, forceSync) {
      if ((executionContext & (RenderContext | CommitContext)) !== NoContext)
        throw Error("Should not already be working.");
      if (workInProgressRootRenderLanes !== 0 && workInProgress !== null) {
        var yieldedFiber = workInProgress, yieldEndTime = now$1();
        switch (yieldReason) {
          case SuspendedOnImmediate:
          case SuspendedOnData:
            var startTime = yieldStartTime;
            supportsUserTiming && ((yieldedFiber = yieldedFiber._debugTask) ? yieldedFiber.run(console.timeStamp.bind(console, "Suspended", startTime, yieldEndTime, COMPONENTS_TRACK, undefined, "primary-light")) : console.timeStamp("Suspended", startTime, yieldEndTime, COMPONENTS_TRACK, undefined, "primary-light"));
            break;
          case SuspendedOnAction:
            startTime = yieldStartTime;
            supportsUserTiming && ((yieldedFiber = yieldedFiber._debugTask) ? yieldedFiber.run(console.timeStamp.bind(console, "Action", startTime, yieldEndTime, COMPONENTS_TRACK, undefined, "primary-light")) : console.timeStamp("Action", startTime, yieldEndTime, COMPONENTS_TRACK, undefined, "primary-light"));
            break;
          default:
            supportsUserTiming && (yieldedFiber = yieldEndTime - yieldStartTime, 3 > yieldedFiber || console.timeStamp("Blocked", yieldStartTime, yieldEndTime, COMPONENTS_TRACK, undefined, 5 > yieldedFiber ? "primary-light" : 10 > yieldedFiber ? "primary" : 100 > yieldedFiber ? "primary-dark" : "error"));
        }
      }
      startTime = (forceSync = !forceSync && (lanes & 127) === 0 && (lanes & root2.expiredLanes) === 0 || checkIfRootIsPrerendering(root2, lanes)) ? renderRootConcurrent(root2, lanes) : renderRootSync(root2, lanes, true);
      var renderWasConcurrent = forceSync;
      do {
        if (startTime === RootInProgress) {
          workInProgressRootIsPrerendering && !forceSync && markRootSuspended(root2, lanes, 0, false);
          lanes = workInProgressSuspendedReason;
          yieldStartTime = now();
          yieldReason = lanes;
          break;
        } else {
          yieldedFiber = now$1();
          yieldEndTime = root2.current.alternate;
          if (renderWasConcurrent && !isRenderConsistentWithExternalStores(yieldEndTime)) {
            setCurrentTrackFromLanes(lanes);
            yieldEndTime = renderStartTime;
            startTime = yieldedFiber;
            !supportsUserTiming || startTime <= yieldEndTime || (workInProgressUpdateTask ? workInProgressUpdateTask.run(console.timeStamp.bind(console, "Teared Render", yieldEndTime, startTime, currentTrack, LANES_TRACK_GROUP, "error")) : console.timeStamp("Teared Render", yieldEndTime, startTime, currentTrack, LANES_TRACK_GROUP, "error"));
            finalizeRender(lanes, yieldedFiber);
            startTime = renderRootSync(root2, lanes, false);
            renderWasConcurrent = false;
            continue;
          }
          if (startTime === RootErrored) {
            renderWasConcurrent = lanes;
            if (root2.errorRecoveryDisabledLanes & renderWasConcurrent)
              var errorRetryLanes = 0;
            else
              errorRetryLanes = root2.pendingLanes & -536870913, errorRetryLanes = errorRetryLanes !== 0 ? errorRetryLanes : errorRetryLanes & 536870912 ? 536870912 : 0;
            if (errorRetryLanes !== 0) {
              setCurrentTrackFromLanes(lanes);
              logErroredRenderPhase(renderStartTime, yieldedFiber, lanes, workInProgressUpdateTask);
              finalizeRender(lanes, yieldedFiber);
              lanes = errorRetryLanes;
              a: {
                yieldedFiber = root2;
                startTime = renderWasConcurrent;
                renderWasConcurrent = workInProgressRootConcurrentErrors;
                var wasRootDehydrated = yieldedFiber.current.memoizedState.isDehydrated;
                wasRootDehydrated && (prepareFreshStack(yieldedFiber, errorRetryLanes).flags |= 256);
                errorRetryLanes = renderRootSync(yieldedFiber, errorRetryLanes, false);
                if (errorRetryLanes !== RootErrored) {
                  if (workInProgressRootDidAttachPingListener && !wasRootDehydrated) {
                    yieldedFiber.errorRecoveryDisabledLanes |= startTime;
                    workInProgressRootInterleavedUpdatedLanes |= startTime;
                    startTime = RootSuspendedWithDelay;
                    break a;
                  }
                  yieldedFiber = workInProgressRootRecoverableErrors;
                  workInProgressRootRecoverableErrors = renderWasConcurrent;
                  yieldedFiber !== null && (workInProgressRootRecoverableErrors === null ? workInProgressRootRecoverableErrors = yieldedFiber : workInProgressRootRecoverableErrors.push.apply(workInProgressRootRecoverableErrors, yieldedFiber));
                }
                startTime = errorRetryLanes;
              }
              renderWasConcurrent = false;
              if (startTime !== RootErrored)
                continue;
              else
                yieldedFiber = now$1();
            }
          }
          if (startTime === RootFatalErrored) {
            setCurrentTrackFromLanes(lanes);
            logErroredRenderPhase(renderStartTime, yieldedFiber, lanes, workInProgressUpdateTask);
            finalizeRender(lanes, yieldedFiber);
            prepareFreshStack(root2, 0);
            markRootSuspended(root2, lanes, 0, true);
            break;
          }
          a: {
            forceSync = root2;
            switch (startTime) {
              case RootInProgress:
              case RootFatalErrored:
                throw Error("Root did not complete. This is a bug in React.");
              case RootSuspendedWithDelay:
                if ((lanes & 4194048) !== lanes)
                  break;
              case RootSuspendedAtTheShell:
                setCurrentTrackFromLanes(lanes);
                logSuspendedRenderPhase(renderStartTime, yieldedFiber, lanes, workInProgressUpdateTask);
                finalizeRender(lanes, yieldedFiber);
                yieldEndTime = lanes;
                (yieldEndTime & 127) !== 0 ? blockingSuspendedTime = yieldedFiber : (yieldEndTime & 4194048) !== 0 && (transitionSuspendedTime = yieldedFiber);
                markRootSuspended(forceSync, lanes, workInProgressDeferredLane, !workInProgressRootDidSkipSuspendedSiblings);
                break a;
              case RootErrored:
                workInProgressRootRecoverableErrors = null;
                break;
              case RootSuspended:
              case RootCompleted:
                break;
              default:
                throw Error("Unknown root exit status.");
            }
            if (ReactSharedInternals.actQueue !== null)
              commitRoot(forceSync, yieldEndTime, lanes, workInProgressRootRecoverableErrors, workInProgressTransitions, workInProgressRootDidIncludeRecursiveRenderUpdate, workInProgressDeferredLane, workInProgressRootInterleavedUpdatedLanes, workInProgressSuspendedRetryLanes, startTime, null, null, renderStartTime, yieldedFiber);
            else {
              if ((lanes & 62914560) === lanes && (renderWasConcurrent = globalMostRecentFallbackTime + FALLBACK_THROTTLE_MS - now$1(), 10 < renderWasConcurrent)) {
                markRootSuspended(forceSync, lanes, workInProgressDeferredLane, !workInProgressRootDidSkipSuspendedSiblings);
                if (getNextLanes(forceSync, 0, true) !== 0)
                  break a;
                pendingEffectsLanes = lanes;
                forceSync.timeoutHandle = scheduleTimeout(commitRootWhenReady.bind(null, forceSync, yieldEndTime, workInProgressRootRecoverableErrors, workInProgressTransitions, workInProgressRootDidIncludeRecursiveRenderUpdate, lanes, workInProgressDeferredLane, workInProgressRootInterleavedUpdatedLanes, workInProgressSuspendedRetryLanes, workInProgressRootDidSkipSuspendedSiblings, startTime, "Throttled", renderStartTime, yieldedFiber), renderWasConcurrent);
                break a;
              }
              commitRootWhenReady(forceSync, yieldEndTime, workInProgressRootRecoverableErrors, workInProgressTransitions, workInProgressRootDidIncludeRecursiveRenderUpdate, lanes, workInProgressDeferredLane, workInProgressRootInterleavedUpdatedLanes, workInProgressSuspendedRetryLanes, workInProgressRootDidSkipSuspendedSiblings, startTime, null, renderStartTime, yieldedFiber);
            }
          }
        }
        break;
      } while (1);
      ensureRootIsScheduled(root2);
    }
    function commitRootWhenReady(root2, finishedWork, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, lanes, spawnedLane, updatedLanes, suspendedRetryLanes, didSkipSuspendedSiblings, exitStatus, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
      root2.timeoutHandle = noTimeout;
      var subtreeFlags = finishedWork.subtreeFlags, suspendedState = null;
      if (subtreeFlags & 8192 || (subtreeFlags & 16785408) === 16785408) {
        if (suspendedState = {
          stylesheets: null,
          count: 0,
          imgCount: 0,
          imgBytes: 0,
          suspenseyImages: [],
          waitingForImages: true,
          waitingForViewTransition: false,
          unsuspend: noop$1
        }, accumulateSuspenseyCommitOnFiber(finishedWork, lanes, suspendedState), subtreeFlags = (lanes & 62914560) === lanes ? globalMostRecentFallbackTime - now$1() : (lanes & 4194048) === lanes ? globalMostRecentTransitionTime - now$1() : 0, subtreeFlags = waitForCommitToBeReady(suspendedState, subtreeFlags), subtreeFlags !== null) {
          pendingEffectsLanes = lanes;
          root2.cancelPendingCommit = subtreeFlags(commitRoot.bind(null, root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes, exitStatus, suspendedState, suspendedState.waitingForViewTransition ? "Waiting for the previous Animation" : 0 < suspendedState.count ? 0 < suspendedState.imgCount ? "Suspended on CSS and Images" : "Suspended on CSS" : suspendedState.imgCount === 1 ? "Suspended on an Image" : 0 < suspendedState.imgCount ? "Suspended on Images" : null, completedRenderStartTime, completedRenderEndTime));
          markRootSuspended(root2, lanes, spawnedLane, !didSkipSuspendedSiblings);
          return;
        }
      }
      commitRoot(root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes, exitStatus, suspendedState, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime);
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
        var index = 31 - clz32(lanes), lane = 1 << index;
        didAttemptEntireTree[index] = -1;
        lanes &= ~lane;
      }
      spawnedLane !== 0 && markSpawnedDeferredLane(root2, spawnedLane, suspendedLanes);
    }
    function flushSyncWork$1() {
      return (executionContext & (RenderContext | CommitContext)) === NoContext ? (flushSyncWorkAcrossRoots_impl(0, false), false) : true;
    }
    function resetWorkInProgressStack() {
      if (workInProgress !== null) {
        if (workInProgressSuspendedReason === NotSuspended)
          var interruptedWork = workInProgress.return;
        else
          interruptedWork = workInProgress, resetContextDependencies(), resetHooksOnUnwind(interruptedWork), thenableState$1 = null, thenableIndexCounter$1 = 0, interruptedWork = workInProgress;
        for (;interruptedWork !== null; )
          unwindInterruptedWork(interruptedWork.alternate, interruptedWork), interruptedWork = interruptedWork.return;
        workInProgress = null;
      }
    }
    function finalizeRender(lanes, finalizationTime) {
      (lanes & 127) !== 0 && (blockingClampTime = finalizationTime);
      (lanes & 4194048) !== 0 && (transitionClampTime = finalizationTime);
      (lanes & 62914560) !== 0 && (retryClampTime = finalizationTime);
      (lanes & 2080374784) !== 0 && (idleClampTime = finalizationTime);
    }
    function prepareFreshStack(root2, lanes) {
      supportsUserTiming && (console.timeStamp("Blocking Track", 0.003, 0.003, "Blocking", LANES_TRACK_GROUP, "primary-light"), console.timeStamp("Transition Track", 0.003, 0.003, "Transition", LANES_TRACK_GROUP, "primary-light"), console.timeStamp("Suspense Track", 0.003, 0.003, "Suspense", LANES_TRACK_GROUP, "primary-light"), console.timeStamp("Idle Track", 0.003, 0.003, "Idle", LANES_TRACK_GROUP, "primary-light"));
      var previousRenderStartTime = renderStartTime;
      renderStartTime = now();
      if (workInProgressRootRenderLanes !== 0 && 0 < previousRenderStartTime) {
        setCurrentTrackFromLanes(workInProgressRootRenderLanes);
        if (workInProgressRootExitStatus === RootSuspended || workInProgressRootExitStatus === RootSuspendedWithDelay)
          logSuspendedRenderPhase(previousRenderStartTime, renderStartTime, lanes, workInProgressUpdateTask);
        else {
          var endTime = renderStartTime, debugTask = workInProgressUpdateTask;
          if (supportsUserTiming && !(endTime <= previousRenderStartTime)) {
            var color = (lanes & 738197653) === lanes ? "tertiary-dark" : "primary-dark", label = (lanes & 536870912) === lanes ? "Prewarm" : (lanes & 201326741) === lanes ? "Interrupted Hydration" : "Interrupted Render";
            debugTask ? debugTask.run(console.timeStamp.bind(console, label, previousRenderStartTime, endTime, currentTrack, LANES_TRACK_GROUP, color)) : console.timeStamp(label, previousRenderStartTime, endTime, currentTrack, LANES_TRACK_GROUP, color);
          }
        }
        finalizeRender(workInProgressRootRenderLanes, renderStartTime);
      }
      previousRenderStartTime = workInProgressUpdateTask;
      workInProgressUpdateTask = null;
      if ((lanes & 127) !== 0) {
        workInProgressUpdateTask = blockingUpdateTask;
        debugTask = 0 <= blockingUpdateTime && blockingUpdateTime < blockingClampTime ? blockingClampTime : blockingUpdateTime;
        endTime = 0 <= blockingEventTime && blockingEventTime < blockingClampTime ? blockingClampTime : blockingEventTime;
        color = 0 <= endTime ? endTime : 0 <= debugTask ? debugTask : renderStartTime;
        0 <= blockingSuspendedTime ? (setCurrentTrackFromLanes(2), logSuspendedWithDelayPhase(blockingSuspendedTime, color, lanes, previousRenderStartTime)) : (animatingLanes & 127) !== 0 && (setCurrentTrackFromLanes(2), logAnimatingPhase(blockingClampTime, color, animatingTask));
        previousRenderStartTime = debugTask;
        var eventTime = endTime, eventType = blockingEventType, eventIsRepeat = 0 < blockingEventRepeatTime, isSpawnedUpdate = blockingUpdateType === SPAWNED_UPDATE, isPingedUpdate = blockingUpdateType === PINGED_UPDATE;
        debugTask = renderStartTime;
        endTime = blockingUpdateTask;
        color = blockingUpdateMethodName;
        label = blockingUpdateComponentName;
        if (supportsUserTiming) {
          currentTrack = "Blocking";
          0 < previousRenderStartTime ? previousRenderStartTime > debugTask && (previousRenderStartTime = debugTask) : previousRenderStartTime = debugTask;
          0 < eventTime ? eventTime > previousRenderStartTime && (eventTime = previousRenderStartTime) : eventTime = previousRenderStartTime;
          if (eventType !== null && previousRenderStartTime > eventTime) {
            var color$jscomp$0 = eventIsRepeat ? "secondary-light" : "warning";
            endTime ? endTime.run(console.timeStamp.bind(console, eventIsRepeat ? "Consecutive" : "Event: " + eventType, eventTime, previousRenderStartTime, currentTrack, LANES_TRACK_GROUP, color$jscomp$0)) : console.timeStamp(eventIsRepeat ? "Consecutive" : "Event: " + eventType, eventTime, previousRenderStartTime, currentTrack, LANES_TRACK_GROUP, color$jscomp$0);
          }
          debugTask > previousRenderStartTime && (eventTime = isSpawnedUpdate ? "error" : (lanes & 738197653) === lanes ? "tertiary-light" : "primary-light", isSpawnedUpdate = isPingedUpdate ? "Promise Resolved" : isSpawnedUpdate ? "Cascading Update" : 5 < debugTask - previousRenderStartTime ? "Update Blocked" : "Update", isPingedUpdate = [], label != null && isPingedUpdate.push(["Component name", label]), color != null && isPingedUpdate.push(["Method name", color]), previousRenderStartTime = {
            start: previousRenderStartTime,
            end: debugTask,
            detail: {
              devtools: {
                properties: isPingedUpdate,
                track: currentTrack,
                trackGroup: LANES_TRACK_GROUP,
                color: eventTime
              }
            }
          }, endTime ? endTime.run(performance.measure.bind(performance, isSpawnedUpdate, previousRenderStartTime)) : performance.measure(isSpawnedUpdate, previousRenderStartTime));
        }
        blockingUpdateTime = -1.1;
        blockingUpdateType = 0;
        blockingUpdateComponentName = blockingUpdateMethodName = null;
        blockingSuspendedTime = -1.1;
        blockingEventRepeatTime = blockingEventTime;
        blockingEventTime = -1.1;
        blockingClampTime = now();
      }
      (lanes & 4194048) !== 0 && (workInProgressUpdateTask = transitionUpdateTask, debugTask = 0 <= transitionStartTime && transitionStartTime < transitionClampTime ? transitionClampTime : transitionStartTime, previousRenderStartTime = 0 <= transitionUpdateTime && transitionUpdateTime < transitionClampTime ? transitionClampTime : transitionUpdateTime, endTime = 0 <= transitionEventTime && transitionEventTime < transitionClampTime ? transitionClampTime : transitionEventTime, color = 0 <= endTime ? endTime : 0 <= previousRenderStartTime ? previousRenderStartTime : renderStartTime, 0 <= transitionSuspendedTime ? (setCurrentTrackFromLanes(256), logSuspendedWithDelayPhase(transitionSuspendedTime, color, lanes, workInProgressUpdateTask)) : (animatingLanes & 4194048) !== 0 && (setCurrentTrackFromLanes(256), logAnimatingPhase(transitionClampTime, color, animatingTask)), isPingedUpdate = endTime, eventTime = transitionEventType, eventType = 0 < transitionEventRepeatTime, eventIsRepeat = transitionUpdateType === PINGED_UPDATE, color = renderStartTime, endTime = transitionUpdateTask, label = transitionUpdateMethodName, isSpawnedUpdate = transitionUpdateComponentName, supportsUserTiming && (currentTrack = "Transition", 0 < previousRenderStartTime ? previousRenderStartTime > color && (previousRenderStartTime = color) : previousRenderStartTime = color, 0 < debugTask ? debugTask > previousRenderStartTime && (debugTask = previousRenderStartTime) : debugTask = previousRenderStartTime, 0 < isPingedUpdate ? isPingedUpdate > debugTask && (isPingedUpdate = debugTask) : isPingedUpdate = debugTask, debugTask > isPingedUpdate && eventTime !== null && (color$jscomp$0 = eventType ? "secondary-light" : "warning", endTime ? endTime.run(console.timeStamp.bind(console, eventType ? "Consecutive" : "Event: " + eventTime, isPingedUpdate, debugTask, currentTrack, LANES_TRACK_GROUP, color$jscomp$0)) : console.timeStamp(eventType ? "Consecutive" : "Event: " + eventTime, isPingedUpdate, debugTask, currentTrack, LANES_TRACK_GROUP, color$jscomp$0)), previousRenderStartTime > debugTask && (endTime ? endTime.run(console.timeStamp.bind(console, "Action", debugTask, previousRenderStartTime, currentTrack, LANES_TRACK_GROUP, "primary-dark")) : console.timeStamp("Action", debugTask, previousRenderStartTime, currentTrack, LANES_TRACK_GROUP, "primary-dark")), color > previousRenderStartTime && (debugTask = eventIsRepeat ? "Promise Resolved" : 5 < color - previousRenderStartTime ? "Update Blocked" : "Update", isPingedUpdate = [], isSpawnedUpdate != null && isPingedUpdate.push(["Component name", isSpawnedUpdate]), label != null && isPingedUpdate.push(["Method name", label]), previousRenderStartTime = {
        start: previousRenderStartTime,
        end: color,
        detail: {
          devtools: {
            properties: isPingedUpdate,
            track: currentTrack,
            trackGroup: LANES_TRACK_GROUP,
            color: "primary-light"
          }
        }
      }, endTime ? endTime.run(performance.measure.bind(performance, debugTask, previousRenderStartTime)) : performance.measure(debugTask, previousRenderStartTime))), transitionUpdateTime = transitionStartTime = -1.1, transitionUpdateType = 0, transitionSuspendedTime = -1.1, transitionEventRepeatTime = transitionEventTime, transitionEventTime = -1.1, transitionClampTime = now());
      (lanes & 62914560) !== 0 && (animatingLanes & 62914560) !== 0 && (setCurrentTrackFromLanes(4194304), logAnimatingPhase(retryClampTime, renderStartTime, animatingTask));
      (lanes & 2080374784) !== 0 && (animatingLanes & 2080374784) !== 0 && (setCurrentTrackFromLanes(268435456), logAnimatingPhase(idleClampTime, renderStartTime, animatingTask));
      previousRenderStartTime = root2.timeoutHandle;
      previousRenderStartTime !== noTimeout && (root2.timeoutHandle = noTimeout, cancelTimeout(previousRenderStartTime));
      previousRenderStartTime = root2.cancelPendingCommit;
      previousRenderStartTime !== null && (root2.cancelPendingCommit = null, previousRenderStartTime());
      pendingEffectsLanes = 0;
      resetWorkInProgressStack();
      workInProgressRoot = root2;
      workInProgress = previousRenderStartTime = createWorkInProgress(root2.current, null);
      workInProgressRootRenderLanes = lanes;
      workInProgressSuspendedReason = NotSuspended;
      workInProgressThrownValue = null;
      workInProgressRootDidSkipSuspendedSiblings = false;
      workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root2, lanes);
      workInProgressRootDidAttachPingListener = false;
      workInProgressRootExitStatus = RootInProgress;
      workInProgressSuspendedRetryLanes = workInProgressDeferredLane = workInProgressRootPingedLanes = workInProgressRootInterleavedUpdatedLanes = workInProgressRootSkippedLanes = 0;
      workInProgressRootRecoverableErrors = workInProgressRootConcurrentErrors = null;
      workInProgressRootDidIncludeRecursiveRenderUpdate = false;
      (lanes & 8) !== 0 && (lanes |= lanes & 32);
      endTime = root2.entangledLanes;
      if (endTime !== 0)
        for (root2 = root2.entanglements, endTime &= lanes;0 < endTime; )
          debugTask = 31 - clz32(endTime), color = 1 << debugTask, lanes |= root2[debugTask], endTime &= ~color;
      entangledRenderLanes = lanes;
      finishQueueingConcurrentUpdates();
      root2 = getCurrentTime();
      1000 < root2 - lastResetTime && (ReactSharedInternals.recentlyCreatedOwnerStacks = 0, lastResetTime = root2);
      ReactStrictModeWarnings.discardPendingWarnings();
      return previousRenderStartTime;
    }
    function handleThrow(root2, thrownValue) {
      currentlyRenderingFiber = null;
      ReactSharedInternals.H = ContextOnlyDispatcher;
      ReactSharedInternals.getCurrentStack = null;
      isRendering = false;
      current = null;
      thrownValue === SuspenseException || thrownValue === SuspenseActionException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = SuspendedOnImmediate) : thrownValue === SuspenseyCommitException ? (thrownValue = getSuspendedThenable(), workInProgressSuspendedReason = SuspendedOnInstance) : workInProgressSuspendedReason = thrownValue === SelectiveHydrationException ? SuspendedOnHydration : thrownValue !== null && typeof thrownValue === "object" && typeof thrownValue.then === "function" ? SuspendedOnDeprecatedThrowPromise : SuspendedOnError;
      workInProgressThrownValue = thrownValue;
      var erroredWork = workInProgress;
      erroredWork === null ? (workInProgressRootExitStatus = RootFatalErrored, logUncaughtError(root2, createCapturedValueAtFiber(thrownValue, root2.current))) : erroredWork.mode & ProfileMode && stopProfilerTimerIfRunningAndRecordDuration(erroredWork);
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
    function markRenderDerivedCause(fiber) {
      workInProgressUpdateTask === null && (workInProgressUpdateTask = fiber._debugTask == null ? null : fiber._debugTask);
    }
    function renderDidSuspendDelayIfPossible() {
      workInProgressRootExitStatus = RootSuspendedWithDelay;
      workInProgressRootDidSkipSuspendedSiblings || (workInProgressRootRenderLanes & 4194048) !== workInProgressRootRenderLanes && suspenseHandlerStackCursor.current !== null || (workInProgressRootIsPrerendering = true);
      (workInProgressRootSkippedLanes & 134217727) === 0 && (workInProgressRootInterleavedUpdatedLanes & 134217727) === 0 || workInProgressRoot === null || markRootSuspended(workInProgressRoot, workInProgressRootRenderLanes, workInProgressDeferredLane, false);
    }
    function renderRootSync(root2, lanes, shouldYieldForPrerendering) {
      var prevExecutionContext = executionContext;
      executionContext |= RenderContext;
      var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
      if (workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes) {
        if (isDevToolsPresent) {
          var memoizedUpdaters = root2.memoizedUpdaters;
          0 < memoizedUpdaters.size && (restorePendingUpdaters(root2, workInProgressRootRenderLanes), memoizedUpdaters.clear());
          movePendingFibersToMemoized(root2, lanes);
        }
        workInProgressTransitions = null;
        prepareFreshStack(root2, lanes);
      }
      lanes = false;
      memoizedUpdaters = workInProgressRootExitStatus;
      a:
        do
          try {
            if (workInProgressSuspendedReason !== NotSuspended && workInProgress !== null) {
              var unitOfWork = workInProgress, thrownValue = workInProgressThrownValue;
              switch (workInProgressSuspendedReason) {
                case SuspendedOnHydration:
                  resetWorkInProgressStack();
                  memoizedUpdaters = RootSuspendedAtTheShell;
                  break a;
                case SuspendedOnImmediate:
                case SuspendedOnData:
                case SuspendedOnAction:
                case SuspendedOnDeprecatedThrowPromise:
                  suspenseHandlerStackCursor.current === null && (lanes = true);
                  var reason = workInProgressSuspendedReason;
                  workInProgressSuspendedReason = NotSuspended;
                  workInProgressThrownValue = null;
                  throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
                  if (shouldYieldForPrerendering && workInProgressRootIsPrerendering) {
                    memoizedUpdaters = RootInProgress;
                    break a;
                  }
                  break;
                default:
                  reason = workInProgressSuspendedReason, workInProgressSuspendedReason = NotSuspended, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, reason);
              }
            }
            workLoopSync();
            memoizedUpdaters = workInProgressRootExitStatus;
            break;
          } catch (thrownValue$8) {
            handleThrow(root2, thrownValue$8);
          }
        while (1);
      lanes && root2.shellSuspendCounter++;
      resetContextDependencies();
      executionContext = prevExecutionContext;
      ReactSharedInternals.H = prevDispatcher;
      ReactSharedInternals.A = prevAsyncDispatcher;
      workInProgress === null && (workInProgressRoot = null, workInProgressRootRenderLanes = 0, finishQueueingConcurrentUpdates());
      return memoizedUpdaters;
    }
    function workLoopSync() {
      for (;workInProgress !== null; )
        performUnitOfWork(workInProgress);
    }
    function renderRootConcurrent(root2, lanes) {
      var prevExecutionContext = executionContext;
      executionContext |= RenderContext;
      var prevDispatcher = pushDispatcher(), prevAsyncDispatcher = pushAsyncDispatcher();
      if (workInProgressRoot !== root2 || workInProgressRootRenderLanes !== lanes) {
        if (isDevToolsPresent) {
          var memoizedUpdaters = root2.memoizedUpdaters;
          0 < memoizedUpdaters.size && (restorePendingUpdaters(root2, workInProgressRootRenderLanes), memoizedUpdaters.clear());
          movePendingFibersToMemoized(root2, lanes);
        }
        workInProgressTransitions = null;
        workInProgressRootRenderTargetTime = now$1() + RENDER_TIMEOUT_MS;
        prepareFreshStack(root2, lanes);
      } else
        workInProgressRootIsPrerendering = checkIfRootIsPrerendering(root2, lanes);
      a:
        do
          try {
            if (workInProgressSuspendedReason !== NotSuspended && workInProgress !== null)
              b:
                switch (lanes = workInProgress, memoizedUpdaters = workInProgressThrownValue, workInProgressSuspendedReason) {
                  case SuspendedOnError:
                    workInProgressSuspendedReason = NotSuspended;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root2, lanes, memoizedUpdaters, SuspendedOnError);
                    break;
                  case SuspendedOnData:
                  case SuspendedOnAction:
                    if (isThenableResolved(memoizedUpdaters)) {
                      workInProgressSuspendedReason = NotSuspended;
                      workInProgressThrownValue = null;
                      replaySuspendedUnitOfWork(lanes);
                      break;
                    }
                    lanes = function() {
                      workInProgressSuspendedReason !== SuspendedOnData && workInProgressSuspendedReason !== SuspendedOnAction || workInProgressRoot !== root2 || (workInProgressSuspendedReason = SuspendedAndReadyToContinue);
                      ensureRootIsScheduled(root2);
                    };
                    memoizedUpdaters.then(lanes, lanes);
                    break a;
                  case SuspendedOnImmediate:
                    workInProgressSuspendedReason = SuspendedAndReadyToContinue;
                    break a;
                  case SuspendedOnInstance:
                    workInProgressSuspendedReason = SuspendedOnInstanceAndReadyToContinue;
                    break a;
                  case SuspendedAndReadyToContinue:
                    isThenableResolved(memoizedUpdaters) ? (workInProgressSuspendedReason = NotSuspended, workInProgressThrownValue = null, replaySuspendedUnitOfWork(lanes)) : (workInProgressSuspendedReason = NotSuspended, workInProgressThrownValue = null, throwAndUnwindWorkLoop(root2, lanes, memoizedUpdaters, SuspendedAndReadyToContinue));
                    break;
                  case SuspendedOnInstanceAndReadyToContinue:
                    var resource = null;
                    switch (workInProgress.tag) {
                      case 26:
                        resource = workInProgress.memoizedState;
                      case 5:
                      case 27:
                        var hostFiber = workInProgress;
                        if (resource ? preloadResource(resource) : hostFiber.stateNode.complete) {
                          workInProgressSuspendedReason = NotSuspended;
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
                        break;
                      default:
                        console.error("Unexpected type of fiber triggered a suspensey commit. This is a bug in React.");
                    }
                    workInProgressSuspendedReason = NotSuspended;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root2, lanes, memoizedUpdaters, SuspendedOnInstanceAndReadyToContinue);
                    break;
                  case SuspendedOnDeprecatedThrowPromise:
                    workInProgressSuspendedReason = NotSuspended;
                    workInProgressThrownValue = null;
                    throwAndUnwindWorkLoop(root2, lanes, memoizedUpdaters, SuspendedOnDeprecatedThrowPromise);
                    break;
                  case SuspendedOnHydration:
                    resetWorkInProgressStack();
                    workInProgressRootExitStatus = RootSuspendedAtTheShell;
                    break a;
                  default:
                    throw Error("Unexpected SuspendedReason. This is a bug in React.");
                }
            ReactSharedInternals.actQueue !== null ? workLoopSync() : workLoopConcurrentByScheduler();
            break;
          } catch (thrownValue$9) {
            handleThrow(root2, thrownValue$9);
          }
        while (1);
      resetContextDependencies();
      ReactSharedInternals.H = prevDispatcher;
      ReactSharedInternals.A = prevAsyncDispatcher;
      executionContext = prevExecutionContext;
      if (workInProgress !== null)
        return RootInProgress;
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
      var current2 = unitOfWork.alternate;
      (unitOfWork.mode & ProfileMode) !== NoMode ? (startProfilerTimer(unitOfWork), current2 = runWithFiberInDEV(unitOfWork, beginWork, current2, unitOfWork, entangledRenderLanes), stopProfilerTimerIfRunningAndRecordDuration(unitOfWork)) : current2 = runWithFiberInDEV(unitOfWork, beginWork, current2, unitOfWork, entangledRenderLanes);
      unitOfWork.memoizedProps = unitOfWork.pendingProps;
      current2 === null ? completeUnitOfWork(unitOfWork) : workInProgress = current2;
    }
    function replaySuspendedUnitOfWork(unitOfWork) {
      var next = runWithFiberInDEV(unitOfWork, replayBeginWork, unitOfWork);
      unitOfWork.memoizedProps = unitOfWork.pendingProps;
      next === null ? completeUnitOfWork(unitOfWork) : workInProgress = next;
    }
    function replayBeginWork(unitOfWork) {
      var current2 = unitOfWork.alternate, isProfilingMode = (unitOfWork.mode & ProfileMode) !== NoMode;
      isProfilingMode && startProfilerTimer(unitOfWork);
      switch (unitOfWork.tag) {
        case 15:
        case 0:
          current2 = replayFunctionComponent(current2, unitOfWork, unitOfWork.pendingProps, unitOfWork.type, undefined, workInProgressRootRenderLanes);
          break;
        case 11:
          current2 = replayFunctionComponent(current2, unitOfWork, unitOfWork.pendingProps, unitOfWork.type.render, unitOfWork.ref, workInProgressRootRenderLanes);
          break;
        case 5:
          resetHooksOnUnwind(unitOfWork);
        default:
          unwindInterruptedWork(current2, unitOfWork), unitOfWork = workInProgress = resetWorkInProgress(unitOfWork, entangledRenderLanes), current2 = beginWork(current2, unitOfWork, entangledRenderLanes);
      }
      isProfilingMode && stopProfilerTimerIfRunningAndRecordDuration(unitOfWork);
      return current2;
    }
    function throwAndUnwindWorkLoop(root2, unitOfWork, thrownValue, suspendedReason) {
      resetContextDependencies();
      resetHooksOnUnwind(unitOfWork);
      thenableState$1 = null;
      thenableIndexCounter$1 = 0;
      var returnFiber = unitOfWork.return;
      try {
        if (throwException(root2, returnFiber, unitOfWork, thrownValue, workInProgressRootRenderLanes)) {
          workInProgressRootExitStatus = RootFatalErrored;
          logUncaughtError(root2, createCapturedValueAtFiber(thrownValue, root2.current));
          workInProgress = null;
          return;
        }
      } catch (error) {
        if (returnFiber !== null)
          throw workInProgress = returnFiber, error;
        workInProgressRootExitStatus = RootFatalErrored;
        logUncaughtError(root2, createCapturedValueAtFiber(thrownValue, root2.current));
        workInProgress = null;
        return;
      }
      if (unitOfWork.flags & 32768) {
        if (isHydrating || suspendedReason === SuspendedOnError)
          root2 = true;
        else if (workInProgressRootIsPrerendering || (workInProgressRootRenderLanes & 536870912) !== 0)
          root2 = false;
        else if (workInProgressRootDidSkipSuspendedSiblings = root2 = true, suspendedReason === SuspendedOnData || suspendedReason === SuspendedOnAction || suspendedReason === SuspendedOnImmediate || suspendedReason === SuspendedOnDeprecatedThrowPromise)
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
        var current2 = completedWork.alternate;
        unitOfWork = completedWork.return;
        startProfilerTimer(completedWork);
        current2 = runWithFiberInDEV(completedWork, completeWork, current2, completedWork, entangledRenderLanes);
        (completedWork.mode & ProfileMode) !== NoMode && stopProfilerTimerIfRunningAndRecordIncompleteDuration(completedWork);
        if (current2 !== null) {
          workInProgress = current2;
          return;
        }
        completedWork = completedWork.sibling;
        if (completedWork !== null) {
          workInProgress = completedWork;
          return;
        }
        workInProgress = completedWork = unitOfWork;
      } while (completedWork !== null);
      workInProgressRootExitStatus === RootInProgress && (workInProgressRootExitStatus = RootCompleted);
    }
    function unwindUnitOfWork(unitOfWork, skipSiblings) {
      do {
        var next = unwindWork(unitOfWork.alternate, unitOfWork);
        if (next !== null) {
          next.flags &= 32767;
          workInProgress = next;
          return;
        }
        if ((unitOfWork.mode & ProfileMode) !== NoMode) {
          stopProfilerTimerIfRunningAndRecordIncompleteDuration(unitOfWork);
          next = unitOfWork.actualDuration;
          for (var child = unitOfWork.child;child !== null; )
            next += child.actualDuration, child = child.sibling;
          unitOfWork.actualDuration = next;
        }
        next = unitOfWork.return;
        next !== null && (next.flags |= 32768, next.subtreeFlags = 0, next.deletions = null);
        if (!skipSiblings && (unitOfWork = unitOfWork.sibling, unitOfWork !== null)) {
          workInProgress = unitOfWork;
          return;
        }
        workInProgress = unitOfWork = next;
      } while (unitOfWork !== null);
      workInProgressRootExitStatus = RootSuspendedAtTheShell;
      workInProgress = null;
    }
    function commitRoot(root2, finishedWork, lanes, recoverableErrors, transitions, didIncludeRenderPhaseUpdate, spawnedLane, updatedLanes, suspendedRetryLanes, exitStatus, suspendedState, suspendedCommitReason, completedRenderStartTime, completedRenderEndTime) {
      root2.cancelPendingCommit = null;
      do
        flushPendingEffects();
      while (pendingEffectsStatus !== NO_PENDING_EFFECTS);
      ReactStrictModeWarnings.flushLegacyContextWarning();
      ReactStrictModeWarnings.flushPendingUnsafeLifecycleWarnings();
      if ((executionContext & (RenderContext | CommitContext)) !== NoContext)
        throw Error("Should not already be working.");
      setCurrentTrackFromLanes(lanes);
      exitStatus === RootErrored ? logErroredRenderPhase(completedRenderStartTime, completedRenderEndTime, lanes, workInProgressUpdateTask) : recoverableErrors !== null ? logRecoveredRenderPhase(completedRenderStartTime, completedRenderEndTime, lanes, recoverableErrors, finishedWork !== null && finishedWork.alternate !== null && finishedWork.alternate.memoizedState.isDehydrated && (finishedWork.flags & 256) !== 0, workInProgressUpdateTask) : logRenderPhase(completedRenderStartTime, completedRenderEndTime, lanes, workInProgressUpdateTask);
      if (finishedWork !== null) {
        lanes === 0 && console.error("finishedLanes should not be empty during a commit. This is a bug in React.");
        if (finishedWork === root2.current)
          throw Error("Cannot commit the same tree as before. This error is likely caused by a bug in React. Please file an issue.");
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
        pendingEffectsRenderEndTime = completedRenderEndTime;
        pendingSuspendedCommitReason = suspendedCommitReason;
        pendingDelayedCommitReason = IMMEDIATE_COMMIT;
        pendingSuspendedViewTransitionReason = null;
        finishedWork.actualDuration !== 0 || (finishedWork.subtreeFlags & 10256) !== 0 || (finishedWork.flags & 10256) !== 0 ? (root2.callbackNode = null, root2.callbackPriority = 0, scheduleCallback$1(NormalPriority$1, function() {
          schedulerEvent = window.event;
          pendingDelayedCommitReason === IMMEDIATE_COMMIT && (pendingDelayedCommitReason = DELAYED_PASSIVE_COMMIT);
          flushPassiveEffects();
          return null;
        })) : (root2.callbackNode = null, root2.callbackPriority = 0);
        commitErrors = null;
        commitStartTime = now();
        suspendedCommitReason !== null && logSuspendedCommitPhase(completedRenderEndTime, commitStartTime, suspendedCommitReason, workInProgressUpdateTask);
        recoverableErrors = (finishedWork.flags & 13878) !== 0;
        if ((finishedWork.subtreeFlags & 13878) !== 0 || recoverableErrors) {
          recoverableErrors = ReactSharedInternals.T;
          ReactSharedInternals.T = null;
          transitions = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = DiscreteEventPriority;
          spawnedLane = executionContext;
          executionContext |= CommitContext;
          try {
            commitBeforeMutationEffects(root2, finishedWork, lanes);
          } finally {
            executionContext = spawnedLane, ReactDOMSharedInternals.p = transitions, ReactSharedInternals.T = recoverableErrors;
          }
        }
        pendingEffectsStatus = PENDING_MUTATION_PHASE;
        flushMutationEffects();
        flushLayoutEffects();
        flushSpawnedWork();
      }
    }
    function flushMutationEffects() {
      if (pendingEffectsStatus === PENDING_MUTATION_PHASE) {
        pendingEffectsStatus = NO_PENDING_EFFECTS;
        var root2 = pendingEffectsRoot, finishedWork = pendingFinishedWork, lanes = pendingEffectsLanes, rootMutationHasEffect = (finishedWork.flags & 13878) !== 0;
        if ((finishedWork.subtreeFlags & 13878) !== 0 || rootMutationHasEffect) {
          rootMutationHasEffect = ReactSharedInternals.T;
          ReactSharedInternals.T = null;
          var previousPriority = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = DiscreteEventPriority;
          var prevExecutionContext = executionContext;
          executionContext |= CommitContext;
          try {
            inProgressLanes = lanes;
            inProgressRoot = root2;
            resetComponentEffectTimers();
            commitMutationEffectsOnFiber(finishedWork, root2);
            inProgressRoot = inProgressLanes = null;
            lanes = selectionInformation;
            var curFocusedElem = getActiveElementDeep(root2.containerInfo), priorFocusedElem = lanes.focusedElem, priorSelectionRange = lanes.selectionRange;
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
        pendingEffectsStatus = PENDING_LAYOUT_PHASE;
      }
    }
    function flushLayoutEffects() {
      if (pendingEffectsStatus === PENDING_LAYOUT_PHASE) {
        pendingEffectsStatus = NO_PENDING_EFFECTS;
        var suspendedViewTransitionReason = pendingSuspendedViewTransitionReason;
        if (suspendedViewTransitionReason !== null) {
          commitStartTime = now();
          var startTime = commitEndTime, endTime = commitStartTime;
          !supportsUserTiming || endTime <= startTime || (animatingTask ? animatingTask.run(console.timeStamp.bind(console, suspendedViewTransitionReason, startTime, endTime, currentTrack, LANES_TRACK_GROUP, "secondary-light")) : console.timeStamp(suspendedViewTransitionReason, startTime, endTime, currentTrack, LANES_TRACK_GROUP, "secondary-light"));
        }
        suspendedViewTransitionReason = pendingEffectsRoot;
        startTime = pendingFinishedWork;
        endTime = pendingEffectsLanes;
        var rootHasLayoutEffect = (startTime.flags & 8772) !== 0;
        if ((startTime.subtreeFlags & 8772) !== 0 || rootHasLayoutEffect) {
          rootHasLayoutEffect = ReactSharedInternals.T;
          ReactSharedInternals.T = null;
          var _previousPriority = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = DiscreteEventPriority;
          var _prevExecutionContext = executionContext;
          executionContext |= CommitContext;
          try {
            inProgressLanes = endTime, inProgressRoot = suspendedViewTransitionReason, resetComponentEffectTimers(), commitLayoutEffectOnFiber(suspendedViewTransitionReason, startTime.alternate, startTime), inProgressRoot = inProgressLanes = null;
          } finally {
            executionContext = _prevExecutionContext, ReactDOMSharedInternals.p = _previousPriority, ReactSharedInternals.T = rootHasLayoutEffect;
          }
        }
        suspendedViewTransitionReason = pendingEffectsRenderEndTime;
        startTime = pendingSuspendedCommitReason;
        commitEndTime = now();
        suspendedViewTransitionReason = startTime === null ? suspendedViewTransitionReason : commitStartTime;
        startTime = commitEndTime;
        endTime = pendingDelayedCommitReason === ABORTED_VIEW_TRANSITION_COMMIT;
        rootHasLayoutEffect = workInProgressUpdateTask;
        commitErrors !== null ? logCommitErrored(suspendedViewTransitionReason, startTime, commitErrors, false, rootHasLayoutEffect) : !supportsUserTiming || startTime <= suspendedViewTransitionReason || (rootHasLayoutEffect ? rootHasLayoutEffect.run(console.timeStamp.bind(console, endTime ? "Commit Interrupted View Transition" : "Commit", suspendedViewTransitionReason, startTime, currentTrack, LANES_TRACK_GROUP, endTime ? "error" : "secondary-dark")) : console.timeStamp(endTime ? "Commit Interrupted View Transition" : "Commit", suspendedViewTransitionReason, startTime, currentTrack, LANES_TRACK_GROUP, endTime ? "error" : "secondary-dark"));
        pendingEffectsStatus = PENDING_AFTER_MUTATION_PHASE;
      }
    }
    function flushSpawnedWork() {
      if (pendingEffectsStatus === PENDING_SPAWNED_WORK || pendingEffectsStatus === PENDING_AFTER_MUTATION_PHASE) {
        if (pendingEffectsStatus === PENDING_SPAWNED_WORK) {
          var startViewTransitionStartTime = commitEndTime;
          commitEndTime = now();
          var endTime = commitEndTime, abortedViewTransition = pendingDelayedCommitReason === ABORTED_VIEW_TRANSITION_COMMIT;
          !supportsUserTiming || endTime <= startViewTransitionStartTime || (animatingTask ? animatingTask.run(console.timeStamp.bind(console, abortedViewTransition ? "Interrupted View Transition" : "Starting Animation", startViewTransitionStartTime, endTime, currentTrack, LANES_TRACK_GROUP, abortedViewTransition ? "error" : "secondary-light")) : console.timeStamp(abortedViewTransition ? "Interrupted View Transition" : "Starting Animation", startViewTransitionStartTime, endTime, currentTrack, LANES_TRACK_GROUP, abortedViewTransition ? " error" : "secondary-light"));
          pendingDelayedCommitReason !== ABORTED_VIEW_TRANSITION_COMMIT && (pendingDelayedCommitReason = ANIMATION_STARTED_COMMIT);
        }
        pendingEffectsStatus = NO_PENDING_EFFECTS;
        requestPaint();
        startViewTransitionStartTime = pendingEffectsRoot;
        var finishedWork = pendingFinishedWork;
        endTime = pendingEffectsLanes;
        abortedViewTransition = pendingRecoverableErrors;
        var rootDidHavePassiveEffects = finishedWork.actualDuration !== 0 || (finishedWork.subtreeFlags & 10256) !== 0 || (finishedWork.flags & 10256) !== 0;
        rootDidHavePassiveEffects ? pendingEffectsStatus = PENDING_PASSIVE_PHASE : (pendingEffectsStatus = NO_PENDING_EFFECTS, pendingFinishedWork = pendingEffectsRoot = null, releaseRootPooledCache(startViewTransitionStartTime, startViewTransitionStartTime.pendingLanes), nestedPassiveUpdateCount = 0, rootWithPassiveNestedUpdates = null);
        var remainingLanes = startViewTransitionStartTime.pendingLanes;
        remainingLanes === 0 && (legacyErrorBoundariesThatAlreadyFailed = null);
        rootDidHavePassiveEffects || commitDoubleInvokeEffectsInDEV(startViewTransitionStartTime);
        remainingLanes = lanesToEventPriority(endTime);
        finishedWork = finishedWork.stateNode;
        if (injectedHook && typeof injectedHook.onCommitFiberRoot === "function")
          try {
            var didError = (finishedWork.current.flags & 128) === 128;
            switch (remainingLanes) {
              case DiscreteEventPriority:
                var schedulerPriority = ImmediatePriority;
                break;
              case ContinuousEventPriority:
                schedulerPriority = UserBlockingPriority;
                break;
              case DefaultEventPriority:
                schedulerPriority = NormalPriority$1;
                break;
              case IdleEventPriority:
                schedulerPriority = IdlePriority;
                break;
              default:
                schedulerPriority = NormalPriority$1;
            }
            injectedHook.onCommitFiberRoot(rendererID, finishedWork, schedulerPriority, didError);
          } catch (err) {
            hasLoggedError || (hasLoggedError = true, console.error("React instrumentation encountered an error: %o", err));
          }
        isDevToolsPresent && startViewTransitionStartTime.memoizedUpdaters.clear();
        onCommitRoot();
        if (abortedViewTransition !== null) {
          didError = ReactSharedInternals.T;
          schedulerPriority = ReactDOMSharedInternals.p;
          ReactDOMSharedInternals.p = DiscreteEventPriority;
          ReactSharedInternals.T = null;
          try {
            var onRecoverableError = startViewTransitionStartTime.onRecoverableError;
            for (finishedWork = 0;finishedWork < abortedViewTransition.length; finishedWork++) {
              var recoverableError = abortedViewTransition[finishedWork], errorInfo = makeErrorInfo(recoverableError.stack);
              runWithFiberInDEV(recoverableError.source, onRecoverableError, recoverableError.value, errorInfo);
            }
          } finally {
            ReactSharedInternals.T = didError, ReactDOMSharedInternals.p = schedulerPriority;
          }
        }
        (pendingEffectsLanes & 3) !== 0 && flushPendingEffects();
        ensureRootIsScheduled(startViewTransitionStartTime);
        remainingLanes = startViewTransitionStartTime.pendingLanes;
        (endTime & 261930) !== 0 && (remainingLanes & 42) !== 0 ? (nestedUpdateScheduled = true, startViewTransitionStartTime === rootWithNestedUpdates ? nestedUpdateCount++ : (nestedUpdateCount = 0, rootWithNestedUpdates = startViewTransitionStartTime)) : nestedUpdateCount = 0;
        rootDidHavePassiveEffects || finalizeRender(endTime, commitEndTime);
        flushSyncWorkAcrossRoots_impl(0, false);
      }
    }
    function makeErrorInfo(componentStack) {
      componentStack = { componentStack };
      Object.defineProperty(componentStack, "digest", {
        get: function() {
          console.error('You are accessing "digest" from the errorInfo object passed to onRecoverableError. This property is no longer provided as part of errorInfo but can be accessed as a property of the Error instance itself.');
        }
      });
      return componentStack;
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
      if (pendingEffectsStatus !== PENDING_PASSIVE_PHASE)
        return false;
      var root2 = pendingEffectsRoot, remainingLanes = pendingEffectsRemainingLanes;
      pendingEffectsRemainingLanes = 0;
      var renderPriority = lanesToEventPriority(pendingEffectsLanes), priority = DefaultEventPriority === 0 || DefaultEventPriority > renderPriority ? DefaultEventPriority : renderPriority;
      renderPriority = ReactSharedInternals.T;
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = priority;
        ReactSharedInternals.T = null;
        var transitions = pendingPassiveTransitions;
        pendingPassiveTransitions = null;
        priority = pendingEffectsRoot;
        var lanes = pendingEffectsLanes;
        pendingEffectsStatus = NO_PENDING_EFFECTS;
        pendingFinishedWork = pendingEffectsRoot = null;
        pendingEffectsLanes = 0;
        if ((executionContext & (RenderContext | CommitContext)) !== NoContext)
          throw Error("Cannot flush passive effects while already rendering.");
        setCurrentTrackFromLanes(lanes);
        isFlushingPassiveEffects = true;
        didScheduleUpdateDuringPassiveEffects = false;
        var passiveEffectStartTime = 0;
        commitErrors = null;
        passiveEffectStartTime = now$1();
        if (pendingDelayedCommitReason === ANIMATION_STARTED_COMMIT)
          logAnimatingPhase(commitEndTime, passiveEffectStartTime, animatingTask);
        else {
          var startTime = commitEndTime, endTime = passiveEffectStartTime, delayedUntilPaint = pendingDelayedCommitReason === DELAYED_PASSIVE_COMMIT;
          !supportsUserTiming || endTime <= startTime || (workInProgressUpdateTask ? workInProgressUpdateTask.run(console.timeStamp.bind(console, delayedUntilPaint ? "Waiting for Paint" : "Waiting", startTime, endTime, currentTrack, LANES_TRACK_GROUP, "secondary-light")) : console.timeStamp(delayedUntilPaint ? "Waiting for Paint" : "Waiting", startTime, endTime, currentTrack, LANES_TRACK_GROUP, "secondary-light"));
        }
        startTime = executionContext;
        executionContext |= CommitContext;
        var finishedWork = priority.current;
        resetComponentEffectTimers();
        commitPassiveUnmountOnFiber(finishedWork);
        var finishedWork$jscomp$0 = priority.current;
        finishedWork = pendingEffectsRenderEndTime;
        resetComponentEffectTimers();
        commitPassiveMountOnFiber(priority, finishedWork$jscomp$0, lanes, transitions, finishedWork);
        commitDoubleInvokeEffectsInDEV(priority);
        executionContext = startTime;
        var passiveEffectsEndTime = now$1();
        finishedWork$jscomp$0 = passiveEffectStartTime;
        finishedWork = workInProgressUpdateTask;
        commitErrors !== null ? logCommitErrored(finishedWork$jscomp$0, passiveEffectsEndTime, commitErrors, true, finishedWork) : !supportsUserTiming || passiveEffectsEndTime <= finishedWork$jscomp$0 || (finishedWork ? finishedWork.run(console.timeStamp.bind(console, "Remaining Effects", finishedWork$jscomp$0, passiveEffectsEndTime, currentTrack, LANES_TRACK_GROUP, "secondary-dark")) : console.timeStamp("Remaining Effects", finishedWork$jscomp$0, passiveEffectsEndTime, currentTrack, LANES_TRACK_GROUP, "secondary-dark"));
        finalizeRender(lanes, passiveEffectsEndTime);
        flushSyncWorkAcrossRoots_impl(0, false);
        didScheduleUpdateDuringPassiveEffects ? priority === rootWithPassiveNestedUpdates ? nestedPassiveUpdateCount++ : (nestedPassiveUpdateCount = 0, rootWithPassiveNestedUpdates = priority) : nestedPassiveUpdateCount = 0;
        didScheduleUpdateDuringPassiveEffects = isFlushingPassiveEffects = false;
        if (injectedHook && typeof injectedHook.onPostCommitFiberRoot === "function")
          try {
            injectedHook.onPostCommitFiberRoot(rendererID, priority);
          } catch (err) {
            hasLoggedError || (hasLoggedError = true, console.error("React instrumentation encountered an error: %o", err));
          }
        var stateNode = priority.current.stateNode;
        stateNode.effectDuration = 0;
        stateNode.passiveEffectDuration = 0;
        return true;
      } finally {
        ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = renderPriority, releaseRootPooledCache(root2, remainingLanes);
      }
    }
    function captureCommitPhaseErrorOnRoot(rootFiber, sourceFiber, error) {
      sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
      recordEffectError(sourceFiber);
      sourceFiber = createRootErrorUpdate(rootFiber.stateNode, sourceFiber, 2);
      rootFiber = enqueueUpdate(rootFiber, sourceFiber, 2);
      rootFiber !== null && (markRootUpdated$1(rootFiber, 2), ensureRootIsScheduled(rootFiber));
    }
    function captureCommitPhaseError(sourceFiber, nearestMountedAncestor, error) {
      isRunningInsertionEffect = false;
      if (sourceFiber.tag === 3)
        captureCommitPhaseErrorOnRoot(sourceFiber, sourceFiber, error);
      else {
        for (;nearestMountedAncestor !== null; ) {
          if (nearestMountedAncestor.tag === 3) {
            captureCommitPhaseErrorOnRoot(nearestMountedAncestor, sourceFiber, error);
            return;
          }
          if (nearestMountedAncestor.tag === 1) {
            var instance = nearestMountedAncestor.stateNode;
            if (typeof nearestMountedAncestor.type.getDerivedStateFromError === "function" || typeof instance.componentDidCatch === "function" && (legacyErrorBoundariesThatAlreadyFailed === null || !legacyErrorBoundariesThatAlreadyFailed.has(instance))) {
              sourceFiber = createCapturedValueAtFiber(error, sourceFiber);
              recordEffectError(sourceFiber);
              error = createClassErrorUpdate(2);
              instance = enqueueUpdate(nearestMountedAncestor, error, 2);
              instance !== null && (initializeClassErrorUpdate(error, instance, nearestMountedAncestor, sourceFiber), markRootUpdated$1(instance, 2), ensureRootIsScheduled(instance));
              return;
            }
          }
          nearestMountedAncestor = nearestMountedAncestor.return;
        }
        console.error(`Internal React error: Attempted to capture a commit phase error inside a detached tree. This indicates a bug in React. Potential causes include deleting the same fiber more than once, committing an already-finished tree, or an inconsistent return pointer.

Error message:

%s`, error);
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
      threadIDs.has(lanes) || (workInProgressRootDidAttachPingListener = true, threadIDs.add(lanes), pingCache = pingSuspendedRoot.bind(null, root2, wakeable, lanes), isDevToolsPresent && restorePendingUpdaters(root2, lanes), wakeable.then(pingCache, pingCache));
    }
    function pingSuspendedRoot(root2, wakeable, pingedLanes) {
      var pingCache = root2.pingCache;
      pingCache !== null && pingCache.delete(wakeable);
      root2.pingedLanes |= root2.suspendedLanes & pingedLanes;
      root2.warmLanes &= ~pingedLanes;
      (pingedLanes & 127) !== 0 ? 0 > blockingUpdateTime && (blockingClampTime = blockingUpdateTime = now(), blockingUpdateTask = createTask("Promise Resolved"), blockingUpdateType = PINGED_UPDATE) : (pingedLanes & 4194048) !== 0 && 0 > transitionUpdateTime && (transitionClampTime = transitionUpdateTime = now(), transitionUpdateTask = createTask("Promise Resolved"), transitionUpdateType = PINGED_UPDATE);
      isConcurrentActEnvironment() && ReactSharedInternals.actQueue === null && console.error(`A suspended resource finished loading inside a test, but the event was not wrapped in act(...).

When testing, code that resolves suspended data should be wrapped into act(...):

act(() => {
  /* finish loading suspended data */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act`);
      workInProgressRoot === root2 && (workInProgressRootRenderLanes & pingedLanes) === pingedLanes && (workInProgressRootExitStatus === RootSuspendedWithDelay || workInProgressRootExitStatus === RootSuspended && (workInProgressRootRenderLanes & 62914560) === workInProgressRootRenderLanes && now$1() - globalMostRecentFallbackTime < FALLBACK_THROTTLE_MS ? (executionContext & RenderContext) === NoContext && prepareFreshStack(root2, 0) : workInProgressRootPingedLanes |= pingedLanes, workInProgressSuspendedRetryLanes === workInProgressRootRenderLanes && (workInProgressSuspendedRetryLanes = 0));
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
          throw Error("Pinged unknown suspense boundary type. This is probably a bug in React.");
      }
      retryCache !== null && retryCache.delete(wakeable);
      retryTimedOutBoundary(boundaryFiber, retryLane);
    }
    function recursivelyTraverseAndDoubleInvokeEffectsInDEV(root$jscomp$0, parentFiber, isInStrictMode) {
      if ((parentFiber.subtreeFlags & 67117056) !== 0)
        for (parentFiber = parentFiber.child;parentFiber !== null; ) {
          var root2 = root$jscomp$0, fiber = parentFiber, isStrictModeFiber = fiber.type === REACT_STRICT_MODE_TYPE;
          isStrictModeFiber = isInStrictMode || isStrictModeFiber;
          fiber.tag !== 22 ? fiber.flags & 67108864 ? isStrictModeFiber && runWithFiberInDEV(fiber, doubleInvokeEffectsOnFiber, root2, fiber) : recursivelyTraverseAndDoubleInvokeEffectsInDEV(root2, fiber, isStrictModeFiber) : fiber.memoizedState === null && (isStrictModeFiber && fiber.flags & 8192 ? runWithFiberInDEV(fiber, doubleInvokeEffectsOnFiber, root2, fiber) : fiber.subtreeFlags & 67108864 && runWithFiberInDEV(fiber, recursivelyTraverseAndDoubleInvokeEffectsInDEV, root2, fiber, isStrictModeFiber));
          parentFiber = parentFiber.sibling;
        }
    }
    function doubleInvokeEffectsOnFiber(root2, fiber) {
      setIsStrictModeForDevtools(true);
      try {
        disappearLayoutEffects(fiber), disconnectPassiveEffect(fiber), reappearLayoutEffects(root2, fiber.alternate, fiber, false), reconnectPassiveEffects(root2, fiber, 0, null, false, 0);
      } finally {
        setIsStrictModeForDevtools(false);
      }
    }
    function commitDoubleInvokeEffectsInDEV(root2) {
      var doubleInvokeEffects = true;
      root2.current.mode & (StrictLegacyMode | StrictEffectsMode) || (doubleInvokeEffects = false);
      recursivelyTraverseAndDoubleInvokeEffectsInDEV(root2, root2.current, doubleInvokeEffects);
    }
    function warnAboutUpdateOnNotYetMountedFiberInDEV(fiber) {
      if ((executionContext & RenderContext) === NoContext) {
        var tag = fiber.tag;
        if (tag === 3 || tag === 1 || tag === 0 || tag === 11 || tag === 14 || tag === 15) {
          tag = getComponentNameFromFiber(fiber) || "ReactComponent";
          if (didWarnStateUpdateForNotYetMountedComponent !== null) {
            if (didWarnStateUpdateForNotYetMountedComponent.has(tag))
              return;
            didWarnStateUpdateForNotYetMountedComponent.add(tag);
          } else
            didWarnStateUpdateForNotYetMountedComponent = new Set([tag]);
          runWithFiberInDEV(fiber, function() {
            console.error("Can't perform a React state update on a component that hasn't mounted yet. This indicates that you have a side-effect in your render function that asynchronously tries to update the component. Move this work to useEffect instead.");
          });
        }
      }
    }
    function restorePendingUpdaters(root2, lanes) {
      isDevToolsPresent && root2.memoizedUpdaters.forEach(function(schedulingFiber) {
        addFiberToLanesMap(root2, schedulingFiber, lanes);
      });
    }
    function scheduleCallback$1(priorityLevel, callback) {
      var actQueue = ReactSharedInternals.actQueue;
      return actQueue !== null ? (actQueue.push(callback), fakeActCallbackNode$1) : scheduleCallback$3(priorityLevel, callback);
    }
    function warnIfUpdatesNotWrappedWithActDEV(fiber) {
      isConcurrentActEnvironment() && ReactSharedInternals.actQueue === null && runWithFiberInDEV(fiber, function() {
        console.error(`An update to %s inside a test was not wrapped in act(...).

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act`, getComponentNameFromFiber(fiber));
      });
    }
    function ensureRootIsScheduled(root2) {
      root2 !== lastScheduledRoot && root2.next === null && (lastScheduledRoot === null ? firstScheduledRoot = lastScheduledRoot = root2 : lastScheduledRoot = lastScheduledRoot.next = root2);
      mightHavePendingSyncWork = true;
      ReactSharedInternals.actQueue !== null ? didScheduleMicrotask_act || (didScheduleMicrotask_act = true, scheduleImmediateRootScheduleTask()) : didScheduleMicrotask || (didScheduleMicrotask = true, scheduleImmediateRootScheduleTask());
    }
    function flushSyncWorkAcrossRoots_impl(syncTransitionLanes, onlyLegacy) {
      if (!isFlushingWork && mightHavePendingSyncWork) {
        isFlushingWork = true;
        do {
          var didPerformSomeWork = false;
          for (var root2 = firstScheduledRoot;root2 !== null; ) {
            if (!onlyLegacy)
              if (syncTransitionLanes !== 0) {
                var pendingLanes = root2.pendingLanes;
                if (pendingLanes === 0)
                  var nextLanes = 0;
                else {
                  var { suspendedLanes, pingedLanes } = root2;
                  nextLanes = (1 << 31 - clz32(42 | syncTransitionLanes) + 1) - 1;
                  nextLanes &= pendingLanes & ~(suspendedLanes & ~pingedLanes);
                  nextLanes = nextLanes & 201326741 ? nextLanes & 201326741 | 1 : nextLanes ? nextLanes | 2 : 0;
                }
                nextLanes !== 0 && (didPerformSomeWork = true, performSyncWorkOnRoot(root2, nextLanes));
              } else
                nextLanes = workInProgressRootRenderLanes, nextLanes = getNextLanes(root2, root2 === workInProgressRoot ? nextLanes : 0, root2.cancelPendingCommit !== null || root2.timeoutHandle !== noTimeout), (nextLanes & 3) === 0 || checkIfRootIsPrerendering(root2, nextLanes) || (didPerformSomeWork = true, performSyncWorkOnRoot(root2, nextLanes));
            root2 = root2.next;
          }
        } while (didPerformSomeWork);
        isFlushingWork = false;
      }
    }
    function processRootScheduleInImmediateTask() {
      schedulerEvent = window.event;
      processRootScheduleInMicrotask();
    }
    function processRootScheduleInMicrotask() {
      mightHavePendingSyncWork = didScheduleMicrotask_act = didScheduleMicrotask = false;
      var syncTransitionLanes = 0;
      currentEventTransitionLane !== 0 && shouldAttemptEagerTransition() && (syncTransitionLanes = currentEventTransitionLane);
      for (var currentTime = now$1(), prev = null, root2 = firstScheduledRoot;root2 !== null; ) {
        var next = root2.next, nextLanes = scheduleTaskForRootDuringMicrotask(root2, currentTime);
        if (nextLanes === 0)
          root2.next = null, prev === null ? firstScheduledRoot = next : prev.next = next, next === null && (lastScheduledRoot = prev);
        else if (prev = root2, syncTransitionLanes !== 0 || (nextLanes & 3) !== 0)
          mightHavePendingSyncWork = true;
        root2 = next;
      }
      pendingEffectsStatus !== NO_PENDING_EFFECTS && pendingEffectsStatus !== PENDING_PASSIVE_PHASE || flushSyncWorkAcrossRoots_impl(syncTransitionLanes, false);
      currentEventTransitionLane !== 0 && (currentEventTransitionLane = 0);
    }
    function scheduleTaskForRootDuringMicrotask(root2, currentTime) {
      for (var { suspendedLanes, pingedLanes, expirationTimes } = root2, lanes = root2.pendingLanes & -62914561;0 < lanes; ) {
        var index = 31 - clz32(lanes), lane = 1 << index, expirationTime = expirationTimes[index];
        if (expirationTime === -1) {
          if ((lane & suspendedLanes) === 0 || (lane & pingedLanes) !== 0)
            expirationTimes[index] = computeExpirationTime(lane, currentTime);
        } else
          expirationTime <= currentTime && (root2.expiredLanes |= lane);
        lanes &= ~lane;
      }
      currentTime = workInProgressRoot;
      suspendedLanes = workInProgressRootRenderLanes;
      suspendedLanes = getNextLanes(root2, root2 === currentTime ? suspendedLanes : 0, root2.cancelPendingCommit !== null || root2.timeoutHandle !== noTimeout);
      pingedLanes = root2.callbackNode;
      if (suspendedLanes === 0 || root2 === currentTime && (workInProgressSuspendedReason === SuspendedOnData || workInProgressSuspendedReason === SuspendedOnAction) || root2.cancelPendingCommit !== null)
        return pingedLanes !== null && cancelCallback(pingedLanes), root2.callbackNode = null, root2.callbackPriority = 0;
      if ((suspendedLanes & 3) === 0 || checkIfRootIsPrerendering(root2, suspendedLanes)) {
        currentTime = suspendedLanes & -suspendedLanes;
        if (currentTime !== root2.callbackPriority || ReactSharedInternals.actQueue !== null && pingedLanes !== fakeActCallbackNode)
          cancelCallback(pingedLanes);
        else
          return currentTime;
        switch (lanesToEventPriority(suspendedLanes)) {
          case DiscreteEventPriority:
          case ContinuousEventPriority:
            suspendedLanes = UserBlockingPriority;
            break;
          case DefaultEventPriority:
            suspendedLanes = NormalPriority$1;
            break;
          case IdleEventPriority:
            suspendedLanes = IdlePriority;
            break;
          default:
            suspendedLanes = NormalPriority$1;
        }
        pingedLanes = performWorkOnRootViaSchedulerTask.bind(null, root2);
        ReactSharedInternals.actQueue !== null ? (ReactSharedInternals.actQueue.push(pingedLanes), suspendedLanes = fakeActCallbackNode) : suspendedLanes = scheduleCallback$3(suspendedLanes, pingedLanes);
        root2.callbackPriority = currentTime;
        root2.callbackNode = suspendedLanes;
        return currentTime;
      }
      pingedLanes !== null && cancelCallback(pingedLanes);
      root2.callbackPriority = 2;
      root2.callbackNode = null;
      return 2;
    }
    function performWorkOnRootViaSchedulerTask(root2, didTimeout) {
      nestedUpdateScheduled = currentUpdateIsNested = false;
      schedulerEvent = window.event;
      if (pendingEffectsStatus !== NO_PENDING_EFFECTS && pendingEffectsStatus !== PENDING_PASSIVE_PHASE)
        return root2.callbackNode = null, root2.callbackPriority = 0, null;
      var originalCallbackNode = root2.callbackNode;
      pendingDelayedCommitReason === IMMEDIATE_COMMIT && (pendingDelayedCommitReason = DELAYED_PASSIVE_COMMIT);
      if (flushPendingEffects() && root2.callbackNode !== originalCallbackNode)
        return null;
      var workInProgressRootRenderLanes$jscomp$0 = workInProgressRootRenderLanes;
      workInProgressRootRenderLanes$jscomp$0 = getNextLanes(root2, root2 === workInProgressRoot ? workInProgressRootRenderLanes$jscomp$0 : 0, root2.cancelPendingCommit !== null || root2.timeoutHandle !== noTimeout);
      if (workInProgressRootRenderLanes$jscomp$0 === 0)
        return null;
      performWorkOnRoot(root2, workInProgressRootRenderLanes$jscomp$0, didTimeout);
      scheduleTaskForRootDuringMicrotask(root2, now$1());
      return root2.callbackNode != null && root2.callbackNode === originalCallbackNode ? performWorkOnRootViaSchedulerTask.bind(null, root2) : null;
    }
    function performSyncWorkOnRoot(root2, lanes) {
      if (flushPendingEffects())
        return null;
      currentUpdateIsNested = nestedUpdateScheduled;
      nestedUpdateScheduled = false;
      performWorkOnRoot(root2, lanes, true);
    }
    function cancelCallback(callbackNode) {
      callbackNode !== fakeActCallbackNode && callbackNode !== null && cancelCallback$1(callbackNode);
    }
    function scheduleImmediateRootScheduleTask() {
      ReactSharedInternals.actQueue !== null && ReactSharedInternals.actQueue.push(function() {
        processRootScheduleInMicrotask();
        return null;
      });
      scheduleMicrotask(function() {
        (executionContext & (RenderContext | CommitContext)) !== NoContext ? scheduleCallback$3(ImmediatePriority, processRootScheduleInImmediateTask) : processRootScheduleInMicrotask();
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
      if (actionProp == null || typeof actionProp === "symbol" || typeof actionProp === "boolean")
        return null;
      if (typeof actionProp === "function")
        return actionProp;
      checkAttributeStringCoercion(actionProp, "action");
      return sanitizeURL("" + actionProp);
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
                    var formData = submitter ? createFormDataWithSubmitter(nativeEventTarget, submitter) : new FormData(nativeEventTarget), pendingState = {
                      pending: true,
                      data: formData,
                      method: nativeEventTarget.method,
                      action
                    };
                    Object.freeze(pendingState);
                    startHostTransition(maybeTargetInst, pendingState, null, formData);
                  }
                } else
                  typeof action === "function" && (event.preventDefault(), formData = submitter ? createFormDataWithSubmitter(nativeEventTarget, submitter) : new FormData(nativeEventTarget), pendingState = {
                    pending: true,
                    data: formData,
                    method: nativeEventTarget.method,
                    action
                  }, Object.freeze(pendingState), startHostTransition(maybeTargetInst, pendingState, action, formData));
              },
              currentTarget: nativeEventTarget
            }
          ]
        });
      }
    }
    function executeDispatch(event, listener, currentTarget) {
      event.currentTarget = currentTarget;
      try {
        listener(event);
      } catch (error) {
        reportGlobalError(error);
      }
      event.currentTarget = null;
    }
    function processDispatchQueue(dispatchQueue, eventSystemFlags) {
      eventSystemFlags = (eventSystemFlags & 4) !== 0;
      for (var i = 0;i < dispatchQueue.length; i++) {
        var _dispatchQueue$i = dispatchQueue[i];
        a: {
          var previousInstance = undefined, event = _dispatchQueue$i.event;
          _dispatchQueue$i = _dispatchQueue$i.listeners;
          if (eventSystemFlags)
            for (var i$jscomp$0 = _dispatchQueue$i.length - 1;0 <= i$jscomp$0; i$jscomp$0--) {
              var _dispatchListeners$i = _dispatchQueue$i[i$jscomp$0], instance = _dispatchListeners$i.instance, currentTarget = _dispatchListeners$i.currentTarget;
              _dispatchListeners$i = _dispatchListeners$i.listener;
              if (instance !== previousInstance && event.isPropagationStopped())
                break a;
              instance !== null ? runWithFiberInDEV(instance, executeDispatch, event, _dispatchListeners$i, currentTarget) : executeDispatch(event, _dispatchListeners$i, currentTarget);
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
              instance !== null ? runWithFiberInDEV(instance, executeDispatch, event, _dispatchListeners$i, currentTarget) : executeDispatch(event, _dispatchListeners$i, currentTarget);
              previousInstance = instance;
            }
        }
      }
    }
    function listenToNonDelegatedEvent(domEventName, targetElement) {
      nonDelegatedEvents.has(domEventName) || console.error('Did not expect a listenToNonDelegatedEvent() call for "%s". This is a bug in React. Please file an issue.', domEventName);
      var listenerSet = targetElement[internalEventHandlersKey];
      listenerSet === undefined && (listenerSet = targetElement[internalEventHandlersKey] = new Set);
      var listenerSetKey = domEventName + "__bubble";
      listenerSet.has(listenerSetKey) || (addTrappedEventListener(targetElement, domEventName, 2, false), listenerSet.add(listenerSetKey));
    }
    function listenToNativeEvent(domEventName, isCapturePhaseListener, target) {
      nonDelegatedEvents.has(domEventName) && !isCapturePhaseListener && console.error('Did not expect a listenToNativeEvent() call for "%s" in the bubble phase. This is a bug in React. Please file an issue.', domEventName);
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
        case DiscreteEventPriority:
          var listenerWrapper = dispatchDiscreteEvent;
          break;
        case ContinuousEventPriority:
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
              var _instance2 = instance;
              lastHostComponent = _instance2.stateNode;
              _instance2 = _instance2.tag;
              _instance2 !== 5 && _instance2 !== 26 && _instance2 !== 27 || lastHostComponent === null || reactEventName === null || (_instance2 = getListener(instance, reactEventName), _instance2 != null && inCapturePhase.push(createDispatchListener(instance, _instance2, lastHostComponent)));
              if (accumulateTargetOnly)
                break;
              instance = instance.return;
            }
            0 < inCapturePhase.length && (reactName = new SyntheticEventCtor(reactName, reactEventType, null, nativeEvent, nativeEventTarget), dispatchQueue.push({
              event: reactName,
              listeners: inCapturePhase
            }));
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
                _instance2 = "onMouseLeave";
                reactEventName = "onMouseEnter";
                instance = "mouse";
                if (domEventName === "pointerout" || domEventName === "pointerover")
                  inCapturePhase = SyntheticPointerEvent, _instance2 = "onPointerLeave", reactEventName = "onPointerEnter", instance = "pointer";
                accumulateTargetOnly = SyntheticEventCtor == null ? reactName : getNodeFromInstance(SyntheticEventCtor);
                lastHostComponent = reactEventType == null ? reactName : getNodeFromInstance(reactEventType);
                reactName = new inCapturePhase(_instance2, instance + "leave", SyntheticEventCtor, nativeEvent, nativeEventTarget);
                reactName.target = accumulateTargetOnly;
                reactName.relatedTarget = lastHostComponent;
                _instance2 = null;
                getClosestInstanceFromNode(nativeEventTarget) === targetInst && (inCapturePhase = new inCapturePhase(reactEventName, instance + "enter", reactEventType, nativeEvent, nativeEventTarget), inCapturePhase.target = lastHostComponent, inCapturePhase.relatedTarget = accumulateTargetOnly, _instance2 = inCapturePhase);
                accumulateTargetOnly = _instance2;
                if (SyntheticEventCtor && reactEventType)
                  b: {
                    inCapturePhase = getParent;
                    reactEventName = SyntheticEventCtor;
                    instance = reactEventType;
                    lastHostComponent = 0;
                    for (_instance2 = reactEventName;_instance2; _instance2 = inCapturePhase(_instance2))
                      lastHostComponent++;
                    _instance2 = 0;
                    for (var tempB = instance;tempB; tempB = inCapturePhase(tempB))
                      _instance2++;
                    for (;0 < lastHostComponent - _instance2; )
                      reactEventName = inCapturePhase(reactEventName), lastHostComponent--;
                    for (;0 < _instance2 - lastHostComponent; )
                      instance = inCapturePhase(instance), _instance2--;
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
            isComposing ? isFallbackCompositionEnd(domEventName, nativeEvent) && (eventType = "onCompositionEnd") : domEventName === "keydown" && nativeEvent.keyCode === START_KEYCODE && (eventType = "onCompositionStart");
          eventType && (useFallbackCompositionData && nativeEvent.locale !== "ko" && (isComposing || eventType !== "onCompositionStart" ? eventType === "onCompositionEnd" && isComposing && (fallbackData = getData()) : (root = nativeEventTarget, startText = ("value" in root) ? root.value : root.textContent, isComposing = true)), handleEventFunc = accumulateTwoPhaseListeners(targetInst, eventType), 0 < handleEventFunc.length && (eventType = new SyntheticCompositionEvent(eventType, domEventName, null, nativeEvent, nativeEventTarget), dispatchQueue.push({
            event: eventType,
            listeners: handleEventFunc
          }), fallbackData ? eventType.data = fallbackData : (fallbackData = getDataFromCustomEvent(nativeEvent), fallbackData !== null && (eventType.data = fallbackData))));
          if (fallbackData = canUseTextInputEvent ? getNativeBeforeInputChars(domEventName, nativeEvent) : getFallbackBeforeInputChars(domEventName, nativeEvent))
            eventType = accumulateTwoPhaseListeners(targetInst, "onBeforeInput"), 0 < eventType.length && (handleEventFunc = new SyntheticInputEvent("onBeforeInput", "beforeinput", null, nativeEvent, nativeEventTarget), dispatchQueue.push({
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
        var _instance3 = targetFiber, stateNode = _instance3.stateNode;
        _instance3 = _instance3.tag;
        _instance3 !== 5 && _instance3 !== 26 && _instance3 !== 27 || stateNode === null || (_instance3 = getListener(targetFiber, captureName), _instance3 != null && listeners.unshift(createDispatchListener(targetFiber, _instance3, stateNode)), _instance3 = getListener(targetFiber, reactName), _instance3 != null && listeners.push(createDispatchListener(targetFiber, _instance3, stateNode)));
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
        var _instance4 = target, alternate = _instance4.alternate, stateNode = _instance4.stateNode;
        _instance4 = _instance4.tag;
        if (alternate !== null && alternate === common)
          break;
        _instance4 !== 5 && _instance4 !== 26 && _instance4 !== 27 || stateNode === null || (alternate = stateNode, inCapturePhase ? (stateNode = getListener(target, registrationName), stateNode != null && listeners.unshift(createDispatchListener(target, stateNode, alternate))) : inCapturePhase || (stateNode = getListener(target, registrationName), stateNode != null && listeners.push(createDispatchListener(target, stateNode, alternate))));
        target = target.return;
      }
      listeners.length !== 0 && dispatchQueue.push({ event, listeners });
    }
    function validatePropertiesInDevelopment(type, props) {
      validateProperties$2(type, props);
      type !== "input" && type !== "textarea" && type !== "select" || props == null || props.value !== null || didWarnValueNull || (didWarnValueNull = true, type === "select" && props.multiple ? console.error("`value` prop on `%s` should not be null. Consider using an empty array when `multiple` is set to `true` to clear the component or `undefined` for uncontrolled components.", type) : console.error("`value` prop on `%s` should not be null. Consider using an empty string to clear the component or `undefined` for uncontrolled components.", type));
      var eventRegistry = {
        registrationNameDependencies,
        possibleRegistrationNames
      };
      isCustomElement(type) || typeof props.is === "string" || warnUnknownProperties(type, props, eventRegistry);
      props.contentEditable && !props.suppressContentEditableWarning && props.children != null && console.error("A component is `contentEditable` and contains `children` managed by React. It is now your responsibility to guarantee that none of those nodes are unexpectedly modified or duplicated. This is probably not intentional.");
    }
    function warnForPropDifference(propName, serverValue, clientValue, serverDifferences) {
      serverValue !== clientValue && (clientValue = normalizeMarkupForTextOrAttribute(clientValue), normalizeMarkupForTextOrAttribute(serverValue) !== clientValue && (serverDifferences[propName] = serverValue));
    }
    function warnForExtraAttributes(domElement, attributeNames, serverDifferences) {
      attributeNames.forEach(function(attributeName) {
        serverDifferences[getPropNameFromAttributeName(attributeName)] = attributeName === "style" ? getStylesObjectFromElement(domElement) : domElement.getAttribute(attributeName);
      });
    }
    function warnForInvalidEventListener(registrationName, listener) {
      listener === false ? console.error("Expected `%s` listener to be a function, instead got `false`.\n\nIf you used to conditionally omit it with %s={condition && value}, pass %s={condition ? value : undefined} instead.", registrationName, registrationName, registrationName) : console.error("Expected `%s` listener to be a function, instead got a value of `%s` type.", registrationName, typeof listener);
    }
    function normalizeHTML(parent, html) {
      parent = parent.namespaceURI === MATH_NAMESPACE || parent.namespaceURI === SVG_NAMESPACE ? parent.ownerDocument.createElementNS(parent.namespaceURI, parent.tagName) : parent.ownerDocument.createElement(parent.tagName);
      parent.innerHTML = html;
      return parent.innerHTML;
    }
    function normalizeMarkupForTextOrAttribute(markup) {
      willCoercionThrow(markup) && (console.error("The provided HTML markup uses a value of unsupported type %s. This value must be coerced to a string before using it here.", typeName(markup)), testStringCoercion(markup));
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
          if (typeof value === "string")
            validateTextNesting(value, tag, false), tag === "body" || tag === "textarea" && value === "" || setTextContent(domElement, value);
          else if (typeof value === "number" || typeof value === "bigint")
            validateTextNesting("" + value, tag, false), tag !== "body" && setTextContent(domElement, "" + value);
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
            key === "src" ? console.error('An empty string ("") was passed to the %s attribute. This may cause the browser to download the whole page again over the network. To fix this, either do not render the element at all or pass null to %s instead of an empty string.', key, key) : console.error('An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.', key, key);
            domElement.removeAttribute(key);
            break;
          }
          if (value == null || typeof value === "function" || typeof value === "symbol" || typeof value === "boolean") {
            domElement.removeAttribute(key);
            break;
          }
          checkAttributeStringCoercion(value, key);
          value = sanitizeURL("" + value);
          domElement.setAttribute(key, value);
          break;
        case "action":
        case "formAction":
          value != null && (tag === "form" ? key === "formAction" ? console.error("You can only pass the formAction prop to <input> or <button>. Use the action prop on <form>.") : typeof value === "function" && (props.encType == null && props.method == null || didWarnFormActionMethod || (didWarnFormActionMethod = true, console.error("Cannot specify a encType or method for a form that specifies a function as the action. React provides those automatically. They will get overridden.")), props.target == null || didWarnFormActionTarget || (didWarnFormActionTarget = true, console.error("Cannot specify a target for a form that specifies a function as the action. The function will always be executed in the same window."))) : tag === "input" || tag === "button" ? key === "action" ? console.error("You can only pass the action prop to <form>. Use the formAction prop on <input> or <button>.") : tag !== "input" || props.type === "submit" || props.type === "image" || didWarnFormActionType ? tag !== "button" || props.type == null || props.type === "submit" || didWarnFormActionType ? typeof value === "function" && (props.name == null || didWarnFormActionName || (didWarnFormActionName = true, console.error('Cannot specify a "name" prop for a button that specifies a function as a formAction. React needs it to encode which action should be invoked. It will get overridden.')), props.formEncType == null && props.formMethod == null || didWarnFormActionMethod || (didWarnFormActionMethod = true, console.error("Cannot specify a formEncType or formMethod for a button that specifies a function as a formAction. React provides those automatically. They will get overridden.")), props.formTarget == null || didWarnFormActionTarget || (didWarnFormActionTarget = true, console.error("Cannot specify a formTarget for a button that specifies a function as a formAction. The function will always be executed in the same window."))) : (didWarnFormActionType = true, console.error('A button can only specify a formAction along with type="submit" or no type.')) : (didWarnFormActionType = true, console.error('An input can only specify a formAction along with type="submit" or type="image".')) : key === "action" ? console.error("You can only pass the action prop to <form>.") : console.error("You can only pass the formAction prop to <input> or <button>."));
          if (typeof value === "function") {
            domElement.setAttribute(key, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
            break;
          } else
            typeof prevValue === "function" && (key === "formAction" ? (tag !== "input" && setProp(domElement, tag, "name", props.name, props, null), setProp(domElement, tag, "formEncType", props.formEncType, props, null), setProp(domElement, tag, "formMethod", props.formMethod, props, null), setProp(domElement, tag, "formTarget", props.formTarget, props, null)) : (setProp(domElement, tag, "encType", props.encType, props, null), setProp(domElement, tag, "method", props.method, props, null), setProp(domElement, tag, "target", props.target, props, null)));
          if (value == null || typeof value === "symbol" || typeof value === "boolean") {
            domElement.removeAttribute(key);
            break;
          }
          checkAttributeStringCoercion(value, key);
          value = sanitizeURL("" + value);
          domElement.setAttribute(key, value);
          break;
        case "onClick":
          value != null && (typeof value !== "function" && warnForInvalidEventListener(key, value), domElement.onclick = noop$1);
          break;
        case "onScroll":
          value != null && (typeof value !== "function" && warnForInvalidEventListener(key, value), listenToNonDelegatedEvent("scroll", domElement));
          break;
        case "onScrollEnd":
          value != null && (typeof value !== "function" && warnForInvalidEventListener(key, value), listenToNonDelegatedEvent("scrollend", domElement));
          break;
        case "dangerouslySetInnerHTML":
          if (value != null) {
            if (typeof value !== "object" || !("__html" in value))
              throw Error("`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information.");
            key = value.__html;
            if (key != null) {
              if (props.children != null)
                throw Error("Can only set one of `children` or `props.dangerouslySetInnerHTML`.");
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
          checkAttributeStringCoercion(value, key);
          key = sanitizeURL("" + value);
          domElement.setAttributeNS(xlinkNamespace, "xlink:href", key);
          break;
        case "contentEditable":
        case "spellCheck":
        case "draggable":
        case "value":
        case "autoReverse":
        case "externalResourcesRequired":
        case "focusable":
        case "preserveAlpha":
          value != null && typeof value !== "function" && typeof value !== "symbol" ? (checkAttributeStringCoercion(value, key), domElement.setAttribute(key, "" + value)) : domElement.removeAttribute(key);
          break;
        case "inert":
          value !== "" || didWarnForNewBooleanPropsWithEmptyValue[key] || (didWarnForNewBooleanPropsWithEmptyValue[key] = true, console.error("Received an empty string for a boolean attribute `%s`. This will treat the attribute as if it were false. Either pass `false` to silence this warning, or pass `true` if you used an empty string in earlier versions of React to indicate this attribute is true.", key));
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
          value === true ? domElement.setAttribute(key, "") : value !== false && value != null && typeof value !== "function" && typeof value !== "symbol" ? (checkAttributeStringCoercion(value, key), domElement.setAttribute(key, value)) : domElement.removeAttribute(key);
          break;
        case "cols":
        case "rows":
        case "size":
        case "span":
          value != null && typeof value !== "function" && typeof value !== "symbol" && !isNaN(value) && 1 <= value ? (checkAttributeStringCoercion(value, key), domElement.setAttribute(key, value)) : domElement.removeAttribute(key);
          break;
        case "rowSpan":
        case "start":
          value == null || typeof value === "function" || typeof value === "symbol" || isNaN(value) ? domElement.removeAttribute(key) : (checkAttributeStringCoercion(value, key), domElement.setAttribute(key, value));
          break;
        case "popover":
          listenToNonDelegatedEvent("beforetoggle", domElement);
          listenToNonDelegatedEvent("toggle", domElement);
          setValueForAttribute(domElement, "popover", value);
          break;
        case "xlinkActuate":
          setValueForNamespacedAttribute(domElement, xlinkNamespace, "xlink:actuate", value);
          break;
        case "xlinkArcrole":
          setValueForNamespacedAttribute(domElement, xlinkNamespace, "xlink:arcrole", value);
          break;
        case "xlinkRole":
          setValueForNamespacedAttribute(domElement, xlinkNamespace, "xlink:role", value);
          break;
        case "xlinkShow":
          setValueForNamespacedAttribute(domElement, xlinkNamespace, "xlink:show", value);
          break;
        case "xlinkTitle":
          setValueForNamespacedAttribute(domElement, xlinkNamespace, "xlink:title", value);
          break;
        case "xlinkType":
          setValueForNamespacedAttribute(domElement, xlinkNamespace, "xlink:type", value);
          break;
        case "xmlBase":
          setValueForNamespacedAttribute(domElement, xmlNamespace, "xml:base", value);
          break;
        case "xmlLang":
          setValueForNamespacedAttribute(domElement, xmlNamespace, "xml:lang", value);
          break;
        case "xmlSpace":
          setValueForNamespacedAttribute(domElement, xmlNamespace, "xml:space", value);
          break;
        case "is":
          prevValue != null && console.error('Cannot update the "is" prop after it has been initialized.');
          setValueForAttribute(domElement, "is", value);
          break;
        case "innerText":
        case "textContent":
          break;
        case "popoverTarget":
          didWarnPopoverTargetObject || value == null || typeof value !== "object" || (didWarnPopoverTargetObject = true, console.error("The `popoverTarget` prop expects the ID of an Element as a string. Received %s instead.", value));
        default:
          !(2 < key.length) || key[0] !== "o" && key[0] !== "O" || key[1] !== "n" && key[1] !== "N" ? (key = getAttributeAlias(key), setValueForAttribute(domElement, key, value)) : registrationNameDependencies.hasOwnProperty(key) && value != null && typeof value !== "function" && warnForInvalidEventListener(key, value);
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
              throw Error("`props.dangerouslySetInnerHTML` must be in the form `{__html: ...}`. Please visit https://react.dev/link/dangerously-set-inner-html for more information.");
            key = value.__html;
            if (key != null) {
              if (props.children != null)
                throw Error("Can only set one of `children` or `props.dangerouslySetInnerHTML`.");
              domElement.innerHTML = key;
            }
          }
          break;
        case "children":
          typeof value === "string" ? setTextContent(domElement, value) : (typeof value === "number" || typeof value === "bigint") && setTextContent(domElement, "" + value);
          break;
        case "onScroll":
          value != null && (typeof value !== "function" && warnForInvalidEventListener(key, value), listenToNonDelegatedEvent("scroll", domElement));
          break;
        case "onScrollEnd":
          value != null && (typeof value !== "function" && warnForInvalidEventListener(key, value), listenToNonDelegatedEvent("scrollend", domElement));
          break;
        case "onClick":
          value != null && (typeof value !== "function" && warnForInvalidEventListener(key, value), domElement.onclick = noop$1);
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
          if (registrationNameDependencies.hasOwnProperty(key))
            value != null && typeof value !== "function" && warnForInvalidEventListener(key, value);
          else
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
      validatePropertiesInDevelopment(tag, props);
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
                    throw Error(tag + " is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.");
                  default:
                    setProp(domElement, tag, propKey, propValue, props, null);
                }
            }
          hasSrcSet && setProp(domElement, tag, "srcSet", props.srcSet, props, null);
          hasSrc && setProp(domElement, tag, "src", props.src, props, null);
          return;
        case "input":
          checkControlledValueProps("input", props);
          listenToNonDelegatedEvent("invalid", domElement);
          var defaultValue = propKey = propValue = hasSrcSet = null, checked = null, defaultChecked = null;
          for (hasSrc in props)
            if (props.hasOwnProperty(hasSrc)) {
              var _propValue = props[hasSrc];
              if (_propValue != null)
                switch (hasSrc) {
                  case "name":
                    hasSrcSet = _propValue;
                    break;
                  case "type":
                    propValue = _propValue;
                    break;
                  case "checked":
                    checked = _propValue;
                    break;
                  case "defaultChecked":
                    defaultChecked = _propValue;
                    break;
                  case "value":
                    propKey = _propValue;
                    break;
                  case "defaultValue":
                    defaultValue = _propValue;
                    break;
                  case "children":
                  case "dangerouslySetInnerHTML":
                    if (_propValue != null)
                      throw Error(tag + " is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.");
                    break;
                  default:
                    setProp(domElement, tag, hasSrc, _propValue, props, null);
                }
            }
          validateInputProps(domElement, props);
          initInput(domElement, propKey, defaultValue, checked, defaultChecked, propValue, hasSrcSet, false);
          return;
        case "select":
          checkControlledValueProps("select", props);
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
          validateSelectProps(domElement, props);
          tag = propKey;
          props = propValue;
          domElement.multiple = !!hasSrc;
          tag != null ? updateOptions(domElement, !!hasSrc, tag, false) : props != null && updateOptions(domElement, !!hasSrc, props, true);
          return;
        case "textarea":
          checkControlledValueProps("textarea", props);
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
                    throw Error("`dangerouslySetInnerHTML` does not make sense on <textarea>.");
                  break;
                default:
                  setProp(domElement, tag, propValue, defaultValue, props, null);
              }
          validateTextareaProps(domElement, props);
          initTextarea(domElement, hasSrc, hasSrcSet, propKey);
          return;
        case "option":
          validateOptionProps(domElement, props);
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
                  throw Error(tag + " is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.");
                default:
                  setProp(domElement, tag, defaultChecked, hasSrc, props, null);
              }
          return;
        default:
          if (isCustomElement(tag)) {
            for (_propValue in props)
              props.hasOwnProperty(_propValue) && (hasSrc = props[_propValue], hasSrc !== undefined && setPropOnCustomElement(domElement, tag, _propValue, hasSrc, props, undefined));
            return;
          }
      }
      for (defaultValue in props)
        props.hasOwnProperty(defaultValue) && (hasSrc = props[defaultValue], hasSrc != null && setProp(domElement, tag, defaultValue, hasSrc, props, null));
    }
    function updateProperties(domElement, tag, lastProps, nextProps) {
      validatePropertiesInDevelopment(tag, nextProps);
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
          for (var _propKey8 in nextProps) {
            var propKey = nextProps[_propKey8];
            lastProp = lastProps[_propKey8];
            if (nextProps.hasOwnProperty(_propKey8) && (propKey != null || lastProp != null))
              switch (_propKey8) {
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
                    throw Error(tag + " is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.");
                  break;
                default:
                  propKey !== lastProp && setProp(domElement, tag, _propKey8, propKey, nextProps, lastProp);
              }
          }
          tag = lastProps.type === "checkbox" || lastProps.type === "radio" ? lastProps.checked != null : lastProps.value != null;
          nextProps = nextProps.type === "checkbox" || nextProps.type === "radio" ? nextProps.checked != null : nextProps.value != null;
          tag || !nextProps || didWarnUncontrolledToControlled || (console.error("A component is changing an uncontrolled input to be controlled. This is likely caused by the value changing from undefined to a defined value, which should not happen. Decide between using a controlled or uncontrolled input element for the lifetime of the component. More info: https://react.dev/link/controlled-components"), didWarnUncontrolledToControlled = true);
          !tag || nextProps || didWarnControlledToUncontrolled || (console.error("A component is changing a controlled input to be uncontrolled. This is likely caused by the value changing from a defined to undefined, which should not happen. Decide between using a controlled or uncontrolled input element for the lifetime of the component. More info: https://react.dev/link/controlled-components"), didWarnControlledToUncontrolled = true);
          updateInput(domElement, value, defaultValue, lastDefaultValue, checked, defaultChecked, type, name);
          return;
        case "select":
          propKey = value = defaultValue = _propKey8 = null;
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
                  _propKey8 = type;
                  break;
                case "defaultValue":
                  defaultValue = type;
                  break;
                case "multiple":
                  value = type;
                default:
                  type !== lastDefaultValue && setProp(domElement, tag, name, type, nextProps, lastDefaultValue);
              }
          nextProps = defaultValue;
          tag = value;
          lastProps = propKey;
          _propKey8 != null ? updateOptions(domElement, !!tag, _propKey8, false) : !!lastProps !== !!tag && (nextProps != null ? updateOptions(domElement, !!tag, nextProps, true) : updateOptions(domElement, !!tag, tag ? [] : "", false));
          return;
        case "textarea":
          propKey = _propKey8 = null;
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
                  _propKey8 = name;
                  break;
                case "defaultValue":
                  propKey = name;
                  break;
                case "children":
                  break;
                case "dangerouslySetInnerHTML":
                  if (name != null)
                    throw Error("`dangerouslySetInnerHTML` does not make sense on <textarea>.");
                  break;
                default:
                  name !== type && setProp(domElement, tag, value, name, nextProps, type);
              }
          updateTextarea(domElement, _propKey8, propKey);
          return;
        case "option":
          for (var _propKey13 in lastProps)
            if (_propKey8 = lastProps[_propKey13], lastProps.hasOwnProperty(_propKey13) && _propKey8 != null && !nextProps.hasOwnProperty(_propKey13))
              switch (_propKey13) {
                case "selected":
                  domElement.selected = false;
                  break;
                default:
                  setProp(domElement, tag, _propKey13, null, nextProps, _propKey8);
              }
          for (lastDefaultValue in nextProps)
            if (_propKey8 = nextProps[lastDefaultValue], propKey = lastProps[lastDefaultValue], nextProps.hasOwnProperty(lastDefaultValue) && _propKey8 !== propKey && (_propKey8 != null || propKey != null))
              switch (lastDefaultValue) {
                case "selected":
                  domElement.selected = _propKey8 && typeof _propKey8 !== "function" && typeof _propKey8 !== "symbol";
                  break;
                default:
                  setProp(domElement, tag, lastDefaultValue, _propKey8, nextProps, propKey);
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
          for (var _propKey15 in lastProps)
            _propKey8 = lastProps[_propKey15], lastProps.hasOwnProperty(_propKey15) && _propKey8 != null && !nextProps.hasOwnProperty(_propKey15) && setProp(domElement, tag, _propKey15, null, nextProps, _propKey8);
          for (checked in nextProps)
            if (_propKey8 = nextProps[checked], propKey = lastProps[checked], nextProps.hasOwnProperty(checked) && _propKey8 !== propKey && (_propKey8 != null || propKey != null))
              switch (checked) {
                case "children":
                case "dangerouslySetInnerHTML":
                  if (_propKey8 != null)
                    throw Error(tag + " is a void element tag and must neither have `children` nor use `dangerouslySetInnerHTML`.");
                  break;
                default:
                  setProp(domElement, tag, checked, _propKey8, nextProps, propKey);
              }
          return;
        default:
          if (isCustomElement(tag)) {
            for (var _propKey17 in lastProps)
              _propKey8 = lastProps[_propKey17], lastProps.hasOwnProperty(_propKey17) && _propKey8 !== undefined && !nextProps.hasOwnProperty(_propKey17) && setPropOnCustomElement(domElement, tag, _propKey17, undefined, nextProps, _propKey8);
            for (defaultChecked in nextProps)
              _propKey8 = nextProps[defaultChecked], propKey = lastProps[defaultChecked], !nextProps.hasOwnProperty(defaultChecked) || _propKey8 === propKey || _propKey8 === undefined && propKey === undefined || setPropOnCustomElement(domElement, tag, defaultChecked, _propKey8, nextProps, propKey);
            return;
          }
      }
      for (var _propKey19 in lastProps)
        _propKey8 = lastProps[_propKey19], lastProps.hasOwnProperty(_propKey19) && _propKey8 != null && !nextProps.hasOwnProperty(_propKey19) && setProp(domElement, tag, _propKey19, null, nextProps, _propKey8);
      for (lastProp in nextProps)
        _propKey8 = nextProps[lastProp], propKey = lastProps[lastProp], !nextProps.hasOwnProperty(lastProp) || _propKey8 === propKey || _propKey8 == null && propKey == null || setProp(domElement, tag, lastProp, _propKey8, nextProps, propKey);
    }
    function getPropNameFromAttributeName(attrName) {
      switch (attrName) {
        case "class":
          return "className";
        case "for":
          return "htmlFor";
        default:
          return attrName;
      }
    }
    function getStylesObjectFromElement(domElement) {
      var serverValueInObjectForm = {};
      domElement = domElement.style;
      for (var i = 0;i < domElement.length; i++) {
        var styleName = domElement[i];
        serverValueInObjectForm[styleName] = domElement.getPropertyValue(styleName);
      }
      return serverValueInObjectForm;
    }
    function diffHydratedStyles(domElement, value$jscomp$0, serverDifferences) {
      if (value$jscomp$0 != null && typeof value$jscomp$0 !== "object")
        console.error("The `style` prop expects a mapping from style properties to values, not a string. For example, style={{marginRight: spacing + 'em'}} when using JSX.");
      else {
        var clientValue;
        var delimiter = clientValue = "", styleName;
        for (styleName in value$jscomp$0)
          if (value$jscomp$0.hasOwnProperty(styleName)) {
            var value = value$jscomp$0[styleName];
            value != null && typeof value !== "boolean" && value !== "" && (styleName.indexOf("--") === 0 ? (checkCSSPropertyStringCoercion(value, styleName), clientValue += delimiter + styleName + ":" + ("" + value).trim()) : typeof value !== "number" || value === 0 || unitlessNumbers.has(styleName) ? (checkCSSPropertyStringCoercion(value, styleName), clientValue += delimiter + styleName.replace(uppercasePattern, "-$1").toLowerCase().replace(msPattern$1, "-ms-") + ":" + ("" + value).trim()) : clientValue += delimiter + styleName.replace(uppercasePattern, "-$1").toLowerCase().replace(msPattern$1, "-ms-") + ":" + value + "px", delimiter = ";");
          }
        clientValue = clientValue || null;
        value$jscomp$0 = domElement.getAttribute("style");
        value$jscomp$0 !== clientValue && (clientValue = normalizeMarkupForTextOrAttribute(clientValue), normalizeMarkupForTextOrAttribute(value$jscomp$0) !== clientValue && (serverDifferences.style = getStylesObjectFromElement(domElement)));
      }
    }
    function hydrateAttribute(domElement, propKey, attributeName, value, extraAttributes, serverDifferences) {
      extraAttributes.delete(attributeName);
      domElement = domElement.getAttribute(attributeName);
      if (domElement === null)
        switch (typeof value) {
          case "undefined":
          case "function":
          case "symbol":
          case "boolean":
            return;
        }
      else if (value != null)
        switch (typeof value) {
          case "function":
          case "symbol":
          case "boolean":
            break;
          default:
            if (checkAttributeStringCoercion(value, propKey), domElement === "" + value)
              return;
        }
      warnForPropDifference(propKey, domElement, value, serverDifferences);
    }
    function hydrateBooleanAttribute(domElement, propKey, attributeName, value, extraAttributes, serverDifferences) {
      extraAttributes.delete(attributeName);
      domElement = domElement.getAttribute(attributeName);
      if (domElement === null) {
        switch (typeof value) {
          case "function":
          case "symbol":
            return;
        }
        if (!value)
          return;
      } else
        switch (typeof value) {
          case "function":
          case "symbol":
            break;
          default:
            if (value)
              return;
        }
      warnForPropDifference(propKey, domElement, value, serverDifferences);
    }
    function hydrateBooleanishAttribute(domElement, propKey, attributeName, value, extraAttributes, serverDifferences) {
      extraAttributes.delete(attributeName);
      domElement = domElement.getAttribute(attributeName);
      if (domElement === null)
        switch (typeof value) {
          case "undefined":
          case "function":
          case "symbol":
            return;
        }
      else if (value != null)
        switch (typeof value) {
          case "function":
          case "symbol":
            break;
          default:
            if (checkAttributeStringCoercion(value, attributeName), domElement === "" + value)
              return;
        }
      warnForPropDifference(propKey, domElement, value, serverDifferences);
    }
    function hydrateNumericAttribute(domElement, propKey, attributeName, value, extraAttributes, serverDifferences) {
      extraAttributes.delete(attributeName);
      domElement = domElement.getAttribute(attributeName);
      if (domElement === null)
        switch (typeof value) {
          case "undefined":
          case "function":
          case "symbol":
          case "boolean":
            return;
          default:
            if (isNaN(value))
              return;
        }
      else if (value != null)
        switch (typeof value) {
          case "function":
          case "symbol":
          case "boolean":
            break;
          default:
            if (!isNaN(value) && (checkAttributeStringCoercion(value, propKey), domElement === "" + value))
              return;
        }
      warnForPropDifference(propKey, domElement, value, serverDifferences);
    }
    function hydrateSanitizedAttribute(domElement, propKey, attributeName, value, extraAttributes, serverDifferences) {
      extraAttributes.delete(attributeName);
      domElement = domElement.getAttribute(attributeName);
      if (domElement === null)
        switch (typeof value) {
          case "undefined":
          case "function":
          case "symbol":
          case "boolean":
            return;
        }
      else if (value != null)
        switch (typeof value) {
          case "function":
          case "symbol":
          case "boolean":
            break;
          default:
            if (checkAttributeStringCoercion(value, propKey), attributeName = sanitizeURL("" + value), domElement === attributeName)
              return;
        }
      warnForPropDifference(propKey, domElement, value, serverDifferences);
    }
    function diffHydratedProperties(domElement, tag, props, hostContext) {
      for (var serverDifferences = {}, extraAttributes = new Set, attributes = domElement.attributes, i = 0;i < attributes.length; i++)
        switch (attributes[i].name.toLowerCase()) {
          case "value":
            break;
          case "checked":
            break;
          case "selected":
            break;
          default:
            extraAttributes.add(attributes[i].name);
        }
      if (isCustomElement(tag))
        for (var propKey in props) {
          if (props.hasOwnProperty(propKey)) {
            var value = props[propKey];
            if (value != null) {
              if (registrationNameDependencies.hasOwnProperty(propKey))
                typeof value !== "function" && warnForInvalidEventListener(propKey, value);
              else if (props.suppressHydrationWarning !== true)
                switch (propKey) {
                  case "children":
                    typeof value !== "string" && typeof value !== "number" || warnForPropDifference("children", domElement.textContent, value, serverDifferences);
                    continue;
                  case "suppressContentEditableWarning":
                  case "suppressHydrationWarning":
                  case "defaultValue":
                  case "defaultChecked":
                  case "innerHTML":
                  case "ref":
                    continue;
                  case "dangerouslySetInnerHTML":
                    attributes = domElement.innerHTML;
                    value = value ? value.__html : undefined;
                    value != null && (value = normalizeHTML(domElement, value), warnForPropDifference(propKey, attributes, value, serverDifferences));
                    continue;
                  case "style":
                    extraAttributes.delete(propKey);
                    diffHydratedStyles(domElement, value, serverDifferences);
                    continue;
                  case "offsetParent":
                  case "offsetTop":
                  case "offsetLeft":
                  case "offsetWidth":
                  case "offsetHeight":
                  case "isContentEditable":
                  case "outerText":
                  case "outerHTML":
                    extraAttributes.delete(propKey.toLowerCase());
                    console.error("Assignment to read-only property will result in a no-op: `%s`", propKey);
                    continue;
                  case "className":
                    extraAttributes.delete("class");
                    attributes = getValueForAttributeOnCustomComponent(domElement, "class", value);
                    warnForPropDifference("className", attributes, value, serverDifferences);
                    continue;
                  default:
                    hostContext.context === HostContextNamespaceNone && tag !== "svg" && tag !== "math" ? extraAttributes.delete(propKey.toLowerCase()) : extraAttributes.delete(propKey), attributes = getValueForAttributeOnCustomComponent(domElement, propKey, value), warnForPropDifference(propKey, attributes, value, serverDifferences);
                }
            }
          }
        }
      else
        for (value in props)
          if (props.hasOwnProperty(value) && (propKey = props[value], propKey != null)) {
            if (registrationNameDependencies.hasOwnProperty(value))
              typeof propKey !== "function" && warnForInvalidEventListener(value, propKey);
            else if (props.suppressHydrationWarning !== true)
              switch (value) {
                case "children":
                  typeof propKey !== "string" && typeof propKey !== "number" || warnForPropDifference("children", domElement.textContent, propKey, serverDifferences);
                  continue;
                case "suppressContentEditableWarning":
                case "suppressHydrationWarning":
                case "value":
                case "checked":
                case "selected":
                case "defaultValue":
                case "defaultChecked":
                case "innerHTML":
                case "ref":
                  continue;
                case "dangerouslySetInnerHTML":
                  attributes = domElement.innerHTML;
                  propKey = propKey ? propKey.__html : undefined;
                  propKey != null && (propKey = normalizeHTML(domElement, propKey), attributes !== propKey && (serverDifferences[value] = { __html: attributes }));
                  continue;
                case "className":
                  hydrateAttribute(domElement, value, "class", propKey, extraAttributes, serverDifferences);
                  continue;
                case "tabIndex":
                  hydrateAttribute(domElement, value, "tabindex", propKey, extraAttributes, serverDifferences);
                  continue;
                case "style":
                  extraAttributes.delete(value);
                  diffHydratedStyles(domElement, propKey, serverDifferences);
                  continue;
                case "multiple":
                  extraAttributes.delete(value);
                  warnForPropDifference(value, domElement.multiple, propKey, serverDifferences);
                  continue;
                case "muted":
                  extraAttributes.delete(value);
                  warnForPropDifference(value, domElement.muted, propKey, serverDifferences);
                  continue;
                case "autoFocus":
                  extraAttributes.delete("autofocus");
                  warnForPropDifference(value, domElement.autofocus, propKey, serverDifferences);
                  continue;
                case "data":
                  if (tag !== "object") {
                    extraAttributes.delete(value);
                    attributes = domElement.getAttribute("data");
                    warnForPropDifference(value, attributes, propKey, serverDifferences);
                    continue;
                  }
                case "src":
                case "href":
                  if (!(propKey !== "" || tag === "a" && value === "href" || tag === "object" && value === "data")) {
                    value === "src" ? console.error('An empty string ("") was passed to the %s attribute. This may cause the browser to download the whole page again over the network. To fix this, either do not render the element at all or pass null to %s instead of an empty string.', value, value) : console.error('An empty string ("") was passed to the %s attribute. To fix this, either do not render the element at all or pass null to %s instead of an empty string.', value, value);
                    continue;
                  }
                  hydrateSanitizedAttribute(domElement, value, value, propKey, extraAttributes, serverDifferences);
                  continue;
                case "action":
                case "formAction":
                  attributes = domElement.getAttribute(value);
                  if (typeof propKey === "function") {
                    extraAttributes.delete(value.toLowerCase());
                    value === "formAction" ? (extraAttributes.delete("name"), extraAttributes.delete("formenctype"), extraAttributes.delete("formmethod"), extraAttributes.delete("formtarget")) : (extraAttributes.delete("enctype"), extraAttributes.delete("method"), extraAttributes.delete("target"));
                    continue;
                  } else if (attributes === EXPECTED_FORM_ACTION_URL) {
                    extraAttributes.delete(value.toLowerCase());
                    warnForPropDifference(value, "function", propKey, serverDifferences);
                    continue;
                  }
                  hydrateSanitizedAttribute(domElement, value, value.toLowerCase(), propKey, extraAttributes, serverDifferences);
                  continue;
                case "xlinkHref":
                  hydrateSanitizedAttribute(domElement, value, "xlink:href", propKey, extraAttributes, serverDifferences);
                  continue;
                case "contentEditable":
                  hydrateBooleanishAttribute(domElement, value, "contenteditable", propKey, extraAttributes, serverDifferences);
                  continue;
                case "spellCheck":
                  hydrateBooleanishAttribute(domElement, value, "spellcheck", propKey, extraAttributes, serverDifferences);
                  continue;
                case "draggable":
                case "autoReverse":
                case "externalResourcesRequired":
                case "focusable":
                case "preserveAlpha":
                  hydrateBooleanishAttribute(domElement, value, value, propKey, extraAttributes, serverDifferences);
                  continue;
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
                  hydrateBooleanAttribute(domElement, value, value.toLowerCase(), propKey, extraAttributes, serverDifferences);
                  continue;
                case "capture":
                case "download":
                  a: {
                    i = domElement;
                    var attributeName = attributes = value, serverDifferences$jscomp$0 = serverDifferences;
                    extraAttributes.delete(attributeName);
                    i = i.getAttribute(attributeName);
                    if (i === null)
                      switch (typeof propKey) {
                        case "undefined":
                        case "function":
                        case "symbol":
                          break a;
                        default:
                          if (propKey === false)
                            break a;
                      }
                    else if (propKey != null)
                      switch (typeof propKey) {
                        case "function":
                        case "symbol":
                          break;
                        case "boolean":
                          if (propKey === true && i === "")
                            break a;
                          break;
                        default:
                          if (checkAttributeStringCoercion(propKey, attributes), i === "" + propKey)
                            break a;
                      }
                    warnForPropDifference(attributes, i, propKey, serverDifferences$jscomp$0);
                  }
                  continue;
                case "cols":
                case "rows":
                case "size":
                case "span":
                  a: {
                    i = domElement;
                    attributeName = attributes = value;
                    serverDifferences$jscomp$0 = serverDifferences;
                    extraAttributes.delete(attributeName);
                    i = i.getAttribute(attributeName);
                    if (i === null)
                      switch (typeof propKey) {
                        case "undefined":
                        case "function":
                        case "symbol":
                        case "boolean":
                          break a;
                        default:
                          if (isNaN(propKey) || 1 > propKey)
                            break a;
                      }
                    else if (propKey != null)
                      switch (typeof propKey) {
                        case "function":
                        case "symbol":
                        case "boolean":
                          break;
                        default:
                          if (!(isNaN(propKey) || 1 > propKey) && (checkAttributeStringCoercion(propKey, attributes), i === "" + propKey))
                            break a;
                      }
                    warnForPropDifference(attributes, i, propKey, serverDifferences$jscomp$0);
                  }
                  continue;
                case "rowSpan":
                  hydrateNumericAttribute(domElement, value, "rowspan", propKey, extraAttributes, serverDifferences);
                  continue;
                case "start":
                  hydrateNumericAttribute(domElement, value, value, propKey, extraAttributes, serverDifferences);
                  continue;
                case "xHeight":
                  hydrateAttribute(domElement, value, "x-height", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xlinkActuate":
                  hydrateAttribute(domElement, value, "xlink:actuate", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xlinkArcrole":
                  hydrateAttribute(domElement, value, "xlink:arcrole", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xlinkRole":
                  hydrateAttribute(domElement, value, "xlink:role", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xlinkShow":
                  hydrateAttribute(domElement, value, "xlink:show", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xlinkTitle":
                  hydrateAttribute(domElement, value, "xlink:title", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xlinkType":
                  hydrateAttribute(domElement, value, "xlink:type", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xmlBase":
                  hydrateAttribute(domElement, value, "xml:base", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xmlLang":
                  hydrateAttribute(domElement, value, "xml:lang", propKey, extraAttributes, serverDifferences);
                  continue;
                case "xmlSpace":
                  hydrateAttribute(domElement, value, "xml:space", propKey, extraAttributes, serverDifferences);
                  continue;
                case "inert":
                  propKey !== "" || didWarnForNewBooleanPropsWithEmptyValue[value] || (didWarnForNewBooleanPropsWithEmptyValue[value] = true, console.error("Received an empty string for a boolean attribute `%s`. This will treat the attribute as if it were false. Either pass `false` to silence this warning, or pass `true` if you used an empty string in earlier versions of React to indicate this attribute is true.", value));
                  hydrateBooleanAttribute(domElement, value, value, propKey, extraAttributes, serverDifferences);
                  continue;
                default:
                  if (!(2 < value.length) || value[0] !== "o" && value[0] !== "O" || value[1] !== "n" && value[1] !== "N") {
                    i = getAttributeAlias(value);
                    attributes = false;
                    hostContext.context === HostContextNamespaceNone && tag !== "svg" && tag !== "math" ? extraAttributes.delete(i.toLowerCase()) : (attributeName = value.toLowerCase(), attributeName = possibleStandardNames.hasOwnProperty(attributeName) ? possibleStandardNames[attributeName] || null : null, attributeName !== null && attributeName !== value && (attributes = true, extraAttributes.delete(attributeName)), extraAttributes.delete(i));
                    a:
                      if (attributeName = domElement, serverDifferences$jscomp$0 = i, i = propKey, isAttributeNameSafe(serverDifferences$jscomp$0))
                        if (attributeName.hasAttribute(serverDifferences$jscomp$0))
                          attributeName = attributeName.getAttribute(serverDifferences$jscomp$0), checkAttributeStringCoercion(i, serverDifferences$jscomp$0), i = attributeName === "" + i ? i : attributeName;
                        else {
                          switch (typeof i) {
                            case "function":
                            case "symbol":
                              break a;
                            case "boolean":
                              if (attributeName = serverDifferences$jscomp$0.toLowerCase().slice(0, 5), attributeName !== "data-" && attributeName !== "aria-")
                                break a;
                          }
                          i = i === undefined ? undefined : null;
                        }
                      else
                        i = undefined;
                    attributes || warnForPropDifference(value, i, propKey, serverDifferences);
                  }
              }
          }
      0 < extraAttributes.size && props.suppressHydrationWarning !== true && warnForExtraAttributes(domElement, extraAttributes, serverDifferences);
      return Object.keys(serverDifferences).length === 0 ? null : serverDifferences;
    }
    function propNamesListJoin(list, combinator) {
      switch (list.length) {
        case 0:
          return "";
        case 1:
          return list[0];
        case 2:
          return list[0] + " " + combinator + " " + list[1];
        default:
          return list.slice(0, -1).join(", ") + ", " + combinator + " " + list[list.length - 1];
      }
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
        case SVG_NAMESPACE:
          return HostContextNamespaceSvg;
        case MATH_NAMESPACE:
          return HostContextNamespaceMath;
        default:
          return HostContextNamespaceNone;
      }
    }
    function getChildHostContextProd(parentNamespace, type) {
      if (parentNamespace === HostContextNamespaceNone)
        switch (type) {
          case "svg":
            return HostContextNamespaceSvg;
          case "math":
            return HostContextNamespaceMath;
          default:
            return HostContextNamespaceNone;
        }
      return parentNamespace === HostContextNamespaceSvg && type === "foreignObject" ? HostContextNamespaceNone : parentNamespace;
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
    function resolveEventType() {
      var event = window.event;
      return event && event !== schedulerEvent ? event.type : null;
    }
    function resolveEventTimeStamp() {
      var event = window.event;
      return event && event !== schedulerEvent ? event.timeStamp : -1.1;
    }
    function handleErrorInNextTick(error) {
      setTimeout(function() {
        throw error;
      });
    }
    function commitMount(domElement, type, newProps) {
      switch (type) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          newProps.autoFocus && domElement.focus();
          break;
        case "img":
          newProps.src ? domElement.src = newProps.src : newProps.srcSet && (domElement.srcset = newProps.srcSet);
      }
    }
    function commitHydratedInstance() {}
    function commitUpdate(domElement, type, oldProps, newProps) {
      updateProperties(domElement, type, oldProps, newProps);
      domElement[internalPropsKey] = newProps;
    }
    function resetTextContent(domElement) {
      setTextContent(domElement, "");
    }
    function commitTextUpdate(textInstance, oldText, newText) {
      textInstance.nodeValue = newText;
    }
    function warnForReactChildrenConflict(container) {
      if (!container.__reactWarnedAboutChildrenConflict) {
        var props = container[internalPropsKey] || null;
        if (props !== null) {
          var fiber = getInstanceFromNode(container);
          fiber !== null && (typeof props.children === "string" || typeof props.children === "number" ? (container.__reactWarnedAboutChildrenConflict = true, runWithFiberInDEV(fiber, function() {
            console.error('Cannot use a ref on a React element as a container to `createRoot` or `createPortal` if that element also sets "children" text content using React. It should be a leaf with no children. Otherwise it\'s ambiguous which children should be used.');
          })) : props.dangerouslySetInnerHTML != null && (container.__reactWarnedAboutChildrenConflict = true, runWithFiberInDEV(fiber, function() {
            console.error('Cannot use a ref on a React element as a container to `createRoot` or `createPortal` if that element also sets "dangerouslySetInnerHTML" using React. It should be a leaf with no children. Otherwise it\'s ambiguous which children should be used.');
          })));
        }
      }
    }
    function isSingletonScope(type) {
      return type === "head";
    }
    function removeChild(parentInstance, child) {
      parentInstance.removeChild(child);
    }
    function removeChildFromContainer(container, child) {
      (container.nodeType === 9 ? container.body : container.nodeName === "HTML" ? container.ownerDocument.body : container).removeChild(child);
    }
    function clearHydrationBoundary(parentInstance, hydrationInstance) {
      var node = hydrationInstance, depth = 0;
      do {
        var nextNode = node.nextSibling;
        parentInstance.removeChild(node);
        if (nextNode && nextNode.nodeType === 8)
          if (node = nextNode.data, node === SUSPENSE_END_DATA || node === ACTIVITY_END_DATA) {
            if (depth === 0) {
              parentInstance.removeChild(nextNode);
              retryIfBlockedOn(hydrationInstance);
              return;
            }
            depth--;
          } else if (node === SUSPENSE_START_DATA || node === SUSPENSE_PENDING_START_DATA || node === SUSPENSE_QUEUED_START_DATA || node === SUSPENSE_FALLBACK_START_DATA || node === ACTIVITY_START_DATA)
            depth++;
          else if (node === PREAMBLE_CONTRIBUTION_HTML)
            releaseSingletonInstance(parentInstance.ownerDocument.documentElement);
          else if (node === PREAMBLE_CONTRIBUTION_HEAD) {
            node = parentInstance.ownerDocument.head;
            releaseSingletonInstance(node);
            for (var node$jscomp$0 = node.firstChild;node$jscomp$0; ) {
              var { nextSibling: nextNode$jscomp$0, nodeName } = node$jscomp$0;
              node$jscomp$0[internalHoistableMarker] || nodeName === "SCRIPT" || nodeName === "STYLE" || nodeName === "LINK" && node$jscomp$0.rel.toLowerCase() === "stylesheet" || node.removeChild(node$jscomp$0);
              node$jscomp$0 = nextNode$jscomp$0;
            }
          } else
            node === PREAMBLE_CONTRIBUTION_BODY && releaseSingletonInstance(parentInstance.ownerDocument.body);
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
          if (node = nextNode.data, node === SUSPENSE_END_DATA)
            if (suspenseInstance === 0)
              break;
            else
              suspenseInstance--;
          else
            node !== SUSPENSE_START_DATA && node !== SUSPENSE_PENDING_START_DATA && node !== SUSPENSE_QUEUED_START_DATA && node !== SUSPENSE_FALLBACK_START_DATA || suspenseInstance++;
        node = nextNode;
      } while (node);
    }
    function hideDehydratedBoundary(suspenseInstance) {
      hideOrUnhideDehydratedBoundary(suspenseInstance, true);
    }
    function hideInstance(instance) {
      instance = instance.style;
      typeof instance.setProperty === "function" ? instance.setProperty("display", "none", "important") : instance.display = "none";
    }
    function hideTextInstance(textInstance) {
      textInstance.nodeValue = "";
    }
    function unhideDehydratedBoundary(dehydratedInstance) {
      hideOrUnhideDehydratedBoundary(dehydratedInstance, false);
    }
    function unhideInstance(instance, props) {
      props = props[STYLE];
      props = props !== undefined && props !== null && props.hasOwnProperty("display") ? props.display : null;
      instance.style.display = props == null || typeof props === "boolean" ? "" : ("" + props).trim();
    }
    function unhideTextInstance(textInstance, text) {
      textInstance.nodeValue = text;
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
            checkAttributeStringCoercion(anyProps.name, "name");
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
      return instance.data === SUSPENSE_PENDING_START_DATA || instance.data === SUSPENSE_QUEUED_START_DATA;
    }
    function isSuspenseInstanceFallback(instance) {
      return instance.data === SUSPENSE_FALLBACK_START_DATA || instance.data === SUSPENSE_PENDING_START_DATA && instance.ownerDocument.readyState !== DOCUMENT_READY_STATE_LOADING;
    }
    function registerSuspenseInstanceRetry(instance, callback) {
      var ownerDocument = instance.ownerDocument;
      if (instance.data === SUSPENSE_QUEUED_START_DATA)
        instance._reactRetry = callback;
      else if (instance.data !== SUSPENSE_PENDING_START_DATA || ownerDocument.readyState !== DOCUMENT_READY_STATE_LOADING)
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
          if (nodeType === SUSPENSE_START_DATA || nodeType === SUSPENSE_FALLBACK_START_DATA || nodeType === SUSPENSE_PENDING_START_DATA || nodeType === SUSPENSE_QUEUED_START_DATA || nodeType === ACTIVITY_START_DATA || nodeType === FORM_STATE_IS_MATCHING || nodeType === FORM_STATE_IS_NOT_MATCHING)
            break;
          if (nodeType === SUSPENSE_END_DATA || nodeType === ACTIVITY_END_DATA)
            return null;
        }
      }
      return node;
    }
    function describeHydratableInstanceForDevWarnings(instance) {
      if (instance.nodeType === 1) {
        for (var JSCompiler_temp_const = instance.nodeName.toLowerCase(), serverDifferences = {}, attributes = instance.attributes, i = 0;i < attributes.length; i++) {
          var attr = attributes[i];
          serverDifferences[getPropNameFromAttributeName(attr.name)] = attr.name.toLowerCase() === "style" ? getStylesObjectFromElement(instance) : attr.value;
        }
        return { type: JSCompiler_temp_const, props: serverDifferences };
      }
      return instance.nodeType === 8 ? instance.data === ACTIVITY_START_DATA ? { type: "Activity", props: {} } : { type: "Suspense", props: {} } : instance.nodeValue;
    }
    function diffHydratedTextForDevWarnings(textInstance, text, parentProps) {
      return parentProps === null || parentProps[SUPPRESS_HYDRATION_WARNING] !== true ? (textInstance.nodeValue === text ? textInstance = null : (text = normalizeMarkupForTextOrAttribute(text), textInstance = normalizeMarkupForTextOrAttribute(textInstance.nodeValue) === text ? null : textInstance.nodeValue), textInstance) : null;
    }
    function getNextHydratableInstanceAfterHydrationBoundary(hydrationInstance) {
      hydrationInstance = hydrationInstance.nextSibling;
      for (var depth = 0;hydrationInstance; ) {
        if (hydrationInstance.nodeType === 8) {
          var data = hydrationInstance.data;
          if (data === SUSPENSE_END_DATA || data === ACTIVITY_END_DATA) {
            if (depth === 0)
              return getNextHydratable(hydrationInstance.nextSibling);
            depth--;
          } else
            data !== SUSPENSE_START_DATA && data !== SUSPENSE_FALLBACK_START_DATA && data !== SUSPENSE_PENDING_START_DATA && data !== SUSPENSE_QUEUED_START_DATA && data !== ACTIVITY_START_DATA || depth++;
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
          if (data === SUSPENSE_START_DATA || data === SUSPENSE_FALLBACK_START_DATA || data === SUSPENSE_PENDING_START_DATA || data === SUSPENSE_QUEUED_START_DATA || data === ACTIVITY_START_DATA) {
            if (depth === 0)
              return targetInstance;
            depth--;
          } else
            data !== SUSPENSE_END_DATA && data !== ACTIVITY_END_DATA || depth++;
        }
        targetInstance = targetInstance.previousSibling;
      }
      return null;
    }
    function commitHydratedContainer(container) {
      retryIfBlockedOn(container);
    }
    function commitHydratedActivityInstance(activityInstance) {
      retryIfBlockedOn(activityInstance);
    }
    function commitHydratedSuspenseInstance(suspenseInstance) {
      retryIfBlockedOn(suspenseInstance);
    }
    function resolveSingletonInstance(type, props, rootContainerInstance, hostContext, validateDOMNestingDev) {
      validateDOMNestingDev && validateDOMNesting(type, hostContext.ancestorInfo);
      props = getOwnerDocumentFromRootContainer(rootContainerInstance);
      switch (type) {
        case "html":
          type = props.documentElement;
          if (!type)
            throw Error("React expected an <html> element (document.documentElement) to exist in the Document but one was not found. React never removes the documentElement for any Document it renders into so the cause is likely in some other script running on this page.");
          return type;
        case "head":
          type = props.head;
          if (!type)
            throw Error("React expected a <head> element (document.head) to exist in the Document but one was not found. React never removes the head for any Document it renders into so the cause is likely in some other script running on this page.");
          return type;
        case "body":
          type = props.body;
          if (!type)
            throw Error("React expected a <body> element (document.body) to exist in the Document but one was not found. React never removes the body for any Document it renders into so the cause is likely in some other script running on this page.");
          return type;
        default:
          throw Error("resolveSingletonInstance was called with an element type that is not supported. This is a bug in React.");
      }
    }
    function acquireSingletonInstance(type, props, instance, internalInstanceHandle) {
      if (!instance[internalContainerInstanceKey] && getInstanceFromNode(instance)) {
        var tagName = instance.tagName.toLowerCase();
        console.error("You are mounting a new %s component when a previous one has not first unmounted. It is an error to render more than one %s component at a time and attributes and children of these components will likely fail in unpredictable ways. Please only render a single instance of <%s> and if you need to mount a new one, ensure any previous ones have unmounted first.", tagName, tagName, tagName);
      }
      switch (type) {
        case "html":
        case "head":
        case "body":
          break;
        default:
          console.error("acquireSingletonInstance was called with an element type that is not supported. This is a bug in React.");
      }
      for (tagName = instance.attributes;tagName.length; )
        instance.removeAttributeNode(tagName[0]);
      setInitialProperties(instance, type, props);
      instance[internalInstanceKey] = internalInstanceHandle;
      instance[internalPropsKey] = props;
    }
    function releaseSingletonInstance(instance) {
      for (var attributes = instance.attributes;attributes.length; )
        instance.removeAttributeNode(attributes[0]);
      detachDeletedInstance(instance);
    }
    function getHoistableRoot(container) {
      return typeof container.getRootNode === "function" ? container.getRootNode() : container.nodeType === 9 ? container : container.ownerDocument;
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
    function getResource(type, currentProps, pendingProps, currentResource) {
      var resourceRoot = (resourceRoot = rootInstanceStackCursor.current) ? getHoistableRoot(resourceRoot) : null;
      if (!resourceRoot)
        throw Error('"resourceRoot" was expected to exist. This is a bug in React.');
      switch (type) {
        case "meta":
        case "title":
          return null;
        case "style":
          return typeof pendingProps.precedence === "string" && typeof pendingProps.href === "string" ? (pendingProps = getStyleKey(pendingProps.href), currentProps = getResourcesFromRoot(resourceRoot).hoistableStyles, currentResource = currentProps.get(pendingProps), currentResource || (currentResource = {
            type: "style",
            instance: null,
            count: 0,
            state: null
          }, currentProps.set(pendingProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
        case "link":
          if (pendingProps.rel === "stylesheet" && typeof pendingProps.href === "string" && typeof pendingProps.precedence === "string") {
            type = getStyleKey(pendingProps.href);
            var _styles = getResourcesFromRoot(resourceRoot).hoistableStyles, _resource = _styles.get(type);
            if (!_resource && (resourceRoot = resourceRoot.ownerDocument || resourceRoot, _resource = {
              type: "stylesheet",
              instance: null,
              count: 0,
              state: { loading: NotLoaded, preload: null }
            }, _styles.set(type, _resource), (_styles = resourceRoot.querySelector(getStylesheetSelectorFromKey(type))) && !_styles._p && (_resource.instance = _styles, _resource.state.loading = Loaded | Inserted), !preloadPropsMap.has(type))) {
              var preloadProps = {
                rel: "preload",
                as: "style",
                href: pendingProps.href,
                crossOrigin: pendingProps.crossOrigin,
                integrity: pendingProps.integrity,
                media: pendingProps.media,
                hrefLang: pendingProps.hrefLang,
                referrerPolicy: pendingProps.referrerPolicy
              };
              preloadPropsMap.set(type, preloadProps);
              _styles || preloadStylesheet(resourceRoot, type, preloadProps, _resource.state);
            }
            if (currentProps && currentResource === null)
              throw pendingProps = `

  - ` + describeLinkForResourceErrorDEV(currentProps) + `
  + ` + describeLinkForResourceErrorDEV(pendingProps), Error("Expected <link> not to update to be updated to a stylesheet with precedence. Check the `rel`, `href`, and `precedence` props of this component. Alternatively, check whether two different <link> components render in the same slot or share the same key." + pendingProps);
            return _resource;
          }
          if (currentProps && currentResource !== null)
            throw pendingProps = `

  - ` + describeLinkForResourceErrorDEV(currentProps) + `
  + ` + describeLinkForResourceErrorDEV(pendingProps), Error("Expected stylesheet with precedence to not be updated to a different kind of <link>. Check the `rel`, `href`, and `precedence` props of this component. Alternatively, check whether two different <link> components render in the same slot or share the same key." + pendingProps);
          return null;
        case "script":
          return currentProps = pendingProps.async, pendingProps = pendingProps.src, typeof pendingProps === "string" && currentProps && typeof currentProps !== "function" && typeof currentProps !== "symbol" ? (pendingProps = getScriptKey(pendingProps), currentProps = getResourcesFromRoot(resourceRoot).hoistableScripts, currentResource = currentProps.get(pendingProps), currentResource || (currentResource = {
            type: "script",
            instance: null,
            count: 0,
            state: null
          }, currentProps.set(pendingProps, currentResource)), currentResource) : { type: "void", instance: null, count: 0, state: null };
        default:
          throw Error('getResource encountered a type it did not expect: "' + type + '". this is a bug in React.');
      }
    }
    function describeLinkForResourceErrorDEV(props) {
      var describedProps = 0, description = "<link";
      typeof props.rel === "string" ? (describedProps++, description += ' rel="' + props.rel + '"') : hasOwnProperty.call(props, "rel") && (describedProps++, description += ' rel="' + (props.rel === null ? "null" : "invalid type " + typeof props.rel) + '"');
      typeof props.href === "string" ? (describedProps++, description += ' href="' + props.href + '"') : hasOwnProperty.call(props, "href") && (describedProps++, description += ' href="' + (props.href === null ? "null" : "invalid type " + typeof props.href) + '"');
      typeof props.precedence === "string" ? (describedProps++, description += ' precedence="' + props.precedence + '"') : hasOwnProperty.call(props, "precedence") && (describedProps++, description += " precedence={" + (props.precedence === null ? "null" : "invalid type " + typeof props.precedence) + "}");
      Object.getOwnPropertyNames(props).length > describedProps && (description += " ...");
      return description + " />";
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
      ownerDocument.querySelector('link[rel="preload"][as="style"][' + key + "]") ? state.loading = Loaded : (key = ownerDocument.createElement("link"), state.preload = key, key.addEventListener("load", function() {
        return state.loading |= Loaded;
      }), key.addEventListener("error", function() {
        return state.loading |= Errored;
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
            var _instance = hoistableRoot.querySelector(getStylesheetSelectorFromKey(styleProps));
            if (_instance)
              return resource.state.loading |= Inserted, resource.instance = _instance, markNodeAsHoistable(_instance), _instance;
            instance = stylesheetPropsFromRawProps(props);
            (styleProps = preloadPropsMap.get(styleProps)) && adoptPreloadPropsForStylesheet(instance, styleProps);
            _instance = (hoistableRoot.ownerDocument || hoistableRoot).createElement("link");
            markNodeAsHoistable(_instance);
            var linkInstance = _instance;
            linkInstance._p = new Promise(function(resolve, reject) {
              linkInstance.onload = resolve;
              linkInstance.onerror = reject;
            });
            setInitialProperties(_instance, "link", instance);
            resource.state.loading |= Inserted;
            insertStylesheet(_instance, props.precedence, hoistableRoot);
            return resource.instance = _instance;
          case "script":
            _instance = getScriptKey(props.src);
            if (styleProps = hoistableRoot.querySelector(getScriptSelectorFromKey(_instance)))
              return resource.instance = styleProps, markNodeAsHoistable(styleProps), styleProps;
            instance = props;
            if (styleProps = preloadPropsMap.get(_instance))
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
            throw Error('acquireResource encountered a resource type it did not expect: "' + resource.type + '". this is a bug in React.');
        }
      else
        resource.type === "stylesheet" && (resource.state.loading & Inserted) === NotLoaded && (instance = resource.instance, resource.state.loading |= Inserted, insertStylesheet(instance, props.precedence, hoistableRoot));
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
        if (!(node[internalHoistableMarker] || node[internalInstanceKey] || type === "link" && node.getAttribute("rel") === "stylesheet") && node.namespaceURI !== SVG_NAMESPACE) {
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
      var outsideHostContainerContext = !hostContext.ancestorInfo.containerTagInScope;
      if (hostContext.context === HostContextNamespaceSvg || props.itemProp != null)
        return !outsideHostContainerContext || props.itemProp == null || type !== "meta" && type !== "title" && type !== "style" && type !== "link" && type !== "script" || console.error("Cannot render a <%s> outside the main document if it has an `itemProp` prop. `itemProp` suggests the tag belongs to an `itemScope` which can appear anywhere in the DOM. If you were intending for React to hoist this <%s> remove the `itemProp` prop. Otherwise, try moving this tag into the <head> or <body> of the Document.", type, type), false;
      switch (type) {
        case "meta":
        case "title":
          return true;
        case "style":
          if (typeof props.precedence !== "string" || typeof props.href !== "string" || props.href === "") {
            outsideHostContainerContext && console.error('Cannot render a <style> outside the main document without knowing its precedence and a unique href key. React can hoist and deduplicate <style> tags if you provide a `precedence` prop along with an `href` prop that does not conflict with the `href` values used in any other hoisted <style> or <link rel="stylesheet" ...> tags.  Note that hoisting <style> tags is considered an advanced feature that most will not use directly. Consider moving the <style> tag to the <head> or consider adding a `precedence="default"` and `href="some unique resource identifier"`.');
            break;
          }
          return true;
        case "link":
          if (typeof props.rel !== "string" || typeof props.href !== "string" || props.href === "" || props.onLoad || props.onError) {
            if (props.rel === "stylesheet" && typeof props.precedence === "string") {
              type = props.href;
              var { onError, disabled } = props;
              hostContext = [];
              props.onLoad && hostContext.push("`onLoad`");
              onError && hostContext.push("`onError`");
              disabled != null && hostContext.push("`disabled`");
              onError = propNamesListJoin(hostContext, "and");
              onError += hostContext.length === 1 ? " prop" : " props";
              disabled = hostContext.length === 1 ? "an " + onError : "the " + onError;
              hostContext.length && console.error('React encountered a <link rel="stylesheet" href="%s" ... /> with a `precedence` prop that also included %s. The presence of loading and error handlers indicates an intent to manage the stylesheet loading state from your from your Component code and React will not hoist or deduplicate this stylesheet. If your intent was to have React hoist and deduplciate this stylesheet using the `precedence` prop remove the %s, otherwise remove the `precedence` prop.', type, disabled, onError);
            }
            outsideHostContainerContext && (typeof props.rel !== "string" || typeof props.href !== "string" || props.href === "" ? console.error("Cannot render a <link> outside the main document without a `rel` and `href` prop. Try adding a `rel` and/or `href` prop to this <link> or moving the link into the <head> tag") : (props.onError || props.onLoad) && console.error("Cannot render a <link> with onLoad or onError listeners outside the main document. Try removing onLoad={...} and onError={...} or moving it into the root <head> tag or somewhere in the <body>."));
            break;
          }
          switch (props.rel) {
            case "stylesheet":
              return type = props.precedence, props = props.disabled, typeof type !== "string" && outsideHostContainerContext && console.error('Cannot render a <link rel="stylesheet" /> outside the main document without knowing its precedence. Consider adding precedence="default" or moving it into the root <head> tag.'), typeof type === "string" && props == null;
            default:
              return true;
          }
        case "script":
          type = props.async && typeof props.async !== "function" && typeof props.async !== "symbol";
          if (!type || props.onLoad || props.onError || !props.src || typeof props.src !== "string") {
            outsideHostContainerContext && (type ? props.onLoad || props.onError ? console.error("Cannot render a <script> with onLoad or onError listeners outside the main document. Try removing onLoad={...} and onError={...} or moving it into the root <head> tag or somewhere in the <body>.") : console.error("Cannot render a <script> outside the main document without `async={true}` and a non-empty `src` prop. Ensure there is a valid `src` and either make the script async or move it into the root <head> tag or somewhere in the <body>.") : console.error('Cannot render a sync or defer <script> outside the main document without knowing its order. Try adding async="" or moving it into the root <head> tag.'));
            break;
          }
          return true;
        case "noscript":
        case "template":
          outsideHostContainerContext && console.error("Cannot render <%s> outside the main document. Try moving it into the root <head> tag.", type);
      }
      return false;
    }
    function preloadResource(resource) {
      return resource.type === "stylesheet" && (resource.state.loading & Settled) === NotLoaded ? false : true;
    }
    function suspendResource(state, hoistableRoot, resource, props) {
      if (resource.type === "stylesheet" && (typeof props.media !== "string" || matchMedia(props.media).matches !== false) && (resource.state.loading & Inserted) === NotLoaded) {
        if (resource.instance === null) {
          var key = getStyleKey(props.href), instance = hoistableRoot.querySelector(getStylesheetSelectorFromKey(key));
          if (instance) {
            hoistableRoot = instance._p;
            hoistableRoot !== null && typeof hoistableRoot === "object" && typeof hoistableRoot.then === "function" && (state.count++, state = onUnsuspend.bind(state), hoistableRoot.then(state, state));
            resource.state.loading |= Inserted;
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
        (hoistableRoot = resource.state.preload) && (resource.state.loading & Settled) === NotLoaded && (state.count++, resource = onUnsuspend.bind(state), hoistableRoot.addEventListener("load", resource), hoistableRoot.addEventListener("error", resource));
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
        }, SUSPENSEY_STYLESHEET_TIMEOUT + timeoutOffset);
        0 < state.imgBytes && estimatedBytesWithinLimit === 0 && (estimatedBytesWithinLimit = 125 * estimateBandwidth() * SUSPENSEY_IMAGE_TIME_ESTIMATE);
        var imgTimer = setTimeout(function() {
          state.waitingForImages = false;
          if (state.count === 0 && (state.stylesheets && insertSuspendedStylesheets(state, state.stylesheets), state.unsuspend)) {
            var unsuspend = state.unsuspend;
            state.unsuspend = null;
            unsuspend();
          }
        }, (state.imgBytes > estimatedBytesWithinLimit ? 50 : SUSPENSEY_IMAGE_TIMEOUT) + timeoutOffset);
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
      if (!(resource.state.loading & Inserted)) {
        var precedences = precedencesByRoot.get(root2);
        if (precedences)
          var last = precedences.get(LAST_PRECEDENCE);
        else {
          precedences = new Map;
          precedencesByRoot.set(root2, precedences);
          for (var nodes = root2.querySelectorAll("link[data-precedence],style[data-precedence]"), i = 0;i < nodes.length; i++) {
            var node = nodes[i];
            if (node.nodeName === "LINK" || node.getAttribute("media") !== "not all")
              precedences.set(node.dataset.precedence, node), last = node;
          }
          last && precedences.set(LAST_PRECEDENCE, last);
        }
        nodes = resource.instance;
        node = nodes.getAttribute("data-precedence");
        i = precedences.get(node) || last;
        i === last && precedences.set(LAST_PRECEDENCE, nodes);
        precedences.set(node, nodes);
        this.count++;
        last = onUnsuspend.bind(this);
        nodes.addEventListener("load", last);
        nodes.addEventListener("error", last);
        i ? i.parentNode.insertBefore(nodes, i.nextSibling) : (root2 = root2.nodeType === 9 ? root2.head : root2, root2.insertBefore(nodes, root2.firstChild));
        resource.state.loading |= Inserted;
      }
    }
    function FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState) {
      this.tag = 1;
      this.containerInfo = containerInfo;
      this.pingCache = this.current = this.pendingChildren = null;
      this.timeoutHandle = noTimeout;
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
      this.passiveEffectDuration = this.effectDuration = -0;
      this.memoizedUpdaters = new Set;
      containerInfo = this.pendingUpdatersLaneMap = [];
      for (tag = 0;31 > tag; tag++)
        containerInfo.push(new Set);
      this._debugRootType = hydrate ? "hydrateRoot()" : "createRoot()";
    }
    function createFiberRoot(containerInfo, tag, hydrate, initialChildren, hydrationCallbacks, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator) {
      containerInfo = new FiberRootNode(containerInfo, tag, hydrate, identifierPrefix, onUncaughtError, onCaughtError, onRecoverableError, onDefaultTransitionIndicator, formState);
      tag = ConcurrentMode;
      isStrictMode === true && (tag |= StrictLegacyMode | StrictEffectsMode);
      tag |= ProfileMode;
      isStrictMode = createFiber(3, null, null, tag);
      containerInfo.current = isStrictMode;
      isStrictMode.stateNode = containerInfo;
      tag = createCache();
      retainCache(tag);
      containerInfo.pooledCache = tag;
      retainCache(tag);
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
      if (injectedHook && typeof injectedHook.onScheduleFiberRoot === "function")
        try {
          injectedHook.onScheduleFiberRoot(rendererID, container, element);
        } catch (err) {
          hasLoggedError || (hasLoggedError = true, console.error("React instrumentation encountered an error: %o", err));
        }
      parentComponent = getContextForSubtree(parentComponent);
      container.context === null ? container.context = parentComponent : container.pendingContext = parentComponent;
      isRendering && current !== null && !didWarnAboutNestedUpdates && (didWarnAboutNestedUpdates = true, console.error(`Render methods should be a pure function of props and state; triggering nested component updates from render is not allowed. If necessary, trigger nested updates in componentDidUpdate.

Check the render method of %s.`, getComponentNameFromFiber(current) || "Unknown"));
      container = createUpdate(lane);
      container.payload = { element };
      callback = callback === undefined ? null : callback;
      callback !== null && (typeof callback !== "function" && console.error("Expected the last optional `callback` argument to be a function. Instead received: %s.", callback), container.callback = callback);
      element = enqueueUpdate(rootFiber, container, lane);
      element !== null && (startUpdateTimerByLane(lane, "root.render()", null), scheduleUpdateOnFiber(element, rootFiber, lane), entangleTransitions(element, rootFiber, lane));
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
        var lane = requestUpdateLane(fiber);
        lane = getBumpedLaneForHydrationByLane(lane);
        var root2 = enqueueConcurrentRenderForLane(fiber, lane);
        root2 !== null && scheduleUpdateOnFiber(root2, fiber, lane);
        markRetryLaneIfNotHydrated(fiber, lane);
      }
    }
    function getCurrentFiberForDevTools() {
      return current;
    }
    function dispatchDiscreteEvent(domEventName, eventSystemFlags, container, nativeEvent) {
      var prevTransition = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = DiscreteEventPriority, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
      } finally {
        ReactDOMSharedInternals.p = previousPriority, ReactSharedInternals.T = prevTransition;
      }
    }
    function dispatchContinuousEvent(domEventName, eventSystemFlags, container, nativeEvent) {
      var prevTransition = ReactSharedInternals.T;
      ReactSharedInternals.T = null;
      var previousPriority = ReactDOMSharedInternals.p;
      try {
        ReactDOMSharedInternals.p = ContinuousEventPriority, dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
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
                      (executionContext & (RenderContext | CommitContext)) === NoContext && (workInProgressRootRenderTargetTime = now$1() + RENDER_TIMEOUT_MS, flushSyncWorkAcrossRoots_impl(0, false));
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
          return DiscreteEventPriority;
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
          return ContinuousEventPriority;
        case "message":
          switch (getCurrentPriorityLevel()) {
            case ImmediatePriority:
              return DiscreteEventPriority;
            case UserBlockingPriority:
              return ContinuousEventPriority;
            case NormalPriority$1:
            case LowPriority:
              return DefaultEventPriority;
            case IdlePriority:
              return IdleEventPriority;
            default:
              return DefaultEventPriority;
          }
        default:
          return DefaultEventPriority;
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
          var nativeEventClone = new nextBlockedOn.constructor(nextBlockedOn.type, nextBlockedOn), event = nativeEventClone;
          currentReplayingEvent !== null && console.error("Expected currently replaying event to be null. This error is likely caused by a bug in React. Please file an issue.");
          currentReplayingEvent = event;
          nextBlockedOn.target.dispatchEvent(nativeEventClone);
          currentReplayingEvent === null && console.error("Expected currently replaying event to not be null. This error is likely caused by a bug in React. Please file an issue.");
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
          formInst !== null && (formReplayingQueue.splice(i, 3), i -= 3, form = {
            pending: true,
            data: formData,
            method: form.method,
            action: submitterOrAction
          }, Object.freeze(form), startHostTransition(formInst, form, submitterOrAction, formData));
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
    function warnIfReactDOMContainerInDEV(container) {
      container[internalContainerInstanceKey] && (container._reactRootContainer ? console.error("You are calling ReactDOMClient.createRoot() on a container that was previously passed to ReactDOM.render(). This is not supported.") : console.error("You are calling ReactDOMClient.createRoot() on a container that has already been passed to createRoot() before. Instead, call root.render() on the existing root instead if you want to update it."));
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart === "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
    var assign = Object.assign, REACT_LEGACY_ELEMENT_TYPE = Symbol.for("react.element"), REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"), REACT_PORTAL_TYPE = Symbol.for("react.portal"), REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"), REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"), REACT_PROFILER_TYPE = Symbol.for("react.profiler"), REACT_CONSUMER_TYPE = Symbol.for("react.consumer"), REACT_CONTEXT_TYPE = Symbol.for("react.context"), REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"), REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"), REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"), REACT_MEMO_TYPE = Symbol.for("react.memo"), REACT_LAZY_TYPE = Symbol.for("react.lazy");
    Symbol.for("react.scope");
    var REACT_ACTIVITY_TYPE = Symbol.for("react.activity");
    Symbol.for("react.legacy_hidden");
    Symbol.for("react.tracing_marker");
    var REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel");
    Symbol.for("react.view_transition");
    var MAYBE_ITERATOR_SYMBOL = Symbol.iterator, REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"), isArrayImpl = Array.isArray, ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, ReactDOMSharedInternals = ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, NotPending = Object.freeze({
      pending: false,
      data: null,
      method: null,
      action: null
    }), valueStack = [];
    var fiberStack = [];
    var index$jscomp$0 = -1, contextStackCursor = createCursor(null), contextFiberStackCursor = createCursor(null), rootInstanceStackCursor = createCursor(null), hostTransitionProviderCursor = createCursor(null), disabledDepth = 0, prevLog, prevInfo, prevWarn, prevError, prevGroup, prevGroupCollapsed, prevGroupEnd;
    disabledLog.__reactDisabledLog = true;
    var prefix, suffix, reentry = false;
    var componentFrameCache = new (typeof WeakMap === "function" ? WeakMap : Map);
    var current = null, isRendering = false, hasOwnProperty = Object.prototype.hasOwnProperty, scheduleCallback$3 = Scheduler.unstable_scheduleCallback, cancelCallback$1 = Scheduler.unstable_cancelCallback, shouldYield = Scheduler.unstable_shouldYield, requestPaint = Scheduler.unstable_requestPaint, now$1 = Scheduler.unstable_now, getCurrentPriorityLevel = Scheduler.unstable_getCurrentPriorityLevel, ImmediatePriority = Scheduler.unstable_ImmediatePriority, UserBlockingPriority = Scheduler.unstable_UserBlockingPriority, NormalPriority$1 = Scheduler.unstable_NormalPriority, LowPriority = Scheduler.unstable_LowPriority, IdlePriority = Scheduler.unstable_IdlePriority, log$1 = Scheduler.log, unstable_setDisableYieldValue2 = Scheduler.unstable_setDisableYieldValue, rendererID = null, injectedHook = null, hasLoggedError = false, isDevToolsPresent = typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined", clz32 = Math.clz32 ? Math.clz32 : clz32Fallback, log2 = Math.log, LN2 = Math.LN2, nextTransitionUpdateLane = 256, nextTransitionDeferredLane = 262144, nextRetryLane = 4194304, DiscreteEventPriority = 2, ContinuousEventPriority = 8, DefaultEventPriority = 32, IdleEventPriority = 268435456, randomKey = Math.random().toString(36).slice(2), internalInstanceKey = "__reactFiber$" + randomKey, internalPropsKey = "__reactProps$" + randomKey, internalContainerInstanceKey = "__reactContainer$" + randomKey, internalEventHandlersKey = "__reactEvents$" + randomKey, internalEventHandlerListenersKey = "__reactListeners$" + randomKey, internalEventHandlesSetKey = "__reactHandles$" + randomKey, internalRootNodeResourcesKey = "__reactResources$" + randomKey, internalHoistableMarker = "__reactMarker$" + randomKey, allNativeEvents = new Set, registrationNameDependencies = {}, possibleRegistrationNames = {}, hasReadOnlyValue = {
      button: true,
      checkbox: true,
      image: true,
      hidden: true,
      radio: true,
      reset: true,
      submit: true
    }, VALID_ATTRIBUTE_NAME_REGEX = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), illegalAttributeNameCache = {}, validatedAttributeNameCache = {}, escapeSelectorAttributeValueInsideDoubleQuotesRegex = /[\n"\\]/g, didWarnValueDefaultValue$1 = false, didWarnCheckedDefaultChecked = false, didWarnSelectedSetOnOption = false, didWarnInvalidChild = false, didWarnInvalidInnerHTML = false;
    var didWarnValueDefaultValue = false;
    var valuePropNames = ["value", "defaultValue"], didWarnValDefaultVal = false, needsEscaping = /["'&<>\n\t]|^\s|\s$/, specialTags = "address applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd details dir div dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input isindex li link listing main marquee menu menuitem meta nav noembed noframes noscript object ol p param plaintext pre script section select source style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp".split(" "), inScopeTags = "applet caption html table td th marquee object template foreignObject desc title".split(" "), buttonScopeTags = inScopeTags.concat(["button"]), impliedEndTags = "dd dt li option optgroup p rp rt".split(" "), emptyAncestorInfoDev = {
      current: null,
      formTag: null,
      aTagInScope: null,
      buttonTagInScope: null,
      nobrTagInScope: null,
      pTagInButtonScope: null,
      listItemTagAutoclosing: null,
      dlItemTagAutoclosing: null,
      containerTagInScope: null,
      implicitRootScope: false
    }, didWarn = {}, shorthandToLonghand = {
      animation: "animationDelay animationDirection animationDuration animationFillMode animationIterationCount animationName animationPlayState animationTimingFunction".split(" "),
      background: "backgroundAttachment backgroundClip backgroundColor backgroundImage backgroundOrigin backgroundPositionX backgroundPositionY backgroundRepeat backgroundSize".split(" "),
      backgroundPosition: ["backgroundPositionX", "backgroundPositionY"],
      border: "borderBottomColor borderBottomStyle borderBottomWidth borderImageOutset borderImageRepeat borderImageSlice borderImageSource borderImageWidth borderLeftColor borderLeftStyle borderLeftWidth borderRightColor borderRightStyle borderRightWidth borderTopColor borderTopStyle borderTopWidth".split(" "),
      borderBlockEnd: [
        "borderBlockEndColor",
        "borderBlockEndStyle",
        "borderBlockEndWidth"
      ],
      borderBlockStart: [
        "borderBlockStartColor",
        "borderBlockStartStyle",
        "borderBlockStartWidth"
      ],
      borderBottom: [
        "borderBottomColor",
        "borderBottomStyle",
        "borderBottomWidth"
      ],
      borderColor: [
        "borderBottomColor",
        "borderLeftColor",
        "borderRightColor",
        "borderTopColor"
      ],
      borderImage: [
        "borderImageOutset",
        "borderImageRepeat",
        "borderImageSlice",
        "borderImageSource",
        "borderImageWidth"
      ],
      borderInlineEnd: [
        "borderInlineEndColor",
        "borderInlineEndStyle",
        "borderInlineEndWidth"
      ],
      borderInlineStart: [
        "borderInlineStartColor",
        "borderInlineStartStyle",
        "borderInlineStartWidth"
      ],
      borderLeft: ["borderLeftColor", "borderLeftStyle", "borderLeftWidth"],
      borderRadius: [
        "borderBottomLeftRadius",
        "borderBottomRightRadius",
        "borderTopLeftRadius",
        "borderTopRightRadius"
      ],
      borderRight: [
        "borderRightColor",
        "borderRightStyle",
        "borderRightWidth"
      ],
      borderStyle: [
        "borderBottomStyle",
        "borderLeftStyle",
        "borderRightStyle",
        "borderTopStyle"
      ],
      borderTop: ["borderTopColor", "borderTopStyle", "borderTopWidth"],
      borderWidth: [
        "borderBottomWidth",
        "borderLeftWidth",
        "borderRightWidth",
        "borderTopWidth"
      ],
      columnRule: ["columnRuleColor", "columnRuleStyle", "columnRuleWidth"],
      columns: ["columnCount", "columnWidth"],
      flex: ["flexBasis", "flexGrow", "flexShrink"],
      flexFlow: ["flexDirection", "flexWrap"],
      font: "fontFamily fontFeatureSettings fontKerning fontLanguageOverride fontSize fontSizeAdjust fontStretch fontStyle fontVariant fontVariantAlternates fontVariantCaps fontVariantEastAsian fontVariantLigatures fontVariantNumeric fontVariantPosition fontWeight lineHeight".split(" "),
      fontVariant: "fontVariantAlternates fontVariantCaps fontVariantEastAsian fontVariantLigatures fontVariantNumeric fontVariantPosition".split(" "),
      gap: ["columnGap", "rowGap"],
      grid: "gridAutoColumns gridAutoFlow gridAutoRows gridTemplateAreas gridTemplateColumns gridTemplateRows".split(" "),
      gridArea: [
        "gridColumnEnd",
        "gridColumnStart",
        "gridRowEnd",
        "gridRowStart"
      ],
      gridColumn: ["gridColumnEnd", "gridColumnStart"],
      gridColumnGap: ["columnGap"],
      gridGap: ["columnGap", "rowGap"],
      gridRow: ["gridRowEnd", "gridRowStart"],
      gridRowGap: ["rowGap"],
      gridTemplate: [
        "gridTemplateAreas",
        "gridTemplateColumns",
        "gridTemplateRows"
      ],
      listStyle: ["listStyleImage", "listStylePosition", "listStyleType"],
      margin: ["marginBottom", "marginLeft", "marginRight", "marginTop"],
      marker: ["markerEnd", "markerMid", "markerStart"],
      mask: "maskClip maskComposite maskImage maskMode maskOrigin maskPositionX maskPositionY maskRepeat maskSize".split(" "),
      maskPosition: ["maskPositionX", "maskPositionY"],
      outline: ["outlineColor", "outlineStyle", "outlineWidth"],
      overflow: ["overflowX", "overflowY"],
      padding: ["paddingBottom", "paddingLeft", "paddingRight", "paddingTop"],
      placeContent: ["alignContent", "justifyContent"],
      placeItems: ["alignItems", "justifyItems"],
      placeSelf: ["alignSelf", "justifySelf"],
      textDecoration: [
        "textDecorationColor",
        "textDecorationLine",
        "textDecorationStyle"
      ],
      textEmphasis: ["textEmphasisColor", "textEmphasisStyle"],
      transition: [
        "transitionDelay",
        "transitionDuration",
        "transitionProperty",
        "transitionTimingFunction"
      ],
      wordWrap: ["overflowWrap"]
    }, uppercasePattern = /([A-Z])/g, msPattern$1 = /^ms-/, badVendoredStyleNamePattern = /^(?:webkit|moz|o)[A-Z]/, msPattern = /^-ms-/, hyphenPattern = /-(.)/g, badStyleValueWithSemicolonPattern = /;\s*$/, warnedStyleNames = {}, warnedStyleValues = {}, warnedForNaNValue = false, warnedForInfinityValue = false, unitlessNumbers = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" ")), MATH_NAMESPACE = "http://www.w3.org/1998/Math/MathML", SVG_NAMESPACE = "http://www.w3.org/2000/svg", aliases = new Map([
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
    ]), possibleStandardNames = {
      accept: "accept",
      acceptcharset: "acceptCharset",
      "accept-charset": "acceptCharset",
      accesskey: "accessKey",
      action: "action",
      allowfullscreen: "allowFullScreen",
      alt: "alt",
      as: "as",
      async: "async",
      autocapitalize: "autoCapitalize",
      autocomplete: "autoComplete",
      autocorrect: "autoCorrect",
      autofocus: "autoFocus",
      autoplay: "autoPlay",
      autosave: "autoSave",
      capture: "capture",
      cellpadding: "cellPadding",
      cellspacing: "cellSpacing",
      challenge: "challenge",
      charset: "charSet",
      checked: "checked",
      children: "children",
      cite: "cite",
      class: "className",
      classid: "classID",
      classname: "className",
      cols: "cols",
      colspan: "colSpan",
      content: "content",
      contenteditable: "contentEditable",
      contextmenu: "contextMenu",
      controls: "controls",
      controlslist: "controlsList",
      coords: "coords",
      crossorigin: "crossOrigin",
      dangerouslysetinnerhtml: "dangerouslySetInnerHTML",
      data: "data",
      datetime: "dateTime",
      default: "default",
      defaultchecked: "defaultChecked",
      defaultvalue: "defaultValue",
      defer: "defer",
      dir: "dir",
      disabled: "disabled",
      disablepictureinpicture: "disablePictureInPicture",
      disableremoteplayback: "disableRemotePlayback",
      download: "download",
      draggable: "draggable",
      enctype: "encType",
      enterkeyhint: "enterKeyHint",
      fetchpriority: "fetchPriority",
      for: "htmlFor",
      form: "form",
      formmethod: "formMethod",
      formaction: "formAction",
      formenctype: "formEncType",
      formnovalidate: "formNoValidate",
      formtarget: "formTarget",
      frameborder: "frameBorder",
      headers: "headers",
      height: "height",
      hidden: "hidden",
      high: "high",
      href: "href",
      hreflang: "hrefLang",
      htmlfor: "htmlFor",
      httpequiv: "httpEquiv",
      "http-equiv": "httpEquiv",
      icon: "icon",
      id: "id",
      imagesizes: "imageSizes",
      imagesrcset: "imageSrcSet",
      inert: "inert",
      innerhtml: "innerHTML",
      inputmode: "inputMode",
      integrity: "integrity",
      is: "is",
      itemid: "itemID",
      itemprop: "itemProp",
      itemref: "itemRef",
      itemscope: "itemScope",
      itemtype: "itemType",
      keyparams: "keyParams",
      keytype: "keyType",
      kind: "kind",
      label: "label",
      lang: "lang",
      list: "list",
      loop: "loop",
      low: "low",
      manifest: "manifest",
      marginwidth: "marginWidth",
      marginheight: "marginHeight",
      max: "max",
      maxlength: "maxLength",
      media: "media",
      mediagroup: "mediaGroup",
      method: "method",
      min: "min",
      minlength: "minLength",
      multiple: "multiple",
      muted: "muted",
      name: "name",
      nomodule: "noModule",
      nonce: "nonce",
      novalidate: "noValidate",
      open: "open",
      optimum: "optimum",
      pattern: "pattern",
      placeholder: "placeholder",
      playsinline: "playsInline",
      poster: "poster",
      preload: "preload",
      profile: "profile",
      radiogroup: "radioGroup",
      readonly: "readOnly",
      referrerpolicy: "referrerPolicy",
      rel: "rel",
      required: "required",
      reversed: "reversed",
      role: "role",
      rows: "rows",
      rowspan: "rowSpan",
      sandbox: "sandbox",
      scope: "scope",
      scoped: "scoped",
      scrolling: "scrolling",
      seamless: "seamless",
      selected: "selected",
      shape: "shape",
      size: "size",
      sizes: "sizes",
      span: "span",
      spellcheck: "spellCheck",
      src: "src",
      srcdoc: "srcDoc",
      srclang: "srcLang",
      srcset: "srcSet",
      start: "start",
      step: "step",
      style: "style",
      summary: "summary",
      tabindex: "tabIndex",
      target: "target",
      title: "title",
      type: "type",
      usemap: "useMap",
      value: "value",
      width: "width",
      wmode: "wmode",
      wrap: "wrap",
      about: "about",
      accentheight: "accentHeight",
      "accent-height": "accentHeight",
      accumulate: "accumulate",
      additive: "additive",
      alignmentbaseline: "alignmentBaseline",
      "alignment-baseline": "alignmentBaseline",
      allowreorder: "allowReorder",
      alphabetic: "alphabetic",
      amplitude: "amplitude",
      arabicform: "arabicForm",
      "arabic-form": "arabicForm",
      ascent: "ascent",
      attributename: "attributeName",
      attributetype: "attributeType",
      autoreverse: "autoReverse",
      azimuth: "azimuth",
      basefrequency: "baseFrequency",
      baselineshift: "baselineShift",
      "baseline-shift": "baselineShift",
      baseprofile: "baseProfile",
      bbox: "bbox",
      begin: "begin",
      bias: "bias",
      by: "by",
      calcmode: "calcMode",
      capheight: "capHeight",
      "cap-height": "capHeight",
      clip: "clip",
      clippath: "clipPath",
      "clip-path": "clipPath",
      clippathunits: "clipPathUnits",
      cliprule: "clipRule",
      "clip-rule": "clipRule",
      color: "color",
      colorinterpolation: "colorInterpolation",
      "color-interpolation": "colorInterpolation",
      colorinterpolationfilters: "colorInterpolationFilters",
      "color-interpolation-filters": "colorInterpolationFilters",
      colorprofile: "colorProfile",
      "color-profile": "colorProfile",
      colorrendering: "colorRendering",
      "color-rendering": "colorRendering",
      contentscripttype: "contentScriptType",
      contentstyletype: "contentStyleType",
      cursor: "cursor",
      cx: "cx",
      cy: "cy",
      d: "d",
      datatype: "datatype",
      decelerate: "decelerate",
      descent: "descent",
      diffuseconstant: "diffuseConstant",
      direction: "direction",
      display: "display",
      divisor: "divisor",
      dominantbaseline: "dominantBaseline",
      "dominant-baseline": "dominantBaseline",
      dur: "dur",
      dx: "dx",
      dy: "dy",
      edgemode: "edgeMode",
      elevation: "elevation",
      enablebackground: "enableBackground",
      "enable-background": "enableBackground",
      end: "end",
      exponent: "exponent",
      externalresourcesrequired: "externalResourcesRequired",
      fill: "fill",
      fillopacity: "fillOpacity",
      "fill-opacity": "fillOpacity",
      fillrule: "fillRule",
      "fill-rule": "fillRule",
      filter: "filter",
      filterres: "filterRes",
      filterunits: "filterUnits",
      floodopacity: "floodOpacity",
      "flood-opacity": "floodOpacity",
      floodcolor: "floodColor",
      "flood-color": "floodColor",
      focusable: "focusable",
      fontfamily: "fontFamily",
      "font-family": "fontFamily",
      fontsize: "fontSize",
      "font-size": "fontSize",
      fontsizeadjust: "fontSizeAdjust",
      "font-size-adjust": "fontSizeAdjust",
      fontstretch: "fontStretch",
      "font-stretch": "fontStretch",
      fontstyle: "fontStyle",
      "font-style": "fontStyle",
      fontvariant: "fontVariant",
      "font-variant": "fontVariant",
      fontweight: "fontWeight",
      "font-weight": "fontWeight",
      format: "format",
      from: "from",
      fx: "fx",
      fy: "fy",
      g1: "g1",
      g2: "g2",
      glyphname: "glyphName",
      "glyph-name": "glyphName",
      glyphorientationhorizontal: "glyphOrientationHorizontal",
      "glyph-orientation-horizontal": "glyphOrientationHorizontal",
      glyphorientationvertical: "glyphOrientationVertical",
      "glyph-orientation-vertical": "glyphOrientationVertical",
      glyphref: "glyphRef",
      gradienttransform: "gradientTransform",
      gradientunits: "gradientUnits",
      hanging: "hanging",
      horizadvx: "horizAdvX",
      "horiz-adv-x": "horizAdvX",
      horizoriginx: "horizOriginX",
      "horiz-origin-x": "horizOriginX",
      ideographic: "ideographic",
      imagerendering: "imageRendering",
      "image-rendering": "imageRendering",
      in2: "in2",
      in: "in",
      inlist: "inlist",
      intercept: "intercept",
      k1: "k1",
      k2: "k2",
      k3: "k3",
      k4: "k4",
      k: "k",
      kernelmatrix: "kernelMatrix",
      kernelunitlength: "kernelUnitLength",
      kerning: "kerning",
      keypoints: "keyPoints",
      keysplines: "keySplines",
      keytimes: "keyTimes",
      lengthadjust: "lengthAdjust",
      letterspacing: "letterSpacing",
      "letter-spacing": "letterSpacing",
      lightingcolor: "lightingColor",
      "lighting-color": "lightingColor",
      limitingconeangle: "limitingConeAngle",
      local: "local",
      markerend: "markerEnd",
      "marker-end": "markerEnd",
      markerheight: "markerHeight",
      markermid: "markerMid",
      "marker-mid": "markerMid",
      markerstart: "markerStart",
      "marker-start": "markerStart",
      markerunits: "markerUnits",
      markerwidth: "markerWidth",
      mask: "mask",
      maskcontentunits: "maskContentUnits",
      maskunits: "maskUnits",
      mathematical: "mathematical",
      mode: "mode",
      numoctaves: "numOctaves",
      offset: "offset",
      opacity: "opacity",
      operator: "operator",
      order: "order",
      orient: "orient",
      orientation: "orientation",
      origin: "origin",
      overflow: "overflow",
      overlineposition: "overlinePosition",
      "overline-position": "overlinePosition",
      overlinethickness: "overlineThickness",
      "overline-thickness": "overlineThickness",
      paintorder: "paintOrder",
      "paint-order": "paintOrder",
      panose1: "panose1",
      "panose-1": "panose1",
      pathlength: "pathLength",
      patterncontentunits: "patternContentUnits",
      patterntransform: "patternTransform",
      patternunits: "patternUnits",
      pointerevents: "pointerEvents",
      "pointer-events": "pointerEvents",
      points: "points",
      pointsatx: "pointsAtX",
      pointsaty: "pointsAtY",
      pointsatz: "pointsAtZ",
      popover: "popover",
      popovertarget: "popoverTarget",
      popovertargetaction: "popoverTargetAction",
      prefix: "prefix",
      preservealpha: "preserveAlpha",
      preserveaspectratio: "preserveAspectRatio",
      primitiveunits: "primitiveUnits",
      property: "property",
      r: "r",
      radius: "radius",
      refx: "refX",
      refy: "refY",
      renderingintent: "renderingIntent",
      "rendering-intent": "renderingIntent",
      repeatcount: "repeatCount",
      repeatdur: "repeatDur",
      requiredextensions: "requiredExtensions",
      requiredfeatures: "requiredFeatures",
      resource: "resource",
      restart: "restart",
      result: "result",
      results: "results",
      rotate: "rotate",
      rx: "rx",
      ry: "ry",
      scale: "scale",
      security: "security",
      seed: "seed",
      shaperendering: "shapeRendering",
      "shape-rendering": "shapeRendering",
      slope: "slope",
      spacing: "spacing",
      specularconstant: "specularConstant",
      specularexponent: "specularExponent",
      speed: "speed",
      spreadmethod: "spreadMethod",
      startoffset: "startOffset",
      stddeviation: "stdDeviation",
      stemh: "stemh",
      stemv: "stemv",
      stitchtiles: "stitchTiles",
      stopcolor: "stopColor",
      "stop-color": "stopColor",
      stopopacity: "stopOpacity",
      "stop-opacity": "stopOpacity",
      strikethroughposition: "strikethroughPosition",
      "strikethrough-position": "strikethroughPosition",
      strikethroughthickness: "strikethroughThickness",
      "strikethrough-thickness": "strikethroughThickness",
      string: "string",
      stroke: "stroke",
      strokedasharray: "strokeDasharray",
      "stroke-dasharray": "strokeDasharray",
      strokedashoffset: "strokeDashoffset",
      "stroke-dashoffset": "strokeDashoffset",
      strokelinecap: "strokeLinecap",
      "stroke-linecap": "strokeLinecap",
      strokelinejoin: "strokeLinejoin",
      "stroke-linejoin": "strokeLinejoin",
      strokemiterlimit: "strokeMiterlimit",
      "stroke-miterlimit": "strokeMiterlimit",
      strokewidth: "strokeWidth",
      "stroke-width": "strokeWidth",
      strokeopacity: "strokeOpacity",
      "stroke-opacity": "strokeOpacity",
      suppresscontenteditablewarning: "suppressContentEditableWarning",
      suppresshydrationwarning: "suppressHydrationWarning",
      surfacescale: "surfaceScale",
      systemlanguage: "systemLanguage",
      tablevalues: "tableValues",
      targetx: "targetX",
      targety: "targetY",
      textanchor: "textAnchor",
      "text-anchor": "textAnchor",
      textdecoration: "textDecoration",
      "text-decoration": "textDecoration",
      textlength: "textLength",
      textrendering: "textRendering",
      "text-rendering": "textRendering",
      to: "to",
      transform: "transform",
      transformorigin: "transformOrigin",
      "transform-origin": "transformOrigin",
      typeof: "typeof",
      u1: "u1",
      u2: "u2",
      underlineposition: "underlinePosition",
      "underline-position": "underlinePosition",
      underlinethickness: "underlineThickness",
      "underline-thickness": "underlineThickness",
      unicode: "unicode",
      unicodebidi: "unicodeBidi",
      "unicode-bidi": "unicodeBidi",
      unicoderange: "unicodeRange",
      "unicode-range": "unicodeRange",
      unitsperem: "unitsPerEm",
      "units-per-em": "unitsPerEm",
      unselectable: "unselectable",
      valphabetic: "vAlphabetic",
      "v-alphabetic": "vAlphabetic",
      values: "values",
      vectoreffect: "vectorEffect",
      "vector-effect": "vectorEffect",
      version: "version",
      vertadvy: "vertAdvY",
      "vert-adv-y": "vertAdvY",
      vertoriginx: "vertOriginX",
      "vert-origin-x": "vertOriginX",
      vertoriginy: "vertOriginY",
      "vert-origin-y": "vertOriginY",
      vhanging: "vHanging",
      "v-hanging": "vHanging",
      videographic: "vIdeographic",
      "v-ideographic": "vIdeographic",
      viewbox: "viewBox",
      viewtarget: "viewTarget",
      visibility: "visibility",
      vmathematical: "vMathematical",
      "v-mathematical": "vMathematical",
      vocab: "vocab",
      widths: "widths",
      wordspacing: "wordSpacing",
      "word-spacing": "wordSpacing",
      writingmode: "writingMode",
      "writing-mode": "writingMode",
      x1: "x1",
      x2: "x2",
      x: "x",
      xchannelselector: "xChannelSelector",
      xheight: "xHeight",
      "x-height": "xHeight",
      xlinkactuate: "xlinkActuate",
      "xlink:actuate": "xlinkActuate",
      xlinkarcrole: "xlinkArcrole",
      "xlink:arcrole": "xlinkArcrole",
      xlinkhref: "xlinkHref",
      "xlink:href": "xlinkHref",
      xlinkrole: "xlinkRole",
      "xlink:role": "xlinkRole",
      xlinkshow: "xlinkShow",
      "xlink:show": "xlinkShow",
      xlinktitle: "xlinkTitle",
      "xlink:title": "xlinkTitle",
      xlinktype: "xlinkType",
      "xlink:type": "xlinkType",
      xmlbase: "xmlBase",
      "xml:base": "xmlBase",
      xmllang: "xmlLang",
      "xml:lang": "xmlLang",
      xmlns: "xmlns",
      "xml:space": "xmlSpace",
      xmlnsxlink: "xmlnsXlink",
      "xmlns:xlink": "xmlnsXlink",
      xmlspace: "xmlSpace",
      y1: "y1",
      y2: "y2",
      y: "y",
      ychannelselector: "yChannelSelector",
      z: "z",
      zoomandpan: "zoomAndPan"
    }, ariaProperties = {
      "aria-current": 0,
      "aria-description": 0,
      "aria-details": 0,
      "aria-disabled": 0,
      "aria-hidden": 0,
      "aria-invalid": 0,
      "aria-keyshortcuts": 0,
      "aria-label": 0,
      "aria-roledescription": 0,
      "aria-autocomplete": 0,
      "aria-checked": 0,
      "aria-expanded": 0,
      "aria-haspopup": 0,
      "aria-level": 0,
      "aria-modal": 0,
      "aria-multiline": 0,
      "aria-multiselectable": 0,
      "aria-orientation": 0,
      "aria-placeholder": 0,
      "aria-pressed": 0,
      "aria-readonly": 0,
      "aria-required": 0,
      "aria-selected": 0,
      "aria-sort": 0,
      "aria-valuemax": 0,
      "aria-valuemin": 0,
      "aria-valuenow": 0,
      "aria-valuetext": 0,
      "aria-atomic": 0,
      "aria-busy": 0,
      "aria-live": 0,
      "aria-relevant": 0,
      "aria-dropeffect": 0,
      "aria-grabbed": 0,
      "aria-activedescendant": 0,
      "aria-colcount": 0,
      "aria-colindex": 0,
      "aria-colspan": 0,
      "aria-controls": 0,
      "aria-describedby": 0,
      "aria-errormessage": 0,
      "aria-flowto": 0,
      "aria-labelledby": 0,
      "aria-owns": 0,
      "aria-posinset": 0,
      "aria-rowcount": 0,
      "aria-rowindex": 0,
      "aria-rowspan": 0,
      "aria-setsize": 0,
      "aria-braillelabel": 0,
      "aria-brailleroledescription": 0,
      "aria-colindextext": 0,
      "aria-rowindextext": 0
    }, warnedProperties$1 = {}, rARIA$1 = RegExp("^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), rARIACamel$1 = RegExp("^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), didWarnValueNull = false, warnedProperties = {}, EVENT_NAME_REGEX = /^on./, INVALID_EVENT_NAME_REGEX = /^on[^A-Z]/, rARIA = RegExp("^(aria)-[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), rARIACamel = RegExp("^(aria)[A-Z][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), isJavaScriptProtocol = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i, currentReplayingEvent = null, restoreTarget = null, restoreQueue = null, isInsideEventHandler = false, canUseDOM = !(typeof window === "undefined" || typeof window.document === "undefined" || typeof window.document.createElement === "undefined"), passiveBrowserEventsSupported = false;
    if (canUseDOM)
      try {
        var options$jscomp$0 = {};
        Object.defineProperty(options$jscomp$0, "passive", {
          get: function() {
            passiveBrowserEventsSupported = true;
          }
        });
        window.addEventListener("test", options$jscomp$0, options$jscomp$0);
        window.removeEventListener("test", options$jscomp$0, options$jscomp$0);
      } catch (e) {
        passiveBrowserEventsSupported = false;
      }
    var root = null, startText = null, fallbackText = null, EventInterface = {
      eventPhase: 0,
      bubbles: 0,
      cancelable: 0,
      timeStamp: function(event) {
        return event.timeStamp || Date.now();
      },
      defaultPrevented: 0,
      isTrusted: 0
    }, SyntheticEvent = createSyntheticEvent(EventInterface), UIEventInterface = assign({}, EventInterface, { view: 0, detail: 0 }), SyntheticUIEvent = createSyntheticEvent(UIEventInterface), lastMovementX, lastMovementY, lastMouseEvent, MouseEventInterface = assign({}, UIEventInterface, {
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
    }), SyntheticMouseEvent = createSyntheticEvent(MouseEventInterface), DragEventInterface = assign({}, MouseEventInterface, { dataTransfer: 0 }), SyntheticDragEvent = createSyntheticEvent(DragEventInterface), FocusEventInterface = assign({}, UIEventInterface, { relatedTarget: 0 }), SyntheticFocusEvent = createSyntheticEvent(FocusEventInterface), AnimationEventInterface = assign({}, EventInterface, {
      animationName: 0,
      elapsedTime: 0,
      pseudoElement: 0
    }), SyntheticAnimationEvent = createSyntheticEvent(AnimationEventInterface), ClipboardEventInterface = assign({}, EventInterface, {
      clipboardData: function(event) {
        return "clipboardData" in event ? event.clipboardData : window.clipboardData;
      }
    }), SyntheticClipboardEvent = createSyntheticEvent(ClipboardEventInterface), CompositionEventInterface = assign({}, EventInterface, { data: 0 }), SyntheticCompositionEvent = createSyntheticEvent(CompositionEventInterface), SyntheticInputEvent = SyntheticCompositionEvent, normalizeKey = {
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
    }, translateToKey = {
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
    }, modifierKeyToProp = {
      Alt: "altKey",
      Control: "ctrlKey",
      Meta: "metaKey",
      Shift: "shiftKey"
    }, KeyboardEventInterface = assign({}, UIEventInterface, {
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
    }), SyntheticKeyboardEvent = createSyntheticEvent(KeyboardEventInterface), PointerEventInterface = assign({}, MouseEventInterface, {
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
    }), SyntheticPointerEvent = createSyntheticEvent(PointerEventInterface), TouchEventInterface = assign({}, UIEventInterface, {
      touches: 0,
      targetTouches: 0,
      changedTouches: 0,
      altKey: 0,
      metaKey: 0,
      ctrlKey: 0,
      shiftKey: 0,
      getModifierState: getEventModifierState
    }), SyntheticTouchEvent = createSyntheticEvent(TouchEventInterface), TransitionEventInterface = assign({}, EventInterface, {
      propertyName: 0,
      elapsedTime: 0,
      pseudoElement: 0
    }), SyntheticTransitionEvent = createSyntheticEvent(TransitionEventInterface), WheelEventInterface = assign({}, MouseEventInterface, {
      deltaX: function(event) {
        return "deltaX" in event ? event.deltaX : ("wheelDeltaX" in event) ? -event.wheelDeltaX : 0;
      },
      deltaY: function(event) {
        return "deltaY" in event ? event.deltaY : ("wheelDeltaY" in event) ? -event.wheelDeltaY : ("wheelDelta" in event) ? -event.wheelDelta : 0;
      },
      deltaZ: 0,
      deltaMode: 0
    }), SyntheticWheelEvent = createSyntheticEvent(WheelEventInterface), ToggleEventInterface = assign({}, EventInterface, {
      newState: 0,
      oldState: 0
    }), SyntheticToggleEvent = createSyntheticEvent(ToggleEventInterface), END_KEYCODES = [9, 13, 27, 32], START_KEYCODE = 229, canUseCompositionEvent = canUseDOM && "CompositionEvent" in window, documentMode = null;
    canUseDOM && "documentMode" in document && (documentMode = document.documentMode);
    var canUseTextInputEvent = canUseDOM && "TextEvent" in window && !documentMode, useFallbackCompositionData = canUseDOM && (!canUseCompositionEvent || documentMode && 8 < documentMode && 11 >= documentMode), SPACEBAR_CODE = 32, SPACEBAR_CHAR = String.fromCharCode(SPACEBAR_CODE), hasSpaceKeypress = false, isComposing = false, supportedInputTypes = {
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
    }, activeElement$1 = null, activeElementInst$1 = null, isInputEventSupported = false;
    canUseDOM && (isInputEventSupported = isEventSupported("input") && (!document.documentMode || 9 < document.documentMode));
    var objectIs = typeof Object.is === "function" ? Object.is : is, skipSelectionChangeEvent = canUseDOM && "documentMode" in document && 11 >= document.documentMode, activeElement = null, activeElementInst = null, lastSelection = null, mouseDown = false, vendorPrefixes = {
      animationend: makePrefixMap("Animation", "AnimationEnd"),
      animationiteration: makePrefixMap("Animation", "AnimationIteration"),
      animationstart: makePrefixMap("Animation", "AnimationStart"),
      transitionrun: makePrefixMap("Transition", "TransitionRun"),
      transitionstart: makePrefixMap("Transition", "TransitionStart"),
      transitioncancel: makePrefixMap("Transition", "TransitionCancel"),
      transitionend: makePrefixMap("Transition", "TransitionEnd")
    }, prefixedEventNames = {}, style = {};
    canUseDOM && (style = document.createElement("div").style, ("AnimationEvent" in window) || (delete vendorPrefixes.animationend.animation, delete vendorPrefixes.animationiteration.animation, delete vendorPrefixes.animationstart.animation), ("TransitionEvent" in window) || delete vendorPrefixes.transitionend.transition);
    var ANIMATION_END = getVendorPrefixedEventName("animationend"), ANIMATION_ITERATION = getVendorPrefixedEventName("animationiteration"), ANIMATION_START = getVendorPrefixedEventName("animationstart"), TRANSITION_RUN = getVendorPrefixedEventName("transitionrun"), TRANSITION_START = getVendorPrefixedEventName("transitionstart"), TRANSITION_CANCEL = getVendorPrefixedEventName("transitioncancel"), TRANSITION_END = getVendorPrefixedEventName("transitionend"), topLevelEventsToReactNames = new Map, simpleEventPluginEvents = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
    simpleEventPluginEvents.push("scrollEnd");
    var lastResetTime = 0;
    if (typeof performance === "object" && typeof performance.now === "function") {
      var localPerformance = performance;
      var getCurrentTime = function() {
        return localPerformance.now();
      };
    } else {
      var localDate = Date;
      getCurrentTime = function() {
        return localDate.now();
      };
    }
    var reportGlobalError = typeof reportError === "function" ? reportError : function(error) {
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
    }, OMITTED_PROP_ERROR = "This object has been omitted by React in the console log to avoid sending too much data from the server. Try logging smaller or more specific objects.", EMPTY_ARRAY = 0, COMPLEX_ARRAY = 1, PRIMITIVE_ARRAY = 2, ENTRIES_ARRAY = 3, REMOVED = "– ", ADDED = "+ ", UNCHANGED = "  ", supportsUserTiming = typeof console !== "undefined" && typeof console.timeStamp === "function" && typeof performance !== "undefined" && typeof performance.measure === "function", COMPONENTS_TRACK = "Components ⚛", LANES_TRACK_GROUP = "Scheduler ⚛", currentTrack = "Blocking", alreadyWarnedForDeepEquality = false, reusableComponentDevToolDetails = {
      color: "primary",
      properties: null,
      tooltipText: "",
      track: COMPONENTS_TRACK
    }, reusableComponentOptions = {
      start: -0,
      end: -0,
      detail: { devtools: reusableComponentDevToolDetails }
    }, resuableChangedPropsEntry = ["Changed Props", ""], DEEP_EQUALITY_WARNING = "This component received deeply equal props. It might benefit from useMemo or the React Compiler in its owner.", reusableDeeplyEqualPropsEntry = ["Changed Props", DEEP_EQUALITY_WARNING], OffscreenVisible = 1, OffscreenPassiveEffectsConnected = 2, concurrentQueues = [], concurrentQueuesIndex = 0, concurrentlyUpdatedLanes = 0, emptyContextObject = {};
    Object.freeze(emptyContextObject);
    var resolveFamily = null, failedBoundaries = null, NoMode = 0, ConcurrentMode = 1, ProfileMode = 2, StrictLegacyMode = 8, StrictEffectsMode = 16, SuspenseyImagesMode = 32;
    var hasBadMapPolyfill = false;
    try {
      var nonExtensibleObject = Object.preventExtensions({});
      new Map([[nonExtensibleObject, null]]);
      new Set([nonExtensibleObject]);
    } catch (e$3) {
      hasBadMapPolyfill = true;
    }
    var CapturedStacks = new WeakMap, forkStack = [], forkStackIndex = 0, treeForkProvider = null, treeForkCount = 0, idStack = [], idStackIndex = 0, treeContextProvider = null, treeContextId = 1, treeContextOverflow = "", hydrationParentFiber = null, nextHydratableInstance = null, isHydrating = false, didSuspendOrErrorDEV = false, hydrationDiffRootDEV = null, hydrationErrors = null, rootOrSingletonContext = false, HydrationMismatchException = Error("Hydration Mismatch Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React."), valueCursor = createCursor(null);
    var rendererCursorDEV = createCursor(null);
    var rendererSigil = {};
    var currentlyRenderingFiber$1 = null, lastContextDependency = null, isDisallowedContextReadInDEV = false, AbortControllerLocal = typeof AbortController !== "undefined" ? AbortController : function() {
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
    }, scheduleCallback$2 = Scheduler.unstable_scheduleCallback, NormalPriority = Scheduler.unstable_NormalPriority, CacheContext = {
      $$typeof: REACT_CONTEXT_TYPE,
      Consumer: null,
      Provider: null,
      _currentValue: null,
      _currentValue2: null,
      _threadCount: 0,
      _currentRenderer: null,
      _currentRenderer2: null
    }, now = Scheduler.unstable_now, createTask = console.createTask ? console.createTask : function() {
      return null;
    }, SPAWNED_UPDATE = 1, PINGED_UPDATE = 2, renderStartTime = -0, commitStartTime = -0, commitEndTime = -0, commitErrors = null, profilerStartTime = -1.1, profilerEffectDuration = -0, componentEffectDuration = -0, componentEffectStartTime = -1.1, componentEffectEndTime = -1.1, componentEffectErrors = null, componentEffectSpawnedUpdate = false, blockingClampTime = -0, blockingUpdateTime = -1.1, blockingUpdateTask = null, blockingUpdateType = 0, blockingUpdateMethodName = null, blockingUpdateComponentName = null, blockingEventTime = -1.1, blockingEventType = null, blockingEventRepeatTime = -1.1, blockingSuspendedTime = -1.1, transitionClampTime = -0, transitionStartTime = -1.1, transitionUpdateTime = -1.1, transitionUpdateType = 0, transitionUpdateTask = null, transitionUpdateMethodName = null, transitionUpdateComponentName = null, transitionEventTime = -1.1, transitionEventType = null, transitionEventRepeatTime = -1.1, transitionSuspendedTime = -1.1, retryClampTime = -0, idleClampTime = -0, animatingLanes = 0, animatingTask = null, yieldReason = 0, yieldStartTime = -1.1, currentUpdateIsNested = false, nestedUpdateScheduled = false, currentEntangledListeners = null, currentEntangledPendingCount = 0, currentEntangledLane = 0, currentEntangledActionThenable = null, prevOnStartTransitionFinish = ReactSharedInternals.S;
    ReactSharedInternals.S = function(transition, returnValue) {
      globalMostRecentTransitionTime = now$1();
      if (typeof returnValue === "object" && returnValue !== null && typeof returnValue.then === "function") {
        if (0 > transitionStartTime && 0 > transitionUpdateTime) {
          transitionStartTime = now();
          var newEventTime = resolveEventTimeStamp(), newEventType = resolveEventType();
          if (newEventTime !== transitionEventRepeatTime || newEventType !== transitionEventType)
            transitionEventRepeatTime = -1.1;
          transitionEventTime = newEventTime;
          transitionEventType = newEventType;
        }
        entangleAsyncAction(transition, returnValue);
      }
      prevOnStartTransitionFinish !== null && prevOnStartTransitionFinish(transition, returnValue);
    };
    var resumedCache = createCursor(null), ReactStrictModeWarnings = {
      recordUnsafeLifecycleWarnings: function() {},
      flushPendingUnsafeLifecycleWarnings: function() {},
      recordLegacyContextWarning: function() {},
      flushLegacyContextWarning: function() {},
      discardPendingWarnings: function() {}
    }, pendingComponentWillMountWarnings = [], pendingUNSAFE_ComponentWillMountWarnings = [], pendingComponentWillReceivePropsWarnings = [], pendingUNSAFE_ComponentWillReceivePropsWarnings = [], pendingComponentWillUpdateWarnings = [], pendingUNSAFE_ComponentWillUpdateWarnings = [], didWarnAboutUnsafeLifecycles = new Set;
    ReactStrictModeWarnings.recordUnsafeLifecycleWarnings = function(fiber, instance) {
      didWarnAboutUnsafeLifecycles.has(fiber.type) || (typeof instance.componentWillMount === "function" && instance.componentWillMount.__suppressDeprecationWarning !== true && pendingComponentWillMountWarnings.push(fiber), fiber.mode & StrictLegacyMode && typeof instance.UNSAFE_componentWillMount === "function" && pendingUNSAFE_ComponentWillMountWarnings.push(fiber), typeof instance.componentWillReceiveProps === "function" && instance.componentWillReceiveProps.__suppressDeprecationWarning !== true && pendingComponentWillReceivePropsWarnings.push(fiber), fiber.mode & StrictLegacyMode && typeof instance.UNSAFE_componentWillReceiveProps === "function" && pendingUNSAFE_ComponentWillReceivePropsWarnings.push(fiber), typeof instance.componentWillUpdate === "function" && instance.componentWillUpdate.__suppressDeprecationWarning !== true && pendingComponentWillUpdateWarnings.push(fiber), fiber.mode & StrictLegacyMode && typeof instance.UNSAFE_componentWillUpdate === "function" && pendingUNSAFE_ComponentWillUpdateWarnings.push(fiber));
    };
    ReactStrictModeWarnings.flushPendingUnsafeLifecycleWarnings = function() {
      var componentWillMountUniqueNames = new Set;
      0 < pendingComponentWillMountWarnings.length && (pendingComponentWillMountWarnings.forEach(function(fiber) {
        componentWillMountUniqueNames.add(getComponentNameFromFiber(fiber) || "Component");
        didWarnAboutUnsafeLifecycles.add(fiber.type);
      }), pendingComponentWillMountWarnings = []);
      var UNSAFE_componentWillMountUniqueNames = new Set;
      0 < pendingUNSAFE_ComponentWillMountWarnings.length && (pendingUNSAFE_ComponentWillMountWarnings.forEach(function(fiber) {
        UNSAFE_componentWillMountUniqueNames.add(getComponentNameFromFiber(fiber) || "Component");
        didWarnAboutUnsafeLifecycles.add(fiber.type);
      }), pendingUNSAFE_ComponentWillMountWarnings = []);
      var componentWillReceivePropsUniqueNames = new Set;
      0 < pendingComponentWillReceivePropsWarnings.length && (pendingComponentWillReceivePropsWarnings.forEach(function(fiber) {
        componentWillReceivePropsUniqueNames.add(getComponentNameFromFiber(fiber) || "Component");
        didWarnAboutUnsafeLifecycles.add(fiber.type);
      }), pendingComponentWillReceivePropsWarnings = []);
      var UNSAFE_componentWillReceivePropsUniqueNames = new Set;
      0 < pendingUNSAFE_ComponentWillReceivePropsWarnings.length && (pendingUNSAFE_ComponentWillReceivePropsWarnings.forEach(function(fiber) {
        UNSAFE_componentWillReceivePropsUniqueNames.add(getComponentNameFromFiber(fiber) || "Component");
        didWarnAboutUnsafeLifecycles.add(fiber.type);
      }), pendingUNSAFE_ComponentWillReceivePropsWarnings = []);
      var componentWillUpdateUniqueNames = new Set;
      0 < pendingComponentWillUpdateWarnings.length && (pendingComponentWillUpdateWarnings.forEach(function(fiber) {
        componentWillUpdateUniqueNames.add(getComponentNameFromFiber(fiber) || "Component");
        didWarnAboutUnsafeLifecycles.add(fiber.type);
      }), pendingComponentWillUpdateWarnings = []);
      var UNSAFE_componentWillUpdateUniqueNames = new Set;
      0 < pendingUNSAFE_ComponentWillUpdateWarnings.length && (pendingUNSAFE_ComponentWillUpdateWarnings.forEach(function(fiber) {
        UNSAFE_componentWillUpdateUniqueNames.add(getComponentNameFromFiber(fiber) || "Component");
        didWarnAboutUnsafeLifecycles.add(fiber.type);
      }), pendingUNSAFE_ComponentWillUpdateWarnings = []);
      if (0 < UNSAFE_componentWillMountUniqueNames.size) {
        var sortedNames = setToSortedString(UNSAFE_componentWillMountUniqueNames);
        console.error(`Using UNSAFE_componentWillMount in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code with side effects to componentDidMount, and set initial state in the constructor.

Please update the following components: %s`, sortedNames);
      }
      0 < UNSAFE_componentWillReceivePropsUniqueNames.size && (sortedNames = setToSortedString(UNSAFE_componentWillReceivePropsUniqueNames), console.error(`Using UNSAFE_componentWillReceiveProps in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* If you're updating state whenever props change, refactor your code to use memoization techniques or move it to static getDerivedStateFromProps. Learn more at: https://react.dev/link/derived-state

Please update the following components: %s`, sortedNames));
      0 < UNSAFE_componentWillUpdateUniqueNames.size && (sortedNames = setToSortedString(UNSAFE_componentWillUpdateUniqueNames), console.error(`Using UNSAFE_componentWillUpdate in strict mode is not recommended and may indicate bugs in your code. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.

Please update the following components: %s`, sortedNames));
      0 < componentWillMountUniqueNames.size && (sortedNames = setToSortedString(componentWillMountUniqueNames), console.warn(`componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move code with side effects to componentDidMount, and set initial state in the constructor.
* Rename componentWillMount to UNSAFE_componentWillMount to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`, sortedNames));
      0 < componentWillReceivePropsUniqueNames.size && (sortedNames = setToSortedString(componentWillReceivePropsUniqueNames), console.warn(`componentWillReceiveProps has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* If you're updating state whenever props change, refactor your code to use memoization techniques or move it to static getDerivedStateFromProps. Learn more at: https://react.dev/link/derived-state
* Rename componentWillReceiveProps to UNSAFE_componentWillReceiveProps to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`, sortedNames));
      0 < componentWillUpdateUniqueNames.size && (sortedNames = setToSortedString(componentWillUpdateUniqueNames), console.warn(`componentWillUpdate has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.

* Move data fetching code or side effects to componentDidUpdate.
* Rename componentWillUpdate to UNSAFE_componentWillUpdate to suppress this warning in non-strict mode. In React 18.x, only the UNSAFE_ name will work. To rename all deprecated lifecycles to their new names, you can run \`npx react-codemod rename-unsafe-lifecycles\` in your project source folder.

Please update the following components: %s`, sortedNames));
    };
    var pendingLegacyContextWarning = new Map, didWarnAboutLegacyContext = new Set;
    ReactStrictModeWarnings.recordLegacyContextWarning = function(fiber, instance) {
      var strictRoot = null;
      for (var node = fiber;node !== null; )
        node.mode & StrictLegacyMode && (strictRoot = node), node = node.return;
      strictRoot === null ? console.error("Expected to find a StrictMode component in a strict mode tree. This error is likely caused by a bug in React. Please file an issue.") : !didWarnAboutLegacyContext.has(fiber.type) && (node = pendingLegacyContextWarning.get(strictRoot), fiber.type.contextTypes != null || fiber.type.childContextTypes != null || instance !== null && typeof instance.getChildContext === "function") && (node === undefined && (node = [], pendingLegacyContextWarning.set(strictRoot, node)), node.push(fiber));
    };
    ReactStrictModeWarnings.flushLegacyContextWarning = function() {
      pendingLegacyContextWarning.forEach(function(fiberArray) {
        if (fiberArray.length !== 0) {
          var firstFiber = fiberArray[0], uniqueNames = new Set;
          fiberArray.forEach(function(fiber) {
            uniqueNames.add(getComponentNameFromFiber(fiber) || "Component");
            didWarnAboutLegacyContext.add(fiber.type);
          });
          var sortedNames = setToSortedString(uniqueNames);
          runWithFiberInDEV(firstFiber, function() {
            console.error(`Legacy context API has been detected within a strict-mode tree.

The old API will be supported in all 16.x releases, but applications using it should migrate to the new version.

Please update the following components: %s

Learn more about this warning here: https://react.dev/link/legacy-context`, sortedNames);
          });
        }
      });
    };
    ReactStrictModeWarnings.discardPendingWarnings = function() {
      pendingComponentWillMountWarnings = [];
      pendingUNSAFE_ComponentWillMountWarnings = [];
      pendingComponentWillReceivePropsWarnings = [];
      pendingUNSAFE_ComponentWillReceivePropsWarnings = [];
      pendingComponentWillUpdateWarnings = [];
      pendingUNSAFE_ComponentWillUpdateWarnings = [];
      pendingLegacyContextWarning = new Map;
    };
    var callComponent = {
      react_stack_bottom_frame: function(Component, props, secondArg) {
        var wasRendering = isRendering;
        isRendering = true;
        try {
          return Component(props, secondArg);
        } finally {
          isRendering = wasRendering;
        }
      }
    }, callComponentInDEV = callComponent.react_stack_bottom_frame.bind(callComponent), callRender = {
      react_stack_bottom_frame: function(instance) {
        var wasRendering = isRendering;
        isRendering = true;
        try {
          return instance.render();
        } finally {
          isRendering = wasRendering;
        }
      }
    }, callRenderInDEV = callRender.react_stack_bottom_frame.bind(callRender), callComponentDidMount = {
      react_stack_bottom_frame: function(finishedWork, instance) {
        try {
          instance.componentDidMount();
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }, callComponentDidMountInDEV = callComponentDidMount.react_stack_bottom_frame.bind(callComponentDidMount), callComponentDidUpdate = {
      react_stack_bottom_frame: function(finishedWork, instance, prevProps, prevState, snapshot) {
        try {
          instance.componentDidUpdate(prevProps, prevState, snapshot);
        } catch (error) {
          captureCommitPhaseError(finishedWork, finishedWork.return, error);
        }
      }
    }, callComponentDidUpdateInDEV = callComponentDidUpdate.react_stack_bottom_frame.bind(callComponentDidUpdate), callComponentDidCatch = {
      react_stack_bottom_frame: function(instance, errorInfo) {
        var stack = errorInfo.stack;
        instance.componentDidCatch(errorInfo.value, {
          componentStack: stack !== null ? stack : ""
        });
      }
    }, callComponentDidCatchInDEV = callComponentDidCatch.react_stack_bottom_frame.bind(callComponentDidCatch), callComponentWillUnmount = {
      react_stack_bottom_frame: function(current2, nearestMountedAncestor, instance) {
        try {
          instance.componentWillUnmount();
        } catch (error) {
          captureCommitPhaseError(current2, nearestMountedAncestor, error);
        }
      }
    }, callComponentWillUnmountInDEV = callComponentWillUnmount.react_stack_bottom_frame.bind(callComponentWillUnmount), callCreate = {
      react_stack_bottom_frame: function(effect) {
        var create = effect.create;
        effect = effect.inst;
        create = create();
        return effect.destroy = create;
      }
    }, callCreateInDEV = callCreate.react_stack_bottom_frame.bind(callCreate), callDestroy = {
      react_stack_bottom_frame: function(current2, nearestMountedAncestor, destroy) {
        try {
          destroy();
        } catch (error) {
          captureCommitPhaseError(current2, nearestMountedAncestor, error);
        }
      }
    }, callDestroyInDEV = callDestroy.react_stack_bottom_frame.bind(callDestroy), callLazyInit = {
      react_stack_bottom_frame: function(lazy) {
        var init = lazy._init;
        return init(lazy._payload);
      }
    }, callLazyInitInDEV = callLazyInit.react_stack_bottom_frame.bind(callLazyInit), SuspenseException = Error("Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."), SuspenseyCommitException = Error("Suspense Exception: This is not a real error, and should not leak into userspace. If you're seeing this, it's likely a bug in React."), SuspenseActionException = Error("Suspense Exception: This is not a real error! It's an implementation detail of `useActionState` to interrupt the current render. You must either rethrow it immediately, or move the `useActionState` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary."), noopSuspenseyCommitThenable = {
      then: function() {
        console.error('Internal React error: A listener was unexpectedly attached to a "noop" thenable. This is a bug in React. Please file an issue.');
      }
    }, suspendedThenable = null, needsToResetSuspendedThenableDEV = false, thenableState$1 = null, thenableIndexCounter$1 = 0, currentDebugInfo = null, didWarnAboutMaps;
    var didWarnAboutGenerators = didWarnAboutMaps = false;
    var ownerHasKeyUseWarning = {};
    var ownerHasFunctionTypeWarning = {};
    var ownerHasSymbolTypeWarning = {};
    warnForMissingKey = function(returnFiber, workInProgress2, child) {
      if (child !== null && typeof child === "object" && child._store && (!child._store.validated && child.key == null || child._store.validated === 2)) {
        if (typeof child._store !== "object")
          throw Error("React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue.");
        child._store.validated = 1;
        var componentName2 = getComponentNameFromFiber(returnFiber), componentKey = componentName2 || "null";
        if (!ownerHasKeyUseWarning[componentKey]) {
          ownerHasKeyUseWarning[componentKey] = true;
          child = child._owner;
          returnFiber = returnFiber._debugOwner;
          var currentComponentErrorInfo = "";
          returnFiber && typeof returnFiber.tag === "number" && (componentKey = getComponentNameFromFiber(returnFiber)) && (currentComponentErrorInfo = `

Check the render method of \`` + componentKey + "`.");
          currentComponentErrorInfo || componentName2 && (currentComponentErrorInfo = `

Check the top-level render call using <` + componentName2 + ">.");
          var childOwnerAppendix = "";
          child != null && returnFiber !== child && (componentName2 = null, typeof child.tag === "number" ? componentName2 = getComponentNameFromFiber(child) : typeof child.name === "string" && (componentName2 = child.name), componentName2 && (childOwnerAppendix = " It was passed a child from " + componentName2 + "."));
          runWithFiberInDEV(workInProgress2, function() {
            console.error('Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.', currentComponentErrorInfo, childOwnerAppendix);
          });
        }
      }
    };
    var reconcileChildFibers = createChildReconciler(true), mountChildFibers = createChildReconciler(false), UpdateState = 0, ReplaceState = 1, ForceUpdate = 2, CaptureUpdate = 3, hasForceUpdate = false;
    var didWarnUpdateInsideUpdate = false;
    var currentlyProcessingQueue = null;
    var didReadFromEntangledAsyncAction = false, currentTreeHiddenStackCursor = createCursor(null), prevEntangledRenderLanesCursor = createCursor(0), suspenseHandlerStackCursor = createCursor(null), shellBoundary = null, SubtreeSuspenseContextMask = 1, ForceSuspenseFallback = 2, suspenseStackCursor = createCursor(0), NoFlags = 0, HasEffect = 1, Insertion = 2, Layout = 4, Passive = 8, didWarnUncachedGetSnapshot;
    var didWarnAboutMismatchedHooksForComponent = new Set;
    var didWarnAboutUseWrappedInTryCatch = new Set;
    var didWarnAboutAsyncClientComponent = new Set;
    var didWarnAboutUseFormState = new Set;
    var renderLanes = 0, currentlyRenderingFiber = null, currentHook = null, workInProgressHook = null, didScheduleRenderPhaseUpdate = false, didScheduleRenderPhaseUpdateDuringThisPass = false, shouldDoubleInvokeUserFnsInHooksDEV = false, localIdCounter = 0, thenableIndexCounter = 0, thenableState = null, globalClientIdCounter = 0, RE_RENDER_LIMIT = 25, currentHookNameInDev = null, hookTypesDev = null, hookTypesUpdateIndexDev = -1, ignorePreviousDependencies = false, ContextOnlyDispatcher = {
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
    var HooksDispatcherOnMountInDEV = null, HooksDispatcherOnMountWithHookTypesInDEV = null, HooksDispatcherOnUpdateInDEV = null, HooksDispatcherOnRerenderInDEV = null, InvalidNestedHooksDispatcherOnMountInDEV = null, InvalidNestedHooksDispatcherOnUpdateInDEV = null, InvalidNestedHooksDispatcherOnRerenderInDEV = null;
    HooksDispatcherOnMountInDEV = {
      readContext: function(context) {
        return readContext(context);
      },
      use,
      useCallback: function(callback, deps) {
        currentHookNameInDev = "useCallback";
        mountHookTypesDev();
        checkDepsAreArrayDev(deps);
        return mountCallback(callback, deps);
      },
      useContext: function(context) {
        currentHookNameInDev = "useContext";
        mountHookTypesDev();
        return readContext(context);
      },
      useEffect: function(create, deps) {
        currentHookNameInDev = "useEffect";
        mountHookTypesDev();
        checkDepsAreArrayDev(deps);
        return mountEffect(create, deps);
      },
      useImperativeHandle: function(ref, create, deps) {
        currentHookNameInDev = "useImperativeHandle";
        mountHookTypesDev();
        checkDepsAreArrayDev(deps);
        return mountImperativeHandle(ref, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        currentHookNameInDev = "useInsertionEffect";
        mountHookTypesDev();
        checkDepsAreArrayDev(deps);
        mountEffectImpl(4, Insertion, create, deps);
      },
      useLayoutEffect: function(create, deps) {
        currentHookNameInDev = "useLayoutEffect";
        mountHookTypesDev();
        checkDepsAreArrayDev(deps);
        return mountLayoutEffect(create, deps);
      },
      useMemo: function(create, deps) {
        currentHookNameInDev = "useMemo";
        mountHookTypesDev();
        checkDepsAreArrayDev(deps);
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountMemo(create, deps);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useReducer: function(reducer, initialArg, init) {
        currentHookNameInDev = "useReducer";
        mountHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountReducer(reducer, initialArg, init);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useRef: function(initialValue) {
        currentHookNameInDev = "useRef";
        mountHookTypesDev();
        return mountRef(initialValue);
      },
      useState: function(initialState) {
        currentHookNameInDev = "useState";
        mountHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountState(initialState);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useDebugValue: function() {
        currentHookNameInDev = "useDebugValue";
        mountHookTypesDev();
      },
      useDeferredValue: function(value, initialValue) {
        currentHookNameInDev = "useDeferredValue";
        mountHookTypesDev();
        return mountDeferredValue(value, initialValue);
      },
      useTransition: function() {
        currentHookNameInDev = "useTransition";
        mountHookTypesDev();
        return mountTransition();
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        currentHookNameInDev = "useSyncExternalStore";
        mountHookTypesDev();
        return mountSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
      },
      useId: function() {
        currentHookNameInDev = "useId";
        mountHookTypesDev();
        return mountId();
      },
      useFormState: function(action, initialState) {
        currentHookNameInDev = "useFormState";
        mountHookTypesDev();
        warnOnUseFormStateInDev();
        return mountActionState(action, initialState);
      },
      useActionState: function(action, initialState) {
        currentHookNameInDev = "useActionState";
        mountHookTypesDev();
        return mountActionState(action, initialState);
      },
      useOptimistic: function(passthrough) {
        currentHookNameInDev = "useOptimistic";
        mountHookTypesDev();
        return mountOptimistic(passthrough);
      },
      useHostTransitionStatus,
      useMemoCache,
      useCacheRefresh: function() {
        currentHookNameInDev = "useCacheRefresh";
        mountHookTypesDev();
        return mountRefresh();
      },
      useEffectEvent: function(callback) {
        currentHookNameInDev = "useEffectEvent";
        mountHookTypesDev();
        return mountEvent(callback);
      }
    };
    HooksDispatcherOnMountWithHookTypesInDEV = {
      readContext: function(context) {
        return readContext(context);
      },
      use,
      useCallback: function(callback, deps) {
        currentHookNameInDev = "useCallback";
        updateHookTypesDev();
        return mountCallback(callback, deps);
      },
      useContext: function(context) {
        currentHookNameInDev = "useContext";
        updateHookTypesDev();
        return readContext(context);
      },
      useEffect: function(create, deps) {
        currentHookNameInDev = "useEffect";
        updateHookTypesDev();
        return mountEffect(create, deps);
      },
      useImperativeHandle: function(ref, create, deps) {
        currentHookNameInDev = "useImperativeHandle";
        updateHookTypesDev();
        return mountImperativeHandle(ref, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        currentHookNameInDev = "useInsertionEffect";
        updateHookTypesDev();
        mountEffectImpl(4, Insertion, create, deps);
      },
      useLayoutEffect: function(create, deps) {
        currentHookNameInDev = "useLayoutEffect";
        updateHookTypesDev();
        return mountLayoutEffect(create, deps);
      },
      useMemo: function(create, deps) {
        currentHookNameInDev = "useMemo";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountMemo(create, deps);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useReducer: function(reducer, initialArg, init) {
        currentHookNameInDev = "useReducer";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountReducer(reducer, initialArg, init);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useRef: function(initialValue) {
        currentHookNameInDev = "useRef";
        updateHookTypesDev();
        return mountRef(initialValue);
      },
      useState: function(initialState) {
        currentHookNameInDev = "useState";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountState(initialState);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useDebugValue: function() {
        currentHookNameInDev = "useDebugValue";
        updateHookTypesDev();
      },
      useDeferredValue: function(value, initialValue) {
        currentHookNameInDev = "useDeferredValue";
        updateHookTypesDev();
        return mountDeferredValue(value, initialValue);
      },
      useTransition: function() {
        currentHookNameInDev = "useTransition";
        updateHookTypesDev();
        return mountTransition();
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        currentHookNameInDev = "useSyncExternalStore";
        updateHookTypesDev();
        return mountSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
      },
      useId: function() {
        currentHookNameInDev = "useId";
        updateHookTypesDev();
        return mountId();
      },
      useActionState: function(action, initialState) {
        currentHookNameInDev = "useActionState";
        updateHookTypesDev();
        return mountActionState(action, initialState);
      },
      useFormState: function(action, initialState) {
        currentHookNameInDev = "useFormState";
        updateHookTypesDev();
        warnOnUseFormStateInDev();
        return mountActionState(action, initialState);
      },
      useOptimistic: function(passthrough) {
        currentHookNameInDev = "useOptimistic";
        updateHookTypesDev();
        return mountOptimistic(passthrough);
      },
      useHostTransitionStatus,
      useMemoCache,
      useCacheRefresh: function() {
        currentHookNameInDev = "useCacheRefresh";
        updateHookTypesDev();
        return mountRefresh();
      },
      useEffectEvent: function(callback) {
        currentHookNameInDev = "useEffectEvent";
        updateHookTypesDev();
        return mountEvent(callback);
      }
    };
    HooksDispatcherOnUpdateInDEV = {
      readContext: function(context) {
        return readContext(context);
      },
      use,
      useCallback: function(callback, deps) {
        currentHookNameInDev = "useCallback";
        updateHookTypesDev();
        return updateCallback(callback, deps);
      },
      useContext: function(context) {
        currentHookNameInDev = "useContext";
        updateHookTypesDev();
        return readContext(context);
      },
      useEffect: function(create, deps) {
        currentHookNameInDev = "useEffect";
        updateHookTypesDev();
        updateEffectImpl(2048, Passive, create, deps);
      },
      useImperativeHandle: function(ref, create, deps) {
        currentHookNameInDev = "useImperativeHandle";
        updateHookTypesDev();
        return updateImperativeHandle(ref, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        currentHookNameInDev = "useInsertionEffect";
        updateHookTypesDev();
        return updateEffectImpl(4, Insertion, create, deps);
      },
      useLayoutEffect: function(create, deps) {
        currentHookNameInDev = "useLayoutEffect";
        updateHookTypesDev();
        return updateEffectImpl(4, Layout, create, deps);
      },
      useMemo: function(create, deps) {
        currentHookNameInDev = "useMemo";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return updateMemo(create, deps);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useReducer: function(reducer, initialArg, init) {
        currentHookNameInDev = "useReducer";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return updateReducer(reducer, initialArg, init);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useRef: function() {
        currentHookNameInDev = "useRef";
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useState: function() {
        currentHookNameInDev = "useState";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return updateReducer(basicStateReducer);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useDebugValue: function() {
        currentHookNameInDev = "useDebugValue";
        updateHookTypesDev();
      },
      useDeferredValue: function(value, initialValue) {
        currentHookNameInDev = "useDeferredValue";
        updateHookTypesDev();
        return updateDeferredValue(value, initialValue);
      },
      useTransition: function() {
        currentHookNameInDev = "useTransition";
        updateHookTypesDev();
        return updateTransition();
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        currentHookNameInDev = "useSyncExternalStore";
        updateHookTypesDev();
        return updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
      },
      useId: function() {
        currentHookNameInDev = "useId";
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useFormState: function(action) {
        currentHookNameInDev = "useFormState";
        updateHookTypesDev();
        warnOnUseFormStateInDev();
        return updateActionState(action);
      },
      useActionState: function(action) {
        currentHookNameInDev = "useActionState";
        updateHookTypesDev();
        return updateActionState(action);
      },
      useOptimistic: function(passthrough, reducer) {
        currentHookNameInDev = "useOptimistic";
        updateHookTypesDev();
        return updateOptimistic(passthrough, reducer);
      },
      useHostTransitionStatus,
      useMemoCache,
      useCacheRefresh: function() {
        currentHookNameInDev = "useCacheRefresh";
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useEffectEvent: function(callback) {
        currentHookNameInDev = "useEffectEvent";
        updateHookTypesDev();
        return updateEvent(callback);
      }
    };
    HooksDispatcherOnRerenderInDEV = {
      readContext: function(context) {
        return readContext(context);
      },
      use,
      useCallback: function(callback, deps) {
        currentHookNameInDev = "useCallback";
        updateHookTypesDev();
        return updateCallback(callback, deps);
      },
      useContext: function(context) {
        currentHookNameInDev = "useContext";
        updateHookTypesDev();
        return readContext(context);
      },
      useEffect: function(create, deps) {
        currentHookNameInDev = "useEffect";
        updateHookTypesDev();
        updateEffectImpl(2048, Passive, create, deps);
      },
      useImperativeHandle: function(ref, create, deps) {
        currentHookNameInDev = "useImperativeHandle";
        updateHookTypesDev();
        return updateImperativeHandle(ref, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        currentHookNameInDev = "useInsertionEffect";
        updateHookTypesDev();
        return updateEffectImpl(4, Insertion, create, deps);
      },
      useLayoutEffect: function(create, deps) {
        currentHookNameInDev = "useLayoutEffect";
        updateHookTypesDev();
        return updateEffectImpl(4, Layout, create, deps);
      },
      useMemo: function(create, deps) {
        currentHookNameInDev = "useMemo";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnRerenderInDEV;
        try {
          return updateMemo(create, deps);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useReducer: function(reducer, initialArg, init) {
        currentHookNameInDev = "useReducer";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnRerenderInDEV;
        try {
          return rerenderReducer(reducer, initialArg, init);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useRef: function() {
        currentHookNameInDev = "useRef";
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useState: function() {
        currentHookNameInDev = "useState";
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnRerenderInDEV;
        try {
          return rerenderReducer(basicStateReducer);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useDebugValue: function() {
        currentHookNameInDev = "useDebugValue";
        updateHookTypesDev();
      },
      useDeferredValue: function(value, initialValue) {
        currentHookNameInDev = "useDeferredValue";
        updateHookTypesDev();
        return rerenderDeferredValue(value, initialValue);
      },
      useTransition: function() {
        currentHookNameInDev = "useTransition";
        updateHookTypesDev();
        return rerenderTransition();
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        currentHookNameInDev = "useSyncExternalStore";
        updateHookTypesDev();
        return updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
      },
      useId: function() {
        currentHookNameInDev = "useId";
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useFormState: function(action) {
        currentHookNameInDev = "useFormState";
        updateHookTypesDev();
        warnOnUseFormStateInDev();
        return rerenderActionState(action);
      },
      useActionState: function(action) {
        currentHookNameInDev = "useActionState";
        updateHookTypesDev();
        return rerenderActionState(action);
      },
      useOptimistic: function(passthrough, reducer) {
        currentHookNameInDev = "useOptimistic";
        updateHookTypesDev();
        return rerenderOptimistic(passthrough, reducer);
      },
      useHostTransitionStatus,
      useMemoCache,
      useCacheRefresh: function() {
        currentHookNameInDev = "useCacheRefresh";
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useEffectEvent: function(callback) {
        currentHookNameInDev = "useEffectEvent";
        updateHookTypesDev();
        return updateEvent(callback);
      }
    };
    InvalidNestedHooksDispatcherOnMountInDEV = {
      readContext: function(context) {
        warnInvalidContextAccess();
        return readContext(context);
      },
      use: function(usable) {
        warnInvalidHookAccess();
        return use(usable);
      },
      useCallback: function(callback, deps) {
        currentHookNameInDev = "useCallback";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountCallback(callback, deps);
      },
      useContext: function(context) {
        currentHookNameInDev = "useContext";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return readContext(context);
      },
      useEffect: function(create, deps) {
        currentHookNameInDev = "useEffect";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountEffect(create, deps);
      },
      useImperativeHandle: function(ref, create, deps) {
        currentHookNameInDev = "useImperativeHandle";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountImperativeHandle(ref, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        currentHookNameInDev = "useInsertionEffect";
        warnInvalidHookAccess();
        mountHookTypesDev();
        mountEffectImpl(4, Insertion, create, deps);
      },
      useLayoutEffect: function(create, deps) {
        currentHookNameInDev = "useLayoutEffect";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountLayoutEffect(create, deps);
      },
      useMemo: function(create, deps) {
        currentHookNameInDev = "useMemo";
        warnInvalidHookAccess();
        mountHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountMemo(create, deps);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useReducer: function(reducer, initialArg, init) {
        currentHookNameInDev = "useReducer";
        warnInvalidHookAccess();
        mountHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountReducer(reducer, initialArg, init);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useRef: function(initialValue) {
        currentHookNameInDev = "useRef";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountRef(initialValue);
      },
      useState: function(initialState) {
        currentHookNameInDev = "useState";
        warnInvalidHookAccess();
        mountHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnMountInDEV;
        try {
          return mountState(initialState);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useDebugValue: function() {
        currentHookNameInDev = "useDebugValue";
        warnInvalidHookAccess();
        mountHookTypesDev();
      },
      useDeferredValue: function(value, initialValue) {
        currentHookNameInDev = "useDeferredValue";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountDeferredValue(value, initialValue);
      },
      useTransition: function() {
        currentHookNameInDev = "useTransition";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountTransition();
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        currentHookNameInDev = "useSyncExternalStore";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
      },
      useId: function() {
        currentHookNameInDev = "useId";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountId();
      },
      useFormState: function(action, initialState) {
        currentHookNameInDev = "useFormState";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountActionState(action, initialState);
      },
      useActionState: function(action, initialState) {
        currentHookNameInDev = "useActionState";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountActionState(action, initialState);
      },
      useOptimistic: function(passthrough) {
        currentHookNameInDev = "useOptimistic";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountOptimistic(passthrough);
      },
      useMemoCache: function(size) {
        warnInvalidHookAccess();
        return useMemoCache(size);
      },
      useHostTransitionStatus,
      useCacheRefresh: function() {
        currentHookNameInDev = "useCacheRefresh";
        mountHookTypesDev();
        return mountRefresh();
      },
      useEffectEvent: function(callback) {
        currentHookNameInDev = "useEffectEvent";
        warnInvalidHookAccess();
        mountHookTypesDev();
        return mountEvent(callback);
      }
    };
    InvalidNestedHooksDispatcherOnUpdateInDEV = {
      readContext: function(context) {
        warnInvalidContextAccess();
        return readContext(context);
      },
      use: function(usable) {
        warnInvalidHookAccess();
        return use(usable);
      },
      useCallback: function(callback, deps) {
        currentHookNameInDev = "useCallback";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateCallback(callback, deps);
      },
      useContext: function(context) {
        currentHookNameInDev = "useContext";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return readContext(context);
      },
      useEffect: function(create, deps) {
        currentHookNameInDev = "useEffect";
        warnInvalidHookAccess();
        updateHookTypesDev();
        updateEffectImpl(2048, Passive, create, deps);
      },
      useImperativeHandle: function(ref, create, deps) {
        currentHookNameInDev = "useImperativeHandle";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateImperativeHandle(ref, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        currentHookNameInDev = "useInsertionEffect";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateEffectImpl(4, Insertion, create, deps);
      },
      useLayoutEffect: function(create, deps) {
        currentHookNameInDev = "useLayoutEffect";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateEffectImpl(4, Layout, create, deps);
      },
      useMemo: function(create, deps) {
        currentHookNameInDev = "useMemo";
        warnInvalidHookAccess();
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return updateMemo(create, deps);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useReducer: function(reducer, initialArg, init) {
        currentHookNameInDev = "useReducer";
        warnInvalidHookAccess();
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return updateReducer(reducer, initialArg, init);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useRef: function() {
        currentHookNameInDev = "useRef";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useState: function() {
        currentHookNameInDev = "useState";
        warnInvalidHookAccess();
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return updateReducer(basicStateReducer);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useDebugValue: function() {
        currentHookNameInDev = "useDebugValue";
        warnInvalidHookAccess();
        updateHookTypesDev();
      },
      useDeferredValue: function(value, initialValue) {
        currentHookNameInDev = "useDeferredValue";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateDeferredValue(value, initialValue);
      },
      useTransition: function() {
        currentHookNameInDev = "useTransition";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateTransition();
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        currentHookNameInDev = "useSyncExternalStore";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
      },
      useId: function() {
        currentHookNameInDev = "useId";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useFormState: function(action) {
        currentHookNameInDev = "useFormState";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateActionState(action);
      },
      useActionState: function(action) {
        currentHookNameInDev = "useActionState";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateActionState(action);
      },
      useOptimistic: function(passthrough, reducer) {
        currentHookNameInDev = "useOptimistic";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateOptimistic(passthrough, reducer);
      },
      useMemoCache: function(size) {
        warnInvalidHookAccess();
        return useMemoCache(size);
      },
      useHostTransitionStatus,
      useCacheRefresh: function() {
        currentHookNameInDev = "useCacheRefresh";
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useEffectEvent: function(callback) {
        currentHookNameInDev = "useEffectEvent";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateEvent(callback);
      }
    };
    InvalidNestedHooksDispatcherOnRerenderInDEV = {
      readContext: function(context) {
        warnInvalidContextAccess();
        return readContext(context);
      },
      use: function(usable) {
        warnInvalidHookAccess();
        return use(usable);
      },
      useCallback: function(callback, deps) {
        currentHookNameInDev = "useCallback";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateCallback(callback, deps);
      },
      useContext: function(context) {
        currentHookNameInDev = "useContext";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return readContext(context);
      },
      useEffect: function(create, deps) {
        currentHookNameInDev = "useEffect";
        warnInvalidHookAccess();
        updateHookTypesDev();
        updateEffectImpl(2048, Passive, create, deps);
      },
      useImperativeHandle: function(ref, create, deps) {
        currentHookNameInDev = "useImperativeHandle";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateImperativeHandle(ref, create, deps);
      },
      useInsertionEffect: function(create, deps) {
        currentHookNameInDev = "useInsertionEffect";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateEffectImpl(4, Insertion, create, deps);
      },
      useLayoutEffect: function(create, deps) {
        currentHookNameInDev = "useLayoutEffect";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateEffectImpl(4, Layout, create, deps);
      },
      useMemo: function(create, deps) {
        currentHookNameInDev = "useMemo";
        warnInvalidHookAccess();
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return updateMemo(create, deps);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useReducer: function(reducer, initialArg, init) {
        currentHookNameInDev = "useReducer";
        warnInvalidHookAccess();
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return rerenderReducer(reducer, initialArg, init);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useRef: function() {
        currentHookNameInDev = "useRef";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useState: function() {
        currentHookNameInDev = "useState";
        warnInvalidHookAccess();
        updateHookTypesDev();
        var prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = InvalidNestedHooksDispatcherOnUpdateInDEV;
        try {
          return rerenderReducer(basicStateReducer);
        } finally {
          ReactSharedInternals.H = prevDispatcher;
        }
      },
      useDebugValue: function() {
        currentHookNameInDev = "useDebugValue";
        warnInvalidHookAccess();
        updateHookTypesDev();
      },
      useDeferredValue: function(value, initialValue) {
        currentHookNameInDev = "useDeferredValue";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return rerenderDeferredValue(value, initialValue);
      },
      useTransition: function() {
        currentHookNameInDev = "useTransition";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return rerenderTransition();
      },
      useSyncExternalStore: function(subscribe, getSnapshot, getServerSnapshot) {
        currentHookNameInDev = "useSyncExternalStore";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
      },
      useId: function() {
        currentHookNameInDev = "useId";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useFormState: function(action) {
        currentHookNameInDev = "useFormState";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return rerenderActionState(action);
      },
      useActionState: function(action) {
        currentHookNameInDev = "useActionState";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return rerenderActionState(action);
      },
      useOptimistic: function(passthrough, reducer) {
        currentHookNameInDev = "useOptimistic";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return rerenderOptimistic(passthrough, reducer);
      },
      useMemoCache: function(size) {
        warnInvalidHookAccess();
        return useMemoCache(size);
      },
      useHostTransitionStatus,
      useCacheRefresh: function() {
        currentHookNameInDev = "useCacheRefresh";
        updateHookTypesDev();
        return updateWorkInProgressHook().memoizedState;
      },
      useEffectEvent: function(callback) {
        currentHookNameInDev = "useEffectEvent";
        warnInvalidHookAccess();
        updateHookTypesDev();
        return updateEvent(callback);
      }
    };
    var fakeInternalInstance = {};
    var didWarnAboutStateAssignmentForComponent = new Set;
    var didWarnAboutUninitializedState = new Set;
    var didWarnAboutGetSnapshotBeforeUpdateWithoutDidUpdate = new Set;
    var didWarnAboutLegacyLifecyclesAndDerivedState = new Set;
    var didWarnAboutDirectlyAssigningPropsToState = new Set;
    var didWarnAboutUndefinedDerivedState = new Set;
    var didWarnAboutContextTypes$1 = new Set;
    var didWarnAboutChildContextTypes = new Set;
    var didWarnAboutInvalidateContextType = new Set;
    var didWarnOnInvalidCallback = new Set;
    Object.freeze(fakeInternalInstance);
    var classComponentUpdater = {
      enqueueSetState: function(inst, payload, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(inst), update = createUpdate(lane);
        update.payload = payload;
        callback !== undefined && callback !== null && (warnOnInvalidCallback(callback), update.callback = callback);
        payload = enqueueUpdate(inst, update, lane);
        payload !== null && (startUpdateTimerByLane(lane, "this.setState()", inst), scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
      },
      enqueueReplaceState: function(inst, payload, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(inst), update = createUpdate(lane);
        update.tag = ReplaceState;
        update.payload = payload;
        callback !== undefined && callback !== null && (warnOnInvalidCallback(callback), update.callback = callback);
        payload = enqueueUpdate(inst, update, lane);
        payload !== null && (startUpdateTimerByLane(lane, "this.replaceState()", inst), scheduleUpdateOnFiber(payload, inst, lane), entangleTransitions(payload, inst, lane));
      },
      enqueueForceUpdate: function(inst, callback) {
        inst = inst._reactInternals;
        var lane = requestUpdateLane(inst), update = createUpdate(lane);
        update.tag = ForceUpdate;
        callback !== undefined && callback !== null && (warnOnInvalidCallback(callback), update.callback = callback);
        callback = enqueueUpdate(inst, update, lane);
        callback !== null && (startUpdateTimerByLane(lane, "this.forceUpdate()", inst), scheduleUpdateOnFiber(callback, inst, lane), entangleTransitions(callback, inst, lane));
      }
    }, componentName = null, errorBoundaryName = null, SelectiveHydrationException = Error("This is not a real error. It's an implementation detail of React's selective hydration feature. If this leaks into userspace, it's a bug in React. Please file an issue."), didReceiveUpdate = false;
    var didWarnAboutBadClass = {};
    var didWarnAboutContextTypeOnFunctionComponent = {};
    var didWarnAboutContextTypes = {};
    var didWarnAboutGetDerivedStateOnFunctionComponent = {};
    var didWarnAboutReassigningProps = false;
    var didWarnAboutRevealOrder = {};
    var didWarnAboutTailOptions = {};
    var SUSPENDED_MARKER = {
      dehydrated: null,
      treeContext: null,
      retryLane: 0,
      hydrationErrors: null
    }, hasWarnedAboutUsingNoValuePropOnContextProvider = false, didWarnAboutUndefinedSnapshotBeforeUpdate = null;
    didWarnAboutUndefinedSnapshotBeforeUpdate = new Set;
    var offscreenSubtreeIsHidden = false, offscreenSubtreeWasHidden = false, needsFormReset = false, PossiblyWeakSet = typeof WeakSet === "function" ? WeakSet : Set, nextEffect = null, inProgressLanes = null, inProgressRoot = null, hostParent = null, hostParentIsContainer = false, currentHoistableRoot = null, inHydratedSubtree = false, suspenseyCommitFlag = 8192, DefaultAsyncDispatcher = {
      getCacheForType: function(resourceType) {
        var cache = readContext(CacheContext), cacheForType = cache.data.get(resourceType);
        cacheForType === undefined && (cacheForType = resourceType(), cache.data.set(resourceType, cacheForType));
        return cacheForType;
      },
      cacheSignal: function() {
        return readContext(CacheContext).controller.signal;
      },
      getOwner: function() {
        return current;
      }
    };
    if (typeof Symbol === "function" && Symbol.for) {
      var symbolFor = Symbol.for;
      symbolFor("selector.component");
      symbolFor("selector.has_pseudo_class");
      symbolFor("selector.role");
      symbolFor("selector.test_id");
      symbolFor("selector.text");
    }
    var commitHooks = [], PossiblyWeakMap = typeof WeakMap === "function" ? WeakMap : Map, NoContext = 0, RenderContext = 2, CommitContext = 4, RootInProgress = 0, RootFatalErrored = 1, RootErrored = 2, RootSuspended = 3, RootSuspendedWithDelay = 4, RootSuspendedAtTheShell = 6, RootCompleted = 5, executionContext = NoContext, workInProgressRoot = null, workInProgress = null, workInProgressRootRenderLanes = 0, NotSuspended = 0, SuspendedOnError = 1, SuspendedOnData = 2, SuspendedOnImmediate = 3, SuspendedOnInstance = 4, SuspendedOnInstanceAndReadyToContinue = 5, SuspendedOnDeprecatedThrowPromise = 6, SuspendedAndReadyToContinue = 7, SuspendedOnHydration = 8, SuspendedOnAction = 9, workInProgressSuspendedReason = NotSuspended, workInProgressThrownValue = null, workInProgressRootDidSkipSuspendedSiblings = false, workInProgressRootIsPrerendering = false, workInProgressRootDidAttachPingListener = false, entangledRenderLanes = 0, workInProgressRootExitStatus = RootInProgress, workInProgressRootSkippedLanes = 0, workInProgressRootInterleavedUpdatedLanes = 0, workInProgressRootPingedLanes = 0, workInProgressDeferredLane = 0, workInProgressSuspendedRetryLanes = 0, workInProgressRootConcurrentErrors = null, workInProgressRootRecoverableErrors = null, workInProgressRootDidIncludeRecursiveRenderUpdate = false, globalMostRecentFallbackTime = 0, globalMostRecentTransitionTime = 0, FALLBACK_THROTTLE_MS = 300, workInProgressRootRenderTargetTime = Infinity, RENDER_TIMEOUT_MS = 500, workInProgressTransitions = null, workInProgressUpdateTask = null, legacyErrorBoundariesThatAlreadyFailed = null, IMMEDIATE_COMMIT = 0, ABORTED_VIEW_TRANSITION_COMMIT = 1, DELAYED_PASSIVE_COMMIT = 2, ANIMATION_STARTED_COMMIT = 3, NO_PENDING_EFFECTS = 0, PENDING_MUTATION_PHASE = 1, PENDING_LAYOUT_PHASE = 2, PENDING_AFTER_MUTATION_PHASE = 3, PENDING_SPAWNED_WORK = 4, PENDING_PASSIVE_PHASE = 5, pendingEffectsStatus = 0, pendingEffectsRoot = null, pendingFinishedWork = null, pendingEffectsLanes = 0, pendingEffectsRemainingLanes = 0, pendingEffectsRenderEndTime = -0, pendingPassiveTransitions = null, pendingRecoverableErrors = null, pendingSuspendedCommitReason = null, pendingDelayedCommitReason = IMMEDIATE_COMMIT, pendingSuspendedViewTransitionReason = null, NESTED_UPDATE_LIMIT = 50, nestedUpdateCount = 0, rootWithNestedUpdates = null, isFlushingPassiveEffects = false, didScheduleUpdateDuringPassiveEffects = false, NESTED_PASSIVE_UPDATE_LIMIT = 50, nestedPassiveUpdateCount = 0, rootWithPassiveNestedUpdates = null, isRunningInsertionEffect = false, didWarnStateUpdateForNotYetMountedComponent = null, didWarnAboutUpdateInRender = false;
    var didWarnAboutUpdateInRenderForAnotherComponent = new Set;
    var fakeActCallbackNode$1 = {}, firstScheduledRoot = null, lastScheduledRoot = null, didScheduleMicrotask = false, didScheduleMicrotask_act = false, mightHavePendingSyncWork = false, isFlushingWork = false, currentEventTransitionLane = 0, fakeActCallbackNode = {};
    (function() {
      for (var i = 0;i < simpleEventPluginEvents.length; i++) {
        var eventName = simpleEventPluginEvents[i], domEventName = eventName.toLowerCase();
        eventName = eventName[0].toUpperCase() + eventName.slice(1);
        registerSimpleEvent(domEventName, "on" + eventName);
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
    })();
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
    var mediaEventTypes = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), nonDelegatedEvents = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(mediaEventTypes)), listeningMarker = "_reactListening" + Math.random().toString(36).slice(2), didWarnControlledToUncontrolled = false, didWarnUncontrolledToControlled = false, didWarnFormActionType = false, didWarnFormActionName = false, didWarnFormActionTarget = false, didWarnFormActionMethod = false, didWarnPopoverTargetObject = false;
    var didWarnForNewBooleanPropsWithEmptyValue = {};
    var NORMALIZE_NEWLINES_REGEX = /\r\n?/g, NORMALIZE_NULL_AND_REPLACEMENT_REGEX = /\u0000|\uFFFD/g, xlinkNamespace = "http://www.w3.org/1999/xlink", xmlNamespace = "http://www.w3.org/XML/1998/namespace", EXPECTED_FORM_ACTION_URL = "javascript:throw new Error('React form unexpectedly submitted.')", SUPPRESS_HYDRATION_WARNING = "suppressHydrationWarning", ACTIVITY_START_DATA = "&", ACTIVITY_END_DATA = "/&", SUSPENSE_START_DATA = "$", SUSPENSE_END_DATA = "/$", SUSPENSE_PENDING_START_DATA = "$?", SUSPENSE_QUEUED_START_DATA = "$~", SUSPENSE_FALLBACK_START_DATA = "$!", PREAMBLE_CONTRIBUTION_HTML = "html", PREAMBLE_CONTRIBUTION_BODY = "body", PREAMBLE_CONTRIBUTION_HEAD = "head", FORM_STATE_IS_MATCHING = "F!", FORM_STATE_IS_NOT_MATCHING = "F", DOCUMENT_READY_STATE_LOADING = "loading", STYLE = "style", HostContextNamespaceNone = 0, HostContextNamespaceSvg = 1, HostContextNamespaceMath = 2, eventsEnabled = null, selectionInformation = null, warnedUnknownTags = { dialog: true, webview: true }, currentPopstateTransitionEvent = null, schedulerEvent = undefined, scheduleTimeout = typeof setTimeout === "function" ? setTimeout : undefined, cancelTimeout = typeof clearTimeout === "function" ? clearTimeout : undefined, noTimeout = -1, localPromise = typeof Promise === "function" ? Promise : undefined, scheduleMicrotask = typeof queueMicrotask === "function" ? queueMicrotask : typeof localPromise !== "undefined" ? function(callback) {
      return localPromise.resolve(null).then(callback).catch(handleErrorInNextTick);
    } : scheduleTimeout, previousHydratableOnEnteringScopedSingleton = null, NotLoaded = 0, Loaded = 1, Errored = 2, Settled = 3, Inserted = 4, preloadPropsMap = new Map, preconnectsSet = new Set, previousDispatcher = ReactDOMSharedInternals.d;
    ReactDOMSharedInternals.d = {
      f: function() {
        var previousWasRendering = previousDispatcher.f(), wasRendering = flushSyncWork$1();
        return previousWasRendering || wasRendering;
      },
      r: function(form) {
        var formInst = getInstanceFromNode(form);
        formInst !== null && formInst.tag === 5 && formInst.type === "form" ? requestFormReset$1(formInst) : previousDispatcher.r(form);
      },
      D: function(href) {
        previousDispatcher.D(href);
        preconnectAs("dns-prefetch", href, null);
      },
      C: function(href, crossOrigin) {
        previousDispatcher.C(href, crossOrigin);
        preconnectAs("preconnect", href, crossOrigin);
      },
      L: function(href, as, options) {
        previousDispatcher.L(href, as, options);
        var ownerDocument = globalDocument;
        if (ownerDocument && href && as) {
          var preloadSelector = 'link[rel="preload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"]';
          as === "image" ? options && options.imageSrcSet ? (preloadSelector += '[imagesrcset="' + escapeSelectorAttributeValueInsideDoubleQuotes(options.imageSrcSet) + '"]', typeof options.imageSizes === "string" && (preloadSelector += '[imagesizes="' + escapeSelectorAttributeValueInsideDoubleQuotes(options.imageSizes) + '"]')) : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]' : preloadSelector += '[href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]';
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
            href: as === "image" && options && options.imageSrcSet ? undefined : href,
            as
          }, options), preloadPropsMap.set(key, href), ownerDocument.querySelector(preloadSelector) !== null || as === "style" && ownerDocument.querySelector(getStylesheetSelectorFromKey(key)) || as === "script" && ownerDocument.querySelector(getScriptSelectorFromKey(key)) || (as = ownerDocument.createElement("link"), setInitialProperties(as, "link", href), markNodeAsHoistable(as), ownerDocument.head.appendChild(as)));
        }
      },
      m: function(href, options) {
        previousDispatcher.m(href, options);
        var ownerDocument = globalDocument;
        if (ownerDocument && href) {
          var as = options && typeof options.as === "string" ? options.as : "script", preloadSelector = 'link[rel="modulepreload"][as="' + escapeSelectorAttributeValueInsideDoubleQuotes(as) + '"][href="' + escapeSelectorAttributeValueInsideDoubleQuotes(href) + '"]', key = preloadSelector;
          switch (as) {
            case "audioworklet":
            case "paintworklet":
            case "serviceworker":
            case "sharedworker":
            case "worker":
            case "script":
              key = getScriptKey(href);
          }
          if (!preloadPropsMap.has(key) && (href = assign({ rel: "modulepreload", href }, options), preloadPropsMap.set(key, href), ownerDocument.querySelector(preloadSelector) === null)) {
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
      },
      X: function(src, options) {
        previousDispatcher.X(src, options);
        var ownerDocument = globalDocument;
        if (ownerDocument && src) {
          var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key = getScriptKey(src), resource = scripts.get(key);
          resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key)), resource || (src = assign({ src, async: true }, options), (options = preloadPropsMap.get(key)) && adoptPreloadPropsForScript(src, options), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
            type: "script",
            instance: resource,
            count: 1,
            state: null
          }, scripts.set(key, resource));
        }
      },
      S: function(href, precedence, options) {
        previousDispatcher.S(href, precedence, options);
        var ownerDocument = globalDocument;
        if (ownerDocument && href) {
          var styles = getResourcesFromRoot(ownerDocument).hoistableStyles, key = getStyleKey(href);
          precedence = precedence || "default";
          var resource = styles.get(key);
          if (!resource) {
            var state = { loading: NotLoaded, preload: null };
            if (resource = ownerDocument.querySelector(getStylesheetSelectorFromKey(key)))
              state.loading = Loaded | Inserted;
            else {
              href = assign({
                rel: "stylesheet",
                href,
                "data-precedence": precedence
              }, options);
              (options = preloadPropsMap.get(key)) && adoptPreloadPropsForStylesheet(href, options);
              var link = resource = ownerDocument.createElement("link");
              markNodeAsHoistable(link);
              setInitialProperties(link, "link", href);
              link._p = new Promise(function(resolve, reject) {
                link.onload = resolve;
                link.onerror = reject;
              });
              link.addEventListener("load", function() {
                state.loading |= Loaded;
              });
              link.addEventListener("error", function() {
                state.loading |= Errored;
              });
              state.loading |= Inserted;
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
      },
      M: function(src, options) {
        previousDispatcher.M(src, options);
        var ownerDocument = globalDocument;
        if (ownerDocument && src) {
          var scripts = getResourcesFromRoot(ownerDocument).hoistableScripts, key = getScriptKey(src), resource = scripts.get(key);
          resource || (resource = ownerDocument.querySelector(getScriptSelectorFromKey(key)), resource || (src = assign({ src, async: true, type: "module" }, options), (options = preloadPropsMap.get(key)) && adoptPreloadPropsForScript(src, options), resource = ownerDocument.createElement("script"), markNodeAsHoistable(resource), setInitialProperties(resource, "link", src), ownerDocument.head.appendChild(resource)), resource = {
            type: "script",
            instance: resource,
            count: 1,
            state: null
          }, scripts.set(key, resource));
        }
      }
    };
    var globalDocument = typeof document === "undefined" ? null : document, tagCaches = null, SUSPENSEY_STYLESHEET_TIMEOUT = 60000, SUSPENSEY_IMAGE_TIMEOUT = 800, SUSPENSEY_IMAGE_TIME_ESTIMATE = 500, estimatedBytesWithinLimit = 0, LAST_PRECEDENCE = null, precedencesByRoot = null, NotPendingTransition = NotPending, HostTransitionContext = {
      $$typeof: REACT_CONTEXT_TYPE,
      Provider: null,
      Consumer: null,
      _currentValue: NotPendingTransition,
      _currentValue2: NotPendingTransition,
      _threadCount: 0
    }, badgeFormat = "%c%s%c", badgeStyle = "background: #e6e6e6;background: light-dark(rgba(0,0,0,0.1), rgba(255,255,255,0.25));color: #000000;color: light-dark(#000000, #ffffff);border-radius: 2px", resetStyle = "", pad = " ", bind = Function.prototype.bind;
    var didWarnAboutNestedUpdates = false;
    var overrideHookState = null, overrideHookStateDeletePath = null, overrideHookStateRenamePath = null, overrideProps = null, overridePropsDeletePath = null, overridePropsRenamePath = null, scheduleUpdate = null, scheduleRetry = null, setErrorHandler = null, setSuspenseHandler = null;
    overrideHookState = function(fiber, id, path, value) {
      id = findHook(fiber, id);
      id !== null && (path = copyWithSetImpl(id.memoizedState, path, 0, value), id.memoizedState = path, id.baseState = path, fiber.memoizedProps = assign({}, fiber.memoizedProps), path = enqueueConcurrentRenderForLane(fiber, 2), path !== null && scheduleUpdateOnFiber(path, fiber, 2));
    };
    overrideHookStateDeletePath = function(fiber, id, path) {
      id = findHook(fiber, id);
      id !== null && (path = copyWithDeleteImpl(id.memoizedState, path, 0), id.memoizedState = path, id.baseState = path, fiber.memoizedProps = assign({}, fiber.memoizedProps), path = enqueueConcurrentRenderForLane(fiber, 2), path !== null && scheduleUpdateOnFiber(path, fiber, 2));
    };
    overrideHookStateRenamePath = function(fiber, id, oldPath, newPath) {
      id = findHook(fiber, id);
      id !== null && (oldPath = copyWithRename(id.memoizedState, oldPath, newPath), id.memoizedState = oldPath, id.baseState = oldPath, fiber.memoizedProps = assign({}, fiber.memoizedProps), oldPath = enqueueConcurrentRenderForLane(fiber, 2), oldPath !== null && scheduleUpdateOnFiber(oldPath, fiber, 2));
    };
    overrideProps = function(fiber, path, value) {
      fiber.pendingProps = copyWithSetImpl(fiber.memoizedProps, path, 0, value);
      fiber.alternate && (fiber.alternate.pendingProps = fiber.pendingProps);
      path = enqueueConcurrentRenderForLane(fiber, 2);
      path !== null && scheduleUpdateOnFiber(path, fiber, 2);
    };
    overridePropsDeletePath = function(fiber, path) {
      fiber.pendingProps = copyWithDeleteImpl(fiber.memoizedProps, path, 0);
      fiber.alternate && (fiber.alternate.pendingProps = fiber.pendingProps);
      path = enqueueConcurrentRenderForLane(fiber, 2);
      path !== null && scheduleUpdateOnFiber(path, fiber, 2);
    };
    overridePropsRenamePath = function(fiber, oldPath, newPath) {
      fiber.pendingProps = copyWithRename(fiber.memoizedProps, oldPath, newPath);
      fiber.alternate && (fiber.alternate.pendingProps = fiber.pendingProps);
      oldPath = enqueueConcurrentRenderForLane(fiber, 2);
      oldPath !== null && scheduleUpdateOnFiber(oldPath, fiber, 2);
    };
    scheduleUpdate = function(fiber) {
      var root2 = enqueueConcurrentRenderForLane(fiber, 2);
      root2 !== null && scheduleUpdateOnFiber(root2, fiber, 2);
    };
    scheduleRetry = function(fiber) {
      var lane = claimNextRetryLane(), root2 = enqueueConcurrentRenderForLane(fiber, lane);
      root2 !== null && scheduleUpdateOnFiber(root2, fiber, lane);
    };
    setErrorHandler = function(newShouldErrorImpl) {
      shouldErrorImpl = newShouldErrorImpl;
    };
    setSuspenseHandler = function(newShouldSuspendImpl) {
      shouldSuspendImpl = newShouldSuspendImpl;
    };
    var _enabled = true, return_targetInst = null, hasScheduledReplayAttempt = false, queuedFocus = null, queuedDrag = null, queuedMouse = null, queuedPointers = new Map, queuedPointerCaptures = new Map, queuedExplicitHydrationTargets = [], discreteReplayableEvents = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" "), lastScheduledReplayQueue = null;
    ReactDOMHydrationRoot.prototype.render = ReactDOMRoot.prototype.render = function(children) {
      var root2 = this._internalRoot;
      if (root2 === null)
        throw Error("Cannot update an unmounted root.");
      var args = arguments;
      typeof args[1] === "function" ? console.error("does not support the second callback argument. To execute a side effect after rendering, declare it in a component body with useEffect().") : isValidContainer(args[1]) ? console.error("You passed a container to the second argument of root.render(...). You don't need to pass it again since you already passed it to create the root.") : typeof args[1] !== "undefined" && console.error("You passed a second argument to root.render(...) but it only accepts one argument.");
      args = children;
      var current2 = root2.current, lane = requestUpdateLane(current2);
      updateContainerImpl(current2, lane, args, root2, null, null);
    };
    ReactDOMHydrationRoot.prototype.unmount = ReactDOMRoot.prototype.unmount = function() {
      var args = arguments;
      typeof args[0] === "function" && console.error("does not support a callback argument. To execute a side effect after rendering, declare it in a component body with useEffect().");
      args = this._internalRoot;
      if (args !== null) {
        this._internalRoot = null;
        var container = args.containerInfo;
        (executionContext & (RenderContext | CommitContext)) !== NoContext && console.error("Attempted to synchronously unmount a root while React was already rendering. React cannot finish unmounting the root until the current render has completed, which may lead to a race condition.");
        updateContainerImpl(args.current, 2, null, args, null, null);
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
    (function() {
      var isomorphicReactPackageVersion = React.version;
      if (isomorphicReactPackageVersion !== "19.2.4")
        throw Error(`Incompatible React versions: The "react" and "react-dom" packages must have the exact same version. Instead got:
  - react:      ` + (isomorphicReactPackageVersion + `
  - react-dom:  19.2.4
Learn more: https://react.dev/warnings/version-mismatch`));
    })();
    typeof Map === "function" && Map.prototype != null && typeof Map.prototype.forEach === "function" && typeof Set === "function" && Set.prototype != null && typeof Set.prototype.clear === "function" && typeof Set.prototype.forEach === "function" || console.error("React depends on Map and Set built-in types. Make sure that you load a polyfill in older browsers. https://react.dev/link/react-polyfills");
    ReactDOMSharedInternals.findDOMNode = function(componentOrElement) {
      var fiber = componentOrElement._reactInternals;
      if (fiber === undefined) {
        if (typeof componentOrElement.render === "function")
          throw Error("Unable to find node on an unmounted component.");
        componentOrElement = Object.keys(componentOrElement).join(",");
        throw Error("Argument appears to not be a ReactComponent. Keys: " + componentOrElement);
      }
      componentOrElement = findCurrentFiberUsingSlowPath(fiber);
      componentOrElement = componentOrElement !== null ? findCurrentHostFiberImpl(componentOrElement) : null;
      componentOrElement = componentOrElement === null ? null : componentOrElement.stateNode;
      return componentOrElement;
    };
    if (!function() {
      var internals = {
        bundleType: 1,
        version: "19.2.4",
        rendererPackageName: "react-dom",
        currentDispatcherRef: ReactSharedInternals,
        reconcilerVersion: "19.2.4"
      };
      internals.overrideHookState = overrideHookState;
      internals.overrideHookStateDeletePath = overrideHookStateDeletePath;
      internals.overrideHookStateRenamePath = overrideHookStateRenamePath;
      internals.overrideProps = overrideProps;
      internals.overridePropsDeletePath = overridePropsDeletePath;
      internals.overridePropsRenamePath = overridePropsRenamePath;
      internals.scheduleUpdate = scheduleUpdate;
      internals.scheduleRetry = scheduleRetry;
      internals.setErrorHandler = setErrorHandler;
      internals.setSuspenseHandler = setSuspenseHandler;
      internals.scheduleRefresh = scheduleRefresh;
      internals.scheduleRoot = scheduleRoot;
      internals.setRefreshHandler = setRefreshHandler;
      internals.getCurrentFiber = getCurrentFiberForDevTools;
      return injectInternals(internals);
    }() && canUseDOM && window.top === window.self && (-1 < navigator.userAgent.indexOf("Chrome") && navigator.userAgent.indexOf("Edge") === -1 || -1 < navigator.userAgent.indexOf("Firefox"))) {
      var protocol = window.location.protocol;
      /^(https?|file):$/.test(protocol) && console.info("%cDownload the React DevTools for a better development experience: https://react.dev/link/react-devtools" + (protocol === "file:" ? `
You might need to use a local HTTP server (instead of file://): https://react.dev/link/react-devtools-faq` : ""), "font-weight:bold");
    }
    exports.createRoot = function(container, options) {
      if (!isValidContainer(container))
        throw Error("Target container is not a DOM element.");
      warnIfReactDOMContainerInDEV(container);
      var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError;
      options !== null && options !== undefined && (options.hydrate ? console.warn("hydrate through createRoot is deprecated. Use ReactDOMClient.hydrateRoot(container, <App />) instead.") : typeof options === "object" && options !== null && options.$$typeof === REACT_ELEMENT_TYPE && console.error(`You passed a JSX element to createRoot. You probably meant to call root.render instead. Example usage:

  let root = createRoot(domContainer);
  root.render(<App />);`), options.unstable_strictMode === true && (isStrictMode = true), options.identifierPrefix !== undefined && (identifierPrefix = options.identifierPrefix), options.onUncaughtError !== undefined && (onUncaughtError = options.onUncaughtError), options.onCaughtError !== undefined && (onCaughtError = options.onCaughtError), options.onRecoverableError !== undefined && (onRecoverableError = options.onRecoverableError));
      options = createFiberRoot(container, 1, false, null, null, isStrictMode, identifierPrefix, null, onUncaughtError, onCaughtError, onRecoverableError, defaultOnDefaultTransitionIndicator);
      container[internalContainerInstanceKey] = options.current;
      listenToAllSupportedEvents(container);
      return new ReactDOMRoot(options);
    };
    exports.hydrateRoot = function(container, initialChildren, options) {
      if (!isValidContainer(container))
        throw Error("Target container is not a DOM element.");
      warnIfReactDOMContainerInDEV(container);
      initialChildren === undefined && console.error("Must provide initial children as second argument to hydrateRoot. Example usage: hydrateRoot(domContainer, <App />)");
      var isStrictMode = false, identifierPrefix = "", onUncaughtError = defaultOnUncaughtError, onCaughtError = defaultOnCaughtError, onRecoverableError = defaultOnRecoverableError, formState = null;
      options !== null && options !== undefined && (options.unstable_strictMode === true && (isStrictMode = true), options.identifierPrefix !== undefined && (identifierPrefix = options.identifierPrefix), options.onUncaughtError !== undefined && (onUncaughtError = options.onUncaughtError), options.onCaughtError !== undefined && (onCaughtError = options.onCaughtError), options.onRecoverableError !== undefined && (onRecoverableError = options.onRecoverableError), options.formState !== undefined && (formState = options.formState));
      initialChildren = createFiberRoot(container, 1, true, initialChildren, options != null ? options : null, isStrictMode, identifierPrefix, formState, onUncaughtError, onCaughtError, onRecoverableError, defaultOnDefaultTransitionIndicator);
      initialChildren.context = getContextForSubtree(null);
      options = initialChildren.current;
      isStrictMode = requestUpdateLane(options);
      isStrictMode = getBumpedLaneForHydrationByLane(isStrictMode);
      identifierPrefix = createUpdate(isStrictMode);
      identifierPrefix.callback = null;
      enqueueUpdate(options, identifierPrefix, isStrictMode);
      startUpdateTimerByLane(isStrictMode, "hydrateRoot()", null);
      options = isStrictMode;
      initialChildren.current.lanes = options;
      markRootUpdated$1(initialChildren, options);
      ensureRootIsScheduled(initialChildren);
      container[internalContainerInstanceKey] = initialChildren.current;
      listenToAllSupportedEvents(container);
      return new ReactDOMHydrationRoot(initialChildren);
    };
    exports.version = "19.2.4";
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop === "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })();
});

// node_modules/react-dom/client.js
var require_client = __commonJS((exports, module) => {
  var react_dom_client_development = __toESM(require_react_dom_client_development());
  if (false) {} else {
    module.exports = react_dom_client_development;
  }
});
export default require_client();
