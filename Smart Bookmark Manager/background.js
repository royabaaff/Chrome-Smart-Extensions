const latestIconUpdate = new Map();

async function updateIcon(tabId, url) {
  const requestId = (latestIconUpdate.get(tabId) || 0) + 1;
  latestIconUpdate.set(tabId, requestId);

  try {
    const isWebUrl = typeof url === 'string' && /^https?:\/\//i.test(url);
    const matches = isWebUrl ? await chrome.bookmarks.search({ url }) : [];
    if (latestIconUpdate.get(tabId) !== requestId) return;

    await chrome.action.setIcon({
      path: matches.length ? 'ON-128.png' : 'OFF-128.png',
      tabId
    });
  } catch (error) {
    console.error(`Unable to update bookmark icon for tab ${tabId}:`, error);
  }
}

async function refreshAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs
      .filter(tab => Number.isInteger(tab.id))
      .map(tab => updateIcon(tab.id, tab.url)));
  } catch (error) {
    console.error('Unable to refresh bookmark icons:', error);
  }
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateIcon(tabId, tab.url);
  } catch (error) {
    console.error(`Unable to read activated tab ${tabId}:`, error);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    void updateIcon(tabId, tab.url);
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  latestIconUpdate.delete(tabId);
});

chrome.bookmarks.onCreated.addListener(() => {
  void refreshAllTabs();
});

chrome.bookmarks.onRemoved.addListener(() => {
  void refreshAllTabs();
});

chrome.bookmarks.onChanged.addListener(() => {
  void refreshAllTabs();
});

chrome.runtime.onStartup.addListener(() => {
  void refreshAllTabs();
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const matches = await chrome.bookmarks.search({ title: 'Smart Bookmarks' });
    if (!matches.some(node => node.title === 'Smart Bookmarks' && !node.url)) {
      await chrome.bookmarks.create({ title: 'Smart Bookmarks' });
    }
  } catch (error) {
    console.error('Unable to create the Smart Bookmarks folder:', error);
  }

  await refreshAllTabs();
});