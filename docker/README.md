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
  --network host \
  greptimedb-dashboard:latest
```

Open you browser and visit `http://localhost:8080/dashboard`

# Using `docker-compose`

[docker-compose](https://docs.docker.com/compose/) is a light-weighted container
orchestration solution. We provide a sample compose file to build and run
dashboard with greptimedb ready.

## Build

Run `docker compose build` from root of the repo:

```
docker compose -f docker/docker-compose.yml build
```

## Run

Run `docker compose up` from root of the repo:

```
docker compose -f docker/docker-compose.yml up
```

Open you browser and visit `http://localhost:8080/dashboard`
