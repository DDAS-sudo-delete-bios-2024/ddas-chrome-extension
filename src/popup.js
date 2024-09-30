document.addEventListener('DOMContentLoaded', function () {
    console.log("popup loaded and ready");
    // notify serviceworker that popup is ready
    chrome.runtime.sendMessage({ action: "popupReady" });
    chrome.downloads.search({}, addDownloadsToDownloadList);
});

// the download on which all operations are to be done
let currDownload = undefined;
const BACKEND_BASE_URL = "http://localhost:4000";
const BACKEND_DOWNLOAD_BASE_URL = "http://localhost:4000/download/from/backend";

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.action === "downloadBlockedMessage") {
        showBlockedMessage();
        console.log("got download blocked message at popup.js");
    } else if (message.action === "downloadItemMessage") {
        currDownload = message.data;
        console.log("download item got at popup.js : ", currDownload);
    }
    sendResponse({status: "success"});
    // return true to keep the message channel open for sendResponse
    return true;
});

document.getElementById("check-hash-btn").addEventListener("click", async function() {
    const fetchHashContainer = document.getElementById("hash-fetch-container");
    // remove any prev error related suggestion
    fetchHashContainer.classList.remove("hash-fetch-container-error")
    try {
        const response = await fetch(BACKEND_BASE_URL + "/checkExistance", {
            method: 'POST',
            headers: {
                // set content type as json else body will be received as empty at chrome-extension-backend
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(currDownload)
        });

        // Parse the response as JSON
        const data = await response.json();
        console.log("response for check exists : ", data);

        // Update the DOM based on the response
        if (data.available === "true") {
            fetchHashContainer.classList.add("hash-fetch-container-success");
            document.getElementById("internal-availability-info-container").textContent = `File is available in the server.
                Use the button below to directly download from the server.`;
            document.getElementById("fetch-btn").innerText = "Download";
        } else {
            fetchHashContainer.classList.add("hash-fetch-container-error");
            document.getElementById("internal-availability-info-container").textContent = `File is not available in the server.
                Use the button below to fetch it to the server first.`;
        }

        // chow the fetch button and hide the verify button
        document.getElementById("internal-availability-info-container").classList.remove('hidden');
        document.getElementById("fetch-btn-container").classList.remove("hidden");
        document.getElementById("check-hash-btn-container").classList.add("hidden");

    } catch (error) {
        console.error("Error checking file existence:", error);
        document.getElementById("internal-availability-message").textContent = `An error occurred: ${error.message}`;
    }
});

document.getElementById('fetch-btn').addEventListener('click', function () {
    document.getElementById("internal-availability-info-container").classList.add('hidden');

    // if fetch button contains the text 'download' in it instead of fetch, directly download from backend
    if (document.getElementById('fetch-btn').innerText === "Download") {
        console.log("clicked download button");
        downloadFromBackend();
        return;
    }

    console.log("clicked fetch button");
    newProgressBar();

    console.log("curr download " + currDownload);
    /**
     * other components of downloadItem
     */
    // console.log("Filename:", currDownload.filename);
    // console.log("URL:", currDownload.url);
    // console.log("File size (bytes):", currDownload.fileSize);
    // console.log("ID:", currDownload.id);
    // console.log("State:", currDownload.state);
    // console.log("Date Added:", currDownload.dateAdded);
    // console.log("Start Time:", currDownload.startTime);
    // console.log("End Time:", currDownload.endTime);
    // console.log("Mime Type:", currDownload.mime);

    // details used by backend to download from dataset provider website
    let downloadDetails = {
        url: currDownload.url,
        fileName: currDownload.filename.split('/').pop(), // only give file name not full path
        mime: currDownload.mime,
        totalBytes : currDownload.fileSize
    };

    // websocket to communicate with backend about progress of download at the backend
    let socket = new WebSocket('ws://localhost:4000');

    socket.onopen = function(event) {
        console.log('WebSocket connection established');

        // Step 3: Make the fetch request after WebSocket connection is open
        //? this fetch is about progress of fetching to chrome-extension-backend
        const url = BACKEND_BASE_URL + "/downloadFile";
        fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: {"content-type": "application/json"},
            body: JSON.stringify(downloadDetails)
        })
        .then(response => response.json())
        .then(data => {
            console.log("got below from chrome-extension-backend");
            console.log(data);
        })
        .catch(error => {
            console.log(error);
            document.getElementById('progress-bar').hidden = true;
            document.getElementById('progress-text').hidden = true;
        });
    };

    // messages about download progress at backend
    socket.onmessage = function(event) {
        let data = JSON.parse(event.data);
        document.getElementById('progress-bar').value = data.progress;

        if (data.progress === "100.00") {
            document.getElementById('progress-text').textContent = `Fetching to local server complete`;
            showSuccessMessage();
            downloadFromBackend();
        } else {
            document.getElementById('progress-text').textContent = `${data.progress}% Downloaded`;
        }
    };

    socket.onerror = function(error) {
        console.log('WebSocket Error:', error);
    };

    socket.onclose = function(event) {
        console.log('WebSocket connection closed');
    };
});

//? functions ==========================================================================================================
/**
 * Downloads the currDownload item directly from chrome-extension-backend
 */
function downloadFromBackend() {
    const url = BACKEND_DOWNLOAD_BASE_URL + "/" + currDownload.filename.split('/').pop();
    console.log("Fetching from chrome-extension-backend at URL: " + url);

    fetch(url, {
        method: 'GET',
        mode: 'cors',
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok ' + response.statusText);
            }
            // create a Blob from the response
            return response.blob();
        })
        .then(blob => {
            const link = document.createElement('a');
            // Create a URL for the Blob
            const url = window.URL.createObjectURL(blob);
            link.href = url;
            link.download = currDownload.filename.split('/').pop();
            document.body.appendChild(link);
            link.click();  // simulate a click to trigger the download
            link.remove(); // clean up by removing the link
            window.URL.revokeObjectURL(url);
            console.log("File download initiated successfully");
        })
        .catch(error => {
            console.error("Error fetching from chrome-extension-backend:", error);
        });
}

function showBlockedMessage() {
    document.getElementById('message-wrapper').classList.remove('hidden');
    document.getElementById('blocked-download-message').classList.remove('hidden');
    document.getElementById('success-message').classList.add('hidden');
}

function showSuccessMessage() {
    document.getElementById('message-wrapper').classList.remove('hidden');
    document.getElementById('blocked-download-message').classList.add('hidden');
    document.getElementById('success-message').classList.remove('hidden');
}

function newProgressBar() {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';

    const fileLabel = document.createElement('label');
    fileLabel.className = 'file-label';
    fileLabel.textContent = currDownload.filename.split('/').pop(); // Display the filename

    const progressBar = document.createElement('progress');
    progressBar.value = 0;
    progressBar.max = 100;
    progressBar.id = 'progress-bar';
    progressBar.className = 'progress-bar';

    const progressText = document.createElement('span');
    progressText.id = 'progress-text';
    progressText.className = 'progress-text';
    progressText.textContent = '0%';

    progressContainer.appendChild(fileLabel);
    progressContainer.appendChild(progressBar);
    progressContainer.appendChild(progressText);

    const progressDiv = document.getElementById('progress-div');

    progressDiv.appendChild(progressContainer);
    progressDiv.appendChild(document.createElement('br'));
    progressDiv.appendChild(document.createElement('br'));
}

function addDownloadsToDownloadList(items) {
    const downloadList = document.getElementById('download-list');

    if (items.length === 0) {
        downloadList.innerHTML = '<p>No recent downloads.</p>';
    } else {
        const table = document.createElement('table');
        table.className = 'download-table';
        table.innerHTML = `
                <thead>
                    <tr>
                        <th>Filename</th>
                        <th>URL</th>
                        <th>File Size (bytes)</th>
                        <th>State</th>
                    </tr>
                </thead>
                <tbody></tbody>
            `;
        const tbody = table.querySelector('tbody');

        items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                    <td class="filename">
                        <img src="https://img.icons8.com/material-outlined/24/000000/file.png" class="file-icon" />
                        ${item.filename.split('/').pop()}
                    </td>
                    <td class="url"><a href="${item.url}" target="_blank">${item.url}</a></td>
                    <td class="file-size">${item.fileSize}</td>
                    <td class="state">${item.state}</td>
                `;
            tbody.appendChild(row);
        });

        downloadList.appendChild(table);
    }
}