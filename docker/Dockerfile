FROM --platform=linux/amd64 node:18-buster as builder
## install pnpm
RUN npm install -g pnpm

WORKDIR /greptimedb-dashboard

ARG command=docker

COPY . .
RUN pnpm install
RUN pnpm build:$command

FROM --platform=linux/amd64 nginx:1.23 as base

ENV GREPTIMEDB_HTTP_HOST=127.0.0.1
ENV GREPTIMEDB_HTTP_PORT=4000
ENV NGINX_PORT=8080

RUN mkdir -p /usr/share/nginx/html/dashboard
COPY --from=builder /greptimedb-dashboard/dist/ /usr/share/nginx/html/dashboard
ADD docker/greptimedb.conf /etc/nginx/templates/default.conf.template
