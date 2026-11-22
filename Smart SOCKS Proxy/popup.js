document.addEventListener('DOMContentLoaded', () => {
  const btnConnect = document.getElementById('btn-connect');
  const btnDisconnect = document.getElementById('btn-disconnect');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnSaveBypass = document.getElementById('btn-save-bypass');
  const btnResetBypass = document.getElementById('btn-reset-bypass');
  const inputIp = document.getElementById('proxy-ip');
  const inputPort = document.getElementById('proxy-port');
  const inputBypass = document.getElementById('bypass-list');
  const bypassCount = document.getElementById('bypass-count');
  const feedback = document.getElementById('feedback');
  const ipAddress = document.getElementById('ip-address');
  const ipUpdated = document.getElementById('ip-updated');
  const ipChecking = document.getElementById('ip-checking');

  let proxyIsActive = null;
  let isBusy = false;
  let defaultBypassText = '';

  function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = Date.now();
    const diffSec = Math.floor((now - timestamp) / 1000);
    if (diffSec < 60) return 'همین حالا';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} دقیقه پیش`;
    return date.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  }

  function showFeedback(message) {
    feedback.textContent = message;
    feedback.hidden = !message;
  }

  function setBusy(busy) {
    isBusy = Boolean(busy);
    btnConnect.disabled = isBusy || proxyIsActive || proxyIsActive === null;
    btnDisconnect.disabled = isBusy || !proxyIsActive;
    btnRefresh.disabled = isBusy;
    btnSaveBypass.disabled = isBusy;
    btnResetBypass.disabled = isBusy;
  }

  function updateConnectionState(isActive) {
    proxyIsActive = isActive === true;
    const statusBadge = document.getElementById('connection-status');
    statusBadge.className = proxyIsActive ? 'status-badge on' : 'status-badge off';
    statusBadge.innerText = proxyIsActive ? 'متصل' : 'غیرفعال';
    setBusy(isBusy);
  }

  function updateGeo(geoData, geoAt) {
    if (!geoData || !geoData.ip) return;
    ipAddress.innerText = geoData.ip;
    ipChecking.hidden = true;
    const countryCode = document.getElementById('country-code');
    countryCode.innerText = geoData.country_code || '';
    countryCode.hidden = !geoData.country_code;
    const location = [geoData.country, geoData.city].filter(Boolean).join('، ');
    document.getElementById('geo-location').innerText =
      `${geoData.flag?.emoji || ''} ${location || 'موقعیت نامشخص'}`.trim();
    ipUpdated.innerText = geoAt ? `به‌روز شده: ${formatTime(geoAt)}` : '';
  }

  function updateBypassCount() {
    const count = inputBypass.value.split(',').map((s) => s.trim()).filter(Boolean).length;
    bypassCount.innerText = count ? `${count} دامنه` : '';
  }

  function sendBackgroundMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          resolve({ success: false, error: runtimeError.message });
          return;
        }
        resolve(response || { success: false, error: 'پاسخی از سرویس‌ورکر دریافت نشد.' });
      });
    });
  }

  // Quiet refresh: update the IP live without blanking the cached one.
  async function refreshIPQuietly() {
    ipChecking.hidden = false;
    const response = await sendBackgroundMessage({ action: 'FORCE_CHECK_IP' });
    ipChecking.hidden = true;
    if (response.success && response.geoData) {
      updateGeo(response.geoData, Date.now());
    } else if (response.error) {
      showFeedback(response.error);
    }
  }

  async function init() {
    const state = await sendBackgroundMessage({ action: 'GET_STATE' });
    if (!state || state.success === false) {
      showFeedback((state && state.error) || 'خواندن وضعیت پروکسی ناموفق بود.');
      return;
    }

    defaultBypassText = state.defaultBypass || '';

    if (state.savedIp) inputIp.value = state.savedIp;
    if (state.savedPort) inputPort.value = state.savedPort;

    // First run only: seed the curated Iran list. Afterwards the saved
    // list is shown exactly as saved — defaults are never forced back.
    if (!state.hasSavedBypass) {
      inputBypass.value = defaultBypassText;
      await sendBackgroundMessage({ action: 'SAVE_BYPASS', bypass: defaultBypassText });
    } else {
      inputBypass.value = state.savedBypass;
    }
    updateBypassCount();

    // Show the cached IP instantly, then refresh live in the background.
    updateConnectionState(state.proxyActive);
    if (state.lastGeo) updateGeo(state.lastGeo, state.lastGeoAt);
    if (state.lastGeoError) showFeedback(state.lastGeoError);
    setBusy(false);
    refreshIPQuietly();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.proxyActive) updateConnectionState(changes.proxyActive.newValue === true);
    if (changes.lastGeo) {
      const at = changes.lastGeoAt ? changes.lastGeoAt.newValue : Date.now();
      updateGeo(changes.lastGeo.newValue, at);
    }
    if (changes.lastGeoError && changes.lastGeoError.newValue) {
      showFeedback(changes.lastGeoError.newValue);
    }
  });

  btnConnect.addEventListener('click', async () => {
    const ip = inputIp.value.trim();
    const port = inputPort.value.trim();
    const bypassStr = inputBypass.value.trim();

    if (!ip || ip.length > 253 || /[\s/?#@]/.test(ip)) {
      showFeedback('آدرس سرور پروکسی معتبر نیست.');
      inputIp.focus();
      return;
    }
    if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
      showFeedback('پورت باید عددی بین ۱ تا ۶۵۵۳۵ باشد.');
      inputPort.focus();
      return;
    }

    const finalBypass = bypassStr === '' ? defaultBypassText : bypassStr;
    setBusy(true);
    showFeedback('در حال اتصال...');
    ipAddress.innerText = 'در حال اتصال...';
    ipChecking.hidden = true;
    const response = await sendBackgroundMessage({ action: 'SET_PROXY', ip, port, bypass: finalBypass });
    setBusy(false);
    if (!response.success) {
      showFeedback(response.error || 'اتصال پروکسی ناموفق بود.');
      return;
    }

    updateConnectionState(true);
    showFeedback('پروکسی فعال شد — در حال بررسی IP...');
    ipChecking.hidden = false;
  });

  btnDisconnect.addEventListener('click', async () => {
    setBusy(true);
    showFeedback('در حال قطع اتصال...');
    const response = await sendBackgroundMessage({ action: 'CLEAR_PROXY' });
    setBusy(false);
    if (!response.success) {
      showFeedback(response.error || 'قطع اتصال ناموفق بود.');
      return;
    }

    updateConnectionState(false);
    showFeedback('پروکسی غیرفعال شد.');
  });

  btnRefresh.addEventListener('click', async () => {
    setBusy(true);
    showFeedback('در حال بررسی IP...');
    const response = await sendBackgroundMessage({ action: 'FORCE_CHECK_IP' });
    setBusy(false);
    ipChecking.hidden = true;
    if (response.success && response.geoData) {
      updateGeo(response.geoData, Date.now());
      showFeedback('اطلاعات IP به‌روز شد.');
    } else {
      showFeedback(response.error || 'بررسی IP ناموفق بود.');
    }
  });

  btnSaveBypass.addEventListener('click', async () => {
    setBusy(true);
    const response = await sendBackgroundMessage({ action: 'SAVE_BYPASS', bypass: inputBypass.value });
    setBusy(false);
    if (!response.success) {
      showFeedback(response.error || 'ذخیره فهرست استثناها ناموفق بود.');
      return;
    }
    if (response.bypassText !== undefined) inputBypass.value = response.bypassText;
    updateBypassCount();
    showFeedback(response.applied
      ? 'فهرست استثناها ذخیره و روی اتصال فعال اعمال شد.'
      : 'فهرست استثناها ذخیره شد.');
  });

  btnResetBypass.addEventListener('click', async () => {
    inputBypass.value = defaultBypassText;
    updateBypassCount();
    setBusy(true);
    const response = await sendBackgroundMessage({ action: 'SAVE_BYPASS', bypass: defaultBypassText });
    setBusy(false);
    if (!response.success) {
      showFeedback(response.error || 'بازنشانی فهرست ناموفق بود.');
      return;
    }
    showFeedback('فهرست استثناها به لیست پیش‌فرض ایران برگشت.');
  });

  inputBypass.addEventListener('input', updateBypassCount);

  // Click the IP to copy it.
  ipAddress.addEventListener('click', async () => {
    const ip = ipAddress.innerText.trim();
    if (!ip || ip.startsWith('در حال')) return;
    try {
      await navigator.clipboard.writeText(ip);
      showFeedback('IP کپی شد.');
    } catch {
      showFeedback('کپی IP ناموفق بود.');
    }
  });

  init();
});
