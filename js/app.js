// ==================== 腾讯云 COS 配置 ====================
var COS_CONFIG = (function() {
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem('host_cos_cfg')); } catch(e) {}
  return Object.assign({
    enabled: false,
    Bucket: 'my-data-1-1312418202',
    Region: 'ap-beijing',
    SecretId: '',
    SecretKey: '',
    baseUrl: ''
  }, stored || {});
})();

function saveCosConfig(cfg) {
  Object.assign(COS_CONFIG, cfg);
  localStorage.setItem('host_cos_cfg', JSON.stringify({
    enabled: COS_CONFIG.enabled,
    Bucket: COS_CONFIG.Bucket,
    Region: COS_CONFIG.Region,
    SecretId: COS_CONFIG.SecretId,
    SecretKey: COS_CONFIG.SecretKey,
    baseUrl: COS_CONFIG.baseUrl
  }));
}

function setupCos(id, key, bucket, region) {
  COS_CONFIG.enabled = true;
  COS_CONFIG.SecretId = id || COS_CONFIG.SecretId;
  COS_CONFIG.SecretKey = key || COS_CONFIG.SecretKey;
  if (bucket) COS_CONFIG.Bucket = bucket;
  if (region) COS_CONFIG.Region = region;
  saveCosConfig(COS_CONFIG);
  if ($('cosConfigBanner')) $('cosConfigBanner').classList.remove('show');
  if ($('cosConfigBanner2')) $('cosConfigBanner2').classList.remove('show');
  if ($('cosSetupLink')) $('cosSetupLink').style.display = 'none';
  showToast('COS配置已保存');
  setTimeout(function(){ location.reload(); }, 1000);
}

function showCosSetupPanel() {
  if (COS_CONFIG.SecretId) {
    $('cosSetupId').value = COS_CONFIG.SecretId;
    $('cosSetupKey').value = COS_CONFIG.SecretKey;
  }
  if (COS_CONFIG.Bucket) $('cosSetupBucket').value = COS_CONFIG.Bucket;
  if (COS_CONFIG.Region) $('cosSetupRegion').value = COS_CONFIG.Region;
  $('cosSetupError').style.display = 'none';
  $('cosSetupOverlay').classList.add('show');
}

function hideCosSetupPanel() {
  $('cosSetupOverlay').classList.remove('show');
}

function saveSetupCos() {
  var id = $('cosSetupId').value.trim();
  var key = $('cosSetupKey').value.trim();
  var bucket = $('cosSetupBucket').value.trim();
  var region = $('cosSetupRegion').value.trim();
  if (!id || !key) {
    $('cosSetupError').textContent = 'SecretId 和 SecretKey 不能为空';
    $('cosSetupError').style.display = 'block';
    return;
  }
  setupCos(id, key, bucket, region);
}

// ==================== localStorage 键名 ====================
const STORAGE_KEYS = {
  users: 'host_users',
  feedbacks: 'host_feedbacks',
  notifications: 'host_notifications',
  metadata: 'host_metadata'
};

// ==================== 工具函数 ====================
function $(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }

function genShortId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function formatTime(isoStr) {
  try { return new Date(isoStr).toLocaleString('zh-CN'); } catch (e) { return isoStr; }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes > 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / 1024).toFixed(1) + ' KB';
}

function showToast(msg, isError) {
  var t = $('toastMsg');
  t.textContent = msg;
  t.style.backgroundColor = isError ? '#b91c1c' : '#1e293b';
  t.style.opacity = '1';
  clearTimeout(t._timeout);
  t._timeout = setTimeout(function () { t.style.opacity = '0'; }, 2500);
}

function openImageModal(imgElement) {
  // 支持传入 DOM 元素或旧的 url 字符串（兼容性）
  if (typeof imgElement === 'string') {
    // 旧方式：直接传 URL
    $('modalImg').src = imgElement;
    $('imageModal').style.display = 'block';
    return;
  }
  
  // 新方式：传入 img 元素
  var storedName = imgElement.getAttribute('data-stored');
  if (storedName) {
    // 有 data-stored，异步获取签名 URL
    ensureSignedUrl(storedName).then(signedUrl => {
      $('modalImg').src = signedUrl;
      $('imageModal').style.display = 'block';
    }).catch(err => {
      console.error('获取签名 URL 失败', err);
      // 降级：使用原 src
      $('modalImg').src = imgElement.src;
      $('imageModal').style.display = 'block';
    });
  } else {
    // 没有 data-stored，直接使用原 src
    $('modalImg').src = imgElement.src;
    $('imageModal').style.display = 'block';
  }
}

// ==================== 密码哈希 (SHA-256) ====================
var PASSWORD_PEPPER = 'host_img_2026_salt';

async function hashPassword(password) {
  var encoder = new TextEncoder();
  var data = encoder.encode(password + PASSWORD_PEPPER);
  var hashBuffer = await crypto.subtle.digest('SHA-256', data);
  var hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// ==================== AES-GCM 加密（多设备统一盐） ====================
var ENC_KEY = null;

async function initEncSalt() {
  if (!getCosClient()) {
    let salt = localStorage.getItem('host_enc_salt');
    if (!salt) {
      let saltBytes = crypto.getRandomValues(new Uint8Array(16));
      salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2,'0')).join('');
      localStorage.setItem('host_enc_salt', salt);
    }
    return salt;
  }

  let cos = getCosClient();
  let remoteSalt = null;
  try {
    let res = await new Promise((resolve, reject) => {
      cos.getObject({
        Bucket: COS_CONFIG.Bucket,
        Region: COS_CONFIG.Region,
        Key: 'host_data/_enc_salt.txt'
      }, (err, data) => {
        if (err) reject(err);
        else resolve(data.Body.toString('utf-8'));
      });
    });
    remoteSalt = res.trim();
  } catch(e) {}

  if (remoteSalt && remoteSalt.length === 32) {
    localStorage.setItem('host_enc_salt', remoteSalt);
    return remoteSalt;
  } else {
    let saltBytes = crypto.getRandomValues(new Uint8Array(16));
    let newSalt = Array.from(saltBytes).map(b => b.toString(16).padStart(2,'0')).join('');
    localStorage.setItem('host_enc_salt', newSalt);
    try {
      await new Promise((resolve, reject) => {
        cos.putObject({
          Bucket: COS_CONFIG.Bucket,
          Region: COS_CONFIG.Region,
          Key: 'host_data/_enc_salt.txt',
          Body: newSalt,
          ContentType: 'text/plain'
        }, err => err ? reject(err) : resolve());
      });
    } catch(e) { console.warn('上传盐失败', e); }
    return newSalt;
  }
}

async function getEncKey() {
  if (ENC_KEY) return ENC_KEY;
  let saltHex = await initEncSalt();
  let salt = new TextEncoder().encode(saltHex);
  let baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode('host_storage_v1_secret'), 'PBKDF2', false, ['deriveKey']);
  ENC_KEY = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 200000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
  return ENC_KEY;
}

async function encryptData(plaintext) {
  let key = await getEncKey();
  let iv = crypto.getRandomValues(new Uint8Array(12));
  let encoded = new TextEncoder().encode(plaintext);
  let ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoded);
  let combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode.apply(null, combined));
}

async function decryptData(b64) {
  try {
    let key = await getEncKey();
    let raw = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    let iv = raw.slice(0, 12);
    let ciphertext = raw.slice(12);
    let decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch(e) { return null; }
}

// ==================== COS JSON 数据读写 ====================
var COS_DATA_PREFIX = 'host_data/';

function getCosClient() {
  if (!COS_CONFIG.enabled || !COS_CONFIG.SecretId) return null;
  if (typeof COS === 'undefined') return null;
  return new COS({ SecretId: COS_CONFIG.SecretId, SecretKey: COS_CONFIG.SecretKey });
}

function cosGetData(key) {
  return new Promise(function (resolve) {
    var cos = getCosClient();
    if (!cos) { resolve(null); return; }
    cos.getObject({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: COS_DATA_PREFIX + key + '.enc'
    }, function (err, data) {
      if (err) { resolve(null); return; }
      var body = data.Body;
      if (typeof body === 'string') resolve(body);
      else if (body && body.toString) resolve(body.toString('utf-8'));
      else resolve(null);
    });
  });
}

function cosPutData(key, encryptedB64) {
  return new Promise(function (resolve) {
    var cos = getCosClient();
    if (!cos) { console.warn('[COS] 客户端未初始化'); resolve(false); return; }
    cos.putObject({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: COS_DATA_PREFIX + key + '.enc',
      Body: encryptedB64,
      ContentType: 'text/plain'
    }, function (err) {
      if (err) { console.warn('[COS] 上传失败:', err.statusCode, err.error); resolve(false); }
      else { resolve(true); }
    });
  });
}

// ==================== 统一数据持久层 ====================
var CACHE = {};
var PENDING_SAVES = {};

function loadData(key) {
  return CACHE[key] || null;
}

function saveDataLocal(key, data) {
  CACHE[key] = data;
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
}

async function saveDataRemote(key) {
  if (!(key in CACHE)) return;
  var json = JSON.stringify(CACHE[key]);
  try {
    var encrypted = await encryptData(json);
    if (!encrypted) return;
    var ok = await cosPutData(key, encrypted);
    PENDING_SAVES[key] = null;
    if (ok) {
      console.log('[COS] 已上传: ' + COS_DATA_PREFIX + key + '.enc');
    } else {
      console.warn('[COS] 上传失败: ' + COS_DATA_PREFIX + key + '.enc');
    }
  } catch (e) {
    console.warn('[COS] 上传异常: ' + COS_DATA_PREFIX + key + '.enc', e);
  }
}

function scheduleRemoteSave(key) {
  if (PENDING_SAVES[key]) clearTimeout(PENDING_SAVES[key]);
  PENDING_SAVES[key] = setTimeout(function () { saveDataRemote(key); }, 500);
}

function saveData(key, data) {
  saveDataLocal(key, data);
  scheduleRemoteSave(key);
}

function saveDataNow(key, data) {
  saveDataLocal(key, data);
  return saveDataRemote(key);
}

async function syncFromRemote(key, expectedType) {
  var b64 = await cosGetData(key);
  if (!b64) return false;
  var json = await decryptData(b64);
  if (!json) return false;
  try {
    var obj = JSON.parse(json);
    if (expectedType === 'object' && typeof obj !== 'object') return false;
    if (expectedType === 'array' && !Array.isArray(obj)) return false;
    CACHE[key] = obj;
    localStorage.setItem(key, JSON.stringify(obj));
    return true;
  } catch (e) { return false; }
}

async function initData() {
  // 1. 先读取本地数据作为后备
  var localUsers = localStorage.getItem(STORAGE_KEYS.users);
  var localFbs = localStorage.getItem(STORAGE_KEYS.feedbacks);
  var localNotifs = localStorage.getItem(STORAGE_KEYS.notifications);
  var localMeta = localStorage.getItem(STORAGE_KEYS.metadata);

  CACHE[STORAGE_KEYS.users] = localUsers ? JSON.parse(localUsers) : null;
  CACHE[STORAGE_KEYS.feedbacks] = localFbs ? JSON.parse(localFbs) : null;
  CACHE[STORAGE_KEYS.notifications] = localNotifs ? JSON.parse(localNotifs) : null;
  CACHE[STORAGE_KEYS.metadata] = localMeta ? JSON.parse(localMeta) : null;

  // 2. 如果 COS 可用，强制从 COS 拉取数据并覆盖本地（确保多设备同步）
  if (getCosClient()) {
    // 辅助函数：从 COS 加载并覆盖指定键
    const loadAndOverwrite = async (key, isArray = false) => {
      const b64 = await cosGetData(key);
      if (!b64) return false;
      const decrypted = await decryptData(b64);
      if (!decrypted) return false;
      try {
        const data = JSON.parse(decrypted);
        if (isArray && !Array.isArray(data)) return false;
        if (!isArray && typeof data !== 'object') return false;
        CACHE[key] = data;
        localStorage.setItem(key, decrypted);
        return true;
      } catch (e) { return false; }
    };

    await loadAndOverwrite(STORAGE_KEYS.users, false);
    await loadAndOverwrite(STORAGE_KEYS.feedbacks, true);
    await loadAndOverwrite(STORAGE_KEYS.notifications, true);
    await loadAndOverwrite(STORAGE_KEYS.metadata, true);
  }

  // 3. 确保默认数据结构存在（仅当 COS 也空时）
  if (!CACHE[STORAGE_KEYS.users] || Object.keys(CACHE[STORAGE_KEYS.users]).length === 0) {
    CACHE[STORAGE_KEYS.users] = {
      ziy111: { password: '', role: 'admin', created_at: new Date().toISOString(), _needs_hash: true }
    };
  }
  if (!CACHE[STORAGE_KEYS.feedbacks]) CACHE[STORAGE_KEYS.feedbacks] = [];
  if (!CACHE[STORAGE_KEYS.notifications]) CACHE[STORAGE_KEYS.notifications] = [];
  if (!CACHE[STORAGE_KEYS.metadata]) CACHE[STORAGE_KEYS.metadata] = [];

  // 4. 保存到 localStorage（确保一致性）
  saveDataLocal(STORAGE_KEYS.users, CACHE[STORAGE_KEYS.users]);
  saveDataLocal(STORAGE_KEYS.feedbacks, CACHE[STORAGE_KEYS.feedbacks]);
  saveDataLocal(STORAGE_KEYS.notifications, CACHE[STORAGE_KEYS.notifications]);
  saveDataLocal(STORAGE_KEYS.metadata, CACHE[STORAGE_KEYS.metadata]);
}

async function flushAllPending() {
  var keys = Object.keys(PENDING_SAVES);
  for (var i = 0; i < keys.length; i++) {
    if (PENDING_SAVES[keys[i]]) {
      clearTimeout(PENDING_SAVES[keys[i]]);
      PENDING_SAVES[keys[i]] = null;
      await saveDataRemote(keys[i]);
    }
  }
}

async function initAdminPassword() {
  var users = loadData(STORAGE_KEYS.users);
  if (users && users.ziy111 && users.ziy111._needs_hash) {
    users.ziy111.password = await hashPassword('123456');
    delete users.ziy111._needs_hash;
    await saveDataNow(STORAGE_KEYS.users, users);
  }
}

// ==================== 会话管理 ====================
function getSession() {
  try {
    var s = sessionStorage.getItem('host_session');
    return s ? JSON.parse(s) : null;
  } catch (e) { return null; }
}

function setSession(user) {
  sessionStorage.setItem('host_session', JSON.stringify(user));
}

function clearSession() {
  sessionStorage.removeItem('host_session');
}

function currentUser() {
  var s = getSession();
  return s ? s.username : null;
}

function currentRole() {
  var s = getSession();
  return s ? s.role : null;
}

// ==================== COS 上传模块 ====================
var SIGNED_URL_CACHE = {};
var SIGNED_URL_TTL = 6 * 24 * 60 * 60 * 1000;

function getCosRawUrl(key) {
  if (COS_CONFIG.baseUrl) return COS_CONFIG.baseUrl.replace(/\/$/, '') + '/' + key;
  return 'https://' + COS_CONFIG.Bucket + '.cos.' + COS_CONFIG.Region + '.myqcloud.com/' + key;
}

function generateSignedUrl(key) {
  return new Promise(function (resolve) {
    var cos = getCosClient();
    if (!cos) { resolve(getCosRawUrl(key)); return; }
    cos.getObjectUrl({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: key,
      Sign: true,
      Expires: 86400
    }, function (err, data) {
      if (err) { resolve(getCosRawUrl(key)); }
      else { resolve(data.Url); }
    });
  });
}

function getCosUrl(key) {
  var cached = SIGNED_URL_CACHE[key];
  if (cached && (Date.now() - cached.time) < SIGNED_URL_TTL) {
    return cached.url;
  }
  if (getCosClient()) {
    generateSignedUrl(key).then(function (signed) {
      SIGNED_URL_CACHE[key] = { url: signed, time: Date.now() };
      updateSingleImageSrc(key, signed);
    });
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect fill="#e2e8f0" width="100%" height="100%"/><text x="50%" y="50%" text-anchor="middle" fill="#94a3b8" font-size="14">加载中...</text></svg>');
  }
  return getCosRawUrl(key);
}
function updateSingleImageSrc(storedName, signedUrl) {
  // 1. 更新图床管理页的图片卡片
  var cardImgs = document.querySelectorAll('.card-img');
  for (var i = 0; i < cardImgs.length; i++) {
    var img = cardImgs[i];
    var parentCard = img.closest('.image-card');
    if (parentCard && parentCard.getAttribute('data-stored') === storedName) {
      img.src = signedUrl;
      // 同时更新 data-url 属性（用于复制链接）
      parentCard.setAttribute('data-url', signedUrl);
      // 如果有复选框，也更新其 data-url
      var checkbox = parentCard.querySelector('.img-checkbox');
      if (checkbox) checkbox.setAttribute('data-url', signedUrl);
      break;
    }
  }
  
  // 2. 更新反馈列表中的图片（如果有的话）
  var feedbackImgs = document.querySelectorAll('.feedback-img, .comment-img');
  for (var j = 0; j < feedbackImgs.length; j++) {
    var img = feedbackImgs[j];
    var src = img.getAttribute('src');
    if (src && src.indexOf(storedName) !== -1) {
      img.src = signedUrl;
    }
  }
  
  // 3. 更新“选择已有图片”抽屉中的缩略图
  var existingImgs = document.querySelectorAll('.existing-image-item img');
  for (var k = 0; k < existingImgs.length; k++) {
    var img = existingImgs[k];
    var parentItem = img.closest('.existing-image-item');
    if (parentItem && parentItem.getAttribute('data-stored') === storedName) {
      img.src = signedUrl;
    }
  }
}

function refreshAllImageUrls() {
  if (currentPage === 'gallery') {
    var imgs = getMetadata().sort(function (a, b) { return (b.upload_time || '') > (a.upload_time || '') ? 1 : -1; });
    renderGallery(imgs);
  }
  if (currentPage === 'main') {
    renderExistingImages();
    renderFeedbackList();
  }
}

function ensureSignedUrl(key) {
  return new Promise(function (resolve) {
    if (!getCosClient()) { resolve(getCosRawUrl(key)); return; }
    var cached = SIGNED_URL_CACHE[key];
    if (cached && (Date.now() - cached.time) < SIGNED_URL_TTL) {
      resolve(cached.url);
    } else {
      generateSignedUrl(key).then(function (signed) {
        SIGNED_URL_CACHE[key] = { url: signed, time: Date.now() };
        resolve(signed);
      });
    }
  });
}
function deleteCosFile(storedName) {
  return new Promise((resolve, reject) => {
    var cos = getCosClient();
    if (!cos) {
      reject(new Error('COS 未配置'));
      return;
    }
    cos.deleteObject({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: storedName
    }, function(err, data) {
      if (err) reject(err);
      else resolve(data);
    });
  });
}
function uploadToCos(file, onProgress) {
  return new Promise(function (resolve, reject) {
    if (!COS_CONFIG.enabled || !COS_CONFIG.SecretId) {
      reject(new Error('COS_NOT_CONFIGURED'));
      return;
    }
    if (typeof COS === 'undefined') {
      reject(new Error('COS_SDK_NOT_LOADED'));
      return;
    }
    var cos = new COS({
      SecretId: COS_CONFIG.SecretId,
      SecretKey: COS_CONFIG.SecretKey
    });
    var ext = file.name.split('.').pop().toLowerCase();
    var key = genShortId() + '.' + ext;
    cos.putObject({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: key,
      Body: file,
      onProgress: function (info) {
        if (onProgress) onProgress(info);
      }
    }, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve({
          stored_name: key,
          original_name: file.name,
          url: getCosUrl(key),
          file_size: file.size
        });
      }
    });
  });
}

function uploadImageAsBase64(file) {
  return new Promise(function (resolve, reject) {
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('未配置COS时，图片不能超过2MB'));
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var key = genShortId() + '_b64';
      resolve({
        stored_name: key,
        original_name: file.name,
        url: reader.result,
        file_size: file.size,
        _base64: true
      });
    };
    reader.onerror = function () { reject(new Error('读取文件失败')); };
    reader.readAsDataURL(file);
  });
}

var cosNotConfiguredWarned = false;

async function uploadImage(file, onProgress) {
  if (COS_CONFIG.enabled && COS_CONFIG.SecretId) {
    return uploadToCos(file, onProgress);
  }
  if (!cosNotConfiguredWarned) {
    cosNotConfiguredWarned = true;
    showToast('COS未配置，图片将以Base64存储（限2MB）', true);
  }
  return uploadImageAsBase64(file);
}

// ==================== 图床元数据管理 ====================
function getMetadata() { return loadData(STORAGE_KEYS.metadata) || []; }

function addMetadata(storedName, originalName, fileSize, uploader, isBase64, cosUrl) {
  var meta = getMetadata();
  meta.push({
    stored_name: storedName,
    original_name: originalName,
    upload_time: new Date().toISOString(),
    file_size: fileSize,
    uploader: uploader,
    url: cosUrl || '',
    _base64: !!isBase64
  });
  saveData(STORAGE_KEYS.metadata, meta);
}

function removeMetadata(storedName) {
  var meta = getMetadata();
  var filtered = meta.filter(function (m) { return m.stored_name !== storedName; });
  saveData(STORAGE_KEYS.metadata, filtered);
}

function getImageUrl(item) {
  if (item.url && item.url.startsWith('data:')) return item.url;
  if (item._base64) return item.url;
  if (item.stored_name && item.stored_name.endsWith('_b64')) return item.url || '';
  if (COS_CONFIG.enabled && item.stored_name) {
    var cached = SIGNED_URL_CACHE[item.stored_name];
    if (cached && (Date.now() - cached.time) < SIGNED_URL_TTL) return cached.url;
    return getCosUrl(item.stored_name);
  }
  if (item.url && item.url.startsWith('http')) return item.url;
  return item.url || '';
}

// ==================== 用户管理 ====================
function getUsers() { return loadData(STORAGE_KEYS.users) || {}; }
function saveUsers(users) { saveData(STORAGE_KEYS.users, users); }

// ==================== 反馈管理 ====================
function getFeedbacks() { return loadData(STORAGE_KEYS.feedbacks) || []; }
function saveFeedbacks(list) { saveData(STORAGE_KEYS.feedbacks, list); }

// ==================== 通知管理 ====================
function getNotifications() { return loadData(STORAGE_KEYS.notifications) || []; }
function saveNotifications(list) { saveData(STORAGE_KEYS.notifications, list); }

function addNotification(userId, title, content, type, relatedId) {
  var list = getNotifications();
  list.push({
    id: genShortId(),
    user_id: userId,
    title: title,
    content: content,
    type: type || 'info',
    related_id: relatedId || '',
    is_read: false,
    created_at: new Date().toISOString()
  });
  saveNotifications(list);
}

// ==================== 路由系统 ====================
var currentPage = 'login';

function navigate(page) {
  currentPage = page;
  qsa('.page-view').forEach(function (el) { el.style.display = 'none'; });
  var target = $('page-' + page);
  if (target) target.style.display = '';

  if (page === 'main') {
    renderFeedbackSystem();
    loadNotificationsForUI();
  }
  if (page === 'gallery') {
    renderGalleryPage();
  }
  if (page === 'login' || page === 'register') {
    clearSession();
  }
}

function checkAuth() {
  if (currentUser()) {
    navigate('main');
  } else {
    navigate('login');
  }
}

// ==================== 认证处理 ====================
async function handleLogin(e) {
  e.preventDefault();
  var username = $('loginUsername').value.trim();
  var password = $('loginPassword').value;
  if (!username || !password) {
    $('loginError').textContent = '用户名和密码不能为空';
    $('loginError').style.display = 'block';
    return;
  }
  var users = getUsers();
  if (!users[username]) {
    $('loginError').textContent = '用户名或密码错误';
    $('loginError').style.display = 'block';
    return;
  }
  var hashed = await hashPassword(password);
  if (users[username].password !== hashed) {
    $('loginError').textContent = '用户名或密码错误';
    $('loginError').style.display = 'block';
    return;
  }
  setSession({ username: username, role: users[username].role || 'user' });
  $('loginError').style.display = 'none';
  navigate('main');
}

async function handleRegister(e) {
  e.preventDefault();
  var username = $('regUsername').value.trim();
  var password = $('regPassword').value;
  if (!username || !password) {
    $('regError').textContent = '用户名和密码不能为空';
    $('regError').style.display = 'block';
    return;
  }
  if (username.length < 2) {
    $('regError').textContent = '用户名至少2个字符';
    $('regError').style.display = 'block';
    return;
  }
  var users = getUsers();
  if (users[username]) {
    $('regError').textContent = '用户名已存在';
    $('regError').style.display = 'block';
    return;
  }
  var role = Object.keys(users).length === 0 ? 'admin' : 'user';
  users[username] = {
    password: await hashPassword(password),
    role: role,
    created_at: new Date().toISOString()
  };
  saveUsers(users);
  showToast('注册成功，请登录');
  navigate('login');
}

async function handleLogout() {
  await flushAllPending();
  clearSession();
  navigate('login');
}

// ==================== 导航标签 ====================
function setupNavTabs() {
  var html = '';
  html += '<a class="nav-tab active" data-page="main" href="javascript:void(0)">反馈系统</a>';
  html += '<a class="nav-tab" data-page="gallery" href="javascript:void(0)">图床管理</a>';
  if (currentRole() === 'admin') {
    html += '<a class="nav-tab user-mgmt-tab" href="javascript:void(0)">用户管理</a>';
  }
  $('navTabs').innerHTML = html;
  if ($('navTabs2')) $('navTabs2').innerHTML = html;

  qsa('.nav-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      var page = this.getAttribute('data-page');
      if (page === 'main') {
        navigate('main');
        qsa('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
      } else if (page === 'gallery') {
        navigate('gallery');
        qsa('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
      } else if (this.classList.contains('user-mgmt-tab')) {
        showUserPanel();
      }
    });
  });
}

// ==================== 反馈系统 ====================
var selectedImages = [];
var isDrawerOpen = false;
var allImagesCache = [];
var allFeedbacksCache = [];
var currentFilter = 'all';
var currentStatusFilter = 'all';
var adminViewMode = false;
var commentPendingImages = {};

function renderFeedbackSystem() {
  setupNavTabs();
  $('headerUsername').textContent = currentUser();
  $('headerRole').textContent = currentRole();
  initStatusFilter();
  loadFeedbacks();
  loadImagesForFeedback();
  updateUnreadBadge();

  if (currentRole() === 'admin') {
    $('adminViewArea').style.display = 'flex';
  } else {
    $('adminViewArea').style.display = 'none';
  }
}

function toggleDrawer() {
  isDrawerOpen = !isDrawerOpen;
  var arrow = $('drawerArrow');
  var content = $('drawerContent');
  if (isDrawerOpen) {
    arrow.classList.add('open');
    content.classList.add('open');
  } else {
    arrow.classList.remove('open');
    content.classList.remove('open');
  }
}

function openDrawer() {
  if (!isDrawerOpen) {
    isDrawerOpen = true;
    $('drawerArrow').classList.add('open');
    $('drawerContent').classList.add('open');
  }
}

function updateSelectedHint() {
  var count = selectedImages.length;
  if (count > 0) {
    var firstImg = allImagesCache.find(function (img) { return img.stored_name === selectedImages[0]; });
    if (firstImg && count === 1) {
      $('selectedHint').textContent = '已选: ' + firstImg.original_name;
    } else {
      $('selectedHint').textContent = '已选 ' + count + ' 张图片';
    }
  } else {
    $('selectedHint').textContent = '';
  }
}

function loadImagesForFeedback() {
  allImagesCache = getMetadata().sort(function (a, b) {
    return (b.upload_time || '') > (a.upload_time || '') ? 1 : -1;
  });
  renderExistingImages();
}

function renderExistingImages() {
  var container = $('existingImagesList');
  if (!allImagesCache.length) {
    container.innerHTML = '<div style="color:#94a3b8;padding:20px;text-align:center;">暂无图片，请先上传图片</div>';
    return;
  }
  var html = '';
  allImagesCache.forEach(function (img) {
    var isSelected = selectedImages.indexOf(img.stored_name) !== -1;
    var imgUrl = getImageUrl(img);
    html += `<div class="existing-image-item${isSelected ? ' selected' : ''}" data-stored="${img.stored_name}" style="position:relative;">
      <img src="${imgUrl}" alt="${escapeHtml(img.original_name)}" loading="lazy" 
        onerror="this.onerror=null;this.src=this.src+'?retry='+Date.now();this.parentNode.querySelector('.img-placeholder').style.display='flex';">
      <div class="img-placeholder" style="display:none;width:80px;height:80px;align-items:center;justify-content:center;background:#e2e8f0;border-radius:10px;color:#94a3b8;font-size:10px;">加载失败</div>
      ${isSelected ? '<span class="remove-icon" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;">✕</span>' : ''}
    </div>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.existing-image-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      e.stopPropagation();
      var storedName = item.getAttribute('data-stored');
      var idx = selectedImages.indexOf(storedName);
      if (idx !== -1) {
        selectedImages.splice(idx, 1);
      } else {
        selectedImages.push(storedName);
      }
      updateSelectedHint();
      renderExistingImages();
    });
  });
    // 延迟主动更新所有缩略图的签名 URL
  setTimeout(() => {
    allImagesCache.forEach(img => {
      if (!img.stored_name) return;
      ensureSignedUrl(img.stored_name).then(signedUrl => {
        // 在抽屉容器中查找对应的图片元素
        var targetImg = document.querySelector(`.existing-image-item[data-stored="${img.stored_name}"] img`);
        if (targetImg && targetImg.src !== signedUrl) {
          targetImg.src = signedUrl;
        }
      }).catch(err => console.warn('更新抽屉缩略图失败', img.stored_name, err));
    });
  }, 100);
}

async function uploadImageForFeedback(file) {
  if (!file) return false;
  var allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/bmp'];
  if (allowed.indexOf(file.type) === -1) { showToast('不支持该图片格式', true); return false; }
  if (file.size > 10 * 1024 * 1024) { showToast('图片不能超过10MB', true); return false; }
  $('uploadProgress').textContent = '上传中...';
  try {
    var result = await uploadImage(file);
    addMetadata(result.stored_name, result.original_name, result.file_size, currentUser(), result._base64, result.url);
    $('uploadProgress').textContent = '';
    showToast('图片已上传: ' + result.original_name);
    loadImagesForFeedback();
    selectedImages.push(result.stored_name);
    updateSelectedHint();
    openDrawer();
    return true;
  } catch (err) {
    $('uploadProgress').textContent = '';
    showToast('上传失败: ' + (err.message || err), true);
    return false;
  }
}

async function uploadCommentImage(feedbackId, file) {
  try {
    var result = await uploadImage(file);
    addMetadata(result.stored_name, result.original_name, result.file_size, currentUser(), result._base64, result.url);
    if (!commentPendingImages[feedbackId]) commentPendingImages[feedbackId] = [];
    commentPendingImages[feedbackId].push(result.stored_name);

    var previewDiv = $('comment-preview-' + feedbackId);
    if (previewDiv) {
      var wrapper = document.createElement('div');
      wrapper.className = 'preview-image-wrapper';
      wrapper.setAttribute('data-name', result.stored_name);
      var img = document.createElement('img');
      img.src = result.url || getCosUrl(result.stored_name);
      img.onerror = function () { this.style.display = 'none'; };
      var removeBtn = document.createElement('span');
      removeBtn.className = 'preview-remove';
      removeBtn.innerHTML = '✕';
      removeBtn.onclick = function () {
        commentPendingImages[feedbackId] = commentPendingImages[feedbackId].filter(function (n) { return n !== result.stored_name; });
        wrapper.remove();
      };
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      previewDiv.appendChild(wrapper);
    }
    showToast('图片已添加');
  } catch (err) {
    showToast('上传失败: ' + (err.message || err), true);
  }
}

function loadFeedbacks() {
  allFeedbacksCache = getFeedbacks().sort(function (a, b) {
    return (b.created_at || '') > (a.created_at || '') ? 1 : -1;
  });
  renderFilterButtons();
  renderFeedbackList();
}

function renderFilterButtons() {
  var authors = [];
  allFeedbacksCache.forEach(function (fb) {
    if (authors.indexOf(fb.author) === -1) authors.push(fb.author);
  });
  var html = '<button class="filter-btn active" data-author="all">全部</button>';
  authors.forEach(function (a) {
    html += '<button class="filter-btn" data-author="' + a + '">' + escapeHtml(a) + '</button>';
  });
  $('filterButtons').innerHTML = html;

  $('filterButtons').querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentFilter = this.getAttribute('data-author');
      qsa('#filterButtons .filter-btn').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      renderFeedbackList();
    });
  });
}

function getVisibleFeedbacks() {
  var list = allFeedbacksCache;
  var user = currentUser();
  var role = currentRole();

  if (role !== 'admin' || !adminViewMode) {
    list = list.filter(function (fb) {
      return fb.author === user || fb.assigned_to === user || fb.original_author === user;
    });
  }

  if (currentFilter !== 'all') {
    list = list.filter(function (fb) { return fb.author === currentFilter; });
  }

  if (currentStatusFilter !== 'all') {
    list = list.filter(function (fb) { return fb.status === currentStatusFilter; });
  }

  return list;
}

function renderFeedbackList() {
  var list = getVisibleFeedbacks();
  var container = $('feedbackList');
  if (!list.length) {
    container.innerHTML = '<div class="empty-state">暂无反馈</div>';
    return;
  }

  var html = '';
  list.forEach(function (fb) {
    var statusClass = fb.status === 'resolved' ? 'status-resolved' : 'status-pending';
    var statusText = fb.status === 'resolved' ? '已处置' : '待处置';
    var isOwner = fb.author === currentUser();
    var isAdmin = currentRole() === 'admin';
    var canDelete = isAdmin;
    var canToggleStatus = isOwner || isAdmin;

    html += '<div class="feedback-item" data-id="' + fb.id + '">';
    html += '<div class="feedback-header">';
    html += '<div>';
    html += '<span class="feedback-author">' + escapeHtml(fb.author) + '</span>';
    if (fb.is_assigned_copy && fb.original_author) {
      html += '<span class="original-author-info">来自 ' + escapeHtml(fb.original_author) + '</span>';
    }
    if (fb.assigned_by) {
      html += '<span class="assigned-info">由 ' + escapeHtml(fb.assigned_by) + ' 下发</span>';
    }
    html += '</div>';
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<span class="status-badge ' + statusClass + '">' + statusText + '</span>';
    html += '<span class="feedback-time">' + formatTime(fb.created_at) + '</span>';
    html += '</div></div>';

    html += '<div class="feedback-content">' + escapeHtml(fb.content) + '</div>';

    if (fb.images && fb.images.length) {
      html += '<div class="feedback-images">';
      fb.images.forEach(function (imgName) {
        var meta = allImagesCache.find(function (m) { return m.stored_name === imgName; });
        var url = meta ? getImageUrl(meta) : '';
        if (!url && (imgName.startsWith('http') || imgName.startsWith('data:'))) url = imgName;
        if (url) {
          html += '<img class="feedback-img" data-stored="' + imgName + '" src="' + url + '" onclick="openImageModal(this)" loading="lazy" onerror="this.onerror=null;this.src=this.src+\'?retry=\'+Date.now();">';
        }
      });
      html += '</div>';
    }

    html += '<div class="feedback-actions">';
    if (canToggleStatus) {
      html += '<button class="status-toggle-btn" data-id="' + fb.id + '">' + (fb.status === 'pending' ? '标记已处置' : '标记待处置') + '</button>';
    }
    if (canDelete) {
      html += '<button class="delete-feedback-btn" data-id="' + fb.id + '">删除反馈</button>';
    }
    if (isAdmin) {
      html += '<div style="position:relative;display:inline-flex;align-items:center;gap:6px;">';
      html += '<button class="assign-btn" data-id="' + fb.id + '">下发问题</button>';
      html += '<input class="assign-search" data-id="' + fb.id + '" placeholder="搜索用户..." style="display:none;">';
      html += '<div class="assign-dropdown" data-id="' + fb.id + '"></div>';
      html += '</div>';
    }
    html += '</div>';

    var comments = fb.comments || [];
    html += '<div class="comments-section">';
    html += '<div class="comments-title">评论 (' + comments.length + ')</div>';
    comments.forEach(function (c) {
      var sysClass = c.is_system ? ' system-comment' : '';
      html += '<div class="comment-item' + sysClass + '">';
      html += '<div class="comment-header">';
      html += '<span class="comment-author">' + escapeHtml(c.author) + '</span>';
      html += '<span class="comment-time">' + formatTime(c.created_at) + '</span>';
      html += '</div>';
      if (c.content) html += '<div class="comment-content">' + escapeHtml(c.content) + '</div>';
      if (c.images && c.images.length) {
        html += '<div class="comment-images">';
        c.images.forEach(function (imgName) {
          var meta = allImagesCache.find(function (m) { return m.stored_name === imgName; });
          var url = meta ? getImageUrl(meta) : '';
          if (!url && (imgName.startsWith('http') || imgName.startsWith('data:'))) url = imgName;
          if (url) html += '<img class="comment-img" data-stored="' + imgName + '" src="' + url + '" onclick="openImageModal(this)" onerror="this.onerror=null;this.src=this.src+\'?retry=\'+Date.now();">';
        });
        html += '</div>';
      }
      if ((c.author === currentUser() || isAdmin) && !c.is_system) {
        html += '<button class="comment-delete" data-fb="' + fb.id + '" data-cm="' + c.id + '">删除</button>';
      }
      html += '</div>';
    });

    html += '<div class="add-comment-area">';
    html += '<input class="comment-input" id="comment-input-' + fb.id + '" placeholder="输入评论...">';
    html += '<button class="comment-upload-img" data-fb="' + fb.id + '">图片</button>';
    html += '<input type="file" id="comment-file-' + fb.id + '" accept="image/*" style="display:none;">';
    html += '<button class="comment-submit" data-fb="' + fb.id + '">发送</button>';
    html += '</div>';
    html += '<div class="comment-images-preview" id="comment-preview-' + fb.id + '"></div>';
    html += '</div>';

    html += '</div>';
  });

  container.innerHTML = html;
  bindFeedbackEvents();
    // 延迟更新反馈列表中的图片签名
  setTimeout(() => {
    const allStoredNames = new Set();
    document.querySelectorAll('.feedback-img[data-stored], .comment-img[data-stored]').forEach(img => {
      const stored = img.getAttribute('data-stored');
      if (stored) allStoredNames.add(stored);
    });
    allStoredNames.forEach(storedName => {
      ensureSignedUrl(storedName).then(signedUrl => {
        document.querySelectorAll(`.feedback-img[data-stored="${storedName}"], .comment-img[data-stored="${storedName}"]`).forEach(img => {
          if (img.src !== signedUrl) img.src = signedUrl;
        });
      }).catch(err => console.warn('更新反馈图片失败', storedName, err));
    });
  }, 150);
}

function bindFeedbackEvents() {
  const container = $('#feedbackList');
  if (!container) return;

  // 移除旧的委托监听器（避免重复注册）
  container.removeEventListener('click', feedbackClickHandler);
  container.removeEventListener('input', feedbackInputHandler);
  container.removeEventListener('blur', feedbackBlurHandler);

  // 添加新的委托监听器
  container.addEventListener('click', feedbackClickHandler);
  container.addEventListener('input', feedbackInputHandler);
  container.addEventListener('blur', feedbackBlurHandler);
}
// 全局 click 委托处理器
function feedbackClickHandler(e) {
  const target = e.target;

  // 1. 标记状态按钮
  if (target.classList.contains('status-toggle-btn')) {
    toggleFeedbackStatus(target.getAttribute('data-id'));
  }
  // 2. 删除反馈按钮
  else if (target.classList.contains('delete-feedback-btn')) {
    if (confirm('确定删除此反馈吗？')) {
      deleteFeedback(target.getAttribute('data-id'));
    }
  }
  // 3. 下发问题按钮（显示/隐藏搜索框）
  else if (target.classList.contains('assign-btn')) {
    const id = target.getAttribute('data-id');
    // 查找同属一个反馈项的搜索框和下拉菜单
    const feedbackItem = target.closest('.feedback-item');
    if (!feedbackItem) return;
    const searchInput = feedbackItem.querySelector('.assign-search');
    const dropdown = feedbackItem.querySelector('.assign-dropdown');
    if (searchInput && dropdown) {
      const visible = searchInput.style.display !== 'none';
      searchInput.style.display = visible ? 'none' : 'inline-block';
      dropdown.style.display = 'none';
      if (!visible) searchInput.focus();
    }
  }
  // 4. 评论提交按钮
  else if (target.classList.contains('comment-submit')) {
    const fbId = target.getAttribute('data-fb');
    const input = document.getElementById(`comment-input-${fbId}`);
    const content = input ? input.value.trim() : '';
    const images = commentPendingImages[fbId] || [];
    if (!content && !images.length) {
      showToast('请输入评论内容', true);
      return;
    }
    addComment(fbId, content, images);
  }
  // 5. 评论图片上传按钮
  else if (target.classList.contains('comment-upload-img')) {
    const fbId = target.getAttribute('data-fb');
    const fileInput = document.getElementById(`comment-file-${fbId}`);
    if (fileInput) fileInput.click();
  }
  // 6. 删除评论按钮
  else if (target.classList.contains('comment-delete')) {
    if (confirm('确定删除此评论吗？')) {
      deleteComment(target.getAttribute('data-fb'), target.getAttribute('data-cm'));
    }
  }
  // 7. 选择下发用户的选项（动态生成的下拉项）
  else if (target.classList.contains('assign-option')) {
    const userId = target.getAttribute('data-user');
    const fbId = target.getAttribute('data-fb');
    assignFeedback(fbId, userId);
    // 关闭对应的搜索框和下拉菜单
    const feedbackItem = target.closest('.feedback-item');
    if (feedbackItem) {
      const searchInput = feedbackItem.querySelector('.assign-search');
      const dropdown = feedbackItem.querySelector('.assign-dropdown');
      if (searchInput) searchInput.style.display = 'none';
      if (dropdown) dropdown.style.display = 'none';
      if (searchInput) searchInput.value = '';
    }
  }
}

// 全局 input 委托处理器（用于搜索用户）
function feedbackInputHandler(e) {
  const target = e.target;
  if (!target.classList.contains('assign-search')) return;

  const id = target.getAttribute('data-id');
  const feedbackItem = target.closest('.feedback-item');
  if (!feedbackItem) return;
  const dropdown = feedbackItem.querySelector('.assign-dropdown');
  const query = target.value.toLowerCase();
  const users = getUsers();
  const filtered = Object.keys(users).filter(u => u !== currentUser() && u.toLowerCase().includes(query));

  if (filtered.length && query) {
    dropdown.innerHTML = filtered.map(u => `<div class="assign-option" data-user="${escapeHtml(u)}" data-fb="${id}" style="padding:6px 12px;cursor:pointer;font-size:.75rem;">${escapeHtml(u)}</div>`).join('');
    dropdown.style.display = 'block';
  } else {
    dropdown.style.display = 'none';
  }
}

// 全局 blur 委托处理器（延迟隐藏下拉菜单）
function feedbackBlurHandler(e) {
  const target = e.target;
  if (!target.classList.contains('assign-search')) return;
  const feedbackItem = target.closest('.feedback-item');
  if (feedbackItem) {
    const dropdown = feedbackItem.querySelector('.assign-dropdown');
    setTimeout(() => {
      if (dropdown) dropdown.style.display = 'none';
    }, 200);
  }
}
function submitFeedback() {
  var content = $('feedbackContent').value.trim();
  if (!content) { showToast('反馈内容不能为空', true); return; }
  var feedbacks = getFeedbacks();
  var fb = {
    id: genShortId(),
    author: currentUser(),
    content: content,
    images: selectedImages.slice(),
    status: 'pending',
    created_at: new Date().toISOString(),
    comments: []
  };
  feedbacks.push(fb);
  saveFeedbacks(feedbacks);
  $('feedbackContent').value = '';
  selectedImages = [];
  updateSelectedHint();
  $('uploadProgress').textContent = '';
  showToast('反馈已提交');
  loadFeedbacks();
  loadImagesForFeedback();
}

function toggleFeedbackStatus(id) {
  var feedbacks = getFeedbacks();
  var idx = feedbacks.findIndex(function (fb) { return fb.id === id; });
  if (idx === -1) return;
  var fb = feedbacks[idx];
  if (fb.author !== currentUser() && currentRole() !== 'admin') { showToast('无权修改状态', true); return; }
  fb.status = fb.status === 'resolved' ? 'pending' : 'resolved';
  if (fb.status === 'resolved') {
    fb.resolved_at = new Date().toISOString();
    fb.resolved_by = currentUser();
  }
  saveFeedbacks(feedbacks);
  loadFeedbacks();
  showToast('状态已更新');
}

function deleteFeedback(id) {
  var feedbacks = getFeedbacks().filter(function (fb) { return fb.id !== id; });
  saveFeedbacks(feedbacks);
  loadFeedbacks();
  showToast('反馈已删除');
}

function addComment(feedbackId, content, images) {
  var feedbacks = getFeedbacks();
  var idx = feedbacks.findIndex(function (fb) { return fb.id === feedbackId; });
  if (idx === -1) return;
  if (!feedbacks[idx].comments) feedbacks[idx].comments = [];
  var cm = {
    id: genShortId(),
    author: currentUser(),
    content: content,
    images: images || [],
    created_at: new Date().toISOString()
  };
  feedbacks[idx].comments.push(cm);
  saveFeedbacks(feedbacks);
  delete commentPendingImages[feedbackId];

  var fbAuthor = feedbacks[idx].author;
  if (fbAuthor !== currentUser()) {
    var preview = content ? content.substring(0, 50) : '[图片]';
    addNotification(fbAuthor, '新评论通知', currentUser() + ' 评论了你的反馈：' + preview, 'comment', feedbackId);
  }
  loadFeedbacks();
  showToast('评论已添加');
}

function deleteComment(fbId, cmId) {
  var feedbacks = getFeedbacks();
  var idx = feedbacks.findIndex(function (fb) { return fb.id === fbId; });
  if (idx === -1) return;
  var comments = feedbacks[idx].comments || [];
  var cmIdx = comments.findIndex(function (c) { return c.id === cmId; });
  if (cmIdx === -1) return;
  if (comments[cmIdx].author !== currentUser() && currentRole() !== 'admin') {
    showToast('无权删除此评论', true); return;
  }
  comments.splice(cmIdx, 1);
  feedbacks[idx].comments = comments;
  saveFeedbacks(feedbacks);
  loadFeedbacks();
  showToast('评论已删除');
}

function assignFeedback(fbId, assignedTo) {
  var feedbacks = getFeedbacks();
  var idx = feedbacks.findIndex(function (fb) { return fb.id === fbId; });
  if (idx === -1) return;
  var source = feedbacks[idx];

  var copy = {
    id: genShortId(),
    author: assignedTo,
    original_author: source.author,
    content: source.content,
    images: (source.images || []).slice(),
    status: 'pending',
    is_assigned_copy: true,
    source_feedback_id: fbId,
    assigned_by: currentUser(),
    assigned_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    comments: []
  };
  feedbacks.push(copy);

  if (!feedbacks[idx].comments) feedbacks[idx].comments = [];
  feedbacks[idx].comments.push({
    id: genShortId(),
    author: 'system',
    content: '管理员 ' + currentUser() + ' 已将此问题下发给 @' + assignedTo + ' 处理。',
    created_at: new Date().toISOString(),
    is_system: true
  });

  saveFeedbacks(feedbacks);

  var preview = source.content.substring(0, 50);
  addNotification(assignedTo, '问题下发通知',
    '管理员 ' + currentUser() + ' 将问题 "' + preview + (source.content.length > 50 ? '...' : '') + '" 下发给您处理',
    'assign', copy.id);

  loadFeedbacks();
  showToast('已下发给 ' + assignedTo);
}

function initStatusFilter() {
  $('statusFilterButtons').innerHTML =
    '<button class="filter-btn status-filter active" data-status="all">全部</button>' +
    '<button class="filter-btn status-filter" data-status="pending">待处置</button>' +
    '<button class="filter-btn status-filter" data-status="resolved">已处置</button>';

  $('statusFilterButtons').querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentStatusFilter = this.getAttribute('data-status');
      qsa('#statusFilterButtons .filter-btn').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      renderFeedbackList();
    });
  });

  var toggle = $('adminViewToggle');
  if (toggle) {
    toggle.addEventListener('change', function () {
      adminViewMode = this.checked;
      loadFeedbacks();
    });
  }
}

// ==================== 图床管理页 ====================
function renderGalleryPage() {
  setupNavTabs();
  if ($('headerUsername2')) $('headerUsername2').textContent = currentUser();
  if ($('headerRole2')) $('headerRole2').textContent = currentRole();
  var images = getMetadata().sort(function (a, b) {
    return (b.upload_time || '') > (a.upload_time || '') ? 1 : -1;
  });
  renderGallery(images);
  updateUnreadBadge();
}

function renderGallery(images) {
  // 原渲染逻辑（保持不变）
  $('statsInfo').textContent = images.length + ' 张图片';
  var container = $('galleryContainer');
  if (!images.length) {
    container.innerHTML = '<div class="empty-state">暂无图片</div>';
    return;
  }

  var html = '';
  images.forEach(function (img, i) {
    var canDelete = img.uploader === currentUser() || currentRole() === 'admin';
    var imgUrl = getImageUrl(img);
    html += `<div class="image-card" data-stored="${img.stored_name}" data-url="${imgUrl}">
      <div class="checkbox-wrapper"><input type="checkbox" class="img-checkbox" data-stored="${img.stored_name}" data-url="${imgUrl}" id="gchk_${i}"></div>
      <img class="card-img" src="${imgUrl}" alt="${escapeHtml(img.original_name)}" loading="lazy" 
        onerror="this.onerror=null;this.src=this.src+'?retry='+Date.now();this.parentNode.querySelector('.card-img-placeholder').style.display='flex';">
      <div class="card-img-placeholder" style="display:none;text-align:center;background:#e2e8f0;padding:10px;">加载失败</div>
      <div class="card-info">
        <div class="img-name" title="${escapeHtml(img.original_name)}">${escapeHtml(img.original_name)}</div>
        <div class="img-meta"><span>${escapeHtml(img.uploader)}</span><span>${formatSize(img.file_size)}</span></div>
        <div class="card-actions">
          <button class="copy-link-btn" data-stored="${img.stored_name}" data-url="${imgUrl}">复制链接</button>
          ${canDelete ? `<button class="delete-btn" data-stored="${img.stored_name}">删除</button>` : '<button class="delete-btn" disabled>无权删除</button>'}
        </div>
      </div>
    </div>`;
  });
  container.innerHTML = html;

  // 事件绑定（保持不变）
  container.querySelectorAll('.card-img').forEach(function (img) {
    img.addEventListener('click', function (e) {
      e.stopPropagation();
      openImageModal(img.src);
    });
  });

  container.querySelectorAll('.copy-link-btn').forEach(function (btn) {
    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      var storedName = btn.getAttribute('data-stored');
      var fallbackUrl = btn.getAttribute('data-url');
      var url = storedName ? await ensureSignedUrl(storedName) : fallbackUrl;
      try {
        await navigator.clipboard.writeText(url);
      } catch (err) {
        var ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast('链接已复制');
    });
  });

  container.querySelectorAll('.delete-btn:not([disabled])').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var name = btn.getAttribute('data-stored');
      if (confirm('确定删除此图片吗？')) {
        // 1. 先删除 COS 上的实际文件
        deleteCosFile(name).then(() => {
          // 2. 再删除元数据
          removeMetadata(name);
          // 3. 重新渲染
          var imgs = getMetadata().sort(function (a, b) {
            return (b.upload_time || '') > (a.upload_time || '') ? 1 : -1;
          });
          renderGallery(imgs);
          allImagesCache = imgs;
          renderExistingImages();
          showToast('图片已删除');
        }).catch(err => {
          console.error('COS 删除失败', err);
          showToast('删除失败：' + err.message, true);
        });
      }
    });
  });

  // ---------- 新增修复代码：延迟主动更新签名图片 ----------
  setTimeout(() => {
    images.forEach(img => {
      if (img.stored_name) {
        ensureSignedUrl(img.stored_name).then(signedUrl => {
          updateSingleImageSrc(img.stored_name, signedUrl);
        }).catch(err => console.warn('签名失败', img.stored_name, err));
      }
    });
  }, 100);
}

function refreshGallery() {
  var imgs = getMetadata().sort(function (a, b) {
    return (b.upload_time || '') > (a.upload_time || '') ? 1 : -1;
  });
  renderGallery(imgs);
  allImagesCache = imgs;
  renderExistingImages();
}

function copySelectedGalleryUrls() {
  var checkboxes = qsa('.img-checkbox:checked');
  if (!checkboxes.length) { showToast('请至少选择一张图片', true); return; }
  var promises = [];
  checkboxes.forEach(function (cb) {
    var storedName = cb.getAttribute('data-stored');
    promises.push(storedName ? ensureSignedUrl(storedName) : Promise.resolve(cb.getAttribute('data-url')));
  });
  Promise.all(promises).then(function (urls) {
    var text = urls.join('\n');
    try {
      navigator.clipboard.writeText(text).then(function () {
        showToast('已复制 ' + urls.length + ' 个链接');
      });
    } catch (err) {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('已复制 ' + urls.length + ' 个链接');
    }
  });
}

function toggleSelectAllGallery() {
  var cbs = qsa('.img-checkbox');
  var allChecked = Array.from(cbs).every(function (cb) { return cb.checked; });
  cbs.forEach(function (cb) { cb.checked = !allChecked; });
}

// ==================== 通知系统 ====================
var notificationPanelOpen = false;

function loadNotificationsForUI() {
  var list = getNotifications().filter(function (n) { return n.user_id === currentUser(); });
  list.sort(function (a, b) { return (b.created_at || '') > (a.created_at || '') ? 1 : -1; });
  renderNotificationList(list);
}

function updateUnreadBadge() {
  var list = getNotifications().filter(function (n) { return n.user_id === currentUser() && !n.is_read; });
  var count = list.length > 99 ? '99+' : list.length;
  function setBadge(el) {
    if (!el) return;
    if (list.length > 0) { el.textContent = count; el.style.display = 'inline-block'; }
    else el.style.display = 'none';
  }
  setBadge($('unreadBadge'));
  setBadge($('unreadBadge2'));
}

function renderNotificationList(list) {
  var container = $('notificationList');
  if (!list.length) {
    container.innerHTML = '<div class="empty-notifications">暂无消息</div>';
    return;
  }
  var html = '';
  list.forEach(function (n) {
    html += `<div class="notification-item${!n.is_read ? ' unread' : ''}" data-id="${n.id}">
      <button class="notification-delete" data-id="${n.id}">✕</button>
      <div class="notification-item-title">${escapeHtml(n.title)}</div>
      <div class="notification-item-content">${escapeHtml(n.content)}</div>
      <div class="notification-item-time">${formatTime(n.created_at)}</div>
    </div>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.notification-item').forEach(function (item) {
    item.addEventListener('click', function (e) {
      if (e.target.classList.contains('notification-delete')) return;
      var id = item.getAttribute('data-id');
      markNotificationRead(id);
    });
  });

  container.querySelectorAll('.notification-delete').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var id = btn.getAttribute('data-id');
      if (confirm('确定删除这条消息吗？')) {
        deleteNotification(id);
      }
    });
  });
}

function toggleNotificationPanel() {
  var panel = $('notificationPanel');
  notificationPanelOpen = !notificationPanelOpen;
  if (notificationPanelOpen) {
    panel.classList.add('show');
    loadNotificationsForUI();
  } else {
    panel.classList.remove('show');
  }
}

function markNotificationRead(id) {
  var list = getNotifications();
  list.forEach(function (n) {
    if (n.id === id && n.user_id === currentUser()) n.is_read = true;
  });
  saveNotifications(list);
  loadNotificationsForUI();
  updateUnreadBadge();
}

function markAllNotificationsRead() {
  var list = getNotifications();
  list.forEach(function (n) {
    if (n.user_id === currentUser()) n.is_read = true;
  });
  saveNotifications(list);
  loadNotificationsForUI();
  updateUnreadBadge();
  showToast('已标记全部为已读');
}

function deleteAllReadNotifications() {
  if (!confirm('确定删除所有已读消息吗？')) return;
  var list = getNotifications().filter(function (n) {
    return !(n.user_id === currentUser() && n.is_read);
  });
  saveNotifications(list);
  loadNotificationsForUI();
  updateUnreadBadge();
  showToast('已删除所有已读消息');
}

function deleteNotification(id) {
  var list = getNotifications().filter(function (n) {
    return !(n.id === id && n.user_id === currentUser());
  });
  saveNotifications(list);
  loadNotificationsForUI();
  updateUnreadBadge();
}

// ==================== 用户管理面板 ====================
function showUserPanel() {
  var users = getUsers();
  var html = '<div style="overflow-x:auto;"><table><thead><tr><th>用户名</th><th>角色</th><th>注册时间</th></tr></thead><tbody>';
  Object.keys(users).forEach(function (u) {
    html += `<tr><td>${escapeHtml(u)}</td><td>${escapeHtml(users[u].role || 'user')}</td><td>${users[u].created_at ? formatTime(users[u].created_at) : '-'}</td></tr>`;
  });
  html += '</tbody></table></div>';
  $('userPanelBody').innerHTML = html;
  $('userPanelOverlay').classList.add('show');
}

function hideUserPanel() {
  $('userPanelOverlay').classList.remove('show');
}

// ==================== 修改密码 ====================
function showPwdPanel() {
  $('oldPassword').value = '';
  $('newPassword1').value = '';
  $('newPassword2').value = '';
  $('pwdError').style.display = 'none';
  $('pwdPanelOverlay').classList.add('show');
}

function hidePwdPanel() {
  $('pwdPanelOverlay').classList.remove('show');
}

async function changePassword() {
  var oldPwd = $('oldPassword').value;
  var new1 = $('newPassword1').value;
  var new2 = $('newPassword2').value;
  if (!oldPwd || !new1 || !new2) {
    $('pwdError').textContent = '请填写所有字段';
    $('pwdError').style.display = 'block';
    return;
  }
  if (new1 !== new2) {
    $('pwdError').textContent = '两次输入的新密码不一致';
    $('pwdError').style.display = 'block';
    return;
  }
  if (new1.length < 3) {
    $('pwdError').textContent = '新密码至少3个字符';
    $('pwdError').style.display = 'block';
    return;
  }
  var users = getUsers();
  var user = users[currentUser()];
  var oldHashed = await hashPassword(oldPwd);
  if (user.password !== oldHashed) {
    $('pwdError').textContent = '当前密码错误';
    $('pwdError').style.display = 'block';
    return;
  }
  user.password = await hashPassword(new1);
  saveUsers(users);
  hidePwdPanel();
  showToast('密码修改成功');
}

// ==================== 全局事件绑定 ====================
function bindGlobalEvents() {
  $('submitFeedbackBtn').addEventListener('click', submitFeedback);
  $('drawerHeader').addEventListener('click', toggleDrawer);
  $('uploadForFeedbackBtn').addEventListener('click', function () {
    $('feedbackFileInput').click();
  });
  $('feedbackFileInput').addEventListener('change', async function () {
    if (this.files[0]) {
      await uploadImageForFeedback(this.files[0]);
      this.value = '';
    }
  });

  $('loginForm').addEventListener('submit', handleLogin);
  $('regForm').addEventListener('submit', handleRegister);
  $('toRegisterLink').addEventListener('click', function (e) { e.preventDefault(); navigate('register'); });
  $('toLoginLink').addEventListener('click', function (e) { e.preventDefault(); navigate('login'); });

  $('logoutBtn').addEventListener('click', handleLogout);
  if ($('logoutBtn2')) $('logoutBtn2').addEventListener('click', handleLogout);

  $('notificationIcon').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleNotificationPanel();
  });

  if ($('notificationIcon2')) $('notificationIcon2').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleNotificationPanel();
  });

  document.addEventListener('click', function (e) {
    var panel = $('notificationPanel');
    if (notificationPanelOpen && panel && !panel.contains(e.target) && !e.target.closest('.notification-icon')) {
      panel.classList.remove('show');
      notificationPanelOpen = false;
    }
  });

  $('markAllReadBtn').addEventListener('click', markAllNotificationsRead);
  $('deleteAllReadBtn').addEventListener('click', deleteAllReadNotifications);

  $('refreshGalleryBtn').addEventListener('click', refreshGallery);
  $('copySelectedBtn').addEventListener('click', copySelectedGalleryUrls);
  $('selectAllBtn').addEventListener('click', toggleSelectAllGallery);
  $('galleryUploadBtn').addEventListener('click', function () { $('galleryFileInput').click(); });
  $('galleryFileInput').addEventListener('change', async function () {
    if (this.files[0]) {
      var result = await uploadImageForFeedback(this.files[0]);
      if (result) {
        var imgs = getMetadata().sort(function (a, b) {
          return (b.upload_time || '') > (a.upload_time || '') ? 1 : -1;
        });
        renderGallery(imgs);
        allImagesCache = imgs;
        renderExistingImages();
      }
      this.value = '';
    }
  });

  $('closeModalBtn').addEventListener('click', function () { $('imageModal').style.display = 'none'; });
  $('imageModal').addEventListener('click', function (e) {
    if (e.target === this) this.style.display = 'none';
  });

  $('closeUserPanelBtn').addEventListener('click', hideUserPanel);
  $('userPanelOverlay').addEventListener('click', function (e) {
    if (e.target === this) hideUserPanel();
  });

  $('changePwdLink').addEventListener('click', function (e) { e.preventDefault(); showPwdPanel(); });
  if ($('changePwdLink2')) $('changePwdLink2').addEventListener('click', function (e) { e.preventDefault(); showPwdPanel(); });
  $('closePwdPanelBtn').addEventListener('click', hidePwdPanel);
  $('pwdPanelOverlay').addEventListener('click', function (e) { if (e.target === this) hidePwdPanel(); });
  $('changePwdBtn').addEventListener('click', changePassword);

  $('cosSetupLink').addEventListener('click', function (e) { e.preventDefault(); showCosSetupPanel(); });
  $('closeCosSetupBtn').addEventListener('click', hideCosSetupPanel);
  $('cosSetupOverlay').addEventListener('click', function (e) { if (e.target === this) hideCosSetupPanel(); });
  $('cosSetupSaveBtn').addEventListener('click', saveSetupCos);

  $('galleryNavLink').addEventListener('click', function (e) {
    e.preventDefault();
    navigate('gallery');
  });
}

// ==================== 应用初始化 ====================
async function initApp() {
  await initData();
  await initAdminPassword();

  if (!COS_CONFIG.SecretId) {
    if ($('cosConfigBanner')) $('cosConfigBanner').classList.add('show');
    if ($('cosConfigBanner2')) $('cosConfigBanner2').classList.add('show');
    if ($('cosSetupLink')) $('cosSetupLink').style.display = 'inline';
  }

  bindGlobalEvents();

  window.addEventListener('beforeunload', function () {
    var keys = Object.keys(PENDING_SAVES);
    keys.forEach(function (k) {
      if (PENDING_SAVES[k]) clearTimeout(PENDING_SAVES[k]);
      PENDING_SAVES[k] = null;
      saveDataRemote(k);
    });
  });

  if (currentUser()) {
    navigate('main');
  } else {
    navigate('login');
  }
}

document.addEventListener('DOMContentLoaded', initApp);
