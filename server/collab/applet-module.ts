// Evaluated in the browser bundle only. All state and React contexts remain
// in the host feature, shared by every applet and revoked with its bridge.
export const COLLAB_MODULE_SOURCE = `
import { createElement } from 'react';
import { __getBridge } from 'moi';
function api() {
  const collab = __getBridge()?.collab;
  if (!collab) throw new Error('Start moi with --experimental-collab to use collab, or reload this applet if its build was disposed.');
  return collab;
}
export function useSelf(...args) { return api().useSelf(...args); }
export function useOthers(...args) { return api().useOthers(...args); }
export function usePresence(...args) { return api().usePresence(...args); }
export function useSharedState(...args) { return api().useSharedState(...args); }
export function useSharedStore(...args) { return api().useSharedStore(...args); }
export function Cursors(props) { return createElement(api().Cursors, props); }
export function Activity(props) { return createElement(api().Activity, props); }
export function PresenceField(props) { return createElement(api().PresenceField, props); }
export function Selection(props) { return createElement(api().Selection, props); }
export function SyncStatus(props) { return createElement(api().SyncStatus, props); }
`
