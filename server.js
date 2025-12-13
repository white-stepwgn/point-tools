
// ===============================
// server.js（Node22 + ESM / Render 配信用）
// ===============================
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import WebSocket from "ws";

// ESM の __dirname 再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// -------------------------------
// public フォルダ配信
// -------------------------------
app.use(express.static(path.join(__dirname, "public")));

// デフォルト HTML
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public/sr_live.html"));
});

// ===============================
// ① broadcast_key 取得 API
// ===============================
app.get("/get_broadcast_key", async (req, res) => {
    const roomId = req.query.room_id;
    if (!roomId) return res.status(400).json({ error: "room_id required" });

    try {
        const apiUrl = `https://www.showroom-live.com/api/live/live_info?room_id=${roomId}`;
        const r = await fetch(apiUrl);
        const json = await r.json();

        if (json.bcsvr_key) res.json({ broadcast_key: json.bcsvr_key });
        else res.status(404).json({ error: "broadcast_key not found" });
    } catch (err) {
        res.status(500).json({ error: err.toString() });
    }
});

// ===============================
// ② 過去コメント取得 API (/comment_log)
// ===============================
app.get("/comment_log", (req, res) => {
    const roomId = (req.query.room_id || "").trim();
    if (!roomId) return res.status(400).json({ error: "room_id required" });

    const pythonProcess = spawn('python', ['fetch_comment_log.py', roomId]);

    let dataString = '';
    let errorString = '';

    pythonProcess.stdout.on('data', (data) => {
        dataString += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
        errorString += data.toString();
    });

    pythonProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Python script exited with code ${code}: ${errorString}`);
            return res.status(500).json({ error: "Python script failed", details: errorString });
        }

        try {
            const json = JSON.parse(dataString);
            if (json.error) {
                if (json.error.includes("HTTP 404")) {
                    return res.status(404).json(json);
                }
                return res.status(500).json(json);
            }
            res.json(json);
        } catch (e) {
            console.error("Failed to parse Python output:", e, dataString);
            res.status(500).json({ error: "Invalid JSON from Python script", details: e.toString() });
        }
    });
});

// ===============================
// ③ ルームプロフィール取得 API (/room_profile)
// ===============================
app.get("/room_profile", async (req, res) => {
    const roomId = req.query.room_id;
    if (!roomId) return res.status(400).json({ error: "room_id required" });

    try {
        // Fetch room profile
        const profileUrl = `https://www.showroom-live.com/api/room/profile?room_id=${roomId}`;
        const profileRes = await fetch(profileUrl);
        const profileJson = await profileRes.json();

        const responseData = {};
        if (profileJson.current_live_started_at) {
            responseData.current_live_started_at = profileJson.current_live_started_at;
        }
        if (profileJson.room_name) {
            responseData.room_name = profileJson.room_name;
        }

        // Also fetch broadcast_key from live_info API
        try {
            const liveInfoUrl = `https://www.showroom-live.com/api/live/live_info?room_id=${roomId}`;
            const liveInfoRes = await fetch(liveInfoUrl);
            const liveInfoJson = await liveInfoRes.json();

            if (liveInfoJson.bcsvr_key) {
                responseData.broadcast_key = liveInfoJson.bcsvr_key;
            }
        } catch (liveInfoErr) {
            // If live_info fails (e.g., room is offline), continue without broadcast_key
            console.log(`[room_profile] Could not fetch broadcast_key for room ${roomId}:`, liveInfoErr.message);
        }

        if (Object.keys(responseData).length > 0) {
            res.json(responseData);
        } else {
            res.status(404).json({ error: "data not found" });
        }
    } catch (e) {
        res.status(500).json({ error: e.toString() });
    }
});

app.get("/gift_list", async (req, res) => {
    const roomId = (req.query.room_id || "").trim();
    if (!roomId) return res.status(400).json({ error: "room_id required" });

    try {
        const url = `https://www.showroom-live.com/api/live/gift_list?room_id=${roomId}`;
        console.log(`[Proxy] Fetching gift_list: ${url}`);
        const r = await fetch(url);
        console.log(`[Proxy] gift_list response: ${r.status}`);
        const json = await r.json();
        res.json(json);
    } catch (e) {
        console.error(`[Proxy] gift_list error:`, e);
        res.status(500).json({ error: e.toString() });
    }
});

// ===============================
// Event Points Proxy
// ===============================
app.get("/api/event_points", async (req, res) => {
    const roomId = req.query.room_id;
    if (!roomId) return res.status(400).json({ error: "room_id required" });

    try {
        const url = `https://www.showroom-live.com/api/room/event_and_support?room_id=${roomId}`;
        const r = await fetch(url);
        const json = await r.json();
        res.json(json);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to fetch event data" });
    }
});

// ===============================
// URL to Room ID Converter
// ===============================
app.get("/convert_url", async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: "url required" });

    try {
        console.log(`[Convert] Processing: ${targetUrl}`);

        // CASE 1: Fan Room URL (contains room_id)
        // https://www.showroom-live.com/room/fan_club?room_id=516805
        if (targetUrl.includes("room_id=")) {
            const match = targetUrl.match(/room_id=(\d+)/);
            if (match && match[1]) {
                return res.json({ room_id: match[1] });
            }
        }

        // CASE 2: Live Room URL (e.g. /r/accountname or just /accountname)
        // Need to fetch and extract room_id
        const r = await fetch(targetUrl);
        const text = await r.text();

        // Extract room_id from content
        // Pattern: "room_id":123456  or  content="k=room_id&amp;v=123456"
        // Let's try simple regex for json data often found in body

        // Search for property="al:android:url" content="showroom:///room?room_id=516805"
        // or similar meta tags or URL params in href
        const metaMatch = text.match(/room_id=(\d+)/);
        if (metaMatch && metaMatch[1]) {
            return res.json({ room_id: metaMatch[1] });
        }

        // Search for room_id = 12345 (Variable assignment)
        const idMatch2 = text.match(/room_id\s*=\s*(\d+)/);
        if (idMatch2 && idMatch2[1]) {
            return res.json({ room_id: idMatch2[1] });
        }

        // Search for "room_id":12345 (JSON)
        // Moved to last priority because it can match obfuscated keys (e.g. "room_id":25)
        const idMatch = text.match(/"room_id":(\d+)/);
        if (idMatch && idMatch[1]) {
            return res.json({ room_id: idMatch[1] });
        }

        res.status(404).json({ error: "Could not extract room_id" });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Conversion failed" });
    }
});



// ===============================
// HTTP Server 起動
// ===============================
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// ===============================
// WebSocket Relay（Browser → Node → Showroom）
// ===============================
const wss = new WebSocketServer({ server, path: "/ws" });

// ===============================
// ⑥ ブラウザ WS 接続処理 (Per-Client Proxy)
// ===============================
wss.on("connection", (clientSocket) => {
    console.log("Browser connected");

    let upstreamWS = null;
    let currentKey = null;
    let reconnectTimer = null;
    let isAlive = true;

    // Heartbeat for this client
    const hbInterval = setInterval(() => {
        if (clientSocket.readyState === WebSocket.OPEN) {
            clientSocket.send(JSON.stringify({ hb: Date.now() }));
        }
    }, 10000);

    // Function to connect/reconnect to Showroom
    const connectUpstream = (key) => {
        if (!key) return;
        if (upstreamWS) {
            try { upstreamWS.close(); } catch { }
        }

        const url = "wss://online.showroom-live.com";
        console.log(`[Proxy] Connecting to upstream for key: ${key.substring(0, 8)}...`);

        upstreamWS = new WebSocket(url);

        upstreamWS.on("open", () => {
            console.log(`[Proxy] Upstream open. Sending SUB.`);
            upstreamWS.send("SUB\t" + key);
        });

        upstreamWS.on("message", (msg) => {
            // Forward UPSTREAM -> CLIENT
            if (clientSocket.readyState === WebSocket.OPEN) {
                clientSocket.send(msg.toString());
            }
        });

        upstreamWS.on("close", () => {
            if (isAlive) {
                console.log(`[Proxy] Upstream closed. Reconnecting in 3s...`);
                clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(() => connectUpstream(key), 3000);
            }
        });

        upstreamWS.on("error", (err) => {
            console.log(`[Proxy] Upstream error:`, err.message);
        });
    };

    clientSocket.on("message", (msg) => {
        try {
            const data = JSON.parse(msg);

            // Client requests connection to a room
            if (data.broadcast_key) {
                currentKey = data.broadcast_key;
                connectUpstream(currentKey);
            }
            // Client sends PING or other control messages
            else if (data.type === 'ping') {
                // Respond or ignore (heartbeat handles keepalive)
            }

        } catch (e) {
            console.log("Browser msg parse error:", e.message);
        }
    });

    clientSocket.on("close", () => {
        console.log("Browser disconnected");
        isAlive = false;
        clearInterval(hbInterval);
        clearTimeout(reconnectTimer);
        if (upstreamWS) {
            try { upstreamWS.close(); } catch { }
        }
    });

    clientSocket.on("error", (e) => {
        console.log("Browser socket error:", e.message);
    });
});

