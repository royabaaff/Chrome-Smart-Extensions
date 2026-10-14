document.addEventListener('DOMContentLoaded', async () => {
  const inputTitle = document.getElementById('bookmark-title');
  const inputUrl = document.getElementById('bookmark-url');
  const categorySelect = document.getElementById('category-select');
  const btnBookmark = document.getElementById('btn-bookmark');
  const btnCreateCategory = document.getElementById('btn-create-category');
  const inputNewCategory = document.getElementById('new-category-name');

  let rootFolderId = null;

  // ۱. دریافت اطلاعات تب فعلی و قرار دادن در کادرها (قابل ویرایش)
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0 && !tabs[0].url.startsWith("chrome://")) {
    inputTitle.value = tabs[0].title || "";
    inputUrl.value = tabs[0].url || "";
  }

  // ۲. پیدا کردن یا ساختن پوشه ریشه (Smart Bookmarks)
  chrome.bookmarks.search({ title: 'Smart Bookmarks' }, (results) => {
    if (results.length > 0) {
      rootFolderId = results[0].id;
      loadCategories();
    } else {
      chrome.bookmarks.create({ title: 'Smart Bookmarks' }, (newFolder) => {
        rootFolderId = newFolder.id;
        loadCategories();
      });
    }
  });

  // ۳. لود کردن زیرپوشه‌ها
  function loadCategories() {
    chrome.bookmarks.getChildren(rootFolderId, (children) => {
      categorySelect.innerHTML = '';
      const folders = children.filter(c => !c.url); 
      
      if (folders.length === 0) {
        const opt = document.createElement('option');
        opt.value = "";
        opt.disabled = true;
        opt.selected = true;
        opt.innerText = "هیچ دسته‌ای وجود ندارد";
        categorySelect.appendChild(opt);
        return;
      }

      folders.forEach(folder => {
        const opt = document.createElement('option');
        opt.value = folder.id;
        opt.innerText = folder.title;
        categorySelect.appendChild(opt);
      });
    });
  }

  // ۴. ساخت دسته جدید
  btnCreateCategory.addEventListener('click', () => {
    const name = inputNewCategory.value.trim();
    if (!name || !rootFolderId) return;

    chrome.bookmarks.create({ parentId: rootFolderId, title: name }, () => {
      inputNewCategory.value = '';
      const originalText = btnCreateCategory.innerText;
      btnCreateCategory.innerText = "پوشه ساخته شد!";
      setTimeout(() => { btnCreateCategory.innerText = originalText; }, 1500);
      loadCategories();
    });
  });

  // ۵. ذخیره سایت با اطلاعات دستی وارد شده
  btnBookmark.addEventListener('click', () => {
    const selectedFolderId = categorySelect.value;
    const finalTitle = inputTitle.value.trim();
    const finalUrl = inputUrl.value.trim();

    if (!selectedFolderId || !finalUrl) {
      alert("لطفاً یک دسته انتخاب کنید و آدرس را وارد نمایید.");
      return;
    }

    chrome.bookmarks.create({
      parentId: selectedFolderId,
      title: finalTitle || "بدون عنوان",
      url: finalUrl
    }, () => {
      const originalText = btnBookmark.innerText;
      btnBookmark.innerText = "ذخیره شد!";
      btnBookmark.style.backgroundColor = "var(--success)";
      setTimeout(() => { 
        btnBookmark.innerText = originalText; 
        btnBookmark.style.backgroundColor = "var(--primary)";
      }, 1500);
    });
  });
});