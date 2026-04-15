// ═══════════════════════════════════
// CONFIG
// ═══════════════════════════════════
const SB_URL = 'https://ktbeyflghrgzeyroqxyq.supabase.co';
const SB_KEY = 'sb_publishable_u9xhjtHKVMZEXGeE-DaYgw_Gikln52n';

// ── Groq API Settings ──
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const SB_H = {
  'Content-Type': 'application/json',
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`
};

// ═══════════════════════════════════
// STATE
// ═══════════════════════════════════
let cards = [];
let studyOn = false, studyIdx = 0, studyOrder = [];
let imgB64 = null, imgMime = null, lastVocab = [];
let brushSize = 4, brushColor = '#181816';
let drawing = false, lx = 0, ly = 0;
let showGrid = true, practiceChar = '';

// Auth state
let currentUser = null; // { id, email, name }

// ═══════════════════════════════════
// BOOT
// ═══════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  checkAuth();
});

// ═══════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════
function setDB(state, msg) {
  document.getElementById('dbDot').className = 'db-dot ' + state;
  document.getElementById('dbLabel').textContent = msg;
}

async function sbGet() {
  if (!currentUser) return [];
  const r = await fetch(`${SB_URL}/rest/v1/flashcards?user_id=eq.${currentUser.id}&order=created_at.asc`, { headers: SB_H });
  if (!r.ok) throw new Error('read ' + r.status);
  return r.json();
}

async function sbAdd(data) {
  if (!currentUser) throw new Error('Cần đăng nhập để lưu thẻ');

  if (Array.isArray(data)) {
    data.forEach(item => item.user_id = currentUser.id);
  } else {
    data.user_id = currentUser.id;
  }

  const r = await fetch(`${SB_URL}/rest/v1/flashcards`, {
    method: 'POST',
    headers: { ...SB_H, 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  if (!r.ok) { const t = await r.text(); throw new Error(t); }
  return r.json();
}

async function sbDel(id) {
  const r = await fetch(`${SB_URL}/rest/v1/flashcards?id=eq.${id}`, { method: 'DELETE', headers: SB_H });
  if (!r.ok) throw new Error('delete ' + r.status);
}

// ── Auth Helpers ──
async function sbGetUser(email) {
  const r = await fetch(`${SB_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, { headers: SB_H });
  if (!r.ok) throw new Error('Lỗi kiểm tra user');
  const users = await r.json();
  return users.length > 0 ? users[0] : null;
}

async function sbCreateUser(email, name) {
  const r = await fetch(`${SB_URL}/rest/v1/users`, {
    method: 'POST',
    headers: { ...SB_H, 'Prefer': 'return=representation' },
    body: JSON.stringify({ email, name })
  });
  if (!r.ok) throw new Error('Lỗi tạo user');
  const users = await r.json();
  return users[0];
}

// ═══════════════════════════════════
// AUTHENTICATION LOGIC
// ═══════════════════════════════════
function checkAuth() {
  const saved = localStorage.getItem('nh_user');
  if (saved) {
    currentUser = JSON.parse(saved);
  }
  updateAuthUI();
}

function updateAuthUI() {
  const area = document.getElementById('userArea');
  const overlay = document.getElementById('loginOverlay');

  if (currentUser) {
    const initial = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : '?';
    area.innerHTML = `
      <div class="user-chip" title="${currentUser.email}">
        <div class="user-avatar">${initial}</div>
        <div class="user-name">${currentUser.name}</div>
      </div>
      <button class="user-logout" onclick="handleLogout()">Đăng xuất</button>
    `;
    overlay.classList.remove('show');
    loadCards(); // Load user-specific cards
  } else {
    area.innerHTML = `<button class="user-login-btn" onclick="showLogin()">🔐 Đăng nhập</button>`;
    cards = [];
    renderCards();
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginOverlay').classList.add('show');
  document.getElementById('loginHint').textContent = '';
  document.getElementById('nameFieldGroup').style.display = 'none';
  const btn = document.getElementById('loginBtn');
  btn.textContent = '🚀 Đăng nhập / Tiếp tục';
  btn.disabled = false;
  setTimeout(() => document.getElementById('loginEmail').focus(), 100);
}

function handleLogout() {
  localStorage.removeItem('nh_user');
  currentUser = null;
  updateAuthUI();
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const nameGroup = document.getElementById('nameFieldGroup');
  const nameInput = document.getElementById('loginName');
  const name = nameInput.value.trim();
  const hint = document.getElementById('loginHint');
  const btn = document.getElementById('loginBtn');

  if (!email) { hint.textContent = 'Vui lòng nhập email'; return; }

  btn.disabled = true;
  btn.textContent = '⏳ Đang xử lý...';
  hint.style.color = 'var(--ink)';
  hint.textContent = 'Đang kiểm tra tài khoản...';

  try {
    let user = await sbGetUser(email);
    if (user) {
      // User exists - login
      currentUser = user;
      localStorage.setItem('nh_user', JSON.stringify(user));
      showToast('Đăng nhập thành công! 👋');
      updateAuthUI();
      return;
    } else {
      // User doesn't exist. If name field is hidden, show it
      if (nameGroup.style.display === 'none') {
        nameGroup.style.display = 'block';
        hint.textContent = 'Email chưa đăng ký. Nhập Tên của bạn để tạo tài khoản mới.';
        btn.textContent = '✨ Tạo tài khoản mới';
        btn.disabled = false;
        nameInput.focus();
        return;
      }

      // If name field is already visible, check if they entered a name
      if (!name) {
        throw new Error('Vui lòng nhập tên hiển thị để đăng ký');
      }
      user = await sbCreateUser(email, name);
      currentUser = user;
      localStorage.setItem('nh_user', JSON.stringify(user));
      showToast('Tạo tài khoản thành công! 🎉');
      updateAuthUI();
      return;
    }
  } catch (e) {
    hint.style.color = 'var(--red)';
    hint.textContent = e.message;
  }

  btn.disabled = false;
  btn.textContent = nameGroup.style.display === 'none' ? '🚀 Đăng nhập / Tiếp tục' : '✨ Tạo tài khoản mới';
}

// ═══════════════════════════════════
// LOAD / SYNC
// ═══════════════════════════════════
async function loadCards() {
  if (!currentUser) {
    setDB('error', 'Chưa đăng nhập');
    return;
  }
  setDB('loading', 'syncing...');
  showSync('↻ Đang tải từ Supabase...');
  try {
    cards = await sbGet();
    renderCards();
    setDB('ok', `Supabase ✓ (${cards.length})`);
    showSync(`✓ Đồng bộ ${cards.length} thẻ — ${new Date().toLocaleTimeString('vi')}`);
  } catch (e) {
    setDB('err', 'lỗi kết nối');
    showSync('✗ ' + e.message);
    const bk = localStorage.getItem('nh_bk');
    if (bk) {
      cards = JSON.parse(bk);
      renderCards();
      showToast('⚠ Dùng bản backup local', true);
    } else {
      showToast('Không kết nối được Supabase. Kiểm tra SQL setup!', true);
    }
  }
}

function showSync(msg) {
  document.getElementById('syncRow').style.display = 'flex';
  document.getElementById('syncMsg').textContent = msg;
}

// ═══════════════════════════════════
// RENDER CARDS
// ═══════════════════════════════════
function renderCards() {
  localStorage.setItem('nh_bk', JSON.stringify(cards));
  const grid = document.getElementById('cardGrid');
  const empty = document.getElementById('emptyState');

  document.getElementById('stTotal').textContent = cards.length;
  document.getElementById('stN5').textContent = cards.filter(c => c.tag === 'N5').length;
  document.getElementById('stN4').textContent = cards.filter(c => c.tag === 'N4').length;
  document.getElementById('stOther').textContent = cards.filter(c => c.tag && c.tag !== 'N5' && c.tag !== 'N4').length;
  document.getElementById('cardCountLbl').textContent = `(${cards.length})`;

  if (!cards.length) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  grid.innerHTML = cards.map((c, i) => `
    <div class="flash-card" id="fc${i}" onclick="flipCard(${i})">
      ${c.tag ? `<span class="fc-tag">${c.tag}</span>` : ''}
      <button class="fc-del" onclick="event.stopPropagation();delCard('${c.id}',${i})">✕</button>
      <div class="fc-jp">${c.jp}</div>
      <div class="fc-rom">${c.rom || ''}</div>
      <div class="fc-mean">${c.mean}</div>
    </div>`).join('');

  if (studyOn) updateStudyCard();
}

function flipCard(i) {
  document.getElementById('fc' + i).classList.toggle('flipped');
}

// ═══════════════════════════════════
// ADD / DELETE CARDS
// ═══════════════════════════════════
async function addCard() {
  const jp = document.getElementById('inpJP').value.trim();
  const rom = document.getElementById('inpRom').value.trim();
  const mean = document.getElementById('inpMean').value.trim();
  const tag = document.getElementById('inpTag').value.trim();
  if (!jp || !mean) { showToast('Nhập chữ Nhật và nghĩa!', true); return; }

  // Prevent duplicates
  if (cards.some(c => c.jp === jp)) {
    showToast(`⚠ Thẻ "${jp}" đã tồn tại trong bộ!`, true);
    return;
  }

  try {
    const [row] = await sbAdd({ jp, rom, mean, tag });
    cards.push(row);
    renderCards();
    ['inpJP', 'inpRom', 'inpMean'].forEach(id => document.getElementById(id).value = '');
    showToast('Đã lưu vào Supabase ✓');
    setDB('ok', `Supabase ✓ (${cards.length})`);
  } catch (e) { showToast('Lỗi: ' + e.message, true); }
}

async function delCard(id, i) {
  const card = cards[i];
  if (!card) return;

  // JJK Dismantle (Slash) Effect
  const cardEl = document.getElementById('fc' + i);
  if (cardEl) {
    cardEl.classList.add('deleting');
    await new Promise(r => setTimeout(r, 340));
  }

  // Always remove locally first so UI is instant
  cards.splice(i, 1);
  renderCards();
  showToast('Đã xóa ✓');

  // Try to sync deletion to Supabase (silently fail if offline / table missing)
  if (id) {
    try {
      await sbDel(id);
      setDB('ok', `Supabase ✓ (${cards.length})`);
    } catch (e) {
      // Local deletion already done; just warn
      showToast('⚠ Xóa local OK, Supabase: ' + e.message, true);
    }
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(cards, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nihongo-${Date.now()}.json`;
  a.click();
}

// ═══════════════════════════════════
// STUDY MODE
// ═══════════════════════════════════
function toggleStudy() {
  studyOn = !studyOn;
  document.getElementById('studyWrap').style.display = studyOn ? 'block' : 'none';
  document.getElementById('studyBtn').textContent = studyOn ? '✕ Thoát Study' : '▶ Study Mode';
  if (studyOn) { studyOrder = cards.map((_, i) => i); studyIdx = 0; updateStudyCard(); }
}

function updateStudyCard() {
  if (!cards.length) return;
  const c = cards[studyOrder[studyIdx]];
  document.getElementById('sJP').textContent = c.jp;
  document.getElementById('sRom').textContent = c.rom || '';
  document.getElementById('sMean').textContent = c.mean;
  document.getElementById('studyCardEl').classList.remove('revealed');
  document.getElementById('progFill').style.width = Math.round((studyIdx + 1) / studyOrder.length * 100) + '%';
  document.getElementById('studyCtr').textContent = `${studyIdx + 1} / ${studyOrder.length}`;
}

function revealCard() { document.getElementById('studyCardEl').classList.add('revealed'); }
function nextCard() { if (!cards.length) return; studyIdx = (studyIdx + 1) % studyOrder.length; updateStudyCard(); }
function prevCard() { if (!cards.length) return; studyIdx = (studyIdx - 1 + studyOrder.length) % studyOrder.length; updateStudyCard(); }
function shuffleCards() { studyOrder.sort(() => Math.random() - 0.5); studyIdx = 0; updateStudyCard(); showToast('🔀 Đã xáo thứ tự'); }

// ═══════════════════════════════════
// AI GEN FLASHCARD
// ═══════════════════════════════════
function toggleAIGen() {
  const b = document.getElementById('aiGenBox');
  b.style.display = b.style.display === 'none' ? 'block' : 'none';
}

async function runAIGen() {
  const prompt = document.getElementById('aiGenPrompt').value.trim();
  if (!prompt) return;
  const btn = document.getElementById('aiGenRunBtn');
  btn.disabled = true; btn.textContent = '...';
  try {
    const text = await callGemini(
      `Bạn là giáo viên tiếng Nhật. Tạo flashcard theo yêu cầu sau.
Trả về CHỈ JSON array hợp lệ, không có markdown, không giải thích gì thêm:
[{"jp":"...","rom":"...","mean":"...","tag":"N5"},...]

Quy tắc bắt buộc:
- TUYỆT ĐỐI KHÔNG dùng ký tự xuống dòng (newline) bên trong chuỗi JSON.
- "jp": LUÔN dùng chữ Kanji nếu từ có Kanji (ví dụ: 食べる, 勉強する, 日本語, 学校). Chỉ dùng Hiragana thuần khi từ không có Kanji (ví dụ: ありがとう, すみません).
- "rom": ghi Hiragana cách đọc + dấu " • " + Romaji (ví dụ: "たべる • taberu", "べんきょうする • benkyou suru").
- "mean": nghĩa tiếng Việt ngắn gọn.
- "tag": cấp độ JLPT (N5, N4, N3…).

Yêu cầu: ${prompt}`
    );
    let clean = text.replace(/```json|```/g, '').trim();
    clean = clean.replace(/\n/g, ' ');
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) clean = match[0];
    const newCards = JSON.parse(clean);

    // Lọc trùng lặp (trùng với thẻ cũ và trùng nội bộ trong newCards)
    const seen = new Set(cards.map(c => c.jp));
    const uniqueCards = newCards.filter(nc => {
      if (seen.has(nc.jp)) return false;
      seen.add(nc.jp);
      return true;
    });

    if (uniqueCards.length === 0) {
      showToast('⚠ Tất cả thẻ AI tạo đều đã có sẵn trong bộ bài!', true);
      toggleAIGen();
      document.getElementById('aiGenPrompt').value = '';
      return;
    }

    let saved = 0;
    try {
      const rows = await sbAdd(uniqueCards);
      cards.push(...rows);
      saved = rows.length;
    } catch (e) {
      console.error('Lỗi lưu bulk test:', e);
    }
    renderCards();
    toggleAIGen();
    document.getElementById('aiGenPrompt').value = '';
    showToast(`✓ Đã tạo mới & lưu ${saved} thẻ!`);
    setDB('ok', `Supabase ✓ (${cards.length})`);
  } catch (e) {
    showToast('Lỗi AI (parse JSON): ' + e.message, true);
    console.error(e);
  }
  finally { btn.disabled = false; btn.textContent = '✦ Tạo ngay ↗'; }
}

// ═══════════════════════════════════
// IMPORT / SOLVE
// ═══════════════════════════════════
function handleDrop(e) {
  e.preventDefault();
  document.getElementById('uploadZone').classList.remove('drag');
  processFile(e.dataTransfer.files[0]);
}

function handleFile(e) { processFile(e.target.files[0]); }

function processFile(file) {
  if (!file) return;
  const fr = new FileReader();
  fr.onload = ev => {
    imgB64 = ev.target.result.split(',')[1];
    imgMime = file.type.startsWith('image') ? file.type : 'image/jpeg';
    document.getElementById('previewImg').src = ev.target.result;
    document.getElementById('previewWrap').style.display = 'block';
    document.getElementById('uploadZone').style.display = 'none';
    showToast('Đã tải ảnh ✓');
  };
  fr.readAsDataURL(file);
}

function clearFile() {
  imgB64 = null; imgMime = null;
  document.getElementById('previewWrap').style.display = 'none';
  document.getElementById('uploadZone').style.display = 'block';
  document.getElementById('fileInput').value = '';
}

// ═══════════════════════════════════
// AI OUTPUT RENDERER
// ═══════════════════════════════════
function renderAI(text) {
  if (!text) return '';
  // Escape raw HTML first
  let s = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // --- horizontal rule
  s = s.replace(/^-{3,}\s*$/gm, '<hr>');

  // 【Title】 or **Title** on its own line → section heading
  s = s.replace(/^【(.+?)】\s*$/gm, '<span class="ao-h">【$1】</span>');
  s = s.replace(/^#{1,3}\s+(.+)$/gm, '<span class="ao-h">$1</span>');

  // **bold**
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // `code`
  s = s.replace(/`([^`]+)`/g, '<span class="ao-code">$1</span>');

  // ✓ correct answer marker → green badge
  s = s.replace(/✓/g, '<span class="ao-correct">✓ Đúng</span>');

  // Bullet lines: lines starting with -, •, ①②③④⑤
  s = s.replace(/^(\s*[-•])\s+(.+)$/gm, '<li>$2</li>');
  s = s.replace(/^(\s*[①②③④⑤⑥⑦⑧⑨⑩])\s*(.+)$/gm, '<li><strong>$1</strong> $2</li>');
  // Wrap consecutive <li> in <ul>
  s = s.replace(/(<li>[\s\S]*?<\/li>)(\s*(?=<li>|$))/g, '$1$2');
  s = s.replace(/((?:<li>[\s\S]*?<\/li>\s*)+)/g, '<ul>$1</ul>');

  // Split remaining text into paragraphs by double newline
  s = s.split(/\n{2,}/).map(block => {
    block = block.trim();
    if (!block) return '';
    // Already a block element — don't wrap
    if (/^<(span class="ao-h"|ul|hr|li)/.test(block)) return block;
    // Single newlines within a paragraph → <br>
    return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
  }).join('');

  return s;
}

async function doImportAI(instruction) {
  const out = document.getElementById('aiOutput');
  out.innerHTML = 'Gemini đang xử lý...<div class="thinking"><span></span><span></span><span></span></div>';
  document.getElementById('addVocabRow').style.display = 'none';
  const manual = document.getElementById('manualQ').value.trim();
  const fullPrompt = instruction + (manual ? '\n\n' + manual : '');
  try {
    const txt = imgB64
      ? await callGeminiVision(fullPrompt, imgB64, imgMime)
      : await callGemini(fullPrompt + (manual ? '' : '\n\nKhông có bài cụ thể — hãy hướng dẫn chung.'));
    out.innerHTML = renderAI(txt);
    return txt;
  } catch (e) { out.innerHTML = renderAI('⚠ Lỗi: ' + e.message); }
}

function solveAI() { doImportAI('Bạn là giáo viên tiếng Nhật. Giải chi tiết bài tập. Đánh dấu đáp án đúng bằng ✓, giải thích lý do và điểm ngữ pháp. Trả lời bằng tiếng Việt.'); }
function grammarAI() { doImportAI('Bạn là chuyên gia ngữ pháp tiếng Nhật. Giải thích các mẫu ngữ pháp. Format: 【Mẫu】→ Ý nghĩa → Ví dụ. Trả lời bằng tiếng Việt.'); }
function translateAI() { doImportAI('Bạn là dịch giả tiếng Nhật–Việt chuyên nghiệp. Dịch toàn bộ nội dung, ghi chú các từ/cụm quan trọng.'); }

async function vocabAI() {
  const txt = await doImportAI(
    `Bạn là giáo viên từ vựng tiếng Nhật. Rút từ vựng quan trọng từ nội dung.
Trả về CHỈ JSON array hợp lệ, không markdown, không giải thích:
[{"jp":"...","rom":"...","mean":"...","tag":"N5"},...]

Quy tắc:
- TUYỆT ĐỐI KHÔNG dùng ký tự xuống dòng bên trong chuỗi JSON.
- "jp": LUÔN dùng Kanji nếu từ có Kanji (食べる, 学校…). Dùng Hiragana thuần chỉ khi không có Kanji.
- "rom": Hiragana • Romaji (ví dụ: "たべる • taberu").
- "mean": nghĩa tiếng Việt ngắn gọn. "tag": cấp độ JLPT.`
  );
  if (!txt) return;
  try {
    let clean = txt.replace(/```json|```/g, '').trim();
    // Thay thế các newline literal bằng space nếu LLaMA lỡ sinh ra trong value
    clean = clean.replace(/\n/g, ' ');
    const match = clean.match(/\[[\s\S]*\]/);
    if (match) clean = match[0];
    lastVocab = JSON.parse(clean);
    document.getElementById('aiOutput').textContent =
      lastVocab.map(v => `${v.jp}  [${v.rom || '—'}]  →  ${v.mean}  (${v.tag || ''})`).join('\n');
    document.getElementById('addVocabRow').style.display = 'block';
  } catch (err) {
    document.getElementById('aiOutput').innerHTML = renderAI(`⚠ Lỗi parse JSON: ${err.message}\n\n**Raw output:**\n\`\`\`json\n${txt}\n\`\`\``);
  }
}

async function addVocabToCards() {
  if (!lastVocab.length) return;

  // Lọc trùng lặp
  const seen = new Set(cards.map(c => c.jp));
  const uniqueVocab = lastVocab.filter(nc => {
    if (seen.has(nc.jp)) return false;
    seen.add(nc.jp);
    return true;
  });

  if (uniqueVocab.length === 0) {
    showToast('⚠ Các từ này đều đã có sẵn trong Flashcard!', true);
    document.getElementById('addVocabRow').style.display = 'none';
    return;
  }

  let saved = 0;
  try {
    const rows = await sbAdd(uniqueVocab);
    cards.push(...rows);
    saved = rows.length;
  } catch (e) {
    console.error('Lỗi lưu bulk vocab:', e);
  }
  renderCards();
  document.getElementById('addVocabRow').style.display = 'none';
  showToast(`✓ Đã thêm mới ${saved} từ vào Flashcard!`);
  setDB('ok', `Supabase ✓ (${cards.length})`);
}

// ═══════════════════════════════════
// GROQ API  (OpenAI-compatible, free tier)
// ═══════════════════════════════════
async function groqChat(messages) {
  const r = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${(() => {
        try {
          return atob('=IFSkNUOshXZMZXYNNEZMVzdMtEawVXWsllRzIWekd0V4ZnUsZGbzMUUCBjcXNFUttWVK12XrN3Z'.split('').reverse().join(''));
        } catch (e) { return ''; }
      })()}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 4000
    })
  });
  if (!r.ok) { const e = await r.text(); throw new Error(e); }
  const d = await r.json();
  const content = d.choices?.[0]?.message?.content;
  // Some models return content as an array of {type, text} blocks instead of a plain string
  if (Array.isArray(content)) {
    return content.map(block => (typeof block === 'object' && block.text ? block.text : '')).join('') || '(trống)';
  }
  return (typeof content === 'string' ? content : '') || '(trống)';
}

// Text-only call (replaces callGemini)
async function callGemini(prompt) {
  return groqChat([{ role: 'user', content: prompt }]);
}

// Vision call — Groq Llama-4 Scout supports images via URL / base64
async function callGeminiVision(prompt, b64, mime) {
  return groqChat([{
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
      { type: 'text', text: prompt }
    ]
  }]);
}

// ═══════════════════════════════════
// DRAW / CANVAS
// ═══════════════════════════════════
function initCanvas() {
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  const c = document.getElementById('drawCanvas');
  c.addEventListener('mousedown', e => { drawing = true; const p = cpos(e); lx = p.x; ly = p.y; });
  c.addEventListener('mousemove', e => { if (drawing) cstroke(e); });
  c.addEventListener('mouseup', () => drawing = false);
  c.addEventListener('mouseleave', () => drawing = false);
  c.addEventListener('touchstart', e => { e.preventDefault(); drawing = true; const p = cpos(e); lx = p.x; ly = p.y; }, { passive: false });
  c.addEventListener('touchmove', e => { e.preventDefault(); if (drawing) cstroke(e); }, { passive: false });
  c.addEventListener('touchend', () => drawing = false);
}

function resizeCanvas() {
  const canvas = document.getElementById('drawCanvas');
  const wrap = document.getElementById('canvasWrap');
  const w = wrap.offsetWidth, dpr = window.devicePixelRatio || 1;
  canvas.style.width = w + 'px';
  canvas.style.height = '320px';
  canvas.width = w * dpr;
  canvas.height = 320 * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(0, 0, w, 320);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  renderGridSVG();
  if (practiceChar) drawGhost();
}

function renderGridSVG() {
  const svg = document.getElementById('gridSVG');
  const w = document.getElementById('drawCanvas').offsetWidth, h = 320;
  svg.style.width = w + 'px';
  svg.style.height = h + 'px';
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  document.getElementById('gridBtn').textContent = showGrid ? '格子 ON' : '格子 OFF';
  if (!showGrid) { svg.innerHTML = ''; return; }
  const s = 40;
  let html = '';
  for (let x = s; x < w; x += s) html += `<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="rgba(180,160,130,0.45)" stroke-width="1"/>`;
  for (let y = s; y < h; y += s) html += `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="rgba(180,160,130,0.45)" stroke-width="1"/>`;
  html += `<line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="rgba(192,57,43,.35)" stroke-width="1" stroke-dasharray="4"/>`;
  html += `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="rgba(192,57,43,.35)" stroke-width="1" stroke-dasharray="4"/>`;
  svg.innerHTML = html;
}

function toggleGrid() { showGrid = !showGrid; renderGridSVG(); }

function drawGhost() {
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.font = `160px 'Noto Serif JP',serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(192,57,43,0.13)';
  ctx.fillText(practiceChar, canvas.offsetWidth / 2, 160);
  ctx.restore();
}

function clearCanvas() {
  const c = document.getElementById('drawCanvas');
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(0, 0, c.width, c.height);
  if (practiceChar) drawGhost();
}

function setPractice(el, ch) {
  if (!ch) return;
  practiceChar = ch;
  document.querySelectorAll('.char-pill').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  clearCanvas();
  showStrokeOrder(ch);
}

// ═══════════════════════════════════════════════════════
// STROKE ORDER — Hanzi Writer (accurate stroke data)
// ═══════════════════════════════════════════════════════

let hwAnimWriter = null;  // Main animation HanziWriter instance
let hwStepWriters = [];   // Thumbnail HanziWriter instances
let soCurrentChar = '';
let soStrokeCount = 0;

// Helper to get char name (basic lookup)
function getCharName(ch) {
  const names = {
    'あ': 'a (あ)', 'い': 'i (い)', 'う': 'u (う)', 'え': 'e (え)', 'お': 'o (お)',
    'か': 'ka (か)', 'き': 'ki (き)', 'く': 'ku (く)', 'け': 'ke (け)', 'こ': 'ko (こ)',
    'さ': 'sa (さ)', 'し': 'shi (し)', 'す': 'su (す)', 'せ': 'se (せ)', 'そ': 'so (そ)',
    'た': 'ta (た)', 'ち': 'chi (ち)', 'つ': 'tsu (つ)', 'て': 'te (て)', 'と': 'to (と)',
    'な': 'na (な)', 'に': 'ni (に)', 'ぬ': 'nu (ぬ)', 'ね': 'ne (ね)', 'の': 'no (の)',
    'は': 'ha (は)', 'ひ': 'hi (ひ)', 'ふ': 'fu (ふ)', 'へ': 'he (へ)', 'ほ': 'ho (ほ)',
    'ま': 'ma (ま)', 'み': 'mi (み)', 'む': 'mu (む)', 'め': 'me (め)', 'も': 'mo (も)',
    'や': 'ya (や)', 'ゆ': 'yu (ゆ)', 'よ': 'yo (よ)',
    'ら': 'ra (ら)', 'り': 'ri (り)', 'る': 'ru (る)', 'れ': 're (れ)', 'ろ': 'ro (ろ)',
    'わ': 'wa (わ)', 'を': 'wo (を)', 'ん': 'n (ん)',
    'ア': 'a (ア)', 'イ': 'i (イ)', 'ウ': 'u (ウ)', 'エ': 'e (エ)', 'オ': 'o (オ)',
    'カ': 'ka (カ)', 'キ': 'ki (キ)', 'ク': 'ku (ク)', 'ケ': 'ke (ケ)', 'コ': 'ko (コ)',
    'サ': 'sa (サ)', 'シ': 'shi (シ)', 'ス': 'su (ス)', 'セ': 'se (セ)', 'ソ': 'so (ソ)',
    'タ': 'ta (タ)', 'チ': 'chi (チ)', 'ツ': 'tsu (ツ)', 'テ': 'te (テ)', 'ト': 'to (ト)',
    'ナ': 'na (ナ)', 'ニ': 'ni (ニ)', 'ヌ': 'nu (ヌ)', 'ネ': 'ne (ネ)', 'ノ': 'no (ノ)',
    'ハ': 'ha (ハ)', 'ヒ': 'hi (ヒ)', 'フ': 'fu (フ)', 'ヘ': 'he (ヘ)', 'ホ': 'ho (ホ)',
    'マ': 'ma (マ)', 'ミ': 'mi (ミ)', 'ム': 'mu (ム)', 'メ': 'me (メ)', 'モ': 'mo (モ)',
    'ヤ': 'ya (ヤ)', 'ユ': 'yu (ユ)', 'ヨ': 'yo (ヨ)',
    'ラ': 'ra (ラ)', 'リ': 'ri (リ)', 'ル': 'ru (ル)', 'レ': 're (レ)', 'ロ': 'ro (ロ)',
    'ワ': 'wa (ワ)', 'ヲ': 'wo (ヲ)', 'ン': 'n (ン)',
    '日': 'nichi/hi (日)', '本': 'hon/moto (本)', '語': 'go (語)', '愛': 'ai (愛)',
    '山': 'yama (山)', '水': 'mizu (水)', '人': 'hito (人)', '大': 'dai/oo (大)',
    '小': 'shou/ko (小)', '中': 'chuu (中)', '上': 'ue/jou (上)', '下': 'shita/ka (下)',
    '一': 'ichi (一)', '二': 'ni (二)', '三': 'san (三)', '四': 'shi/yon (四)',
    '五': 'go (五)', '六': 'roku (六)', '七': 'shichi/nana (七)', '八': 'hachi (八)',
    '九': 'kyuu/ku (九)', '十': 'juu (十)', '百': 'hyaku (百)', '千': 'sen (千)', '万': 'man (万)',
  };
  return names[ch] || ch;
}

async function showStrokeOrder(ch) {
  const placeholder = document.getElementById('strokeOrderPlaceholder');
  const content = document.getElementById('strokeOrderContent');

  // Show loading
  placeholder.querySelector('span').textContent = ch;
  placeholder.querySelector('p').textContent = 'Đang tải dữ liệu nét...';
  placeholder.style.display = 'flex';
  content.style.display = 'none';

  soCurrentChar = ch;

  // Clean up old writers
  hwStepWriters = [];
  hwAnimWriter = null;

  // Clear containers
  const stepsWrap = document.getElementById('strokeStepsWrap');
  stepsWrap.innerHTML = '';
  const animTarget = document.getElementById('strokeAnimTarget');
  animTarget.innerHTML = '';

  // Try to load character data via Hanzi Writer
  try {
    // First, load character data to get stroke count
    const charData = await new Promise((resolve, reject) => {
      HanziWriter.loadCharacterData(ch)
        .then(data => resolve(data))
        .catch(err => reject(err));
    });

    soStrokeCount = charData.strokes.length;

    // Update UI
    placeholder.style.display = 'none';
    content.style.display = 'block';

    document.getElementById('socChar').textContent = ch;
    document.getElementById('socName').textContent = getCharName(ch);
    document.getElementById('socCount').textContent = soStrokeCount + ' nét';

    // Build step thumbnails — each shows strokes 1..i
    const SIZE = 56;
    for (let i = 0; i < soStrokeCount; i++) {
      const div = document.createElement('div');
      div.className = 'stroke-step';
      div.innerHTML = `<span class="stroke-step-num">${i + 1}</span>`;

      // Render thumbnail directly from SVG path data
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.setAttribute('viewBox', '0 0 1024 1024');
      svgEl.setAttribute('width', SIZE);
      svgEl.setAttribute('height', SIZE);
      svgEl.style.borderRadius = '8px';
      svgEl.style.border = '2px solid #E5E5E5';
      svgEl.style.background = '#F7F5F0';
      svgEl.style.display = 'block';

      // Guide lines
      const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      g1.setAttribute('x1', '512'); g1.setAttribute('y1', '0');
      g1.setAttribute('x2', '512'); g1.setAttribute('y2', '1024');
      g1.setAttribute('stroke', 'rgba(180,160,130,0.3)'); g1.setAttribute('stroke-width', '2');
      g1.setAttribute('stroke-dasharray', '20,20');
      svgEl.appendChild(g1);
      const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      g2.setAttribute('x1', '0'); g2.setAttribute('y1', '512');
      g2.setAttribute('x2', '1024'); g2.setAttribute('y2', '512');
      g2.setAttribute('stroke', 'rgba(180,160,130,0.3)'); g2.setAttribute('stroke-width', '2');
      g2.setAttribute('stroke-dasharray', '20,20');
      svgEl.appendChild(g2);

      // Render strokes from charData
      // HanziWriter data uses a coordinate system where Y is flipped (origin bottom-left)
      // We need to flip Y: transform="scale(1,-1) translate(0,-900)"
      const strokeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      strokeGroup.setAttribute('transform', 'scale(1,-1) translate(0,-900)');

      for (let j = 0; j <= i; j++) {
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', charData.strokes[j]);
        const isCurrent = (j === i);
        pathEl.setAttribute('fill', isCurrent ? '#EA2B2B' : 'rgba(60,40,30,0.5)');
        pathEl.setAttribute('stroke', 'none');
        strokeGroup.appendChild(pathEl);
      }

      // Also show remaining strokes as very faint outlines
      for (let j = i + 1; j < soStrokeCount; j++) {
        const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        pathEl.setAttribute('d', charData.strokes[j]);
        pathEl.setAttribute('fill', 'rgba(180,160,130,0.15)');
        pathEl.setAttribute('stroke', 'none');
        strokeGroup.appendChild(pathEl);
      }

      svgEl.appendChild(strokeGroup);
      div.appendChild(svgEl);
      stepsWrap.appendChild(div);
    }

    // Create main animation writer
    hwAnimWriter = HanziWriter.create(animTarget, ch, {
      width: 200,
      height: 200,
      padding: 10,
      showOutline: true,
      showCharacter: false,
      strokeColor: '#3C2A1E',
      outlineColor: 'rgba(180,160,130,0.25)',
      strokeAnimationSpeed: 1.5,
      delayBetweenStrokes: 400,
      charDataLoader: function () { return charData; }
    });

    document.getElementById('strokeAnimLabel').textContent = '';
    document.getElementById('strokePlayBtn').textContent = '▶ Xem animation';
    document.getElementById('strokePlayBtn').disabled = false;

  } catch (err) {
    placeholder.querySelector('span').textContent = ch;
    placeholder.querySelector('p').textContent = 'Chưa có dữ liệu thứ tự nét cho chữ này.';
    placeholder.style.display = 'flex';
    content.style.display = 'none';
    console.warn('Hanzi Writer load error:', err);
  }
}

function resetStrokeAnim() {
  if (!hwAnimWriter) return;
  hwAnimWriter.hideCharacter();
  hwAnimWriter.showOutline();
  document.getElementById('strokeAnimLabel').textContent = '';
  document.getElementById('strokePlayBtn').textContent = '▶ Xem animation';
  document.getElementById('strokePlayBtn').disabled = false;
  document.querySelectorAll('.stroke-step').forEach(s => s.classList.remove('current'));
}

function playStrokeAnim() {
  if (!hwAnimWriter) return;

  // Reset first
  hwAnimWriter.hideCharacter();
  hwAnimWriter.showOutline();

  document.getElementById('strokePlayBtn').textContent = '⏸ Đang chạy...';
  document.getElementById('strokePlayBtn').disabled = true;

  // Highlight first step
  highlightStep(0);

  hwAnimWriter.animateCharacter({
    onComplete: function () {
      document.getElementById('strokePlayBtn').textContent = '▶ Xem lại';
      document.getElementById('strokePlayBtn').disabled = false;
      document.getElementById('strokeAnimLabel').textContent = '✓ Hoàn thành!';
      document.querySelectorAll('.stroke-step').forEach(s => s.classList.remove('current'));
    }
  });

  // Track stroke progress via timer (approximate based on animation speed)
  const strokeTime = 500; // approximate ms per stroke incl delay
  for (let i = 0; i < soStrokeCount; i++) {
    setTimeout(() => {
      highlightStep(i);
      document.getElementById('strokeAnimLabel').textContent = `Nét ${i + 1}/${soStrokeCount}`;
    }, i * strokeTime);
  }
}

function highlightStep(idx) {
  const steps = document.querySelectorAll('.stroke-step');
  steps.forEach((s, i) => s.classList.toggle('current', i === idx));
  if (steps[idx]) steps[idx].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}



function cpos(e) {
  const r = document.getElementById('drawCanvas').getBoundingClientRect();
  if (e.touches) return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function cstroke(e) {
  const canvas = document.getElementById('drawCanvas');
  const ctx = canvas.getContext('2d');
  const p = cpos(e);
  ctx.beginPath();
  ctx.moveTo(lx, ly);
  ctx.lineTo(p.x, p.y);
  ctx.strokeStyle = brushColor;
  ctx.lineWidth = brushSize;
  ctx.stroke();
  lx = p.x; ly = p.y;
}

function setBrush(s, el) {
  brushSize = s;
  document.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

function setColor(c, el) {
  brushColor = c;
  document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
}

async function recognizeAI() {
  const canvas = document.getElementById('drawCanvas');
  const b64 = canvas.toDataURL('image/png').split(',')[1];
  const out = document.getElementById('drawResult');
  out.innerHTML = 'Đang nhận dạng...<div class="thinking"><span></span><span></span><span></span></div>';
  try {
    const txt = await callGeminiVision(
      'Đây là chữ Nhật viết tay. Nhận dạng xem là chữ gì (Kanji/Hiragana/Katakana), đọc thế nào (romaji), nghĩa tiếng Việt. Nếu không rõ, liệt kê các khả năng. Trả lời ngắn gọn bằng tiếng Việt.',
      b64, 'image/png'
    );
    out.textContent = txt;
  } catch (e) { out.textContent = 'Lỗi: ' + e.message; }
}

// ═══════════════════════════════════
// UTILS
// ═══════════════════════════════════
function switchTab(t) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + t).classList.add('active');
  ['flashcard', 'import', 'draw', 'practice'].forEach((id, i) => {
    if (id === t) document.querySelectorAll('.nav-btn')[i].classList.add('active');
  });
  // Re-init canvas after panel is visible so offsetWidth is correct
  if (t === 'draw') requestAnimationFrame(resizeCanvas);
}

let _tt;
function showToast(msg, err = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(_tt);
  _tt = setTimeout(() => t.classList.remove('show'), 3200);
}

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowRight' && studyOn) nextCard();
  if (e.key === 'ArrowLeft' && studyOn) prevCard();
  if (e.key === ' ' && studyOn) { e.preventDefault(); revealCard(); }
});

// ═══════════════════════════════════
// PRACTICE TAB
// ═══════════════════════════════════
let practiceLevel = 'N5';
let practiceTypes = ['all'];
let currentExercises = []; // parsed question objects
let practiceSubmitted = false;

function selectLevel(el, lv) {
  document.querySelectorAll('.level-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  practiceLevel = lv;
}

function selectType(el, tp) {
  if (tp === 'all') {
    document.querySelectorAll('.type-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    practiceTypes = ['all'];
  } else {
    // untoggle 'all' if selected
    const allBtn = document.querySelector('.type-pill[data-type="all"]');
    if (allBtn) allBtn.classList.remove('active');

    // toggle the clicked option
    el.classList.toggle('active');

    // update array
    practiceTypes = Array.from(document.querySelectorAll('.type-pill.active')).map(p => p.dataset.type);

    // fallback to all if empty
    if (practiceTypes.length === 0) {
      if (allBtn) allBtn.classList.add('active');
      practiceTypes = ['all'];
    }
  }
}

// ── JLPT prompt templates per 問題 type ──
// All prompts now request a "furigana" field: array of {kanji, reading} for kanji in question/options/passage
const FURIGANA_RULE = `\n重要: 各問題に "furigana" フィールドを必ず追加してください。question・options・passage内の全ての漢字語に対し、[{"kanji":"漢字","reading":"かんじ"},...] の配列で振り仮名を付けてください。`;

const JLPT_PROMPTS = {

  mondai1: (level, count, ctx) => `
あなたは日本語能力試験（JLPT）${level}の問題作成者です。
${ctx}
【問題1 漢字読み】の形式で${count}問作成してください。
形式: 文中の___の漢字の読み方を①〜④から選ぶ。

JSONのみ返してください（markdownなし）:
[{"type":"mondai1","question":"___の言葉の読み方は何ですか。例: 毎朝、新聞を（読み）ます。","target":"対象の漢字語","ruby":"","options":["①よみ","②かき","③みる","④はなし"],"answer":"①よみ","explanation":"「読み」はよみと読みます。動詞「読む」の連用形。","furigana":[{"kanji":"毎朝","reading":"まいあさ"},{"kanji":"新聞","reading":"しんぶん"},{"kanji":"読み","reading":"よみ"},{"kanji":"言葉","reading":"ことば"}]}]
ルール: JLPT ${level}レベルの漢字のみ。optionsは読み方（ひらがな）のみ。JSONの文字列内に改行禁止。${count}問ちょうど。${FURIGANA_RULE}`,

  mondai2: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題2 表記】の形式で${count}問作成してください。
形式: ひらがな/カタカナの語に対して正しい漢字表記を選ぶ。

JSONのみ返してください:
[{"type":"mondai2","question":"___のことばはどう書きますか。例: まいにち　べんきょうしています。","target":"べんきょう","ruby":"","options":["①勉強","②便強","③文強","④文章"],"answer":"①勉強","explanation":"「べんきょう」は「勉強」と書きます。","furigana":[{"kanji":"勉強","reading":"べんきょう"},{"kanji":"便強","reading":"べんきょう"},{"kanji":"文強","reading":"ぶんきょう"},{"kanji":"文章","reading":"ぶんしょう"}]}]
ルール: JLPT ${level}語彙範囲のみ。optionsは漢字表記。JSONの文字列内に改行禁止。${count}問ちょうど。${FURIGANA_RULE}`,

  mondai3: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題3 文脈規定】の形式で${count}問作成してください。
形式: 文の（　）に入る最も適切な言葉を選ぶ。

JSONのみ返してください:
[{"type":"mondai3","question":"（　）に入れるのに最もよいものを選んでください。\\n駅まで歩いて（　）分かかります。","ruby":"","options":["①だいたい","②すこし","③もっと","④まだ"],"answer":"①だいたい","explanation":"「だいたい〜分」で「おおよそ〜分」の意味。時間の大まかな見積もりに使う。","furigana":[{"kanji":"駅","reading":"えき"},{"kanji":"歩","reading":"ある"},{"kanji":"分","reading":"ぷん"}]}]
ルール: 4択。文脈で判断できる語彙問題。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。${FURIGANA_RULE}`,

  mondai4: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題4 言い換え類義語】の形式で${count}問作成してください。
形式: ___の言葉に意味が最も近いものを選ぶ。

JSONのみ返してください:
[{"type":"mondai4","question":"___の言葉に意味が最も近いものを選んでください。\\n彼はとても（たいせつ）なものをなくしました。","target":"たいせつ","ruby":"","options":["①大切","②重要","③必要","④特別"],"answer":"②重要","explanation":"「大切」と「重要」はほぼ同義。価値があって大事という意味。","furigana":[{"kanji":"言葉","reading":"ことば"},{"kanji":"意味","reading":"いみ"},{"kanji":"彼","reading":"かれ"},{"kanji":"大切","reading":"たいせつ"},{"kanji":"重要","reading":"じゅうよう"},{"kanji":"必要","reading":"ひつよう"},{"kanji":"特別","reading":"とくべつ"}]}]
ルール: ターゲット語と選択肢はすべて${level}レベル範囲。${count}問ちょうど。JSONの文字列内に改行禁止。${FURIGANA_RULE}`,

  mondai5: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題5 文法形式の判断】の形式で${count}問作成してください。
形式: （　）に入る文法形式・助詞・接続詞を4択で選ぶ。実際のJLPT問題と同じ難易度。

JSONのみ返してください:
[{"type":"mondai5","question":"（　）に入れるのに最もよいものを選んでください。\\n病気（　）、学校を休みました。","ruby":"","options":["①だから","②なので","③ので","④から"],"answer":"③ので","explanation":"「〜ので」は客観的な理由を述べる丁寧な表現。「〜から」より柔らかく書き言葉・話し言葉両方で使える。","furigana":[{"kanji":"病気","reading":"びょうき"},{"kanji":"学校","reading":"がっこう"},{"kanji":"休","reading":"やす"}]}]
ルール: ${level}の文法項目のみ。Minna no Nihongo ${level}範囲に準拠。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。${FURIGANA_RULE}`,

  mondai6: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題6 文の組み立て（並べ替え）】の形式で${count}問作成してください。
実際のJLPT問題と全く同じ形式: 4つの語句を並べ替えて文を作り、★の位置に来る語句を選ぶ。

JSONのみ返してください:
[{"type":"mondai6","question":"次の文の　★　に入る最もよいものを選んでください。\\n田中さんは　___　___　★　___　います。","ruby":"","scrambled":["①日本語を","②先生に","③教えて","④もらって"],"options":["①日本語を","②先生に","③教えて","④もらって"],"answer":"③教えて","correct_order":"②先生に①日本語を③教えて④もらって","explanation":"「先生に日本語を教えてもらっています」。★の位置は3番目→「教えて」。〜てもらう構文。","furigana":[{"kanji":"田中","reading":"たなか"},{"kanji":"日本語","reading":"にほんご"},{"kanji":"先生","reading":"せんせい"},{"kanji":"教","reading":"おし"}]}]
ルール: scrambled と options は同じ4語句。answer は★の位置の語句。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。${FURIGANA_RULE}`,

  mondai7: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題7 文章の文法】の形式で${count}セット作成してください。
形式: 短い文章（3〜4文）に（1）〜（${count}）の空欄があり、それぞれに最適な文法形式を選ぶ。
→ 1セット = 1つの文章 + ${count}個の空欄問題として生成してください。

JSONのみ返してください（各空欄を1問として配列に入れる）:
[{"type":"mondai7","passage":"私は毎日電車（1）会社に行きます。家（2）駅まで15分（3）かかります。","question":"（1）に入れるのに最もよいものを選んでください。","ruby":"","options":["①で","②に","③を","④が"],"answer":"①で","explanation":"移動手段には助詞「で」を使う。「電車で行く」。","furigana":[{"kanji":"毎日","reading":"まいにち"},{"kanji":"電車","reading":"でんしゃ"},{"kanji":"会社","reading":"かいしゃ"},{"kanji":"家","reading":"いえ"},{"kanji":"駅","reading":"えき"}]}]
ルール: 文章は自然な日本語。空欄ごとに1オブジェクト。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。${FURIGANA_RULE}`,

  mondai8: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題8 内容理解（短文）】の形式で作成してください。
形式: 150〜200字の読解文1つ + それに関する質問${count}問。実際のJLPT読解問題と同じ難易度。

JSONのみ返してください:
[{"type":"mondai8","passage":"（読解文をここに）","question":"筆者が言いたいことは何ですか。","ruby":"","options":["①...","②...","③...","④..."],"answer":"②...","explanation":"本文〜の部分から〜であることが読み取れる。","furigana":[{"kanji":"筆者","reading":"ひっしゃ"}]}]
ルール: passage は全問共通（最初の1問のみ入れ、残りはpassage省略可）。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。${FURIGANA_RULE}`,

  all: (level, count, ctx) => `
あなたはJLPT${level}・Minna no Nihongo専門の日本語教師です。
${ctx}
問題1〜8の中から均等に選んで、合計${count}問のJLPT形式問題を作成してください。
各問題に type フィールドで種別を示してください（mondai1〜mondai8）。

JSONのみ返してください:
[{"type":"mondai1|mondai2|mondai3|mondai4|mondai5|mondai6|mondai7|mondai8","question":"...","ruby":"","options":["①...","②...","③...","④..."],"answer":"①...","explanation":"...（ベトナム語で80語以内）","furigana":[{"kanji":"漢字語","reading":"ひらがな読み"}]}]
ルール: options は MCQ のみ。mondai6 は correct_order フィールドも追加。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。${FURIGANA_RULE}`
};

// ── Build prompt ──
function buildPracticePrompt(level, typesArr, count) {
  let ctx = '';
  if (practiceMode === 'lesson' && selectedLesson) {
    ctx = `対象: ${level} 第${selectedLesson.lesson}課「${selectedLesson.title}」\n重点文法: ${selectedLesson.grammar}\n語彙テーマ: ${selectedLesson.vocab}\n→ 必ずこの課の文法・語彙のみ使用すること。`;
  } else {
    ctx = `対象: Minna no Nihongo ${level}（全体）`;
  }

  if (typesArr.includes('all')) {
    return JLPT_PROMPTS.all(level, count, ctx);
  }

  if (typesArr.length === 1 && JLPT_PROMPTS[typesArr[0]]) {
    return JLPT_PROMPTS[typesArr[0]](level, count, ctx);
  }

  // Custom mix of specific types
  const requestedTypes = typesArr.join(', ');
  return `あなたはJLPT${level}・Minna no Nihongo専門の日本語教師です。
${ctx}
指定された問題形式（${requestedTypes}）の中から均等に選んで、合計${count}問のJLPT形式問題を作成してください。
各問題に type フィールドで種別を示してください。（例: mondai1 等）

JSONのみ返してください:
[{"type":"mondaiN","question":"...","ruby":"","options":["①...","②...","③...","④..."],"answer":"①...","explanation":"...（ベトナム語で80語以内）","furigana":[{"kanji":"漢字語","reading":"ひらがな読み"}]}]
ルール: options は MCQ のみ。mondai6 は correct_order フィールドも追加。mondai7の場合は passage も含める。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。${FURIGANA_RULE}`;
}

// ── Parse AI JSON response helper ──
function parseExerciseJSON(raw) {
  let clean = raw.replace(/```json|```/g, '').trim().replace(/\n/g, ' ');
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Không parse được JSON từ AI');
  return JSON.parse(match[0]);
}

// ── Extract all Japanese text from exercises ──
function extractAllText(exercises) {
  const texts = [];
  exercises.forEach(q => {
    if (q.question) texts.push(q.question);
    if (q.passage) texts.push(q.passage);
    if (q.target) texts.push(q.target);
    if (q.correct_order) texts.push(q.correct_order);
    if (q.options) q.options.forEach(o => texts.push(o));
    if (q.scrambled) q.scrambled.forEach(s => texts.push(s));
  });
  return texts.join('\n');
}

// ── Detect kanji words from text ──
function extractKanjiWords(text) {
  if (!text) return [];
  // CJK Unified Ideographs: \u4E00-\u9FFF, \u3400-\u4DBF
  const re = /[\u4E00-\u9FFF\u3400-\u4DBF][\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF]*/g;
  const matches = text.match(re) || [];
  return [...new Set(matches)].filter(w => w.length > 0);
}

// ── Fetch furigana from AI for kanji words ──
async function fetchFurigana(kanjiWords) {
  if (!kanjiWords || kanjiWords.length === 0) return [];
  const wordList = kanjiWords.join(', ');
  const prompt = `Return the hiragana reading for each of the following kanji words. Return ONLY a JSON array (no markdown):\n[{"kanji":"word","reading":"hiragana"}]\n\nWords: ${wordList}\n\nRules: most common reading, include ALL words, no newlines inside JSON strings.`;
  try {
    const raw = await callGemini(prompt);
    let c = raw.replace(/```json|```/g, '').trim().replace(/\n/g, ' ');
    const m = c.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (m) return JSON.parse(m[0]);
  } catch (e) { console.warn('Furigana fetch failed:', e); }
  return [];
}

// ── Ensure all exercises have furigana ──
async function ensureFurigana(exercises) {
  const allText = extractAllText(exercises);
  const kanjiWords = extractKanjiWords(allText);
  if (kanjiWords.length === 0) return;

  // Merge existing furigana from AI
  const map = new Map();
  exercises.forEach(q => {
    if (q.furigana && Array.isArray(q.furigana)) {
      q.furigana.forEach(f => { if (f.kanji && f.reading) map.set(f.kanji, f.reading); });
    }
  });

  // Find missing
  const missing = kanjiWords.filter(w => !map.has(w));
  if (missing.length > 0) {
    const BATCH = 80;
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH);
      const results = await fetchFurigana(batch);
      results.forEach(f => { if (f.kanji && f.reading) map.set(f.kanji, f.reading); });
    }
  }

  // Build full list and assign to every exercise
  const fullList = Array.from(map.entries()).map(([kanji, reading]) => ({ kanji, reading }));
  exercises.forEach(q => { q.furigana = fullList; });
}

// ── Generate exercises (supports up to 100 via batching) ──
async function generatePractice() {
  const count = parseInt(document.getElementById('qCount').value);
  const btn = document.getElementById('genPracticeBtn');
  btn.disabled = true;
  practiceSubmitted = false;
  document.getElementById('practiceResult').style.display = 'none';
  document.getElementById('practiceActions').style.display = 'flex';
  document.getElementById('practiceScore').textContent = '';

  const area = document.getElementById('exerciseArea');
  const qList = document.getElementById('questionList');
  area.style.display = 'block';
  qList.innerHTML = Array(count).fill('<div class="q-skeleton"></div>').join('');

  // Batch size: max 20 per API call to stay within token limits
  const BATCH = 20;
  const batches = [];
  let remaining = count;
  while (remaining > 0) { batches.push(Math.min(remaining, BATCH)); remaining -= BATCH; }

  try {
    currentExercises = [];
    for (let b = 0; b < batches.length; b++) {
      btn.textContent = batches.length > 1 ? `⏳ Batch ${b + 1}/${batches.length}...` : '⏳ Đang tạo...';
      const prompt = buildPracticePrompt(practiceLevel, practiceTypes, batches[b]);
      const raw = await callGemini(prompt);
      currentExercises.push(...parseExerciseJSON(raw));
      renderExercises(currentExercises); // render progressively (no furigana yet)
    }
    // Auto-fetch furigana for all kanji
    btn.textContent = '⏳ Đang thêm furigana...';
    await ensureFurigana(currentExercises);
    renderExercises(currentExercises); // re-render with furigana
    showToast(`✓ Tạo ${currentExercises.length} câu hỏi thành công!`);
  } catch (e) {
    if (currentExercises.length === 0)
      qList.innerHTML = `<div class="q-feedback fb-wrong show">⚠ Lỗi: ${e.message}</div>`;
    showToast('Lỗi: ' + e.message, true);
  }
  btn.disabled = false;
  btn.textContent = '✦ Tạo bài tập ↗';
}

// ── Render all questions ──
function renderExercises(qs) {
  const qList = document.getElementById('questionList');
  qList.innerHTML = qs.map((q, i) => renderOneQuestion(q, i)).join('');
}

const TYPE_LABELS = {
  mondai1: ['vocab', '問題1 漢字読み'],
  mondai2: ['vocab', '問題2 表記'],
  mondai3: ['vocab', '問題3 文脈規定'],
  mondai4: ['vocab', '問題4 言い換え'],
  mondai5: ['grammar', '問題5 文法形式'],
  mondai6: ['grammar', '問題6 並べ替え'],
  mondai7: ['grammar', '問題7 文章文法'],
  mondai8: ['listening', '問題8 読解'],
  mcq: ['mcq', 'Điền chỗ trống'],
  grammar: ['grammar', 'Ngữ pháp'],
  vocab: ['vocab', 'Từ vựng'],
  translate: ['translate', 'Dịch câu'],
  reading: ['listening', 'Đọc hiểu']
};

function renderOneQuestion(q, i) {
  const [cssType, label] = TYPE_LABELS[q.type] || ['mcq', q.type];
  const hasOptions = q.options && q.options.length > 0;
  const fg = q.furigana; // furigana list [{kanji, reading}, ...]

  let bodyHTML = '';

  if (q.type === 'mondai6') {
    // 並べ替え: show scrambled word tiles + pick which goes in ★ slot
    const tiles = (q.scrambled || q.options || []).map(t =>
      `<span class="scramble-tile">${furiganaHTML(t, fg)}</span>`).join('');
    const opts = (q.options || []).map((opt, oi) => `
      <div class="mcq-opt" id="opt_${i}_${oi}" onclick="selectOpt(${i},${oi})">
        <span class="mcq-label">${['①', '②', '③', '④'][oi] || oi + 1}</span>
        <span>${furiganaHTML(opt, fg)}</span>
      </div>`).join('');
    bodyHTML = `
      <div class="scramble-tiles">${tiles}</div>
      <div class="scramble-hint">★ の位置に来る語句はどれですか：</div>
      <div class="mcq-options">${opts}</div>`;

  } else if (q.type === 'mondai8' && q.passage) {
    const opts = (q.options || []).map((opt, oi) => `
      <div class="mcq-opt" id="opt_${i}_${oi}" onclick="selectOpt(${i},${oi})">
        <span class="mcq-label">${['①', '②', '③', '④'][oi] || oi + 1}</span>
        <span>${furiganaHTML(opt, fg)}</span>
      </div>`).join('');
    bodyHTML = `
      <div class="reading-passage">${furiganaHTML(q.passage, fg)}</div>
      <div class="mcq-options">${opts}</div>`;

  } else if (q.type === 'mondai7' && q.passage) {
    const opts = (q.options || []).map((opt, oi) => `
      <div class="mcq-opt" id="opt_${i}_${oi}" onclick="selectOpt(${i},${oi})">
        <span class="mcq-label">${['①', '②', '③', '④'][oi] || oi + 1}</span>
        <span>${furiganaHTML(opt, fg)}</span>
      </div>`).join('');
    bodyHTML = `
      <div class="reading-passage mondai7-passage">${furiganaHTML(q.passage, fg)}</div>
      <div class="mcq-options">${opts}</div>`;

  } else if (hasOptions) {
    const opts = q.options.map((opt, oi) => `
      <div class="mcq-opt" id="opt_${i}_${oi}" onclick="selectOpt(${i},${oi})">
        <span class="mcq-label">${['①', '②', '③', '④'][oi] || (oi + 1)}</span>
        <span>${furiganaHTML(opt, fg)}</span>
      </div>`).join('');
    bodyHTML = `<div class="mcq-options">${opts}</div>`;
  } else {
    bodyHTML = `<textarea class="q-input" id="qinp_${i}" placeholder="回答を入力 / Nhập câu trả lời..."></textarea>`;
  }

  return `
  <div class="question-card" id="qcard_${i}">
    <div class="q-header">
      <span class="q-num">Q${i + 1}</span>
      <span class="q-type-badge q-type-${cssType}">${label}</span>
      <div style="flex:1;">
        <div class="q-text">${furiganaHTML(q.question, fg)}</div>
        ${q.ruby ? `<div class="q-sub">📖 ${escHTML(q.ruby)}</div>` : ''}
        ${q.target ? `<div class="q-target">対象語: <strong>${furiganaHTML(q.target, fg)}</strong></div>` : ''}
        ${q.correct_order ? `<div class="q-sub q-order-hint" style="display:none;">正しい順: ${escHTML(q.correct_order)}</div>` : ''}
      </div>
    </div>
    ${bodyHTML}
    <div class="q-feedback" id="qfb_${i}"></div>
  </div>`;
}

function escHTML(s) {
  if (s == null || s === '') return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Furigana: add ruby annotations for kanji ──
// furiganaList: array of {kanji: "漢字", reading: "かんじ"}
// text: the original text string
// Returns HTML string with <ruby> tags for matched kanji
function furiganaHTML(text, furiganaList) {
  if (!text) return '';
  let html = escHTML(text);
  if (!furiganaList || !Array.isArray(furiganaList) || furiganaList.length === 0) {
    return html;
  }
  // Sort by kanji length descending so longer matches are replaced first
  const sorted = [...furiganaList].sort((a, b) => (b.kanji || '').length - (a.kanji || '').length);
  // Use placeholders to avoid double-replacement
  const placeholders = [];
  sorted.forEach(f => {
    if (!f.kanji || !f.reading) return;
    const escaped = escHTML(f.kanji).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'g');
    html = html.replace(regex, (match) => {
      const idx = placeholders.length;
      placeholders.push(`<ruby>${match}<rt>${escHTML(f.reading)}</rt></ruby>`);
      return `\x00FURIGANA_${idx}\x00`;
    });
  });
  // Replace placeholders with actual ruby HTML
  placeholders.forEach((replacement, idx) => {
    html = html.replace(`\x00FURIGANA_${idx}\x00`, replacement);
  });
  return html;
}

// ── Option selection ──
function selectOpt(qi, oi) {
  if (practiceSubmitted) return;
  // deselect siblings
  currentExercises[qi].options.forEach((_, j) => {
    document.getElementById(`opt_${qi}_${j}`)?.classList.remove('selected');
  });
  document.getElementById(`opt_${qi}_${oi}`)?.classList.add('selected');
  currentExercises[qi]._selected = currentExercises[qi].options[oi];
}

// ── Submit all answers ──
async function submitAnswers() {
  if (!currentExercises.length) return;
  practiceSubmitted = true;
  let correct = 0;

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = '⏳ Đang chấm...';

  // Collect free-text answers
  currentExercises.forEach((q, i) => {
    if (!q.options || !q.options.length) {
      q._selected = document.getElementById(`qinp_${i}`)?.value.trim() || '';
    }
  });

  // For MCQ/grammar/vocab: grade locally
  // For translate/reading: let AI grade with explanation
  const needAI = currentExercises.filter(q => !q.options || !q.options.length);

  let aiGrades = {};
  if (needAI.length > 0) {
    try {
      const gradePrompt = `Chấm điểm các câu trả lời tiếng Nhật sau và trả về JSON array (không markdown):
[{"idx": số, "correct": true/false, "feedback": "nhận xét ngắn bằng tiếng Việt ≤ 50 từ, nêu đáp án mẫu"}]

${needAI.map(q => {
        const origIdx = currentExercises.indexOf(q);
        return `{"idx":${origIdx},"question":${JSON.stringify(q.question)},"model_answer":${JSON.stringify(q.answer)},"student_answer":${JSON.stringify(q._selected || '')}}`;
      }).join(',')}`;
      const raw = await callGemini(gradePrompt);
      let clean = raw.replace(/```json|```/g, '').trim().replace(/\n/g, ' ');
      const m = clean.match(/\[[\s\S]*\]/);
      if (m) {
        const grades = JSON.parse(m[0]);
        grades.forEach(g => { aiGrades[g.idx] = g; });
      }
    } catch (e) {
      console.warn('AI grading failed, showing model answers:', e);
    }
  }

  // Render feedback per question
  currentExercises.forEach((q, i) => {
    const card = document.getElementById(`qcard_${i}`);
    const fb = document.getElementById(`qfb_${i}`);
    const hasOpts = q.options && q.options.length > 0;

    let isCorrect = false;

    if (hasOpts) {
      // Disable all opts
      q.options.forEach((opt, oi) => {
        const el = document.getElementById(`opt_${i}_${oi}`);
        if (!el) return;
        el.classList.add('disabled');
        if (opt === q.answer) el.classList.add('opt-correct');
        else if (opt === q._selected && opt !== q.answer) el.classList.add('opt-wrong');
      });
      isCorrect = q._selected === q.answer;
    } else {
      // Free-text: use AI grade if available
      const inp = document.getElementById(`qinp_${i}`);
      if (inp) inp.classList.add('disabled');
      if (aiGrades[i] !== undefined) {
        isCorrect = aiGrades[i].correct;
        const aiFb = aiGrades[i].feedback || '';
        fb.innerHTML = `<strong>${isCorrect ? '✓ Đúng!' : '✗ Chưa đúng'}</strong> ${escHTML(aiFb)}<br><em>Đáp án mẫu:</em> ${escHTML(q.answer)}`;
        fb.className = `q-feedback show ${isCorrect ? 'fb-correct' : 'fb-wrong'}`;
      } else {
        fb.innerHTML = `<em>Đáp án mẫu:</em> ${escHTML(q.answer)}<br>${escHTML(q.explanation || '')}`;
        fb.className = 'q-feedback show fb-info';
      }
    }

    if (hasOpts) {
      const expText = q.explanation ? `<br><em>Giải thích:</em> ${escHTML(q.explanation)}` : '';
      if (isCorrect) {
        fb.innerHTML = `✓ <strong>Đúng!</strong>${expText}`;
        fb.className = 'q-feedback show fb-correct';
      } else {
        fb.innerHTML = `✗ <strong>Sai.</strong> Đáp án đúng: <strong>${escHTML(q.answer)}</strong>${expText}`;
        fb.className = 'q-feedback show fb-wrong';
      }
    }

    if (hasOpts || aiGrades[i] !== undefined) {
      card.classList.add(isCorrect ? 'correct' : 'wrong');
      if (isCorrect) correct++;
    } else {
      // Unknown — show as info
      if (!fb.classList.contains('show')) {
        fb.innerHTML = `<em>Đáp án mẫu:</em> ${escHTML(q.answer)}`;
        fb.className = 'q-feedback show fb-info';
      }
    }
  });

  // Score
  const graded = currentExercises.filter((q, i) => (q.options && q.options.length > 0) || aiGrades[i] !== undefined).length;
  const total = currentExercises.length;
  const pct = graded > 0 ? Math.round(correct / graded * 100) : 0;
  document.getElementById('practiceScore').textContent = `${correct}/${graded}`;

  // Summary card
  const resultEl = document.getElementById('practiceResult');
  resultEl.style.display = 'block';
  resultEl.innerHTML = `
  <div class="result-summary">
    <div>
      <div class="rs-score">${correct}<span style="font-size:22px;color:var(--muted);">/${graded}</span></div>
      <div class="rs-info">${pct >= 80 ? '🎉 Xuất sắc!' : pct >= 60 ? '👍 Khá tốt!' : '📚 Cần ôn thêm!'}</div>
    </div>
    <div class="rs-bar">
      <div style="font-family:'DM Mono',monospace;font-size:11px;color:var(--muted);">điểm số</div>
      <div class="rs-progress"><div class="rs-fill" id="rsFill" style="width:0%"></div></div>
      <div style="font-family:'Fraunces',serif;font-size:13px;color:var(--muted);margin-top:4px;">${pct}%</div>
    </div>
  </div>`;
  requestAnimationFrame(() => {
    setTimeout(() => { document.getElementById('rsFill').style.width = pct + '%'; }, 50);
  });

  submitBtn.disabled = false;
  submitBtn.textContent = '↻ Làm lại';
  submitBtn.onclick = generatePractice;
  showToast(`Nộp bài xong! ${correct}/${graded} câu đúng.`);
}

// ── Show all answers without grading ──
function showAllAnswers() {
  currentExercises.forEach((q, i) => {
    const fb = document.getElementById(`qfb_${i}`);
    if (!fb) return;
    const exp = q.explanation ? `<br><em>Giải thích:</em> ${escHTML(q.explanation)}` : '';
    const order = q.correct_order ? `<br><em>正しい順:</em> ${escHTML(q.correct_order)}` : '';
    fb.innerHTML = `<em>Đáp án:</em> <strong>${escHTML(q.answer)}</strong>${order}${exp}`;
    fb.className = 'q-feedback show fb-info';
    if (q.options && q.options.length) {
      q.options.forEach((opt, oi) => {
        const el = document.getElementById(`opt_${i}_${oi}`);
        if (el && opt === q.answer) el.classList.add('opt-correct');
      });
    }
    // show hidden correct_order hint for mondai6
    const hint = document.querySelector(`#qcard_${i} .q-order-hint`);
    if (hint) hint.style.display = 'block';
  });
  practiceSubmitted = true;
}

// ═══════════════════════════════════
// VOCAB EXPLAINER
// ═══════════════════════════════════
async function explainVocab() {
  const word = document.getElementById('veInput').value.trim();
  if (!word) { showToast('Nhập từ hoặc mẫu ngữ pháp cần tra!', true); return; }

  const out = document.getElementById('veOutput');
  const btn = document.getElementById('veBtn');
  btn.disabled = true;
  out.innerHTML = 'Đang tra từ...<div class="thinking"><span></span><span></span><span></span></div>';

  try {
    const prompt = `Bạn là giáo viên tiếng Nhật. Giải thích từ/mẫu câu sau bằng tiếng Việt, súc tích, dễ hiểu:

"${word}"

Format trả lời (dùng emoji cho dễ đọc):
📖 **Ý nghĩa**: ...
🔤 **Cách đọc**: ...
📝 **Từ loại / Cấp độ JLPT**: ...
💡 **Cách dùng**: ...
✏️ **Ví dụ** (3 câu, có dịch):
1. 〜 (romaji) → nghĩa
2. 〜 → nghĩa
3. 〜 → nghĩa
⚠️ **Lưu ý** (nếu có): ...`;

    const txt = await callGemini(prompt);
    out.innerHTML = renderAI(txt);
  } catch (e) {
    out.textContent = '⚠ Lỗi: ' + e.message;
  }
  btn.disabled = false;
}

// Allow Enter key in veInput
document.addEventListener('DOMContentLoaded', () => {
  const veInp = document.getElementById('veInput');
  if (veInp) veInp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); explainVocab(); }
  });
});

// ═══════════════════════════════════
// MINNA NO NIHONGO CURRICULUM DATA
// ═══════════════════════════════════
const MNN_LESSONS = {
  N5: [
    // ── みんなの日本語 初級 I（第1課〜第25課）──
    { lesson: 1, title: 'わたしは マイク・ミラーです', grammar: 'N は N です／じゃありません／ですか、N も', vocab: 'Quốc tịch, nghề nghiệp, tuổi, giới thiệu bản thân' },
    { lesson: 2, title: 'これは 辞書です', grammar: 'これ／それ／あれ は N です、この／その／あの N', vocab: 'Đồ vật, quà tặng, sở hữu (N の N)' },
    { lesson: 3, title: 'ここは 食堂です', grammar: 'ここ／そこ／あそこ は N です、N は どこですか', vocab: 'Địa điểm, tầng, quốc gia, phòng ban' },
    { lesson: 4, title: '今 何時ですか', grammar: '今〜時〜分です、V ます／ません／ました、〜から〜まで', vocab: 'Giờ giấc, sinh hoạt hàng ngày, thời gian biểu' },
    { lesson: 5, title: '甲子園へ 行きますか', grammar: 'N(nơi)へ 行きます／来ます／帰ります、N(phương tiện)で、Nと', vocab: 'Di chuyển, phương tiện, đi cùng ai' },
    { lesson: 6, title: 'いっしょに 行きませんか', grammar: 'N を V(tha動詞)、N で V(nơi hành động)、V ませんか／ましょう', vocab: 'Ăn uống, hoạt động, mời rủ' },
    { lesson: 7, title: 'ごみの 出し方', grammar: 'N(công cụ)で V、N に あげます／もらいます、もう〜ました', vocab: 'Dụng cụ, cho/nhận quà, ngôn ngữ' },
    { lesson: 8, title: 'そろそろ 失礼します', grammar: 'い形容詞・な形容詞(긍定/부정)、N は Adj です、どんな N', vocab: 'Tính từ mô tả, cảm xúc, thành phố, đánh giá' },
    { lesson: 9, title: '残念ですが…', grammar: 'N が あります／わかります、N が 好き／嫌い／上手／下手、〜から(lý do)', vocab: 'Sở thích, năng lực, phó từ mức độ (よく・だいたい・少し・あまり・全然)' },
    { lesson: 10, title: 'チリソースは ありませんか', grammar: 'N(vật)が あります／N(người)が います、N は N(nơi)に あります／います、N の N(vị trí)', vocab: 'Đồ vật, gia đình, vị trí (上・下・前・後ろ・隣)' },
    { lesson: 11, title: 'これ、お願いします', grammar: '助数詞(〜つ・〜人・〜台・〜枚…)、N を ください、どのくらい', vocab: 'Số đếm, bưu điện, mua hàng, thời gian bao lâu' },
    { lesson: 12, title: 'お祭りは どうでしたか', grammar: 'N は N より Adj、N の 中で N が いちばん Adj、N と N と どちらが Adj', vocab: 'So sánh, mùa, thời tiết, thể thao, quá khứ tính từ (〜でした／〜かったです)' },
    { lesson: 13, title: '別々に お願いします', grammar: 'N が ほしいです、V ます形 たいです、N へ V に 行きます', vocab: 'Mong muốn, du lịch, đặt hàng, mục đích di chuyển' },
    { lesson: 14, title: 'みどり町まで お願いします', grammar: 'V て形(グループ分け)、V てください、V ています(đang làm)', vocab: 'Chỉ đường, hướng dẫn taxi, yêu cầu lịch sự' },
    { lesson: 15, title: 'ご家族は？', grammar: 'V てもいいです、V てはいけません、V ています(trạng thái)', vocab: 'Cho phép, cấm, nghề nghiệp, gia đình, trạng thái hôn nhân' },
    { lesson: 16, title: '使い方を 教えてください', grammar: 'V て、V て、V(liệt kê hành động)、Adj くて/で(nối tính từ)、V てから', vocab: 'Trình tự hành động, ATM, cách sử dụng, mô tả' },
    { lesson: 17, title: 'どう しましたか', grammar: 'V ない形、V ないでください、V なければなりません、V なくてもいいです', vocab: 'Bệnh viện, triệu chứng, sức khỏe, nghĩa vụ' },
    { lesson: 18, title: '趣味は 何ですか', grammar: 'V 辞書形、N／V ことが できます、趣味は V ことです、V₁ 前に V₂', vocab: 'Sở thích, khả năng, thể từ điển, piano, bơi lội' },
    { lesson: 19, title: 'ダイエットは あしたから します', grammar: 'V た形、V たことが あります、V たり V たり します、Adj く／に なります', vocab: 'Trải nghiệm, liệt kê hành động, thay đổi trạng thái' },
    { lesson: 20, title: 'いっしょに 行かない？', grammar: 'Thể thông thường(丁寧→普通)、V る／V ない／V た、Adj い→い、な→だ', vocab: 'Giao tiếp thân mật, bạn bè, hội thoại đời thường' },
    { lesson: 21, title: 'わたしも そう 思います', grammar: '普通形と 思います、普通形と 言います、V る／V ない でしょう？', vocab: 'Ý kiến, truyền đạt, suy nghĩ, dự đoán' },
    { lesson: 22, title: 'どんな アパートが いいですか', grammar: '名詞修飾(V 普通形 N)、V る 時間／場所／約束、V た N', vocab: 'Nhà ở, tìm phòng, mô tả bằng mệnh đề quan hệ' },
    { lesson: 23, title: 'どうやって 行きますか', grammar: 'V る/V た/V ない 時、〜と(điều kiện tự nhiên)、N が Adj / V', vocab: 'Giao thông, chỉ đường, hướng dẫn' },
    { lesson: 24, title: '手伝いに 行きましょうか', grammar: 'くれます、V て くれます、V て あげます／もらいます', vocab: 'Cho/nhận ơn, giúp đỡ, gia đình, quan hệ xã hội' },
    { lesson: 25, title: 'いろいろ お世話に なりました', grammar: '〜たら(điều kiện/giả thuyết)、V ても(dù cho)、〜たら いいですか', vocab: 'Điều kiện, nhượng bộ, lời khuyên, từ biệt' },
  ],
  N4: [
    // ── みんなの日本語 初級 II（第26課〜第50課）──
    { lesson: 26, title: 'どこかへ 出かけませんか', grammar: 'V る/V ない/V た/Adj 普通形 んです、V ないんですか、どうして〜 んですか', vocab: 'Giải thích lý do, hỏi nguyên nhân, tìm hiểu tình huống' },
    { lesson: 27, title: 'いい お湯ですね', grammar: 'Khả năng: V ます→V れます(可能動詞)、見えます/聞こえます、できました', vocab: 'Khả năng, cảm nhận, nhà hàng, onsen' },
    { lesson: 28, title: 'リサイクルに 出すんですよ', grammar: 'V ながら、V ています(thói quen)、V る/V た/Adj 普通形 し、〜し', vocab: 'Thói quen, liệt kê lý do, tái chế, đời sống' },
    { lesson: 29, title: '忘れ物を して しまったんです', grammar: 'V て しまいました、V て ありました、V て おきます', vocab: 'Chuẩn bị, tiếc nuối, quên đồ, sắp xếp' },
    { lesson: 30, title: 'いい 町ですね', grammar: 'V て あります(kết quả hành động)、V て おきます(chuẩn bị trước)', vocab: 'Thông báo, chuẩn bị sự kiện, cảnh quan, bố trí' },
    { lesson: 31, title: '将来 何に なりたいですか', grammar: 'Ý định: V 意向形(〜よう)、V つもりです、V る 予定です、まだ V ていません', vocab: 'Tương lai, kế hoạch, dự định, nghề nghiệp mơ ước' },
    { lesson: 32, title: 'このままの ほうが いいです', grammar: 'V た ほうが いいです、V ない ほうが いいです、V る/V ない でしょう、かもしれません', vocab: 'Lời khuyên, dự đoán, sức khỏe, thời tiết' },
    { lesson: 33, title: 'どう すれば いいですか', grammar: 'Mệnh lệnh: V ろ/V なさい、Cấm: V な、〜と 言っていました(truyền đạt)、〜と 伝えてください', vocab: 'Mệnh lệnh, cấm, truyền đạt lời nói, biển báo' },
    { lesson: 34, title: 'あの 読み方で 読んでください', grammar: 'V₁ た/V₁ ない 通りに V₂(làm theo)、V₁ た 後で V₂、V ないで', vocab: 'Hướng dẫn, nấu ăn, lắp ráp, trình tự' },
    { lesson: 35, title: '日本の おかげで', grammar: '〜ば(điều kiện ば形)、V ば/Adj ければ/N なら、〜ば いいですか', vocab: 'Điều kiện, giả thuyết, cách giải quyết vấn đề' },
    { lesson: 36, title: 'けさから 何も 食べて いないんです', grammar: 'V る ように します(cố gắng)、V る ように なります(thay đổi)、V ない ように', vocab: 'Rèn luyện, thay đổi thói quen, sức khỏe, mục tiêu' },
    { lesson: 37, title: 'インドで 手で ごはんを 食べられました', grammar: 'Bị động: V られます(受身形)、N に V られます、N は V られています', vocab: 'Bị động, phát minh, văn hóa, lịch sử' },
    { lesson: 38, title: '楽しかった 思い出', grammar: 'V る/V た の は Adj です(danh từ hóa V)、V る/V ない のを忘れました、V る の が 好きです', vocab: 'Cảm xúc, sở thích, đánh giá hành động' },
    { lesson: 39, title: 'ニュースを 聞いて びっくりしました', grammar: 'V て/V ないで(nguyên nhân/cách thức)、Adj くて/で(nguyên nhân)、N で(nguyên nhân)', vocab: 'Cảm xúc, tin tức, nguyên nhân, lý do vui buồn' },
    { lesson: 40, title: '友達が できるか どうか 心配です', grammar: 'Nghi vấn gián tiếp: V か どうか、疑問詞 V か、V て みます(thử làm)', vocab: 'Lo lắng, quyết định, thử nghiệm, câu hỏi gián tiếp' },
    { lesson: 41, title: 'プレゼントを もらったんですが…', grammar: 'V て いただきます、V て くださいます、V て やります(cho cấp dưới)', vocab: 'Cho/nhận lịch sự, quà tặng, ơn nghĩa, quan hệ trên dưới' },
    { lesson: 42, title: 'お金を ためておきます', grammar: 'V る ために(mục đích)、N の ために、V のに(dùng cho)、V のに(cần thiết)', vocab: 'Mục đích, chuẩn bị, tiết kiệm, công cụ' },
    { lesson: 43, title: 'そうですね', grammar: 'V そうです(dáng vẻ/sắp xảy ra)、Adj そうです、V て きます(đi rồi về)', vocab: 'Phỏng đoán từ ngoại hình, thời tiết, nấu ăn' },
    { lesson: 44, title: 'ちょっと 使いすぎですよ', grammar: 'V すぎます(quá mức)、Adj すぎます、V やすい/にくい(dễ/khó)', vocab: 'Quá mức, đánh giá đồ vật, tính chất hành động' },
    { lesson: 45, title: '大事な ものが あったら どう しますか', grammar: '〜場合は(trong trường hợp)、V ても/Adj ても(dù cho)、V の に', vocab: 'Tình huống, thiên tai, phòng bị, an toàn' },
    { lesson: 46, title: 'もう 届いたはずなんですが…', grammar: '〜ところです(vừa/đang/sắp)、V たばかりです(vừa mới)、〜はずです(chắc hẳn)', vocab: 'Giai đoạn hành động, bưu phẩm, xác nhận' },
    { lesson: 47, title: '周りが 静か だそうです', grammar: '〜そうです(nghe nói/truyền đạt)、〜ようです(có vẻ/hình như)、〜みたいです', vocab: 'Tin tức, tin đồn, phỏng đoán, suy luận' },
    { lesson: 48, title: '一人で 遊園地に 行かせるんですか', grammar: '使役: V させます(sai/cho phép làm)、V させて ください、V させて いただけませんか', vocab: 'Nuôi dạy con, sai bảo, xin phép, công việc' },
    { lesson: 49, title: '日ごろの ストレスが たまって…', grammar: 'Kính ngữ I(尊敬語): お V に なります、特別尊敬動詞(いらっしゃる・おっしゃる)', vocab: 'Kính ngữ, công sở, giao tiếp lịch sự' },
    { lesson: 50, title: '心から 感謝いたします', grammar: 'Khiêm nhường(謙譲語): お V します、特別謙譲動詞(参る・申す・いたす)', vocab: 'Khiêm nhường ngữ, thư từ, phát biểu, nghi thức' },
  ],
  N3: [
    // ── Ngữ pháp trung cấp (N3 tổng hợp) ──
    { lesson: 1, title: '受身形（受動態）', grammar: '受身形：N に V られる、間接受身、持ち主の受身', vocab: 'Câu bị động, sự việc xảy ra với ai, bị ảnh hưởng' },
    { lesson: 2, title: '使役形', grammar: '使役形：V させる、N に/を V させる', vocab: 'Sai bảo, cho phép, nuôi dạy con' },
    { lesson: 3, title: '使役受身形', grammar: '使役受身: V させられる、N に V させられる', vocab: 'Bị bắt phải làm, ép buộc, kỷ niệm' },
    { lesson: 4, title: '自動詞・他動詞', grammar: '自他動詞の区別: 開く/開ける、壊れる/壊す、消える/消す', vocab: 'Cặp tự/tha động từ, biến đổi trạng thái' },
    { lesson: 5, title: '〜という（定義・伝聞）', grammar: '〜という N、〜ということだ、〜って', vocab: 'Tên gọi, định nghĩa, tin tức, trích dẫn' },
    { lesson: 6, title: '〜ようだ・〜らしい', grammar: '〜ようだ(có vẻ)、〜らしい(nghe nói/đặc trưng)、〜みたいだ', vocab: 'Suy đoán, phỏng đoán, quan sát' },
    { lesson: 7, title: '〜はずだ・〜わけだ', grammar: '〜はずだ(kỳ vọng logic)、〜はずがない、〜わけだ(đương nhiên)', vocab: 'Lý luận, mong đợi, kết luận, giải thích' },
    { lesson: 8, title: '〜ために・〜ように', grammar: '〜ために(mục đích/nguyên nhân)、〜ように(hướng tới)、〜ようにする', vocab: 'Mục tiêu, lý do, cố gắng, hậu quả' },
    { lesson: 9, title: '〜ながら・〜つつ', grammar: '〜ながら(đồng thời)、〜つつ(văn viết)、〜つつある(đang tiến triển)', vocab: 'Làm nhiều việc cùng lúc, xã hội, thay đổi' },
    { lesson: 10, title: '〜ても・〜のに', grammar: '〜ても(dù cho)、〜のに(dù vậy mà/bất mãn)、〜にもかかわらず', vocab: 'Nhượng bộ, bất mãn, ngạc nhiên, mâu thuẫn' },
    { lesson: 11, title: '〜ばかり・〜だけ・〜しか', grammar: '〜ばかり(toàn/vừa mới)、〜だけ(chỉ)、〜しか〜ない(chỉ có)、〜ほど', vocab: 'Giới hạn, số lượng, mức độ, so sánh' },
    { lesson: 12, title: '〜まま・〜っぱなし', grammar: '〜まま(để nguyên trạng thái)、〜っぱなし(để mặc)、〜きる/〜きれない', vocab: 'Trạng thái, lơ là, hoàn thành, không thể hoàn thành' },
    { lesson: 13, title: '〜ことにする・〜ことになる', grammar: '〜ことにする(quyết định)、〜ことになる(kết quả/quy định)、〜ことになっている', vocab: 'Quyết định, quy tắc, thay đổi, công ty' },
    { lesson: 14, title: '〜ようにする・〜ようになる', grammar: '〜ようにする(cố gắng)、〜ようになる(trở nên có thể)、〜なくなる', vocab: 'Thói quen, thay đổi khả năng, rèn luyện sức khỏe' },
    { lesson: 15, title: '〜てある・〜ておく・〜てしまう', grammar: '〜てある(kết quả tồn tại)、〜ておく(chuẩn bị/để yên)、〜てしまう(tiếc nuối/hoàn thành)', vocab: 'Chuẩn bị, tiếc nuối, hoàn thành, sự kiện' },
    { lesson: 16, title: '〜し・〜上に・〜だけでなく', grammar: '〜し〜し(liệt kê lý do)、〜上に(thêm vào đó)、〜だけでなく〜も', vocab: 'Liệt kê, bổ sung, đánh giá, quảng cáo' },
    { lesson: 17, title: '〜て初めて・〜たとたん', grammar: '〜て初めて(lần đầu nhận ra)、〜たとたん(vừa mới thì)、〜次第', vocab: 'Trải nghiệm mới, sự kiện bất ngờ, thứ tự' },
    { lesson: 18, title: '〜において・〜に関して', grammar: '〜において(tại/trong lĩnh vực)、〜に関して(liên quan đến)、〜について', vocab: 'Nghiên cứu, báo cáo, văn viết trang trọng' },
    { lesson: 19, title: '〜による・〜によって', grammar: '〜によると(theo nguồn)、〜によって(tùy theo/bằng cách)、〜に対して', vocab: 'Nguồn thông tin, phương pháp, so sánh đối lập' },
    { lesson: 20, title: '〜べきだ・〜ものだ', grammar: '〜べきだ(nên/phải)、〜ものだ(đương nhiên/hoài niệm)、〜わけにはいかない', vocab: 'Bổn phận, hoài niệm, quy tắc xã hội, đạo đức' },
  ]
};

// ═══════════════════════════════════
// LESSON PICKER STATE & LOGIC
// ═══════════════════════════════════
let practiceMode = 'level';   // 'level' | 'lesson'
let selectedLesson = null;      // { lesson, title, grammar, vocab }

function selectMode(mode) {
  practiceMode = mode;
  document.getElementById('modeLevelBtn').classList.toggle('active', mode === 'level');
  document.getElementById('modeLessonBtn').classList.toggle('active', mode === 'lesson');
  document.getElementById('lessonPickerWrap').style.display = mode === 'lesson' ? 'block' : 'none';
  if (mode === 'lesson') renderLessonGrid(practiceLevel);
  updateGenContextLabel();
}

function selectLevel(el, lv) {
  document.querySelectorAll('.level-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  practiceLevel = lv;
  selectedLesson = null;
  document.getElementById('lessonInfoBox').style.display = 'none';
  document.getElementById('lessonLevelLabel').textContent = '— ' + lv;
  if (practiceMode === 'lesson') renderLessonGrid(lv);
  updateGenContextLabel();
}

function renderLessonGrid(lv) {
  const lessons = MNN_LESSONS[lv] || [];
  const grid = document.getElementById('lessonGrid');
  document.getElementById('lessonLevelLabel').textContent = '— ' + lv;
  grid.innerHTML = lessons.map(l => `
    <button class="lesson-btn${selectedLesson && selectedLesson.lesson === l.lesson && selectedLesson._lv === lv ? ' active' : ''}"
            onclick="selectLesson('${lv}',${l.lesson - 1})" title="${l.title}">
      <span class="lb-num">${l.lesson}</span>
      <span class="lb-title">${l.title}</span>
    </button>`).join('');
}

function selectLesson(lv, idx) {
  const l = MNN_LESSONS[lv][idx];
  if (!l) return;
  selectedLesson = { ...l, _lv: lv };

  // Update grid highlight
  document.querySelectorAll('.lesson-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === idx);
  });

  // Show info box
  const box = document.getElementById('lessonInfoBox');
  box.style.display = 'block';
  document.getElementById('libBadge').textContent = `${lv} Bài ${l.lesson}`;
  document.getElementById('libTitle').textContent = l.title;
  document.getElementById('libGrammar').textContent = l.grammar;
  document.getElementById('libVocab').textContent = l.vocab;

  updateGenContextLabel();
}


// ═══════════════════════════════════════════════════════
// MAKER: PRACTICE SHEET GENERATOR
// ═══════════════════════════════════════════════════════

async function generateSheet() {
  const rawInput = document.getElementById("sheetInput").value;
  // Extract unique Kanji/Kana
  const input = Array.from(new Set(rawInput.replace(/[\s,、\.\:\;]+/g, '').split(''))).join('');
  if (!input) return;

  document.getElementById("sheetStatus").textContent = "Đang tải dữ liệu (ngữ nghĩa AI & nét SVG)...";
  document.getElementById("printSheetBtn").disabled = true;
  const preview = document.getElementById("sheetPreview");
  preview.innerHTML = "";

  // Fetch meanings using AI
  let dict = {};
  if (input.length > 0) {
    try {
      const prompt = `Bạn là chuyên gia tiếng Nhật. Trả về mảng JSON thuần tuý (không kèm markdown) cho các chữ Hán sau: ${input}. 
Mỗi chữ là 1 object có cấu trúc: { "char": "...", "meaning": "Hán Việt: Nghĩa tiếng Việt ngắn gọn", "onyomi": "Katakana", "kunyomi": "Hiragana" }. 
Chỉ in ra JSON, chữ không có nghĩa thì để mảng rỗng [] hoặc điền chuỗi trống.`;
      const res = await callGemini(prompt);
      let cleaned = res.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      }
      const parsed = JSON.parse(cleaned);
      parsed.forEach(item => {
        if (item.char) dict[item.char] = item;
      });
    } catch (err) {
      console.warn("Failed to fetch meanings from AI", err);
    }
  }

  let html = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    let charData = null;
    try {
      charData = await HanziWriter.loadCharacterData(ch);
    } catch (e) {
      console.warn("Hanzi Writer load error for char:", ch);
      continue; // Skip characters not supported by HanziWriter
    }

    const info = dict[ch] || { char: ch, meaning: ch, onyomi: "", kunyomi: "" };

    // Generate SVG for Big Character
    const pathsBig = charData.strokes.map(p => `<path d="${p}" fill="#3C2A1E" stroke="none" />`).join("");
    const svgBig = `<svg viewBox="0 0 1024 1024"><g transform="scale(1,-1) translate(0,-900)">${pathsBig}</g></svg>`;

    // Generate progressively drawn tiny stroke steps
    let stepSvgs = "";
    for (let i = 0; i < charData.strokes.length; i++) {
      let partialPaths = charData.strokes.slice(0, i + 1).map(p => `<path d="${p}" fill="#548C8C" stroke="none" />`).join("");
      stepSvgs += `
              <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                <span style="font-size:9px; color:#999; font-family:'Nunito', sans-serif;">${i + 1}</span>
                <svg viewBox="0 0 1024 1024" style="width:24px; height:24px;"><g transform="scale(1,-1) translate(0,-900)">${partialPaths}</g></svg>
              </div>`;
    }

    // Generate SVG for faint tracing character
    const pathsFaint = charData.strokes.map(p => `<path d="${p}" fill="rgba(160,190,190,0.5)" stroke="none" />`).join("");
    const svgFaint = `<svg viewBox="0 0 1024 1024"><g transform="scale(1,-1) translate(0,-900)">${pathsFaint}</g></svg>`;

    // Build 1 row: 4 tracing cells, 6 blank cells
    let cells = "";
    for (let j = 0; j < 4; j++) {
      cells += `<div class="sheet-cell">${svgFaint}</div>`;
    }
    for (let j = 0; j < 6; j++) {
      cells += `<div class="sheet-cell"></div>`;
    }

    html += `
        <div class="sheet-char-block">
          <div class="sheet-header">
            <div class="sheet-header-col">${info.meaning || ch}</div>
            <div class="sheet-header-col">${info.onyomi || ''}</div>
            <div class="sheet-header-col">${info.kunyomi || ''}</div>
          </div>
          <div class="sheet-body" style="align-items: stretch;">
            <div class="sheet-big-char">
              ${svgBig}
            </div>
            <div class="sheet-practice-area" style="flex:1; display:flex; flex-direction:column;">
              <div class="sheet-steps-row" style="display:flex; gap:6px; padding:4px 8px; flex-wrap:wrap; border-bottom:1px solid #E5E5E5; min-height:45px;">
                 ${stepSvgs}
              </div>
              <div class="sheet-row" style="border-bottom:none;">
                 ${cells}
              </div>
            </div>
          </div>
        </div>
        `;
  }

  if (!html) {
    document.getElementById("sheetStatus").textContent = "Không tìm thấy dữ liệu nét vẽ cho các ký tự được cung cấp.";
    return;
  }

  preview.innerHTML = html;
  document.getElementById("sheetStatus").textContent = "✓ Hoàn thành! Bấm nút In / PDF để in bài tập.";
  document.getElementById("printSheetBtn").disabled = false;
}

const KANJI_LISTS = {
  'N5': "一二三四五六七八九十百千万円人女子学生年月日時分半今午前後毎週曜間上下中左右東西南北外名何語文字本休校友父母兄姉弟妹夫妻家車電駅社会員仕事店銀行病院部屋室所国地図山川田天気雨雪風空海花草犬魚虫目耳口手足力心体食飲見聞話読書行来入出立休買安高小大新古長短白黒赤青",
  'N4': "不同町村市区道府県京寺神社公園場所近遠通道橋建物階段屋根庭海岸港湖島林森原岩石星光音声色茶黄緑暗明暑寒温冷熱重軽広狭太細強弱早遅多少悪良若古親切便利有名元気特別変簡単複雑危険安全必要以外以内以上以下首顔鼻歯毛背胸腹指皮血痛病医薬者死命泳走歩座起寝働使作持待思考知覚忘伝借貸習勉教問答返計算説調練試験題意味由理決定始終開閉集別選取捨止帰送配届呼泣笑怒喜悲驚困助願約束信注意用服着脱洗料理飯肉野菜果物牛豚鳥酒茶菓子塩砂糖朝昼夜夕方春夏秋冬去来昨明次回毎度番線発到着乗降転運旅泊客宿港空飛船荷列急普通特急席券現金代値料費税低両足都合当然結婚離婚愛恋夢希望",
  'N3': "与並主久乏乳乾乱亡争互井亜享亭介他付令仲件任企伺位低住佐例供依価便係保信修倉個倍候借値側停健偶備傾働優元兄兆党入全共具典兼内再冒写冠冷処凡凶出刀刃列初判別利到制刷券刺刻則削前割創劇力功加助努労効勢勤勝募勉動務包化北医区十千午卒協単博印危即卵去参及友双反収叔取受叩号司各合吉同名后向否含吸呼命和員哲商問営器囲固国圧在地坂均型埋城域基堂報場塔塗増士変夏夕外多夜夢大天太夫央失奏契奥女好妻委姿婦婚嫌子字存季学宅宇守安完官宙定実客宣室宮害家容宿寄密富寒察寸寺対寿封専射将尊導小少就尺局居属層山岸峰島崩州工左巧巨差巻市布希席帯帰常幅干平年幸幻幼庁床底店府度座庫庭康延建弁式弓引強当形役彼往待律後徒得御復微心必応快念怒怖思急性怪恋恐恒恥恵悩悪悲情惑想意感愛態慣慢慮成我戦戯戸戻所才打払扱承技投折抜抱抵押招担拍拝拒拓拳指持振捕捜掛探接控推支改政故救敗教散敬数整敵文料断新方施旅族旗日旧旨早易星映春昨昭昼晴景暑暗暴曲更替最月有服期木未末本札机材村条来杯東松果枝柔査柱柳株根格案桜梅械棒森植業極楽様横権欠次欧欲歌止正武歩歯歴死残段殺母毎毒比毛民気水永汁求汗汚池決沈沖沙没河油治沿況泉泊法波泣注泰洋洗活派流浅浜浮浪海消涙液涼深混清減測港湖湯湾満漁漢演潔激火灯灰災炎点為無然焼煙照熱燃爆父片版牙牛牧物特犬犯状独狭猫献玉王現球理生産用田由申男町画界畑留番異疑病痛登白的皇皮皿益盛盟目直相省看県真眼知短石砂研破確示礼社祖祝神票禁福科秒秋秘移程税種究空突窓立章童競竹笑笛第等筆答箱管節約紅純紙級細終組経結給統絵絶続緑線編締缶罪置罰美羊羽翌習老考者耳職肉肌肩背胃胸能脂脳腹腕腰臓臣自至興舌舎航船良色花芸芽若苦英茶草荷菜華落葉著蒸薬血行術街衣表裏製複西要見規視覚親観角解言計討訓記訪設許訳詞試話話認誘語誤説読課調談論講謝識警議譲谷豆豊貝負財責貯買貸費貿賀資賛質赤走起超越趣足距路跳身軍転軽較輪辞農辺近返追退送逃逆通速進遅遇遊運過道達違遠適選遺郵部都配酒酸里重野量金針鉄銀銭録鏡長門開閉間関防限院除険陽階際障隠隣隻雄雑離難雨雪雲零雷電青静非面革音順預頭題額顔願類風飛食飯飲館首馬駅験高髪鳥鳴麦黄黒"
};

function showKanjiList(level) {
  const list = KANJI_LISTS[level] || "";
  const picker = document.getElementById("kanjiPicker");
  picker.innerHTML = "";
  picker.style.display = "flex";
  picker.style.flexDirection = "column";
  picker.style.flexWrap = "nowrap";
  picker.style.gap = "0";
  picker.style.maxHeight = "340px";
  picker.style.overflow = "hidden";
  picker.style.padding = "0";

  // create search box
  const searchWrap = document.createElement("div");
  searchWrap.style.marginBottom = "8px";
  searchWrap.style.display = "flex";
  searchWrap.style.background = "#fff";
  searchWrap.style.padding = "12px 12px 4px 12px";

  const searchInp = document.createElement("input");
  searchInp.type = "text";
  searchInp.placeholder = `🔍 Tìm Kanji ${level}...`;
  searchInp.style.flex = "1";
  searchInp.style.padding = "6px 12px";
  searchInp.style.border = "1px solid var(--br)";
  searchInp.style.borderRadius = "6px";
  searchInp.style.fontFamily = "inherit";
  searchInp.style.fontSize = "14px";
  searchInp.style.outline = "none";
  searchWrap.appendChild(searchInp);

  const filterWrap = document.createElement("div");
  filterWrap.style.display = "flex";
  filterWrap.style.flexWrap = "wrap";
  filterWrap.style.gap = "8px"; 
  filterWrap.style.overflowY = "auto";
  filterWrap.style.padding = "0 12px 12px 12px";
  filterWrap.style.flex = "1";
  filterWrap.style.minHeight = "0";

  picker.appendChild(searchWrap);
  picker.appendChild(filterWrap);

  const chars = Array.from(new Set(list.replace(/\s+/g, '').split('')));
  const btnEls = [];

  chars.forEach(ch => {
    const btn = document.createElement("button");
    btn.className = "btn-kanji";
    btn.textContent = ch;

    const name = getCharName(ch) || ch;
    btn.title = name;

    btn.onclick = () => {
      const inp = document.getElementById("sheetInput");
      if (!inp.value.includes(ch)) {
        inp.value += ch;
      }
    };
    filterWrap.appendChild(btn);
    btnEls.push({ ch: ch, name: name.toLowerCase(), el: btn });
  });

  searchInp.addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    btnEls.forEach(item => {
      if (!q || item.ch.includes(q) || item.name.includes(q)) {
        item.el.style.display = "inline-block";
      } else {
        item.el.style.display = "none";
      }
    });
  });
}

function clearKanjiList() {
  document.getElementById("kanjiPicker").style.display = "none";
}

function updateGenContextLabel() {
  const el = document.getElementById('genContextLabel');
  if (!el) return;
  if (practiceMode === 'lesson' && selectedLesson) {
    el.textContent = `→ ${selectedLesson._lv} Bài ${selectedLesson.lesson}: ${selectedLesson.title}`;
  } else if (practiceMode === 'level') {
    el.textContent = `→ toàn bộ ${practiceLevel}`;
  } else {
    el.textContent = '';
  }
}

// buildPracticePrompt is defined above using JLPT_PROMPTS (Japanese format)