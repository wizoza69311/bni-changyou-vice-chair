const REPORTS_URL = "https://www.bniconnectglobal.com/web/secure/reportsHome";

function nextTaipeiOccurrence(day, hour) {
  const now = new Date();
  const taipei = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const target = new Date(taipei);
  target.setHours(hour, 0, 0, 0);
  target.setDate(target.getDate() + ((day - target.getDay() + 7) % 7));
  if (target <= taipei) target.setDate(target.getDate() + 7);
  return now.getTime() + (target.getTime() - taipei.getTime());
}

async function setSchedule(enabled) {
  await chrome.alarms.clearAll();
  if (!enabled) return;
  chrome.alarms.create("weekly-primary", { when: nextTaipeiOccurrence(4, 14), periodInMinutes: 7 * 24 * 60 });
  chrome.alarms.create("weekly-retry", { when: nextTaipeiOccurrence(5, 9), periodInMinutes: 7 * 24 * 60 });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get("autoSync", ({ autoSync }) => setSchedule(Boolean(autoSync)));
});
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get("autoSync", ({ autoSync }) => setSchedule(Boolean(autoSync)));
});
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "set-schedule") setSchedule(Boolean(message.enabled));
  if (message?.type === "scheduled-result") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon128.svg",
      title: "BNI 每週資料更新",
      message: message.ok ? "出缺席與會員 KPI 已更新完成。" : "更新未完成，請確認 BNI Connect 仍保持登入。",
    });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("weekly-")) return;
  let [tab] = await chrome.tabs.query({ url: "https://www.bniconnectglobal.com/web/secure/*" });
  if (!tab) tab = await chrome.tabs.create({ url: REPORTS_URL, active: false });
  if (tab.status !== "complete") {
    await new Promise((resolve) => {
      const listener = (tabId, info) => {
        if (tabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 30000);
    });
  }
  await chrome.windows.create({
    url: chrome.runtime.getURL("popup.html?auto=1"),
    type: "popup",
    focused: false,
    width: 390,
    height: 650,
  });
});
