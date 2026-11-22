// Smart Bookmark Manager — background service worker.
// Owns the "Smart Bookmarks" root folder and keeps a cached set of the URLs
// saved inside it, so the toolbar icon is fast and only reflects bookmarks
// in our own categories (never plain Chrome bookmarks elsewhere).

const ROOT_TITLE = 'Smart Bookmarks';
const SYNC_DELAY_MS = 300;

let rootFolderId = null;
let bookmarkedUrls = new Set();
let syncTimer = null;

function isWebUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

// Walk the bookmark tree for the root folder. The Bookmarks API has no
// `title` search field, so searching by title never worked as written.
async function findRootFolder() {
  const tree = await chrome.bookmarks.getTree();
  const stack = [...tree];
  while (stack.length) {
    const node = stack.pop();
    if (node.title === ROOT_TITLE && !node.url) return node;
    if (node.children) stack.push(...node.children);
  }
  return null;
}

async function getOrCreateRootFolder() {
  if (rootFolderId) {
    try {
      await chrome.bookmarks.get(rootFolderId);
      return rootFolderId;
    } catch {
      rootFolderId = null; // Folder was deleted; recreate below.
    }
  }
  const stored = await chrome.storage.local.get('smartBookmarksRootId');
  if (stored.smartBookmarksRootId) {
    try {
      const nodes = await chrome.bookmarks.get(stored.smartBookmarksRootId);
      if (nodes[0] && !nodes[0].url) {
        rootFolderId = nodes[0].id;
        return rootFolderId;
      }
    } catch {
      // Stored id is stale; fall through and recreate.
    }
  }
  const existing = await findRootFolder();
  if (existing) {
    rootFolderId = existing.id;
  } else {
    const created = await chrome.bookmarks.create({ title: ROOT_TITLE });
    rootFolderId = created.id;
  }
  await chrome.storage.local.set({ smartBookmarksRootId: rootFolderId });
  return rootFolderId;
}

// Rebuild the cached set of URLs inside the Smart Bookmarks tree.
async function rebuildBookmarkedUrls() {
  try {
    const rootId = await getOrCreateRootFolder();
    const subTree = await chrome.bookmarks.getSubTree(rootId);
    const urls = new Set();
    const stack = [...(subTree[0] && subTree[0].children ? subTree[0].children : [])];
    while (stack.length) {
      const node = stack.pop();
      if (node.url) urls.add(node.url);
      if (node.children) stack.push(...node.children);
    }
    bookmarkedUrls = urls;
  } catch (error) {
    console.error('Unable to rebuild bookmarked URLs:', error);
  }
}

async function updateIcon(tabId, url) {
  try {
    await chrome.action.setIcon({
      path: isWebUrl(url) && bookmarkedUrls.has(url) ? 'ON-128.png' : 'OFF-128.png',
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

// Any bookmark change schedules one rebuild + icon refresh (debounced, so
// rapid changes coalesce instead of searching every open tab each time).
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    await rebuildBookmarkedUrls();
    await refreshAllTabs();
  }, SYNC_DELAY_MS);
}

chrome.bookmarks.onCreated.addListener(scheduleSync);
chrome.bookmarks.onRemoved.addListener(scheduleSync);
chrome.bookmarks.onChanged.addListener(scheduleSync);
chrome.bookmarks.onMoved.addListener(scheduleSync);

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

chrome.runtime.onStartup.addListener(async () => {
  await rebuildBookmarkedUrls();
  await refreshAllTabs();
});

chrome.runtime.onInstalled.addListener(async () => {
  await rebuildBookmarkedUrls();
  await refreshAllTabs();
});
