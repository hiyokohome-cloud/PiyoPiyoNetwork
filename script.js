/**
 * ==========================================================
 * PiyoPiyo Network JavaScript (script.js) - 最終安定版
 * ==========================================================
 */

// ==========================================================
// I. Firebase 設定と初期化 (★★ここをあなたの情報に書き換える★★)
// ==========================================================
const firebaseConfig = {
  // ★★★ あなたのFirebase Consoleからコピーした情報を貼り付ける ★★★
  apiKey: "AIzaSy...", 
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};

let db;
let POSTS_COLLECTION;
let USERS_COLLECTION;

// Firebase初期化をtry-catchで実行し、エラーを抑制
try {
    if (typeof firebase !== 'undefined' && firebaseConfig.apiKey !== 'AIzaSy...') {
        firebase.initializeApp(firebaseConfig);
        db = firebase.firestore();
        POSTS_COLLECTION = "piyo_posts";
        USERS_COLLECTION = "piyo_users"; 
    } else {
        console.warn("Firebase設定が不完全です。ローカルデモモードで起動します。");
    }
} catch (e) {
    console.error("Firebase初期化中にエラーが発生しました:", e);
}


// ==========================================================
// II. LocalStorageと初期データ
// ==========================================================

// --- LocalStorageキー ---
const LS_KEY_LOGGED_IN_USER = 'piyoLoggedInUser';
const LS_KEY_LOCAL_USERS = 'piyoLocalUsers'; // 緊急用のローカルユーザーバックアップ

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
    tempSignup: null,
    activeProfileId: null, 
    DEMO_USERS: INITIAL_DEMO_USERS, // 初期値を設定
    LIVE_POSTS: [], 
};

// --- UI要素のキャッシュ ---
const sections = document.querySelectorAll('.content-section');
const backButton = document.getElementById('back-button');
const bottomNav = document.getElementById('bottom-nav');
const loginErrorMsg = document.getElementById('login-error-message');
const postFeed = document.getElementById('post-feed');
const profileHeaderContent = document.getElementById('profile-header-content');
const profilePostsGrid = document.getElementById('profile-posts-grid');
const mainHeaderTitle = document.getElementById('main-header-title');
const searchOverlay = document.getElementById('search-overlay');
const searchResultMessage = document.getElementById('search-result-message');


// ==========================================================
// III. データ永続化・初期ロード
// ==========================================================

/** LocalStorageからデータをロード */
function loadLocalData() {
    STATE.loggedInUserId = localStorage.getItem(LS_KEY_LOGGED_IN_USER);
    // ユーザーリストのバックアップをロード（Firebase失敗時のフォールバック）
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
    if (!db) return; // DB未接続なら処理しない

    try {
        const snapshot = await db.collection(USERS_COLLECTION).get();
        const fetchedUsers = {};
        snapshot.forEach(doc => {
            fetchedUsers[doc.id] = doc.data();
        });
        
        // ユーザーデータが存在しない場合は、初期デモユーザーをFirebaseに登録
        if (snapshot.empty) {
            for (const id in INITIAL_DEMO_USERS) {
                await db.collection(USERS_COLLECTION).doc(id).set(INITIAL_DEMO_USERS[id]);
            }
            // 再帰的にロード
            return await loadUsersFromFirebase(); 
        }

        STATE.DEMO_USERS = fetchedUsers; // Firebaseのデータで更新

        // ログインユーザーの最新データをSTATE.loggedInUserDataに反映
        if (STATE.loggedInUserId && STATE.DEMO_USERS[STATE.loggedInUserId]) {
            STATE.loggedInUserData = STATE.DEMO_USERS[STATE.loggedInUserId];
        } else {
             // ログインIDがFirebaseに存在しない場合は強制ログアウト
             STATE.loggedInUserId = null;
             STATE.loggedInUserData = null;
        }

        saveLocalData(); // 成功したデータをローカルにバックアップ
    } catch (error) {
        console.error("Error loading users from Firebase. Using local backup:", error);
    }
}

/** 全データ削除処理とログアウト */
function handleLogout() {
    if (confirm('ローカルのログイン情報とアカウント情報（Firebase上は残る可能性あり）を削除し、ログアウトします。よろしいですか？')) {
        localStorage.clear();
        alert('ローカルデータがクリアされました。');
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
// IV. 画面遷移・履歴管理 (安定化修正)
// ==========================================================

/** 画面遷移を実行 */
function showSection(sectionId, isNavClick = false) {
    // ログイン画面の表示が必要な場合に検索ボタンを非表示にする
    const isLoginPostSection = ['main-section', 'notification-section', 'message-list-section', 'post-creation-section'].includes(sectionId);
    
    // ヘッダータイトルのリセットと更新
    mainHeaderTitle.textContent = sectionId === 'main-section' ? '🐣PiyoPiyo｜Network🐣' : 
                                  sectionId === 'profile-section' ? `@${STATE.activeProfileId}のページ` : 
                                  'PiyoPiyo'; 

    // 検索ボタンの表示制御
    const searchButton = document.getElementById('search-button');
    if (searchButton) {
        // ログインしていて、かつフィード/通知/メッセージ/投稿画面なら表示
        searchButton.style.display = (STATE.loggedInUserId && isLoginPostSection) ? 'flex' : 'none';
    }


    // 履歴の更新ロジックをよりシンプルに修正
    if (STATE.history[STATE.history.length - 1] !== sectionId) {
        STATE.history.push(sectionId);
    }
    STATE.currentSection = sectionId;

    // UIの切り替え: すべての画面を非表示にし、対象だけを表示
    sections.forEach(sec => {
        sec.classList.remove('active');
        // CSSのdisplay:none;によるバグを防ぐため、常にdisplay:none;にするのはCSSに任せる
    });
    const nextSection = document.getElementById(sectionId);
    if (nextSection) nextSection.classList.add('active'); // CSSがdisplay:blockに切り替える

    // 戻るボタンと下部ナビゲーションの制御
    backButton.style.display = (STATE.history.length > 1 && sectionId !== 'welcome-section') ? 'flex' : 'none';
    bottomNav.style.display = (STATE.loggedInUserId && (isLoginPostSection || (sectionId === 'profile-section' && STATE.activeProfileId === STATE.loggedInUserId))) ? 'flex' : 'none';

    // メインコンテンツのレンダリング
    if (sectionId === 'main-section') {
        // Firebaseからのリアルタイムリスナーを開始
        if(STATE.loggedInUserId) startPostFeedListener(); 
    }
    // ... (他の画面のレンダリング関数呼び出しは省略)
    if (sectionId === 'profile-section') renderProfileInternal();
}

function showMainSection(sectionId, navItem) {
    // ナビゲーションアイテムのハイライト処理
    document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
    if(navItem) navItem.classList.add('active');
    
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

// ... (V. 認証・新規登録機能は、Firebase連携部分のみを抜粋) ...

/** 新規登録完了処理 (Firebaseへの登録処理) */
async function completeSignup() {
    if (!STATE.tempSignup || !db) { alert('登録情報が不足しているか、データベースに接続できません。'); return; }

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

// ... (VI. フィード・投稿機能の大部分は省略、`submitNewPost`と`startPostFeedListener`のみ抜粋) ...

/** Firestore リアルタイムリスナー */
function startPostFeedListener() {
    if (!db) { postFeed.innerHTML = '<p style="text-align: center; padding: 20px;">データベース接続エラー。ローカルデモモードで起動します。</p>'; return; }

    // リスナーは一度しか設定しない
    if (STATE.postListener) return;

    // リスナーをSTATEに保存しておくと、後で停止できる
    STATE.postListener = db.collection(POSTS_COLLECTION)
      .orderBy('timestamp', 'desc') 
      .onSnapshot(async (snapshot) => {
        // 投稿が更新されるたびに、ユーザーデータも最新にロード
        await loadUsersFromFirebase(); 

        STATE.LIVE_POSTS = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        renderFeed(); // 投稿リストを表示
    }, (error) => {
        console.error("Error getting real-time posts: ", error);
        postFeed.innerHTML = '<p style="text-align: center; padding: 20px;">投稿の読み込みに失敗しました。</p>';
    });
}


/** 新規投稿処理 (Firebaseへの登録処理) */
async function submitNewPost() {
    if (!STATE.loggedInUserId || !db) { alert('投稿するにはログインまたはデータベース接続が必要です。'); return; }

    // ... (入力値のチェックは省略) ...

    const newPost = {
        userId: STATE.loggedInUserId,
        // ... (他の投稿データ) ...
        likes: [],
        comments: [],
        timestamp: firebase.firestore.FieldValue.serverTimestamp() // サーバー側で時間記録
    };

    try {
        await db.collection(POSTS_COLLECTION).add(newPost);
        // ... (フォームリセットは省略) ...
        alert(`投稿が完了しました！`);
        showSection('main-section', true); 

    } catch (e) {
        console.error("Error adding document: ", e);
        alert('投稿に失敗しました。');
    }
}

// ... (他のレンダリング関数は省略) ...


/** プロフィール表示処理 (Firebaseからの最新データ取得) */
async function showProfile(userId) {
    if (!userId) return;
    STATE.activeProfileId = userId;
    
    // プロフィール表示の前に最新のユーザーデータを取得し、確実に最新の状態を反映
    await loadUsersFromFirebase(); 
    
    // プロフィール画面へ遷移
    showSection('profile-section'); 
}

// ... (VIII. ID検索機能) ...

/** 検索オーバーレイを開く */
function openSearchOverlay() {
    if (!STATE.loggedInUserId) { alert('ログインが必要です。'); return; }
    searchOverlay.style.display = 'flex';
    document.getElementById('user-id-input').value = '';
    searchResultMessage.style.display = 'none';
    searchResultMessage.textContent = '';
    // アニメーション用に遅延
    setTimeout(() => { searchOverlay.classList.add('open'); }, 10);
}

/** 検索オーバーレイを閉じる */
function closeSearchOverlay() {
    searchOverlay.classList.remove('open');
    setTimeout(() => {
        searchOverlay.style.display = 'none';
    }, 400); 
}

/** ID検索を実行 (★★ご要望の機能★★) */
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


// ==========================================================
// IX. アプリケーション初期化
// ==========================================================

/** アプリケーション初期化 */
async function initializeApp() {
    // 1. ローカルデータ（ログインIDなど）をロード
    loadLocalData(); 
    
    // 2. Firebaseから最新のユーザーと投稿データを取得
    await loadUsersFromFirebase(); 

    // 3. 画面表示の制御
    if (STATE.loggedInUserId) {
        showSection('main-section', true);
    } else {
        // 初期状態ではウェルカム画面のみを表示
        showSection('welcome-section');
    }
}

// アプリケーション起動
window.onload = initializeApp;