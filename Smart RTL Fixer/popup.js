document.addEventListener('DOMContentLoaded', async () => {
  const btnManual = document.getElementById('btn-manual-toggle');
  const btnAuto = document.getElementById('btn-auto-toggle');
  const domainText = document.getElementById('current-domain');

  // دریافت تب فعال فعلی
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://")) {
    domainText.innerText = "صفحه سیستم (غیرقابل پشتیبانی)";
    return;
  }

  const url = new URL(tab.url);
  const hostname = url.hostname;
  domainText.innerText = hostname;

  // ۱. بررسی وضعیت فعال بودن دستی استایل روی این تب
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.hasAttribute('data-rtl-active')
  });
  
  let isManualActive = results && results[0] ? results[0].result : false;
  updateBtnState(btnManual, isManualActive, "فعال", "غیرفعال");

  // ۲. بررسی وضعیت لیست خودکار (Auto-Domain)
  chrome.storage.local.get(['autoDomains'], (data) => {
    let domains = data.autoDomains || [];
    let isAutoActive = domains.includes(hostname);
    updateBtnState(btnAuto, isAutoActive, "روشن", "خاموش");
  });

  // دکمه دستی (Toggle این تب)
  btnManual.addEventListener('click', async () => {
    isManualActive = !isManualActive;
    updateBtnState(btnManual, isManualActive, "فعال", "غیرفعال");
    
    // دستور اعمال یا حذف CSS به بک‌گراند فرستاده می‌شود تا آیکون آپدیت شود
    chrome.runtime.sendMessage({ action: "TOGGLE_MANUAL", tabId: tab.id, state: isManualActive });
  });

  // دکمه حالت خودکار
  btnAuto.addEventListener('click', () => {
    chrome.storage.local.get(['autoDomains'], (data) => {
      let domains = data.autoDomains || [];
      const index = domains.indexOf(hostname);
      
      if (index === -1) {
        domains.push(hostname); // اضافه به لیست خودکار
        updateBtnState(btnAuto, true, "روشن", "خاموش");
      } else {
        domains.splice(index, 1); // حذف از لیست
        updateBtnState(btnAuto, false, "روشن", "خاموش");
      }
      chrome.storage.local.set({ autoDomains: domains });
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