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
  
  
    // Load settings for theme and language
    chrome.storage.sync.get(['language', 'theme'], (result) => {
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
  
      // Make body visible after theme is applied
      document.documentElement.style.visibility = 'visible';
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
    const screenshotPlaceholder = document.getElementById('futureScreenshotPlaceholder'); // Елемент-placeholder
  
  
    // --- Логіка відображення скріншоту ---
    if (screenshotPlaceholder && numericTabId !== chrome.tabs.TAB_ID_NONE) {
         // Показуємо placeholder або індикатор завантаження
         screenshotPlaceholder.textContent = window.i18nTexts.debugStatus || 'Updating data...'; // Можна використати статус завантаження
         screenshotPlaceholder.style.display = 'flex'; // Робимо placeholder видимим (якщо він був прихований)
  
         // Запитуємо скріншот у фонового скрипта
         sendMessageWithRetry({ action: 'getScreenshot', tabId: numericTabId }, (response, error) => {
              if (error || !response || !response.success) {
                   console.error(`Suspend script: Помилка отримання скріншоту для вкладки ${numericTabId}:`, error || response?.error || "Невідома помилка");
                   // Приховуємо placeholder і, можливо, показуємо повідомлення про помилку або "скріншот недоступний"
                   screenshotPlaceholder.style.display = 'flex'; // Залишаємо видимим для повідомлення
                   screenshotPlaceholder.textContent = window.i18nTexts.debugError || 'Error: Failed to retrieve data'; // Використовуємо текст помилки
                   screenshotPlaceholder.style.color = 'var(--warning-bg, red)'; // Червоний текст помилки
              } else {
                   const screenshotUrl = response.screenshotUrl;
                   if (screenshotUrl) {
                        console.log(`Suspend script: Скріншот отримано для вкладки ${numericTabId}. Відображення...`);
                        // Приховуємо placeholder
                        screenshotPlaceholder.style.display = 'none';
  
                        // Створюємо або знаходимо елемент <img> для скріншоту
                        let screenshotImg = document.getElementById('screenshotImg');
                        if (!screenshotImg) {
                             screenshotImg = document.createElement('img');
                             screenshotImg.id = 'screenshotImg';
                             screenshotImg.alt = 'Screenshot of suspended tab';
                             screenshotImg.style.width = '100%'; // Стилі для коректного відображення
                             screenshotImg.style.height = 'auto';
                             screenshotImg.style.display = 'block';
                             screenshotImg.style.borderRadius = '8px'; // Невелике заокруглення кутів
                             screenshotImg.style.marginTop = '1.5rem'; // Відступ зверху
                             screenshotImg.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; // Легка тінь
                             // Вставляємо <img> перед кнопкою відновлення
                             restoreButton?.parentElement?.insertBefore(screenshotImg, restoreButton);
                        }
  
                        // Встановлюємо src скріншоту
                        screenshotImg.src = screenshotUrl;
  
                         screenshotImg.onerror = () => {
                             console.warn(`Suspend script: Помилка завантаження скріншоту Data URL для ${numericTabId}.`);
                              // Якщо скріншот не завантажився, приховуємо <img> і показуємо placeholder з повідомленням
                             screenshotImg.style.display = 'none';
                             screenshotPlaceholder.style.display = 'flex';
                             screenshotPlaceholder.textContent = window.i18nTexts.noTabsFound || 'Screenshot unavailable'; // Можна використати інший текст
                             screenshotPlaceholder.style.color = ''; // Скидаємо колір помилки
                         };
  
                   } else {
                        console.log(`Suspend script: Скріншот відсутній для вкладки ${numericTabId}.`);
                         // Якщо скріншот відсутній, показуємо placeholder з відповідним повідомленням
                         screenshotPlaceholder.style.display = 'flex'; // Залишаємо видимим
                         screenshotPlaceholder.textContent = window.i18nTexts.noTabsFound || 'Screenshot unavailable'; // Можна використати інший текст
                         screenshotPlaceholder.style.color = ''; // Скидаємо колір помилки
                   }
              }
         });
    } else if (screenshotPlaceholder) {
        // Якщо tabId відсутній або недійсний, просто приховуємо placeholder
         screenshotPlaceholder.style.display = 'none';
         console.warn("Suspend script: Tab ID відсутній або недійсний. Неможливо завантажити скріншот.");
    }
    // --- Кінець логіки відображення скріншоту ---
  
  
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
    }
  });