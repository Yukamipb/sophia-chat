import './style.css';
import './app.css';

import {SetConfig, SendMessage, TestConnection} from '../wailsjs/go/main/HermesAPI';
import {BrowserOpenURL} from '../wailsjs/runtime';

document.querySelector('#app').innerHTML = `
  <div class="app">
    <aside class="sidebar">
      <div class="brand">S</div>
      <button class="tool-btn active" data-tool="chat" title="Chat">💬</button>
      <button class="tool-btn" data-tool="terminal" title="Terminal">🔧</button>
      <button class="tool-btn" data-tool="files" title="Files">📁</button>
      <button class="tool-btn" data-tool="web" title="Web">🌐</button>
      <button class="tool-btn" data-tool="settings" title="Settings">⚙️</button>
    </aside>

    <section class="main" id="chat-panel">
      <div class="topbar">
        <span class="title">Sophia Chat</span>
        <div class="status">
          <span class="status-dot" id="status-dot"></span>
          <span id="status-text">Disconnected</span>
        </div>
      </div>

      <div class="messages" id="messages"></div>

      <div class="input-area">
        <textarea id="prompt" rows="1" placeholder="Ask Sophia..."></textarea>
        <button id="send-btn">Send</button>
      </div>
    </section>

    <section class="main hidden" id="terminal-panel">
      <div class="topbar"><span class="title">Terminal</span></div>
      <div class="messages" id="terminal-output">
        <div class="message assistant">Terminal access coming in v2. Use the dashboard for now.</div>
      </div>
    </section>

    <section class="main hidden" id="files-panel">
      <div class="topbar"><span class="title">Files</span></div>
      <div class="messages" id="files-output">
        <div class="message assistant">File browser coming in v2. Use the dashboard for now.</div>
      </div>
    </section>

    <section class="main hidden" id="web-panel">
      <div class="topbar"><span class="title">Web</span></div>
      <div class="messages" id="web-output">
        <div class="message assistant">Web search coming in v2. Use the dashboard for now.</div>
      </div>
    </section>

    <aside class="panel hidden" id="settings-panel">
      <h3>Connection</h3>
      <div class="field">
        <label>Base URL</label>
        <input id="cfg-url" type="text" value="https://dash.yukilab.xyz" />
      </div>
      <div class="field">
        <label>Username</label>
        <input id="cfg-user" type="text" value="admin" />
      </div>
      <div class="field">
        <label>Password</label>
        <input id="cfg-pass" type="password" value="" />
      </div>
      <div class="field">
        <label>API Key (optional)</label>
        <input id="cfg-key" type="password" value="" />
      </div>
      <button id="save-cfg">Save & Test</button>
      <div class="field">
        <label>Model</label>
        <input id="cfg-model" type="text" value="Sophia" />
      </div>

      <h3>Quick Links</h3>
      <button id="open-dashboard">Open Dashboard</button>
    </aside>
  </div>
`;

const state = {
  model: 'Sophia',
  busy: false,
};

const messagesEl = document.getElementById('messages');
const promptEl = document.getElementById('prompt');
const sendBtn = document.getElementById('send-btn');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

function loadConfig() {
  const url = localStorage.getItem('sophia-url') || 'https://dash.yukilab.xyz';
  const user = localStorage.getItem('sophia-user') || 'admin';
  const pass = localStorage.getItem('sophia-pass') || '';
  const key = localStorage.getItem('sophia-key') || '';
  const model = localStorage.getItem('sophia-model') || 'Sophia';

  document.getElementById('cfg-url').value = url;
  document.getElementById('cfg-user').value = user;
  document.getElementById('cfg-pass').value = pass;
  document.getElementById('cfg-key').value = key;
  document.getElementById('cfg-model').value = model;
  state.model = model;
  applyConfig();
}

function applyConfig() {
  const url = document.getElementById('cfg-url').value;
  const user = document.getElementById('cfg-user').value;
  const pass = document.getElementById('cfg-pass').value;
  const key = document.getElementById('cfg-key').value;
  state.model = document.getElementById('cfg-model').value;

  SetConfig(url, key, user, pass).then(testConnection).catch(err => {
    setStatus('warn', 'Config error');
    console.error(err);
  });
}

function saveConfig() {
  localStorage.setItem('sophia-url', document.getElementById('cfg-url').value);
  localStorage.setItem('sophia-user', document.getElementById('cfg-user').value);
  localStorage.setItem('sophia-pass', document.getElementById('cfg-pass').value);
  localStorage.setItem('sophia-key', document.getElementById('cfg-key').value);
  localStorage.setItem('sophia-model', document.getElementById('cfg-model').value);
  applyConfig();
}

function setStatus(level, text) {
  statusDot.className = 'status-dot ' + level;
  statusText.textContent = text;
}

function testConnection() {
  setStatus('warn', 'Checking...');
  TestConnection()
    .then(result => {
      setStatus(result.startsWith('HTTP 200') ? 'ok' : 'warn', result);
    })
    .catch(err => {
      setStatus('danger', err.message || 'Failed');
    });
}

function appendMessage(role, text) {
  const div = document.createElement('div');
  div.className = 'message ' + role;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

async function sendMessage() {
  if (state.busy) return;
  const text = promptEl.value.trim();
  if (!text) return;

  appendMessage('user', text);
  promptEl.value = '';
  state.busy = true;
  sendBtn.disabled = true;

  const replyDiv = document.createElement('div');
  replyDiv.className = 'message assistant';
  messagesEl.appendChild(replyDiv);

  try {
    const reply = await SendMessage(state.model, text);
    replyDiv.textContent = reply;
  } catch (err) {
    replyDiv.textContent = 'Error: ' + (err.message || err);
  } finally {
    state.busy = false;
    sendBtn.disabled = false;
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

promptEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);
document.getElementById('save-cfg').addEventListener('click', saveConfig);
document.getElementById('open-dashboard').addEventListener('click', () => {
  BrowserOpenURL('https://dash.yukilab.xyz');
});

// Tool sidebar switching
document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const tool = btn.dataset.tool;
    document.querySelectorAll('.main, .panel').forEach(el => el.classList.add('hidden'));

    if (tool === 'settings') {
      document.getElementById('chat-panel').classList.remove('hidden');
      document.getElementById('settings-panel').classList.remove('hidden');
    } else if (tool === 'chat') {
      document.getElementById('chat-panel').classList.remove('hidden');
    } else {
      document.getElementById(tool + '-panel').classList.remove('hidden');
    }
  });
});

loadConfig();
setInterval(testConnection, 30000);
