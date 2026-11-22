document.addEventListener('DOMContentLoaded', async () => {
  const btnManual = document.getElementById('btn-manual-toggle');
  const btnAuto = document.getElementById('btn-auto-toggle');
  const domainText = document.getElementById('current-domain');
  const pageStatus = document.getElementById('page-status');

  const btnFontPlus = document.getElementById('btn-font-plus');
  const btnFontMinus = document.getElementById('btn-font-minus');
  const fontSizeSlider = document.getElementById('font-size-slider');
  const fontFamilySelect = document.getElementById('font-family-select');
  const btnResetAppearance = document.getElementById('btn-reset-appearance');
  const fontSizeDisplay = document.getElementById('font-size-display');
  const fontHint = document.getElementById('font-hint');

  const sitesList = document.getElementById('sites-list');
  const sitesEmpty = document.getElementById('sites-empty');

  let currentFontSize = 16;
  const defaultFontFamily = 'vazirmatn';
  const fontFamilies = ['vazirmatn', 'tahoma', 'system'];
  let tabId = null;
  let hostname = '';

  function updateBtnState(btn, isActive, textOn, textOff) {
    btn.className = isActive ? 'toggle-btn on' : 'toggle-btn off';
    btn.innerText = isActive ? textOn : textOff;
  }

  function setFontControlsEnabled(enabled) {
    [btnFontPlus, btnFontMinus, fontSizeSlider, fontFamilySelect, btnResetAppearance].forEach((el) => {
      el.disabled = !enabled;
    });
    fontHint.style.display = enabled ? 'none' : '';
  }

  function renderSitesList(manualDomains, autoDomains) {
    // One row per domain, tagged manual / auto (a domain in both lists is
    // shown once; removing it clears it from both).
    const rows = new Map();
    (Array.isArray(autoDomains) ? autoDomains : []).forEach((d) => {
      rows.set(d, { domain: d, kind: 'auto', label: 'خودکار' });
    });
    (Array.isArray(manualDomains) ? manualDomains : []).forEach((d) => {
      if (!rows.has(d)) rows.set(d, { domain: d, kind: 'manual', label: 'دستی' });
    });
    sitesList.replaceChildren();
    sitesEmpty.style.display = rows.size ? 'none' : '';
    rows.forEach(({ domain, kind, label }) => {
      const item = document.createElement('li');
      item.className = 'site-item';

      const name = document.createElement('span');
      name.className = 'site-name';
      name.textContent = domain;

      const tag = document.createElement('span');
      tag.className = 'site-tag';
      tag.textContent = label;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-btn';
      remove.textContent = '✕';
      remove.title = 'حذف';
      remove.setAttribute('aria-label', `حذف ${domain}`);
      remove.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({
          action: 'REMOVE_DOMAIN',
          hostname: domain,
          kind: kind === 'auto' ? 'auto' : 'manual',
          tabId
        });
        await refreshState();
      });

      item.append(name, tag, remove);
      sitesList.appendChild(item);
    });
  }

  async function refreshState() {
    if (!tabId || !hostname) return;
    const state = await chrome.runtime.sendMessage({ action: 'GET_STATE', tabId, hostname });
    if (!state) return;
    currentFontSize = state.fontSize;
    fontSizeDisplay.innerText = currentFontSize + 'px';
    fontSizeSlider.value = currentFontSize;
    fontFamilySelect.value = fontFamilies.includes(state.fontFamily) ? state.fontFamily : defaultFontFamily;
    updateBtnState(btnManual, state.manualActive, 'فعال', 'غیرفعال');
    updateBtnState(btnAuto, state.autoActive, 'روشن', 'خاموش');
    pageStatus.textContent = state.rtlActive
      ? 'راست‌چین روی این صفحه فعال است.'
      : 'راست‌چین روی این صفحه فعال نیست.';
    setFontControlsEnabled(state.rtlActive);
    renderSitesList(state.manualDomains, state.autoDomains);
  }

  // Current tab.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url = null;
  try {
    url = tab && tab.url ? new URL(tab.url) : null;
  } catch (error) {
    console.warn('Unable to read the active tab URL.', error);
  }

  const controls = [btnManual, btnAuto, btnFontPlus, btnFontMinus, fontFamilySelect, btnResetAppearance, fontSizeSlider];
  if (!tab || tab.id === undefined || !url || !['http:', 'https:'].includes(url.protocol)) {
    domainText.innerText = 'این صفحه پشتیبانی نمی‌شود';
    pageStatus.textContent = 'افزونه روی این صفحه کار نمی‌کند.';
    controls.forEach((el) => { el.disabled = true; });
    return;
  }

  tabId = tab.id;
  hostname = url.hostname;
  domainText.innerText = hostname;

  await refreshState();

  function updateFontSizeInPage() {
    fontSizeDisplay.innerText = currentFontSize + 'px';
    fontSizeSlider.value = currentFontSize;
    chrome.storage.local.set({
      customFontSize: currentFontSize,
      fontFamily: fontFamilySelect.value
    });
    chrome.runtime.sendMessage({
      action: 'UPDATE_FONT_SIZE',
      tabId,
      size: currentFontSize,
      fontFamily: fontFamilySelect.value
    });
  }

  btnFontPlus.addEventListener('click', () => {
    if (currentFontSize < 36) {
      currentFontSize += 1;
      updateFontSizeInPage();
    }
  });

  btnFontMinus.addEventListener('click', () => {
    if (currentFontSize > 10) {
      currentFontSize -= 1;
      updateFontSizeInPage();
    }
  });

  fontSizeSlider.addEventListener('input', () => {
    currentFontSize = Number(fontSizeSlider.value);
    updateFontSizeInPage();
  });

  fontFamilySelect.addEventListener('change', updateFontSizeInPage);

  btnResetAppearance.addEventListener('click', () => {
    currentFontSize = 16;
    fontFamilySelect.value = defaultFontFamily;
    updateFontSizeInPage();
  });

  btnManual.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ action: 'TOGGLE_MANUAL', hostname, tabId });
    if (res) await refreshState();
  });

  btnAuto.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({ action: 'TOGGLE_DOMAIN_AUTO', hostname, tabId });
    if (res) await refreshState();
  });
});
