
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

        this.ui.connectBtn.addEventListener('click', async () => {
            if (this.connected) {
                this.disconnect();
                return;
            }

            let inputVal = this.ui.roomIdInput.value.trim();

            // Allow URL conversion
            if (inputVal.startsWith('http')) {
                try {
                    this.updateStatus('connecting', 'Converting URL...');
                    const res = await fetch(`/convert_url?url=${encodeURIComponent(inputVal)}`);
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

            const rid = parseInt(inputVal);
            if (!isNaN(rid) && rid > 0) {
                this.roomId = rid;
                this.initialPoints = parseInt(this.ui.initPointsInput.value) || 0;
                this.connect();
            } else {
                alert('Please enter a valid Room ID or Showroom URL.');
            }
        });

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

    toggleConnection() {
        if (this.connected) {
            this.disconnect();
        } else {
            const rid = this.ui.roomIdInput.value.trim();
            if (!rid) return;
            this.roomId = rid;
            this.initialPoints = parseInt(this.ui.initPointsInput.value) || 0;
            this.connect();
        }
    }

    async setInitialPoints() {
        // Try to fetch from Event API first
        if (this.roomId) {
            try {
                this.updateStatus('connecting', 'Fetching Event Points...');
                const res = await fetch(`/api/event_points?room_id=${this.roomId}`);
                const json = await res.json();

                // Navigate json: event -> ranking -> point
                let foundPoint = null;
                if (json.event && json.event.ranking && json.event.ranking.point !== undefined) {
                    foundPoint = json.event.ranking.point;
                } else if (json.point !== undefined) {
                    // Fallback if structure is flat
                    foundPoint = json.point;
                }

                if (foundPoint !== null) {
                    this.ui.initPointsInput.value = foundPoint;
                    console.log(`[Room ${this.roomId}] Event Points Fetched: ${foundPoint}`);
                } else {
                    console.log(`[Room ${this.roomId}] No event points found.`);
                }
                this.updateStatus('connected', 'ONLINE (Proxy)');
            } catch (e) {
                console.warn(`[Room ${this.roomId}] Event fetch failed:`, e);
                this.updateStatus('connected', 'ONLINE (Proxy)'); // Revert status
            }
        }

        // Mark as set
        this.pointsSet = true;
        this.updateResetBtnState();

        const newInitPoints = parseInt(this.ui.initPointsInput.value) || 0;
        this.initialPoints = newInitPoints;
        this.updateTotalPoints();
        updateGlobalRanking();
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

                if (obj.g > 1000) {
                    if (obj.g) {
                        this.processGift(obj);
                    }
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
        setTimeout(() => {
            monitor.toggleConnection();
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
