FROM node:12
WORKDIR /usr/src/app
COPY package*.json ./

ARG KEY_PASSPHRASE

RUN npm ci --only=production
RUN ssh-keygen -t rsa -b 4096 -f id_rsa -N "${KEY_PASSPHRASE}"

# Bundle app source
COPY . .
EXPOSE 8080
CMD [ "node", "bin/server.js"]
