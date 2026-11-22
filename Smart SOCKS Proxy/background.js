// Smart SOCKS Proxy — background service worker.
//
// v2.4 changes:
// - The bypass list is now a curated, up-to-date Iran-only list (60 entries).
//   `*.ir` already covers every .ir domain, so the list holds the Iranian
//   services on other TLDs (.com/.ai/.org/.net/.io/.app). The defaults are
//   applied ONLY on first run — never re-merged on popup open — so the user
//   can freely edit the list and it stays as saved (explicit Save button).
// - The stored proxyActive flag can no longer drift from reality: the real
//   state is read from chrome.proxy.settings.get (GET_STATE + startup sync).
// - The IP is shown live: the popup renders the cached IP instantly and the
//   background refreshes it in the background (6s timeout, lastGeoAt
//   timestamp). A failed refresh never blanks a good cached IP.
// - Connecting now verifies the proxy: the IP check runs right after the
//   config is written and its result is stored; if the proxy does not
//   respond, the popup is told the proxy may be unreachable instead of
//   reporting a plain success.

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

// Curated Iran-only bypass list (2026-11-22). `*.ir` covers every .ir
// domain; the rest are Iranian services on other TLDs. Single source of
// truth — the popup gets this via GET_STATE for "reset to defaults".
const DEFAULT_BYPASS = [
  "*.ir", "<local>", "localhost", "127.0.0.1",
  // Shopping & e-commerce
  "digikala.com", "torob.com", "okala.com", "basalam.com", "banimode.com",
  "khanumi.com", "digistyle.com", "janebi.com", "kalaoma.com", "modiseh.com",
  "snapp.market", "sheypoor.com", "malltina.com", "timcheh.com",
  // Ride, delivery & food
  "snapp.taxi", "alopeyk.com", "zoodfood.com", "delino.com",
  // Banks, payment & fintech
  "blubank.com", "zarinpal.com", "vandar.io", "mydigipay.com",
  "behpardakht.com",
  // Crypto & stock market
  "ramzinex.com", "ompfinex.com", "tsetmc.com", "sahamyab.com",
  "emofid.com", "agah.com", "mofidonline.com", "farabixo.com",
  "rahavard365.com",
  // Travel & insurance
  "snapptrip.com", "flightio.com", "mrbilit.com", "eligasht.com",
  "safarmarket.com", "jabama.com", "hamgardi.com", "kojaro.com",
  "eghamat24.com", "hotelyar.com", "bimeh.com", "bimebazar.com",
  "azki.com", "bimeh365.com", "bimito.com",
  // Messaging & social
  "eitaa.com", "bale.ai", "gap.im", "igap.net", "virasty.com",
  // Video & music
  "aparat.com", "filimo.com", "telewebion.com", "tamasha.com",
  "radiojavan.com", "musicema.com", "bia2.com",
  // News & media
  "varzesh3.com", "mehrnews.com", "tasnimnews.com", "asriran.com",
  "donya-e-eqtesad.com", "eghtesadnews.com", "digiato.com", "gadgetnews.net",
  "techrato.com", "jamaran.news", "sharghdaily.com", "khabarban.com",
  "khabarfoori.com", "fararu.com", "jahannews.com", "rajanews.com",
  "shafaqna.com", "abna24.com", "hawzahnews.com", "tejaratnews.com",
  "eghtesadonline.com", "tahlilbazaar.com", "itresan.com",
  "shahrekhabar.com", "ghatreh.com",
  // Sports
  "footballi.net", "tarafdari.com", "khabarvarzeshi.com",
  // Jobs, health & education
  "karboom.io", "karlancer.com", "paziresh24.com", "doctoreto.com",
  "faradars.org", "maktabkhooneh.org", "taaghche.com", "fidibo.com",
  "ketabrah.com", "takbook.com", "sanjesh.org", "classino.com",
  "ostadbank.com", "zabanshenas.com",
  // Cars, real estate, classifieds & maps
  "khodro45.com", "hamrah-mechanic.com", "kilid.com", "shabash.com",
  "melkana.com", "ninisite.com", "neshan.org"
];
const DEFAULT_BYPASS_TEXT = DEFAULT_BYPASS.join(", ");

const IP_CHECK_TIMEOUT_MS = 6000;

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

// The real proxy state, read from Chrome itself (never trust the stored
// flag alone — the proxy can be changed outside this extension).
function getRealProxyState() {
  return new Promise((resolve) => {
    chrome.proxy.settings.get({}, (details) => {
      if (logApiError("Reading proxy settings")) {
        resolve({ active: false, host: "", port: "" });
        return;
      }
      const single = details?.value?.rules?.singleProxy;
      const active = details?.value?.mode === "fixed_servers" &&
        single?.scheme === "socks5" && !!single.host;
      resolve({
        active,
        host: active ? single.host : "",
        port: active ? String(single.port || "") : ""
      });
    });
  });
}

function normalizeBypassText(text) {
  const seen = new Set();
  return (typeof text === "string" ? text : "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
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

  const bypassList = normalizeBypassText(request.bypass);
  const normalizedBypass = new Set(bypassList);
  for (const localHost of ["localhost", "127.0.0.1"]) {
    if (!normalizedBypass.has(localHost)) bypassList.push(localHost);
  }

  return { host, port, bypassList };
}

function applyProxyConfig(host, port, bypassList) {
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
      if (proxyError) reject(new Error(proxyError));
      else resolve();
    });
  });
}

async function setProxy(request) {
  const { host, port, bypassList } = normalizeProxySettings(request);
  await applyProxyConfig(host, port, bypassList);

  await new Promise((resolve, reject) => {
    chrome.storage.local.set({
      savedIp: host,
      savedPort: String(port),
      savedBypass: normalizeBypassText(request.bypass).join(", "),
      proxyActive: true,
      lastGeoError: ""
    }, () => {
      const storageError = logApiError("Saving proxy settings");
      if (storageError) reject(new Error(storageError));
      else resolve();
    });
  });

  setActionStatus(true);
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
  const timeoutId = setTimeout(() => controller.abort(), IP_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch("https://ipwho.is/", { signal: controller.signal });
    if (!response.ok) throw new Error(`سرویس بررسی IP پاسخ ${response.status} داد.`);

    const data = await response.json();
    if (!data.success || typeof data.ip !== "string") {
      throw new Error(data.message || "اطلاعات IP از سرویس دریافت نشد.");
    }

    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ lastGeo: data, lastGeoAt: Date.now(), lastGeoError: "" }, () => {
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
    // Keep the last good IP on screen: only store the error, never clear
    // lastGeo here.
    chrome.storage.local.set({ lastGeoError: message }, () => {
      logApiError("Saving IP check error");
    });
    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }
}

// Verify the proxy actually works after connecting: the IP check runs
// through the proxy, so a failure means the server is unreachable.
async function verifyAfterConnect() {
  try {
    const geo = await checkIPAndGeo(true);
    return { ok: true, geo };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === "GET_STATE") {
      const real = await getRealProxyState();
      const data = await chrome.storage.local.get([
        "savedIp", "savedPort", "savedBypass", "lastGeo", "lastGeoAt", "lastGeoError"
      ]);
      // Keep the stored flag in sync with reality.
      if ((data.proxyActive === true) !== real.active) {
        chrome.storage.local.set({ proxyActive: real.active });
      }
      sendResponse({
        proxyActive: real.active,
        savedIp: data.savedIp || real.host || "",
        savedPort: data.savedPort || real.port || "",
        savedBypass: typeof data.savedBypass === "string" ? data.savedBypass : "",
        lastGeo: data.lastGeo || null,
        lastGeoAt: data.lastGeoAt || 0,
        lastGeoError: data.lastGeoError || "",
        defaultBypass: DEFAULT_BYPASS_TEXT,
        hasSavedBypass: typeof data.savedBypass === "string" && data.savedBypass.trim() !== ""
      });
      return;
    }

    if (request.action === "SET_PROXY") {
      try {
        await setProxy(request);
        sendResponse({ success: true });
        // Verify in the background and push the result via storage; the
        // popup listens and updates the IP / warning live.
        const check = await verifyAfterConnect();
        if (!check.ok) {
          chrome.storage.local.set({
            lastGeoError: "پروکسی وصل شد، ولی IP بررسی نشد — ممکن است سرور در دسترس نباشد."
          });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    if (request.action === "CLEAR_PROXY") {
      try {
        await clearProxy();
        sendResponse({ success: true });
        checkIPAndGeo(false).catch((error) => {
          console.error("Refreshing IP after disconnecting proxy:", error);
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    if (request.action === "SAVE_BYPASS") {
      try {
        const bypassList = normalizeBypassText(request.bypass);
        const bypassText = bypassList.join(", ");
        await new Promise((resolve, reject) => {
          chrome.storage.local.set({ savedBypass: bypassText }, () => {
            const storageError = logApiError("Saving bypass list");
            if (storageError) reject(new Error(storageError));
            else resolve();
          });
        });
        // If the proxy is active, apply the new list right away (explicit
        // Save, not a silent popup-open side effect).
        const real = await getRealProxyState();
        let applied = false;
        if (real.active && real.host) {
          const data = await chrome.storage.local.get(["savedIp", "savedPort"]);
          const host = data.savedIp || real.host;
          const port = Number(data.savedPort || real.port);
          if (host && Number.isInteger(port) && port >= 1 && port <= 65535) {
            const { bypassList: fullList } = normalizeProxySettings({
              ip: host,
              port,
              bypass: bypassText
            });
            await applyProxyConfig(host, port, fullList);
            applied = true;
          }
        }
        sendResponse({ success: true, applied, bypassText });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return;
    }

    if (request.action === "FORCE_CHECK_IP") {
      try {
        const real = await getRealProxyState();
        const geoData = await checkIPAndGeo(real.active);
        sendResponse({ success: true, geoData });
      } catch (error) {
        console.error("Checking public IP:", error);
        sendResponse({ success: false, error: error.message });
      }
      return;
    }
  })().catch((error) => {
    console.error("Message handling failed.", error);
    sendResponse({ success: false, error: error.message || "خطای داخلی." });
  });
  return true;
});

// Startup: sync the icon/badge with the real proxy state and cached IP.
(async () => {
  const real = await getRealProxyState();
  chrome.storage.local.get(["lastGeo"], (data) => {
    if (logApiError("Reading cached IP information")) {
      setActionStatus(real.active);
      return;
    }
    chrome.storage.local.set({ proxyActive: real.active });
    setActionStatus(real.active, data.lastGeo);
  });
})().catch((error) => {
  console.error("Initializing proxy status:", error);
});
