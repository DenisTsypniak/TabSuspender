// options.js
// Скрипт для сторінки налаштувань розширення.

document.addEventListener('DOMContentLoaded', () => {
    // applyTheme, applyLanguage, sendMessageWithRetry тепер знаходяться в utils.js
  
    // Отримуємо посилання на елементи DOM
    const suspensionTimeSelect = document.getElementById('suspensionTime');
    const languageToggle = document.getElementById('languageToggle');
    const languageOptions = languageToggle ? languageToggle.querySelectorAll('.language-option') : [];
  
    const lightThemeToggle = document.getElementById('lightThemeToggle');
    const darkThemeToggle = document.getElementById('darkThemeToggle');
  
    const preventVideoSuspendCheckbox = document.getElementById('preventVideoSuspend');
    const enableScreenshotsCheckbox = document.getElementById('enableScreenshots');
  
    const testOption1Checkbox = document.getElementById('testOption1');
    const testOption2Checkbox = document.getElementById('testOption2');
    const whitelistUrlsList = document.getElementById('whitelistUrls');
    const whitelistDomainsList = document.getElementById('whitelistDomains');
    const clearUrlsButton = document.getElementById('clearUrls');
    const clearDomainsButton = document.getElementById('clearDomains');
    const openDebugPanelButton = document.getElementById('openDebugPanel');
    const status = document.getElementById('status');
  
    let whitelistUrls = [];
    let whitelistDomains = [];
  
    // Застосовуємо мову та тему при завантаженні
    chrome.storage.sync.get(['language', 'theme'], (result) => {
         const currentLang = result.language || 'uk';
         window.applyLanguage(currentLang);
         updateLanguageToggleVisual(currentLang);
  
         let theme = result.theme;
          if (!theme) {
             const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
             theme = prefersDark ? 'dark' : 'light';
          }
         window.applyTheme(theme);
         updateThemeToggleVisual(theme);
  
         document.documentElement.style.visibility = 'visible';
    });
  
    // Відображення повідомлення про статус збереження
    function showStatusMessage() {
      if (status) {
          const t = window.i18nTexts || {};
          const message = t.settingsSaved || 'Settings saved!';
  
          status.textContent = message;
          status.style.opacity = 1;
          status.style.transition = 'opacity 0.3s ease-in-out';
  
          setTimeout(() => {
              status.style.opacity = 0;
              setTimeout(() => {
                  status.textContent = '';
               }, 300);
          }, 2000);
      }
    }
  
    // Рендеринг елементів списку (URL/домени)
    function renderList(container, items, type) {
      if (!container) return;
  
      container.innerHTML = '';
      const fragment = document.createDocumentFragment();
      const t = window.i18nTexts || {};
      const deleteTitle = t.deleteItemConfirm || 'Delete this item?';
  
      items.forEach((item, index) => {
        const li = document.createElement('li');
        li.dataset.index = index;
  
        let itemTextHtml;
        let itemTitleAttribute = '';
        let itemTextClass = 'text';
  
        if (type === 'url') {
             itemTextHtml = window.shortenUrl(item, 60);
             itemTitleAttribute = `title="${window.escapeHTML(item)}"`;
             itemTextClass = 'text whitelist-url-text';
        } else if (type === 'domain') {
             itemTextHtml = window.escapeHTML(item);
             itemTitleAttribute = `title="${window.escapeHTML(item)}"`;
              itemTextClass = 'text';
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
        fragment.appendChild(li);
      });
  
      container.appendChild(fragment);
    }
  
    // Обробник кліку для кнопок видалення в списку (делегування)
    function handleDeleteClick(e) {
        const deleteButton = e.target.closest('.delete');
        if (!deleteButton) return;
  
         const type = deleteButton.dataset.type;
        const index = parseInt(deleteButton.dataset.index);
        const t = window.i18nTexts || {};
        const confirmMsg = t.deleteItemConfirm || 'Delete this item?';
  
        if (confirm(confirmMsg)) {
          if (type === 'url') {
            if (index >= 0 && index < whitelistUrls.length) {
                 whitelistUrls.splice(index, 1);
                 chrome.storage.sync.set({ whitelistUrls }, () => {
                     if (chrome.runtime.lastError) {
                          console.error("Options script: Error saving whitelistUrls after deletion:", chrome.runtime.lastError);
                     } else {
                         showStatusMessage();
                     }
                 });
            } else {
                 console.warn("Options script: Invalid index for URL deletion:", index);
            }
          } else if (type === 'domain') {
              if (index >= 0 && index < whitelistDomains.length) {
                 whitelistDomains.splice(index, 1);
                 chrome.storage.sync.set({ whitelistDomains }, () => {
                      if (chrome.runtime.lastError) {
                           console.error("Options script: Error saving whitelistDomains after deletion:", chrome.runtime.lastError);
                      } else {
                          showStatusMessage();
                      }
                 });
              } else {
                   console.warn("Options script: Invalid index for Domain deletion:", index);
              }
          }
        }
    }
  
    // Оновлення візуального стану перемикача теми
    function updateThemeToggleVisual(theme) {
        const toggleContainer = lightThemeToggle?.parentElement;
        if (toggleContainer) {
            toggleContainer.dataset.theme = theme;
            lightThemeToggle?.classList.toggle('active', theme === 'light');
            darkThemeToggle?.classList.toggle('active', theme === 'dark');
        }
    }
  
     // Оновлення візуального стану перемикача мови
     function updateLanguageToggleVisual(lang) {
         if (languageToggle) {
             languageToggle.dataset.lang = lang;
             languageOptions.forEach(option => {
                 option.classList.toggle('active', option.dataset.lang === lang);
             });
         }
     }
  
    // Завантаження початкових налаштувань та даних
    chrome.storage.sync.get(['suspensionTime', 'whitelistUrls', 'whitelistDomains', 'preventSuspendIfVideoPaused', 'enableScreenshots', 'testOption1', 'testOption2'], (result) => {
      if (suspensionTimeSelect && result.suspensionTime !== undefined) suspensionTimeSelect.value = result.suspensionTime;
  
      if (preventVideoSuspendCheckbox && result.preventSuspendIfVideoPaused !== undefined) {
           preventVideoSuspendCheckbox.checked = result.preventSuspendIfVideoPaused;
      }
       if (enableScreenshotsCheckbox) {
          enableScreenshotsCheckbox.checked = result.enableScreenshots !== undefined ? result.enableScreenshots : true;
       }
  
      if (testOption1Checkbox && result.testOption1 !== undefined) testOption1Checkbox.checked = result.testOption1;
      if (testOption2Checkbox && result.testOption2 !== undefined) testOption2Checkbox.checked = result.testOption2;
  
      whitelistUrls = Array.isArray(result.whitelistUrls) ? result.whitelistUrls.filter(url => typeof url === 'string' && url.trim()) : (result.whitelistUrls ? result.whitelistUrls.split(',').map(url => url.trim()).filter(url => url) : []);
      whitelistDomains = Array.isArray(result.whitelistDomains) ? result.whitelistDomains.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase()) : (result.whitelistDomains ? result.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain) : []);
  
      renderList(whitelistUrlsList, whitelistUrls, 'url');
      renderList(whitelistDomainsList, whitelistDomains, 'domain');
  
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
            whitelistUrls = Array.isArray(changes.whitelistUrls.newValue) ? changes.whitelistUrls.newValue.filter(url => typeof url === 'string' && url.trim()) : (changes.whitelistUrls.newValue ? changes.whitelistUrls.newValue.split(',').map(url => url.trim()).filter(url => url) : []);
            renderList(whitelistUrlsList, whitelistUrls, 'url');
          }
          if (changes.whitelistDomains) {
            whitelistDomains = Array.isArray(changes.whitelistDomains.newValue) ? changes.whitelistDomains.newValue.filter(domain => typeof domain === 'string' && domain.trim()).map(domain => domain.trim().toLowerCase()) : (changes.whitelistDomains.newValue ? changes.whitelistDomains.split(',').map(domain => domain.trim().toLowerCase()).filter(domain => domain) : []);
            renderList(whitelistDomainsList, whitelistDomains, 'domain');
          }
           if (suspensionTimeSelect && changes.suspensionTime !== undefined && changes.suspensionTime.newValue !== undefined) suspensionTimeSelect.value = changes.suspensionTime.newValue;
  
           if (preventVideoSuspendCheckbox && changes.preventSuspendIfVideoPaused !== undefined && changes.preventSuspendIfVideoPaused.newValue !== undefined) {
               preventVideoSuspendCheckbox.checked = changes.preventSuspendIfVideoPaused.newValue;
           }
           if (enableScreenshotsCheckbox && changes.enableScreenshots !== undefined && changes.enableScreenshots.newValue !== undefined) {
                enableScreenshotsCheckbox.checked = changes.enableScreenshots.newValue;
           }
  
           if (changes.language && changes.language.newValue !== undefined) {
              const newLang = changes.language.newValue;
              window.applyLanguage(newLang);
              updateLanguageToggleVisual(newLang);
           }
  
           if (changes.theme && changes.theme.newValue !== undefined) {
              const newTheme = changes.theme.newValue;
              window.applyTheme(newTheme);
              updateThemeToggleVisual(newTheme);
           }
           if (testOption1Checkbox && changes.testOption1 !== undefined && changes.testOption1.newValue !== undefined) testOption1Checkbox.checked = changes.testOption1.newValue;
           if (testOption2Checkbox && changes.test2Option !== undefined && changes.testOption2.newValue !== undefined) testOption2Checkbox.checked = changes.testOption2.newValue;
      }
    });
  
    // Слухач кнопки "Open debug admin panel"
    if (openDebugPanelButton) {
        openDebugPanelButton.addEventListener('click', () => {
          const debugUrl = chrome.runtime.getURL('debug.html');
          chrome.tabs.getCurrent((tab) => {
              if (tab && tab.id !== chrome.tabs.TAB_ID_NONE) {
                  chrome.tabs.update(tab.id, { url: debugUrl });
              } else {
                   chrome.tabs.create({ url: debugUrl });
              }
          });
        });
    }
  
    // Слухачі кнопок очищення списку
    if (clearUrlsButton) {
        clearUrlsButton.addEventListener('click', () => {
          const t = window.i18nTexts || {};
          const confirmMsg = t.clearListButtonConfirm || 'Clear the entire list?';
          if (confirm(confirmMsg)) {
            whitelistUrls = [];
            chrome.storage.sync.set({ whitelistUrls }, () => {
                if (chrome.runtime.lastError) {
                     console.error("Options script: Error clearing URL list:", chrome.runtime.lastError);
                } else {
                    showStatusMessage();
                }
            });
          }
        });
    }
  
    if (clearDomainsButton) {
        clearDomainsButton.addEventListener('click', () => {
          const t = window.i18nTexts || {};
          const confirmMsg = t.clearListButtonConfirm || 'Clear the entire list?';
          if (confirm(confirmMsg)) {
            whitelistDomains = [];
            chrome.storage.sync.set({ whitelistDomains }, () => {
                if (chrome.runtime.lastError) {
                     console.error("Options script: Error clearing domain list:", chrome.runtime.lastError);
                } else {
                    showStatusMessage();
                }
            });
          }
        });
    }
  
    // Слухачі змін налаштувань
    if (suspensionTimeSelect) {
        suspensionTimeSelect.addEventListener('change', (e) => {
          const time = parseInt(e.target.value);
          chrome.storage.sync.set({ suspensionTime: time }, showStatusMessage);
        });
    }
  
    if (languageToggle && languageOptions.length > 0) {
        languageOptions.forEach(option => {
            option.addEventListener('click', () => {
                const newLang = option.dataset.lang;
                 if (window.i18nTexts.language !== newLang) {
                     window.applyLanguage(newLang);
                     updateLanguageToggleVisual(newLang);
                     chrome.storage.sync.set({ language: newLang }, showStatusMessage);
                 }
            });
        });
    }
  
    if (lightThemeToggle && darkThemeToggle) {
        const themeToggleContainer = lightThemeToggle.parentElement;
        themeToggleContainer.addEventListener('click', (e) => {
            const clickedElement = e.target;
            if (clickedElement.classList.contains('theme-option')) {
                const newTheme = clickedElement.dataset.theme;
                const currentTheme = themeToggleContainer.dataset.theme;
                if (newTheme && newTheme !== currentTheme) {
                    window.applyTheme(newTheme);
                    updateThemeToggleVisual(newTheme);
                    chrome.storage.sync.set({ theme: newTheme }, showStatusMessage);
                }
            }
        });
    }
  
     if (preventVideoSuspendCheckbox) {
         preventVideoSuspendCheckbox.addEventListener('change', (e) => {
             chrome.storage.sync.set({ preventSuspendIfVideoPaused: e.target.checked }, showStatusMessage);
         });
     }
  
      if (enableScreenshotsCheckbox) {
          enableScreenshotsCheckbox.addEventListener('change', (e) => {
              chrome.storage.sync.set({ enableScreenshots: e.target.checked }, showStatusMessage);
          });
      }
  
    if (testOption1Checkbox) {
        testOption1Checkbox.addEventListener('change', (e) => {
          chrome.storage.sync.set({ testOption1: e.target.checked }, showStatusMessage);
        });
    }
  
    if (testOption2Checkbox) {
        testOption2Checkbox.addEventListener('change', (e) => {
          chrome.storage.sync.set({ testOption2: e.target.checked }, showStatusMessage);
        });
    }
  });