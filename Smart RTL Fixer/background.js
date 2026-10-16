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

// بررسی و اعمال خودکار وضعیت هنگام بارگذاری کامل تب
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (!isSupportedPage(tab.url)) {
      return;
    }
    checkAndApplyRTL(tabId, tab.url, true);
  }
});

// مدیریت کلیک روی تب‌ها یا جابجایی بین آن‌ها
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab && isSupportedPage(tab.url)) {
      checkAndApplyRTL(tab.id, tab.url);
    }
  });
});

// گوش دادن به پیام‌های پاپ‌آپ
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_DOMAIN_AUTO") {
    const { hostname, state, tabId } = request;
    if (typeof hostname !== 'string' || !hostname || typeof state !== 'boolean' || !Number.isInteger(tabId)) return;

    chrome.storage.local.get(['autoDomains'], (data) => {
      let domains = Array.isArray(data.autoDomains) ? data.autoDomains : [];

      if (state && !domains.includes(hostname)) {
        domains.push(hostname);
      } else if (!state) {
        domains = domains.filter(d => d !== hostname);
      }

      chrome.storage.local.set({ autoDomains: domains }, () => {
        if (state) {
          injectRTL(tabId);
        } else {
          removeRTL(tabId);
        }
      });
    });
  }
  else if (request.action === "TOGGLE_MANUAL") {
    if (request.state) {
      injectRTL(request.tabId);
    } else {
      removeRTL(request.tabId);
    }
  }
  else if (request.action === "UPDATE_FONT_SIZE") {
    if (!Number.isInteger(request.tabId)) return;
    withSupportedTab(request.tabId, () => {
      const size = Number.isInteger(request.size) ? Math.min(36, Math.max(10, request.size)) : 16;
      const fontFamily = getFontFamily(request.fontFamily);
      chrome.scripting.executeScript({
        target: { tabId: request.tabId },
        func: (newSize, newFontFamily) => {
          if(document.documentElement.hasAttribute('data-rtl-active')) {
            document.documentElement.style.setProperty('--rtl-custom-font-size', newSize + 'px');
            document.documentElement.style.setProperty('--rtl-font-family', newFontFamily);
            document.documentElement.style.setProperty('--rtl-code-font-size', Math.max(10, newSize - 2) + 'px');
          }
        },
        args: [size, fontFamily]
      }).catch((error) => console.warn('Unable to update the page font size.', error));
    });
  }
});

function checkAndApplyRTL(tabId, urlString, clearWhenNotAuto = false) {
  if (!isSupportedPage(urlString)) {
    return;
  }

  const hostname = new URL(urlString).hostname;
  chrome.storage.local.get(['autoDomains'], (data) => {
    const domains = Array.isArray(data.autoDomains) ? data.autoDomains : [];
    const isMatched = domains.some((domain) => {
      if (typeof domain !== 'string' || !domain) return false;
      const normalizedDomain = domain.toLowerCase().replace(/^www\./, '');
      const normalizedHostname = hostname.toLowerCase().replace(/^www\./, '');
      return normalizedHostname === normalizedDomain || normalizedHostname.endsWith("." + normalizedDomain);
    });

    if (isMatched) {
      injectRTL(tabId);
    } else if (clearWhenNotAuto) {
      removeRTL(tabId);
    }
  });
}

function isSupportedPage(urlString) {
  try {
    const url = new URL(urlString);
    const isWebPage = url.protocol === 'http:' || url.protocol === 'https:';
    const isChromeWebStore = url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore'));
    return isWebPage && !isChromeWebStore;
  } catch (error) {
    console.warn('Unable to parse tab URL.', error);
    return false;
  }
}

function withSupportedTab(tabId, callback) {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.warn('Unable to access the target tab.', chrome.runtime.lastError.message);
      return;
    }
    if (tab && isSupportedPage(tab.url)) {
      callback();
    }
  });
}

function injectRTL(tabId) {
  withSupportedTab(tabId, () => {
    chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ["rtl-style.css"] })
      .catch((error) => console.warn('Unable to add RTL styles.', error));
    chrome.scripting.executeScript({ target: { tabId: tabId }, files: ["content.js"] })
      .catch((error) => console.warn('Unable to initialize RTL content.', error));

    chrome.storage.local.get(['customFontSize', 'fontFamily'], (data) => {
      const size = Number.isInteger(data.customFontSize) && data.customFontSize >= 10 && data.customFontSize <= 36
        ? data.customFontSize
        : 16;
      const fontFamily = getFontFamily(data.fontFamily);
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (fontSize, pageFontFamily) => {
          document.documentElement.setAttribute('data-rtl-active', 'true');
          document.documentElement.style.setProperty('--rtl-custom-font-size', fontSize + 'px');
          document.documentElement.style.setProperty('--rtl-font-family', pageFontFamily);
          document.documentElement.style.setProperty('--rtl-code-font-size', Math.max(10, fontSize - 2) + 'px');
        },
        args: [size, fontFamily]
      }).catch((error) => console.warn('Unable to activate RTL on the page.', error));
    });

    chrome.action.setIcon({
      path: { 16: "ON-16.png", 32: "ON-32.png" },
      tabId: tabId
    }).catch((error) => console.warn('Unable to set the active icon.', error));
  });
}

function removeRTL(tabId) {
  withSupportedTab(tabId, () => {
    chrome.scripting.removeCSS({ target: { tabId: tabId }, files: ["rtl-style.css"] })
      .catch((error) => console.warn('Unable to remove RTL styles.', error));
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        document.documentElement.removeAttribute('data-rtl-active');
        document.documentElement.style.removeProperty('--rtl-custom-font-size');
        document.documentElement.style.removeProperty('--rtl-font-family');
        document.documentElement.style.removeProperty('--rtl-code-font-size');
      }
    }).catch((error) => console.warn('Unable to remove RTL from the page.', error));

    chrome.action.setIcon({
      path: { 16: "OFF-16.png", 32: "OFF-32.png" },
      tabId: tabId
    }).catch((error) => console.warn('Unable to set the inactive icon.', error));
  });
}