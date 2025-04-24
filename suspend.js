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


    // Отримуємо посилання на елементи DOM
    const suspendPageContainer = document.getElementById('suspendPageContainer'); // Головний контейнер
    const suspendCard = document.getElementById('suspendCard'); // Картка з інформацією та кнопкою (НОВИЙ ID)
    const screenshotContainer = document.getElementById('screenshotContainer'); // Контейнер скріншоту
    const screenshotImg = document.getElementById('screenshotImg'); // Елемент для зображення скріншоту
    const screenshotUnavailable = document.getElementById('screenshotUnavailable'); // Елемент для повідомлення
    const restoreButton = document.getElementById('restoreButton'); // Кнопка "Повернутись"

    // Перевіряємо наявність ключових елементів перед продовженням
    // Тепер перевіряємо головний контейнер, картку та елементи скріншоту/повідомлення
    if (!suspendPageContainer || !suspendCard || !screenshotContainer || !screenshotImg || !screenshotUnavailable || !restoreButton) {
         console.error("Suspend script: Не знайдено необхідні елементи DOM. Неможливо ініціалізувати UI.");
         // Показуємо повідомлення про помилку на екрані, якщо є куди
         const t = window.i18nTexts || {};
         if (screenshotUnavailable) { // Можливо, контейнер скріншоту все ж існує
              screenshotUnavailable.textContent = t.screenshotFetchError || 'Error loading page elements'; // Використовуємо локалізований текст
              screenshotUnavailable.style.display = 'flex'; // Робимо його видимим
              // Ховаємо інші елементи, якщо вони існують, але не повний набір
              if(screenshotImg) screenshotImg.style.display = 'none';
              // Якщо картки немає, не можемо показати основний UI
         } else {
             // Взагалі немає куди показати помилку...
             console.error("Suspend script: FATAL - Cannot find critical DOM elements.");
         }
         // Робимо тіло видимим, навіть якщо не повний UI, щоб уникнути застрягання
         document.documentElement.style.visibility = 'visible';
         return; // Зупиняємо виконання скрипта
    }

    // Приховуємо вміст контейнера скріншоту за замовчуванням (сам контейнер прихований за допомогою CSS opacity/visibility)
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

      // Apply screenshot setting class to the main container if disabled
      const enableScreenshots = result.enableScreenshots !== undefined ? result.enableScreenshots : true; // Default to true
      if (!enableScreenshots) {
           suspendPageContainer.classList.add('screenshots-disabled'); // Приховує контейнер скріншоту повністю через CSS
           // Показуємо повідомлення про відсутність скріншота (якщо він є в DOM)
            const t = window.i18nTexts || {}; // Оновлюємо тексти
            if (screenshotUnavailable) {
                screenshotUnavailable.textContent = t.screenshotDisabledSetting || 'Screenshots disabled in settings';
                // Не робимо видимим тут, оскільки весь контейнер прихований через CSS
            }
            console.log("Suspend script: Screenshots are disabled in settings.");
             // Оскільки скріншоти вимкнені, не додаємо слухачі наведення
      } else {
           suspendPageContainer.classList.remove('screenshots-disabled'); // Переконуємося, що контейнер не приховано через CSS
           // Якщо увімкнено, намагаємося завантажити скріншот та додати слухачі
           loadScreenshotAndSetupHover(); // Викликаємо нову функцію
      }

      // Make body visible after theme and initial settings class are applied
      document.documentElement.style.visibility = 'visible';

      // Завантажуємо основний UI (фавікон, заголовок, кнопку)
      // Викликаємо незалежно від стану скріншотів
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
    // restoreButton вже отримано на початку скрипта


    // --- Функція для завантаження скріншоту та налаштування слухачів наведення ---
    function loadScreenshotAndSetupHover() {
         // Перевіряємо, чи є дійсний tabId та елементи для скріншоту та картки
         if (numericTabId === chrome.tabs.TAB_ID_NONE || !screenshotContainer || !screenshotImg || !screenshotUnavailable || !suspendCard || !suspendPageContainer) {
             console.warn("Suspend script: Не знайдено необхідні елементи або Tab ID недійсний для завантаження скріншоту/налаштування ховеру.");
              if (screenshotUnavailable) { // Показуємо повідомлення про недоступність скріншоту
                   const t = window.i18nTexts || {};
                   screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                    // Робимо повідомлення видимим всередині контейнера (сам контейнер прихований)
                    screenshotUnavailable.style.display = 'flex'; // Використовуємо flex для центрування
                    screenshotImg.style.display = 'none'; // Переконуємося, що зображення приховано
              }
             // Навіть якщо скріншот недоступний, додаємо слухачі наведення на картку
             setupHoverListeners();
             return; // Зупиняємо виконання, якщо DOM не повний
         }

         // Запитуємо скріншот у фонового скрита
         sendMessageWithRetry({ action: 'getScreenshot', tabId: numericTabId }, (response, error) => {
              const t = window.i18nTexts || {}; // Оновлюємо тексти

              if (error || !response || !response.success || !response.screenshotUrl) {
                   console.error(`Suspend script: Помилка отримання скріншоту для вкладки ${numericTabId}:`, error || response?.error || "Невідома помилка");
                   // Якщо скріншот недоступний (помилка або URL порожній), показуємо повідомлення
                   if (screenshotUnavailable) {
                        screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable'; // Використовуємо локалізований текст
                        screenshotUnavailable.style.display = 'flex'; // Робимо повідомлення видимим
                   }
                   screenshotImg.style.display = 'none'; // Приховуємо img

                   // Навіть якщо скріншот недоступний, додаємо слухачі наведення на картку
                   setupHoverListeners();

              } else {
                   const screenshotUrl = response.screenshotUrl;
                   // Встановлюємо src скріншоту
                   screenshotImg.src = screenshotUrl;
                   screenshotImg.style.display = 'block'; // Робимо img видимим
                   screenshotUnavailable.style.display = 'none'; // Ховаємо повідомлення

                   screenshotImg.onload = () => {
                        console.log(`Suspend script: Скріншот для ${numericTabId} успішно завантажено.`);
                       // Після успішного завантаження додаємо слухачі наведення на картку
                       setupHoverListeners();
                   };

                   screenshotImg.onerror = () => {
                       console.warn(`Suspend script: Помилка завантаження скріншоту Data URL для ${numericTabId}.`);
                        // Якщо скріншот не завантажився, приховуємо <img> і показуємо повідомлення
                       screenshotImg.style.display = 'none';
                       if (screenshotUnavailable) {
                            screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                            screenshotUnavailable.style.display = 'flex'; // Робимо повідомлення видимим
                       }
                        // Додаємо слухачі наведення на картку
                       setupHoverListeners();
                   };
                   // Якщо зображення вже завантажилося з кешу, обробники onload/onerror можуть не спрацювати.
                   // Перевіряємо стан завантаження, якщо src вже встановлено.
                   if (screenshotImg.complete) {
                       if (screenshotImg.naturalHeight !== 0) {
                           console.log(`Suspend script: Скріншот для ${numericTabId} завантажено з кешу.`);
                            setupHoverListeners(); // Додаємо слухачі наведення
                       } else {
                           // complete true, але naturalHeight 0 означає помилку завантаження з кешу
                            console.warn(`Suspend script: Скріншот з кешу для ${numericTabId} недійсний.`);
                            screenshotImg.style.display = 'none';
                            if (screenshotUnavailable) {
                                 screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                                 screenshotUnavailable.style.display = 'flex';
                            }
                            setupHoverListeners(); // Додаємо слухачі наведення, щоб показувати повідомлення
                       }
                   }
              }
         });
    }

     // --- Функція для налаштування слухачів наведення на картку ---
     function setupHoverListeners() {
          // Перевіряємо наявність головного контейнера та картки
          if (!suspendPageContainer || !suspendCard) {
              console.warn("Suspend script: Не знайдено головний контейнер сторінки або картку для додавання слухачів наведення.");
              return;
          }

          // Функція для зміни видимості контейнера скріншоту
          function toggleScreenshotContainerVisibility(show) {
              // Перевіряємо, чи скріншоти увімкнено в налаштуваннях
              // Клас 'screenshots-disabled' додається до suspendPageContainer при завантаженні налаштувань,
              // якщо опція enableScreenshots вимкнена.
              if (!suspendPageContainer.classList.contains('screenshots-disabled')) {
                   if (show) {
                       suspendPageContainer.classList.add('show-screenshot');
                   } else {
                       suspendPageContainer.classList.remove('show-screenshot');
                   }
              }
          }

           // Додаємо слухачі наведення миші на саму картку
           // При наведенні на картку або будь-який її дочірній елемент, з'явиться скріншот
           suspendCard.addEventListener('mouseenter', () => {
                toggleScreenshotContainerVisibility(true);
           });

           // При відведенні миші від картки або будь-якого її дочірнього елемента, скріншот зникне
           suspendCard.addEventListener('mouseleave', () => {
                // Використовуємо setTimeout, щоб дати можливість миші перейти до скріншоту,
                // якщо користувач хоче клікнути саме по скріншоту, хоча клік відновлює вкладку
                setTimeout(() => {
                     // Перевіряємо, чи миша дійсно не на картці та не на контейнері скріншоту
                     // (навіть якщо pointer-events для скріншоту увімкнено при hover)
                     const isHoveringCard = suspendCard.matches(':hover');
                     const isHoveringScreenshot = screenshotContainer.matches(':hover');
                     if (!isHoveringCard && !isHoveringScreenshot) {
                         toggleScreenshotContainerVisibility(false);
                     }
                }, 50); // Невелика затримка
           });

           // Додаємо слухачі фокусу/блюру для доступності з клавіатури (наприклад, на кнопку відновлення)
           if (restoreButton) { // Перевіряємо, чи кнопка існує
                restoreButton.addEventListener('focus', () => {
                     toggleScreenshotContainerVisibility(true);
                });

                // Blur також використовує затримку для кращого UX, якщо користувач переміщує фокус між елементами
                restoreButton.addEventListener('blur', () => {
                    setTimeout(() => {
                         // Перевіряємо, чи активний елемент (який отримав фокус після blur) не є частиною картки
                         if (!suspendCard.contains(document.activeElement)) {
                              toggleScreenshotContainerVisibility(false);
                         }
                    }, 50); // Невелика затримка
                });
           }


          console.log("Suspend script: Слухачі наведення/фокусу додано до картки та кнопки 'Повернутись'.");
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
             // Прибираємо клік на весь документ, бо тепер є специфічний ховер на кнопку
        } else if (restoreButton && !url) {
             console.warn("Suspend script: Restore button exists but no URL provided. Button will not work.");
             restoreButton.setAttribute('disabled', 'true'); // Вимикаємо кнопку, якщо немає URL
        }
    }
});