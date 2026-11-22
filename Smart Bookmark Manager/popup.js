document.addEventListener('DOMContentLoaded', () => {
  const inputTitle = document.getElementById('bookmark-title');
  const inputUrl = document.getElementById('bookmark-url');
  const categorySelect = document.getElementById('category-select');
  const btnBookmark = document.getElementById('btn-bookmark');
  const btnCreateCategory = document.getElementById('btn-create-category');
  const inputNewCategory = document.getElementById('new-category-name');
  const status = document.getElementById('status');

  const ROOT_TITLE = 'Smart Bookmarks';
  const SAVE_LABEL = 'ذخیره در این دسته';
  let rootFolderId = null;
  let currentTabUrl = '';

  function showStatus(message, type = 'info') {
    status.textContent = message;
    status.className = `status status-${type}`;
  }

  function isBookmarkableUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Walk the bookmark tree for the root folder. The Bookmarks API has no
  // `title` search field, so searching by title never worked as written —
  // this replaces it with a real tree walk.
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

  // The background worker creates the root folder on install/startup and
  // stores its id; reuse that id so the popup never races the worker into
  // creating a second root folder.
  async function getRootFolder() {
    const stored = await chrome.storage.local.get('smartBookmarksRootId');
    if (stored.smartBookmarksRootId) {
      try {
        const nodes = await chrome.bookmarks.get(stored.smartBookmarksRootId);
        if (nodes[0] && !nodes[0].url) return nodes[0];
      } catch {
        // Stored id is stale (folder was deleted); fall through and recreate.
      }
    }
    const existing = await findRootFolder();
    if (existing) {
      await chrome.storage.local.set({ smartBookmarksRootId: existing.id });
      return existing;
    }
    const created = await chrome.bookmarks.create({ title: ROOT_TITLE });
    await chrome.storage.local.set({ smartBookmarksRootId: created.id });
    return created;
  }

  async function loadCategories() {
    const children = await chrome.bookmarks.getChildren(rootFolderId);
    const folders = children.filter(child => !child.url);
    categorySelect.replaceChildren();

    if (!folders.length) {
      const option = document.createElement('option');
      option.value = '';
      option.disabled = true;
      option.selected = true;
      option.textContent = 'هیچ دسته‌ای وجود ندارد';
      categorySelect.appendChild(option);
      return folders;
    }

    for (const folder of folders) {
      const option = document.createElement('option');
      option.value = folder.id;
      option.textContent = folder.title;
      categorySelect.appendChild(option);
    }
    return folders;
  }

  // Is this URL already saved inside one of our categories? Walks each
  // match's parent chain up to the root, so plain Chrome bookmarks (outside
  // Smart Bookmarks) never count as "already saved".
  async function findWhereSaved(url) {
    const matches = await chrome.bookmarks.search({ url });
    for (const match of matches) {
      let parentId = match.parentId;
      while (parentId) {
        if (parentId === rootFolderId) {
          const category = await chrome.bookmarks.get(match.parentId);
          return { folderId: match.parentId, folderTitle: category[0] ? category[0].title : '' };
        }
        const parents = await chrome.bookmarks.get(parentId);
        parentId = parents[0] ? parents[0].parentId : null;
      }
    }
    return null;
  }

  function setSaveButtonEnabled(enabled, label) {
    btnBookmark.disabled = !enabled;
    btnBookmark.textContent = label || SAVE_LABEL;
  }

  async function initialize() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab) {
        inputTitle.value = tab.title || '';
        inputUrl.value = isBookmarkableUrl(tab.url || '') ? tab.url : '';
        currentTabUrl = tab.url || '';
      }

      const root = await getRootFolder();
      rootFolderId = root.id;
      const folders = await loadCategories();

      // Pre-select the category used last time, when it still exists.
      const stored = await chrome.storage.local.get('smartBookmarksLastCategory');
      if (stored.smartBookmarksLastCategory && folders.some(f => f.id === stored.smartBookmarksLastCategory)) {
        categorySelect.value = stored.smartBookmarksLastCategory;
      }

      if (!folders.length) {
        showStatus('هنوز دسته‌ای نداری — اول یه دسته بساز.', 'info');
        inputNewCategory.focus();
      }

      if (tab && !isBookmarkableUrl(tab.url || '')) {
        showStatus('این صفحه قابل ذخیره نیست؛ آدرس یک سایت با http یا https وارد کنید.', 'error');
      } else if (tab && isBookmarkableUrl(tab.url)) {
        const saved = await findWhereSaved(tab.url);
        if (saved) {
          showStatus(`این صفحه در دستهٔ «${saved.folderTitle}» ذخیره شده.`, 'success');
          setSaveButtonEnabled(false, 'قبلاً ذخیره شده');
        }
      }
    } catch (error) {
      showStatus(`بارگذاری بوک‌مارک‌ها ناموفق بود: ${error.message}`, 'error');
      console.error('Unable to initialize Smart Bookmark Manager:', error);
    }
  }

  // Editing the URL re-enables saving (the "already saved" state only
  // applies to the tab's original URL).
  inputUrl.addEventListener('input', () => {
    if (inputUrl.value.trim() !== currentTabUrl) setSaveButtonEnabled(true);
  });

  // Enter saves / creates, so the popup works without touching the mouse.
  inputTitle.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); btnBookmark.click(); }
  });
  inputUrl.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); btnBookmark.click(); }
  });
  inputNewCategory.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); btnCreateCategory.click(); }
  });

  btnCreateCategory.addEventListener('click', async () => {
    const name = inputNewCategory.value.trim();
    if (!name) {
      showStatus('نام دسته‌بندی را وارد کنید.', 'error');
      inputNewCategory.focus();
      return;
    }
    if (!rootFolderId) {
      showStatus('پوشهٔ اصلی آماده نیست؛ پنجره را دوباره باز کنید.', 'error');
      return;
    }

    btnCreateCategory.disabled = true;
    try {
      const children = await chrome.bookmarks.getChildren(rootFolderId);
      const existing = children.find(child => !child.url && child.title === name);
      const folder = existing || await chrome.bookmarks.create({ parentId: rootFolderId, title: name });
      await loadCategories();
      categorySelect.value = folder.id;
      await chrome.storage.local.set({ smartBookmarksLastCategory: folder.id });
      inputNewCategory.value = '';
      showStatus(existing ? 'این دسته‌بندی از قبل وجود داشت.' : 'دسته‌بندی ساخته شد.', 'success');
    } catch (error) {
      showStatus(`ساخت دسته‌بندی ناموفق بود: ${error.message}`, 'error');
      console.error('Unable to create bookmark category:', error);
    } finally {
      btnCreateCategory.disabled = false;
    }
  });

  btnBookmark.addEventListener('click', async () => {
    const selectedFolderId = categorySelect.value;
    const finalTitle = inputTitle.value.trim();
    const finalUrl = inputUrl.value.trim();

    if (!selectedFolderId) {
      showStatus('یک دسته‌بندی انتخاب کنید.', 'error');
      categorySelect.focus();
      return;
    }
    if (!isBookmarkableUrl(finalUrl)) {
      showStatus('آدرس معتبر با http یا https وارد کنید.', 'error');
      inputUrl.focus();
      return;
    }

    btnBookmark.disabled = true;
    try {
      // Never create the same URL twice in one category.
      const siblings = await chrome.bookmarks.getChildren(selectedFolderId);
      if (siblings.some(child => child.url === finalUrl)) {
        showStatus('این صفحه قبلاً در این دسته ذخیره شده.', 'info');
        return;
      }
      await chrome.bookmarks.create({
        parentId: selectedFolderId,
        title: finalTitle || 'بدون عنوان',
        url: finalUrl
      });
      await chrome.storage.local.set({ smartBookmarksLastCategory: selectedFolderId });
      currentTabUrl = finalUrl;
      showStatus('بوک‌مارک ذخیره شد.', 'success');
      setSaveButtonEnabled(false, 'قبلاً ذخیره شده');
    } catch (error) {
      showStatus(`ذخیرهٔ بوک‌مارک ناموفق بود: ${error.message}`, 'error');
      console.error('Unable to create bookmark:', error);
    } finally {
      if (btnBookmark.textContent === SAVE_LABEL) btnBookmark.disabled = false;
    }
  });

  void initialize();
});
