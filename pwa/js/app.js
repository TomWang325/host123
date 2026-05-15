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

  const cosLink = $('cosSetupLink');
  if (cosLink){
    cosLink.textContent = '修改COS配置';
    cosLink.style.display = 'inline';
  }

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
  metadata: 'host_metadata',
  documents: 'host_documents'
};

// ==================== 工具函数 ====================
function $(id) { return document.getElementById(id); }
function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return document.querySelectorAll(sel); }
function getDocuments() { return loadData(STORAGE_KEYS.documents) || []; }
function saveDocuments(list) { saveData(STORAGE_KEYS.documents, list); }

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
function addDocument(storedName, originalName, fileSize, uploader) {
  var docs = getDocuments();
  docs.push({
    stored_name: storedName,
    original_name: originalName,
    upload_time: new Date().toISOString(),
    file_size: fileSize,
    uploader: uploader
  });
  saveDocuments(docs);
}

function removeDocument(storedName) {
  var docs = getDocuments().filter(d => d.stored_name !== storedName);
  saveDocuments(docs);
}
async function deleteDocument(storedName) {
  // 1. 删除 COS 上的实际文件
  await deleteCosFile(storedName);
  // 2. 从本地元数据中移除
  const currentDocs = getDocuments();          // 获取当前数组
  const newDocs = currentDocs.filter(d => d.stored_name !== storedName);
  saveDocuments(newDocs);                       // 保存到本地（内存+localStorage）
  // 3. 立即将更新后的元数据上传到 COS，覆盖旧文件
  await saveDataNow(STORAGE_KEYS.documents, newDocs);
  // 4. 重新渲染列表
  renderDocsPage();
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
  // 如果 COS 可用，优先从 COS 读取全局盐
  if (getCosClient()) {
    let cos = getCosClient();
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
      let remoteSalt = res.trim();
      if (remoteSalt && remoteSalt.length === 32) {
        localStorage.setItem('host_enc_salt', remoteSalt);
        return remoteSalt;
      }
    } catch(e) { /* 文件不存在，继续生成新盐 */ }
  }

  // 如果没有 COS 或远程无盐，则使用本地盐或生成新盐
  let salt = localStorage.getItem('host_enc_salt');
  if (!salt || salt.length !== 32) {
    let saltBytes = crypto.getRandomValues(new Uint8Array(16));
    salt = Array.from(saltBytes).map(b => b.toString(16).padStart(2,'0')).join('');
    localStorage.setItem('host_enc_salt', salt);
  }

  // 如果有 COS 且远程无盐，则上传当前盐
  if (getCosClient()) {
    let cos = getCosClient();
    try {
      await new Promise((resolve, reject) => {
        cos.putObject({
          Bucket: COS_CONFIG.Bucket,
          Region: COS_CONFIG.Region,
          Key: 'host_data/_enc_salt.txt',
          Body: salt,
          ContentType: 'text/plain'
        }, err => err ? reject(err) : resolve());
      });
      console.log('已上传加密盐到 COS');
    } catch(e) { console.warn('上传盐失败', e); }
  }
  return salt;
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
      var str = '';
      if (typeof body === 'string') {
        str = body;
      } else if (body && typeof body.toString === 'function') {
        str = body.toString('utf-8');
      } else if (body && body instanceof ArrayBuffer) {
        str = new TextDecoder('utf-8').decode(new Uint8Array(body));
      } else {
        resolve(null);
        return;
      }
      // 移除可能的首尾空白（BOM或换行）
      str = str.trim();
      resolve(str);
    });
  });
}

function cosPutData(key, encryptedB64) {
  return new Promise((resolve) => {
    var cos = getCosClient();
    if (!cos) { console.warn('[COS] 客户端未初始化'); resolve(false); return; }
    cos.putObject({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: COS_DATA_PREFIX + key + '.enc',
      Body: encryptedB64,
      ContentType: 'text/plain; charset=utf-8',
      onProgress: null
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
  var localDocs = localStorage.getItem(STORAGE_KEYS.documents);
  
  CACHE[STORAGE_KEYS.users] = localUsers ? JSON.parse(localUsers) : null;
  CACHE[STORAGE_KEYS.feedbacks] = localFbs ? JSON.parse(localFbs) : null;
  CACHE[STORAGE_KEYS.notifications] = localNotifs ? JSON.parse(localNotifs) : null;
  CACHE[STORAGE_KEYS.metadata] = localMeta ? JSON.parse(localMeta) : null;
  CACHE[STORAGE_KEYS.documents] = localDocs ? JSON.parse(localDocs) : null;
  
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
    await syncFromRemote(STORAGE_KEYS.documents, 'array');
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
  if (!CACHE[STORAGE_KEYS.documents]) CACHE[STORAGE_KEYS.documents] = [];
  
  // 4. 保存到 localStorage（确保一致性）
  saveDataLocal(STORAGE_KEYS.users, CACHE[STORAGE_KEYS.users]);
  saveDataLocal(STORAGE_KEYS.feedbacks, CACHE[STORAGE_KEYS.feedbacks]);
  saveDataLocal(STORAGE_KEYS.notifications, CACHE[STORAGE_KEYS.notifications]);
  saveDataLocal(STORAGE_KEYS.metadata, CACHE[STORAGE_KEYS.metadata]);
  saveDataLocal(STORAGE_KEYS.documents, CACHE[STORAGE_KEYS.documents]);
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

function currentGroup() {
  var s = getSession();
  return s ? s.group : null;
}

// ==================== COS 上传模块 ====================
var SIGNED_URL_CACHE = {};
var DOC_PREVIEW_URL_CACHE = {};
var SIGNED_URL_TTL = 6 * 24 * 60 * 60 * 1000;
var docPreviewState = { storedName: '', originalName: '', page: 1, zoom: 1 };

function getCosRawUrl(key) {
  if (COS_CONFIG.baseUrl) return COS_CONFIG.baseUrl.replace(/\/$/, '') + '/' + key;
  return 'https://' + COS_CONFIG.Bucket + '.cos.' + COS_CONFIG.Region + '.myqcloud.com/' + key;
}

// ==================== 压缩包预览支持 ====================
const ARCHIVE_EXTENSIONS = [
  'zip', 'rar', '7z', '7zip', 'tar', 'gz', 'tgz', 
  'bz2', 'tbz2', 'xz', 'txz', 'apk', 'jar', 'war'
];
const MAX_ARCHIVE_SIZE = 128 * 1024 * 1024; // 128MB

function isArchiveFile(filename) {
  if (!filename) return false;
  const ext = filename.split('.').pop().toLowerCase();
  return ARCHIVE_EXTENSIONS.includes(ext);
}

function checkArchiveSize(file) {
  if (isArchiveFile(file.name) && file.size > MAX_ARCHIVE_SIZE) {
      showToast('请上传大小不超过128MB的文件，如仍需上传信息至此系统，请将文件另存其他云存储空间并在反馈中发布访问或下载地址链接。', true);
      return false;
  }
  return true;
}

// 扩展原文档预览判断函数，压缩包单独处理
function isDocPreviewable(filename) {
  if (isArchiveFile(filename)) return true; // 压缩包走预览通道
  var ext = (filename || '').split('.').pop().toLowerCase();
  return ['doc', 'docx', 'pdf', 'ppt', 'pptx', 'xls', 'xlsx', 'txt'].indexOf(ext) !== -1;
}



function generateSignedUrl(key,originalName = null) {
  return new Promise(function (resolve) {
    var cos = getCosClient();
    if (!cos) { resolve(getCosRawUrl(key)); return; }
    
    // 判断是否为图片文件（根据扩展名）
    var ext = key.split('.').pop().toLowerCase();
    var isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
    
    // 仅对图片添加万象处理参数（使用无损的 auto-orient 或 thumbnail/100p）
    var queryParams = {};
    if (isImage) {
      queryParams = { 'imageMogr2/auto-orient': '' };  // 或者 thumbnail/100p
    }else if (originalName) {
        var encodedName = encodeURIComponent(originalName).replace(/[!'()*]/g, function(c){
          return '%' + c.charCodeAt(0).toString(16).toUpperCase();
        });
        queryParams['response-content-disposition'] = `attachment; filename="${encodeURIComponent(originalName)}"; filename*=UTF-8''${encodedName}`;
      }
    
    cos.getObjectUrl({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: key,
      Sign: true,
      Expires: 86400,
      Query: queryParams   // 非图片文件为空对象，不添加任何参数
    }, function (err, data) {
      if (err) { 
        console.warn('getObjectUrl 失败，降级使用原始URL', err);
        resolve(getCosRawUrl(key)); 
      } else {
        resolve(data.Url);
      }
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

function ensureSignedUrl(key, originalName) {
  return new Promise(function (resolve) {
    if (!getCosClient()) { resolve(getCosRawUrl(key)); return; }
    var cached = SIGNED_URL_CACHE[key];
    if (cached && (Date.now() - cached.time) < SIGNED_URL_TTL) {
      resolve(cached.url);
    } else {
      generateSignedUrl(key, originalName).then(function (signed) {
        SIGNED_URL_CACHE[key] = { url: signed, time: Date.now() };
        resolve(signed);
      });
    }
  });
}

function isDocPreviewable(filename) {
  if (isArchiveFile(filename)) return true;
  var ext = (filename || '').split('.').pop().toLowerCase();
  return ['doc', 'docx', 'pdf', 'ppt', 'pptx', 'xls', 'xlsx', 'txt'].indexOf(ext) !== -1;
}

function generateDocPreviewUrl(key, page) {
  return new Promise(function (resolve, reject) {
    var cos = getCosClient();
    if (!cos) {
      reject(new Error('COS未配置，无法使用万象文档预览'));
      return;
    }
    cos.getObjectUrl({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: key,
      Sign: true,
      Expires: 3600,
      Query: {
        'ci-process': 'doc-preview',
        page: String(page || 1),
        dstType: 'jpg'
      }
    }, function (err, data) {
      if (err) reject(err);
      else resolve(data.Url);
    });
  });
}

function ensureDocPreviewUrl(key, page) {
  var cacheKey = key + '#doc-preview#' + page;
  var cached = DOC_PREVIEW_URL_CACHE[cacheKey];
  if (cached && (Date.now() - cached.time) < 55 * 60 * 1000) {
    return Promise.resolve(cached.url);
  }
  return generateDocPreviewUrl(key, page).then(function (url) {
    DOC_PREVIEW_URL_CACHE[cacheKey] = { url: url, time: Date.now() };
    return url;
  });
}



// ================================压缩包预览======================

// 压缩包预览状态
var archivePreviewState = {
  storedName: '',
  originalName: '',
  list: [],
  currentPath: '',
  hasMore: false,
  context: ''  // 分页标记
};

// 获取压缩包文件列表（COS zippreview 返回 XML，cos.request 会解析到 data.Response）
async function fetchArchiveFileList(storedName, path = '', marker = '') {
  const cos = getCosClient();
  if (!cos) throw new Error('COS未配置');

  const host = COS_CONFIG.Bucket + '.cos.' + COS_CONFIG.Region + '.myqcloud.com';
  const url = 'https://' + host + '/' + encodeURI(storedName).replace(/#/g, '%23');

  return new Promise((resolve, reject) => {
      cos.request({
          Method: 'GET',
          Key: storedName,
          Url: url,
          Query: {
              'ci-process': 'zippreview'
          }
      }, function (err, data) {
          if (err) {
              console.error('zippreview 请求失败：', err);
              const msg = (err.error && (err.error.Message || err.error.message)) || err.message || '请确认已开通数据万象文件处理服务，并检查 COS 权限';
              reject(new Error(msg));
              return;
          }

          try {
              const response = data.Response || {};
              let contents = response.Contents || [];
              if (!Array.isArray(contents)) contents = contents ? [contents] : [];

              const prefix = path ? path.replace(/\/?$/, '/') : '';
              const dirMap = {};
              const files = [];

              contents.forEach(item => {
                  const fullKey = item.Key || item.key || '';
                  if (!fullKey) return;
                  if (prefix && fullKey.indexOf(prefix) !== 0) return;

                  const rest = prefix ? fullKey.slice(prefix.length) : fullKey;
                  if (!rest) return;

                  const slashIndex = rest.indexOf('/');
                  if (slashIndex >= 0) {
                      const dirName = rest.slice(0, slashIndex);
                      if (dirName) dirMap[dirName] = true;
                  } else {
                      files.push({
                          type: 'file',
                          name: rest,
                          size: parseInt(item.UncompressedSize || item.Size || item.size || 0, 10),
                          lastModified: item.LastModified || item.lastModified || ''
                      });
                  }
              });

              const dirs = Object.keys(dirMap).sort().map(name => ({
                  type: 'dir',
                  name: name,
                  size: 0
              }));
              files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

              resolve({
                  Files: dirs.concat(files),
                  IsTruncated: 'false',
                  NextMarker: '',
                  FileNumber: response.FileNumber || contents.length
              });
          } catch (e) {
              console.error('解析 zippreview 结果失败：', e, data);
              reject(new Error('解析压缩包预览结果失败'));
          }
      });
  });
}

// 从压缩包中提取单个文件并下载
async function extractArchiveFile(storedName, internalPath, originalFilename) {
  const cos = getCosClient();
  if (!cos) throw new Error('COS未配置');
  
  // 构造下载 URL（带签名）
  const url = await new Promise((resolve, reject) => {
      cos.getObjectUrl({
          Bucket: COS_CONFIG.Bucket,
          Region: COS_CONFIG.Region,
          Key: storedName,
          Sign: true,
          Expires: 3600,
          Query: {
              'ci-process': 'zippreview',
              path: internalPath,
              'response-content-disposition': `attachment; filename="${encodeURIComponent(originalFilename)}"`
          }
      }, (err, data) => {
          if (err) reject(err);
          else resolve(data.Url);
      });
  });
  
  // 触发下载
  const a = document.createElement('a');
  a.href = url;
  a.download = originalFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// 打开压缩包预览模态框
async function openArchivePreview(storedName, originalName) {
  if (!isArchiveFile(originalName)) {
      showToast('该文件不是压缩包', true);
      return;
  }
  
  const modal = $('archivePreviewModal');
  if (!modal) {
      console.error('缺少压缩包预览模态框元素 archivePreviewModal');
      showToast('预览功能不可用，请刷新页面重试', true);
      return;
  }
  
  // 重置状态
  archivePreviewState = {
      storedName: storedName,
      originalName: originalName,
      list: [],
      currentPath: '',
      hasMore: false,
      context: ''
  };
  
  const titleEl = $('archivePreviewTitle');
  if (titleEl) titleEl.textContent = originalName;
  
  const loadingEl = $('archivePreviewLoading');
  if (loadingEl) loadingEl.style.display = 'block';
  
  const listContainer = $('archiveFileList');
  if (listContainer) listContainer.innerHTML = '';
  
  modal.classList.add('show');
  
  try {
      await loadArchiveDirectory('');
  } catch (err) {
      console.error('加载压缩包内容失败', err);
      showToast('预览失败：' + (err.message || '请确认已开通数据万象文件处理服务'), true);
      if (loadingEl) loadingEl.textContent = '预览失败，请稍后重试';
      // 可选：关闭模态框或保留失败提示
  } finally {
      if (loadingEl) loadingEl.style.display = 'none';
  }
}

// 加载指定目录（根目录传空字符串）
async function loadArchiveDirectory(path) {
  if (!archivePreviewState.storedName) return;
  
  const loading = $('archivePreviewLoading');
  const listContainer = $('archiveFileList');
  if (loading) loading.style.display = 'block';
  if (listContainer) listContainer.innerHTML = '';
  
  try {
      const result = await fetchArchiveFileList(archivePreviewState.storedName, path);
      archivePreviewState.currentPath = path;
      archivePreviewState.hasMore = result.IsTruncated === 'true';
      archivePreviewState.context = result.NextMarker || '';
      
      renderArchiveFileList(result.Files || [], path);
      if (loading) loading.style.display = 'none';
  } catch (err) {
      if (loading) {
          loading.textContent = '预览失败：' + (err.message || '请确认已开通数据万象文件处理服务');
          loading.style.display = 'block';
      }
      showToast('预览失败：' + err.message, true);
  }
}

// 渲染压缩包文件列表
function renderArchiveFileList(files, currentPath) {
  const container = $('archiveFileList');
  if (!container) return;
  
  if (!files.length && currentPath === '') {
      container.innerHTML = '<div class="empty-state">该压缩包内没有文件</div>';
      return;
  }
  
  let html = '<table class="archive-file-table"><thead><tr><th>文件名</th><th>大小</th><th>操作</th></tr></thead><tbody>';
  files.forEach(file => {
      const isDir = file.type === 'dir';
      const sizeStr = isDir ? '-' : formatSize(parseInt(file.size) || 0);
      const encodedPath = encodeURIComponent(file.name);
      const displayName = file.name;
      
      html += `<tr data-file-path="${file.name}" data-is-dir="${isDir}">
          <td class="archive-filename">${isDir ? '📁 ' : '📄 '} ${escapeHtml(displayName)}</td>
          <td>${sizeStr}</td>
          <td>${isDir ? 
              `<button class="archive-enter-dir" data-path="${file.name}">进入</button>` :
              `<button class="archive-download-file" data-path="${file.name}" data-name="${escapeHtml(displayName)}">下载</button>`
          }</td>
      </tr>`;
  });
  html += '</tbody></table>';
  
  if (currentPath !== '') {
      html = `<div class="archive-breadcrumb"><button class="archive-go-back">← 返回上级目录</button></div>` + html;
  }
  if (archivePreviewState.hasMore) {
      html += `<div class="archive-load-more"><button class="archive-load-more-btn">加载更多</button></div>`;
  }
  
  container.innerHTML = html;
  
  // 绑定事件
  container.querySelectorAll('.archive-enter-dir').forEach(btn => {
      btn.addEventListener('click', () => {
          const subPath = btn.getAttribute('data-path');
          const newPath = archivePreviewState.currentPath ? 
              archivePreviewState.currentPath + '/' + subPath : subPath;
          loadArchiveDirectory(newPath);
      });
  });
  
  container.querySelectorAll('.archive-go-back').forEach(btn => {
      btn.addEventListener('click', () => {
          const parentPath = archivePreviewState.currentPath.split('/').slice(0, -1).join('/');
          loadArchiveDirectory(parentPath);
      });
  });
  
  container.querySelectorAll('.archive-download-file').forEach(btn => {
      btn.addEventListener('click', async () => {
          const internalPath = archivePreviewState.currentPath ? 
              archivePreviewState.currentPath + '/' + btn.getAttribute('data-path') : 
              btn.getAttribute('data-path');
          const filename = btn.getAttribute('data-name');
          try {
              await extractArchiveFile(archivePreviewState.storedName, internalPath, filename);
              showToast('开始下载: ' + filename);
          } catch (err) {
              showToast('下载失败: ' + err.message, true);
          }
      });
  });
  
  container.querySelectorAll('.archive-load-more-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
          // 加载更多（使用 NextMarker）
          try {
              const result = await fetchArchiveFileList(
                  archivePreviewState.storedName, 
                  archivePreviewState.currentPath, 
                  archivePreviewState.context
              );
              const newFiles = result.Files || [];
              // 追加到现有列表
              const tbody = container.querySelector('tbody');
              newFiles.forEach(file => {
                  // 动态追加行（略，可复用上面渲染逻辑，简单起见重新全量渲染）
                  // 这里简化：重新调用 loadArchiveDirectory 但保留原有文件列表？更好的做法是追加，但为了代码简洁，重新加载全部会影响体验，这里采用追加方式
              });
              archivePreviewState.hasMore = result.IsTruncated === 'true';
              archivePreviewState.context = result.NextMarker || '';
              if (!archivePreviewState.hasMore) {
                  const moreBtn = container.querySelector('.archive-load-more');
                  if (moreBtn) moreBtn.remove();
              }
          } catch (err) {
              showToast('加载更多失败', true);
          }
      });
  });
}

// 关闭压缩包预览
function closeArchivePreview() {
  if ($('archivePreviewModal')) $('archivePreviewModal').classList.remove('show');
  if ($('archiveFileList')) $('archiveFileList').innerHTML = '';
}



// ======================= 文档预览=====================

async function openDocPreview(storedName, originalName) {
  // 1. 先检查是否为压缩包（优先处理，因为压缩包也满足 isDocPreviewable 的扩展）
  if (isArchiveFile(originalName || storedName)) {
      await openArchivePreview(storedName, originalName);
      return;
  }
  
  // 2. 非压缩包，检查是否为可预览的文档类型
  if (!isDocPreviewable(originalName || storedName)) {
      showToast('该文档类型暂不支持图片预览', true);
      return;
  }
  
  // 3. 原有的文档预览逻辑（保持不变）
  docPreviewState = { 
      storedName: storedName, 
      originalName: originalName || storedName, 
      page: 1, 
      zoom: 1 
  };
  if ($('docPreviewTitle')) $('docPreviewTitle').textContent = docPreviewState.originalName;
  if ($('docPreviewModal')) $('docPreviewModal').classList.add('show');
  updateDocPreviewZoom();
  await loadDocPreviewPage(1);
}

function updateDocPreviewZoom() {
  var img = $('docPreviewImg');
  var canvas = $('docPreviewCanvas');
  var body = document.querySelector('.doc-preview-body');
  var zoom = docPreviewState.zoom || 1;
  if (img) {
    img.style.width = (zoom * 100) + '%';
    img.style.height = 'auto';
  }
  if (canvas) canvas.classList.toggle('zoomed', zoom > 1);
  if (body && zoom > 1) body.scrollLeft = 0;
  if ($('docPreviewZoomInfo')) $('docPreviewZoomInfo').textContent = Math.round(zoom * 100) + '%';
  if ($('docPreviewZoomOutBtn')) $('docPreviewZoomOutBtn').disabled = zoom <= 0.25;
  if ($('docPreviewZoomInBtn')) $('docPreviewZoomInBtn').disabled = zoom >= 3;
}

function setDocPreviewZoom(zoom) {
  docPreviewState.zoom = Math.max(0.25, Math.min(3, zoom));
  updateDocPreviewZoom();
}

async function loadDocPreviewPage(page) {
  if (!docPreviewState.storedName) return;
  if (page < 1) page = 1;
  var img = $('docPreviewImg');
  var loading = $('docPreviewLoading');
  var prevBtn = $('docPreviewPrevBtn');
  var nextBtn = $('docPreviewNextBtn');
  if (loading) {
    loading.textContent = '正在生成预览...';
    loading.style.display = 'block';
  }
  if (img) {
    img.style.display = 'none';
    img.removeAttribute('src');
  }
  if (prevBtn) prevBtn.disabled = page <= 1;
  if (nextBtn) nextBtn.disabled = true;
  if ($('docPreviewPageInfo')) $('docPreviewPageInfo').textContent = '第 ' + page + ' 页';

  try {
    var url = await ensureDocPreviewUrl(docPreviewState.storedName, page);
    if (!img) return;
    img.onload = function () {
      docPreviewState.page = page;
      if (loading) loading.style.display = 'none';
      updateDocPreviewZoom();
      img.style.display = 'block';
      if (prevBtn) prevBtn.disabled = page <= 1;
      if (nextBtn) nextBtn.disabled = false;
      if ($('docPreviewPageInfo')) $('docPreviewPageInfo').textContent = '第 ' + page + ' 页';
    };
    img.onerror = function () {
      if (loading) {
        loading.textContent = page > docPreviewState.page ? '已经到最后一页，或该页暂不可预览' : '预览加载失败';
        loading.style.display = 'block';
      }
      if (prevBtn) prevBtn.disabled = docPreviewState.page <= 1;
      if (nextBtn) nextBtn.disabled = false;
      if ($('docPreviewPageInfo')) $('docPreviewPageInfo').textContent = '第 ' + docPreviewState.page + ' 页';
    };
    img.src = url;
  } catch (err) {
    if (loading) {
      loading.textContent = '预览失败：' + (err.message || '请确认已开通数据万象文档预览');
      loading.style.display = 'block';
    }
    if (nextBtn) nextBtn.disabled = false;
    showToast('预览失败：' + (err.message || '万象服务不可用'), true);
  }
}

function closeDocPreview() {
  if ($('docPreviewModal')) $('docPreviewModal').classList.remove('show');
  if ($('docPreviewImg')) $('docPreviewImg').removeAttribute('src');
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
function uploadToCosGeneric(file, onProgress) {
  return new Promise((resolve, reject) => {
    //压缩包大小限制
    if (!checkArchiveSize(file)) {
      reject(new Error('ARCHIVE_SIZE_LIMIT'));
      return;
    }

    if (!COS_CONFIG.enabled || !COS_CONFIG.SecretId) {
      reject(new Error('COS未配置'));
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
      onProgress: onProgress
    }, function (err, data) {
      if (err) reject(err);
      else resolve({
        stored_name: key,
        original_name: file.name,
        file_size: file.size
      });
    });
  });
}
function deleteCosFile(storedName) {
  return new Promise((resolve, reject) => {
    var cos = getCosClient();
    if (!cos) reject(new Error('COS未配置'));
    cos.deleteObject({
      Bucket: COS_CONFIG.Bucket,
      Region: COS_CONFIG.Region,
      Key: storedName
    }, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}
async function renderDocsPage() {
  setupNavTabs();
  if ($('headerUsername3')) $('headerUsername3').textContent = currentUser();
  if ($('headerRole3')) $('headerRole3').textContent = currentRole();
  if ($('headerGroup3')) $('headerGroup3').textContent = currentGroup();

  // 从 COS 拉取最新数据并渲染
  if (getCosClient()) {
    await syncFromRemote(STORAGE_KEYS.documents, 'array');
  }
  const allDocs = getDocuments().sort((a,b) => (b.upload_time||'') > (a.upload_time||'') ? 1 : -1);
  renderDocList(allDocs);
}

var ADMIN_MODULES = {
  users: { title: '用户管理', icon: '&#128101;' }
};
var currentAdminModule = 'users';

function renderAdminModule(moduleId) {
  currentAdminModule = moduleId;
  var cfg = ADMIN_MODULES[moduleId];
  if ($('adminModuleTitle')) $('adminModuleTitle').textContent = cfg ? cfg.title : '';

  qsa('.sidebar-item').forEach(function (el) {
    el.classList.toggle('active', el.getAttribute('data-module') === moduleId);
  });

  if ($('adminFilterBar')) {
    $('adminFilterBar').style.display = (moduleId === 'users') ? '' : 'none';
  }

  if (moduleId === 'users') {
    renderAdminUserTable($('adminModuleBody'));
  }
}

function setupAdminUserFilters() {
  if ($('adminUserSearch')) {
    $('adminUserSearch').addEventListener('input', function () {
      adminUserSearch = this.value;
      renderAdminUserTable($('adminModuleBody'));
    });
  }
  qsa('#adminGroupFilters .group-filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      adminUserGroupFilter = this.getAttribute('data-group');
      qsa('#adminGroupFilters .group-filter-btn').forEach(function (b) { b.classList.remove('active'); });
      this.classList.add('active');
      renderAdminUserTable($('adminModuleBody'));
    });
  });
}

async function renderAdminPage() {
  if (currentRole() !== 'admin') {
    navigate('main');
    return;
  }
  adminUserSearch = '';
  adminUserGroupFilter = 'all';
  setupNavTabs();
  if ($('headerUsername4')) $('headerUsername4').textContent = currentUser();
  if ($('headerRole4')) $('headerRole4').textContent = currentRole();
  if ($('headerGroup4')) $('headerGroup4').textContent = currentGroup();
  if (getCosClient()) {
    await syncFromRemote(STORAGE_KEYS.users, 'object');
  }
  renderAdminModule('users');
  setupAdminUserFilters();
  updateUnreadBadge();

  qsa('#adminSidebar .sidebar-item').forEach(function (item) {
    item.addEventListener('click', function () {
      var moduleId = item.getAttribute('data-module');
      if (moduleId === 'users') {
        if (getCosClient()) {
          syncFromRemote(STORAGE_KEYS.users, 'object').then(function () {
            renderAdminModule(moduleId);
          });
        } else {
          renderAdminModule(moduleId);
        }
      }
    });
  });
}


function renderDocList(docs) {
  var container = $('docListContainer');
  if (!container) return;
  if (!docs.length) {
    container.innerHTML = '<div class="empty-state">暂无文档，请点击上传</div>';
    return;
  }
  var html = '';
  docs.forEach((doc) => {
    var canDelete = doc.uploader === currentUser() || currentRole() === 'admin';
    // 判断是否显示预览按钮：原有文档类型 或 压缩包
    var showPreview = isDocPreviewable(doc.original_name) || isArchiveFile(doc.original_name);
    html += `<div class="image-card" data-stored="${doc.stored_name}">
      <div class="card-info">
        <div class="img-name" title="${escapeHtml(doc.original_name)}">${escapeHtml(doc.original_name)}</div>
        <div class="img-meta"><span>${escapeHtml(doc.uploader)}</span><span>${formatSize(doc.file_size)}</span></div>
        <div class="card-actions">
          ${showPreview ? `<button class="preview-doc-btn" data-stored="${doc.stored_name}" data-name="${escapeHtml(doc.original_name)}" type="button">预览</button>` : ''}
          <span class="download-doc-btn" data-stored="${doc.stored_name}" data-name="${escapeHtml(doc.original_name)}" style="background:#eef2ff;border:none;flex:1;padding:6px;border-radius:40px;font-size:.7rem;cursor:pointer;color:#3b82f6;display:flex;align-items:center;justify-content:center;gap:4px;">下载</span>
          ${canDelete ? `<button class="delete-doc-btn" data-stored="${doc.stored_name}" style="background:#ef4444;color:#fff;border:none;flex:1;padding:6px;border-radius:40px;font-size:.7rem;cursor:pointer;">删除</button>` : ''}
        </div>
      </div>
    </div>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.preview-doc-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      var storedName = btn.getAttribute('data-stored');
      var originalName = btn.getAttribute('data-name');
      // openDocPreview 内部已支持压缩包预览
      openDocPreview(storedName, originalName);
    });
  });

  container.querySelectorAll('.download-doc-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      var storedName = btn.getAttribute('data-stored');
      var originalName = btn.getAttribute('data-name');
      var url = await ensureSignedUrl(storedName, originalName);
      downloadFile(url, originalName);
    });
  });

  container.querySelectorAll('.delete-doc-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('确定删除此文档吗？')) {
        var stored = btn.getAttribute('data-stored');
        try {
          await deleteDocument(stored);
          showToast('文档已删除');
        } catch (err) {
          showToast('删除失败：' + err.message, true);
        }
      }
    });
  });
}

function getFileIcon(filename) {
  var ext = filename.split('.').pop().toLowerCase();
  if (ext === 'pdf') return '📄';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['xls','xlsx'].includes(ext)) return '📊';
  if (['ppt','pptx'].includes(ext)) return '📽️';
  return '📁';
}

function downloadFile(url, filename) {
  var a = document.createElement('a');
  a.href = url;
  // a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
   if (page === 'docs') {
    renderDocsPage();
  }
  if (page === 'admin') {
    renderAdminPage();
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
  setSession({ username: username, role: users[username].role || 'user', group: users[username].group || '' });
  $('loginError').style.display = 'none';
  navigate('main');
}

async function handleRegister(e) {
  e.preventDefault();
  var username = $('regUsername').value.trim();
  var password = $('regPassword').value;
  var group = $('regGroup').value.trim().toUpperCase();
  var VALID_GROUPS = ['A', 'B', 'C', 'D', 'E'];
  if (!username || !password) {
    $('regError').textContent = '用户名和密码不能为空';
    $('regError').style.display = 'block';
    return;
  }
  if (!group || VALID_GROUPS.indexOf(group) === -1) {
    $('regError').textContent = '请选择有效分组（A/B/C/D/E）';
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
    group: group,
    created_at: new Date().toISOString()
  };
  saveUsers(users);
  await saveDataNow(STORAGE_KEYS.users, users);
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
  html += '<a class="nav-tab" data-page="main" href="javascript:void(0)">反馈系统</a>';
  html += '<a class="nav-tab" data-page="gallery" href="javascript:void(0)">图片管理</a>';
  html += '<a class="nav-tab" data-page="docs" href="javascript:void(0)">文档管理</a>';   
  if (currentRole() === 'admin') {
    html += '<a class="nav-tab" data-page="admin" href="javascript:void(0)">用户管理</a>';
  }
  $('navTabs').innerHTML = html;
  if ($('navTabs2')) $('navTabs2').innerHTML = html;
  if ($('navTabs3')) $('navTabs3').innerHTML = html;
  if ($('navTabs4')) $('navTabs4').innerHTML = html;

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
      } else if (page === 'docs') {               
        navigate('docs');
        qsa('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
      } else if (page === 'admin') {
        navigate('admin');
        qsa('.nav-tab').forEach(function (t) { t.classList.remove('active'); });
        this.classList.add('active');
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
var commentPendingImages = {};

function renderFeedbackSystem() {
  setupNavTabs();
  $('headerUsername').textContent = currentUser();
  $('headerRole').textContent = currentRole();
  if ($('headerGroup')) $('headerGroup').textContent = currentGroup();
  initStatusFilter();
  DocIntegration.initFeedbackDocSelector();
  loadFeedbacks();
  loadImagesForFeedback();
  updateUnreadBadge();

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
      <div class="img-placeholder" style="display:none;width:100%;height:80px;align-items:center;justify-content:center;background:#e2e8f0;border-radius:10px;color:#94a3b8;font-size:10px;">加载失败</div>
      <div class="existing-image-name" title="${escapeHtml(img.original_name)}">${escapeHtml(img.original_name)}</div>
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
  const role = currentRole();
  let html = '';

  if (role === 'admin') {
    // 管理员：显示组筛选按钮
    const groups = ['A', 'B', 'C', 'D', 'E'];
    html += '<button class="filter-btn active" data-filter="all">全部</button>';
    groups.forEach(g => {
      html += `<button class="filter-btn" data-filter="${g}">${g}组</button>`;
    });
  } else {
    // 普通用户：仍按作者列表动态生成（或也可改为组，根据需求）
    const authors = [];
    const user = currentUser();
    const userGroup = currentGroup(); 
    allFeedbacksCache.forEach(fb => {
      // 只显示与当前用户相关的反馈的作者
      if (fb.author === user || fb.group === userGroup) {
        if (!authors.includes(fb.author)) authors.push(fb.author);
      }
    });
    html += '<button class="filter-btn active" data-author="all">全部</button>';
    authors.forEach(a => {
      html += `<button class="filter-btn" data-author="${a}">${escapeHtml(a)}</button>`;
    });
  }

  $('filterButtons').innerHTML = html;

  // 绑定点击事件
  $('filterButtons').querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      if (role === 'admin') {
        currentFilter = this.getAttribute('data-filter');   // 存储组名或'all'
      } else {
        currentFilter = this.getAttribute('data-author');   // 存储作者名
      }
      qsa('#filterButtons .filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      renderFeedbackList();
    });
  });
}

function getVisibleFeedbacks() {
  let list = allFeedbacksCache;
  const user = currentUser();
  const role = currentRole();

  // 1. 基础权限：管理员看全部，普通用户只看到相关反馈
  if (role !== 'admin') {
    const userGroup = currentGroup();
    list = list.filter(fb => {
      return fb.author === user || fb.assigned_to === user || fb.original_author === user ||
             (userGroup && fb.author_group === userGroup);
    });
  }

  // 2. 组筛选（仅管理员且 currentFilter 不是 'all'）
  if (role === 'admin' && currentFilter !== 'all') {
    list = list.filter(fb => fb.author_group === currentFilter);
  }

  // 3. 作者筛选（普通用户且 currentFilter 不是 'all'）
  if (role !== 'admin' && currentFilter !== 'all') {
    list = list.filter(fb => fb.author === currentFilter);
  }

  // 4. 状态筛选（不变）
  if (currentStatusFilter !== 'all') {
    list = list.filter(fb => fb.status === currentStatusFilter);
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
    if (fb.group) {
      html += '<span class="group-badge">[' + escapeHtml(fb.group) + '组]</span>';
    }
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
          var displayName = meta ? meta.original_name : imgName;
          html += '<div class="feedback-image-item"><img class="feedback-img" data-stored="' + imgName + '" src="' + url + '" onclick="openImageModal(this)" loading="lazy" onerror="this.onerror=null;this.src=this.src+\'?retry=\'+Date.now();"><div class="feedback-image-name" title="' + escapeHtml(displayName) + '">' + escapeHtml(displayName) + '</div></div>';
        }
      });
      html += '</div>';
    }
    if (fb.docs && fb.docs.length) {
      html += DocIntegration.renderFeedbackDocLinks(fb.docs);
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
          if (url) {
            var displayName = meta ? meta.original_name : imgName;
            html += '<div class="comment-image-item"><img class="comment-img" data-stored="' + imgName + '" src="' + url + '" onclick="openImageModal(this)" onerror="this.onerror=null;this.src=this.src+\'?retry=\'+Date.now();"><div class="comment-image-name" title="' + escapeHtml(displayName) + '">' + escapeHtml(displayName) + '</div></div>';
          }
        });
        html += '</div>';
      }
      if (c.docs && c.docs.length) {
        html += '<div class="comment-docs" style="margin-top:8px;">';
        c.docs.forEach(docStored => {
          const docMeta = getDocuments().find(d => d.stored_name === docStored);
          if (docMeta) {
            html += `<div class="doc-link" style="display:inline-block; margin-right:12px;">📄 <span class="download-comment-doc" style="cursor:pointer; color:#3b82f6; text-decoration:underline;" data-stored="${docStored}" data-name="${escapeHtml(docMeta.original_name)}">${escapeHtml(docMeta.original_name)}</span>${isDocPreviewable(docMeta.original_name) ? `<span class="preview-inline-doc preview-comment-doc" data-stored="${docStored}" data-name="${escapeHtml(docMeta.original_name)}">预览</span>` : ''}</div>`;
          }
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
    html += '<button class="comment-upload-doc" data-fb="' + fb.id + '">文档</button>';
    html += '<input type="file" id="comment-file-' + fb.id + '" accept="image/*" style="display:none;">';
    html += '<input type="file" id="comment-doc-file-' + fb.id + '" accept=".doc,.docx,.pdf,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z,.7zip,.tar,.gz,.tgz" style="display:none;">';
    html += '<button class="comment-submit" data-fb="' + fb.id + '">发送</button>';
    html += '</div>';
    html += '<div class="comment-images-preview" id="comment-preview-' + fb.id + '"></div>';
    html += '<div class="comment-docs-preview" id="comment-docs-preview-' + fb.id + '"></div>';
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

  // 绑定反馈文档下载
  container.querySelectorAll('.download-feedback-doc').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();  // 虽然不是 <a> 但保留无害
      const stored = link.getAttribute('data-stored');
      const originalName = link.getAttribute('data-name');
      try {
        const url = await ensureSignedUrl(stored,originalName);
        downloadFile(url, originalName);
      } catch (err) {
        showToast('下载失败：' + err.message, true);
      }
    });
  });

  container.querySelectorAll('.preview-feedback-doc').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const stored = link.getAttribute('data-stored');
      const originalName = link.getAttribute('data-name');
      openDocPreview(stored, originalName);
    });
  });
  
  // 绑定评论文档下载
  container.querySelectorAll('.download-comment-doc').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const stored = link.getAttribute('data-stored');
      const originalName = link.getAttribute('data-name');
      try {
        const url = await ensureSignedUrl(stored,originalName);
        downloadFile(url, originalName);
      } catch (err) {
        showToast('下载失败：' + err.message, true);
      }
    });
  });

  container.querySelectorAll('.preview-comment-doc').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const stored = link.getAttribute('data-stored');
      const originalName = link.getAttribute('data-name');
      openDocPreview(stored, originalName);
    });
  });
  
    // 绑定评论文档上传按钮
  container.querySelectorAll('.comment-upload-doc').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const fbId = btn.getAttribute('data-fb');
      const fileInput = document.getElementById(`comment-doc-file-${fbId}`);
      if (fileInput) fileInput.click();
    });
  });
  // 绑定文档文件选择 change 事件
  container.querySelectorAll('input[type=file][id^="comment-doc-file-"]').forEach(input => {
    input.addEventListener('change', async function() {
      const fbId = this.id.replace('comment-doc-file-', '');
      if (this.files && this.files[0]) {
        await DocIntegration.addCommentDoc(fbId, this.files[0]);
        DocIntegration.renderCommentDocPreview(fbId);
        this.value = '';
      }
    });
  });
  // 初始化每个评论的文档预览区（显示已选文档）
  container.querySelectorAll('.feedback-item').forEach(item => {
    const fbId = item.getAttribute('data-id');
    DocIntegration.renderCommentDocPreview(fbId);
  });
}

function bindFeedbackEvents() {
  qsa('.status-toggle-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      toggleFeedbackStatus(this.getAttribute('data-id'));
    });
  });

  qsa('.delete-feedback-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (confirm('确定删除此反馈吗？')) {
        deleteFeedback(this.getAttribute('data-id'));
      }
    });
  });

  qsa('.assign-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = this.getAttribute('data-id');
      var searchInput = qs('.assign-search[data-id="' + id + '"]');
      var dropdown = qs('.assign-dropdown[data-id="' + id + '"]');
      var visible = searchInput.style.display !== 'none';
      searchInput.style.display = visible ? 'none' : 'inline-block';
      if (dropdown) dropdown.style.display = 'none';
      if (!visible) searchInput.focus();
    });
  });

  qsa('.assign-search').forEach(function (input) {
    input.addEventListener('input', function () {
      var id = this.getAttribute('data-id');
      var dropdown = qs('.assign-dropdown[data-id="' + id + '"]');
      var query = this.value.toLowerCase();
      var users = getUsers();
      var filtered = Object.keys(users).filter(function (u) {
        return u !== currentUser() && u.toLowerCase().indexOf(query) !== -1;
      });
      if (filtered.length && query) {
        dropdown.innerHTML = filtered.map(function (u) {
          return '<div class="assign-option" data-user="' + u + '" data-fb="' + id + '" style="padding:6px 12px;cursor:pointer;font-size:.75rem;">' + escapeHtml(u) + '</div>';
        }).join('');
        dropdown.style.display = 'block';
      } else {
        dropdown.style.display = 'none';
      }
    });

    input.addEventListener('blur', function () {
      var id = this.getAttribute('data-id');
      setTimeout(function () {
        var dd = qs('.assign-dropdown[data-id="' + id + '"]');
        if (dd) dd.style.display = 'none';
      }, 200);
    });
  });

  document.addEventListener('click', function (e) {
    if (e.target.classList.contains('assign-option')) {
       e.stopPropagation();
      var userId = e.target.getAttribute('data-user');
      var fbId = e.target.getAttribute('data-fb');
      assignFeedback(fbId, userId);
      var dd = qs('.assign-dropdown[data-id="' + fbId + '"]');
      var si = qs('.assign-search[data-id="' + fbId + '"]');
      if (dd) dd.style.display = 'none';
      if (si) { si.style.display = 'none'; si.value = ''; }
    }
  });

  qsa('.comment-submit').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var fbId = this.getAttribute('data-fb');
      var input = $('comment-input-' + fbId);
      var content = (input ? input.value : '').trim();
      var images = commentPendingImages[fbId] || [];
      const docs = DocIntegration.getCommentPendingDocs(fbId);
      if (!content && !images.length) { showToast('请输入评论内容', true); return; }
      addComment(fbId, content, images,docs);
    });
  });

  qsa('.comment-upload-img').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var fbId = this.getAttribute('data-fb');
      var fileInput = $('comment-file-' + fbId);
      if (fileInput) fileInput.click();
    });
  });

  qsa('input[type=file][id^="comment-file-"]').forEach(function (input) {
    input.addEventListener('change', async function () {
      var fbId = this.id.replace('comment-file-', '');
      if (this.files[0]) {
        await uploadCommentImage(fbId, this.files[0]);
        this.value = '';
      }
    });
  });

  qsa('.comment-delete').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (confirm('确定删除此评论吗？')) {
        deleteComment(this.getAttribute('data-fb'), this.getAttribute('data-cm'));
      }
    });
  });
}

function submitFeedback() {
  var content = $('feedbackContent').value.trim();
  if (!content) { showToast('反馈内容不能为空', true); return; }
  var feedbacks = getFeedbacks();
  var fb = {
    id: genShortId(),
    author: currentUser(),
    group: currentGroup(),
    author_group:getUsers()[currentUser()]?.group || null,
    content: content,
    images: selectedImages.slice(),
    docs: DocIntegration.getSelectedFeedbackDocs(),
    status: 'pending',
    created_at: new Date().toISOString(),
    comments: []
  };
  feedbacks.push(fb);
  saveFeedbacks(feedbacks);
  $('feedbackContent').value = '';
  selectedImages = [];
  DocIntegration.clearFeedbackSelection();
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
    docs: docs || [],
    created_at: new Date().toISOString()
  };
  feedbacks[idx].comments.push(cm);
  saveFeedbacks(feedbacks);
  delete commentPendingImages[feedbackId];
  DocIntegration.clearCommentPendingDocs(feedbackId);

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
  if (window._assigningNow) return;
  window._assigningNow = true;
  var feedbacks = getFeedbacks();
  var idx = feedbacks.findIndex(function (fb) { return fb.id === fbId; });
  if (idx === -1) return;
  var source = feedbacks[idx];

  var copy = {
    id: genShortId(),
    author: assignedTo,
    original_author: source.author,
    author_group: source.author_group,
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
  window._assigningNow = false;

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
}


// =============反馈与评论区文档上传/引用模块============
/**
 * 该模块为反馈表单和评论区提供文档引用功能：
 * - 从已有文档库中选择文档（多选）
 * - 上传新文档并自动添加到当前引用列表
 * - 在反馈详情和评论中显示文档下载链接
 * - 完全独立封装，不污染全局命名空间
 */
const DocIntegration = (function() {
  // ---------- 私有状态 ----------
  let selectedFeedbackDocs = [];      // 反馈表单当前选中的文档 stored_name 数组
  let commentPendingDocs = {};        // 每条评论的待引用文档 { feedbackId: [stored_name] }
  let allDocsCache = [];              // 文档列表缓存
  let isDocDrawerOpen = false;        // 反馈表单文档抽屉开关状态

  // ---------- DOM 元素缓存（延迟获取）----------
  let docDrawerHeader = null,
      docDrawerArrow = null,
      docDrawerContent = null,
      existingDocsList = null,
      selectedDocHint = null,
      docUploadProgress = null,
      uploadDocBtn = null,
      docFileInput = null;

  // ---------- 辅助函数 ----------
  // 从服务器（COS/本地）加载文档列表
  async function loadDocs() {
    allDocsCache = getDocuments().sort((a, b) => (b.upload_time || '') > (a.upload_time || '') ? 1 : -1);
    renderDocList();
  }

  // 渲染反馈表单中的文档选择列表
  function renderDocList() {
    if (!existingDocsList) return;
    if (!allDocsCache.length) {
      existingDocsList.innerHTML = '<div style="color:#94a3b8;padding:20px;text-align:center;">暂无文档，请先上传文档</div>';
      return;
    }
    let html = '';
    allDocsCache.forEach(doc => {
      const isSelected = selectedFeedbackDocs.includes(doc.stored_name);
      html += `<div class="existing-image-item ${isSelected ? 'selected' : ''}" data-stored="${doc.stored_name}" style="position:relative; width:100px;">
        <div style="width:80px;height:80px;display:flex;align-items:center;justify-content:center;background:#f8fafc;border-radius:10px;margin:0 auto;">📄</div>
        <div style="font-size:10px;text-align:center;word-break:break-all;">${escapeHtml(doc.original_name.substring(0,15))}</div>
        ${isSelected ? '<span class="remove-icon" style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,.6);color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;">✕</span>' : ''}
      </div>`;
    });
    existingDocsList.innerHTML = html;

    // 绑定选择/取消事件
    existingDocsList.querySelectorAll('.existing-image-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const stored = item.getAttribute('data-stored');
        const idx = selectedFeedbackDocs.indexOf(stored);
        if (idx !== -1) selectedFeedbackDocs.splice(idx, 1);
        else selectedFeedbackDocs.push(stored);
        updateSelectedHint();
        renderDocList(); // 重新刷新样式
      });
    });
  }

  // 更新反馈表单已选文档提示
  function updateSelectedHint() {
    if (selectedDocHint) {
      selectedDocHint.textContent = selectedFeedbackDocs.length ? `已选 ${selectedFeedbackDocs.length} 个文档` : '';
    }
  }

  // 切换反馈表单的文档抽屉
  function toggleDrawer() {
    isDocDrawerOpen = !isDocDrawerOpen;
    if (docDrawerArrow) docDrawerArrow.classList.toggle('open', isDocDrawerOpen);
    if (docDrawerContent) docDrawerContent.classList.toggle('open', isDocDrawerOpen);
    if (isDocDrawerOpen) loadDocs();
  }

  // 上传文档并添加到指定的目标（反馈或评论）
  // target: 'feedback' 或 'comment'
  // feedbackId: 仅当 target === 'comment' 时需要
  async function uploadDoc(file, target, feedbackId = null) {
    if (!file) return false;
    const allowedExts = ['.doc','.docx','.pdf','.xls','.xlsx','.ppt','.pptx','.txt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowedExts.includes(ext)) {
      showToast('不支持该文档格式', true);
      return false;
    }
    if (docUploadProgress) docUploadProgress.textContent = '上传中...';
    try {
      const result = await uploadToCosGeneric(file);
      addDocument(result.stored_name, result.original_name, result.file_size, currentUser());
      await saveDataNow(STORAGE_KEYS.documents, getDocuments()); // 立即同步到COS
      if (docUploadProgress) docUploadProgress.textContent = '';
      showToast('文档已上传: ' + result.original_name);
      // 刷新文档列表
      await loadDocs();

      if (target === 'feedback') {
        if (!selectedFeedbackDocs.includes(result.stored_name)) {
          selectedFeedbackDocs.push(result.stored_name);
          updateSelectedHint();
          renderDocList();
        }
        if (!isDocDrawerOpen) toggleDrawer();
      } else if (target === 'comment' && feedbackId) {
        if (!commentPendingDocs[feedbackId]) commentPendingDocs[feedbackId] = [];
        commentPendingDocs[feedbackId].push(result.stored_name);
        updateCommentPreview(feedbackId);
      }
      return true;
    } catch (err) {
      if (docUploadProgress) docUploadProgress.textContent = '';
      showToast('上传失败: ' + (err.message || err), true);
      return false;
    }
  }

  // 更新某条评论的文档预览区
  function updateCommentPreview(fbId) {
    const previewDiv = document.getElementById(`comment-docs-preview-${fbId}`);
    if (!previewDiv) return;
    const docs = commentPendingDocs[fbId] || [];
    let html = '';
    docs.forEach(stored => {
      const docMeta = getDocuments().find(d => d.stored_name === stored);
      const name = docMeta ? escapeHtml(docMeta.original_name) : stored;
      html += `<div class="preview-doc-wrapper" data-stored="${stored}" style="display:inline-block; background:#eef2ff; border-radius:20px; padding:4px 12px; margin-right:8px; margin-bottom:4px;">
        📄 ${name}
        <span class="remove-doc" style="cursor:pointer; margin-left:6px;">✕</span>
      </div>`;
    });
    previewDiv.innerHTML = html;
    previewDiv.querySelectorAll('.remove-doc').forEach(span => {
      span.addEventListener('click', (e) => {
        const wrapper = span.closest('.preview-doc-wrapper');
        const stored = wrapper.getAttribute('data-stored');
        commentPendingDocs[fbId] = commentPendingDocs[fbId].filter(s => s !== stored);
        updateCommentPreview(fbId);
      });
    });
  }

  // ---------- 公开 API ----------
  return {
    // 初始化反馈表单的文档选择区域（必须在DOM加载后调用）
    initFeedbackDocSelector: function() {
      docDrawerHeader = document.getElementById('docDrawerHeader');
      docDrawerArrow = document.getElementById('docDrawerArrow');
      docDrawerContent = document.getElementById('docDrawerContent');
      existingDocsList = document.getElementById('existingDocsList');
      selectedDocHint = document.getElementById('selectedDocHint');
      docUploadProgress = document.getElementById('docUploadProgress');
      uploadDocBtn = document.getElementById('uploadForFeedbackDocBtn');
      docFileInput = document.getElementById('feedbackDocFileInput');

      if (docDrawerHeader) docDrawerHeader.addEventListener('click', toggleDrawer);
      if (uploadDocBtn && docFileInput) {
        uploadDocBtn.addEventListener('click', () => docFileInput.click());
        docFileInput.addEventListener('change', async function() {
          if (this.files && this.files[0]) {
            await uploadDoc(this.files[0], 'feedback');
            this.value = '';
          }
        });
      }
      // 预加载文档列表（可选）
      loadDocs();
    },

    // 获取反馈表单当前选中的文档（提交反馈时调用）
    getSelectedFeedbackDocs: () => [...selectedFeedbackDocs],

    // 清空反馈表单的文档选择（提交成功后调用）
    clearFeedbackSelection: () => {
      selectedFeedbackDocs = [];
      updateSelectedHint();
      renderDocList();
    },

    // 为某条评论上传文档并添加（供评论区文件上传按钮使用）
    addCommentDoc: async (feedbackId, file) => {
      return await uploadDoc(file, 'comment', feedbackId);
    },

    // 获取某条评论当前待引用的文档列表
    getCommentPendingDocs: (feedbackId) => commentPendingDocs[feedbackId] || [],

    // 清空某条评论的待引用文档（评论提交后调用）
    clearCommentPendingDocs: (feedbackId) => {
      delete commentPendingDocs[feedbackId];
      updateCommentPreview(feedbackId);
    },

    // 渲染评论区的文档预览（在生成评论区HTML后调用，用于显示已选文档）
    renderCommentDocPreview: (feedbackId) => updateCommentPreview(feedbackId),

    // 渲染反馈详情中的文档下载链接（接收 stored_name 数组，返回 HTML 字符串）
    renderFeedbackDocLinks: (docStoredNames) => {
      if (!docStoredNames || !docStoredNames.length) return '';
      let html = '<div class="feedback-docs" style="margin-bottom:12px;">';
      docStoredNames.forEach(stored => {
        const docMeta = getDocuments().find(d => d.stored_name === stored);
        if (docMeta) {
          html += `<div class="doc-link" style="display:inline-block; margin-right:12px;">📄 <a href="#" class="download-feedback-doc" data-stored="${stored}" data-name="${escapeHtml(docMeta.original_name)}">${escapeHtml(docMeta.original_name)}</a>${isDocPreviewable(docMeta.original_name) ? `<span class="preview-inline-doc preview-feedback-doc" data-stored="${stored}" data-name="${escapeHtml(docMeta.original_name)}">预览</span>` : ''}</div>`;
        } else {
          html += `<div class="doc-link" style="display:inline-block; margin-right:12px;">📄 未知文档</div>`;
        }
      });
      html += '</div>';
      return html;
    },
  };
})();



// ==================== 图床管理页 ====================
function renderGalleryPage() {
  setupNavTabs();
  if ($('headerUsername2')) $('headerUsername2').textContent = currentUser();
  if ($('headerRole2')) $('headerRole2').textContent = currentRole();
  if ($('headerGroup2')) $('headerGroup2').textContent = currentGroup();
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
  setBadge($('unreadBadge3'));
  setBadge($('unreadBadge4'));
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
var adminUserSearch = '';
var adminUserGroupFilter = 'all';
var adminUserActionState = {
  mode: '',
  targetUsername: ''
};

function applyAdminUserFilters(users) {
  var search = adminUserSearch.toLowerCase().trim();
  var group = adminUserGroupFilter;
  var filtered = {};
  for (var username in users) {
    if (search && username.toLowerCase().indexOf(search) === -1) continue;
    if (group !== 'all' && users[username].group !== group) continue;
    filtered[username] = users[username];
  }
  return filtered;
}

function renderAdminUserTable(targetEl) {
  if (!targetEl) return;
  const allUsers = getUsers();
  const users = applyAdminUserFilters(allUsers);
  let html = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; background:white;table-layout:fixed;">';
  html += '<colgroup><col style="width:18%"><col style="width:10%"><col style="width:8%"><col style="width:24%"><col style="width:40%"></colgroup>';
  html += '<thead><tr><th>用户名</th><th>角色</th><th>分组</th><th>注册时间</th><th>操作</th></tr></thead><tbody>';

  var count = 0;
  for (const username in users) {
    count++;
    const user = users[username];
    html += '<tr>';
    html += '<td data-label="用户名">' + escapeHtml(username) + '</td>';
    html += '<td data-label="角色">' + escapeHtml(user.role || 'user') + '</td>';
    html += '<td data-label="分组">' + escapeHtml(user.group || '-') + '</td>';
    html += '<td data-label="注册时间">' + (user.created_at ? formatTime(user.created_at) : '-') + '</td>';
    html += '<td data-label="操作">';
    if (username !== currentUser()) {
      html += '<div class="admin-user-actions">';
      html += '<button class="admin-action-btn admin-change-pwd-btn" data-username="' + escapeHtml(username) + '">修改密码</button>';
      html += '<button class="admin-action-btn admin-change-group-btn" data-username="' + escapeHtml(username) + '">修改分组</button>';
      html += '<button class="admin-action-btn admin-delete-user-btn" data-username="' + escapeHtml(username) + '">删除</button>';
      html += '</div>';
    } else {
      html += '<em>当前用户</em>';
    }
    html += '</td>';
    html += '</tr>';
  }
  if (!count) {
    html += '<tr><td colspan="5" style="text-align:center;padding:32px;color:#94a3b8;">无匹配用户</td></tr>';
  }
  html += '</tbody></table></div>';
  targetEl.innerHTML = html;

  // 绑定按钮事件（保持不变）
  targetEl.querySelectorAll('.admin-change-pwd-btn').forEach(function (btn) {
    btn.onclick = function (e) {
      e.stopPropagation();
      changeUserPassword(btn.getAttribute('data-username'));
    };
  });
  targetEl.querySelectorAll('.admin-change-group-btn').forEach(function (btn) {
    btn.onclick = function (e) {
      e.stopPropagation();
      changeUserGroup(btn.getAttribute('data-username'));
    };
  });
  targetEl.querySelectorAll('.admin-delete-user-btn').forEach(function (btn) {
    btn.onclick = function (e) {
      e.stopPropagation();
      deleteUser(btn.getAttribute('data-username'));
    };
  });
}

function refreshUserManagement() {
  if (currentPage === 'admin' && currentAdminModule === 'users' && $('adminModuleBody')) {
    renderAdminUserTable($('adminModuleBody'));
  } else if ($('userPanelOverlay').classList.contains('show') && $('userPanelBody')) {
    renderAdminUserTable($('userPanelBody'));
  }
}

async function showUserPanel() {
  if (getCosClient()) {
    await syncFromRemote(STORAGE_KEYS.users, 'object');
  }
  renderAdminUserTable($('userPanelBody'));
  $('userPanelOverlay').classList.add('show');
}
async function verifyAdminPasswordValue(pwd) {
  if (!pwd) return false;
  const currentAdmin = currentUser();
  const users = getUsers();
  const adminHash = users[currentAdmin]?.password;
  if (!adminHash) return false;
  const inputHash = await hashPassword(pwd);
  return inputHash === adminHash;
}

function showAdminUserActionPanel(mode, targetUsername) {
  var users = getUsers();
  var user = users[targetUsername];
  if (!user) {
    showToast('用户不存在', true);
    return;
  }
  adminUserActionState.mode = mode;
  adminUserActionState.targetUsername = targetUsername;
  $('adminUserActionError').style.display = 'none';
  $('adminUserActionError').textContent = '';
  $('adminUserActionSubmitBtn').classList.toggle('danger', mode === 'delete');

  var currentGroup = user.group || '-';
  var fields = '';
  if (mode === 'password') {
    $('adminUserActionTitle').textContent = '修改用户密码';
    $('adminUserActionSubmitBtn').textContent = '确认修改密码';
    fields += '<div class="input-group"><label>修改用户的用户名</label><input type="text" value="' + escapeHtml(targetUsername) + '" readonly></div>';
    fields += '<div class="input-group"><label>修改后目标密码</label><input type="password" id="adminTargetPassword" placeholder="请输入新密码"></div>';
    fields += '<div class="input-group"><label>管理员密码安全验证</label><input type="password" id="adminVerifyPassword" placeholder="请输入管理员密码"></div>';
  } else if (mode === 'group') {
    $('adminUserActionTitle').textContent = '修改用户分组';
    $('adminUserActionSubmitBtn').textContent = '确认修改分组';
    fields += '<div class="input-group"><label>修改用户的用户名</label><input type="text" value="' + escapeHtml(targetUsername) + '" readonly></div>';
    fields += '<div class="input-group"><label>当前所在分组</label><input type="text" value="' + escapeHtml(currentGroup) + '" readonly></div>';
    fields += '<div class="input-group"><label>目标分组选择</label><select id="adminTargetGroup">';
    ['A', 'B', 'C', 'D', 'E'].forEach(function (group) {
      fields += '<option value="' + group + '"' + (user.group === group ? ' selected' : '') + '>' + group + '组</option>';
    });
    fields += '</select></div>';
    fields += '<div class="input-group"><label>管理员密码验证</label><input type="password" id="adminVerifyPassword" placeholder="请输入管理员密码"></div>';
  } else if (mode === 'delete') {
    $('adminUserActionTitle').textContent = '删除用户';
    $('adminUserActionSubmitBtn').textContent = '确认删除用户';
    fields += '<div class="admin-action-hint">删除后该用户将无法继续登录，此操作不可撤销。请确认用户名与分组信息后输入管理员密码。</div>';
    fields += '<div class="input-group"><label>修改用户的用户名</label><input type="text" value="' + escapeHtml(targetUsername) + '" readonly></div>';
    fields += '<div class="input-group"><label>当前所在分组</label><input type="text" value="' + escapeHtml(currentGroup) + '" readonly></div>';
    fields += '<div class="input-group"><label>管理员密码验证</label><input type="password" id="adminVerifyPassword" placeholder="请输入管理员密码"></div>';
  }
  $('adminUserActionFields').innerHTML = fields;
  $('adminUserActionOverlay').classList.add('show');
}

function hideAdminUserActionPanel() {
  $('adminUserActionOverlay').classList.remove('show');
}

function showAdminUserActionError(message) {
  $('adminUserActionError').textContent = message;
  $('adminUserActionError').style.display = 'block';
}

async function submitAdminUserAction() {
  var mode = adminUserActionState.mode;
  var targetUsername = adminUserActionState.targetUsername;
  var adminPassword = $('adminVerifyPassword') ? $('adminVerifyPassword').value : '';
  if (!adminPassword) {
    showAdminUserActionError('请输入管理员密码');
    return;
  }
  if (!(await verifyAdminPasswordValue(adminPassword))) {
    showAdminUserActionError('管理员密码错误，操作已取消');
    return;
  }
  var users = getUsers();
  if (!users[targetUsername]) {
    showAdminUserActionError('用户不存在');
    return;
  }
  if (mode === 'password') {
    var newPassword = $('adminTargetPassword') ? $('adminTargetPassword').value : '';
    if (!newPassword) {
      showAdminUserActionError('请输入修改后的目标密码');
      return;
    }
    if (newPassword.length < 3) {
      showAdminUserActionError('密码长度至少3个字符');
      return;
    }
    users[targetUsername].password = await hashPassword(newPassword);
    showToast('用户 ' + targetUsername + ' 密码已修改');
  } else if (mode === 'group') {
    var newGroup = $('adminTargetGroup') ? $('adminTargetGroup').value : '';
    if (['A', 'B', 'C', 'D', 'E'].indexOf(newGroup) === -1) {
      showAdminUserActionError('请选择有效分组');
      return;
    }
    users[targetUsername].group = newGroup;
    showToast('用户 ' + targetUsername + ' 分组已更新为 ' + newGroup);
    if (targetUsername === currentUser()) {
      var s = getSession();
      if (s) { s.group = newGroup; setSession(s); }
    }
  } else if (mode === 'delete') {
    delete users[targetUsername];
    showToast('用户 ' + targetUsername + ' 已删除');
  } else {
    showAdminUserActionError('未知操作类型');
    return;
  }
  saveUsers(users);
  await saveDataNow(STORAGE_KEYS.users, users);
  hideAdminUserActionPanel();
  refreshUserManagement();
}

function changeUserPassword(targetUsername) {
  showAdminUserActionPanel('password', targetUsername);
}

function changeUserGroup(targetUsername) {
  showAdminUserActionPanel('group', targetUsername);
}

function deleteUser(targetUsername) {
  showAdminUserActionPanel('delete', targetUsername);
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
  await saveDataNow(STORAGE_KEYS.users, users);
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
  if ($('logoutBtn3')) $('logoutBtn3').addEventListener('click', handleLogout);
  if ($('logoutBtn4')) $('logoutBtn4').addEventListener('click', handleLogout);

  $('notificationIcon').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleNotificationPanel();
  });

  if ($('notificationIcon2')) $('notificationIcon2').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleNotificationPanel();
  });
  if ($('notificationIcon3')) $('notificationIcon3').addEventListener('click', function (e) {
    e.stopPropagation();
    toggleNotificationPanel();
  });
  if ($('notificationIcon4')) $('notificationIcon4').addEventListener('click', function (e) {
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
  if ($('closeDocPreviewBtn')) $('closeDocPreviewBtn').addEventListener('click', closeDocPreview);
  if ($('docPreviewModal')) $('docPreviewModal').addEventListener('click', function (e) {
    if (e.target === this) closeDocPreview();
  });

  // 压缩包预览关闭事件：绑定右上角 X、底部“关闭”按钮、点击遮罩关闭
  if ($('closeArchivePreviewBtn')) $('closeArchivePreviewBtn').addEventListener('click', closeArchivePreview);
  if ($('archivePreviewCloseBtn')) $('archivePreviewCloseBtn').addEventListener('click', closeArchivePreview);
  if ($('archivePreviewModal')) $('archivePreviewModal').addEventListener('click', function (e) {
    if (e.target === this) closeArchivePreview();
  });
  if ($('docPreviewPrevBtn')) $('docPreviewPrevBtn').addEventListener('click', function () {
    loadDocPreviewPage(docPreviewState.page - 1);
  });
  if ($('docPreviewNextBtn')) $('docPreviewNextBtn').addEventListener('click', function () {
    loadDocPreviewPage(docPreviewState.page + 1);
  });
  if ($('docPreviewZoomOutBtn')) $('docPreviewZoomOutBtn').addEventListener('click', function () {
    setDocPreviewZoom((docPreviewState.zoom || 1) - 0.25);
  });
  if ($('docPreviewZoomInBtn')) $('docPreviewZoomInBtn').addEventListener('click', function () {
    setDocPreviewZoom((docPreviewState.zoom || 1) + 0.25);
  });
  if ($('docPreviewFitBtn')) $('docPreviewFitBtn').addEventListener('click', function () {
    setDocPreviewZoom(1);
  });

  $('closeUserPanelBtn').addEventListener('click', hideUserPanel);
  $('userPanelOverlay').addEventListener('click', function (e) {
    if (e.target === this) hideUserPanel();
  });
  $('closeAdminUserActionBtn').addEventListener('click', hideAdminUserActionPanel);
  $('adminUserActionOverlay').addEventListener('click', function (e) {
    if (e.target === this) hideAdminUserActionPanel();
  });
  $('adminUserActionSubmitBtn').addEventListener('click', submitAdminUserAction);

  $('changePwdLink').addEventListener('click', function (e) { e.preventDefault(); showPwdPanel(); });
  if ($('changePwdLink2')) $('changePwdLink2').addEventListener('click', function (e) { e.preventDefault(); showPwdPanel(); });
  if ($('changePwdLink3')) $('changePwdLink3').addEventListener('click', function (e) { e.preventDefault(); showPwdPanel(); });
  if ($('changePwdLink4')) $('changePwdLink4').addEventListener('click', function (e) { e.preventDefault(); showPwdPanel(); });
  $('closePwdPanelBtn').addEventListener('click', hidePwdPanel);
  $('pwdPanelOverlay').addEventListener('click', function (e) { if (e.target === this) hidePwdPanel(); });
  $('changePwdBtn').addEventListener('click', changePassword);

  $('cosSetupLink').addEventListener('click', function (e) { e.preventDefault(); if (confirm('请勿泄露配置信息！')) showCosSetupPanel(); });
  $('closeCosSetupBtn').addEventListener('click', hideCosSetupPanel);
  $('cosSetupOverlay').addEventListener('click', function (e) { if (e.target === this) hideCosSetupPanel(); });
  $('cosSetupSaveBtn').addEventListener('click', saveSetupCos);

  // 文档管理模块事件
  if ($('docUploadBtn')) {
    $('docUploadBtn').addEventListener('click', () => $('docFileInput').click());
    $('docFileInput').addEventListener('change', async function() {
      if (this.files && this.files[0]) {
        var file = this.files[0];
        if (!checkArchiveSize(file)) {
          this.value = '';
          return;
        }
        try {
          var result = await uploadToCosGeneric(file);
          addDocument(result.stored_name, result.original_name, result.file_size, currentUser());
          await saveDataNow(STORAGE_KEYS.documents, getDocuments());
          renderDocsPage();
          showToast('文档上传成功');
        } catch (err) {
          showToast('上传失败：' + err.message, true);
        }
        this.value = '';
      }
    });
    if ($('refreshDocsBtn')) {
      // 移除可能存在的旧监听器（避免重复）
      const oldBtn = $('refreshDocsBtn');
      const newBtn = oldBtn.cloneNode(true);
      oldBtn.parentNode.replaceChild(newBtn, oldBtn);
      newBtn.addEventListener('click', async () => {
        if (getCosClient()) {
          await syncFromRemote(STORAGE_KEYS.documents, 'array');
          renderDocsPage();
          showToast('已同步最新文档列表');
        } else {
          renderDocsPage();
          showToast('COS未配置，仅显示本地缓存', true);
        }
      });
    }
  }
}


// ==================== 应用初始化 ====================
async function initApp() {
  await initData();
  await initAdminPassword();

  if (!COS_CONFIG.SecretId) {
    if ($('cosConfigBanner')) $('cosConfigBanner').classList.add('show');
    if ($('cosConfigBanner2')) $('cosConfigBanner2').classList.add('show');
    if ($('cosSetupLink')) $('cosSetupLink').style.display = 'inline';
  } else {
    // 已配置：显示修改链接
    if ($('cosSetupLink')) {
      $('cosSetupLink').textContent = '修改COS配置';
      $('cosSetupLink').style.display = 'inline';
    }
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

  // 文档管理页搜索/刷新功能（静态元素延迟绑定）
  (function initDocSearch() {
    let bound = false;
    const tryBind = () => {
      const searchInput = document.getElementById('docSearchInput');
      const searchBtn = document.getElementById('searchRefreshBtn');
      if (!searchInput || !searchBtn) {
        // 元素未就绪，稍后重试
        setTimeout(tryBind, 200);
        return;
      }
      if (bound) return;
      bound = true;

      let fullDocList = [];
      const fetchFromCos = async () => {
        if (getCosClient()) await syncFromRemote(STORAGE_KEYS.documents, 'array');
        fullDocList = getDocuments().sort((a,b) => (b.upload_time||'') > (a.upload_time||'') ? 1 : -1);
        return fullDocList;
      };
      const render = (docs) => { renderDocList(docs); };
      const refresh = async () => {
        await fetchFromCos();
        render(fullDocList);
        showToast('已刷新文档列表');
      };
      const search = (keyword) => {
        if (!keyword.trim()) {
          render(fullDocList);
          showToast('已显示全部');
        } else {
          const filtered = fullDocList.filter(doc => doc.original_name.toLowerCase().includes(keyword.toLowerCase()));
          render(filtered);
          showToast(`找到 ${filtered.length} 个文档`);
        }
      };
      const handler = async () => {
        const keyword = searchInput.value.trim();
        if (keyword === '') {
          await refresh();
        } else {
          if (fullDocList.length === 0) await fetchFromCos();
          search(keyword);
        }
      };
      // 绑定事件
      searchBtn.removeEventListener('click', handler);
      searchBtn.addEventListener('click', handler);
      searchInput.removeEventListener('keypress', searchInput._keyHandler);
      const keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); handler(); } };
      searchInput.addEventListener('keypress', keyHandler);
      searchInput._keyHandler = keyHandler;
    };
    tryBind();
  })();
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    if ($('archivePreviewModal') && $('archivePreviewModal').classList.contains('show')) closeArchivePreview();
    if ($('docPreviewModal') && $('docPreviewModal').classList.contains('show')) closeDocPreview();
    if ($('imageModal') && $('imageModal').style.display === 'block') $('imageModal').style.display = 'none';
  }
});

document.addEventListener('DOMContentLoaded', initApp);
