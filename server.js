// ===============================
// server.js（Node22 + ESM / Render 配信用）
// ===============================
import express from "express";
import fetch from "node-fetch";
import * as cheerio from 'cheerio';
import path from "path";
import { spawn, exec } from "child_process";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import WebSocket from "ws";

// ESM の __dirname 再現
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Debug Logger
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    next();
});

// JSONボディのパースを有効化
app.use(express.json());

// Cloudflare Proxy Endpoint
app.all('/api/proxy_cf', async (req, res) => {
    const targetUrl = req.query.url || req.body.url;

    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing target URL' });
    }

    try {
        const method = req.method;
        const headers = { 'Content-Type': 'application/json' };

        let options = { method, headers };

        if (method === 'POST' || method === 'PUT') {
            const body = { ...req.body };
            delete body.url;
            options.body = JSON.stringify(body);
        }

        const cfRes = await fetch(targetUrl, options);

        const contentType = cfRes.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            const data = await cfRes.json();
            res.status(cfRes.status).json(data);
        } else {
            const text = await cfRes.text();
            if (text.trim().startsWith('<')) {
                console.log('[Proxy] HTML Response (Access blocked?):', text.substring(0, 200));
            }
            res.status(cfRes.status).send(text);
        }

    } catch (e) {
        console.error('Proxy Error:', e);
        res.status(500).json({ error: e.message });
    }
});

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
        if (profileJson.event) {
            responseData.event = profileJson.event;
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

// ===============================
// ④ ルームURLキーからルームID取得 API (/room_id_by_key)
// ===============================
app.get("/room_id_by_key", async (req, res) => {
    const key = req.query.key;
    if (!key) return res.status(400).json({ error: "key required" });

    try {
        const url = `https://www.showroom-live.com/api/room/status?room_url_key=${key}`;
        const r = await fetch(url);
        const json = await r.json();

        if (json.room_id) {
            res.json({ room_id: json.room_id });
        } else {
            res.status(404).json({ error: "Room ID not found" });
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
// Python Room Event Scraper Endpoint
app.get("/api/room_event_py", async (req, res) => {
    const roomId = req.query.room_id;
    if (!roomId) return res.status(400).json({ error: "room_id required" });

    const { exec } = require('child_process');
    const path = require('path');
    const scriptPath = path.join(__dirname, 'scrape_room_event.py');

    exec(`python "${scriptPath}" "${roomId}"`, { encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[Proxy] Python exec error: ${error.message}`);
            return res.status(500).json({ error: "Python exec failed" });
        }
        try {
            const result = JSON.parse(stdout);
            res.json(result);
        } catch (e) {
            console.error(`[Proxy] Python Parse Error: ${e.message}`);
            res.status(500).json({ error: "Python output parse failed" });
        }
    });
});

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
// Live Polling Proxy (Viewer Count)
// ===============================
// Python Scraper Endpoint
app.get("/api/event_ranking_py", async (req, res) => {
    const urlKey = req.query.url_key;
    if (!urlKey) return res.status(400).json({ error: "url_key required" });

    console.log(`[Proxy] Executing Python scraper for: ${urlKey}`);
    const { exec } = require('child_process');
    const path = require('path');
    const scriptPath = path.join(__dirname, 'scrape_ranking.py');

    exec(`python "${scriptPath}" "${urlKey}"`, { encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[Proxy] Python exec error: ${error.message}`);
            return res.status(500).json({ error: "Python exec failed" });
        }
        try {
            const result = JSON.parse(stdout);
            // Python script returns { ranking: [...] } or { error: ... }
            res.json(result);
        } catch (e) {
            console.error(`[Proxy] Python Parse Error: ${e.message}`);
            res.status(500).json({ error: "Python output parse failed" });
        }
    });
});

app.get("/api/live_polling", async (req, res) => {
    const roomId = req.query.room_id;
    if (!roomId) return res.status(400).json({ error: "room_id required" });

    try {
        const url = `https://www.showroom-live.com/api/live/polling?room_id=${roomId}`;
        const r = await fetch(url);

        if (!r.ok) {
            console.error(`[Proxy] live_polling fetch error: ${r.status}`);
            return res.status(r.status).json({ error: `Upstream error ${r.status}` });
        }

        const json = await r.json();
        res.json(json);
    } catch (e) {
        console.error("[Proxy] live_polling error:", e);
        res.status(500).json({ error: "Failed to fetch polling data" });
    }
});

// ===============================
// Feature: Event Ranking Proxy
// ===============================
app.get("/api/event_ranking", async (req, res) => {
    const eventId = req.query.event_id;
    const urlKey = req.query.url_key; // Added for scraping fallback

    const blockId = req.query.block_id;

    if (!eventId) return res.status(400).json({ error: "event_id required" });

    try {
        let url = `https://www.showroom-live.com/api/event/ranking?event_id=${eventId}`;
        if (blockId) {
            url += `&block_id=${blockId}`;
            console.log(`[Proxy] Using block_id for main ranking: ${blockId}`);
        }
        console.log(`[Proxy] Fetching event ranking: ${url}`);
        const r = await fetch(url);

        if (!r.ok) {
            console.error(`[Proxy] event_ranking fetch error: ${r.status}`);

            // Fallback: Scrape Web Page if API fails (404) and url_key is available
            if (r.status === 404 && urlKey) {
                console.log(`[Proxy] Attempting scrape fallback for: ${urlKey}`);
                const pageUrl = `https://www.showroom-live.com/event/${urlKey}`;
                const pageRes = await fetch(pageUrl);
                if (!pageRes.ok) {
                    return res.status(r.status).json({ error: `Upstream error ${r.status} & Scrape failed` });
                }
                const html = await pageRes.text();

                // Simple Regex Scraping based on user provided HTML
                const ranking = [];
                // Find all list items
                // This is rough parsing, assuming standard layout
                // Regex to capture: rank, room_id, name. Point is likely missing.

                // Pattern: <li ... is-rank-(\d+) ... data-room-id="(\d+)" ... listcardinfo-main-text ...>NAME</h4>
                // Since HTML is nested, we might need a global match or split by <li>

                // Split by "contentlist-row" to isolate items
                const items = html.split('class="contentlist-row"');
                items.shift(); // Remove content before first item

                items.forEach(item => {
                    const rankMatch = item.match(/is-rank-(\d+)/);
                    const idMatch = item.match(/data-room-id="(\d+)"/);

                    // Name from h4 OR img alt
                    let nameMatch = item.match(/listcardinfo-main-text[^>]*>([\s\S]*?)<\//);
                    let roomName = nameMatch ? nameMatch[1].trim() : '';

                    if (!roomName) {
                        const altMatch = item.match(/img-main"[^>]*alt="([^"]+)"/);
                        if (altMatch) roomName = altMatch[1];
                    }

                    // URL key from href (e.g. /r/username)
                    const urlMatch = item.match(/href="\/r\/([^"]+)"/);
                    const urlKey = urlMatch ? urlMatch[1] : '';

                    if (rankMatch && idMatch && roomName) {
                        ranking.push({
                            rank: parseInt(rankMatch[1]),
                            point: 0,
                            room: {
                                room_id: parseInt(idMatch[1]),
                                room_name: roomName,
                                url_key: urlKey
                            }
                        });
                    }
                });

                if (ranking.length > 0) {
                    console.log(`[Proxy] Scraped ${ranking.length} items.`);
                    return res.json({ ranking: ranking });
                }
            }

            return res.status(r.status).json({ error: `Upstream error ${r.status}` });
        }

        const json = await r.json();
        res.json(json);
    } catch (e) {
        console.error("[Proxy] event_ranking error:", e);
        res.status(500).json({ error: "Failed to fetch event ranking" });
    }
});

// New Endpoint for Pattern B Ranking (Detailed/Block Ranking)
app.get('/api/events_ranking', async (req, res) => {
    const eventId = req.query.event_id;
    const roomId = req.query.room_id;
    const blockId = req.query.block_id;
    const urlKey = req.query.url_key; // Added for scraping fallback

    if (!eventId) return res.status(400).json({ error: "event_id required" });

    try {
        // Attempt 0: Block ranking API (Priority if blockIs exists)
        if (blockId) {
            let urlBlock = `https://www.showroom-live.com/api/event/block_ranking?event_id=${eventId}&page=1&block_id=${blockId}`;
            console.log(`[Proxy] Fetching block ranking (Priority): ${urlBlock}`);
            const r0 = await fetch(urlBlock);
            if (r0.ok) {
                const data = await r0.json();
                if (data.block_ranking_list && data.block_ranking_list.length > 0) {
                    return res.json(data);
                }
            }
        }

        // Attempt 1: Standard event ranking API
        let urlRanking = `https://www.showroom-live.com/api/event/ranking?event_id=${eventId}${roomId ? "&room_id=" + roomId : ""}`;
        if (blockId) {
            // Some events might accept block_id in standard api too?
            urlRanking += `&block_id=${blockId}`;
        }
        console.log(`[Proxy] Fetching standard ranking: ${urlRanking}`);
        const r1 = await fetch(urlRanking);

        if (r1.ok) {
            const data = await r1.json();
            if (data.ranking && data.ranking.length > 0) return res.json(data);
            // If block event, sometimes standard API returns empty ranking but 200 OK.
        }

        // Attempt 2: Events ranking API (Older style but used for some events)
        const urlEvents = `https://www.showroom-live.com/api/events/${eventId}/ranking${roomId ? "?room_id=" + roomId : ""}`;
        console.log(`[Proxy] Fetching events ranking fallback: ${urlEvents}`);
        const r2 = await fetch(urlEvents);

        if (r2.ok) {
            const data = await r2.json();
            if (data.ranking || data.block_ranking_list) return res.json(data);
        }

        // Attempt 3: Block ranking API (Fallback if blockId was not provided initially or failed)
        // If we already tried blockId in attempt 0, we can skip or try without block_id if that makes sense (unlikely).
        if (!blockId) {
            let urlBlock = `https://www.showroom-live.com/api/event/block_ranking?event_id=${eventId}&page=1`;
            console.log(`[Proxy] Fetching block ranking fallback (No ID): ${urlBlock}`);
            const r3 = await fetch(urlBlock);
            if (r3.ok) {
                const data = await r3.json();
                return res.json(data);
            }
        }

        // Attempt 4: Scraping Fallback (last resort for Quest events etc)
        if (urlKey) {
            console.log(`[Proxy] Attempting scrape fallback for: ${urlKey}`);
            const pageUrl = `https://www.showroom-live.com/event/${urlKey}`;
            const pageRes = await fetch(pageUrl);
            if (pageRes.ok) {
                const html = await pageRes.text();

                // Simple Regex Scraping based on standard layout
                const ranking = [];
                // Quest event ranking structure usually has data-room-id

                const items = html.split('data-room-id="');
                items.shift(); // remove header

                items.forEach((chunk, index) => {
                    const idMatch = chunk.match(/^(\d+)"/);
                    if (!idMatch) return;
                    const roomId = parseInt(idMatch[1]);

                    // Extract Name
                    let name = "Unknown";
                    const nameMatch = chunk.match(/alt="([^"]+)"/);
                    if (nameMatch) name = nameMatch[1];
                    else {
                        const nameMatch2 = chunk.match(/listcardinfo-main-text[^>]*>([\s\S]*?)<\//);
                        if (nameMatch2) name = nameMatch2[1].trim();
                    }

                    // Extract Rank
                    const rank = index + 1;

                    // Point
                    let point = 0;
                    const pointMatch = chunk.match(/(\d{1,3}(,\d{3})*)\s*pt/); // 1,234 pt
                    if (pointMatch) point = parseInt(pointMatch[1].replace(/,/g, ''));

                    ranking.push({
                        rank: rank,
                        point: point,
                        room: {
                            room_id: roomId,
                            room_name: name
                        }
                    });
                });

                if (ranking.length > 0) {
                    console.log(`[Proxy] Scraped ${ranking.length} items.`);
                    return res.json({ ranking: ranking });
                }
            }
        }

        // All failed
        res.status(404).json({ error: "Ranking data not found in all attempts" });
    } catch (e) {
        console.error("[Proxy] events_ranking error:", e);
        res.status(500).json({ error: "Failed to fetch detailed event ranking" });
    }
});

// ===============================
// Feature: Scrape Campaign Ranking
app.get('/api/campaign_ranking', async (req, res) => {
    try {
        const url = 'https://public-api.showroom-cdn.com/season_award_ranking/67?limit=100';
        console.log(`Fetching API: ${url}`);

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const data = await response.json();

        if (!data.ranking_list) {
            console.log('No ranking_list found in response');
            return res.json([]);
        }

        const rankings = data.ranking_list.map(item => ({
            room_id: item.room_id,  // Add room_id for entry tracking
            rank: item.rank,
            name: item.room ? item.room.name : 'Unknown',
            points: item.score,
            url: item.room && item.room.url_key ? `https://www.showroom-live.com/${item.room.url_key}` : null
        }));

        // Sort just in case
        rankings.sort((a, b) => a.rank - b.rank);

        res.json(rankings);
    } catch (error) {
        console.error('Scraping error:', error);
        res.status(500).json({ error: 'Failed to fetch ranking' });
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

// 同時接続数管理
let currentAdminNotice = ""; // 管理者からのお知らせを保持

function broadcastConnectionCount() {
    if (!wss) return;
    const count = wss.clients.size;
    const msg = JSON.stringify({ type: 'connection_count', count: count });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

function broadcastAdminNotice(notice) {
    currentAdminNotice = notice;
    const msg = JSON.stringify({ type: 'admin_notice', notice: notice });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

// APIでも取得できるようにする
app.get("/api/server_status", (req, res) => {
    res.json({ connection_count: wss ? wss.clients.size : 0 });
});

// ===============================
// Feature: Avatar Search API
// ===============================
app.get("/api/search_avatar", async (req, res) => {
    const avatarId = req.query.avatar_id;
    if (!avatarId) return res.status(400).json({ error: "avatar_id required" });

    const scriptPath = path.join(__dirname, 'search_avatar.py');

    // --json フラグを使用してJSON出力を要求
    exec(`python "${scriptPath}" "${avatarId}" --json`, { encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[AvatarSearch] Python exec error: ${error.message} / ${stderr}`);
            // Pythonスクリプト自体がエラーをJSONで返している可能性があるため、stdoutをチェック
            // 致命的なエラー以外は続行を試みる
        }
        try {
            // stdoutからJSONをパース
            const result = JSON.parse(stdout);
            res.json(result);
        } catch (e) {
            console.error(`[AvatarSearch] Python Parse Error: ${e.message} \nSTDOUT: ${stdout}`);
            res.status(500).json({ error: "Python output parse failed", details: stdout });
        }
    });
});

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
            // 管理者からのお知らせ送信リクエスト
            else if (data.type === 'send_admin_notice') {
                console.log("[Proxy] Broadcasting admin notice:", data.notice);
                broadcastAdminNotice(data.notice);
            }

        } catch (e) {
            console.log("Browser msg parse error:", e.message);
        }
    });

    // 接続時にカウントとお知らせを通知
    broadcastConnectionCount();
    if (currentAdminNotice) {
        clientSocket.send(JSON.stringify({ type: 'admin_notice', notice: currentAdminNotice }));
    }

    clientSocket.on("close", () => {
        console.log("Browser disconnected");
        isAlive = false;
        clearInterval(hbInterval);
        clearTimeout(reconnectTimer);
        if (upstreamWS) {
            try { upstreamWS.close(); } catch { }
        }
        // 切断時にカウントを通知
        broadcastConnectionCount();
    });

    clientSocket.on("error", (e) => {
        console.log("Browser socket error:", e.message);
    });
});

