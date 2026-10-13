FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# Environment configuration
ENV NODE_ENV=production
ENV PORT=3000

# Expose default port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
