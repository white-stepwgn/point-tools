// websocket.js (完全同期版)
// Force global scope variables (attach to window) to avoid 'let' redeclaration issues 
// across multiple script tags or reloads in same context.
window.wsBrowser = null;
window.currentRoomId = null;
window.broadcastKey = null;

function setStatus(text, color = "black") {
    const s = document.getElementById("statusSpan");
    s.textContent = `Status: ${text}`;
    s.style.color = color;
}

async function connectRoom() {
    let roomId = document.getElementById("roomInput").value.trim();
    if (!roomId) return alert("Room ID を入力");

    // URL自動変換ロジック
    // 数字以外が含まれていればURLとみなして変換APIを叩く
    if (!/^\d+$/.test(roomId)) {
        setStatus("URL変換中...", "blue");
        try {
            const res = await fetch(`/convert_url?url=${encodeURIComponent(roomId)}`);
            if (!res.ok) throw new Error("Conversion failed");
            const json = await res.json();
            if (json.room_id) {
                roomId = json.room_id;
                document.getElementById("roomInput").value = roomId; // Update input
                setStatus(`ID変換成功: ${roomId}`, "green");
            } else {
                throw new Error("Room ID not found");
            }
        } catch (e) {
            console.error(e);
            setStatus("URL変換失敗", "red");
            alert("URLからRoom IDを取得できませんでした。\n正しいURLか確認してください。");
            return;
        }
    }

    currentRoomId = roomId;
    setStatus("キー取得中...", "blue");

    // --- 最新 broadcast_key 取得 ---
    const r = await fetch(`/get_broadcast_key?room_id=${roomId}`);
    const json = await r.json();
    if (!json.broadcast_key) {
        setStatus("キー取得失敗 (Room IDが無効か配信停止中)", "red");
        return;
    }

    broadcastKey = json.broadcast_key;
    console.log("broadcast_key=", broadcastKey);

    // --- Node.js (Render) 中継サーバーへ接続 ---
    if (window.wsBrowser) window.wsBrowser.close();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    window.wsBrowser = new WebSocket(`${protocol}//${location.host}/ws`);

    wsBrowser.onopen = () => {
        console.log("Browser → Node WS connected");
        wsBrowser.send(JSON.stringify({ broadcast_key: broadcastKey }));
        setStatus("接続中", "green");

        // 過去ログ取得 (Not implemented in this version, or use startCommentLogPolling if needed)
        // fetchPastLogs(roomId); 
    };

    wsBrowser.onmessage = (event) => {
        let data = event.data;
        // Handle MSG\t protocol
        if (data.startsWith("MSG\t")) {
            data = data.replace(`MSG\t${broadcastKey}\t`, "");
            // Fallback if broadcast key format differs slightly or strictly follows index.html
            data = data.replace(`MSG\t${broadcastKey}`, "");
        }

        try {
            const msg = JSON.parse(data);
            handleIncomingMessage(msg);
        } catch (e) {
            // ACK, ERR, or SUB messages are not JSON
            if (data.startsWith("ACK") || data.startsWith("ERR") || data.startsWith("SUB")) {
                // Ignore control messages
            } else {
                console.warn("Invalid JSON:", data);
            }
        }
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
// window.wsBrowser getter removed to avoid conflict with variable. 
// Use the window.wsBrowser variable directly.
