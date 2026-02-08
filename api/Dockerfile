FROM node:20-alpine

WORKDIR /app

# Install dependencies inside the Linux container (never reuse Windows node_modules)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source code (api/.dockerignore prevents node_modules being copied)
COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
