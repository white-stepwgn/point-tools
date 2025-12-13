
const https = require('https');
const WebSocket = require('ws');

const roomId = 352277;
const serverUrl = 'http://localhost:3000/room_profile?room_id=' + roomId;

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const http = url.startsWith('https') ? require('https') : require('http');
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function connect(name, url, key) {
    return new Promise((resolve) => {
        console.log(`[${name}] Connecting to ${url}...`);
        const ws = new WebSocket(url, {
            origin: 'https://www.showroom-live.com'
        });

        ws.on('open', () => {
            console.log(`[${name}] Open. Sending SUB...`);
            ws.send('SUB\t' + key);
        });

        ws.on('message', (data) => {
            console.log(`[${name}] MSG: ${data.toString().substring(0, 50)}...`);
            if (data.toString().startsWith("ACK")) {
                console.log(`[${name}] SUCCESS!`);
                ws.close();
                resolve(true);
            }
        });

        ws.on('error', (e) => {
            console.error(`[${name}] Error:`, e.message);
            resolve(false);
        });

        setTimeout(() => {
            console.log(`[${name}] Timeout.`);
            ws.terminate();
            resolve(false);
        }, 5000);
    });
}

async function test() {
    try {
        const json = await fetchJson(serverUrl);
        if (!json.broadcast_key) {
            console.log("No key.");
            return;
        }
        const key = json.broadcast_key;
        console.log("Key:", key);

        // Test 1: No Param (Index.html style)
        await connect("TEST1-NoParam", "wss://online.showroom-live.com", key);

        // Test 2: With Param
        await connect("TEST2-WithParam", `wss://online.showroom-live.com/?bcsvr_key=${key}`, key);

    } catch (e) {
        console.error(e);
    }
}

test();
