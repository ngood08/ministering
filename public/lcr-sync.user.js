// ==UserScript==
// @name         LCR Ministering Sync Tool
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Syncs ministering assignments and districts from LCR to local Ministering tool.
// @author       You
// @match        https://lcr.churchofjesuschrist.org/ministering*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// ==/UserScript==

(function() {
    'use strict';

    // Create the floating control panel UI
    const container = document.createElement('div');
    container.id = 'lcr-sync-panel';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.width = '280px';
    container.style.backgroundColor = '#2c3e50';
    container.style.color = '#ecf0f1';
    container.style.padding = '15px';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    container.style.zIndex = '99999';
    container.style.fontFamily = 'sans-serif';
    container.style.fontSize = '13px';

    container.innerHTML = `
        <h4 style="margin: 0 0 10px 0; font-size: 15px; border-bottom: 1px solid #34495e; padding-bottom: 5px; color: #fff;">Ministering Sync Tool</h4>
        <div style="margin-bottom: 8px;">
            <label style="display: block; margin-bottom: 3px; color: #bdc3c7;">Server URL:</label>
            <input type="text" id="sync-server-url" value="${localStorage.getItem('sync_server_url') || 'http://localhost:3000'}" style="width: 100%; padding: 4px; box-sizing: border-box; border: none; border-radius: 3px;">
        </div>
        <div style="margin-bottom: 12px;">
            <label style="display: block; margin-bottom: 3px; color: #bdc3c7;">PIN:</label>
            <input type="password" id="sync-pin" value="${localStorage.getItem('sync_pin') || ''}" style="width: 100%; padding: 4px; box-sizing: border-box; border: none; border-radius: 3px;">
        </div>
        <button id="sync-now-btn" style="width: 100%; padding: 8px; background-color: #e67e22; border: none; border-radius: 4px; color: white; font-weight: bold; cursor: pointer;">Sync EQ Assignments</button>
        <div id="sync-status" style="margin-top: 10px; font-weight: bold; color: #bdc3c7;">Ready to sync</div>
    `;

    document.body.appendChild(container);

    document.getElementById('sync-now-btn').addEventListener('click', async () => {
        const serverUrl = document.getElementById('sync-server-url').value.trim();
        const pin = document.getElementById('sync-pin').value.trim();
        const statusEl = document.getElementById('sync-status');

        if (!pin) {
            statusEl.textContent = 'Error: PIN is required!';
            statusEl.style.color = '#e74c3c';
            return;
        }

        // Save preferences
        localStorage.setItem('sync_server_url', serverUrl);
        localStorage.setItem('sync_pin', pin);

        statusEl.textContent = 'Extracting page data...';
        statusEl.style.color = '#f1c40f';

        try {
            const nextDataScript = document.getElementById('__NEXT_DATA__');
            if (!nextDataScript) {
                throw new Error('LCR page data not found. Try refreshing.');
            }

            const data = JSON.parse(nextDataScript.textContent);
            const ministeringData = data?.props?.pageProps?.initialState?.ministeringData;

            if (!ministeringData) {
                throw new Error('LCR ministering data not found. Try refreshing.');
            }

            statusEl.textContent = 'Sending to local server...';

            // Send the entire ministeringData object so the server can inspect it
            GM_xmlhttpRequest({
                method: "POST",
                url: `${serverUrl}/api/sync`,
                headers: {
                    "Content-Type": "application/json",
                    "X-PIN": pin
                },
                data: JSON.stringify({ ministeringData }),
                onload: function(response) {
                    if (response.status === 200) {
                        try {
                            const resObj = JSON.parse(response.responseText);
                            if (resObj.debugKeys) {
                                statusEl.textContent = `Sync Successful! Keys: ${resObj.debugKeys.join(', ')}`;
                            } else {
                                statusEl.textContent = 'Sync Successful!';
                            }
                        } catch(e) {
                            statusEl.textContent = 'Sync Successful!';
                        }
                        statusEl.style.color = '#2ecc71';
                    } else if (response.status === 401) {
                        statusEl.textContent = 'Error: Invalid PIN!';
                        statusEl.style.color = '#e74c3c';
                    } else {
                        statusEl.textContent = `Error: Server returned code ${response.status}`;
                        statusEl.style.color = '#e74c3c';
                    }
                },
                onerror: function(err) {
                    statusEl.textContent = 'Error: Connection blocked. Check server status!';
                    statusEl.style.color = '#e74c3c';
                    console.error(err);
                }
            });

        } catch (err) {
            statusEl.textContent = `Error: ${err.message}`;
            statusEl.style.color = '#e74c3c';
            console.error(err);
        }
    });
})();