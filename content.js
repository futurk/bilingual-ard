// Global variables to manage extension state
let translationCache = new Map(); // Cache translations to avoid redundant API calls
let observers = []; // Keep track of all observers for cleanup
let currentUrl = window.location.href;

// Utility function to wait for elements to appear in DOM
function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver((mutations, obs) => {
            const element = document.querySelector(selector);
            if (element) {
                obs.disconnect();
                resolve(element);
            }
        });

        observer.observe(document, {
            childList: true,
            subtree: true
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

// Cleanup function to disconnect all observers
function cleanup() {
    observers.forEach(obs => obs.disconnect());
    observers = [];
}

// Main initialization function
async function initializeExtension() {
    try {
        // Cleanup previous initialization
        cleanup();

        // Wait for subtitle container to be available
        const subtitleContainer = await waitForElement(".ardplayer-untertitel");
        
        // Create subtitle observer
        const observer = new MutationObserver(async (mutations) => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(async (node) => {
                        if (node.nodeType === 1 && node.matches(".ardplayer-untertitel p")) {
                            const subtitleContainer = node.closest("[lang='de-DE']");
                            if (!subtitleContainer) return; // Ensure subtitles are in German

                            if (!node.dataset.translated) {
                                node.dataset.translated = "true";
                                storeSubtitle(node);
                            }
                        }
                    });
                }
            }
        });

        observer.observe(subtitleContainer, { childList: true, subtree: true });
        observers.push(observer);

        // Wait for play/pause button and set up observer
        try {
            const playPauseButton = await waitForElement(".ardplayer-button-playpause", 5000);
            const observerPlayPause = new MutationObserver(checkAndShowSubtitles);
            observerPlayPause.observe(playPauseButton, { attributes: true, attributeFilter: ["class"] });
            observers.push(observerPlayPause);
        } catch (error) {
            console.warn("Play/pause button not found, continuing without it:", error);
        }

        console.log("Bilingual ARD extension initialized successfully");
    } catch (error) {
        console.error("Failed to initialize Bilingual ARD extension:", error);
        // Retry after a delay
        setTimeout(() => {
            console.log("Retrying extension initialization...");
            initializeExtension();
        }, 2000);
    }
}

// Helper functions
function storeSubtitle(originalP) {
    let text = originalP.innerText.trim().replace(/\n/g, ' '); // Replace new lines with spaces
    if (!text) return;

    if (!translationCache.has(text)) {
        translationCache.set(text, null); // Placeholder to avoid duplicate requests
        fetchTranslation(text).then((translatedText) => {
            if (translatedText) {
                translationCache.set(text, translatedText);
                checkAndShowSubtitles();
            }
        });
    }
}

function checkAndShowSubtitles() {
    try {
        const playPauseButton = document.querySelector(".ardplayer-button-playpause");
        const isPaused = playPauseButton && playPauseButton.classList.contains("ardplayer-icon-play");
        if (isPaused) {
            showStoredSubtitle();
        }
    } catch (error) {
        console.error("Error checking play/pause state:", error);
    }
}

function showStoredSubtitle() {
    try {
        const subtitleElements = document.querySelectorAll(".ardplayer-untertitel p");
        if (!subtitleElements.length) return;
        
        subtitleElements.forEach((originalP) => {
            if (!originalP.parentNode) return; // Skip if element is detached
            
            let text = originalP.innerText.trim().replace(/\n/g, ' ');
            let translatedText = translationCache.get(text);
            if (!translatedText) return;

            let translatedP = originalP.parentNode.querySelector(".translated-subtitle");
            if (!translatedP) {
                translatedP = document.createElement("p");
                translatedP.className = "translated-subtitle";
                originalP.parentNode.insertBefore(translatedP, originalP); // Insert above original subtitle
            }

            translatedP.innerText = translatedText;
            translatedP.style.display = "block";
        });
    } catch (error) {
        console.error("Error displaying subtitles:", error);
    }
}

async function fetchTranslation(text) {
    try {
        const response = await fetch(
            "https://translate.googleapis.com/translate_a/single?client=gtx&sl=de&tl=en&dt=t&q=" +
            encodeURIComponent(text)
        );
        const result = await response.json();
        let translatedText = result[0].map((item) => item[0]).join(" ");

        // Convert text to sentence case (first letter capitalized, rest lowercase)
        translatedText = translatedText
            .toLowerCase()
            .replace(/(^\w|\.\s*\w)/g, (match) => match.toUpperCase());

        return translatedText;
    } catch (error) {
        console.error("Translation error:", error);
        return "";
    }
}

// Navigation detection for SPA routing
function setupNavigationDetection() {
    // Listen for browser navigation events
    window.addEventListener('popstate', () => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            setTimeout(initializeExtension, 500); // Delay to let DOM update
        }
    });

    // Monitor URL changes for SPA navigation
    const urlObserver = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            setTimeout(initializeExtension, 500); // Delay to let DOM update
        }
    });

    urlObserver.observe(document, { subtree: true, childList: true });
    observers.push(urlObserver);
}

// Initialize extension when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

// Set up navigation detection
setupNavigationDetection();