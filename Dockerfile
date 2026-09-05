FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
COPY public ./public
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
EXPOSE 8080
VOLUME ["/data"]
CMD ["npm", "start"]
