// popup.js
// Скрипт для сторінки popup.html

document.addEventListener('DOMContentLoaded', () => {
    // applyTheme, applyLanguage, sendMessageWithRetry тепер знаходяться в utils.js
  
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
  
       // Робимо тіло видимим після завантаження базових стилів та мови
       document.documentElement.style.visibility = 'visible';
  
      // Після застосування мови та теми, отримуємо інформацію про активну вкладку
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const warning = document.getElementById('warning');
        const t = window.i18nTexts || {};
  
        const suspendCurrentBtn = document.getElementById('suspendCurrent');
        const suspendAllBtn = document.getElementById('suspendAll');
        const whitelistUrlBtn = document.getElementById('whitelistUrl');
        const whitelistDomainBtn = document.getElementById('whitelistDomain');
        const openSettingsBtn = document.getElementById('openSettings');
  
        if (tabs[0] && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
          const tab = tabs[0];
          const tabId = tab.id;
  
          // Вимикаємо кнопки за замовчуванням
          suspendCurrentBtn?.setAttribute('disabled', 'true');
          whitelistUrlBtn?.setAttribute('disabled', 'true');
          whitelistDomainBtn?.setAttribute('disabled', 'true');
          suspendAllBtn?.removeAttribute('disabled'); // Вмикаємо за замовчуванням
  
          window.sendMessageWithRetry({ action: 'checkTabStatus', tabId: tabId }, (response, error) => {
               const t = window.i18nTexts || {};
  
               if (error || !response || !response.success) {
                    console.error("Popup script: Помилка отримання статусу вкладки:", error || response?.error || "Невідома помилка");
                    if(warning) {
                        warning.textContent = t.warningMessage || '⚠️ This page cannot be suspended';
                        warning.style.display = 'block';
                    }
                     suspendCurrentBtn?.setAttribute('disabled', 'true');
                     whitelistUrlBtn?.setAttribute('disabled', 'true');
                     whitelistDomainBtn?.setAttribute('disabled', 'true');
                      suspendAllBtn?.setAttribute('disabled', 'true');
  
               } else {
                   const { isInternalPage, isHttpOrHttps, isOurSuspendedPage, isWhitelisted, hasPausedVideoBlockingSuspend, canManuallySuspend, originalSuspendedUrl } = response;
  
                  if (isInternalPage) {
                      if(warning) {
                          warning.textContent = t.warningSystemPage || '⚠️ This page cannot be suspended (system page)';
                          warning.style.display = 'block';
                      }
                      suspendCurrentBtn?.setAttribute('disabled', 'true');
                      suspendAllBtn?.setAttribute('disabled', 'true');
                      whitelistUrlBtn?.setAttribute('disabled', 'true');
                      whitelistDomainBtn?.setAttribute('disabled', 'true');
  
                  } else if (isOurSuspendedPage) {
                      if(warning) {
                          warning.style.display = 'none';
                      }
                      suspendCurrentBtn?.setAttribute('disabled', 'true');
                       suspendAllBtn?.removeAttribute('disabled'); // Залишаємо активною
  
                       // Перевіряємо оригінальний URL для білого списку
                       if (originalSuspendedUrl && (originalSuspendedUrl.startsWith('http://') || originalSuspendedUrl.startsWith('https://'))) {
                           whitelistUrlBtn?.removeAttribute('disabled');
                           whitelistDomainBtn?.removeAttribute('disabled');
                       } else {
                           whitelistUrlBtn?.setAttribute('disabled', 'true');
                           whitelistDomainBtn?.setAttribute('disabled', 'true');
                       }
  
                  } else if (!isHttpOrHttps) {
                      if(warning) {
                         warning.textContent = t.warningMessage || '⚠️ This page cannot be suspended';
                         warning.style.display = 'block';
                      }
                      suspendCurrentBtn?.setAttribute('disabled', 'true');
                      suspendAllBtn?.setAttribute('disabled', 'true');
                      whitelistUrlBtn?.setAttribute('disabled', 'true');
                      whitelistDomainBtn?.setAttribute('disabled', 'true');
  
                  } else if (isWhitelisted) {
                       if(warning) {
                           warning.textContent = t.warningWhitelisted || '⚠️ This page cannot be suspended (whitelisted)';
                           warning.style.display = 'block';
                       }
                       suspendCurrentBtn?.setAttribute('disabled', 'true');
                        suspendAllBtn?.removeAttribute('disabled');
                       whitelistUrlBtn?.removeAttribute('disabled');
                       whitelistDomainBtn?.removeAttribute('disabled');
  
                  } else if (hasPausedVideoBlockingSuspend) {
                       if(warning) {
                           const reasonText = window.i18nTexts[response.reasonKey] || t.reasonUnknown;
                           warning.textContent = `${t.warningMessage || '⚠️ This page cannot be suspended'} (${reasonText})`;
                           warning.style.display = 'block';
                       }
                       suspendCurrentBtn?.setAttribute('disabled', 'true');
                        suspendAllBtn?.removeAttribute('disabled');
                       whitelistUrlBtn?.removeAttribute('disabled');
                       whitelistDomainBtn?.removeAttribute('disabled');
  
                  } else {
                     if(warning) {
                         warning.style.display = 'none';
                     }
                      suspendCurrentBtn?.removeAttribute('disabled');
                      suspendAllBtn?.removeAttribute('disabled');
                      whitelistUrlBtn?.removeAttribute('disabled');
                      whitelistDomainBtn?.removeAttribute('disabled');
                  }
               }
           });
  
        } else {
             // Якщо активна вкладка не знайдена або недійсна
             if(warning) {
                 warning.style.display = 'none';
             }
               suspendCurrentBtn?.setAttribute('disabled', 'true');
               suspendAllBtn?.setAttribute('disabled', 'true');
               whitelistUrlBtn?.setAttribute('disabled', 'true');
               whitelistDomainBtn?.setAttribute('disabled', 'true');
        }
  
         if (openSettingsBtn) openSettingsBtn.removeAttribute('disabled');
  
      });
    });
  
    const suspendCurrent = document.getElementById('suspendCurrent');
    const suspendAll = document.getElementById('suspendAll');
    const whitelistUrlButton = document.getElementById('whitelistUrl');
    const whitelistDomainButton = document.getElementById('whitelistDomain');
    const openSettings = document.getElementById('openSettings');
  
    // Слухачі подій
    if (suspendCurrent) {
      suspendCurrent.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
               const tab = tabs[0];
              if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
                   window.sendMessageWithRetry({ action: 'suspendTab', tabId: tab.id }, (response, error) => {
                        if (error) {
                             console.error("Popup script: Помилка надсилання запиту на призузупинення:", error);
                             const t = window.i18nTexts || {};
                             const warning = document.getElementById('warning');
                             if (warning) {
                                  warning.textContent = `⚠️ ${response?.error || error.message || t.warningMessage}`;
                                  warning.style.display = 'block';
                             }
                        } else if (response && response.success) {
                             window.close();
                        } else {
                             console.warn("Popup script: Запит на призузупинення не був успішним.", response);
                             const t = window.i18nTexts || {};
                             const warning = document.getElementById('warning');
                             if (warning) {
                                  warning.textContent = `⚠️ ${response?.error || t.warningMessage}`;
                                  warning.style.display = 'block';
                             }
                        }
                   });
              } else {
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
        window.sendMessageWithRetry({ action: 'suspendAll' }, (response, error) => {
             if (error) {
                   console.error("Popup script: Помилка надсилання запиту на призузупинення всіх:", error);
                   const t = window.i18nTexts || {};
                   const warning = document.getElementById('warning');
                    if (warning) {
                         warning.textContent = `⚠️ ${response?.error || error.message || t.warningMessage}`;
                         warning.style.display = 'block';
                    }
              } else if (response && response.success) {
                   window.close();
              } else {
                   console.warn("Popup script: Запит на призузупинення всіх не був успішним.", response);
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
  
    if (whitelistUrlButton) {
      whitelistUrlButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
            const url = tabs[0].url;
             if (url.startsWith('http://') || url.startsWith('https://')) {
                window.sendMessageWithRetry({ action: 'addToWhitelistUrl', url }, (response, error) => {
                     if (error) {
                          console.error("Popup script: Помилка надсилання запиту на додавання URL до білого списку:", error);
                          const t = window.i18nTexts || {};
                          const warning = document.getElementById('warning');
                           if (warning) {
                               warning.textContent = `⚠️ ${response?.error || error.message || t.warningMessage}`;
                               warning.style.display = 'block';
                           }
                     } else if (response && response.success) {
                         window.close();
                     } else {
                          console.warn("Popup script: Запит на додавання URL до білого списку не був успішним.", response);
                           const t = window.i18nTexts || {};
                           const warning = document.getElementById('warning');
                            if (warning) {
                                warning.textContent = `⚠️ ${response?.error || t.warningMessage}`;
                                warning.style.display = 'block';
                            }
                     }
                });
             } else {
                  const t = window.i18nTexts || {};
                  const warning = document.getElementById('warning');
                   if (warning) {
                       warning.textContent = t.warningMessage || '⚠️ This page cannot be whitelisted';
                       warning.style.display = 'block';
                   }
             }
          }
        });
      });
    }
  
    if (whitelistDomainButton) {
      whitelistDomainButton.addEventListener('click', () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].id !== chrome.tabs.TAB_ID_NONE) {
            const url = tabs[0].url;
             if (url.startsWith('http://') || url.startsWith('https://')) {
                 try {
                     const urlObj = new URL(url);
                     const domain = urlObj.hostname;
                      if (domain) {
                         window.sendMessageWithRetry({ action: 'addToWhitelistDomain', domain }, (response, error) => {
                             if (error) {
                                  console.error("Popup script: Помилка надсилання запиту на додавання домену до білого списку:", error);
                                  const t = window.i18nTexts || {};
                                  const warning = document.getElementById('warning');
                                   if (warning) {
                                       warning.textContent = `⚠️ ${response?.error || error.message || t.warningMessage}`;
                                       warning.style.display = 'block';
                                   }
                             } else if (response && response.success) {
                                  window.close();
                             } else {
                                  console.warn("Popup script: Запит на додавання домену до білого списку не був успішним.", response);
                                   const t = window.i18nTexts || {};
                                   const warning = document.getElementById('warning');
                                    if (warning) {
                                        warning.textContent = `⚠️ ${response?.error || t.warningMessage}`;
                                        warning.style.display = 'block';
                                    }
                             }
                         });
                     } else {
                          const t = window.i18nTexts || {};
                          const warning = document.getElementById('warning');
                           if (warning) {
                               warning.textContent = t.warningMessage || '⚠️ Could not extract domain from URL';
                               warning.style.display = 'block';
                           }
                     }
                 } catch (e) {
                     console.error("Popup script: Failed to parse URL for domain:", url, e);
                      const t = window.i18nTexts || {};
                      const warning = document.getElementById('warning');
                       if (warning) {
                           warning.textContent = t.warningMessage || '⚠️ Could not parse URL';
                           warning.style.display = 'block';
                       }
                 }
             } else {
                 const t = window.i18nTexts || {};
                 const warning = document.getElementById('warning');
                  if (warning) {
                      warning.textContent = t.warningMessage || '⚠️ This page cannot be whitelisted';
                      warning.style.display = 'block';
                  }
             }
          }
        });
      });
    }
  
    if (openSettings) {
      openSettings.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
        window.close();
      });
    }
  });