// ============================================================
//  Состояние приложения
// ============================================================
let gameState = {
    xp: 0,
    level: 1,
    completedTasks: [],
    unlockedBadges: []
};

let audioCtx = null;

// ============================================================
//  Звуковые эффекты (Web Audio API)
// ============================================================
function playSound(type) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587.33, now); // D5
            osc.frequency.setValueAtTime(880, now + 0.08); // A5
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.linearRampToValueAtTime(90, now + 0.18);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.start(now);
            osc.stop(now + 0.18);
        } else if (type === 'levelUp') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, now);       // C5
            osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
            osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            osc.start(now);
            osc.stop(now + 0.45);
        }
    } catch (e) {
        console.warn('Audio is not supported or blocked:', e);
    }
}

// ============================================================
//  Сохранение / Загрузка прогресса (LocalStorage)
// ============================================================
function loadProgress() {
    const saved = localStorage.getItem('minecoder_progress');
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        gameState = {
            xp: parsed.xp || 0,
            level: parsed.level || 1,
            completedTasks: Array.isArray(parsed.completedTasks) ? parsed.completedTasks : [],
            unlockedBadges: Array.isArray(parsed.unlockedBadges) ? parsed.unlockedBadges : []
        };
    } catch (e) {
        console.warn('Ошибка чтения прогресса, сброс к начальным значениям');
        gameState = { xp: 0, level: 1, completedTasks: [], unlockedBadges: [] };
    }
    updateUI();
}

function saveProgress() {
    localStorage.setItem('minecoder_progress', JSON.stringify(gameState));
    updateUI();
}

// ============================================================
//  Обновление интерфейса и наград
// ============================================================
function updateUI() {
    const lvlEl = document.getElementById('user-level');
    const xpTextEl = document.getElementById('user-xp-text');
    const xpIndicator = document.getElementById('xp-indicator');

    if (lvlEl) lvlEl.innerText = 'УРОВЕНЬ: ' + gameState.level;

    const xpNeeded = gameState.level * 100;
    if (xpTextEl) xpTextEl.innerText = 'XP: ' + gameState.xp + '/' + xpNeeded;

    const percent = Math.min(100, Math.max(0, (gameState.xp / xpNeeded) * 100));
    if (xpIndicator) xpIndicator.style.width = percent + '%';

    // Значки (Badges)
    gameState.unlockedBadges.forEach(function(badgeNum) {
        const badgeEl = document.getElementById('badge-' + badgeNum);
        if (badgeEl) badgeEl.classList.add('unlocked');
    });

    // Разблокировка кнопок перехода между уроками
    const lessonButtons = ['next-1', 'next-2', 'next-3', 'next-4', 'next-5'];
    lessonButtons.forEach(function(btnId, idx) {
        const lessonNum = idx + 1;
        const taskIds = [1, 2, 3].map(function(t) { return lessonNum + '-' + t; });
        const allDone = taskIds.every(function(id) { return gameState.completedTasks.includes(id); });
        const btn = document.getElementById(btnId);
        if (btn && allDone) {
            btn.classList.remove('disabled');
            btn.removeAttribute('disabled');
        }
    });
}

function addXP(amount) {
    gameState.xp += amount;
    let xpNeeded = gameState.level * 100;
    while (gameState.xp >= xpNeeded) {
        gameState.xp -= xpNeeded;
        gameState.level += 1;
        xpNeeded = gameState.level * 100;
        setTimeout(function() { playSound('levelUp'); }, 200);
    }
    saveProgress();
}

function completeTask(taskId, xpAmount) {
    if (!gameState.completedTasks.includes(taskId)) {
        gameState.completedTasks.push(taskId);
        addXP(xpAmount);
    }
    checkLessonBadge(taskId);
}

function checkLessonBadge(taskId) {
    const lessonNum = taskId.split('-')[0];
    const taskIds = [1, 2, 3].map(function(t) { return lessonNum + '-' + t; });
    const allDone = taskIds.every(function(id) { return gameState.completedTasks.includes(id); });

    if (allDone) {
        const badgeNum = parseInt(lessonNum, 10);
        if (!gameState.unlockedBadges.includes(badgeNum)) {
            gameState.unlockedBadges.push(badgeNum);
            saveProgress();
        }
    }
    updateUI();
}

function goToScreen(screenId) {
    document.querySelectorAll('.screen').forEach(function(s) {
        s.classList.remove('active');
    });
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        window.scrollTo(0, 0);
    }
}

// ============================================================
//  Механика: Последовательности (Сборка по клику + Отмена)
// ============================================================
function setupSequence(slotsId, poolId, stateRef, defaultPlaceholder) {
    const pool = document.getElementById(poolId);
    const slots = document.getElementById(slotsId);
    if (!pool || !slots) return;

    const blocks = pool.querySelectorAll('.seq-block');

    blocks.forEach(function(block) {
        block.addEventListener('click', function() {
            if (this.classList.contains('selected')) return;

            const step = this.getAttribute('data-step');
            const label = this.innerText;

            this.classList.add('selected');
            stateRef.selected.push(step);

            // Очищаем плейсхолдер при первом добавлении
            if (stateRef.selected.length === 1) {
                slots.innerHTML = '';
            }

            const slotItem = document.createElement('div');
            slotItem.className = 'seq-block';
            slotItem.setAttribute('data-step', step);
            slotItem.innerText = stateRef.selected.length + '. ' + label;

            // Клик по выбранному элементу в слотах возвращает его назад
            slotItem.addEventListener('click', function() {
                const removeStep = this.getAttribute('data-step');
                const idx = stateRef.selected.indexOf(removeStep);
                if (idx !== -1) {
                    stateRef.selected.splice(idx, 1);
                }

                block.classList.remove('selected');
                this.remove();

                // Перенумеровываем оставшиеся слоты
                const remainingSlots = slots.querySelectorAll('.seq-block');
                remainingSlots.forEach(function(item, i) {
                    const text = item.innerText.replace(/^\d+\.\s*/, '');
                    item.innerText = (i + 1) + '. ' + text;
                });

                if (stateRef.selected.length === 0) {
                    slots.innerHTML = '<span style="color:#666;font-size:11px;">' + defaultPlaceholder + '</span>';
                }
            });

            slots.appendChild(slotItem);
        });
    });
}

function resetSequence(slotsId, poolId, stateRef, placeholderText) {
    stateRef.selected = [];
    const slots = document.getElementById(slotsId);
    const pool = document.getElementById(poolId);
    if (slots) {
        slots.innerHTML = '<span style="color:#666;font-size:11px;">' + placeholderText + '</span>';
    }
    if (pool) {
        pool.querySelectorAll('.seq-block').forEach(function(b) {
            b.classList.remove('selected');
        });
    }
}

// ============================================================
//  Механика: Одиночный выбор (Радио-кнопки)
// ============================================================
function setupOptionGroup(containerId, stateRef) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const items = container.querySelectorAll('.option-item');

    items.forEach(function(item) {
        item.addEventListener('click', function() {
            items.forEach(function(el) { el.classList.remove('selected'); });
            this.classList.add('selected');
            stateRef.val = this.getAttribute('data-opt');
        });
    });
}

function verifyOption(stateRef, correctOpt, feedbackId, taskId, xpAmount) {
    const fb = document.getElementById(feedbackId);
    if (!fb) return;

    if (!stateRef.val) {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Выбери один из вариантов!</strong>';
        playSound('error');
        return;
    }

    if (stateRef.val === correctOpt) {
        fb.className = 'feedback-box success';
        fb.innerHTML = '<strong>Верно! (+' + xpAmount + ' XP)</strong>';
        playSound('success');
        completeTask(taskId, xpAmount);
    } else {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Неверно.</strong> Попробуй выбрать другой ответ!';
        playSound('error');
    }
}

// ============================================================
//  Механика: Сопоставление пар (Термин -> Определение)
// ============================================================
function setupMatchingPair(containerId, feedbackId, taskId, xpAmount) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let selectedTerm = null;
    let selectedDef = null;
    let matchedCount = 0;

    const terms = container.querySelectorAll('.match-item.term');
    const defs = container.querySelectorAll('.match-item.def');
    const totalPairs = terms.length;

    function checkPairMatch() {
        if (!selectedTerm || !selectedDef) return;

        const termKey = selectedTerm.getAttribute('data-key');
        const defKey = selectedDef.getAttribute('data-key');
        const fb = document.getElementById(feedbackId);

        if (termKey === defKey) {
            selectedTerm.classList.remove('selected');
            selectedDef.classList.remove('selected');
            selectedTerm.classList.add('matched');
            selectedDef.classList.add('matched');

            matchedCount++;
            playSound('success');

            if (matchedCount === totalPairs) {
                fb.className = 'feedback-box success';
                fb.innerHTML = '<strong>Все пары найдены! (+' + xpAmount + ' XP)</strong>';
                completeTask(taskId, xpAmount);
            }
        } else {
            playSound('error');
            const t = selectedTerm;
            const d = selectedDef;
            setTimeout(function() {
                t.classList.remove('selected');
                d.classList.remove('selected');
            }, 300);
        }

        selectedTerm = null;
        selectedDef = null;
    }

    terms.forEach(function(t) {
        t.addEventListener('click', function() {
            if (this.classList.contains('matched')) return;
            terms.forEach(function(item) { item.classList.remove('selected'); });
            this.classList.add('selected');
            selectedTerm = this;
            checkPairMatch();
        });
    });

    defs.forEach(function(d) {
        d.addEventListener('click', function() {
            if (this.classList.contains('matched')) return;
            defs.forEach(function(item) { item.classList.remove('selected'); });
            this.classList.add('selected');
            selectedDef = this;
            checkPairMatch();
        });
    });
}

// ============================================================
//  Переменные состояния для ответов
// ============================================================
const seqState_1_2 = { selected: [] };
const optState_1_3 = { val: null };

const seqState_2_1 = { selected: [] };
const optState_2_2 = { val: null };

const optState_3_1 = { val: null };
const optState_3_3 = { val: null };

const seqState_4_1 = { selected: [] };
const optState_4_2 = { val: null };

const optState_5_2 = { val: null };
const seqState_5_3 = { selected: [] };

// ============================================================
//  Слушатели и проверки уроков
// ============================================================

// Урок 1
function checkTask1_1() {
    const sel = document.getElementById('task1-1-select');
    const fb = document.getElementById('feedback-1-1');
    if (!sel || !fb) return;

    if (sel.value === 'install') {
        fb.className = 'feedback-box success';
        fb.innerHTML = '<strong>Правильно! (+10 XP)</strong><br>Команда <code>npm install mineflayer</code> скачивает библиотеку в проект.';
        playSound('success');
        completeTask('1-1', 10);
    } else {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Неверно.</strong> Для установки пакета используется слово <code>install</code>.';
        playSound('error');
    }
}

function checkTask1_2() {
    const fb = document.getElementById('feedback-1-2');
    const correct = ['npm', 'init', '-y'];

    if (seqState_1_2.selected.length < 3) {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Собери команду целиком из трёх блоков!</strong>';
        playSound('error');
        return;
    }

    const isMatch = seqState_1_2.selected.every(function(val, idx) { return val === correct[idx]; });
    if (isMatch) {
        fb.className = 'feedback-box success';
        fb.innerHTML = '<strong>Верно! (+10 XP)</strong><br><code>npm init -y</code> быстро создает <code>package.json</code>.';
        playSound('success');
        completeTask('1-2', 10);
    } else {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Неверный порядок!</strong> Порядок: утилита -> действие -> флаг.';
        playSound('error');
    }
}

// Урок 2
function checkTask2_1() {
    const fb = document.getElementById('feedback-2-1');
    const correct = ['esc', 'open-lan', 'copy-port'];

    if (seqState_2_1.selected.length < 3) {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Расположи все шаги открытия мира!</strong>';
        playSound('error');
        return;
    }

    const isMatch = seqState_2_1.selected.every(function(val, idx) { return val === correct[idx]; });
    if (isMatch) {
        fb.className = 'feedback-box success';
        fb.innerHTML = '<strong>Верно! (+10 XP)</strong> Сначала Esc -> Сеть -> Получение порта.';
        playSound('success');
        completeTask('2-1', 10);
    } else {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Неверно.</strong> Порт отобразится в чате только после открытия мира для сети.';
        playSound('error');
    }
}

// Урок 3
function checkTask3_2() {
    const sel1 = document.getElementById('gap-select-3-2-1');
    const sel2 = document.getElementById('gap-select-3-2-2');
    const fb = document.getElementById('feedback-3-2');

    if (sel1.value === 'spawn' && sel2.value === 'bot.chat') {
        fb.className = 'feedback-box success';
        fb.innerHTML = '<strong>Отлично! (+10 XP)</strong> Событие <code>spawn</code> гарантирует, что бот готов писать в чат.';
        playSound('success');
        completeTask('3-2', 10);
    } else {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Неверно.</strong> Выбери правильное имя события появления и метод отправки сообщения.';
        playSound('error');
    }
}

// Урок 4
function checkTask4_1() {
    const fb = document.getElementById('feedback-4-1');
    const correct = ['chat', 'move', 'activate'];

    if (seqState_4_1.selected.length < 3) {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Собери последовательность действий бота!</strong>';
        playSound('error');
        return;
    }

    const isMatch = seqState_4_1.selected.every(function(val, idx) { return val === correct[idx]; });
    if (isMatch) {
        fb.className = 'feedback-box success';
        fb.innerHTML = '<strong>Верно! (+10 XP)</strong> Алгоритм исполняется строго сверху вниз.';
        playSound('success');
        completeTask('4-1', 10);
    } else {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Неверный алгоритм!</strong> Сначала приветствие -> перемещение -> взаимодействие.';
        playSound('error');
    }
}

function checkTask4_3() {
    const s1 = document.getElementById('gap-select-4-3-1').value;
    const s2 = document.getElementById('gap-select-4-3-2').value;
    const s3 = document.getElementById('gap-select-4-3-3').value;
    const fb = document.getElementById('feedback-4-3');

    if (s1 === 'entity.position' && s2 === 'moveTo' && s3 === 'chat') {
        fb.className = 'feedback-box success';
        fb.innerHTML = '<strong>Все свойства и методы выбраны правильно! (+10 XP)</strong>';
        playSound('success');
        completeTask('4-3', 10);
    } else {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Есть неточность.</strong> Проверь методы передвижения и отправки текста.';
        playSound('error');
    }
}

// Урок 5
function checkTask5_3() {
    const fb = document.getElementById('feedback-5-3');
    const correct = ['listen', 'check', 'reply', 'log'];

    if (seqState_5_3.selected.length < 4) {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Выстрой все 4 шага цепочки!</strong>';
        playSound('error');
        return;
    }

    const isMatch = seqState_5_3.selected.every(function(val, idx) { return val === correct[idx]; });
    if (isMatch) {
        fb.className = 'feedback-box success';
        fb.innerHTML = '<strong>Отличная работа! (+10 XP)</strong> Алгоритм автоответчика собран идеально.';
        playSound('success');
        completeTask('5-3', 10);
    } else {
        fb.className = 'feedback-box error';
        fb.innerHTML = '<strong>Неверный порядок!</strong> Слушаем событие -> Проверяем текст -> Отвечаем -> Пишем в консоль.';
        playSound('error');
    }
}

// ============================================================
//  Сброс курса (Начать заново)
// ============================================================
function restartCourse() {
    gameState = {
        xp: 0,
        level: 1,
        completedTasks: [],
        unlockedBadges: []
    };
    saveProgress();

    // Сброс select и текстовых подсказок в коде
    document.querySelectorAll('.code-select').forEach(function(s) { s.value = ''; });
    document.querySelectorAll('.gap-highlight').forEach(function(span) { span.innerText = '___'; });

    // Сброс фидбеков
    document.querySelectorAll('.feedback-box').forEach(function(fb) {
        fb.className = 'feedback-box';
        fb.innerHTML = '';
    });

    // Сброс вариантов выбора
    document.querySelectorAll('.option-item').forEach(function(item) {
        item.classList.remove('selected');
    });

    optState_1_3.val = null;
    optState_2_2.val = null;
    optState_3_1.val = null;
    optState_3_3.val = null;
    optState_4_2.val = null;
    optState_5_2.val = null;

    // Сброс пар сопоставления
    document.querySelectorAll('.match-item').forEach(function(el) {
        el.classList.remove('selected', 'matched');
    });

    // Переинициализация сопоставлений
    setupMatchingPair('task-container-2-3', 'feedback-2-3', '2-3', 10);
    setupMatchingPair('task-container-5-1', 'feedback-5-1', '5-1', 10);

    // Сброс последовательностей
    resetSequence('seq-slots-1-2', 'seq-pool-1-2', seqState_1_2, 'Кликай по блокам внизу');
    resetSequence('seq-slots-2-1', 'seq-pool-2-1', seqState_2_1, 'Кликай по шагам');
    resetSequence('seq-slots-4-1', 'seq-pool-4-1', seqState_4_1, 'Кликай по командам');
    resetSequence('seq-slots-5-3', 'seq-pool-5-3', seqState_5_3, 'Кликай по шагам');

    // Блокировка кнопок перехода
    document.querySelectorAll('[id^="next-"]').forEach(function(btn) {
        btn.classList.add('disabled');
        btn.setAttribute('disabled', 'true');
    });

    // Сброс значков
    document.querySelectorAll('.badge-card').forEach(function(card) {
        card.classList.remove('unlocked');
    });

    goToScreen('screen-start');
}

// ============================================================
//  Инициализация после загрузки DOM
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    loadProgress();

    // 1. Инициализация последовательностей
    setupSequence('seq-slots-1-2', 'seq-pool-1-2', seqState_1_2, 'Кликай по блокам внизу');
    setupSequence('seq-slots-2-1', 'seq-pool-2-1', seqState_2_1, 'Кликай по шагам');
    setupSequence('seq-slots-4-1', 'seq-pool-4-1', seqState_4_1, 'Кликай по командам');
    setupSequence('seq-slots-5-3', 'seq-pool-5-3', seqState_5_3, 'Кликай по шагам');

    // 2. Инициализация опций (радио)
    setupOptionGroup('options-container-1-3', optState_1_3);
    setupOptionGroup('options-container-2-2', optState_2_2);
    setupOptionGroup('options-container-3-1', optState_3_1);
    setupOptionGroup('options-container-3-3', optState_3_3);
    setupOptionGroup('options-container-4-2', optState_4_2);
    setupOptionGroup('options-container-5-2', optState_5_2);

    // 3. Инициализация сопоставления пар
    setupMatchingPair('task-container-2-3', 'feedback-2-3', '2-3', 10);
    setupMatchingPair('task-container-5-1', 'feedback-5-1', '5-1', 10);

    // 4. Подсветка кода при выборе значений в select
    const gapMap = [
        { selectId: 'gap-select-3-2-1', spanId: 'gap-3-2-1' },
        { selectId: 'gap-select-3-2-2', spanId: 'gap-3-2-2' },
        { selectId: 'gap-select-4-3-1', spanId: 'gap-4-3-1' },
        { selectId: 'gap-select-4-3-2', spanId: 'gap-4-3-2' },
        { selectId: 'gap-select-4-3-3', spanId: 'gap-4-3-3' }
    ];

    gapMap.forEach(function(item) {
        const el = document.getElementById(item.selectId);
        const span = document.getElementById(item.spanId);
        if (el && span) {
            el.addEventListener('change', function() {
                span.innerText = this.value || '___';
            });
        }
    });

    // 5. Кнопки проверки заданий
    const btn1_1 = document.getElementById('btn-check-1-1');
    if (btn1_1) btn1_1.addEventListener('click', checkTask1_1);

    const btn1_2 = document.getElementById('btn-check-1-2');
    if (btn1_2) btn1_2.addEventListener('click', checkTask1_2);

    const btn1_3 = document.getElementById('btn-check-1-3');
    if (btn1_3) btn1_3.addEventListener('click', function() {
        verifyOption(optState_1_3, 'opt-2', 'feedback-1-3', '1-3', 10);
    });

    const btn2_1 = document.getElementById('btn-check-2-1');
    if (btn2_1) btn2_1.addEventListener('click', checkTask2_1);

    const btn2_2 = document.getElementById('btn-check-2-2');
    if (btn2_2) btn2_2.addEventListener('click', function() {
        verifyOption(optState_2_2, 'opt-2', 'feedback-2-2', '2-2', 10);
    });

    const btn3_1 = document.getElementById('btn-check-3-1');
    if (btn3_1) btn3_1.addEventListener('click', function() {
        verifyOption(optState_3_1, 'opt-2', 'feedback-3-1', '3-1', 10);
    });

    const btn3_2 = document.getElementById('btn-check-3-2');
    if (btn3_2) btn3_2.addEventListener('click', checkTask3_2);

    const btn3_3 = document.getElementById('btn-check-3-3');
    if (btn3_3) btn3_3.addEventListener('click', function() {
        verifyOption(optState_3_3, 'opt-2', 'feedback-3-3', '3-3', 10);
    });

    const btn4_1 = document.getElementById('btn-check-4-1');
    if (btn4_1) btn4_1.addEventListener('click', checkTask4_1);

    const btn4_2 = document.getElementById('btn-check-4-2');
    if (btn4_2) btn4_2.addEventListener('click', function() {
        verifyOption(optState_4_2, 'opt-1', 'feedback-4-2', '4-2', 10);
    });

    const btn4_3 = document.getElementById('btn-check-4-3');
    if (btn4_3) btn4_3.addEventListener('click', checkTask4_3);

    const btn5_2 = document.getElementById('btn-check-5-2');
    if (btn5_2) btn5_2.addEventListener('click', function() {
        verifyOption(optState_5_2, 'opt-2', 'feedback-5-2', '5-2', 10);
    });

    const btn5_3 = document.getElementById('btn-check-5-3');
    if (btn5_3) btn5_3.addEventListener('click', checkTask5_3);

    // 6. Навигационные кнопки
    document.getElementById('btn-start-game').addEventListener('click', function() {
        goToScreen('screen-intro');
    });

    document.getElementById('btn-intro-next').addEventListener('click', function() {
        goToScreen('screen-lesson1');
    });

    document.getElementById('next-1').addEventListener('click', function() {
        goToScreen('screen-lesson2');
    });

    document.getElementById('next-2').addEventListener('click', function() {
        goToScreen('screen-lesson3');
    });

    document.getElementById('next-3').addEventListener('click', function() {
        goToScreen('screen-lesson4');
    });

    document.getElementById('next-4').addEventListener('click', function() {
        goToScreen('screen-lesson5');
    });

    document.getElementById('next-5').addEventListener('click', function() {
        goToScreen('screen-final');
    });

    document.getElementById('btn-restart').addEventListener('click', restartCourse);

    // 7. Поддержка установки PWA
    let deferredPrompt;
    const installBtn = document.getElementById('pwa-install-btn');

    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) {
            installBtn.classList.remove('pwa-hidden');
        }
    });

    if (installBtn) {
        installBtn.addEventListener('click', async function() {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const choice = await deferredPrompt.userChoice;
                if (choice.outcome === 'accepted') {
                    installBtn.classList.add('pwa-hidden');
                }
                deferredPrompt = null;
            }
        });
    }
});

// Регистрация Service Worker для PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('sw.js')
            .then(function() {
                console.log('Service Worker успешно зарегистрирован');
            })
            .catch(function(err) {
                console.warn('Ошибка Service Worker:', err);
            });
    });
}