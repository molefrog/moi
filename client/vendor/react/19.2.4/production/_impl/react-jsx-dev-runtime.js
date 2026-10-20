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

// node_modules/react/cjs/react-jsx-dev-runtime.production.js
var exports_react_jsx_dev_runtime_production = {};
__export(exports_react_jsx_dev_runtime_production, {
  jsxDEV: () => $jsxDEV,
  Fragment: () => $Fragment
});
var REACT_FRAGMENT_TYPE, $Fragment, $jsxDEV = undefined;
var init_react_jsx_dev_runtime_production = __esm(() => {
  REACT_FRAGMENT_TYPE = Symbol.for("react.fragment");
  $Fragment = REACT_FRAGMENT_TYPE;
});

// node_modules/react/jsx-dev-runtime.js
var require_jsx_dev_runtime = __commonJS((exports, module) => {
  init_react_jsx_dev_runtime_production();
  if (true) {
    module.exports = exports_react_jsx_dev_runtime_production;
  } else {}
});
export default require_jsx_dev_runtime();
