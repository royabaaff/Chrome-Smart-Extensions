// چک می‌کند که آیا آدرس فعلی قبلاً بوک‌مارک شده یا نه
function updateBadgeStatus(tabId, url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('edge://')) {
    chrome.action.setBadgeText({ text: '', tabId: tabId });
    return;
  }

  chrome.bookmarks.search({ url: url }, (results) => {
    if (results.length > 0) {
      // اگر قبلاً ذخیره شده بود، تیک سبز رنگ نشان بده
      chrome.action.setBadgeText({ text: "✔", tabId: tabId });
      chrome.action.setBadgeBackgroundColor({ color: "#00d26a", tabId: tabId });
    } else {
      // اگر جدید بود، آیکون خالی بماند
      chrome.action.setBadgeText({ text: "", tabId: tabId });
    }
  });
}

// وقتی تب‌ها جابجا می‌شوند
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab) updateBadgeStatus(tab.id, tab.url);
  });
});

// وقتی یک سایت لود می‌شود
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    updateBadgeStatus(tabId, tab.url);
  }
});

// آپدیت زنده آیکون به محض اینکه یک سایت ذخیره شود
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs[0] && tabs[0].url === bookmark.url) {
      updateBadgeStatus(tabs[0].id, tabs[0].url);
    }
  });
});

// وقتی افزونه نصب می‌شود پوشه اولیه را می‌سازد
chrome.runtime.onInstalled.addListener(() => {
  chrome.bookmarks.search({ title: 'Smart Bookmarks' }, (results) => {
    if (results.length === 0) {
      chrome.bookmarks.create({ parentId: '1', title: 'Smart Bookmarks' });
    }
  });
});