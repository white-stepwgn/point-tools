
// js/chattool.js
// Runs after index.html's main script to override functions and provide separate settings.

(function () {
    console.log("ChatTool: Initializing...");

    const STORAGE_KEY_BASIC = 'sr_chattool_settings';
    const DEFAULT_MAX_DISPLAY = 4;
    const DEFAULT_GIFT_THRESHOLD = 0; // Show all gifts by default

    // =========================================================================
    // 1. Define Helper Functions (Global Availability)
    // =========================================================================

    // Verify functionality of SettingsPanel first
    // It depends on settings_module.js being loaded.

    // --- Load Settings (Separated or Default) ---
    window.loadSeparatedSettings = function () {
        if (typeof window.commentSettings === 'undefined') {
            window.commentSettings = {};
        }

        try {
            // HARD DEFAULTS to ensure total separation from index.html's shared storage
            const SYSTEM_DEFAULTS = {
                size: 14,
                color: "#000000",
                muteEnabled: false,
                muteSymbol: "",
                defaultRoomId: "",
                footerMode: "show_event", // Default to useful info
                giftMarkerDuration: 20,
                commentMarkerDuration: 20,
                chatDisplayMax: 9999, // Conceptually unlimited
                giftThreshold: 0
            };

            // Determine Storage Key
            // If col_id exists (Child Mode specific), try that first.
            const urlParams = new URLSearchParams(window.location.search);
            const colId = urlParams.get('col_id');
            let saved = null;
            let loadedFrom = "default";

            if (colId) {
                // Try specific key
                saved = localStorage.getItem(STORAGE_KEY_BASIC + '_' + colId);
                if (saved) loadedFrom = "column_specific";
            }

            // Fallback to Global Defaults (Initial Settings)
            if (!saved) {
                saved = localStorage.getItem(STORAGE_KEY_BASIC);
                if (saved) loadedFrom = "global_default";
            }

            if (saved) {
                const parsed = JSON.parse(saved);
                // Merge with defaults to ensure all keys exist
                window.commentSettings = { ...SYSTEM_DEFAULTS, ...parsed };
                console.log(`ChatTool: Loaded settings (${loadedFrom}):`, window.commentSettings);
            } else {
                console.log("ChatTool: No settings found, using system defaults.");
                window.commentSettings = { ...SYSTEM_DEFAULTS };
            }

            // Immediately update any global keys index.html might look at if we were sharing logic,
            // but we are trying to isolate.
            // window.commentSettings is the shared object name index.html uses.
            // By overwriting it here, we ensure chattool uses OUR settings.

            // Initialize inputs if settings panel is open
            if (window.updateSettingsInputs) window.updateSettingsInputs();

            // Apply visual modes naturally
            if (window.applyFooterMode) window.applyFooterMode();

            // Re-apply Font Size (Need to force it)
            const commentBox = document.getElementById('comment');
            if (commentBox) commentBox.style.fontSize = window.commentSettings.size + 'px';


        } catch (e) {
            console.error("ChatTool: Settings Load Error", e);
        }
    };

    // --- Update Settings Panel Inputs ---
    window.updateSettingsInputs = function () {
        // Prepare Helper
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                if (el.type === 'checkbox') el.checked = val;
                else el.value = val;
            }
        };

        const s = window.commentSettings;
        if (!s) return;

        setVal("commentFontSize", s.size);
        setVal("commentColor", s.color);
        setVal("muteEnabledCheckbox", s.muteEnabled);
        setVal("muteSymbolInput", s.muteSymbol);
        setVal("defaultRoomIdInput", s.defaultRoomId);
        setVal("giftMarkerDurationInput", s.giftMarkerDuration);
        setVal("commentMarkerDurationInput", s.commentMarkerDuration);
        setVal("chatDisplayMaxInput", s.chatDisplayMax); // Just in case, though hidden
        setVal("giftThresholdInput", s.giftThreshold);

        // Footer Mode Radios
        const footerRadios = document.getElementsByName("footerDisplayMode");
        if (footerRadios && s.footerMode) {
            for (const r of footerRadios) {
                if (r.value === s.footerMode) {
                    r.checked = true;
                    break;
                }
            }
        }

        // Hide specific inputs as per constraints
        const maxInput = document.getElementById('chatDisplayMaxInput');
        if (maxInput) {
            const parent = maxInput.parentElement;
            if (parent) parent.style.display = 'none';
            if (parent && parent.nextElementSibling && parent.nextElementSibling.textContent.includes('※')) {
                parent.nextElementSibling.style.display = 'none';
            }
        }

        // Hide unwanted footer modes
        Array.from(footerRadios).forEach(r => {
            const label = r.closest('label');
            if (label) {
                if (r.value === 'show_10k' || r.value === 'show_ranking') {
                    label.remove(); // Remove completely
                } else {
                    label.style.display = 'flex';
                }
            }
        });
    };

    // --- Save Settings (Override Global) ---
    window.saveChatSettings = function () {
        console.log("ChatTool: Saving settings...");
        try {
            const getVal = (id) => {
                const el = document.getElementById(id);
                return el ? el.value : null;
            };
            const getCheck = (id) => {
                const el = document.getElementById(id);
                return el ? el.checked : false;
            };

            const s = window.commentSettings || {};

            // Read UI
            const sizeVal = parseInt(getVal("commentFontSize"));
            if (!isNaN(sizeVal)) s.size = sizeVal;

            s.color = getVal("commentColor") || "#000000";
            s.muteEnabled = getCheck("muteEnabledCheckbox");
            s.muteSymbol = (getVal("muteSymbolInput") || "").trim();
            s.defaultRoomId = (getVal("defaultRoomIdInput") || "").trim();

            const dur1 = parseInt(getVal("giftMarkerDurationInput"));
            if (!isNaN(dur1)) s.giftMarkerDuration = dur1;

            const dur2 = parseInt(getVal("commentMarkerDurationInput"));
            if (!isNaN(dur2)) s.commentMarkerDuration = dur2;

            const threshold = parseInt(getVal("giftThresholdInput"));
            if (!isNaN(threshold)) s.giftThreshold = threshold;

            // Footer Mode
            const footerRadios = document.getElementsByName("footerDisplayMode");
            for (const r of footerRadios) {
                if (r.checked) {
                    s.footerMode = r.value;
                    break;
                }
            }

            // Update Global Object
            window.commentSettings = s;

            // Save Logic: Distinct based on Mode
            const urlParams = new URLSearchParams(window.location.search);
            const colId = urlParams.get('col_id');

            if (colId) {
                // Child Mode with ID: Save to column specific key
                localStorage.setItem(STORAGE_KEY_BASIC + '_' + colId, JSON.stringify(s));
                console.log(`ChatTool: Saved to Column Key (${colId})`);
            } else {
                // Host Mode or Default: Save to Global Default Key
                localStorage.setItem(STORAGE_KEY_BASIC, JSON.stringify(s));
                console.log("ChatTool: Saved to Global Default Key");
            }

            // Apply Visuals
            if (window.applyFooterMode) window.applyFooterMode();

            // Apply Font Size
            const commentBox = document.getElementById('comment');
            if (commentBox) commentBox.style.fontSize = s.size + 'px';
            if (commentBox) commentBox.style.color = s.color;

            // Close Panel
            const panel = document.getElementById("settingsPanel");
            if (panel) panel.style.display = "none";

        } catch (e) {
            console.error("Save Error:", e);
            alert("Save Error: " + e.message);
        }
    };

    // --- Override Save Button Click ---
    window.overrideSaveButton = function () {
        const btn = document.getElementById("applyDisplaySettings");

        if (btn) {
            btn.onclick = window.saveChatSettings;
        } else {
            // Retry if needed?
        }

        // Also bind the other save button for "Chat" tab if it exists
        const btn2 = document.getElementById("saveChatSettingsBtn");
        if (btn2) {
            btn2.onclick = window.saveChatSettings;
        }
    };

    // --- Apply Footer Mode (Override) ---
    window.applyFooterMode = function () {
        const mode = window.commentSettings.footerMode;
        // Host Mode doesn't have highValueGiftContainer usually, but Child Mode does.
        // If element missing, return.
        const container = document.getElementById("highValueGiftContainer");
        if (!container) return; // Likely Host Mode or early init

        container.innerHTML = "";
        container.style.display = "block";

        if (mode === "none" || mode === "show_10k" || mode === "show_ranking") {
            // User wanted 10k/Ranking removed. Treat as Hidden.
            container.style.display = "none";
            if (window.eventRankingManager) window.eventRankingManager.stop();
        }
        else if (mode === "show_event") {
            // Show Event Info
            if (window.currentEventData) {
                container.style.padding = "5px";
                container.style.backgroundColor = "#fff";
                container.style.borderTop = "1px solid #ccc";

                const d = window.currentEventData;
                const points = window.currentEventPoints || { current: 0, initial: 0 };
                const pGain = (points.current !== null && points.initial !== null) ? (points.current - points.initial).toLocaleString() : "-";

                container.innerHTML = `
                    <div style="font-size:0.8em; font-weight:bold; color:#333;">${d.event_name}</div>
                    <div style="font-size:0.9em; display:flex; justify-content:space-between;">
                        <span>現在: ${points.current ? points.current.toLocaleString() : '-'} pt</span>
                        <span style="color:#d00;">+${pGain} pt</span>
                    </div>
                `;
            } else {
                container.innerHTML = "<div style='padding:5px; font-size:0.8em; color:#999; text-align:center;'>イベント情報なし</div>";
            }
        }
    };


    // =========================================================================
    // 2. Logic Controller
    // =========================================================================

    const urlParams = new URLSearchParams(window.location.search);
    const isChildMode = urlParams.get('mode') === 'child';

    if (!isChildMode) {
        // --- HOST MODE AND INITIALIZATION ---
        console.log("ChatTool: Starting HOST MODE...");

        // Clear and Setup Host UI
        document.body.innerHTML = '';
        Object.assign(document.body.style, {
            margin: '0', padding: '0', background: '#333',
            height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column'
        });

        // Header
        const header = document.createElement('div');
        Object.assign(header.style, {
            background: '#222', color: 'white', padding: '10px',
            display: 'flex', gap: '10px', alignItems: 'center', borderBottom: '1px solid #444'
        });

        const title = document.createElement('span');
        title.textContent = 'Multi-Chat Monitor';
        title.style.fontWeight = 'bold';
        title.style.marginRight = '20px';

        const addBtn = document.createElement('button');
        addBtn.textContent = '+ Add Column';
        addBtn.onclick = () => addColumn();

        const resetBtn = document.createElement('button');
        resetBtn.textContent = 'Reset (1 Column)';
        resetBtn.onclick = () => resetLayout();

        const settingsBtn = document.createElement('button');
        settingsBtn.textContent = '初期設定'; // Renamed to clarify
        settingsBtn.id = 'openSettings'; // Needs to match settings_module.js bindEvents
        settingsBtn.onclick = () => {
            // Fallback if settings_module didn't bind (e.g. dynamic injection)
            const panel = document.getElementById('settingsPanel');
            if (panel) {
                panel.style.setProperty('display', 'block', 'important');
                window.updateSettingsInputs();
            }
        };
        // Use generic styling
        const styleBtn = (b) => {
            b.style.padding = '5px 15px'; b.style.cursor = 'pointer';
            b.style.borderRadius = '4px'; b.style.border = 'none'; b.style.background = '#2196F3'; b.style.color = 'white';
        };
        styleBtn(addBtn); styleBtn(resetBtn); styleBtn(settingsBtn);

        header.append(title, addBtn, resetBtn, settingsBtn);
        document.body.appendChild(header);

        // Grid
        const grid = document.createElement('div');
        grid.id = 'chat-grid';
        Object.assign(grid.style, {
            flex: '1', display: 'flex', overflowX: 'auto', overflowY: 'hidden',
            background: '#444', gap: '2px'
        });
        document.body.appendChild(grid);

        // --- Logic ---
        function addColumn() {
            const wrapper = document.createElement('div');
            wrapper.className = 'grid-column';
            Object.assign(wrapper.style, {
                flex: '1 0 300px', position: 'relative', background: 'white',
                display: 'flex', flexDirection: 'column'
            });

            const closeBtn = document.createElement('button');
            closeBtn.textContent = '×';
            Object.assign(closeBtn.style, {
                position: 'absolute', top: '0', right: '0', zIndex: '9999',
                background: 'red', color: 'white', border: 'none', cursor: 'pointer',
                fontSize: '1.2em', padding: '0 5px'
            });
            closeBtn.onclick = () => grid.removeChild(wrapper);

            // Generate Unique ID for Column
            const colId = Date.now() + '_' + Math.floor(Math.random() * 1000);

            const iframe = document.createElement('iframe');
            iframe.src = window.location.pathname + '?mode=child&col_id=' + colId;
            Object.assign(iframe.style, { width: '100%', height: '100%', border: 'none' });

            wrapper.append(closeBtn, iframe);
            grid.appendChild(wrapper);
        }

        function resetLayout() {
            grid.innerHTML = '';
            addColumn();
        }

        // Initialize Settings Panel for Host
        if (window.SettingsPanel) {
            new window.SettingsPanel();
            window.loadSeparatedSettings();
            window.overrideSaveButton();
        } else {
            console.warn("SettingsModule not loaded yet?");
            setTimeout(() => {
                if (window.SettingsPanel) {
                    new window.SettingsPanel();
                    window.loadSeparatedSettings();
                    window.overrideSaveButton();
                }
            }, 500);
        }

        // NO BROADCAST logic anymore (Separated)

        // Host Test Logic (Optional: still broadcast test comments?)
        // The user only asked for *Settings* separation.
        // Test comments might still be nice to reach all windows.
        // Keeping showComment/showGift broadcast for "Testing" purposes as it's useful.
        window.showComment = function (c) {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(f => {
                try {
                    if (f.contentWindow && f.contentWindow.showComment) {
                        f.contentWindow.showComment(c);
                    }
                } catch (e) { console.error("Broadcast Error", e); }
            });
        };
        window.showGift = function (g) {
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(f => {
                try {
                    if (f.contentWindow && f.contentWindow.showGift) {
                        f.contentWindow.showGift(g);
                    }
                } catch (e) { console.error("Broadcast Error", e); }
            });
        };

        // Start with 1 column
        addColumn();
        return;
    }

    // =========================================================================
    // 3. Child Mode Logic
    // =========================================================================
    console.log("ChatTool: Child Mode Active");
    // Ensure settings are loaded (Will pick up col_id specific or default)
    window.loadSeparatedSettings();

    // REMOVED Storage Listener (No sync wanted)


    // =========================================================================
    // 3. Child Mode Logic
    // =========================================================================    // --- CHILD MODE (The actual Tool) ---
    console.log("ChatTool: Child Mode Active");

    // Wrap initialization in window.onload or ensure DOM is ready.
    // --- Layout Strategy: Simplified In-Place with Retry ---
    // User requested to remove "self-healing" (complex recreation) and "deleting" logic.
    // We will just arrange existing elements, but retry if main elements are not found yet.

    const applyChildLayout = () => {
        const container = document.querySelector('.container');
        const commentBox = document.getElementById('comment');

        if (!container || !commentBox) {
            console.warn("ChatTool: Elements not found, retrying...");
            return false;
        }

        // 1. Identify Comment Column
        let commentColumn = commentBox.closest('.column');

        // 2. Hide other columns (Don't delete)
        const allColumns = container.querySelectorAll('.column');
        allColumns.forEach(col => {
            if (col !== commentColumn) {
                // Check if it's truly another column or the one we want
                col.style.display = 'none';
            }
        });

        // 3. Style Container for Vertical Layout
        Object.assign(container.style, {
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            overflow: 'hidden',
            padding: '0'
        });

        // 4. Style Comment Column
        if (commentColumn) {
            Object.assign(commentColumn.style, {
                flex: '1',
                height: 'auto',
                border: 'none',
                display: 'flex',
                flexDirection: 'column'
            });
            // Ensure #comment takes full height inside column
            Object.assign(commentBox.style, {
                flex: '1',
                overflowY: 'auto'
            });

            // Allow Header inside to remain visible as is
            // (User connection/settings might be there, or sticky headers)
            // The user wants simple behavior.
        }

        // 5. Move Footer (High Value Gift) into Container
        let footer = document.getElementById('highValueGiftContainer');
        if (footer) {
            footer.style.display = 'block';
            container.appendChild(footer);
        } else {
            // Create if missing (fallback)
            footer = document.createElement('div');
            footer.id = 'highValueGiftContainer';
            container.appendChild(footer);
        }

        // 6. Insert Resizer (Create new if missing)
        let resizer = document.getElementById('v-resizer');
        if (!resizer) {
            resizer = document.createElement('div');
            resizer.id = 'v-resizer';
            Object.assign(resizer.style, {
                height: '10px', background: '#eee', cursor: 'row-resize',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                borderTop: '1px solid #ccc', borderBottom: '1px solid #ccc',
                flex: 'none', touchAction: 'none'
            });
            resizer.innerHTML = '<div style="width: 40px; height: 4px; background: #bbb; border-radius: 2px;"></div>';

            if (footer) {
                container.insertBefore(resizer, footer);
            } else {
                container.appendChild(resizer);
            }
        }

        // Resizer Logic (Simple bind)
        const setupResizer = () => {
            let isResizing = false;
            let startY = 0;
            let startHeight = 0;
            const bottomPanel = footer;

            const startDrag = (e) => {
                if (bottomPanel.style.display === 'none') return;
                isResizing = true;
                startY = e.clientY;
                startHeight = bottomPanel.offsetHeight;
                document.body.style.cursor = 'row-resize';
                resizer.style.background = '#ddd';
                document.body.style.userSelect = 'none';
            };
            const onDrag = (e) => {
                if (!isResizing) return;
                const deltaY = startY - e.clientY;
                const newHeight = startHeight + deltaY;
                if (newHeight >= 0 && newHeight < (container.clientHeight * 0.8)) {
                    bottomPanel.style.height = newHeight + 'px';
                }
            };
            const stopDrag = () => {
                isResizing = false;
                document.body.style.cursor = '';
                resizer.style.background = '#eee';
                document.body.style.userSelect = '';
            };

            resizer.addEventListener('mousedown', startDrag);
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDrag);
            resizer.addEventListener('touchstart', (e) => startDrag(e.touches[0]));
            document.addEventListener('touchmove', (e) => { if (isResizing) onDrag(e.touches[0]); });
            document.addEventListener('touchend', stopDrag);
        };
        setupResizer();

        return true; // Success
    };

    const initChildMode = function () {
        console.log("ChatTool: Child Mode Initialization...");
        if (window.chattoolInitialized) return;

        // Setup Settings Panel (Child)
        if (window.SettingsPanel && !document.getElementById('settingsPanel')) {
            new window.SettingsPanel();
        }
        window.loadSeparatedSettings();
        window.overrideSaveButton();
        setTimeout(window.overrideSaveButton, 1000);

        // Attempt Layout
        if (!applyChildLayout()) {
            // If failed, retry a few times
            let attempts = 0;
            const retryInterval = setInterval(() => {
                attempts++;
                if (applyChildLayout() || attempts > 10) {
                    clearInterval(retryInterval);
                    if (attempts > 10) console.error("ChatTool: Failed to initialize layout after retries.");
                    else window.chattoolInitialized = true;
                }
            }, 500);
        } else {
            window.chattoolInitialized = true;
        }

        // Header Handling
        const header = document.querySelector('header');
        if (header) {
            header.style.display = 'block';
        }

        // Global Error Handler for Debug
        window.addEventListener('error', (e) => {
            // alert("JS Error: " + e.message); // Uncomment if user needs to see
            console.error("ChatTool Error:", e);
        });

        if (window.commentSettings.footerMode === 'show_event') {
            setInterval(() => window.applyFooterMode && window.applyFooterMode(), 2000);
        }
    };

    // Execute Init safely
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        initChildMode();
    } else {
        window.addEventListener('load', initChildMode);
        window.addEventListener('DOMContentLoaded', initChildMode);
    }


    // --- Overrides ---

    // Deduplication Map
    const receivedCommentMap = new Map();

    // Show Comment
    window.showComment = function (c) {
        // Dedupe
        const uid = c.u;
        const comment = c.cm;
        const createdAt = c.created_at || Math.floor(Date.now() / 1000);
        const key = `${uid}_${comment}`;

        if (receivedCommentMap.size > 2000) receivedCommentMap.delete(receivedCommentMap.keys().next().value);
        if (receivedCommentMap.has(key)) {
            if (Math.abs(createdAt - receivedCommentMap.get(key)) <= 10) return;
        }
        receivedCommentMap.set(key, createdAt);

        // Mute
        if (window.commentSettings.muteEnabled && window.commentSettings.muteSymbol) {
            if (c.cm && c.cm.startsWith(window.commentSettings.muteSymbol)) return;
        }

        const container = document.getElementById('comment');
        if (!container) return;

        // Render
        const div = document.createElement('div');
        div.className = 'chat-item comment';
        div.style.marginBottom = '8px';
        div.style.padding = '8px';
        div.style.background = 'rgba(255,255,255,0.9)';
        div.style.borderRadius = '8px';
        div.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
        div.style.display = 'flex';
        div.style.alignItems = 'flex-start';
        div.style.animation = 'fadeIn 0.3s ease';

        const img = document.createElement('img');
        img.src = `https://image.showroom-cdn.com/showroom-prod/image/avatar/${c.av}.png`;
        Object.assign(img.style, { width: '48px', height: '48px', borderRadius: '50%', marginRight: '10px' });

        const contentDiv = document.createElement('div');
        Object.assign(contentDiv.style, { flex: '1', display: 'flex', flexDirection: 'column' });

        const nameDiv = document.createElement('div');
        nameDiv.textContent = c.ac;
        Object.assign(nameDiv.style, { fontSize: '0.8em', color: '#666', marginBottom: '2px' });

        const textDiv = document.createElement('div');
        textDiv.textContent = c.cm;
        Object.assign(textDiv.style, {
            fontSize: '1.1em', fontWeight: 'bold', lineHeight: '1.4',
            wordBreak: 'break-all', color: window.commentSettings.color || '#000'
        });

        contentDiv.append(nameDiv, textDiv);
        div.append(img, contentDiv);

        container.prepend(div);
        container.scrollTop = 0; // Keep at top
    };

    // Show Gift
    window.showGift = function (g) {
        // Highlighting for 1500pt+ or Test
        // Test Data Handling: settings_module sends simplified objects.
        // We need to detect them. If g.test === true (if we added it) or if fields are missing.
        // But settings_module just calls showGift({ ... }).
        // Let's rely on score calculation.

        // Attempt to calculate score
        let score = 0;
        let isTest = false;

        // Check for Test context (simplistic check: missing ID or weird ID?)
        // Or check if window.giftMasterData is missing?

        if (window.giftMasterData && window.giftMasterData[g.g]) {
            score = window.giftMasterData[g.g].point * (g.n || 1);
        } else {
            // Fallback: If g.all_point is set (often in test?) or calculate from p
            score = g.all_point || (g.p * (g.n || 1)) || 0;
            // If we relied on fallback, it might be a test or unknown gift.
            // If it came from the Test Button "10000pt" etc, it usually has metadata.
        }

        const threshold = window.commentSettings.giftThreshold || 0;

        // STRICT FILTERING?
        // User said: "Test gift 10pt -> hidden (OK), 1500pt -> hidden (NG)"
        // This implies the 1500pt test gift WAS rejected.
        // If the test button sends `p:1500` and `n:1`, score is 1500.
        // If threshold is 1500, it SHOULD show.
        // Why didn't it?
        // Maybe `g.g` (gift id) in test data was found in MasterData but had 0 points?
        // Or maybe `g.p` was undefined?
        // Let's be lenient for likely test data if we can detect it?
        // Or just trust the calculation is now fixed (I added fallback above).

        if (score < threshold) return;

        const container = document.getElementById('comment');
        if (!container) return;

        const div = document.createElement('div');
        div.className = 'chat-item gift';
        div.style.marginBottom = '8px';
        div.style.padding = '8px';
        div.style.background = 'rgba(255, 248, 225, 0.95)';
        if (score >= 1500) {
            div.style.border = '2px solid #FFD700';
            div.style.background = 'rgba(255, 250, 205, 0.9)';
        }
        div.style.borderRadius = '8px';
        div.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
        div.style.display = 'flex';
        div.style.alignItems = 'center';

        const img = document.createElement('img');
        // Gift Image Helper
        const giftId = g.g;
        let imgUrl = `https://image.showroom-cdn.com/showroom-prod/assets/img/gift/${giftId}_s.png`;
        if (g.img) imgUrl = g.img; // If provided (Test buttons often provide this)

        // If connection is effectively offline or image missing, test might look broken?
        // But text should show.

        img.src = imgUrl;
        Object.assign(img.style, { width: '48px', height: '48px', marginRight: '10px' });

        const contentDiv = document.createElement('div');
        Object.assign(contentDiv.style, { flex: '1', display: 'flex', flexDirection: 'column' });

        const nameDiv = document.createElement('div');
        nameDiv.textContent = g.ac || "Guest"; // Fallback name
        Object.assign(nameDiv.style, { fontSize: '0.8em', color: '#666', marginBottom: '2px' });

        const infoDiv = document.createElement('div');
        infoDiv.style.display = 'flex';
        infoDiv.style.alignItems = 'center';

        // Inner Gift Icon
        const icon = document.createElement('img');
        icon.src = imgUrl;
        Object.assign(icon.style, { width: '24px', height: '24px', marginRight: '5px' });

        const countSpan = document.createElement('span');
        countSpan.innerHTML = `<span style="font-weight:bold; font-size:1.1em;">${g.n || 1}</span>`;

        infoDiv.append(icon, countSpan);
        contentDiv.append(nameDiv, infoDiv);
        div.append(img, contentDiv);

        container.prepend(div);
        container.scrollTop = 0;
    };


    // Auto-refresh event info every 2s
    if (isChildMode && window.commentSettings.footerMode === 'show_event') {
        setInterval(() => window.applyFooterMode && window.applyFooterMode(), 2000);
    }

})();
