# GreptimeDB Dashboard Docker Image

## Using `docker-compose` (Recommended)

[Docker-compose](https://docs.docker.com/compose/) is a light-weighted container
orchestration solution. We provide a sample compose file to pull images from docker hub, and run both dashboard and greptimedb within one docker container.

### 1. Run

Run `docker compose up` from root of the repo:

```
docker compose -f docker/docker-compose.yml up
```

Open you browser and visit `http://localhost:8080/dashboard/`

### 2. Clean

Run `docker compose down` from root of the repo to remove the stopped container:

```
docker compose -f docker/docker-compose.yml down
```

## Build and Run (locally)

We do not recommend this at the moment because you might encounter network problems. The image uses official node image as build image and official nginx as base
image.

To build your own local docker image, run `docker build` from root of the repo:

```
docker build -f docker/Dockerfile -t greptime/greptimedb-dashboard .
```

Environment variables are required for running this image:

- `GREPTIMEDB_HTTP_HOST` specifies greptimedb host
- `GREPTIMEDB_HTTP_PORT` specifies greptimedb http service port
- `NGINX_PORT` specifies which port the dashboard nginx listens to

Below is an example using host network (on Linux), so make sure your greptimedb is running on your host machine.

```
docker run --rm --name greptimedb-dashboard \
  -e GREPTIMEDB_HTTP_HOST=127.0.0.1 \
  -e GREPTIMEDB_HTTP_PORT=4000 \
  -e NGINX_PORT=8080 \
  --network=host \
  greptime/greptimedb-dashboard:latest
```

Open you browser and visit `http://localhost:8080/dashboard/`

**Note**: If you are running on M1 chip Mac, you can try the following command to visit dashboard on your browser (but you will not be able to access greptimedb):

```
docker run --rm --name greptimedb-dashboard \
  -e GREPTIMEDB_HTTP_HOST=127.0.0.1 \
  -e GREPTIMEDB_HTTP_PORT=4000 \
  -e NGINX_PORT=8080 \
  -p 8080:8080 \
  greptime/greptimedb-dashboard:latest
```
