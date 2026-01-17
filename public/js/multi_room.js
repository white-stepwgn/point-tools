
// Settings
const MAX_RANKING = 5;

// Test Gift Point Settings (Base Point)
// Modify these values to match actual gift points
const TEST_GIFT_SETTINGS = {
    // Free Gifts (Defaults to 1 if not listed)
    1601: 10,    // Rainbow Star (Special multiplier applies) - Assuming 10 base? Or 1? Usually 10 for Rainbow? Let's check logic. 
    // Logic says: basePoint * count * multiplier * 2.5. If it's a "Bear", base 1000? 
    // Rainbow Star is usually 100? No, free gifts are usually cheap.
    // Let's stick thereto 1 for now and let user edit.

    // Paid Gifts
    3: 3,        // 3G Gift
    21: 100,     // 100G Gift (Temporary)
    18: 100,     // Unknown Paid Gift
    800003: 100, // 100G Gift (Temporary)
    800072: 100, // Unknown Paid Gift
    3000349: 100 // Unknown Paid Gift
};

// Setting 4: Upcoming Mode Flag
let isUpcomingMode = false;
const UPCOMING_TARGET_GIFTS = [1601, 3000751, 3000752];

// Entry Management for Upcoming Mode
let entrySlots = []; // Array of { windowIndex, roomId, roomName, url }
let previousRankingData = []; // Store previous ranking for comparison
let lastExternalRankingUpdate = null; // Timestamp of last update

// User Identity Accumulation for Cloudflare
const userIdentityMap = new Map(); // uid -> { name, last_seen }
// Default URL set as requested
let cfWorkerUrl = localStorage.getItem('cf_worker_url') || 'https://userid-names.geten777.workers.dev';
let cfSendInterval = parseInt(localStorage.getItem('cf_send_interval')) || 30;
let cfIntervalTimer = null;
let lastStatusMessage = '';

function accumulateUserIdentity(uid, name) {
    if (!uid || !name) return;
    // Overwrite with latest name and time
    userIdentityMap.set(String(uid), { name: name, last_seen: Date.now() });
    updateCfStatusDisplay();
}

function updateCfStatusDisplay() {
    const statusEl = document.getElementById('cfStatus');
    if (!statusEl) return;

    const count = userIdentityMap.size;
    let statusText = '';

    if (cfIntervalTimer !== null) {
        let timeStr = nextSendTime ? nextSendTime.toLocaleTimeString() : '不明';
        statusText = `<span style="color:green; font-weight:bold;">[稼働中]</span> 次回: ${timeStr}`;
    } else {
        statusText = `<span style="color:red; font-weight:bold;">[停止中]</span>`;
    }

    let extra = lastStatusMessage ? ` <span style="margin-left:5px; padding-left:5px; border-left:1px solid #ccc;">${lastStatusMessage}</span>` : '';
    statusEl.innerHTML = `${statusText} (待機: ${count}件)${extra}`;
}

let nextSendTime = null;

async function sendToCloudflare() {
    if (!cfWorkerUrl) return;

    // Create payload
    const payload = Array.from(userIdentityMap.entries()).map(([uid, data]) => ({
        uid: uid,
        name: data.name,
        last_seen: data.last_seen
    }));

    if (payload.length === 0) {
        lastStatusMessage = `<span style="color:#aaa;">送信対象なし</span>`;
        updateCfStatusDisplay();
        if (cfIntervalTimer) scheduleNextSend();
        return;
    }

    console.log(`[Cloudflare] Sending ${payload.length} users...`);
    lastStatusMessage = `<span style="color:orange;">送信中... (${payload.length}件)</span>`;
    updateCfStatusDisplay();

    try {
        const res = await fetch('/api/proxy_cf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: cfWorkerUrl, // Proxy logic
                action: 'save_users',
                users: payload
            })
        });

        const now = new Date();
        const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

        if (res.ok) {
            console.log(`[Cloudflare] Sent successfully.`);
            userIdentityMap.clear();
            lastStatusMessage = `<span style="color:blue; font-weight:bold;">送信成功 (${payload.length}件 ${timeStr})</span>`;
            if (cfIntervalTimer) scheduleNextSend();
            updateCfStatusDisplay();
        } else {
            console.error(`[Cloudflare] Send failed: ${res.status}`);
            lastStatusMessage = `<span style="color:red;">送信失敗 (${res.status})</span>`;
            if (cfIntervalTimer) scheduleNextSend();
            updateCfStatusDisplay();
        }
    } catch (e) {
        console.error('[Cloudflare] Send Error:', e);
        lastStatusMessage = `<span style="color:red;">送信エラー: ${e.message}</span>`;
        if (cfIntervalTimer) scheduleNextSend();
        updateCfStatusDisplay();
    }
}

function scheduleNextSend() {
    if (cfSendInterval > 0) {
        nextSendTime = new Date(Date.now() + cfSendInterval * 60 * 1000);
    }
}

function startCfTimer() {
    if (cfIntervalTimer) clearInterval(cfIntervalTimer);

    // Debug log
    console.log(`[Cloudflare] startCfTimer called. URL: ${cfWorkerUrl}, Interval: ${cfSendInterval}`);
    alert(`Debug: URL=${cfWorkerUrl}, Interval=${cfSendInterval}`); // Confirm values

    if (cfWorkerUrl && cfSendInterval > 0) {
        console.log(`[Cloudflare] Starting timer...`);

        // Initial schedule
        scheduleNextSend();

        cfIntervalTimer = setInterval(() => {
            sendToCloudflare();
            // Timer continuous, so update next time
            scheduleNextSend();
        }, cfSendInterval * 60 * 1000);

        console.log(`[Cloudflare] Timer ID: ${cfIntervalTimer}`);
        updateCfStatusDisplay();

    } else {
        console.warn(`[Cloudflare] Timer NOT started. Missing URL or invalid interval.`);
        nextSendTime = null;
        cfIntervalTimer = null;
        updateCfStatusDisplay();
    }
}

async function fetchPastNames(uid) {
    if (!cfWorkerUrl) return;

    const listDiv = document.getElementById('past-names-list');
    listDiv.innerHTML = '読み込み中...';

    try {
        const targetUrl = `${cfWorkerUrl}?action=get_names&uid=${uid}`;
        const url = `/api/proxy_cf?url=${encodeURIComponent(targetUrl)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        // Expected data: { uid: "...", names: [ { name: "...", last_seen: ... }, ... ] } or just array of strings

        listDiv.innerHTML = '';

        let names = [];
        if (Array.isArray(data)) names = data;
        else if (data.names) names = data.names;

        if (names.length === 0) {
            listDiv.innerHTML = '履歴なし';
            return;
        }

        // Sort by time desc if available, or just list
        // Assuming names is array of objects { name, last_seen } or strings
        names.forEach(item => {
            const div = document.createElement('div');
            div.className = 'past-name-item';

            let nameStr = '';
            let dateStr = '';

            if (typeof item === 'string') {
                nameStr = item;
            } else {
                nameStr = item.name;
                if (item.last_seen) {
                    const d = new Date(item.last_seen);
                    dateStr = d.toLocaleString();
                }
            }

            div.innerHTML = `
                <span style="font-weight:bold;">${nameStr}</span>
                ${dateStr ? `<span style="font-size:0.8em; color:#999; margin-left:10px;">${dateStr}</span>` : ''}
            `;
            listDiv.appendChild(div);
        });

    } catch (e) {
        console.error(e);
        listDiv.innerHTML = `取得失敗: ${e.message}`;
    }
}

// RoomMonitor Class
class RoomMonitor {
    constructor(index, container) {
        this.index = index;
        this.container = container;
        this.roomId = null;
        this.initialPoints = 0;
        this.sessionPoints = 0;
        this.pendingPoints = 0;
        this.comboCount = 0;
        this.pendingTimer = null;
        this.connected = false;
        this.socket = null;
        this.reconnectTimeout = null;
        this.pingInterval = null;
        this.broadcastKey = null;
        this.giftMaster = null;
        this.pointsSet = false; // Flag for auto-set

        // Data Store
        this.userPoints = {};
        this.rankings = [];
        this.giftLog = {}; // { giftId: { count, element } }

        // Analysis Data
        this.pointHistory = []; // [{t: timestamp, p: totalPoints}]

        this.initUI();
    }

    initUI() {
        this.container.classList.add('room-panel');
        this.container.innerHTML = `
            <div class="room-header">
                <div style="display:flex; gap:5px; align-items:center; flex:1;">
                    <span class="room-number" style="font-weight:bold; color:#007bff; font-size:1.1em; margin-right:5px;">${getCircledNumber(this.index + 1)}</span>
                    <span class="room-id-label" style="font-size:0.85em; white-space:nowrap; cursor:pointer;">ROOMID:</span>
                    <input type="text" class="room-id-input" placeholder="Room ID / URL" value="">
                    <button class="connect-btn">Connect</button>
                    <span style="font-size:0.85em; white-space:nowrap;">初期PT:</span>
                    <input type="number" class="init-points-input" placeholder="0" value="0">
                    <span style="font-size:0.85em;">PT</span>
                    <button class="set-points-btn">SET</button>
                    <button class="reset-points-btn" style="padding:2px 6px; cursor:pointer; background:#607D8B; color:white; border:none; border-radius:3px;">RESET</button>
                </div>
            </div>
            <div class="room-name" style="padding: 5px; font-weight: bold; min-height: 1.2em; border-bottom: 1px solid #eee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                &nbsp;
            </div>
            <div class="status-bar">
                <span class="status-text status-disconnected">OFFLINE</span>
                <span class="combo-text" style="color:#FF6B00; font-weight:bold; margin:0 5px;">0 COMBO</span>
                <span class="pending-points-text" style="color:#ff6b00; font-weight:bold; margin-right:10px;">+0</span>
                <span class="points-text">Total: 0</span>
            </div>
            <div class="high-value-gifts"></div>
            <div class="ranking-container">
            </div>
            <div class="gift-log"></div>
        `;

        this.ui = {
            roomIdLabel: this.container.querySelector('.room-id-label'),
            roomIdInput: this.container.querySelector('.room-id-input'),
            initPointsInput: this.container.querySelector('.init-points-input'),
            connectBtn: this.container.querySelector('.connect-btn'),
            setPointsBtn: this.container.querySelector('.set-points-btn'),
            resetPointsBtn: this.container.querySelector('.reset-points-btn'),
            roomName: this.container.querySelector('.room-name'),
            status: this.container.querySelector('.status-text'),
            comboText: this.container.querySelector('.combo-text'),
            pendingPoints: this.container.querySelector('.pending-points-text'),
            points: this.container.querySelector('.points-text'),
            highValueGifts: this.container.querySelector('.high-value-gifts'),
            ranking: this.container.querySelector('.ranking-container'),
            log: this.container.querySelector('.gift-log'),
            statusBar: this.container.querySelector('.status-bar')
        };

        this.ui.roomIdLabel.addEventListener('click', () => {
            this.ui.roomIdInput.focus();
        });

        this.ui.connectBtn.addEventListener('click', () => this.toggleConnection());

        this.ui.setPointsBtn.onclick = () => this.setInitialPoints();
        this.ui.resetPointsBtn.onclick = () => {
            console.log(`[Room ${this.roomId}] Resetting points state.`);
            this.pointsSet = false;
            this.updateResetBtnState();
            this.initialPoints = 0;
            this.ui.initPointsInput.value = '';

            // Full Session Reset
            this.userPoints = {};
            this.rankings = [];
            this.sessionPoints = 0;
            this.pendingPoints = 0;
            this.comboCount = 0;
            this.giftLog = {};
            this.pointHistory = [];

            // Clear UI
            this.ui.log.innerHTML = '';
            this.ui.highValueGifts.innerHTML = '';
            this.updatePendingPoints();
            this.updateComboCount();

            this.updateTotalPoints();
            updateGlobalRanking();
        };

        // Enter key on Room ID input
        this.ui.roomIdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.connected) {
                this.ui.connectBtn.click(); // Simulate connect button click
            }
        });
    }

    updateResetBtnState() {
        if (this.pointsSet) {
            this.ui.resetPointsBtn.style.background = '#dc3545'; // Red
        } else {
            this.ui.resetPointsBtn.style.background = '#607D8B'; // Gray
        }
    }

    async toggleConnection() {
        if (this.connected) {
            this.disconnect();
            return;
        }

        let inputVal = this.ui.roomIdInput.value.trim();
        if (!inputVal) return;

        // Allow URL conversion
        if (inputVal.startsWith('http')) {
            try {
                this.updateStatus('connecting', 'Converting URL...');
                const res = await fetch(`/convert_url?url=${encodeURIComponent(inputVal)}`);
                if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
                const json = await res.json();
                if (json.room_id) {
                    inputVal = json.room_id;
                    this.ui.roomIdInput.value = inputVal; // Update input with ID
                } else {
                    alert('Could not extract Room ID from URL');
                    this.updateStatus('disconnected', 'Invalid URL');
                    return;
                }
            } catch (e) {
                console.error("URL conversion error:", e);
                alert('Conversion error. Please check the URL.');
                this.updateStatus('disconnected', 'Conversion Failed');
                return;
            }
        }

        const rid = inputVal; // Keep as string for now, but ensure it's the ID
        if (rid) {
            this.roomId = rid;
            this.initialPoints = parseInt(this.ui.initPointsInput.value) || 0;
            this.connect();
        } else {
            alert('Please enter a valid Room ID or Showroom URL.');
        }
    }

    async setInitialPoints(passedPoints) {
        // 1. If points are passed directly (e.g. from ENTRY button)
        if (passedPoints !== undefined && passedPoints !== null) {
            this.ui.initPointsInput.value = passedPoints;
            console.log(`[Room ${this.roomId}] Points set from argument: ${passedPoints}`);
        }
        // 2. If in Upcoming Mode and no points passed, try Award Ranking data
        else if (isUpcomingMode && this.roomId) {
            // previousRankingData: [{ room_id, rank, points }, ...]
            const rankingItem = previousRankingData.find(p => p.room_id == this.roomId);
            if (rankingItem) {
                this.ui.initPointsInput.value = rankingItem.points;
                console.log(`[Room ${this.roomId}] Award Ranking Points found: ${rankingItem.points}`);
            } else {
                console.log(`[Room ${this.roomId}] Room not found in Award Ranking. Falling back to Event API.`);
                await this.fetchEventPoints();
            }
        }
        // 3. Normal Mode or Fallback: Try to fetch from Event API
        else if (this.roomId) {
            await this.fetchEventPoints();
        }

        // Mark as set
        this.pointsSet = true;
        this.updateResetBtnState();

        const newInitPoints = parseInt(this.ui.initPointsInput.value) || 0;
        this.initialPoints = newInitPoints;
        this.updateTotalPoints();
        updateGlobalRanking();
    }

    async fetchEventPoints() {
        if (!this.roomId) return;
        try {
            this.updateStatus('connecting', 'Fetching Event Points...');
            const res = await fetch(`/api/event_points?room_id=${this.roomId}`);
            const json = await res.json();

            // Navigate json: event -> ranking -> point
            let foundPoint = null;
            if (json.event) {
                this.currentEvent = json.event;
                console.log(`[Room ${this.roomId}] Event Info:`, json.event);
            }

            if (json.event && json.event.ranking && json.event.ranking.point !== undefined) {
                foundPoint = json.event.ranking.point;
            } else if (json.point !== undefined) {
                foundPoint = json.point;
            }

            if (foundPoint !== null) {
                this.ui.initPointsInput.value = foundPoint;
                console.log(`[Room ${this.roomId}] Event Points Fetched: ${foundPoint}`);

                // Window 1 ならイベントランキング更新をトリガー
                if (this === monitors[0]) {
                    // 関数が定義されているか確認してから呼ぶ
                    if (typeof updateEventRankingFromWindow1 === 'function') {
                        updateEventRankingFromWindow1();
                    }
                }
            } else {
                console.log(`[Room ${this.roomId}] No event points found.`);
            }
            this.updateStatus('connected', 'ONLINE (Proxy)');
        } catch (e) {
            console.warn(`[Room ${this.roomId}] Event fetch failed:`, e);
            this.updateStatus('connected', 'ONLINE (Proxy)'); // Revert status
        }
    }

    async connect() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);

        this.updateStatus('connecting', 'Connecting...');
        // Session data is NOT reset here to allow accumulation on reconnect.
        // Use RESET button to clear data.

        if (this.pendingTimer) clearTimeout(this.pendingTimer);
        this.updateRankingDisplay();
        // this.ui.log.innerHTML = ''; // Keep logs
        // this.ui.highValueGifts.innerHTML = ''; // Keep gifts
        this.updatePendingPoints();
        this.updateComboCount();
        this.updateTotalPoints();

        // Auto-set points on first connect ONLY if not set and current is 0
        if (!this.pointsSet && this.roomId) {
            if (this.initialPoints === 0) {
                console.log(`[Room ${this.roomId}] Auto-setting points (First Connect)...`);
                this.setInitialPoints().catch(e => console.warn(e));
            } else {
                console.log(`[Room ${this.roomId}] Manual points detected (${this.initialPoints}). Skipping auto-set.`);
                this.pointsSet = true;
                this.updateResetBtnState();
            }
        }

        try {
            const res = await fetch(`/room_profile?room_id=${this.roomId}`);
            if (!res.ok) {
                throw new Error(`API Error: ${res.status}`);
            }
            const json = await res.json();

            if (!json) {
                throw new Error("Empty Response");
            }
            if (!json.broadcast_key) {
                throw new Error("OFFLINE");
            }
            this.broadcastKey = json.broadcast_key;

            if (json.room_name) {
                this.ui.roomName.textContent = json.room_name;
                this.ui.roomName.title = json.room_name;
            } else {
                this.ui.roomName.textContent = 'Unknown Room';
            }

            await this.fetchGiftData();

            // Use local proxy (matches sr_live_beta.html)
            const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
            this.socket = new WebSocket(`${protocol}//${location.host}/ws`);

            this.socket.onopen = () => {
                console.log(`[Room ${this.roomId}] Proxy WS Open. Sending Key...`);
                // Send key to server.js proxy
                this.socket.send(JSON.stringify({ broadcast_key: this.broadcastKey }));

                this.connected = true;
                this.updateStatus('connected', 'ONLINE (Proxy)');
                this.ui.connectBtn.textContent = 'Disconnect';
                updateGlobalRanking();

                this.pingInterval = setInterval(() => {
                    if (this.socket.readyState === WebSocket.OPEN) {
                        try {
                            this.socket.send(JSON.stringify({ type: 'ping' }));
                        } catch (e) { console.warn('ping failed', e); }
                    }
                }, 10000);
            };

            this.socket.onmessage = (e) => this.handleMessage(e);
            this.socket.onclose = (e) => {
                console.log(`[Room ${this.roomId}] WS Closed:`, e.code, e.reason);
                this.handleClose(e);
            };
            this.socket.onerror = (e) => {
                console.error(`[Room ${this.roomId}] WS Error:`, e);
            };

        } catch (e) {
            console.error(e);
            const interval = parseInt(document.getElementById('global-reconnect-interval').value) || 5;

            if (e.message === "OFFLINE") {
                this.updateStatus('connecting', `OFFLINE (Waiting ${interval}s...)`);
            } else {
                this.updateStatus('connecting', `Error (${e.message}). Retry in ${interval}s...`);
            }

            this.reconnectTimeout = setTimeout(() => this.connect(), interval * 1000);
        }
    }

    disconnect() {
        this.connected = false;
        if (this.socket) this.socket.close();
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        this.updateStatus('disconnected', 'OFFLINE');
        this.ui.btn.textContent = 'Connect';

        // Reset data on disconnect? Or keep it?
        // Usually we keep data until new connection clearly wipes it.
        // But we should update ranking to show maybe offline status or just keep points.
        updateGlobalRanking();
    }

    handleClose(e) {
        if (this.connected) {
            this.connected = false;
            if (this.pingInterval) clearInterval(this.pingInterval);

            const interval = parseInt(document.getElementById('global-reconnect-interval').value) || 5;
            this.updateStatus('connecting', `Disconnected. Retry in ${interval}s...`);

            this.reconnectTimeout = setTimeout(() => this.connect(), interval * 1000);
        } else {
            this.updateStatus('disconnected', 'OFFLINE');
            this.ui.btn.textContent = 'Connect';
        }
    }

    handleMessage(event) {
        const data = event.data;
        if (data.startsWith("MSG\t")) {
            const payload = data.replace("MSG\t", "");

            try {
                const jsonStr = payload.replace(this.broadcastKey, "").trim();
                const cleanJson = jsonStr.replace(/^\s+/, "");

                const obj = JSON.parse(cleanJson);

                // Accumulate user identity from any message dealing with users
                if (obj.u && obj.ac) {
                    accumulateUserIdentity(obj.u, obj.ac);
                }

                // Handle valid comments/messages (t=101)
                if (obj.t == 101) {
                    // Extract message content, usually in 'cm' or 'm'
                    const msg = obj.cm || obj.m;
                    if (msg) {
                        this.addSystemMessage(msg, 'orange');
                    }
                }

                if (obj.g) {
                    this.processGift(obj);
                }
            } catch (e) {
                // Ignore parse errors
            }
        }
    }

    calculateGiftPoints(giftId, count, isFree, basePoint) {
        const quantityMultipliers = {
            1: 1.00, 2: 1.04, 3: 1.06, 4: 1.08, 5: 1.10,
            6: 1.12, 7: 1.14, 8: 1.16, 9: 1.18, 10: 1.20
        };

        const quantityMultiplier = count <= 10 ? quantityMultipliers[count] : 1.20;
        let totalPoints = 0;

        if (isFree) {
            if (giftId === 1601) {
                totalPoints = basePoint * count * quantityMultiplier * 2.5;
            } else {
                totalPoints = basePoint * count * quantityMultiplier;
            }
        } else {
            totalPoints = basePoint * 2.5 * count * quantityMultiplier;
            if (basePoint >= 500 && count <= 10) {
                totalPoints = basePoint * 2.5 * count * 1.20;
            }
        }

        return Math.floor(totalPoints);
    }

    processGift(gift) {
        // Feature: Upcoming Mode Filtering
        if (isUpcomingMode) {
            const isFree = gift.gt == 2; // gt:1=paid, 2=free
            const isTargetId = UPCOMING_TARGET_GIFTS.includes(gift.g);

            // Allow if Paid OR (Free AND TargetID)
            const allowed = (!isFree) || (isFree && isTargetId);

            if (!allowed) {
                return; // Skip this gift
            }
        }

        const giftInfo = this.giftMaster && this.giftMaster[gift.g];

        if (!giftInfo) {
            console.warn(`Gift ${gift.g} not in master data`);
            const count = gift.n || 1;
            const isFree = gift.gt == 2;

            // Manual fallback for test gifts using configuration
            let basePoint = isFree ? 1 : 1;
            if (TEST_GIFT_SETTINGS[gift.g]) {
                basePoint = TEST_GIFT_SETTINGS[gift.g];
            }

            const totalGiftPoints = this.calculateGiftPoints(gift.g, count, isFree, basePoint);

            this.addLog(gift, totalGiftPoints);
            if (totalGiftPoints >= 3000) {
                this.addHighValueGift(gift, totalGiftPoints);
            }
            this.updateUserPoints(gift.u, gift.ac, gift.av, totalGiftPoints, gift.g, count);
            this.addToPending(totalGiftPoints);
            this.triggerJump(gift.u);
            return;
        }

        const count = gift.n || 1;
        const isFree = giftInfo.free;
        const basePoint = giftInfo.point;

        const totalGiftPoints = this.calculateGiftPoints(gift.g, count, isFree, basePoint);

        this.addLog(gift, totalGiftPoints);
        if (totalGiftPoints >= 3000) {
            this.addHighValueGift(gift, totalGiftPoints);
        }
        this.updateUserPoints(gift.u, gift.ac, gift.av, totalGiftPoints, gift.g, count);
        this.addToPending(totalGiftPoints);
        this.triggerJump(gift.u);
    }

    async fetchGiftData() {
        if (this.giftMaster) return;

        try {
            const res = await fetch(`/gift_list?room_id=${this.roomId}`);
            const json = await res.json();

            const giftMasterData = {};

            const processGifts = (list) => {
                if (!list) return;
                list.forEach(item => {
                    giftMasterData[item.gift_id] = {
                        name: item.gift_name,
                        point: item.point,
                        free: item.free
                    };
                });
            };

            processGifts(json.normal);
            processGifts(json.enquete);

            this.giftMaster = giftMasterData;
            console.log(`Room ${this.roomId}: Loaded ${Object.keys(giftMasterData).length} gifts`);

        } catch (e) {
            console.warn(`Room ${this.roomId}: Failed to fetch gift_list`, e);
            this.giftMaster = {};
        }
    }

    updateUserPoints(uid, name, avatar, points, giftId, giftCount) {
        if (!this.userPoints[uid]) {
            this.userPoints[uid] = {
                uid: uid,
                name: name,
                avatar: avatar,
                points: 0,
                gifts: {}
            };
        }

        const user = this.userPoints[uid];
        user.points += points;
        // Update profile info
        user.name = name;
        user.avatar = avatar;

        // Accumulate for Cloudflare
        accumulateUserIdentity(uid, name);

        // Track gift history
        if (giftId) {
            if (!user.gifts[giftId]) {
                user.gifts[giftId] = 0;
            }
            user.gifts[giftId] += (giftCount || 1);
        }

        this.updateRankingDisplay();
    }

    updateRankingDisplay() {
        const arr = Object.keys(this.userPoints).map(uid => ({
            uid: uid,
            ...this.userPoints[uid]
        }));

        arr.sort((a, b) => b.points - a.points);
        const top5 = arr.slice(0, MAX_RANKING);

        top5.forEach((user, index) => {
            let el = this.ui.ranking.querySelector(`.ranking-item[data-uid="${user.uid}"]`);
            if (!el) {
                el = document.createElement('div');
                el.className = 'ranking-item';
                el.style.cursor = 'pointer';
                el.onclick = () => this.showUserGifts(user.uid);
                el.setAttribute('data-uid', user.uid);
                el.innerHTML = `
                    <div class="ranking-rank"></div>
                    <img class="ranking-avatar" src="https://image.showroom-cdn.com/showroom-prod/image/avatar/${user.avatar}.png" onerror="this.src='https://image.showroom-cdn.com/showroom-prod/assets/img/no_avatar.png'">
                    <div class="ranking-name">${user.name}</div>
                    <div class="ranking-points">0</div>
                `;
                this.ui.ranking.appendChild(el);
            }

            el.querySelector('.ranking-rank').textContent = index + 1;
            el.querySelector('.ranking-points').textContent = user.points.toLocaleString();
            el.style.top = `${index * 24}px`;
            el.dataset.rank = index;
        });

        Array.from(this.ui.ranking.children).forEach(el => {
            const uid = el.getAttribute('data-uid');
            const inTop = top5.find(u => u.uid == uid);
            if (!inTop) {
                el.remove();
            }
        });
    }

    triggerJump(uid) {
        const el = this.ui.ranking.querySelector(`.ranking-item[data-uid="${uid}"]`);
        if (el) {
            el.classList.remove('jump');
            void el.offsetWidth;
            el.classList.add('jump');
        }
    }

    addSystemMessage(message, color) {
        const div = document.createElement('div');
        div.style.gridColumn = '1 / -1'; // Span all columns
        div.style.width = '100%';
        div.style.padding = '4px';
        div.style.marginBottom = '2px';
        div.style.boxSizing = 'border-box';

        div.style.color = color || 'orange';
        div.style.fontWeight = 'bold';
        div.style.fontSize = '0.9em';
        div.style.textAlign = 'left';
        div.style.wordBreak = 'break-all';
        div.style.borderBottom = '1px solid #eee';

        div.textContent = message;

        this.ui.log.prepend(div);
    }

    addLog(gift, points) {
        const giftId = gift.g;
        const isFree = gift.gt == 2;
        const color = isFree ? '#aaa' : '#d00';
        const iconUrl = `https://static.showroom-live.com/image/gift/${giftId}_s.png?v=1`;

        // Check if this gift ID already exists
        if (this.giftLog[giftId]) {
            // Update existing gift count
            this.giftLog[giftId].count += gift.n;
            const countSpan = this.giftLog[giftId].element.querySelector('.gift-count');
            if (countSpan) {
                countSpan.textContent = `×${this.giftLog[giftId].count}`;
            }

            // Trigger jump animation
            const element = this.giftLog[giftId].element;
            element.classList.remove('gift-jump');
            void element.offsetWidth;
            element.classList.add('gift-jump');

            // Move to top-left (prepend)
            this.ui.log.prepend(this.giftLog[giftId].element);
        } else {
            // Create new gift block
            const div = document.createElement('div');
            div.className = 'gift-log-item gift-jump';
            div.style.cursor = 'pointer';
            div.onclick = () => this.showGiftSenders(giftId);

            div.innerHTML = `
                <img src="${iconUrl}" style="width:35px; height:35px; display:block; margin:0 auto 3px;">
                <span class="gift-count" style="color:${color}; font-weight:bold; font-size:0.9em;">×${gift.n}</span>
            `;

            // Store reference
            this.giftLog[giftId] = {
                count: gift.n,
                element: div,
                senders: {}
            };

            // Prepend to show newest at top-left
            this.ui.log.prepend(div);
        }

        // Track sender
        if (!this.giftLog[giftId].senders[gift.u]) {
            this.giftLog[giftId].senders[gift.u] = {
                uid: gift.u,
                name: gift.ac,
                avatar: gift.av,
                count: 0
            };
        }
        this.giftLog[giftId].senders[gift.u].count += gift.n;
    }

    addHighValueGift(gift, points) {
        const div = document.createElement('div');
        div.className = 'high-value-gift-item slide-in-new';

        const giftId = gift.g;
        const iconUrl = `https://static.showroom-live.com/image/gift/${giftId}_s.png?v=1`;

        div.innerHTML = `
            <img class="hv-gift-icon" src="${iconUrl}">
            <span class="hv-count">×${gift.n}</span>
        `;

        this.ui.highValueGifts.prepend(div);

        // Limit to 50 items
        while (this.ui.highValueGifts.children.length > 50) {
            this.ui.highValueGifts.removeChild(this.ui.highValueGifts.lastChild);
        }
    }

    addToPending(points) {
        this.pendingPoints += points;
        this.comboCount++;
        this.updatePendingPoints();
        this.updateComboCount();

        // Record History for Velocity
        this.recordPointHistory();

        // Immediate Global Ranking Update (includes pending points)
        if (typeof updateGlobalRanking === 'function') {
            updateGlobalRanking();
        }

        // Clear existing timer
        if (this.pendingTimer) {
            clearTimeout(this.pendingTimer);
        }

        // Set new timer for 5 seconds (Original Logic with Animation)
        this.pendingTimer = setTimeout(() => {
            this.ui.pendingPoints.classList.add('pending-slide');

            setTimeout(() => {
                this.sessionPoints += this.pendingPoints;
                this.pendingPoints = 0;
                this.comboCount = 0;

                this.updatePendingPoints();
                this.updateComboCount();
                this.updateTotalPoints();

                // Final sync with global ranking
                if (typeof updateGlobalRanking === 'function') {
                    updateGlobalRanking();
                }

                this.ui.pendingPoints.classList.remove('pending-slide');

                this.ui.points.classList.add('total-impact');
                setTimeout(() => {
                    this.ui.points.classList.remove('total-impact');
                }, 400);
            }, 600);
        }, 5000);
    }

    updatePendingPoints() {
        if (this.pendingPoints > 0) {
            this.ui.pendingPoints.textContent = `+${this.pendingPoints.toLocaleString()}`;
            this.ui.pendingPoints.style.display = 'inline';
        } else {
            this.ui.pendingPoints.textContent = '+0';
            this.ui.pendingPoints.style.display = 'none';
        }
    }

    updateComboCount() {
        if (this.comboCount > 0) {
            this.ui.comboText.textContent = `${this.comboCount} COMBO`;
            this.ui.comboText.style.display = 'inline';
        } else {
            this.ui.comboText.textContent = '0 COMBO';
            this.ui.comboText.style.display = 'none';
        }
    }

    updateTotalPoints() {
        const total = this.initialPoints + this.sessionPoints;
        this.ui.points.textContent = `Total: ${total.toLocaleString()}`;
    }

    updateStatus(cls, text) {
        this.ui.status.className = `status-text status-${cls}`;
        this.ui.status.textContent = text;
    }

    recordPointHistory() {
        const now = Date.now();
        const total = this.initialPoints + this.sessionPoints + this.pendingPoints;
        this.pointHistory.push({ t: now, p: total });

        // Keep last 10 minutes
        const cutoff = now - 10 * 60 * 1000;
        if (this.pointHistory.length > 0 && this.pointHistory[0].t < cutoff) {
            this.pointHistory = this.pointHistory.filter(h => h.t >= cutoff);
        }
    }

    getVelocity(seconds = 60) {
        if (this.pointHistory.length < 2) return 0;

        const now = Date.now();
        const targetTime = now - seconds * 1000;

        // Find history point closest to targetTime
        let pastPoint = this.pointHistory[0];
        for (let i = 0; i < this.pointHistory.length; i++) {
            if (this.pointHistory[i].t >= targetTime) {
                pastPoint = this.pointHistory[i];
                break;
            }
        }

        const currentTotal = this.initialPoints + this.sessionPoints + this.pendingPoints;

        // If past point is too recent (e.g. just started), scale appropriately or just return diff
        // But for robust velocity, we strictly calc diff / time_passed

        const timeDiffSec = (now - pastPoint.t) / 1000;
        if (timeDiffSec < 1) return 0; // avoid infinity

        const pointDiff = currentTotal - pastPoint.p;

        // Convert to points per minute
        const velocity = (pointDiff / timeDiffSec) * 60;

        return Math.floor(velocity);
    }

    getVelocityTrend(shortSec = 60, longSec = 300) {
        const current = this.getVelocity(shortSec);

        // For baseline, we want the velocity over the long period, 
        // OR maybe the velocity of the "previous" period?
        // Let's use easy approach: Velocity over last N mins.
        // If I sprint now, my 5min avg also goes up, but slower.
        let baseline = this.getVelocity(longSec);

        // Use a minimum floor for baseline to avoid divides by zero/noise
        // e.g., if baseline is 0-50, treat as 100.
        const effectiveBaseline = Math.max(baseline, 100);

        const ratio = current / effectiveBaseline;

        // Anomaly Definition:
        // 1. Significant speed (> 500/min)
        // 2. Sudden jump (> 3x baseline)
        const isAbnormal = (current > 500) && (ratio >= 3.0);

        return {
            current,
            baseline,
            ratio: parseFloat(ratio.toFixed(1)),
            isAbnormal
        };
    }

    showUserGifts(uid) {
        const user = this.userPoints[uid];
        if (!user || !user.gifts) return;

        const modal = document.getElementById('info-modal');
        const title = document.getElementById('info-modal-title');
        const content = document.getElementById('info-modal-content');

        title.textContent = `${user.name} さんのギフト履歴 (合計: ${user.points.toLocaleString()}pt)`;
        content.innerHTML = '';

        Object.keys(user.gifts).forEach(giftId => {
            const count = user.gifts[giftId];
            const iconUrl = `https://static.showroom-live.com/image/gift/${giftId}_s.png?v=1`;

            const div = document.createElement('div');
            div.className = 'info-list-item';
            div.innerHTML = `
                <img class="info-icon" src="${iconUrl}">
                <span class="info-name">Gift ID: ${giftId}</span>
                <span class="info-count">×${count}</span>
            `;
            content.appendChild(div);
        });

        modal.style.display = 'flex';

        // Setup Past Names Section
        const pastSection = document.getElementById('past-names-section');
        pastSection.style.display = 'block';
        document.getElementById('past-names-list').innerHTML = ''; // Clear previous

        const fetchBtn = document.getElementById('fetch-past-names-btn');
        // Remove old listeners (cloning)
        const newBtn = fetchBtn.cloneNode(true);
        fetchBtn.parentNode.replaceChild(newBtn, fetchBtn);

        newBtn.onclick = () => fetchPastNames(uid);
    }

    showGiftSenders(giftId) {
        if (!this.giftLog[giftId] || !this.giftLog[giftId].senders) return;

        const senders = this.giftLog[giftId].senders;
        const modal = document.getElementById('info-modal');
        const title = document.getElementById('info-modal-title');
        const content = document.getElementById('info-modal-content');

        title.textContent = `Gift ID: ${giftId} の送信者一覧`;
        content.innerHTML = '';

        // Sort by count desc
        const sorted = Object.values(senders).sort((a, b) => b.count - a.count);

        sorted.forEach(sender => {
            const avatarUrl = `https://image.showroom-cdn.com/showroom-prod/image/avatar/${sender.avatar}.png`;
            const div = document.createElement('div');
            div.className = 'info-list-item';
            div.innerHTML = `
                <img class="info-avatar" src="${avatarUrl}" onerror="this.src='https://image.showroom-cdn.com/showroom-prod/assets/img/no_avatar.png'">
                <span class="info-name">${sender.name}</span>
                <span class="info-count">×${sender.count}</span>
            `;
            content.appendChild(div);
        });

        modal.style.display = 'flex';
    }
}

// Initialize
const grid = document.getElementById('grid-container');
let currentWindowCount = 6;
let monitors = [];

function initializeMonitors(count) {
    // Clear existing
    grid.innerHTML = '';
    monitors = [];

    // Update grid layout based on count
    switch (count) {
        case 2:
            grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            grid.style.gridTemplateRows = '1fr';
            break;
        case 3:
            grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
            grid.style.gridTemplateRows = '1fr';
            break;
        case 4:
            grid.style.gridTemplateColumns = 'repeat(2, 1fr)';
            grid.style.gridTemplateRows = 'repeat(2, 1fr)';
            break;
        case 5:
            grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
            grid.style.gridTemplateRows = 'repeat(2, 1fr)';
            break;
        case 6:
            grid.style.gridTemplateColumns = 'repeat(3, 1fr)';
            grid.style.gridTemplateRows = 'repeat(2, 1fr)';
            break;
    }

    // Create monitors
    for (let i = 0; i < count; i++) {
        const div = document.createElement('div');

        // Special handling for 5 windows
        if (count === 5 && i >= 3) {
            // Bottom row: span more columns
            if (i === 3) div.style.gridColumn = '1 / 2';
            if (i === 4) div.style.gridColumn = '3 / 4';
        }

        grid.appendChild(div);
        monitors.push(new RoomMonitor(i, div));
    }

    currentWindowCount = count;

    // Update test window selector
    const selector = document.getElementById('test-window-selector');
    selector.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Window ${i + 1}`;
        selector.appendChild(option);
    }
    selectedTestWindow = 0;

    // Initial Ranking Render
    updateGlobalRanking();
}

// Settings modal handlers
// Settings modal handlers
document.getElementById('settings-display-btn').onclick = () => {
    document.getElementById('settings-display-modal').classList.add('active');
};

document.getElementById('close-display-settings').onclick = () => {
    document.getElementById('settings-display-modal').classList.remove('active');
};

// Info Modal Close Handler
document.getElementById('close-info-modal').onclick = () => {
    document.getElementById('info-modal').style.display = 'none';
};

document.getElementById('settings-gift-btn').onclick = () => {
    document.getElementById('settings-gift-modal').classList.add('active');
};

document.getElementById('close-gift-settings').onclick = () => {
    document.getElementById('settings-gift-modal').classList.remove('active');
};

document.querySelectorAll('.window-count-btn').forEach(btn => {
    btn.onclick = () => {
        const count = parseInt(btn.dataset.count);
        initializeMonitors(count);
        document.getElementById('settings-display-modal').classList.remove('active');
    };
});

// Font size selector handler
document.getElementById('font-size-selector').addEventListener('change', (e) => {
    const fontSize = e.target.value + 'em';
    document.querySelectorAll('.status-bar').forEach(statusBar => {
        statusBar.style.fontSize = fontSize;
    });
    // Save to localStorage
    localStorage.setItem('statusBarFontSize', e.target.value);
});

// Load saved font size on init
const savedFontSize = localStorage.getItem('statusBarFontSize');
if (savedFontSize) {
    document.getElementById('font-size-selector').value = savedFontSize;
    document.querySelectorAll('.status-bar').forEach(statusBar => {
        statusBar.style.fontSize = savedFontSize + 'em';
    });
}

// Gift test feature
let selectedTestUser = { u: 1001, ac: "テストA", av: 1 };
let selectedTestCount = 1;
let selectedTestWindow = 0;

// Test user selection
document.querySelectorAll('.test-user-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.test-user-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedTestUser = {
            u: parseInt(btn.getAttribute('data-user-id')),
            ac: btn.getAttribute('data-user-name'),
            av: parseInt(btn.getAttribute('data-user-id')) % 100
        };
    };
});

// Test count selection
document.querySelectorAll('.test-count-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.test-count-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedTestCount = parseInt(btn.getAttribute('data-count'));
    };
});

// Test window selection
document.getElementById('test-window-selector').addEventListener('change', (e) => {
    selectedTestWindow = parseInt(e.target.value);
});
// Setting 4: Upcoming Mode UI Logic
document.getElementById('settings-upcoming-btn').onclick = () => {
    document.getElementById('settings-upcoming-modal').classList.add('active');
};

document.getElementById('close-upcoming-settings').onclick = () => {
    document.getElementById('settings-upcoming-modal').classList.remove('active');
};

document.getElementById('upcoming-mode-toggle').addEventListener('change', (e) => {
    isUpcomingMode = e.target.checked;
    localStorage.setItem('upcoming_mode', isUpcomingMode);
    toggleExternalRanking(isUpcomingMode);
});

// Reload button for external ranking
document.getElementById('external-ranking-reload-btn').addEventListener('click', () => {
    fetchExternalRanking();
});

async function toggleExternalRanking(show) {
    const container = document.getElementById('external-ranking-container');
    if (show) {
        container.style.display = 'block';
        fetchExternalRanking();
    } else {
        container.style.display = 'none';
        document.getElementById('external-ranking-list').innerHTML = '';
    }
}

async function fetchExternalRanking() {
    const listDiv = document.getElementById('external-ranking-list');
    listDiv.innerHTML = '<div style="text-align:center; padding:5px;">Loading...</div>';

    try {
        const res = await fetch('/api/campaign_ranking');
        if (!res.ok) throw new Error('API Error: ' + res.status);
        const data = await res.json();

        // Update timestamp
        lastExternalRankingUpdate = new Date();
        const timeStr = lastExternalRankingUpdate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        document.getElementById('external-ranking-time').textContent = timeStr;

        listDiv.innerHTML = '';
        if (data.length === 0) {
            listDiv.innerHTML = '<div style="text-align:center; padding:5px; color:#666;">No Data Found</div>';
            return;
        }

        data.forEach(item => {
            // Find previous rank and points for comparison
            const prevItem = previousRankingData.find(p => p.room_id === item.room_id);
            const rankChange = prevItem ? prevItem.rank - item.rank : 0; // Positive = moved up
            const pointsChange = prevItem ? item.points - prevItem.points : 0;

            // Determine rank change indicator
            let rankIndicator = '';
            if (rankChange >= 2) rankIndicator = '<span style="color:#0a0;">↑↑</span>';
            else if (rankChange === 1) rankIndicator = '<span style="color:#0a0;">↑</span>';
            else if (rankChange === -1) rankIndicator = '<span style="color:#d00;">↓</span>';
            else if (rankChange <= -2) rankIndicator = '<span style="color:#d00;">↓↓</span>';

            // Check if already registered
            const registered = entrySlots.find(s => s.roomId === item.room_id);

            const div = document.createElement('div');
            div.style.cssText = 'display:flex; gap:5px; align-items:center; padding:3px; border-bottom:1px solid #ddd; font-size:0.85em;';
            div.innerHTML = `
                <div style="font-weight:bold; width:20px; text-align:center;">${item.rank}</div>
                <div style="flex:1; overflow:hidden;">
                    <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:bold;">
                        ${item.name} ${rankIndicator}
                    </div>
                    <div style="font-size:0.9em; color:#d00;">
                        ${item.points.toLocaleString()} pt
                        ${pointsChange > 0 ? `<span style="color:#0a0; font-size:0.85em;">(+${pointsChange.toLocaleString()})</span>` : ''}
                    </div>
                    ${registered ? `<div style="font-size:0.8em; color:#666;">Window ${registered.windowIndex + 1}</div>` : ''}
                </div>
                <button class="entry-btn" data-room-id="${item.room_id}" data-room-name="${item.name}" data-points="${item.points}" data-url="${item.url || ''}"
                    style="padding:3px 8px; font-size:0.8em; background:${registered ? '#ccc' : '#9C27B0'}; color:white; border:none; border-radius:3px; cursor:${registered ? 'not-allowed' : 'pointer'};"
                    ${registered ? 'disabled' : ''}>
                    ${registered ? 'ENTRY済' : 'ENTRY'}
                </button>
            `;
            listDiv.appendChild(div);

            // Store room_id for URL extraction
            div.querySelector('.entry-btn').dataset.roomId = item.room_id;
        });

        // Update previous ranking data
        previousRankingData = data.map(item => ({ room_id: item.room_id, rank: item.rank, points: item.points }));

    } catch (e) {
        console.error(e);
        listDiv.innerHTML = `<div style="color:red; text-align:center; font-size:0.8em;">Load Failed: ${e.message}</div>`;
    }
}

// Register room via ENTRY button
function registerEntry(roomId, roomName, apiPoints, url) {
    console.log(`[ENTRY] Attempting to register: ${roomName} (${roomId}), Points: ${apiPoints}, URL: ${url}`);

    // Find next available window slot (max 6)
    if (entrySlots.length >= 6) {
        alert('すべてのウィンドウが使用中です。');
        return;
    }

    // Check if already registered
    if (entrySlots.find(s => s.roomId === roomId)) {
        alert('このルームは既に登録されています。');
        return;
    }

    const windowIndex = entrySlots.length; // 0-5
    entrySlots.push({ windowIndex, roomId, roomName, url });

    // Populate room URL input using class selector
    const allInputs = document.querySelectorAll('.room-id-input');
    const roomInput = allInputs[windowIndex];
    if (roomInput && url) {
        roomInput.value = url;
        console.log(`[ENTRY] Populated Window ${windowIndex + 1} input with URL: ${url}`);
    } else {
        console.warn(`[ENTRY] Could not find input for window ${windowIndex + 1}`);
    }

    // Set initial points using existing RESET logic
    const monitor = monitors[windowIndex];
    if (monitor) {
        monitor.setInitialPoints(apiPoints);
        console.log(`[ENTRY] Set initial points for Window ${windowIndex + 1}: ${apiPoints}`);

        // Auto-connect to the room
        setTimeout(async () => {
            await monitor.toggleConnection();
            console.log(`[ENTRY] Auto-connecting Window ${windowIndex + 1}`);
        }, 100);
    } else {
        console.warn(`[ENTRY] Monitor not found for window ${windowIndex + 1}`);
    }

    // Refresh external ranking display to update button states
    fetchExternalRanking();

    console.log(`[ENTRY] Successfully registered ${roomName} to Window ${windowIndex + 1}`);
}

// Event delegation for ENTRY buttons
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('entry-btn')) {
        const roomId = e.target.dataset.roomId;
        const roomName = e.target.dataset.roomName;
        const apiPoints = parseInt(e.target.dataset.points) || 0;
        const url = e.target.dataset.url;
        registerEntry(roomId, roomName, apiPoints, url);
    }
});

// Load saved settings on startup
window.addEventListener('DOMContentLoaded', () => {
    // ... existing ...

    // Load Upcoming Mode
    const savedUpcoming = localStorage.getItem('upcoming_mode');
    // Default is OFF (false), so check if explicitly 'true'
    if (savedUpcoming === 'true') {
        isUpcomingMode = true;
        document.getElementById('upcoming-mode-toggle').checked = true;
    } else {
        isUpcomingMode = false; // Default OFF
        document.getElementById('upcoming-mode-toggle').checked = false;
    }

    // Init External Ranking
    toggleExternalRanking(isUpcomingMode);
});

// Setting 3: Font Size Configuration UI Logic
document.getElementById('settings-font-btn').onclick = () => {
    document.getElementById('settings-font-modal').classList.add('active');
};

document.getElementById('close-font-settings').onclick = () => {
    document.getElementById('settings-font-modal').classList.remove('active');
};

// Update GLOBAL_RANKING_SETTINGS and rerender on change
const updateGlobalRankingSettings = () => {
    if (typeof GLOBAL_RANKING_SETTINGS !== 'undefined') {
        GLOBAL_RANKING_SETTINGS.POINTS_FONT_SIZE = document.getElementById('font-points-selector').value;
        GLOBAL_RANKING_SETTINGS.DIFF_FONT_SIZE = document.getElementById('font-diff-selector').value;
        GLOBAL_RANKING_SETTINGS.INSTANT_POINTS_FONT_SIZE = document.getElementById('font-instant-selector').value;

        // Save to localStorage
        localStorage.setItem('gr_points_font', GLOBAL_RANKING_SETTINGS.POINTS_FONT_SIZE);
        localStorage.setItem('gr_diff_font', GLOBAL_RANKING_SETTINGS.DIFF_FONT_SIZE);
        localStorage.setItem('gr_instant_font', GLOBAL_RANKING_SETTINGS.INSTANT_POINTS_FONT_SIZE);

        updateGlobalRanking();
    }
};

document.getElementById('font-points-selector').addEventListener('change', updateGlobalRankingSettings);
document.getElementById('font-diff-selector').addEventListener('change', updateGlobalRankingSettings);
document.getElementById('font-instant-selector').addEventListener('change', updateGlobalRankingSettings);

// Load saved settings on startup
window.addEventListener('DOMContentLoaded', () => {
    const p = localStorage.getItem('gr_points_font');
    const d = localStorage.getItem('gr_diff_font');
    const i = localStorage.getItem('gr_instant_font');

    if (p) {
        document.getElementById('font-points-selector').value = p;
        if (typeof GLOBAL_RANKING_SETTINGS !== 'undefined') GLOBAL_RANKING_SETTINGS.POINTS_FONT_SIZE = p;
    }
    if (d) {
        document.getElementById('font-diff-selector').value = d;
        if (typeof GLOBAL_RANKING_SETTINGS !== 'undefined') GLOBAL_RANKING_SETTINGS.DIFF_FONT_SIZE = d;
    }
    if (i) {
        document.getElementById('font-instant-selector').value = i;
        if (typeof GLOBAL_RANKING_SETTINGS !== 'undefined') GLOBAL_RANKING_SETTINGS.INSTANT_POINTS_FONT_SIZE = i;
    }
});

// Test gift icons
document.querySelectorAll('.test-gift-icon').forEach(icon => {
    icon.onclick = () => {
        const giftId = parseInt(icon.getAttribute('data-id'));
        const type = parseInt(icon.getAttribute('data-type'));

        if (monitors[selectedTestWindow]) {
            const testGift = {
                ...selectedTestUser,
                g: giftId,
                n: selectedTestCount,
                gt: type,
                created_at: Math.floor(Date.now() / 1000)
            };
            monitors[selectedTestWindow].processGift(testGift);
        }
    };
});

// Set default selections
document.querySelector('.test-user-btn').classList.add('selected');
document.querySelector('.test-count-btn').classList.add('selected');

// Initial setup with 6 windows
initializeMonitors(6);

// Initialize Cloudflare Settings
const cfUrlInput = document.getElementById('cfWorkerUrl');
const cfIntervalInput = document.getElementById('cfSendInterval');
if (cfUrlInput) cfUrlInput.value = cfWorkerUrl;
if (cfIntervalInput) cfIntervalInput.value = cfSendInterval;

document.getElementById('cfSaveBtn')?.addEventListener('click', () => {
    const url = document.getElementById('cfWorkerUrl').value.trim();
    const interval = parseInt(document.getElementById('cfSendInterval').value);

    if (url && interval > 0) {
        cfWorkerUrl = url;
        cfSendInterval = interval;
        localStorage.setItem('cf_worker_url', cfWorkerUrl);
        localStorage.setItem('cf_send_interval', cfSendInterval);
        localStorage.setItem('cf_auto_send_enabled', 'true'); // Save state

        startCfTimer();
        alert('設定を保存し、タイマーを開始しました。');
    } else {
        alert('有効なURLと間隔を入力してください。');
    }
});

document.getElementById('cfForceSendBtn')?.addEventListener('click', async () => {
    if (!cfWorkerUrl) {
        alert('URLが設定されていません。先に設定を保存してください。');
        return;
    }

    const originalText = document.getElementById('cfForceSendBtn').textContent;
    document.getElementById('cfForceSendBtn').textContent = '送信中...';
    document.getElementById('cfForceSendBtn').disabled = true;

    await sendToCloudflare();

    document.getElementById('cfForceSendBtn').textContent = originalText;
    document.getElementById('cfForceSendBtn').disabled = false;
});

document.getElementById('cfStopBtn')?.addEventListener('click', () => {
    if (cfIntervalTimer) {
        clearInterval(cfIntervalTimer);
        cfIntervalTimer = null;
    }
    nextSendTime = null;
    updateCfStatusDisplay();
    localStorage.setItem('cf_auto_send_enabled', 'false'); // Save state
});

// Check auto-send enabled state on load
const autoSendEnabled = localStorage.getItem('cf_auto_send_enabled');
if (autoSendEnabled === 'true') {
    startCfTimer();
} else {
    updateCfStatusDisplay(); // Ensure display is updated even if stopped
}

// ==========================================
// Feature: Auto-Fetch Event Ranking from Window 1
// ==========================================
async function updateEventRankingFromWindow1() {
    console.log("[EventRanking] Updating...");
    const monitor1 = monitors[0];
    if (!monitor1) return;

    // サイドバーのエリア取得
    const container = document.getElementById('sidebar-ranking');
    if (!container) return;

    // 既存の "Upcoming Mode" (External Ranking) エリアがあれば非表示にする
    const extRank = document.getElementById('external-ranking-container');
    if (extRank) extRank.style.display = 'none';

    let eventRankingDiv = document.getElementById('event-ranking-container');

    // コンテナがない場合は作成
    if (!eventRankingDiv) {
        eventRankingDiv = document.createElement('div');
        eventRankingDiv.id = 'event-ranking-container';
        eventRankingDiv.style.borderTop = '2px solid #333';
        eventRankingDiv.style.marginTop = '5px';
        eventRankingDiv.style.paddingTop = '5px';
        eventRankingDiv.style.flex = 'none'; // 自動で広げない
        eventRankingDiv.style.overflowY = 'auto';
        eventRankingDiv.style.background = '#e3f2fd';
        eventRankingDiv.style.height = '30%'; // 下3割を使う

        // 挿入場所: ranking-table-body を含むdivの後ろ、あるいは最後
        // containerの構造: h4, div(Time), div(Report), div(Table), div(ExtRank)
        // Tableエリアの高さを制限して、その下に配置

        const tableArea = container.querySelector('div[style*="overflow-y:auto"]');
        if (tableArea) {
            tableArea.style.flex = '1'; // 残りのスペース全て(上7割)
            tableArea.style.height = 'auto'; // 固定高さを解除

            // 既に挿入済みでなければ挿入
            if (!container.contains(eventRankingDiv)) {
                container.appendChild(eventRankingDiv);
            }
        } else {
            container.appendChild(eventRankingDiv);
        }
    }

    // Window 1 が接続済みで、イベント情報を持っているか確認
    if (!monitor1.currentEvent || !monitor1.currentEvent.event_id) {
        eventRankingDiv.innerHTML = `
            <div style="padding:10px; font-size:0.85em; color:#666; text-align:center;">
                イベント情報なし<br>
                <span style="font-size:0.8em;">(Window 1 待機中...)</span>
            </div>
        `;
        return;
    }

    const eventId = monitor1.currentEvent.event_id;
    const eventName = monitor1.currentEvent.event_name;
    // 画像URLの候補を増やす
    const eventImage = monitor1.currentEvent.image_url || monitor1.currentEvent.image || monitor1.currentEvent.image_l || monitor1.currentEvent.banner_url;

    // イベントページへのURL生成
    let eventUrl = '#';
    const urlKey = monitor1.currentEvent.event_url_key || monitor1.currentEvent.url_key;

    if (urlKey) {
        eventUrl = `https://www.showroom-live.com/event/${urlKey}`;
        if (monitor1.currentEvent.block_id) {
            eventUrl += `?block_id=${monitor1.currentEvent.block_id}`;
            // Also ensure we handle cases where urlKey might already have query params (unlikely for urlKey but good practice?)
            // Usually urlKey is just the path part like 'event_name'.
        }
    } else if (monitor1.currentEvent.event_url) {
        eventUrl = monitor1.currentEvent.event_url;
    } else if (monitor1.currentEvent.event_id) {
        //eventUrl = `https://www.showroom-live.com/event/identifier?event_id=${monitor1.currentEvent.event_id}`;
        // event_idだけでは飛ばないので、ルームプロフィールへ誘導
        eventUrl = `https://www.showroom-live.com/room/profile?room_id=${monitor1.roomId}`;
    } else {
        // 何もない場合もルームプロフィールへ
        eventUrl = `https://www.showroom-live.com/room/profile?room_id=${monitor1.roomId}`;
    }
    // console.log("[EventRanking] Generated URL:", eventUrl, monitor1.currentEvent);

    // ヘッダー部分を先に描画（リンク追加）
    const headerHtml = `
        <div style="padding:5px; margin-bottom:5px; border-bottom:1px solid #ccc;">
            <div style="font-weight:bold; font-size:0.9em; margin-bottom:5px; color:#333;">
                参加イベント：<br>
                <a href="${eventUrl}" target="_blank" style="color:#2196F3; text-decoration:underline;">${eventName || '不明'}</a>
            </div>
            ${eventImage ? `<a href="${eventUrl}" target="_blank"><img src="${eventImage}" style="max-height:50px; display:block; margin:0 auto 5px auto; border-radius:4px; border:0;"></a>` : ''}
        </div>
    `;

    // リスト部分のプレースホルダー
    const listPlaceHolder = `<div id="event-ranking-list-body" style="padding:10px; color:#666; text-align:center;">ランキング読み込み中...</div>`;

    // --- Use EventRankingManager for Table ---

    // Ensure structure exists: Header + Container for Manager
    if (!document.getElementById('mw-event-header')) {
        eventRankingDiv.innerHTML = `<div id="mw-event-header">${headerHtml}</div>`;
        let rankingContainer = document.createElement('div');
        rankingContainer.id = 'mw-event-ranking-container';
        rankingContainer.style.flex = '1';
        rankingContainer.style.overflow = 'hidden';
        eventRankingDiv.appendChild(rankingContainer);
    } else {
        // Update header content
        document.getElementById('mw-event-header').innerHTML = headerHtml;
    }

    // Initialize Manager if needed
    if (!window.mwEventRankingManager) {
        window.mwEventRankingManager = new EventRankingManager('mw-event-ranking-container', { compact: true });
    }

    // Initialize or Update
    if (window.mwEventRankingManager.currentRoomId !== monitor1.roomId) {
        window.mwEventRankingManager.init(monitor1.roomId);
    } else {
        window.mwEventRankingManager.update();
    }
}

// Global function for click handler
window.requestAssignRoom = function (roomId, name, points) {
    if (!roomId) return;

    // Check if open
    for (let i = 0; i < monitors.length; i++) {
        if (monitors[i].roomId == roomId) {
            alert(`既に Window ${i + 1} で開いています`);
            return;
        }
    }

    // Find target Window (Start from 2)
    let target = null;

    // First, look for DISCONNECTED + NO ROOM ID (Empty)
    for (let i = 1; i < monitors.length; i++) {
        if (!monitors[i].connected && !monitors[i].roomId) {
            target = monitors[i];
            break;
        }
    }

    // Next, look for ANY DISCONNECTED
    if (!target) {
        for (let i = 1; i < monitors.length; i++) {
            if (!monitors[i].connected) {
                target = monitors[i];
                break;
            }
        }
    }

    if (!target) {
        if (!confirm("空いているウィンドウがありません (Window 2-6)。\\nWindow 2 に上書きしますか？")) {
            return;
        }
        target = monitors[1];
    }

    if (target) {
        if (target.connected) target.disconnect();

        target.roomId = String(roomId);
        target.ui.roomIdInput.value = roomId;
        target.initialPoints = points;
        target.ui.initPointsInput.value = points;
        target.pointsSet = true; // Auto-set
        target.updateResetBtnState();

        target.connect();
    }
}

// Check every 30 seconds
setInterval(updateEventRankingFromWindow1, 30000);

// ==========================================
// Global Server Stats Connection (Added)
// ==========================================
(function initServerStats() {
    let globalSocket = null;
    let reconnectTimer = null;

    function connectGlobalWs() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        globalSocket = new WebSocket(`${protocol}//${location.host}/ws`);

        globalSocket.onopen = () => {
            console.log('[GlobalWS] Connected for stats.');
            // Send a ping periodically to keep alive if needed, or just wait for broadcasts
        };

        globalSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'connection_count') {
                    // Update Header UI
                    // Expected format: data.connected_users, data.active_screens
                    const elStats = document.getElementById('server-stats');
                    if (elStats) {
                        elStats.innerHTML = `💻 ${data.connected_users} <span style="font-size:0.8em; margin-left:5px;">🚪 ${data.active_screens}</span>`;
                    }
                }
            } catch (e) {
                // Ignore non-JSON or other messages
            }
        };

        globalSocket.onclose = () => {
            // console.log('[GlobalWS] Closed. Reconnecting in 5s...');
            globalSocket = null;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(connectGlobalWs, 5000);
        };

        globalSocket.onerror = (e) => {
            // console.warn('[GlobalWS] Error:', e);
        };
    }

    // Start connection
    connectGlobalWs();
})();


// Initialize Monitors
// ... (rest of the file is handled by existing code or user actions)
