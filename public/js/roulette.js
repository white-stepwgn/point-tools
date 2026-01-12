// roulette.js

// --- State Management ---
const GameState = {
    IDLE: 'idle',
    OPEN: 'open',
    CLOSED: 'closed',
    DRAWING: 'drawing', // Active drawing phase
    FINISHED: 'finished'
};

let currentState = GameState.OPEN;
let participants = [];
// Participant Structure:
// {
//   name: "User",
//   targets: [1, 5, 9],
//   id: "uid",
//   hits: [] // Array of matched numbers
// }

let settings = {
    digitCount: 3,
    maxNumber: 9, // "Ball Pool Size" (1 to maxNumber)
    spinDuration: 3.0, // Seconds
    winnerFontSize: 1.5, // em
    allowDuplicates: false,
    gameType: 'box_draw'
};

// --- Persistence ---
function loadSettings() {
    const saved = localStorage.getItem('roulette_settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            // Merge saved settings
            settings = { ...settings, ...parsed };
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }
}

function saveSettings() {
    localStorage.setItem('roulette_settings', JSON.stringify(settings));
}

// Load immediately
loadSettings();

let gameBox = []; // [1, 2, ... maxNumber]
let drawnHistory = [];

// --- DOM Elements ---
const participantsList = document.getElementById('participantsList');
const participantCount = document.getElementById('participantCount');

const resultMessage = document.getElementById('resultMessage');
const deadlineBtn = document.getElementById('deadlineBtn');
const deadlineStatus = document.getElementById('deadlineStatus');
const gameVisual = document.getElementById('gameVisual');
const nextDrawBtn = document.getElementById('nextDrawBtn');
const historyDisplay = document.getElementById('historyDisplay');

// --- WebSocket Handler ---
window.handleIncomingMessage = function (msg) {
    if (window.broadcastKey && document.getElementById("statusSpan").textContent === "キー取得中...") {
        setStatus("接続完了", "#4CAF50");
    }
    // console.log("Received msg:", msg); // Debug

    if (msg.comment) {
        // Already in expected format (e.g. from internal test or converted)
        processComment(msg.comment);
    } else if (msg.cm) {
        // Raw Showroom Format (t=1 is comment)
        // Map to expected structure
        const adapted = {
            comment: msg.cm,
            user: {
                name: msg.ac,
                user_id: msg.u
            },
            avatar: {
                url: `https://image.showroom-cdn.com/showroom-prod/image/avatar/${msg.av}.png`
            }
        };
        processComment(adapted);
    }
};

function setStatus(text, color) {
    const s = document.getElementById("statusSpan");
    if (s) {
        s.textContent = text;
        s.style.background = color;
    }
}

// --- Game Logic ---

function processComment(commentData) {
    // console.log("Processing:", commentData);
    // Only accept comments if state is OPEN
    if (currentState !== GameState.OPEN) {
        console.log("Ignored: Game not OPEN");
        return;
    }

    // Normalize Full-width digits to Half-width
    const text = commentData.comment.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
    const user = commentData.user.name;
    const uid = commentData.user.user_id;

    // Parse digits
    let chunks;
    if (settings.maxNumber <= 9) {
        // If maxNumber is single digit (1-9), treat every digit as a separate number
        chunks = text.match(/\d/g);
    } else {
        // If maxNumber >= 10, treat contiguous digits as one number
        chunks = text.match(/\d+/g);
    }

    if (!chunks) {
        // console.log("No digits found in:", text);
        return;
    }

    // Convert to integers
    let nums = chunks.map(c => parseInt(c));

    // Filter by maxNumber
    nums = nums.filter(n => n >= 1 && n <= settings.maxNumber);
    if (nums.length === 0) {
        console.log("No valid numbers in range");
        return;
    }

    // Unique numbers only 
    let uniqueNums = [...new Set(nums)];

    // Must match settings.digitCount exactly (or more, then truncated)
    if (uniqueNums.length < settings.digitCount) {
        console.log(`Not enough numbers: ${uniqueNums.length} < ${settings.digitCount}`);
        return; // Reject partial entries
    }

    // Limit to settings.digitCount
    if (uniqueNums.length > settings.digitCount) {
        uniqueNums = uniqueNums.slice(0, settings.digitCount);
    }

    // We can also allow updating.
    const existingIndex = participants.findIndex(p => p.id === uid);

    if (existingIndex >= 0) {
        participants[existingIndex].targets = uniqueNums;
        participants[existingIndex].hits = []; // Reset hits
        updateParticipantUI(existingIndex);
    } else {
        participants.push({
            name: user,
            targets: uniqueNums,
            hits: [],
            id: uid,
            avatar_url: commentData.avatar ? commentData.avatar.url : null
        });
        addParticipantUI(participants[participants.length - 1]);
    }
    updateCount();
}

function toggleDeadline() {
    if (currentState === GameState.OPEN) {
        currentState = GameState.CLOSED;
        deadlineBtn.classList.add('disabled');
        deadlineBtn.style.background = '#555';
        deadlineStatus.textContent = "締め切り済み";
        resultMessage.textContent = "抽選開始待ち";
    } else if (currentState === GameState.CLOSED) {
        currentState = GameState.OPEN;
        deadlineBtn.classList.remove('disabled');
        deadlineBtn.style.background = '';
        deadlineStatus.textContent = "受付中";
        resultMessage.textContent = "エントリー受付中";
    }
}

// Prepare the game (Reset box, history)
function startGame() {
    if (currentState !== GameState.CLOSED && currentState !== GameState.DRAWING) {
        alert("まずは締め切ってください");
        return;
    }

    if (currentState === GameState.CLOSED) {
        // Init Game
        currentState = GameState.DRAWING;

        // Generate Box 1..maxNumber
        gameBox = [];
        for (let i = 1; i <= settings.maxNumber; i++) {
            gameBox.push(i);
        }

        drawnHistory = [];

        // Reset Participant Hits
        participants.forEach(p => p.hits = []);
        updateAllParticipantsUI();

        historyDisplay.innerHTML = "";

        gameVisual.textContent = "START";

        nextDrawBtn.style.display = 'block';
        nextDrawBtn.textContent = "最初のボールを引く";
        resultMessage.textContent = `抽選開始 (残り${settings.digitCount}回)`;
    } else {
        // Already started?
        alert("すでに開始しています");
    }
}

function drawNextBall() {
    if (currentState !== GameState.DRAWING) return;

    // If box is empty (edge case: digiCount > maxNumber?)
    // Or just if we reached digitCount
    if (drawnHistory.length >= settings.digitCount || gameBox.length === 0) {
        alert("終了しています");
        return;
    }

    // Disable button during animation
    nextDrawBtn.disabled = true;

    // Animation
    let count = 0;
    const intervalTime = 80; // ms
    // Calculate valid checks based on duration
    // e.g. 3.0s * 1000 = 3000ms / 80ms = 37.5 -> 37 ticks
    const maxTicks = (settings.spinDuration * 1000) / intervalTime;

    const interval = setInterval(() => {
        // Show random remaining ball
        const randIdx = Math.floor(Math.random() * gameBox.length);
        gameVisual.textContent = gameBox[randIdx];
        count++;
        if (count > maxTicks) {
            clearInterval(interval);
            finalizeDraw();
        }
    }, intervalTime);
}

function finalizeDraw() {
    // Pick real random ball
    const randIdx = Math.floor(Math.random() * gameBox.length);
    const drawnNum = gameBox[randIdx];

    // Remove from box
    gameBox.splice(randIdx, 1);
    drawnHistory.push(drawnNum);

    // Visuals
    gameVisual.textContent = drawnNum;

    // Add PREVIOUS ball to History UI (if exists)
    // The current ball is already shown in gameVisual, so move the *previous* one to history
    if (drawnHistory.length > 1) {
        const prevNum = drawnHistory[drawnHistory.length - 2];
        const ballSpan = document.createElement('span');
        ballSpan.textContent = prevNum;
        ballSpan.style.background = "#FFC107";
        ballSpan.style.color = "#000";
        ballSpan.style.borderRadius = "50%";
        ballSpan.style.width = "40px";
        ballSpan.style.height = "40px";
        ballSpan.style.display = "flex";
        ballSpan.style.justifyContent = "center";
        ballSpan.style.alignItems = "center";
        ballSpan.style.fontWeight = "bold";
        historyDisplay.appendChild(ballSpan);
    }

    // Check Hits for this number
    const roundWinners = [];
    participants.forEach((p, idx) => {
        if (p.targets.includes(drawnNum)) {
            if (!p.hits.includes(drawnNum)) {
                p.hits.push(drawnNum);
                roundWinners.push(p.name);
                // Update specific UI
                updateParticipantUI(idx);
            }
        }
    });

    const remaining = settings.digitCount - drawnHistory.length;

    if (roundWinners.length > 0) {
        // Display names of winners
        const names = roundWinners.join(', ');
        resultMessage.innerHTML = `
            <div style="color:#FFC107; font-weight:bold; font-size:1.2em; margin-bottom:5px;">HIT! (${roundWinners.length}名)</div>
            <div class="winner-highlight" style="font-size: ${settings.winnerFontSize}em;">${names}</div>
        `;
    } else {
        resultMessage.textContent = `HITなし...`;
    }

    nextDrawBtn.disabled = false;

    if (remaining > 0 && gameBox.length > 0) {
        nextDrawBtn.textContent = `次を引く (残り${remaining}回)`;
    } else {
        finishGame();
    }
}

function finishGame() {
    currentState = GameState.FINISHED;
    nextDrawBtn.style.display = 'none';

    // Calculate Full Match Winners
    const fullWinners = participants.filter(p => p.hits.length >= settings.digitCount); // Or == settings.digitCount if exact
    // Or p.hits.length === p.targets.length ?
    // If user picked fewer than setting?
    // "Selected setting amount of numbers" -> Assume they picked exactly N.

    if (fullWinners.length > 0) {
        const names = fullWinners.map(p => p.name).join(', ');
        resultMessage.innerHTML = `
            <div style="font-size:1.5em; color:#4CAF50; margin-bottom:10px;">全的中おめでとう！ (${fullWinners.length}名)</div>
            <div class="winner-highlight" style="font-size: ${settings.winnerFontSize}em; color: #4CAF50; border-color: #4CAF50; background: rgba(76, 175, 80, 0.2);">${names}</div>
        `;

        fullWinners.forEach(p => {
            const div = document.getElementById(`user-${p.id}`);
            if (div) {
                div.classList.add('winner-row');
            }
        });
    } else {
        resultMessage.textContent = "全的中者はいませんでした...";
    }
}

function resetGame() {
    if (!confirm("リセットしますか？")) return;
    participants = [];
    currentState = GameState.OPEN;
    gameBox = [];
    drawnHistory = [];

    participantsList.innerHTML = '';
    historyDisplay.innerHTML = '';
    updateCount();


    resultMessage.textContent = "エントリー受付中";
    gameVisual.textContent = "READY";

    deadlineBtn.classList.remove('disabled');
    deadlineBtn.style.background = '';
    deadlineStatus.textContent = "受付中";

    nextDrawBtn.style.display = 'none';
}


// --- UI Helpers ---

function addParticipantUI(p) {
    const div = document.createElement('div');
    div.className = 'participant-item';
    div.id = `user-${p.id}`;
    renderParticipantContent(div, p);
    participantsList.prepend(div);
}

function updateParticipantUI(index) {
    const p = participants[index];
    const div = document.getElementById(`user-${p.id}`);
    if (div) {
        renderParticipantContent(div, p);
    }
}

function updateAllParticipantsUI() {
    participants.forEach((p, i) => updateParticipantUI(i));
}

function renderParticipantContent(div, p) {
    // Show targets, dimming ones that haven't hit, highlighting ones that have
    // p.targets = [1, 2], p.hits = [1]

    let html = ``;
    p.targets.forEach(num => {
        const isHit = p.hits.includes(num);
        const className = isHit ? 'hit-number' : 'miss-number';
        html += `<span class="${className}">${num}</span>`;
    });

    // Hit count status
    const status = p.hits.length > 0 ? `<span style="font-size:0.8em; color:#4CAF50">(${p.hits.length}的中)</span>` : ``;

    div.innerHTML = `
        <div style="display:flex; flex-direction:column;">
            <div style="font-size:1.1em;">${html} ${status}</div>
            <div class="participant-name">${p.name}</div>
        </div>
    `;

    // Sorting? Maybe move winners to top?
    // Let's keep insert order for now or move hit items to top.
}

function updateCount() {
    participantCount.textContent = `${participants.length} 人`;
}

// --- Settings ---
document.addEventListener('DOMContentLoaded', () => {
    // Settings Logic
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const digitSelect = document.getElementById('digitSelect');

    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'flex';
            if (digitSelect) digitSelect.value = settings.digitCount;
            const maxInput = document.getElementById('maxNumInput');
            if (maxInput) maxInput.value = settings.maxNumber;
            const durInput = document.getElementById('durationInput');
            if (durInput) durInput.value = settings.spinDuration;
            const fontInput = document.getElementById('fontSizeInput');
            if (fontInput) {
                fontInput.value = settings.winnerFontSize;
                const preview = document.getElementById('fontPreview');
                if (preview) preview.style.fontSize = `${settings.winnerFontSize}em`;
            }
        });
    }

    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.style.display = 'none';
        });
    }

    if (digitSelect) {
        digitSelect.addEventListener('change', () => {
            settings.digitCount = parseInt(digitSelect.value);
            saveSettings();
            updateHint();
        });
    }

    const maxNumInput = document.getElementById('maxNumInput');
    if (maxNumInput) {
        maxNumInput.addEventListener('change', () => {
            let val = parseInt(maxNumInput.value);
            if (val < 1) val = 1;
            if (val > 99) val = 99;
            settings.maxNumber = val;
            saveSettings();
            updateHint();

            // Re-init hint message immediately
            if (resultMessage && currentState === GameState.OPEN) {
                resultMessage.textContent = `1 - ${settings.maxNumber}から${settings.digitCount} 個選んでください`;
            }
        });
    }

    const durationInput = document.getElementById('durationInput');
    if (durationInput) {
        durationInput.addEventListener('change', () => {
            let val = parseFloat(durationInput.value);
            if (val < 0.1) val = 0.1;
            settings.spinDuration = val;
            saveSettings();
        });
    }

    const fontSizeInput = document.getElementById('fontSizeInput');
    if (fontSizeInput) {
        fontSizeInput.addEventListener('input', () => { // 'input' for real-time
            let val = parseFloat(fontSizeInput.value);
            if (val < 0.1) val = 0.1;
            settings.winnerFontSize = val;
            saveSettings();

            const preview = document.getElementById('fontPreview');
            if (preview) preview.style.fontSize = `${val}em`;
        });
    }

    // Font Test Button
    const testFontDisplayBtn = document.getElementById('testFontDisplayBtn');
    if (testFontDisplayBtn) {
        testFontDisplayBtn.addEventListener('click', () => {
            const testName = "あいうえおかきくけこさしすせそなにぬねの";
            resultMessage.innerHTML = `
                <div style="font-size:1.5em; color:#4CAF50; margin-bottom:10px;">表示テスト (1名)</div>
                <div class="winner-highlight" style="font-size: ${settings.winnerFontSize}em; color: #4CAF50; border-color: #4CAF50; background: rgba(76, 175, 80, 0.2);">${testName}</div>
            `;
        });
    }

    const updateHint = () => {
        if (resultMessage && currentState === GameState.OPEN) {
            resultMessage.textContent = `1 - ${settings.maxNumber}から${settings.digitCount} 個選んでください`;
        }
    };

    // Init hint on load based on loaded settings
    updateHint();

    // Test
    const testBtn = document.getElementById('testCommentBtn');
    const testInput = document.getElementById('testCommentInput');
    const testNameInput = document.getElementById('testNameInput');
    const testIdInput = document.getElementById('testIdInput');

    if (testBtn && testInput) {
        testBtn.addEventListener('click', () => {
            console.log("Test button clicked");
            const text = testInput.value;
            const name = testNameInput && testNameInput.value ? testNameInput.value : "Test User";
            const customId = testIdInput && testIdInput.value ? testIdInput.value : null;

            if (!text) {
                console.log("Empty input");
                return;
            }

            // Simulate a comment message object
            // Use customId if provided, else fallback to name-based ID
            const mockMsg = {
                comment: text,
                user: {
                    name: name,
                    user_id: customId || ("test_" + name)
                }
            };

            console.log("Processing test comment:", text, "Name:", name, "ID:", mockMsg.user.user_id);
            processComment(mockMsg);
            testInput.value = "";
        });
    }
});

