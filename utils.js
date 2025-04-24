// utils.js

// Робимо об'єкт з локалізованими текстами доступним глобально після виклику applyLanguage
let i18nTexts = {}; // Оголошуємо глобально

// Кеш для елементів з атрибутом data-i18n та data-i18n-title
// Оновлюємо кеш, щоб включати обидва типи атрибутів
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
      optionsTitle: "Налаштування Призузупинення вкладок",
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
      debugTimeLeft: "Час до призузупинення",
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
      reasonSuspendedManually: "Призузупинена (вручну)", // Вкладка, призупинена вручн
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
      // ДОДАНО: Текст підказки для опції скріншотів
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
      // ДОДАНО: Текст підказки для опції скріншотів
      screenshotsTooltip: "On a suspended tab, the extension will display a screenshot of the page before it was suspended.\n\nPage screenshots are an experimental feature and can significantly increase CPU load and memory usage.\n\nIf you notice strange behavior, such as prolonged tab suspension or sudden Chrome crashes, try disabling this feature."
    }
  };

  // Використовуємо uk як резервний варіант
  const t = texts[lang] || texts['uk'];

  // Зберігаємо тексти глобально
  window.i18nTexts = t;
  window.i18nTexts.language = lang; // Зберігаємо код активної мови

  // --- Оптимізація: Кешування елементів UI для локалізації ---
  // При першому виклику applyLanguage, знаходимо всі елементи з атрибутом data-i18n або data-i18n-title
  if (i18nElementsCache === null) {
      // Find elements with data-i18n OR data-i18n-title
      const elementsWithI18n = document.querySelectorAll('[data-i18n], [data-i18n-title]');
      // Find select option elements with data-i18n separately if needed (handled by the main query now)
      // const optionElements = document.querySelectorAll('select option[data-i18n]');

      // Combine and unique-ify the list
      // i18nElementsCache = Array.from(elementsWithI18n).concat(Array.from(optionElements)); // No need to concat separately if query is broad enough
       i18nElementsCache = Array.from(elementsWithI18n); // The single query should cover all cases now

      // Remove duplicates (just in case an element matches both) - Set handles this
      i18nElementsCache = Array.from(new Set(i18nElementsCache));


      console.log(`Utils: Кешовано ${i18nElementsCache.length} елементів для локалізації.`);
  }

  // Ітеруємося по кешованих елементах
  i18nElementsCache.forEach(el => {
    // Обробка data-i18n для текстового вмісту або placeholder
    const textKey = el.getAttribute('data-i18n');
    if (textKey && t[textKey]) { // Check if key exists in texts
      if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
          el.placeholder = t[textKey];
      } else if (el.tagName === 'OPTION') {
          // For <option> elements, which might have a value attribute
          // Update textContent
           el.textContent = t[textKey];
      }
      else {
          // For most elements, update textContent
          el.textContent = t[textKey];
      }
    } else if (textKey) {
        // console.warn(`Utils: i18n text key "${textKey}" not found for language "${lang}"`);
        // Optionally clear text content if translation is missing
        // el.textContent = '';
    }

    // Обробка data-i18n-title для атрибута title
    const titleKey = el.getAttribute('data-i18n-title');
    if (titleKey && t[titleKey]) { // Check if key exists in texts
        // Set the title attribute with the localized text
        el.title = t[titleKey];
    } else if (titleKey) {
         // If the tooltip key is not found, clear the title attribute
         el.title = '';
         // console.warn(`Utils: i18n title key "${titleKey}" not found for language "${lang}"`);
    }
  });
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
