document.addEventListener('DOMContentLoaded', () => {
  const btnConnect = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');
  const btnRefresh = document.getElementById('btn-refresh');
  const inputIp = document.getElementById('proxy-ip');
  const inputPort = document.getElementById('proxy-port');
  const inputBypass = document.getElementById('bypass-list');
  const feedback = document.getElementById('feedback');
  const ipAddress = document.getElementById('ip-address');
  let proxyIsActive = null;
  let isBusy = false;

  const defaultBypassDomains = [
    "*.ir",
    "<local>",
    "localhost",
    "127.0.0.1",
    "aparat.com",
    "filimo.com",
    "digikala.com",
    "torob.com",
    "snapp.taxi",
    "blubank.com",
    "zarinpal.com",
    "eitaa.com",
    "bale.ai",
    "varzesh3.com",
    "telewebion.com",
    "ninisite.com",
    "sheypoor.com",
    "neshan.org"
  ];
  const defaultBypass = defaultBypassDomains.join(", ");

  chrome.storage.local.get(['savedIp', 'savedPort', 'savedBypass', 'proxyActive', 'lastGeo', 'lastGeoError'], (data) => {
    if (chrome.runtime.lastError) {
      showFeedback(`خواندن تنظیمات ناموفق بود: ${chrome.runtime.lastError.message}`);
      return;
    }

    if (data.savedIp) inputIp.value = data.savedIp;
    if (data.savedPort) inputPort.value = data.savedPort;

    const currentBypass = mergeBypassLists(data.savedBypass, defaultBypassDomains);
    inputBypass.value = currentBypass.join(", ");
    const bypassListChanged = inputBypass.value !== (data.savedBypass || "");
    if (bypassListChanged) {
      chrome.storage.local.set({ savedBypass: inputBypass.value }, () => {
        if (chrome.runtime.lastError) {
          showFeedback(`ذخیره فهرست استثناها ناموفق بود: ${chrome.runtime.lastError.message}`);
          return;
        }

        if (data.proxyActive && data.savedIp && data.savedPort) {
          setBusy(true);
          sendBackgroundMessage({
            action: "SET_PROXY",
            ip: data.savedIp,
            port: data.savedPort,
            bypass: inputBypass.value
          }, (response) => {
            setBusy(false);
            showFeedback(response.success
              ? "فهرست استثناها روی اتصال فعال به‌روزرسانی شد."
              : `به‌روزرسانی استثناها ناموفق بود: ${response.error}`);
          });
        } else {
          refreshCurrentIP();
        }
      });
    } else {
      refreshCurrentIP();
    }

    updateUI(data.proxyActive, data.lastGeo);
    setBusy(false);
    if (data.lastGeoError) showFeedback(data.lastGeoError);
  });

  btnConnect.addEventListener('click', () => {
    const ip = inputIp.value.trim();
    const port = inputPort.value.trim();
    const bypassStr = inputBypass.value.trim();

    if (!ip || ip.length > 253 || /[\s/?#@]/.test(ip)) {
      showFeedback("آدرس سرور پروکسی معتبر نیست.");
      inputIp.focus();
      return;
    }
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      showFeedback("پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد.");
      inputPort.focus();
      return;
    }

    const finalBypass = bypassStr === "" ? defaultBypass : bypassStr;
    setBusy(true);
    showFeedback("در حال اتصال...");
    ipAddress.innerText = "در حال اتصال...";
    sendBackgroundMessage({ action: "SET_PROXY", ip, port, bypass: finalBypass }, (response) => {
      setBusy(false);
      if (!response.success) {
        showFeedback(response.error || "اتصال پروکسی ناموفق بود.");
        return;
      }

      updateConnectionState(true);
      showFeedback("پروکسی با موفقیت فعال شد.");
    });
  });

  btnDisconnect.addEventListener('click', () => {
    setBusy(true);
    showFeedback("در حال قطع اتصال...");
    sendBackgroundMessage({ action: "CLEAR_PROXY" }, (response) => {
      setBusy(false);
      if (!response.success) {
        showFeedback(response.error || "قطع اتصال ناموفق بود.");
        return;
      }

      updateConnectionState(false);
      showFeedback("پروکسی غیرفعال شد.");
    });
  });

  btnRefresh.addEventListener('click', () => {
    setBusy(true);
    showFeedback("در حال بررسی IP...");
    sendBackgroundMessage({ action: "FORCE_CHECK_IP" }, (response) => {
      setBusy(false);
      if (response.success && response.geoData) {
        updateGeo(response.geoData);
        showFeedback("اطلاعات IP به‌روز شد.");
      } else {
        showFeedback(response.error || "بررسی IP ناموفق بود.");
      }
    });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.proxyActive) updateConnectionState(changes.proxyActive.newValue === true);
    if (changes.lastGeo) updateGeo(changes.lastGeo.newValue);
    if (changes.lastGeoError) showFeedback(changes.lastGeoError.newValue || "");
  });

  function updateUI(isActive, geoData) {
    updateConnectionState(isActive);
    if (geoData) updateGeo(geoData);
  }

  function refreshCurrentIP() {
    ipAddress.innerText = "در حال بررسی...";
    sendBackgroundMessage({ action: "FORCE_CHECK_IP" }, (response) => {
      if (response.success && response.geoData) {
        updateGeo(response.geoData);
        showFeedback("");
      } else {
        showFeedback(response.error || "بررسی IP ناموفق بود.");
      }
    });
  }

  function mergeBypassLists(savedList, defaultList) {
    const seen = new Set();
    return [...(savedList || "").split(","), ...defaultList]
      .map((domain) => domain.trim())
      .filter((domain) => {
        if (!domain) return false;
        const normalized = domain.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  function updateConnectionState(isActive) {
    proxyIsActive = isActive === true;
    const statusBadge = document.getElementById('connection-status');
    statusBadge.className = proxyIsActive ? 'status-badge on' : 'status-badge off';
    statusBadge.innerText = proxyIsActive ? 'متصل' : 'غیرفعال';
    btnConnect.disabled = isBusy || proxyIsActive || proxyIsActive === null;
    btnDisconnect.disabled = isBusy || !proxyIsActive;
  }

  function updateGeo(geoData) {
    if (!geoData || !geoData.ip) return;
    ipAddress.innerText = geoData.ip;
    const countryCode = document.getElementById('country-code');
    countryCode.innerText = geoData.country_code || '';
    countryCode.hidden = !geoData.country_code;
    const location = [geoData.country, geoData.city].filter(Boolean).join("، ");
    document.getElementById('geo-location').innerText =
      `${geoData.flag?.emoji || ''} ${location || "موقعیت نامشخص"}`.trim();
  }

  function sendBackgroundMessage(message, callback) {
    chrome.runtime.sendMessage(message, (response) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        setBusy(false);
        callback({ success: false, error: runtimeError.message });
        return;
      }
      callback(response || { success: false, error: "پاسخی از سرویس‌ورکر دریافت نشد." });
    });
  }

  function setBusy(busy) {
    isBusy = Boolean(busy);
    btnConnect.disabled = isBusy || proxyIsActive || proxyIsActive === null;
    btnDisconnect.disabled = isBusy || !proxyIsActive;
    btnRefresh.disabled = isBusy;
  }

  function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = !message;
  }
});