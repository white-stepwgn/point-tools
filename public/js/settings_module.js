

// Define helper functions before the class
function loadSeparatedSettings() { console.log('loadSeparatedSettings shim'); }
function overrideSaveButton() { console.log('overrideSaveButton shim'); }

window.SettingsPanel = class SettingsPanel {
    constructor() {
        this.panelId = 'settingsPanel';

        // Initialize Settings Separation (ONLY for Chat Tool)
        // Check if we are in Chat Tool context
        const isChatToolGlobal = window.location.pathname.includes('chattool') || window.location.search.includes('mode=child');

        if (isChatToolGlobal) {
            // Execute ONLY if in chattool.html
            loadSeparatedSettings();
            overrideSaveButton();
            // Also retry override in case of race condition or re-injection
            setTimeout(overrideSaveButton, 1000);
        } else {
            // In index.html, we do NOTHING. 
            // We let index.html use its own logic.
            // But settings_module.js defines the SettingsPanel class.
            // index.html instantiates SettingsPanel.
            // Does SettingsPanel constructor rely on separation? No.
            // But render() adds the HTML.

            // Wait, does index.html NEED updateBasicInputs?
            // index.html has its own implementation of updateDisplaySettings/applyDisplaySettings.
            // So we strictly avoid running interference logic here.
            console.log("SettingsModule: Not in ChatTool. Separation logic skipped.");
        }

        this.render();
        this.setupTabs();
        this.bindEvents();
    }

    render() {
        // 開発中の再読み込み対応
        const existing = document.getElementById(this.panelId);
        if (existing) existing.remove();

        const html = `<div id="${this.panelId}"
            style="display:none !important; top: 50%; left: 50%; transform: translate(-50%, -50%); position: fixed; margin: 0; min-width: 460px; z-index: 99999 !important; background:white; border:1px solid #ccc; border-radius:8px; box-shadow:0 4px 15px rgba(0,0,0,0.3);">
            <div id="settingsHeader"
                style="background: #eee; padding: 8px 12px; cursor: default; border-bottom: 1px solid #ccc; border-radius: 8px 8px 0 0; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold;">設定</span>
                <button id="closeSettings" style="border: none; background: none; cursor: pointer; font-size: 1.2em; font-weight:bold; color:#666;">✕</button>
            </div>

            <!--タブ切り替えボタン -->
            <div style="display:flex; border-bottom:1px solid #ddd; background:#f9f9f9;">
                <div class="settings-tab active" data-target="tab1" style="flex:1; padding:10px; text-align:center; cursor:pointer; border-right:1px solid #ddd; background:white; font-weight:bold; border-bottom: 2px solid #2196F3;">設定1 (基本)</div>
                <div class="settings-tab" data-target="tab2" style="flex:1; padding:10px; text-align:center; cursor:pointer; border-right:1px solid #ddd; background:#f0f0f0; color:#666; border-bottom: 2px solid transparent;">設定2 (通信)</div>
                <div class="settings-tab" data-target="tab3" style="flex:1; padding:10px; text-align:center; cursor:pointer; background:#f0f0f0; color:#666; border-bottom: 2px solid transparent;">テスト</div>
                <!-- Chat Tool Tab (Only show if running in chattool.html or child mode) -->
                <div class="settings-tab" id="settingsTab4Trigger" data-target="tab4" style="flex:1; padding:10px; text-align:center; cursor:pointer; border-right:1px solid #ddd; background:#f0f0f0; color:#666; border-bottom: 2px solid transparent; display:none;">チャット</div>
            </div>

            <div style="padding: 15px;">
                <!-- ============================ TAB 1 ============================ -->
                <div id="tab1" class="settings-content" style="display:block;">

                    <!-- コメント設定 -->
                    <div style="margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #eee;">
                        <div style="display:flex; align-items:center; margin-bottom:8px;">
                            <strong style="margin-right:10px; min-width:60px;">文字:</strong>
                            <label style="margin-right:5px;">サイズ</label>
                            <input type="number" id="commentFontSize" value="14" min="10" max="30" style="width:50px; padding:3px; text-align:center; border:1px solid #ccc; border-radius:3px;">
                                <span style="margin-left:5px; margin-right:15px;">px</span>

                                <label style="margin-right:5px;">色</label>
                                <input type="color" id="commentColor" value="#000000" style="cursor:pointer; height:25px; width:40px; border:1px solid #ccc; padding:0; border-radius:3px;">
                                </div>
                        </div>

                        <!-- ルームID設定 -->
                        <div style="margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #eee;">
                            <div style="display:flex; align-items:center;">
                                <label style="margin-right:10px;">初期ルームID:</label>
                                <input type="number" id="defaultRoomIdInput" placeholder="RoomID" style="width: 80px; padding:4px; border:1px solid #ccc; border-radius:3px; margin-right:10px;">
                                    <button id="useCurrentRoomIdBtn" style="font-size: 0.85em; padding: 4px 8px; cursor:pointer; background:#f0f0f0; border:1px solid #ccc; border-radius:3px;">現在のIDを設定</button>
                            </div>
                        </div>

                        <!-- ミュート設定 -->
                        <div style="margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #eee;">
                            <div style="display:flex; align-items:center; margin-bottom:5px;">
                                <input type="checkbox" id="muteEnabledCheckbox" style="margin-right:8px; cursor:pointer; width:16px; height:16px;">
                                    <label for="muteEnabledCheckbox" style="cursor:pointer; user-select:none;">特定の記号で始まるコメントを非表示</label>
                            </div>
                            <div style="display:flex; align-items:center; margin-left:24px;">
                                <span style="font-size:0.9em; margin-right:8px; color:#555;">対象記号:</span>
                                <input type="text" id="muteSymbolInput" placeholder="!,?" maxlength="50" style="width: 120px; text-align: left; padding:3px; border:1px solid #ccc; border-radius:3px;">
                                <span style="font-size:0.8em; margin-left:5px; color:#777;">例)◯,△</span>
                            </div>
                        </div>





                        <!-- ヘッダー表示設定 -->
                        <div style="margin-bottom: 15px; margin-top:10px; border-top:1px solid #eee; padding-top:10px;">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">ヘッダー表示設定</h3>
                            <div style="display:flex; align-items:center;">
                                <input type="checkbox" id="headerKaraokeEnabledCheckbox" style="margin-right:8px; cursor:pointer; width:16px; height:16px;">
                                <label for="headerKaraokeEnabledCheckbox" style="cursor:pointer; user-select:none;">カラオケ情報：○○ キーを表示</label>
                            </div>
                        </div>

                        <div style="margin-bottom: 15px; margin-top:15px; border-top:1px solid #eee; padding-top:10px;">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em; border-bottom:1px solid #eee; padding-bottom:5px;">フッター表示設定</h3>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <label style="cursor: pointer; display:flex; align-items:center;">
                                    <input type="radio" name="footerDisplayMode" value="show_10k" style="margin-right:8px;">
                                    ユーザー別10000PT達成
                                </label>
                                <label style="cursor: pointer; display:flex; align-items:center;">
                                    <input type="radio" name="footerDisplayMode" value="show_event" style="margin-right:8px;">
                                    参加中イベント情報
                                </label>
                                <label style="cursor: pointer; display:flex; align-items:center;">
                                    <input type="radio" name="footerDisplayMode" value="show_ranking" style="margin-right:8px;">
                                    イベントランキング
                                </label>
                                <label style="cursor: pointer; display:flex; align-items:center;">
                                    <input type="radio" name="footerDisplayMode" value="info_list" style="margin-right:8px;">
                                    情報一覧 (テロップ)
                                </label>
                                <!-- Info List Content Input -->
                                <div id="infoListContentArea" style="margin-left: 20px; display:none;">
                                    <textarea id="infoListTextInput" placeholder="表示する情報を入力..." rows="2" style="width: 100%; padding: 5px; border:1px solid #ccc; border-radius:3px; font-size:0.9em; margin-bottom:5px;"></textarea>
                                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; font-size:0.9em;">
                                        <label style="display:flex; align-items:center;">サイズ: <input type="number" id="infoListFontSizeInput" value="30" style="width:50px; margin-left:5px;">px</label>
                                        <label style="display:flex; align-items:center;">色: <input type="color" id="infoListColorInput" value="#333333" style="margin-left:5px; height:25px;"></label>
                                        <label style="display:flex; align-items:center;">速度: <input type="number" id="infoListSpeedInput" value="20" style="width:50px; margin-left:5px;">秒</label>
                                    </div>
                                </div>
                                </div>
                                <label style="cursor: pointer; display:flex; align-items:center;">
                                    <input type="radio" name="footerDisplayMode" value="sr_telop" style="margin-right:8px;">
                                    SRテロップ/カラオケ情報
                                </label>
                                <label style="cursor: pointer; display:flex; align-items:center;">
                                    <input type="radio" name="footerDisplayMode" value="none" style="margin-right:8px;">
                                    空欄（非表示）
                                </label>
                            </div>
                        </div>

                        <!-- マーカー設定 (Moved from Tab 2) -->
                        <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">マーカー設定（赤バー）</h3>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <div style="display:flex; align-items:center;">
                                    <label style="margin-right:10px; min-width:80px;">ギフト表示(秒):</label>
                                    <input type="number" id="giftMarkerDurationInput" value="20" min="1" max="3600" style="width: 60px; padding:4px; border:1px solid #ccc; border-radius:3px; text-align:center;">
                                </div>
                                <div style="display:flex; align-items:center;">
                                    <label style="margin-right:10px; min-width:80px;">コメント表示(秒):</label>
                                    <input type="number" id="commentMarkerDurationInput" value="20" min="1" max="3600" style="width: 60px; padding:4px; border:1px solid #ccc; border-radius:3px; text-align:center;">
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- ============================ TAB 2 ============================ -->
                    <div id="tab2" class="settings-content" style="display:none;">

                        <!-- Cloudflare Settings (Moved from Tab 1) -->
                        <div style="margin-top: 15px; padding:10px; border-radius:5px;">
                            <div style="font-weight:bold; margin-bottom:2px; color:#444;">Cloudflare設定</div>
                            <div style="font-size:0.8em; color:#666; margin-bottom:8px;">ID ユーザー名 収集</div>

                            <!-- URL Input -->
                            <div style="margin-bottom:8px;">
                                <input type="text" id="cfWorkerUrl" placeholder="Worker URL (https://...)" value="https://userid-names.geten777.workers.dev" style="width: 100%; box-sizing: border-box; padding: 6px; border:1px solid #ccc; border-radius:3px; font-size:0.9em;">
                            </div>

                            <!-- Interval Input -->
                            <div style="margin-bottom:10px; display:flex; align-items:center;">
                                <span style="font-size:0.9em; margin-right:5px;">間隔(分):</span>
                                <input type="number" id="cfSendInterval" value="15" min="1" style="width: 60px; padding: 4px; border:1px solid #ccc; border-radius:3px; text-align:center;">
                            </div>

                            <!-- Buttons Row -->
                            <div style="display:flex; gap:5px; margin-bottom:10px; justify-content: space-between;">
                                <button id="cfSaveBtn" style="flex:1; padding: 6px 0; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size:0.85em; font-weight:bold;">保存/開始</button>
                                <button id="cfForceSendBtn" style="flex:1; padding: 6px 0; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer; font-size:0.85em; font-weight:bold;">強制送信</button>
                                <button id="cfStopBtn" style="flex:0 0 50px; padding: 6px 0; background: #F44336; color: white; border: none; border-radius: 4px; cursor: pointer; font-size:0.85em; font-weight:bold;">停止</button>
                                <button id="cfTestConnBtn" style="flex:1; padding: 6px 0; background:#e0e0e0; border:1px solid #ccc; border-radius: 4px; cursor: pointer; font-size:0.85em;">接続テスト</button>
                            </div>

                            <!-- Status Box -->
                            <div style="display:flex; justify-content:flex-end; gap: 10px; align-items: center;">
                                <div style="font-size: 0.8em; color: #888;">
                                    <span id="hbSpan">HB: 10s</span> | <span id="kpSpan">KeyPoll: 5s</span>
                                </div>
                                <div style="width:180px; padding: 6px; background: #fff; border-radius: 4px; border: 1px solid #ddd; text-align:center;">
                                    <span id="cfStatus" style="font-size: 0.9em; font-weight: bold; color:#d00;">停止中</span>
                                </div>
                            </div>

                            <pre id="cfTestResult" style="margin-top:8px; padding:8px; background:#333; color:#0f0; border-radius:4px; font-size:0.8em; white-space:pre-wrap; max-height:100px; overflow-y:auto; display:none;"></pre>
                        </div>

                        <!-- Admin Notice Input -->
                        <div style="margin-top: 15px; padding:10px; border-top:1px solid #eee; background: rgba(255,152,0,0.05); border-radius:5px;">
                            <div style="font-weight:bold; margin-bottom:5px; color:#e65100;">管理者お知らせ送信</div>
                            <div style="display:flex; gap:5px;">
                                <input type="text" id="adminNoticeInput" placeholder="お知らせ内容を入力..." style="flex:1; padding:6px; border:1px solid #ccc; border-radius:4px; font-size:0.9em;">
                                    <button id="sendAdminNoticeBtn" style="padding:6px 12px; background:#ff9800; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; font-size:0.85em;">送信</button>
                            </div>
                            <div style="font-size:0.75em; color:#888; margin-top:4px;">※空欄で送信するとお知らせを消去できます</div>
                        </div>

                        <!-- Server Connection Info -->
                        <div style="margin-top: 15px; padding:10px; border-top:1px solid #eee; background: rgba(76,175,80,0.05); border-radius:5px;">
                            <div style="font-weight:bold; margin-bottom:5px; color:#1b5e20;">サーバー接続情報</div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span style="font-size:1.2em;">💻</span>
                                <span style="font-size:0.9em; color:#444;">現在の同時接続数:</span>
                                <span id="settingsServerConnValue" style="font-weight:bold; color:#1b5e20; font-size:1.1em; border-bottom:2px solid #4CAF50;">1</span>
                                <span style="font-size:0.9em; color:#444;">人</span>
                            </div>
                        </div>
                    </div>

                    <!-- ============================ TAB 4 (CHAT TOOL) ============================ -->
                    <div id="tab4" class="settings-content" style="display:none;">
                        <div style="margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #eee;">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">チャットツール設定</h3>
                            <div style="display:flex; flex-direction:column; gap:10px;">
                                <div style="display:flex; align-items:center; justify-content:space-between;">
                                    <label style="font-weight:bold;">表示枠数 (2-10):</label>
                                    <input type="number" id="chatDisplayMaxInput" value="4" min="2" max="10" style="width:60px; padding:4px; text-align:center; border:1px solid #ccc; border-radius:3px;">
                                </div>
                                <div style="font-size:0.8em; color:#666;">※古いメッセージから消去されます</div>

                                <div style="display:flex; align-items:center; justify-content:space-between; margin-top:5px;">
                                    <label style="font-weight:bold;">ギフト閾値 (pt):</label>
                                    <input type="number" id="giftThresholdInput" value="1500" step="100" min="0" style="width:80px; padding:4px; text-align:center; border:1px solid #ccc; border-radius:3px;">
                                </div>
                                <div style="font-size:0.8em; color:#666;">※これ以上のギフトのみ表示します</div>

                                <div style="margin-top:10px; text-align:right;">
                                    <button id="saveChatSettingsBtn" style="padding:6px 12px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer;">保存して反映</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ============================ TAB 3 (TEST) ============================ -->
                    <div id="tab3" class="settings-content" style="display:none;">

                        <!-- 通信制御 -->
                        <div style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">通信制御</h3>
                            <button id="settingsPauseBtn" style="width:100%; padding:10px; background:#FF5722; color:white; border:none; border-radius:4px; font-weight:bold; cursor:pointer;">通信を停止する</button>
                        </div>

                        <!-- テスト実行 -->
                        <div id="testButtons" style="padding-top:10px;">
                            <h3 style="margin: 0 0 10px 0; font-size: 1.1em;">テストデータ生成</h3>

                            <div style="margin-bottom:10px; display: flex; gap: 5px;">
                                <input type="text" id="testCommentInput" placeholder="カスタムコメントを入力" style="flex: 1; padding: 5px; width: auto;">
                                    <button id="testCommentSendBtn" style="padding: 5px 10px;">送信</button>
                            </div>

                            <div style="margin-bottom:5px;">
                                <button id="testCommentBtn" style="width:100%; margin-bottom:5px;">テストコメント(自動)</button>
                                <button id="testGiftBtn" style="width:100%;">テストギフト（一括）</button>
                            </div>

                            <!-- テストユーザー選択 -->
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                                <div style="font-size: 0.9em; margin-bottom: 5px; font-weight: bold;">テストユーザー選択:</div>
                                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;">
                                    <button class="test-user-btn" data-user-id="1001" data-user-name="テストA" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">A</button>
                                    <button class="test-user-btn" data-user-id="1002" data-user-name="テストB" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">B</button>
                                    <button class="test-user-btn" data-user-id="1003" data-user-name="テストC" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">C</button>
                                    <button class="test-user-btn" data-user-id="1004" data-user-name="テストD" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">D</button>
                                    <button class="test-user-btn" data-user-id="1005" data-user-name="テストE" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">E</button>
                                    <button class="test-user-btn" data-user-id="1006" data-user-name="テストF" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">F</button>
                                </div>
                            </div>

                            <!-- 個数選択ボタン -->
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                                <div style="font-size: 0.9em; margin-bottom: 5px; font-weight: bold;">個数選択:</div>
                                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px;">
                                    <button class="test-count-btn" data-count="1" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×1</button>
                                    <button class="test-count-btn" data-count="2" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×2</button>
                                    <button class="test-count-btn" data-count="3" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×3</button>
                                    <button class="test-count-btn" data-count="4" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×4</button>
                                    <button class="test-count-btn" data-count="5" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×5</button>
                                    <button class="test-count-btn" data-count="6" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×6</button>
                                    <button class="test-count-btn" data-count="7" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×7</button>
                                    <button class="test-count-btn" data-count="8" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×8</button>
                                    <button class="test-count-btn" data-count="9" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×9</button>
                                    <button class="test-count-btn" data-count="10" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×10</button>
                                    <button class="test-count-btn" data-count="100" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×100</button>
                                    <button class="test-count-btn" data-count="1000" style="padding: 5px; font-size: 0.8em; cursor: pointer; border: 2px solid #ddd; border-radius: 4px; background: white;">×1000</button>
                                </div>
                            </div>

                            <!-- テストギフトアイコン -->
                            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                                <div style="font-size: 0.9em; margin-bottom: 5px; font-weight: bold;">テストギフト:</div>
                                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px;">
                                    <img src="https://static.showroom-live.com/image/gift/3000421_s.png?v=7" class="test-gift-icon-new" data-id="3000421" data-type="2" title="無料ギフト(星)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                        <img src="https://static.showroom-live.com/image/gift/3000844_s.png?v=7" class="test-gift-icon-new" data-id="3000844" data-type="2" title="無料ギフト(その他)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                            <img src="https://static.showroom-live.com/image/gift/3_s.png?v=7" class="test-gift-icon-new" data-id="3" data-type="1" title="有料ギフト(3)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                <img src="https://static.showroom-live.com/image/gift/800003_s.png?v=7" class="test-gift-icon-new" data-id="800003" data-type="1" title="有料ギフト(800003)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                    <img src="https://static.showroom-live.com/image/gift/21_s.png?v=7" class="test-gift-icon-new" data-id="21" data-type="1" title="有料ギフト(21)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                        <img src="https://static.showroom-live.com/image/gift/3000349_s.png?v=7" class="test-gift-icon-new" data-id="3000349" data-type="1" title="有料ギフト(3000349)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                            <img src="https://static.showroom-live.com/image/gift/1601_s.png?v=7" class="test-gift-icon-new" data-id="1601" data-type="1" title="ギフトID 1601" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                <img src="https://static.showroom-live.com/image/gift/3000752_s.png?v=7" class="test-gift-icon-new" data-id="3000752" data-type="2" title="無料ギフト(3000752)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                    <img src="https://static.showroom-live.com/image/gift/800093_s.png?v=7" class="test-gift-icon-new" data-id="800093" data-type="1" title="ギフトID 800093" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                        <img src="https://static.showroom-live.com/image/gift/18_s.png?v=7" class="test-gift-icon-new" data-id="18" data-type="1" title="有料ギフト(18)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                            <img src="https://static.showroom-live.com/image/gift/800072_s.png?v=7" class="test-gift-icon-new" data-id="800072" data-type="1" title="有料ギフト(800072)" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                <img src="https://static.showroom-live.com/image/gift/3001128_s.png?v=7" class="test-gift-icon-new" data-id="3001128" data-type="1" title="ギフトID 3001128" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                    <img src="https://static.showroom-live.com/image/gift/3001129_s.png?v=7" class="test-gift-icon-new" data-id="3001129" data-type="1" title="ギフトID 3001129" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                        <img src="https://static.showroom-live.com/image/gift/3001130_s.png?v=7" class="test-gift-icon-new" data-id="3001130" data-type="1" title="ギフトID 3001130" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                            <img src="https://static.showroom-live.com/image/gift/3001131_s.png?v=7" class="test-gift-icon-new" data-id="3001131" data-type="1" title="ギフトID 3001131" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                                <img src="https://static.showroom-live.com/image/gift/3001132_s.png?v=7" class="test-gift-icon-new" data-id="3001132" data-type="1" title="ギフトID 3001132" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                                    <img src="https://static.showroom-live.com/image/gift/3001133_s.png?v=7" class="test-gift-icon-new" data-id="3001133" data-type="1" title="ギフトID 3001133" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                                        <img src="https://static.showroom-live.com/image/gift/3001134_s.png?v=7" class="test-gift-icon-new" data-id="3001134" data-type="1" title="ギフトID 3001134" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                                            <img src="https://static.showroom-live.com/image/gift/3001135_s.png?v=7" class="test-gift-icon-new" data-id="3001135" data-type="1" title="ギフトID 3001135" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                                                <img src="https://static.showroom-live.com/image/gift/3001136_s.png?v=7" class="test-gift-icon-new" data-id="3001136" data-type="1" title="ギフトID 3001136" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                                                    <img src="https://static.showroom-live.com/image/gift/3001137_s.png?v=7" class="test-gift-icon-new" data-id="3001137" data-type="1" title="ギフトID 3001137" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                                                        <img src="https://static.showroom-live.com/image/gift/3001138_s.png?v=7" class="test-gift-icon-new" data-id="3001138" data-type="1" title="ギフトID 3001138" style="width:30px; height:30px; cursor:pointer; border:1px solid #ddd; border-radius:4px;">
                                                                                                                            <!-- 追加アイコンは必要に応じてここに -->
                                                                                                                        </div>
                                                                                                                    </div>
                                                                                                                </div>
                                                                                                            </div>

                                                                                                            <div style="margin-top: 15px; text-align: right; border-top:1px solid #eee; padding-top:10px;">
                                                                                                                <button id="applyDisplaySettings" style="padding:8px 20px; background:#2196F3; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;">適用</button>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                                `;
        document.body.insertAdjacentHTML('beforeend', html);

        // Check if we are in Chat Tool context to show Tab 4
        // Logic: window.location.pathname.includes('chattool.html') OR URL param 'mode=child'
        const isChatTool = window.location.pathname.includes('chattool.html') || window.location.search.includes('mode=child');
        if (isChatTool) {
            const tab4 = document.getElementById('settingsTab4Trigger');
            if (tab4) tab4.style.display = 'block';
        }
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.settings-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Remove active class from all
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.style.background = '#f0f0f0';
                    t.style.color = '#666';
                    t.style.fontWeight = 'normal';
                    t.style.borderBottom = '2px solid transparent';
                });
                document.querySelectorAll('.settings-content').forEach(c => c.style.display = 'none');

                // Activate clicked
                tab.classList.add('active');
                tab.style.background = 'white';
                tab.style.color = 'black';
                tab.style.fontWeight = 'bold';
                tab.style.borderBottom = '2px solid #2196F3';

                const targetId = tab.getAttribute('data-target');
                document.getElementById(targetId).style.display = 'block';

                // タブ切り替え時に常にパネルを中央に配置する
                const panel = document.getElementById(this.panelId);
                if (panel) {
                    // リフローを強制
                    void panel.offsetHeight;

                    const panelWidth = panel.offsetWidth;
                    const panelHeight = panel.offsetHeight;

                    const centerLeft = Math.max(0, (window.innerWidth - panelWidth) / 2);
                    const centerTop = Math.max(0, (window.innerHeight - panelHeight) / 2);

                    panel.style.top = `${centerTop}px`;
                    panel.style.left = `${centerLeft}px`;
                    panel.style.transform = "none";
                }
            });
        });
    }

    bindEvents() {
        // Footer Mode Radio Change
        const footerRadios = document.querySelectorAll('input[name="footerDisplayMode"]');
        const infoArea = document.getElementById('infoListContentArea');
        footerRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (infoArea) {
                    infoArea.style.display = (radio.value === 'info_list') ? 'block' : 'none';
                }
            });
        });

        // Handle Close Button
        const closeBtn = document.getElementById('closeSettings');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                const panel = document.getElementById(this.panelId);
                if (panel) panel.style.setProperty('display', 'none', 'important');
            });
        }

        // Handle Open Button - Try multiple possible IDs
        const openBtn = document.getElementById('openSettings') || document.getElementById('toggleSettings');
        if (openBtn) {
            console.log("SettingsPanel: Binding open event to", openBtn.id);
            openBtn.addEventListener('click', () => {
                const panel = document.getElementById(this.panelId);
                if (panel) {
                    panel.style.setProperty('display', 'block', 'important');
                    // Setup inputs when opened
                    if (window.updateSettingsInputs) window.updateSettingsInputs(); // For chattool
                }
            });
        } else {
            // Fallback for chattool.html if it lacks ID but has "設定" button
            // Try to find a button with text "設定"
            const buttons = document.getElementsByTagName('button');
            for (let btn of buttons) {
                if (btn.textContent.trim() === '設定') {
                    btn.addEventListener('click', () => {
                        const panel = document.getElementById(this.panelId);
                        if (panel) {
                            panel.style.setProperty('display', 'block', 'important');
                            if (window.updateSettingsInputs) window.updateSettingsInputs();
                        }
                    });
                    break;
                }
            }
        }
    }
}
