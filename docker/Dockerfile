FROM node:18-buster as builder
## install pnpm
RUN npm install -g pnpm

WORKDIR /greptimedb-dashboard

COPY . .
RUN pnpm install
RUN pnpm build

FROM nginx:1.23 as base

COPY --from=builder /greptimedb-dashboard/dist/ /usr/share/nginx/html/
ADD docker/greptimedb.conf /etc/nginx/templates/default.conf.template
