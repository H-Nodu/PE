// ===== FP3級 学科試験 フラッシュカードアプリ =====

const LS_PREFIX = 'fp3_';
const LS_MASTERED = LS_PREFIX + 'mastered';
const LS_MISTAKES = LS_PREFIX + 'mistakes';
const LS_HISTORY = LS_PREFIX + 'history';
const LS_LAST_SESSION = LS_PREFIX + 'last_session';
const LS_MEMO = LS_PREFIX + 'memo';
const LS_REVIEW_FILTERS = LS_PREFIX + 'review_filters';

let mastered = JSON.parse(localStorage.getItem(LS_MASTERED) || '[]');
let mistakes = JSON.parse(localStorage.getItem(LS_MISTAKES) || '[]');
let history = JSON.parse(localStorage.getItem(LS_HISTORY) || '{}');
let reviewFilters = JSON.parse(localStorage.getItem(LS_REVIEW_FILTERS) || '{"correct":false,"unsure":true,"incorrect":true}');

let deck = [];
let deckIndex = 0;
let currentMode = '';
let currentOrder = '';
let isFlipped = false;

const CATEGORIES = [
    'ライフプランニングと資金計画',
    'リスク管理',
    '金融資産運用',
    'タックスプランニング',
    '不動産',
    '相続・事業承継'
];

const CATEGORY_COLORS = {
    'ライフプランニングと資金計画': '#3b82f6',
    'リスク管理': '#ef4444',
    '金融資産運用': '#10b981',
    'タックスプランニング': '#8b5cf6',
    '不動産': '#f59e0b',
    '相続・事業承継': '#ec4899'
};

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    updateHomeStats();
    loadMemo();
    loadReviewFilters();
    checkResumeSession();
    buildCategoryButtons();
    setupKeyboard();
    setupSwipe();
});

function buildCategoryButtons() {
    const container = document.getElementById('category-buttons');
    CATEGORIES.forEach(cat => {
        const count = QUESTIONS.filter(q => q.category === cat).length;
        const color = CATEGORY_COLORS[cat];
        const btn = document.createElement('button');
        btn.className = 'menu-card';
        btn.style.borderLeft = `3px solid ${color}`;
        btn.onclick = () => startMode('category_' + cat, 'random');
        btn.innerHTML = `
            <div class="menu-card-icon" style="color: ${color};">
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="6" y="6" width="20" height="20" rx="4" stroke="currentColor" stroke-width="2"/>
                    <path d="M11 13h10M11 17h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
            </div>
            <div class="menu-card-text">
                <span class="menu-card-title">${cat}</span>
                <span class="menu-card-sub">この分野のみ出題</span>
            </div>
            <div class="menu-card-count">${count}問</div>
        `;
        container.appendChild(btn);
    });
}

// ===== SCREENS =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    window.scrollTo(0, 0);
}

function goHome() {
    showScreen('home-screen');
    updateHomeStats();
}

// ===== STATS =====
function updateHomeStats() {
    const total = QUESTIONS.length;
    document.getElementById('stat-total').textContent = total;
    document.getElementById('total-q-count').textContent = total;

    const answered = Object.keys(history).length;
    if (answered > 0) {
        let correctCount = 0, unsureCount = 0, incorrectCount = 0;
        for (const h of Object.values(history)) {
            correctCount += h.correct || 0;
            unsureCount += h.unsure || 0;
            incorrectCount += h.incorrect || 0;
        }
        const totalAttempts = correctCount + unsureCount + incorrectCount;
        if (totalAttempts > 0) {
            document.getElementById('stat-accuracy').textContent = Math.round(correctCount / totalAttempts * 100) + '%';
            document.getElementById('stat-unsure-rate').textContent = Math.round(unsureCount / totalAttempts * 100) + '%';
            document.getElementById('stat-incorrect-rate').textContent = Math.round(incorrectCount / totalAttempts * 100) + '%';
        }
    }

    const masteredPct = total > 0 ? Math.round(mastered.length / total * 100) : 0;
    document.getElementById('progress-fill').style.width = masteredPct + '%';
    document.getElementById('progress-pct').textContent = masteredPct + '%';

    // Update counts
    const marubatsuCount = QUESTIONS.filter(q => q.type === 'marubatsu').length;
    const santakuCount = QUESTIONS.filter(q => q.type === 'santaku').length;
    document.getElementById('count-all').textContent = total + '問';
    if (document.getElementById('count-all-seq')) document.getElementById('count-all-seq').textContent = total + '問';
    document.getElementById('count-marubatsu').textContent = marubatsuCount + '問';
    document.getElementById('count-santaku').textContent = santakuCount + '問';

    updateReviewCounts();
}

function updateReviewCounts() {
    const correctList = mastered.filter(n => !mistakes.includes(n));
    const unsureList = [];
    const incorrectList = [...mistakes];

    for (const [numStr, h] of Object.entries(history)) {
        const num = parseInt(numStr);
        if (h.last === 'unsure' && !mastered.includes(num) && !mistakes.includes(num)) {
            unsureList.push(num);
        }
    }

    document.getElementById('count-filter-correct').textContent = correctList.length;
    document.getElementById('count-filter-unsure').textContent = unsureList.length;
    document.getElementById('count-filter-incorrect').textContent = incorrectList.length;

    let mistakeCount = 0;
    if (reviewFilters.correct) mistakeCount += correctList.length;
    if (reviewFilters.unsure) mistakeCount += unsureList.length;
    if (reviewFilters.incorrect) mistakeCount += incorrectList.length;
    document.getElementById('count-mistakes').textContent = mistakeCount + '問';

    // Ever incorrect/unsure
    let everIncorrect = 0, everUnsure = 0;
    for (const h of Object.values(history)) {
        if ((h.incorrect || 0) > 0) everIncorrect++;
        else if ((h.unsure || 0) > 0) everUnsure++;
    }
    document.getElementById('count-ever-incorrect').textContent = everIncorrect + '問';
    document.getElementById('count-ever-unsure').textContent = everUnsure + '問';
}

// ===== REVIEW FILTERS =====
function loadReviewFilters() {
    for (const key of ['correct', 'unsure', 'incorrect']) {
        const btn = document.getElementById(`filter-${key}-btn`);
        btn.classList.toggle('active', reviewFilters[key]);
    }
}

function toggleReviewFilter(key) {
    reviewFilters[key] = !reviewFilters[key];
    localStorage.setItem(LS_REVIEW_FILTERS, JSON.stringify(reviewFilters));
    loadReviewFilters();
    updateReviewCounts();
}

// ===== START MODES =====
function startMode(mode, order) {
    currentMode = mode;
    currentOrder = order || 'random';

    if (mode === 'all') {
        deck = QUESTIONS.map((_, i) => i);
    } else if (mode === 'marubatsu') {
        deck = QUESTIONS.map((q, i) => q.type === 'marubatsu' ? i : -1).filter(i => i >= 0);
    } else if (mode === 'santaku') {
        deck = QUESTIONS.map((q, i) => q.type === 'santaku' ? i : -1).filter(i => i >= 0);
    } else if (mode === 'exam_2025_5') {
        deck = QUESTIONS.map((q, i) => q.exam === '2025年5月' ? i : -1).filter(i => i >= 0);
    } else if (mode === 'exam_2024_5') {
        deck = QUESTIONS.map((q, i) => q.exam === '2024年5月' ? i : -1).filter(i => i >= 0);
    } else if (mode.startsWith('category_')) {
        const cat = mode.replace('category_', '');
        deck = QUESTIONS.map((q, i) => q.category === cat ? i : -1).filter(i => i >= 0);
    } else if (mode === 'mistakes') {
        deck = buildReviewDeck();
    } else if (mode === 'ever_incorrect') {
        deck = [];
        for (const [numStr, h] of Object.entries(history)) {
            if ((h.incorrect || 0) > 0) {
                const idx = QUESTIONS.findIndex(q => q.num === parseInt(numStr));
                if (idx >= 0) deck.push(idx);
            }
        }
    } else if (mode === 'ever_unsure') {
        deck = [];
        for (const [numStr, h] of Object.entries(history)) {
            if ((h.unsure || 0) > 0 && (h.incorrect || 0) === 0) {
                const idx = QUESTIONS.findIndex(q => q.num === parseInt(numStr));
                if (idx >= 0) deck.push(idx);
            }
        }
    }

    if (deck.length === 0) {
        showToast('対象の問題がありません');
        return;
    }

    if (currentOrder === 'random') shuffle(deck);
    deckIndex = 0;

    const modeLabels = {
        all: '全問モード',
        marubatsu: '○×問題',
        santaku: '三択問題',
        exam_2025_5: '2025年5月',
        exam_2024_5: '2024年5月',
        mistakes: '復習モード',
        ever_incorrect: '不正解履歴',
        ever_unsure: '微妙履歴'
    };
    let label = modeLabels[mode] || mode;
    if (mode.startsWith('category_')) label = mode.replace('category_', '');
    document.getElementById('card-mode-label').textContent = label;

    showScreen('card-screen');
    renderCard();
}

function buildReviewDeck() {
    const result = [];
    const correctList = mastered.filter(n => !mistakes.includes(n));

    for (let i = 0; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        const h = history[q.num];
        const inCorrect = correctList.includes(q.num);
        const inMistake = mistakes.includes(q.num);
        const inUnsure = h && h.last === 'unsure' && !mastered.includes(q.num) && !mistakes.includes(q.num);

        if ((reviewFilters.correct && inCorrect) ||
            (reviewFilters.incorrect && inMistake) ||
            (reviewFilters.unsure && inUnsure)) {
            result.push(i);
        }
    }
    return result;
}

// ===== CARD RENDERING =====
function renderCard() {
    if (deckIndex >= deck.length) {
        showComplete();
        return;
    }

    const q = QUESTIONS[deck[deckIndex]];
    isFlipped = false;
    document.getElementById('flashcard').classList.remove('flipped');

    // Header
    document.getElementById('card-q-number').textContent = '問' + q.num;
    const typeEl = document.getElementById('card-q-type');
    if (q.type === 'marubatsu') {
        typeEl.textContent = '○×問題';
        typeEl.className = 'card-q-type marubatsu';
    } else {
        typeEl.textContent = '三択問題';
        typeEl.className = 'card-q-type santaku';
    }
    document.getElementById('card-q-exam').textContent = q.exam;
    document.getElementById('card-q-category').textContent = q.category;

    // History badge
    const badge = document.getElementById('card-history-badge');
    const h = history[q.num];
    if (h) {
        const total = (h.correct || 0) + (h.incorrect || 0) + (h.unsure || 0);
        badge.style.display = '';
        badge.textContent = `${h.correct || 0}/${total}`;
        if (h.last === 'correct') { badge.style.background = 'rgba(34,197,94,0.15)'; badge.style.color = '#22c55e'; }
        else if (h.last === 'incorrect') { badge.style.background = 'rgba(239,68,68,0.15)'; badge.style.color = '#ef4444'; }
        else { badge.style.background = 'rgba(245,158,11,0.15)'; badge.style.color = '#f59e0b'; }
    } else {
        badge.style.display = 'none';
    }

    // Question text
    document.getElementById('card-q-text').textContent = q.question;

    // Choices (for santaku)
    const choicesEl = document.getElementById('card-choices');
    choicesEl.innerHTML = '';
    if (q.type === 'santaku' && q.choices) {
        q.choices.forEach((c, i) => {
            const div = document.createElement('div');
            div.className = 'choice-item';
            div.innerHTML = `<span class="choice-number">${i + 1}.</span><span>${c}</span>`;
            choicesEl.appendChild(div);
        });
    }

    // Answer (back)
    const answerEl = document.getElementById('card-answer');
    if (q.type === 'marubatsu') {
        answerEl.textContent = '答え：' + q.answer;
        answerEl.className = 'card-answer ' + (q.answer === '○' ? 'answer-maru' : 'answer-batsu');
    } else {
        const answerText = q.choices ? q.choices[q.answer - 1] : '';
        answerEl.textContent = '答え：' + q.answer + '. ' + answerText;
        answerEl.className = 'card-answer answer-choice';
    }

    document.getElementById('card-explanation').textContent = q.explanation;

    // Progress
    document.getElementById('card-counter').textContent = `${deckIndex + 1} / ${deck.length}`;
    document.getElementById('card-mini-progress-fill').style.width = ((deckIndex + 1) / deck.length * 100) + '%';

    // Save session
    saveSession();
}

function flipCard() {
    isFlipped = !isFlipped;
    document.getElementById('flashcard').classList.toggle('flipped', isFlipped);
}

// ===== CARD ACTIONS =====
function markCorrect() {
    const q = QUESTIONS[deck[deckIndex]];
    if (!mastered.includes(q.num)) mastered.push(q.num);
    mistakes = mistakes.filter(n => n !== q.num);
    updateHistory(q.num, 'correct');
    save();
    nextCard();
}

function markMistake() {
    const q = QUESTIONS[deck[deckIndex]];
    if (!mistakes.includes(q.num)) mistakes.push(q.num);
    mastered = mastered.filter(n => n !== q.num);
    updateHistory(q.num, 'incorrect');
    save();
    nextCard();
}

function markUnsure() {
    const q = QUESTIONS[deck[deckIndex]];
    updateHistory(q.num, 'unsure');
    save();
    nextCard();
}

function updateHistory(num, result) {
    if (!history[num]) history[num] = { correct: 0, incorrect: 0, unsure: 0 };
    history[num][result]++;
    history[num].last = result;
    history[num].lastDate = Date.now();
}

function nextCard() {
    if (deckIndex < deck.length - 1) {
        deckIndex++;
        renderCard();
    } else {
        showComplete();
    }
}

function prevCard() {
    if (deckIndex > 0) {
        deckIndex--;
        renderCard();
    }
}

function shuffleDeck() {
    const currentQ = deck[deckIndex];
    shuffle(deck);
    deckIndex = deck.indexOf(currentQ);
    if (deckIndex < 0) deckIndex = 0;
    showToast('シャッフルしました');
}

// ===== SAVE/LOAD =====
function save() {
    localStorage.setItem(LS_MASTERED, JSON.stringify(mastered));
    localStorage.setItem(LS_MISTAKES, JSON.stringify(mistakes));
    localStorage.setItem(LS_HISTORY, JSON.stringify(history));
}

function saveSession() {
    const q = QUESTIONS[deck[deckIndex]];
    localStorage.setItem(LS_LAST_SESSION, JSON.stringify({
        mode: currentMode,
        order: currentOrder,
        deckIndex: deckIndex,
        num: q.num,
        time: Date.now()
    }));
}

function checkResumeSession() {
    const s = JSON.parse(localStorage.getItem(LS_LAST_SESSION) || 'null');
    if (!s) return;
    const card = document.getElementById('resume-card');
    card.style.display = 'flex';
    document.getElementById('resume-mode').textContent = s.mode;
    document.getElementById('resume-question').textContent = '問' + s.num;

    const elapsed = Date.now() - s.time;
    const mins = Math.floor(elapsed / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    let timeText = mins < 60 ? mins + '分前' : hours < 24 ? hours + '時間前' : days + '日前';
    document.getElementById('resume-time').textContent = timeText;
}

function resumeSession() {
    const s = JSON.parse(localStorage.getItem(LS_LAST_SESSION) || 'null');
    if (!s) return;
    startMode(s.mode, s.order);
    // Try to restore position
    if (s.deckIndex < deck.length) {
        deckIndex = s.deckIndex;
    }
    renderCard();
}

// ===== MEMO =====
function saveMemo() {
    localStorage.setItem(LS_MEMO, document.getElementById('memo-input').value);
}

function loadMemo() {
    document.getElementById('memo-input').value = localStorage.getItem(LS_MEMO) || '';
}

// ===== COMPLETION =====
function showComplete() {
    document.getElementById('complete-reviewed').textContent = deck.length;
    document.getElementById('complete-mastered').textContent = mastered.length;
    showScreen('complete-screen');
}

// ===== MODAL =====
function confirmReset() {
    document.getElementById('modal-title').textContent = '確認';
    document.getElementById('modal-message').textContent = 'すべての学習データをリセットしますか？この操作は取り消せません。';
    document.getElementById('modal-confirm-btn').textContent = 'リセット';
    document.getElementById('modal-confirm-btn').onclick = () => {
        mastered = [];
        mistakes = [];
        history = {};
        save();
        localStorage.removeItem(LS_LAST_SESSION);
        closeModal();
        updateHomeStats();
        showToast('リセットしました');
    };
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// ===== EXPORT/IMPORT =====
function exportData() {
    const data = {
        mastered, mistakes, history,
        memo: localStorage.getItem(LS_MEMO) || '',
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fp3_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast('バックアップを保存しました');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                mastered = data.mastered || [];
                mistakes = data.mistakes || [];
                history = data.history || {};
                save();
                if (data.memo) {
                    localStorage.setItem(LS_MEMO, data.memo);
                    document.getElementById('memo-input').value = data.memo;
                }
                updateHomeStats();
                showToast('バックアップを復元しました');
            } catch (err) {
                showToast('ファイルの読み込みに失敗しました');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ===== TOAST =====
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
}

// ===== KEYBOARD =====
function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('card-screen').classList.contains('active')) return;
        if (e.key === 'ArrowRight' || e.key === 'l') nextCard();
        else if (e.key === 'ArrowLeft' || e.key === 'h') prevCard();
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipCard(); }
        else if (e.key === '1') markMistake();
        else if (e.key === '2') markUnsure();
        else if (e.key === '3') markCorrect();
    });
}

// ===== SWIPE =====
function setupSwipe() {
    let startX = 0, startY = 0;
    const area = document.getElementById('card-area');
    if (!area) return;

    area.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    area.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            if (dx < 0) nextCard();
            else prevCard();
        }
    }, { passive: true });
}

// ===== UTILS =====
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
