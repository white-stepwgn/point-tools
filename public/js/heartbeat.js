// heartbeat.js
let hbTimer = null;

function startHeartbeat() {
    if (hbTimer) clearInterval(hbTimer);

    hbTimer = setInterval(() => {
        const ws = window.wsBrowser();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "hb", t: Date.now() }));
        }
    }, 10000); // 10秒
}

startHeartbeat();
