FROM node:18-buster as builder
## install pnpm
RUN curl -fsSL https://get.pnpm.io/install.sh | sh -

WORKDIR /greptimedb-dashboard

COPY . .
RUN pnpm install
RUN pnpm build

FROM nginx:1.23 as base

COPY --from=builder /greptimedb-dashboard/dist/ /usr/share/nginx/html/
ADD docker/greptimedb.conf /etc/nginx/templates/default.conf.template
