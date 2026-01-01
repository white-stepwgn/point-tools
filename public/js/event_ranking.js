/**
 * EventRankingManager
 * Handles fetching and rendering of Showroom Event Ranking data.
 */
class EventRankingManager {
    constructor(containerId) {
        this.containerId = containerId;
        this.currentRoomId = null;
        this.currentRoomId = null;
        this.currentEventId = null;
        this.currentBlockId = null;
        this.currentUrlKey = null;
        this.rankingData = [];
        this.eventInfo = null;
        this.currentRoomRanking = null;
        this.updateInterval = null;
    }

    /**
     * Initialize or update the ranking view for a specific room.
     */
    async init(roomId) {
        this.currentRoomId = roomId;
        await this.update();

        // Start periodic update (every 60 seconds)
        if (this.updateInterval) clearInterval(this.updateInterval);
        this.updateInterval = setInterval(() => this.update(), 60000);
    }

    /**
     * Reset the manager state and clear the view.
     */
    reset() {
        this.currentRoomId = null;
        this.currentEventId = null;
        this.currentBlockId = null;
        this.currentUrlKey = null;
        this.rankingData = [];
        this.eventInfo = null;
        this.currentRoomRanking = null;

        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Clear DOM immediately
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">データを読み込み中...</div>';
        }
    }

    /**
     * Fetch the latest ranking data and render it.
     */
    async update() {
        if (!this.currentRoomId) return;

        try {
            // 1. Get current room's event and support info (Pattern A)
            const resPoints = await fetch(`/api/event_points?room_id=${this.currentRoomId}`);
            const jsonPoints = await resPoints.json();

            if (!jsonPoints || !jsonPoints.event) {
                this.renderNoEvent();
                return;
            }

            this.currentEventId = jsonPoints.event.event_id;
            this.currentBlockId = jsonPoints.event.block_id || null;
            this.eventInfo = jsonPoints.event;

            // Extract URL key from event_url (e.g. https://www.showroom-live.com/event/key)
            if (jsonPoints.event.event_url) {
                const match = jsonPoints.event.event_url.match(/\/event\/([^\?]+)/);
                if (match) this.currentUrlKey = match[1];
            }

            // Extract current room's rank and points from Pattern A
            if (jsonPoints.ranking) {
                this.currentRoomRanking = {
                    rank: jsonPoints.ranking.rank,
                    point: jsonPoints.ranking.point,
                    gap: jsonPoints.ranking.gap,
                    next_rank: jsonPoints.ranking.next_rank,
                    next_point: jsonPoints.ranking.next_point
                };
            }

            // 2. Get full ranking (Pattern B)
            if (this.currentEventId) {
                let url = `/api/events_ranking?event_id=${this.currentEventId}&room_id=${this.currentRoomId}`;
                if (this.currentBlockId) {
                    url += `&block_id=${this.currentBlockId}`;
                }
                if (this.currentUrlKey) {
                    url += `&url_key=${this.currentUrlKey}`;
                }
                const resRank = await fetch(url);
                const jsonRank = await resRank.json();

                if (jsonRank && (jsonRank.ranking || jsonRank.block_ranking_list)) {
                    this.rankingData = jsonRank.ranking || jsonRank.block_ranking_list || [];
                } else {
                    // Start retry logic if empty result
                    console.warn("[EventRanking] Empty ranking data, retrying once...");
                    await new Promise(r => setTimeout(r, 1000));
                    const resRankRetry = await fetch(url);
                    const jsonRankRetry = await resRankRetry.json();
                    if (jsonRankRetry) {
                        this.rankingData = jsonRankRetry.ranking || jsonRankRetry.block_ranking_list || [];
                    }
                }
            }

            this.render();
        } catch (e) {
            console.error("[EventRankingManager] Update failed:", e);
        }
    }

    /**
     * Stop updates.
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Render the ranking table.
     */
    render() {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Header section with all information in one horizontal bar
        let html = `
            <div class="ranking-header-bar" style="padding: 10px; background: #e3f2fd; border-bottom: 1px solid #bbdefb; display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
                <div style="font-weight: bold; font-size: 1.1em; color: #1565c0;">イベントランキング</div>
                <div id="ranking-update-time" style="font-size: 0.85em; color: #666; background: rgba(255,255,255,0.6); padding: 2px 10px; border-radius: 12px; border: 1px solid #bbdefb;">更新: ${new Date().toLocaleTimeString()}</div>
        `;

        if (this.currentRoomRanking) {
            html += `
                <div style="display: flex; align-items: center; gap: 15px; border-left: 2px solid #bbdefb; padding-left: 15px;">
                    <div style="font-weight: bold;">現在の順位: <span style="font-size: 1.25em; color: #1976d2;">${this.currentRoomRanking.rank}位</span></div>
                    <div>ポイント: <span style="font-weight: bold;">${this.currentRoomRanking.point.toLocaleString()} pt</span></div>
            `;
            if (this.currentRoomRanking.next_rank) {
                const gap = this.currentRoomRanking.next_point - this.currentRoomRanking.point;
                html += `
                    <div style="font-size: 0.9em; color: #d32f2f; background: #ffebee; padding: 2px 10px; border-radius: 4px; border: 1px solid #ffcdd2;">
                        ${this.currentRoomRanking.next_rank}位まであと: <span style="font-weight: bold;">${gap > 0 ? gap.toLocaleString() : 0} pt</span>
                    </div>
                `;
            }
            html += `</div>`;
        } else {
            html += `
                <div style="color: #666; font-style: italic; border-left: 2px solid #bbdefb; padding-left: 15px; display: flex; align-items: center; gap: 8px;">
                    <div class="loading-dots">現在の順位情報を取得中...</div>
                </div>
            `;
        }

        html += `</div>`;

        // Table section
        html += `
            <div class="ranking-table-wrapper" style="overflow-y: auto; flex: 1; background: #fff; padding: 0 10px;">
                <table style="width: 100%; max-width: 800px; border-collapse: collapse; font-size: 0.9em; margin-right: auto;">
                    <thead style="position: sticky; top: 0; background: #eee; z-index: 1;">
                        <tr>
                            <th style="padding: 6px; border-bottom: 2px solid #ddd; width: 40px; text-align: center;">順位</th>
                            <th style="padding: 6px; border-bottom: 2px solid #ddd; text-align: left;">ルーム名</th>
                            <th style="padding: 6px 10px; border-bottom: 2px solid #ddd; text-align: right; width: 100px;">ポイント</th>
                            <th style="padding: 6px 10px; border-bottom: 2px solid #ddd; text-align: right; width: 100px;">差分</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        if (this.rankingData && this.rankingData.length > 0) {
            // Find current room point first
            let currentRoomPoint = 0;
            const currentRoomItem = this.rankingData.find(item => {
                const roomInfo = item.room || {};
                const rId = item.room_id || roomInfo.room_id || item.id || roomInfo.id;
                return parseInt(rId) === parseInt(this.currentRoomId);
            });
            if (currentRoomItem) {
                const criRoomInfo = currentRoomItem.room || {};
                currentRoomPoint = currentRoomItem.point !== undefined ? currentRoomItem.point : (criRoomInfo.point !== undefined ? criRoomInfo.point : 0);
            }

            this.rankingData.forEach((item, index) => {
                // Robust data extraction: Showroom API properties can vary
                const roomInfo = item.room || {};
                const roomName = item.room_name || roomInfo.room_name || item.main_name || roomInfo.main_name || item.performer_name || roomInfo.performer_name || roomInfo.name || "Unknown";
                const avatarId = item.avatar_id || roomInfo.avatar_id || 0;
                const roomId = item.room_id || roomInfo.room_id || item.id || roomInfo.id;
                const point = item.point !== undefined ? item.point : (roomInfo.point !== undefined ? roomInfo.point : 0);

                const isCurrent = parseInt(roomId) === parseInt(this.currentRoomId);
                const rowBg = isCurrent ? "#fff9c4" : (index % 2 === 0 ? "#fff" : "#fafafa");

                // Calculate point difference with current room
                let gapHtml = "-";
                if (currentRoomPoint > 0) {
                    const diff = point - currentRoomPoint;
                    if (isCurrent) {
                        gapHtml = `<span style="color: #999; font-size: 0.8em;">0</span>`;
                    } else if (diff > 0) {
                        gapHtml = `<span style="color: #d32f2f; font-size: 0.8em;">+${diff.toLocaleString()}</span>`;
                    } else {
                        gapHtml = `<span style="color: #388e3c; font-size: 0.8em;">${diff.toLocaleString()}</span>`;
                    }
                }

                html += `
                    <tr style="background: ${rowBg}; border-bottom: 1px solid #eee;">
                        <td style="padding: 6px; text-align: center; font-weight: bold;">${item.rank}</td>
                        <td style="padding: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${roomName}">
                            <a href="https://www.showroom-live.com/room/profile?room_id=${roomId}" target="_blank" style="text-decoration: none; color: #333; display: block; width: 100%; overflow: hidden; text-overflow: ellipsis;">${roomName}</a>
                        </td>
                        <td style="padding: 6px 10px; text-align: right; font-weight: bold; font-family: monospace;">${point.toLocaleString()}</td>
                        <td style="padding: 6px 10px; text-align: right; font-family: monospace;">${gapHtml}</td>
                    </tr>
                `;
            });
        } else {
            html += `<tr><td colspan="4" style="padding: 20px; text-align: center; color: #999;">ランキングデータがありません</td></tr>`;
        }

        html += `
                    </tbody>
                </table>
            </div>
        `;

        // Create Flex Container
        const flexContainer = `
            <div style="display: flex; height: 100%; overflow: hidden;">
                <!-- Sidebar -->
                <div style="width: 220px; background: #fff; border-right: 1px solid #ddd; padding: 10px; overflow-y: auto; flex-shrink: 0; box-sizing: border-box;">
                    ${this.renderSidebarContent()}
                </div>
                
                <!-- Main Content (Header + Table) -->
                <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                    ${html}
                </div>
            </div>
        `;

        container.innerHTML = flexContainer;
    }

    renderSidebarContent() {
        if (!this.eventInfo) return '<div style="color:#999;">イベント情報なし</div>';

        const start = this.eventInfo.started_at ? new Date(this.eventInfo.started_at * 1000).toLocaleString() : '-';
        const end = this.eventInfo.ended_at ? new Date(this.eventInfo.ended_at * 1000).toLocaleString() : '-';

        return `
            <div style="text-align: center; margin-bottom: 10px;">
                <img src="${this.eventInfo.image}" style="width: 100%; border-radius: 4px; border: 1px solid #eee;">
            </div>
            <div style="font-weight: bold; font-size: 0.9em; margin-bottom: 8px; line-height: 1.4;">
                <a href="${this.eventInfo.event_url}" target="_blank" style="text-decoration: none; color: #333;">${this.eventInfo.event_name}</a>
            </div>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 8px 0;">
            <div style="font-size: 0.8em; color: #666;">
                <div>期間:</div>
                <div style="font-size: 0.9em;">${start}</div>
                <div style="text-align: center;">～</div>
                <div style="font-size: 0.9em;">${end}</div>
            </div>
        `;
    }

    renderNoEvent() {
        const container = document.getElementById(this.containerId);
        if (container) {
            container.innerHTML = "<div style='padding: 20px; text-align: center; color: #999;'>現在参加中のイベントはありません</div>";
        }
    }
}

// Global instance
window.eventRankingManager = null;
