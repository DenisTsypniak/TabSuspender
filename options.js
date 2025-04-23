// options.js
// Скрипт для сторінки налаштувань розширення.

document.addEventListener('DOMContentLoaded', () => {
  // applyTheme та applyLanguage знаходяться в utils.js, який завантажується першим.

  // Отримуємо посилання на елементи DOM. Використовуємо nullish coalescing (??)
  // або умовні перевірки при додаванні слухачів, щоб уникнути помилок,
  // якщо елемент не знайдено з якоїсь причини.
  const suspensionTimeSelect = document.getElementById('suspensionTime');
  // const languageSelect = document.getElementById('language'); // Видалено, використовуємо кастомний перемикач
  const languageToggle = document.getElementById('languageToggle'); // Новий контейнер для перемикача мови
  const languageOptions = languageToggle ? languageToggle.querySelectorAll('.language-option') : []; // Опції всередині перемикача мови

  const lightThemeToggle = document.getElementById('lightThemeToggle'); // Елемент для опції світлої теми
  const darkThemeToggle = document.getElementById('darkThemeToggle'); // Елемент для опції темної теми;

  // Новий чекбокс для призупинення відео
  const preventVideoSuspendCheckbox = document.getElementById('preventVideoSuspend');


  const testOption1Checkbox = document.getElementById('testOption1'); // Може не існувати
  const testOption2Checkbox = document.getElementById('testOption2'); // Може не існувати
  const whitelistUrlsList = document.getElementById('whitelistUrls'); // Список для URL
  const whitelistDomainsList = document.getElementById('whitelistDomains'); // Список для доменів
  const clearUrlsButton = document.getElementById('clearUrls'); // Кнопка очищення URL
  const clearDomainsButton = document.getElementById('clearDomains'); // Кнопка очищення доменів
  const openDebugPanelButton = document.getElementById('openDebugPanel'); // Кнопка відкриття панелі відладки
  const status = document.getElementById('status'); // Елемент для повідомлення про статус

  let whitelistUrls = []; // Локальний масив для URL білого списку
  let whitelistDomains = []; // Локальний масив для доменів білого списку

  // Застосовуємо мову та тему негайно при завантаженні
  chrome.storage.sync.get(['language', 'theme'], (result) => {
       // Застосовуємо мову спочатку, щоб завантажити тексти для атрибутів i18n
       const currentLang = result.language || 'uk';
       window.applyLanguage(currentLang); // Використовуємо глобальну функцію applyLanguage
       // Встановлюємо візуальний стан кастомного перемикача мови
       updateLanguageToggleVisual(currentLang);


        // Потім застосовуємо тему та робимо тіло видимим
       let theme = result.theme;
        if (!theme) {
           const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
           theme = prefersDark ? 'dark' : 'light';
        }
       window.applyTheme(theme); // Використовуємо глобальну функцію applyTheme
        // Встановлюємо візуальний стан кастомного перемикача теми
       updateThemeToggleVisual(theme);

       // Робимо тіло видимим зараз, коли базовий стиль та мова завантажені
       document.documentElement.style.visibility = 'visible';
  });


  // Відображення повідомлення про статус збереження
  function showStatusMessage() {
    // Перевіряємо, чи існує елемент статусу
    if (status) {
        const t = window.i18nTexts || {}; // Отримуємо глобальні тексти
        const message = t.settingsSaved || 'Settings saved!'; // Отримуємо локалізований текст

        status.textContent = message;
        status.style.opacity = 1;
        status.style.transition = 'opacity 0.3s ease-in-out'; // Забезпечуємо перехід

        // Ховаємо статус через 2 секунди
        setTimeout(() => {
            status.style.opacity = 0;
            // Опціонально: очищаємо текстовий вміст після повного зникнення
            setTimeout(() => {
                status.textContent = '';
             }, 300); // Відповідає часу переходу
        }, 2000); // Тривалість відображення
    }
  }

  // Функція для рендерингу елементів списку (URL/домени)
  // Використовує DocumentFragment для ефективнішого рендерингу
  function renderList(container, items, type) {
    // Перевіряємо, чи існує контейнер
    if (!container) return;

    // Не потрібно очищати слухачі окремо, оскільки ми використовуємо делегування подій на батьківському елементі.
    container.innerHTML = ''; // Повністю очищаємо контейнер

    const fragment = document.createDocumentFragment(); // Створюємо DocumentFragment

    items.forEach((item, index) => {
      const li = document.createElement('li');
      li.dataset.index = index; // Зберігаємо індекс як data-атрибут
      // Використовуємо глобальну функцію escapeHTML
      const t = window.i18nTexts || {}; // Отримуємо локалізовані тексти
      const deleteTitle = t.clearListButton || 'Видалити'; // Локалізований текст для title кнопки видалення

      let itemTextHtml;
      let itemTitleAttribute = ''; // Підказка (tooltip) для повного URL/домену
      let itemTextClass = 'text'; // Клас за замовчуванням для тексту елемента

      if (type === 'url') {
           // Використовуємо shortenUrl для відображення та повний URL для title
           itemTextHtml = window.shortenUrl(item, 60); // Скорочуємо URL для відображення (можна налаштувати довжину)
           itemTitleAttribute = `title="${window.escapeHTML(item)}"`; // Повний URL в title
           itemTextClass = 'text whitelist-url-text'; // Додаємо специфічний клас для тексту URL
      } else if (type === 'domain') {
           itemTextHtml = window.escapeHTML(item); // Не скорочуємо для доменів
           itemTitleAttribute = `title="${window.escapeHTML(item)}"`; // Повний домен в title
            itemTextClass = 'text'; // Клас за замовчуванням для тексту домену
      } else {
           itemTextHtml = window.escapeHTML(item);
            itemTitleAttribute = '';
             itemTextClass = 'text';
      }


      li.innerHTML = `
        <span class="number">${index + 1}.</span>
        <span class="${itemTextClass}" ${itemTitleAttribute}>${itemTextHtml}</span>
        <button class="delete" data-type="${type}" data-index="${index}" title="${window.escapeHTML(deleteTitle)}">✕</button>
      `;
      fragment.appendChild(li); // Додаємо елемент списку до DocumentFragment
    });

    container.appendChild(fragment); // Додаємо весь DocumentFragment до контейнера за одну операцію DOM

      // Ховаємо контейнер списку, якщо він порожній (обробляється псевдокласом CSS :empty)
      // Немає потреби в JS display = 'none' тут, якщо використовуємо :empty в CSS
  }


  // Обробник кліку для кнопок видалення в списку (використовується делегування)
  function handleDeleteClick(e) {
      // Знаходимо найближчу кнопку видалення (.delete) до елемента, на який клікнули
      const deleteButton = e.target.closest('.delete');
      if (!deleteButton) return; // Якщо клік був не на кнопці видалення, нічого не робимо

       const type = deleteButton.dataset.type; // Отримуємо тип списку з data-атрибута кнопки
      const index = parseInt(deleteButton.dataset.index); // Отримуємо індекс елемента з data-атрибута кнопки
      const t = window.i18nTexts || {}; // Отримуємо глобальні тексти
      const confirmMsg = t.deleteItemConfirm || 'Delete this item?'; // Локалізований текст підтвердження

      if (confirm(confirmMsg)) { // Запитуємо підтвердження
        if (type === 'url') {
          // Перевіряємо, чи індекс дійсний перед видаленням
          if (index >= 0 && index < whitelistUrls.length) {
               whitelistUrls.splice(index, 1); // Видаляємо елемент з локального масиву
               chrome.storage.sync.set({ whitelistUrls }); // Зберігаємо оновлений масив. Це викличе слухач onChanged.
          } else {
               console.warn("Options script: Invalid index for URL deletion:", index);
          }
        } else if (type === 'domain') {
           // Перевіряємо, чи індекс дійсний перед видаленням
            if (index >= 0 && index < whitelistDomains.length) {
               whitelistDomains.splice(index, 1); // Видаляємо елемент з локального масиву
               chrome.storage.sync.set({ whitelistDomains }); // Зберігаємо оновлений масив. Це викличе слухач onChanged.
            } else {
                 console.warn("Options script: Invalid index for Domain deletion:", index);
            }
        }
      }
  }

  // Функція для оновлення візуального стану перемикача теми
  function updateThemeToggleVisual(theme) {
      const toggleContainer = lightThemeToggle?.parentElement; // Отримуємо батьківський div
      if (toggleContainer) {
          // Встановлюємо атрибут data-theme на контейнері для стилізації за допомогою CSS
          toggleContainer.dataset.theme = theme;

          // Оновлюємо активні класи на span іконках
          lightThemeToggle?.classList.toggle('active', theme === 'light');
          darkThemeToggle?.classList.toggle('active', theme === 'dark');
      }
  }

   // Функція для оновлення візуального стану перемикача мови
   function updateLanguageToggleVisual(lang) {
       if (languageToggle) {
           // Встановлюємо атрибут data-lang на контейнері (опціонально, можна стилізувати опції безпосередньо)
           languageToggle.dataset.lang = lang;

           // Оновлюємо активний клас на span опціях мови
           languageOptions.forEach(option => {
               option.classList.toggle('active', option.dataset.lang === lang);
           });
       }
   }


  // Завантажуємо початкові налаштування та дані
  // Включаємо нове налаштування 'preventSuspendIfVideoPaused'
  chrome.storage.sync.get(['suspensionTime', 'whitelistUrls', 'whitelistDomains', 'preventSuspendIfVideoPaused', 'testOption1', 'testOption2'], (result) => {
    if (suspensionTimeSelect && result.suspensionTime !== undefined) suspensionTimeSelect.value = result.suspensionTime;

    // Встановлюємо початковий стан нового чекбокса
    if (preventVideoSuspendCheckbox && result.preventSuspendIfVideoPaused !== undefined) {
         preventVideoSuspendCheckbox.checked = result.preventVideoSuspend;
    }


    if (testOption1Checkbox && result.testOption1 !== undefined) testOption1Checkbox.checked = result.testOption1;
    if (testOption2Checkbox && result.testOption2 !== undefined) testOption2Checkbox.checked = result.testOption2;

    // Переконуємося, що дані білого списку завжди є масивом перед рендерингом
    whitelistUrls = Array.isArray(result.whitelistUrls) ? result.whitelistUrls.filter(url => typeof url === 'string' && url.trim()) : (result.whitelistUrls ? result.whitelistUrls.split(',').map(url => url.trim()).filter(url => url) : []);
    // Переконуємося, що домени переведені в нижній регістр та відфільтровані
    whitelistDomains = Array.isArray(result.whitelistDomains) ? result.whitelistDomains.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase()) : (result.whitelistDomains ? result.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain) : []);

    // Рендеримо списки після завантаження даних
    renderList(whitelistUrlsList, whitelistUrls, 'url');
    renderList(whitelistDomainsList, whitelistDomains, 'domain');

     // applyLanguage та applyTheme викликаються спочатку перед виконанням цього callback
     // Початковий виклик налаштовує глобальний i18nTexts та темизує body.
     // updateThemeToggleVisual та updateLanguageToggleVisual викликаються в початковому callback get.

      // Додаємо слухачі делегування подій для списків після завантаження даних
      if (whitelistUrlsList) {
          whitelistUrlsList.addEventListener('click', handleDeleteClick);
      }
      if (whitelistDomainsList) {
           whitelistDomainsList.addEventListener('click', handleDeleteClick);
      }
  });

  // Слухач змін у сховищі від фонового скрипта або інших вікон
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
        if (changes.whitelistUrls) {
          // Переконуємося, що нове значення розглядається як масив та фільтрується
          whitelistUrls = Array.isArray(changes.whitelistUrls.newValue) ? changes.whitelistUrls.newValue.filter(url => typeof url === 'string' && url.trim()) : (changes.whitelistUrls.newValue ? changes.whitelistUrls.newValue.split(',').map(url => url.trim()).filter(url => url) : []);
          renderList(whitelistUrlsList, whitelistUrls, 'url'); // Перерендерюємо список
        }
        if (changes.whitelistDomains) {
          // Переконуємося, що нове значення розглядається як масив, фільтрується та переводиться в нижній регістр
          whitelistDomains = Array.isArray(changes.whitelistDomains.newValue) ? changes.whitelistDomains.newValue.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase()) : (changes.whitelistDomains.newValue ? changes.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain) : []); // Обробляємо як нижній регістр
          renderList(whitelistDomainsList, whitelistDomains, 'domain'); // Перерендерюємо список
        }
         // Оновлюємо значення select/checkbox, якщо вони змінилися деінде
         if (suspensionTimeSelect && changes.suspensionTime !== undefined && changes.suspensionTime.newValue !== undefined) suspensionTimeSelect.value = changes.suspensionTime.newValue;

         // Оновлюємо стан нового чекбокса, якщо він змінився деінде
         if (preventVideoSuspendCheckbox && changes.preventVideoSuspendIfVideoPaused !== undefined && changes.preventVideoSuspendIfVideoPaused.newValue !== undefined) {
             preventVideoSuspendCheckbox.checked = changes.preventVideoSuspendIfVideoPaused.newValue;
         }


         if (changes.language && changes.language.newValue !== undefined) {
            const newLang = changes.language.newValue;
            // Застосовуємо мову негайно для оновлення UI
            window.applyLanguage(newLang);
            // Оновлюємо візуальний стан перемикача
            updateLanguageToggleVisual(newLang);
             // Не потрібно показувати статус тут, це запускається обробником кліку
         }

         if (changes.theme && changes.theme.newValue !== undefined) {
            const newTheme = changes.theme.newValue;
            // У нас більше немає select теми, але потрібно оновити перемикач та клас body
            window.applyTheme(newTheme); // Застосовуємо тему негайно для оновлення класу body
            updateThemeToggleVisual(newTheme); // Оновлюємо візуальний стан перемикача
             // Не потрібно показувати статус тут, це запускається обробником кліку
         }
         if (testOption1Checkbox && changes.testOption1 !== undefined && changes.testOption1.newValue !== undefined) testOption1Checkbox.checked = changes.testOption1.newValue;
         if (testOption2Checkbox && changes.testOption2 !== undefined && changes.testOption2.newValue !== undefined) testOption2Checkbox.checked = changes.testOption2.newValue;
    }
  });

  // Слухач кнопки "Open debug admin panel"
  // Перевіряємо існування елемента перед додаванням слухача
  if (openDebugPanelButton) {
      openDebugPanelButton.addEventListener('click', () => {
        const debugUrl = chrome.runtime.getURL('debug.html');
        // Отримуємо поточну вкладку та оновлюємо її URL
        chrome.tabs.getCurrent((tab) => {
            if (tab && tab.id !== chrome.tabs.TAB_ID_NONE) {
                chrome.tabs.update(tab.id, { url: debugUrl });
            } else {
                // Резервний варіант, якщо поточну вкладку не вдалося отримати (малоймовірно для сторінки налаштувань)
                 chrome.tabs.create({ url: debugUrl });
            }
        });
      });
  }


  // Слухачі кнопок очищення списку
  // Перевіряємо існування елементів перед додаванням слухачів
  if (clearUrlsButton) {
      clearUrlsButton.addEventListener('click', () => {
        const t = window.i18nTexts || {}; // Отримуємо глобальні тексти
        const confirmMsg = t.clearListButtonConfirm || 'Clear the entire list?'; // Локалізований текст підтвердження
        if (confirm(confirmMsg)) { // Запитуємо підтвердження
          whitelistUrls = []; // Очищаємо локальний масив
          chrome.storage.sync.set({ whitelistUrls }, () => { // Зберігаємо порожній масив
              if (chrome.runtime.lastError) {
                   console.error("Options script: Error clearing URL list:", chrome.runtime.lastError);
              } else {
                  // Рендеримо порожній список після очищення для оновлення UI (включає приховування, якщо список порожній)
                  if (whitelistUrlsList) renderList(whitelistUrlsList, [], 'url');
                  showStatusMessage(); // Показуємо статус після збереження
              }
          }); // Це викличе слухач onChanged
        }
      });
  }

  if (clearDomainsButton) {
      clearDomainsButton.addEventListener('click', () => {
        const t = window.i18nTexts || {}; // Отримуємо глобальні тексти
        const confirmMsg = t.clearListButtonConfirm || 'Clear the entire list?'; // Локалізований текст підтвердження
        if (confirm(confirmMsg)) { // Запитуємо підтвердження
          whitelistDomains = []; // Очищаємо локальний масив
          chrome.storage.sync.set({ whitelistDomains }, () => { // Зберігаємо порожній масив
              if (chrome.runtime.lastError) {
                   console.error("Options script: Error clearing domain list:", chrome.runtime.lastError);
              } else {
                  // Рендеримо порожній список після очищення для оновлення UI (включає приховування, якщо список порожній)
                   if (whitelistDomainsList) renderList(whitelistDomainsList, [], 'domain');
                  showStatusMessage(); // Показуємо статус після збереження
              }
          }); // Це викличе слухач onChanged
        }
      });
  }


  // --- Слухачі змін налаштувань ---
  // Перевіряємо існування елемента select перед додаванням слухача

  if (suspensionTimeSelect) {
      suspensionTimeSelect.addEventListener('change', (e) => {
        const time = parseInt(e.target.value); // Отримуємо обране значення часу
        chrome.storage.sync.set({ suspensionTime: time }, showStatusMessage); // Зберігаємо та показуємо статус
      });
  }

  // Обробка кліків на нових span'ах перемикача мови
  if (languageToggle && languageOptions.length > 0) {
      languageOptions.forEach(option => {
          option.addEventListener('click', () => {
              const newLang = option.dataset.lang; // Отримуємо код мови з data-атрибута
               // Перевіряємо, чи мова дійсно змінилася
               // Використовуємо window.i18nTexts.language для отримання *поточно застосованої* мови
               if (window.i18nTexts.language !== newLang) { // Порівнюємо з активною мовою
                   // Застосовуємо мову негайно для оновлення UI (включаючи інші елементи на сторінці)
                   window.applyLanguage(newLang);
                   // Оновлюємо візуальний стан самого перемикача
                   updateLanguageToggleVisual(newLang);
                   // Зберігаємо нове налаштування мови
                   chrome.storage.sync.set({ language: newLang }, showStatusMessage); // Зберігаємо та показуємо статус
               }
          });
      });
  }


  // Обробка кліків на нових іконках перемикача теми
  if (lightThemeToggle && darkThemeToggle) {
      const themeToggleContainer = lightThemeToggle.parentElement; // Отримуємо батьківський елемент

      // Використовуємо делегування подій на контейнері
      themeToggleContainer.addEventListener('click', (e) => {
          const clickedElement = e.target;
          // Перевіряємо, чи клік був на одній з опцій теми
          if (clickedElement.classList.contains('theme-option')) {
              const newTheme = clickedElement.dataset.theme; // Отримуємо нову тему з data-атрибута
              // Отримуємо поточну тему з атрибута data на контейнері
              const currentTheme = themeToggleContainer.dataset.theme;

              // Зберігаємо тільки якщо тема дійсно змінилася
              if (newTheme && newTheme !== currentTheme) {
                  window.applyTheme(newTheme); // Застосовуємо тему негайно для оновлення класу body
                  updateThemeToggleVisual(newTheme); // Оновлюємо візуальний стан перемикача
                  chrome.storage.sync.set({ theme: newTheme }, showStatusMessage); // Зберігаємо та показуємо статус
              }
          }
      });
  }

   // Обробка зміни стану чекбокса preventVideoSuspend
   if (preventVideoSuspendCheckbox) {
       preventVideoSuspendCheckbox.addEventListener('change', (e) => {
           chrome.storage.sync.set({ preventSuspendIfVideoPaused: e.target.checked }, showStatusMessage); // Зберігаємо та показуємо статус
       });
   }


  // Перевіряємо існування елементів чекбоксів перед додаванням слухачів
  if (testOption1Checkbox) {
      testOption1Checkbox.addEventListener('change', (e) => {
        chrome.storage.sync.set({ testOption1: e.target.checked }, showStatusMessage); // Зберігаємо та показуємо статус
      });
  }

  if (testOption2Checkbox) {
      testOption2Checkbox.addEventListener('change', (e) => {
        chrome.storage.sync.set({ testOption2: e.target.checked }, showStatusMessage); // Зберігаємо та показуємо статус
      });
  }
});