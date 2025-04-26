// suspend.js
// Скрипт для сторінки suspend.html

document.addEventListener('DOMContentLoaded', () => {
    // applyTheme, applyLanguage, sendMessageWithRetry тепер знаходяться в utils.js

    // Отримуємо посилання на елементи DOM
    const suspendPageContainer = document.getElementById('suspendPageContainer');
    const suspendCard = document.getElementById('suspendCard');
    const screenshotContainer = document.getElementById('screenshotContainer');
    const screenshotImg = document.getElementById('screenshotImg');
    const screenshotUnavailable = document.getElementById('screenshotUnavailable');
    const restoreButton = document.getElementById('restoreButton');

    // Перевіряємо наявність ключових елементів
    if (!suspendPageContainer || !suspendCard || !screenshotContainer || !screenshotImg || !screenshotUnavailable || !restoreButton) {
         console.error("Suspend script: Не знайдено необхідні елементи DOM.");
         const t = window.i18nTexts || {};
         if (screenshotUnavailable) {
              screenshotUnavailable.textContent = t.screenshotFetchError || 'Error loading page elements';
              screenshotUnavailable.style.display = 'flex';
              if(screenshotImg) screenshotImg.style.display = 'none';
         }
         document.documentElement.style.visibility = 'visible';
         return;
    }

    // Приховуємо вміст контейнера скріншоту за замовчуванням
    screenshotImg.style.display = 'none';
    screenshotUnavailable.style.display = 'none';

    // Load settings for theme, language, and screenshot option
    chrome.storage.sync.get(['language', 'theme', 'enableScreenshots'], (result) => {
      const currentLang = result.language || 'uk';
      window.applyLanguage(currentLang);

      let theme = result.theme;
      if (!theme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
      }
      window.applyTheme(theme);

      const enableScreenshots = result.enableScreenshots !== undefined ? result.enableScreenshots : true;
      if (!enableScreenshots) {
           suspendPageContainer.classList.add('screenshots-disabled');
           // Немає сенсу показувати screenshotUnavailable, якщо контейнер приховано CSS.
           // Можливо, пізніше додати індикатор, якщо скріншоти вимкнено.
      } else {
           suspendPageContainer.classList.remove('screenshots-disabled');
           loadScreenshotAndSetupHover(); // Завантажуємо скріншот та налаштовуємо ховер
      }

      document.documentElement.style.visibility = 'visible';

      loadMainUI(); // Завантажуємо основний UI (фавікон, заголовок, кнопку)
    });

    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    const tabTitle = params.get('title');
    const tabId = params.get('tabId');
    const favIconUrl = params.get('favIconUrl');

    const numericTabId = tabId ? parseInt(tabId, 10) : chrome.tabs.TAB_ID_NONE;

    const tabFaviconElement = document.getElementById('tabFavicon');
    const suspendedTabTitleElement = document.getElementById('suspendedTabTitle');

    // --- Функція для завантаження скріншоту та налаштування слухачів наведення ---
    function loadScreenshotAndSetupHover() {
         if (numericTabId === chrome.tabs.TAB_ID_NONE || !screenshotContainer || !screenshotImg || !screenshotUnavailable || !suspendCard || !suspendPageContainer) {
             console.warn("Suspend script: Не знайдено необхідні елементи або Tab ID недійсний для завантаження скріншоту/налаштування ховеру.");
              if (screenshotUnavailable) {
                   const t = window.i18nTexts || {};
                   screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                    screenshotUnavailable.style.display = 'flex';
                    screenshotImg.style.display = 'none';
              }
             setupHoverListeners(); // Додаємо слухачі наведення навіть без скріншота
             return;
         }

         window.sendMessageWithRetry({ action: 'getScreenshot', tabId: numericTabId }, (response, error) => {
              const t = window.i18nTexts || {};

              if (error || !response || !response.success) {
                   console.error(`Suspend script: Помилка отримання скріншоту для вкладки ${numericTabId}:`, error || response?.error || "Невідома помилка від SW");
                   if (screenshotUnavailable) {
                        screenshotUnavailable.textContent = t.screenshotFetchError || 'Error loading screenshot';
                        screenshotUnavailable.style.display = 'flex';
                   }
                   screenshotImg.style.display = 'none';
                   setupHoverListeners();

              } else if (response.success && !response.screenshotUrl) {
                   console.log(`Suspend script: Скріншот для вкладки ${numericTabId} не знайдено.`);
                   if (screenshotUnavailable) {
                       screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                        screenshotUnavailable.style.display = 'flex';
                   }
                   screenshotImg.style.display = 'none';
                   setupHoverListeners();

              } else {
                   const screenshotUrl = response.screenshotUrl;
                   screenshotImg.src = screenshotUrl;
                   screenshotImg.style.display = 'block';
                   screenshotUnavailable.style.display = 'none';

                   screenshotImg.onload = () => {
                       setupHoverListeners();
                   };

                   screenshotImg.onerror = () => {
                        console.warn(`Suspend script: Помилка завантаження скріншоту Data URL для ${numericTabId}.`);
                       screenshotImg.style.display = 'none';
                       if (screenshotUnavailable) {
                            screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                            screenshotUnavailable.style.display = 'flex';
                       }
                       setupHoverListeners();
                   };
                   if (screenshotImg.complete) {
                       if (screenshotImg.naturalHeight !== 0) {
                           setupHoverListeners();
                       } else {
                            console.warn(`Suspend script: Скріншот з кешу для ${numericTabId} недійсний.`);
                            screenshotImg.style.display = 'none';
                            if (screenshotUnavailable) {
                                 screenshotUnavailable.textContent = t.screenshotUnavailable || 'Screenshot unavailable';
                                 screenshotUnavailable.style.display = 'flex';
                            }
                            setupHoverListeners();
                       }
                   }
              }
         });
    }

     // --- Функція для налаштування слухачів наведення на картку ---
     function setupHoverListeners() {
          if (!suspendPageContainer || !suspendCard) return;

          function toggleScreenshotContainerVisibility(show) {
              if (!suspendPageContainer.classList.contains('screenshots-disabled')) {
                   if (show) {
                       suspendPageContainer.classList.add('show-screenshot');
                   } else {
                       suspendPageContainer.classList.remove('show-screenshot');
                   }
              }
          }

           suspendCard.addEventListener('mouseenter', () => {
                toggleScreenshotContainerVisibility(true);
           });

           suspendCard.addEventListener('mouseleave', () => {
                setTimeout(() => {
                     const isHoveringCard = suspendCard.matches(':hover');
                     const isHoveringScreenshot = screenshotContainer.matches(':hover');
                     if (!isHoveringCard && !isHoveringScreenshot) {
                         toggleScreenshotContainerVisibility(false);
                     }
                }, 50);
           });

           if (restoreButton) {
                restoreButton.addEventListener('focus', () => {
                     toggleScreenshotContainerVisibility(true);
                });

                restoreButton.addEventListener('blur', () => {
                    setTimeout(() => {
                         if (!suspendCard.contains(document.activeElement)) {
                              toggleScreenshotContainerVisibility(false);
                         }
                    }, 50);
                });
           }
     }

    // --- Функція для завантаження та відображення основного UI ---
    function loadMainUI() {
        if (tabFaviconElement && favIconUrl) {
            const decodedFavIconUrl = decodeURIComponent(favIconUrl);
            tabFaviconElement.src = decodedFavIconUrl;
            tabFaviconElement.style.display = 'block';
             tabFaviconElement.onerror = () => {
                 tabFaviconElement.style.display = 'none';
             };
        } else if (tabFaviconElement) {
           tabFaviconElement.style.display = 'none';
        }

        if (suspendedTabTitleElement) {
             const t = window.i18nTexts || {};
            if (tabTitle) {
                suspendedTabTitleElement.textContent = window.escapeHTML(decodeURIComponent(tabTitle));
            } else {
                suspendedTabTitleElement.textContent = t.suspendTitle || 'Tab Suspended';
            }
        }

        if (restoreButton && url) {
            restoreButton.addEventListener('click', () => {
              window.location.href = decodeURIComponent(url);
            });
        } else if (restoreButton && !url) {
             console.warn("Suspend script: Restore button exists but no URL provided.");
             restoreButton.setAttribute('disabled', 'true');
        }
    }
});