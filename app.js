// ===== STATE =====
let currentMode = 'all';
let orderMode = 'random';
let deck = [];
let deckIndex = 0;
let isFlipped = false;
let categoryFilter = null;
let reviewFilter = { correct: false, unsure: true, incorrect: true };

// Session results tracking
let sessionResults = { correct: 0, unsure: 0, incorrect: 0 };

// LocalStorage keys
const LS_PREFIX = 'gijutsushi_';
const LS_MISTAKES = LS_PREFIX + 'mistakes';
const LS_HISTORY = LS_PREFIX + 'history';
const LS_LAST_SESSION = LS_PREFIX + 'last_session';
const LS_MEMO = LS_PREFIX + 'memo';

// ===== UTILITY =====
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// ===== DATA ACCESS =====
function getMistakes() {
    try { return JSON.parse(localStorage.getItem(LS_MISTAKES) || '[]'); }
    catch { return []; }
}
function setMistakes(arr) {
    localStorage.setItem(LS_MISTAKES, JSON.stringify(arr));
}

function getHistory() {
    try { return JSON.parse(localStorage.getItem(LS_HISTORY) || '{}'); }
    catch { return {}; }
}
function setHistory(obj) {
    localStorage.setItem(LS_HISTORY, JSON.stringify(obj));
}

function recordResult(qNum, result) {
    const history = getHistory();
    if (!history[qNum]) {
        history[qNum] = { correct: 0, incorrect: 0, unsure: 0, last: null, lastDate: null };
    }
    if (history[qNum].unsure === undefined) history[qNum].unsure = 0;
    history[qNum][result]++;
    history[qNum].last = result;
    history[qNum].lastDate = Date.now();
    setHistory(history);
}

// ===== INIT =====
function init() {
    updateHomeStats();
    updateResumeCard();
    initMemo();
    setupKeyboard();
    setupSwipe();
}

function updateHomeStats() {
    const total = QUESTIONS.length;
    document.getElementById('stat-total').textContent = total;

    const history = getHistory();
    let totalCorrect = 0, totalUnsure = 0, totalIncorrect = 0, totalAttempts = 0;
    Object.values(history).forEach(h => {
        totalCorrect += h.correct;
        totalUnsure += h.unsure || 0;
        totalIncorrect += h.incorrect;
        totalAttempts += h.correct + h.incorrect + (h.unsure || 0);
    });

    document.getElementById('stat-accuracy').textContent =
        totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) + '%' : '-';
    document.getElementById('stat-unsure-rate').textContent =
        totalAttempts > 0 ? Math.round((totalUnsure / totalAttempts) * 100) + '%' : '-';
    document.getElementById('stat-incorrect-rate').textContent =
        totalAttempts > 0 ? Math.round((totalIncorrect / totalAttempts) * 100) + '%' : '-';

    const attemptedCount = Object.keys(history).length;
    const pct = total > 0 ? Math.round((attemptedCount / total) * 100) : 0;
    document.getElementById('progress-fill').style.width = pct + '%';
    document.getElementById('progress-pct').textContent = pct + '%';

    // Counts
    document.getElementById('count-all').textContent = total + '問';
    document.getElementById('count-all-seq').textContent = total + '問';

    // Category counts
    const kisoCount = QUESTIONS.filter(q => q.category === 'kiso').length;
    const tekiseiCount = QUESTIONS.filter(q => q.category === 'tekisei').length;
    const nijiCount = QUESTIONS.filter(q => q.category === 'niji').length;
    document.getElementById('count-kiso').textContent = kisoCount + '問';
    document.getElementById('count-tekisei').textContent = tekiseiCount + '問';
    document.getElementById('count-niji').textContent = nijiCount + '問';

    // Review filter counts
    updateReviewFilterCounts();
}

function updateReviewFilterCounts() {
    const history = getHistory();
    const mistakes = getMistakes();
    let correctCount = 0, unsureCount = 0, incorrectCount = 0;

    QUESTIONS.forEach(q => {
        const hist = history[q.num];
        const inMistakes = mistakes.includes(q.num);

        if (!inMistakes && hist && hist.last === 'correct') correctCount++;
        else if (inMistakes && hist && hist.last === 'unsure') unsureCount++;
        else if (inMistakes) incorrectCount++;
    });

    document.getElementById('count-filter-correct').textContent = correctCount;
    document.getElementById('count-filter-unsure').textContent = unsureCount;
    document.getElementById('count-filter-incorrect').textContent = incorrectCount;

    // Total review count based on active filters
    let reviewCount = 0;
    if (reviewFilter.correct) reviewCount += correctCount;
    if (reviewFilter.unsure) reviewCount += unsureCount;
    if (reviewFilter.incorrect) reviewCount += incorrectCount;
    document.getElementById('count-mistakes').textContent = reviewCount + '問';

    // Ever incorrect
    let everIncorrect = 0;
    QUESTIONS.forEach(q => {
        const hist = history[q.num];
        if (hist && hist.incorrect > 0) everIncorrect++;
    });
    document.getElementById('count-ever-incorrect').textContent = everIncorrect + '問';
}

function toggleReviewFilter(type) {
    reviewFilter[type] = !reviewFilter[type];
    document.getElementById(`filter-${type}-btn`).classList.toggle('active', reviewFilter[type]);
    updateReviewFilterCounts();
}

// ===== NAVIGATION =====
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function goHome() {
    categoryFilter = null;
    updateHomeStats();
    updateResumeCard();
    showScreen('home-screen');
}

// ===== START MODES =====
function startMode(mode, order) {
    currentMode = mode;
    orderMode = order || 'random';
    categoryFilter = null;
    sessionResults = { correct: 0, unsure: 0, incorrect: 0 };

    const mistakes = getMistakes();
    const history = getHistory();

    if (mode === 'all') {
        deck = QUESTIONS.map((q, i) => i);
        const label = orderMode === 'sequential' ? '全問（順番）' : '全問（ランダム）';
        setModeLabel(label, 'var(--accent-soft)', 'var(--accent)');
    } else if (mode === 'ever_incorrect') {
        deck = QUESTIONS.map((q, i) => i).filter(i => {
            const hist = history[QUESTIONS[i].num];
            return hist && hist.incorrect > 0;
        });
        setModeLabel('不正解履歴', '#fee2e2', '#dc2626');
    } else {
        // Review mode
        deck = QUESTIONS.map((q, i) => i).filter(i => {
            const qNum = QUESTIONS[i].num;
            const hist = history[qNum];
            const inMistakes = mistakes.includes(qNum);

            if (!inMistakes && hist && hist.last === 'correct') return reviewFilter.correct;
            if (inMistakes && hist && hist.last === 'unsure') return reviewFilter.unsure;
            if (inMistakes) return reviewFilter.incorrect;
            return false;
        });
        setModeLabel('復習モード', 'var(--orange-soft)', 'var(--orange)');
    }

    if (deck.length === 0) {
        showToast('対象の問題がありません');
        return;
    }

    if (orderMode === 'random') shuffleArray(deck);
    deckIndex = 0;
    isFlipped = false;

    showScreen('card-screen');
    renderCard();
}

function startCategoryMode(cat) {
    currentMode = 'category';
    orderMode = 'random';
    categoryFilter = cat;
    sessionResults = { correct: 0, unsure: 0, incorrect: 0 };

    deck = QUESTIONS.map((q, i) => i).filter(i => QUESTIONS[i].category === cat);

    const catInfo = CATEGORIES[cat];
    setModeLabel(catInfo.name, `${catInfo.color}22`, catInfo.color);

    if (deck.length === 0) {
        showToast('対象の問題がありません');
        return;
    }

    shuffleArray(deck);
    deckIndex = 0;
    isFlipped = false;

    showScreen('card-screen');
    renderCard();
}

function setModeLabel(text, bg, color) {
    const el = document.getElementById('card-mode-label');
    el.textContent = text;
    el.style.background = bg;
    el.style.color = color;
}

function shuffleDeck() {
    shuffleArray(deck);
    deckIndex = 0;
    isFlipped = false;
    renderCard();
    showToast('シャッフルしました');
}

// ===== RENDER CARD =====
function renderCard() {
    if (deckIndex < 0) deckIndex = 0;
    if (deckIndex >= deck.length) {
        showComplete();
        return;
    }

    const q = QUESTIONS[deck[deckIndex]];
    const flashcard = document.getElementById('flashcard');

    flashcard.classList.remove('flipped');
    isFlipped = false;

    // Counter
    document.getElementById('card-counter').textContent = `${deckIndex + 1} / ${deck.length}`;

    // Mini progress
    const pct = ((deckIndex + 1) / deck.length) * 100;
    document.getElementById('card-mini-progress-fill').style.width = pct + '%';

    // Front - header
    const qNum = String(q.num).padStart(3, '0');
    document.getElementById('card-q-number').textContent = `Q.${qNum}`;

    const catLabel = CATEGORIES[q.category] ? CATEGORIES[q.category].name : '';
    const subLabel = q.subcategory || '';
    document.getElementById('card-q-category').textContent = subLabel ? `${catLabel} / ${subLabel}` : catLabel;

    // History badge
    const historyBadge = document.getElementById('card-history-badge');
    const hist = getHistory()[q.num];
    if (hist && hist.last) {
        const total = hist.correct + hist.incorrect + (hist.unsure || 0);
        let badgeClass, badgeIcon, badgeLabel;
        if (hist.last === 'correct') {
            badgeClass = 'badge-correct';
            badgeIcon = '○';
            badgeLabel = '前回 正解';
        } else if (hist.last === 'unsure') {
            badgeClass = 'badge-unsure';
            badgeIcon = '△';
            badgeLabel = '前回 微妙';
        } else {
            badgeClass = 'badge-incorrect';
            badgeIcon = '×';
            badgeLabel = '前回 不正解';
        }
        historyBadge.className = 'card-history-badge ' + badgeClass;
        let statsText = '';
        if (total > 1) {
            statsText = `${hist.correct}正解`;
            if (hist.unsure) statsText += ` / ${hist.unsure}微妙`;
            statsText += ` / ${hist.incorrect}不正解`;
        }
        historyBadge.innerHTML =
            `<span class="badge-icon">${badgeIcon}</span>` +
            `<span class="badge-label">${badgeLabel}</span>` +
            (statsText ? `<span class="badge-stats">${statsText}</span>` : '');
        historyBadge.style.display = '';
    } else {
        historyBadge.style.display = 'none';
    }

    // Question text
    document.getElementById('card-q-text').textContent = q.question;

    // Choices
    const choicesEl = document.getElementById('card-choices');
    choicesEl.innerHTML = '';
    if (q.choices && q.choices.length > 0) {
        q.choices.forEach(c => {
            const div = document.createElement('div');
            div.className = 'choice-item';
            div.innerHTML = `<span class="choice-letter">${c.letter}.</span><span class="choice-text">${escapeHtml(c.text)}</span>`;
            choicesEl.appendChild(div);
        });
    }

    // Back - Answer
    document.getElementById('card-answer').textContent = `正解：${q.answer}`;

    // Back - Explanation
    const explEl = document.getElementById('card-explanation');
    if (q.explanation) {
        explEl.innerHTML = `<h4>解説</h4><p>${escapeHtml(q.explanation)}</p>`;
    } else {
        explEl.innerHTML = '';
    }

    // Back - Incorrect explanations
    const incorrectEl = document.getElementById('card-incorrect');
    if (q.incorrect_explanations && q.incorrect_explanations.length > 0) {
        let html = '<h4>不正解の選択肢の補足</h4>';
        q.incorrect_explanations.forEach(ie => {
            html += `<div class="incorrect-item"><span class="choice-letter">${ie.letter}.</span><span><strong>${escapeHtml(ie.text)}</strong>：${escapeHtml(ie.reason)}</span></div>`;
        });
        incorrectEl.innerHTML = html;
    } else {
        incorrectEl.innerHTML = '';
    }

    // Back - Detailed explanation
    const detailedEl = document.getElementById('card-detailed');
    if (q.detailed_explanation) {
        detailedEl.innerHTML = `<h4>詳細解説</h4><pre>${escapeHtml(q.detailed_explanation)}</pre>`;
    } else {
        detailedEl.innerHTML = '';
    }

    // Update action button states
    updateActionButtons(q.num);

    // Save session
    saveSession();
}

function updateActionButtons(qNum) {
    const mistakes = getMistakes();
    const hist = getHistory()[qNum];

    const mistakeBtn = document.getElementById('btn-mark-mistake');
    const unsureBtn = document.getElementById('btn-mark-unsure');
    const correctBtn = document.getElementById('btn-mark-correct');

    const isInMistakes = mistakes.includes(qNum);
    const isIncorrect = isInMistakes && (!hist || hist.last === 'incorrect');
    mistakeBtn.classList.toggle('active', isIncorrect);
    unsureBtn.classList.toggle('active', !!(hist && hist.last === 'unsure'));
    correctBtn.classList.toggle('active', !!(hist && hist.last === 'correct'));
}

// ===== CARD INTERACTIONS =====
function flipCard() {
    const flashcard = document.getElementById('flashcard');
    isFlipped = !isFlipped;
    flashcard.classList.toggle('flipped', isFlipped);
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

function markMistake() {
    const q = QUESTIONS[deck[deckIndex]];
    const mistakes = getMistakes();
    const hist = getHistory()[q.num];

    if (hist && hist.last === 'incorrect') {
        setMistakes(mistakes.filter(n => n !== q.num));
        showToast('不正解マークを解除しました');
    } else {
        if (!mistakes.includes(q.num)) {
            mistakes.push(q.num);
            setMistakes(mistakes);
        }
        recordResult(q.num, 'incorrect');
        sessionResults.incorrect++;
        showToast('不正解を記録しました');
    }
    updateActionButtons(q.num);
}

function markUnsure() {
    const q = QUESTIONS[deck[deckIndex]];
    const mistakes = getMistakes();
    const hist = getHistory()[q.num];

    if (hist && hist.last === 'unsure') {
        setMistakes(mistakes.filter(n => n !== q.num));
        showToast('微妙マークを解除しました');
    } else {
        if (!mistakes.includes(q.num)) {
            mistakes.push(q.num);
            setMistakes(mistakes);
        }
        recordResult(q.num, 'unsure');
        sessionResults.unsure++;
        showToast('微妙を記録しました');
    }
    updateActionButtons(q.num);
}

function markCorrect() {
    const q = QUESTIONS[deck[deckIndex]];
    recordResult(q.num, 'correct');

    const mistakes = getMistakes();
    if (mistakes.includes(q.num)) {
        setMistakes(mistakes.filter(n => n !== q.num));
    }

    sessionResults.correct++;
    updateActionButtons(q.num);
    showToast('正解を記録しました');
}

// ===== COMPLETE SCREEN =====
function showComplete() {
    document.getElementById('complete-correct').textContent = sessionResults.correct;
    document.getElementById('complete-unsure').textContent = sessionResults.unsure;
    document.getElementById('complete-incorrect').textContent = sessionResults.incorrect;

    showScreen('complete-screen');
}

// ===== SESSION =====
function saveSession() {
    const session = {
        mode: currentMode,
        order: orderMode,
        category: categoryFilter,
        deckIndex: deckIndex,
        deck: deck,
        timestamp: Date.now()
    };
    localStorage.setItem(LS_LAST_SESSION, JSON.stringify(session));
}

function updateResumeCard() {
    const card = document.getElementById('resume-card');
    try {
        const session = JSON.parse(localStorage.getItem(LS_LAST_SESSION));
        if (!session || !session.deck || session.deck.length === 0) {
            card.style.display = 'none';
            return;
        }

        let modeName = '全問モード';
        if (session.mode === 'category' && session.category) {
            modeName = CATEGORIES[session.category] ? CATEGORIES[session.category].name : session.category;
        } else if (session.mode === 'mistakes') {
            modeName = '復習モード';
        } else if (session.mode === 'ever_incorrect') {
            modeName = '不正解履歴';
        }

        document.getElementById('resume-mode').textContent = modeName;
        document.getElementById('resume-question').textContent = `${session.deckIndex + 1}/${session.deck.length}問目`;

        card.style.display = '';
    } catch {
        card.style.display = 'none';
    }
}

function resumeSession() {
    try {
        const session = JSON.parse(localStorage.getItem(LS_LAST_SESSION));
        if (!session) return;

        currentMode = session.mode;
        orderMode = session.order;
        categoryFilter = session.category;
        deck = session.deck;
        deckIndex = session.deckIndex;
        isFlipped = false;
        sessionResults = { correct: 0, unsure: 0, incorrect: 0 };

        if (currentMode === 'category' && categoryFilter && CATEGORIES[categoryFilter]) {
            const cat = CATEGORIES[categoryFilter];
            setModeLabel(cat.name, `${cat.color}22`, cat.color);
        } else if (currentMode === 'mistakes') {
            setModeLabel('復習モード', 'var(--orange-soft)', 'var(--orange)');
        } else if (currentMode === 'ever_incorrect') {
            setModeLabel('不正解履歴', '#fee2e2', '#dc2626');
        } else {
            const label = orderMode === 'sequential' ? '全問（順番）' : '全問（ランダム）';
            setModeLabel(label, 'var(--accent-soft)', 'var(--accent)');
        }

        showScreen('card-screen');
        renderCard();
    } catch {
        showToast('セッションの復元に失敗しました');
    }
}

// ===== MEMO =====
function initMemo() {
    const memo = localStorage.getItem(LS_MEMO) || '';
    document.getElementById('memo-input').value = memo;
}

function saveMemo() {
    localStorage.setItem(LS_MEMO, document.getElementById('memo-input').value);
}

// ===== RESET =====
function confirmReset() {
    document.getElementById('modal-title').textContent = 'データリセット';
    document.getElementById('modal-message').textContent = 'すべての学習データを削除します。この操作は取り消せません。';
    document.getElementById('modal-confirm-btn').textContent = 'リセット';
    document.getElementById('modal-confirm-btn').onclick = () => {
        localStorage.removeItem(LS_MISTAKES);
        localStorage.removeItem(LS_HISTORY);
        localStorage.removeItem(LS_LAST_SESSION);
        updateHomeStats();
        updateResumeCard();
        closeModal();
        showToast('リセットしました');
    };
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}

// ===== EXPORT / IMPORT =====
function exportData() {
    const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        history: getHistory(),
        mistakes: getMistakes(),
        memo: localStorage.getItem(LS_MEMO) || ''
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gijutsushi_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
                if (data.history) setHistory(data.history);
                if (data.mistakes) setMistakes(data.mistakes);
                if (data.memo !== undefined) localStorage.setItem(LS_MEMO, data.memo);
                updateHomeStats();
                initMemo();
                showToast('バックアップを復元しました');
            } catch {
                showToast('ファイルの読み込みに失敗しました');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ===== KEYBOARD =====
function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('card-screen').classList.contains('active')) return;

        // Ignore when typing in inputs
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case ' ':
            case 'Enter':
                e.preventDefault();
                flipCard();
                break;
            case 'ArrowRight':
            case 'l':
                nextCard();
                break;
            case 'ArrowLeft':
            case 'h':
                prevCard();
                break;
            case 'x':
                markMistake();
                break;
            case 'u':
                markUnsure();
                break;
            case 'o':
                markCorrect();
                break;
            case 'Escape':
                goHome();
                break;
        }
    });
}

// ===== SWIPE =====
function setupSwipe() {
    let startX = 0;
    let startY = 0;
    let isDragging = false;

    const area = document.getElementById('card-area');

    area.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isDragging = true;
    }, { passive: true });

    area.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const diffX = endX - startX;
        const diffY = endY - startY;

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
            if (diffX > 0) {
                prevCard();
            } else {
                nextCard();
            }
        }
    }, { passive: true });
}

// ===== TOAST =====
let toastTimeout = null;
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// ===== LAUNCH =====
document.addEventListener('DOMContentLoaded', init);
