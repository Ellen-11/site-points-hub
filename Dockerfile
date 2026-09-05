FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends chromium xvfb x11vnc novnc websockify openbox fonts-noto-cjk ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
COPY start-container.sh ./start-container.sh
RUN chmod +x ./start-container.sh
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data BROWSER_CDP_URL=http://127.0.0.1:9222 BROWSER_WEB_ROOT=/usr/share/novnc
EXPOSE 8080
VOLUME ["/data"]
CMD ["./start-container.sh"]
