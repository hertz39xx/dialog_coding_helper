// --- IndexedDB 核心邏輯 ---
const DB_NAME = 'DialogueCodingDB_V2';
const DB_VERSION = 1;
const STORE_NAME = 'progress';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'fileName' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function saveProgressToDB(fileName, data, deleted) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({ fileName, data, deleted, timestamp: Date.now() });
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

async function getProgressFromDB(fileName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(fileName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

async function deleteProgressFromDB(fileName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(fileName);
        request.onsuccess = () => resolve();
        request.onerror = (e) => reject(e.target.error);
    });
}

// --- 應用程式狀態 ---
let state = {
    rawSchema: [], rawResults: [], data: [], chatrooms: [], currentChatroomIndex: 0,
    schemaOptions: { S: [], B: [] },
    mappings: { schema: {}, results: {} },
    currentMappingType: '',
    filters: { search: '', incompleteOnly: false, confusingOnly: false },
    isDarkMode: false,
    currentFileName: '',
    activeTab: 'editor',
    deletedChatrooms: []
};

const elements = {
    schemaFile: document.getElementById('schemaFile'),
    resultsFile: document.getElementById('resultsFile'),
    mainWorkspace: document.getElementById('editorView'),
    dashboardView: document.getElementById('dashboardView'),
    chatroomList: document.getElementById('chatroomList'),
    dialogueContainer: document.getElementById('dialogueContainer'),
    exportXlsxBtn: document.getElementById('exportXlsxBtn'),
    exportDeletedBtn: document.getElementById('exportDeletedBtn'),
    progressText: document.getElementById('progressText'),
    currentChatroomId: document.getElementById('currentChatroomId'),
    prevBtn: document.getElementById('prevBtn'), nextBtn: document.getElementById('nextBtn'),
    toast: document.getElementById('toast'),
    mappingModal: document.getElementById('mappingModal'),
    mappingModalContent: document.getElementById('mappingModalContent'),
    confirmMappingBtn: document.getElementById('confirmMappingBtn'),
    cancelMappingBtn: document.getElementById('cancelMappingBtn'),
    darkModeToggle: document.getElementById('darkModeToggle'),
    tabNav: document.getElementById('tabNav'),
    listSearch: document.getElementById('listSearch'),
    clearStorageBtn: document.getElementById('clearStorageBtn'),
    deletedLog: document.getElementById('deletedLog'),
    noDeletedHint: document.getElementById('noDeletedHint'),
    confirmModal: document.getElementById('confirmModal'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmOk: document.getElementById('confirmOk'),
    confirmCancel: document.getElementById('confirmCancel'),
    restoreModal: document.getElementById('restoreModal')
};

let confirmCallback = null;

function init() {
    elements.schemaFile.addEventListener('change', (e) => startMapping(e, 'schema'));
    elements.resultsFile.addEventListener('change', (e) => startMapping(e, 'results'));
    elements.exportXlsxBtn.addEventListener('click', () => exportFile('results'));
    elements.exportDeletedBtn.addEventListener('click', () => exportFile('deleted'));
    elements.prevBtn.addEventListener('click', () => switchChatroom(state.currentChatroomIndex - 1));
    elements.nextBtn.addEventListener('click', () => switchChatroom(state.currentChatroomIndex + 1));
    elements.confirmMappingBtn.addEventListener('click', finalizeMapping);
    elements.cancelMappingBtn.addEventListener('click', () => elements.mappingModal.classList.add('hidden'));
    elements.darkModeToggle.addEventListener('click', toggleDarkMode);
    elements.listSearch.addEventListener('input', (e) => { state.filters.search = e.target.value; renderChatroomList(); });
    elements.clearStorageBtn.addEventListener('click', () => {
        showConfirm("確定要清除所有暫存進度並重新開始嗎？", async () => {
            await deleteProgressFromDB(state.currentFileName);
            location.reload();
        });
    });
    document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    document.getElementById('filterIncomplete').onclick = () => { state.filters.incompleteOnly = !state.filters.incompleteOnly; renderChatroomList(); };
    document.getElementById('filterConfusing').onclick = () => { state.filters.confusingOnly = !state.filters.confusingOnly; renderChatroomList(); };
    document.getElementById('filterReset').onclick = () => { state.filters = { search: '', incompleteOnly: false, confusingOnly: false }; elements.listSearch.value = ''; renderChatroomList(); };

    elements.confirmCancel.onclick = () => elements.confirmModal.classList.add('hidden');
    elements.confirmOk.onclick = () => { if (confirmCallback) confirmCallback(); elements.confirmModal.classList.add('hidden'); };

    window.addEventListener('keydown', handleGlobalKeyDown);
}

function showConfirm(msg, callback) {
    elements.confirmMessage.innerText = msg;
    confirmCallback = callback;
    elements.confirmModal.classList.remove('hidden');
}

function switchTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('tab-active', btn.dataset.tab === tab);
        btn.classList.toggle('text-slate-500', btn.dataset.tab !== tab);
    });
    elements.mainWorkspace.classList.toggle('hidden', tab !== 'editor');
    elements.dashboardView.classList.toggle('hidden', tab !== 'dashboard');
    if (tab === 'dashboard') updateDashboard();
}

function handleGlobalKeyDown(e) {
    if (state.activeTab !== 'editor') return;
    if (e.key === 'ArrowLeft') elements.prevBtn.click();
    if (e.key === 'ArrowRight') elements.nextBtn.click();
    if (e.key >= '1' && e.key <= '9') {
        const focused = document.querySelector('[data-focused="true"]');
        if (focused) {
            const sel = focused.querySelector('.code-sel');
            const idx = parseInt(e.key);
            if (sel && sel.options[idx]) { sel.selectedIndex = idx; sel.dispatchEvent(new Event('change')); }
        }
    }
}

async function startMapping(e, type) {
    const file = e.target.files[0];
    if (!file) return;
    state.currentMappingType = type;
    if (type === 'results') state.currentFileName = file.name;
    const reader = new FileReader();
    reader.onload = (evt) => {
        const extension = file.name.split('.').pop().toLowerCase();
        let data = [];
        if (extension === 'csv') {
            Papa.parse(evt.target.result, { header: true, skipEmptyLines: true, complete: (res) => showMappingModal(res.data, type) });
        } else {
            const wb = XLSX.read(evt.target.result, { type: 'binary' });
            data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            showMappingModal(data, type);
        }
    };
    reader.readAsBinaryString(file);
}

function showMappingModal(data, type) {
    if (!data || data.length === 0) { showToast("錯誤：檔案內容為空"); return; }
    const headers = Object.keys(data[0]);
    state[type === 'schema' ? 'rawSchema' : 'rawResults'] = data;
    let html = '';
    if (type === 'schema') {
        html += renderSelect('代碼欄位 (必選)', 'schema_code', headers, '代碼');
        html += renderSelect('名稱欄位', 'schema_name', headers, '名稱');
        html += renderSelect('說明欄位', 'schema_desc', headers, '說明');
        html += renderSelect('角色分類欄位', 'schema_role', headers, '角色');
    } else {
        html += renderSelect('聊天室分組 ID (必選)', 'results_chatroom', headers, 'chatroom_id');
        html += renderSelect('序號/對話 ID (必選)', 'results_id', headers, 'id');
        html += renderSelect('發言角色 (必選)', 'results_sender', headers, 'sender');
        html += renderSelect('訊息內容 (必選)', 'results_message', headers, 'message');
        html += renderSelect('既有代碼 (選填)', 'results_code', headers, 'code', true);
        html += renderSelect('爭議標記 (選填)', 'results_confusing', headers, 'confusing', true);
    }
    elements.mappingModalContent.innerHTML = html;
    elements.mappingModal.classList.remove('hidden');
    document.querySelectorAll('.mapping-select').forEach(sel => {
        const preview = document.getElementById(`preview-${sel.id}`);
        const isOpt = sel.dataset.optional === 'true';
        sel.onchange = () => {
            if (sel.value) preview.innerText = `範例: ${data[0][sel.value] || '(空)'}`;
            else preview.innerText = isOpt ? '範例: (將於匯出時自動建立新欄位)' : '範例: (尚未選擇)';
        };
        sel.onchange();
    });
}

function renderSelect(label, id, options, fallback, optional = false) {
    const opts = options.map(o => `<option value="${o}" ${o === fallback || o.toLowerCase() === fallback.toLowerCase() ? 'selected' : ''}>${o}</option>`).join('');
    return `<div class="mb-4"><label class="block text-xs font-bold text-slate-600 mb-1 uppercase">${label}</label><select id="${id}" data-optional="${optional}" class="mapping-select w-full text-sm p-2 border rounded-lg bg-white outline-none focus:ring-2 focus:ring-indigo-400"><option value="">-- ${optional ? '請選擇 (選填)' : '請選擇'} --</option>${opts}</select><div id="preview-${id}" class="mt-1 text-[10px] text-slate-400 italic truncate">範例: ...</div></div>`;
}

async function finalizeMapping() {
    const type = state.currentMappingType;
    if (type === 'schema') {
        const code = getValue('schema_code');
        if (!code) { showToast("錯誤：代碼欄位為必填"); return; }
        state.mappings.schema = { code, name: getValue('schema_name'), desc: getValue('schema_desc'), role: getValue('schema_role') };
        processSchema();
        document.getElementById('schemaMappingStatus').innerText = '✅ 規範已配置';
    } else {
        const chatroom = getValue('results_chatroom');
        const id = getValue('results_id');
        const sender = getValue('results_sender');
        const message = getValue('results_message');
        if (!chatroom || !id || !sender || !message) { showToast("錯誤：必選欄位未配置"); return; }
        state.mappings.results = { chatroom, id, sender, message, code: getValue('results_code'), confusing: getValue('results_confusing') };

        const saved = await getProgressFromDB(state.currentFileName);
        if (saved) {
            elements.restoreModal.classList.remove('hidden');
            document.getElementById('restoreYes').onclick = () => {
                state.data = saved.data || [];
                state.deletedChatrooms = saved.deleted || [];
                rebuildChatrooms();
                elements.restoreModal.classList.add('hidden');
                checkFinalReady();
            };
            document.getElementById('restoreNo').onclick = () => {
                state.deletedChatrooms = [];
                processData();
                elements.restoreModal.classList.add('hidden');
                checkFinalReady();
            };
        } else { processData(); checkFinalReady(); }
        document.getElementById('resultsMappingStatus').innerText = '✅ 資料已載入';
    }
    elements.mappingModal.classList.add('hidden');
}

function checkFinalReady() {
    if (state.schemaOptions.S.length > 0 && state.data.length > 0) {
        elements.tabNav.classList.remove('hidden');
        elements.exportXlsxBtn.classList.remove('hidden');
        elements.clearStorageBtn.classList.remove('hidden');
        switchTab('editor');
        renderChatroomList();
        renderCurrentChatroom();
    }
}

function getValue(id) { return document.getElementById(id).value; }

function processSchema() {
    state.schemaOptions = { S: [], B: [] };
    const m = state.mappings.schema;
    state.rawSchema.forEach(item => {
        const code = item[m.code];
        if (!code) return;
        const opt = { code, name: item[m.name] || '', desc: item[m.desc] || '' };
        const role = String(item[m.role] || '');
        if (role.includes('S')) state.schemaOptions.S.push(opt);
        if (role.includes('B')) state.schemaOptions.B.push(opt);
        if (!role) { state.schemaOptions.S.push(opt); state.schemaOptions.B.push(opt); }
    });
}

function processData() {
    const m = state.mappings.results;
    state.data = state.rawResults.map(item => ({
        ...item,
        _id: item[m.id], _chatroom: item[m.chatroom], _sender: item[m.sender], _message: item[m.message],
        _code: m.code ? (item[m.code] || '') : '',
        is_confusing: m.confusing ? (item[m.confusing] === '*') : false
    }));
    rebuildChatrooms();
}

function rebuildChatrooms() {
    state.data.sort((a, b) => (String(a._chatroom) !== String(b._chatroom)) ? String(a._chatroom).localeCompare(String(b._chatroom)) : parseInt(a._id) - parseInt(b._id));
    const groups = {};
    state.data.forEach(msg => { if (!groups[msg._chatroom]) groups[msg._chatroom] = []; groups[msg._chatroom].push(msg); });
    state.chatrooms = Object.keys(groups).map(id => ({ id, messages: groups[id] }));
    const firstIdx = state.chatrooms.findIndex(r => r.messages.some(m => !m._code));
    state.currentChatroomIndex = firstIdx !== -1 ? firstIdx : 0;
}

function renderChatroomList() {
    elements.chatroomList.innerHTML = '';
    const filtered = state.chatrooms.filter(room => {
        if (state.filters.search && !String(room.id).includes(state.filters.search)) return false;
        const isDone = room.messages.every(m => m._code);
        const hasConf = room.messages.some(m => m.is_confusing);
        if (state.filters.incompleteOnly && isDone) return false;
        if (state.filters.confusingOnly && !hasConf) return false;
        return true;
    });
    filtered.forEach((room) => {
        const isDone = room.messages.every(m => m._code);
        const hasConf = room.messages.some(m => m.is_confusing);
        const realIdx = state.chatrooms.indexOf(room);
        const div = document.createElement('div');
        div.className = `chatroom-item p-3 cursor-pointer hover:bg-slate-50 border-l-4 transition-all flex justify-between items-center ${realIdx === state.currentChatroomIndex ? 'active-chatroom' : 'border-transparent'}`;

        div.innerHTML = `<div class="flex-1 min-w-0 pr-2 pointer-events-none"><div class="flex justify-between items-center mb-1"><span class="text-xs font-bold text-slate-700 truncate w-32">${room.id}</span>${hasConf ? '<span class="text-[9px] bg-red-500 text-white px-1.5 rounded-full font-black">!</span>' : ''}</div><div class="flex justify-between text-[10px] font-medium"><span class="text-slate-400">${room.messages.length} 則</span>${isDone ? '<span class="text-green-600 font-bold">完成</span>' : ''}</div></div><button class="delete-btn delete-btn-hover p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"><svg class="w-4 h-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>`;
        div.onclick = (e) => {
            if (e.target.closest('.delete-btn')) deleteChatroom(realIdx);
            else switchChatroom(realIdx);
        };
        elements.chatroomList.appendChild(div);
    });
    elements.progressText.innerText = `${filtered.length} / ${state.chatrooms.length}`;
}

function deleteChatroom(index) {
    const room = state.chatrooms[index];
    showConfirm(`確定要刪除群組 [${room.id}] 嗎？將排除在匯出結果外。`, () => {
        state.deletedChatrooms.push({ id: room.id, count: room.messages.length, messages: [...room.messages] });
        state.data = state.data.filter(msg => msg._chatroom !== room.id);
        state.chatrooms.splice(index, 1);
        if (state.currentChatroomIndex >= state.chatrooms.length) state.currentChatroomIndex = Math.max(0, state.chatrooms.length - 1);
        saveProgress();
        updateDashboard();
        renderChatroomList();
        if (state.chatrooms.length > 0) renderCurrentChatroom();
        else {
            elements.dialogueContainer.innerHTML = '<div class="text-center py-20 text-slate-300">已無對話資料</div>';
            elements.currentChatroomId.innerText = '無對話';
        }
        showToast('已移至刪除記錄');
    });
}

function restoreChatroom(id) {
    const recordIdx = state.deletedChatrooms.findIndex(d => String(d.id) === String(id));
    if (recordIdx === -1) return;
    const record = state.deletedChatrooms[recordIdx];
    state.data.push(...record.messages);
    state.deletedChatrooms.splice(recordIdx, 1);
    rebuildChatrooms();
    saveProgress();
    updateDashboard();
    renderChatroomList();
    renderCurrentChatroom();
    showToast(`已復原: ${id}`);
}

function switchChatroom(index) {
    if (index < 0 || index >= state.chatrooms.length) return;
    state.currentChatroomIndex = index;
    renderChatroomList();
    renderCurrentChatroom();
    elements.dialogueContainer.scrollTop = 0;
}

function renderCurrentChatroom() {
    const room = state.chatrooms[state.currentChatroomIndex];
    if (!room) return;
    elements.currentChatroomId.innerText = `群組: ${room.id}`;
    elements.dialogueContainer.innerHTML = '';
    room.messages.forEach(msg => {
        const isBot = String(msg._sender).toLowerCase() === 'bot';
        const roleKey = isBot ? 'B' : 'S';
        const options = state.schemaOptions[roleKey];
        const card = document.createElement('div');
        card.id = `card-${msg._id}`;
        card.className = `w-full p-4 rounded-xl ${isBot ? 'message-bot-style' : 'message-user-style'} shadow-sm border transition-all ${msg.is_confusing ? 'confusing-card' : ''}`;
        card.onmouseenter = () => card.dataset.focused = 'true';
        card.onmouseleave = () => delete card.dataset.focused;
        const cur = String(msg._code || '').replace('S.', '').replace('B.', '');
        const opts = `<option value="">-- 選取編碼 --</option>` + options.map((o, i) => `<option value="${o.code}" ${cur === o.code ? 'selected' : ''}>[${i + 1}] ${o.code}: ${o.name}</option>`).join('');
        card.innerHTML = `<div class="flex flex-col gap-2"><div class="flex items-center justify-between gap-4 border-b border-slate-200/50 pb-2"><div class="flex items-center gap-4"><span class="text-[10px] font-black uppercase tracking-widest ${isBot ? 'text-slate-500' : 'text-indigo-600'} bg-white/60 px-2 py-0.5 rounded shadow-inner">${isBot ? 'BOT' : 'USER'} #${msg._id}</span><label class="flex items-center gap-1.5 cursor-pointer select-none group"><input type="checkbox" class="conf-check w-4 h-4 text-red-600 rounded group-hover:scale-110 transition-transform" ${msg.is_confusing ? 'checked' : ''}><span class="text-[11px] font-bold ${msg.is_confusing ? 'text-red-600' : 'text-slate-400'}">爭議</span></label></div><div class="flex items-center gap-2"><button class="help-btn w-6 h-6 bg-white border border-slate-200 text-blue-500 rounded-full text-xs hover:bg-blue-50 transition-colors shadow-sm font-serif">i</button><select class="code-sel text-[11px] font-bold p-1 rounded-lg border border-slate-300 min-w-[150px] bg-white outline-none focus:ring-2 focus:ring-indigo-400">${opts}</select></div></div><div class="text-base text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">${msg._message}</div></div>`;
        card.querySelector('.code-sel').onchange = (e) => updateCode(msg._id, e.target.value ? `${roleKey}.${e.target.value}` : '');
        card.querySelector('.conf-check').onchange = (e) => toggleConfusing(msg._id, e.target.checked);
        card.querySelector('.help-btn').onclick = () => openHelpModal(roleKey);
        elements.dialogueContainer.appendChild(card);
    });
    elements.dialogueContainer.scrollTop = 0;
}

function updateCode(msgId, fullCode) {
    const idx = state.data.findIndex(d => d._id === msgId);
    if (idx !== -1) { state.data[idx]._code = fullCode; saveProgress(); updateDashboard(); showToast(`已存: ${fullCode || '移除'}`); }
}

function toggleConfusing(msgId, checked) {
    const idx = state.data.findIndex(d => d._id === msgId);
    if (idx !== -1) {
        state.data[idx].is_confusing = checked;
        const card = document.getElementById(`card-${msgId}`);
        if (card) {
            card.classList.toggle('confusing-card', checked);
            const label = card.querySelector('.conf-check + span');
            if (label) { label.classList.toggle('text-red-600', checked); label.classList.toggle('text-slate-400', !checked); }
        }
        saveProgress(); updateDashboard(); renderChatroomList(); showToast(checked ? '標記爭議' : '移除爭議');
    }
}

function openHelpModal(role) {
    const opts = state.schemaOptions[role];
    const help = document.getElementById('helpModal');
    const content = document.getElementById('helpModalContent');
    content.innerHTML = opts.map(o => `<div class="p-4 bg-slate-50 border rounded-xl shadow-sm"><div class="flex items-center gap-2 mb-2"><span class="bg-indigo-600 text-white px-2 py-0.5 rounded font-mono font-bold text-[10px]">${role}.${o.code}</span><span class="font-bold text-sm text-slate-800">${o.name}</span></div><p class="text-xs text-slate-500 leading-relaxed">${o.desc || '無定義。'}</p></div>`).join('');
    help.classList.remove('hidden');
    help.onclick = (e) => { if (e.target === help) help.classList.add('hidden'); };
}

async function saveProgress() {
    if (!state.currentFileName) return;
    try { await saveProgressToDB(state.currentFileName, state.data, state.deletedChatrooms); } catch (e) { showToast('儲存失敗'); }
}

function updateDashboard() {
    const total = state.data.length;
    const coded = state.data.filter(d => d._code).length;
    const conf = state.data.filter(d => d.is_confusing).length;
    const bot = state.data.filter(d => String(d._sender).toLowerCase() === 'bot');
    const user = state.data.filter(d => String(d._sender).toLowerCase() !== 'bot');
    const progress = total > 0 ? Math.round((coded / total) * 100) : 0;
    document.getElementById('dashProgress').innerText = progress + '%';
    document.getElementById('dashConfusing').innerText = conf;
    document.getElementById('dashBotCount').innerText = bot.length;
    document.getElementById('dashUserCount').innerText = user.length;
    renderChart('bot', bot.filter(m => m._code));
    renderChart('user', user.filter(m => m._code));

    elements.noDeletedHint.classList.toggle('hidden', state.deletedChatrooms.length > 0);
    elements.exportDeletedBtn.classList.toggle('hidden', state.deletedChatrooms.length === 0);
    elements.deletedLog.innerHTML = state.deletedChatrooms.map(d => `
        <div class="bg-white border border-red-200 p-4 rounded-xl flex justify-between items-center shadow-sm">
            <div class="min-w-0 pr-2">
                <div class="text-[10px] font-bold text-red-400 uppercase mb-0.5">群組 ID</div>
                <div class="text-xs font-bold text-red-700 truncate" title="${d.id}">${d.id}</div>
                <div class="text-[10px] text-slate-400 mt-1">${d.count} 則訊息</div>
            </div>
            <button onclick="restoreChatroom('${d.id}')" class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-black hover:bg-blue-600 hover:text-white transition-all">復原</button>
        </div>
    `).join('');
}

function renderChart(type, coded) {
    const counts = coded.reduce((acc, m) => { acc[m._code] = (acc[m._code] || 0) + 1; return acc; }, {});
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;
    const container = document.getElementById(type + 'Chart');
    container.innerHTML = sorted.map(([tag, count]) => `<div class="group"><div class="flex justify-between text-[10px] font-bold mb-1"><span class="font-mono text-slate-700">${tag}</span><span class="text-slate-400">${count} 次</span></div><div class="h-3 bg-slate-100 rounded-full overflow-hidden border border-slate-200"><div class="h-full ${type === 'bot' ? 'bg-indigo-500' : 'bg-blue-500'} rounded-full transition-all duration-1000" style="width: ${(count / max) * 100}%"></div></div></div>`).join('') || '<div class="text-slate-400 text-xs italic py-4">無數據</div>';
}

function toggleDarkMode() { state.isDarkMode = !state.isDarkMode; document.body.classList.toggle('dark', state.isDarkMode); elements.darkModeToggle.innerText = state.isDarkMode ? '☀️' : '🌙'; }
function showToast(msg) { elements.toast.innerText = msg; elements.toast.classList.replace('opacity-0', 'opacity-100'); setTimeout(() => elements.toast.classList.replace('opacity-100', 'opacity-0'), 1500); }

function exportFile(mode) {
    const m = state.mappings.results;
    let targetData = [];

    if (mode === 'results') {
        targetData = state.data;
    } else {
        // 將所有刪除群組內的 messages 攤平
        targetData = state.deletedChatrooms.reduce((acc, room) => acc.concat(room.messages), []);
    }

    if (targetData.length === 0) { showToast('錯誤：無資料可匯出'); return; }

    const exportData = targetData.map(item => {
        const row = { ...item };
        const cHeader = m.code || 'code';
        const cfHeader = m.confusing || 'confusing';
        row[cHeader] = item._code;
        row[cfHeader] = item.is_confusing ? '*' : '';
        const cleanRow = {};
        Object.keys(row).forEach(key => { if (!key.startsWith('_') && key !== 'is_confusing') cleanRow[key] = row[key]; });
        return cleanRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    const prefix = mode === 'results' ? 'Final' : 'Deleted';
    XLSX.writeFile(wb, `Dialogue_Coding_${prefix}_${new Date().getTime()}.xlsx`);
}

function closeHelpModal() { document.getElementById('helpModal').classList.add('hidden'); }

window.closeHelpModal = closeHelpModal;
window.restoreChatroom = restoreChatroom;

init();
