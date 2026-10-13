const API = '/api';

function getUser() {
    try { return JSON.parse(localStorage.getItem('user')); } catch (e) { return null; }
}
function requireLogin() {
    const u = getUser();
    if (!u || !u.userId) { location.href = 'login.html'; return null; }
    return u;
}
function logout() {
    localStorage.removeItem('user');
    location.href = 'login.html';
}

function pad(n) { return String(n).padStart(2, '0'); }
// Giờ local, KHÔNG có "Z" (tránh lệch múi giờ)
function toLocalISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

async function api(method, url, body) {
    const res = await fetch(API + url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { }
    if (!res.ok) {
        throw new Error((data && (data.error || data.Message)) || ('Lỗi ' + res.status));
    }
    return data;
}

// ---------- Theme sáng/tối (dùng chung cho mọi trang) ----------
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
function currentTheme() { return document.documentElement.getAttribute('data-theme') || 'light'; }
function toggleTheme() {
    const t = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(t);
    try { localStorage.setItem('theme', t); } catch (e) { }
}
(function () {
    let t = 'light';
    try { t = localStorage.getItem('theme') || 'light'; } catch (e) { }
    applyTheme(t);
})();