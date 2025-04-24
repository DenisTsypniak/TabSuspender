// background.js

let suspensionTime = 600; // За замовчуванням: 10 хвилин (600 секунд)
let whitelistUrls = [];
let whitelistDomains = [];
let preventSuspendIfVideoPaused = false; // Нова опція: чи забороняти призупинення при відео на паузі
let enableScreenshots = true; // НОВА ОПЦІЯ: Чи увімкнені скріншоти на сторінці призупинення UI (впливає лише на відображення, не на захоплення)
let lastActivity = {}; // Мітки часу останньої активності вкладок
const suspendedTabInfo = {}; // Зберігає оригінальну інформацію про вкладки

// Новий об'єкт для зберігання стану відео по вкладках { tabId: { hasVideo: boolean, isPlaying: boolean, hasPlayed: boolean } }
// hasVideo: чи є відео елемент(и) на сторінці
// isPlaying: чи відтворюється будь-яке відео
// hasPlayed: чи відтворювалося будь-яке відео з моменту останньої навігації або ініціалізації скрипта
const videoState = {};

const ALARM_NAME = 'checkInactiveTabs'; // Ім'я для Chrome Alarm

// --- ДОДАНО/ЗМІНЕНО: Функції для Service Worker ---
// Ці функції потрібні в SW (наприклад, для getDebugInfo) і не мають залежати від 'window'.
// Їх дублювання тут є необхідним для MV3 Service Worker.
function escapeHTML_SW(str) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s.replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"')
          .replace(/'/g, '&apos;');
}

function shortenUrl_SW(url, maxLength = 80) {
    if (!url) return '';
    const plainUrl = String(url);
    if (plainUrl.length <= maxLength) return escapeHTML_SW(plainUrl);

    const startLength = Math.floor((maxLength - 3) / 2);
    const endLength = maxLength - 3 - startLength;
    const shortened = plainUrl.substring(0, startLength) + '...' + plainUrl.substring(plainUrl.length - endLength);
    return escapeHTML_SW(shortened);
}
// --- Кінець ДОДАНО/ЗМІНЕНО функцій для Service Worker ---


// --- ЗМІНЕНО: Керування скріншотами активної вкладки (подієво-орієнтоване) ---
const SCREENSHOT_INITIAL_DELAY = 500; // Затримка перед першим скріншотом після активації (0.5 секунди)
const SCREENSHOT_INTERACTION_DEBOUNCE = 1000; // Debounce затримка для захоплення після взаємодії (1 секунда)

// Змінна для зберігання ID тайм-ауту для debounced захоплення при взаємодії
let interactionCaptureTimeoutId = null;

// Функція для захоплення та збереження скріншоту для вказаної вкладки
// Викликається з затримкою після активації або через debounced механізм після взаємодії
async function captureAndSaveScreenshotForTab(tabId, windowId) {
    // Перевіряємо, чи chrome.tabs API доступний
    if (typeof chrome === 'undefined' || !chrome.tabs || typeof chrome.tabs.captureVisibleTab !== 'function') {
         console.warn("Service worker: chrome.tabs.captureVisibleTab API недоступний для скріншоту.");
         return;
    }
    // Отримуємо вкладку за ID, щоб перевірити її стан (активна, URL тощо)
    chrome.tabs.get(tabId, async (tab) => {
        // Перевірка на помилку або недійсний об'єкт вкладки
        if (chrome.runtime.lastError) {
             console.warn(`Service worker: Не вдалося отримати вкладку ${tabId} для скріншоту: ${chrome.runtime.lastError.message}`);
             return;
        }
        if (!tab || tab.id === chrome.tabs.TAB_ID_NONE || tab.windowId === chrome.windows.WINDOW_ID_NONE) {
             console.warn(`Service worker: Отримано недійсний об'єкт вкладки ${tabId} для скріншоту.`);
             return;
        }

        const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
        const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
        const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);

        // Пропускаємо скріншот для системних/наших сторінок або не http/https
        if (isInternalPage || isOurSuspendedPage || !tab.url.startsWith('http')) {
            console.log(`Service worker: Пропущено скріншот для вкладки ${tabId} (системна/наша сторінка або не http/https).`);
            return;
        }

        // Важливо: Захоплюємо скріншот лише для активної вкладки.
        // Ця функція викликається для потенційно активної вкладки.
        // Перевірка tab.active тут гарантує, що ми не захоплюємо скріншот, якщо вкладка стала фоновою між плануванням і виконанням.
        if (!tab.active) {
             console.log(`Service worker: Пропущено скріншот для вкладки ${tabId}: вже не активна.`);
             return;
        }

        // --- ДОДАНО: Обробка помилки "Tabs cannot be edited right now" та квоти ---
        try {
            // Захоплюємо видиму частину активної вкладки
            console.log(`Service worker: Захоплення скріншоту для вкладки ${tabId}...`);
            const screenshotUrl = await chrome.tabs.captureVisibleTab(windowId); // Повертає Data URL
            // Зберігаємо скріншот у chrome.storage.session за ID вкладки
            // Використовуємо try/catch для set на випадок помилок (наприклад, storage переповнено)
            try {
                 // Очищаємо попередній скріншот перед збереженням нового, щоб не накопичувати старі Data URL
                 await chrome.storage.session.remove(`screenshot_${tabId}`);
                await chrome.storage.session.set({ [`screenshot_${tabId}`]: screenshotUrl });
                console.log(`Service worker: Скріншот вкладки ${tabId} збережено.`);
            } catch (storageError) {
                 console.error(`Service worker: Помилка збереження скріншоту для вкладки ${tabId}:`, storageError);
                 // TODO: Додати логіку очищення storage.session, якщо він наближається до квоти.
            }

        } catch (error) {
            // Перевіряємо, чи це помилка, пов'язана з взаємодією користувача або квотою
            if (error.message) {
                if (error.message.includes("Tabs cannot be edited right now")) {
                     console.warn(`Service worker: Скріншот вкладки ${tabId} пропущено: Користувач взаємодіє з вкладками.`);
                } else if (error.message.includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota")) {
                    console.warn(`Service worker: Скріншот вкладки ${tabId} пропущено: Перевищено квоту captureVisibleTab.`);
                }
                 else {
                    console.error(`Service worker: Інша помилка захоплення скріншоту для вкладки ${tabId}:`, error);
                    // У випадку іншої помилки, можливо, варто очистити старий скріншот, якщо він був
                    chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення старого скріншоту для ${tabId}:`, e));
                }
            } else {
                 console.error(`Service worker: Невідома помилка захоплення скріншоту для вкладки ${tabId}:`, error);
                  chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення старого скріншоту для ${tabId}:`, e));
            }
        }
        // --- Кінець ДОДАНО обробки помилки ---
    });
}

// --- ДОДАНО: Debounced функція для захоплення скріншоту при взаємодії ---
// Ця функція буде викликати captureAndSaveScreenshotForTab не частіше, ніж SCREENSHOT_INTERACTION_DEBOUNCE
const debouncedCaptureOnInteraction = (tabId, windowId) => {
    clearTimeout(interactionCaptureTimeoutId); // Очищаємо попередній запланований виклик
    interactionCaptureTimeoutId = setTimeout(() => {
        captureAndSaveScreenshotForTab(tabId, windowId);
    }, SCREENSHOT_INTERACTION_DEBOUNCE);
};

// --- Кінець ЗМІНЕНО скріншотів активної вкладки ---


// --- Функція міграції даних ---
function migrateStorageData(data, callback) {
    const changes = {};
    let migrated = true; // Вважаємо, що міграція потрібна за замовчуванням або перевіряємо пізніше

    // Міграція whitelistUrls (рядок -> масив)
    if (typeof data.whitelistUrls === 'string') {
        changes.whitelistUrls = data.whitelistUrls.split(',').map(url => url.trim()).filter(url => url);
        migrated = true;
        console.log("Service worker: Міграція: whitelistUrls конвертовано в масив.");
    } else if (Array.isArray(data.whitelistUrls)) {
         const cleanedUrls = data.whitelistUrls.filter(url => typeof url === 'string' && url.trim());
         // Перевіряємо, чи є "брудні" дані, які потрібно очистити
         if (cleanedUrls.length !== data.whitelistUrls.length || data.whitelistUrls.some(url => typeof url !== 'string' || url.trim() !== url)) {
             changes.whitelistUrls = cleanedUrls.map(url => url.trim());
             migrated = true;
             console.log("Service worker: Міграція: whitelistUrls очищено.");
         } else {
             changes.whitelistUrls = data.whitelistUrls; // Дані вже в потрібному форматі і чисті
             migrated = false; // Не було змін у цьому полі
         }
    } else if (data.whitelistUrls === undefined) {
         changes.whitelistUrls = [];
         migrated = true;
         console.log("Service worker: Міграція: whitelistUrls встановлено пустим масивом за замовчуванням.");
    } else {
         changes.whitelistUrls = []; // Неочікуваний формат, скидаємо
         migrated = true;
         console.warn("Service worker: Міграція: whitelistUrls мав неочікуваний формат, скинуто до пустого масиву.");
    }

    // Міграція whitelistDomains (рядок -> масив, нижній регістр)
    if (typeof data.whitelistDomains === 'string') {
        changes.whitelistDomains = data.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain);
        migrated = true;
        console.log("Service worker: Міграція: whitelistDomains конвертовано в масив (lower cased).");
    } else if (Array.isArray(data.whitelistDomains)) {
         const cleanedDomains = data.whitelistDomains.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase());
          // Перевіряємо, чи є "брудні" дані або не в нижньому регістрі
         if (cleanedDomains.length !== data.whitelistDomains.length || data.whitelistDomains.some(d => typeof d !== 'string' || d.trim().toLowerCase() !== d)) {
             changes.whitelistDomains = cleanedDomains;
             migrated = true;
             console.log("Service worker: Міграція: whitelistDomains очищено та переведено в нижній регістр.");
         } else {
              changes.whitelistDomains = data.whitelistDomains; // Дані вже в потрібному форматі і чисті
              if (!changes.hasOwnProperty('whitelistUrls')) migrated = false; // Якщо urls теж не змінились, то міграція не потрібна
         }
    } else if (data.whitelistDomains === undefined) {
        changes.whitelistDomains = [];
        migrated = true;
        console.log("Service worker: Міграція: whitelistDomains встановлено пустим масивом за замовчуванням.");
    } else {
         changes.whitelistDomains = []; // Неочікуваний формат, скидаємо
         migrated = true;
         console.warn("Service worker: Міграція: whitelistDomains мав неочікуваний формат, скинуто до пустого масиву.");
    }

     // Міграція/встановлення значення за замовчуванням для enableScreenshots
     if (data.enableScreenshots === undefined) {
         changes.enableScreenshots = true; // За замовчуванням увімкнено
         migrated = true;
         console.log("Service worker: Міграція: Встановлено enableScreenshots=true за замовчуванням.");
     } else {
         // Якщо enableScreenshots вже існує, перевіряємо чи це boolean, інакше скидаємо
         if (typeof data.enableScreenshots !== 'boolean') {
             changes.enableScreenshots = true;
             migrated = true;
             console.warn("Service worker: Міграція: enableScreenshots мав неочікуваний формат, скинуто до true.");
         } else {
              changes.enableScreenshots = data.enableScreenshots; // Використовуємо існуюче значення
               // Якщо інші поля не змінювались, міграція не потрібна
              if (!changes.hasOwnProperty('whitelistUrls') && !changes.hasOwnProperty('whitelistDomains')) migrated = false;
         }
     }

     // Міграція/встановлення значення за замовчуванням для preventSuspendIfVideoPaused
      if (data.preventSuspendIfVideoPaused === undefined) {
          changes.preventSuspendIfVideoPaused = false; // За замовчуванням вимкнено
          migrated = true;
          console.log("Service worker: Міграція: Встановлено preventSuspendIfVideoPaused=false за замовчуванням.");
      } else {
           // Якщо preventSuspendIfVideoPaused вже існує, перевіряємо чи це boolean, інакше скидаємо
           if (typeof data.preventSuspendIfVideoPaused !== 'boolean') {
               changes.preventSuspendIfVideoPaused = false;
               migrated = true;
               console.warn("Service worker: Міграція: preventSuspendIfVideoPaused мав неочікуваний формат, скинуто до false.");
           } else {
               changes.preventSuspendIfVideoPaused = data.preventSuspendIfVideoPaused; // Використовуємо існуюче значення
                // Якщо інші поля не змінювались, міграція не потрібна (перевірка migrated вже врахує попередні поля)
           }
      }

      // Міграція/встановлення значення за замовчуванням для suspensionTime (перевірка, що це число)
      if (data.suspensionTime === undefined) {
          changes.suspensionTime = 600; // За замовчуванням 10 хвилин
          migrated = true;
          console.log("Service worker: Міграція: Встановлено suspensionTime=600 за замовчуванням.");
      } else {
           const parsedTime = parseInt(data.suspensionTime);
           if (isNaN(parsedTime)) {
               changes.suspensionTime = 600; // Якщо не число, скидаємо
               migrated = true;
               console.warn("Service worker: Міграція: suspensionTime мав неочікуваний формат, скинуто до 600.");
           } else {
               changes.suspensionTime = parsedTime; // Використовуємо існуюче числове значення
                // Якщо інші поля не змінювались, міграція не потрібна
                 if (!changes.hasOwnProperty('whitelistUrls') && !changes.hasOwnProperty('whitelistDomains') && !changes.hasOwnProperty('enableScreenshots') && !changes.hasOwnProperty('preventSuspendIfVideoPaused')) migrated = false;
           }
      }


    if (migrated) {
        chrome.storage.sync.set(changes, () => {
            if (chrome.runtime.lastError) {
                 console.error("Service worker: Помилка при збереженні мігрованих даних:", chrome.runtime.lastError);
            }
            console.log("Service worker: Міграція сховища завершена. Збережені зміни:", changes);
            callback();
        });
    } else {
        console.log("Service worker: Міграція сховища не потрібна.");
        callback();
    }
}


// --- Функція встановлення Alarm ---
function setupAlarm(nextCheckTime = Date.now() + suspensionTime * 1000) {
    console.log("Service worker: Спроба викликати setupAlarm(). Перевірка chrome.alarms...", typeof chrome !== 'undefined' && chrome.alarms);
    // Перевіряємо доступність API alarms
    if (typeof chrome === 'undefined' || !chrome.alarms) {
        console.error("Service worker: chrome.alarms API недоступний для setupAlarm()!");
        return;
    }

    // Спочатку очищаємо будь-який існуючий alarm
    if (chrome.alarms && typeof chrome.alarms.clear === 'function') {
        chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
            if (chrome.runtime.lastError) {
                console.warn(`Service worker: Помилка очищення Alarm '${ALARM_NAME}': ${chrome.runtime.lastError.message}`);
            } else if (wasCleared) {
                console.log(`Service worker: Alarm '${ALARM_NAME}' очищено.`);
            } else {
                console.log(`Service worker: Alarm '${ALARM_NAME}' не був очищений (можливо, не існував).`);
            }

            // Створюємо новий alarm після спроби очистити старий
            if (suspensionTime > 0) {
                // Плануємо наступну перевірку не раніше ніж через 5 секунд від зараз або в запланований час
                const when = Math.max(Date.now() + 5000, nextCheckTime);
                const minAlarmDelayMillis = 1000; // Мінімальна затримка для alarm

                // Перевіряємо доступність API create
                if (chrome.alarms && typeof chrome.alarms.create === 'function') {
                    chrome.alarms.create(ALARM_NAME, {
                        when: Math.max(Date.now() + minAlarmDelayMillis, when)
                    });
                    console.log(`Service worker: Alarm '${ALARM_NAME}' встановлено. Спрацює о ${new Date(when).toLocaleTimeString()}.`);
                } else {
                    console.error("Service worker: chrome.alarms.create недоступний.");
                }
            } else {
                console.log("Service worker: Alarm не встановлено, авто-призупинення відключено.");
            }
        });
    } else {
        console.warn("Service worker: chrome.alarms.clear недоступний або API відсутній. Пропускаємо очищення.");
        // Якщо очищення недоступне, просто створюємо alarm, якщо потрібно
        if (suspensionTime > 0) {
            const when = Math.max(Date.now() + 5000, nextCheckTime);
            const minAlarmDelayMillis = 1000;

            if (chrome.alarms && typeof chrome.alarms.create === 'function') {
                chrome.alarms.create(ALARM_NAME, {
                    when: Math.max(Date.now() + minAlarmDelayMillis, when)
                });
                console.log(`Service worker: Alarm '${ALARM_NAME}' встановлено (без попереднього очищення). Спрацює о ${new Date(when).toLocaleTimeString()}.`);
            } else {
                console.error("Service worker: chrome.alarms.create недоступний.");
            }
        } else {
            console.log("Service worker: Alarm не встановлено, авто-призупинення відключено.");
        }
    }
}

// --- Функція перевірки та призупинення вкладок (викликається з onAlarm) ---
// ЦЯ ФУНКЦІЯ ПРОДОВЖУЄ ЗАПИТУВАТИ ВСІ ВКЛАДКИ У ВСІХ ВІКНАХ
function checkInactiveTabs() {
    // Перевірка на доступність chrome.runtime перед виконанням
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        console.log("Service worker: Перевірка вкладок пропущена (chrome.runtime недоступний).");
        return;
    }
    // Якщо авто-призупинення відключено, виходимо
    if (suspensionTime <= 0) {
        console.log("Service worker: Перевірка вкладок пропущена (авто-призупинення відключено).");
        // Очищаємо alarm, якщо він був встановлений
        if (chrome.alarms && typeof chrome.alarms.clear === 'function') {
            chrome.alarms.clear(ALARM_NAME);
        }
        return;
    }

    const minInactiveTime = suspensionTime * 1000; // Мінімальний час неактивності в мілісекундах
    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`; // Префікс URL нашої сторінки призупинення
    const now = Date.now(); // Поточний час
    let nextPredictedCheckTime = Infinity; // Час наступної запланованої перевірки

    // Отримуємо список усіх вкладок
    chrome.tabs.query({}, async (tabs) => {
        // Обробка помилки запиту вкладок
        if (chrome.runtime.lastError) {
            console.error("Service worker: Помилка chrome.tabs.query під час checkInactiveTabs:", chrome.runtime.lastError);
            // Плануємо наступну перевірку через 1 хвилину у випадку помилки
            setupAlarm(now + 60000);
            return;
        }
        // Обробка випадку, коли tabs повертає null або undefined
        if (!tabs) {
            console.error("Service worker: chrome.tabs.query returned null/undefined tabs during checkInactiveTabs.");
            setupAlarm(now + 60000);
            return;
        }

        // Перебираємо всі вкладки
        for (const tab of tabs) {
            // Пропускаємо недійсні вкладки
            if (tab.id === chrome.tabs.TAB_ID_NONE) continue;

            const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'); // Чи це внутрішня сторінка Chrome або розширення
            const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix); // Чи це вже наша сторінка призупинення
            const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://'); // Чи це стандартна веб-сторінка
            // Перевірка білого списку повинна використовувати оригінальний URL, якщо вкладка вже призупинена нами
            const effectiveUrlForWhitelistCheck = isOurSuspendedPage && suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
            const tabIsWhitelisted = isWhitelisted(effectiveUrlForWhitelistCheck); // Чи вкладка знаходиться у білому списку

            // Отримуємо стан відео для поточної вкладки
            const tabVideoState = videoState[tab.id];
            // Визначаємо, чи присутнє відео на паузі, яке блокує призупинення (опція включена, є відео, воно відтворювалося, але зараз на паузі)
            const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;

            // Перевіряємо умови для призупинення
            // Вкладка повинна бути: неактивною, стандартною веб-сторінкою, не внутрішньою/нашою сторінкою, не в білому списку,
            // І не повинна мати відео на паузі, яке блокує призупинення.
            if (!tab.active && isHttpOrHttps && !isInternalPage && !isOurSuspendedPage && !tabIsWhitelisted) {
                const lastActive = lastActivity[tab.id] || tab.lastAccessed || 0; // Час останньої активності вкладки
                const inactiveDuration = now - lastActive; // Тривалість неактивності
                const potentialNextEligibilityTime = lastActive + minInactiveTime; // Час, коли вкладка потенційно стане готовою до призупинення

                // Якщо тривалість неактивності досягла порогу і відео не блокує призупинення
                if (inactiveDuration >= minInactiveTime && !hasPausedVideoBlockingSuspend) {
                    console.log(`Service worker: Таймер: Призупинення вкладки ${tab.id}: "${tab.title}"`);
                    try {
                        // Призупиняємо вкладку з причиною 'timer'. Скріншот робиться окремо періодично.
                        await suspendTab(tab, 'timer');
                    } catch (error) {
                        console.error(`Service worker: Failed to suspend tab ${tab.id} by timer:`, error);
                    }
                } else {
                    // Якщо вкладка ще не готова до призупинення або заблокована відео
                    // Плануємо наступну перевірку на основі найближчого часу, коли будь-яка вкладка може стати готовою
                     if (potentialNextEligibilityTime < nextPredictedCheckTime) {
                         nextPredictedCheckTime = potentialNextEligibilityTime;
                     }
                     // Логування причин, чому вкладка не призупинена (опціонально, для відладки)
                    /*
                    if (hasPausedVideoBlockingSuspend) {
                        console.log(`Service worker: Пропущено призупинення вкладки ${tab.id} через відео на паузі (було відтворено). Наступна можлива перевірка для цієї вкладки: ${new Date(potentialNextEligibilityTime).toLocaleTimeString()}`);
                    } else if (inactiveDuration < minInactiveTime) {
                         console.log(`Service worker: Вкладка ${tab.id} активна нещодавно (${Math.floor(inactiveDuration/1000)}s). Наступна перевірка: ${new Date(potentialNextEligibilityTime).toLocaleTimeString()}`);
                    }
                    */
                }
            } else {
                 // Вкладка не може бути призупинена з інших причин (активна, системна, наша сторінка, в білому списку)
                 // Для таких вкладок не потрібно оновлювати nextPredictedCheckTime на основі їх неактивності.
            }
        } // Закриваємо цикл for

        // Плануємо наступний alarm
        // Плануємо наступний alarm лише якщо є придатні вкладки або якщо був збій (в цьому випадку nextPredictedCheckTime може бути Infinity, і ми використовуємо fallback now + 5000)
        if (nextPredictedCheckTime !== Infinity || tabs.length === 0) { // Перевіряємо tabs.length, бо якщо вкладок 0, то nextPredictedCheckTime буде Infinity
             setupAlarm(Math.max(now + 5000, nextPredictedCheckTime)); // Наступна перевірка не раніше, ніж через 5 секунд
        } else {
            console.log("Service worker: Немає придатних вкладок для планування наступної перевірки Alarm.");
            // Якщо немає вкладок, які можуть бути призупинені, очищаємо alarm
            if (chrome.alarms && typeof chrome.alarms.clear === 'function') {
                chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
                    if (chrome.runtime.lastError) console.warn(`Service worker: Помилка очищення Alarm '${ALARM_NAME}': ${chrome.runtime.lastError.message}`);
                    else if (wasCleared) console.log(`Service worker: Alarm '${ALARM_NAME}' очищено (немає придатних вкладок).`);
                });
            }
        }
    }); // Закриваємо chrome.tabs.query
} // Закриваємо функцію checkInactiveTabs

// Перевірка, чи URL знаходиться у білому списку
function isWhitelisted(url) {
    // Важливо: Ця функція повинна використовувати оригінальний URL вкладки,
    // навіть якщо вкладка зараз показує suspend.html.
    // Фоновий скрипт передає оригінальний URL при виклику цієї функції,
    // або використовує originalInfo.url, якщо він доступний.
    if (!url || !url.startsWith('http')) return false; // Білий список застосовується лише до http/https
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;

        // Перевірка прямого збігу URL (з урахуванням регістру)
        if (whitelistUrls.includes(url)) return true;

        // Перевірка збігу домену (точний або субдомен, без урахування регістру, оскільки домени зберігаються у нижньому регістрі)
        const lowerDomain = domain.toLowerCase();
        return whitelistDomains.some(d => {
            if (lowerDomain === d) return true; // Точний збіг домену
            // Додаємо перевірку, щоб d не був порожнім або не починався з точки
            if (d && !d.startsWith('.') && lowerDomain.endsWith('.' + d)) return true; // Збіг субдомену (наприклад, www.example.com для example.com)
            return false;
        });
    } catch (e) {
        console.error(`Service worker: Помилка парсингу URL для перевірки білого списку: ${url}`, e);
        return false; // Вважаємо недійсні URL не в білому списку
    }
}

// Функція призупинення вкладки шляхом зміни її URL
async function suspendTab(tab, reason = 'timer') {
    // Перевірка на доступність chrome.runtime та дійсність вкладки
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !tab || tab.id === chrome.tabs.TAB_ID_NONE) {
        console.warn("Service worker: Неможливо призупинити вкладку, chrome.runtime недоступний або вкладка недійсна.");
        return Promise.reject(new Error("Invalid environment or tab"));
    }

    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`; // Префікс URL нашої сторінки призупинення
    // Отримуємо стан відео для поточної вкладки
    const tabVideoState = videoState[tab.id];
    // Визначаємо, чи присутнє відео на паузі, яке блокує призупинення
    const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;


    // Перевіряємо, чи можна призупинити вкладку (використовуємо tab.url для перевірки, чи це вже не наша сторінка)
    // Важливо: перевірка білого списку тут повинна використовувати оригінальний URL, а не поточний suspend.html URL
    // Якщо вкладка вже на suspend.html, ми не намагаємося її призупинити знову.
    const effectiveUrlForWhitelistCheck = suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith(ourSuspendUrlPrefix) || !tab.url.startsWith('http') || isWhitelisted(effectiveUrlForWhitelistCheck) || hasPausedVideoBlockingSuspend) {
        let skipReason = 'Unknown';
        if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) skipReason = 'System/Extension';
        else if (tab.url.startsWith(ourSuspendUrlPrefix)) skipReason = 'Already Suspended';
        else if (!tab.url.startsWith('http')) skipReason = 'Non-HTTP';
        // Тут використовуємо effectiveUrlForWhitelistCheck для причини, яка відобразиться в логах
        else if (isWhitelisted(effectiveUrlForWhitelistCheck)) skipReason = 'Whitelisted';
        else if (hasPausedVideoBlockingSuspend) skipReason = 'Video Paused (after playing)'; // Вказуємо, що блокує відео на паузі

        console.warn(`Service worker: Пропущено призупинення вкладки ${tab.id}: ${tab.url} (Причина: ${skipReason})`);
        return Promise.resolve(); // Повертаємо успіх, оскільки призупинення не вимагалося
    }

    console.log(`Service worker: Спроба призупинити вкладку ${tab.id}: "${tab.title || 'Без назви'}" - ${tab.url} (Причина: ${reason})`);

    // Зберігаємо оригінальну інформацію про вкладку
    const originalUrl = tab.url;
    const originalTitle = tab.title;
    const currentTabId = tab.id;
    const favIconUrl = tab.favIconUrl || '';

    suspendedTabInfo[currentTabId] = suspendedTabInfo[currentTabId] || {}; // Ініціалізуємо об'єкт, якщо його ще немає
    suspendedTabInfo[currentTabId].url = originalUrl;
    suspendedTabInfo[currentTabId].title = originalTitle;
    suspendedTabInfo[currentTabId].favIconUrl = favIconUrl;
    // Зберігаємо час призупинення лише при ПЕРШОМУ призупиненні (щоб час неактивності не скидався, якщо вкладка була відновлена, а потім знову призупинена)
    if (!suspendedTabInfo[currentTabId].suspendedTime) {
         suspendedTabInfo[currentTabId].suspendedTime = Date.now();
    }
    suspendedTabInfo[currentTabId].reason = reason; // Причина призупинення ('timer' або 'manual')

    console.log(`Service worker: Збережено інфо призупинення для вкладки ${currentTabId}:`, suspendedTabInfo[currentTabId]);

    // Формуємо URL нашої сторінки призупинення з параметрами
    // Використовуємо encodeURIComponent для всіх параметрів
    const suspendedPageUrl = `${ourSuspendUrlPrefix}?url=${encodeURIComponent(originalUrl || '')}&title=${encodeURIComponent(originalTitle || '')}&tabId=${currentTabId}&favIconUrl=${encodeURIComponent(favIconUrl || '')}`;

    // Оновлюємо URL вкладки на нашу сторінку призупинення
    try {
        await chrome.tabs.update(currentTabId, { url: suspendedPageUrl });
        console.log(`Service worker: Вкладка ${currentTabId} призупинена (змінено URL).`);
        delete videoState[currentTabId]; // Очищаємо стан відео після призупинення
        // Не очищаємо скріншот тут, він потрібен на suspend.html
        return Promise.resolve(); // Успіх
    } catch (e) {
        console.error(`Service worker: Помилка оновлення URL вкладки ${currentTabId}:`, e);
        // При помилці оновлення URL, видаляємо збережену інфо призупинення,
        // ОСКІЛЬКИ ВКЛАДКА НЕ ПЕРЕЙШЛА НА SUSPEND.HTML
        delete suspendedTabInfo[currentTabId];
        console.log(`Service worker: Видалено інфо призупинення для вкладки ${currentTabId} через помилку оновлення URL.`);

        // У випадку помилки також очищаємо скріншот
        chrome.storage.session.remove(`screenshot_${currentTabId}`).catch(err => console.warn(`Service worker: Помилка очищення старого скріншоту для ${currentTabId}:`, err));
        return Promise.reject(e); // Повертаємо помилку
    }
}

// Очищаємо дані для закритих вкладок
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
    if (lastActivity[tabId]) {
        delete lastActivity[tabId];
        console.log(`Service worker: Очищено активність для вкладки ${tabId}.`);
    }
    if (suspendedTabInfo[tabId]) {
        delete suspendedTabInfo[tabId];
        console.log(`Service worker: Очищено suspended info для видаленої вкладки ${tabId}.`);
    }
    if (videoState[tabId]) {
        delete videoState[tabId];
        console.log(`Service worker: Очищено video state для видаленої вкладки ${tabId}.`);
    }
    // Очищаємо збережений скріншот для видаленої вкладки
    chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення скріншоту для видаленої вкладки ${tabId}:`, e));
    // ЗМІНЕНО: Очищаємо debounced захоплення, якщо видалено вкладку (вона могла бути активною)
    clearTimeout(interactionCaptureTimeoutId);

    // Плануємо наступну перевірку неактивних вкладок через короткий час
    setTimeout(checkInactiveTabs, 100);
});

// Оновлюємо активність при оновленні вкладки або активації
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Перевірка на доступність chrome.runtime
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        return;
    }
    if (tabId === chrome.tabs.TAB_ID_NONE) return; // Пропускаємо недійсні ID

    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
    const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix); // Чи вкладка переходить на нашу сторінку призупинення
    const wasSuspendedByUs = suspendedTabInfo[tabId]; // Чи була ця вкладка раніше призупинена нами (перевіряємо перед зміною URL)

    // Якщо URL змінився (і це не наша сторінка призупинення) або сторінка повністю завантажилася (і це не наша сторінка призупинення)
    if ((changeInfo.url && !changeInfo.url.startsWith(ourSuspendUrlPrefix)) || (changeInfo.status === 'complete' && !isOurSuspendedPage)) {
        if (tab.id !== chrome.tabs.TAB_ID_NONE) {
            lastActivity[tab.id] = Date.now(); // Оновлюємо час останньої активності
            // Не викликаємо checkInactiveTabs тут одразу, щоб уникнути надмірного навантаження
            // Alarm спрацює у свій час, або буде перепланований.
            // setTimeout(checkInactiveTabs, 100); // Це викликається в onActivated або onRemoved, цього достатньо
        }
        // Якщо URL змінився і це не наша сторінка призупинення, очищаємо стан відео для цієї вкладки
        if (changeInfo.url && !changeInfo.url.startsWith(ourSuspendUrlPrefix)) {
             // Використовуємо changeInfo.url, бо tab.url може бути ще старим на цей момент
            if (videoState[tabId]) {
                delete videoState[tabId];
                console.log(`Service worker: Очищено video state для вкладки ${tabId} через зміну URL.`);
            }
        }
        // Якщо URL змінився, очищаємо збережений скріншот для цієї вкладки, оскільки він вже не актуальний
        if (changeInfo.url && tab.id !== chrome.tabs.TAB_ID_NONE) {
            chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення скріншоту при оновленні URL для ${tabId}:`, e));
             console.log(`Service worker: Очищено скріншот для вкладки ${tabId} через зміну URL.`);
        }
    }

     // Якщо сторінка повністю завантажилася І це стандартна http/https сторінка (не наша suspend page)
     // І ця вкладка раніше була призупинена нами (тобто користувач натиснув "Повернутись")
     if (changeInfo.status === 'complete' && tab.id !== chrome.tabs.TAB_ID_NONE && (tab.url.startsWith('http://') || tab.url.startsWith('https://')) && !isOurSuspendedPage && wasSuspendedByUs) {
          console.log(`Service worker: Вкладка ${tabId} відновлена (навігація з suspend.html). Очищення інформації про призупинення.`);
          delete suspendedTabInfo[tab.id]; // Очищаємо інформацію про призупинення
          // Очищаємо збережений скріншот після успішного відновлення (вже зроблено вище при зміні URL)
          // chrome.storage.session.remove(`screenshot_${tabId}`).catch(e => console.warn(`Service worker: Помилка очищення скріншоту після відновлення для ${tabId}:`, e));
          setTimeout(checkInactiveTabs, 100); // Плануємо перевірку
     }


    // Якщо вкладка оновлюється до нашої сторінки призупинення і у нас немає збереженої інфи про неї
    // (може статися при перезавантаженні service worker або браузера)
    if (changeInfo.url && changeInfo.url.startsWith(ourSuspendUrlPrefix) && tab.id !== chrome.tabs.TAB_ID_NONE) {
        if (!suspendedTabInfo[tab.id]) {
            // Спробуємо витягти оригінальну інфо з параметрів URL
            try {
                const params = new URLSearchParams(new URL(changeInfo.url).search);
                const originalUrl = decodeURIComponent(params.get('url') || '');
                const originalTitle = decodeURIComponent(params.get('title') || '');
                const favIconUrlFromUrl = decodeURIComponent(params.get('favIconUrl') || '');
                const originalTabIdFromUrl = parseInt(params.get('tabId') || tab.id, 10); // Парсимо з radix 10

                 const effectiveTabId = originalTabIdFromUrl;

                 // Перевіряємо, що TabID з URL відповідає поточному TabID
                 if (originalUrl && effectiveTabId !== chrome.tabs.TAB_ID_NONE && effectiveTabId === tab.id) {
                    suspendedTabInfo[effectiveTabId] = {
                        url: originalUrl,
                        title: originalTitle,
                        favIconUrl: favIconUrlFromUrl,
                        suspendedTime: suspendedTabInfo[effectiveTabId]?.suspendedTime || Date.now(), // Зберігаємо існуючий час або поточний
                        reason: suspendedTabInfo[effectiveTabId]?.reason || 'unknown' // Зберігаємо існуючу причину або unknown
                    };
                    console.log(`Service worker: При старті/ононовленні до suspend.html: відновлено інфо призупиненої вкладки ${effectiveTabId} з URL.`);
                 } else {
                      console.warn(`Service worker: Не вдалося відновити інфо призупиненої вкладки з URL ${changeInfo.url}. EffectiveTabId: ${effectiveTabId}, CurrentTabId: ${tab.id}`);
                 }
            } catch (e) {
                console.error(`Service worker: Помилка парсингу URL або обробки відновлення інфо з suspend.html URL ${changeInfo.url}:`, e);
            }
        }
        // Очищаємо стан відео, оскільки вкладка перейшла на suspend.html
        if (videoState[tabId]) {
            delete videoState[tabId];
            console.log(`Service worker: Очищено video state для вкладки ${tabId} після переходу на suspend.html.`);
        }
         // Не очищаємо скріншот тут, він потрібен на suspend.html (вже зроблено вище при зміні URL)
    }

     // ЗМІНЕНО: Зупиняємо debounced захоплення, якщо активна вкладка змінює URL
     // Це потрібно, щоб активність на попередній сторінці не викликала скріншот після навігації
     if (tabId === chrome.tabs.TAB_ID_NONE || !tab || !tab.active || changeInfo.url) {
          clearTimeout(interactionCaptureTimeoutId);
     }
});

// Оновлюємо активність при активації вкладки
chrome.tabs.onActivated.addListener((activeInfo) => {
    // Перевірка на доступність chrome.runtime
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        return;
    }
    if (activeInfo.tabId !== chrome.tabs.TAB_ID_NONE) {
        lastActivity[activeInfo.tabId] = Date.now(); // Оновлюємо час активності
        // Не викликаємо checkInactiveTabs тут одразу
        setTimeout(checkInactiveTabs, 100); // Плануємо перевірку через короткий час після активації

        // --- ЗМІНЕНО: Запускаємо захоплення ОДНОГО початкового скріншоту для нової активної вкладки ---
        chrome.tabs.get(activeInfo.tabId, (tab) => {
             if (chrome.runtime.lastError || !tab || tab.id === chrome.tabs.TAB_ID_NONE || tab.windowId === chrome.windows.WINDOW_ID_NONE) {
                  console.warn(`Service worker: Не вдалося отримати вкладку ${activeInfo.tabId} для початкового скріншоту:`, chrome.runtime.lastError);
                  // ЗМІНЕНО: Очищаємо debounced захоплення, якщо вкладка недійсна
                  clearTimeout(interactionCaptureTimeoutId);
                  return;
             }
             // Запускаємо захоплення з невеликою затримкою, щоб дати сторінці відрендеритися
             // та перевіряємо, що це захоплювана сторінка
             const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
             const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
             const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
             const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');

             if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
                  console.log(`Service worker: Плануємо початковий скріншот для вкладки ${tab.id} через ${SCREENSHOT_INITIAL_DELAY}ms.`);
                  // ЗМІНЕНО: Очищаємо попередній debounced capture, який міг бути запланований для попередньої активної вкладки
                  clearTimeout(interactionCaptureTimeoutId);
                   setTimeout(() => {
                       captureAndSaveScreenshotForTab(tab.id, tab.windowId);
                   }, SCREENSHOT_INITIAL_DELAY);
             } else {
                  // Якщо вкладка не підходить для скріншотів, очищаємо debounced capture
                  clearTimeout(interactionCaptureTimeoutId);
             }
        });
        // --- Кінець ЗМІНЕНО ---
    } else {
         // ЗМІНЕНО: Якщо activeInfo.tabId === chrome.tabs.TAB_ID_NONE, очищаємо debounced capture
         clearTimeout(interactionCaptureTimeoutId);
    }
});

// Початкове заповнення lastActivity на основі поточних відкритих вкладок при старті service worker
console.log("Service worker: Виконання chrome.tabs.query при старті скрипта...");
chrome.tabs.query({}, (tabs) => {
    // Перевірка на доступність chrome.runtime
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        console.warn("Service worker: chrome.runtime недоступний для chrome.tabs.query при старті.");
        return;
    }
    // Обробка випадку, коли tabs повертає null або undefined
    if (!tabs) {
        console.error("Service worker: chrome.tabs.query returned null/undefined tabs at startup.");
        return;
    }

    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
    let initialActiveTab = null;

    tabs.forEach(tab => {
        if (tab.id !== chrome.tabs.TAB_ID_NONE) {
            // Заповнюємо lastActivity, використовуючи існуючі дані або поточний час
            lastActivity[tab.id] = lastActivity[tab.id] || tab.lastAccessed || Date.now();

            // Якщо вкладка на нашій сторінці призупинення, але ми не маємо її інфи, спробуємо відновити з URL
            if (tab.url.startsWith(ourSuspendUrlPrefix) && !suspendedTabInfo[tab.id]) {
                try {
                    const params = new URLSearchParams(new URL(tab.url).search);
                    const originalUrl = decodeURIComponent(params.get('url') || '');
                    const originalTitle = decodeURIComponent(params.get('title') || '');
                    const favIconUrlFromUrl = decodeURIComponent(params.get('favIconUrl') || '');
                    const originalTabIdFromUrl = parseInt(params.get('tabId') || tab.id, 10);

                    const effectiveTabId = originalTabIdFromUrl;

                    // Перевіряємо, що TabID з URL відповідає поточному TabID
                    if (originalUrl && effectiveTabId !== chrome.tabs.TAB_ID_NONE && effectiveTabId === tab.id) {
                        suspendedTabInfo[effectiveTabId] = {
                            url: originalUrl,
                            title: originalTitle,
                            favIconUrl: favIconUrlFromUrl,
                            suspendedTime: suspendedTabInfo[effectiveTabId]?.suspendedTime || Date.now(), // Зберігаємо існуючий час або поточний
                            reason: suspendedTabInfo[effectiveTabId]?.reason || 'unknown' // Зберігаємо існуючу причину або unknown
                        };
                        console.log(`Service worker: При старті: відновлено інфо призупиненої вкладки ${effectiveTabId} з URL.`);
                    } else {
                        console.warn(`Service worker: При старті: Не вдалося відновити інфо призупиненої вкладки з URL ${tab.url}. EffectiveTabId: ${effectiveTabId}, CurrentTabId: ${tab.id}`);
                    }
                } catch (e) {
                     console.error(`Service worker: При старті: Помилка парсингу URL або обробки відновлення інфо з suspend.html URL ${tab.url}:`, e);
                }
            }

            // Знаходимо початкову активну вкладку для запуску захоплення скріншотів
            // Перевіряємо, що це відповідний тип сторінки
            const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
            const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
            const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');

            if (tab.active && tab.windowId !== chrome.windows.WINDOW_ID_NONE && isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
                initialActiveTab = tab;
            }
        }
    });
    console.log("Service worker: Початкова lastActivity та suspendedTabInfo заповнені.");

    // ЗМІНЕНО: Запускаємо захоплення ОДНОГО скріншота для початкової активної вкладки, якщо вона є
    if (initialActiveTab) {
        console.log(`Service worker: При старті: плануємо початковий скріншот для активної вкладки ${initialActiveTab.id} через ${SCREENSHOT_INITIAL_DELAY}ms.`);
        clearTimeout(interactionCaptureTimeoutId); // Скидаємо таймер захоплення
         setTimeout(() => {
            captureAndSaveScreenshotForTab(initialActiveTab.id, initialActiveTab.windowId);
         }, SCREENSHOT_INITIAL_DELAY);
    } else {
         // Якщо немає активних вкладок при старті, очищаємо debounced capture
         clearTimeout(interactionCaptureTimeoutId);
    }
    // --- Кінець ЗМІНЕНО ---

     // Запускаємо початкову перевірку Alarm після завантаження налаштувань та заповнення lastActivity
     // Це також відбудеться після міграції даних у callback `chrome.storage.sync.get`
     // checkInactiveTabs(); // Цей виклик зайвий, він вже є в callback `chrome.storage.sync.get` після міграції
});

// Слухаємо alarms
if (typeof chrome !== 'undefined' && chrome.alarms) {
    chrome.alarms.onAlarm.addListener((alarm) => {
        // Перевірка на доступність chrome.runtime
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
            console.warn("Service worker: Alarm спрацював, але chrome.runtime недоступний.");
            return;
        }
        // Якщо спрацював наш alarm, запускаємо перевірку вкладок
        if (alarm.name === ALARM_NAME) {
            console.log(`Service worker: Alarm '${ALARM_NAME}' спрацював. Перевірка вкладок...`);
            checkInactiveTabs();
        }
    });
    console.log("Service worker: Слухач chrome.alarms.onAlarm додано.");
} else {
    console.error("Service worker: chrome.alarms API недоступний для додавання слухача onAlarm!");
}

// Обробка повідомлень від контент-скриптів, popup, options тощо.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Перевірка на доступність chrome.runtime
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        console.warn("Service worker: Отримано повідомлення, але chrome.runtime недоступний.");
        sendResponse({ success: false, error: "chrome.runtime недоступний" });
        return true; // Вказуємо, що sendResponse буде викликано асинхронно
    }

    let responseSent = false;
    // Допоміжна функція для надсилання відповіді лише один раз
    const sendAsyncResponse = (response) => {
        if (!responseSent) {
            // Перевіряємо, чи порт ще відкритий перед надсиланням відповіді
            // Це може статися, якщо UI-сторінка (popup/options/suspend/debug) була закрита раніше
             try {
                 if (typeof sendResponse === 'function') { // Перевіряємо, чи sendResponse є дійсною функцією
                    sendResponse(response);
                 } else {
                     console.warn("Service worker: sendResponse is not a function. UI page likely closed.", request, response);
                 }
             } catch (e) {
                  // Може статися помилка "The message port closed before a response was received."
                  console.warn("Service worker: Помилка надсилання відповіді: порт закрито.", e, request, response);
             }
            responseSent = true;
        } else {
            console.warn("Service worker: sendResponse викликано кілька разів для одного повідомлення.", request, response);
        }
    };

    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;

    switch (request.action) {
        case 'updateActivity':
            // Оновлення активності вкладки за її ID
            if (sender.tab && sender.tab.id !== chrome.tabs.TAB_ID_NONE) {
                lastActivity[sender.tab.id] = Date.now(); // Оновлюємо час останньої активності
                // Не викликаємо checkInactiveTabs тут одразу, щоб уникнути надмірного навантаження
                // Alarm спрацює у свій час, або буде перепланований.

                 // --- ДОДАНО: Запускаємо захоплення скріншоту при взаємодії (якщо вкладка активна) ---
                 // Захоплюємо скріншот лише для активної вкладки при отриманні повідомлення про активність
                 if (sender.tab.active) {
                     const tab = sender.tab;
                     const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                     const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                     const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
                     const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');

                     // Перевіряємо, чи вкладка підходить для захоплення скріншоту
                     if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
                         // Викликаємо debounced функцію захоплення скріншоту
                         debouncedCaptureOnInteraction(tab.id, tab.windowId);
                          // console.log(`Service worker: Отримано активність від активної вкладки ${tab.id}. Заплановано debounced скріншот.`);
                     }
                 }
                 // --- Кінець ДОДАНО ---

                sendAsyncResponse({ success: true });
            } else {
                sendAsyncResponse({ success: false, error: "No valid tab ID in sender" });
            }
            break;

        case 'updateVideoState':
            // Оновлення стану відео для вкладки за її ID
            if (sender.tab && sender.tab.id !== chrome.tabs.TAB_ID_NONE && request.state !== undefined) {
                // Перевіряємо, чи отримано повний об'єкт стану відео
                if (request.state.hasVideo !== undefined && request.state.isPlaying !== undefined && request.state.hasPlayed !== undefined) {
                    // Зберігаємо стан відео. Порівнюємо з попереднім станом, щоб уникнути зайвих оновлень
                    const currentVideoState = videoState[sender.tab.id];
                     if (!currentVideoState || currentVideoState.hasVideo !== request.state.hasVideo || currentVideoState.isPlaying !== request.state.isPlaying || currentVideoState.hasPlayed !== request.state.hasPlayed) {
                        videoState[sender.tab.id] = request.state; // Зберігаємо стан відео
                        // Плануємо перевірку лише якщо стан відео дійсно змінився
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
            // Запит на ручне призупинення конкретної вкладки
            if (request.tabId !== undefined && request.tabId !== chrome.tabs.TAB_ID_NONE) {
                chrome.tabs.get(request.tabId, (tab) => {
                    // Обробка помилки отримання вкладки
                    if (chrome.runtime.lastError) {
                        console.error(`Service worker: Не вдалося отримати вкладку для призупинення: ${request.tabId}`, chrome.runtime.lastError);
                        sendAsyncResponse({ success: false, error: chrome.runtime.lastError.message || "Invalid tab ID" });
                        return;
                    }
                    // Обробка випадку, коли вкладка не знайдена або недійсна
                    if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) {
                        console.error(`Service worker: Отримано недійсну вкладку об'єкт для призупинення: ${request.tabId}`);
                        sendAsyncResponse({ success: false, error: "Invalid tab object received" });
                        return;
                    }

                    // Перевірка умов, які забороняють призупинення (включаючи нову умову відео на паузі)
                    const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                    const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
                    const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');
                    // Використовуємо оригінальний URL для перевірки білого списку, якщо він доступний
                     const effectiveUrlForWhitelistCheck = suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
                    const tabIsWhitelisted = isWhitelisted(effectiveUrlForWhitelistCheck);
                    const tabVideoState = videoState[tab.id];
                    // Перевіряємо, чи відео на паузі блокує призупинення
                    const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;

                    // При ручному призупиненні, перевірка повинна бути на поточному стані вкладки tab.url
                    // Якщо вкладка вже на suspend.html, ми її не призупиняємо ручно.
                    if (!isHttpOrHttps || isInternalPage || isOurSuspendedPage || isWhitelisted(tab.url) || hasPausedVideoBlockingSuspend) {
                        let skipReason = 'Cannot suspend';
                        if (isInternalPage) skipReason = 'System/Extension Page';
                        else if (isOurSuspendedPage) skipReason = 'Already Suspended';
                        else if (!isHttpOrHttps) skipReason = 'Non-HTTP Page';
                        // Тут використовуємо tab.url, бо це ручне призупинення активної вкладки з Popup
                        else if (isWhitelisted(tab.url)) skipReason = 'Whitelisted';
                        else if (hasPausedVideoBlockingSuspend) skipReason = 'Video Paused (after playing)'; // Причина - відео на паузі

                        console.warn(`Service worker: Неможливо ручно призупинити вкладку ${tab.id}: ${tab.url} (Причина: ${skipReason})`);
                        sendAsyncResponse({ success: false, error: `Cannot suspend this page: ${skipReason}` });
                    } else {
                        // Якщо призупинення дозволено, встановлюємо причину 'manual' та призупиняємо
                        if (tab.id !== chrome.tabs.TAB_ID_NONE) {
                            suspendedTabInfo[tab.id] = suspendedTabInfo[tab.id] || {};
                             // Зберігаємо оригінальний URL, якщо його ще немає (наприклад, при першому ручному призузупиненні)
                             if(!suspendedTabInfo[tab.id].url) suspendedTabInfo[tab.id].url = tab.url;
                             if(!suspendedTabInfo[tab.id].title) suspendedTabInfo[tab.id].title = tab.title;
                             if(!suspendedTabInfo[tab.id].favIconUrl) suspendedTabInfo[tab.id].favIconUrl = tab.favIconUrl;
                             if(!suspendedTabInfo[tab.id].suspendedTime) suspendedTabInfo[tab.id].suspendedTime = Date.now(); // Встановлюємо час призупинення
                            suspendedTabInfo[tab.id].reason = 'manual';
                            console.log(`Service worker: Причина призупинення для вкладки ${tab.id} встановлена на 'manual'.`);
                        }
                        // При ручному призупиненні, скріншот для активної вкладки вже міг бути захоплений
                        // при активації або останній взаємодії. Немає потреби викликати captureVisibleTab тут синхронно.
                        suspendTab(tab, 'manual')
                            .then(() => {
                                sendAsyncResponse({ success: true });
                                setTimeout(checkInactiveTabs, 100); // Плануємо перевірку після призупинення
                            })
                            .catch((error) => {
                                console.error(`Service worker: Failed to manually suspend tab ${tab.id}:`, error);
                                sendAsyncResponse({ success: false, error: error.message });
                            });
                    }
                });
            } else {
                console.warn("Service worker: Отримано запит на призупинення недійсної вкладки ID:", request.tabId);
                sendAsyncResponse({ success: false, error: "Invalid tab ID provided" });
            }
            return true; // Вказуємо, що sendResponse буде викликано асинхронно

        case 'suspendAll':
            // Запит на ручне призупинення всіх фонових вкладок
            chrome.tabs.query({ active: false }, async (allInactiveTabs) => {
                // Обробка помилки запиту вкладок
                if (chrome.runtime.lastError) {
                    console.error("Service worker: Помилка chrome.tabs.query під час suspendAll:", chrome.runtime.lastError);
                    sendAsyncResponse({ success: false, error: chrome.runtime.lastError.message || "Failed to query tabs" });
                    return;
                }
                if (!allInactiveTabs) {
                    console.error("Service worker: chrome.tabs.query returned null/undefined tabs during suspendAll.");
                    sendAsyncResponse({ success: false, error: "Failed to query tabs: Null response" });
                    return;
                }
                console.log(`Service worker: Ручне призупинення всіх фонових вкладок (${allInactiveTabs.length})...`);
                let successCount = 0;
                // Перебираємо всі неактивні вкладки
                for (const tab of allInactiveTabs) {
                     // Перевірка умов, які забороняють призупинення (включаючи нову умову відео на паузі)
                    const isInternalPage = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                    const isOurSuspendedPage = tab.url.startsWith(ourSuspendUrlPrefix);
                    const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');
                    // Використовуємо оригінальний URL для перевірки білого списку
                    const effectiveUrlForWhitelistCheck = suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
                    const tabIsWhitelisted = isWhitelisted(effectiveUrlForWhitelistCheck);
                    const tabVideoState = videoState[tab.id];
                     // Перевіряємо, чи відео на паузі блокує призупинення
                    const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;


                    // Якщо вкладка може бути призупинена (за tab.url, бо вона фонова)
                    if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage && !tabIsWhitelisted && !hasPausedVideoBlockingSuspend) {
                        try {
                            if (tab.id !== chrome.tabs.TAB_ID_NONE) {
                                suspendedTabInfo[tab.id] = suspendedTabInfo[tab.id] || {};
                                // Зберігаємо оригінальний URL, якщо його ще немає
                                 if(!suspendedTabInfo[tab.id].url) suspendedTabInfo[tab.id].url = tab.url;
                                 if(!suspendedTabInfo[tab.id].title) suspendedTabInfo[tab.id].title = tab.title;
                                 if(!suspendedTabInfo[tab.id].favIconUrl) suspendedTabInfo[tab.id].favIconUrl = tab.favIconUrl;
                                 if(!suspendedTabInfo[tab.id].suspendedTime) suspendedTabInfo[tab.id].suspendedTime = Date.now(); // Встановлюємо час призупинення
                                suspendedTabInfo[tab.id].reason = 'manual'; // Встановлюємо причину 'manual'
                                console.log(`Service worker: Причина призупинення для вкладки ${tab.id} встановлена на 'manual' (suspendAll).`);
                            }
                            // При ручному призупиненні всіх, скріншоти не робляться для кожної фонової вкладки.
                            // Це було б надто ресурсомістко.
                            await suspendTab(tab, 'manual'); // Призупиняємо вкладку
                            successCount++; // Лічильник успішних призупинень
                        } catch (e) {
                            console.error(`Service worker: Помилка ручного призупинення вкладки ${tab.id}: ${tab.url}`, e);
                        }
                    } else {
                        let skipReason = 'Unknown';
                        if (isInternalPage) skipReason = 'System/Extension';
                        else if (isOurSuspendedPage) skipReason = 'Already Suspended';
                        else if (!isHttpOrHttps) skipReason = 'Non-HTTP';
                         // Тут використовуємо tab.url для логування, але isWhitelisted використовує effectiveUrlForWhitelistCheck
                        else if (tabIsWhitelisted) skipReason = 'Whitelisted';
                        else if (hasPausedVideoBlockingSuspend) skipReason = 'Video Paused (after playing)'; // Причина - відео на паузі
                        console.log(`Service worker: Пропущено ручне призупинення вкладки ${tab.id}: ${tab.url} (Причина: ${skipReason})`);
                    }
                }
                console.log(`Service worker: Ручне призупинення завершено. Успішно призупинено: ${successCount}.`);
                sendAsyncResponse({ success: true, suspendedCount: successCount });
                setTimeout(checkInactiveTabs, 100); // Плануємо перевірку після призупинення
            });
            return true; // Вказуємо, що sendResponse буде викликано асинхронно

        case 'addToWhitelistUrl':
            // Запит на додавання URL до білого списку
            if (request.url) {
                const urlToAdd = request.url.trim();
                // Перевіряємо формат URL (повинен бути http або https)
                if (urlToAdd && (urlToAdd.startsWith('http://') || urlToAdd.startsWith('https://'))) {
                    // Перевіряємо, чи URL вже є у списку
                    if (!whitelistUrls.includes(urlToAdd)) {
                        whitelistUrls.push(urlToAdd); // Додаємо до списку
                        // Зберігаємо оновлений список у сховищі
                        chrome.storage.sync.set({ whitelistUrls }, () => {
                            if (chrome.runtime.lastError) {
                                console.error("Service worker: Помилка збереження білого списку URL:", chrome.runtime.lastError);
                                sendAsyncResponse({ success: false, error: chrome.runtime.lastError.message });
                            } else {
                                console.log(`Service worker: Додано URL до білого списку: ${urlToAdd}`);
                                setTimeout(checkInactiveTabs, 100); // Плануємо перевірку
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
            return true; // Вказуємо, що sendResponse буде викликано асинхронно

        case 'addToWhitelistDomain':
            // Запит на додавання домену до білого списку
            if (request.domain) {
                const domainToAdd = request.domain.trim().toLowerCase(); // Обрізаємо пробіли та переводимо в нижній регістр
                 // Перевіряємо формат домену (простий, не містить слешів, містить хоча б одну крапку, не містить пробілів)
                if (domainToAdd && !domainToAdd.includes('/') && domainToAdd.includes('.') && !domainToAdd.includes(' ')) {
                    // Перевіряємо, чи домен вже є у списку
                    if (!whitelistDomains.includes(domainToAdd)) {
                        whitelistDomains.push(domainToAdd); // Додаємо до списку
                         // Зберігаємо оновлений список у сховищі
                        chrome.storage.sync.set({ whitelistDomains }, () => {
                            if (chrome.runtime.lastError) {
                                console.error("Service worker: Помилка збереження білого списку доменів:", chrome.runtime.lastError);
                                sendAsyncResponse({ success: false, error: chrome.runtime.lastError.message });
                            } else {
                                console.log(`Service worker: Додано домен до білого списку: ${domainToAdd}`);
                                setTimeout(checkInactiveTabs, 100); // Плануємо перевірку
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
            return true; // Вказуємо, що sendResponse буде викликано асинхронно

        // --- handler: перевірка статусу однієї вкладки ---
        case 'checkTabStatus':
            // --- ВИПРАВЛЕННЯ: Видалено використання window.i18nTexts та будь-які функції, що його можуть використовувати ---
            // Використовуємо статичні англійські рядки для логування в SW, UI скрипти локалізують самостійно.
            if (request.tabId !== undefined && request.tabId !== chrome.tabs.TAB_ID_NONE) {
                 chrome.tabs.get(request.tabId, (tab) => {
                      if (chrome.runtime.lastError) {
                           console.error(`Service worker: Failed to get tab ${request.tabId} for status check:`, chrome.runtime.lastError); // Логуємо англійською
                           sendAsyncResponse({ success: false, error: chrome.runtime.lastError.message || "Failed to get tab status" });
                           return;
                      }
                      if (!tab || tab.id === chrome.tabs.TAB_ID_NONE) {
                           console.error(`Service worker: Received invalid tab object for status check: ${request.tabId}`); // Логуємо англійською
                           sendAsyncResponse({ success: false, error: "Invalid tab object" });
                           return;
                      }

                       // Визначаємо статус вкладки, аналогічно логіці в getDebugInfo, але тільки для однієї вкладки
                       const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`; // Потрібно визначити тут або отримати ззовні
                       const isOurSuspended = tab.url.startsWith(ourSuspendUrlPrefix);
                       const isInternal = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://');
                       const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://');
                       // Для перевірки білого списку завжди використовуємо оригінальний URL, якщо вкладка призупинена
                       const effectiveUrlForWhitelistCheck = isOurSuspended && suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
                       const tabIsWhitelisted = isWhitelisted(effectiveUrlForWhitelistCheck);
                       const tabVideoState = videoState[tab.id];
                       const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;

                       // Причина для відображення в UI Popup
                       let reasonKey = 'reasonUnknown';
                        // Спочатку перевіряємо причини, що забороняють ручне призупинення
                        if (isInternal) {
                           reasonKey = 'reasonSystem';
                       } else if (isOurSuspended) {
                           reasonKey = 'reasonSuspended'; // Просто вказуємо, що вже призупинена
                       } else if (!isHttpOrHttps) {
                            reasonKey = 'reasonError'; // Не HTTP/HTTPS
                       } else if (isWhitelisted(tab.url)) { // Перевіряємо білий список за поточним URL для Popup
                           reasonKey = 'reasonWhitelisted';
                       } else if (hasPausedVideoBlockingSuspend) {
                           reasonKey = 'reasonVideoPaused';
                       } else {
                           // Якщо жодна з попередніх причин не спрацювала, вкладку можна призупинити вручну
                           reasonKey = 'reasonReady'; // Можна призупинити вручну
                       }

                       // Визначаємо, чи можна призупинити вкладку вручну
                       // Ручне призупинення дозволено, якщо це http/https, не внутрішня/наша, не в білому списку (за поточним URL), і відео не блокує
                       const canManuallySuspend = isHttpOrHttps && !isInternal && !isOurSuspended && !isWhitelisted(tab.url) && !hasPausedVideoBlockingSuspend;


                       sendAsyncResponse({
                           success: true,
                           url: tab.url, // Повертаємо URL для перевірки в Popup
                           isInternalPage: isInternal,
                           isHttpOrHttps: isHttpOrHttps,
                           isOurSuspendedPage: isOurSuspended,
                           isWhitelisted: isWhitelisted(tab.url), // Повертаємо статус білого списку для поточного URL вкладки
                           hasPausedVideoBlockingSuspend: hasPausedVideoBlockingSuspend,
                           canManuallySuspend: canManuallySuspend, // Нове поле, що вказує, чи дозволено ручне призупинення
                           reasonKey: reasonKey, // Ключ причини для відображення в UI (Popup може його використати)
                           originalSuspendedUrl: suspendedTabInfo[tab.id]?.url || null // Повертаємо оригінальний URL, якщо вкладка призупинена
                       });
                 });
            } else {
                 sendAsyncResponse({ success: false, error: "Invalid tab ID provided" });
            }
            return true; // Вказуємо, що sendResponse буде викликано асинхронно
        // --- Кінець handler: checkTabStatus ---


        // --- handler: отримати скріншот за ID вкладки ---
        case 'getScreenshot':
             if (request.tabId !== undefined && request.tabId !== chrome.tabs.TAB_ID_NONE) {
                 // Отримуємо скріншот із storage.session
                 chrome.storage.session.get(`screenshot_${request.tabId}`, (result) => {
                      const screenshotUrl = result[`screenshot_${request.tabId}`];
                      sendAsyncResponse({ success: true, screenshotUrl: screenshotUrl });
                 });
             } else {
                  sendAsyncResponse({ success: false, error: "Invalid tab ID provided" });
             }
             return true; // Асинхронна відповідь


        case 'getDebugInfo':
            // Запит на отримання інформації для панелі відладки
            chrome.tabs.query({}, (tabs) => {
                // Обробка помилки запиту вкладок
                if (chrome.runtime.lastError) {
                    console.error("Service worker: Помилка chrome.tabs.query для debug info:", chrome.runtime.lastError);
                    sendAsyncResponse({ error: chrome.runtime.lastError?.message || "Failed to query tabs" });
                    return;
                }
                if (!tabs) {
                    console.error("Service worker: chrome.tabs.query повернуто null/undefined tabs.");
                    sendAsyncResponse({ error: "Failed to query tabs: Null response" });
                    return;
                }

                // Формуємо список інформації про вкладки для відладки
                const tabsInfo = tabs.map(tab => {
                    const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                    const isOurSuspended = tab.url.startsWith(ourSuspendUrlPrefix); // Чи вкладка призупинена нами
                    const isInternal = tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://'); // Чи внутрішня сторінка
                    const isHttpOrHttps = tab.url.startsWith('http://') || tab.url.startsWith('https://'); // Чи стандартна веб-сторінка

                    let reasonKey = 'reasonUnknown'; // Ключ причини (для локалізації)
                    // Визначаємо ефективний URL (для призупинених використовуємо оригінальний)
                    const effectiveUrl = isOurSuspended && suspendedTabInfo[tab.id]?.url ? suspendedTabInfo[tab.id].url : tab.url;
                    // Перевірка білого списку завжди використовує effectiveUrl
                    const tabIsWhitelisted = isWhitelisted(effectiveUrl);
                    const tabVideoState = videoState[tab.id];
                    const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;


                    // Визначаємо причину на основі стану вкладки та налаштувань
                    if (isOurSuspended) {
                        // Якщо призупинена, визначаємо чи вручну, чи таймером
                        reasonKey = suspendedTabInfo[tab.id]?.reason === 'manual' ? 'reasonSuspendedManually' : (suspendedTabInfo[tab.id]?.reason === 'timer' ? 'reasonSuspendedByTimer' : 'reasonSuspended');
                    } else if (isInternal) {
                        reasonKey = 'reasonSystem'; // Системна або розширення
                    } else if (!isHttpOrHttps) {
                        reasonKey = 'reasonError'; // Не HTTP/HTTPS (наприклад, data: URL, file: URL)
                    } else if (tabIsWhitelisted) {
                           reasonKey = 'reasonWhitelisted'; // У білому списку
                    } else if (tab.active) {
                        reasonKey = 'reasonActive'; // Активна вкладка
                    } else if (hasPausedVideoBlockingSuspend) {
                         // Якщо відео на паузі і опція включена
                         reasonKey = 'reasonVideoPaused';
                    } else if (tabVideoState?.hasVideo !== undefined) { // Перевіряємо, чи є дані про відео
                        // Якщо є відео, але не блокує призупинення
                        if (tabVideoState.isPlaying) {
                             reasonKey = 'reasonVideoPlaying'; // Відео відтворюється
                         } else if (!tabVideoState.hasPlayed) {
                             reasonKey = 'reasonVideoNotPlayed'; // Відео не відтворювалося
                         } else {
                             // Відео на паузі, але опція вимкнена
                             reasonKey = 'reasonVideoPausedOptionOff';
                         }
                    } else if (suspensionTime <= 0) {
                        reasonKey = 'reasonDisabled'; // Авто-призупинення вимкнено
                    } else {
                        // Стандартна логіка таймера
                        const lastActive = lastActivity[tab.id] || tab.lastAccessed || 0;
                        const inactiveDuration = Date.now() - lastActive;
                        const minInactiveTime = suspensionTime * 1000;

                        if (inactiveDuration >= minInactiveTime) {
                            reasonKey = 'reasonReady'; // Готова до призупинення
                        } else {
                            reasonKey = 'reasonBelowThreshold'; // Неактивна нещодавно
                        }
                    }

                    // Додаємо деталі стану відео до причини, якщо вони є
                    // ЗМІНЕНО: Додаємо деталь про вимкнені скріншоти, якщо вкладка призупинена і опція вимкнена
                    let reasonDetails = '';
                    // TODO: Перенести локалізацію деталей відеостану в debug.js UI-скрипт
                    if (tabVideoState?.hasVideo !== undefined) { // Перевіряємо, чи є дані про відео
                         reasonDetails += ` (Video: ${tabVideoState.hasVideo ? 'Yes' : 'No'}, Playing: ${tabVideoState.isPlaying ? 'Yes' : 'No'}, Played: ${tabVideoState.hasPlayed ? 'Yes' : 'No'})`;
                    }
                    // ДОДАНО: Додаємо деталь про вимкнені скріншоти, якщо вкладка призупинена і опція вимкнена
                    if (isOurSuspended && !enableScreenshots) {
                         // Додаємо статичний текст деталі (локалізація відбувається в UI)
                         reasonDetails += ` (${'Screenshots disabled by setting'})`;
                    }


                    // Використовуємо функції escapeHTML_SW та shortenUrl_SW для Debug Panel
                    // Для Debug Panel ми насправді хочемо бачити оригінальний URL та Title, якщо вкладка призупинена
                    // Фоновий скрипт вже передає оригінальний URL та Title в об'єкті вкладки, якщо він є!
                    const displayTitle = suspendedTabInfo[tab.id]?.title || tab.title || 'Без назви'; // Використовуємо оригінальний Title, якщо призупинена
                    const displayUrl = suspendedTabInfo[tab.id]?.url || tab.url; // Використовуємо оригінальний URL, якщо призупинена


                    return {
                        id: tab.id,
                        title: escapeHTML_SW(displayTitle), // Екранований Title
                        url: displayUrl, // Повний (оригінальний або поточний) URL для title атрибута в Debug
                        displayUrl: shortenUrl_SW(displayUrl), // Скорочений та екранований ефективний URL для відображення
                        favIconUrl: tab.favIconUrl,
                        active: tab.active,
                        reasonKey: reasonKey, // Ключ причини для локалізації в UI
                        videoState: tabVideoState,
                        reasonDetails: escapeHTML_SW(reasonDetails), // Додаткові деталі (включаючи стан відео та вимкнені скріншоти)
                        isOurSuspended: isOurSuspended // Додаємо прапорець, чи вкладка призупинена нами
                    };
                });

                 // Додаємо загальні налаштування до відповіді
                sendAsyncResponse({
                    tabs: tabsInfo, // Список вкладок з причинами та станом відео
                    lastActivity: lastActivity, // Час останньої активності
                    suspensionTime: suspensionTime, // Поточний поріг призупинення
                    suspendedTabInfo: suspendedTabInfo, // Інформація про призупинені вкладки
                    preventSuspendIfVideoPaused: preventSuspendIfVideoPaused,
                    enableScreenshots: enableScreenshots // Надсилаємо налаштування скріншотів до Debug UI
                });
            });
            return true; // Вказуємо, що sendResponse буде викликано асинхронно

        default:
            console.warn("Service worker: Отримано невідому дію:", request.action);
            sendAsyncResponse({ success: false, error: "Unknown action" });
            break; // Не потрібно повертати true
    }

    return true; // Важливо повернути true для асинхронних відповідей
});

// Load settings on Service Worker startup
// Додаємо 'enableScreenshots' до списку завантажуваних налаштувань
chrome.storage.sync.get(['suspensionTime', 'whitelistUrls', 'whitelistDomains', 'preventSuspendIfVideoPaused', 'enableScreenshots', 'language', 'theme'], (result) => {
    console.log("Service worker: Налаштування завантажено:", result);
    // Присвоюємо значення з сховища, використовуючи значення за замовчуванням, якщо їх немає
    suspensionTime = result.suspensionTime !== undefined ? parseInt(result.suspensionTime) : 600;
    preventSuspendIfVideoPaused = result.preventVideoSuspendIfVideoPaused !== undefined ? result.preventVideoSuspendIfVideoPaused : false;
    // Встановлюємо значення для нового налаштування enableScreenshots (за замовчуванням true)
    enableScreenshots = result.enableScreenshots !== undefined ? result.enableScreenshots : true;


    // Обробляємо whitelistUrls: якщо це рядок, парсимо його, якщо масив, використовуємо його (з фільтрацією недійсних значень)
    whitelistUrls = Array.isArray(result.whitelistUrls) ? result.whitelistUrls.filter(url => typeof url === 'string' && url.trim()) : (result.whitelistUrls ? result.whitelistUrls.split(',').map(url => url.trim()).filter(url => url) : []);
    // Обробляємо whitelistDomains: аналогічно URL, але переводимо в нижній регістр
    whitelistDomains = Array.isArray(result.whitelistDomains) ? result.whitelistDomains.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase()) : (result.whitelistDomains ? result.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain) : []);

    // Виконуємо міграцію даних, якщо потрібно, а потім встановлюємо alarm
    migrateStorageData(result, () => {
        console.log("Service worker: Фінальні налаштування після потенційної міграції:", { suspensionTime, whitelistUrls, whitelistDomains, preventSuspendIfVideoPaused, enableScreenshots });
        // Запускаємо початкову перевірку Alarm після завантаження налаштувань
        setupAlarm(Date.now() + suspensionTime * 1000); // Встановлюємо alarm на час наступної можливої призупинення

        // --- ЗМІНЕНО: Запускаємо початкове захоплення скріншота для активної вкладки ТУТ, після завантаження налаштувань ---
         // Повторно запитуємо активну вкладку, бо SW міг перезапуститися, і початковий query в глобальній області міг бути виконаний раніше.
         chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
             const initialActiveTab = tabs[0];
             if (initialActiveTab && initialActiveTab.id !== chrome.tabs.TAB_ID_NONE && initialActiveTab.windowId !== chrome.windows.WINDOW_ID_NONE) {
                 const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                 const isInternalPage = initialActiveTab.url.startsWith('chrome://') || initialActiveTab.url.startsWith('chrome-extension://');
                 const isOurSuspendedPage = initialActiveTab.url.startsWith(ourSuspendUrlPrefix);
                 const isHttpOrHttps = initialActiveTab.url.startsWith('http://') || initialActiveTab.url.startsWith('https://');

                  if (isHttpOrHttps && !isInternalPage && !isOurSuspendedPage) {
                     console.log(`Service worker: Після завантаження налаштувань: плануємо початковий скріншот для активної вкладки ${initialActiveTab.id} через ${SCREENSHOT_INITIAL_DELAY}ms.`);
                      clearTimeout(interactionCaptureTimeoutId); // Скидаємо таймер захоплення
                      setTimeout(() => {
                         captureAndSaveScreenshotForTab(initialActiveTab.id, initialActiveTab.windowId);
                      }, SCREENSHOT_INITIAL_DELAY);
                  } else {
                       // Якщо активна вкладка не підходить, очищаємо debounced capture
                       clearTimeout(interactionCaptureTimeoutId);
                  }
             } else {
                   // Якщо немає активних вкладок при старті, очищаємо debounced capture
                   clearTimeout(interactionCaptureTimeoutId);
             }
         });
        // --- Кінець ЗМІНЕНО ---

    });
});

// Слухач змін у сховищі
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') { // Реагуємо лише на зміни в sync сховищі
        if (changes.suspensionTime !== undefined) {
            const oldTime = suspensionTime;
            const newTime = parseInt(changes.suspensionTime.newValue);
            suspensionTime = newTime;
            console.log("Service worker: Налаштування suspensionTime оновлено:", oldTime, "->", newTime);

            // Якщо час призупинення змінено з "Ніколи" на значення > 0,
            // оновлюємо lastActivity для всіх вкладок, щоб вони почали відлік з моменту зміни налаштування.
            if (oldTime === -1 && newTime > 0) {
                console.log("Service worker: Перехід з 'Ніколи' на таймер. Оновлюємо lastActivity для всіх вкладок.");
                chrome.tabs.query({}, (tabs) => {
                    if (chrome.runtime.lastError) {
                        console.error("Service worker: Помилка chrome.tabs.query під час оновлення lastActivity:", chrome.runtime.lastError);
                    } else if (tabs) {
                        const now = Date.now();
                        const ourSuspendUrlPrefix = `chrome-extension://${chrome.runtime.id}/suspend.html`;
                        tabs.forEach(tab => {
                            if (tab.id !== chrome.tabs.TAB_ID_NONE) {
                                // Оновлюємо lastActivity тільки для стандартних веб-сторінок, які не призупинені нами
                                if (!tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://') && !tab.url.startsWith(ourSuspendUrlPrefix)) {
                                    lastActivity[tab.id] = now;
                                } else {
                                     // Для системних/наших сторінок зберігаємо попереднє lastActivity, якщо є
                                    lastActivity[tab.id] = lastActivity[tab.id] || tab.lastAccessed || now;
                                }
                            }
                        });
                        console.log("Service worker: lastActivity оновлено для всіх вкладок після зміни таймера.");
                    }
                    checkInactiveTabs(); // Запускаємо перевірку після оновлення часу
                });
            } else {
                checkInactiveTabs(); // Запускаємо перевірку для оновлення alarm
            }
        }
        // Оновлення стану опції "не призупиняти відео"
        if (changes.preventVideoSuspendIfVideoPaused !== undefined) {
            preventSuspendIfVideoPaused = changes.preventVideoSuspendIfVideoPaused.newValue;
            console.log("Service worker: Налаштування preventSuspendIfVideoPaused оновлено:", preventVideoSuspendIfVideoPaused);
            checkInactiveTabs(); // Запускаємо перевірку, оскільки це може змінити статус призупинення
        }
        // Оновлення стану опції "увімкнути скріншоти"
        if (changes.enableScreenshots !== undefined) {
            enableScreenshots = changes.enableScreenshots.newValue;
            console.log("Service worker: Налаштування enableScreenshots оновлено:", enableScreenshots);
            // Ця опція впливає лише на UI, не на логіку призупинення/захоплення,
            // тому не потрібно викликати checkInactiveTabs.
        }
        // Оновлення білого списку URL
        if (changes.whitelistUrls !== undefined) {
            // Обробляємо новий список URL: якщо це рядок, парсимо його, якщо масив, використовуємо його (з фільтрацією недійсних значень)
            whitelistUrls = Array.isArray(changes.whitelistUrls.newValue) ? changes.whitelistUrls.newValue.filter(url => typeof url === 'string' && url.trim()) : (changes.whitelistUrls.newValue ? changes.whitelistUrls.split(',').map(url => url.trim()).filter(url => url) : []);
            console.log("Service worker: Налаштування whitelistUrls оновлено:", whitelistUrls);
            checkInactiveTabs(); // Запускаємо перевірку, оскільки це може змінити статус призупинення
        }
        // Оновлення білого списку доменів
        if (changes.whitelistDomains !== undefined) {
             // Обробляємо новий список доменів: аналогічно URL, але переводимо в нижній регістр
            whitelistDomains = Array.isArray(changes.whitelistDomains.newValue) ? changes.whitelistDomains.newValue.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase()) : (changes.whitelistDomains.newValue ? changes.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain) : []); // Обробляємо як нижній регістр
            console.log("Service worker: Налаштування whitelistDomains оновлено:", whitelistDomains);
            checkInactiveTabs(); // Запускаємо перевірку, оскільки це може змінити статус призупинення
        }
        // Зміни language та theme не вимагають перезапуску Alarm, вони обробляються в UI скриптах
    }
});