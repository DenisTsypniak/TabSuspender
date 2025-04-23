// utils.js

// Робимо об'єкт з локалізованими текстами доступним глобально після виклику applyLanguage
let i18nTexts = {}; // Оголошуємо глобально

// Кеш для елементів з атрибутом data-i18n
let i18nElementsCache = null;

function applyLanguage(lang) {
  const texts = {
    uk: {
      popupTitle: "Tab Suspender",
      suspendTitle: "🛑 Вкладка призупинена",
      suspendDescription: "Для економії системних ресурсів цю вкладку було автоматично призупинено.",
      suspendCurrent: "🎯 Призупинити поточну",
      suspendAll: "🌀 Призупинити всі фонові", // Змінено для точності
      whitelistUrl: "➕ URL у винятки",
      whitelistDomain: "🌐 Домен у винятки",
      openSettings: "⚙️ Налаштування",
      restoreButton: "🔄 Повернутись",
      restorePrompt: "Клацніть будь-де, щоб відновити", // Не використовується в поточному JS
      saveButton: "Зберегти", // Не використовується в поточному JS
      suspensionLabel: "Призупиняти вкладки після:",
      languageLabel: "Мова:",
      themeLabel: "Тема:",
      whitelistUrlsLabel: "Білий список URL:",
      whitelistDomainsLabel: "Білий список доменів:",
      whitelistUrlsPh: "Наприклад: https://example.com/page",
      whitelistDomainsPh: "наприклад: example.com, google.com",
      settingsSaved: "Налаштування збережено!",
      optionsTitle: "Налаштування Призупинення вкладок",
      warningMessage: "⚠️ Цю сторінку неможливо призузупинити",
      warningSystemPage: "⚠️ Цю сторінку неможливо призузупинити (системна сторінка)",
      warningWhitelisted: "⚠️ Цю сторінку неможливо призузупинити (у білому списку)",
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
      languageUkrainianShort: "Укр", // Коротка назва для перемикача
      languageEnglishShort: "Eng", // Коротка назва для перемикача
      themeLight: "Світла",
      themeDark: "Темна",
      testOption1Label: "Тестова опція 1", // Залишено для прикладу, якщо вони є в налаштуваннях
      testOption2Label: "Тестова опція 2", // Залишено для прикладу
      debugTitle: "Адмін-панель відладки",
      debugStatus: "Оновлення даних...",
      debugTabId: "ID вкладки",
      debugTitleCol: "Назва",
      debugUrl: "URL",
      debugTimeLeft: "Час до призупинення",
      debugReason: "Причина", // Коротше
      debugError: "Помилка: не вдалося отримати дані",
      debugUpdated: "Дані оновлено",
      noTitle: "Без назви",
      openDebugPanel: "🛠️ Адмін-панель відладки",
      backToSettings: "⚙️ Назад до налаштувань",
      noTabsFound: "Вкладок не знайдено", // Додано для debug панелі

      // Причини призупинення/непризупинення (для адмін-панелі)
      reasonSystem: "Системна/Розширення",
      reasonSuspended: "Вже призупинена", // Цей ключ, можливо, більше не потрібен у debug, якщо є suspendedByTimer/Manually
      reasonWhitelisted: "У білому списку",
      reasonActive: "Активна вкладка",
      reasonDisabled: "Призузупинення відключено", // Авто-призупинення відключено
      reasonBelowThreshold: "Активна нещодавно", // Неактивна, але час не вийшов
      reasonReady: "Готова до призузупинення", // Неактивна, час вийшов, чекає перевірки таймером
      reasonUnknown: "Невідома причина", // Неочікуваний стан
      reasonError: "Помилка перевірки URL", // Не вдалося перевірити URL (наприклад, URL недійсний)
      reasonSuspendedByTimer: "Призузупинена (таймер)", // Вкладка, призупинена таймером
      reasonSuspendedManually: "Призузупинена (вручну)", // Вкладка, призупинена вручну
      deleteItemConfirm: "Видалити цей елемент?", // Додано для підтвердження
      clearListButtonConfirm: "Очистити весь список?", // Додано для підтвердження
      preventVideoSuspendLabel: "Не призупиняти, якщо відео на паузі", // Текст для чекбокса
      reasonVideoPaused: "Відео на паузі (було відтворено)", // Змінено для точності
      reasonVideoNotPlayed: "Є відео, але не відтворювалося", // ДОДАНО: Нова причина
      reasonVideoPlaying: "Відео відтворюється", // ДОДАНО
      reasonVideoPausedOptionOff: "Відео на паузі (опція вимкнена)", // ДОДАНО

      // НОВІ ТЕКСТИ ДЛЯ СКРІНШОТІВ
      enableScreenshotsLabel: "Показувати скріншоти на сторінці призупинення", // Текст для нової опції в налаштуваннях
      screenshotUnavailable: "Скріншот недоступний", // Повідомлення, коли скріншот відсутній
      screenshotFetchError: "Помилка завантаження скріншоту", // Повідомлення про помилку при отриманні скріншоту
      screenshotDisabledSetting: "Скріншоти вимкнено в налаштуваннях", // Повідомлення, коли опція вимкнена
      reasonScreenshotDisabledSetting: "Скріншоти вимкнено", // Причина для Debug панелі, коли опція вимкнена
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
      restorePrompt: "Click anywhere to restore", // Not used in current JS
      saveButton: "Save", // Not used in current JS
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
      languageUkrainianShort: "Ukr", // Short name for toggle
      languageEnglishShort: "Eng", // Short name for toggle
      themeLight: "Light",
      themeDark: "Dark",
      testOption1Label: "Test Option 1", // Left for example
      testOption2Label: "Test Option 2", // Left for example
      debugTitle: "Debug Admin Panel",
      debugStatus: "Updating data...",
      debugTabId: "Tab ID",
      debugTitleCol: "Title",
      debugUrl: "URL",
      debugTimeLeft: "Time to suspend",
      debugReason: "Reason", // Shorter
      debugError: "Error: Failed to retrieve data",
      debugUpdated: "Data updated",
      noTitle: "No title",
      openDebugPanel: "🛠️ Debug Admin Panel",
      backToSettings: "⚙️ Back to Settings",
       noTabsFound: "No tabs found", // Added for debug panel

      // Reasons for not suspending (for Debug Panel)
      reasonSystem: "System/Extension Page",
      reasonSuspended: "Already Suspended", // This key might not be needed in debug if suspendedByTimer/Manually exists
      reasonWhitelisted: "Whitelisted",
      reasonActive: "Active Tab",
      reasonDisabled: "Suspension Disabled", // Auto-suspension disabled
      reasonBelowThreshold: "Recently Active", // Inactive, but time not met
      reasonReady: "Ready for Suspension", // Inactive, time met, waiting for timer check
      reasonUnknown: "Unknown Reason", // Unexpected state
      reasonError: "URL Check Error", // Failed to check URL (e.g., invalid URL)
      reasonSuspendedByTimer: "Suspended (Timer)", // Tab suspended by timer
      reasonSuspendedManually: "Suspended (Manual)", // Tab suspended manually
      deleteItemConfirm: "Delete this item?", // Added for confirmation
      clearListButtonConfirm: "Clear the entire list?", // Added for confirmation
      preventVideoSuspendLabel: "Prevent suspend if video is paused", // Text for checkbox
      reasonVideoPaused: "Video paused (after playing)", // Changed for clarity
      reasonVideoNotPlayed: "Has video, but not played", // ADDED: New reason
      reasonVideoPlaying: "Video playing", // ADDED
      reasonVideoPausedOptionOff: "Video paused (option off)", // ADDED

      // NEW TEXTS FOR SCREENSHOTS
      enableScreenshotsLabel: "Show screenshots on suspend page", // Text for new option in settings
      screenshotUnavailable: "Screenshot unavailable", // Message when screenshot is missing
      screenshotFetchError: "Error loading screenshot", // Message on error fetching screenshot
      screenshotDisabledSetting: "Screenshots disabled in settings", // Message when option is disabled
      reasonScreenshotDisabledSetting: "Screenshots disabled", // Reason for Debug Panel when option is disabled
    }
  };

  // Використовуємо uk як резервний варіант
  const t = texts[lang] || texts['uk'];

  // Зберігаємо тексти глобально
  window.i18nTexts = t;
  window.i18nTexts.language = lang; // Зберігаємо код активної мови

  // --- Оптимізація: Кешування елементів UI для локалізації ---
  // При першому виклику applyLanguage, знаходимо всі елементи з data-i18n та кешуємо їх.
  if (i18nElementsCache === null) {
      i18nElementsCache = document.querySelectorAll('[data-i18n]');
      // Додатково кешуємо елементи option з data-i18n
      i18nElementsCache = Array.from(i18nElementsCache).concat(Array.from(document.querySelectorAll('select option[data-i18n]')));
      console.log(`Utils: Кешовано ${i18nElementsCache.length} елементів для локалізації.`);
  }

  // Ітеруємося по кешованих елементах замість повторного пошуку в DOM
  i18nElementsCache.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key && t[key]) { // Перевіряємо, що ключ існує і є текст для нього
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
          el.placeholder = t[key];
      } else if (el.tagName === 'OPTION') {
          // Для <option> елементів, які можуть мати атрибут value
          // Оновлюємо textContent
           el.textContent = t[key];
      }
      else {
          el.textContent = t[key];
      }
    } else if (key) { // Логуємо попередження, тільки якщо ключ існує, але текст відсутній
        // console.warn(`Utils: i18n ключ "${key}" не знайдено для мови "${lang}"`);
    }
    // Якщо елемент є <option>, його текст також оновлюється вище.
  });


   // Текст повідомлення про статус обробляється динамічно в кожному UI-скрипті
   // залежно від ситуації (завантаження, оновлено, помилка) та використовує i18nTexts безпосередньо.
}

function applyTheme(theme) {
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(theme);

  // Оновлюємо іконку теми на сторінці призупинення, якщо вона існує
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
      themeIcon.textContent = theme === 'dark' ? '🌞' : '🌙';
  }

   // Встановлюємо атрибут data-theme на HTML для специфічності CSS
   document.documentElement.dataset.theme = theme;
}

// Допоміжна функція для екранування HTML-сутностей
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  // Переконуємося, що str розглядається як рядок перед заміною
  const s = String(str);
  return s.replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/"/g, '"')
          .replace(/'/g, '&apos;');
}

// Функція для скорочення довгих URL
// Використовує глобальну функцію escapeHTML
function shortenUrl(url, maxLength = 80) { // Довжина за замовчуванням 80 символів
    if (!url) return '';
    const plainUrl = String(url); // Переконуємося, що це рядок
    if (plainUrl.length <= maxLength) return window.escapeHTML(plainUrl); // Екрануємо, якщо не скорочено

    // Скорочуємо, залишаючи початок і кінець URL
    const startLength = Math.floor((maxLength - 3) / 2);
    const endLength = maxLength - 3 - startLength;
    const shortened = plainUrl.substring(0, startLength) + '...' + plainUrl.substring(plainUrl.length - endLength);
    return window.escapeHTML(shortened); // Екрануємо скорочений рядок для відображення
}


// Робимо службові функції та тексти доступними глобально для інших скриптів
window.i18nTexts = window.i18nTexts || {}; // Ініціалізуємо або використовуємо існуюче
window.applyLanguage = applyLanguage;
window.applyTheme = applyTheme;
window.escapeHTML = escapeHTML;
window.shortenUrl = shortenUrl; // Робимо shortenUrl глобальним

// Примітка: функція loadTheme видалена, оскільки тема застосовується безпосередньо після отримання
// налаштувань у DOMContentLoaded кожного UI-скрипта.
// Логіка visibility: hidden / visible обробляється там як останній крок.