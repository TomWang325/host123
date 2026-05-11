
// ==================== 用户管理面板 ====================
async function showUserPanel() {
  // 1. 强制从 COS 同步最新用户数据
  // 强制从 COS 同步最新用户数据
if (getCosClient()) {
await syncFromRemote(STORAGE_KEYS.users, 'object');
}
  

const users = getUsers();
  let html = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse;">';
  let html = '<div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; background:white;">';
html += '<thead><tr><th>用户名</th><th>角色</th><th>注册时间</th><th>操作</th></tr></thead><tbody>';
  Object.keys(users).forEach(username => {

  for (const username in users) {
const user = users[username];
    html += '<tr>';
    html += '<td>' + escapeHtml(username) + '</td>';
    html += '<td>' + escapeHtml(user.role || 'user') + '</td>';
    html += '<td>' + (user.created_at ? formatTime(user.created_at) : '-') + '</td>';
    html += '<td>';
    html += `<tr>
      <td>${escapeHtml(username)}</td>
      <td>${escapeHtml(user.role || 'user')}</td>
      <td>${user.created_at ? formatTime(user.created_at) : '-'}</td>
      <td>`;
if (username !== currentUser()) {
      html += '<button class="admin-change-pwd-btn" data-username="' + escapeHtml(username) + '" style="margin-right:8px;">修改密码</button>';
      html += '<button class="admin-delete-user-btn" data-username="' + escapeHtml(username) + '">删除用户</button>';
      html += `<button class="admin-change-pwd-btn" data-username="${escapeHtml(username)}" style="margin-right:10px;">修改密码</button>`;
      html += `<button class="admin-delete-user-btn" data-username="${escapeHtml(username)}">删除</button>`;
} else {
      html += '<span style="color:#94a3b8;">（当前用户）</span>';
      html += '<em>当前用户</em>';
}
    html += '</td></tr>';
  });
    html += `</td></tr>`;
  }
html += '</tbody></table></div>';
  

const panelBody = document.getElementById('userPanelBody');
if (panelBody) panelBody.innerHTML = html;
document.getElementById('userPanelOverlay').classList.add('show');
  
  // 绑定修改密码按钮事件

  // 绑定修改密码按钮（使用 onclick 直接赋值，避免变量冲突）
document.querySelectorAll('.admin-change-pwd-btn').forEach(btn => {
    btn.removeEventListener('click', window._pwdHandler);
    const handler = async () => {
    btn.onclick = async (e) => {
      e.stopPropagation();
const username = btn.getAttribute('data-username');
await changeUserPassword(username);
};
    btn.addEventListener('click', handler);
    window._pwdHandler = handler;
});
  
  // 绑定删除用户按钮事件

  // 绑定删除按钮
document.querySelectorAll('.admin-delete-user-btn').forEach(btn => {
    btn.removeEventListener('click', window._delHandler);
    const handler = async () => {
    btn.onclick = async (e) => {
      e.stopPropagation();
const username = btn.getAttribute('data-username');
      await deleteUser(username);
      if (confirm(`确定要永久删除用户 ${username} 吗？`)) {
        await deleteUser(username);
      }
};
    btn.addEventListener('click', handler);
    window._delHandler = handler;
});
}
async function verifyAdminPassword() {
  var password = prompt('请输入您的管理员密码以继续操作：');
  if (!password) return false;
  var currentAdmin = currentUser();
  var users = getUsers();
  var adminHash = users[currentAdmin]?.password;
  const pwd = prompt('请输入您的管理员密码以继续操作：');
  if (!pwd) return false;
  const currentAdmin = currentUser();
  const users = getUsers();
  const adminHash = users[currentAdmin]?.password;
if (!adminHash) return false;
  var inputHash = await hashPassword(password);
  const inputHash = await hashPassword(pwd);
return inputHash === adminHash;
}
async function changeUserPassword(targetUsername) {
  // 验证管理员密码
if (!(await verifyAdminPassword())) {
showToast('管理员密码错误，操作已取消', true);
return;
}
  var newPassword = prompt('请输入用户 ' + targetUsername + ' 的新密码：');
  const newPassword = prompt(`请输入用户 ${targetUsername} 的新密码：`);
if (!newPassword) return;
if (newPassword.length < 3) {
showToast('密码长度至少3个字符', true);
return;
}
  var users = getUsers();
  const users = getUsers();
if (!users[targetUsername]) {
showToast('用户不存在', true);
return;
}
users[targetUsername].password = await hashPassword(newPassword);
saveUsers(users);
  await saveDataNow(STORAGE_KEYS.users, users); 
  showToast('用户 ' + targetUsername + ' 密码已修改');
  // 刷新用户面板显示
  showUserPanel();
  await saveDataNow(STORAGE_KEYS.users, users);
  showToast(`用户 ${targetUsername} 密码已修改`);
  showUserPanel(); // 刷新面板
}

async function deleteUser(targetUsername) {
  // 验证管理员密码
if (!(await verifyAdminPassword())) {
showToast('管理员密码错误，操作已取消', true);
return;
}
  if (!confirm('确定要永久删除用户 ' + targetUsername + ' 吗？此操作不可撤销。')) return;
  var users = getUsers();
  if (!confirm(`确定要永久删除用户 ${targetUsername} 吗？此操作不可撤销。`)) return;
  const users = getUsers();
delete users[targetUsername];
saveUsers(users);
  showToast('用户 ' + targetUsername + ' 已删除');
  // 刷新用户面板
  await saveDataNow(STORAGE_KEYS.users, users);
  showToast(`用户 ${targetUsername} 已删除`);
showUserPanel();
  // 如果删除的是当前登录用户（理论上不会，因为已禁用删除自己），但出于安全，可触发登出
if (targetUsername === currentUser()) {
handleLogout();
}
