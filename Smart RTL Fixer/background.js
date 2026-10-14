// ۱. مدیریت دستورات دستی از پاپ‌آپ
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_MANUAL") {
    if (request.state) {
      injectRTL(request.tabId);
    } else {
      removeRTL(request.tabId);
    }
  }
});

// ۲. سیستم تزریق خودکار هنگام باز شدن صفحات
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith("chrome://")) {
    try {
      const url = new URL(tab.url);
      const hostname = url.hostname;

      chrome.storage.local.get(['autoDomains'], (data) => {
        let domains = data.autoDomains || [];
        if (domains.includes(hostname)) {
          injectRTL(tabId);
        }
      });
    } catch (e) {}
  }
});

// تابع‌های کمکی برای تزریق و حذف
function injectRTL(tabId) {
  chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ["rtl-style.css"] }).catch(()=>{});
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => document.documentElement.setAttribute('data-rtl-active', 'true')
  }).catch(()=>{});
  
  chrome.action.setBadgeText({ text: "RTL", tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ color: "#00d26a", tabId: tabId });
}

function removeRTL(tabId) {
  chrome.scripting.removeCSS({ target: { tabId: tabId }, files: ["rtl-style.css"] }).catch(()=>{});
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: () => document.documentElement.removeAttribute('data-rtl-active')
  }).catch(()=>{});
  
  chrome.action.setBadgeText({ text: "", tabId: tabId });
}