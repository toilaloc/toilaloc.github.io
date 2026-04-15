// ═══════════════════════════════════
// CONFIG
// ═══════════════════════════════════
const SB_URL = 'https://ktbeyflghrgzeyroqxyq.supabase.co';
const SB_KEY = '__SB_KEY__';

// ── Groq (free, https://console.groq.com/keys) ──
const GROQ_KEY = '__GROQ_KEY__';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'; // free vision model

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

// ═══════════════════════════════════
// BOOT
// ═══════════════════════════════════
window.addEventListener('DOMContentLoaded', () => {
  initCanvas();
  loadCards();
});

// ═══════════════════════════════════
// SUPABASE HELPERS
// ═══════════════════════════════════
function setDB(state, msg) {
  document.getElementById('dbDot').className = 'db-dot ' + state;
  document.getElementById('dbLabel').textContent = msg;
}

async function sbGet() {
  const r = await fetch(`${SB_URL}/rest/v1/flashcards?order=created_at.asc`, { headers: SB_H });
  if (!r.ok) throw new Error('read ' + r.status);
  return r.json();
}

async function sbAdd(data) {
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

// ═══════════════════════════════════
// LOAD / SYNC
// ═══════════════════════════════════
async function loadCards() {
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
      'Authorization': `Bearer ${GROQ_KEY}`
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
const JLPT_PROMPTS = {

  mondai1: (level, count, ctx) => `
あなたは日本語能力試験（JLPT）${level}の問題作成者です。
${ctx}
【問題1 漢字読み】の形式で${count}問作成してください。
形式: 文中の___の漢字の読み方を①〜④から選ぶ。

JSONのみ返してください（markdownなし）:
[{"type":"mondai1","question":"___の言葉の読み方は何ですか。例: 毎朝、新聞を（読み）ます。","target":"対象の漢字語","ruby":"","options":["①よみ","②かき","③みる","④はなし"],"answer":"①よみ","explanation":"「読み」はよみと読みます。動詞「読む」の連用形。"}]
ルール: JLPT ${level}レベルの漢字のみ。optionsは読み方（ひらがな）のみ。JSONの文字列内に改行禁止。${count}問ちょうど。`,

  mondai2: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題2 表記】の形式で${count}問作成してください。
形式: ひらがな/カタカナの語に対して正しい漢字表記を選ぶ。

JSONのみ返してください:
[{"type":"mondai2","question":"___のことばはどう書きますか。例: まいにち　べんきょうしています。","target":"べんきょう","ruby":"","options":["①勉強","②便強","③文強","④文章"],"answer":"①勉強","explanation":"「べんきょう」は「勉強」と書きます。"}]
ルール: JLPT ${level}語彙範囲のみ。optionsは漢字表記。JSONの文字列内に改行禁止。${count}問ちょうど。`,

  mondai3: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題3 文脈規定】の形式で${count}問作成してください。
形式: 文の（　）に入る最も適切な言葉を選ぶ。

JSONのみ返してください:
[{"type":"mondai3","question":"（　）に入れるのに最もよいものを選んでください。\\n駅まで歩いて（　）分かかります。","ruby":"","options":["①だいたい","②すこし","③もっと","④まだ"],"answer":"①だいたい","explanation":"「だいたい〜分」で「おおよそ〜分」の意味。時間の大まかな見積もりに使う。"}]
ルール: 4択。文脈で判断できる語彙問題。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。`,

  mondai4: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題4 言い換え類義語】の形式で${count}問作成してください。
形式: ___の言葉に意味が最も近いものを選ぶ。

JSONのみ返してください:
[{"type":"mondai4","question":"___の言葉に意味が最も近いものを選んでください。\\n彼はとても（たいせつ）なものをなくしました。","target":"たいせつ","ruby":"","options":["①大切","②重要","③必要","④特別"],"answer":"②重要","explanation":"「大切」と「重要」はほぼ同義。価値があって大事という意味。"}]
ルール: ターゲット語と選択肢はすべて${level}レベル範囲。${count}問ちょうど。JSONの文字列内に改行禁止。`,

  mondai5: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題5 文法形式の判断】の形式で${count}問作成してください。
形式: （　）に入る文法形式・助詞・接続詞を4択で選ぶ。実際のJLPT問題と同じ難易度。

JSONのみ返してください:
[{"type":"mondai5","question":"（　）に入れるのに最もよいものを選んでください。\\n病気（　）、学校を休みました。","ruby":"","options":["①だから","②なので","③ので","④から"],"answer":"③ので","explanation":"「〜ので」は客観的な理由を述べる丁寧な表現。「〜から」より柔らかく書き言葉・話し言葉両方で使える。"}]
ルール: ${level}の文法項目のみ。Minna no Nihongo ${level}範囲に準拠。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。`,

  mondai6: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題6 文の組み立て（並べ替え）】の形式で${count}問作成してください。
実際のJLPT問題と全く同じ形式: 4つの語句を並べ替えて文を作り、★の位置に来る語句を選ぶ。

JSONのみ返してください:
[{"type":"mondai6","question":"次の文の　★　に入る最もよいものを選んでください。\\n田中さんは　___　___　★　___　います。","ruby":"","scrambled":["①日本語を","②先生に","③教えて","④もらって"],"options":["①日本語を","②先生に","③教えて","④もらって"],"answer":"③教えて","correct_order":"②先生に①日本語を③教えて④もらって","explanation":"「先生に日本語を教えてもらっています」。★の位置は3番目→「教えて」。〜てもらう構文。"}]
ルール: scrambled と options は同じ4語句。answer は★の位置の語句。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。`,

  mondai7: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題7 文章の文法】の形式で${count}セット作成してください。
形式: 短い文章（3〜4文）に（1）〜（${count}）の空欄があり、それぞれに最適な文法形式を選ぶ。
→ 1セット = 1つの文章 + ${count}個の空欄問題として生成してください。

JSONのみ返してください（各空欄を1問として配列に入れる）:
[{"type":"mondai7","passage":"私は毎日電車（1）会社に行きます。家（2）駅まで15分（3）かかります。","question":"（1）に入れるのに最もよいものを選んでください。","ruby":"","options":["①で","②に","③を","④が"],"answer":"①で","explanation":"移動手段には助詞「で」を使う。「電車で行く」。"}]
ルール: 文章は自然な日本語。空欄ごとに1オブジェクト。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。`,

  mondai8: (level, count, ctx) => `
あなたはJLPT${level}問題作成者です。
${ctx}
【問題8 内容理解（短文）】の形式で作成してください。
形式: 150〜200字の読解文1つ + それに関する質問${count}問。実際のJLPT読解問題と同じ難易度。

JSONのみ返してください:
[{"type":"mondai8","passage":"（読解文をここに）","question":"筆者が言いたいことは何ですか。","ruby":"","options":["①...","②...","③...","④..."],"answer":"②...","explanation":"本文〜の部分から〜であることが読み取れる。"}]
ルール: passage は全問共通（最初の1問のみ入れ、残りはpassage省略可）。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。`,

  all: (level, count, ctx) => `
あなたはJLPT${level}・Minna no Nihongo専門の日本語教師です。
${ctx}
問題1〜8の中から均等に選んで、合計${count}問のJLPT形式問題を作成してください。
各問題に type フィールドで種別を示してください（mondai1〜mondai8）。

JSONのみ返してください:
[{"type":"mondai1|mondai2|mondai3|mondai4|mondai5|mondai6|mondai7|mondai8","question":"...","ruby":"","options":["①...","②...","③...","④..."],"answer":"①...","explanation":"...（ベトナム語で80語以内）"}]
ルール: options は MCQ のみ。mondai6 は correct_order フィールドも追加。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。`
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
[{"type":"mondaiN","question":"...","ruby":"","options":["①...","②...","③...","④..."],"answer":"①...","explanation":"...（ベトナム語で80語以内）"}]
ルール: options は MCQ のみ。mondai6 は correct_order フィールドも追加。mondai7の場合は passage も含める。${count}問ちょうど。JSONの文字列内に改行禁止（\\nは使用可）。`;
}

// ── Parse AI JSON response helper ──
function parseExerciseJSON(raw) {
  let clean = raw.replace(/```json|```/g, '').trim().replace(/\n/g, ' ');
  const match = clean.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Không parse được JSON từ AI');
  return JSON.parse(match[0]);
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
      btn.textContent = batches.length > 1 ? `⏳ Batch ${b + 1}/${batches.length}...` : '...';
      const prompt = buildPracticePrompt(practiceLevel, practiceTypes, batches[b]);
      const raw = await callGemini(prompt);
      currentExercises.push(...parseExerciseJSON(raw));
      renderExercises(currentExercises); // render progressively
    }
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

  let bodyHTML = '';

  if (q.type === 'mondai6') {
    // 並べ替え: show scrambled word tiles + pick which goes in ★ slot
    const tiles = (q.scrambled || q.options || []).map(t =>
      `<span class="scramble-tile">${escHTML(t)}</span>`).join('');
    const opts = (q.options || []).map((opt, oi) => `
      <div class="mcq-opt" id="opt_${i}_${oi}" onclick="selectOpt(${i},${oi})">
        <span class="mcq-label">${['①', '②', '③', '④'][oi] || oi + 1}</span>
        <span>${escHTML(opt)}</span>
      </div>`).join('');
    bodyHTML = `
      <div class="scramble-tiles">${tiles}</div>
      <div class="scramble-hint">★ の位置に来る語句はどれですか：</div>
      <div class="mcq-options">${opts}</div>`;

  } else if (q.type === 'mondai8' && q.passage) {
    const opts = (q.options || []).map((opt, oi) => `
      <div class="mcq-opt" id="opt_${i}_${oi}" onclick="selectOpt(${i},${oi})">
        <span class="mcq-label">${['①', '②', '③', '④'][oi] || oi + 1}</span>
        <span>${escHTML(opt)}</span>
      </div>`).join('');
    bodyHTML = `
      <div class="reading-passage">${escHTML(q.passage)}</div>
      <div class="mcq-options">${opts}</div>`;

  } else if (q.type === 'mondai7' && q.passage) {
    const opts = (q.options || []).map((opt, oi) => `
      <div class="mcq-opt" id="opt_${i}_${oi}" onclick="selectOpt(${i},${oi})">
        <span class="mcq-label">${['①', '②', '③', '④'][oi] || oi + 1}</span>
        <span>${escHTML(opt)}</span>
      </div>`).join('');
    bodyHTML = `
      <div class="reading-passage mondai7-passage">${escHTML(q.passage)}</div>
      <div class="mcq-options">${opts}</div>`;

  } else if (hasOptions) {
    const opts = q.options.map((opt, oi) => `
      <div class="mcq-opt" id="opt_${i}_${oi}" onclick="selectOpt(${i},${oi})">
        <span class="mcq-label">${['①', '②', '③', '④'][oi] || (oi + 1)}</span>
        <span>${escHTML(opt)}</span>
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
        <div class="q-text">${escHTML(q.question)}</div>
        ${q.ruby ? `<div class="q-sub">📖 ${escHTML(q.ruby)}</div>` : ''}
        ${q.target ? `<div class="q-target">対象語: <strong>${escHTML(q.target)}</strong></div>` : ''}
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
    { lesson: 1, title: 'はじめまして', grammar: 'N は N です／じゃありません／ですか', vocab: 'Danh từ chỉ người, quốc tịch, nghề nghiệp' },
    { lesson: 2, title: 'これ・それ・あれ', grammar: 'これ／それ／あれ は N です', vocab: 'Đồ vật, đây / đó / kia' },
    { lesson: 3, title: 'ここ・そこ・あそこ', grammar: 'ここ／そこ／あそこ は N です', vocab: 'Nơi chốn, phòng, tầng' },
    { lesson: 4, title: 'いま なんじ ですか', grammar: '〜時〜分、〜から〜まで', vocab: 'Giờ giấc, thời gian, lịch trình' },
    { lesson: 5, title: 'いくらですか', grammar: 'N を ください, いくら', vocab: 'Mua sắm, số đếm, tiền tệ' },
    { lesson: 6, title: 'まいにち なんじに おきますか', grammar: '動詞 ます形, 〜に〜ます', vocab: 'Sinh hoạt hàng ngày, trạng từ thời gian' },
    { lesson: 7, title: 'やすみは なんにちですか', grammar: '〜曜日、〜から〜まで、〜と〜', vocab: 'Thứ, ngày tháng, lịch nghỉ' },
    { lesson: 8, title: 'わたしは えいごで にほんごを おしえています', grammar: 'N で V, N を V', vocab: 'Ngôn ngữ, dạy học, phương tiện' },
    { lesson: 9, title: 'しゅうまつ どこかへ いきますか', grammar: '〜へ行きます/来ます/帰ります、〜で/に', vocab: 'Di chuyển, giao thông, địa điểm' },
    { lesson: 10, title: 'いっしょに いきませんか', grammar: '〜ませんか、〜ましょう', vocab: 'Rủ rê, đề nghị, hoạt động' },
    { lesson: 11, title: 'わたしは あの みせで たべました', grammar: '〜た形 (động từ quá khứ)', vocab: 'Ăn uống, nhà hàng, thực phẩm' },
    { lesson: 12, title: 'このまちに どんな たてものが ありますか', grammar: 'あります／います、〜に〜があります', vocab: 'Địa điểm trong thành phố, tồn tại' },
    { lesson: 13, title: 'きょうは あついですね', grammar: '形容詞 い／な (thể hiện tại)', vocab: 'Tính từ mô tả, thời tiết' },
    { lesson: 14, title: 'すずきさんの かばんは どれですか', grammar: '〜のです、〜は〜より〜', vocab: 'So sánh, mô tả sự vật' },
    { lesson: 15, title: 'まいにち みちを あるきます', grammar: '〜て形 (liệt kê hành động)', vocab: 'Đường phố, hoạt động ngoài trời' },
    { lesson: 16, title: 'ちかてつの のりかた', grammar: '〜て form (sử dụng hướng dẫn)', vocab: 'Phương tiện giao thông, tàu điện' },
    { lesson: 17, title: 'きっぷを かって おきます', grammar: '〜ておきます、〜てから', vocab: 'Chuẩn bị, du lịch, vé' },
    { lesson: 18, title: 'あのこうえんを さんぽしました', grammar: '〜てみます、〜てしまいます', vocab: 'Công viên, hoạt động thử nghiệm' },
    { lesson: 19, title: 'もっとゆっくり はなしてください', grammar: '〜てください、〜てはいけません', vocab: 'Yêu cầu, chỉ dẫn, quy tắc' },
    { lesson: 20, title: 'さくらが きれいだったですね', grammar: '〜た形 tính từ quá khứ, 〜でした', vocab: 'Bốn mùa, thiên nhiên, cảm xúc' },
    { lesson: 21, title: 'たなかさんが しっています', grammar: '〜ています (trạng thái / nghề nghiệp)', vocab: 'Trạng thái hiện tại, kiến thức' },
    { lesson: 22, title: 'このきじは たかいですが、いいです', grammar: '〜が (tuy nhiên), 〜けど', vocab: 'Mua sắm, chất lượng sản phẩm' },
    { lesson: 23, title: 'やまのぼりを したことが ありますか', grammar: '〜たことがあります', vocab: 'Trải nghiệm, sở thích, leo núi' },
    { lesson: 24, title: 'もし じかんが あったら いきたいです', grammar: '〜たら (điều kiện)', vocab: 'Mong muốn, điều kiện, kế hoạch' },
    { lesson: 25, title: 'はやく やすんだほうが いいですよ', grammar: '〜た方がいい、〜ない方がいい', vocab: 'Sức khỏe, lời khuyên, bệnh viện' },
  ],
  N4: [
    { lesson: 26, title: 'この本は読みやすいです', grammar: '〜やすい／にくい', vocab: 'Tính chất hành động' },
    { lesson: 27, title: 'この荷物を運んでいただけませんか', grammar: '〜ていただけませんか、〜てもらう', vocab: 'Nhờ vả lịch sự, hành lý' },
    { lesson: 28, title: 'たばこを吸ってもいいですか', grammar: '〜てもいいです／〜てはいけません', vocab: 'Quy tắc, cho phép, cấm' },
    { lesson: 29, title: '部屋に鍵をかけておきましょう', grammar: '〜ておく (chuẩn bị)', vocab: 'Nhà ở, đồ dùng gia đình' },
    { lesson: 30, title: 'このへやは広くて、明るいです', grammar: '〜て (nối tính từ)', vocab: 'Mô tả phòng ốc, nhà cửa' },
    { lesson: 31, title: '友達が来たとき、うちにいました', grammar: '〜とき (thời điểm)', vocab: 'Thời gian, tình huống' },
    { lesson: 32, title: '熱があるなら、休んだほうがいいです', grammar: '〜なら (giả thuyết)', vocab: 'Sức khỏe, triệu chứng, bệnh viện' },
    { lesson: 33, title: '電車が遅れているようです', grammar: '〜ようです、〜そうです (truyền đạt)', vocab: 'Tin tức, phương tiện, dự đoán' },
    { lesson: 34, title: 'もっと日本語が上手になりたい', grammar: '〜になります、〜くなります', vocab: 'Thay đổi, mục tiêu học tập' },
    { lesson: 35, title: '子供のころよく川で泳ぎました', grammar: '〜ころ、〜ながら', vocab: 'Ký ức, tuổi thơ, hoạt động' },
    { lesson: 36, title: '荷物はもう送ってあります', grammar: '〜てある (kết quả còn lưu)', vocab: 'Trạng thái chuẩn bị, chuẩn bị sẵn' },
    { lesson: 37, title: '兄はシンガポールへ行ったことがあります', grammar: '〜たことがある (kinh nghiệm)', vocab: 'Du lịch nước ngoài, kinh nghiệm' },
    { lesson: 38, title: '予約しておきました', grammar: '〜ておいた、〜てしまった', vocab: 'Đặt chỗ, hoàn thành, tiếc nuối' },
    { lesson: 39, title: '道を教えていただけますか', grammar: '〜ていただく、〜てくださる', vocab: 'Xin giúp đỡ, hỏi đường' },
    { lesson: 40, title: '日本語で話せるようになりました', grammar: '〜ようになる、〜ことができる', vocab: 'Khả năng, tiến bộ, kỹ năng' },
    { lesson: 41, title: '電話してくれてありがとう', grammar: '〜てくれる／あげる／もらう', vocab: 'Ơn nghĩa, trao đổi, quan hệ xã hội' },
    { lesson: 42, title: '部長に報告しなければなりません', grammar: '〜なければならない、〜なくてもいい', vocab: 'Công sở, nghĩa vụ, báo cáo' },
    { lesson: 43, title: '車が止まっています', grammar: '〜ている (kết quả / trạng thái tiếp diễn)', vocab: 'Giao thông, mô tả cảnh vật' },
    { lesson: 44, title: '荷物が多すぎます', grammar: '〜すぎます、〜すぎ', vocab: 'Mức độ quá, hành lý, số lượng' },
    { lesson: 45, title: '知らないことばは辞書で調べます', grammar: '〜ば (điều kiện)', vocab: 'Học từ điển, tìm kiếm thông tin' },
    { lesson: 46, title: '彼女は歌が上手だそうです', grammar: '〜そうです (nghe nói)', vocab: 'Tin đồn, sở thích, âm nhạc' },
    { lesson: 47, title: '窓を開けてもいいですか', grammar: 'Hỏi xin phép + từ chối lịch sự', vocab: 'Không gian sinh hoạt, xã giao' },
    { lesson: 48, title: '新しいパソコンが欲しいです', grammar: '〜ほしい、〜てほしい', vocab: 'Mong muốn, mua sắm, công nghệ' },
    { lesson: 49, title: '引っ越してから生活が変わりました', grammar: '〜てから、〜たあとで', vocab: 'Chuyển nhà, thay đổi cuộc sống' },
    { lesson: 50, title: '子供のとき、どんな子でしたか', grammar: '〜たら (điều kiện quá khứ), 〜でした', vocab: 'Kỷ niệm, tính cách, tuổi thơ' },
  ],
  N3: [
    { lesson: 1, title: '受身形（られる）', grammar: '受身形：N に V られる', vocab: 'Câu bị động, sự việc xảy ra với ai' },
    { lesson: 2, title: '使役形（させる）', grammar: '使役形：N を V させる', vocab: 'Sai bảo, cho phép, buộc phải làm' },
    { lesson: 3, title: '使役受身形', grammar: '使役受身: V させられる', vocab: 'Bị bắt phải làm, ép buộc' },
    { lesson: 4, title: '自動詞・他動詞', grammar: '自他動詞の区別 (壊れる vs 壊す)', vocab: 'Cặp tự/tha động từ, biến đổi trạng thái' },
    { lesson: 5, title: '〜という（伝聞・定義）', grammar: '〜という N, 〜ということだ', vocab: 'Tên gọi, định nghĩa, tin tức' },
    { lesson: 6, title: '〜ようだ・〜らしい・〜そうだ', grammar: 'Suy đoán: ようだ／らしい／そうだ', vocab: 'Quan sát, suy đoán, phỏng đoán' },
    { lesson: 7, title: '〜でしょう・〜だろう', grammar: '〜でしょう／〜だろう (dự đoán)', vocab: 'Thời tiết, tương lai, khả năng' },
    { lesson: 8, title: '〜はずだ・〜はずがない', grammar: '〜はずだ (kỳ vọng logic)', vocab: 'Lý luận, mong đợi, sự thật' },
    { lesson: 9, title: '〜わけだ・〜わけがない', grammar: '〜わけだ (lý do đương nhiên)', vocab: 'Giải thích, nguyên nhân, kết luận' },
    { lesson: 10, title: '〜ために（目的・原因）', grammar: '〜ために (mục đích) vs (nguyên nhân)', vocab: 'Mục tiêu, lý do, hậu quả' },
    { lesson: 11, title: '〜ながら・〜つつ', grammar: '〜ながら (đồng thời), 〜つつ (văn viết)', vocab: 'Làm nhiều việc cùng lúc' },
    { lesson: 12, title: '〜し（列挙・理由）', grammar: '〜し〜し (liệt kê lý do)', vocab: 'Liệt kê nhiều lý do' },
    { lesson: 13, title: '〜ても・〜でも（逆接）', grammar: '〜ても (dù cho), 〜でも', vocab: 'Nhượng bộ, dù thế nào' },
    { lesson: 14, title: '〜のに（逆接・不満）', grammar: '〜のに (dù vậy mà, bất mãn)', vocab: 'Mâu thuẫn, bất mãn, ngạc nhiên' },
    { lesson: 15, title: '〜ばかり・〜だけ・〜しか', grammar: 'Giới hạn: ばかり／だけ／しか〜ない', vocab: 'Giới hạn, số lượng, ăn uống' },
    { lesson: 16, title: 'まま・まま(だ)', grammar: '〜まま (để nguyên trạng thái)', vocab: 'Trạng thái giữ nguyên, lơ là' },
    { lesson: 17, title: '〜てしまう・〜ちゃう', grammar: '〜てしまう (hoàn thành/hối tiếc)', vocab: 'Hành động không mong muốn, hối hận' },
    { lesson: 18, title: '〜ことにする・〜ことになる', grammar: '〜ことにする (quyết định), ことになる (kết quả)', vocab: 'Quyết định, thay đổi quy tắc' },
    { lesson: 19, title: '〜ようにする・〜ようになる', grammar: '〜ようにする (cố gắng), ようになる (thay đổi)', vocab: 'Thói quen, thay đổi hành vi' },
    { lesson: 20, title: '〜てみる・〜てみせる', grammar: '〜てみる (thử làm)', vocab: 'Thử nghiệm, chứng minh' },
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
  'N5': "一二三四五六七八九十百千万円日月中火水木金土本休語何年上下左右南北西東大小学高校先生語本男女人子友父母名目口手足見聞行来飲食買出入休書言読話買教朝昼夕夜間时分半今先週月年休毎何",
  'N4': "会同事自社発者地業方新場員設立開手力問代明動京目通言理体田作用強公野思家多正安院心界教文元重近考画海売知道集別物使品計死特私始朝期色終建神落暗病打買歌送起転軽広洗急",
  'N3': "政議民連対部合市内相信定回選米実関決全表戦経最調化当約首法性要制治務成期取都和機平加受続進数記初指権支産点報済活原共得解交資際査判査任断更確満落流態越局放"
};

function showKanjiList(level) {
  const list = KANJI_LISTS[level] || "";
  const picker = document.getElementById("kanjiPicker");
  picker.innerHTML = "";
  picker.style.display = "flex";

  const chars = Array.from(new Set(list.split('')));
  chars.forEach(ch => {
    const btn = document.createElement("button");
    btn.className = "btn btn-sm";
    btn.style.fontFamily = "'Noto Serif JP', serif";
    btn.style.fontSize = "16px";
    btn.style.padding = "4px 8px";
    btn.style.background = "#F7F7F7";
    btn.style.color = "#333";
    btn.style.border = "1px solid #CCC";
    btn.textContent = ch;
    btn.onclick = () => {
      const inp = document.getElementById("sheetInput");
      if (!inp.value.includes(ch)) {
        inp.value += ch;
      }
    };
    picker.appendChild(btn);
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