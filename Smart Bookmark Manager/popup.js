document.addEventListener('DOMContentLoaded', () => {
  const inputTitle = document.getElementById('bookmark-title');
  const inputUrl = document.getElementById('bookmark-url');
  const categorySelect = document.getElementById('category-select');
  const btnBookmark = document.getElementById('btn-bookmark');
  const btnCreateCategory = document.getElementById('btn-create-category');
  const inputNewCategory = document.getElementById('new-category-name');
  const status = document.getElementById('status');

  let rootFolderId = null;

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

  async function getRootFolder() {
    const matches = await chrome.bookmarks.search({ title: 'Smart Bookmarks' });
    const root = matches.find(node => node.title === 'Smart Bookmarks' && !node.url);
    return root || chrome.bookmarks.create({ title: 'Smart Bookmarks' });
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
      return;
    }

    for (const folder of folders) {
      const option = document.createElement('option');
      option.value = folder.id;
      option.textContent = folder.title;
      categorySelect.appendChild(option);
    }
  }

  async function initialize() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (tab) {
        inputTitle.value = tab.title || '';
        inputUrl.value = isBookmarkableUrl(tab.url || '') ? tab.url : '';
      }

      const root = await getRootFolder();
      rootFolderId = root.id;
      await loadCategories();
      if (tab && !isBookmarkableUrl(tab.url || '')) {
        showStatus('این صفحه قابل ذخیره نیست؛ آدرس یک سایت با http یا https وارد کنید.', 'error');
      }
    } catch (error) {
      showStatus(`بارگذاری بوک‌مارک‌ها ناموفق بود: ${error.message}`, 'error');
      console.error('Unable to initialize Smart Bookmark Manager:', error);
    }
  }

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
      await chrome.bookmarks.create({
        parentId: selectedFolderId,
        title: finalTitle || 'بدون عنوان',
        url: finalUrl
      });
      showStatus('بوک‌مارک ذخیره شد.', 'success');
    } catch (error) {
      showStatus(`ذخیرهٔ بوک‌مارک ناموفق بود: ${error.message}`, 'error');
      console.error('Unable to create bookmark:', error);
    } finally {
      btnBookmark.disabled = false;
    }
  });

  void initialize();
});