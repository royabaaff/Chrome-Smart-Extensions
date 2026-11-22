// Smart RAM Saver — background service worker.
//
// v2.2 changes:
// - Settings are cached in memory (loaded once on startup/install, kept in
//   sync via storage.onChanged) instead of being re-read from storage on
//   every tab event.
// - The toolbar icon now reflects only the global on/off state. The old
//   per-tab icon mixed two meanings (global state + per-domain exclusion),
//   and the active tab showed ON even though it can never be discarded.
//   Exclusion state for the current site is shown clearly in the popup.
// - Auto-discard no longer depends only on tab.lastAccessed (which Chrome
//   may not provide). The worker tracks when each tab became inactive, so
//   the timeout works even when lastAccessed is missing.

const ICON_PATHS = {
  on: { 16: "ON-16.png", 32: "ON-32.png", 48: "ON-48.png", 128: "ON-128.png" },
  off: { 16: "OFF-16.png", 32: "OFF-32.png", 48: "OFF-48.png", 128: "OFF-128.png" }
};

const DEFAULT_TIMEOUT_MINUTES = 5;

// In-memory settings cache. Loaded on startup/install; updated on change.
const settings = {
  autoDiscardActive: true,
  discardTimeout: DEFAULT_TIMEOUT_MINUTES,
  ramAutoDomains: []
};

// When each tab last stopped being the active tab (ms since epoch).
// Used as the "last used" time when tab.lastAccessed is unavailable.
const inactiveSince = new Map();
// The currently active tab id (per window is overkill; one global active tab
// is enough to know when a tab stops being active).
let activeTabId = null;

function reportApiError(operation) {
  if (chrome.runtime.lastError) {
    console.error(`${operation}: ${chrome.runtime.lastError.message}`);
    return true;
  }
  return false;
}

function hostnameForUrl(urlString) {
  if (!urlString) return "";

  try {
    const url = new URL(urlString);
    return url.protocol === "http:" || url.protocol === "https:" ? url.hostname : "";
  } catch {
    return "";
  }
}

async function loadSettings() {
  const data = await chrome.storage.local.get(["autoDiscardActive", "discardTimeout", "ramAutoDomains"]);
  settings.autoDiscardActive = data.autoDiscardActive !== false;
  settings.discardTimeout = Number.isFinite(data.discardTimeout)
    ? Math.min(120, Math.max(1, data.discardTimeout))
    : DEFAULT_TIMEOUT_MINUTES;
  settings.ramAutoDomains = Array.isArray(data.ramAutoDomains) ? data.ramAutoDomains : [];
}

function refreshIcon() {
  chrome.action.setIcon(
    { path: settings.autoDiscardActive ? ICON_PATHS.on : ICON_PATHS.off },
    () => reportApiError("Setting extension icon")
  );
}

// The most reliable "last used" time for a tab: the later of Chrome's
// lastAccessed and the moment we saw it stop being active. Returns null
// when neither is known, in which case the tab is never auto-discarded.
function effectiveLastUsed(tab) {
  const candidates = [];
  if (Number.isFinite(tab.lastAccessed) && tab.lastAccessed > 0) candidates.push(tab.lastAccessed);
  const inactiveAt = inactiveSince.get(tab.id);
  if (Number.isFinite(inactiveAt) && inactiveAt > 0) candidates.push(inactiveAt);
  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

function discardEligibleTabs(tabs, timeoutMilliseconds) {
  const now = Date.now();
  return tabs.filter((tab) => {
    if (!Number.isInteger(tab.id) || tab.discarded || tab.active || tab.audible || tab.pinned) return false;

    const hostname = hostnameForUrl(tab.url);
    if (!hostname || settings.ramAutoDomains.includes(hostname)) return false;

    if (timeoutMilliseconds === null) return true; // "Discard now": no timeout.
    const lastUsed = effectiveLastUsed(tab);
    if (lastUsed === null) return false; // No reliable time: never auto-discard.
    return now - lastUsed >= timeoutMilliseconds;
  });
}

function discardTabs(tabs, sendResponse) {
  if (tabs.length === 0) {
    sendResponse({ discarded: 0 });
    return;
  }

  let finished = 0;
  let discarded = 0;
  tabs.forEach((tab) => {
    chrome.tabs.discard(tab.id, () => {
      if (!reportApiError(`Discarding tab ${tab.id}`)) discarded += 1;
      finished += 1;
      if (finished === tabs.length) sendResponse({ discarded });
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await loadSettings();
  chrome.alarms.create("checkTabsMemory", { periodInMinutes: 1 });
  refreshIcon();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadSettings();
  chrome.alarms.create("checkTabsMemory", { periodInMinutes: 1 });
  refreshIcon();
  // Seed "became inactive" for tabs that were already open: without a
  // record they would never be auto-discarded when lastAccessed is missing.
  chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
    if (reportApiError("Seeding inactive times")) return;
    const now = Date.now();
    tabs.forEach((tab) => {
      if (Number.isInteger(tab.id) && !inactiveSince.has(tab.id)) inactiveSince.set(tab.id, now);
    });
  });
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "local") return;
  if (changes.autoDiscardActive !== undefined) {
    settings.autoDiscardActive = changes.autoDiscardActive.newValue !== false;
    refreshIcon();
  }
  if (changes.discardTimeout !== undefined && Number.isFinite(changes.discardTimeout.newValue)) {
    settings.discardTimeout = Math.min(120, Math.max(1, changes.discardTimeout.newValue));
  }
  if (changes.ramAutoDomains !== undefined) {
    settings.ramAutoDomains = Array.isArray(changes.ramAutoDomains.newValue)
      ? changes.ramAutoDomains.newValue
      : [];
  }
});

// Track when a tab stops being active, so auto-discard works even without
// tab.lastAccessed.
chrome.tabs.onActivated.addListener((activeInfo) => {
  const now = Date.now();
  if (Number.isInteger(activeTabId) && activeTabId !== activeInfo.tabId) {
    inactiveSince.set(activeTabId, now);
  }
  activeTabId = activeInfo.tabId;
  inactiveSince.delete(activeInfo.tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  inactiveSince.delete(tabId);
  if (activeTabId === tabId) activeTabId = null;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "DISCARD_ALL_NOW") return;

  chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
    if (reportApiError("Reading tabs to discard")) {
      sendResponse({ discarded: 0, error: true });
      return;
    }
    discardTabs(discardEligibleTabs(tabs, null), sendResponse);
  });
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "checkTabsMemory" || settings.autoDiscardActive === false) return;

  chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
    if (reportApiError("Reading tabs for automatic discard")) return;
    discardEligibleTabs(tabs, settings.discardTimeout * 60 * 1000)
      .forEach((tab) => chrome.tabs.discard(tab.id, () => reportApiError(`Discarding tab ${tab.id}`)));
  });
});

// Load settings and set the icon when the worker wakes.
loadSettings().then(refreshIcon);
