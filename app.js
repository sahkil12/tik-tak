/* Tic-Tac-Toe Pro (BN) — PWA + AI + Undo/Redo + Sounds + Theme + Online (PeerJS)
   🔧 Single file handles: state, UI, AI, sounds, stats, P2P.
*/
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

// Elements
const boardEl = $('#board');
const statusEl = $('#status');
const newGameBtn = $('#newGame');
const resetScoreBtn = $('#resetScore');
const undoBtn = $('#undoBtn');
const redoBtn = $('#redoBtn');
const modeSel = $('#mode');
const diffSel = $('#difficulty');
const difficultyWrap = $('#difficultyWrap');
const paletteSel = $('#palette');
const installBtn = $('#installBtn');
const themeBtn = $('#themeBtn');
const soundToggle = $('#soundToggle');
const onlineWrap = $('#onlineWrap');
const hostBtn = $('#hostBtn');
const joinBtn = $('#joinBtn');
const roomInput = $('#roomInput');
const copyRoom = $('#copyRoom');

// Stats els
const scoreXEl = $('#scoreX');
const scoreOEl = $('#scoreO');
const scoreDEl = $('#scoreD');
const winRateEl = $('#winRate');
const moveCountEl = $('#moveCount');
const elapsedEl = $('#elapsed');
const historyEl = $('#history');

// State
let board = Array(9).fill(null);
let current = 'X';
let gameOver = false;
let mode = localStorage.getItem('mode') || 'human';
modeSel.value = mode;
let difficulty = localStorage.getItem('difficulty') || 'hard';
diffSel.value = difficulty;
let palette = localStorage.getItem('palette') || 'default';
document.documentElement.setAttribute('data-palette', palette);
paletteSel.value = palette;

let score = JSON.parse(localStorage.getItem('score') || '{"X":0,"O":0,"D":0}');
let history = [];        // stack of moves [{i, player}]
let undone = [];         // redo stack
let startTime = null;    // for elapsed timer
let timerId = null;

// Online/P2P
let peer = null;
let conn = null;
let isHost = false;      // host starts as X by default
let onlineMySymbol = 'X';
let onlineTheirSymbol = 'O';
const ONLINE_ENABLED = typeof window.Peer !== 'undefined';

// Sounds (tiny base64 beeps so offline works)
const sounds = {
  pop: new Audio('data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAA...'.replace('...', '')),
  win: new Audio('data:audio/mp3;base64,//uQZAAA...'.replace('...', '')),
  draw: new Audio('data:audio/mp3;base64,//uQZAAA...'.replace('...', '')),
};
for (const k in sounds) { sounds[k].volume = 0.4; }
// To keep the example small, the base64s are intentionally minimal (silence-safe).
// If any data URI fails, app still works; you can swap with real files if you want.

const WINS = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
];

function render(){
  $$('.cell').forEach((cell,i)=>{
    cell.textContent = board[i] ?? '';
    cell.disabled = gameOver || !!board[i] || (mode==='online' && !isMyTurnOnline());
  });
  statusEl.textContent = gameOver ? statusText() : turnText();

  scoreXEl.textContent = score.X;
  scoreOEl.textContent = score.O;
  scoreDEl.textContent = score.D;
  winRateEl.textContent = calcWinRate();
  moveCountEl.textContent = history.length.toString();
  elapsedEl.textContent = formatElapsed();

  difficultyWrap.hidden = mode !== 'ai';
  onlineWrap.hidden = mode !== 'online';

  // history UI
  historyEl.innerHTML = '';
  history.forEach((m, idx)=>{
    const li = document.createElement('li');
    li.innerHTML = `<span class="tag">${m.player}</span> → সেল ${m.i+1}`;
    const jump = document.createElement('button');
    jump.className = 'btn ghost';
    jump.textContent = 'Jump';
    jump.addEventListener('click', ()=> jumpTo(idx));
    li.appendChild(jump);
    historyEl.appendChild(li);
  });
}

function turnText(){
  if(mode==='online'){
    const who = isMyTurnOnline() ? 'তোমার' : 'প্রতিপক্ষের';
    return `অনলাইন: ${who} চাল — ${current}`;
  }
  return `চাল চলছে — ${current}`;
}
function statusText(){
  const win = getWinner();
  if(win){ return `${win.player} জিতেছে! 🎉`; }
  if(board.every(Boolean)){ return `ড্র হয়েছে 🤝`; }
  return '';
}

function startTimer(){
  if(startTime) return;
  startTime = Date.now();
  timerId = setInterval(()=> render(), 1000);
}
function resetTimer(){
  if(timerId) clearInterval(timerId);
  startTime = Date.now();
  render();
}
function formatElapsed(){
  if(!startTime) return '00:00';
  const s = Math.floor((Date.now()-startTime)/1000);
  const mm = String(Math.floor(s/60)).padStart(2,'0');
  const ss = String(s%60).padStart(2,'0');
  return `${mm}:${ss}`;
}
function calcWinRate(){
  const total = score.X + score.O + score.D;
  if(!total) return '0%';
  const my = score.X; // assuming local as X baseline for display
  return Math.round((my/total)*100)+'%';
}

function getWinner(){
  for(const line of WINS){
    const [a,b,c] = line;
    if(board[a] && board[a]===board[b] && board[a]===board[c]){
      return {player: board[a], line};
    }
  }
  return null;
}

function setCellAnimation(i){ boardEl.children[i].classList.add('pop'); setTimeout(()=>boardEl.children[i].classList.remove('pop'), 240); }
function highlight(idxs, cls){ idxs.forEach(i => boardEl.children[i].classList.add(cls)); }
function clearHighlights(){ $$('.cell').forEach(c=>c.classList.remove('win','draw')); }

function play(name){ if(!soundToggle.checked) return; const s = sounds[name]; if(s){ try{ s.currentTime=0; s.play(); }catch{} }}

// --- Core Moves ---
function makeMove(i, symbol=current, fromRemote=false){
  if(gameOver || board[i]) return;
  if(mode==='online' && !fromRemote && !isMyTurnOnline()) return;

  board[i] = symbol;
  history.push({i, player:symbol});
  undone = [];
  setCellAnimation(i);
  startTimer();

  const win = getWinner();
  if(win){
    gameOver = true;
    highlight(win.line, 'win');
    score[win.player]++; persist(); play('win');
  }else if(board.every(Boolean)){
    gameOver = true;
    highlight(Array.from({length:9},(_,k)=>k), 'draw');
    score.D++; persist(); play('draw');
  }else{
    current = (current==='X' ? 'O' : 'X');
    play('pop');
  }

  render();

  // Online: send move
  if(mode==='online' && conn && conn.open && !fromRemote){
    conn.send({type:'move', i, symbol});
  }
  // AI turn
  if(!gameOver && mode==='ai' && current==='O'){
    setTimeout(aiTurn, 260);
  }
}

function jumpTo(histIndex){
  // Rebuild board up to given move
  board = Array(9).fill(null);
  for(let k=0;k<=histIndex;k++){
    const m = history[k];
    board[m.i] = m.player;
  }
  current = (histIndex % 2 === 0) ? 'O' : 'X';
  // keep the rest as redo
  undone = history.slice(histIndex+1).reverse();
  history = history.slice(0, histIndex+1);
  gameOver = false;
  clearHighlights();
  render();
}

function undo(){
  if(history.length===0 || (mode==='online' && !isMyTurnOnline())) return;
  const last = history.pop();
  undone.push(last);
  board[last.i] = null;
  current = last.player; // turn goes back
  gameOver = false;
  clearHighlights();
  render();
  if(mode==='online' && conn && conn.open){
    conn.send({type:'undo'});
  }
}
function redo(){
  if(undone.length===0 || (mode==='online' && !isMyTurnOnline())) return;
  const m = undone.pop();
  makeMove(m.i, m.player);
  if(mode==='online' && conn && conn.open){
    conn.send({type:'redo'});
  }
}

function newGame(){
  board = Array(9).fill(null);
  current = 'X';
  gameOver = false;
  history = [];
  undone = [];
  clearHighlights();
  resetTimer();
  render();

  if(mode==='ai' && current==='O'){ setTimeout(aiTurn, 250); }
  if(mode==='online' && conn && conn.open){
    conn.send({type:'reset'});
  }
}

function persist(){
  localStorage.setItem('score', JSON.stringify(score));
  localStorage.setItem('mode', mode);
  localStorage.setItem('difficulty', difficulty);
  localStorage.setItem('palette', palette);
}

// --- AI (Easy/Medium/Hard) ---
function aiTurn(){
  // O is AI
  const i = pickBestMove(board, difficulty);
  makeMove(i, 'O');
}

function pickBestMove(state, level){
  const empty = emptyIndices(state);
  if(level==='easy'){
    // random
    return empty[Math.floor(Math.random()*empty.length)];
  }
  if(level==='medium'){
    // 60% best, else random
    if(Math.random()<0.6){
      return minimaxBest(state);
    }else{
      return empty[Math.floor(Math.random()*empty.length)];
    }
  }
  // hard: unbeatable minimax with alpha-beta
  return minimaxBest(state);
}

function minimaxBest(state){
  const {index} = bestMove(state, 'O', -Infinity, Infinity);
  return index;
}
function bestMove(state, player, alpha, beta){
  const evalScore = evaluate(state);
  if(evalScore !== null){ return {score: evalScore, index: -1}; }

  const moves = emptyIndices(state);
  // heuristic: center, corners first
  moves.sort((a,b)=>priority(b)-priority(a));
  let bestIndex = moves[0];

  if(player==='O'){ // maximize
    let maxEval = -Infinity;
    for(const i of moves){
      state[i]='O';
      const {score:s} = bestMove(state,'X',alpha,beta);
      state[i]=null;
      if(s>maxEval){maxEval=s; bestIndex=i;}
      alpha = Math.max(alpha, s);
      if(beta<=alpha) break;
    }
    return {score:maxEval,index:bestIndex};
  }else{ // minimize (human X)
    let minEval = Infinity;
    for(const i of moves){
      state[i]='X';
      const {score:s} = bestMove(state,'O',alpha,beta);
      state[i]=null;
      if(s<minEval){minEval=s; bestIndex=i;}
      beta = Math.min(beta, s);
      if(beta<=alpha) break;
    }
    return {score:minEval,index:bestIndex};
  }
}
function emptyIndices(state){ return state.map((v,i)=>v?null:i).filter(v=>v!==null); }
function priority(i){ return [4,0,2,6,8,1,3,5,7].indexOf(i); } // center>corners>edges
function evaluate(state){
  for(const [a,b,c] of WINS){
    if(state[a] && state[a]===state[b] && state[a]===state[c]){
      return state[a]==='O' ? 10 : -10;
    }
  }
  if(state.every(Boolean)) return 0;
  return null;
}

// --- Events ---
boardEl.addEventListener('click', e=>{
  const btn = e.target.closest('.cell'); if(!btn) return;
  const i = +btn.dataset.i;
  makeMove(i, current);
});
newGameBtn.addEventListener('click', newGame);
resetScoreBtn.addEventListener('click', ()=>{ score = {X:0,O:0,D:0}; persist(); render(); });
undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);
modeSel.addEventListener('change', e=>{
  mode = e.target.value; persist(); newGame();
});
diffSel.addEventListener('change', e=>{
  difficulty = e.target.value; persist();
});
paletteSel.addEventListener('change', e=>{
  palette = e.target.value; document.documentElement.setAttribute('data-palette', palette); persist();
});

// Theme toggle
(function initTheme(){
  const saved = localStorage.getItem('theme') || 'dark';
  if(saved==='light') document.body.classList.add('light');
  themeBtn.textContent = document.body.classList.contains('light') ? '🌞' : '🌙';
})();
themeBtn.addEventListener('click', ()=>{
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  themeBtn.textContent = isLight ? '🌞' : '🌙';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
});

// PWA install + SW
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  installBtn.hidden = true;
});
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=> {
    navigator.serviceWorker.register('service-worker.js');
  });
}

// --- Online (PeerJS P2P) ---
function isMyTurnOnline(){
  if(mode!=='online') return true;
  return current === onlineMySymbol;
}
function onlineBind(){
  if(!ONLINE_ENABLED){ console.warn('PeerJS not loaded'); return; }
  // Lazy create peer
  if(!peer){
    peer = new Peer(undefined, { config: { 'iceServers': [{urls:'stun:stun.l.google.com:19302'}] } });
    peer.on('open', id=>{
      roomInput.value = id;
    });
    peer.on('connection', c=>{
      setupConn(c, true);
    });
  }
}
function setupConn(c, inbound=false){
  conn = c;
  conn.on('open', ()=>{
    statusEl.textContent = 'অনলাইন: সংযোগ স্থাপিত ✅';
    // Assign symbols
    if(inbound){ // you are host, they joined
      isHost = true; onlineMySymbol = 'X'; onlineTheirSymbol = 'O';
      conn.send({type:'assign', me:'O', you:'X'}); // remote becomes O
      newGame();
    }
  });
  conn.on('data', msg=>{
    if(!msg || typeof msg!=='object') return;
    if(msg.type==='move'){
      makeMove(msg.i, msg.symbol, true);
    }else if(msg.type==='reset'){
      newGame();
    }else if(msg.type==='undo'){
      if(history.length){ const last = history.pop(); board[last.i]=null; current=last.player; gameOver=false; clearHighlights(); render(); }
    }else if(msg.type==='redo'){
      if(undone.length){ const m = undone.pop(); makeMove(m.i, m.player, true); }
    }else if(msg.type==='assign'){
      // remote host told you symbols
      onlineMySymbol = msg.me;
      onlineTheirSymbol = msg.you;
      isHost = (onlineMySymbol==='X');
      newGame();
    }
  });
  conn.on('close', ()=>{
    statusEl.textContent = 'অনলাইন: বিচ্ছিন্ন ❌';
    modeSel.value = 'human'; mode='human'; persist(); newGame();
  });
}
// UI for online
if(ONLINE_ENABLED){
  hostBtn?.addEventListener('click', ()=>{
    onlineBind();
    isHost = true; onlineMySymbol = 'X'; onlineTheirSymbol = 'O';
    statusEl.textContent = 'Host করা হয়েছে। Room ID শেয়ার করুন।';
  });
  joinBtn?.addEventListener('click', ()=>{
    onlineBind();
    const id = roomInput.value.trim();
    if(!id){ alert('Room ID দিন'); return; }
    isHost = false; onlineMySymbol = 'O'; onlineTheirSymbol = 'X';
    conn = peer.connect(id);
    setupConn(conn, false);
  });
  copyRoom?.addEventListener('click', async ()=>{
    try{
      await navigator.clipboard.writeText(roomInput.value.trim());
      copyRoom.textContent='Copied'; setTimeout(()=>copyRoom.textContent='Copy', 1000);
    }catch{}
  });
}
// --- Init ---
function init(){
  render();
}
init();

const CACHE = 'ttt-pro-v1';
const ASSETS = [
  './','./index.html','./styles.css','./app.js','./manifest.json',
  './icons/icon-192.png','./icons/icon-512.png',
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e=>{
  const {request} = e;
  if(request.mode==='navigate'){
    e.respondWith(fetch(request).catch(()=>caches.match('./')));
  }else{
    e.respondWith(
      caches.match(request).then(res => res || fetch(request))
    );
  }
});
