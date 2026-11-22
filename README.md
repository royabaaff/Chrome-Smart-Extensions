# Chrome Smart Extensions

A collection of lightweight, high-performance Chrome extensions built on
Manifest V3 — for productivity, system optimization, proxy management, and
text styling. Each extension lives in its own folder and can be installed
independently.

| Extension | Version | What it does |
| --- | --- | --- |
| Smart Style & Font | 1.2 | Inspect any element's styles and colors, with a page palette |
| Smart Bookmark Manager | 2.1 | Save tabs into categorized bookmark folders |
| Smart RAM Saver | 2.2 | Freeze inactive tabs to save memory |
| Smart RTL Fixer | 2.3 | Right-to-left chat pages, full-width layout, copyable code |
| Smart SOCKS Proxy | 2.5 | SOCKS5 proxy with a curated Iran-only bypass list and live IP |

---

## Installation

These extensions are not on the Chrome Web Store. Install them as
**unpacked extensions** — it takes about a minute per extension.

### 1. Get the code

**Option A — Git (recommended for updates):**

```bash
git clone https://github.com/royabaaff/Chrome-Smart-Extensions.git
```

**Option B — Download ZIP:**

1. On the repository page, click **Code → Download ZIP**.
2. Extract the ZIP anywhere (for example, your Documents folder).

### 2. Load an extension in Chrome

1. Open Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the folder of the extension you want — for example,
   `Chrome-Smart-Extensions/Smart RAM Saver`.
   Select the extension's own folder, **not** the repository root.
5. Repeat for each extension you want.
6. Optional: click the puzzle-piece icon in the toolbar and **pin** the
   extensions you use often, so their icons stay visible.

> Chrome may show a developer-mode notice when it starts. That is normal
> for unpacked extensions — just dismiss it.

### 3. Updating to a new version

1. Update the code: `git pull`, or download and extract the ZIP again.
2. Go to `chrome://extensions/` and click the **reload** (circular arrow)
   icon on the extension's card.
3. There is no need to remove and re-add the extension; its settings are
   kept.

---

## Smart Style & Font — v1.2

Inspect the styles of any element on any page.

**Features**

- Hover any element to see its selector, dimensions, display/position,
  font family, size, weight, line height, letter spacing, actual rendered
  text and background colors (composited through transparency), background
  image, border radius, margin, and padding.
- **Pin** an element (button, `Shift + Click`, or `Alt + Shift + P`);
  `Esc` closes the panel.
- **Copy CSS** for the inspected element; click any value to copy it.
- **Page palette** tab: the page's top colors and typography combinations.
- The panel is draggable.
- Injected on demand only — nothing runs on a page until you open the
  inspector. On non-web pages (for example `chrome://`) it shows a
  notification instead of failing silently.

**Usage:** click the toolbar icon, hover elements, `Shift + Click` to pin
one, `Esc` to close.

**Permissions:** `activeTab`, `scripting`, `notifications`.

---

## Smart Bookmark Manager — v2.1

Save the current tab into organized categories under a
**Smart Bookmarks** root folder.

**Features**

- Categories you create yourself; the current tab's title and URL are
  filled in automatically.
- Duplicate check: saving a URL that is already in a category is refused
  with a clear message.
- The popup tells you when the page is already saved ("already saved in
  category X") and disables the save button.
- The toolbar icon reflects only bookmarks inside Smart Bookmarks — not
  plain Chrome bookmarks.
- `Enter` saves or creates a category; the last-used category is
  remembered; when there are no categories yet, the focus goes to the
  create box with guidance.

**Permissions:** `bookmarks`, `tabs`, `storage`.

---

## Smart RAM Saver — v2.2

Automatically freeze inactive tabs to free memory. Frozen tabs stay in
the tab bar — click one to reload it.

**Features**

- Auto-freeze after a configurable timeout (default 5 minutes, 1–120).
  A timeout is measured from when the tab was last used, tracked by the
  extension itself, so it works even when Chrome does not report a
  last-accessed time.
- Never freezes the active tab, audible tabs, pinned tabs, already-frozen
  tabs, or tabs on excluded domains.
- **Exclusion list:** exclude the current site, and manage the full list
  (remove any domain) from the popup.
- **Timeout presets:** 5 / 15 / 30 / 60 minutes.
- **Frozen tabs list:** click a frozen tab in the popup to restore it.
- **Freeze now** button for all eligible inactive tabs.
- Warns that unsaved form data in a frozen tab can be lost on reload.

**Permissions:** `tabs`, `storage`, `alarms`.

---

## Smart RTL Fixer — v2.3

Right-to-left layout and typography for chat pages and AI assistants
(ChatGPT, Claude, Gemini, DeepSeek, and others).

**Features**

- RTL is applied to **chat/message content only** — menus, navigation,
  sidebars, and headers stay left-to-right.
- **Full-width layout:** the narrow centered chat column is widened so
  the conversation uses the full page width.
- **Font:** Vazirmatn / Tahoma / system font, size 10–36 px (slider and
  `+` / `−` buttons).
- **Code blocks:** a neutral, theme-friendly box that preserves the
  site's own syntax highlighting, and a **Copy** button on every code
  block that does not already have one.
- **Manual toggle** (this site, saved — survives reload) and
  **auto-apply** (always RTL for this site); an active-sites list shows
  every saved site with a remove button.
- Code-area tool buttons are kept left-to-right and readable.

**Usage:** open the popup on a chat page, turn on RTL for the page (or
auto-apply for the whole site), adjust the font size.

**Permissions:** `activeTab`, `scripting`, `storage`, `tabs`;
host permission `<all_urls>` (needed to apply RTL on any site).

---

## Smart SOCKS Proxy — v2.5

SOCKS5 proxy with a curated Iran-only bypass list and a live IP display.

**Features**

- Connect to any SOCKS5 server (host + port). No username/password is
  needed or supported.
- **Bypass list (Iran only, 112 entries):** `*.ir` covers every `.ir`
  domain, plus 108 Iranian services on other domains — shopping
  (Digikala, Torob, Okala), ride and delivery (Snapp, Alopeyk),
  banks and payment (Blu Bank, ZarinPal), travel (SnappTrip, Alibaba),
  messaging (Eitaa, Bale, Gap), video (Aparat, Filimo), news
  (Varzesh3, Tasnim, Mehr), stock and crypto (TSETMC, Ramzinex),
  health, education, jobs, and more.
- **Save button:** the bypass list is saved exactly as you leave it.
  Defaults are applied only on first run; a **reset to defaults**
  button restores the curated Iran list.
- **Live IP:** the cached IP is shown instantly when the popup opens,
  then refreshed in the background (with a "last updated" time). Click
  the IP to copy it. A failed refresh never blanks a good cached IP.
- **Connect verification:** after connecting, the proxy is tested — if
  the server does not respond, you get a warning instead of a plain
  "connected".
- The toolbar icon shows the proxy state and the country code of the
  current IP as a badge; the tooltip shows the country and IP.
- The real proxy state is read from Chrome itself, so the status cannot
  drift if the proxy is changed elsewhere.

**Usage:** enter the server IP and port, review the bypass list, click
**Connect**. Use **Save** after editing the bypass list.

**Permissions:** `proxy`, `storage`; host permission
`https://ipwho.is/*` (IP and country lookup only).

---

## Permissions — why each one is needed

| Permission | Used by | Purpose |
| --- | --- | --- |
| `activeTab`, `scripting` | Style & Font, RTL Fixer | Inspect / restyle the current page only when you ask |
| `notifications` | Style & Font | Tell you when the inspector cannot run on a page |
| `bookmarks`, `tabs` | Bookmark Manager | Read and create bookmarks; read the current tab |
| `storage` | Bookmark Manager, RAM Saver, RTL Fixer, SOCKS Proxy | Save your settings on your machine |
| `alarms` | RAM Saver | Check once a minute for tabs to freeze |
| `proxy` | SOCKS Proxy | Set and clear the browser proxy |
| `https://ipwho.is/*` | SOCKS Proxy | Look up the current public IP and country |

No data leaves your machine except the SOCKS Proxy IP lookup
(`ipwho.is`) and the proxy traffic itself when the proxy is on.

---

## Testing checklist

Use this when re-testing an extension after an update. Check each item
and note anything that does not behave as described.

### Smart Style & Font

- [ ] Toolbar icon opens the inspector on a normal web page.
- [ ] Hovering elements shows correct selector, font, and colors.
- [ ] `Shift + Click` pins an element; `Esc` closes the panel.
- [ ] The panel can be dragged by its header.
- [ ] The Page palette tab lists the page's top colors.
- [ ] On a `chrome://` page, a notification appears instead of silence.

### Smart Bookmark Manager

- [ ] Saving the current tab creates it under the chosen category.
- [ ] Saving the same URL twice in one category is refused.
- [ ] Reopening the popup on a saved page shows "already saved in
      category X" with the save button disabled.
- [ ] The toolbar icon is ON only for pages saved in Smart Bookmarks —
      a plain Chrome bookmark of the same page does not turn it on.
- [ ] `Enter` in the title/URL field saves; the last-used category is
      pre-selected next time.

### Smart RAM Saver

- [ ] A tab left inactive longer than the timeout is frozen.
- [ ] Active, audible, and pinned tabs are never frozen.
- [ ] Excluding the current site stops its tabs from being frozen.
- [ ] The exclusion list shows all excluded domains, each with a
      remove button.
- [ ] The frozen-tabs list shows frozen tabs; clicking one restores it.
- [ ] Preset buttons (5 / 15 / 30 / 60) change and save the timeout.

### Smart RTL Fixer

- [ ] On an AI chat page, the messages become right-to-left and the
      chat column widens; menus and the sidebar stay left-to-right.
- [ ] The manual toggle survives a page reload.
- [ ] Turning auto-apply on for a site applies RTL on every new tab of
      that site.
- [ ] Code blocks keep the site's syntax colors and show a Copy button
      that copies the code.
- [ ] The font-size slider changes the text size; reset restores 16 px.
- [ ] The active-sites list shows saved sites with working remove
      buttons.

### Smart SOCKS Proxy

- [ ] Connecting with a valid server shows "connected" and the IP
      updates (with country and "last updated" time).
- [ ] The bypass list shows 112 entries on a fresh install.
- [ ] Editing the bypass list and clicking **Save** keeps the change
      after closing and reopening the popup.
- [ ] **Reset to defaults** restores the curated Iran list.
- [ ] Iranian sites in the bypass list (for example digikala.com)
      load directly; other sites go through the proxy.
- [ ] Disconnecting restores direct internet and the IP display.
- [ ] Clicking the displayed IP copies it.

---

## Troubleshooting

- **An extension does not appear in the toolbar:** click the
  puzzle-piece icon and pin it.
- **"Load unpacked" is greyed out or missing:** make sure
  **Developer mode** is on at `chrome://extensions/`.
- **"Could not load manifest" / nothing loads:** you selected the
  wrong folder. Select the extension's own folder (for example
  `Smart RAM Saver`), not the repository root.
- **RTL Fixer does nothing on a page:** it only works on `http(s)`
  pages (not `chrome://` or the Chrome Web Store), and only restyles
  chat/message content — a page with no chat or markdown content will
  look unchanged.
- **RAM Saver does not freeze a tab:** check the timeout, and that the
  tab is inactive, not audible, not pinned, and its domain is not
  excluded.
- **SOCKS Proxy says connected but pages do not load:** the proxy
  server may be down. Check the IP display and the warning message;
  verify the host and port, then try disconnecting and reconnecting.
- **The IP is slow or shows an error:** the last known IP stays on
  screen; click **Refresh IP** to retry. The lookup needs internet
  access to `ipwho.is`.
- **Settings seem lost after an update:** use the reload button on the
  extension's card at `chrome://extensions/` instead of removing and
  re-adding it — removal deletes the extension's stored settings.

---

## Changelog

- **Smart SOCKS Proxy 2.5** — Bypass list expanded to 112 entries
  (all non-`.ir` Iranian services verified to resolve).
- **Smart SOCKS Proxy 2.4** — Save button for the bypass list, live IP
  display, real proxy state, connect verification.
- **Smart RTL Fixer 2.3** — RTL scoped to chat content, full-width
  column, copyable code boxes, font slider, active-sites list.
- **Smart RAM Saver 2.2** — Manageable exclusion list, frozen-tabs
  list, timeout presets, robust last-used tracking.
- **Smart Bookmark Manager 2.1** — Real root-folder search, duplicate
  check, accurate toolbar icon, professional popup UX.
- **Smart Style & Font 1.2** — New extension: on-demand injection,
  accurate color compositing, draggable panel, English UI.
- **1.0 – 2.3 (earlier)** — Initial releases of Bookmark Manager,
  RAM Saver, RTL Fixer, and SOCKS Proxy.

---

## License

This project is open-source under the
[MIT License](LICENSE).
