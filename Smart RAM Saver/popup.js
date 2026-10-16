document.addEventListener('DOMContentLoaded', () => {
  const btnToggle = document.getElementById('btn-toggle');
  const btnAutoDomain = document.getElementById('btn-auto-domain');
  const btnSave = document.getElementById('btn-save');
  const btnDiscardNow = document.getElementById('btn-discard-now');
  const inputTimeout = document.getElementById('timeout-input');
  const domainText = document.getElementById('current-domain');
  const tabsStatus = document.getElementById('tabs-status');

  function showError(message) {
    tabsStatus.textContent = message;
    tabsStatus.classList.add('error');
  }

  function reportApiError(operation) {
    if (!chrome.runtime.lastError) return false;
    const message = chrome.runtime.lastError.message;
    console.error(`${operation}: ${message}`);
    showError('خطا: ' + message);
    return true;
  }

  function updateToggleUI(isActive) {
    btnToggle.className = isActive ? 'toggle-btn on' : 'toggle-btn off';
    btnToggle.innerText = isActive ? 'فعال' : 'غیرفعال';
  }

  function updateAutoDomainUI(isExcluded) {
    btnAutoDomain.className = isExcluded ? 'toggle-btn on' : 'toggle-btn off';
    btnAutoDomain.innerText = isExcluded
      ? 'استثنای این سایت: روشن'
      : 'استثنای این سایت: خاموش';
  }

  function updateTabStats() {
    chrome.tabs.query({}, (tabs) => {
      if (reportApiError('Reading tab counts')) return;
      const discarded = tabs.filter((tab) => tab.discarded).length;
      tabsStatus.classList.remove('error');
      tabsStatus.textContent = `${discarded} تب فریز شده از ${tabs.length} تب`;
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (reportApiError('Reading active tab')) {
      btnAutoDomain.disabled = true;
      return;
    }

    const tab = tabs[0];
    let hostname = '';
    if (tab && tab.url) {
      try {
        const url = new URL(tab.url);
        if (url.protocol === 'http:' || url.protocol === 'https:') hostname = url.hostname;
      } catch {
        hostname = '';
      }
    }

    if (hostname) {
      domainText.innerText = hostname;
      btnAutoDomain.disabled = false;
      btnAutoDomain.dataset.hostname = hostname;
    } else {
      domainText.innerText = 'صفحه داخلی یا غیرقابل‌دسترسی';
      btnAutoDomain.disabled = true;
    }

    chrome.storage.local.get(['autoDiscardActive', 'discardTimeout', 'ramAutoDomains'], (data) => {
      if (reportApiError('Reading saved settings')) return;

      updateToggleUI(data.autoDiscardActive !== false);
      inputTimeout.value = Number.isFinite(data.discardTimeout)
        ? Math.min(120, Math.max(1, data.discardTimeout))
        : 5;
      const autoDomains = Array.isArray(data.ramAutoDomains) ? data.ramAutoDomains : [];
      updateAutoDomainUI(hostname ? autoDomains.includes(hostname) : false);
    });
  });

  updateTabStats();

  btnToggle.addEventListener('click', () => {
    const newState = !btnToggle.classList.contains('on');
    btnToggle.disabled = true;
    chrome.storage.local.set({ autoDiscardActive: newState }, () => {
      btnToggle.disabled = false;
      if (reportApiError('Saving enabled state')) return;
      updateToggleUI(newState);
    });
  });

  btnAutoDomain.addEventListener('click', () => {
    const hostname = btnAutoDomain.dataset.hostname;
    if (!hostname) return;

    btnAutoDomain.disabled = true;
    chrome.storage.local.get(['ramAutoDomains'], (data) => {
      if (reportApiError('Reading domain exclusions')) {
        btnAutoDomain.disabled = false;
        return;
      }

      const domains = Array.isArray(data.ramAutoDomains) ? data.ramAutoDomains : [];
      const isNowExcluded = !domains.includes(hostname);
      const updatedDomains = isNowExcluded
        ? [...domains, hostname]
        : domains.filter((domain) => domain !== hostname);

      chrome.storage.local.set({ ramAutoDomains: updatedDomains }, () => {
        btnAutoDomain.disabled = false;
        if (reportApiError('Saving domain exclusion')) return;
        updateAutoDomainUI(isNowExcluded);
      });
    });
  });

  btnSave.addEventListener('click', () => {
    const requestedTimeout = Number.parseInt(inputTimeout.value, 10);
    if (!Number.isFinite(requestedTimeout)) {
      showError('لطفاً زمان معتبری بین ۱ تا ۱۲۰ دقیقه وارد کنید.');
      inputTimeout.focus();
      return;
    }

    const newTimeout = Math.min(120, Math.max(1, requestedTimeout));
    inputTimeout.value = newTimeout;
    btnSave.disabled = true;
    chrome.storage.local.set({ discardTimeout: newTimeout }, () => {
      btnSave.disabled = false;
      if (reportApiError('Saving discard timeout')) return;
      tabsStatus.classList.remove('error');
      tabsStatus.textContent = 'تنظیمات ذخیره شد.';
      const originalText = btnSave.innerText;
      btnSave.innerText = 'ذخیره شد!';
      setTimeout(() => { btnSave.innerText = originalText; }, 1500);
    });
  });

  btnDiscardNow.addEventListener('click', () => {
    btnDiscardNow.disabled = true;
    chrome.runtime.sendMessage({ action: 'DISCARD_ALL_NOW' }, (response) => {
      btnDiscardNow.disabled = false;
      if (reportApiError('Requesting immediate discard')) return;
      if (!response || response.error) {
        showError('فریز فوری انجام نشد؛ دوباره تلاش کنید.');
        return;
      }

      const originalText = btnDiscardNow.innerText;
      btnDiscardNow.innerText = `${response.discarded} تب فریز شد`;
      updateTabStats();
      setTimeout(() => { btnDiscardNow.innerText = originalText; }, 2000);
    });
  });
});
