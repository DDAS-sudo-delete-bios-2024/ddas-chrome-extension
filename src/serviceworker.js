let downloadItems = {};
let popupReady = false;
const queuedMessages = [];
const BACKEND_DOWNLOAD_BASE_URL = "http://localhost:4000/download/from/backend";
const CHROME_EXTENSION_BL0B_BASE_URL = "blob:chrome-extension://";

// Listen for new downloads
chrome.downloads.onCreated.addListener(function (downloadItem) {
    if (downloadItem.url.startsWith(BACKEND_DOWNLOAD_BASE_URL)
        || downloadItem.url.startsWith(CHROME_EXTENSION_BL0B_BASE_URL)) {
        return;
    }

    const currentTime = Date.now();
    const downloadStartTime = new Date(downloadItem.startTime).getTime();

    // check if the download is recent (started in the last 5 seconds)
    if (currentTime - downloadStartTime < 5000) {
        console.log("DownloadItem created:", downloadItem);

        // store the downloadItem object temporarily
        downloadItems[downloadItem.id] = downloadItem;

        // Handle the case where filename might not be available immediately
        if (downloadItem.filename) {
            processDownloadItem(downloadItem);
        } else {
            console.log("Filename not yet available for download ID:", downloadItem.id);
        }
    } else {
        console.log("Ignored old download:", downloadItem.filename);
    }
});

/**
 * listens to downloads changing so that it can get updated filename incase filename wasnt loaded on creation of
 * the download
 */
chrome.downloads.onChanged.addListener(function (delta) {
    if (delta.filename && downloadItems[delta.id]) {
        console.log("Filename updated:", delta.filename.current);

        // update stored downloadItem with the loaded filename
        downloadItems[delta.id].filename = delta.filename.current;
        processDownloadItem(downloadItems[delta.id]);

        // remove the item from the temporary storage
        delete downloadItems[delta.id];
    }
});

/**
 * listen for popup ready message
 */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === "popupReady") {
        popupReady = true;
        console.log("Popup is ready");

        queuedMessages.forEach(msg => {
            chrome.runtime.sendMessage(msg, function (response) {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message:", chrome.runtime.lastError);
                } else {
                    console.log("Response from popup.js:", response);
                }
            });
        });
        queuedMessages.length = 0; // clear the queue
        sendResponse({status: "success"});
    }
    // keeping the channel open by returning true
    return true;
});

function processDownloadItem(downloadItem) {
    console.log("Processing download with filename:", downloadItem.filename);

    // query to check if a tab with the popup is already open
    chrome.tabs.query({ url: chrome.runtime.getURL("popup.html") }, function (tabs) {
        if (tabs.length > 0) {
            // If the tab is already open, update it
            const existingTab = tabs[0];
            chrome.tabs.update(existingTab.id, { active: true });

            // Send the downloadItem data to the existing tab
            chrome.runtime.sendMessage({ action: "downloadItemMessage", data: downloadItem }, function (response) {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message at line 221:", chrome.runtime.lastError);
                } else {
                    console.log("Response from popup.js:", response);
                }
            });
        } else {
            // if popup.html tap is not open, create a new one
            chrome.tabs.create({
                url: chrome.runtime.getURL("popup.html"),
                active: true
            }, function (tab) {
                function onTabUpdatedCallback(tabId, changeInfo, tab) {
                    if (tabId === tab.id && changeInfo.status === 'complete') {
                        chrome.tabs.onUpdated.removeListener(onTabUpdatedCallback);

                        chrome.runtime.sendMessage({
                            action: "downloadItemMessage",
                            data: downloadItem
                        }, function (response) {
                            if (chrome.runtime.lastError) {
                                console.error("Error sending message at line 241:", chrome.runtime.lastError);
                            } else {
                                console.log("Response from popup.js:", response);
                            }
                        });
                    }
                }

                chrome.tabs.onUpdated.addListener(onTabUpdatedCallback);
            });
        }
    });

    cancelDownload(downloadItem.id);

    // notify popup.js that download is blocked
    const message = { action: "downloadBlockedMessage" };
    if (popupReady) {
        chrome.runtime.sendMessage(message, function (response) {
            if (chrome.runtime.lastError) {
                console.error("Error sending message :", chrome.runtime.lastError);
            } else {
                console.log("Response from popup.js:", response);
            }
        });
    } else {
        // Queue the message if popup is not ready
        queuedMessages.push(message);
    }
}

function cancelDownload(downloadId) {
    chrome.downloads.cancel(downloadId, function () {
        if (chrome.runtime.lastError) {
            console.error('Error cancelling download:', chrome.runtime.lastError);
        } else {
            console.log('Download cancelled successfully:', downloadId);
        }
    });
}

// Listen for window removal (close event)
chrome.windows.onRemoved.addListener(function (windowId) {
    if (windowId === popupWindowId) {
        console.log("Popup has been closed.");
        popupReady = false;
        popupWindowId = null;
        queuedMessages.length = 0;
    }
});
