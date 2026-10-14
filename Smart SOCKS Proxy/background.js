function setProxy(ip, port, bypassStr) {
  let bypassArray = bypassStr.split(',').map(item => item.trim()).filter(item => item !== "");
  if (!bypassArray.includes("localhost")) bypassArray.push("localhost");
  if (!bypassArray.includes("127.0.0.1")) bypassArray.push("127.0.0.1");

  let config = {
    mode: "fixed_servers",
    rules: { singleProxy: { scheme: "socks5", host: ip, port: parseInt(port) }, bypassList: bypassArray }
  };
  
  chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
    chrome.storage.local.set({ proxyActive: true });
    checkIPAndGeo(true);
  });
}

function clearProxy() {
  let config = { mode: "direct" };
  chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
    chrome.storage.local.set({ proxyActive: false });
    checkIPAndGeo(false);
  });
}

async function checkIPAndGeo(isProxyActive) {
  try {
    let response = await fetch('https://ipwho.is/'); 
    let data = await response.json();
    
    if (data.success) {
      chrome.storage.local.set({ lastGeo: data });
      chrome.action.setBadgeText({ text: data.country_code });
      chrome.action.setBadgeBackgroundColor({ color: isProxyActive ? "#00d26a" : "#38384a" });
      
      chrome.runtime.sendMessage({ action: "UPDATE_UI", proxyActive: isProxyActive, geoData: data }).catch(() => {});
    }
  } catch (error) {
    console.error("خطا در دریافت آی‌پی:", error);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SET_PROXY") setProxy(request.ip, request.port, request.bypass);
  else if (request.action === "CLEAR_PROXY") clearProxy();
});

chrome.runtime.onStartup.addListener(() => {
  const defaultBypass = "*.ir, localhost, 127.0.0.1, aparat.com, filimo.com, namava.ir, digikala.com, torob.com, divar.ir, snapp.ir, snapp.taxi, tap33.ir, blubank.com, sb24.ir, bmi.ir, bankmellat.ir, tejaratbank.ir, eitaa.com, bale.ai, rubika.ir, my.gov.ir, tax.gov.ir, tamin.ir, elaitoys.ir, persian-mortgage.com, imolaei.ir";
  
  chrome.storage.local.get(['proxyActive', 'savedIp', 'savedPort', 'savedBypass'], (data) => {
    if (data.proxyActive && data.savedIp && data.savedPort) {
        setProxy(data.savedIp, data.savedPort, data.savedBypass || defaultBypass);
    } else {
        checkIPAndGeo(false);
    }
  });
});

// فقط چک کردن آی‌پی هر 2 دقیقه برای آپدیت ماندن آیکون
chrome.alarms.create("ipCheckTimer", { periodInMinutes: 2 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ipCheckTimer") {
    chrome.storage.local.get(['proxyActive'], (data) => {
      checkIPAndGeo(data.proxyActive || false);
    });
  }
});