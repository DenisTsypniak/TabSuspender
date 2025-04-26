// background.js

let suspensionTime = 600; // За замовчуванням: 10 хвилин (600 секунд)
let whitelistUrls = [];
let whitelistDomains = [];
let preventSuspendIfVideoPaused = false; // Чи забороняти призупинення при відео на паузі
let enableScreenshots = true; // Чи увімкнені скріншоти на сторінці призупинення UI
let lastActivity = {}; // Мітки часу останньої активності вкладок { tabId: timestamp }
const suspendedTabInfo = {}; // Зберігає оригінальну інформацію про вкладки { tabId: { url, title, favIconUrl, suspendedTime, reason } }

// Стан відео по вкладках { tabId: { hasVideo: boolean, isPlaying: boolean, hasPlayed: boolean } }
const videoState = {};

const ALARM_NAME = 'checkInactiveTabs'; // Ім'я для Chrome Alarm

// --- Керування скріншотами активної вкладки ---
const SCREENSHOT_INITIAL_DELAY = 500; // Затримка перед першим скріншотом після активації (0.5 секунди)
const SCREENSHOT_INTERACTION_DEBOUNCE = 1000; // Debounce затримка для захоплення після взаємодії (1 секунда)

let interactionCaptureTimeoutId = null; // ID тайм-ауту для debounced захоплення
const initialCaptureTimeouts = new Map(); // ID тайм-аутів початкового захоплення за Tab ID

// Захоплення та збереження скріншоту для вказаної вкладки
async function captureAndSaveScreenshotForTab(tabId, windowId) {
    if (!enableScreenshots) {
        // Очищаємо початковий тайм-аут, якщо був запланований, але опція вимкнена
         if (initialCaptureTimeouts.has(tabId)) {
            clearTimeout(initialCaptureTimeouts.get(tabId));
            initialCaptureTimeouts.delete(tabId);
        }
        return; // Не виконуємо захоплення
    }

    if (typeof chrome === 'undefined' || !chrome.tabs || typeof chrome.tabs.captureVisibleTab !== 'function') {
         console.warn("Service worker: chrome.tabs.captureVisibleTab API недоступний для скріншоту.");
         return;
    }

    chrome.tabs.get(tabId, async (tab) => {
        if (chrome.runtime.lastError || !tab || tab.id === chrome.tabs.TAB_ID_NONE || tab.windowId === chrome.windows.WINDOW_ID_NONE) {
             // Очищаємо початковий тайм-аут, якщо отримання вкладки не вдалося
             if (initialCaptureTimeouts.has(tabId)) {
                clearTimeout(initialCaptureTimeouts.get(tabId));
                initialCaptureTimeouts.delete(tabId);
             }
             return;
        }

        const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
        const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
        const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
        if (isInternalPage || isOurSuspendedPage || !tab.url.startsWith('http')) {
             // Очищаємо початковий тайм-аут, якщо вкладка не підходить
             if (initialCaptureTimeouts.has(tabId)) {
                clearTimeout(initialCaptureTimeouts.get(tabId));
                initialCaptureTimeouts.delete(tabId);
             }
            return;
        }

        if (!tab.active) {
             // Очищаємо початковий тайм-аут, якщо вкладка вже не активна
             if (initialCaptureTimeouts.has(tabId)) {
                clearTimeout(initialCaptureTimeouts.get(tabId));
                initialCaptureTimeouts.delete(tabId);
             }
             return;
        }

        try {
            const screenshotUrl = await chrome.tabs.captureVisibleTab(windowId);
            try {
                 await chrome.storage.session.remove(`screenshot_${tabId}`);
                 await chrome.storage.session.set({ [`screenshot_${tabId}`]: screenshotUrl });
            } catch (storageError) {
                 console.error(`Service worker: Помилка збереження скріншоту для вкладки ${tabId}:`, storageError);
            }

        } catch (error) {
            if (error.message) {
                if (error.message.includes("Tabs cannot be edited right now") || error.message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota")) {
                     console.warn(`Service worker: Скріншот вкладки ${tabId} пропущено: ${error.message}`);
                } else {
                    console.error(`Service worker: Помилка захоплення скріншоту для вкладки ${tabId}:`, error);
                    chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення старого скріншоту для ${tabId}:`, e));
                }
            } else {
                 console.error(`Service worker: Невідома помилка захоплення скріншоту для вкладки ${tabId}:`, error);
                  chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення старого скріншоту для ${tabId}:`, e));
            }
        }

        // Видаляємо ID початкового тайм-ауту після його спрацювання
        if (initialCaptureTimeouts.has(tabId)) {
            initialCaptureTimeouts.delete(tabId);
        }
    });
}

// Debounced функція для захоплення скріншоту при взаємодії
const debouncedCaptureOnInteraction = (tabId, windowId) => {
    if (!enableScreenshots) {
        clearTimeout(interactionCaptureTimeoutId);
        return;
    }
    clearTimeout(interactionCaptureTimeoutId);
    interactionCaptureTimeoutId = setTimeout(() => {
        captureAndSaveScreenshotForTab(tabId, windowId);
    }, SCREENSHOT_INTERACTION_DEBOUNCE);
};

// --- Функція міграції даних ---
function migrateStorageData(data, callback) {
    const changes = {};
    let migrated = false;

    // Міграція whitelistUrls
    if (typeof data.whitelistUrls === 'string') {
        changes.whitelistUrls = data.whitelistUrls.split(',').map(url => url.trim()).filter(url => url);
        migrated = true;
    } else if (Array.isArray(data.whitelistUrls)) {
         const cleanedUrls = data.whitelistUrls.filter(url => typeof url === 'string' && url.trim()).map(url => url.trim());
         if (cleanedUrls.length !== data.whitelistUrls.length || data.whitelistUrls.some(url => typeof url !== 'string' || url.trim() !== url)) {
             changes.whitelistUrls = cleanedUrls;
             migrated = true;
         } else {
             changes.whitelistUrls = data.whitelistUrls;
         }
    } else if (data.whitelistUrls === undefined) {
         changes.whitelistUrls = [];
         migrated = true;
    } else {
         changes.whitelistUrls = [];
         migrated = true;
         console.warn("Service worker: Міграція: whitelistUrls мав неочікуваний формат.");
    }

    // Міграція whitelistDomains
    if (typeof data.whitelistDomains === 'string') {
        changes.whitelistDomains = data.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain);
        migrated = true;
    } else if (Array.isArray(data.whitelistDomains)) {
         const cleanedDomains = data.whitelistDomains.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase());
         if (cleanedDomains.length !== data.whitelistDomains.length || data.whitelistDomains.some(d => typeof d !== 'string' || d.trim().toLowerCase() !== d)) {
             changes.whitelistDomains = cleanedDomains;
             migrated = true;
         } else {
              changes.whitelistDomains = data.whitelistDomains;
         }
    } else if (data.whitelistDomains === undefined) {
        changes.whitelistDomains = [];
        migrated = true;
    } else {
         changes.whitelistDomains = [];
         migrated = true;
         console.warn("Service worker: Міграція: whitelistDomains мав неочікуваний формат.");
    }

     // Міграція/встановлення значень за замовчуванням
     if (data.enableScreenshots === undefined || typeof data.enableScreenshots !== 'boolean') { changes.enableScreenshots = true; migrated = true; } else { changes.enableScreenshots = data.enableScreenshots; }
     if (data.preventSuspendIfVideoPaused === undefined || typeof data.preventSuspendIfVideoPaused !== 'boolean') { changes.preventSuspendIfVideoPaused = false; migrated = true; } else { changes.preventSuspendIfVideoPaused = data.preventSuspendIfVideoPaused; }
      if (data.suspensionTime === undefined || isNaN(parseInt(data.suspensionTime))) { changes.suspensionTime = 600; migrated = true; } else { changes.suspensionTime = parseInt(data.suspensionTime); }
     if (data.language === undefined || typeof data.language !== 'string' || !['uk', 'en'].includes(data.language)) { changes.language = 'uk'; migrated = true; } else { changes.language = data.language; }
     if (data.theme === undefined || typeof data.theme !== 'string' || !['light', 'dark'].includes(data.theme)) { changes.theme = 'light'; migrated = true; } else { changes.theme = data.theme; }


    if (migrated) {
        chrome.storage.sync.set(changes, () => {
            if (chrome.runtime.lastError) {
                 console.error("Service worker: Помилка при збереженні мігрованих даних:", chrome.runtime.lastError);
            }
            callback(); // Викликаємо callback після спроби збереження
        });
    } else {
        callback(); // Викликаємо callback, якщо міграція не потрібна
    }
}

// --- Функція встановлення Alarm ---
function setupAlarm(nextCheckTime = Date.now() + suspensionTime * 1000) {
    if (typeof chrome === 'undefined' || !chrome.alarms) {
        console.error("Service worker: chrome.alarms API недоступний!");
        return;
    }

    chrome.alarms.clear(ALARM_NAME)
        .catch((error) => { console.warn(`Service worker: Помилка очищення Alarm '${ALARM_NAME}': ${error.message}`); })
        .finally(() => {
            if (suspensionTime > 0) {
                const when = Math.max(Date.now() + 5000, nextCheckTime);
                const minAlarmDelayMillis = 1000;

                if (chrome.alarms && typeof chrome.alarms.create === 'function') {
                    chrome.alarms.create(ALARM_NAME, {
                        when: Math.max(Date.now() + minAlarmDelayMillis, when)
                    });
                } else {
                    console.error("Service worker: chrome.alarms.create недоступний.");
                }
            }
        });
}

// --- Функція перевірки та призупинення вкладок ---
function checkInactiveTabs() {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;

    if (suspensionTime <= 0) {
        if (chrome.alarms && typeof chrome.alarms.clear === 'function') {
            chrome.alarms.clear(ALARM_NAME).catch(e => console.warn(`Service worker: Помилка очищення Alarm '${ALARM_NAME}': ${e.message}`));
        }
        return;
    }

    const minInactiveTime = suspensionTime * 1000;
    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
    const now = Date.now();
    let nextPredictedCheckTime = Infinity;

    chrome.tabs.query({}, async (tabs) => {
        if (chrome.runtime.lastError || !tabs) {
            console.error("Service worker: Помилка chrome.tabs.query під час checkInactiveTabs:", chrome.runtime.lastError);
            setupAlarm(now + 60000);
            return;
        }

        for (const tab of tabs) {
            if (tab.id === chrome.tabs.TAB_ID_NONE) continue;

            const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
            const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
            const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');
            const effectiveUrlForWhitelistCheck = isOurSuspendedPage && suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
            const tabIsWhitelisted = isWhitelisted(effectiveUrlForWhitelistCheck);

            const tabVideoState = videoState[tab.id];
            const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;

            if (!tab.active && isHttpOrHttps && !isInternalPage && !isOurSuspendedPage && !tabIsWhitelisted) {
                const lastActive = lastActivity[tab.id] || tab.lastAccessed || 0;
                const inactiveDuration = now - lastActive;
                const potentialNextEligibilityTime = lastActive + minInactiveTime;

                if (inactiveDuration >= minInactiveTime && !hasPausedVideoBlockingSuspend) {
                    await suspendTab(tab, 'timer');
                } else {
                     if (potentialNextEligibilityTime < nextPredictedCheckTime) {
                         nextPredictedCheckTime = potentialNextEligibilityTime;
                     }
                }
            }
        }

        if (nextPredictedCheckTime !== Infinity || tabs.length === 0) {
             setupAlarm(Math.max(now + 5000, nextPredictedCheckTime));
        } else {
            if (chrome.alarms && typeof chrome.alarms.clear === 'function') {
                chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
                    if (chrome.runtime.lastError) console.warn(`Service worker: Помилка очищення Alarm '${ALARM_NAME}': ${chrome.runtime.lastError.message}`);
                });
            }
        }
    });
}

// Перевірка, чи URL знаходиться у білому списку
function isWhitelisted(url) {
    if (!url || !url.startsWith('http')) return false;
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        if (whitelistUrls.includes(url)) return true;

        const lowerDomain = domain.toLowerCase();
        return whitelistDomains.some(d => {
            if (lowerDomain === d) return true;
            if (d && !d.startsWith('.') && lowerDomain.endsWith('.' + d)) return true;
            return false;
        });
    } catch (e) {
        console.error(`Service worker: Помилка парсингу URL для перевірки білого списку: ${url}`, e);
        return false;
    }
}

// Функція призупинення вкладки
async function suspendTab(tab, reason = 'timer') {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !tab || tab.id === chrome.tabs.TAB_ID_NONE) {
        return Promise.reject(new Error("Invalid environment or tab"));
    }

    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
    const tabVideoState = videoState[tab.id];
    const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;
    const effectiveUrlForWhitelistCheck = suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;

    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith(ourSuspendUrlPrefix) || !tab.url.startsWith('http') || isWhitelisted(effectiveUrlForWhitelistCheck) || hasPausedVideoBlockingSuspend) {
        return Promise.resolve();
    }

    const originalUrl = tab.url;
    const originalTitle = tab.title;
    const currentTabId = tab.id;
    const favIconUrl = tab.favIconUrl || '';

    suspendedTabInfo[currentTabId] = suspendedTabInfo[currentTabId] || {};
    suspendedTabInfo[currentTabId].url = originalUrl;
    suspendedTabInfo[currentTabId].title = originalTitle;
    suspendedTabInfo[currentTabId].favIconUrl = favIconUrl;
    if (!suspendedTabInfo[currentTabId].suspendedTime) {
         suspendedTabInfo[currentTabId].suspendedTime = Date.now();
    }
    suspendedTabInfo[currentTabId].reason = reason;

    const suspendedPageUrl = `${ourSuspendUrlPrefix}?url=${encodeURIComponent(originalUrl || '')}&title=${encodeURIComponent(originalTitle || '')}&tabId=${currentTabId}&favIconUrl=${encodeURIComponent(favIconUrl || '')}`;

    try {
        await chrome.tabs.update(currentTabId, { url: suspendedPageUrl });
        delete videoState[currentTabId];
        return Promise.resolve();
    } catch (e) {
        console.error(`Service worker: Помилка оновлення URL вкладки ${currentTabId}:`, e);
        delete suspendedTabInfo[currentTabId];
        chrome.storage.session.remove(`screenshot_${currentTabId}`).catch(err => console.warn(`Service worker: Помилка очищення старого скріншоту для ${currentTabId}:`, err));
        return Promise.reject(e);
    }
}

// Очищаємо дані для закритих вкладок
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (lastActivity[tabId]) delete lastActivity[tabId];
    if (suspendedTabInfo[tabId]) delete suspendedTabInfo[tabId];
    if (videoState[tabId]) delete videoState[tabId];
    chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення скріншоту для видаленої вкладки ${tabId}:`, e));
    clearTimeout(interactionCaptureTimeoutId);
    if (initialCaptureTimeouts.has(tabId)) {
        clearTimeout(initialCaptureTimeouts.get(tabId));
        initialCaptureTimeouts.delete(tabId);
    }
    setTimeout(checkInactiveTabs, 100);
});

// Оновлюємо активність при оновленні вкладки
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || tabId === chrome.tabs.TAB_ID_NONE) return;

    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
    const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
    const wasSuspendedByUs = suspendedTabInfo[tabId];

    if ((changeInfo.url && !changeInfo.url.startsWith(ourSuspendUrlPrefix)) || (changeInfo.status === 'complete' && !isOurSuspendedPage)) {
        if (tab.id !== chrome.tabs.TAB_ID_NONE) {
            lastActivity[tab.id] = Date.now();
        }
        if (changeInfo.url && !changeInfo.url.startsWith(ourSuspendUrlPrefix)) {
            if (videoState[tabId]) delete videoState[tabId];
        }
        if (changeInfo.url && tab.id !== chrome.tabs.TAB_ID_NONE) {
            chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення скріншоту при оновленні URL для ${tabId}:`, e));
        }
    }

     if (changeInfo.status === 'complete' && tab.id !== chrome.tabs.TAB_ID_NONE && (tab.url.startsWith('http://') || tab.url.startsWith('https://')) && !isOurSuspendedPage && wasSuspendedByUs) {
          delete suspendedTabInfo[tab.id];
          setTimeout(checkInactiveTabs, 100);
     }

    if (changeInfo.url && changeInfo.url.startsWith(ourSuspendUrlPrefix) && tab.id !== chrome.tabs.TAB_ID_NONE) {
        if (!suspendedTabInfo[tab.id]) {
            try {
                const params = new URLSearchParams(new URL(changeInfo.url).search);
                const originalUrl = decodeURIComponent(params.get('url') || '');
                const originalTitle = decodeURIComponent(params.get('title') || '');
                const favIconUrlFromUrl = decodeURIComponent(params.get('favIconUrl') || '');
                const originalTabIdFromUrl = parseInt(params.get('tabId') || tab.id, 10);

                 const effectiveTabId = originalTabIdFromUrl;

                 if (originalUrl && effectiveTabId !== chrome.tabs.TAB_ID_NONE && effectiveTabId === tab.id) {
                    suspendedTabInfo[effectiveTabId] = {
                        url: originalUrl,
                        title: originalTitle,
                        favIconUrl: favIconUrlFromUrl,
                        suspendedTime: suspendedTabInfo[effectiveTabId]?.suspendedTime || Date.now(),
                        reason: suspendedTabInfo[effectiveTabId]?.reason || 'unknown'
                    };
                 } else {
                      console.warn(`Service worker: При старті/ононовленні до suspend.html: Не вдалося відновити інфо призупиненої вкладки з URL ${changeInfo.url}.`);
                 }
            } catch (e) {
                console.error(`Service worker: Помилка парсингу URL або обробки відновлення інфо з suspend.html URL ${changeInfo.url}:`, e);
            }
        }
        if (videoState[tabId]) delete videoState[tabId];
    }

     if (tab.id !== chrome.tabs.TAB_ID_NONE) {
          if (initialCaptureTimeouts.has(tab.id)) {
              clearTimeout(initialCaptureTimeouts.get(tab.id));
              initialCaptureTimeouts.delete(tab.id);
          }
           if (tab.active) {
               clearTimeout(interactionCaptureTimeoutId);
           }
     }
});

// Оновлюємо активність при активації вкладки
chrome.tabs.onActivated.addListener((activeInfo) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || activeInfo.tabId === chrome.tabs.TAB_ID_NONE) {
        clearTimeout(interactionCaptureTimeoutId);
        initialCaptureTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
        initialCaptureTimeouts.clear();
        return;
    }

    lastActivity[activeInfo.tabId] = Date.now();
    setTimeout(checkInactiveTabs, 100);

    chrome.tabs.get(activeInfo.tabId, (tab) => {
         if (chrome.runtime.lastError || !tab || tab.id === chrome.tabs.TAB_ID_NONE || tab.windowId === chrome.windows.WINDOW_ID_NONE) {
              clearTimeout(interactionCaptureTimeoutId);
               if (initialCaptureTimeouts.has(activeInfo.tabId)) {
                   clearTimeout(initialCaptureTimeouts.get(activeInfo.tabId));
                   initialCaptureTimeouts.delete(activeInfo.tabId);
               }
              return;
         }

         const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
         const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
         const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
         const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');

         if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
              clearTimeout(interactionCaptureTimeoutId);
              if (initialCaptureTimeouts.has(tab.id)) {
                  clearTimeout(initialCaptureTimeouts.get(tab.id));
              }
               const timeoutId = setTimeout(() => {
                   captureAndSaveScreenshotForTab(tab.id, tab.windowId);
               }, SCREENSHOT_INITIAL_DELAY);
               initialCaptureTimeouts.set(tab.id, timeoutId);
         } else {
              clearTimeout(interactionCaptureTimeoutId);
               if (initialCaptureTimeouts.has(activeInfo.tabId)) {
                   clearTimeout(initialCaptureTimeouts.get(activeInfo.tabId));
                   initialCaptureTimeouts.delete(activeInfo.tabId);
               }
         }
    });
});

// Початкове заповнення lastActivity та suspendedTabInfo при старті service worker
chrome.tabs.query({}, (tabs) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !tabs) return;

    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
    let initialActiveTab = null;

    tabs.forEach(tab => {
        if (tab.id !== chrome.tabs.TAB_ID_NONE) {
            lastActivity[tab.id] = lastActivity[tab.id] || tab.lastAccessed || Date.now();

            if (tab.url.startsWith(ourSuspendUrlPrefix) && !suspendedTabInfo[tab.id]) {
                try {
                    const params = new URLSearchParams(new URL(tab.url).search);
                    const originalUrl = decodeURIComponent(params.get('url') || '');
                    const originalTitle = decodeURIComponent(params.get('title') || '');
                    const favIconUrlFromUrl = decodeURIComponent(params.get('favIconUrl') || '');
                    const originalTabIdFromUrl = parseInt(params.get('tabId') || tab.id, 10);

                    const effectiveTabId = originalTabIdFromUrl;

                    if (originalUrl && effectiveTabId !== chrome.tabs.TAB_ID_NONE && effectiveTabId === tab.id) {
                        suspendedTabInfo[effectiveTabId] = {
                            url: originalUrl,
                            title: originalTitle,
                            favIconUrl: favIconUrlFromUrl,
                            suspendedTime: suspendedTabInfo[effectiveTabId]?.suspendedTime || Date.now(),
                            reason: suspendedTabInfo[effectiveTabId]?.reason || 'unknown'
                        };
                    } else {
                        console.warn(`Service worker: При старті: Не вдалося відновити інфо призупиненої вкладки з URL ${tab.url}.`);
                    }
                } catch (e) {
                     console.error(`Service worker: При старті: Помилка парсингу URL або обробки відновлення інфо з suspend.html URL ${tab.url}:`, e);
                }
            }

            const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
            const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
            const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');

            if (tab.active && tab.windowId !== chrome.windows.WINDOW_ID_NONE && isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
                initialActiveTab = tab;
            }
        }
    });

     // Запускаємо початкове захоплення скріншота для активної вкладки після завантаження налаштувань (у callback migrateStorageData)
     // та початкову перевірку Alarm (у callback migrateStorageData)
});

// Слухаємо alarms
if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
        if (alarm.name === ALARM_NAME) {
            checkInactiveTabs();
        }
    });
}

// Обробка повідомлень
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        sendResponse({ success: false, error: "chrome.runtime недоступний" });
        return true;
    }

    let responseSent = false;
    const sendAsyncResponse = (response) => {
        if (!responseSent) {
             try {
                 if (typeof sendResponse === 'function') {
                      // Перевіряємо, чи вкладка все ще існує, якщо повідомлення прийшло з вкладки
                      if (sender.tab && sender.tab.id !== chrome.tabs.TAB_ID_NONE) {
                           chrome.tabs.get(sender.tab.id, () => {
                                if (!chrome.runtime.lastError) { // Якщо вкладка все ще існує
                                    sendResponse(response);
                                } else {
                                     // Вкладка не існує (закрилася)
                                     console.warn("Service worker: Cannot send response, tab closed:", sender.tab.id, request);
                                }
                           });
                      } else { // Повідомлення не від вкладки (наприклад, popup)
                          sendResponse(response);
                      }
                 }
             } catch (e) {
                  console.warn("Service worker: Error sending response: port closed.", e, request);
             }
            responseSent = true;
        } else {
            console.warn("Service worker: sendResponse called multiple times.", request, response);
        }
    };


    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;

    switch (request.action) {
        case 'updateActivity':
            if (sender.tab && sender.tab.id !== chrome.tabs.TAB_ID_NONE) {
                lastActivity[sender.tab.id] = Date.now();
                 if (sender.tab.active) {
                     const tab = sender.tab;
                     const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                     const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
                     const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');

                     if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
                          if (initialCaptureTimeouts.has(tab.id)) {
                              clearTimeout(initialCaptureTimeouts.get(tab.id));
                              initialCaptureTimeouts.delete(tab.id);
                          }
                         debouncedCaptureOnInteraction(tab.id, tab.windowId);
                     } else {
                         clearTimeout(interactionCaptureTimeoutId);
                          if (initialCaptureTimeouts.has(tab.id)) {
                              clearTimeout(initialCaptureTimeouts.get(tab.id));
                              initialCaptureTimeouts.delete(tab.id);
                          }
                     }
                 }
                sendAsyncResponse({ success: true });
            } else {
                sendAsyncResponse({ success: false, error: "No valid tab ID in sender" });
            }
            break;

        case 'updateVideoState':
            if (sender.tab && sender.tab.id !== chrome.tabs.TAB_ID_NONE && request.state !== undefined) {
                if (request.state.hasVideo !== undefined && request.state.isPlaying !== undefined && request.state.hasPlayed !== undefined) {
                    const currentVideoState = videoState[sender.tab.id];
                     if (!currentVideoState || currentVideoState.hasVideo !== request.state.hasVideo || currentVideoState.isPlaying !== request.state.isPlaying || currentVideoState.hasPlayed !== request.state.hasPlayed) {
                        videoState[sender.tab.id] = request.state;
                        setTimeout(checkInactiveTabs, 100);
                     }
                    sendAsyncResponse({ success: true });
                } else {
                    console.warn(`Service worker: Отримано неповний video state для вкладки ${sender.tab.id}:`, request.state);
                    sendAsyncResponse({ success: false, error: "Incomplete video state received" });
                }
            } else {
                sendAsyncResponse({ success: false, error: "No valid tab ID or state in sender" });
            }
            break;

        case 'suspendTab':
            if (request.tabId !== undefined && request.tabId !== chrome.tabs.TAB_ID_NONE) {
                chrome.tabs.get(request.tabId, (tab) => {
                    if (chrome.runtime.lastError || !tab || tab.id === chrome.tabs.TAB_ID_NONE) {
                        sendAsyncResponse({ success: false, error: chrome.runtime.lastError?.message || "Invalid tab ID" });
                        return;
                    }

                    const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                    const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
                    const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');
                    const effectiveUrlForWhitelistCheck = suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
                    const tabIsWhitelisted = isWhitelisted(effectiveUrlForWhitelistCheck);
                    const tabVideoState = videoState[tab.id];
                    const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;

                    if (!isHttpOrHttps || isInternalPage || isOurSuspendedPage || isWhitelisted(tab.url) || hasPausedVideoBlockingSuspend) {
                        let skipReason = 'Cannot suspend';
                         if (isInternalPage) skipReason = 'System/Extension Page';
                         else if (isOurSuspendedPage) skipReason = 'Already Suspended';
                         else if (!isHttpOrHttps) skipReason = 'Non-HTTP Page';
                         else if (isWhitelisted(tab.url)) skipReason = 'Whitelisted';
                         else if (hasPausedVideoBlockingSuspend) skipReason = 'Video Paused (after playing)';
                        sendAsyncResponse({ success: false, error: `Cannot suspend this page: ${skipReason}` });
                    } else {
                        if (tab.id !== chrome.tabs.TAB_ID_NONE) {
                            suspendedTabInfo[tab.id] = suspendedTabInfo[tab.id] || {};
                             if(!suspendedTabInfo[tab.id].url) suspendedTabInfo[tab.id].url = tab.url;
                             if(!suspendedTabInfo[tab.id].title) suspendedTabInfo[tab.id].title = tab.title;
                             if(!suspendedTabInfo[tab.id].favIconUrl) suspendedTabInfo[tab.id].favIconUrl = tab.favIconUrl;
                             if(!suspendedTabInfo[tab.id].suspendedTime) suspendedTabInfo[tab.id].suspendedTime = Date.now();
                            suspendedTabInfo[tab.id].reason = 'manual';
                        }
                        suspendTab(tab, 'manual')
                            .then(() => {
                                sendAsyncResponse({ success: true });
                                setTimeout(checkInactiveTabs, 100);
                            })
                            .catch((error) => {
                                sendAsyncResponse({ success: false, error: error.message });
                            });
                    }
                });
            } else {
                sendAsyncResponse({ success: false, error: "Invalid tab ID provided" });
            }
            return true;

        case 'suspendAll':
            chrome.tabs.query({ active: false }, async (allInactiveTabs) => {
                if (chrome.runtime.lastError || !allInactiveTabs) {
                    sendAsyncResponse({ success: false, error: chrome.runtime.lastError?.message || "Failed to query tabs" });
                    return;
                }
                let successCount = 0;
                for (const tab of allInactiveTabs) {
                    const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                    const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
                    const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');
                    const effectiveUrlForWhitelistCheck = suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
                    const tabIsWhitelisted = isWhitelisted(effectiveUrlForWhitelistCheck);
                    const tabVideoState = videoState[tab.id];
                    const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;


                    if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage && !tabIsWhitelisted && !hasPausedVideoBlockingSuspend) {
                        try {
                             if (tab.id !== chrome.tabs.TAB_ID_NONE) {
                                suspendedTabInfo[tab.id] = suspendedTabInfo[tab.id] || {};
                                 if(!suspendedTabInfo[tab.id].url) suspendedTabInfo[tab.id].url = tab.url;
                                 if(!suspendedTabInfo[tab.id].title) suspendedTabInfo[tab.id].title = tab.title;
                                 if(!suspendedTabInfo[tab.id].favIconUrl) suspendedTabInfo[tab.id].favIconUrl = tab.favIconUrl;
                                 if(!suspendedTabInfo[tab.id].suspendedTime) suspendedTabInfo[tab.id].suspendedTime = Date.now();
                                suspendedTabInfo[tab.id].reason = 'manual';
                            }
                            await suspendTab(tab, 'manual');
                            successCount++;
                        } catch (e) {
                            console.error(`Service worker: Помилка ручного призупинення вкладки ${tab.id}: ${tab.url}`, e);
                        }
                    }
                }
                sendAsyncResponse({ success: true, suspendedCount: successCount });
                setTimeout(checkInactiveTabs, 100);
            });
            return true;

        case 'addToWhitelistUrl':
            if (request.url) {
                const urlToAdd = request.url.trim();
                if (urlToAdd && (urlToAdd.startsWith('http://') || urlToAdd.startsWith('https://'))) {
                    if (!whitelistUrls.includes(urlToAdd)) {
                        whitelistUrls.push(urlToAdd);
                        chrome.storage.sync.set({ whitelistUrls }, () => {
                            if (chrome.runtime.lastError) {
                                sendAsyncResponse({ success: false, error: chrome.runtime.lastError.message });
                            } else {
                                setTimeout(checkInactiveTabs, 100);
                                sendAsyncResponse({ success: true });
                            }
                        });
                    } else {
                        sendAsyncResponse({ success: false, error: "URL is already in whitelist" });
                    }
                } else {
                    sendAsyncResponse({ success: false, error: "Invalid URL format" });
                }
            } else {
                sendAsyncResponse({ success: false, error: "URL not provided" });
            }
            return true;

        case 'addToWhitelistDomain':
            if (request.domain) {
                const domainToAdd = request.domain.trim().toLowerCase();
                 if (domainToAdd && !domainToAdd.includes('/') && domainToAdd.includes('.') && !domainToAdd.includes(' ')) {
                    if (!whitelistDomains.includes(domainToAdd)) {
                        whitelistDomains.push(domainToAdd);
                        chrome.storage.sync.set({ whitelistDomains }, () => {
                            if (chrome.runtime.lastError) {
                                sendAsyncResponse({ success: false, error: chrome.runtime.lastError.message });
                            } else {
                                setTimeout(checkInactiveTabs, 100);
                                sendAsyncResponse({ success: true });
                            }
                        });
                    } else {
                        sendAsyncResponse({ success: false, error: "Domain is already in whitelist" });
                    }
                } else {
                    sendAsyncResponse({ success: false, error: "Invalid domain format" });
                }
            } else {
                sendAsyncResponse({ success: false, error: "Domain not provided" });
            }
            return true;

        case 'checkTabStatus':
            if (request.tabId !== undefined && request.tabId !== chrome.tabs.TAB_ID_NONE) {
                 chrome.tabs.get(request.tabId, (tab) => {
                      if (chrome.runtime.lastError || !tab || tab.id === chrome.tabs.TAB_ID_NONE) {
                           sendAsyncResponse({ success: false, error: chrome.runtime.lastError?.message || "Failed to get tab status" });
                           return;
                      }

                       const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                       const isOurSuspended = tab.url.startsWith(ourSuspendUrlPrefix);
                       const isInternal = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                       const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');
                       const effectiveUrlForWhitelistCheck = isOurSuspended && suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
                       const tabIsWhitelisted = isWhitelisted(effectiveUrlForWhitelistCheck);
                       const tabVideoState = videoState[tab.id];
                       const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;

                       let reasonKey = 'reasonUnknown';
                        if (isInternal) reasonKey = 'reasonSystem';
                       else if (isOurSuspended) reasonKey = 'reasonSuspended';
                       else if (!isHttpOrHttps) reasonKey = 'reasonError';
                       else if (isWhitelisted(tab.url)) reasonKey = 'reasonWhitelisted';
                       else if (hasPausedVideoBlockingSuspend) reasonKey = 'reasonVideoPaused';
                       else reasonKey = 'reasonReady';

                       const canManuallySuspend = isHttpOrHttps && !isInternal && !isOurSuspended && !isWhitelisted(tab.url) && !hasPausedVideoBlockingSuspend;

                       sendAsyncResponse({
                           success: true,
                           url: tab.url,
                           isInternalPage: isInternal,
                           isHttpOrHttps: isHttpOrHttps,
                           isOurSuspendedPage: isOurSuspended,
                           isWhitelisted: isWhitelisted(tab.url),
                           hasPausedVideoBlockingSuspend: hasPausedVideoBlockingSuspend,
                           canManuallySuspend: canManuallySuspend,
                           reasonKey: reasonKey,
                           originalSuspendedUrl: suspendedTabInfo[tab.id]?.url || null
                       });
                 });
            } else {
                 sendAsyncResponse({ success: false, error: "Invalid tab ID provided" });
            }
            return true;

        case 'getScreenshot':
             if (request.tabId !== undefined && request.tabId !== chrome.tabs.TAB_ID_NONE) {
                 chrome.storage.session.get(`screenshot_${request.tabId}`, (result) => {
                      const screenshotUrl = result[`screenshot_${request.tabId}`];
                      sendAsyncResponse({ success: true, screenshotUrl: screenshotUrl });
                 });
             } else {
                  sendAsyncResponse({ success: false, error: "Invalid tab ID provided" });
             }
             return true;

        case 'getDebugInfo':
            chrome.tabs.query({}, (tabs) => {
                if (chrome.runtime.lastError || !tabs) {
                    sendAsyncResponse({ error: chrome.runtime.lastError?.message || "Failed to query tabs" });
                    return;
                }

                const tabsInfo = tabs.map(tab => {
                    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                    const isOurSuspended = tab.url.startsWith(ourSuspendUrlPrefix);
                    const isInternal = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                    const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');

                    let reasonKey = 'reasonUnknown';
                    let videoDetailsKey = null;
                    let screenshotDetailsKey = null;

                    const effectiveUrl = isOurSuspended && suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
                    const tabIsWhitelisted = isWhitelisted(effectiveUrl);
                    const tabVideoState = videoState[tab.id];
                    const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;

                    // Determine reasonKey
                    if (isOurSuspended) {
                        reasonKey = suspendedTabInfo[tab.id]?.reason === 'manual' ? 'reasonSuspendedManually' : (suspendedTabInfo[tab.id]?.reason === 'timer' ? 'reasonSuspendedByTimer' : 'reasonSuspended');
                    } else if (isInternal) {
                        reasonKey = 'reasonSystem';
                    } else if (!isHttpOrHttps) {
                        reasonKey = 'reasonError';
                    } else if (tabIsWhitelisted) {
                           reasonKey = 'reasonWhitelisted';
                    } else if (tab.active) {
                        reasonKey = 'reasonActive';
                    } else if (suspensionTime <= 0) {
                        reasonKey = 'reasonDisabled';
                    } else {
                        const lastActive = lastActivity[tab.id] || tab.lastAccessed || 0;
                        const inactiveDuration = Date.now() - lastActive;
                        const minInactiveTime = suspensionTime * 1000;
                        if (inactiveDuration >= minInactiveTime) reasonKey = 'reasonReady';
                        else reasonKey = 'reasonBelowThreshold';
                    }

                     // Determine videoDetailsKey
                     if (tabVideoState?.hasVideo !== undefined) {
                         if (tabVideoState.isPlaying) videoDetailsKey = 'reasonVideoPlaying';
                         else if (tabVideoState.hasPlayed) {
                              if (preventSuspendIfVideoPaused) videoDetailsKey = 'reasonVideoPaused';
                              else videoDetailsKey = 'reasonVideoPausedOptionOff';
                         } else videoDetailsKey = 'reasonVideoNotPlayed';
                     }

                     // Determine screenshotDetailsKey
                     if (!enableScreenshots) {
                          screenshotDetailsKey = 'reasonScreenshotDisabledSetting';
                     }


                    return {
                        id: tab.id,
                        title: suspendedTabInfo[tab.id]?.title || tab.title || null,
                        url: suspendedTabInfo[tab.id]?.url || tab.url || null,
                        favIconUrl: tab.favIconUrl || null,
                        active: tab.active,
                        reasonKey: reasonKey,
                        videoState: tabVideoState || null,
                        isOurSuspended: isOurSuspended,
                        videoDetailsKey: videoDetailsKey,
                        screenshotDetailsKey: screenshotDetailsKey
                    };
                });

                sendAsyncResponse({
                    tabs: tabsInfo,
                    lastActivity: lastActivity,
                    suspensionTime: suspensionTime,
                    suspendedTabInfo: suspendedTabInfo,
                    preventSuspendIfVideoPaused: preventSuspendIfVideoPaused,
                    enableScreenshots: enableScreenshots
                });
            });
            return true;

        default:
            sendAsyncResponse({ success: false, error: "Unknown action" });
            break;
    }

    return true;
});

// Load settings on Service Worker startup
chrome.storage.sync.get(['suspensionTime', 'whitelistUrls', 'whitelistDomains', 'preventSuspendIfVideoPaused', 'enableScreenshots', 'language', 'theme'], (result) => {
    // Присвоюємо початкові значення з result для використання в migrateStorageData
    suspensionTime = result.suspensionTime !== undefined ? parseInt(result.suspensionTime) : 600;
    preventSuspendIfVideoPaused = result.preventSuspendIfVideoPaused !== undefined ? result.preventSuspendIfVideoPaused : false;
    enableScreenshots = result.enableScreenshots !== undefined ? result.enableScreenshots : true;
    whitelistUrls = Array.isArray(result.whitelistUrls) ? result.whitelistUrls.filter(url => typeof url === 'string' && url.trim()) : (result.whitelistUrls ? result.whitelistUrls.split(',').map(url => url.trim()).filter(url => url) : []);
    whitelistDomains = Array.isArray(result.whitelistDomains) ? result.whitelistDomains.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase()) : (result.whitelistDomains ? result.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain) : []);


    migrateStorageData(result, () => {
        // Після міграції, перезавантажуємо актуальні значення
        chrome.storage.sync.get(['suspensionTime', 'whitelistUrls', 'whitelistDomains', 'preventSuspendIfVideoPaused', 'enableScreenshots'], (migratedResult) => {
            suspensionTime = migratedResult.suspensionTime;
            whitelistUrls = migratedResult.whitelistUrls;
            whitelistDomains = migratedResult.whitelistDomains;
            preventSuspendIfVideoPaused = migratedResult.preventSuspendIfVideoPaused;
            enableScreenshots = migratedResult.enableScreenshots;

            // Запускаємо початкову перевірку Alarm
            setupAlarm(Date.now() + suspensionTime * 1000);

            // Запускаємо початкове захоплення скріншота для активної вкладки
             chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                 const initialActiveTab = tabs[0];
                 if (initialActiveTab && initialActiveTab.id !== chrome.tabs.TAB_ID_NONE && initialActiveTab.windowId !== chrome.windows.WINDOW_ID_NONE) {
                      const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                      const isInternalPage = initialActiveTab.url.startsWith('chrome://') || initialActiveTab.url.startsWith('chrome-extension://');
                      const isOurSuspendedPage = initialActiveTab.url.startsWith(ourSuspendUrlPrefix);
                      const isHttpOrHttps = initialActiveTab.url.startsWith('http://') || initialActiveTab.url.startsWith('https://');

                      if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
                           clearTimeout(interactionCaptureTimeoutId);
                          if (initialCaptureTimeouts.has(initialActiveTab.id)) clearTimeout(initialCaptureTimeouts.get(initialActiveTab.id));
                           const timeoutId = setTimeout(() => {
                               captureAndSaveScreenshotForTab(initialActiveTab.id, initialActiveTab.windowId);
                           }, SCREENSHOT_INITIAL_DELAY);
                           initialCaptureTimeouts.set(initialActiveTab.id, timeoutId);
                      } else {
                           clearTimeout(interactionCaptureTimeoutId);
                           if (initialCaptureTimeouts.has(initialActiveTab.id)) {
                               clearTimeout(initialCaptureTimeouts.get(initialActiveTab.id));
                               initialCaptureTimeouts.delete(initialCaptureTimeouts.get(initialActiveTab.id));
                           }
                      }
                 } else {
                      clearTimeout(interactionCaptureTimeoutId);
                      initialCaptureTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
                      initialCaptureTimeouts.clear();
                 }
             });
        });
    });
});

// Слухач змін у сховищі
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.suspensionTime !== undefined) {
            const oldTime = suspensionTime;
            const newTime = parseInt(changes.suspensionTime.newValue);
            suspensionTime = newTime;

            if (oldTime === -1 && newTime > 0) {
                chrome.tabs.query({}, (tabs) => {
                    if (!chrome.runtime.lastError && tabs) {
                        const now = Date.now();
                        const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                        tabs.forEach(tab => {
                            if (tab.id !== chrome.tabs.TAB_ID_NONE) {
                                if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith(ourSuspendUrlPrefix)) {
                                    lastActivity[tab.id] = now;
                                } else {
                                    lastActivity[tab.id] = lastActivity[tab.id] || tab.lastAccessed || now;
                                }
                            }
                        });
                    }
                    checkInactiveTabs();
                });
            } else {
                checkInactiveTabs();
            }
        }
        if (changes.preventSuspendIfVideoPaused !== undefined) {
            preventSuspendIfVideoPaused = changes.preventSuspendIfVideoPaused.newValue;
            checkInactiveTabs();
        }
        if (changes.enableScreenshots !== undefined) {
            enableScreenshots = changes.enableScreenshots.newValue;
            if (!enableScreenshots) {
                 clearTimeout(interactionCaptureTimeoutId);
                 initialCaptureTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
                 initialCaptureTimeouts.clear();
            } else {
                 chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                     const activeTab = tabs[0];
                     if (activeTab && activeTab.id !== chrome.tabs.TAB_ID_NONE && activeTab.windowId !== chrome.windows.WINDOW_ID_NONE) {
                          const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                          const isInternalPage = activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('chrome-extension://');
                          const isOurSuspendedPage = activeTab.url.startsWith(ourSuspendUrlPrefix);
                          const isHttpOrHttps = activeTab.url.startsWith('http://') || activeTab.url.startsWith('https://');

                           if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
                              clearTimeout(interactionCaptureTimeoutId);
                              if (initialCaptureTimeouts.has(activeTab.id)) clearTimeout(initialCaptureTimeouts.get(activeTab.id));
                              const timeoutId = setTimeout(() => {
                                  captureAndSaveScreenshotForTab(activeTab.id, activeTab.windowId);
                              }, SCREENSHOT_INITIAL_DELAY);
                              initialCaptureTimeouts.set(activeTab.id, timeoutId);
                           }
                     }
                 });
            }
        }
        if (changes.whitelistUrls !== undefined) {
            whitelistUrls = Array.isArray(changes.whitelistUrls.newValue) ? changes.whitelistUrls.newValue.filter(url => typeof url === 'string' && url.trim()) : (changes.whitelistUrls.newValue ? changes.whitelistUrls.split(',').map(url => url.trim()).filter(url => url) : []);
            checkInactiveTabs();
        }
        if (changes.whitelistDomains !== undefined) {
            whitelistDomains = Array.isArray(changes.whitelistDomains.newValue) ? changes.whitelistDomains.newValue.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase()) : (changes.whitelistDomains.newValue ? changes.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain) : []);
            checkInactiveTabs();
        }
    }
});