// websocket.js (完全同期版)
let wsBrowser = null;
let currentRoomId = null;
let broadcastKey = null;

function setStatus(text, color = "black") {
    const s = document.getElementById("statusSpan");
    s.textContent = `Status: ${text}`;
    s.style.color = color;
}

async function connectRoom() {
    const roomId = document.getElementById("roomInput").value.trim();
    if (!roomId) return alert("Room ID を入力");

    currentRoomId = roomId;
    setStatus("キー取得中...", "blue");

    // --- 最新 broadcast_key 取得 ---
    const r = await fetch(`/get_broadcast_key?room_id=${roomId}`);
    const json = await r.json();
    if (!json.broadcast_key) {
        setStatus("キー取得失敗", "red");
        return;
    }

    broadcastKey = json.broadcast_key;
    console.log("broadcast_key=", broadcastKey);

    // --- Node.js (Render) 中継サーバーへ接続 ---
    if (wsBrowser) wsBrowser.close();

    wsBrowser = new WebSocket(`wss://${location.host}/ws`);

    wsBrowser.onopen = () => {
        console.log("Browser → Node WS connected");
        wsBrowser.send(JSON.stringify({ broadcast_key: broadcastKey }));
        setStatus("接続中", "green");

        // 過去ログ取得
        fetchPastLogs(roomId);
    };

    wsBrowser.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleIncomingMessage(msg);
    };

    wsBrowser.onclose = () => {
        console.log("Browser WS closed → retrying...");
        setStatus("再接続中...", "blue");
        setTimeout(() => connectRoom(), 3000);
    };

    wsBrowser.onerror = () => {
        setStatus("エラー", "red");
    };
}

window.connectRoom = connectRoom;
window.wsBrowser = () => wsBrowser;
