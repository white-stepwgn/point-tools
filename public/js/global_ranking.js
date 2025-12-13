
// Helper for circled numbers
function getCircledNumber(num) {
    const circled = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
    return circled[num - 1] || `(${num})`;
}

// Global Ranking Logic
let referenceMonitorIndex = 0; // Default to first window

// Setting 3: Global Ranking Font Sizes
const GLOBAL_RANKING_SETTINGS = {
    POINTS_FONT_SIZE: "1.1em",       // Total Points (e.g. 2,548,019)
    DIFF_FONT_SIZE: "1.0em",         // Point Difference (e.g. +62,446)
    INSTANT_POINTS_FONT_SIZE: "0.9em" // Velocity / Instant Points
};

// Auto-refresh ranking to update velocity/predictions every 5 seconds
let rankingUpdateInterval = setInterval(() => {
    // Only update if no recent gifts (otherwise addToPending handles it)
    updateGlobalRanking();
}, 5000);

let lastInsight = "";
// Clock Update
function updateClock() {
    const el = document.getElementById('current-clock');
    if (el) {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('ja-JP', { hour12: false });
    }
}
setInterval(updateClock, 1000);
updateClock(); // Init

let eventEndTime = null;
let isEventEnded = false;

function updateGlobalRanking() {
    // Stop updates if event ended
    if (isEventEnded) return;

    // Check Event Time
    if (eventEndTime) {
        const now = new Date();
        if (now >= eventEndTime) {
            isEventEnded = true;
            document.getElementById('event-end-display').textContent = "イベント終了 (更新停止)";
            clearInterval(rankingUpdateInterval); // Stop auto updates
            return; // Don't run this update (freeze state)
        }
    }

    const tbody = document.getElementById('ranking-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    // Gather data
    const data = monitors.map(m => {
        const total = m.initialPoints + m.sessionPoints + (m.pendingPoints || 0);
        const vel = m.getVelocity ? m.getVelocity(60) : 0; // 1 min velocity
        return {
            index: m.index,
            roomId: m.roomId || '-',
            points: total,
            monitor: m,
            velocity: vel
        };
    });

    // Check if we should override 'pendingPoints' contribution if we want to freeze exactly at end time?
    // Usually 'Stop at end time' means 'Snapshot at that moment'.
    // Since we return above, the display freezes at the last update BEFORE end time or AT end time.
    // That should be fine.

    // Determine reference points
    let refData = data.find(d => d.index === referenceMonitorIndex);
    // If no ref selected (or index 0), default to index 0
    if (!refData && data.length > 0) refData = data[0];

    // Calculate Rank
    const sortedForRank = [...data].sort((a, b) => b.points - a.points);
    const rankMap = {};
    const dataWithRank = [];

    sortedForRank.forEach((item, i) => {
        rankMap[item.index] = i + 1;
        item.rank = i + 1;
        dataWithRank.push(item);
    });

    // Create rows based on WINDOW ORDER
    data.forEach((item) => {
        const rank = rankMap[item.index];
        const isRef = item.index === referenceMonitorIndex;

        let diff = 0;
        let prediction = "";
        let dangerLevel = "safe"; // safe, warning, danger
        let insight = "";

        // Get Room Name
        let rName = item.monitor.ui && item.monitor.ui.roomName ? item.monitor.ui.roomName.textContent.trim() : "";
        if (!rName) rName = `ID:${item.roomId}`;

        // Comparison Logic
        if (!isRef && refData) {
            diff = item.points - refData.points;

            // Prediction
            const relVel = item.velocity - refData.velocity; // Positive if item is faster than ref

            // If item is behind (-) and faster (+), it will catch up
            if (diff < 0 && relVel > 0) {
                const minToCatch = Math.abs(diff) / relVel;
                if (minToCatch < 60) prediction = `${Math.ceil(minToCatch)}分後抜く`;
            }
            // If item is ahead (+) and slower (-), it will be caught
            else if (diff > 0 && relVel < 0) {
                const minToCaught = diff / Math.abs(relVel);
                if (minToCaught < 60) prediction = `${Math.ceil(minToCaught)}分後抜かれる`;
            }

            // Danger Calculation (Simulated)
            // If 1 rank difference and gap < 5000 or catching up fast
            const rankDiff = Math.abs(rank - refData.rank);
            if (rankDiff === 1) {
                if (Math.abs(diff) < 10000) dangerLevel = "warning";
                if (Math.abs(diff) < 2000) dangerLevel = "danger";

                if (prediction && prediction.includes("分後")) dangerLevel = "danger";
            }
        }

        // Row Styling
        let bgStyle = "background:white;";
        if (dangerLevel === "warning") bgStyle = "background:#fffde7;"; // Yellow tint
        if (dangerLevel === "danger") bgStyle = "background:#ffebee;"; // Red tint
        if (isRef) bgStyle = "background:#e3f2fd;"; // Blue tint for self

        // Selected Border
        let borderStyle = "border-bottom:1px solid #ccc;";
        if (isRef) {
            // Apply thick border to the whole row
            borderStyle = "border: 3px solid #007bff; z-index:10; position:relative;";
        }

        const tr = document.createElement('tr');
        tr.style.cssText = `${bgStyle} font-size:0.85em; ${borderStyle}`;

        const diffStr = diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
        // User requested: Positive (Threat) -> Red, Negative (Safe) -> Green
        const diffColor = diff > 0 ? '#d00' : (diff < 0 ? 'green' : '#999');

        const velStr = item.velocity > 0 ? `+${item.velocity.toLocaleString()}/m` : '0/m';
        const velIcon = item.velocity > 1000 ? '🔥' : (item.velocity > 0 ? '↗' : '→');

        tr.innerHTML = `
            <td style="text-align:center; vertical-align:middle; padding:2px; width:20px;">
                <input type="radio" name="ref-room" value="${item.index}" ${isRef ? 'checked' : ''} onclick="setReference(${item.index})">
            </td>
            <td style="text-align:center; vertical-align:middle; padding:2px; font-weight:bold; width:25px;">
                ${getCircledNumber(item.index + 1)}
            </td>
            <td style="padding:4px;">
                <div style="display:flex; align-items:center; overflow:hidden;">
                    <span style="font-weight:bold; color:#d00; margin-right:5px; flex-shrink:0; font-size:1.1em;">${rank}位</span>
                    <span style="font-size:1.0em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:bold;" title="${rName}">${rName}</span>
                </div>
                <div style="display:flex; justify-content:flex-start; gap:10px; margin-top:2px; align-items:baseline;">
                    <span style="display:inline-block; width:120px; text-align:right; font-variant-numeric:tabular-nums; font-weight:bold; font-size:${GLOBAL_RANKING_SETTINGS.POINTS_FONT_SIZE};">${item.points.toLocaleString()}</span>
                    <span style="display:inline-block; width:120px; text-align:right; font-variant-numeric:tabular-nums; color:${diffColor}; font-weight:bold; font-size:${GLOBAL_RANKING_SETTINGS.DIFF_FONT_SIZE};">${diffStr}</span>
                </div>
                <div style="display:flex; justify-content:space-between; margin-top:2px; color:#555; font-size:${GLOBAL_RANKING_SETTINGS.INSTANT_POINTS_FONT_SIZE};">
                    <span style="font-weight:bold;">${velIcon} ${velStr}</span>
                    <span style="color:#d00; font-weight:bold;">${prediction}</span>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });

    // Generate Smart Insight (Top of sidebar?)
    // Need a container for this. We'll inject one if not exists or assume simple header update.
    // For now, let's look for #sidebar-insight
    generateInsights(dataWithRank, refData);
}

// Event Setting Handler
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('event-end-set-btn');
    const input = document.getElementById('event-end-input');
    const display = document.getElementById('event-end-display');

    if (btn) {
        btn.onclick = () => {
            if (!input.value) {
                eventEndTime = null;
                isEventEnded = false;
                display.textContent = "";
                return;
            }

            const now = new Date();
            const [h, m, s] = input.value.split(':').map(Number);
            const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0);

            // If target is in past (e.g. set 23:00 at 01:00, assume next day? Or just today?)
            // Usually events are same day. If user sets time earlier than now, maybe they mean tomorrow or it's mistake.
            // Let's assume today.
            if (target < now) {
                // If diff is huge, maybe tomorrow? 
                // Let's keep it simple: strict today time.
                // Or if it's "End Time", and it's passed, it ends immediately.
            }

            eventEndTime = target;
            isEventEnded = false;

            // Clear interval if it was stopped
            if (!rankingUpdateInterval) {
                rankingUpdateInterval = setInterval(() => {
                    updateGlobalRanking();
                }, 5000);
            }

            display.textContent = `Set: ${target.toLocaleTimeString()}`;
            updateGlobalRanking();
        };
    }
});

function generateInsights(allData, refData) {
    const container = document.getElementById('sidebar-report-area');
    if (!container) return; // Need to create this in HTML

    // Analysis relative to Reference
    if (!refData) return;

    const myRank = refData.rank;
    let msg = "状況監視中...";
    let alertType = "normal"; // normal, warning, critical, anomaly

    // 1. Anomaly Detection (Higest Priority)
    let anomalyItem = null;
    let anomalyTrend = null;

    for (const d of allData) {
        if (d.monitor.getVelocityTrend) {
            const trend = d.monitor.getVelocityTrend();
            if (trend.isAbnormal) {
                // Pick the most dramatic one if multiple?
                if (!anomalyTrend || trend.ratio > anomalyTrend.ratio) {
                    anomalyTrend = trend;
                    anomalyItem = d;
                }
            }
        }
    }

    if (anomalyItem) {
        msg = `⚠ ${anomalyItem.rank}位が異常加速 (通常の${anomalyTrend.ratio}倍)`;
        alertType = "anomaly";
    } else {
        // 2. Standard Strategy (Neighbors)
        const above = allData.find(d => d.rank === myRank - 1);
        const below = allData.find(d => d.rank === myRank + 1);

        if (above) {
            const gap = above.points - refData.points;
            const catchTime = (refData.velocity > above.velocity) ? gap / (refData.velocity - above.velocity) : -1;

            if (catchTime > 0 && catchTime < 5) {
                msg = `好機！${Math.ceil(catchTime)}分で${above.rank}位を抜けます！`;
                alertType = "critical"; // Good critical (Green/Blue?) or Red? User said "Safe/Danger".
                // Good news -> Blue maybe? But "Critical" usually means ACT NOW.
            }
        }

        // If not catching above, check below (Danger usually overrides Opportunity in importance?)
        // Let's prioritize DANGER from below over Opportunity above if time is short.
        if (below) {
            const gap = refData.points - below.points;
            const caughtTime = (below.velocity > refData.velocity) ? gap / (below.velocity - refData.velocity) : -1;

            if (caughtTime > 0 && caughtTime < 10) {
                // If warning is more urgent than opportunity
                if (alertType !== "critical" || caughtTime < 3) {
                    msg = `警告！${Math.ceil(caughtTime)}分後に${below.rank}位に抜かれます`;
                    alertType = "critical";
                }
            } else if (below.velocity > refData.velocity * 1.5) {
                if (alertType === "normal") {
                    msg = `注意：${below.rank}位が急加速中`;
                    alertType = "warning";
                }
            }
        }
    }

    container.textContent = msg;

    // Style update
    container.style.fontWeight = 'bold';
    if (alertType === "anomaly") {
        container.style.background = "#D50000"; // Strong Red
        container.style.color = "white";
        // Maybe blink?
    } else if (alertType === "critical") {
        container.style.background = "#ffcdd2"; // Light Red
        container.style.color = "#d00";
    } else if (alertType === "warning") {
        container.style.background = "#fff9c4"; // Yellow
        container.style.color = "#f57f17";
    } else {
        container.style.background = "#f0f0f0";
        container.style.color = "#555";
    }
}

function setReference(index) {
    referenceMonitorIndex = index;
    updateGlobalRanking();
}

// Hook into RoomMonitor updates
// We already added updateGlobalRanking() call in addToPending.
// We should also call it when Initial Points change or Connect happens.
