// debug.js
// Скрипт для сторінки debug.html

document.addEventListener('DOMContentLoaded', () => {
    // applyTheme, applyLanguage, sendMessageWithRetry тепер знаходяться в utils.js

    // Отримуємо посилання на елементи DOM
    const tabsTableBody = document.getElementById('tabsTable');
    const status = document.getElementById('status');
    const backButton = document.getElementById('backToSettings');

    // Отримуємо посилання на таблицю та її заголовки
    const table = tabsTableBody ? tabsTableBody.closest('table') : null;
    const tableHeaders = table ? table.querySelectorAll('thead th') : [];

    // Визначаємо індекс стовпця "Час до призупинення"
    let timeToSuspendColumnIndex = -1;
    tableHeaders.forEach((th, index) => {
        if (th.getAttribute('data-i18n') === 'debugTimeLeft') {
            timeToSuspendColumnIndex = index;
        }
    });

    // Завантажуємо налаштування теми та мови
    chrome.storage.sync.get(['language', 'theme'], (result) => {
      const currentLang = result.language || 'uk';
      window.applyLanguage(currentLang);

      let theme = result.theme;
      if (!theme) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
      }
      window.applyTheme(theme);

      // Робимо тіло видимим після завантаження налаштувань та UI
       document.documentElement.style.visibility = 'visible';

        // Виконуємо початкове оновлення даних вкладок
        updateTabs();
        // Встановлюємо інтервал оновлення, якщо елемент таблиці існує
        if (tabsTableBody) {
            setInterval(updateTabs, 1000);
        } else {
            console.error("Debug script: tabsTableBody не знайдено.");
        }
    });

    // Форматування часу до призупинення
    function formatTimeLeft(timeLeft) {
      const secondsTotal = Math.max(0, Math.floor(timeLeft / 1000));
      const minutes = Math.floor(secondsTotal / 60);
      const seconds = secondsTotal % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    // Отримання локалізованого тексту причини
    function getLocalizedReason(reasonKey) {
        const t = window.i18nTexts || {};
        return t[reasonKey] || t.reasonUnknown || 'Unknown Reason';
    }

    // Отримання локалізованих деталей
     function getLocalizedDetails(videoDetailsKey, screenshotDetailsKey) {
          const t = window.i18nTexts || {};
          let details = [];
           if (videoDetailsKey) {
               const videoText = t[videoDetailsKey];
               if (videoText) {
                   details.push(`Video: ${videoText}`);
               }
           }
           if (screenshotDetailsKey) {
               const screenshotText = t[screenshotDetailsKey];
                if (screenshotText) {
                   details.push(`Screenshot: ${screenshotText}`);
               }
           }
           return details.length > 0 ? ` (${details.join(', ')})` : '';
     }

    // Оновлення таблиці вкладок
    function updateTabs() {
         if (!tabsTableBody || !status || !table) {
             console.error("Debug script: Необхідні елементи DOM не знайдено.");
             return;
         }
         const t = window.i18nTexts || {};

      window.sendMessageWithRetry({ action: 'getDebugInfo' }, (response, error) => {
         const t = window.i18nTexts || {};

        if (error || !response || !response.tabs) {
          const errorMessage = error?.message || response?.error || t.debugError || 'Error: Failed to get data';
          status.textContent = errorMessage;
          status.style.opacity = 1;

           tabsTableBody.innerHTML = '';
           const totalColumns = tableHeaders.length || 6;
           const row = document.createElement('tr');
           row.innerHTML = `<td colspan="${totalColumns}" style="text-align: center; font-style: italic; color: var(--warning-bg, red);">${window.escapeHTML(errorMessage)}</td>`;
           tabsTableBody.appendChild(row);

            const showTimerColumn = response?.suspensionTime !== undefined ? response.suspensionTime > 0 : true;
            if (!showTimerColumn) {
                table.classList.add('no-timer-column');
            } else {
                 table.classList.remove('no-timer-column');
            }

          return;
        }

        const { tabs, lastActivity, suspensionTime, preventSuspendIfVideoPaused, enableScreenshots } = response; // suspendedTabInfo не використовується напряму тут

        tabsTableBody.innerHTML = '';

         if (!tabs || tabs.length === 0) {
              const row = document.createElement('tr');
              const totalColumns = tableHeaders.length || 6;
              row.innerHTML = `<td colspan="${totalColumns}" style="text-align: center; font-style: italic;">${window.escapeHTML(t.noTabsFound || 'No tabs found')}</td>`;
              tabsTableBody.appendChild(row);
               status.textContent = `${t.debugUpdated || 'Data updated'}: ${new Date().toLocaleTimeString()} (${t.noTabsFound || 'No tabs found'})`;
               status.style.opacity = 1;
               if (suspensionTime <= 0) {
                    table.classList.add('no-timer-column');
               } else {
                    table.classList.remove('no-timer-column');
               }
              return;
         }

        const fragment = document.createDocumentFragment();

        const showTimerColumn = suspensionTime > 0;
        if (!showTimerColumn) {
             table.classList.add('no-timer-column');
        } else {
             table.classList.remove('no-timer-column');
        }

        tabs.forEach(tab => {
          const reasonKey = tab.reasonKey || 'reasonUnknown';
          const reasonText = getLocalizedReason(reasonKey);

           const reasonsToShowTimer = ['reasonBelowThreshold', 'reasonReady'];
           let timeLeftDisplay = showTimerColumn ? '-' : '';

           const tabVideoState = tab.videoState;
           const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;

           if (showTimerColumn && reasonsToShowTimer.includes(reasonKey) && !hasPausedVideoBlockingSuspend) {
                const lastActive = lastActivity[tab.id] || tab.lastAccessed || 0;
                const inactiveDuration = Date.now() - lastActive;
                const minInactiveTime = suspensionTime * 1000;
                const timeLeft = minInactiveTime - inactiveDuration;

                 if (timeLeft <= 0) {
                     timeLeftDisplay = "0:00";
                 } else {
                      timeLeftDisplay = formatTimeLeft(timeLeft);
                 }
           }

           const detailsText = getLocalizedDetails(tab.videoDetailsKey, tab.screenshotDetailsKey);

          const rawFavIconUrl = tab.favIconUrl;
          const rawUrl = tab.url;
          const rawTitle = tab.title;

          const row = document.createElement('tr');
          row.innerHTML = `
            <td>
               ${rawFavIconUrl ? `<img src="${window.escapeHTML(rawFavIconUrl)}" class="favicon" alt="Site Favicon">` : ''}
            </td>
            <td>${tab.id}</td>
            <td title="${window.escapeHTML(rawTitle || (t.noTitle || 'Без назви'))}">${window.escapeHTML(rawTitle || (t.noTitle || 'Без назви'))}</td>
            <td class="url-cell" title="${window.escapeHTML(rawUrl || '')}">${window.shortenUrl(rawUrl || '')}</td>
            <td class="time-left-cell">${timeLeftDisplay}</td>
            <td>${window.escapeHTML(reasonText)}${window.escapeHTML(detailsText)}</td>
          `;
          fragment.appendChild(row);
        });

        tabsTableBody.appendChild(fragment);

          tabsTableBody.querySelectorAll('.favicon').forEach(img => {
              img.onerror = function() {
                  this.style.display = 'none';
              };
          });

        status.textContent = `${t.debugUpdated || 'Data updated'}: ${new Date().toLocaleTimeString()}`;
        status.style.opacity = 1;

         if (suspensionTime <= 0) {
             table.classList.add('no-timer-column');
         } else {
             table.classList.remove('no-timer-column');
         }
      });
    }

    // Обробник кліків кнопки "Назад до налаштувань"
    if (backButton) {
        backButton.addEventListener('click', () => {
          const optionsUrl = chrome.runtime.getURL('options.html');
          chrome.tabs.getCurrent((tab) => {
              if (tab && tab.id !== chrome.tabs.TAB_ID_NONE) {
                  chrome.tabs.update(tab.id, { url: optionsUrl });
              } else {
                   chrome.tabs.create({ url: optionsUrl });
              }
          });
        });
    }
});