FROM node:20-alpine

RUN apk add --no-cache ca-certificates curl

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY index.js .
RUN chmod +x index.js

EXPOSE 3000
CMD ["npm", "start"]
