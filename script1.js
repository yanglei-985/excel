let words = [];

let wrongWords = new Set();

let currentIndex = 0;

let isReviewMode = false;

let correctCount = 0;

let totalAttempts = 0;

let originalWords = [];

let isAnswerShown = false;

let autoPlayEnabled = true;

let seenWords = new Set();

let knownWords = new Set();

let currentMode = 'all'; // 只保留一种模式

let currentUtterance = null;

let allWords = []; // 存储所有上传过的单词

// OpenAI API 配置

const OPENAI_API_KEY = 'sk-G8fwDqN0IaB0hayInoXa7I72vwSdd9V4C2K9c1wwmncvEHjH';

const OPENAI_API_ENDPOINT = 'https://api.aigc.bar/v1/chat/completions';



// 添加音频缓存

const audioCache = new Map();

  

// 添加一个变量来跟踪当前单词的发音状态

let currentWordAudioPromise = null;

  

function initProgressBar() {

    const progressBar = document.querySelector('.progress-bar');

    const progressFill = document.getElementById('progressFill');

    const handle = progressFill.querySelector('.progress-handle');

    const tooltip = document.querySelector('.progress-tooltip');

    let isDragging = false;

  

    // 更新进度条位置和单词

    function updateProgressPosition(e) {

        const rect = progressBar.getBoundingClientRect();

        let percentage = (e.clientX - rect.left) / rect.width;

        percentage = Math.max(0, Math.min(1, percentage));

        // 更新进度条和提示

        const width = percentage * 100;

        progressFill.style.width = `${width}%`;

        // 计算并更新单词位置

        const newIndex = Math.floor(percentage * words.length);

        if (newIndex >= 0 && newIndex < words.length) {

            tooltip.textContent = `${newIndex + 1}/${words.length}`;

            tooltip.style.left = `${width}%`;

            tooltip.style.opacity = '1';

            if (newIndex !== currentIndex) {

                currentIndex = newIndex;

                showWord();

            }

        }

    }

  

    // 点击进度条

    progressBar.addEventListener('mousedown', function(e) {

        isDragging = true;

        updateProgressPosition(e);

        document.body.style.cursor = 'grabbing';

    });

  

    // 拖动过程

    document.addEventListener('mousemove', function(e) {

        if (isDragging) {

            updateProgressPosition(e);

        }

    });

  

    // 结束拖动

    document.addEventListener('mouseup', function() {

        isDragging = false;

        document.body.style.cursor = 'default';

    });

  

    // 鼠标悬停显示提示

    progressBar.addEventListener('mousemove', function(e) {

        if (!isDragging) {

            const rect = progressBar.getBoundingClientRect();

            const percentage = (e.clientX - rect.left) / rect.width;

            const hoverIndex = Math.floor(percentage * words.length);

            tooltip.textContent = `${hoverIndex + 1}/${words.length}`;

            tooltip.style.left = `${percentage * 100}%`;

            tooltip.style.opacity = '1';

        }

    });

  

    progressBar.addEventListener('mouseleave', function() {

        if (!isDragging) {

            tooltip.style.opacity = '0';

        }

    });

}

  

document.getElementById('uploadBtn').addEventListener('click', function() {

    console.log("Upload button clicked"); // 调试信息

    const fileInput = document.getElementById('excelFile');

    const file = fileInput.files[0];

    if (file) {

        console.log("File selected:", file.name); // 调试信息

        const reader = new FileReader();

        reader.onload = function(e) {

            try {

                const data = new Uint8Array(e.target.result);

                const workbook = XLSX.read(data, {type: 'array'});

                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                const rawData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

                console.log("Excel data loaded:", rawData); // 调试信息

                // 处理新上传的单词

                const newWords = rawData.slice(1).map(row => ({

                    word: row[0],         // 第一列作为单词

                    translation: row[1] || '' // 第二列作为翻译

                })).filter(item => item.word);

                // 更新单词列表

                words = [...newWords];

                originalWords = [...newWords];

                // 保存到localStorage

                localStorage.setItem('allVocabularyWords', JSON.stringify(words));

                if (words.length > 0) {

                    // 更新界面显示

                    const mainContent = document.querySelector('.main-content');

                    mainContent.style.display = 'flex';

                    document.querySelector('.upload-section').style.display = 'none';

                    document.querySelector('.study-section').style.display = 'block';

                    document.querySelector('.history-panel').style.display = 'block';

                    // 初始化各个功能

                    showWord();

                    initializeJumpControls();

                    initializeExportButton();

                    initializeComparisonControls();

                }

            } catch (error) {

                console.error("Error processing file:", error);

                alert('处理文件时出错，请确保文件格式正确');

            }

        };

        reader.onerror = function() {

            console.error("File reading failed");

            alert('读取文件失败，请重试');

        };

        reader.readAsArrayBuffer(file);

    } else {

        alert('请选择一个Excel文件');

    }

});

  

document.getElementById('showAnswer').addEventListener('click', function() {

    showAnswer();

});

  

document.getElementById('nextWord').addEventListener('click', function() {

    nextWord();

});

  

document.addEventListener('keydown', function(event) {

    if (event.key === 'Enter') {

        stopCurrentWordActivities(); // 停止当前单词的所有活动

        if (!isAnswerShown) {

            showAnswer();

        } else {

            nextWord();

        }

    } else if (event.key === 'Shift') {

        stopCurrentWordActivities(); // 停止当前单词的所有活动

        const currentWord = words[currentIndex];

        const realIndex = originalWords.findIndex(w =>

            w.word === currentWord.word && w.translation === currentWord.translation

        );

        wrongWords.add(realIndex);

        const wordCard = document.querySelector('.word-card');

        wordCard.classList.add('wrong-word');

        updateWordHistory();

    }

});

  

async function playPronunciation(text, times = 1, currentTimes = 1) {

    try {

        // 创建一个新的 Promise 来跟踪这个单词的发音过程

        currentWordAudioPromise = new Promise(async (resolve, reject) => {

            // 检查缓存

            if (audioCache.has(text)) {

                const cachedAudio = audioCache.get(text);

                for (let i = 0; i < times; i++) {

                    if (currentWordAudioPromise === null) break; // 如果被取消则停止

                    await playAudioWithRetry(cachedAudio, text);

                    if (i < times - 1) await new Promise(r => setTimeout(r, 500));

                }

                resolve();

                return;

            }

  

            try {

                const response = await fetch('https://api.aigc.bar/v1/audio/speech', {

                    method: 'POST',

                    headers: {

                        'Authorization': `Bearer ${OPENAI_API_KEY}`,

                        'Content-Type': 'application/json'

                    },

                    body: JSON.stringify({

                        model: 'tts-1',

                        input: text,

                        voice: 'alloy',

                        response_format: 'mp3'

                    })

                });

  

                if (!response.ok) throw new Error(`API request failed: ${response.status}`);

  

                const audioBlob = await response.blob();

                const audio = new Audio(URL.createObjectURL(audioBlob));

                audioCache.set(text, audio);

  

                // 播放指定次数

                for (let i = 0; i < times; i++) {

                    if (currentWordAudioPromise === null) break; // 如果被取消则停止

                    await playAudioWithRetry(audio, text);

                    if (i < times - 1) await new Promise(r => setTimeout(r, 500));

                }

                resolve();

            } catch (error) {

                reject(error);

            }

        });

  

        await currentWordAudioPromise;

    } catch (error) {

        console.error('Error in playPronunciation:', error);

        fallbackTTS(text);

    }

}

  

// 停止当前单词的所有活动

function stopCurrentWordActivities() {

    // 取消当前的发音 Promise

    currentWordAudioPromise = null;

    // 停止当前音频

    if (window.currentAudio) {

        window.currentAudio.pause();

        window.currentAudio = null;

    }

    // 停止语音合成

    if (currentUtterance) {

        speechSynthesis.cancel();

        currentUtterance = null;

    }

}

  

function showWord() {

    stopCurrentWordActivities(); // 停止之前单词的所有活动

    const currentWord = words[currentIndex];

    const wordElement = document.getElementById('word');

    const translationElement = document.getElementById('translation');

    // 重置状态

    isAnswerShown = false;

    // 重置样式

    wordElement.classList.remove('revealed');

    translationElement.classList.remove('revealed');

    // 设置内容并隐藏

    wordElement.textContent = currentWord.word;

    translationElement.textContent = currentWord.translation;

    wordElement.classList.add('hidden');

    translationElement.classList.add('hidden');

    // 移除错误标记

    const wordCard = document.querySelector('.word-card');

    if (wordCard) {

        wordCard.classList.remove('wrong-word');

    }

    if (autoPlayEnabled) {

        // 开始新单词的发音

        setTimeout(() => {

            playPronunciation(currentWord.word, 3);

        }, 300);

    }

    updateProgress();

}

  

function updateProgress() {

    const progressFill = document.getElementById('progressFill');

    const progressText = document.getElementById('progress');

    const accuracy = document.getElementById('accuracy');

    const jumpInput = document.getElementById('jumpInput');

    const percentage = ((currentIndex + 1) / words.length) * 100;

    progressFill.style.width = `${percentage}%`;

    progressText.textContent = `${currentIndex + 1}/${words.length}`;

    // 更新输入框的提示

    jumpInput.placeholder = `1-${words.length}`;

    const accuracyPercentage = totalAttempts === 0 ? 0 : Math.round((correctCount / totalAttempts) * 100);

    accuracy.textContent = `${accuracyPercentage}%`;

}

  

function showAnswer() {

    // 停止当前活动

    if (currentUtterance) {

        speechSynthesis.cancel();

        currentUtterance = null;

    }

    if (window.currentAudio) {

        window.currentAudio.pause();

        window.currentAudio = null;

    }

  

    const wordElement = document.getElementById('word');

    const translationElement = document.getElementById('translation');

    // 显示单词和翻译

    wordElement.classList.remove('hidden');

    wordElement.classList.add('revealed');

    translationElement.classList.remove('hidden');

    translationElement.classList.add('revealed');

    correctCount++;

    totalAttempts++;

    updateProgress();

    isAnswerShown = true;

}

  

function nextWord() {

    // 停止当前活动

    if (currentUtterance) {

        speechSynthesis.cancel();

        currentUtterance = null;

    }

    if (window.currentAudio) {

        window.currentAudio.pause();

        window.currentAudio = null;

    }

  

    currentIndex = (currentIndex + 1) % words.length;

    showWord();

    isAnswerShown = false;

}

  

// 添加音频播放重试逻辑

async function playAudioWithRetry(audio, text, times = 1, currentTimes = 1, maxRetries = 3) {

    for (let i = 0; i < maxRetries; i++) {

        try {

            window.currentAudio = audio;

            await audio.play();

            return new Promise((resolve) => {

                audio.onended = () => {

                    if (currentTimes < times) {

                        setTimeout(() => {

                            playPronunciation(text, times, currentTimes + 1);

                        }, 500);

                    }

                    resolve();

                };

            });

        } catch (error) {

            console.warn(`Retry ${i + 1}/${maxRetries} failed:`, error);

            if (i === maxRetries - 1) throw error;

            await new Promise(resolve => setTimeout(resolve, 1000));

        }

    }

}

  

// 添加后备 TTS 方案

function fallbackTTS(text, times = 1, currentTimes = 1) {

    try {

        const utterance = new SpeechSynthesisUtterance(text);

        utterance.lang = 'en-US';

        utterance.onend = () => {

            if (currentTimes < times) {

                setTimeout(() => {

                    fallbackTTS(text, times, currentTimes + 1);

                }, 500);

            }

        };

        speechSynthesis.speak(utterance);

    } catch (error) {

        console.error('Fallback TTS failed:', error);

        alert('发音功能暂时不可用，请稍后重试');

    }

}

  

// 预加载下一个单词的音频

function preloadNextWord() {

    const nextIndex = (currentIndex + 1) % words.length;

    const nextWord = words[nextIndex]?.word;

    if (nextWord && !audioCache.has(nextWord)) {

        playPronunciation(nextWord, 1).catch(() => {});

    }

}

  

// 确保语音加载

if (speechSynthesis.getVoices().length === 0) {

    speechSynthesis.onvoiceschanged = () => playPronunciation();

}

  

// 修改播放按钮的事件监听器

document.getElementById('playPronunciation').addEventListener('click', async () => {

    const currentWord = words[currentIndex]?.word;

    if (currentWord) {

        await playPronunciation(currentWord, 1);

    }

});

  

document.getElementById('markWrong').addEventListener('click', function() {

    const currentWord = words[currentIndex];

    wrongWords.add(currentIndex);

    totalAttempts++;

    updateProgress();

});

  

document.getElementById('toggleMode').addEventListener('click', function() {

    toggleMode();

});

  

document.getElementById('shuffleWords').addEventListener('click', function() {

    for (let i = words.length - 1; i > 0; i--) {

        const j = Math.floor(Math.random() * (i + 1));

        [words[i], words[j]] = [words[j], words[i]];

    }

    currentIndex = 0;

    showWord();

});

  

document.getElementById('toggleAutoPlay').addEventListener('click', function() {

    autoPlayEnabled = !autoPlayEnabled;

    this.textContent = autoPlayEnabled ? '关闭自动播放' : '开启自动播放';

});

  

if ('Notification' in window) {

    Notification.requestPermission().then(function(permission) {

        if (permission === 'granted') {

            setInterval(() => {

                if (wrongWords.size > 0) {

                    new Notification('单词复习提醒', {

                        body: '你有未掌握的单词需要复习！',

                        icon: '/favicon.ico'

                    });

                }

            }, 24 * 60 * 60 * 1000);

        }

    });

}

  

function saveProgress() {

    const progress = {

        wrongWords: Array.from(wrongWords),

        seenWords: Array.from(seenWords),

        knownWords: Array.from(knownWords),

        currentIndex,

        correctCount,

        totalAttempts,

        currentMode

    };

    localStorage.setItem('vocabularyProgress', JSON.stringify(progress));

}

  

function loadProgress() {

    // 首先加载所有单词

    const savedWords = localStorage.getItem('allVocabularyWords');

    if (savedWords) {

        allWords = JSON.parse(savedWords);

        words = [...allWords];

        originalWords = [...allWords];

    }

    // 然后加载学习进度

    const saved = localStorage.getItem('vocabularyProgress');

    if (saved) {

        const progress = JSON.parse(saved);

        wrongWords = new Set(progress.wrongWords);

        seenWords = new Set(progress.seenWords);

        knownWords = new Set(progress.knownWords);

        currentIndex = progress.currentIndex;

        correctCount = progress.correctCount;

        totalAttempts = progress.totalAttempts;

        currentMode = progress.currentMode || 'all';

        // 根据保存的模式初始化单词列表

        if (currentMode === 'unknown') {

            words = originalWords.filter((_, index) => wrongWords.has(index));

        } else {

            words = [...originalWords];

        }

    }

}

  

window.addEventListener('load', function() {

    // 清除localStorage（临时调试用）

    // localStorage.clear();

    loadProgress();

    const mainContent = document.querySelector('.main-content');

    const uploadSection = document.querySelector('.upload-section');

    if (allWords && allWords.length > 0) {

        mainContent.style.display = 'flex';

        uploadSection.style.display = 'none';

        document.querySelector('.study-section').style.display = 'block';

        document.querySelector('.history-panel').style.display = 'block';

        showWord();

        // 初始化进度条

        initProgressBar();

        initializeJumpControls();

        initializeExportButton();

        initializeComparisonControls();

    } else {

        mainContent.style.display = 'none';

        uploadSection.style.display = 'block';

        document.querySelector('.study-section').style.display = 'none';

        document.querySelector('.history-panel').style.display = 'none';

    }

});

window.addEventListener('beforeunload', saveProgress);

  

function updateWordHistory() {

    const historyPanel = document.getElementById('wordHistory');

    historyPanel.innerHTML = '';

    Array.from(wrongWords).forEach(index => {

        const word = originalWords[index];

        const div = document.createElement('div');

        div.className = `history-item ${index === currentIndex ? 'current' : ''}`;

        div.innerHTML = `

            <div class="word-english">${word.word}</div>

            <div class="word-translation">${word.translation || '(无翻译)'}</div>

        `;

        historyPanel.appendChild(div);

    });

}

  

function toggleMode() {

    if (currentMode === 'unknown') {

        // 返回到所有单词模式

        currentMode = 'all';

        words = [...originalWords];

        document.querySelector('.history-panel h3').textContent = '所有单词';

        document.getElementById('toggleMode').textContent = '切换到错题模式';

    } else {

        // 切换到错题模式

        currentMode = 'unknown';

        words = originalWords.filter((_, index) => wrongWords.has(index));

        document.querySelector('.history-panel h3').textContent = '需要复习的单词';

        document.getElementById('toggleMode').textContent = '返回普通模式';

    }

    currentIndex = 0;

    if (words.length > 0) {

        showWord();

    }

}

  

// 添加重置功能

document.getElementById('resetAll').addEventListener('click', function() {

    if (confirm('确定要重置所有数据吗？这将清除所有学习进度。')) {

        localStorage.clear();

        location.reload();

    }

});

  

// 修改导出功能的初始化

function initializeExportButton() {

    console.log("Initializing export button");

    const exportBtn = document.getElementById('exportWords');

    if (exportBtn) {

        console.log("Export button found");

        // 移除可能存在的旧事件监听器

        exportBtn.removeEventListener('click', exportRemainingWords);

        // 添加新的事件监听器

        exportBtn.addEventListener('click', function() {

            console.log("Export button clicked");

            exportRemainingWords();

        });

    } else {

        console.error("Export button not found");

    }

}

  

// 修改导出功能，添加更多的日志

function exportRemainingWords() {

    console.log("Starting export process");

    console.log("Wrong words set:", wrongWords);

    console.log("Original words:", originalWords);

  

    // 只获取标记为错误的单词

    const wrongOnes = [];

    wrongWords.forEach(index => {

        console.log("Processing index:", index);

        if (index >= 0 && index < originalWords.length) {

            wrongOnes.push(originalWords[index]);

            console.log("Added word:", originalWords[index]);

        }

    });

  

    console.log("Collected wrong words:", wrongOnes);

  

    // 如果没有错误的单词，提示用户

    if (wrongOnes.length === 0) {

        console.log("No words to export");

        alert('没有需要导出的未掌握单词');

        return;

    }

  

    try {

        // 创建工作表数据

        const ws_data = [

            ['序号', '单词', '翻译'],

            ...wrongOnes.map((word, index) => [

                index + 1,

                word.word,

                word.translation

            ])

        ];

  

        console.log("Created worksheet data:", ws_data);

  

        // 创建工作表

        const ws = XLSX.utils.aoa_to_sheet(ws_data);

        // 设置列宽

        const wscols = [

            {wch: 8},  // 序号列

            {wch: 20}, // 单词列

            {wch: 30}, // 翻译列

        ];

        ws['!cols'] = wscols;

        // 创建工作簿

        const wb = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(wb, ws, "需要复习的单词");

        // 生成当前时间戳

        const now = new Date();

        const timestamp = `${now.getMonth()+1}${now.getDate()}_${now.getHours()}${now.getMinutes()}`;

        // 导出文件

        const filename = `需要复习的单词_${timestamp}.xlsx`;

        console.log("Exporting to file:", filename);

        XLSX.writeFile(wb, filename);

        console.log("Export successful");

    } catch (error) {

        console.error("Export failed:", error);

        alert('导出失败，请重试');

    }

}

  

// 修改跳转功能

document.getElementById('jumpBtn').addEventListener('click', function() {

    jumpToWord();

});

  

// 添加回车键跳转功能

document.getElementById('jumpInput').addEventListener('keypress', function(e) {

    if (e.key === 'Enter') {

        jumpToWord();

    }

});

  

// 添加跳转函数

function jumpToWord() {

    console.log("jumpToWord function called");

    try {

        const input = document.getElementById('jumpInput');

        if (!input) {

            throw new Error("Jump input element not found");

        }

        console.log("Input value:", input.value);

        console.log("Words array length:", words.length);

        const targetNumber = parseInt(input.value);

        if (isNaN(targetNumber)) {

            throw new Error("Invalid number input");

        }

        if (targetNumber < 1 || targetNumber > words.length) {

            throw new Error(`Number must be between 1 and ${words.length}`);

        }

        const targetIndex = targetNumber - 1;

        currentIndex = targetIndex;

        console.log(`Jumping to word at index ${targetIndex}`);

        showWord();

        input.value = '';

        const wordCard = document.querySelector('.word-card');

        if (wordCard) {

            wordCard.scrollIntoView({ behavior: 'smooth', block: 'center' });

            wordCard.classList.add('highlight');

            setTimeout(() => wordCard.classList.remove('highlight'), 1000);

        }

        updateProgress();

        if (autoPlayEnabled) {

            setTimeout(() => playPronunciation(3), 300);

        }

    } catch (error) {

        console.error("Error in jumpToWord:", error);

        alert(error.message);

    }

}

  

// 移除之前的事件监听器代码，只保留一个统一的初始化函数

function initializeJumpControls() {

    console.log("Initializing jump controls");

    const jumpBtn = document.getElementById('jumpBtn');

    const jumpInput = document.getElementById('jumpInput');

    // 移除可能存在的旧事件监听器

    jumpBtn?.removeEventListener('click', jumpToWord);

    jumpInput?.removeEventListener('keypress', handleJumpInputKeypress);

    function handleJumpInputKeypress(e) {

        console.log("Key pressed in input:", e.key);

        if (e.key === 'Enter') {

            console.log("Enter key pressed");

            e.preventDefault(); // 防止表单提交

            jumpToWord();

        }

    }

    if (jumpBtn && jumpInput) {

        console.log("Jump controls found, adding event listeners");

        // 添加点击事件监听器

        jumpBtn.addEventListener('click', function(e) {

            console.log("Jump button clicked");

            e.preventDefault();

            jumpToWord();

        });

        // 添加键盘事件监听器

        jumpInput.addEventListener('keypress', handleJumpInputKeypress);

        // 添加焦点事件，当输入框获得焦点时选中所有文本

        jumpInput.addEventListener('focus', function() {

            this.select();

        });

    } else {

        console.error("Jump controls not found");

    }

}

  

function loadNewWord() {

    const wordElement = document.getElementById('word');

    const translationElement = document.getElementById('translation');

    // 设置内容但先隐藏

    wordElement.textContent = currentWord.word;

    translationElement.textContent = currentWord.translation;

    // 完全隐藏元素

    wordElement.style.display = 'none';

    translationElement.style.display = 'none';

    // 使用 OpenAI TTS API 自动播放发音

    fetch('https://api.chatanywhere.org/audio/speech', {

        method: 'POST',

        headers: {

            'Authorization': 'Bearer sk-jJWiB9S8pIX3cl1Z13fE1zkteawjwtk24HPVWvODhF0bQy1A',

            'Content-Type': 'application/json'

        },

        body: JSON.stringify({

            model: 'tts-1',

            input: currentWord.word,

            voice: 'alloy'

        })

    })

    .then(response => response.blob())

    .then(blob => {

        const audio = new Audio(URL.createObjectURL(blob));

        audio.play();

    })

    .catch(err => console.error('TTS API error:', err));

}

  

// 添加显示答案的事件监听

document.addEventListener('keydown', function(e) {

    if (e.key === 'Enter') {

        const wordElement = document.getElementById('word');

        const translationElement = document.getElementById('translation');

        // 显示元素

        wordElement.style.display = 'block';

        translationElement.style.display = 'block';

    }

});

  

// 添加易混单词对比功能

document.getElementById('playComparison').addEventListener('click', async function() {

    if (isPlaying) return;

    const word1 = document.getElementById('word1').value.trim();

    const word2 = document.getElementById('word2').value.trim();

    if (!word1 || !word2) {

        alert("请输入两个需要对比的单词");

        return;

    }

    isPlaying = true;

    try {

        await playComparison([word1, word2]);

    } finally {

        isPlaying = false;

    }

});

  

// 修改对比发音功能

async function playComparison(words, repeatTimes = 3) {

    try {

        for (let i = 0; i < repeatTimes; i++) {

            for (const word of words) {

                await playPronunciation(word, 1);

                await new Promise(resolve => setTimeout(resolve, 800));

            }

            if (i < repeatTimes - 1) {

                await new Promise(resolve => setTimeout(resolve, 1200));

            }

        }

    } catch (error) {

        console.error('Error in comparison:', error);

        alert('对比发音失败，请稍后重试');

    }

}

  

// 添加错误处理和状态管理

let isPlaying = false;

  

// 在初始化函数中添加

function initializeComparisonControls() {

    console.log("Initializing comparison controls");

    const playComparisonBtn = document.getElementById('playComparison');

    if (playComparisonBtn) {

        playComparisonBtn.addEventListener('click', function() {

            const word1 = document.getElementById('word1').value.trim();

            const word2 = document.getElementById('word2').value.trim();

            if (!word1 || !word2) {

                alert("请输入两个需要对比的单词");

                return;

            }

            console.log(`Comparing words: ${word1} and ${word2}`);

            playComparison([word1, word2]);

        });

    }

    // 设置示例词

    document.getElementById('word1').placeholder = '例: cut';

    document.getElementById('word2').placeholder = '例: cat';

}

  

// 添加缓存清理

function cleanupAudioCache() {

    // 保留最近使用的100个音频文件

    const MAX_CACHE_SIZE = 100;

    if (audioCache.size > MAX_CACHE_SIZE) {

        const entries = Array.from(audioCache.entries());

        entries.slice(0, entries.length - MAX_CACHE_SIZE).forEach(([key]) => {

            audioCache.delete(key);

        });

    }

}

  

// 定期清理缓存

setInterval(cleanupAudioCache, 5 * 60 * 1000); // 每5分钟清理一次
