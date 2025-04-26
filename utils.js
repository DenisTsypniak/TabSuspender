// utils.js

// Глобальний об'єкт для локалізованих текстів
let i18nTexts = {};
// Кеш для елементів DOM з атрибутами локалізації
let i18nElementsCache = null;

// Застосовує мову та оновлює текстовий вміст елементів UI
function applyLanguage(lang) {
  const texts = {
    uk: {
      popupTitle: "Tab Suspender",
      suspendTitle: "🛑 Вкладка призупинена",
      suspendDescription: "Для економії системних ресурсів цю вкладку було автоматично призупинено.",
      suspendCurrent: "🎯 Призупинити поточну",
      suspendAll: "🌀 Призупинити всі фонові",
      whitelistUrl: "➕ URL у винятки",
      whitelistDomain: "🌐 Домен у винятки",
      openSettings: "⚙️ Налаштування",
      restoreButton: "🔄 Повернутись",
      restorePrompt: "Клацніть будь-де, щоб відновити",
      saveButton: "Зберегти",
      suspensionLabel: "Призупиняти вкладки після:",
      languageLabel: "Мова:",
      themeLabel: "Тема:",
      whitelistUrlsLabel: "Білий список URL:",
      whitelistDomainsLabel: "Білий список доменів:",
      whitelistUrlsPh: "Наприклад: https://example.com/page",
      whitelistDomainsPh: "наприклад: example.com, google.com",
      settingsSaved: "Налаштування збережено!",
      optionsTitle: "Налаштування Tab Suspender",
      warningMessage: "⚠️ Цю сторінку неможливо призупинити",
      warningSystemPage: "⚠️ Цю сторінку неможливо призупинити (системна сторінка)",
      warningWhitelisted: "⚠️ Цю сторінку неможливо призупинити (у білому списку)",
      clearListButton: "Очистити список",
      timeNever: "Ніколи",
      time1Minute: "1 хвилина",
      time5Minutes: "5 хвилин",
      time10Minutes: "10 хвилин",
      time30Minutes: "30 хвилин",
      time1Hour: "1 година",
      time1Day: "1 день",
      time1Week: "1 тиждень",
      languageUkrainian: "Українська",
      languageEnglish: "English",
      languageUkrainianShort: "Укр",
      languageEnglishShort: "Eng",
      themeLight: "Світла",
      themeDark: "Темна",
      testOption1Label: "Тестова опція 1",
      testOption2Label: "Тестова опція 2",
      debugTitle: "Панель відладки",
      debugStatus: "Оновлення даних...",
      debugTabId: "ID вкладки",
      debugTitleCol: "Назва",
      debugUrl: "URL",
      debugTimeLeft: "Залишилося часу до призупинення",
      debugReason: "Статус",
      debugError: "Помилка: не вдалося отримати дані",
      debugUpdated: "Дані оновлено",
      noTitle: "Без назви",
      openDebugPanel: "🛠️ Панель відладки",
      backToSettings: "⚙️ Назад до налаштувань",
      noTabsFound: "Вкладок не знайдено",

      reasonSystem: "Системна/Розширення",
      reasonSuspended: "Вже призупинена",
      reasonWhitelisted: "У білому списку",
      reasonActive: "Активна вкладка",
      reasonDisabled: "Призупинення відключено",
      reasonBelowThreshold: "Нещодавно активна",
      reasonReady: "Готова до призупинення",
      reasonUnknown: "Невідомий статус",
      reasonError: "Помилка перевірки URL",
      reasonSuspendedByTimer: "Призупинена (за таймером)",
      reasonSuspendedManually: "Призупинена (вручну)",
      deleteItemConfirm: "Видалити цей елемент?",
      clearListButtonConfirm: "Очистити весь список?",
      preventVideoSuspendLabel: "Не призупиняти, якщо відео на паузі",
      reasonVideoPaused: "Відео на паузі (відтворювалось)",
      reasonVideoNotPlayed: "Є відео, але не відтворювалось",
      reasonVideoPlaying: "Відео відтворюється",
      reasonVideoPausedOptionOff: "Відео на паузі (опцію вимкнено)",

      enableScreenshotsLabel: "Показувати скріншоти на сторінці призупинення",
      screenshotUnavailable: "Скріншот недоступний",
      screenshotFetchError: "Помилка завантаження скріншоту",
      screenshotDisabledSetting: "Скріншоти вимкнено в налаштуваннях",
      reasonScreenshotDisabledSetting: "Скріншоти вимкнено",
      screenshotsTooltip: "На призупиненій вкладці розширення відображатиме скріншот сторінки до її призупинення.\n\nСкріншот сторінки є експериментальною функцією і може призвести до значного навантаження на процесор, а також підвищеного споживання пам'яті.\n\nЯкщо Ви помітили дивну поведінку, наприклад, тривале призупинення вкладки або раптові вильоти Chrome, спробуйте вимкнути цю функцію."
    },
    en: {
      popupTitle: "Tab Suspender",
      suspendTitle: "🛑 Tab Suspended",
      suspendDescription: "To save system resources, this tab was automatically suspended.",
      suspendCurrent: "🎯 Suspend Current",
      suspendAll: "🌀 Suspend All Background",
      whitelistUrl: "➕ Whitelist URL",
      whitelistDomain: "🌐 Whitelist Domain",
      openSettings: "⚙️ Settings",
      restoreButton: "🔄 Restore",
      restorePrompt: "Click anywhere to restore",
      saveButton: "Save",
      suspensionLabel: "Suspend tabs after:",
      languageLabel: "Language:",
      themeLabel: "Theme:",
      whitelistUrlsLabel: "Whitelist URLs:",
      whitelistDomainsLabel: "Whitelist domains:",
      whitelistUrlsPh: "e.g.: https://example.com/page",
      whitelistDomainsPh: "e.g.: example.com, google.com",
      settingsSaved: "Settings saved!",
      optionsTitle: "Tab Suspender Settings",
      warningMessage: "⚠️ This page cannot be suspended",
      warningSystemPage: "⚠️ This page cannot be suspended (system page)",
      warningWhitelisted: "⚠️ This page cannot be suspended (whitelisted)",
      clearListButton: "Clear List",
      timeNever: "Never",
      time1Minute: "1 minute",
      time5Minutes: "5 minutes",
      time10Minutes: "10 minutes",
      time30Minutes: "30 minutes",
      time1Hour: "1 hour",
      time1Day: "1 day",
      time1Week: "1 week",
      languageUkrainian: "Ukrainian",
      languageEnglish: "English",
      languageUkrainianShort: "Ukr",
      languageEnglishShort: "Eng",
      themeLight: "Light",
      themeDark: "Dark",
      testOption1Label: "Test Option 1",
      testOption2Label: "Test Option 2",
      debugTitle: "Debug Panel",
      debugStatus: "Updating data...",
      debugTabId: "Tab ID",
      debugTitleCol: "Title",
      debugUrl: "URL",
      debugTimeLeft: "Time to suspend",
      debugReason: "Status",
      debugError: "Error: Failed to retrieve data",
      debugUpdated: "Data updated",
      noTitle: "No title",
      openDebugPanel: "🛠️ Debug Panel",
      backToSettings: "⚙️ Back to Settings",
       noTabsFound: "No tabs found",

      reasonSystem: "System/Extension Page",
      reasonSuspended: "Already Suspended",
      reasonWhitelisted: "Whitelisted",
      reasonActive: "Active Tab",
      reasonDisabled: "Suspension Disabled",
      reasonBelowThreshold: "Recently Active",
      reasonReady: "Ready for Suspension",
      reasonUnknown: "Unknown Status",
      reasonError: "URL Check Error",
      reasonSuspendedByTimer: "Suspended (Timer)",
      reasonSuspendedManually: "Suspended (Manual)",
      deleteItemConfirm: "Delete this item?",
      clearListButtonConfirm: "Clear the entire list?",
      preventVideoSuspendLabel: "Prevent suspend if video is paused",
      reasonVideoPaused: "Video paused (after playing)",
      reasonVideoNotPlayed: "Has video, but not played",
      reasonVideoPlaying: "Video playing",
      reasonVideoPausedOptionOff: "Video paused (option off)",

      enableScreenshotsLabel: "Show screenshots on suspend page",
      screenshotUnavailable: "Screenshot unavailable",
      screenshotFetchError: "Error loading screenshot",
      screenshotDisabledSetting: "Screenshots disabled in settings",
      reasonScreenshotDisabledSetting: "Screenshots disabled",
      screenshotsTooltip: "On a suspended tab, the extension will display a screenshot of the page before it was suspended.\n\nPage screenshots are an experimental feature and can significantly increase CPU load and memory usage.\n\nIf you notice strange behavior, such as prolonged tab suspension or sudden Chrome crashes, try disabling this feature."
    }
  };

  const t = texts[lang] || texts['uk'];

  window.i18nTexts = t;
  window.i18nTexts.language = lang;

  // Кешуємо елементи при першому виклику applyLanguage
  if (i18nElementsCache === null) {
      const elementsWithI18n = document.querySelectorAll('[data-i18n], [data-i18n-title]');
      i18nElementsCache = Array.from(new Set(elementsWithI18n));
      console.log(`Utils: Cached ${i18nElementsCache.length} elements for localization.`);
  }

  // Оновлюємо текстовий вміст та атрибути title для кешованих елементів
  i18nElementsCache.forEach(el => {
    const textKey = el.getAttribute('data-i18n');
    if (textKey && t[textKey]) {
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
          el.placeholder = t[textKey];
      } else if (el.tagName === 'OPTION') {
           el.textContent = t[textKey];
      }
      else {
          el.textContent = t[textKey];
      }
    }

    const titleKey = el.getAttribute('data-i18n-title');
    if (titleKey && t[titleKey]) {
        el.title = t[titleKey];
    } else if (titleKey) {
         el.title = '';
    }
  });
}

// Застосовує тему (світла/темна) до body та кореневого елемента HTML
function applyTheme(theme) {
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(theme);

  // Оновлює іконку теми, якщо вона існує на сторінці (наприклад, на suspend.html)
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
      themeIcon.textContent = theme === 'dark' ? '🌞' : '🌙';
  }
   // Встановлює атрибут data-theme для CSS змінних
   document.documentElement.dataset.theme = theme;
}

// Екранує HTML-сутності у рядку
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s.replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"')
          .replace(/'/g, '&apos;');
}

// Скорочує довгий URL для відображення, додаючи "..." посередині
function shortenUrl(url, maxLength = 80) {
    if (!url) return '';
    const plainUrl = String(url);
    if (plainUrl.length <= maxLength) return window.escapeHTML(plainUrl);

    const startLength = Math.floor((maxLength - 3) / 2);
    const endLength = maxLength - 3 - startLength;
    const shortened = plainUrl.substring(0, startLength) + '...' + plainUrl.substring(plainUrl.length - endLength);
    return window.escapeHTML(shortened);
}

// Надсилає повідомлення до Service Worker з механізмом повторних спроб
function sendMessageWithRetry(message, callback, retries = 5, delay = 100) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
        console.error("sendMessageWithRetry: chrome.runtime unavailable.");
        if (callback) callback(null, new Error("chrome.runtime unavailable"));
        return;
    }

    chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            // Якщо помилка "Receiving end does not exist" (Service Worker неактивний) і залишились спроби
            if (retries > 0 && error.message.includes("Receiving end does not exist")) {
                console.warn(`sendMessageWithRetry: Помилка надсилання повідомлення: ${error.message}. Залишилось спроб: ${retries}. Retry in ${delay}ms.`);
                setTimeout(() => {
                    sendMessageWithRetry(message, callback, retries - 1, delay * 2);
                }, delay);
            } else {
                console.error("sendMessageWithRetry: Failed to send message after retries.", message, error);
                if (callback) callback(null, chrome.runtime.lastError);
            }
        } else {
            if (callback) callback(response);
        }
    });
}


// Робимо службові функції та об'єкт i18nTexts доступними глобально
window.i18nTexts = window.i18nTexts || {};
window.applyLanguage = applyLanguage;
window.applyTheme = applyTheme;
window.escapeHTML = escapeHTML;
window.shortenUrl = shortenUrl;
window.sendMessageWithRetry = sendMessageWithRetry;