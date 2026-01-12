
// ==========================================
// showComment オーバーライド（左寄せ確実化）
// ==========================================
window.showComment = function (c) {
    console.log('ChatTool: showComment override called', c);

    // ミュート機能
    if (window.commentSettings && window.commentSettings.muteEnabled && window.commentSettings.muteSymbol) {
        if (c.cm && c.cm.startsWith(window.commentSettings.muteSymbol)) {
            return;
        }
    }

    const container = document.getElementById('comment');
    if (!container) return;

    // コメント要素を作成
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.flexDirection = 'row';
    div.style.alignItems = 'center';
    div.style.marginBottom = '5px';
    div.style.background = '#f9f9f9';
    div.style.padding = '2px 5px';
    div.style.borderRadius = '5px';
    div.style.boxShadow = '1px 1px 3px #aaa';

    // アバター画像
    const avatar = document.createElement('img');
    avatar.src = 'https://image.showroom-cdn.com/showroom-prod/image/avatar/' + c.av + '.png';
    avatar.style.width = '40px';
    avatar.style.height = '40px';
    avatar.style.marginRight = '5px';
    avatar.style.flexShrink = '0';

    // コンテンツラッパー
    const contentWrapper = document.createElement('div');
    contentWrapper.style.display = 'flex';
    contentWrapper.style.flexDirection = 'column';
    contentWrapper.style.flex = '1';
    contentWrapper.style.alignItems = 'flex-start';

    // ユーザー名（補完の場合は[補完]プレフィックスを追加）
    const nameDiv = document.createElement('div');
    const isBackfill = c.is_delay_comment || c.delay || false;
    nameDiv.textContent = isBackfill ? '[補完] ' + c.ac : c.ac;
    nameDiv.style.color = '#999';
    nameDiv.style.fontSize = '0.9em';
    nameDiv.style.marginBottom = '2px';
    nameDiv.style.textAlign = 'left';

    // コメントテキスト
    const textDiv = document.createElement('div');
    textDiv.textContent = c.cm;
    textDiv.style.fontSize = window.commentSettings ? window.commentSettings.size + 'px' : '14px';
    textDiv.style.color = window.commentSettings ? window.commentSettings.color : '#000';
    textDiv.style.textAlign = 'left';
    textDiv.style.wordBreak = 'break-all';

    contentWrapper.appendChild(nameDiv);
    contentWrapper.appendChild(textDiv);

    div.appendChild(avatar);
    div.appendChild(contentWrapper);

    // コメント欄の先頭に追加
    container.insertBefore(div, container.firstChild);
    container.scrollTop = 0;
};

console.log('ChatTool: showComment override installed');

}) ();
