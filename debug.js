// debug.js
// Скрипт для сторінки debug.html, що відображає інформацію про вкладки та їх стан.

document.addEventListener('DOMContentLoaded', () => {
    // Отримуємо посилання на елементи DOM
    const tabsTableBody = document.getElementById('tabsTable');
    const status = document.getElementById('status');
    const backButton = document.getElementById('backToSettings'); // Кнопка "Назад до налаштувань"

    // Отримуємо посилання на таблицю та її заголовки (з безпечними перевірками)
    const table = tabsTableBody ? tabsTableBody.closest('table') : null; // Знаходимо батьківську таблицю
    const tableHeaders = table ? table.querySelectorAll('thead th') : []; // Отримуємо заголовки з thead


    // Визначаємо індекс стовпця "Час до призупинення" для подальшого приховування
    let timeToSuspendColumnIndex = -1;
    tableHeaders.forEach((th, index) => {
        if (th.getAttribute('data-i18n') === 'debugTimeLeft') {
            timeToSuspendColumnIndex = index;
        }
    });


    // applyTheme та applyLanguage знаходяться в utils.js, який завантажується першим.
    // Завантажуємо налаштування теми та мови
    chrome.storage.sync.get(['language', 'theme'], (result) => {
      // Застосовуємо мову спочатку, щоб обробити атрибути i18n та заповнити i18nTexts
      const currentLang = result.language || 'uk';
      window.applyLanguage(currentLang); // Використовуємо глобальну функцію applyLanguage

      // Потім застосовуємо тему
      let theme = result.theme;
      if (!theme) {
        // Визначаємо тему за налаштуваннями системи, якщо тема не збережена
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        theme = prefersDark ? 'dark' : 'light';
      }
      window.applyTheme(theme); // Використовуємо глобальну функцію applyTheme

       // Робимо тіло документа видимим після завантаження налаштувань та UI
       document.documentElement.style.visibility = 'visible';

        // Виконуємо початкове оновлення даних вкладок після завантаження налаштувань та UI
        updateTabs();
        // Встановлюємо інтервал оновлення *після* початкового завантаження
        // Встановлюємо інтервал лише якщо елемент таблиці існує
        if (tabsTableBody) {
            setInterval(updateTabs, 1000); // Оновлюємо дані кожну секунду
        } else {
            console.error("Debug script: tabsTableBody не знайдено. Неможливо встановити інтервал оновлення.");
        }
    });

    // Доступ до локалізованих текстів через глобальну змінну, заповнену utils.js
    // Примітка: Отримуємо її в обробнику chrome.storage.sync.get та всередині updateTabs
    // const t = window.i18nTexts || {}; // Використовуємо глобальний об'єкт текстів. Переконуємося, що він існує.


    // --- Функція для надсилання повідомлення з повторними спробами ---
    // Ця допоміжна функція локальна для UI-скриптів, що спілкуються з фоновим service worker
    function sendMessageWithRetry(message, callback, retries = 5, delay = 100) {
         // Перевіряємо, чи chrome.runtime доступний перед надсиланням
         if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
              console.error("Debug script: chrome.runtime недоступний для надсилання повідомлення.");
               if (callback) callback(null, new Error("chrome.runtime недоступний"));
              return;
         }

         chrome.runtime.sendMessage(message, (response) => {
             // Перевіряємо chrome.runtime.lastError на наявність проблем під час надсилання/отримання повідомлення
             if (chrome.runtime.lastError) {
                 const error = chrome.runtime.lastError;
                 console.warn(`Debug script: Помилка надсилання повідомлення: ${error.message}. Залишилось спроб: ${retries}`, message);
                 // Якщо помилка "Receiving end does not exist" (Service Worker неактивний) і залишились спроби
                 if (retries > 0 && error.message.includes("Receiving end does not exist")) {
                     // Чекаємо і спробуємо знову з експоненційним відступом
                     setTimeout(() => {
                         sendMessageWithRetry(message, callback, retries - 1, delay * 2);
                     }, delay);
                 } else {
                     // Спроби вичерпано або інша помилка
                     console.error("Debug script: Не вдалося надіслати повідомлення після повторних спроб.", message, error);
                     if (callback) callback(null, chrome.runtime.lastError); // Викликаємо callback з останньою помилкою
                 }
             } else {
                 // Повідомлення успішно надіслано та відповідь отримана (навіть якщо відповідь сама по собі вказує на помилку)
                 if (callback) callback(response);
             }
         });
     }
     // --- Кінець функції sendMessageWithRetry ---


    // Форматування часу до призупинення
    function formatTimeLeft(timeLeft) {
      const t = window.i18nTexts || {}; // Отримуємо локалізовані тексти
      // Час може бути менше 0, якщо порогу неактивності досягнуто або перевищено
      const secondsTotal = Math.max(0, Math.floor(timeLeft / 1000)); // Забезпечуємо невід'ємний час у секундах
      const minutes = Math.floor(secondsTotal / 60);
      const seconds = secondsTotal % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`; // Формат ММ:СС
    }

    // Отримання локалізованого тексту причини
    function getLocalizedReason(reasonKey) {
        // Використовуємо глобальний об'єкт i18nTexts для отримання локалізованого тексту за ключем
        // Якщо ключ не знайдено, повертаємо текст для 'reasonUnknown'
        const t = window.i18nTexts || {};
        return t[reasonKey] || t.reasonUnknown || 'Unknown Reason';
    }

    // Використовуємо глобальну функцію shortenUrl з utils.js


    // Оновлення таблиці вкладок
    function updateTabs() {
         // Перевіряємо, чи всі необхідні елементи DOM існують
         if (!tabsTableBody || !status || !table) {
             console.error("Debug script: Необхідні елементи DOM не знайдено. Неможливо оновити таблицю вкладок.");
             return;
         }
         const t = window.i18nTexts || {}; // Доступ до найновіших текстів (після потенційної зміни мови)

      // status.textContent = t.debugStatus || 'Updating data...'; // Можна показати це під час очікування
      // Немає потреби встановлювати статус тут, він встановлюється при отриманні відповіді

      // Використовуємо sendMessageWithRetry для запиту даних з фонового скрипта
      sendMessageWithRetry({ action: 'getDebugInfo' }, (response, error) => {
         // Доступ до найновіших текстів знову всередині зворотного виклику
         const t = window.i18nTexts || {};

        // Перевіряємо наявність відповіді та відсутність помилки (як помилки мережі, так і помилки фонового скрипта)
        if (error || !response || response.error) {
          // Формуємо повідомлення про помилку (локалізоване)
          const errorMessage = error?.message || response?.error || t.debugError || 'Error: Failed to get data';
          status.textContent = errorMessage; // Використовуємо локалізований текст помилки
          status.style.opacity = 1; // Робимо статус видимим

           tabsTableBody.innerHTML = ''; // Очищаємо таблицю у випадку помилки
           // Визначаємо загальну кількість стовпців для об'єднання комірки помилки
           const totalColumns = tableHeaders.length || 6; // Резервна кількість стовпців
           const row = document.createElement('tr');
           // Використовуємо локалізований текст статусу в рядку помилки, екранований
           row.innerHTML = `<td colspan="${totalColumns}" style="text-align: center; font-style: italic; color: var(--warning-bg, red);">${window.escapeHTML(errorMessage)}</td>`;
           tabsTableBody.appendChild(row);

            // Забезпечуємо обробку видимості стовпця часу навіть у випадку помилки
            // Перевіряємо, чи були отримані дані для приховування стовпця
            const showTimerColumn = response?.suspensionTime !== undefined ? response.suspensionTime > 0 : true; // Показуємо за замовчуванням, якщо дані відсутні
            if (!showTimerColumn) {
                table.classList.add('no-timer-column');
            } else {
                 table.classList.remove('no-timer-column');
            }

          return; // Зупиняємо виконання функції тут у випадку помилки
        }

        // Отримуємо дані з відповіді, включаючи причини, стан відео та інфо призупинених вкладок
        // Додаємо enableScreenshots до деструктуризації
        const { tabs, lastActivity, suspensionTime, suspendedTabInfo, preventSuspendIfVideoPaused, enableScreenshots } = response;


        tabsTableBody.innerHTML = ''; // Очищаємо тіло таблиці перед заповненням

        // Необов'язково: сортуємо вкладки за ID або іншими критеріями для послідовності відображення
        tabs.sort((a, b) => a.id - b.id); // Сортуємо за ID


         // Показуємо повідомлення, якщо вкладок не знайдено
         if (!tabs || tabs.length === 0) {
              const row = document.createElement('tr');
              const totalColumns = tableHeaders.length || 6; // Кількість стовпців
              // Використовуємо локалізований текст для "Вкладок не знайдено"
              row.innerHTML = `<td colspan="${totalColumns}" style="text-align: center; font-style: italic;">${window.escapeHTML(t.noTabsFound || 'No tabs found')}</td>`;
              tabsTableBody.appendChild(row);
               // Оновлюємо статус, вказуючи, що дані оновлено, але вкладок немає
               status.textContent = `${t.debugUpdated || 'Data updated'}: ${new Date().toLocaleTimeString()} (${t.noTabsFound || 'No tabs found'})`;
               status.style.opacity = 1;
              // Обробка показу/приховування стовпця таймера навіть за відсутності рядків
               if (suspensionTime <= 0) {
                    table.classList.add('no-timer-column');
               } else {
                    table.classList.remove('no-timer-column');
               }
              return; // Виходимо з функції, якщо вкладок немає
         }

        // --- ПОКРАЩЕННЯ: Використовуємо DocumentFragment для ефективнішого додавання рядків ---
        const fragment = document.createDocumentFragment();

        // Визначаємо, чи потрібно показувати стовпець часу
        const showTimerColumn = suspensionTime > 0;
        if (!showTimerColumn) {
             table.classList.add('no-timer-column'); // Додаємо клас для приховування стовпця
        } else {
             table.classList.remove('no-timer-column'); // Видаляємо клас
        }


        // Заповнюємо таблицю даними кожної вкладки
        tabs.forEach(tab => {

          // Отримуємо ключ причини для цієї вкладки (надіслано фоновим скриптом)
          const reasonKey = tab.reasonKey || 'reasonUnknown'; // Фоновий скрипт додає reasonKey до об'єкта вкладки
          // Отримуємо локалізований текст причини
          const reasonText = getLocalizedReason(reasonKey);
          // Отримуємо reasonDetails з об'єкта вкладки (додано у фоновому скрипті)
          const reasonDetails = tab.reasonDetails || '';


           // Логіка відображення часу до призупинення
           // Показуємо час лише якщо стовпець часу visible І причина вказує, що вкладка МОЖЕ бути призупинена таймером
           const reasonsToShowTimer = ['reasonBelowThreshold', 'reasonReady'];
           let timeLeftDisplay = showTimerColumn ? '-' : ''; // Відображення за замовчуванням (порожньо, якщо стовпець приховано)


           // Отримуємо стан відео для розрахунку часу, що залишився, *якщо* це актуально
           const tabVideoState = tab.videoState; // Стан відео тепер включено в об'єкт вкладки з фонового скрипта
           // Визначаємо, чи відео на паузі блокує призупинення (логіка як у SW)
           const hasPausedVideoBlockingSuspend = preventSuspendIfVideoPaused && tabVideoState?.hasVideo && tabVideoState?.hasPlayed && !tabVideoState?.isPlaying;


           // Умова показу таймера використовує hasPausedVideoBlockingSuspend та showTimerColumn
           if (showTimerColumn && reasonsToShowTimer.includes(reasonKey) && !hasPausedVideoBlockingSuspend) {
                const lastActive = lastActivity[tab.id] || tab.lastAccessed || 0; // Час останньої активності
                const inactiveDuration = Date.now() - lastActive; // Тривалість неактивності
                const minInactiveTime = suspensionTime * 1000; // Мінімальний час неактивності
                const timeLeft = minInactiveTime - inactiveDuration; // Час, що залишився

                 if (timeLeft <= 0) {
                     timeLeftDisplay = "0:00"; // Готова / Час вийшов
                 } else {
                      timeLeftDisplay = formatTimeLeft(timeLeft); // Час, що залишився
                 }
           }


          // Визначаємо favicon, URL та Title для відображення
          // Використовуємо оригінальний URL та Title, якщо вкладка призупинена
          const displayFavIconUrl = tab.favIconUrl;
          const displayUrl = tab.url; // Повний (оригінальний або поточний) URL для title атрибута в Debug
          const displayTitle = tab.title; // Оригінальний Title з фонового скрипта


          const row = document.createElement('tr');
          // Використовуємо скорочений URL для відображення (tab.displayUrl)
          // Використовуємо повний URL для title атрибута (tab.url)
          // Використовуємо оригінальний Title (tab.title)
          // reasonText вже локалізований, reasonDetails вже екранований (включаючи деталі про відео та вимкнені скріншоти)
          row.innerHTML = `
            <td>
               ${displayFavIconUrl ? `<img src="${window.escapeHTML(displayFavIconUrl)}" class="favicon" alt="Site Favicon">` : ''}
            </td>
            <td>${tab.id}</td>
            <td>${window.escapeHTML(displayTitle || (t.noTitle || 'No title'))}</td> <!-- Екрануємо Title -->
            <td class="url-cell" title="${window.escapeHTML(displayUrl)}">${tab.displayUrl}</td> <!-- displayUrl вже екранований та скорочений -->
            <td class="time-left-cell">${timeLeftDisplay}</td>
            <!-- reasonText вже локалізований, reasonDetails вже екранований -->
            <td>${window.escapeHTML(reasonText)}${tab.reasonDetails}</td>
          `;
          fragment.appendChild(row); // Додаємо рядок до DocumentFragment
        });

        // Додаємо всі рядки з DocumentFragment до tbody за одну операцію
        tabsTableBody.appendChild(fragment);

         // Додаємо обробники помилок для favicon після додавання всіх рядків до DOM
          tabsTableBody.querySelectorAll('.favicon').forEach(img => {
              img.onerror = function() {
                   // Якщо іконка не завантажилася, приховуємо елемент <img>
                  this.style.display = 'none';
              };
          });


        // Оновлюємо статус успіху
        status.textContent = `${t.debugUpdated || 'Data updated'}: ${new Date().toLocaleTimeString()}`; // Використовуємо локалізований текст статусу
        status.style.opacity = 1; // Робимо статус видимим

         // Приховуємо/показуємо заголовок стовпця часу та комірки, використовуючи CSS клас на таблиці
         // Цю логіку вже виконано вище, але можна повторити для ясності, хоча це дублювання
         if (suspensionTime <= 0) { // Якщо авто-призупинення вимкнено
             table.classList.add('no-timer-column');
         } else {
             table.classList.remove('no-timer-column');
         }

         // Можливо, додати інформацію про стан enableScreenshots на панель статусу?
         // status.textContent += ` (Screenshots: ${enableScreenshots ? 'Enabled' : 'Disabled'})`;
         // Це вже реалізовано як reasonDetails в таблиці.

      });
    }

    // Початковий виклик та інтервал обробляються у зворотньому виклику chrome.storage.sync.get.


    // Обробник кліків для кнопки "Назад до налаштувань"
    // Перевіряємо існування елемента перед додаванням слухача
    if (backButton) {
        backButton.addEventListener('click', () => {
          // Відкриваємо сторінку налаштувань в ТІЙ ЖЕ вкладці
          const optionsUrl = chrome.runtime.getURL('options.html');
          chrome.tabs.getCurrent((tab) => {
              if (tab && tab.id !== chrome.tabs.TAB_ID_NONE) {
                  chrome.tabs.update(tab.id, { url: optionsUrl });
              } else {
                  // Резервний варіант, якщо поточну вкладку не вдалося отримати (малоймовірно для сторінки налаштувань)
                   chrome.tabs.create({ url: optionsUrl });
              }
          });
        });
    }
});