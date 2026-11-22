// Smart RTL Fixer — background service worker.
//
// v2.3 changes:
// - The manual toggle now persists per site (manualDomains in storage), so
//   RTL survives a page reload. Previously a reload cleared it because
//   checkAndApplyRTL removed RTL whenever the host was not in autoDomains.
// - Manual and auto are both additive "on" lists: RTL applies when the host
//   matches either one, so the two toggles can no longer fight each other.
// - The background owns all storage writes for the domain lists. The popup
//   only sends messages (no more double read-modify-write of autoDomains).
// - injectRTL/removeRTL are idempotent: inject checks data-rtl-active first
//   (with a per-tab in-flight guard), so the CSS is never stacked by
//   repeated onUpdated/onActivated calls.
// - The popup and the background now share one domain matcher (www. and
//   subdomains), so the popup can no longer show "auto off" for a host the
//   background treats as auto-on.

const FONT_FAMILIES = {
  vazirmatn: "'Vazirmatn', 'Yekan Bakh', Tahoma, sans-serif",
  tahoma: "Tahoma, sans-serif",
  system: "system-ui, sans-serif"
};

function getFontFamily(key) {
  return Object.prototype.hasOwnProperty.call(FONT_FAMILIES, key)
    ? FONT_FAMILIES[key]
    : FONT_FAMILIES.vazirmatn;
}

function normalizeHost(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

// True when hostname matches any entry in the list (exact host, or a
// subdomain of a listed host, or a listed host that is a subdomain of it).
function domainMatches(hostname, domains) {
  const h = normalizeHost(hostname);
  if (!h) return false;
  return (Array.isArray(domains) ? domains : []).some((domain) => {
    if (typeof domain !== "string" || !domain) return false;
    const d = normalizeHost(domain);
    return h === d || h.endsWith("." + d) || d.endsWith("." + h);
  });
}

// Add or remove hostname from a domain list (normalized, one entry per
// domain family). Adding a host already covered by a broader entry is a
// no-op (the broader entry stays); adding a broader host drops the
// subdomain entries it now covers. Returns the new list.
function toggleDomainList(list, hostname, turnOn) {
  const h = normalizeHost(hostname);
  const normalized = (Array.isArray(list) ? list : [])
    .map((domain) => normalizeHost(domain))
    .filter(Boolean);
  if (!h) return normalized;
  if (turnOn) {
    // Already covered by an existing entry (exact or parent)? Keep as-is.
    if (normalized.some((d) => h === d || h.endsWith("." + d))) return normalized;
    // A broader host covers existing subdomain entries: drop them.
    const filtered = normalized.filter((d) => !d.endsWith("." + h));
    filtered.push(h);
    return filtered;
  }
  // Turn off: drop the entry and anything it covers / that covers it.
  return normalized.filter((d) => {
    if (d === h) return false;
    if (h.endsWith("." + d)) return false; // d covers h
    if (d.endsWith("." + h)) return false; // h covers d
    return true;
  });
}

function isSupportedPage(urlString) {
  try {
    const url = new URL(urlString);
    const isWebPage = url.protocol === "http:" || url.protocol === "https:";
    const isChromeWebStore = url.hostname === "chromewebstore.google.com" ||
      (url.hostname === "chrome.google.com" && url.pathname.startsWith("/webstore"));
    return isWebPage && !isChromeWebStore;
  } catch (error) {
    console.warn("Unable to parse tab URL.", error);
    return false;
  }
}

async function getDomainLists() {
  const data = await chrome.storage.local.get(["autoDomains", "manualDomains"]);
  return {
    auto: Array.isArray(data.autoDomains) ? data.autoDomains : [],
    manual: Array.isArray(data.manualDomains) ? data.manualDomains : []
  };
}

async function isRtlActive(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.hasAttribute("data-rtl-active")
    });
    return !!(results && results[0] && results[0].result);
  } catch {
    return false;
  }
}

async function getFontSettings() {
  const data = await chrome.storage.local.get(["customFontSize", "fontFamily"]);
  const size = Number.isInteger(data.customFontSize) && data.customFontSize >= 10 && data.customFontSize <= 36
    ? data.customFontSize
    : 16;
  return { size, fontFamily: getFontFamily(data.fontFamily) };
}

async function applyFontSettings(tabId, activate = false) {
  const { size, fontFamily } = await getFontSettings();
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (fontSize, pageFontFamily, doActivate) => {
        if (doActivate) document.documentElement.setAttribute("data-rtl-active", "true");
        if (document.documentElement.hasAttribute("data-rtl-active")) {
          document.documentElement.style.setProperty("--rtl-custom-font-size", fontSize + "px");
          document.documentElement.style.setProperty("--rtl-font-family", pageFontFamily);
          document.documentElement.style.setProperty("--rtl-code-font-size", Math.max(10, fontSize - 2) + "px");
        }
      },
      args: [size, fontFamily, activate]
    });
  } catch (error) {
    console.warn("Unable to apply font settings.", error);
  }
}

function setIcon(tabId, on) {
  chrome.action.setIcon({
    path: on
      ? { 16: "ON-16.png", 32: "ON-32.png" }
      : { 16: "OFF-16.png", 32: "OFF-32.png" },
    tabId
  }).catch((error) => console.warn("Unable to set the icon.", error));
}

// Tabs currently being (re)injected, so concurrent onUpdated/onActivated
// calls cannot stack the CSS.
const injectingTabs = new Set();

async function injectRTL(tabId) {
  if (injectingTabs.has(tabId)) return;
  if (await isRtlActive(tabId)) {
    await applyFontSettings(tabId);
    setIcon(tabId, true);
    return;
  }
  injectingTabs.add(tabId);
  try {
    try {
      await chrome.scripting.insertCSS({ target: { tabId }, files: ["rtl-style.css"] });
    } catch (error) {
      console.warn("Unable to add RTL styles.", error);
    }
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    } catch (error) {
      console.warn("Unable to initialize RTL content.", error);
    }
    await applyFontSettings(tabId, true);
    setIcon(tabId, true);
  } finally {
    injectingTabs.delete(tabId);
  }
}

async function removeRTL(tabId) {
  if (!(await isRtlActive(tabId))) {
    setIcon(tabId, false);
    return;
  }
  try {
    await chrome.scripting.removeCSS({ target: { tabId }, files: ["rtl-style.css"] });
  } catch (error) {
    console.warn("Unable to remove RTL styles.", error);
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.documentElement.removeAttribute("data-rtl-active");
        document.documentElement.style.removeProperty("--rtl-custom-font-size");
        document.documentElement.style.removeProperty("--rtl-font-family");
        document.documentElement.style.removeProperty("--rtl-code-font-size");
      }
    });
  } catch (error) {
    console.warn("Unable to remove RTL from the page.", error);
  }
  setIcon(tabId, false);
}

async function checkAndApplyRTL(tabId, urlString) {
  if (!isSupportedPage(urlString)) return;
  const hostname = new URL(urlString).hostname;
  const { auto, manual } = await getDomainLists();
  if (domainMatches(hostname, auto) || domainMatches(hostname, manual)) {
    await injectRTL(tabId);
  } else {
    await removeRTL(tabId);
  }
}

// Re-apply RTL whenever a page finishes loading or the user switches tabs.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    checkAndApplyRTL(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && tab.url) checkAndApplyRTL(tab.id, tab.url);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === "GET_STATE") {
      const hostname = request.hostname || "";
      const { auto, manual } = await getDomainLists();
      const { size, fontFamily } = await getFontSettings();
      const data = await chrome.storage.local.get(["fontFamily"]);
      sendResponse({
        rtlActive: Number.isInteger(request.tabId) ? await isRtlActive(request.tabId) : false,
        manualActive: domainMatches(hostname, manual),
        autoActive: domainMatches(hostname, auto),
        fontSize: size,
        fontFamily: typeof data.fontFamily === "string" ? data.fontFamily : "vazirmatn",
        manualDomains: manual,
        autoDomains: auto
      });
      return;
    }

    if (request.action === "TOGGLE_MANUAL") {
      const { hostname, tabId } = request;
      if (typeof hostname !== "string" || !hostname || !Number.isInteger(tabId)) return;
      const { manual } = await getDomainLists();
      const turnOn = !domainMatches(hostname, manual);
      await chrome.storage.local.set({ manualDomains: toggleDomainList(manual, hostname, turnOn) });
      if (turnOn) await injectRTL(tabId);
      else await checkAndApplyRTL(tabId, (await chrome.tabs.get(tabId)).url);
      sendResponse({ manualActive: turnOn });
      return;
    }

    if (request.action === "TOGGLE_DOMAIN_AUTO") {
      const { hostname, tabId } = request;
      if (typeof hostname !== "string" || !hostname || !Number.isInteger(tabId)) return;
      const { auto } = await getDomainLists();
      const turnOn = !domainMatches(hostname, auto);
      await chrome.storage.local.set({ autoDomains: toggleDomainList(auto, hostname, turnOn) });
      if (turnOn) await injectRTL(tabId);
      else await checkAndApplyRTL(tabId, (await chrome.tabs.get(tabId)).url);
      sendResponse({ autoActive: turnOn });
      return;
    }

    if (request.action === "REMOVE_DOMAIN") {
      const { hostname, kind, tabId } = request;
      if (typeof hostname !== "string" || !hostname) return;
      const { auto, manual } = await getDomainLists();
      if (kind === "auto") {
        await chrome.storage.local.set({ autoDomains: toggleDomainList(auto, hostname, false) });
      } else if (kind === "manual") {
        await chrome.storage.local.set({ manualDomains: toggleDomainList(manual, hostname, false) });
      } else {
        // No kind: clear the host from both lists.
        await chrome.storage.local.set({
          autoDomains: toggleDomainList(auto, hostname, false),
          manualDomains: toggleDomainList(manual, hostname, false)
        });
      }
      if (Number.isInteger(tabId)) {
        const tab = await chrome.tabs.get(tabId).catch(() => null);
        if (tab && tab.url) await checkAndApplyRTL(tabId, tab.url);
      }
      sendResponse({ removed: true });
      return;
    }

    if (request.action === "UPDATE_FONT_SIZE") {
      if (!Number.isInteger(request.tabId)) return;
      const tab = await chrome.tabs.get(request.tabId).catch(() => null);
      if (!tab || !isSupportedPage(tab.url)) return;
      const size = Number.isInteger(request.size) ? Math.min(36, Math.max(10, request.size)) : 16;
      const fontFamily = getFontFamily(request.fontFamily);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: request.tabId },
          func: (newSize, newFontFamily) => {
            if (document.documentElement.hasAttribute("data-rtl-active")) {
              document.documentElement.style.setProperty("--rtl-custom-font-size", newSize + "px");
              document.documentElement.style.setProperty("--rtl-font-family", newFontFamily);
              document.documentElement.style.setProperty("--rtl-code-font-size", Math.max(10, newSize - 2) + "px");
            }
          },
          args: [size, fontFamily]
        });
      } catch (error) {
        console.warn("Unable to update the page font size.", error);
      }
      sendResponse({ updated: true });
      return;
    }
  })().catch((error) => console.warn("Message handling failed.", error));
  return true;
});
