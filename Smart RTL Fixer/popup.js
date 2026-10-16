document.addEventListener('DOMContentLoaded', async () => {
  const btnManual = document.getElementById('btn-manual-toggle');
  const btnAuto = document.getElementById('btn-auto-toggle');
  const domainText = document.getElementById('current-domain');

  const btnFontPlus = document.getElementById('btn-font-plus');
  const btnFontMinus = document.getElementById('btn-font-minus');
  const fontFamilySelect = document.getElementById('font-family-select');
  const btnResetAppearance = document.getElementById('btn-reset-appearance');
  const fontSizeDisplay = document.getElementById('font-size-display');

  let currentFontSize = 16;
  const defaultFontFamily = 'vazirmatn';
  const fontFamilies = ['vazirmatn', 'tahoma', 'system'];

  // دریافت تب فعال فعلی
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url;
  try {
    url = tab && tab.url ? new URL(tab.url) : null;
  } catch (error) {
    console.warn('Unable to read the active tab URL.', error);
  }

  if (!tab || tab.id === undefined || !url || !['http:', 'https:'].includes(url.protocol)) {
    domainText.innerText = "این صفحه پشتیبانی نمی‌شود";
    [btnManual, btnAuto, btnFontPlus, btnFontMinus, fontFamilySelect, btnResetAppearance].forEach((button) => {
      button.disabled = true;
    });
    return;
  }

  const hostname = url.hostname;
  domainText.innerText = hostname;

  // ۱. بررسی وضعیت‌ها و لود سایز فونت
  chrome.storage.local.get(['autoDomains', 'customFontSize', 'fontFamily'], (data) => {
    currentFontSize = Number.isInteger(data.customFontSize) && data.customFontSize >= 10 && data.customFontSize <= 36
      ? data.customFontSize
      : 16;
    fontFamilySelect.value = fontFamilies.includes(data.fontFamily) ? data.fontFamily : defaultFontFamily;
    fontSizeDisplay.innerText = currentFontSize + 'px';

    const domains = Array.isArray(data.autoDomains) ? data.autoDomains : [];
    let isAutoActive = domains.includes(hostname);
    updateBtnState(btnAuto, isAutoActive, "روشن", "خاموش");
  });

  // وضعیت اعمال دستی
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.hasAttribute('data-rtl-active')
    });
  } catch (error) {
    console.warn('Unable to access the active tab.', error);
    domainText.innerText = "کروم دسترسی به این صفحه را محدود کرده است";
    [btnManual, btnAuto, btnFontPlus, btnFontMinus, fontFamilySelect, btnResetAppearance].forEach((button) => {
      button.disabled = true;
    });
    return;
  }
  
  let isManualActive = results && results[0] ? results[0].result : false;
  updateBtnState(btnManual, isManualActive, "فعال", "غیرفعال");

  // دکمه تغییر فونت (+)
  btnFontPlus.addEventListener('click', () => {
    if (currentFontSize < 36) {
      currentFontSize += 1;
      updateFontSizeInPage();
    }
  });

  // دکمه تغییر فونت (-)
  btnFontMinus.addEventListener('click', () => {
    if (currentFontSize > 10) {
      currentFontSize -= 1;
      updateFontSizeInPage();
    }
  });

  fontFamilySelect.addEventListener('change', updateFontSizeInPage);
  btnResetAppearance.addEventListener('click', () => {
    currentFontSize = 16;
    fontFamilySelect.value = defaultFontFamily;
    updateFontSizeInPage();
  });

  function updateFontSizeInPage() {
    fontSizeDisplay.innerText = currentFontSize + 'px';
    chrome.storage.local.set({
      customFontSize: currentFontSize,
      fontFamily: fontFamilySelect.value
    });
    chrome.runtime.sendMessage({
      action: "UPDATE_FONT_SIZE",
      tabId: tab.id,
      size: currentFontSize,
      fontFamily: fontFamilySelect.value
    });
  }

  // دکمه دستی (Toggle این تب)
  btnManual.addEventListener('click', async () => {
    isManualActive = !isManualActive;
    updateBtnState(btnManual, isManualActive, "فعال", "غیرفعال");
    chrome.runtime.sendMessage({ action: "TOGGLE_MANUAL", tabId: tab.id, state: isManualActive });
  });

  // دکمه حالت خودکار (همیشه فعال برای این دامنه)
  btnAuto.addEventListener('click', () => {
    chrome.storage.local.get(['autoDomains'], (data) => {
      const domains = Array.isArray(data.autoDomains) ? data.autoDomains : [];
      const index = domains.indexOf(hostname);
      
      let isNowAutoActive = false;
      if (index === -1) {
        domains.push(hostname);
        isNowAutoActive = true;
        updateBtnState(btnAuto, true, "روشن", "خاموش");
      } else {
        domains.splice(index, 1);
        isNowAutoActive = false;
        updateBtnState(btnAuto, false, "روشن", "خاموش");
      }

      chrome.storage.local.set({ autoDomains: domains }, () => {
        chrome.runtime.sendMessage({
          action: "TOGGLE_DOMAIN_AUTO",
          hostname: hostname,
          state: isNowAutoActive,
          tabId: tab.id
        });
      });
    });
  });

  function updateBtnState(btn, isActive, textOn, textOff) {
    if (isActive) {
      btn.className = 'toggle-btn on';
      btn.innerText = textOn;
    } else {
      btn.className = 'toggle-btn off';
      btn.innerText = textOff;
    }
  }
});