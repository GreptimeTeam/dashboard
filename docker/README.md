# GreptimeDB Dashboard Docker Image

## Build

This image uses official node image as build image and offical nginx as base
image. To build your own docker image, run `docker build` from root of the repo:

```
docker build -f docker/Dockerfile -t greptimedb-dashboard .
```

## Run

Envinronment variables are required for running this image:

- `GREPTIMEDB_HTTP_HOST` specify greptimedb host
- `GREPTIMEDB_HTTP_PORT` specify greptimedb http service port
- `NGINX_PORT` specify which port the dashboard nginx listen to

This is an example using host network, when your greptimedb is running locally.

```
docker run \
  -e GREPTIMEDB_HTTP_HOST=127.0.0.1 \
  -e GREPTIMEDB_HTTP_PORT=4000 \
  -e NGINX_PORT=8080 \
  --network host
  greptimedb-dashboard:latest
```
