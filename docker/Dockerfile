FROM node:18-buster as builder

WORKDIR /greptimedb-dashboard

COPY . .
RUN npm install
RUN npm run build

FROM nginx:1.23 as base

COPY --from=builder /greptimedb-dashboard/dist/ /usr/share/nginx/html/
ADD docker/greptimedb.conf /etc/nginx/templates/default.conf.template
