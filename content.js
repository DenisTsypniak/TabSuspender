// content.js
// Цей скрипт інєктується на кожну сторінку, щоб відстежувати активність користувача
// та стан відео/аудіо елементів і надсилати їх у service worker.

// Перевіряємо, чи chrome.runtime доступний (не запущений на сторінці chrome:// або chrome-extension://)
// та чи скрипт ще не інєктовано, щоб уникнути дублювання
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && !window.__tabSuspenderInjected) {
    window.__tabSuspenderInjected = true; // Позначаємо, що скрипт ін'єктовано
    console.log('Content script Tab Suspender інєктовано.');

    // Відстежуємо медіа елементи (video та audio) локально, до яких ми додали слухачів
    const trackedMediaElements = new Set();

    // Відстеження, чи було відео відтворено на цій сторінці під час сесії контент-скрипта
    // Це відрізняється від hasPlayed у videoState, яке стосується будь-якого відео елемента.
    // Ця змінна буде true, якщо БУДЬ-ЯКЕ відео на сторінці досягло стану "play"
    let hasAnyVideoPlayedLocally = false;


    // --- Допоміжна функція debounce ---
    // Приймає функцію (func) та затримку (delay).
    // Повертає нову функцію, яка виконуватиме func лише після того,
    // як пройде delay часу без нових викликів.
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }
    // --- Кінець функції debounce ---


     // Функція для безпечної надсилання повідомлень до service worker
     function safeSendMessage(message, callback) {
         // Перевіряємо, чи chrome.runtime доступний перед надсиланням
         if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
              try {
                  // chrome.runtime.sendMessage повертає Promise в MV3, але callback все ще підтримується
                  chrome.runtime.sendMessage(message, (response) => {
                      // Перевіряємо runtime.lastError у зворотньому виклику (callback)
                      if (chrome.runtime.lastError) {
                          // Ця помилка виникає, якщо service worker неактивний або не має слухача для цього повідомлення.
                          // Це очікувано в MV3, оскільки SW може бути "вивантажений".
                          // Повідомлення може бути доставлене, як тільки SW "прокинеться".
                          // Логуємо як попередження, якщо це очікувана помилка "Receiving end does not exist".
                          if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                               console.warn("Content script: Помилка надсилання повідомлення або отримання відповіді:", chrome.runtime.lastError.message, message);
                          }
                      }
                      // Викликаємо зворотний виклик, якщо він наданий
                      if (callback) {
                          callback(response);
                      }
                  });
              } catch (e) {
                  // Ловимо синхронні помилки під час самого виклику sendMessage (наприклад, повідомлення занадто велике)
                  console.error("Content script: Виняток при виклику sendMessage:", e, message);
              }
         } else {
              // console.warn("Content script: chrome.runtime недоступний для надсилання повідомлення.");
              // Неможливо надіслати повідомлення, якщо runtime доступний
         }
     }

    // Функція для визначення та надсилання поточного стану відео/аудіо до service worker
    function updateMediaState() {
        // Відфільтровуємо будь-які елементи, які могли бути видалені з DOM
        // Використовуємо як video, так і audio елементи
        const currentMediaElements = Array.from(trackedMediaElements).filter(media => document.body.contains(media));
        trackedMediaElements.clear(); // Очищаємо набір
        currentMediaElements.forEach(media => trackedMediaElements.add(media)); // Додаємо назад тільки існуючі

        // Перевіряємо, чи БУДЬ-ЯКИЙ відстежуваний медіа елемент зараз відтворюється (не на паузі і не завершений)
        const isAnyMediaPlaying = currentMediaElements.some(media => {
            try {
                 return !media.paused && !media.ended;
            } catch (e) {
                 console.warn("Content script: Помилка доступу до властивостей медіа елемента при updateMediaState", e, media);
                 return false; // Припускаємо, що не відтворюється у випадку помилки
            }
        });
        // Перевіряємо, чи існує БУДЬ-ЯКИЙ відстежуваний медіа елемент (навіть якщо зупинений/завершений/на паузі)
        const hasMediaElements = currentMediaElements.length > 0;

        // Надсилаємо агрегований стан медіа елементів до service worker
        safeSendMessage({
            action: 'updateVideoState', // Використовуємо назву 'updateVideoState', як було узгоджено
            state: {
                hasVideo: hasMediaElements, // Позначаємо, чи є медіа елементи (навіть якщо це audio)
                isPlaying: isAnyMediaPlaying, // Чи відтворюється будь-який медіа елемент
                hasPlayed: hasAnyVideoPlayedLocally // Чи відтворювалося будь-яке відео на цій сторінці
            }
        });
        // console.log(`Content script: Відправлено video state:`, { hasVideo: hasMediaElements, isPlaying: isAnyMediaPlaying, hasPlayed: hasAnyVideoPlayedLocally });
    }

    // Створюємо debounced версію updateMediaState
    const debouncedUpdateMediaState = debounce(updateMediaState, 200); // Затримка 200 мс


     // Зберігаємо посилання на обробники подій, щоб їх можна було видалити
     // Назви функцій, які будуть використовуватися як обробники подій
     function handleMediaPlay() { try { if (this.tagName === 'VIDEO') hasAnyVideoPlayedLocally = true; debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaPlay", e, this); } }
     function handleMediaPause() { try { debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaPause", e, this); } }
     function handleMediaEnded() { try { debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaEnded", e, this); } }
     function handleMediaSeeked() { try { if (this.tagName === 'VIDEO' && this.currentTime > 0) hasAnyVideoPlayedLocally = true; debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaSeeked", e, this); } }
     function handleMediaVolumeChange() { try { debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaVolumeChange", e, this); } }
     function handleMediaLoadedMetadata() {
         try {
              if (this.src || this.querySelector('source[src]')) {
                   trackedMediaElements.add(this);
                   // Перевіряємо, чи слухачі вже додані, щоб уникнути дублювання
                   // Використовуємо іменовані функції для додавання/видалення
                   if (!this.__listenersAddedByTabSuspender) {
                       addMediaListenersWithNamedHandlers(this); // Додаємо слухачів
                   }
                   debouncedUpdateMediaState();
               }
         } catch(e) { console.error("Content script: Помилка в handleMediaLoadedMetadata", e, this); }
     }


     // Оновлена функція для додавання слухачів з іменованими обробниками
      function addMediaListenersWithNamedHandlers(mediaElement) {
         if (mediaElement.__listenersAddedByTabSuspender) return;
         mediaElement.__listenersAddedByTabSuspender = true;
         trackedMediaElements.add(mediaElement); // Додаємо до відстежуваних

         // Додаємо слухачі подій, використовуючи іменовані функції
         mediaElement.addEventListener('play', handleMediaPlay);
         mediaElement.addEventListener('pause', handleMediaPause);
         mediaElement.addEventListener('ended', handleMediaEnded);
         mediaElement.addEventListener('seeked', handleMediaSeeked);
         mediaElement.addEventListener('volumechange', handleMediaVolumeChange);
          // Додаємо loadedmetadata, тільки якщо елемент не має src одразу.
          // Або додаємо завжди, але перевіряємо наявність src/source всередині обробника.
          // Краще додати завжди, це покриє більше випадків.
         mediaElement.addEventListener('loadedmetadata', handleMediaLoadedMetadata);


         // Перевірка, чи медіа вже відтворюється або було відтворено при додаванні слухачів
         try {
             if (mediaElement.tagName === 'VIDEO' && (!mediaElement.paused || mediaElement.currentTime > 0)) {
                 hasAnyVideoPlayedLocally = true;
             }
         } catch(e) { console.warn("Content script: Помилка доступу до стану медіа при додаванні слухачів", e, mediaElement); }
      }

      // Функція для безпечного видалення слухачів (викликається перед вивантаженням)
      // Ця функція більше не викликається з unload, але залишається для MutationObserver
      function safeRemoveListeners(mediaElement) {
          if (!mediaElement.__listenersAddedByTabSuspender) return; // Не видаляємо, якщо не додавали

          try {
              // Видаляємо слухачів, використовуючи ті самі іменовані функції
              mediaElement.removeEventListener('play', handleMediaPlay);
              mediaElement.removeEventListener('pause', handleMediaPause);
              mediaElement.removeEventListener('ended', handleMediaEnded);
              mediaElement.removeEventListener('seeked', handleMediaSeeked);
              mediaElement.removeEventListener('volumechange', handleMediaVolumeChange);
               mediaElement.removeEventListener('loadedmetadata', handleMediaLoadedMetadata);
          } catch(e) {
              console.warn("Content script: Помилка видалення слухачів медіа елемента", e, mediaElement);
          }
           mediaElement.__listenersAddedByTabSuspender = false; // Скидаємо позначку
           trackedMediaElements.delete(mediaElement); // Видаляємо з відстежуваних
      }


    // Функція для сканування існуючих відео та аудіо елементів та додавання слухачів
    function scanForMediaElements() {
        try {
            // Шукаємо як video, так і audio елементи
            const mediaElements = document.querySelectorAll('video, audio');
            mediaElements.forEach(media => {
                 // Додаємо слухачів до ВСІХ знайдених медіа елементів.
                 // Наявність src буде перевірена всередині обробників або при першому play/loadedmetadata.
                 addMediaListenersWithNamedHandlers(media);
            });
        } catch(e) {
            console.error("Content script: Помилка при початковому скануванні медіа елементів", e);
        }

         // Після сканування існуючих медіа, надсилаємо початковий стан
         debouncedUpdateMediaState(); // Викликаємо debounced функцію
         // console.log(`Content script: Початкове сканування завершено. Знайдено ${trackedMediaElements.size} медіа елементів.`);
    }

     // --- MutationObserver для відстеження динамічно доданих/видалених медіа елементів ---
     const observer = new MutationObserver(mutations => {
         let shouldUpdateState = false; // Відстежуємо, чи відбулися зміни, що вимагають оновлення стану
         mutations.forEach(mutation => {
             // --- ДОДАНО: Обробка винятків для підвищення стійкості ---
             try {
                  // Обробка доданих вузлів
                 mutation.addedNodes.forEach(node => {
                     // Перевіряємо, чи доданий вузол є елементом і чи містить тег video або audio
                     if (node.nodeType === Node.ELEMENT_NODE) { // Node.ELEMENT_NODE === 1
                          // Якщо сам доданий вузол є медіа елементом
                          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                               // Додаємо слухачів
                               addMediaListenersWithNamedHandlers(node);
                               shouldUpdateState = true; // Потенційно змінено кількість медіа
                          }
                          // Також перевіряємо медіа елементи в піддереві доданого вузла
                          const nestedMedia = node.querySelectorAll('video, audio');
                          nestedMedia.forEach(media => {
                                // Додаємо слухачів
                               addMediaListenersWithNamedHandlers(media);
                               shouldUpdateState = true; // Потенційно змінено кількість медіа
                          });
                     }
                 });
             } catch(e) {
                 console.error("Content script: Помилка при обробці addedNodes в MutationObserver", e, mutation);
                 // Продовжуємо обробку інших мутацій
             }

             try {
                  // Обробка видалених вузлів
                  mutation.removedNodes.forEach(node => {
                     if (node.nodeType === Node.ELEMENT_NODE) {
                         // Видаляємо слухачів з елементів, які були видалені з DOM
                         // Перевіряємо, чи видалений елемент був медіа або містив медіа, щоб зрозуміти, чи потрібно оновити стан
                          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO' || node.querySelector('video, audio')) {
                              // Якщо сам видалений вузол був медіа
                              safeRemoveListeners(node);
                              shouldUpdateState = true;
                          } else {
                              // Перевіряємо медіа елементи в піддереві видаленого вузла
                              const nestedMedia = node.querySelectorAll('video, audio');
                              nestedMedia.forEach(media => {
                                   safeRemoveListeners(media);
                                   shouldUpdateState = true;
                              });
                          }
                     }
                  });
             } catch(e) {
                  console.error("Content script: Помилка при обробці removedNodes в MutationObserver", e, mutation);
                  // Продовжуємо обробку
             }
             // --- Кінець ДОДАНО обробки винятків ---
         });
         // Якщо будь-які медіа елементи були додані або видалені (з нашого набору), оновлюємо стан
         if (shouldUpdateState) {
             debouncedUpdateMediaState(); // Викликаємо debounced функцію
         }
     });

     // Конфігурація для спостерігача (Observer):
     // спостерігати за додаванням/видаленням дочірніх елементів у всьому піддереві DOM
     const observerConfig = { childList: true, subtree: true };


    // --- Слухачі подій для активності користувача ---
    // Ці слухачі надсилають 'updateActivity' до service worker
    // Використовуємо { passive: true } для кращої продуктивності прокрутки та дотику
    const sendActivityUpdate = debounce(() => { // Створюємо debounced функцію для надсилання активності
         safeSendMessage({ action: 'updateActivity' });
    }, 300); // Затримка 300 мс для активності

    ['mousemove', 'keydown', 'scroll', 'click', 'wheel', 'mousedown', 'touchstart', 'focus'].forEach(event => {
      document.addEventListener(event, sendActivityUpdate, { passive: true }); // Використовуємо debounced функцію
    });

     // Також надсилаємо оновлення активності, коли вікно отримує фокус (наприклад, перемикання Alt+Tab)
     window.addEventListener('focus', sendActivityUpdate); // Використовуємо debounced функцію


    // --- Ініціалізація ---
    // Розпочинаємо спостереження за тілом документа якомога раніше
    // Використовуємо requestAnimationFrame, щоб переконатися, що DOM достатньо готовий для налаштування спостерігача
    requestAnimationFrame(() => {
        if (document.body) {
             observer.observe(document.body, observerConfig);
             console.log('Content script: MutationObserver запущено на document.body.');

            // Виконуємо початкове сканування існуючих медіа елементів після налаштування спостерігача
            scanForMediaElements();

             // *** ВИДАЛЕНО: Слухач події 'unload' ***
             // window.addEventListener('unload', () => { /* ... cleanup code ... */ }, { capture: true });

        } else {
             console.error('Content script: document.body недоступний для запуску MutationObserver.');
             // Якщо body недоступний одразу, спробуємо запустити observer після завантаження DOM
             window.addEventListener('DOMContentLoaded', () => {
                 if (document.body) {
                      observer.observe(document.body, observerConfig);
                      console.log('Content script: MutationObserver запущено на document.body після DOMContentLoaded.');
                       scanForMediaElements();
                       // *** ВИДАЛЕНО: Слухач події 'unload' ***
                       // window.addEventListener('unload', () => { /* ... cleanup code ... */ }, { capture: true });
                 } else {
                      console.error('Content script: document.body все ще недоступний після DOMContentLoaded.');
                 }
             });
        }
    });

    // Примітка: Надсилання останнього стану відео перед вивантаженням сторінки може бути ненадійним,
    // оскільки service worker може бути вивантажений або вже обробляти інші події.
    // Натомість, service worker очищає стан відео для вкладки, коли її URL змінюється або вона закривається.

} else {
// console.log('Content script вже інєктовано, або chrome.runtime недоступний.');
// Скрипт вже ін'єктовано або chrome.runtime недоступний (наприклад, на internal pages), нічого не робимо.
}