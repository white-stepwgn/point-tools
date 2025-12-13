
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

async function test() {
    console.log(`1. Fetching profile from ${serverUrl}...`);
    try {
        const json = await fetchJson(serverUrl);
        console.log('Profile Response:', JSON.stringify(json, null, 2));

        if (!json.broadcast_key) {
            console.error('No broadcast_key found in response!');
            return;
        }

        const key = json.broadcast_key;
        console.log(`2. connecting to WS with key: ${key}`);

        const ws = new WebSocket('wss://online.showroom-live.com');

        ws.on('open', () => {
            console.log('WS Open. Sending SUB...');
            ws.send('SUB\t' + key);
        });

        ws.on('message', (data) => {
            console.log('WS Message received:', data.toString().substring(0, 100) + '...');
            if (data.toString().startsWith("ACK") || data.toString().startsWith("MSG")) {
                console.log("SUCCESS: Connected and receiving data.");
                ws.close();
                process.exit(0);
            }
        });

        ws.on('error', (e) => {
            console.error('WS Error:', e);
            process.exit(1);
        });

        ws.on('close', () => {
            console.log('WS Closed');
        });

        setTimeout(() => {
            console.log('Timeout waiting for response.');
            ws.close();
            process.exit(1);
        }, 10000);

    } catch (e) {
        console.error('Test failed:', e);
    }
}

test();
