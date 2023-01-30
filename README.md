# GreptimeDB Dashboard

Dashboard is a data-visualization platform for [GreptimeDB](https://github.com/greptimeteam/greptimedb) developed with Vue3, Vite, TypeScript and Arco Design.

## Quick Start

- [Install GreptimeDB](https://docs.greptime.com/installation/overview)
- Run `./greptime standalone start`
- Clone this project `git clone https://github.com/GreptimeTeam/dashboard.git`
- Run `npm install` for dependencies
- Run `npm run dev` and visit the URL in output
- Also: Run `npm run dev:cloud` to see the cloud version

## How to Use

- Make sure GreptimeDB is up and running
- Follow [getting started](https://docs.greptime.com/getting-started/overview) to create your table and insert some data
- Run a `SELECT` query and check the result as table or chart

### Docker

Pre-built docker images are available on docker hub, you can pull latest image
and run via:

```
docker pull greptime/greptimedb-dashboard
docker run --rm --name greptimedb-dashboard \
  -e GREPTIMEDB_HTTP_HOST=127.0.0.1 \
  -e GREPTIMEDB_HTTP_PORT=4000 \
  -e NGINX_PORT=8080 \
  -p 8080:8080 \
  greptime/greptimedb-dashboard:latest

## open your browser at http://localhost:8080/dashboard
```

To build image by yourself, or use `docker-compose` to setup both greptimedb and
dashboard, see [instructions here](docker/README.md).

## Screenshot

<p align="center">
  <picture>
    <img alt="Dashboard Screenshot" src="src/assets/images/screenshot.png" width="400px">
  </picture>
</p>

## Contributing

- Please refer to [contribution guidelines](https://github.com/GreptimeTeam/greptimedb/blob/75dcf2467b022d4378f904efe5aae5027298986e/CONTRIBUTING.md) for more information.
- This is the very first edition of our Dashboard. In the future we hope to add more and more features for users, and we welcome everyone to make contributions in any way you see fit.

## License

This project is open source under [Apache 2.0 license][1]

[1]: LICENSE
