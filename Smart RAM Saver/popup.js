document.addEventListener('DOMContentLoaded', () => {
  const btnToggle = document.getElementById('btn-toggle');
  const btnSave = document.getElementById('btn-save');
  const btnDiscardNow = document.getElementById('btn-discard-now');
  const inputTimeout = document.getElementById('timeout-input');

  // لود کردن تنظیمات ذخیره شده
  chrome.storage.local.get(['autoDiscardActive', 'discardTimeout'], (data) => {
    const isActive = data.autoDiscardActive !== false; // پیش‌فرض روشن
    const timeout = data.discardTimeout || 5; // پیش‌فرض 5 دقیقه

    updateToggleUI(isActive);
    inputTimeout.value = timeout;
  });

  // روشن/خاموش کردن سیستم
  btnToggle.addEventListener('click', () => {
    const isCurrentlyOn = btnToggle.classList.contains('on');
    const newState = !isCurrentlyOn;
    chrome.storage.local.set({ autoDiscardActive: newState });
    updateToggleUI(newState);
  });

  // ذخیره زمان
  btnSave.addEventListener('click', () => {
    let newTimeout = parseInt(inputTimeout.value);
    if (newTimeout < 1) newTimeout = 1;
    chrome.storage.local.set({ discardTimeout: newTimeout });
    
    const originalText = btnSave.innerText;
    btnSave.innerText = "ذخیره شد!";
    setTimeout(() => { btnSave.innerText = originalText; }, 1500);
  });

  // پاکسازی فوری
  btnDiscardNow.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "DISCARD_ALL_NOW" });
    const originalText = btnDiscardNow.innerText;
    btnDiscardNow.innerText = "تب‌ها فریز شدند!";
    setTimeout(() => { btnDiscardNow.innerText = originalText; }, 2000);
  });

  function updateToggleUI(isActive) {
    if (isActive) {
      btnToggle.className = 'toggle-btn on';
      btnToggle.innerText = 'فعال';
    } else {
      btnToggle.className = 'toggle-btn off';
      btnToggle.innerText = 'غیرفعال';
    }
  }
});