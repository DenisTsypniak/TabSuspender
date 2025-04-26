// content.js

// Позначаємо, що скрипт інєктовано, щоб уникнути дублювання
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && !window.__tabSuspenderInjected) {
    window.__tabSuspenderInjected = true;

    // Відстежуємо медіа елементи з доданими слухачами
    const trackedMediaElements = new Set();

    // Відстеження, чи було будь-яке відео відтворено на цій сторінці
    let hasAnyVideoPlayedLocally = false;

    // --- Допоміжна функція debounce ---
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
            }, delay);
        };
    }

     // Безпечна надсилання повідомлень до service worker
     function safeSendMessage(message, callback) {
         if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
              try {
                  chrome.runtime.sendMessage(message, (response) => {
                      if (chrome.runtime.lastError) {
                          if (!chrome.runtime.lastError.message.includes("Receiving end does not exist")) {
                               console.warn("Content script: Помилка надсилання повідомлення або отримання відповіді:", chrome.runtime.lastError.message, message);
                          }
                      }
                      if (callback) {
                          callback(response);
                      }
                  });
              } catch (e) {
                  console.error("Content script: Виняток при виклику sendMessage:", e, message);
              }
         }
     }

    // Визначає та надсилає поточний стан медіа
    function updateMediaState() {
        // Фільтруємо елементи, що все ще в DOM та мають src
        const currentMediaElements = Array.from(trackedMediaElements).filter(media => {
            try {
                 return document.body.contains(media) && (media.src || media.querySelector('source[src]'));
            } catch (e) {
                 console.warn("Content script: Помилка доступу до медіа елемента при updateMediaState", e, media);
                 return false;
            }
        });

        // Перезаповнюємо набір тільки дійсними елементами
        trackedMediaElements.clear();
        currentMediaElements.forEach(media => trackedMediaElements.add(media));


        // Чи будь-який медіа елемент зараз відтворюється
        const isAnyMediaPlaying = currentMediaElements.some(media => {
            try {
                 // Перевіряємо, що readyState >= HAVE_CURRENT_DATA (не 0 або 1) перед перевіркою paused/ended
                 // Це допомагає відфільтрувати елементи, які ще не завантажили дані медіа
                 return media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !media.paused && !media.ended;
            } catch (e) {
                 console.warn("Content script: Помилка доступу до властивостей медіа елемента при updateMediaState", e, media);
                 return false;
            }
        });

        // Чи є дійсні медіа елементи
        const hasMediaElements = currentMediaElements.length > 0;

        safeSendMessage({
            action: 'updateVideoState',
            state: {
                hasVideo: hasMediaElements, // Використовуємо hasVideo як індикатор наявності будь-якого медіа
                isPlaying: isAnyMediaPlaying,
                hasPlayed: hasAnyVideoPlayedLocally
            }
        });
    }

    const debouncedUpdateMediaState = debounce(updateMediaState, 200);

     // Обробники медіа подій
     function handleMediaPlay() { try { if (this.tagName === 'VIDEO') hasAnyVideoPlayedLocally = true; debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaPlay", e, this); } }
     function handleMediaPause() { try { debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaPause", e, this); } }
     function handleMediaEnded() { try { debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaEnded", e, this); } }
     function handleMediaSeeked() { try { if (this.tagName === 'VIDEO' && this.currentTime > 0) hasAnyVideoPlayedLocally = true; debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaSeeked", e, this); } }
     function handleMediaVolumeChange() { try { debouncedUpdateMediaState(); } catch(e){ console.error("Content script: Помилка в handleMediaVolumeChange", e, this); } }

     // Цей обробник тепер додає елемент до trackedMediaElements
     function handleMediaLoadedMetadata() {
         try {
              if (this.src || this.querySelector('source[src]')) {
                   // Додаємо до відстежуваних лише після завантаження метаданих та наявності src
                   trackedMediaElements.add(this);
                   // Перевіряємо, чи слухачі вже додані
                   if (!this.__listenersAddedByTabSuspender) {
                       addMediaListenersWithNamedHandlers(this);
                   }
                   debouncedUpdateMediaState();
               }
         } catch(e) { console.error("Content script: Помилка в handleMediaLoadedMetadata", e, this); }
     }

     // Додає слухачів медіа подій до елемента
      function addMediaListenersWithNamedHandlers(mediaElement) {
         if (mediaElement.__listenersAddedByTabSuspender) return;

         // Додаємо слухачі лише якщо елемент вже має src або source
         if (!(mediaElement.src || mediaElement.querySelector('source[src]'))) {
             // Якщо src ще немає, додаємо слухач loadedmetadata, який додасть інші слухачі пізніше
             mediaElement.addEventListener('loadedmetadata', handleMediaLoadedMetadata, { once: true }); // Додаємо once: true
             return; // Виходимо, інші слухачі будуть додані після loadedmetadata
         }

         // Якщо src вже є, додаємо всі слухачі
         mediaElement.__listenersAddedByTabSuspender = true;
         trackedMediaElements.add(mediaElement); // Додаємо до відстежуваних

         mediaElement.addEventListener('play', handleMediaPlay);
         mediaElement.addEventListener('pause', handleMediaPause);
         mediaElement.addEventListener('ended', handleMediaEnded);
         mediaElement.addEventListener('seeked', handleMediaSeeked);
         mediaElement.addEventListener('volumechange', handleMediaVolumeChange);
         // handleMediaLoadedMetadata вже не потрібен тут, він додається вище якщо немає src

         // Перевірка, чи медіа вже відтворюється при додаванні слухачів
         try {
             if (mediaElement.tagName === 'VIDEO' && mediaElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && (!mediaElement.paused || mediaElement.currentTime > 0)) {
                 hasAnyVideoPlayedLocally = true;
                 // Надсилаємо оновлення стану одразу після додавання слухачів для автоплей відео
                 debouncedUpdateMediaState(); // Або updateMediaState() без debounce? Debounce безпечніше.
             }
         } catch(e) { console.warn("Content script: Помилка доступу до стану медіа при додаванні слухачів", e, mediaElement); }
      }

      // Безпечно видаляє слухачів медіа подій
      function safeRemoveListeners(mediaElement) {
          // Видаляємо слухач loadedmetadata, якщо він був доданий, але ще не спрацював
          mediaElement.removeEventListener('loadedmetadata', handleMediaLoadedMetadata, { once: true });

          if (!mediaElement.__listenersAddedByTabSuspender) {
              // Якщо інші слухачі не були додані, просто видаляємо з trackedMediaElements
              trackedMediaElements.delete(mediaElement);
              return;
          }

          try {
              mediaElement.removeEventListener('play', handleMediaPlay);
              mediaElement.removeEventListener('pause', handleMediaPause);
              mediaElement.removeEventListener('ended', handleMediaEnded);
              mediaElement.removeEventListener('seeked', handleMediaSeeked);
              mediaElement.removeEventListener('volumechange', handleMediaVolumeChange);
          } catch(e) {
              console.warn("Content script: Помилка видалення слухачів медіа елемента", e, mediaElement);
          }
           mediaElement.__listenersAddedByTabSuspender = false;
           trackedMediaElements.delete(mediaElement);
      }

    // Сканує DOM на наявність медіа елементів та додає слухачів
    function scanForMediaElements() {
        try {
            const mediaElements = document.querySelectorAll('video, audio');
            mediaElements.forEach(media => {
                 // addMediaListenersWithNamedHandlers тепер сама перевіряє src/source та додає loadedmetadata якщо потрібно
                 addMediaListenersWithNamedHandlers(media);
            });
        } catch(e) {
            console.error("Content script: Помилка при початковому скануванні медіа елементів", e);
        }
         // Надсилаємо початковий стан після сканування (для елементів з src одразу)
         debouncedUpdateMediaState();
    }

     // --- MutationObserver для відстеження динамічно доданих/видалених медіа елементів ---
     const observer = new MutationObserver(mutations => {
         let shouldUpdateState = false;
         mutations.forEach(mutation => {
             try {
                 mutation.addedNodes.forEach(node => {
                     if (node.nodeType === Node.ELEMENT_NODE) {
                          // Перевіряємо сам доданий вузол
                          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                               addMediaListenersWithNamedHandlers(node);
                               shouldUpdateState = true;
                          }
                          // Перевіряємо медіа елементи в піддереві
                          const nestedMedia = node.querySelectorAll('video, audio');
                          nestedMedia.forEach(media => {
                               addMediaListenersWithNamedHandlers(media);
                               shouldUpdateState = true;
                          });
                     }
                 });
             } catch(e) { console.error("Content script: Помилка при обробці addedNodes", e, mutation); }

             try {
                  mutation.removedNodes.forEach(node => {
                     if (node.nodeType === Node.ELEMENT_NODE) {
                         // Видаляємо слухачів з елементів, які були видалені, якщо вони були відстежувані
                          // safeRemoveListeners перевіряє, чи були додані слухачі
                          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
                               safeRemoveListeners(node);
                               shouldUpdateState = true; // Потенційно змінено кількість медіа
                           }
                           // Перевіряємо медіа елементи в піддереві видаленого вузла
                           const nestedMedia = node.querySelectorAll('video, audio');
                           nestedMedia.forEach(media => {
                                safeRemoveListeners(media);
                                shouldUpdateState = true; // Потенційно змінено кількість медіа
                           });
                     }
                  });
             } catch(e) { console.error("Content script: Помилка при обробці removedNodes", e, mutation); }
         });
         if (shouldUpdateState) {
             debouncedUpdateMediaState();
         }
     });

     // Конфігурація для Observer
     const observerConfig = { childList: true, subtree: true };

    // --- Слухачі подій для активності користувача ---
    const sendActivityUpdate = debounce(() => {
         safeSendMessage({ action: 'updateActivity' });
    }, 300);

    ['mousemove', 'keydown', 'scroll', 'click', 'wheel', 'mousedown', 'touchstart', 'focus'].forEach(event => {
      document.addEventListener(event, sendActivityUpdate, { passive: true });
    });

     window.addEventListener('focus', sendActivityUpdate);

    // --- Ініціалізація ---
    requestAnimationFrame(() => {
        if (document.body) {
             observer.observe(document.body, observerConfig);
             scanForMediaElements();
        } else {
             console.error('Content script: document.body недоступний.');
             window.addEventListener('DOMContentLoaded', () => {
                 if (document.body) {
                      observer.observe(document.body, observerConfig);
                       scanForMediaElements();
                 } else {
                      console.error('Content script: document.body все ще недоступний після DOMContentLoaded.');
                 }
             });
        }
    });

} else {
// Скрипт вже інєктовано або chrome.runtime недоступний.
}