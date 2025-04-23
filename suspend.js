// suspend.js
// Скрипт для сторінки suspend.html, що відображається для призупинених вкладок.

document.addEventListener('DOMContentLoaded', () => {
    // applyTheme та applyLanguage знаходяться в utils.js, який завантажується першим.

     // --- Функція для надсилання повідомлення з повторними спробами ---
    // Ця допоміжна функція локальна для UI-скриптів, що спілкуються з фоновим service worker
    function sendMessageWithRetry(message, callback, retries = 5, delay = 100) {
        // Перевіряємо, чи chrome.runtime доступний перед надсиланням
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
             console.error("Suspend script: chrome.runtime недоступний для надсилання повідомлення.");
             if (callback) callback(null, new Error("chrome.runtime недоступний"));
            return;
        }

        chrome.runtime.sendMessage(message, (response) => {
            // Перевіряємо chrome.runtime.lastError на наявність проблем під час надсилання/отримання повідомлення
            if (chrome.runtime.lastError) {
                const error = chrome.runtime.lastError;
                console.warn(`Suspend script: Помилка надсилання повідомлення: ${error.message}. Залишилось спроб: ${retries}`, message);
                // Якщо помилка "Receiving end does not exist" (Service Worker неактивний) і залишились спроби
                if (retries > 0 && error.message.includes("Receiving end does not exist")) {
                    // Чекаємо і спробуємо знову з експоненційним відступом
                    setTimeout(() => {
                        sendMessageWithRetry(message, callback, retries - 1, delay * 2);
                    }, delay);
                } else {
                    // Спроби вичерпано або інша помилка
                    console.error("Suspend script: Не вдалося надіслати повідомлення після повторних спроб.", message, error);
                    if (callback) callback(null, chrome.runtime.lastError); // Викликаємо callback з останньою помилкою
                }
            } else {
                // Повідомлення успішно надіслано та відповідь отримана (навіть якщо відповідь сама по собі вказує на помилку)
                if (callback) callback(response);
            }
        });
    }
    // --- Кінець функції sendMessageWithRetry ---


    // Отримуємо посилання на елементи для скріншоту та контейнер
    const suspendContainer = document.querySelector('.suspend-container'); // Новий контейнер
    const screenshotImg = document.getElementById('screenshotImg'); // Елемент для зображення скріншоту
    const screenshotUnavailable = document.getElementById('screenshotUnavailable'); // Елемент для повідомлення

    // Перевіряємо наявність ключових елементів перед продовженням
    if (!suspendContainer || !screenshotImg || !screenshotUnavailable) {
         console.error("Suspend script: Не знайдено необхідні елементи DOM для скріншоту.");
         // Можемо приховати батьківський контейнер, якщо він існує
         if (suspendContainer) {
              suspendContainer.style.display = 'none'; // Приховуємо весь блок скріншоту, якщо DOM не повний
         }
         // Все ще завантажуємо основний UI (без скріншоту)
          loadMainUI();
         return; // Зупиняємо виконання, якщо DOM не повний
    }

    // Приховуємо елементи скріншоту за замовчуванням
    screenshotImg.style.display = 'none';
    screenshotUnavailable.style.display = 'none';


    // Load settings for theme, language, and new screenshot option
    chrome.storage.sync.get(['language', 'theme', 'enableScreenshots'], (result) => {
      // Apply language first to load texts for i18n attributes
      const currentLang = result.language || 'uk';
      window.applyLanguage(currentLang); // Use the global applyLanguage

      // Then apply theme
      let theme = result.theme;
      if (!theme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
      }
      window.applyTheme(theme); // Use the global applyTheme

      // Apply screenshot setting class to the container
      const enableScreenshots = result.enableScreenshots !== undefined ? result.enableScreenshots : true; // Default to true
      if (!enableScreenshots) {
           suspendContainer.classList.add('screenshots-disabled');
           // Update the message placeholder if screenshots are disabled
            const t = window.i18nTexts || {};
            screenshotUnavailable.textContent = t.screenshotDisabledSetting || 'Screenshots disabled in settings';
            screenshotUnavailable.style.display = 'flex'; // Show the message
            console.log("Suspend script: Screenshots are disabled in settings.");
      } else {
           suspendContainer.classList.remove('screenshots-disabled');
           // If enabled, attempt to load the screenshot
           loadScreenshot(); // Call the function to load the screenshot
      }

      // Make body visible after theme and initial settings class are applied
      document.documentElement.style.visibility = 'visible';

      // Завантажуємо основний UI (фавікон, заголовок, кнопку)
      loadMainUI();
    });


    const params = new URLSearchParams(window.location.search);
    const url = params.get('url'); // Original tab URL
    const tabTitle = params.get('title'); // Original tab title
    const tabId = params.get('tabId'); // Original tab ID (як рядок)
    const favIconUrl = params.get('favIconUrl'); // Favicon URL

    // Перетворюємо tabId на число, якщо він існує
    const numericTabId = tabId ? parseInt(tabId, 10) : chrome.tabs.TAB_ID_NONE;


    const tabFaviconElement = document.getElementById('tabFavicon');
    const suspendedTabTitleElement = document.getElementById('suspendedTabTitle');
    const restoreButton = document.getElementById('restoreButton');


    // --- Функція для завантаження та відображення скріншоту ---
    function loadScreenshot() {
         // Перевіряємо, чи є дійсний tabId та елементи для скріншоту (повторно на випадок, якщо loadScreenshot викликається окремо)
         if (numericTabId === chrome.tabs.TAB_ID_NONE || !screenshotImg || !screenshotUnavailable) {
             console.warn("Suspend script: Tab ID is invalid or screenshot elements not found. Cannot load screenshot.");
              if (screenshotUnavailable) { // Якщо елемент повідомлення існує, показуємо повідомлення
                   const t = window.i18nTexts || {};
                   screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                   screenshotUnavailable.style.display = 'flex'; // Show message
              }
             return;
         }

         // Запитуємо скріншот у фонового скрипта
         sendMessageWithRetry({ action: 'getScreenshot', tabId: numericTabId }, (response, error) => {
              const t = window.i18nTexts || {}; // Оновлюємо тексти

              if (error || !response || !response.success) {
                   console.error(`Suspend script: Помилка отримання скріншоту для вкладки ${numericTabId}:`, error || response?.error || "Невідома помилка");
                   // Показуємо повідомлення про помилку
                   if (screenshotUnavailable) {
                        screenshotUnavailable.textContent = t.screenshotFetchError || 'Error loading screenshot'; // Використовуємо текст помилки
                        screenshotUnavailable.style.display = 'flex'; // Show message
                   }
                   screenshotImg.style.display = 'none'; // Приховуємо img
              } else {
                   const screenshotUrl = response.screenshotUrl;
                   if (screenshotUrl) {
                        console.log(`Suspend script: Скріншот отримано для вкладки ${numericTabId}.`);
                        // Встановлюємо src скріншоту
                        screenshotImg.src = screenshotUrl;
                         screenshotImg.style.display = 'block'; // Робимо img видимим

                         screenshotImg.onload = () => {
                              console.log(`Suspend script: Скріншот для ${numericTabId} успішно завантажено.`);
                             screenshotUnavailable.style.display = 'none'; // Ховаємо повідомлення, якщо було
                              // CSS тепер керує початковою прозорістю та появою при ховері
                         };

                         screenshotImg.onerror = () => {
                             console.warn(`Suspend script: Помилка завантаження скріншоту Data URL для ${numericTabId}.`);
                              // Якщо скріншот не завантажився, приховуємо <img> і показуємо повідомлення
                             screenshotImg.style.display = 'none';
                             if (screenshotUnavailable) {
                                  screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                                  screenshotUnavailable.style.display = 'flex'; // Show message
                             }
                         };

                   } else {
                        console.log(`Suspend script: Скріншот відсутній для вкладки ${numericTabId}.`);
                         // Якщо скріншот відсутній, показуємо відповідне повідомлення
                         if (screenshotUnavailable) {
                             screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                             screenshotUnavailable.style.display = 'flex'; // Show message
                         }
                        screenshotImg.style.display = 'none'; // Приховуємо img
                   }
              }
         });
    }

    // --- Функція для завантаження та відображення основного UI (не скріншоту) ---
    function loadMainUI() {
        // Load and display the favicon
        if (tabFaviconElement && favIconUrl) { // Check if element exists
           // Decode URL and set src for the <img> element
            const decodedFavIconUrl = decodeURIComponent(favIconUrl);
            tabFaviconElement.src = decodedFavIconUrl;
            tabFaviconElement.style.display = 'block'; // Make icon visible
             tabFaviconElement.onerror = () => {
                 // If the icon fails to load, hide the <img> element
                 tabFaviconElement.style.display = 'none';
                 console.warn("Error loading favicon:", decodedFavIconUrl);
             };
        } else if (tabFaviconElement) { // Hide if element exists but no URL
           // If favIconUrl is not provided or empty, hide the <img> element
           tabFaviconElement.style.display = 'none';
            console.log("Favicon URL not provided for suspended tab.");
        }

        // Set the original tab title
        if (suspendedTabTitleElement) { // Check if element exists
             const t = window.i18nTexts || {}; // Access global texts after applyLanguage has run

            if (tabTitle) {
                // Use global escapeHTML for safety
                suspendedTabTitleElement.textContent = window.escapeHTML(decodeURIComponent(tabTitle));
            } else {
                // Use localized default title if original is missing
                suspendedTabTitleElement.textContent = t.suspendTitle || 'Tab Suspended'; // Use localized text from global object
            }
        }

        // Click handler only for the "Restore" button
        if (restoreButton && url) { // Check if button and URL exist
            restoreButton.addEventListener('click', () => {
              // Restore the tab by navigating to the original URL
              window.location.href = decodeURIComponent(url);
            });
            // Make the whole document body clickable to restore the tab (Optional, but common)
            // document.body.addEventListener('click', (event) => { // Додано об'єкт event
            //     // Check if the click target is NOT the restore button itself, to avoid double-triggering
            //     // Перевіряємо, чи ціль кліку НЕ є частиною контейнера скріншоту
            //      const screenshotContainerElement = document.getElementById('screenshotContainer');
            //      if (event.target !== restoreButton && !screenshotContainerElement?.contains(event.target)) {
            //           window.location.href = decodeURIComponent(url);
            //      }
            // });
        }
    }
});