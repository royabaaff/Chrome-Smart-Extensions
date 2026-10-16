const ICON_PATHS = {
  active: {
    16: "ON-16.png",
    32: "ON-32.png",
    48: "ON-48.png",
    128: "ON-128.png"
  },
  inactive: {
    16: "OFF-16.png",
    32: "OFF-32.png",
    48: "OFF-48.png",
    128: "OFF-128.png"
  }
};

function logApiError(operation) {
  const error = chrome.runtime.lastError;
  if (!error) return null;

  console.error(`${operation}: ${error.message}`);
  return error.message;
}

function setIcon(isActive) {
  chrome.action.setIcon({ path: isActive ? ICON_PATHS.active : ICON_PATHS.inactive }, () => {
    logApiError("Setting proxy status icon");
  });
}

function setActionStatus(isActive, geoData) {
  setIcon(isActive);

  const countryCode = typeof geoData?.country_code === "string"
    ? geoData.country_code.toUpperCase().slice(0, 2)
    : "";
  const country = geoData?.country || (isActive ? "در حال بررسی" : "نامشخص");
  const ip = geoData?.ip ? ` | IP: ${geoData.ip}` : "";
  const title = `Smart SOCKS Proxy | ${isActive ? "فعال" : "غیرفعال"} | کشور IP: ${country}${ip}`;

  chrome.action.setTitle({ title }, () => {
    logApiError("Updating proxy status tooltip");
  });
  chrome.action.setBadgeText({ text: countryCode || (isActive ? "ON" : "OFF") }, () => {
    logApiError("Updating country badge");
  });
  chrome.action.setBadgeBackgroundColor({
    color: isActive ? "#00a84f" : "#626b75"
  }, () => {
    logApiError("Updating status badge color");
  });
}

function normalizeProxySettings(request) {
  const host = typeof request.ip === "string" ? request.ip.trim() : "";
  const portText = String(request.port ?? "").trim();
  const port = Number(portText);

  if (!host || host.length > 253 || /[\s/?#@]/.test(host)) {
    throw new Error("آدرس سرور پروکسی معتبر نیست.");
  }
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد.");
  }

  const bypassList = (typeof request.bypass === "string" ? request.bypass : "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedBypass = new Set(bypassList.map((item) => item.toLowerCase()));
  for (const localHost of ["localhost", "127.0.0.1"]) {
    if (!normalizedBypass.has(localHost)) bypassList.push(localHost);
  }

  return { host, port, bypassList };
}

function setProxy(request) {
  const { host, port, bypassList } = normalizeProxySettings(request);
  const config = {
    mode: "fixed_servers",
    rules: {
      singleProxy: { scheme: "socks5", host, port },
      bypassList
    }
  };

  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: config, scope: "regular" }, () => {
      const proxyError = logApiError("Setting SOCKS5 proxy");
      if (proxyError) {
        reject(new Error(proxyError));
        return;
      }

      chrome.storage.local.set({
        savedIp: host,
        savedPort: String(port),
        savedBypass: request.bypass || "",
        proxyActive: true,
        lastGeoError: ""
      }, () => {
        const storageError = logApiError("Saving proxy settings");
        if (storageError) {
          reject(new Error(storageError));
          return;
        }

        setActionStatus(true);
        resolve();
      });
    });
  });
}

function clearProxy() {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value: { mode: "direct" }, scope: "regular" }, () => {
      const proxyError = logApiError("Clearing proxy settings");
      if (proxyError) {
        reject(new Error(proxyError));
        return;
      }

      chrome.storage.local.set({ proxyActive: false, lastGeoError: "" }, () => {
        const storageError = logApiError("Saving proxy status");
        if (storageError) {
          reject(new Error(storageError));
          return;
        }

        setActionStatus(false);
        resolve();
      });
    });
  });
}

async function checkIPAndGeo(isProxyActive) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("https://ipwho.is/", { signal: controller.signal });
    if (!response.ok) throw new Error(`سرویس بررسی IP پاسخ ${response.status} داد.`);

    const data = await response.json();
    if (!data.success || typeof data.ip !== "string") {
      throw new Error(data.message || "اطلاعات IP از سرویس دریافت نشد.");
    }

    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ lastGeo: data, lastGeoError: "" }, () => {
        const storageError = logApiError("Saving IP information");
        if (storageError) reject(new Error(storageError));
        else resolve();
      });
    });

    setActionStatus(isProxyActive, data);
    return data;
  } catch (error) {
    const message = error.name === "AbortError"
      ? "بررسی IP بیش از حد طول کشید؛ اتصال اینترنت را بررسی کنید."
      : error.message || "بررسی IP ناموفق بود.";
    chrome.storage.local.set({ lastGeoError: message }, () => {
      logApiError("Saving IP check error");
    });
    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }
}

function getProxyStatus() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(["proxyActive"], (data) => {
      const storageError = logApiError("Reading proxy status");
      if (storageError) {
        reject(new Error(storageError));
        return;
      }
      resolve(data.proxyActive === true);
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SET_PROXY") {
    Promise.resolve().then(() => setProxy(request)).then(() => {
      sendResponse({ success: true });
      checkIPAndGeo(true).catch((error) => {
        console.error("Refreshing IP after connecting proxy:", error);
      });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === "CLEAR_PROXY") {
    clearProxy().then(() => {
      sendResponse({ success: true });
      checkIPAndGeo(false).catch((error) => {
        console.error("Refreshing IP after disconnecting proxy:", error);
      });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === "FORCE_CHECK_IP") {
    getProxyStatus().then((isActive) => {
      setActionStatus(isActive);
      return checkIPAndGeo(isActive);
    }).then((geoData) => {
      sendResponse({ success: true, geoData });
    }).catch((error) => {
      console.error("Checking public IP:", error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  return false;
});

getProxyStatus().then((isActive) => {
  chrome.storage.local.get(["lastGeo"], (data) => {
    const storageError = logApiError("Reading cached IP information");
    if (storageError) {
      setActionStatus(isActive);
      return;
    }
    setActionStatus(isActive, data.lastGeo);
  });
}).catch((error) => {
  console.error("Initializing proxy status:", error);
});