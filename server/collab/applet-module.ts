// Evaluated in the browser bundle only. All state and React contexts remain
// in the host feature, shared by every applet and revoked with its bridge.
export const COLLAB_MODULE_SOURCE = `
import { createElement } from 'react';
import { __getBridge } from 'moi';
function api() {
  const collab = __getBridge()?.collab;
  if (!collab) throw new Error('This applet is not connected to moi. Reload it if its build was disposed.');
  return collab;
}
export function useMe(...args) { return api().useMe(...args); }
export function usePeers(...args) { return api().usePeers(...args); }
export function useUser(...args) { return api().useUser(...args); }
export function usePresence(...args) { return api().usePresence(...args); }
export function usePublishPresence(...args) { return api().usePublishPresence(...args); }
export function Cursors(props) { return createElement(api().Cursors, props); }
export function Activity(props) { return createElement(api().Activity, props); }
export function Selection(props) { return createElement(api().Selection, props); }
export function User(props) { return createElement(api().User, props); }
export function Facepile(props) { return createElement(api().Facepile, props); }
export function PresenceFrame(props) { return createElement(api().PresenceFrame, props); }
export function PresenceGroup(props) { return createElement(api().PresenceGroup, props); }
export function PresenceGutter(props) { return createElement(api().PresenceGutter, props); }
`
