/**
 * ==========================================================
 * PiyoPiyo Network JavaScript (script.js) - Firebase連携最終版
 * ==========================================================
 */

// ==========================================================
// I. Firebase 設定と初期化 (★★ここをあなたの情報に書き換える★★)
// ==========================================================
const firebaseConfig = {
  // ★★★ あなたの情報をここに貼り付けてください ★★★
  apiKey: "AIzaSyBpPsprzpZUrTiU8o0IHYij2KWAGlbpTAU", // 例として君がくれたキーを入れていますが、他の情報も必要です！
  authDomain: "YOUR_AUTH_DOMAIN.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef1234567890",
};

// Firebaseを初期化
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    const POSTS_COLLECTION = "piyo_posts";
    const USERS_COLLECTION = "piyo_users"; // ユーザー情報もFirebaseで共有
    const CHATS_COLLECTION = "piyo_chats";
} else {
    console.error("Firebase SDKが読み込まれていません。index.htmlを確認してください。");
}

// ==========================================================
// II. LocalStorageと初期データ
// ==========================================================

// --- LocalStorageキー ---
const LS_KEY_USERS = 'piyoUsers';
const LS_KEY_CHATS = 'piyoChats';
const LS_KEY_NOTIFS = 'piyoNotifs';
const LS_KEY_LOGGED_IN_USER = 'piyoLoggedInUser';

// --- デモ初期データ (ユーザーデータのみ) ---
const INITIAL_DEMO_USERS = {
    'developer': { id: 'developer', name: 'ゆるふわ開発者', pass: 'devpass', icon: 'https://picsum.photos/45/45?random=1', followers: ['piyomaster', 'user01'], following: ['piyomaster'] },
    'piyomaster': { id: 'piyomaster', name: 'ひよこマスター', pass: 'piyopass', icon: 'https://picsum.photos/45/45?random=3', followers: ['developer', 'user01'], following: ['developer'] },
    'user01': { id: 'user01', name: 'デモユーザー01', pass: 'testpass', icon: 'https://picsum.photos/45/45?random=5', followers: ['piyomaster'], following: [] },
};

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
    DEMO_USERS: {}, // Firebaseからロードされる
    LIVE_POSTS: [], // Firebaseからリアルタイムで取得される
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
const searchOverlay = document.getElementById('search-overlay'); // ★★★ 追加
const searchResultMessage = document.getElementById('search-result-message'); // ★★★ 追加


// ==========================================================
// III. データ永続化・初期ロード
// ==========================================================

/** データをLocalStorageからロードし、STATEを初期化する */
function loadLocalData() {
    try {
        // ユーザーデータはFirebaseからロードするため、ここではローカル設定のみ
        const loggedInUserId = localStorage.getItem(LS_KEY_LOGGED_IN_USER);
        if (loggedInUserId) {
            STATE.loggedInUserId = loggedInUserId;
        }

        const chats = localStorage.getItem(LS_KEY_CHATS);
        STATE.chats = chats ? JSON.parse(chats) : {};

        const notifs = localStorage.getItem(LS_KEY_NOTIFS);
        STATE.notifications = notifs ? JSON.parse(notifs) : [];

    } catch (e) {
        console.error("Error loading data from localStorage:", e);
    }
}

/** STATEのデータをLocalStorageに保存する */
function saveLocalData() {
    try {
        localStorage.setItem(LS_KEY_CHATS, JSON.stringify(STATE.chats));
        localStorage.setItem(LS_KEY_NOTIFS, JSON.stringify(STATE.notifications));
        localStorage.setItem(LS_KEY_LOGGED_IN_USER, STATE.loggedInUserId || '');
    } catch (e) {
        console.error("Error saving data to localStorage:", e);
    }
}

/** Firebaseから全ユーザーデータを取得してSTATEを更新 */
async function loadUsersFromFirebase() {
    if (typeof db === 'undefined') return;

    try {
        const snapshot = await db.collection(USERS_COLLECTION).get();
        STATE.DEMO_USERS = {};
        snapshot.forEach(doc => {
            STATE.DEMO_USERS[doc.id] = doc.data();
        });
        
        // ログインユーザーの最新データをSTATE.loggedInUserDataに反映
        if (STATE.loggedInUserId && STATE.DEMO_USERS[STATE.loggedInUserId]) {
            STATE.loggedInUserData = STATE.DEMO_USERS[STATE.loggedInUserId];
        } else {
             STATE.loggedInUserId = null;
             STATE.loggedInUserData = null;
             saveLocalData();
        }

        // 初回起動時、デモユーザーが存在しない場合のみ追加
        if (snapshot.empty) {
            for (const id in INITIAL_DEMO_USERS) {
                await db.collection(USERS_COLLECTION).doc(id).set(INITIAL_DEMO_USERS[id]);
            }
            // 再度ロード
            await loadUsersFromFirebase();
        }

    } catch (error) {
        console.error("Error loading users from Firebase:", error);
    }
}

// ユーザーデータはFirebaseからロードされるため、loadUsersFromFirebase()内で更新される
// STATE.loggedInUserDataの更新もその中で行われます。


/** 全データ削除処理とログアウト */
function handleLogout() {
    if (confirm('すべてのローカルデータ（アカウント、DM履歴）を削除して、初期状態に戻しますか？')) {
        localStorage.clear();
        alert('ローカルデータがすべて削除されました。ページをリロードして初期状態に戻ります。');
        window.location.reload();
        return;
    }

    STATE.loggedInUserId = null;
    STATE.loggedInUserData = null;
    saveLocalData();

    alert('ログアウトしました。');
    showSection('welcome-section');
}

// ==========================================================
// IV. 画面遷移・履歴管理 (変更なし)
// ==========================================================

// ... (省略: 前のバージョンの showSection, goBack などと同じ) ...
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
    if (sectionId === 'main-section') {
        renderFeed();
        // ★★★ Firebaseリアルタイムリスナー開始 ★★★
        if(STATE.loggedInUserId) startPostFeedListener(); 
    } else {
        // 他の画面に移動したらリスナーを停止したいが、単純なデモのためここでは省略
    }
    if (sectionId === 'notification-section') renderNotifications();
    if (sectionId === 'message-list-section') renderMessageList();
    if (sectionId === 'chat-section') renderChat();
    if (sectionId === 'profile-section') renderProfileInternal();
}

function showMainSection(sectionId, navItem) {
    showSection(sectionId, true);
}

function goBack() {
    if (STATE.history.length > 1) {
        STATE.history.pop(); 
        const prevSectionId = STATE.history[STATE.history.length - 1]; 
        showSection(prevSectionId); 
        
    } else if (STATE.loggedInUserId) {
        showSection('main-section', true);
    } else {
        showSection('welcome-section');
    }
}
// ==========================================================

// ==========================================================
// V. 認証・新規登録機能
// ==========================================================

/** 新規登録ステップ1 (入力フォーム) の検証 */
function validateSignupStep1() {
    // ... (省略) ...
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
    // ... (省略) ...
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

/** 新規登録完了処理 (★★Firebaseへの登録処理に更新★★) */
async function completeSignup() {
    if (!STATE.tempSignup) { alert('登録情報が不足しています。最初からやり直してください。'); showSection('welcome-section'); return; }
    if (typeof db === 'undefined') { alert('データベースに接続できません。設定を確認してください。'); return; }

    const newUserId = STATE.tempSignup.id;
    const newUser = {
        id: newUserId,
        name: STATE.tempSignup.name,
        pass: STATE.tempSignup.pass, // パスワードはデモなので平文保存
        icon: STATE.tempSignup.icon || "https://via.placeholder.com/150/FFC0CB/FFFFFF?text=Piyo",
        followers: [], 
        following: [],
    };
    
    try {
        await db.collection(USERS_COLLECTION).doc(newUserId).set(newUser);

        // ローカルSTATEとLocalStorageの更新は不要 (ログイン時に実施)
        STATE.tempSignup = null; 
        alert(`新規登録が完了しました！ ID: ${newUserId}`);
        showSection('login-form-section');

    } catch (e) {
        console.error("Error signing up user:", e);
        alert('新規登録中にエラーが発生しました。');
    }
}

/** メインのログイン処理 (★★Firebaseからのデータ取得に更新★★) */
async function handleLogin() {
    await loadUsersFromFirebase(); // 最新のユーザーリストをFirebaseから取得

    const id = document.getElementById('login-id').value.trim();
    const pass = document.getElementById('login-pass').value;
    const now = Date.now();

    loginErrorMsg.style.display = 'none';

    // ... (ロックアウト処理は省略、必要に応じて追加してください) ...

    const user = STATE.DEMO_USERS[id];

    if (!user || user.pass !== pass) {
        loginErrorMsg.textContent = user ? '⚠️ パスワードが間違っています。' : '❌ ユーザーIDが存在しません。';
        loginErrorMsg.style.display = 'block';
    } else {
        // ログイン成功
        STATE.loggedInUserId = user.id;
        STATE.loggedInUserData = user;

        saveLocalData(); // ログイン状態をローカルに保存

        showSection('main-section', true); // メイン画面へ遷移
    }
}


// ==========================================================
// VI. フィード・投稿機能
// ==========================================================

/** タイムスタンプを相対時間で表示するヘルパー関数 */
function formatTimeAgo(timestamp) {
    if (!timestamp) return '今';
    // Firestore TimestampオブジェクトまたはDateオブジェクトに対応
    const time = timestamp instanceof Date ? timestamp.getTime() : timestamp.toDate().getTime();
    const seconds = Math.floor((Date.now() - time) / 1000);
    if (seconds < 60) return `${seconds}秒前`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}時間前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}日前`;
    const date = new Date(time);
    return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

/** フィード全体をレンダリング (STATE.LIVE_POSTSに基づいて実行) */
function renderFeed() {
    const loggedInId = STATE.loggedInUserId;
    if (!loggedInId) { postFeed.innerHTML = '<p style="text-align: center; padding: 20px;">ログインしてフィードを見てみよう！</p>'; return; }

    const filteredPosts = STATE.LIVE_POSTS.filter(post => {
        const user = STATE.DEMO_USERS[post.userId];
        if (!user) return false; 
        if (post.userId === loggedInId) return true; 

        const isFollowed = user.followers.includes(loggedInId);
        // ... (プライバシーフィルターのロジックは前のバージョンと同様に適用) ...
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

        // ... (HTML生成ロジックは前のバージョンと同様) ...
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


/** Firestore リアルタイムリスナー (★★追加★★) */
function startPostFeedListener() {
    if (typeof db === 'undefined') return;

    db.collection(POSTS_COLLECTION)
      .orderBy('timestamp', 'desc') 
      .onSnapshot(async (snapshot) => {
        // 投稿が更新されるたびに、ユーザーデータも最新にロード
        await loadUsersFromFirebase(); 

        STATE.LIVE_POSTS = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderFeed(); 
    }, (error) => {
        console.error("Error getting real-time posts: ", error);
        postFeed.innerHTML = '<p style="text-align: center; padding: 20px;">投稿の読み込みに失敗しました。</p>';
    });
}

/** いいね切り替え (★★Firebaseへの更新処理に更新★★) */
async function toggleLike(postId) {
    if (!STATE.loggedInUserId || typeof db === 'undefined') { alert('ログインが必要です。'); return; }

    const postRef = db.collection(POSTS_COLLECTION).doc(postId);
    const userId = STATE.loggedInUserId;

    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(postRef);
        if (!doc.exists) return;

        const currentLikes = doc.data().likes || [];
        const index = currentLikes.indexOf(userId);

        if (index > -1) {
            currentLikes.splice(index, 1); 
        } else {
            currentLikes.push(userId); 
            // 通知処理は省略
        }
        transaction.update(postRef, { likes: currentLikes });
    }).catch(error => {
        console.error("Like transaction failed: ", error);
    });

    // リスナーが自動でrenderFeedを呼び出します
}

/** 新規投稿処理 (★★Firebaseへの登録処理に更新★★) */
async function submitNewPost() {
    if (!STATE.loggedInUserId || typeof db === 'undefined') { alert('投稿するにはログインが必要です。'); return; }

    const title = document.getElementById('post-title').value.trim();
    const content = document.getElementById('post-content').value.trim();
    const image = STATE.tempPostImage || null;
    const privacy = document.getElementById('post-privacy').value;

    if (!title || !content) { alert('タイトルと内容は必須です。'); return; }

    const newPost = {
        userId: STATE.loggedInUserId,
        title: title,
        content: content,
        image: image,
        privacy: privacy,
        likes: [],
        comments: [],
        timestamp: firebase.firestore.FieldValue.serverTimestamp() // サーバー側で時間記録
    };

    try {
        await db.collection(POSTS_COLLECTION).add(newPost);
        
        // フォームをリセット
        document.getElementById('post-title').value = '';
        document.getElementById('post-content').value = '';
        document.getElementById('post-image-upload').value = '';
        document.getElementById('post-image-preview').style.display = 'none';
        STATE.tempPostImage = null;

        alert(`投稿が完了しました！ 公開設定: ${privacy}`);
        showSection('main-section', true); 

    } catch (e) {
        console.error("Error adding document: ", e);
        alert('投稿に失敗しました。');
    }
}


// ... (省略: その他の機能のFirebase化は複雑なため省略。ローカルデータで動作継続) ...


// ==========================================================
// VII. ID検索機能 (★★新しい機能★★)
// ==========================================================

/** 検索オーバーレイを開く */
function openSearchOverlay() {
    if (!STATE.loggedInUserId) { alert('ログインが必要です。'); return; }
    searchOverlay.style.display = 'flex';
    document.getElementById('user-id-input').value = '';
    searchResultMessage.style.display = 'none';
    searchResultMessage.textContent = '';
    setTimeout(() => { searchOverlay.classList.add('open'); }, 10);
}

/** 検索オーバーレイを閉じる */
function closeSearchOverlay() {
    searchOverlay.classList.remove('open');
    setTimeout(() => {
        searchOverlay.style.display = 'none';
    }, 400); 
}

/** ID検索を実行 */
async function searchUserById() {
    // リアルタイム性を高めるため、検索前にユーザーリストを再ロード
    await loadUsersFromFirebase(); 

    const id = document.getElementById('user-id-input').value.trim();
    const targetId = id.toLowerCase();

    if (!targetId) {
        searchResultMessage.textContent = 'ユーザーIDを入力してください。';
        searchResultMessage.style.display = 'block';
        searchResultMessage.style.backgroundColor = '#ffcdd2';
        return;
    }

    const foundUser = STATE.DEMO_USERS[targetId];

    if (foundUser) {
        searchResultMessage.innerHTML = `
            <div style="padding: 10px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer;" 
                 onclick="closeSearchOverlay(); showProfile('${targetId}')">
                <img src="${foundUser.icon}" style="width: 30px; height: 30px; border-radius: 50%; margin-right: 10px;">
                <strong>${foundUser.name}</strong> (@${targetId})
            </div>
        `;
        searchResultMessage.style.display = 'block';
        searchResultMessage.style.backgroundColor = '#e8f5e9';
    } else {
        searchResultMessage.textContent = `ユーザーID「@${targetId}」は見つかりませんでした。`;
        searchResultMessage.style.display = 'block';
        searchResultMessage.style.backgroundColor = '#ffcdd2';
    }
}


// ==========================================================
// VIII. アプリケーション初期化
// ==========================================================

/** アプリケーション初期化 */
async function initializeApp() {
    loadLocalData(); 
    await loadUsersFromFirebase(); // 最初にFirebaseから全ユーザーデータを取得

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