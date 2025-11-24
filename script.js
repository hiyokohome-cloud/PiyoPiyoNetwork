/**
 * ==========================================================
 * PiyoPiyo Network JavaScript (script.js) - 超高性能版
 * ==========================================================
 *
 * このファイルは、認証、データ永続化、画面遷移、フィード、
 * 投稿、DM、通知など、すべてのアプリケーションロジックを処理します。
 */

// --- LocalStorageキー ---
const LS_KEY_USERS = 'piyoUsers';
const LS_KEY_POSTS = 'piyoPosts';
const LS_KEY_CHATS = 'piyoChats';
const LS_KEY_NOTIFS = 'piyoNotifs';
const LS_KEY_LOGGED_IN_USER = 'piyoLoggedInUser';

// --- デモ初期データ ---
const INITIAL_DEMO_USERS = {
    'developer': { id: 'developer', name: 'ゆるふわ開発者', pass: 'devpass', icon: 'https://picsum.photos/45/45?random=1', followers: ['piyomaster', 'user01'], following: ['piyomaster'] },
    'piyomaster': { id: 'piyomaster', name: 'ひよこマスター', pass: 'piyopass', icon: 'https://picsum.photos/45/45?random=3', followers: ['developer', 'user01'], following: ['developer'] },
    'user01': { id: 'user01', name: 'デモユーザー01', pass: 'testpass', icon: 'https://picsum.photos/45/45?random=5', followers: ['piyomaster'], following: [] },
};

const INITIAL_DEMO_POSTS = [
    { id: 1, userId: 'developer', title: '【重要】新デザイン発表💡', content: '今日は新しいデザインシステムを公開しました！CSSファイルを分割したので、超長文になりましたが、見やすくなったはずです！🎉', image: 'https://picsum.photos/400/500?random=2', privacy: 'public', likes: ['piyomaster', 'user01'], comments: [{ user: 'piyomaster', text: 'コード分割、お疲れ様です！素晴らしい進歩ですね！' }], timestamp: Date.now() - 3600000 },
    { id: 2, userId: 'piyomaster', title: '最高の天気☀️', content: 'このネットワーク、背景の模様が動いててすごく可愛いですね！デモなのに感動！😊', image: null, privacy: 'public', likes: ['developer'], comments: [], timestamp: Date.now() - 7200000 },
    { id: 3, userId: 'developer', title: '内部構造について', content: 'このバージョンでは、HTML、CSS、JSを完全に分けて、より実用的な構成にしています。LocalStroageで永続化もバッチリです！', image: 'https://picsum.photos/400/500?random=4', privacy: 'followers', likes: [], comments: [], timestamp: Date.now() - 10800000 },
];

// --- 状態管理オブジェクト ---
let STATE = {
    currentSection: 'welcome-section',
    history: ['welcome-section'], 
    loggedInUserId: null, 
    loggedInUserData: null, 
    loginAttempts: 0, 
    lockoutTime: 0, 
    lockedID: null, 
    tempSignup: null,
    activePostId: null, 
    activeProfileId: null, 
    activeChatId: null,
    DEMO_USERS: {}, 
    DEMO_POSTS: [], 
    chats: {},      
    notifications: [], 
};

// --- UI要素のキャッシュ ---
const sections = document.querySelectorAll('.content-section');
const backButton = document.getElementById('back-button');
const bottomNav = document.getElementById('bottom-nav');
const loginErrorMsg = document.getElementById('login-error-message');
const postFeed = document.getElementById('post-feed');
const commentOverlay = document.getElementById('comment-overlay');
const commentPanel = document.getElementById('comment-panel');
const commentListContainer = document.getElementById('comment-list-container');
const notificationList = document.getElementById('notification-list');
const messageList = document.getElementById('message-list');
const chatMessages = document.getElementById('chat-messages');
const profileHeaderContent = document.getElementById('profile-header-content');
const profilePostsGrid = document.getElementById('profile-posts-grid');
const mainHeaderTitle = document.getElementById('main-header-title');

// ==========================================================
// I. LocalStorage データ永続化関数
// ==========================================================

/** データをLocalStorageからロードし、STATEを初期化する */
function loadDataFromStorage() {
    try {
        const users = localStorage.getItem(LS_KEY_USERS);
        STATE.DEMO_USERS = users ? JSON.parse(users) : INITIAL_DEMO_USERS;

        const posts = localStorage.getItem(LS_KEY_POSTS);
        STATE.DEMO_POSTS = posts ? JSON.parse(posts) : INITIAL_DEMO_POSTS;

        const chats = localStorage.getItem(LS_KEY_CHATS);
        STATE.chats = chats ? JSON.parse(chats) : {};

        const notifs = localStorage.getItem(LS_KEY_NOTIFS);
        STATE.notifications = notifs ? JSON.parse(notifs) : [];

        const loggedInUserId = localStorage.getItem(LS_KEY_LOGGED_IN_USER);
        if (loggedInUserId && STATE.DEMO_USERS[loggedInUserId]) {
            STATE.loggedInUserId = loggedInUserId;
            STATE.loggedInUserData = STATE.DEMO_USERS[loggedInUserId];
        }

    } catch (e) {
        console.error("Error loading data from localStorage:", e);
        STATE.DEMO_USERS = INITIAL_DEMO_USERS;
        STATE.DEMO_POSTS = INITIAL_DEMO_POSTS;
    }
}

/** STATEのデータをLocalStorageに保存する */
function saveDataToStorage() {
    try {
        localStorage.setItem(LS_KEY_USERS, JSON.stringify(STATE.DEMO_USERS));
        localStorage.setItem(LS_KEY_POSTS, JSON.stringify(STATE.DEMO_POSTS));
        localStorage.setItem(LS_KEY_CHATS, JSON.stringify(STATE.chats));
        localStorage.setItem(LS_KEY_NOTIFS, JSON.stringify(STATE.notifications));
        localStorage.setItem(LS_KEY_LOGGED_IN_USER, STATE.loggedInUserId || '');
    } catch (e) {
        console.error("Error saving data to localStorage:", e);
    }
}

/** 全データ削除処理とログアウト */
function handleLogout() {
    if (confirm('すべてのデモデータ（アカウント、投稿、DM履歴）を削除して、初期状態に戻しますか？')) {
        localStorage.clear();
        alert('データがすべて削除されました。ページをリロードして初期状態に戻ります。');
        window.location.reload();
        return;
    }

    STATE.loggedInUserId = null;
    STATE.loggedInUserData = null;
    localStorage.removeItem(LS_KEY_LOGGED_IN_USER);

    alert('ログアウトしました。');
    showSection('welcome-section');
}

// ==========================================================
// II. 画面遷移・履歴管理
// ==========================================================

/** 画面の切り替えと履歴の管理 */
function showSection(sectionId, isNavClick = false) {
    mainHeaderTitle.textContent = '🐣PiyoPiyo｜Network🐣'; // ヘッダータイトルのリセット

    if (STATE.currentSection === sectionId) return;

    // ナビゲーションのハイライト処理
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    if (STATE.loggedInUserId) {
        const navItem = document.querySelector(`.bottom-nav .nav-item[onclick*="${sectionId}"]`) || 
                        (sectionId === 'profile-section' && STATE.activeProfileId === STATE.loggedInUserId ? document.querySelector('.bottom-nav .nav-item[onclick*="showProfile"]') : null);
        if(navItem) navItem.classList.add('active');
    }

    // 履歴の更新
    const isLoginPostSection = ['main-section', 'notification-section', 'message-list-section', 'post-creation-section'].includes(sectionId);
    if (isLoginPostSection && !isNavClick && !STATE.history.includes(sectionId)) {
        STATE.history = ['main-section']; 
    } else if (STATE.history[STATE.history.length - 1] !== sectionId) {
        STATE.history.push(sectionId);
    }
    STATE.currentSection = sectionId;

    // UIの切り替え
    sections.forEach(sec => sec.classList.remove('active'));
    const nextSection = document.getElementById(sectionId);
    if (nextSection) nextSection.classList.add('active');

    // 戻るボタンの制御
    const noBackButton = ['welcome-section', 'main-section'].includes(sectionId);
    backButton.style.display = noBackButton ? 'none' : 'flex';

    // 下部ナビゲーションの制御
    const showNav = STATE.loggedInUserId && isLoginPostSection || (sectionId === 'profile-section' && STATE.activeProfileId === STATE.loggedInUserId);
    bottomNav.style.display = showNav ? 'flex' : 'none';

    // メインコンテンツのレンダリング
    if (sectionId === 'main-section') renderFeed();
    if (sectionId === 'notification-section') renderNotifications();
    if (sectionId === 'message-list-section') renderMessageList();
    if (sectionId === 'chat-section') renderChat();
    if (sectionId === 'profile-section') renderProfileInternal();
}

/** ナビゲーションクリック時のヘルパー関数 */
function showMainSection(sectionId, navItem) {
    showSection(sectionId, true);
}

/** 戻るボタンの処理 */
function goBack() {
    if (STATE.history.length > 1) {
        STATE.history.pop(); 
        const prevSectionId = STATE.history[STATE.history.length - 1]; 
        
        // 複雑な画面からの戻り処理を再実行 (再レンダリングを含む)
        showSection(prevSectionId); 
        
    } else if (STATE.loggedInUserId) {
        // ログイン後のメイン画面が最後なら、メインに戻る
        showSection('main-section', true);
    } else {
         // ログイン前の画面が最後なら、そのまま
        showSection('welcome-section');
    }
}

// ==========================================================
// III. 認証・新規登録機能
// ==========================================================

/** 新規登録ステップ1 (入力フォーム) の検証 */
function validateSignupStep1() {
    const id = document.getElementById('signup-id').value.trim();
    const name = document.getElementById('signup-name').value.trim();
    const pass = document.getElementById('signup-pass').value;
    const passConf = document.getElementById('signup-pass-conf').value;

    if (!id || !name || !pass || !passConf) { alert('すべての項目を入力してください。'); return; }
    if (pass !== passConf) { alert('パスワードと再確認用パスワードが一致しません。'); return; }
    if (pass.length < 8) { alert('パスワードは8文字以上で設定してください。'); return; }
    if (!/^[a-zA-Z0-9]+$/.test(id)) { alert('ユーザーIDは半角英数字のみ使用できます。'); return; }
    if (STATE.DEMO_USERS[id.toLowerCase()]) { alert('このユーザーIDは既に使われています。別のIDを設定してください。'); return; }

    STATE.tempSignup = { id, name, pass };
    document.getElementById('icon-preview').src = "https://via.placeholder.com/150/FFC0CB/FFFFFF?text=Piyo"; 
    STATE.tempSignup.icon = null;
    showSection('signup-icon-section');
}

/** アイコンプレビュー表示 */
function previewIcon(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('icon-preview');
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            if (STATE.tempSignup) { STATE.tempSignup.icon = e.target.result; }
        }
        reader.readAsDataURL(file);
    }
}

/** 新規登録完了処理 */
function completeSignup() {
    if (!STATE.tempSignup) { alert('登録情報が不足しています。最初からやり直してください。'); showSection('welcome-section'); return; }

    const newUser = {
        id: STATE.tempSignup.id,
        name: STATE.tempSignup.name,
        pass: STATE.tempSignup.pass,
        icon: STATE.tempSignup.icon || "https://via.placeholder.com/150/FFC0CB/FFFFFF?text=Piyo",
        followers: [], following: [],
        posts: [] 
    };
    STATE.DEMO_USERS[newUser.id] = newUser; 
    STATE.tempSignup = null; 

    saveDataToStorage(); 
    alert(`新規登録が完了しました！\nID: ${newUser.id}\nログイン画面へ進みます。`);

    showSection('login-form-section');
}

/** メインのログイン処理 */
function handleLogin() {
    const id = document.getElementById('login-id').value.trim();
    const pass = document.getElementById('login-pass').value;
    const now = Date.now();

    loginErrorMsg.style.display = 'none';
    if (STATE.lockedID === id && STATE.lockoutTime > now) {
        const remaining = Math.ceil((STATE.lockoutTime - now) / 1000);
        loginErrorMsg.textContent = `🚨 セキュリティロック: あと${remaining}秒待ってから、再度お試しください。`;
        loginErrorMsg.style.display = 'block';
        return;
    }

    const user = STATE.DEMO_USERS[id];

    if (!user || user.pass !== pass) {
        if (!user) {
            loginErrorMsg.textContent = '❌ ユーザーIDが存在しません。';
        } else {
            STATE.loginAttempts++;
            if (STATE.loginAttempts >= 10) {
                STATE.lockoutTime = now + 60000; 
                STATE.lockedID = id;
                loginErrorMsg.textContent = '🚨 パスワードを連続で間違えたため、60秒間アカウントがロックされました。';
            } else {
                loginErrorMsg.textContent = `⚠️ パスワードが間違っています。（あと${10 - STATE.loginAttempts}回でロックされます）`;
            }
        }
        loginErrorMsg.style.display = 'block';
    } else {
        // ログイン成功
        STATE.loggedInUserId = user.id;
        STATE.loggedInUserData = user;
        STATE.loginAttempts = 0; 

        saveDataToStorage(); 

        showSection('main-section', true); // メイン画面へ遷移
    }
}

// ==========================================================
// IV. フィード・投稿機能
// ==========================================================

/** タイムスタンプを相対時間で表示するヘルパー関数 */
function formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}日前`;
    const date = new Date(timestamp);
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

/** フィード全体をレンダリング */
function renderFeed() {
    const loggedInId = STATE.loggedInUserId;
    if (!loggedInId) { postFeed.innerHTML = '<p style="text-align: center; padding: 20px;">ログインしてフィードを見てみよう！</p>'; return; }

    const sortedPosts = [...STATE.DEMO_POSTS].sort((a, b) => b.timestamp - a.timestamp);

    const filteredPosts = sortedPosts.filter(post => {
        const user = STATE.DEMO_USERS[post.userId];
        if (!user) return false; 
        if (post.userId === loggedInId) return true; 

        const isFollowed = user.followers.includes(loggedInId);

        if (post.privacy === 'private') return false; 
        if (post.privacy === 'followers' && !isFollowed) return false;

        if (post.privacy === 'friends') {
            const isMutual = user.following.includes(loggedInId) && isFollowed;
            if (!isMutual) return false;
        }
        return true;
    });

    if (filteredPosts.length === 0) {
         postFeed.innerHTML = '<p style="text-align: center; padding: 20px;">表示できる投稿がありません。誰かをフォローするか、新しい投稿をしてみましょう！</p>';
         return;
    }

    postFeed.innerHTML = filteredPosts.map(post => {
        const user = STATE.DEMO_USERS[post.userId];
        const isFollowed = user.followers.includes(loggedInId);
        const isLiked = post.likes.includes(loggedInId);

        const plusMarkStyle = isFollowed || post.userId === loggedInId ? 'display: none;' : '';
        const heartIcon = isLiked ? '<i class="fas fa-heart" style="color: #ff5252;"></i>' : '<i class="far fa-heart"></i>';
        const likeCountClass = isLiked ? 'liked' : '';
        const commentIcon = '<i class="far fa-comment-dots"></i>';
        const timeAgo = formatTimeAgo(post.timestamp);

        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="icon-wrapper" onclick="showProfile('${user.id}')">
                        <img src="${user.icon}" class="post-icon" alt="アイコン">
                        <div class="follow-plus" style="${plusMarkStyle}" onclick="event.stopPropagation(); toggleFollowFeed('${user.id}')">+</div>
                    </div>
                    <span class="post-display-name">
                        ${user.name}
                        <span class="post-id">@${user.id}</span>
                    </span>
                    <span class="post-time">${timeAgo}</span>
                </div>
                <p class="post-title">${post.title}</p>
                ${post.image ? `<img src="${post.image}" class="post-image" alt="投稿画像">` : ''}
                <p class="post-text">${post.content}</p>
                <div class="post-actions">
                    <span class="action-button" onclick="toggleLike('${post.id}')">${heartIcon}</span>
                    <span class="like-count ${likeCountClass}">${post.likes.length}</span>
                    <span class="action-button" onclick="openCommentPanel('${post.id}')">${commentIcon}</span>
                    <span class="comment-count">${post.comments.length}</span>
                </div>
            </div>
        `;
    }).join('');
}

/** いいね切り替え */
function toggleLike(postId) {
    if (!STATE.loggedInUserId) { alert('ログインが必要です。'); return; }

    const post = STATE.DEMO_POSTS.find(p => p.id == postId);
    if (!post) return;

    const userId = STATE.loggedInUserId;
    const index = post.likes.indexOf(userId);

    if (index > -1) {
        post.likes.splice(index, 1); 
    } else {
        post.likes.push(userId); 
        if(post.userId !== userId) {
            addNotification(userId, post.userId, 'like', post.title);
        }
    }
    saveDataToStorage(); 
    renderFeed(); 
}

/** フォロー切り替え (投稿フィード用) */
function toggleFollowFeed(targetUserId) {
    if (!STATE.loggedInUserId || STATE.loggedInUserId === targetUserId) return;

    const myId = STATE.loggedInUserId;
    const targetUser = STATE.DEMO_USERS[targetUserId];
    const myData = STATE.loggedInUserData;

    const isFollowed = targetUser.followers.includes(myId);

    if (isFollowed) {
        targetUser.followers = targetUser.followers.filter(id => id !== myId);
        myData.following = myData.following.filter(id => id !== targetUserId);
    } else {
        targetUser.followers.push(myId);
        myData.following.push(targetUserId);
        addNotification(myId, targetUserId, 'follow');
    }

    saveDataToStorage(); 
    renderFeed(); 
}

/** 画像プレビュー (投稿作成画面) */
function previewPostImage(event) {
    const file = event.target.files[0];
    const preview = document.getElementById('post-image-preview');
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
            STATE.tempPostImage = e.target.result; 
        }
        reader.readAsDataURL(file);
    } else {
        preview.src = '';
        preview.style.display = 'none';
        STATE.tempPostImage = null;
    }
}

/** 新規投稿処理 */
function submitNewPost() {
    if (!STATE.loggedInUserId) { alert('投稿するにはログインが必要です。'); return; }

    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const image = STATE.tempPostImage;
    const privacy = document.getElementById('post-privacy').value;

    if (!title || !content) { alert('タイトルと内容は必須です。'); return; }

    const newPost = {
        id: Date.now(), 
        userId: STATE.loggedInUserId,
        title: title,
        content: content,
        image: image,
        privacy: privacy,
        likes: [],
        comments: [],
        timestamp: Date.now()
    };

    STATE.DEMO_POSTS.unshift(newPost);

    // フォームをリセット
    document.getElementById('post-title').value = '';
    document.getElementById('post-content').value = '';
    document.getElementById('post-image-upload').value = '';
    document.getElementById('post-image-preview').style.display = 'none';
    STATE.tempPostImage = null;

    saveDataToStorage(); 
    alert(`投稿が完了しました！ 公開設定: ${privacy}`);
    showSection('main-section', true); 
}

// ==========================================================
// V. コメント機能
// ==========================================================

/** コメント欄を開く */
function openCommentPanel(postId) {
    STATE.activePostId = postId;
    renderComments(); 
    commentOverlay.style.display = 'flex';
    setTimeout(() => { commentPanel.classList.add('open'); }, 10);
}

/** コメントをレンダリング */
function renderComments() {
    const post = STATE.DEMO_POSTS.find(p => p.id == STATE.activePostId);
    if (!post) return;

    commentListContainer.innerHTML = post.comments.map(comment => {
        const user = STATE.DEMO_USERS[comment.user] || { name: 'Unknown', icon: 'https://via.placeholder.com/35/FFEB3B/FFFFFF?text=B' };
        const timeAgo = formatTimeAgo(comment.timestamp);
        
        return `
            <div class="comment-item">
                <img src="${user.icon}" class="comment-icon" alt="アイコン">
                <div class="comment-content-wrapper">
                    <span class="comment-author">${user.name}</span>
                    <div class="comment-content">${comment.text}</div>
                    <span class="comment-time">${timeAgo}</span>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('comment-overlay-count').textContent = post.comments.length; 
    commentListContainer.scrollTop = commentListContainer.scrollHeight; 
}

/** コメント送信 */
function sendComment() {
    if (!STATE.loggedInUserId) { alert('コメントするにはログインが必要です。'); return; }

    const commentInput = document.getElementById('new-comment-text-input');
    const commentText = commentInput.value.trim();
    if (commentText === "") return;

    const post = STATE.DEMO_POSTS.find(p => p.id == STATE.activePostId);
    if (!post) return;

    post.comments.push({ user: STATE.loggedInUserId, text: commentText, timestamp: Date.now() });

    if(post.userId !== STATE.loggedInUserId) {
        addNotification(STATE.loggedInUserId, post.userId, 'comment', post.title);
    }

    commentInput.value = ''; 
    saveDataToStorage(); 
    renderComments(); 
    renderFeed(); // フィードのコメント数を更新
}

/** コメント欄を閉じる */
function closeCommentPanel() {
    commentPanel.classList.remove('open');
    setTimeout(() => {
        commentOverlay.style.display = 'none';
        STATE.activePostId = null; 
    }, 400); 
}

// ==========================================================
// VI. プロフィール・DM機能
// ==========================================================

/** プロフィール画面を表示 (外部公開用) */
function showProfile(userId) {
    if (!STATE.loggedInUserId) { alert('ログインが必要です。'); return; }
    STATE.activeProfileId = userId;
    
    // showSection内でrenderProfileInternalが呼ばれる
    showSection('profile-section');
}

/** プロフィール画面の内部レンダリング */
function renderProfileInternal() {
    const userId = STATE.activeProfileId;
    const targetUser = STATE.DEMO_USERS[userId];
    if (!targetUser) { profileHeaderContent.innerHTML = 'ユーザーが見つかりません。'; return; }

    const isMe = userId === STATE.loggedInUserId;
    mainHeaderTitle.textContent = isMe ? 'マイページ' : `${targetUser.name}さんのプロフィール`;

    const followersCount = targetUser.followers.length;
    const followingCount = targetUser.following.length;

    // プロフィールヘッダーのレンダリング
    profileHeaderContent.innerHTML = `
        <div class="profile-header">
            <img src="${targetUser.icon}" class="profile-icon" alt="アイコン">
            <h2>${targetUser.name}</h2>
            <p class="profile-id">@${targetUser.id}</p>
            <div class="profile-stats">
                <div class="stat-item"><span class="stat-number">${followersCount}</span><p>フォロワー</p></div>
                <div class="stat-item"><span class="stat-number">${followingCount}</span><p>フォロー中</p></div>
                <div class="stat-item"><span class="stat-number">${STATE.DEMO_POSTS.filter(p => p.userId === userId).length}</span><p>投稿</p></div>
            </div>
        </div>
    `;

    // アクションボタンの制御
    const isFollowed = !isMe && targetUser.followers.includes(STATE.loggedInUserId);
    const isMutual = isFollowed && STATE.loggedInUserData.following.includes(userId);

    const dmButton = document.getElementById('profile-dm-button');
    const followButton = document.getElementById('profile-follow-button');

    dmButton.style.display = isMe || !isMutual ? 'none' : 'flex'; // 相互フォローのみDMボタン表示
    followButton.style.display = isMe ? 'none' : 'flex';
    followButton.innerHTML = isFollowed ? '<i class="fas fa-user-minus"></i> フォロー解除' : '<i class="fas fa-user-plus"></i> フォロー';
    followButton.style.backgroundColor = isFollowed ? '#ccc' : 'var(--piyo-pink)';
    followButton.style.color = isFollowed ? '#333' : 'var(--main-text-color)';
    followButton.style.boxShadow = isFollowed ? 'none' : '0 4px 10px rgba(255, 192, 203, 0.6)';

    // 投稿一覧のレンダリング
    const userPosts = STATE.DEMO_POSTS.filter(p => p.userId === userId).sort((a, b) => b.timestamp - a.timestamp);

    if (userPosts.length === 0) {
         profilePostsGrid.innerHTML = '<p style="text-align: center; color: #999; grid-column: span 3; padding: 20px;">投稿がありません。</p>';
    } else {
        profilePostsGrid.innerHTML = userPosts.map(post => {
            // プライベート投稿は自分以外には表示しない
            if (post.privacy === 'private' && !isMe) return '';
            const thumbnail = post.image || 'https://via.placeholder.com/120?text=NO+IMG';
            return `
                <img src="${thumbnail}" class="profile-post-thumbnail" onclick="alert('投稿ID: ${post.id} の詳細へ')">
            `;
        }).join('');
    }
}

/** プロフィール画面からのフォロー/フォロー解除 */
function toggleFollowProfile() {
    if (!STATE.loggedInUserId || !STATE.activeProfileId || STATE.loggedInUserId === STATE.activeProfileId) return;

    const targetUserId = STATE.activeProfileId;
    const targetUser = STATE.DEMO_USERS[targetUserId];
    const myId = STATE.loggedInUserId;
    const myData = STATE.loggedInUserData;

    const isFollowed = targetUser.followers.includes(myId);

    if (isFollowed) {
        targetUser.followers = targetUser.followers.filter(id => id !== myId);
        myData.following = myData.following.filter(id => id !== targetUserId);
    } else {
        targetUser.followers.push(myId);
        myData.following.push(targetUserId);
        addNotification(myId, targetUserId, 'follow');
    }

    saveDataToStorage(); 
    renderProfileInternal(); // プロフィールを再レンダリング
    renderFeed(); // フィードも再レンダリング（フォロー状況のアイコンが変わるため）
}

/** DMチャットを開始 */
function startDM() {
    STATE.activeChatId = STATE.activeProfileId;
    showSection('chat-section');
}

/** メッセージリスト画面のレンダリング */
function renderMessageList() {
    if (!STATE.loggedInUserId) { messageList.innerHTML = '<p style="text-align:center; padding: 20px;">ログインが必要です。</p>'; return; }

    const loggedInId = STATE.loggedInUserId;

    // DM履歴のあるユーザーIDと、相互フォローユーザーIDを結合
    const userIdsWithDMHistory = Object.keys(STATE.chats).filter(id => STATE.DEMO_USERS[id]);
    const mutualFollowUserIds = Object.keys(STATE.DEMO_USERS).filter(userId => {
        if (userId === loggedInId) return false;
        const user = STATE.DEMO_USERS[userId];
        return user.followers.includes(loggedInId) && STATE.loggedInUserData.following.includes(userId);
    });

    const relevantUserIds = Array.from(new Set([...userIdsWithDMHistory, ...mutualFollowUserIds]));

    if (relevantUserIds.length === 0) {
         messageList.innerHTML = '<p style="text-align:center; padding: 20px;"><i class="fas fa-handshake"></i> 相互フォロー（友達）になりましょう！</p>';
         return;
    }

    // 最新メッセージでソート（タイムスタンプがない場合は一番下に配置）
    relevantUserIds.sort((a, b) => {
        const lastA = (STATE.chats[a] || []).slice(-1)[0];
        const lastB = (STATE.chats[b] || []).slice(-1)[0];
        const timeA = lastA ? lastA.timestamp : 0;
        const timeB = lastB ? lastB.timestamp : 0;
        return timeB - timeA;
    });

    messageList.innerHTML = relevantUserIds.map(userId => {
        const user = STATE.DEMO_USERS[userId];
        if(!user) return ''; 

        const messages = STATE.chats[userId] || [];
        const lastMessage = messages.length > 0 ? messages.slice(-1)[0] : { text: 'DMを開始しましょう！' };
        const timeText = lastMessage.timestamp ? formatTimeAgo(lastMessage.timestamp) : '';

        return `
            <div class="message-item" onclick="openChat('${userId}')">
                <img src="${user.icon}" class="message-list-icon" alt="アイコン">
                <div style="flex-grow: 1;">
                    <p style="font-weight: bold; margin: 0; display: flex; justify-content: space-between;">
                        <span>${user.name}</span>
                        <span style="font-size: 12px; color: #999;">${timeText}</span>
                    </p>
                    <p style="font-size: 14px; color: #666; margin: 0; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${lastMessage.text}</p>
                </div>
            </div>
        `;
    }).join('');
}

/** チャット画面を開く */
function openChat(userId) {
    STATE.activeChatId = userId;
    showSection('chat-section');
}

/** チャット画面のメッセージをレンダリング */
function renderChat() {
    const userId = STATE.activeChatId;
    const targetUser = STATE.DEMO_USERS[userId];
    if (!targetUser) return;

    mainHeaderTitle.textContent = `DM: ${targetUser.name}`;

    if (!STATE.chats[userId]) STATE.chats[userId] = [];

    if (STATE.chats[userId].length === 0) {
         chatMessages.innerHTML = '<p style="text-align: center; color: #999; margin-top: 100px;">新しいメッセージを入力してください。</p>';
    } else {
         chatMessages.innerHTML = STATE.chats[userId].map(msg => `
            <div class="chat-bubble ${msg.senderId === STATE.loggedInUserId ? 'chat-right' : 'chat-left'}">
                ${msg.text}
                <span style="display: block; font-size: 10px; opacity: 0.7; text-align: right; margin-top: 3px;">${new Date(msg.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        `).join('');
    }

    chatMessages.scrollTop = chatMessages.scrollHeight; 
}

/** DMメッセージを送信 */
function sendChatMessage() {
    const input = document.getElementById('chat-message-input');
    const text = input.value.trim();
    if (!text || !STATE.loggedInUserId || !STATE.activeChatId) return;

    const chatId = STATE.activeChatId;

    if (!STATE.chats[chatId]) STATE.chats[chatId] = [];

    STATE.chats[chatId].push({ senderId: STATE.loggedInUserId, text: text, timestamp: Date.now() });

    input.value = '';
    saveDataToStorage(); 
    renderChat();

    // 相手からのデモ返信 (1.5秒遅延)
    setTimeout(() => {
        const autoReply = "デモ返信です。メッセージをありがとうございます！";
         STATE.chats[chatId].push({ senderId: chatId, text: autoReply, timestamp: Date.now() + 1500 });
         saveDataToStorage();
         renderChat();
         addNotification(chatId, STATE.loggedInUserId, 'dm'); 
    }, 1500);
}


// ==========================================================
// VII. 通知機能
// ==========================================================

/** 通知を追加する */
function addNotification(fromUserId, toUserId, type, postTitle = null) {
    if (toUserId !== STATE.loggedInUserId) return; 

    const fromUser = STATE.DEMO_USERS[fromUserId] || { name: 'Unknown', icon: 'https://via.placeholder.com/45/FFEB3B/FFFFFF?text=B' };
    let text = '';

    if (type === 'like' && postTitle) {
        text = `<b>${fromUser.name}</b>さんが投稿「${postTitle}」に<i class="fas fa-heart" style="color:#ff5252;"></i>いいね！しました。`;
    } else if (type === 'follow') {
        text = `<b>${fromUser.name}</b>さんがあなたを<i class="fas fa-user-plus" style="color:var(--piyo-blue);"></i>フォローしました。`;
    } else if (type === 'comment' && postTitle) {
        text = `<b>${fromUser.name}</b>さんが投稿「${postTitle}」に<i class="far fa-comment-dots" style="color:var(--piyo-yellow);"></i>コメントしました。`;
    } else if (type === 'dm') {
        text = `<b>${fromUser.name}</b>さんから<i class="fas fa-envelope" style="color:#4CAF50;"></i>DMが届いています。`;
    } else {
        return;
    }

    STATE.notifications.unshift({
        id: Date.now(),
        userId: fromUserId,
        text: text,
        type: type,
        timestamp: Date.now()
    });
    saveDataToStorage(); 
}

/** 通知画面のレンダリング */
function renderNotifications() {
    if (STATE.notifications.length === 0) {
        notificationList.innerHTML = '<p style="text-align:center; padding: 20px;"><i class="fas fa-bell-slash"></i> 通知はありません。</p>';
        return;
    }

    notificationList.innerHTML = STATE.notifications.map(notif => {
        const fromUser = STATE.DEMO_USERS[notif.userId] || { icon: 'https://via.placeholder.com/45/FFEB3B/FFFFFF?text=B' };

        const timeText = formatTimeAgo(notif.timestamp);

        let action = '';
        if(notif.type === 'dm') action = `onclick="openChat('${notif.userId}')" style="cursor: pointer;"`;
        if(notif.type === 'follow') action = `onclick="showProfile('${notif.userId}')" style="cursor: pointer;"`;

        return `
            <div class="notification-item" ${action}>
                <img src="${fromUser.icon}" class="notification-icon" alt="アイコン">
                <div class="notification-text">${notif.text}</div>
                <span class="notification-time">${timeText}</span>
            </div>
        `;
    }).join('');
}


// ==========================================================
// VIII. アプリケーション初期化
// ==========================================================

/** アプリケーション初期化 */
function initializeApp() {
    loadDataFromStorage(); 

    if (STATE.loggedInUserId) {
        // ログイン状態が残っている場合、直接メイン画面へ
        showSection('main-section', true);
    } else {
        // 初回アクセスまたはログアウト状態の場合
        showSection('welcome-section');
    }
}

// アプリケーション起動
window.onload = initializeApp;