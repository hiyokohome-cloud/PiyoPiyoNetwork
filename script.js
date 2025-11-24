/**
 * ==========================================================
 * PiyoPiyo Network JavaScript (script.js) - 最終安定版
 * ==========================================================
 */

// ==========================================================
// I. Firebase 設定と初期化 (★★あなたの情報に書き換え済み★★)
// ==========================================================
const firebaseConfig = {
  // あなたが21:35にご提示された完全な接続情報を使用します
  apiKey: "AIzaSyBpPsprzpZUrTiU8o0IHYij2KWAGlbpTAU",
  authDomain: "piyopiyo-network.firebaseapp.com",
  projectId: "piyopiyo-network",
  storageBucket: "piyopiyo-network.firebasestorage.app",
  messagingSenderId: "277289147492",
  appId: "1:277289147492:web:b2fac9cfa60a5316911371"
};

let db;
let POSTS_COLLECTION;
let USERS_COLLECTION;
let STATE; // グローバルで定義

// Firebase初期化をtry-catchで実行し、エラーを抑制
try {
    if (typeof firebase !== 'undefined') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        POSTS_COLLECTION = "piyo_posts";
        USERS_COLLECTION = "piyo_users"; 
    } else {
        console.warn("Firebase SDKが読み込まれていません。ローカルデモモードで起動します。");
    }
} catch (e) {
    console.error("Firebase初期化中にエラーが発生しました:", e);
}


// ==========================================================
// II. LocalStorageと初期データ
// ==========================================================

// --- LocalStorageキー ---
const LS_KEY_LOGGED_IN_USER = 'piyoLoggedInUser';
const LS_KEY_LOCAL_USERS = 'piyoLocalUsers'; 

// --- デモ初期データ (ユーザーデータのみ) ---
const INITIAL_DEMO_USERS = {
    'developer': { id: 'developer', name: 'ゆるふわ開発者', pass: 'devpass', icon: 'https://picsum.photos/45/45?random=1', followers: ['piyomaster', 'user01'], following: ['piyomaster'] },
    'piyomaster': { id: 'piyomaster', name: 'ひよこマスター', pass: 'piyopass', icon: 'https://picsum.photos/45/45?random=3', followers: ['developer', 'user01'], following: ['developer'] },
    'user01': { id: 'user01', name: 'デモユーザー01', pass: 'testpass', icon: 'https://picsum.photos/45/45?random=5', followers: ['piyomaster'], following: [] },
};

// --- 状態管理オブジェクト ---
STATE = { // STATEをグローバル変数として初期化
    currentSection: 'welcome-section',
    history: ['welcome-section'], 
    loggedInUserId: null, 
    loggedInUserData: null, 
    tempSignup: null,
    activeProfileId: null, 
    DEMO_USERS: INITIAL_DEMO_USERS, 
    LIVE_POSTS: [], 
    postListener: null, // リスナー参照用
};

// --- UI要素のキャッシュ ---
const sections = document.querySelectorAll('.content-section');
const backButton = document.getElementById('back-button');
const bottomNav = document.getElementById('bottom-nav');
const loginErrorMsg = document.getElementById('login-error-message');
const postFeed = document.getElementById('post-feed');
const mainHeaderTitle = document.getElementById('main-header-title');
const searchButton = document.getElementById('search-button'); // ★★★ 追加
const searchOverlay = document.getElementById('search-overlay');
const searchResultMessage = document.getElementById('search-result-message');


// ==========================================================
// III. データ永続化・初期ロード
// ==========================================================

/** LocalStorageからデータをロード */
function loadLocalData() {
    STATE.loggedInUserId = localStorage.getItem(LS_KEY_LOGGED_IN_USER);
    const localUsers = localStorage.getItem(LS_KEY_LOCAL_USERS);
    if (localUsers) {
        STATE.DEMO_USERS = JSON.parse(localUsers);
    }
}

/** LocalStorageにデータを保存 */
function saveLocalData() {
    localStorage.setItem(LS_KEY_LOGGED_IN_USER, STATE.loggedInUserId || '');
    localStorage.setItem(LS_KEY_LOCAL_USERS, JSON.stringify(STATE.DEMO_USERS));
}

/** Firebaseから全ユーザーデータを取得してSTATEを更新 */
async function loadUsersFromFirebase() {
    if (!db) return;

    try {
        const snapshot = await db.collection(USERS_COLLECTION).get();
        const fetchedUsers = {};
        snapshot.forEach(doc => {
            fetchedUsers[doc.id] = doc.data();
        });
        
        if (snapshot.empty) {
            for (const id in INITIAL_DEMO_USERS) {
                await db.collection(USERS_COLLECTION).doc(id).set(INITIAL_DEMO_USERS[id]);
            }
            return await loadUsersFromFirebase(); 
        }

        STATE.DEMO_USERS = fetchedUsers; 

        if (STATE.loggedInUserId && STATE.DEMO_USERS[STATE.loggedInUserId]) {
            STATE.loggedInUserData = STATE.DEMO_USERS[STATE.loggedInUserId];
        } else {
             STATE.loggedInUserId = null;
             STATE.loggedInUserData = null;
        }

        saveLocalData(); 
    } catch (error) {
        console.error("Error loading users from Firebase. Using local backup:", error);
    }
}

/** 全データ削除処理とログアウト */
function handleLogout() {
    if (confirm('ローカルのログイン情報とアカウント情報を削除し、ログアウトします。よろしいですか？')) {
        localStorage.clear();
        alert('ローカルデータがクリアされました。ページをリロードして初期状態に戻ります。');
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
// IV. 画面遷移・履歴管理 (★★★ 画面重なり/検索ボタン表示修正 ★★★)
// ==========================================================

/** 画面遷移を実行 */
function showSection(sectionId, isNavClick = false) {
    
    // 現在のセクションから移動がない場合は何もしない
    if (STATE.currentSection === sectionId) return;

    // ヘッダータイトルの更新
    mainHeaderTitle.textContent = sectionId === 'main-section' ? '🐣PiyoPiyo｜Network🐣' : 
                                  sectionId === 'profile-section' ? `@${STATE.activeProfileId}のページ` : 
                                  'PiyoPiyo'; 

    // ログイン後のメインセクション判定
    const isMainNavSection = ['main-section', 'notification-section', 'message-list-section', 'post-creation-section'].includes(sectionId);
    
    // 検索ボタンの表示制御 (ホーム画面とその他ログイン後のナビゲーション画面でのみ表示)
    if (searchButton) {
        searchButton.style.display = (STATE.loggedInUserId && isMainNavSection) ? 'flex' : 'none';
    }


    // 履歴の更新
    if (STATE.history[STATE.history.length - 1] !== sectionId) {
        STATE.history.push(sectionId);
    }
    STATE.currentSection = sectionId;

    // UIの切り替え
    sections.forEach(sec => {
        sec.classList.remove('active');
    });
    const nextSection = document.getElementById(sectionId);
    if (nextSection) nextSection.classList.add('active'); 

    // 戻るボタンの制御
    backButton.style.display = (STATE.history.length > 1 && sectionId !== 'welcome-section') ? 'flex' : 'none';

    // 下部ナビゲーションの制御
    bottomNav.style.display = (STATE.loggedInUserId && (isMainNavSection || (sectionId === 'profile-section' && STATE.activeProfileId === STATE.loggedInUserId))) ? 'flex' : 'none';

    // メインコンテンツのレンダリング
    if (sectionId === 'main-section') {
        if(STATE.loggedInUserId) startPostFeedListener(); 
    } else {
        // メイン画面以外に移動したら、リスナーを停止
        if (STATE.postListener) {
            STATE.postListener(); 
            STATE.postListener = null;
        }
    }
    // ... (他の画面のレンダリング関数呼び出しは省略)
    if (sectionId === 'profile-section') renderProfileInternal();
}

/** ナビゲーションクリック時の処理 */
function showMainSection(sectionId, navItem) {
    // ナビゲーションアイテムのハイライト処理
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    if(navItem) navItem.classList.add('active');
    
    // 履歴をリセットし、メイン画面のナビゲーションとして遷移
    STATE.history = ['main-section']; 
    showSection(sectionId, true);
}

/** 画面を戻る処理 */
function goBack() {
    if (STATE.history.length > 1) {
        STATE.history.pop(); 
        const prevSectionId = STATE.history[STATE.history.length - 1]; 
        
        // 履歴の最後に残った画面を再表示
        showSection(prevSectionId); 
        
    } else if (STATE.loggedInUserId) {
        // 履歴がないがログイン済みの場合はメイン画面へ
        showSection('main-section', true);
    } else {
        // 履歴もログインもなければウェルカム画面へ
        showSection('welcome-section');
    }
}
// ==========================================================

// V. 認証・新規登録機能 (一部省略)

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

/** 新規登録完了処理 (Firebaseへの登録処理) */
async function completeSignup() {
    // データベース接続チェックを追加
    if (!STATE.tempSignup || !db) { alert('登録情報が不足しているか、データベースに接続できません。Firebase設定を確認してください。'); return; }

    const newUserId = STATE.tempSignup.id;
    const newUser = {
        id: newUserId,
        name: STATE.tempSignup.name,
        pass: STATE.tempSignup.pass, 
        icon: STATE.tempSignup.icon || "https://via.placeholder.com/150/FFC0CB/FFFFFF?text=Piyo",
        followers: [], 
        following: [],
    };
    
    try {
        await db.collection(USERS_COLLECTION).doc(newUserId).set(newUser);
        STATE.tempSignup = null; 
        alert(`新規登録が完了しました！ ID: ${newUserId}`);
        showSection('login-form-section');

    } catch (e) {
        console.error("Error signing up user:", e);
        alert('新規登録中にエラーが発生しました。Firebaseのセキュリティルールを確認してください。');
    }
}

/** メインのログイン処理 (Firebaseからのデータ取得) */
async function handleLogin() {
    await loadUsersFromFirebase(); // 最新のユーザーリストをFirebaseから取得

    const id = document.getElementById('login-id').value.trim();
    const pass = document.getElementById('login-pass').value;
    
    loginErrorMsg.style.display = 'none';

    const user = STATE.DEMO_USERS[id];

    if (!user || user.pass !== pass) {
        loginErrorMsg.textContent = user ? '⚠️ パスワードが間違っています。' : '❌ ユーザーIDが存在しません。';
        loginErrorMsg.style.display = 'block';
    } else {
        // ログイン成功
        STATE.loggedInUserId = user.id;
        STATE.loggedInUserData = user;

        saveLocalData(); 

        showSection('main-section', true); // メイン画面へ遷移
    }
}


// VI. フィード・投稿機能 (一部省略)

/** タイムスタンプを相対時間で表示するヘルパー関数 */
function formatTimeAgo(timestamp) {
    if (!timestamp) return '今';
    const time = timestamp instanceof Date ? timestamp.getTime() : (timestamp.toDate ? timestamp.toDate().getTime() : Date.now());
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

/** フィード全体をレンダリング */
function renderFeed() {
    const loggedInId = STATE.loggedInUserId;
    if (!loggedInId) { postFeed.innerHTML = '<p style="text-align: center; padding: 20px;">ログインしてフィードを見てみよう！</p>'; return; }

    const filteredPosts = STATE.LIVE_POSTS.filter(post => {
        const user = STATE.DEMO_USERS[post.userId];
        if (!user) return false; 
        if (post.userId === loggedInId) return true; 

        // 簡易的なプライバシーチェック（Firebaseのセキュリティルールが本来の役割を果たす）
        if (post.privacy === 'private') return false; 
        return true;
    }).sort((a, b) => (b.timestamp?.toDate ? b.timestamp.toDate() : b.timestamp) - (a.timestamp?.toDate ? a.timestamp.toDate() : a.timestamp));


    if (filteredPosts.length === 0) {
         postFeed.innerHTML = '<p style="text-align: center; padding: 20px;">表示できる投稿がありません。誰かをフォローするか、新しい投稿をしてみましょう！</p>';
         return;
    }

    postFeed.innerHTML = filteredPosts.map(post => {
        const user = STATE.DEMO_USERS[post.userId];
        const isLiked = post.likes?.includes(loggedInId);
        const isFollowed = user.followers?.includes(loggedInId);

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
                    <span class="like-count ${likeCountClass}">${post.likes?.length || 0}</span>
                    <span class="action-button" onclick="openCommentPanel('${post.id}')">${commentIcon}</span>
                    <span class="comment-count">${post.comments?.length || 0}</span>
                </div>
            </div>
        `;
    }).join('');
}


/** Firestore リアルタイムリスナー */
function startPostFeedListener() {
    if (!db) return;
    if (STATE.postListener) return; // 既にリスナーがある場合は設定しない

    STATE.postListener = db.collection(POSTS_COLLECTION)
      .orderBy('timestamp', 'desc') 
      .onSnapshot(async (snapshot) => {
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

/** いいね切り替え (Firebaseへの更新処理) */
async function toggleLike(postId) {
    if (!STATE.loggedInUserId || !db) { alert('ログインまたはデータベース接続が必要です。'); return; }

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
        }
        transaction.update(postRef, { likes: currentLikes });
    }).catch(error => {
        console.error("Like transaction failed: ", error);
    });
}

/** 新規投稿処理 (Firebaseへの登録処理) */
async function submitNewPost() {
    if (!STATE.loggedInUserId || !db) { alert('投稿するにはログインまたはデータベース接続が必要です。'); return; }

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
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection(POSTS_COLLECTION).add(newPost);
        
        // フォームをリセット
        document.getElementById('post-title').value = '';
        document.getElementById('post-content').value = '';
        document.getElementById('post-image-upload').value = '';
        document.getElementById('post-image-preview').style.display = 'none';
        STATE.tempPostImage = null;

        alert(`投稿が完了しました！`);
        showSection('main-section', true); 

    } catch (e) {
        console.error("Error adding document: ", e);
        alert('投稿に失敗しました。セキュリティルールを確認してください。');
    }
}


// VII. プロフィール表示 (一部省略)

/** プロフィール表示処理 */
async function showProfile(userId) {
    if (!userId) return;
    STATE.activeProfileId = userId;
    
    // プロフィール表示の前に最新のユーザーデータを取得し、確実に最新の状態を反映
    await loadUsersFromFirebase(); 
    
    // プロフィール画面へ遷移
    showSection('profile-section'); 
}

// ... (renderProfileInternal, toggleFollowProfile, toggleFollowFeed などは省略) ...


// VIII. ID検索機能

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
        // ユーザーが見つかった場合、プロフィールへのリンクを表示
        searchResultMessage.innerHTML = `
            <div style="padding: 10px; border: 1px solid #ddd; border-radius: 8px; cursor: pointer; display: flex; align-items: center;" 
                 onclick="closeSearchOverlay(); showProfile('${targetId}')">
                <img src="${foundUser.icon}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover; margin-right: 10px;">
                <div style="flex-grow: 1;">
                    <strong>${foundUser.name}</strong> 
                    <span style="color: #666; font-size: 14px;">@${targetId}</span>
                </div>
                <i class="fas fa-chevron-right" style="color: #aaa;"></i>
            </div>
        `;
        searchResultMessage.style.display = 'block';
        searchResultMessage.style.backgroundColor = '#e8f5e9';
    } else {
        // ユーザーが見つからなかった場合
        searchResultMessage.textContent = `ユーザーID「@${targetId}」は見つかりませんでした。`;
        searchResultMessage.style.display = 'block';
        searchResultMessage.style.backgroundColor = '#ffcdd2';
    }
}


// IX. アプリケーション初期化 (安定化)

/** アプリケーション初期化 */
async function initializeApp() {
    loadLocalData(); 
    await loadUsersFromFirebase(); 

    if (STATE.loggedInUserId) {
        // ログイン状態が残っている場合はメイン画面へ
        showSection('main-section', true);
    } else {
        // 初回アクセスまたはログアウト状態の場合
        showSection('welcome-section');
    }
}

// アプリケーション起動
window.onload = initializeApp;