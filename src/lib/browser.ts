// Single import point for the cross-browser extension API. Chrome exposes
// `chrome.*` (and a partial `browser.*` only in newer versions); Firefox exposes
// a promise-based `browser.*`. The webextension-polyfill normalises both to the
// promise-based `browser.*` shape so the rest of the code never branches on the
// host browser. See CLAUDE.md: "Use `chrome.*` only behind a thin polyfill".
import browser from "webextension-polyfill";

export default browser;
