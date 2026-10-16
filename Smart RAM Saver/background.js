const ICON_PATHS = {
  on: { 16: "ON-16.png", 32: "ON-32.png", 48: "ON-48.png", 128: "ON-128.png" },
  off: { 16: "OFF-16.png", 32: "OFF-32.png", 48: "OFF-48.png", 128: "OFF-128.png" }
};

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

function setIcon(isActive, tabId) {
  const options = { path: isActive ? ICON_PATHS.on : ICON_PATHS.off };
  if (Number.isInteger(tabId)) options.tabId = tabId;

  chrome.action.setIcon(options, () => reportApiError("Setting extension icon"));
}

function refreshIcons() {
  chrome.storage.local.get(["autoDiscardActive", "ramAutoDomains"], (settings) => {
    if (reportApiError("Reading icon settings")) return;

    const isActive = settings.autoDiscardActive !== false;
    const autoDomains = Array.isArray(settings.ramAutoDomains) ? settings.ramAutoDomains : [];
    setIcon(isActive);

    chrome.tabs.query({}, (tabs) => {
      if (reportApiError("Reading tabs for icon refresh")) return;

      tabs.forEach((tab) => {
        const hostname = hostnameForUrl(tab.url);
        if (!Number.isInteger(tab.id)) return;
        setIcon(isActive && (!hostname || !autoDomains.includes(hostname)), tab.id);
      });
    });
  });
}

function updateTabIcon(tabId, url) {
  const hostname = hostnameForUrl(url);
  chrome.storage.local.get(["autoDiscardActive", "ramAutoDomains"], (settings) => {
    if (reportApiError("Reading tab icon settings")) return;
    const isActive = settings.autoDiscardActive !== false;
    const autoDomains = Array.isArray(settings.ramAutoDomains) ? settings.ramAutoDomains : [];
    setIcon(isActive && (!hostname || !autoDomains.includes(hostname)), tabId);
  });
}

function discardEligibleTabs(tabs, autoDomains, timeoutMilliseconds) {
  const now = Date.now();
  return tabs.filter((tab) => {
    if (!Number.isInteger(tab.id) || tab.discarded || tab.active || tab.audible || tab.pinned) return false;

    const hostname = hostnameForUrl(tab.url);
    if (!hostname || autoDomains.includes(hostname)) return false;

    return timeoutMilliseconds === null ||
      now - (tab.lastAccessed || now) >= timeoutMilliseconds;
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

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("checkTabsMemory", { periodInMinutes: 1 });
  refreshIcons();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("checkTabsMemory", { periodInMinutes: 1 });
  refreshIcons();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" &&
      (changes.autoDiscardActive !== undefined || changes.ramAutoDomains !== undefined)) {
    refreshIcons();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") updateTabIcon(tabId, tab.url);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (reportApiError("Reading activated tab")) return;
    updateTabIcon(tab.id, tab.url);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "DISCARD_ALL_NOW") return;

  chrome.storage.local.get(["ramAutoDomains"], (settings) => {
    if (reportApiError("Reading domain exclusions")) {
      sendResponse({ discarded: 0, error: true });
      return;
    }

    const autoDomains = Array.isArray(settings.ramAutoDomains) ? settings.ramAutoDomains : [];
    chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
      if (reportApiError("Reading tabs to discard")) {
        sendResponse({ discarded: 0, error: true });
        return;
      }
      discardTabs(discardEligibleTabs(tabs, autoDomains, null), sendResponse);
    });
  });
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "checkTabsMemory") return;

  chrome.storage.local.get(["autoDiscardActive", "discardTimeout", "ramAutoDomains"], (settings) => {
    if (reportApiError("Reading discard settings") || settings.autoDiscardActive === false) return;

    const timeoutMinutes = Number.isFinite(settings.discardTimeout)
      ? Math.min(120, Math.max(1, settings.discardTimeout))
      : 5;
    const autoDomains = Array.isArray(settings.ramAutoDomains) ? settings.ramAutoDomains : [];
    chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
      if (reportApiError("Reading tabs for automatic discard")) return;
      discardEligibleTabs(tabs, autoDomains, timeoutMinutes * 60 * 1000)
        .forEach((tab) => chrome.tabs.discard(tab.id, () => reportApiError(`Discarding tab ${tab.id}`)));
    });
  });
});

refreshIcons();