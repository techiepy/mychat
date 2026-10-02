# MyChat - Realtime Chat & WebRTC Communication Platform

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/techiepy/mychat)

MyChat is a modern, ultra-responsive, full-featured realtime communication web application with WebRTC audio & video calling, private messaging, persistent sessions, global notices, and customizable UI themes.

---

## 🚀 One-Click Deploy to Render

Click the button above or visit:
**[https://render.com/deploy?repo=https://github.com/techiepy/mychat](https://render.com/deploy?repo=https://github.com/techiepy/mychat)**

Render will automatically read [`render.yaml`](./render.yaml) to configure the web service with:
- **Service Name**: `mychat`
- **Assigned Domain**: `https://mychat.onrender.com`
- **Environment**: Node.js
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Preconfigured Environment Variables**:
  - `METERED_APP_NAME` (WebRTC TURN relay)
  - `METERED_API_KEY` (WebRTC TURN relay)
  - `EMAIL_USER` (Admin notifications)
  - `EMAIL_PASS` (Gmail App password)

---

## ✨ Key Features

- **Realtime Messaging**: Instant bidirectional communication powered by Socket.io.
- **Crystal Clear Audio & Video Calls**: WebRTC peer-to-peer audio and video calling with Metered.ca TURN server traversal for reliable connectivity across mobile cellular (LTE/5G), Wi-Fi, and corporate firewalls.
- **Private & Direct Chats**: Click any active user in the user sidebar to start a private conversation.
- **Global Pinned Notices**: Pin important alerts and announcements globally for all participants.
- **Theme & Accent Color Customizer**: Switch between Dark/Light modes or customize accent colors with live preview.
- **File & Media Sharing**: Upload and exchange images, documents, and files seamlessly.
- **Mobile Responsive**: Fully optimized PWA-style viewport with touch interactions for iOS and Android.

---

## 🛠️ Local Development

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation
```bash
# Clone the repository
git clone https://github.com/techiepy/mychat.git
cd mychat

# Install dependencies
npm install

# Start development server
npm run dev
# or for standard production mode:
npm start
```

Visit `http://localhost:3000` in your web browser.

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
EMAIL_USER=techguz11@gmail.com
EMAIL_PASS=your_gmail_app_password
METERED_APP_NAME=dream360-chat
METERED_API_KEY=c04ab7188ab5293b168534813388046a8688
```

---

## 🌐 Hosted Live Domain
- Live URL: **https://mychatindia.onrender.com**
