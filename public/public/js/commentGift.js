// commentGift.js

const commentBox = document.getElementById("comment");
const paidGiftBox = document.getElementById("paidGift");
const freeGiftBox = document.getElementById("freeGift");

const roomNameSpan = document.getElementById("roomNameSpan");
const startedSpan = document.getElementById("startedSpan");

function handleIncomingMessage(msg) {
    // --- Room名・開始時刻 ---
    if (msg.room && msg.room.name) {
        roomNameSpan.textContent = "Room: " + msg.room.name;
    }
    if (msg.live && msg.live.started_at) {
        const t = new Date(msg.live.started_at * 1000);
        startedSpan.textContent = "開始: " + t.toLocaleString();
    }

    // --- コメント ---
    if (msg.comment) {
        const div = document.createElement("div");
        div.textContent = msg.comment.user.name + " : " + msg.comment.comment;
        commentBox.prepend(div);
    }

    // --- 有料ギフト ---
    if (msg.gift && msg.gift.is_free === 0) {
        const div = document.createElement("div");
        div.textContent = `💎 ${msg.gift.user.name}: ${msg.gift.gift_name}`;
        paidGiftBox.prepend(div);
    }

    // --- 無料ギフト ---
    if (msg.gift && msg.gift.is_free === 1) {
        const div = document.createElement("div");
        div.textContent = `⭐ ${msg.gift.user.name}: ${msg.gift.gift_name}`;
        freeGiftBox.prepend(div);
    }
}

// ===============================
//   過去ログ取得
// ===============================
async function fetchPastLogs(roomId) {
    const url = `https://www.showroom-live.com/api/live/comment_log?room_id=${roomId}`;

    try {
        const r = await fetch(url);
        const json = await r.json();
        if (!json.comments) return;

        json.comments.forEach((c) => {
            const div = document.createElement("div");
            div.textContent = `${c.user_name} : ${c.comment}`;
            commentBox.append(div);
        });
    } catch (e) {
        console.log("過去ログ取得エラー:", e);
    }
}

window.handleIncomingMessage = handleIncomingMessage;
window.fetchPastLogs = fetchPastLogs;
