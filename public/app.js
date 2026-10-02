const socket = io({
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 1500,
    timeout: 5000
});

let isReconnectingNoticeActive = false;

// Immediate Reconnection on Network Restore or Tab Visibility
window.addEventListener('online', () => {
    if (socket.disconnected) {
        console.log('Network restored. Triggering instant reconnection...');
        socket.connect();
    }
});

// Auto re-join on socket connect or reconnect
socket.on('connect', () => {
    if (isReconnectingNoticeActive) {
        isReconnectingNoticeActive = false;
        const existingNotice = document.getElementById('reconnecting-system-msg');
        if (existingNotice) existingNotice.remove();
        
        const div = document.createElement('div');
        div.classList.add('system-message');
        div.textContent = '✅ Reconnected!';
        messagesContainer.appendChild(div);
        scrollToBottom();
    }
    if (currentUsername) {
        socket.emit('join', { username: currentUsername, userId: currentUserId });
    }
});

// DOM Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');

const appContainer = document.getElementById('app-container');
const userList = document.getElementById('user-list');
const userCount = document.getElementById('user-count');
const currentUserDisplay = document.getElementById('current-user-display');

const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const filePreviewArea = document.getElementById('file-preview-area');
const previewFilename = document.getElementById('preview-filename');
const cancelPreviewBtn = document.getElementById('cancel-preview-btn');
const typingIndicator = document.getElementById('typing-indicator');
const voiceNoteBtn = document.getElementById('voice-note-btn');
const voiceRecordingArea = document.getElementById('voice-recording-area');
const recordingTimer = document.getElementById('recording-timer');
const cancelVoiceBtn = document.getElementById('cancel-voice-btn');
const sendVoiceBtn = document.getElementById('send-voice-btn');

const incomingCallOverlay = document.getElementById('incoming-call-overlay');
const incomingCallerName = document.getElementById('incoming-caller-name');
const acceptCallBtn = document.getElementById('accept-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');
const ringtoneAudio = document.getElementById('ringtone-audio');

const setNoticeOverlay = document.getElementById('set-notice-overlay');
const setNoticeBtn = document.getElementById('set-notice-btn');
const setNoticeForm = document.getElementById('set-notice-form');
const cancelNoticeBtn = document.getElementById('cancel-notice-btn');
const setNoticeStatus = document.getElementById('set-notice-status');
const pinnedNoticeBanner = document.getElementById('pinned-notice-banner');
const pinnedNoticeContent = document.getElementById('pinned-notice-content');
const noticesCountDisplay = document.getElementById('notices-count');
const noticesListContainer = document.getElementById('notices-list-container');

const callOverlay = document.getElementById('call-overlay');
const callPanel = document.getElementById('call-panel');
const callTitle = document.getElementById('call-title');
const audioCallBar = document.getElementById('audio-call-bar');
const videoCallContent = document.getElementById('video-call-content');
const audioCallAvatar = document.getElementById('audio-call-avatar');
const audioCallTargetName = document.getElementById('audio-call-target-name');
const callTimer = document.getElementById('call-timer');
const videoCallTimer = document.getElementById('video-call-timer');
const toggleAudioMiniBtn = document.getElementById('toggle-audio-mini');
const toggleVideoMiniBtn = document.getElementById('toggle-video-mini');
const endCallBtnMini = document.getElementById('end-call-btn-mini');
const minimizeCallBtn = document.getElementById('minimize-call-btn');
const remoteAudio = document.getElementById('remote-audio');
const videoGrid = document.getElementById('video-grid');
const callBtn = document.getElementById('call-btn');
const audioCallBtn = document.getElementById('audio-call-btn');
const endCallBtn = document.getElementById('end-call-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const toggleAudioBtn = document.getElementById('toggle-audio');
const toggleVideoBtn = document.getElementById('toggle-video');

const localMuteIcon = document.getElementById('local-mute-icon');
const remoteMuteIcon = document.getElementById('remote-mute-icon');
const fullscreenBtn = document.getElementById('fullscreen-btn');

const sidebar = document.getElementById('users-panel');
const chatPanel = document.getElementById('chat-panel');
const tabChat = document.getElementById('tab-chat');
const tabUsers = document.getElementById('tab-users');
const mobileUserCount = document.getElementById('mobile-user-count');

let currentUsername = '';
let currentPinnedNotices = [];
// Per-tab unique session ID for mobile reconnection survival without cross-device sync collisions
let currentUserId = sessionStorage.getItem('mychat_userId') || sessionStorage.getItem('dream360_userId');
if (!currentUserId) {
    currentUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
}
sessionStorage.setItem('mychat_userId', currentUserId);
let privateChatTargetId = null;
let activeUsersList = [];
const typingUsersMap = new Map();
let isCalling = false;
let peerConnection;
let localStream;
let remoteStream;
let pendingFile = null;

// Typing Indicator & Voice Note State
let typingDebounceTimeout = null;
let mediaRecorder = null;
let audioChunks = [];
let voiceTimerInterval = null;
let voiceSeconds = 0;
let mediaStream = null;

// Message Storage (tab -> array of message DOM elements)
// 'socketId' -> [...private messages with that user]
const chatHistory = {};
// 'socketId' -> integer count of unread messages
const unreadCounts = {};
// 'socketId' -> array of messageIds that we haven't read yet
const unreadMsgIds = {};


function updateTypingUI() {
    if (privateChatTargetId && typingUsersMap.has(privateChatTargetId)) {
        const typingUserObj = activeUsersList.find(u => u.id === privateChatTargetId);
        const name = typingUserObj ? typingUserObj.name : 'User';
        typingIndicator.textContent = `✍️ ${name} is typing...`;
        typingIndicator.classList.remove('hidden');
    } else {
        typingIndicator.classList.add('hidden');
    }
}

function generateMessageId() {
    return 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
}

function updateTotalUnreadBadge() {
    let total = Object.values(unreadCounts).reduce((a, b) => a + b, 0);
    let badge = tabUsers.querySelector('.tab-badge');
    if (total > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.classList.add('tab-badge');
            tabUsers.appendChild(badge);
        }
        badge.textContent = total;
    } else if (badge) {
        badge.remove();
    }
}

function switchChatTab(targetId) {
    // Hide all current messages
    messagesContainer.innerHTML = '';
    
    if (!targetId) return;

    // Determine which history to load
    const history = chatHistory[targetId] || [];
    
    // Append stored messages
    history.forEach(msgElement => {
        messagesContainer.appendChild(msgElement);
    });
    
    scrollToBottom();
}

// STUN & TURN Servers for WebRTC (Cross-browser fallback + dynamic server-side relay)
let configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
            urls: 'turn:global.relay.metered.ca:80',
            username: '40281fba73af7513dc8637dc',
            credential: 'v05izPW+39hLwdAm'
        },
        {
            urls: 'turn:global.relay.metered.ca:80?transport=tcp',
            username: '40281fba73af7513dc8637dc',
            credential: 'v05izPW+39hLwdAm'
        },
        {
            urls: 'turn:global.relay.metered.ca:443',
            username: '40281fba73af7513dc8637dc',
            credential: 'v05izPW+39hLwdAm'
        },
        {
            urls: 'turns:global.relay.metered.ca:443?transport=tcp',
            username: '40281fba73af7513dc8637dc',
            credential: 'v05izPW+39hLwdAm'
        }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

async function fetchIceServers() {
    try {
        const res = await fetch('/api/ice-servers');
        if (res.ok) {
            const data = await res.json();
            if (data && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
                configuration.iceServers = data.iceServers;
            }
        }
    } catch (e) {
        console.warn('Could not fetch dynamic ICE servers, using built-in defaults:', e);
    }
}
fetchIceServers();

// Web Audio & Autoplay Policy Unlocker for iOS Safari, Chrome, and Opera
let audioCtx = null;

function unlockAudio() {
    try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            if (!audioCtx) {
                audioCtx = new AudioContextClass();
            }
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            // Definitively unlock mobile audio output pipeline by playing a 1-sample silent sound
            try {
                const buffer = audioCtx.createBuffer(1, 1, 22050);
                const source = audioCtx.createBufferSource();
                source.buffer = buffer;
                source.connect(audioCtx.destination);
                source.start(0);
            } catch (bufErr) {}
        }
    } catch (e) {
        console.warn('AudioContext unlock failed:', e);
    }

    if ('audioSession' in navigator) {
        try {
            navigator.audioSession.type = 'play-and-record';
        } catch (e) {}
    }

    // Prime remote video & audio elements synchronously during user gesture
    if (remoteVideo) {
        remoteVideo.muted = false;
        remoteVideo.volume = 1.0;
        const p1 = remoteVideo.play();
        if (p1 !== undefined) p1.catch(() => {});
    }
    if (remoteAudio) {
        remoteAudio.muted = false;
        remoteAudio.volume = 1.0;
        const p2 = remoteAudio.play();
        if (p2 !== undefined) p2.catch(() => {});
    }
}

// Synthesized Ringtone Fallback for iOS Safari / Chrome / Opera
let ringtoneOscInterval = null;
function startRingtoneTone() {
    stopRingtoneTone();
    let audioPlayed = false;
    if (ringtoneAudio) {
        const p = ringtoneAudio.play();
        if (p !== undefined) {
            p.then(() => {
                audioPlayed = true;
            }).catch(() => {
                playSynthesizedRing();
            });
        }
    } else {
        playSynthesizedRing();
    }
}

function playSynthesizedRing() {
    try {
        unlockAudio();
        if (!audioCtx) return;
        
        function pulse() {
            if (!pendingIncomingData) return;
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 1.2);
        }
        pulse();
        ringtoneOscInterval = setInterval(pulse, 2400);
    } catch (e) {}
}

function stopRingtoneTone() {
    if (ringtoneOscInterval) {
        clearInterval(ringtoneOscInterval);
        ringtoneOscInterval = null;
    }
    if (ringtoneAudio) {
        ringtoneAudio.pause();
        ringtoneAudio.currentTime = 0;
    }
}

// =======================
// AUTH & UI LOGIC
// =======================

function performLogin(username) {
    if (!username) return;
    currentUsername = username;
    
    
    // Always emit join unconditionally (Socket.IO handles internal packet buffering)
    socket.emit('join', { username: currentUsername, userId: currentUserId });
    
    currentUserDisplay.textContent = username;
    loginOverlay.classList.remove('active');
    loginOverlay.classList.add('hidden');
    appContainer.classList.remove('hidden');
}

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = usernameInput.value.trim();
    if (username) {
        performLogin(username);
    }
});





// Mobile Tab Logic (Dense Layout)
tabChat.addEventListener('click', () => {
    chatPanel.style.display = '';
    sidebar.style.display = '';
    tabChat.classList.add('active');
    tabUsers.classList.remove('active');
    chatPanel.classList.add('active');
    sidebar.classList.remove('active');
    scrollToBottom();
});

tabUsers.addEventListener('click', () => {
    chatPanel.style.display = '';
    sidebar.style.display = '';
    tabUsers.classList.add('active');
    tabChat.classList.remove('active');
    sidebar.classList.add('active');
    chatPanel.classList.remove('active');
});

function scrollToBottom() {
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

function createMessageElement(isLocal, username, time, messageId) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    msgDiv.classList.add(isLocal ? 'local' : 'remote');
    if (messageId) {
        msgDiv.setAttribute('data-msg-id', messageId);
    }
    
    // Avatar logic
    const avatar = document.createElement('div');
    avatar.classList.add('avatar');
    let initial = username && username.length > 0 ? username.charAt(0).toUpperCase() : '?';
    avatar.textContent = initial;

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');

    const infoDiv = document.createElement('div');
    infoDiv.classList.add('message-info');
    
    let infoHtml = '<span>' + username + '</span> <span class="time">' + time + '</span>';
    if (isLocal && messageId) {
        infoHtml += ' <span id="status-' + messageId + '" class="msg-status sent">✓</span>';
    }
    infoDiv.innerHTML = infoHtml;
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.classList.add('message-bubble');
    
    contentDiv.appendChild(infoDiv);
    contentDiv.appendChild(bubbleDiv);
    
    if (isLocal) {
        msgDiv.appendChild(contentDiv);
        msgDiv.appendChild(avatar);
    } else {
        msgDiv.appendChild(avatar);
        msgDiv.appendChild(contentDiv);
    }
    
    return { msgDiv, bubbleDiv };
}

function handleIncomingMessageReceipt(data, tabId) {
    if (!data.messageId) return;
    
    let isCurrentlyViewing = (privateChatTargetId === tabId);
    if (window.innerWidth <= 768 && !tabChat.classList.contains('active')) {
        isCurrentlyViewing = false;
    }
    if (document.visibilityState !== 'visible') {
        isCurrentlyViewing = false;
    }

    if (isCurrentlyViewing) {
        socket.emit('message_status_update', {
            targetId: data.senderId,
            messageId: data.messageId,
            status: 'read'
        });
    } else {
        socket.emit('message_status_update', {
            targetId: data.senderId,
            messageId: data.messageId,
            status: 'delivered'
        });
        if (!unreadMsgIds[data.senderId]) unreadMsgIds[data.senderId] = [];
        if (!unreadMsgIds[data.senderId].includes(data.messageId)) {
            unreadMsgIds[data.senderId].push(data.messageId);
        }
    }
}

// =======================
// SOCKET.IO EVENTS
// =======================

function selectPrivateChatTarget(targetId) {
    const userObj = activeUsersList.find(u => u.id === targetId);
    if (!userObj) return;

    if (privateChatTargetId && privateChatTargetId !== targetId) {
        socket.emit('typing_stop', { targetId: privateChatTargetId });
        if (typingDebounceTimeout) clearTimeout(typingDebounceTimeout);
    }
    privateChatTargetId = targetId;

    // Re-render: clear unread counts for this user
    unreadCounts[targetId] = 0;
    updateTotalUnreadBadge();
    const targetLi = document.getElementById("user-li-" + targetId);
    if (targetLi) {
        const badge = targetLi.querySelector('.unread-badge');
        if (badge) badge.remove();
    }

    // Send read receipts for any unread messages from this user
    if (unreadMsgIds[targetId] && unreadMsgIds[targetId].length > 0) {
        unreadMsgIds[targetId].forEach(msgId => {
            socket.emit('message_status_update', {
                targetId: targetId,
                messageId: msgId,
                status: 'read'
            });
        });
        unreadMsgIds[targetId] = [];
    }

    // Enable chat UI
    const currentChatHeader = document.querySelector('.chat-header-info h3');
    if (currentChatHeader) currentChatHeader.textContent = `💬 Chatting with ${userObj.name}`;
    messageInput.placeholder = `Type a message to ${userObj.name}...`;
    messageInput.disabled = false;
    
    chatPanel.classList.add('active');
    switchChatTab(targetId);
    updateTypingUI();
    
    // Highlight active user item in sidebar
    document.querySelectorAll('#user-list li').forEach(el => {
        el.style.border = 'none';
        el.style.background = 'transparent';
        el.style.borderBottom = '1px solid rgba(255,255,255,0.02)';
    });
    if (targetLi) {
        targetLi.style.borderLeft = '3px solid var(--primary)';
        targetLi.style.background = 'rgba(255, 255, 255, 0.08)';
    }
    
    if (window.innerWidth <= 768) {
        tabChat.click();
    }
}

socket.on('update_users', (users) => {
    activeUsersList = users || [];
    userList.innerHTML = '';
    
    userCount.textContent = `(${users.length})`;
    mobileUserCount.textContent = users.length;
    
    const otherUsers = users.filter(u => u.id !== currentUserId && u.id !== socket.id);

    // If no active chat target or previous target left, auto-select first available online partner
    if ((!privateChatTargetId || !activeUsersList.some(u => u.id === privateChatTargetId)) && otherUsers.length > 0) {
        privateChatTargetId = otherUsers[0].id;
    } else if (otherUsers.length === 0) {
        privateChatTargetId = null;
        messageInput.disabled = true;
        messageInput.placeholder = "Waiting for another user to join...";
        const currentChatHeader = document.querySelector('.chat-header-info h3');
        if (currentChatHeader) currentChatHeader.textContent = 'Waiting for another user to join...';
    }

    users.forEach(user => {
        const isSelf = (user.id === currentUserId || user.id === socket.id);
        
        const li = document.createElement('li');
        li.id = `user-li-${user.id}`;
        
        li.innerHTML = `
            <div class="user-status-dot"></div>
            <div class="user-name-text">${user.name} ${isSelf ? '<b>(You)</b>' : ''}</div>
        `;
        
        const unreadCount = unreadCounts[user.id] || 0;
        if (unreadCount > 0 && !isSelf) {
            const badge = document.createElement('span');
            badge.classList.add('unread-badge');
            badge.textContent = unreadCount;
            li.appendChild(badge);
        }

        if (isSelf) {
            li.style.cursor = 'default';
            li.style.opacity = '0.7';
        } else {
            li.style.cursor = 'pointer';
            li.onclick = () => selectPrivateChatTarget(user.id);
        }
        
        userList.appendChild(li);
    });

    if (privateChatTargetId) {
        selectPrivateChatTarget(privateChatTargetId);
    }
});

socket.on('system_message', (msg) => {
    const div = document.createElement('div');
    div.classList.add('system-message');
    div.textContent = msg;
    
    // In a purely DM layout, system messages (like "User joined")
    // can just be appended to the current active window (if any)
    if (privateChatTargetId) {
        chatHistory[privateChatTargetId] = chatHistory[privateChatTargetId] || [];
        chatHistory[privateChatTargetId].push(div);
        messagesContainer.appendChild(div);
        scrollToBottom();
    }
});

socket.on('private_message', (data) => {
    const isLocal = data.isSelfToTarget; 
    
    // We don't need "To: " prefixes anymore since it's tabbed
    let displayUsername = data.username;
    if (isLocal && data.username.startsWith('To: ')) {
        displayUsername = data.username.substring(4);
    }
    
    // If it's a message we sent, we want it to show *our* name in the chat
    if (isLocal) {
        displayUsername = currentUsername;
    }
    
    const { msgDiv, bubbleDiv } = createMessageElement(isLocal, displayUsername, data.time, data.messageId);
    if (data.messageId) msgDiv.setAttribute('data-msg-id', data.messageId);
    
    if (data.replyTo && data.replyTo.text) {
        const quoteBox = document.createElement('div');
        quoteBox.classList.add('quoted-reply-box');
        quoteBox.innerHTML = '<span class="quoted-author">↩️ ' + data.replyTo.username + '</span><span class="quoted-text">' + data.replyTo.text + '</span>';
        quoteBox.addEventListener('click', () => {
            const targetMsg = document.querySelector('[data-msg-id="' + data.replyTo.messageId + '"]');
            if (targetMsg) {
                targetMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetMsg.classList.remove('highlight-scroll');
                void targetMsg.offsetWidth;
                targetMsg.classList.add('highlight-scroll');
            }
        });
        bubbleDiv.appendChild(quoteBox);
    }
    const textSpan = document.createElement('span');
    textSpan.textContent = data.text;
    bubbleDiv.appendChild(textSpan);
    
    // Determine which tab this message belongs to
    // If we sent it, it's the target user. If we received it, it's the sender.
    const tabId = isLocal ? privateChatTargetId : data.senderId;
    
    if (!isLocal) handleIncomingMessageReceipt(data, tabId);
    
    if (!chatHistory[tabId]) chatHistory[tabId] = [];
    chatHistory[tabId].push(msgDiv);

    // Only append to DOM if we are actively looking at that user's tab
    if (privateChatTargetId === tabId) {
        messagesContainer.appendChild(msgDiv);
        scrollToBottom();
    } else if (!isLocal) {
        // We received a message from someone else while not looking at them
        unreadCounts[tabId] = (unreadCounts[tabId] || 0) + 1;
        updateTotalUnreadBadge();
        
        const userLi = document.getElementById("user-li-" + tabId);
        if (userLi) {
            let badge = userLi.querySelector('.unread-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.classList.add('unread-badge');
                userLi.appendChild(badge);
            }
            badge.textContent = unreadCounts[tabId];
        }
    }
});

// ==========================================
// FILE DOWNLOAD & STORAGE UTILITIES
// ==========================================
window.fileDataStore = window.fileDataStore || new Map();

function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getFileIcon(type, name) {
    const n = (name || '').toLowerCase();
    const t = (type || '').toLowerCase();
    if (t.startsWith('image/')) return '🖼️';
    if (t.startsWith('video/')) return '🎥';
    if (t.startsWith('audio/')) return '🎵';
    if (n.endsWith('.pdf') || t.includes('pdf')) return '📕';
    if (n.endsWith('.doc') || n.endsWith('.docx') || t.includes('word') || t.includes('officedocument.wordprocessingml')) return '📘';
    if (n.endsWith('.xls') || n.endsWith('.xlsx') || t.includes('sheet') || t.includes('excel') || t.includes('spreadsheetml')) return '📗';
    if (n.endsWith('.ppt') || n.endsWith('.pptx') || t.includes('presentation') || t.includes('presentationml')) return '📙';
    if (n.endsWith('.zip') || n.endsWith('.rar') || n.endsWith('.7z') || n.endsWith('.tar') || n.endsWith('.gz') || t.includes('zip') || t.includes('compressed')) return '📦';
    if (n.endsWith('.txt') || n.endsWith('.csv') || n.endsWith('.json') || n.endsWith('.md')) return '📄';
    return '📁';
}

function downloadFile(dataUrl, filename, mimeType) {
    if (!dataUrl) {
        alert('File data is missing or corrupted.');
        return;
    }

    const cleanFilename = (filename || 'download').replace(/[/\\?%*:|"<>]/g, '_');

    try {
        let blob;
        let detectedMime = mimeType || 'application/octet-stream';

        if (dataUrl.startsWith('data:')) {
            const commaIdx = dataUrl.indexOf(',');
            if (commaIdx !== -1) {
                const header = dataUrl.substring(0, commaIdx);
                const b64Data = dataUrl.substring(commaIdx + 1);
                const mimeMatch = header.match(/:(.*?);/);
                if (mimeMatch && mimeMatch[1]) {
                    detectedMime = mimeMatch[1];
                }

                // Decode base64 in chunks to prevent stack overflow on large files
                const byteCharacters = atob(b64Data);
                const byteArrays = [];
                const sliceSize = 1024;
                for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
                    const slice = byteCharacters.slice(offset, offset + sliceSize);
                    const byteNumbers = new Array(slice.length);
                    for (let i = 0; i < slice.length; i++) {
                        byteNumbers[i] = slice.charCodeAt(i);
                    }
                    byteArrays.push(new Uint8Array(byteNumbers));
                }
                blob = new Blob(byteArrays, { type: detectedMime });
            } else {
                throw new Error('Malformed data URL');
            }
        } else if (dataUrl.startsWith('blob:')) {
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = dataUrl;
            a.download = cleanFilename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (a.parentNode) document.body.removeChild(a);
            }, 5000);
            return;
        } else {
            // Standard HTTP/S URL
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = dataUrl;
            a.download = cleanFilename;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (a.parentNode) document.body.removeChild(a);
            }, 5000);
            return;
        }

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = cleanFilename;
        
        // Mobile iOS Safari compatibility
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            a.target = '_blank';
        }

        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            if (a.parentNode) document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
        }, 15000);
    } catch (err) {
        console.error('Download via Blob failed, attempting direct download fallback:', err);
        try {
            const fallbackLink = document.createElement('a');
            fallbackLink.style.display = 'none';
            fallbackLink.href = dataUrl;
            fallbackLink.download = cleanFilename;
            fallbackLink.target = '_blank';
            document.body.appendChild(fallbackLink);
            fallbackLink.click();
            setTimeout(() => {
                if (fallbackLink.parentNode) document.body.removeChild(fallbackLink);
            }, 5000);
        } catch (e2) {
            console.error('All download methods failed:', e2);
            alert('Could not download file. Please check browser permissions.');
        }
    }
}

window.triggerFileDownload = function(messageId, element) {
    let file = window.fileDataStore ? window.fileDataStore.get(messageId) : null;
    if (!file && element) {
        const card = element.closest('.file-message-card');
        if (card && card._fileData) {
            file = card._fileData;
        }
    }
    if (!file || !file.url) {
        console.warn('File data not found for message:', messageId);
        alert('File data is no longer available in memory. Please ask the sender to re-send.');
        return;
    }
    downloadFile(file.url, file.name, file.type);
};

socket.on('file_message', (data) => {
    // Only process file messages that are sent directly to us or by us in a DM
    if (!data.isPrivate && !data.isSelfToTarget) return; // Ignore global file messages completely
    
    const isLocal = data.username === currentUsername || data.isSelfToTarget;
    
    let displayUsername = data.username;
    if (isLocal && data.username.startsWith('To: ')) {
        displayUsername = data.username.substring(4);
    }
    if (isLocal) {
        displayUsername = currentUsername;
    }

    const { msgDiv, bubbleDiv } = createMessageElement(isLocal, displayUsername, data.time, data.messageId);
    
    // Store in global memory map for fast, reliable click-to-download
    if (!window.fileDataStore) window.fileDataStore = new Map();
    window.fileDataStore.set(data.messageId, {
        url: data.url,
        name: data.name,
        type: data.type
    });

    const fileType = (data.type || '').toLowerCase();
    const fileName = data.name || 'file';
    const computedSize = data.size || (data.url ? Math.round((data.url.length * 3) / 4) : 0);
    const sizeDisplay = formatFileSize(computedSize);
    const icon = getFileIcon(fileType, fileName);

    let mediaPreviewHtml = '';
    if (fileType.startsWith('image/')) {
        mediaPreviewHtml = `
            <div class="file-preview-thumbnail" onclick="triggerFileDownload('${data.messageId}', this)" title="Click to download image">
                <img src="${data.url}" alt="${fileName}" class="file-preview-img" loading="lazy" />
            </div>
        `;
    } else if (fileType.startsWith('video/')) {
        mediaPreviewHtml = `
            <video src="${data.url}" controls class="file-preview-video"></video>
        `;
    } else if (fileType.startsWith('audio/')) {
        mediaPreviewHtml = `
            <audio src="${data.url}" controls class="file-preview-audio"></audio>
        `;
    }

    bubbleDiv.innerHTML = `
        <div class="file-message-card" id="file-card-${data.messageId}">
            ${mediaPreviewHtml}
            <div class="file-info-row">
                <div class="file-icon-badge">${icon}</div>
                <div class="file-text-info">
                    <span class="file-name" title="${fileName}">${fileName}</span>
                    <span class="file-size">${sizeDisplay}</span>
                </div>
                <button type="button" class="file-download-btn" onclick="triggerFileDownload('${data.messageId}', this)" title="Download ${fileName}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Download</span>
                </button>
            </div>
        </div>
    `;

    // Attach data directly to DOM element so download works across tab switches
    const cardEl = bubbleDiv.querySelector('.file-message-card');
    if (cardEl) {
        cardEl._fileData = { url: data.url, name: fileName, type: fileType };
    }
    
    const tabId = isLocal ? privateChatTargetId : data.senderId;
    
    if (!isLocal) handleIncomingMessageReceipt(data, tabId);
    
    if (!chatHistory[tabId]) chatHistory[tabId] = [];
    chatHistory[tabId].push(msgDiv);

    if (privateChatTargetId === tabId) {
        messagesContainer.appendChild(msgDiv);
        scrollToBottom();
    } else if (!isLocal) {
        // Handle unread badges for files received in the background
        const senderId = data.senderId;
        if (senderId) {
            unreadCounts[senderId] = (unreadCounts[senderId] || 0) + 1;
            updateTotalUnreadBadge();
            
            const userLi = document.getElementById(`user-li-${senderId}`);
            if (userLi) {
                let badge = userLi.querySelector('.unread-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.classList.add('unread-badge');
                    userLi.appendChild(badge);
                }
                badge.textContent = unreadCounts[senderId];
            }
        }
    }
});

socket.on('message_status_update', (data) => {
    const statusSpan = document.getElementById(`status-${data.messageId}`);
    if (statusSpan) {
        if (data.status === 'delivered') {
            if (!statusSpan.classList.contains('read')) {
                statusSpan.textContent = '✓✓';
                statusSpan.classList.remove('sent');
                statusSpan.classList.add('delivered');
            }
        } else if (data.status === 'read') {
            statusSpan.textContent = '✓✓';
            statusSpan.classList.remove('sent', 'delivered');
            statusSpan.classList.add('read');
        }
    }
});

function renderNoticesList() {
    if (!noticesListContainer) return;
    noticesListContainer.innerHTML = '';
    
    if (noticesCountDisplay) {
        noticesCountDisplay.textContent = currentPinnedNotices.length;
    }

    if (currentPinnedNotices.length === 0) {
        noticesListContainer.innerHTML = `<p style="font-size:0.85rem; color:var(--text-secondary); text-align:center; padding:1rem;">No active notices right now.</p>`;
        return;
    }

    currentPinnedNotices.forEach((notice, index) => {
        const card = document.createElement('div');
        card.classList.add('notice-card');
        if (index === 0) card.classList.add('latest-notice');

        card.innerHTML = `
            <div class="notice-card-header">
                <span class="notice-author">📌 ${notice.author} ${index === 0 ? '<span style="font-size:0.7rem; background:var(--primary); color:white; padding:1px 5px; border-radius:4px; margin-left:4px;">LATEST</span>' : ''}</span>
                <span class="notice-time">${notice.time || ''}</span>
            </div>
            <div class="notice-text">${notice.text}</div>
            <button type="button" class="notice-delete-btn" data-id="${notice.id}">Delete Notice</button>
        `;

        const delBtn = card.querySelector('.notice-delete-btn');
        delBtn.addEventListener('click', () => {
            socket.emit('delete_pinned_notice', { id: notice.id });
        });

        noticesListContainer.appendChild(card);
    });
}

socket.on('pinned_notices', (notices) => {
    currentPinnedNotices = notices || [];
    
    // Display only the latest notice on the top banner
    if (currentPinnedNotices.length > 0) {
        const latestNotice = currentPinnedNotices[0];
        pinnedNoticeContent.innerHTML = `📢 <strong>Notice from ${latestNotice.author} (${latestNotice.time}):</strong> ${latestNotice.text}`;
        pinnedNoticeBanner.classList.remove('hidden');
    } else {
        pinnedNoticeBanner.classList.add('hidden');
        pinnedNoticeContent.textContent = '';
    }

    renderNoticesList();
});

// =======================
// MESSAGING & UPLOADS
// =======================

cancelPreviewBtn.addEventListener('click', (e) => {
    e.preventDefault();
    pendingFile = null;
    previewFilename.textContent = '';
    filePreviewArea.classList.add('hidden');
    fileInput.value = '';
});

fileInput.addEventListener('change', (e) => {
    if (!privateChatTargetId) {
        alert('Please select a user from the Online Users tab to attach a file.');
        fileInput.value = '';
        return;
    }
    const file = e.target.files[0];
    if (!file) return;

    pendingFile = file;
    previewFilename.textContent = file.name;
    filePreviewArea.classList.remove('hidden');
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    
    if (!privateChatTargetId && (text || pendingFile)) {
        alert('Please select a user from the Online Users tab to start chatting.');
        return;
    }
    
    if (!text && !pendingFile) return;

    // Send Text
    if (text) {
        const msgId = generateMessageId();
        socket.emit('chat_message', { 
            text: text, 
            targetId: privateChatTargetId, 
            messageId: msgId
        });

        messageInput.value = '';

        if (typingDebounceTimeout) clearTimeout(typingDebounceTimeout);
        socket.emit('typing_stop', { targetId: privateChatTargetId });
    }

    // Send File (In-Memory Ephemeral DataURL via WebSockets - Zero Disk Storage)
    if (pendingFile) {
        const fileToSend = pendingFile;
        // reset UI immediately
        pendingFile = null;
        filePreviewArea.classList.add('hidden');
        previewFilename.textContent = '';
        fileInput.value = '';

        if (fileToSend.size > 10 * 1024 * 1024) {
            alert('File size exceeds maximum limit of 10MB.');
            return;
        }

        uploadStatus.textContent = `Sending ${fileToSend.name}...`;

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target.result;
            const fileData = {
                targetId: privateChatTargetId,
                messageId: generateMessageId(),
                name: fileToSend.name,
                size: fileToSend.size,
                type: fileToSend.type,
                url: dataUrl
            };
            socket.emit('file_message', fileData);
            uploadStatus.textContent = '';
        };
        reader.onerror = () => {
            uploadStatus.textContent = 'Error reading file.';
            setTimeout(() => uploadStatus.textContent = '', 3000);
        };
        reader.readAsDataURL(fileToSend);
    }
});

// =======================
// TYPING INDICATOR LOGIC
// =======================
messageInput.addEventListener('input', () => {
    if (!privateChatTargetId) return;

    const val = messageInput.value.trim();
    if (val.length > 0) {
        socket.emit('typing_start', { targetId: privateChatTargetId });

        if (typingDebounceTimeout) clearTimeout(typingDebounceTimeout);
        typingDebounceTimeout = setTimeout(() => {
            socket.emit('typing_stop', { targetId: privateChatTargetId });
        }, 2500);
    } else {
        if (typingDebounceTimeout) clearTimeout(typingDebounceTimeout);
        socket.emit('typing_stop', { targetId: privateChatTargetId });
    }
});

socket.on('user_typing_start', (data) => {
    if (!data || !data.senderId) return;
    if (typingUsersMap.has(data.senderId)) {
        clearTimeout(typingUsersMap.get(data.senderId));
    }
    const timeoutId = setTimeout(() => {
        typingUsersMap.delete(data.senderId);
        updateTypingUI();
    }, 6000);
    typingUsersMap.set(data.senderId, timeoutId);
    updateTypingUI();
});

socket.on('user_typing_stop', (data) => {
    if (!data || !data.senderId) return;
    if (typingUsersMap.has(data.senderId)) {
        clearTimeout(typingUsersMap.get(data.senderId));
        typingUsersMap.delete(data.senderId);
    }
    updateTypingUI();
});

// =======================
// VOICE NOTES RECORDING
// =======================
function stopVoiceRecordingUI() {
    if (voiceTimerInterval) {
        clearInterval(voiceTimerInterval);
        voiceTimerInterval = null;
    }
    voiceSeconds = 0;
    recordingTimer.textContent = 'Recording 0:00';
    voiceRecordingArea.classList.add('hidden');
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
}

function getSupportedAudioMimeType() {
    if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) {
        return '';
    }
    const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg'
    ];
    for (const t of candidates) {
        if (MediaRecorder.isTypeSupported(t)) {
            return t;
        }
    }
    return '';
}

voiceNoteBtn.addEventListener('click', async () => {
    if (!privateChatTargetId) {
        alert('Please select a user from the Online Users tab to send a voice note.');
        return;
    }

    try {
        unlockAudio();
        mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        
        const mimeType = getSupportedAudioMimeType();
        mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.start();
        voiceSeconds = 0;
        voiceRecordingArea.classList.remove('hidden');

        voiceTimerInterval = setInterval(() => {
            voiceSeconds++;
            const mins = Math.floor(voiceSeconds / 60);
            const secs = voiceSeconds % 60;
            recordingTimer.textContent = `Recording ${mins}:${secs < 10 ? '0' : ''}${secs}`;
        }, 1000);

    } catch (err) {
        console.error('Error accessing microphone:', err);
        alert('Could not access microphone for voice note. Please check permissions.');
    }
});

cancelVoiceBtn.addEventListener('click', () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.onstop = null;
        mediaRecorder.stop();
    }
    stopVoiceRecordingUI();
});

sendVoiceBtn.addEventListener('click', () => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

    const recordedSeconds = voiceSeconds;
    const finalMimeType = mediaRecorder.mimeType || getSupportedAudioMimeType() || 'audio/webm';

    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: finalMimeType });
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            const mins = Math.floor(recordedSeconds / 60);
            const secs = recordedSeconds % 60;
            const formattedDuration = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

            socket.emit('file_message', {
                targetId: privateChatTargetId,
                messageId: generateMessageId(),
                name: `Voice Note (${formattedDuration})`,
                size: audioBlob.size,
                type: finalMimeType,
                url: dataUrl
            });
        };
        reader.readAsDataURL(audioBlob);
        stopVoiceRecordingUI();
    };

    mediaRecorder.stop();
});

// =======================
// GLOBAL NOTICE MESSAGING
// =======================

setNoticeBtn.addEventListener('click', () => {
    setNoticeOverlay.classList.remove('hidden');
    setNoticeStatus.textContent = '';
    document.getElementById('set-notice-text').value = '';
    renderNoticesList();
});

cancelNoticeBtn.addEventListener('click', () => {
    setNoticeOverlay.classList.add('hidden');
});

setNoticeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const textInput = document.getElementById('set-notice-text');
    const text = textInput.value.trim();
    if (!text) return;
    
    setNoticeStatus.textContent = 'Pinning notice...';
    
    socket.emit('set_pinned_notice', { text: text });
    
    textInput.value = '';
    setTimeout(() => {
        setNoticeStatus.textContent = 'Notice pinned successfully!';
        setTimeout(() => {
            setNoticeStatus.textContent = '';
        }, 2000);
    }, 300);
});

// =======================
// WEBRTC CALLING & AUDIO/VIDEO CALLS
// =======================

let callTargetId = null;
let pendingIncomingData = null;
let pendingCandidates = [];
let callTimerInterval = null;
let callDurationSeconds = 0;
let isVideoCallActive = false;
let isCallMinimized = false;

function startCallTimer() {
    if (callTimerInterval) clearInterval(callTimerInterval);
    callDurationSeconds = 0;
    updateTimerDisplay();
    callTimerInterval = setInterval(() => {
        callDurationSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    const mins = Math.floor(callDurationSeconds / 60);
    const secs = callDurationSeconds % 60;
    const formatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    if (callTimer) callTimer.textContent = formatted;
    if (videoCallTimer) videoCallTimer.textContent = formatted;
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callDurationSeconds = 0;
    if (callTimer) callTimer.textContent = 'Connecting...';
    if (videoCallTimer) videoCallTimer.textContent = 'Connecting...';
}

async function flushPendingCandidates() {
    if (!peerConnection || !peerConnection.remoteDescription) return;
    while (pendingCandidates.length > 0) {
        const cand = pendingCandidates.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(cand));
        } catch (e) {
            console.warn('Error adding buffered ICE candidate:', e);
        }
    }
}

function getTargetUsername(targetId) {
    if (!targetId) return 'User';
    const userLi = document.getElementById("user-li-" + targetId);
    if (userLi) {
        const nameText = userLi.querySelector('.user-name-text');
        if (nameText) return nameText.textContent.replace('(You)', '').trim();
    }
    return 'User';
}

function updateCallUI(isVideo, targetName) {
    isVideoCallActive = !!isVideo;
    if (isVideo) {
        if (callTitle) callTitle.textContent = 'Video Call';
        if (videoCallContent) videoCallContent.classList.remove('hidden');
        if (audioCallBar) audioCallBar.classList.add('hidden');
        if (toggleVideoBtn) {
            toggleVideoBtn.textContent = 'Stop Video';
            toggleVideoBtn.classList.remove('danger');
        }
    } else {
        if (callTitle) callTitle.textContent = 'Audio Call';
        if (videoCallContent) videoCallContent.classList.add('hidden');
        if (audioCallBar) audioCallBar.classList.remove('hidden');
        if (audioCallTargetName && targetName) {
            audioCallTargetName.textContent = targetName;
        }
        if (audioCallAvatar && targetName && targetName.length > 0) {
            audioCallAvatar.textContent = targetName.charAt(0).toUpperCase();
        }
        if (toggleVideoBtn) {
            toggleVideoBtn.textContent = 'Start Video';
            toggleVideoBtn.classList.add('danger');
        }
    }
}

async function setupLocalMedia(videoEnabled) {
    try {
        let stream = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: videoEnabled ? {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                } : false
            });
        } catch (err1) {
            console.warn('[WebRTC] Advanced constraints failed, falling back to basic audio:true', err1);
            stream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: videoEnabled ? true : false
            });
        }

        localStream = stream;
        localVideo.srcObject = localStream;
        localVideo.muted = true; // Prevent local mic loopback/echo
        
        updateCallUI(videoEnabled, getTargetUsername(callTargetId || privateChatTargetId));
        return true;
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Could not access camera/microphone. Please ensure permissions are granted and the connection is secure (HTTPS).');
        return false;
    }
}

function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);
    
    // Add local stream tracks
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Initialize remote stream container
    remoteStream = new MediaStream();
    if (remoteVideo) {
        remoteVideo.srcObject = remoteStream;
        remoteVideo.muted = false;
        remoteVideo.volume = 1.0;
    }
    if (remoteAudio) {
        remoteAudio.srcObject = remoteStream;
        remoteAudio.muted = false;
        remoteAudio.volume = 1.0;
    }
    
    peerConnection.ontrack = (event) => {
        console.log('[WebRTC] Received remote track:', event.track ? event.track.kind : 'unknown');

        // Use the stream provided by the event directly — avoids complex dedup
        const incomingStream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

        // Add any new tracks to our consolidated remoteStream
        incomingStream.getTracks().forEach(t => {
            t.enabled = true;
            if (!remoteStream.getTracks().some(existing => existing.id === t.id)) {
                remoteStream.addTrack(t);
            }
        });

        // Ensure both elements point to the consolidated remoteStream
        if (remoteVideo && remoteVideo.srcObject !== remoteStream) {
            remoteVideo.srcObject = remoteStream;
        }
        if (remoteAudio && remoteAudio.srcObject !== remoteStream) {
            remoteAudio.srcObject = remoteStream;
        }

        // Play remoteVideo (forces audio output to LOUDSPEAKER on mobile devices)
        if (remoteVideo) {
            remoteVideo.muted = false;
            remoteVideo.volume = 1.0;
            const p1 = remoteVideo.play();
            if (p1 !== undefined) p1.catch(e => console.warn('[WebRTC] remoteVideo play caught:', e));
        }

        // Play remoteAudio as backup output channel
        if (remoteAudio) {
            remoteAudio.muted = false;
            remoteAudio.volume = 1.0;
            const p2 = remoteAudio.play();
            if (p2 !== undefined) p2.catch(e => console.warn('[WebRTC] remoteAudio play caught:', e));
        }
    };

    // ICE Candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && callTargetId) {
            socket.emit('webrtc_ice_candidate', {
                candidate: event.candidate,
                targetId: callTargetId 
            });
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        const state = peerConnection.iceConnectionState;
        console.log('[WebRTC] ICE Connection State:', state);
        if (state === 'connected' || state === 'completed') {
            if (!callTimerInterval) startCallTimer();
            if (remoteVideo && remoteVideo.paused) remoteVideo.play().catch(() => {});
            if (remoteAudio && remoteAudio.paused) remoteAudio.play().catch(() => {});
        } else if (state === 'checking') {
            if (callTimer) callTimer.textContent = 'Connecting...';
        } else if (state === 'failed') {
            console.warn('[WebRTC] ICE connection failed. Symmetric NAT detected (TURN relay required).');
            if (callTimer) callTimer.textContent = 'Connection failed (Carrier NAT)';
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log('[WebRTC] Peer Connection State:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            if (!callTimerInterval) startCallTimer();
            if (remoteVideo && remoteVideo.paused) remoteVideo.play().catch(() => {});
            if (remoteAudio && remoteAudio.paused) remoteAudio.play().catch(() => {});
        }
    };
}

// Initiating Call
async function initiateCall(videoEnabled) {
    if (isCalling) return;
    
    if (!privateChatTargetId) {
        alert('Please select a user from the Online Users tab to call.');
        return;
    }

    // Crucial for iOS Safari, Chrome & Opera: Prime and unlock the audio element directly within user touch/click gesture
    unlockAudio();

    const hasMedia = await setupLocalMedia(videoEnabled);
    if (!hasMedia) return;

    callOverlay.classList.remove('hidden');
    isCalling = true;
    callTargetId = privateChatTargetId;
    pendingCandidates = [];
    
    await fetchIceServers();
    createPeerConnection();

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        socket.emit('webrtc_offer', { 
            sdp: peerConnection.localDescription,
            video: videoEnabled,
            targetId: callTargetId
        });
    } catch (err) {
        console.error('Error creating offer:', err);
        cleanupCall();
    }
}

callBtn.addEventListener('click', () => initiateCall(true));
audioCallBtn.addEventListener('click', () => initiateCall(false));

// End Call & Cleanup
function cleanupCall() {
    stopCallTimer();
    stopRingtoneTone();
    pendingCandidates = [];

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        remoteStream = null;
    }
    if (remoteAudio) {
        remoteAudio.pause();
        remoteAudio.srcObject = null;
    }
    if (remoteVideo) {
        remoteVideo.pause();
        remoteVideo.srcObject = null;
    }
    
    incomingCallOverlay.classList.add('hidden');
    pendingIncomingData = null;
    
    localMuteIcon.classList.add('hidden');
    remoteMuteIcon.classList.add('hidden');

    callTargetId = null;
    isCalling = false;
    isCallMinimized = false;
    callOverlay.classList.add('hidden');
    if (audioCallBar) audioCallBar.classList.add('hidden');
    if (videoCallContent) videoCallContent.classList.remove('hidden');

    if (toggleAudioBtn) {
        toggleAudioBtn.textContent = 'Mute';
        toggleAudioBtn.classList.remove('danger');
    }
    if (toggleAudioMiniBtn) {
        toggleAudioMiniBtn.textContent = '🎤';
        toggleAudioMiniBtn.classList.remove('danger');
    }
}

endCallBtn.addEventListener('click', () => {
    if (callTargetId) {
        socket.emit('end_call', {
            targetId: callTargetId
        });
    }
    cleanupCall();
});

if (endCallBtnMini) {
    endCallBtnMini.addEventListener('click', () => {
        if (callTargetId) {
            socket.emit('end_call', {
                targetId: callTargetId
            });
        }
        cleanupCall();
    });
}

// Socket Signaling Logic
socket.on('webrtc_offer', async (data) => {
    if (isCalling) {
        // Handle in-call renegotiation (e.g. partner turning on video during audio call)
        if (peerConnection && data.senderId === callTargetId) {
            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
                await flushPendingCandidates();
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                socket.emit('webrtc_answer', {
                    sdp: peerConnection.localDescription,
                    targetId: callTargetId
                });
                if (data.video) {
                    updateCallUI(true, data.username || 'User');
                }
            } catch (err) {
                console.error("Error handling renegotiation offer:", err);
            }
        } else {
            // Already in another call
            socket.emit('end_call', { targetId: data.senderId });
        }
        return;
    }

    pendingIncomingData = data;
    callTargetId = data.senderId;
    
    const callType = data.video ? 'Video' : 'Audio';
    incomingCallerName.textContent = `Incoming ${callType} Call from ${data.username || 'User'}`;
    
    // Show modal and play sound
    incomingCallOverlay.classList.remove('hidden');
    
    // Play ringtone with synthesized fallback for Safari / mobile autoplay
    startRingtoneTone();
});

acceptCallBtn.addEventListener('click', async () => {
    if (!pendingIncomingData) return;
    const data = pendingIncomingData;
    
    stopRingtoneTone();
    incomingCallOverlay.classList.add('hidden');
    pendingIncomingData = null;

    // Crucial for Safari & Chrome: Prime audio element inside direct user click/touch handler
    unlockAudio();

    const hasMedia = await setupLocalMedia(data.video);
    if (!hasMedia) {
        socket.emit('end_call', { targetId: callTargetId });
        cleanupCall();
        return;
    }

    callOverlay.classList.remove('hidden');
    isCalling = true;
    
    await fetchIceServers();
    createPeerConnection();
    
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
        await flushPendingCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('webrtc_answer', {
            sdp: peerConnection.localDescription,
            targetId: callTargetId
        });

        if (remoteVideo && remoteVideo.paused) remoteVideo.play().catch(() => {});
        if (remoteAudio && remoteAudio.paused) remoteAudio.play().catch(() => {});
    } catch (err) {
        console.error('Error answering WebRTC call:', err);
        cleanupCall();
    }
});

rejectCallBtn.addEventListener('click', () => {
    if (callTargetId) {
        socket.emit('end_call', { targetId: callTargetId });
    }
    cleanupCall();
});

socket.on('webrtc_answer', async (data) => {
    if (!peerConnection) return;
    if (data.senderId === callTargetId) {
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));
            await flushPendingCandidates();
            if (remoteVideo && remoteVideo.paused) {
                remoteVideo.play().catch(() => {});
            }
            if (remoteAudio && remoteAudio.paused) {
                remoteAudio.play().catch(() => {});
            }
        } catch (err) {
            console.error('Error setting remote description from answer:', err);
        }
    }
});

socket.on('webrtc_ice_candidate', async (data) => {
    if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error('Error adding received ice candidate:', e);
        }
    } else {
        // Buffer candidate until remote description is set on the peer connection
        pendingCandidates.push(data.candidate);
    }
});

socket.on('call_error', (data) => {
    alert(data.message || 'Call failed: user is unavailable.');
    cleanupCall();
});

socket.on('end_call', (data) => {
    // Only accept end_call from our current or pending target
    if (callTargetId === data.senderId) {
        if (isCalling || pendingIncomingData) {
            cleanupCall();
            if (isCalling) {
                alert('Call ended by remote user');
            }
        }
    }
});

// Audio Track Mute / Unmute
function toggleAudioTrack() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const isMuted = !audioTrack.enabled;

            toggleAudioBtn.textContent = isMuted ? 'Unmute' : 'Mute'; 
            toggleAudioBtn.classList.toggle('danger', isMuted);

            if (toggleAudioMiniBtn) {
                toggleAudioMiniBtn.textContent = isMuted ? '🔇' : '🎤';
                toggleAudioMiniBtn.classList.toggle('danger', isMuted);
                toggleAudioMiniBtn.title = isMuted ? 'Unmute Mic' : 'Mute Mic';
            }
            
            // Toggle local mute icon
            if (isMuted) {
                localMuteIcon.classList.remove('hidden');
            } else {
                localMuteIcon.classList.add('hidden');
            }
            
            // Notify remote user
            if (callTargetId) {
                socket.emit('mute_status_update', {
                    targetId: callTargetId,
                    isMuted: isMuted
                });
            }
        }
    }
}

toggleAudioBtn.addEventListener('click', toggleAudioTrack);
if (toggleAudioMiniBtn) toggleAudioMiniBtn.addEventListener('click', toggleAudioTrack);

socket.on('mute_status_update', (data) => {
    if (data.senderId === callTargetId) {
        if (data.isMuted) {
            remoteMuteIcon.classList.remove('hidden');
        } else {
            remoteMuteIcon.classList.add('hidden');
        }
    }
});

// Video Upgrade / Toggle
toggleVideoBtn.addEventListener('click', async () => {
    if (!localStream) return;

    let videoTrack = localStream.getVideoTracks()[0];

    // Case 1: Video track already exists (toggle enable/disable)
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        updateCallUI(videoTrack.enabled, getTargetUsername(callTargetId));
        return;
    }

    // Case 2: Call started as audio-only -> Request camera dynamically & upgrade to video
    try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, 
            audio: false 
        });
        const newVideoTrack = videoStream.getVideoTracks()[0];

        if (newVideoTrack) {
            localStream.addTrack(newVideoTrack);
            localVideo.srcObject = localStream;

            if (peerConnection) {
                peerConnection.addTrack(newVideoTrack, localStream);

                // Renegotiate WebRTC offer with call partner
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);

                socket.emit('webrtc_offer', {
                    sdp: peerConnection.localDescription,
                    video: true,
                    targetId: callTargetId
                });
            }

            updateCallUI(true, getTargetUsername(callTargetId));
        }
    } catch (err) {
        console.error('Error enabling camera during call:', err);
        alert('Could not access camera for video call.');
    }
});

if (toggleVideoMiniBtn) {
    toggleVideoMiniBtn.addEventListener('click', () => {
        toggleVideoBtn.click();
    });
}

if (minimizeCallBtn) {
    minimizeCallBtn.addEventListener('click', () => {
        isCallMinimized = !isCallMinimized;
        if (isCallMinimized) {
            videoCallContent.classList.add('hidden');
            audioCallBar.classList.remove('hidden');
        } else {
            videoCallContent.classList.remove('hidden');
            audioCallBar.classList.add('hidden');
        }
    });
}

fullscreenBtn.addEventListener('click', () => {
    if (remoteVideo.requestFullscreen) {
        remoteVideo.requestFullscreen().catch(err => console.error("Error attempting to enable fullscreen:", err));
    } else if (remoteVideo.webkitRequestFullscreen) { /* Safari */
        remoteVideo.webkitRequestFullscreen();
    } else if (remoteVideo.msRequestFullscreen) { /* IE11 */
        remoteVideo.msRequestFullscreen();
    }
});

// =======================
// THEME TOGGLE
// =======================
const themeToggleBtn = document.getElementById('theme-toggle-btn');

// Check local storage for preference
if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
}

themeToggleBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    
    // Save preference
    if (document.body.classList.contains('light-mode')) {
        localStorage.setItem('theme', 'light');
    } else {
        localStorage.setItem('theme', 'dark');
    }
});

// =======================
// FONT SIZE CONTROLS
// =======================
const fontIncreaseBtn = document.getElementById('font-increase-btn');
const fontDecreaseBtn = document.getElementById('font-decrease-btn');
const root = document.documentElement;

let currentFontSize = parseInt(localStorage.getItem('fontSize')) || 16;
root.style.setProperty('--base-font-size', `${currentFontSize}px`);

fontIncreaseBtn.addEventListener('click', () => {
    if (currentFontSize < 24) { // Max size
        currentFontSize += 2;
        root.style.setProperty('--base-font-size', `${currentFontSize}px`);
        localStorage.setItem('fontSize', currentFontSize);
    }
});

fontDecreaseBtn.addEventListener('click', () => {
    if (currentFontSize > 12) { // Min size
        currentFontSize -= 2;
        root.style.setProperty('--base-font-size', `${currentFontSize}px`);
        localStorage.setItem('fontSize', currentFontSize);
    }
});

// =======================
// MOBILE BACKGROUND RECOVERY
// =======================
// iOS/Android aggressively pause JS when the screen locks or app is backgrounded.
// This forces an immediate check and reconnection when the user returns.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (socket.disconnected) {
            console.log('Browser woke up, forcing socket reconnection...');
            socket.connect();
        }
        
        // Auto-read messages for the currently open tab
        if (privateChatTargetId && unreadMsgIds[privateChatTargetId] && unreadMsgIds[privateChatTargetId].length > 0) {
            let isCurrentlyViewing = true;
            if (window.innerWidth <= 768 && !tabChat.classList.contains('active')) {
                isCurrentlyViewing = false;
            }
            if (isCurrentlyViewing) {
                unreadMsgIds[privateChatTargetId].forEach(msgId => {
                    socket.emit('message_status_update', {
                        targetId: privateChatTargetId,
                        messageId: msgId,
                        status: 'read'
                    });
                });
                unreadMsgIds[privateChatTargetId] = [];
                
                // Clear unread counts visually
                unreadCounts[privateChatTargetId] = 0;
                updateTotalUnreadBadge();
                const userLi = document.getElementById(`user-li-${privateChatTargetId}`);
                if (userLi) {
                    const badge = userLi.querySelector('.unread-badge');
                    if (badge) badge.remove();
                }
            }
        }
    }
});

// Auto-rejoin if the server dropped us while we were asleep
socket.on('disconnect', (reason) => {
    console.warn('Socket disconnected:', reason);
    if (currentUsername && !isReconnectingNoticeActive) {
        isReconnectingNoticeActive = true;
        const div = document.createElement('div');
        div.id = 'reconnecting-system-msg';
        div.classList.add('system-message');
        div.textContent = '⚡ Network lost. Reconnecting...';
        messagesContainer.appendChild(div);
        scrollToBottom();
    }
});

// =======================
// ACCENT COLOR & THEME CUSTOMIZATION
// =======================
const colorThemeBtn = document.getElementById('color-theme-btn');
const colorThemeOverlay = document.getElementById('color-theme-overlay');
const closeColorModalBtn = document.getElementById('close-color-modal-btn');
const resetColorBtn = document.getElementById('reset-color-btn');
const accentColorPicker = document.getElementById('accent-color-picker');
const accentHexDisplay = document.getElementById('accent-hex-display');
const colorPresetsGrid = document.getElementById('color-presets-grid');

const COLOR_PRESETS = [
    { id: 'indigo', name: 'Electric Indigo', hex: '#6366f1' },
    { id: 'cyan', name: 'Neon Cyan', hex: '#06b6d4' },
    { id: 'emerald', name: 'Emerald Teal', hex: '#10b981' },
    { id: 'rose', name: 'Vibrant Rose', hex: '#f43f5e' },
    { id: 'amber', name: 'Warm Amber', hex: '#f59e0b' },
    { id: 'violet', name: 'Royal Violet', hex: '#8b5cf6' },
    { id: 'ocean', name: 'Ocean Blue', hex: '#3b82f6' },
    { id: 'crimson', name: 'Crimson Flame', hex: '#ef4444' },
    { id: 'slate', name: 'Slate Charcoal', hex: '#64748b' }
];

function hexToRgb(hex) {
    let c = hex.replace('#', '').trim();
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return { r: 99, g: 102, b: 241, str: '99, 102, 241' };
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return { r, g, b, str: `${r}, ${g}, ${b}` };
}

function adjustHexBrightness(hex, percent) {
    let { r, g, b } = hexToRgb(hex);
    r = Math.min(255, Math.max(0, Math.round(r * (1 + percent / 100))));
    g = Math.min(255, Math.max(0, Math.round(g * (1 + percent / 100))));
    b = Math.min(255, Math.max(0, Math.round(b * (1 + percent / 100))));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function applyAccentColor(hex) {
    if (!hex) hex = '#6366f1';
    const rgbObj = hexToRgb(hex);
    const hoverHex = adjustHexBrightness(hex, -15);
    
    document.documentElement.style.setProperty('--primary', hex);
    document.documentElement.style.setProperty('--primary-hover', hoverHex);
    document.documentElement.style.setProperty('--primary-rgb', rgbObj.str);
    document.documentElement.style.setProperty('--glass-border', `rgba(${rgbObj.str}, 0.25)`);
    document.documentElement.style.setProperty('--message-own-bg', `rgba(${rgbObj.str}, 0.18)`);

    try {
        localStorage.setItem('mychat_accent_color', hex);
    } catch (e) {
        console.warn('Could not save accent color to localStorage', e);
    }

    if (accentColorPicker) accentColorPicker.value = hex;
    if (accentHexDisplay) accentHexDisplay.textContent = hex.toUpperCase();

    if (colorPresetsGrid) {
        document.querySelectorAll('.color-preset-btn').forEach(btn => {
            if (btn.dataset.hex.toLowerCase() === hex.toLowerCase()) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
}

function initColorCustomization() {
    // Render Preset Swatches
    if (colorPresetsGrid) {
        colorPresetsGrid.innerHTML = '';
        COLOR_PRESETS.forEach(preset => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.classList.add('color-preset-btn');
            btn.dataset.hex = preset.hex;
            btn.innerHTML = `<span class="color-swatch-dot" style="background: ${preset.hex};"></span><span>${preset.name}</span>`;
            btn.addEventListener('click', () => {
                applyAccentColor(preset.hex);
            });
            colorPresetsGrid.appendChild(btn);
        });
    }

    // Load saved accent color or default
    const savedColor = localStorage.getItem('mychat_accent_color') || localStorage.getItem('dream360_accent_color') || '#6366f1';
    applyAccentColor(savedColor);

    if (colorThemeBtn && colorThemeOverlay) {
        colorThemeBtn.addEventListener('click', () => {
            colorThemeOverlay.classList.remove('hidden');
        });
    }

    if (closeColorModalBtn && colorThemeOverlay) {
        closeColorModalBtn.addEventListener('click', () => {
            colorThemeOverlay.classList.add('hidden');
        });
    }

    if (colorThemeOverlay) {
        colorThemeOverlay.addEventListener('click', (e) => {
            if (e.target === colorThemeOverlay) {
                colorThemeOverlay.classList.add('hidden');
            }
        });
    }

    if (resetColorBtn) {
        resetColorBtn.addEventListener('click', () => {
            applyAccentColor('#6366f1'); // Default Electric Indigo
        });
    }

    if (accentColorPicker) {
        accentColorPicker.addEventListener('input', (e) => {
            applyAccentColor(e.target.value);
        });
    }
}

// Run init on startup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initColorCustomization);
} else {
    initColorCustomization();
}


