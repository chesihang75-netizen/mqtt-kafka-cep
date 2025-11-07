FROM node:18-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production --prefer-offline --no-audit --progress=false

COPY src ./src

EXPOSE 8090

CMD ["npm", "start"]
