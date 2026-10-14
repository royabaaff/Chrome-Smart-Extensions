// ==========================================
// ۱. مدیریت نشانگر روی آیکون (Badge)
// ==========================================
function updateBadge(isActive) {
  if (isActive !== false) { // اگر سیستم روشن باشد (یا حالت پیش‌فرض)
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#00d26a" }); // سبز
  } else { // اگر سیستم خاموش باشد
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#f74f5e" }); // قرمز
  }
}

// تنظیم وضعیت آیکون هنگام اجرای کروم یا نصب افزونه
chrome.runtime.onStartup.addListener(initBadge);
chrome.runtime.onInstalled.addListener(initBadge);

function initBadge() {
  chrome.storage.local.get(['autoDiscardActive'], (data) => {
    updateBadge(data.autoDiscardActive);
  });
}

// این بخش تغییرات دکمه خاموش/روشن در پاپ‌آپ را در لحظه تشخیص می‌دهد و آیکون را آپدیت می‌کند
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.autoDiscardActive !== undefined) {
    updateBadge(changes.autoDiscardActive.newValue);
  }
});

// ==========================================
// ۲. سیستم فریز خودکار تب‌ها
// ==========================================
chrome.alarms.create("checkTabsMemory", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkTabsMemory") {
    chrome.storage.local.get(['autoDiscardActive', 'discardTimeout'], (data) => {
      // اگر افزونه خاموش بود، هیچ کاری نکن
      if (data.autoDiscardActive === false) return;

      const timeoutMinutes = data.discardTimeout || 5;
      const timeoutMilliseconds = timeoutMinutes * 60 * 1000;
      const now = Date.now();

      chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
        tabs.forEach(tab => {
          // محاسبه زمان سپری شده از آخرین باری که کاربر این تب را دیده است
          const timeSinceLastAccess = now - (tab.lastAccessed || now);

          if (!tab.audible && timeSinceLastAccess >= timeoutMilliseconds) {
            chrome.tabs.discard(tab.id);
          }
        });
      });
    });
  }
});

// ==========================================
// ۳. سیستم فریز فوری (دستی)
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "DISCARD_ALL_NOW") {
    chrome.tabs.query({ active: false, discarded: false }, (tabs) => {
      tabs.forEach(tab => {
        if (!tab.audible) {
          chrome.tabs.discard(tab.id);
        }
      });
    });
  }
});

// یک بار اجرای تابع برای زمانی که افزونه را همین الان رفرش می‌کنید
initBadge();