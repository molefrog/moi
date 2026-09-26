// Evaluated in the browser bundle only. All state and React contexts remain
// in the host feature, shared by every applet and revoked with its bridge.
export const COLLAB_MODULE_SOURCE = `
import { createElement } from 'react';
import { __getBridge } from 'moi';
const empty = () => [];
const nothing = () => null;
const fallback = {
  useMe: nothing,
  useUser: nothing,
  usePeers: empty,
  useWorkspaceUsers: empty,
  usePresence: empty,
  usePublishPresence() {},
  Cursors: nothing,
  Activity: nothing,
  Selection: nothing,
  User: nothing,
  Facepile: nothing,
  PresenceFrame: nothing,
  PresenceGroup: nothing,
  PresenceGutter: nothing,
};
let warned = false;
function api() {
  const collab = __getBridge()?.collab;
  if (collab) return collab;
  if (!warned) {
    warned = true;
    console.warn('[moi/collab] Collaboration API is unavailable. Hooks return empty values and components render nothing.');
  }
  return fallback;
}
export function useMe(...args) { return api().useMe(...args); }
export function usePeers(...args) { return api().usePeers(...args); }
export function useUser(...args) { return api().useUser(...args); }
export function useWorkspaceUsers(...args) { return api().useWorkspaceUsers(...args); }
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
