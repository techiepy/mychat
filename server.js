require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first'); // Force IPv4 to bypass Render IPv6 SMTP blocks
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

// Helper for Indian Standard Time formatting
const getISTTime = () => new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour12: true,
    hour: 'numeric',
    minute: '2-digit'
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB max message size for base64 files
    pingTimeout: 10000,     // 10 seconds ping timeout for instant drop detection
    pingInterval: 10000     // Send a ping every 10 seconds
});

const PORT = process.env.PORT || 3000;

// Serve static files from public directory
app.use(express.static('public', {
    setHeaders: (res, filePath) => {
        // Prevent aggressive iOS Safari caching for instant client updates
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
    }
}));

// ICE Servers endpoint for WebRTC STUN/TURN negotiation
let cachedMeteredIce = null;
let cachedMeteredTime = 0;
let lastMeteredStatus = 'unconfigured';

app.get('/api/ice-servers', async (req, res) => {
    const defaultStunServers = [
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
    ];

    // Check if Metered credentials exist in environment variables (with working dream360 defaults)
    let meteredApp = (process.env.METERED_APP_NAME || 'dream360-chat').trim();
    const meteredKey = (process.env.METERED_API_KEY || 'c04ab7188ab5293b168534813388046a8688').trim();

    if (meteredApp) {
        // Strip any leading https:// or http://
        meteredApp = meteredApp.replace(/^https?:\/\//i, '');
        // Strip trailing slash
        meteredApp = meteredApp.replace(/\/+$/, '');
        // Strip .metered.live if user pasted full domain
        meteredApp = meteredApp.replace(/\.metered\.live$/i, '');
    }

    if (meteredApp && meteredKey) {
        const now = Date.now();
        if (cachedMeteredIce && (now - cachedMeteredTime) < 10 * 60 * 1000) {
            return res.json({
                iceServers: [...defaultStunServers, ...cachedMeteredIce],
                meteredStatus: 'active',
                relayCount: cachedMeteredIce.length
            });
        }
        try {
            const apiUrl = `https://${meteredApp}.metered.live/api/v1/turn/credentials?apiKey=${meteredKey}`;
            const apiRes = await fetch(apiUrl);
            if (apiRes.ok) {
                const meteredServers = await apiRes.json();
                if (Array.isArray(meteredServers)) {
                    cachedMeteredIce = meteredServers;
                    cachedMeteredTime = now;
                    lastMeteredStatus = 'active';
                    return res.json({
                        iceServers: [...defaultStunServers, ...cachedMeteredIce],
                        meteredStatus: 'active',
                        relayCount: cachedMeteredIce.length
                    });
                }
            } else {
                const errBody = await apiRes.text();
                lastMeteredStatus = `Error ${apiRes.status}: ${errBody}`;
                console.warn(`[ICE] Metered API HTTP ${apiRes.status}:`, errBody);
            }
        } catch (err) {
            lastMeteredStatus = `Exception: ${err.message}`;
            console.warn('[ICE] Failed to fetch Metered TURN servers:', err.message);
        }
    } else {
        lastMeteredStatus = meteredApp ? 'missing_api_key' : (meteredKey ? 'missing_app_name' : 'unconfigured');
    }

    // Check if custom TURN server is provided in environment variables
    if (process.env.TURN_URL) {
        const customTurn = {
            urls: process.env.TURN_URL.split(',').map(u => u.trim()),
            username: process.env.TURN_USERNAME || '',
            credential: process.env.TURN_CREDENTIAL || process.env.TURN_PASSWORD || ''
        };
        return res.json({
            iceServers: [...defaultStunServers, customTurn],
            meteredStatus: lastMeteredStatus
        });
    }

    return res.json({
        iceServers: defaultStunServers,
        meteredStatus: lastMeteredStatus
    });
});

// Socket.IO event handling
// socket.id -> { id: persistentUserId, name: username }
const users = new Map();

// Global Pinned Notices State (List of permanent notices, newest first)
let pinnedNotices = [];

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join', (data) => {
        const username = data.username;
        const persistentId = data.userId;

        // Remove any old/stale sockets for this persistentId
        for (const [sId, uData] of users.entries()) {
            if (uData.id === persistentId && sId !== socket.id) {
                users.delete(sId);
                const oldSocket = io.sockets.sockets.get(sId);
                if (oldSocket) {
                    try { oldSocket.disconnect(true); } catch (e) {}
                }
            }
        }

        users.set(socket.id, { id: persistentId, name: username });
        io.emit('system_message', `${username} joined the chat`);

        // Emit user list with unique users
        const uniqueUsersMap = new Map();
        for (const userObj of users.values()) {
            uniqueUsersMap.set(userObj.id, userObj);
        }
        const userList = Array.from(uniqueUsersMap.values());
        io.emit('update_users', userList);

        // Send current pinned notices to newly connected socket
        socket.emit('pinned_notices', pinnedNotices);
    });

    socket.on('chat_message', (data) => {
        const userObj = users.get(socket.id) || { name: 'Anonymous', id: 'unknown' };
        if (!data || !data.text) return;

        let targetName = 'User';

        if (data.targetId) {
            for (const [sId, uData] of users.entries()) {
                if (uData.id === data.targetId) {
                    targetName = uData.name;
                    const targetSocket = io.sockets.sockets.get(sId);
                    if (targetSocket && sId !== socket.id) {
                        targetSocket.emit('private_message', {
                            username: userObj.name,
                            text: data.text,
                            time: getISTTime(),
                            isPrivate: true,
                            senderId: userObj.id,
                            messageId: data.messageId,
                                                    });
                    }
                }
            }
        }

        // Always send back to sender so their local UI displays the message instantly
        socket.emit('private_message', {
            username: `To: ${targetName}`,
            text: data.text,
            time: getISTTime(),
            isPrivate: true,
            isSelfToTarget: true,
            senderId: userObj.id,
            messageId: data.messageId,
                    });
    });

    socket.on('set_pinned_notice', (data) => {
        const userObj = users.get(socket.id) || { name: 'Anonymous', id: 'unknown' };

        const newNotice = {
            id: 'notice_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            text: data.text,
            author: userObj.name,
            time: getISTTime(),
            timestamp: Date.now()
        };

        pinnedNotices.unshift(newNotice);

        io.emit('pinned_notices', pinnedNotices);
        io.emit('system_message', `${userObj.name} pinned a new global notice.`);
    });

    socket.on('delete_pinned_notice', (data) => {
        const userObj = users.get(socket.id) || { name: 'Anonymous', id: 'unknown' };

        if (data && data.id) {
            pinnedNotices = pinnedNotices.filter(n => n.id !== data.id);
        } else {
            pinnedNotices = [];
        }

        io.emit('pinned_notices', pinnedNotices);
        io.emit('system_message', `${userObj.name} deleted a global notice.`);
    });

    socket.on('file_message', (data) => {
        const userObj = users.get(socket.id) || { name: 'Anonymous', id: 'unknown' };

        if (data.targetId) {
            let targetSocketId = null;
            let targetName = 'Unknown';
            for (const [sId, uData] of users.entries()) {
                if (uData.id === data.targetId) {
                    targetSocketId = sId;
                    targetName = uData.name;
                    break;
                }
            }

            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit('file_message', {
                        username: userObj.name,
                        url: data.url,
                        name: data.name,
                        type: data.type,
                        time: getISTTime(),
                        isPrivate: true,
                        senderId: userObj.id,
                        messageId: data.messageId
                    });
                }
                socket.emit('file_message', {
                    username: `To: ${targetName}`,
                    url: data.url,
                    name: data.name,
                    type: data.type,
                    time: getISTTime(),
                    isPrivate: true,
                    isSelfToTarget: true,
                    messageId: data.messageId
                });
            }
        }
    });

    socket.on('message_status_update', (data) => {
        if (data.targetId) {
            let targetSocketId = null;
            for (const [sId, uData] of users.entries()) {
                if (uData.id === data.targetId) {
                    targetSocketId = sId;
                    break;
                }
            }
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit('message_status_update', {
                        messageId: data.messageId,
                        status: data.status,
                        senderId: users.get(socket.id)?.id
                    });
                }
            }
        }
    });

    socket.on('typing_start', (data) => {
        if (data && data.targetId) {
            const senderId = users.get(socket.id)?.id;
            if (!senderId) return;
            for (const [sId, uData] of users.entries()) {
                if (uData.id === data.targetId) {
                    const targetSocket = io.sockets.sockets.get(sId);
                    if (targetSocket) {
                        targetSocket.emit('user_typing_start', { senderId });
                    }
                }
            }
        }
    });

    socket.on('typing_stop', (data) => {
        if (data && data.targetId) {
            const senderId = users.get(socket.id)?.id;
            if (!senderId) return;
            for (const [sId, uData] of users.entries()) {
                if (uData.id === data.targetId) {
                    const targetSocket = io.sockets.sockets.get(sId);
                    if (targetSocket) {
                        targetSocket.emit('user_typing_stop', { senderId });
                    }
                }
            }
        }
    });

    socket.on('mute_status_update', (data) => {
        if (data.targetId) {
            let targetSocketId = null;
            for (const [sId, uData] of users.entries()) {
                if (uData.id === data.targetId) {
                    targetSocketId = sId;
                    break;
                }
            }
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit('mute_status_update', {
                        isMuted: data.isMuted,
                        senderId: users.get(socket.id)?.id
                    });
                }
            }
        }
    });

    // WebRTC Signaling Target Resolution
    const getTargetSocketId = (targetId) => {
        if (!targetId) return null;
        // Direct socket ID check
        if (io.sockets.sockets.has(targetId)) {
            const s = io.sockets.sockets.get(targetId);
            if (s && s.connected) return targetId;
        }
        // Match by persistentId: return latest connected socket
        let targetSocketId = null;
        for (const [sId, uData] of users.entries()) {
            if (uData.id === targetId) {
                const s = io.sockets.sockets.get(sId);
                if (s && s.connected) {
                    targetSocketId = sId;
                }
            }
        }
        return targetSocketId;
    };

    socket.on('webrtc_offer', (data) => {
        const userObj = users.get(socket.id) || { name: 'Anonymous', id: 'unknown' };
        if (data && data.targetId) {
            const targetSocketId = getTargetSocketId(data.targetId);
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    console.log(`[Call] Offer relayed from ${userObj.name} (${userObj.id}) -> target socket ${targetSocketId}`);
                    targetSocket.emit('webrtc_offer', {
                        sdp: data.sdp,
                        video: data.video,
                        senderId: userObj.id,
                        username: userObj.name
                    });
                    return;
                }
            }
            console.warn(`[Call] Offer target offline or unreachable: ${data.targetId}`);
            socket.emit('call_error', { message: 'The user is currently unreachable or offline.' });
        }
    });

    socket.on('webrtc_answer', (data) => {
        const userObj = users.get(socket.id) || { name: 'Anonymous', id: 'unknown' };
        if (data && data.targetId) {
            const targetSocketId = getTargetSocketId(data.targetId);
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    console.log(`[Call] Answer relayed from ${userObj.name} (${userObj.id}) -> target socket ${targetSocketId}`);
                    targetSocket.emit('webrtc_answer', {
                        sdp: data.sdp,
                        senderId: userObj.id
                    });
                    return;
                }
            }
            console.warn(`[Call] Answer target offline: ${data.targetId}`);
        }
    });

    socket.on('webrtc_ice_candidate', (data) => {
        if (data && data.targetId) {
            const targetSocketId = getTargetSocketId(data.targetId);
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit('webrtc_ice_candidate', {
                        candidate: data.candidate,
                        senderId: users.get(socket.id)?.id
                    });
                }
            }
        }
    });

    socket.on('end_call', (data) => {
        if (data && data.targetId) {
            const targetSocketId = getTargetSocketId(data.targetId);
            if (targetSocketId) {
                const targetSocket = io.sockets.sockets.get(targetSocketId);
                if (targetSocket) {
                    targetSocket.emit('end_call', {
                        senderId: users.get(socket.id)?.id
                    });
                }
            }
        }
    });

    socket.on('disconnect', () => {
        const userObj = users.get(socket.id);
        if (userObj) {
            users.delete(socket.id);
            let isCompletelyGone = true;
            for (const [, uData] of users.entries()) {
                if (uData.id === userObj.id) {
                    isCompletelyGone = false;
                    break;
                }
            }

            if (isCompletelyGone) {
                io.emit('system_message', `${userObj.name} left the chat`);
            }

            const uniqueUsersMap = new Map();
            for (const u of users.values()) {
                uniqueUsersMap.set(u.id, u);
            }
            io.emit('update_users', Array.from(uniqueUsersMap.values()));
        }
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
