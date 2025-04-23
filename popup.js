// popup.js
// Скрипт для сторінки popup.html, що відображається при натисканні на іконку розширення.

document.addEventListener('DOMContentLoaded', () => {
  // applyTheme та applyLanguage знаходяться в utils.js, який завантажується першим.

  // --- Функція для надсилання повідомлення з повторними спробами ---
  // Ця допоміжна функція локальна для UI-скриптів, що спілкуються з фоновим service worker
  function sendMessageWithRetry(message, callback, retries = 5, delay = 100) {
      // Перевіряємо, чи chrome.runtime доступний перед надсиланням
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
           console.error("Popup script: chrome.runtime недоступний для надсилання повідомлення.");
           if (callback) callback(null, new Error("chrome.runtime недоступний"));
          return;
      }

      chrome.runtime.sendMessage(message, (response) => {
          // Перевіряємо chrome.runtime.lastError на наявність проблем під час надсилання/отримання повідомлення
          if (chrome.runtime.lastError) {
              const error = chrome.runtime.lastError;
              console.warn(`Popup script: Помилка надсилання повідомлення: ${error.message}. Залишилось спроб: ${retries}`, message);
              // Якщо помилка "Receiving end does not exist" (Service Worker неактивний) і залишились спроби
              if (retries > 0 && error.message.includes("Receiving end does not exist")) {
                  // Чекаємо і спробуємо знову з експоненційним відступом
                  setTimeout(() => {
                      sendMessageWithRetry(message, callback, retries - 1, delay * 2);
                  }, delay);
              } else {
                  // Спроби вичерпано або інша помилка
                  console.error("Popup script: Не вдалося надіслати повідомлення після повторних спроб.", message, error);
                  if (callback) callback(null, chrome.runtime.lastError); // Викликаємо callback з останньою помилкою
              }
          } else {
              // Повідомлення успішно надіслано та відповідь отримана (навіть якщо відповідь сама по собі вказує на помилку)
              if (callback) callback(response);
          }
      });
  }
  // --- Кінець функції sendMessageWithRetry ---


  // Завантажуємо налаштування теми та мови
  chrome.storage.sync.get(['language', 'theme'], (result) => {
    // Застосовуємо мову спочатку, щоб заповнити i18nTexts для подальшого використання
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

     // Робимо тіло документа видимим після завантаження базових стилів та мови
     document.documentElement.style.visibility = 'visible';


    // Після застосування мови та теми, отримуємо інформацію про активну вкладку
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const warning = document.getElementById('warning'); // Елемент для повідомлення про попередження
      // Доступ до глобальних текстів після виконання applyLanguage
      const t = window.i18nTexts || {};

      // Отримуємо посилання на кнопки
      const suspendCurrentBtn = document.getElementById('suspendCurrent');
      const suspendAllBtn = document.getElementById('suspendAll');
      const whitelistUrlBtn = document.getElementById('whitelistUrl');
      const whitelistDomainBtn = document.getElementById('whitelistDomain');
      const openSettingsBtn = document.getElementById('openSettings'); // Кнопка "Налаштування"


      // Перевіряємо, чи отримано активну вкладку
      if (tabs[0] && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
        const tab = tabs[0];
        const url = tab.url;
        const tabId = tab.id; // Отримуємо ID поточної вкладки

        // Вимикаємо кнопки за замовчуванням, вмикаємо, якщо це доречно
        // Кнопки білого списку та призупинення поточної залежать від статусу вкладки
        suspendCurrentBtn?.setAttribute('disabled', 'true');
        whitelistUrlBtn?.setAttribute('disabled', 'true');
        whitelistDomainBtn?.setAttribute('disabled', 'true');
        // Кнопка "Призупинити всі фонові" може бути активною, якщо popup на стандартній сторінці
         suspendAllBtn?.removeAttribute('disabled'); // Вмикаємо за замовчуванням, якщо це не системна сторінка popup'а


        // Використовуємо новий запит checkTabStatus для отримання статусу ТІЛЬКИ поточної вкладки
        sendMessageWithRetry({ action: 'checkTabStatus', tabId: tabId }, (response, error) => {
             const t = window.i18nTexts || {}; // Оновлюємо тексти

             if (error || !response || !response.success) {
                  console.error("Popup script: Помилка отримання статусу вкладки:", error || response?.error || "Невідома помилка");
                  // Показуємо загальне попередження та залишаємо кнопки вимкненими у випадку помилки
                  if(warning) {
                      warning.textContent = t.warningMessage || '⚠️ This page cannot be suspended'; // Показуємо загальне повідомлення
                      warning.style.display = 'block';
                  }
                  // Залишаємо кнопки вимкненими (вже вимкнені за замовчуванням)
                   suspendCurrentBtn?.setAttribute('disabled', 'true');
                   whitelistUrlBtn?.setAttribute('disabled', 'true');
                   whitelistDomainBtn?.setAttribute('disabled', 'true');
                    // Кнопка "Призупинити всі фонові" також може бути вимкнена, якщо стався збій у отриманні статусу
                    suspendAllBtn?.setAttribute('disabled', 'true');

             } else {
                 // Статус отримано успішно
                 const { isInternalPage, isHttpOrHttps, isOurSuspendedPage, isWhitelisted, hasPausedVideoBlockingSuspend, canManuallySuspend, reasonKey } = response;

                // Оновлюємо текст попередження та видимість
                if (isInternalPage) {
                    if(warning) {
                        warning.textContent = t.warningSystemPage || '⚠️ This page cannot be suspended (system page)';
                        warning.style.display = 'block';
                    }
                     // Вимикаємо всі кнопки, крім "Налаштування"
                    suspendCurrentBtn?.setAttribute('disabled', 'true');
                    suspendAllBtn?.setAttribute('disabled', 'true'); // Вимикаємо, якщо сам popup на системній сторінці
                    whitelistUrlBtn?.setAttribute('disabled', 'true');
                    whitelistDomainBtn?.setAttribute('disabled', 'true');

                } else if (isOurSuspendedPage) {
                     // Якщо це наша сторінка призупинення, попередження не потрібне, кнопки дії вимкнені (окрім білого списку, якщо оригінальний URL був веб-сторінкою)
                    if(warning) {
                        warning.style.display = 'none'; // На сторінці призупинення своє UI
                    }
                    // Кнопки призупинення вимкнені, кнопки білого списку можуть бути ввімкнені, якщо оригінальний URL був http/https
                    suspendCurrentBtn?.setAttribute('disabled', 'true');
                     // Кнопка "Призупинити всі фонові" залишається активною, оскільки вона діє на інші вкладки
                     suspendAllBtn?.removeAttribute('disabled');
                    // Перевіряємо, чи оригінальний URL був http/https, щоб дозволити додавання до білого списку
                     const originalUrlFromSuspended = tab.url; // На сторінці suspend.html, url - це url сторінки suspend
                    // Потрібно отримати оригінальний URL з suspendedTabInfo у background.js
                    // Або Popup має отримати цю інформацію при запиті статусу
                    // Тимчасове рішення: припускаємо, що якщо це наша сторінка призупинення, то оригінальний URL був http/https
                    // або краще: зробити окремий запит для оригінального URL, або додати його в checkTabStatus
                    // Реалізуємо простіше: якщо це наша сторінка призупинення, дозволяємо додавати до білого списку (якщо URL є http/https)
                    // Це може бути не ідеально, якщо suspend.html відкрито локальним файлом чищось подібне.
                    // Більш точний підхід вимагає зміни checkTabStatus для повернення оригінального URL.
                    // Для цілей оптимізації popup, залишимо як є, але запам'ятаємо про можливе покращення.
                     if (url.startsWith(`chrome-extension://${chrome.runtime.id}/suspend.html`)) {
                         // Тут потрібно перевірити оригінальний URL, але його немає в об'єкті tab.
                         // Поки що припустимо, що якщо ми на сторінці призупинення, то оригінальний URL був валідним для білого списку.
                         whitelistUrlBtn?.removeAttribute('disabled');
                         whitelistDomainBtn?.removeAttribute('disabled');
                     } else {
                         // На всякий випадок, якщо url не http/https і це не наша сторінка, вимикаємо білий список.
                         whitelistUrlBtn?.setAttribute('disabled', 'true');
                         whitelistDomainBtn?.setAttribute('disabled', 'true');
                     }


                } else if (!isHttpOrHttps) {
                    if(warning) {
                       warning.textContent = t.warningMessage || '⚠️ This page cannot be suspended'; // Використовуємо загальне попередження
                       warning.style.display = 'block';
                    }
                    // Вимикаємо кнопки призупинення та білого списку
                    suspendCurrentBtn?.setAttribute('disabled', 'true');
                     // Кнопка "Призупинити всі фонові" вимикається, якщо поточна вкладка не http/https
                    suspendAllBtn?.setAttribute('disabled', 'true');
                    whitelistUrlBtn?.setAttribute('disabled', 'true');
                    whitelistDomainBtn?.setAttribute('disabled', 'true');

                } else if (isWhitelisted) {
                    // Якщо стандартна веб-сторінка і в білому списку
                     if(warning) {
                         warning.textContent = t.warningWhitelisted || '⚠️ This page cannot be suspended (whitelisted)';
                         warning.style.display = 'block';
                     }
                     // Вимикаємо кнопки призупинення, вмикаємо кнопки білого списку
                     suspendCurrentBtn?.setAttribute('disabled', 'true');
                     // Кнопка "Призупинити всі фонові" залишається активною
                      suspendAllBtn?.removeAttribute('disabled');
                     whitelistUrlBtn?.removeAttribute('disabled');
                     whitelistDomainBtn?.removeAttribute('disabled');

                } else if (hasPausedVideoBlockingSuspend) {
                    // Якщо стандартна веб-сторінка, не в білому списку, але відео на паузі блокує призупинення
                     if(warning) {
                         // Використовуємо загальне повідомлення + причину з i18nTexts
                         const reasonText = window.i18nTexts[reasonKey] || t.reasonUnknown;
                         warning.textContent = `${t.warningMessage || '⚠️ This page cannot be suspended'} (${reasonText})`;
                         warning.style.display = 'block';
                     }
                     // Вимикаємо кнопку призупинення поточної вкладки
                     suspendCurrentBtn?.setAttribute('disabled', 'true');
                     // Кнопка "Призупинити всі фонові" залишається активною
                      suspendAllBtn?.removeAttribute('disabled');
                     // Вмикаємо кнопки білого списку
                     whitelistUrlBtn?.removeAttribute('disabled');
                     whitelistDomainBtn?.removeAttribute('disabled');

                } else {
                   // Це стандартна веб-сторінка, не системна, не наша сторінка призупинення, не в білому списку, і відео не блокує призупинення
                   // Ховаємо попередження
                   if(warning) {
                       warning.style.display = 'none';
                   }
                    // Вмикаємо всі кнопки дій
                    suspendCurrentBtn?.removeAttribute('disabled');
                    suspendAllBtn?.removeAttribute('disabled');
                    whitelistUrlBtn?.removeAttribute('disabled');
                    whitelistDomainBtn?.removeAttribute('disabled');
                }
             }
         }); // Кінець callback для checkTabStatus

      } else {
           // Якщо активна вкладка не знайдена або недійсна (наприклад, нова порожня вкладка)
           if(warning) {
               warning.style.display = 'none';
           }
            // Залишаємо всі кнопки дій вимкненими, крім "Налаштування"
             suspendCurrentBtn?.setAttribute('disabled', 'true');
             suspendAllBtn?.setAttribute('disabled', 'true');
             whitelistUrlBtn?.setAttribute('disabled', 'true');
             whitelistDomainBtn?.setAttribute('disabled', 'true');
      }

       // Завжди переконуємося, що кнопка налаштувань увімкнена, якщо вона існує
       openSettingsBtn?.removeAttribute('disabled');

    }); // Кінець callback для chrome.tabs.query
  }); // Кінець callback для chrome.storage.sync.get


  const suspendCurrent = document.getElementById('suspendCurrent');
  const suspendAll = document.getElementById('suspendAll');
  const whitelistUrlButton = document.getElementById('whitelistUrl'); // Перейменовано, щоб уникнути конфлікту
  const whitelistDomainButton = document.getElementById('whitelistDomain'); // Перейменовано
  const openSettings = document.getElementById('openSettings');

  // Додаємо слухачі подій, тільки якщо елементи існують
  if (suspendCurrent) {
    suspendCurrent.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
             const tab = tabs[0];
             // Перевіряємо, що це веб-сторінка перед спробою призупинити
            if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
                 // Використовуємо sendMessageWithRetry для надсилання запиту до service worker
                 // Service Worker сам перевірить, чи можна призупинити цю вкладку
                 sendMessageWithRetry({ action: 'suspendTab', tabId: tab.id }, (response, error) => {
                      if (error) {
                           console.error("Popup script: Помилка надсилання запиту на призузупинення:", error);
                           // Опціонально: показати повідомлення про помилку користувачу в popup
                           const t = window.i18nTexts || {};
                           const warning = document.getElementById('warning');
                           if (warning) {
                                warning.textContent = `⚠️ ${response?.error || error.message || t.warningMessage}`;
                                warning.style.display = 'block';
                           }
                      } else if (response && response.success) {
                           window.close(); // Закриваємо popup після успішної дії
                      } else {
                           console.warn("Popup script: Запит на призузупинення не був успішним.", response);
                           // Опціонально: показати повідомлення про помилку користувачу на основі response?.error
                           const t = window.i18nTexts || {};
                           const warning = document.getElementById('warning');
                           if (warning) {
                                warning.textContent = `⚠️ ${response?.error || t.warningMessage}`;
                                warning.style.display = 'block';
                           }
                      }
                 });
            } else {
                console.log("Popup script: Cannot suspend current page (not a web page).");
                 // Опціонально: повідомити користувача в popup
                 const t = window.i18nTexts || {};
                 const warning = document.getElementById('warning');
                 if (warning) {
                      warning.textContent = t.warningMessage || '⚠️ This page cannot be suspended';
                      warning.style.display = 'block';
                 }
            }
        }
      });
    });
  }

  if (suspendAll) {
    suspendAll.addEventListener('click', () => {
       // Використовуємо sendMessageWithRetry для надсилання запиту
       // Service Worker сам перевірить кожну фонову вкладку на можливість призупинення
      sendMessageWithRetry({ action: 'suspendAll' }, (response, error) => {
           if (error) {
                 console.error("Popup script: Помилка надсилання запиту на призузупинення всіх:", error);
                 // Опціонально: показати повідомлення про помилку користувачу
                 const t = window.i18nTexts || {};
                 const warning = document.getElementById('warning');
                  // Немає конкретної вкладки, тому можемо показати загальну помилку
                  if (warning) {
                       warning.textContent = `⚠️ ${response?.error || error.message || t.warningMessage}`;
                       warning.style.display = 'block';
                  }
            } else if (response && response.success) {
                 // Можемо показати кількість призупинених вкладок, якщо потрібно
                 // console.log(`Popup script: Successfully suspended ${response.suspendedCount} tabs.`);
                 window.close(); // Закриваємо popup
            } else {
                 console.warn("Popup script: Запит на призузупинення всіх не був успішним.", response);
                  // Опціонально: показати повідомлення про помилку користувачу на основі response?.error
                  const t = window.i18nTexts || {};
                  const warning = document.getElementById('warning');
                   if (warning) {
                       warning.textContent = `⚠️ ${response?.error || t.warningMessage}`;
                       warning.style.display = 'block';
                   }
            }
      });
    });
  }

  if (whitelistUrlButton) { // Використовуємо перейменовану змінну
    whitelistUrlButton.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
          const url = tabs[0].url;
           // Перевіряємо, чи це стандартна веб-сторінка перед додаванням до білого списку
           if (url.startsWith('http://') || url.startsWith('https://')) {
              // Використовуємо sendMessageWithRetry для надсилання запиту
              sendMessageWithRetry({ action: 'addToWhitelistUrl', url }, (response, error) => {
                   if (error) {
                        console.error("Popup script: Помилка надсилання запиту на додавання URL до білого списку:", error);
                        // Опціонально: показати повідомлення про помилку користувачу на основі error.message
                        const t = window.i18nTexts || {};
                        const warning = document.getElementById('warning');
                         if (warning) {
                             warning.textContent = `⚠️ ${response?.error || error.message || t.warningMessage}`;
                             warning.style.display = 'block';
                         }
                   } else if (response && response.success) {
                       window.close(); // Закриваємо popup
                   } else {
                        console.warn("Popup script: Запит на додавання URL до білого списку не був успішним.", response);
                         // Опціонально: показати повідомлення про помилку користувачу на основі response?.error
                         const t = window.i18nTexts || {};
                         const warning = document.getElementById('warning');
                          if (warning) {
                              warning.textContent = `⚠️ ${response?.error || t.warningMessage}`;
                              warning.style.display = 'block';
                          }
                   }
              });
           } else {
               console.log("Popup script: Cannot whitelist current page URL (not a web page).");
                // Опціонально: повідомити користувача в popup
                const t = window.i18nTexts || {};
                const warning = document.getElementById('warning');
                 if (warning) {
                     warning.textContent = t.warningMessage || '⚠️ This page cannot be whitelisted'; // Спеціалізоване повідомлення
                     warning.style.display = 'block';
                 }
           }
        }
      });
    });
  }

  if (whitelistDomainButton) { // Використовуємо перейменовану змінну
    whitelistDomainButton.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
          const url = tabs[0].url;
          // Перевіряємо, чи це стандартна веб-сторінка перед додаванням до білого списку
           if (url.startsWith('http://') || url.startsWith('https://')) {
               try {
                   const urlObj = new URL(url);
                   const domain = urlObj.hostname;
                    if (domain) {
                        // Використовуємо sendMessageWithRetry для надсилання запиту
                       sendMessageWithRetry({ action: 'addToWhitelistDomain', domain }, (response, error) => {
                           if (error) {
                                console.error("Popup script: Помилка надсилання запиту на додавання домену до білого списку:", error);
                                // Опціонально: показати повідомлення про помилку користувачу на основі error.message
                                const t = window.i18nTexts || {};
                                const warning = document.getElementById('warning');
                                 if (warning) {
                                     warning.textContent = `⚠️ ${response?.error || error.message || t.warningMessage}`;
                                     warning.style.display = 'block';
                                 }
                           } else if (response && response.success) {
                                window.close(); // Закриваємо popup
                           } else {
                                console.warn("Popup script: Запит на додавання домену до білого списку не був успішним.", response);
                                 // Опціонально: показати повідомлення про помилку користувачу на основі response?.error
                                 const t = window.i18nTexts || {};
                                 const warning = document.getElementById('warning');
                                  if (warning) {
                                      warning.textContent = `⚠️ ${response?.error || t.warningMessage}`;
                                      warning.style.display = 'block';
                                  }
                           }
                       });
                   } else {
                       console.log("Popup script: Could not extract domain from URL:", url);
                        // Опціонально: повідомити користувача в popup
                        const t = window.i18nTexts || {};
                        const warning = document.getElementById('warning');
                         if (warning) {
                             warning.textContent = t.warningMessage || '⚠️ Could not extract domain from URL'; // Спеціалізоване повідомлення
                             warning.style.display = 'block';
                         }
                   }
               } catch (e) {
                   console.error("Popup script: Failed to parse URL for domain:", url, e);
                   // Опціонально: повідомити користувача в popup
                    const t = window.i18nTexts || {};
                    const warning = document.getElementById('warning');
                     if (warning) {
                         warning.textContent = t.warningMessage || '⚠️ Could not parse URL'; // Спеціалізоване повідомлення
                         warning.style.display = 'block';
                     }
               }
           } else {
              console.log("Popup script: Cannot whitelist domain for current page (not a web page).");
               // Опціонально: повідомити користувача в popup
               const t = window.i18nTexts || {};
               const warning = document.getElementById('warning');
                if (warning) {
                    warning.textContent = t.warningMessage || '⚠️ This page cannot be whitelisted'; // Спеціалізоване повідомлення
                    warning.style.display = 'block';
                }
           }
        }
      });
    });
  }

  if (openSettings) {
    openSettings.addEventListener('click', () => {
      chrome.runtime.openOptionsPage(); // Відкриває сторінку налаштувань у новій вкладці або фокусує існуючу
      window.close(); // Закриваємо popup
    });
  }
});