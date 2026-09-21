# Small official Node image (Mongoose 9 needs a recent Node)
FROM node:22-alpine

WORKDIR /app

# Copy only the dependency files first so Docker can cache the install step
COPY package*.json ./
RUN npm ci --omit=dev

# Now copy the rest of the code
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

# Don't run as root inside the container
USER node

CMD ["node", "server.js"]