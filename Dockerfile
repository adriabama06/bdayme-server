FROM node:22.11.0-alpine3.20

RUN apk add --no-cache curl

WORKDIR /app

COPY . /app

RUN npm i

EXPOSE 6570

CMD [ "npm", "start" ]
