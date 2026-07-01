var __defProp = Object.defineProperty;
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

// node_modules/react/cjs/react-jsx-runtime.production.js
var exports_react_jsx_runtime_production = {};
__export(exports_react_jsx_runtime_production, {
  jsxs: () => $jsxs,
  jsx: () => $jsx,
  Fragment: () => $Fragment
});
function jsxProd(type, config, maybeKey) {
  var key = null;
  maybeKey !== undefined && (key = "" + maybeKey);
  config.key !== undefined && (key = "" + config.key);
  if ("key" in config) {
    maybeKey = {};
    for (var propName in config)
      propName !== "key" && (maybeKey[propName] = config[propName]);
  } else
    maybeKey = config;
  config = maybeKey.ref;
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type,
    key,
    ref: config !== undefined ? config : null,
    props: maybeKey
  };
}
var REACT_ELEMENT_TYPE, REACT_FRAGMENT_TYPE, $Fragment, $jsx, $jsxs;
var init_react_jsx_runtime_production = __esm(() => {
  REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element");
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
  $Fragment = REACT_FRAGMENT_TYPE;
  $jsx = jsxProd;
  $jsxs = jsxProd;
});

// node_modules/react/jsx-runtime.js
var require_jsx_runtime = __commonJS((exports, module) => {
  init_react_jsx_runtime_production();
  if (true) {
    module.exports = exports_react_jsx_runtime_production;
  } else {}
});
export default require_jsx_runtime();
