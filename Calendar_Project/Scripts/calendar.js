const user = requireLogin();
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'];
let calendar;
let editingId = null;   // null = đang tạo mới

document.getElementById('who').textContent = user.username;

function toEvent(t) {
    const c = COLORS[t.color] || COLORS[0];
    return {
        id: t.taskId, title: t.title, start: t.startTime, end: t.endTime,
        backgroundColor: c, borderColor: c,
        classNames: t.complete ? ['done'] : [],
        extendedProps: { descriptions: t.descriptions, color: t.color, complete: t.complete, reminder: t.reminder, progress: t.progress}
    };
}

function buildBody(t) {
    return {
        userId: user.userId, title: t.title, descriptions: t.descriptions,
        startTime: t.startTime, endTime: t.endTime,
        color: t.color, complete: t.complete, reminder: t.reminder
    };
}

// ---------- Modal ----------
const $ = id => document.getElementById(id);
function setThemeBtn() { $('themeBtn').textContent = currentTheme() === 'dark' ? '☀' : '🌙'; }
$('themeBtn').onclick = () => { toggleTheme(); setThemeBtn(); };
setThemeBtn();
// Tạo hàng chấm màu; trả về hàm để đánh dấu chấm đang chọn
function buildSwatches(container, onPick) {
    container.innerHTML = '';
    const btns = COLORS.map((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.style.background = c;
        b.onclick = () => onPick(i);
        container.appendChild(b);
        return b;
    });
    return v => btns.forEach((b, i) => b.classList.toggle('sel', i === v));
}

let modalColor = 0;
const setModalSwatch = buildSwatches($('fColorPick'), i => { modalColor = i; setModalSwatch(i); });

function openModal(t) {
    editingId = t.taskId || null;
    $('modalTitle').textContent = editingId ? 'Sửa task' : 'Thêm task';
    $('fTitle').value = t.title || '';
    $('fDesc').value = t.descriptions || '';
    $('fStart').value = t.startTime.slice(0, 16);
    $('fEnd').value = t.endTime.slice(0, 16);
    $('fReminder').value = t.reminder == null ? '' : String(t.reminder);
    $('fComplete').checked = !!t.complete;
    $('delBtn').style.display = editingId ? '' : 'none';
    $('modalMsg').textContent = '';
    $('modalBg').classList.add('show');
    $('fTitle').focus();
    modalColor = t.color; setModalSwatch(t.color);
}
function closeModal() { $('modalBg').classList.remove('show'); }

$('cancelBtn').onclick = closeModal;

$('saveBtn').onclick = async () => {
    const body = buildBody({
        title: $('fTitle').value.trim(),
        descriptions: $('fDesc').value,
        startTime: $('fStart').value ? $('fStart').value + ':00' : '',
        endTime: $('fEnd').value ? $('fEnd').value + ':00' : '',
        color: modalColor,
        complete: $('fComplete').checked,
        reminder: $('fReminder').value === '' ? null : parseInt($('fReminder').value, 10)
    });
    if (!body.title) { $('modalMsg').textContent = 'Vui lòng nhập tiêu đề.'; return; }
    if (!body.startTime || !body.endTime) { $('modalMsg').textContent = 'Vui lòng chọn thời gian.'; return; }
    if (body.endTime <= body.startTime) { $('modalMsg').textContent = 'Kết thúc phải sau bắt đầu.'; return; }

    try {
        const saved = editingId
            ? await api('PUT', '/tasks/' + editingId, body)
            : await api('POST', '/tasks', body);
        closeModal();
        calendar.refetchEvents();
        showTask(saved);          // mở panel của task vừa lưu để thêm task con ngay
        checkFreetime(saved.startTime, saved.endTime);
    } catch (e) { $('modalMsg').textContent = e.message; }
};

$('delBtn').onclick = async () => {
    try { if (await deleteTask(editingId)) closeModal(); }
    catch (e) { $('modalMsg').textContent = e.message; }
};

$('addBtn').onclick = () => {
    const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1);
    const e = new Date(s.getTime() + 3600000);
    openModal({ startTime: toLocalISO(s), endTime: toLocalISO(e), color: 0, complete: false, reminder: null });
};

// ---------- Kéo thả / đổi kích thước: lưu lại giờ mới ----------
async function saveFromEvent(info) {
    const ev = info.event;
    const p = ev.extendedProps;
    const end = ev.end || new Date(ev.start.getTime() + 3600000);
    try {
        await api('PUT', '/tasks/' + ev.id, buildBody({
            title: ev.title, descriptions: p.descriptions,
            startTime: toLocalISO(ev.start), endTime: toLocalISO(end),
            color: p.color, complete: p.complete, reminder: p.reminder
        }));
        updatePanelTime(ev.id, toLocalISO(ev.start), toLocalISO(end));
        checkFreetime(toLocalISO(ev.start), toLocalISO(end));
    } catch (e) {
        alert(e.message);
        info.revert();
    }
}

// ---------- Panel chi tiết: nhiều panel nổi, kéo được ----------
const panels = new Map();   // taskId -> panel
let zTop = 100;
let spawn = 0;

function pad2(n) { return String(n).padStart(2, '0'); }
function fmt(iso) {
    const d = new Date(iso);
    return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() +
        ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function reminderText(m) {
    if (m == null) return 'Không nhắc';
    if (m >= 1440) return 'Nhắc trước ' + (m / 1440) + ' ngày';
    if (m >= 60) return 'Nhắc trước ' + (m / 60) + ' giờ';
    return 'Nhắc trước ' + m + ' phút';
}

function bringToFront(p) { p.el.style.zIndex = ++zTop; }

function renderInfo(p) {
    const t = p.t, q = p.q;
    q('.fp-title').textContent = t.title;
    q('.fp-title').title = t.title;
    q('.fp-dot').style.background = COLORS[t.color] || COLORS[0];
    q('.fp-time').textContent = fmt(t.startTime) + '  →  ' + fmt(t.endTime);
    q('.fp-desc').textContent = t.descriptions || '(Không có mô tả)';
    q('.fp-reminder').textContent = reminderText(t.reminder);
    q('.fp-complete').checked = !!t.complete;
    p.setSwatch(t.color);
}

function renderProgress(p) {
    const total = p.items.reduce((s, i) => s + i.taskItemWeight, 0);
    const done = p.items.filter(i => i.complete).reduce((s, i) => s + i.taskItemWeight, 0);
    const pct = total ? Math.round(done * 100 / total) : 0;
    p.q('.fp-bar').style.width = pct + '%';
    p.q('.fp-percent').textContent = total ? ('Tiến độ: ' + pct + '% (' + done + '/' + total + ')') : 'Chưa có task con';
}

function renderItems(p) {
    const ul = p.q('.fp-items');
    ul.innerHTML = '';
    p.items.forEach(it => {
        const li = document.createElement('li');
        li.className = 'item' + (it.complete ? ' done' : '');

        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = it.complete;
        cb.onchange = () => saveItem(p, it, { complete: cb.checked });

        const tx = document.createElement('input');
        tx.type = 'text'; tx.className = 'c'; tx.value = it.content;
        tx.onchange = () => saveItem(p, it, { content: tx.value.trim() });

        const w = document.createElement('input');
        w.type = 'number'; w.className = 'w'; w.min = 1; w.max = 100; w.value = it.taskItemWeight; w.title = 'Weight';
        w.onchange = () => saveItem(p, it, { taskItemWeight: parseInt(w.value, 10) });

        const del = document.createElement('button');
        del.className = 'icon-btn'; del.textContent = '🗑'; del.title = 'Xóa task con';
        del.onclick = () => deleteItem(p, it);

        li.append(cb, tx, w, del);
        ul.appendChild(li);
    });
    renderProgress(p);
}

async function loadItems(p) {
    p.q('.fp-msg').textContent = '';
    try {
        p.items = await api('GET', '/taskitems?userId=' + encodeURIComponent(user.userId) +
            '&taskId=' + encodeURIComponent(p.t.taskId));
    } catch (e) { p.items = []; p.q('.fp-msg').textContent = e.message; }
    renderItems(p);
}

async function saveItem(p, it, patch) {
    const next = Object.assign({}, it, patch);
    if (!next.content || isNaN(next.taskItemWeight) || next.taskItemWeight < 1 || next.taskItemWeight > 100) {
        p.q('.fp-msg').textContent = 'Nội dung không được rỗng và weight phải từ 1 đến 100.';
        return renderItems(p);
    }
    try {
        await api('PUT', '/taskitems/' + it.taskItemId, {
            userId: user.userId, content: next.content,
            taskItemWeight: next.taskItemWeight, complete: next.complete
        });
        Object.assign(it, next);
        p.q('.fp-msg').textContent = '';
        renderItems(p);
        calendar.refetchEvents();
    } catch (e) { p.q('.fp-msg').textContent = e.message; loadItems(p); }
}

async function deleteItem(p, it) {
    try {
        await api('DELETE', '/taskitems/' + it.taskItemId + '?userId=' + encodeURIComponent(user.userId));
        p.items = p.items.filter(x => x !== it);
        renderItems(p);
        calendar.refetchEvents();
    } catch (e) { p.q('.fp-msg').textContent = e.message; }
}

function makeDraggable(p) {
    const head = p.q('.fp-head'), el = p.el;
    head.addEventListener('pointerdown', e => {
        if (e.target.closest('button')) return;
        bringToFront(p);
        const r = el.getBoundingClientRect();
        const dx = e.clientX - r.left, dy = e.clientY - r.top;
        head.setPointerCapture(e.pointerId);
        const move = ev => {
            const x = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 80);
            const y = Math.min(Math.max(0, ev.clientY - dy), window.innerHeight - 40);
            el.style.left = x + 'px';
            el.style.top = y + 'px';
        };
        const up = () => {
            head.removeEventListener('pointermove', move);
            head.removeEventListener('pointerup', up);
        };
        head.addEventListener('pointermove', move);
        head.addEventListener('pointerup', up);
    });
    el.addEventListener('pointerdown', () => bringToFront(p));
}

function createPanel(t) {
    const el = document.createElement('div');
    el.className = 'fpanel';
    el.innerHTML =
        '<div class="fp-head">' +
        '<span class="fp-dot"></span><span class="fp-title"></span>' +
        '<button class="icon-btn fp-min" title="Thu nhỏ">&minus;</button>' +
        '<button class="icon-btn fp-close" title="Đóng">&times;</button>' +
        '</div>' +
        '<div class="fp-body">' +
        '<div class="dot-line"><span class="fp-time"></span></div>' +
        '<div class="swatches fp-colors"></div>' +
        '<p class="muted fp-desc"></p>' +
        '<div class="muted fp-reminder"></div>' +
        '<label class="check"><input type="checkbox" class="fp-complete"><span>Đã hoàn thành</span></label>' +
        '<div class="progress"><div class="fp-bar"></div></div>' +
        '<small class="muted fp-percent"></small>' +
        '<h4>Task con</h4>' +
        '<ul class="items fp-items"></ul>' +
        '<div class="add-item">' +
        '<input class="fp-nc" placeholder="Thêm task con...">' +
        '<input class="fp-nw" type="number" min="1" max="100" value="1" title="Weight (độ nặng)">' +
        '<button class="fp-add">Thêm</button>' +
        '</div>' +
        '<div class="msg fp-msg"></div>' +
        '<div class="actions"><button class="danger fp-del">Xóa task</button><button class="fp-edit">Sửa</button></div>' +
        '</div>';

    const n = spawn++ % 8;
    el.style.left = Math.min(120 + n * 32, window.innerWidth - 360) + 'px';
    el.style.top = (110 + n * 32) + 'px';

    const p = { t: t, items: [], el: el, q: s => el.querySelector(s) };
    document.getElementById('panelLayer').appendChild(el);
    p.setSwatch = buildSwatches(p.q('.fp-colors'), async i => {
        try {
            await api('PUT', '/tasks/' + p.t.taskId, buildBody(Object.assign({}, p.t, { color: i })));
            p.t.color = i;
            renderInfo(p);
            calendar.refetchEvents();
        } catch (e) { p.q('.fp-msg').textContent = e.message; }
    });

    p.q('.fp-close').onclick = () => closePanel(p.t.taskId);
    p.q('.fp-min').onclick = () => {
        const min = el.classList.toggle('min');
        p.q('.fp-min').innerHTML = min ? '&#9633;' : '&minus;';
        p.q('.fp-min').title = min ? 'Mở rộng' : 'Thu nhỏ';
    };
    p.q('.fp-edit').onclick = () => openModal(p.t);

    p.q('.fp-complete').onchange = async () => {
        const checked = p.q('.fp-complete').checked;
        try {
            await api('PUT', '/tasks/' + p.t.taskId, buildBody(Object.assign({}, p.t, { complete: checked })));
            p.t.complete = checked;
            calendar.refetchEvents();
        } catch (e) { p.q('.fp-msg').textContent = e.message; p.q('.fp-complete').checked = !!p.t.complete; }
    };

    p.q('.fp-del').onclick = async () => {
        try { await deleteTask(p.t.taskId); } catch (e) { p.q('.fp-msg').textContent = e.message; }
    };

    const add = async () => {
        const content = p.q('.fp-nc').value.trim();
        const weight = parseInt(p.q('.fp-nw').value, 10);
        if (!content) { p.q('.fp-msg').textContent = 'Vui lòng nhập nội dung task con.'; return; }
        if (isNaN(weight) || weight < 1 || weight > 100) { p.q('.fp-msg').textContent = 'Weight phải từ 1 đến 100.'; return; }
        try {
            const created = await api('POST', '/taskitems', {
                userId: user.userId, taskId: p.t.taskId, content: content, taskItemWeight: weight
            });
            p.items.push(created);
            p.q('.fp-nc').value = ''; p.q('.fp-nw').value = 1; p.q('.fp-msg').textContent = '';
            renderItems(p);
            calendar.refetchEvents();
            p.q('.fp-nc').focus();
        } catch (e) { p.q('.fp-msg').textContent = e.message; }
    };
    p.q('.fp-add').onclick = add;
    p.q('.fp-nc').addEventListener('keydown', e => { if (e.key === 'Enter') add(); });

    makeDraggable(p);
    panels.set(t.taskId, p);
    return p;
}

// Mở panel của task (nếu đã có thì cập nhật và đưa lên trên cùng)
function showTask(t) {
    let p = panels.get(t.taskId);
    if (p) { p.t = t; p.el.classList.remove('min'); p.q('.fp-min').innerHTML = '&minus;'; }
    else p = createPanel(t);
    renderInfo(p);
    bringToFront(p);
    loadItems(p);
}

function closePanel(taskId) {
    const p = panels.get(taskId);
    if (!p) return;
    p.el.remove();
    panels.delete(taskId);
}

// Gọi khi giờ task đổi do kéo thả trên lịch
function updatePanelTime(taskId, startISO, endISO) {
    const p = panels.get(taskId);
    if (!p) return;
    p.t.startTime = startISO;
    p.t.endTime = endISO;
    renderInfo(p);
}

async function deleteTask(id) {
    await api('DELETE', '/tasks/' + id + '?userId=' + encodeURIComponent(user.userId));
    closePanel(id);
    calendar.refetchEvents();
    return true;
}

// ---------- Freetime ----------
const DAY_MIN = 24 * 60;   // đổi số này nếu muốn tính ít giờ hơn mỗi ngày
let minFree = 0;

function fmtMin(m) {
    m = Math.max(0, Math.round(m));
    const h = Math.floor(m / 60), r = m % 60;
    if (h === 0) return r + 'p';
    return r === 0 ? h + 'h' : h + 'h' + pad2(r);
}

function toast(text, sub) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    if (sub) {
        const s = document.createElement('small');
        s.textContent = sub;
        d.appendChild(s);
    }
    $('toastLayer').appendChild(d);
    setTimeout(() => d.remove(), 5000);
}

function setFreeTitle() {
    $('fFree').title = 'Freetime tối thiểu mỗi ngày, tính bằng phút (' + fmtMin(minFree) + ')';
}

async function loadFreetime() {
    try {
        const r = await api('GET', '/users/freetime?userId=' + encodeURIComponent(user.userId));
        minFree = r.minutes;
        $('fFree').value = minFree||'';
        setFreeTitle();
        updateFreeBar();
    } catch (e) { toast(e.message); }
}

$('fFree').onchange = async () => {
    const raw = $('fFree').value.trim();
    const v = raw === '' ? 0 : parseInt(raw, 10);   // để trống = 0
    if (isNaN(v) || v < 0 || v > DAY_MIN) {
        $('fFree').value = minFree || '';
        toast('Freetime phải từ 0 đến ' + DAY_MIN + ' phút.');
        return;
    }
    try {
        await api('PUT', '/users/freetime', { userId: user.userId, minutes: v });
        minFree = v;
        $('fFree').value = v || '';                 // 0 thì để trống cho hiện placeholder
        setFreeTitle();
        updateFreeBar();
    } catch (e) { $('fFree').value = minFree || ''; toast(e.message); }
};

$('ftHelpBtn').onclick = () => $('ftHelp').classList.toggle('show');

// Kiểm tra các ngày mà task (từ startISO đến endISO) đi qua
// Số phút bận của ngày d (task chồng nhau chỉ tính một lần)
function dayBusy(list, d) {
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const iv = list
        .map(t => [Math.max(new Date(t.startTime).getTime(), dayStart),
        Math.min(new Date(t.endTime).getTime(), dayEnd)])
        .filter(x => x[1] > x[0])
        .sort((a, b) => a[0] - b[0]);
    let busy = 0, curS = null, curE = null;
    iv.forEach(x => {
        if (curS === null) { curS = x[0]; curE = x[1]; }
        else if (x[0] <= curE) { curE = Math.max(curE, x[1]); }
        else { busy += curE - curS; curS = x[0]; curE = x[1]; }
    });
    if (curS !== null) busy += curE - curS;
    return busy / 60000;
}

let focusDate = new Date();   // ngày mà thanh freetime đang hiển thị

async function updateFreeBar() {
    try {
        const d = new Date(focusDate.getFullYear(), focusDate.getMonth(), focusDate.getDate());
        const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        const list = await api('GET',
            '/tasks?userId=' + encodeURIComponent(user.userId) +
            '&start=' + encodeURIComponent(toLocalISO(d)) +
            '&end=' + encodeURIComponent(toLocalISO(next)));
        const busy = dayBusy(list, d);
        const free = DAY_MIN - busy;
        const t = new Date();
        const isToday = d.getTime() === new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();

        $('freeText').textContent = (isToday ? 'Hôm nay' : 'Ngày ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1))
            + ' còn rảnh: ' + fmtMin(free);
        $('freeFill').style.width = Math.min(100, busy * 100 / DAY_MIN) + '%';
        $('freeLimit').style.display = minFree > 0 ? 'block' : 'none';
        $('freeLimit').style.left = ((DAY_MIN - minFree) * 100 / DAY_MIN) + '%';
        $('freeBar').classList.toggle('low', minFree > 0 && free < minFree);
    } catch (err) { /* lỗi thì bỏ qua, không ảnh hưởng thao tác chính */ }
}

// Kiểm tra các ngày mà task (từ startISO đến endISO) đi qua
async function checkFreetime(startISO, endISO) {
    updateFreeBar();
    if (minFree <= 0) return;
    try {
        const s = new Date(startISO), e = new Date(endISO);
        const first = new Date(s.getFullYear(), s.getMonth(), s.getDate());
        let last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
        if (e > s && e.getHours() === 0 && e.getMinutes() === 0 && e.getSeconds() === 0)
            last = new Date(last.getFullYear(), last.getMonth(), last.getDate() - 1);
        const rangeEnd = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);

        const list = await api('GET',
            '/tasks?userId=' + encodeURIComponent(user.userId) +
            '&start=' + encodeURIComponent(toLocalISO(first)) +
            '&end=' + encodeURIComponent(toLocalISO(rangeEnd)));

        for (let d = new Date(first); d < rangeEnd; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
            const free = DAY_MIN - dayBusy(list, d);
            if (free < minFree)
                toast('Freetime hiện tại: ' + fmtMin(free),
                    'Ngày ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) +
                    ' (tối thiểu ' + fmtMin(minFree) + ')');
        }
    } catch (err) { /* kiểm tra freetime lỗi thì bỏ qua, không chặn thao tác chính */ }
}

loadFreetime();

// ---------FullCalendar----------------
calendar = new FullCalendar.Calendar($('calendar'), {
    initialView: 'dayGridMonth',    
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
    buttonText: { today: 'Hôm nay', month: 'Tháng', week: 'Tuần', day: 'Ngày' },
    firstDay: 1,
    height: 'auto',
    nowIndicator: true,
    editable: true,
    eventResizableFromStart: true,   // kéo được cả mép trên (đổi startTime)
    eventDurationEditable: true,     // cho phép kéo dài/thu ngắn
    eventStartEditable: true,        // cho phép kéo thả đổi giờ/ngày
    snapDuration: '00:15:00',        // mỗi bước kéo = 15 phút
    slotDuration: '00:30:00',
    eventMinHeight: 22,              // task ngắn vẫn đủ cao để cầm kéo
    scrollTime: '07:00:00',          // tuần/ngày mở sẵn từ 7h sáng
    longPressDelay: 300,             // chạm giữ trên điện thoại/tablet
    eventLongPressDelay: 300,
    views: {
        dayGridMonth: { eventDisplay: 'block' }  // tháng: hiện dạng khối thay vì chấm
    },
    displayEventEnd: true,
    eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
    slotLabelFormat: { hour: '2-digit', minute: '2-digit', hour12: false },

    eventDidMount: info => {
        const pr = info.event.extendedProps.progress;
        if (pr == null) return;
        const el = info.el.querySelector('.fc-event-title');
        if (el) el.textContent = info.event.title + ' · ' + pr + '%';
    },

    events: async (info, success, failure) => {
        try {
            const list = await api('GET',
                '/tasks?userId=' + encodeURIComponent(user.userId) +
                '&start=' + encodeURIComponent(toLocalISO(info.start)) +
                '&end=' + encodeURIComponent(toLocalISO(info.end)));
            success(list.map(toEvent));
            focusDate = (info.end - info.start <= 90000000) ? info.start : new Date();
            updateFreeBar();
        } catch (e) { failure(e); alert(e.message); }
    },

    dateClick: info => {
        const s = new Date(info.date);
        if (info.allDay) s.setHours(9, 0, 0, 0);      // bấm vào ô ngày thì mặc định 9:00
        const e = new Date(s.getTime() + 3600000);
        openModal({ startTime: toLocalISO(s), endTime: toLocalISO(e), color: 0, complete: false, reminder: null });
    },

    eventClick: info => {
        const ev = info.event, p = ev.extendedProps;
        const end = ev.end || new Date(ev.start.getTime() + 3600000);
        showTask({
            taskId: ev.id, title: ev.title, descriptions: p.descriptions,
            startTime: toLocalISO(ev.start), endTime: toLocalISO(end),
            color: p.color, complete: p.complete, reminder: p.reminder
        });
    },

    eventDrop: saveFromEvent,
    eventResize: saveFromEvent
});
calendar.render();