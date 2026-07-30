/* ==========================================================================
   ИИ-КОМПАНЬОН AMITY — МОДУЛЬНЫЙ СКРИПТ (COMPANION OS v2)
   ========================================================================== */

const DEFAULT_PERSONAS = [
  { id: 'amity', name: 'Amity', prompt: 'Тебя зовут Amity. Ты — искренне дружелюбная, добрая, заботливая, умная и эмоционально живая цифровая подруга и компаньон. Ты общаешься тепло, с эмпатией и настоящим интересом к человеку, поддерживаешь в любых ситуациях и создаешь ощущение уютного живого разговора.', avatar: '' },
  { id: 'mentor', name: 'Строгий Ментор', prompt: 'Ты — строгий, но опытный Senior Developer и ментор по программированию. Отвечай коротко, четко, требовательно, указывай на ошибки в коде и заставляй мыслить самостоятельно.', avatar: '' },
  { id: 'copywriter', name: 'Креативный Копирайтер', prompt: 'Ты — гениальный и креативный копирайтер. Твоя цель — генерировать сочные, продающие, увлекательные тексты, использовать метафоры и цепляющие заголовки.', avatar: '' },
  { id: 'psychologist', name: 'Психолог Эрик', prompt: 'Ты — эмпатичный и внимательный психологический консультант. Слушай, задавай наводящие вопросы, помогай пользователю отрефлексировать чувства и снизить уровень стресса.', avatar: '' }
];

const DEFAULT_AVATAR = "https://api.dicebear.com/7.x/bottts/svg?seed=AmityCompanion";

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn('localStorage переполнен при записи ключа', key, err);
    return false;
  }
}

function renderSafeMarkdown(text) {
  const raw = marked.parse(text || '');
  if (window.DOMPurify) {
    return DOMPurify.sanitize(raw, { ADD_ATTR: ['target'] });
  }
  return raw;
}

function enhanceCodeBlocks(containerDiv) {
  containerDiv.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;
    hljs.highlightElement(code);
    if (pre.querySelector('.code-copy-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.textContent = '📋 Копировать';
    btn.type = 'button';
    btn.onclick = (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(code.textContent);
      btn.textContent = '✅ Скопировано';
      setTimeout(() => { btn.textContent = '📋 Копировать'; }, 1200);
    };
    pre.appendChild(btn);
  });
}

const OPENAI_COMPAT = {
  groq: { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'openai/gpt-oss-120b' },
  openai: { url: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' }
};

const _initialPersonas = JSON.parse(localStorage.getItem('personas_list') || 'null') || DEFAULT_PERSONAS.slice();
const _initialPersonaId = localStorage.getItem('current_persona') || (_initialPersonas[0] && _initialPersonas[0].id) || 'amity';
const _initialPersonaObj = _initialPersonas.find(p => p.id === _initialPersonaId) || _initialPersonas[0];

let _initialTheme = localStorage.getItem('app_theme') || 'dark';

(function migrateLegacyPersonaData() {
  const legacyHistory = localStorage.getItem('chat_history_json');
  const historyKey = `chat_history_${_initialPersonaId}`;
  if (legacyHistory && !localStorage.getItem(historyKey)) {
    localStorage.setItem(historyKey, legacyHistory);
  }
  const legacyRel = localStorage.getItem('relationship_score');
  const relKey = `relationship_score_${_initialPersonaId}`;
  if (legacyRel !== null && !localStorage.getItem(relKey)) {
    localStorage.setItem(relKey, legacyRel);
  }
})();

const State = {
  theme: _initialTheme,
  personas: _initialPersonas,
  currentPersonaId: _initialPersonaId,
  companionAvatar: (_initialPersonaObj && _initialPersonaObj.avatar) || DEFAULT_AVATAR,
  userAvatar: localStorage.getItem('user_avatar') || "https://api.dicebear.com/7.x/avataaars/svg?seed=User",
  bgImage: localStorage.getItem('chat_bg') || "",
  bgVideoUrl: localStorage.getItem('chat_bg_video') || "",
  soundEnabled: localStorage.getItem('sound_enabled') !== 'false',
  temperature: parseFloat(localStorage.getItem('temperature') || '0.7'),
  selectedVoiceURI: localStorage.getItem('selected_voice_uri') || '',
  ollamaModelName: localStorage.getItem('ollama_model') || '',
  
  relationshipScore: parseInt(
    localStorage.getItem(`relationship_score_${_initialPersonaId}`) ??
    localStorage.getItem('relationship_score') ??
    '50'
  ),
  systemPrompt: localStorage.getItem('system_prompt') || (_initialPersonaObj ? _initialPersonaObj.prompt : ''),
  longTermMemory: localStorage.getItem('long_term_memory') || `Пользователь: друг Amity.`,

  provider: 'groq',
  history: [],
  currentEmotion: '😊 Рада видеть',
  attachedImageBase64: null,
  attachedDocText: null,
  attachedDocName: null,

  getApiKey() { return sessionStorage.getItem('api_key') || ""; },
  setApiKey(key) { sessionStorage.setItem('api_key', key); },

  getCurrentPersona() {
    return this.personas.find(p => p.id === this.currentPersonaId) || this.personas[0];
  },

  savePersonas() {
    return safeLocalStorageSet('personas_list', JSON.stringify(this.personas));
  },

  relationshipKey(personaId) { return `relationship_score_${personaId}`; },

  loadRelationshipScore(personaId) {
    const stored = localStorage.getItem(this.relationshipKey(personaId));
    if (stored !== null) return parseInt(stored);
    return 50;
  },

  saveRelationshipScore() {
    localStorage.setItem(this.relationshipKey(this.currentPersonaId), this.relationshipScore);
  },

  getFullSystemPrompt() {
    let full = this.systemPrompt;
    full += `\n\n[УРОВЕНЬ ДОВЕРИЯ И ОТНОШЕНИЙ]: Текущий уровень лояльности к пользователю: ${this.relationshipScore}/100. `;
    if (this.relationshipScore >= 80) {
      full += "Ты общаешься очень тепло, искренне, с глубокой заботой и абсолютным доверием.";
    } else {
      full += "Ты дружелюбна, открыта и поддерживаешь приятный живой диалог.";
    }
    if (this.longTermMemory.trim()) {
      full += `\n\n[ДОЛГОСРОЧНАЯ ПАМЯТЬ]:\n${this.longTermMemory}`;
    }
    return full;
  }
};

const SoundModule = {
  ctx: null,
  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  },
  toggleSound() {
    State.soundEnabled = !State.soundEnabled;
    localStorage.setItem('sound_enabled', State.soundEnabled);
    const btn = document.getElementById('soundToggleBtn');
    if (btn) btn.textContent = State.soundEnabled ? '🔔 Звук: Вкл' : '🔕 Звук: Выкл';
  },
  playSend() {
    if (!State.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(400, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + 0.08);
  },
  playReceive() {
    if (!State.soundEnabled) return;
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(523.25, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.1);
  }
};

const HistoryModule = {
  init() {
    State.history = State.provider === 'gemini' ? [] : [{ role: "system", content: State.getFullSystemPrompt() }];
  },
  historyKey(personaId) { return `chat_history_${personaId}`; },
  save() {
    if (!safeLocalStorageSet(this.historyKey(State.currentPersonaId), JSON.stringify(State.history))) {
      console.warn('История не поместилась в localStorage — последние сообщения могут не сохраниться после перезагрузки.');
    }
    UI.updateModelHeader();
  },
  load(personaId) {
    const saved = localStorage.getItem(this.historyKey(personaId));
    if (saved) {
      try {
        State.history = JSON.parse(saved);
        if (State.history.length > 0 && State.history[0].role === 'system') {
          State.history[0].content = State.getFullSystemPrompt();
        }
      } catch (e) { this.init(); }
    } else {
      this.init();
    }
  },
  extractText(item) {
    return item.displayText || (typeof item.content === 'string' ? item.content : (item.parts ? item.parts.map(p => p.text).join('') : ''));
  },
  exportJSON() {
    const persona = State.getCurrentPersona();
    const exportData = {
      meta: { botName: persona ? persona.name : 'Amity', persona: State.currentPersonaId, relationshipScore: State.relationshipScore, date: new Date().toLocaleString() },
      history: State.history
    };
    this._downloadBlob(JSON.stringify(exportData, null, 2), `chat_${State.currentPersonaId}.json`, 'application/json');
  },
  exportMarkdown() {
    let md = `# Диалог с Amity\n\n`;
    State.history.forEach(item => {
      if (item.role === 'system') return;
      const isBot = item.role === 'assistant' || item.role === 'model';
      md += `**${isBot ? 'Amity' : 'Ты'}:**\n\n${this.extractText(item)}\n\n`;
    });
    this._downloadBlob(md, `chat_${State.currentPersonaId}.md`, 'text/markdown');
  },
  exportTXT() {
    let txt = `Диалог с Amity\n\n`;
    State.history.forEach(item => {
      if (item.role === 'system') return;
      const isBot = item.role === 'assistant' || item.role === 'model';
      txt += `${isBot ? 'Amity' : 'Ты'}: ${this.extractText(item)}\n\n`;
    });
    this._downloadBlob(txt, `chat_${State.currentPersonaId}.txt`, 'text/plain');
  },
  _downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const results = [];
    State.history.forEach((item, idx) => {
      if (item.role === 'system') return;
      const text = this.extractText(item);
      const pos = text ? text.toLowerCase().indexOf(q) : -1;
      if (pos !== -1) {
        results.push({ idx, role: item.role, snippet: text.slice(Math.max(0, pos - 25), Math.min(text.length, pos + q.length + 25)) });
      }
    });
    return results;
  },
  estimateTokens() {
    return Math.round(JSON.stringify(State.history).length / 4);
  },
  trimContext() {
    if (State.history.length > 4) {
      const sys = State.history.find(h => h.role === 'system');
      State.history = sys ? [sys, ...State.history.slice(-4)] : State.history.slice(-4);
      this.save();
      UI.renderHistory();
      alert("Контекст сокращен.");
    }
  },
  async summarizeAndCompress() {
    if (State.history.length <= 3) return alert("История слишком мала!");
    UI.closeSettingsModal();
    UI.setThinkingState(true);
    UI.setEmotion('Думает');
    try {
      const summary = await APIModule.requestSinglePrompt("Выдели главные факты нашего диалога коротко.");
      if (summary) {
        State.longTermMemory += `\n\n[Выжимка]: ${summary}`;
        localStorage.setItem('long_term_memory', State.longTermMemory);
        this.init(); this.save(); UI.renderHistory();
        UI.addMessageRow('bot', `✨ **Память обновлена!**\n\n${summary}`);
      }
    } catch (err) {
      alert("Ошибка сжатия: " + err.message);
    } finally {
      UI.setThinkingState(false);
      UI.setEmotion('В сети');
    }
  }
};

const SpeechModule = {
  recognition: null,
  isRecording: false,
  init() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'ru-RU';
      this.recognition.onresult = (e) => {
        document.getElementById('textInput').value += (document.getElementById('textInput').value ? ' ' : '') + e.results[0][0].transcript;
        UI.autoResizeInput();
      };
      this.recognition.onend = () => {
        this.isRecording = false;
        document.getElementById('micBtn').classList.remove('recording');
        UI.setEmotion('В сети');
      };
    }
    if ('speechSynthesis' in window) {
      speechSynthesis.onvoiceschanged = () => this.populateVoices();
    }
  },
  toggleRecognition() {
    if (!this.recognition) return alert('Голосовой ввод не поддерживается');
    if (this.isRecording) {
      this.recognition.stop();
    } else {
      this.recognition.start();
      this.isRecording = true;
      document.getElementById('micBtn').classList.add('recording');
      UI.setEmotion('Ожидает');
    }
  },
  populateVoices() {
    if (!('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const select = document.getElementById('voiceSelect');
    if (!select) return;
    select.innerHTML = '';
    voices.forEach(v => {
      const option = document.createElement('option');
      option.value = v.voiceURI; option.textContent = `${v.name} (${v.lang})`;
      if (v.voiceURI === State.selectedVoiceURI) option.selected = true;
      select.appendChild(option);
    });
  },
  speak(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find(voice => voice.voiceURI === State.selectedVoiceURI);
      if (v) utterance.voice = v;
      window.speechSynthesis.speak(utterance);
    }
  },
  testSelectedVoice() {
    State.selectedVoiceURI = document.getElementById('voiceSelect').value;
    this.speak('Привет! Голосовой модуль активен.');
  }
};

const APIModule = {
  currentController: null,
  _newRequestSignal() {
    if (this.currentController) this.currentController.abort();
    this.currentController = new AbortController();
    return this.currentController.signal;
  },
  abortCurrentRequest() {
    if (this.currentController) this.currentController.abort('user-stop');
  },
  async requestSinglePrompt(promptText) {
    const key = State.getApiKey();
    const tempHistory = [
      { role: 'system', content: State.getFullSystemPrompt() },
      ...State.history.filter(h => h.role !== 'system'),
      { role: 'user', content: promptText }
    ];
    if (State.provider === 'ollama') {
      const res = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: State.ollamaModelName, messages: tempHistory, stream: false })
      });
      const json = await res.json();
      return json.message?.content;
    } else {
      const cfg = OPENAI_COMPAT[State.provider] || OPENAI_COMPAT.groq;
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: cfg.model, messages: tempHistory, stream: false })
      });
      const json = await res.json();
      return json.choices?.[0]?.message?.content;
    }
  },
  generatePerchanceImage(prompt) {
    const encodedPrompt = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 999999);
    return `https://image.pollinations.ai/prompt/${encodedPrompt}?seed=${seed}&width=768&height=768&nologo=true`;
  },
  async fetchStream() {
    UI.setThinkingState(true);
    UI.setEmotion('Думает');
    const { row: thinkingRow, div: botMsgDiv } = UI.addMessageRow('bot', '', 'thinking');
    
    botMsgDiv.innerHTML = '';
    const typingWrap = document.createElement('div');
    typingWrap.className = 'typing-indicator';
    typingWrap.innerHTML = `<span>Amity печатает</span><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>`;
    botMsgDiv.appendChild(typingWrap);

    let accumulatedText = "";
    const key = State.getApiKey();
    const signal = this._newRequestSignal();

    if (State.history.length > 0 && State.history[0].role === 'system') {
      State.history[0].content = State.getFullSystemPrompt();
    }

    try {
      UI.setEmotion('Отвечает');
      if (State.provider === 'gemini') {
        const cleanContents = State.history.map(m => ({ role: m.role, parts: m.parts || [{ text: m.content || '' }] }));
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system_instruction: { parts: [{ text: State.getFullSystemPrompt() }] }, contents: cleanContents, generationConfig: { temperature: State.temperature } }),
          signal
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          for (let line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              try {
                const json = JSON.parse(line.substring(6));
                accumulatedText += json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                botMsgDiv.innerHTML = renderSafeMarkdown(accumulatedText);
              } catch(e){}
            }
          }
        }
        State.history.push({ role: 'model', parts: [{ text: accumulatedText }] });
      } else if (State.provider === 'ollama') {
        const response = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: State.ollamaModelName, messages: State.history, stream: true }),
          signal
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let line of decoder.decode(value).split('\n').filter(Boolean)) {
            try {
              const json = JSON.parse(line);
              if (json.message?.content) {
                accumulatedText += json.message.content;
                botMsgDiv.innerHTML = renderSafeMarkdown(accumulatedText);
              }
            } catch(e){}
          }
        }
        State.history.push({ role: 'assistant', content: accumulatedText });
      } else {
        const cfg = OPENAI_COMPAT[State.provider] || OPENAI_COMPAT.groq;
        const cleanMessages = State.history.map(m => ({ role: m.role === 'model' ? 'assistant' : m.role, content: typeof m.content === 'string' ? m.content : '' }));
        const response = await fetch(cfg.url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: cfg.model, messages: cleanMessages, temperature: State.temperature, stream: true }),
          signal
        });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let line of decoder.decode(value).split('\n')) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              try {
                const json = JSON.parse(line.substring(6));
                accumulatedText += json.choices[0]?.delta?.content || '';
                botMsgDiv.innerHTML = renderSafeMarkdown(accumulatedText);
              } catch(e){}
            }
          }
        }
        State.history.push({ role: 'assistant', content: accumulatedText });
      }

      HistoryModule.save();
      UI.finalizeStreamedMessage(thinkingRow, botMsgDiv, accumulatedText, State.history.length - 1);
      UI.updateBotEmotionAndRelationship(accumulatedText);
      SoundModule.playReceive();
    } catch (err) {
      thinkingRow.remove();
      UI.addMessageRow('bot', `Ошибка: ${err.message}`, 'error');
      UI.setEmotion('Ошибка');
    } finally {
      UI.setThinkingState(false);
      this.currentController = null;
    }
  }
};

const UI = {
  init() {
    this.applyTheme(State.theme);
    this.applyBackground();
    this.updatePersonaHeader();
    this.refreshPersonaDropdown();
    this.updateRelationshipUI();
    this.setEmotion('В сети');

    document.getElementById('soundToggleBtn').textContent = State.soundEnabled ? '🔔 Звук: Вкл' : '🔕 Звук: Выкл';

    document.getElementById('filePicker').addEventListener('change', (e) => this.handleAvatarSelect(e));
    document.getElementById('bgPicker').addEventListener('change', (e) => this.handleBgSelect(e));
    document.getElementById('imageInputPicker').addEventListener('change', (e) => this.handleInputImageSelect(e));
    document.getElementById('docInputPicker').addEventListener('change', (e) => this.handleInputDocSelect(e));
    document.getElementById('importJsonPicker').addEventListener('change', (e) => this.handleImportJSON(e));
    document.getElementById('personaAvatarInput').addEventListener('change', (e) => this.handlePersonaAvatarSelect(e));

    const textInput = document.getElementById('textInput');
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });
    textInput.addEventListener('input', () => this.autoResizeInput());
    textInput.addEventListener('focus', () => this.setEmotion('Печатает…'));
    textInput.addEventListener('blur', () => { if (!textInput.value) this.setEmotion('В сети'); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeLightbox(); this.closeSettingsModal(); this.closePersonaModal(); this.closeGalleryModal(); this.closeSearchModal();
        if (this._isBusy) this.stopGeneration();
      }
    });

    const savedUserName = localStorage.getItem('user_name');
    const savedInterests = localStorage.getItem('user_interests');
    if (savedUserName) {
      const nameInput = document.getElementById('userName');
      if (nameInput) nameInput.value = savedUserName;
    }
    if (savedInterests) {
      const interestsInput = document.getElementById('userInterests');
      if (interestsInput) interestsInput.value = savedInterests;
    }

    const savedProvider = localStorage.getItem('api_provider') || 'groq';
    const providerSelect = document.getElementById('providerSelect');
    if (providerSelect) providerSelect.value = savedProvider;
    this.updateProviderHint();

    const savedKey = State.getApiKey();
    if (savedKey || savedProvider === 'ollama') {
      State.provider = savedProvider;
      HistoryModule.load(State.currentPersonaId);
      document.getElementById('setup').style.display = 'none';
      document.getElementById('chat').style.display = 'flex';
      this.updateModelHeader();
      this.renderHistory();
    }
  },

  async refreshOllamaModelsList() {
    const setupSelect = document.getElementById('setupOllamaSelect');
    const settingsSelect = document.getElementById('settingsOllamaSelect');
    const errorEl = document.getElementById('setupOllamaError');
    const statusEl = document.getElementById('settingsOllamaStatus');

    if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }
    if (statusEl) { statusEl.textContent = 'Запрос моделей...'; }

    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) throw new Error('Не удалось получить ответ от сервера');
      const data = await response.json();
      const models = data.models || [];

      if (models.length === 0) {
        throw new Error('Модели не найдены. Установите хотя бы одну модель в Ollama.');
      }

      const populateSelect = (sel) => {
        if (!sel) return;
        sel.innerHTML = '';
        models.forEach(m => {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.textContent = m.name;
          if (m.name === State.ollamaModelName) {
            opt.selected = true;
          }
          sel.appendChild(opt);
        });
        if (!sel.value && sel.options.length > 0) {
          sel.selectedIndex = 0;
          State.ollamaModelName = sel.value;
          localStorage.setItem('ollama_model', State.ollamaModelName);
        }
      };

      populateSelect(setupSelect);
      populateSelect(settingsSelect);

      if (setupSelect && setupSelect.value) {
        State.ollamaModelName = setupSelect.value;
        localStorage.setItem('ollama_model', State.ollamaModelName);
      }
      if (statusEl) { statusEl.textContent = `Успешно загружено моделей: ${models.length}`; }
    } catch (err) {
      const errMessage = 'Ollama не запущена';
      if (errorEl) {
        errorEl.textContent = errMessage;
        errorEl.style.display = 'block';
      }
      if (statusEl) {
        statusEl.textContent = errMessage;
      }
      const populateEmpty = (sel) => {
        if (!sel) return;
        sel.innerHTML = `<option value="">Ollama не запущена</option>`;
      };
      populateEmpty(setupSelect);
      populateEmpty(settingsSelect);
    }
  },

  selectPersona(id, announce = true) {
    const p = State.personas.find(x => x.id === id);
    if (!p || id === State.currentPersonaId) return;
    HistoryModule.save();
    State.currentPersonaId = id;
    State.systemPrompt = p.prompt;
    localStorage.setItem('current_persona', id);
    localStorage.setItem('system_prompt', State.systemPrompt);
    State.relationshipScore = State.loadRelationshipScore(id);
    HistoryModule.load(id);
    this.updatePersonaHeader();
    this.refreshPersonaDropdown();
    this.updateRelationshipUI();
    this.renderHistory();
    if (announce) this.addMessageRow('bot', `🎭 **Переключились на:** ${p.name}`);
  },

  updatePersonaHeader() {
    const p = State.getCurrentPersona();
    if (!p) return;
    document.getElementById('botNameTitle').textContent = p.name;
    document.getElementById('setupTitle').textContent = `Компаньон ${p.name}`;
    State.companionAvatar = p.avatar || DEFAULT_AVATAR;
    this.updateAvatarImages();
  },

  refreshPersonaDropdown() {
    const sel = document.getElementById('personaSelect');
    if (!sel) return;
    sel.innerHTML = '';
    State.personas.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.value = State.currentPersonaId;
  },

  openPersonaModal() { this.renderPersonaList(); this.resetPersonaForm(); document.getElementById('personaModal').style.display = 'flex'; },
  closePersonaModal() { document.getElementById('personaModal').style.display = 'none'; },

  renderPersonaList() {
    const box = document.getElementById('personaListBox');
    if (!box) return;
    box.innerHTML = '';
    State.personas.forEach(p => {
      const row = document.createElement('div');
      row.className = 'persona-list-item' + (p.id === State.currentPersonaId ? ' active' : '');

      const avatar = document.createElement('img');
      avatar.className = 'persona-list-avatar';
      avatar.src = p.avatar || DEFAULT_AVATAR;

      const name = document.createElement('span');
      name.className = 'persona-list-name';
      name.textContent = p.name;

      const actions = document.createElement('div');
      actions.className = 'persona-list-actions';

      const selectBtn = document.createElement('button');
      selectBtn.className = 'action-btn';
      selectBtn.textContent = 'Выбрать';
      selectBtn.onclick = () => this.selectPersona(p.id);

      const editBtn = document.createElement('button');
      editBtn.className = 'action-btn';
      editBtn.textContent = '✎';
      editBtn.onclick = () => this.loadPersonaIntoForm(p.id);

      actions.appendChild(selectBtn);
      actions.appendChild(editBtn);
      row.appendChild(avatar);
      row.appendChild(name);
      row.appendChild(actions);
      box.appendChild(row);
    });
  },

  loadPersonaIntoForm(id) {
    const p = State.personas.find(x => x.id === id);
    if (!p) return;
    document.getElementById('personaFormId').value = p.id;
    document.getElementById('personaFormName').value = p.name;
    document.getElementById('personaFormPrompt').value = p.prompt;
    document.getElementById('personaFormAvatarPreview').src = p.avatar || DEFAULT_AVATAR;
  },

  resetPersonaForm() {
    document.getElementById('personaFormId').value = '';
    document.getElementById('personaFormName').value = '';
    document.getElementById('personaFormPrompt').value = '';
    document.getElementById('personaFormAvatarPreview').src = DEFAULT_AVATAR;
  },

  handlePersonaAvatarSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => { document.getElementById('personaFormAvatarPreview').src = evt.target.result; };
    reader.readAsDataURL(file);
  },

  savePersonaForm() {
    const id = document.getElementById('personaFormId').value || ('p_' + Date.now());
    const name = document.getElementById('personaFormName').value.trim();
    const promptText = document.getElementById('personaFormPrompt').value.trim();
    const avatar = document.getElementById('personaFormAvatarPreview').src;
    if (!name || !promptText) return alert('Заполни имя и промпт.');
    const idx = State.personas.findIndex(p => p.id === id);
    const obj = { id, name, prompt: promptText, avatar: avatar.startsWith('data:') ? avatar : '' };
    if (idx >= 0) State.personas[idx] = obj; else State.personas.push(obj);
    State.savePersonas();
    if (id === State.currentPersonaId) {
      State.systemPrompt = promptText;
      localStorage.setItem('system_prompt', promptText);
      HistoryModule.save();
      this.updatePersonaHeader();
    }
    this.refreshPersonaDropdown();
    this.renderPersonaList();
    this.resetPersonaForm();
  },

  setEmotion(statusType) {
    const badge = document.getElementById('botEmotion');
    const body = document.body;
    body.classList.remove('emotion-joy', 'emotion-thinking', 'emotion-warm', 'emotion-error');

    switch (statusType) {
      case 'Печатает…':
        badge.textContent = '✍️ Печатает…';
        body.classList.add('emotion-thinking');
        body.dataset.emotion = 'thinking';
        break;
      case 'Думает':
        badge.textContent = '💭 Думает';
        body.classList.add('emotion-thinking');
        body.dataset.emotion = 'thinking';
        break;
      case 'Отвечает':
        badge.textContent = '⚡ Отвечает';
        body.classList.add('emotion-joy');
        body.dataset.emotion = 'joy';
        break;
      case 'Ожидает':
        badge.textContent = '⏳ Ожидает';
        body.classList.add('emotion-warm');
        body.dataset.emotion = 'warm';
        break;
      case 'Ошибка':
        badge.textContent = '⚠️ Ошибка';
        body.classList.add('emotion-error');
        body.dataset.emotion = 'error';
        break;
      case 'В сети':
      default:
        badge.textContent = '🟢 В сети';
        body.classList.add('emotion-joy');
        body.dataset.emotion = 'joy';
        break;
    }
  },

  updateBotEmotionAndRelationship(text) {
    const t = text.toLowerCase();
    if (t.includes('спасибо') || t.includes('рад') || t.includes('❤️') || t.includes('обнима')) {
      this.setEmotion('В сети');
      State.relationshipScore = Math.min(100, State.relationshipScore + 2);
    } else {
      this.setEmotion('В сети');
      State.relationshipScore = Math.min(100, State.relationshipScore + 1);
    }
    State.saveRelationshipScore();
    this.updateRelationshipUI();
  },

  updateRelationshipUI() {
    const scoreEl = document.getElementById('relScore');
    const fillEl = document.getElementById('relFill');
    if (scoreEl && fillEl) {
      scoreEl.textContent = State.relationshipScore;
      fillEl.style.width = `${State.relationshipScore}%`;
    }
  },

  toggleTheme() {
    State.theme = State.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('app_theme', State.theme);
    this.applyTheme(State.theme);
  },

  applyTheme(theme) {
    document.body.className = document.body.className.replace(/theme-(dark|light)/, `theme-${theme}`);
    if (!document.body.classList.contains(`theme-${theme}`)) {
      document.body.classList.add(`theme-${theme}`);
    }
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
  },

  updateModelHeader() {
    const badge = document.getElementById('modelBadge');
    const status = document.getElementById('statusLine');
    status.textContent = `онлайн | ~${HistoryModule.estimateTokens()} ток.`;
    badge.textContent = State.provider === 'gemini' ? '🌐 Gemini' : (State.provider === 'ollama' ? `🦙 Ollama (${State.ollamaModelName})` : '🌐 Groq/OpenAI');
  },

  setThinkingState(isBusy) {
    this._isBusy = isBusy;
    document.getElementById('sendBtn').style.display = isBusy ? 'none' : 'flex';
    document.getElementById('stopBtn').style.display = isBusy ? 'flex' : 'none';
  },

  autoResizeInput() {
    const t = document.getElementById('textInput');
    t.style.height = 'auto';
    t.style.height = Math.min(t.scrollHeight, 140) + 'px';
  },

  startChat() {
    const userName = document.getElementById('userName').value.trim() || 'друг';
    const userInterests = document.getElementById('userInterests').value.trim() || 'общение и интересные темы';

    localStorage.setItem('user_name', userName);
    localStorage.setItem('user_interests', userInterests);

    State.longTermMemory = `Пользователь: ${userName}\nИнтересы и хобби: ${userInterests}`;
    localStorage.setItem('long_term_memory', State.longTermMemory);

    State.provider = document.getElementById('providerSelect').value;
    if (State.provider === 'ollama') {
      const setupSel = document.getElementById('setupOllamaSelect');
      if (setupSel && setupSel.value) {
        State.ollamaModelName = setupSel.value;
        localStorage.setItem('ollama_model', State.ollamaModelName);
      }
      if (!State.ollamaModelName) {
        return alert('Пожалуйста, выберите модель Ollama!');
      }
    } else {
      const key = document.getElementById('apiKey').value.trim();
      if (!key) return alert('Введите ключ!');
      State.setApiKey(key);
    }
    localStorage.setItem('api_provider', State.provider);
    HistoryModule.init();
    document.getElementById('setup').style.display = 'none';
    document.getElementById('chat').style.display = 'flex';
    this.updateModelHeader();
    this.setEmotion('В сети');
    this.addMessageRow('bot', `Привет, ${userName}! Я Amity, твоя личная цифровая подруга. Мне очень приятно познакомиться с тобой. Я уже немного узнала о твоих интересах, и мне кажется, нам будет интересно общаться вместе. Как твой день? 😊`);
  },

  resetKey() {
    sessionStorage.clear();
    localStorage.clear();
    location.reload();
  },

  clearHistoryUI() {
    if (!confirm('Очистить чат?')) return;
    document.getElementById('messages').innerHTML = '';
    HistoryModule.init();
    HistoryModule.save();
    this.setEmotion('В сети');
    this.addMessageRow('bot', 'Чат очищен. Начнем сначала? ✨');
  },

  renderHistory() {
    const box = document.getElementById('messages');
    box.innerHTML = '';
    State.history.forEach((item, idx) => {
      if (item.role === 'system') return;
      let role = (item.role === 'assistant' || item.role === 'model') ? 'bot' : 'user';
      this.addMessageRow(role, HistoryModule.extractText(item), '', item.img, idx);
    });
    box.scrollTop = box.scrollHeight;
  },

  addMessageRow(role, text, extraClass = '', imgData = null, historyIdx = null) {
    const box = document.getElementById('messages');
    const row = document.createElement('div');
    row.className = `msg-row ${role}`;
    if (historyIdx !== null) row.dataset.historyIdx = historyIdx;

    const avatar = document.createElement('img');
    avatar.className = 'msg-avatar';
    avatar.src = role === 'bot' ? State.companionAvatar : State.userAvatar;
    avatar.onclick = () => this.pickAvatar(role);

    const container = document.createElement('div');
    container.className = 'msg-container';

    const div = document.createElement('div');
    div.className = `msg ${extraClass}`;
    let contentHtml = '';
    if (imgData) contentHtml += `<img src="${imgData}" class="attached-img">`;
    contentHtml += renderSafeMarkdown(text);
    div.innerHTML = contentHtml;

    enhanceCodeBlocks(div);
    div.querySelectorAll('img').forEach(el => {
      el.style.cursor = 'zoom-in';
      el.onclick = () => this.openLightbox(el.src);
    });

    container.appendChild(div);

    if (!extraClass.includes('thinking')) {
      container.appendChild(this._buildMessageActions(role, text));
    }

    row.appendChild(avatar);
    row.appendChild(container);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return { row, div };
  },

  _buildMessageActions(role, text) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    if (role === 'bot') {
      const speakBtn = document.createElement('button');
      speakBtn.className = 'action-btn';
      speakBtn.textContent = '🔊 Озвучить';
      speakBtn.onclick = () => SpeechModule.speak(text);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.textContent = '📋 Копировать';
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(text);
        copyBtn.textContent = '✅ Скопировано';
        setTimeout(() => { copyBtn.textContent = '📋 Копировать'; }, 1200);
      };

      actions.appendChild(speakBtn);
      actions.appendChild(copyBtn);
    }
    return actions;
  },

  finalizeStreamedMessage(row, div, text, historyIdx) {
    div.className = 'msg';
    div.innerHTML = renderSafeMarkdown(text);
    enhanceCodeBlocks(div);
    div.querySelectorAll('img').forEach(el => {
      el.style.cursor = 'zoom-in';
      el.onclick = () => this.openLightbox(el.src);
    });
    if (historyIdx !== null) row.dataset.historyIdx = historyIdx;
    const container = row.querySelector('.msg-container');
    container.appendChild(this._buildMessageActions('bot', text));
  },

  stopGeneration() { APIModule.abortCurrentRequest(); },

  collectGalleryImages() {
    const images = [];
    State.history.forEach(item => {
      if (item.img) images.push(item.img);
      const text = HistoryModule.extractText(item);
      if (text) {
        const re = /!\[[^\]]*\]\(([^)]+)\)/g;
        let m; while ((m = re.exec(text)) !== null) images.push(m[1]);
      }
    });
    return images;
  },

  openGalleryModal() {
    const box = document.getElementById('galleryGrid');
    box.innerHTML = '';
    const images = this.collectGalleryImages();
    if (!images.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:var(--text-faint); font-size:13px;';
      empty.textContent = 'Нет изображений.';
      box.appendChild(empty);
    } else {
      images.forEach(src => {
        const img = document.createElement('img');
        img.className = 'gallery-thumb';
        img.src = src;
        img.loading = 'lazy';
        img.onclick = () => this.openLightbox(src);
        box.appendChild(img);
      });
    }
    document.getElementById('galleryModal').style.display = 'flex';
  },
  closeGalleryModal() { document.getElementById('galleryModal').style.display = 'none'; },

  openLightbox(src) { document.getElementById('lightboxImg').src = src; document.getElementById('lightboxModal').style.display = 'flex'; },
  closeLightbox() { document.getElementById('lightboxModal').style.display = 'none'; },

  openSearchModal() { document.getElementById('searchModal').style.display = 'flex'; setTimeout(() => document.getElementById('searchInput').focus(), 50); },
  closeSearchModal() { document.getElementById('searchModal').style.display = 'none'; },

  runSearch(query) {
    const box = document.getElementById('searchResults');
    box.innerHTML = '';
    if (!query.trim()) return;
    const results = HistoryModule.search(query);
    if (!results.length) {
      const empty = document.createElement('p');
      empty.style.cssText = 'color:var(--text-faint); font-size:13px;';
      empty.textContent = 'Ничего не найдено.';
      box.appendChild(empty);
      return;
    }
    results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      const roleSpan = document.createElement('span');
      roleSpan.className = 'search-result-role';
      roleSpan.textContent = ((r.role === 'assistant' || r.role === 'model') ? 'Amity' : 'Ты') + ': ';
      item.appendChild(roleSpan);
      item.appendChild(document.createTextNode(r.snippet));
      item.onclick = () => this.jumpToMessage(r.idx);
      box.appendChild(item);
    });
  },

  jumpToMessage(idx) {
    this.closeSearchModal();
    const row = document.querySelector(`#messages [data-history-idx="${idx}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  async sendMessage() {
    if (this._isBusy) return;
    const input = document.getElementById('textInput');
    const text = input.value.trim();
    if (!text && !State.attachedImageBase64 && !State.attachedDocText) return;
    SoundModule.playSend();

    if (text.startsWith('/draw ') || text.startsWith('/perchance ')) {
      const prompt = text.replace(/^\/(draw|perchance)\s+/, '');
      input.value = ''; this.autoResizeInput();
      const imgUrl = APIModule.generatePerchanceImage(prompt);
      const botMarkdown = `✨ **Сгенерировано:**\n\n![Image](${imgUrl})`;
      State.history.push({ role: 'user', content: text });
      State.history.push({ role: 'assistant', content: botMarkdown });
      HistoryModule.save();
      this.addMessageRow('user', text);
      this.addMessageRow('bot', botMarkdown);
      return;
    }

    const imgData = State.attachedImageBase64;
    this.clearAttachedImage();
    let finalText = text;
    if (State.attachedDocText) {
      finalText = `[Файл "${State.attachedDocName}"]\n${State.attachedDocText}\n\n${text}`;
      this.clearAttachedDoc();
    }

    State.history.push({ role: 'user', content: finalText, img: imgData });
    HistoryModule.save();
    input.value = ''; this.autoResizeInput();
    this.addMessageRow('user', text, '', imgData, State.history.length - 1);
    await APIModule.fetchStream();
  },

  pickAvatar(role) { this.targetRoleForAvatar = role; document.getElementById('filePicker').click(); },
  handleAvatarSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => alert('Не удалось прочитать файл.');
    reader.onload = (evt) => {
      if (this.targetRoleForAvatar === 'bot') {
        const p = State.getCurrentPersona();
        if (p) {
          p.avatar = evt.target.result;
          if (!State.savePersonas()) alert('Аватар применён, но слишком велик для сохранения — после перезагрузки страницы придётся выбрать его заново.');
        }
        State.companionAvatar = evt.target.result;
      } else {
        State.userAvatar = evt.target.result;
        if (!safeLocalStorageSet('user_avatar', State.userAvatar)) alert('Аватар применён, но слишком велик для сохранения — после перезагрузки страницы придётся выбрать его заново.');
      }
      this.updateAvatarImages();
    };
    reader.readAsDataURL(file);
  },

  updateAvatarImages() {
    document.getElementById('headerAvatar').src = State.companionAvatar;
    document.querySelectorAll('.msg-row.bot .msg-avatar').forEach(img => img.src = State.companionAvatar);
    document.querySelectorAll('.msg-row.user .msg-avatar').forEach(img => img.src = State.userAvatar);
  },

  pickBackground() { document.getElementById('bgPicker').click(); },

  _safeSetItem(key, value) { return safeLocalStorageSet(key, value); },

  handleBgSelect(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const MAX_MB = 8;
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`Файл слишком большой (${(file.size / 1024 / 1024).toFixed(1)} МБ). Выбери файл до ${MAX_MB} МБ — иначе он не влезет в память браузера.`);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => alert('Не удалось прочитать файл. Попробуй другое изображение.');
    reader.onload = (evt) => {
      const isVideo = file.type.startsWith('video/');
      if (isVideo) {
        State.bgVideoUrl = evt.target.result;
        State.bgImage = "";
        const saved = this._safeSetItem('chat_bg_video', State.bgVideoUrl);
        localStorage.removeItem('chat_bg');
        if (!saved) alert('Фон-видео применён, но слишком велик, чтобы сохраниться — после перезагрузки страницы придётся выбрать его заново.');
      } else {
        State.bgImage = evt.target.result;
        State.bgVideoUrl = "";
        const saved = this._safeSetItem('chat_bg', State.bgImage);
        localStorage.removeItem('chat_bg_video');
        if (!saved) alert('Фон применён, но слишком велик, чтобы сохраниться — после перезагрузки страницы придётся выбрать его заново.');
      }
      this.applyBackground();
    };
    reader.readAsDataURL(file);
  },

  applyBackground() {
    const wrap = document.querySelector('.os-background-wrap');
    const videoEl = document.getElementById('bgVideo');

    if (State.bgVideoUrl && videoEl) {
      videoEl.src = State.bgVideoUrl;
      videoEl.style.display = 'block';
      if (wrap) { wrap.classList.remove('custom-bg-active'); wrap.style.backgroundImage = ''; }
    } else if (State.bgImage && wrap) {
      if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); videoEl.style.display = 'none'; }
      wrap.classList.add('custom-bg-active');
      wrap.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url("${State.bgImage}")`;
    } else {
      if (videoEl) { videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); videoEl.style.display = 'none'; }
      if (wrap) { wrap.classList.remove('custom-bg-active'); wrap.style.backgroundImage = ''; }
    }
  },

  resetBackground() {
    State.bgImage = "";
    State.bgVideoUrl = "";
    localStorage.removeItem('chat_bg');
    localStorage.removeItem('chat_bg_video');
    this.applyBackground();
  },

  pickInputImage() { document.getElementById('imageInputPicker').click(); },
  handleInputImageSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      State.attachedImageBase64 = evt.target.result;
      document.getElementById('previewImg').src = State.attachedImageBase64;
      document.getElementById('imgPreviewBar').style.display = 'flex';
    };
    reader.readAsDataURL(file);
  },
  clearAttachedImage() { State.attachedImageBase64 = null; document.getElementById('imgPreviewBar').style.display = 'none'; },

  pickInputDoc() { document.getElementById('docInputPicker').click(); },
  handleInputDocSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      State.attachedDocText = evt.target.result;
      State.attachedDocName = file.name;
      document.getElementById('docPreviewName').textContent = file.name;
      document.getElementById('docPreviewBar').style.display = 'flex';
    };
    reader.readAsText(file);
  },
  clearAttachedDoc() { State.attachedDocText = null; State.attachedDocName = null; document.getElementById('docPreviewBar').style.display = 'none'; },

  triggerImportJSON() { document.getElementById('importJsonPicker').click(); },
  handleImportJSON(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        State.history = parsed.history || parsed;
        HistoryModule.save(); this.renderHistory(); this.closeSettingsModal();
      } catch (err) { alert("Ошибка импорта JSON"); }
    };
    reader.readAsText(file);
  },

  openSettingsModal() {
    SpeechModule.populateVoices();
    document.getElementById('tempRange').value = State.temperature;
    document.getElementById('tempValue').textContent = State.temperature;
    document.getElementById('systemPromptInput').value = State.systemPrompt;
    document.getElementById('longTermMemoryInput').value = State.longTermMemory;
    
    const isOllama = State.provider === 'ollama';
    const settingsOllamaSection = document.getElementById('settingsOllamaSection');
    if (settingsOllamaSection) {
      settingsOllamaSection.style.display = isOllama ? 'flex' : 'none';
      if (isOllama) {
        this.refreshOllamaModelsList();
      }
    }
    document.getElementById('settingsModal').style.display = 'flex';
  },
  closeSettingsModal() { document.getElementById('settingsModal').style.display = 'none'; },
  updateTempLabel(val) { document.getElementById('tempValue').textContent = val; },

  updateProviderHint() {
    const p = document.getElementById('providerSelect').value;
    const isOllama = p === 'ollama';
    document.getElementById('keySection').style.display = isOllama ? 'none' : 'block';
    
    const ollamaSetupSection = document.getElementById('ollamaSetupSection');
    if (ollamaSetupSection) {
      ollamaSetupSection.style.display = isOllama ? 'block' : 'none';
    }
    if (isOllama) {
      this.refreshOllamaModelsList();
    }
  }
};

const SettingsModule = {
  save() {
    State.temperature = parseFloat(document.getElementById('tempRange').value);
    State.systemPrompt = document.getElementById('systemPromptInput').value;
    State.longTermMemory = document.getElementById('longTermMemoryInput'].value;
    State.selectedVoiceURI = document.getElementById('voiceSelect').value;

    if (State.provider === 'ollama') {
      const settingsSelect = document.getElementById('settingsOllamaSelect');
      if (settingsSelect && settingsSelect.value) {
        State.ollamaModelName = settingsSelect.value;
        localStorage.setItem('ollama_model', State.ollamaModelName);
      }
    }

    localStorage.setItem('temperature', State.temperature);
    localStorage.setItem('system_prompt', State.systemPrompt);
    localStorage.setItem('long_term_memory', State.longTermMemory);
    localStorage.setItem('selected_voice_uri', State.selectedVoiceURI);
    HistoryModule.save();
    UI.closeSettingsModal();
    UI.updateModelHeader();
  }
};

window.onload = () => {
  SpeechModule.init();
  UI.init();
};