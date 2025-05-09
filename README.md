# GreptimeDB Dashboard

Dashboard is a data-visualization platform for [GreptimeDB](https://github.com/greptimeteam/greptimedb) developed with Vue3, Vite, TypeScript and Arco Design.

## Quick Start

You are welcome to try out our dashboard directly with GreptimeDB's binary or with Docker.

### With GreptimeDB's binary

- Download GreptimeDB's pre-built binary [here](https://greptime.com/download).
- Start GreptimeDB normally.
- Visit `http://localhost:4000/dashboard`

### With Docker
⭐We recommend using docker-compose to setup both greptimedb and dashboard.
1. Use the `curl` command to get the `docker-compose` configuration file
```
curl -O https://raw.githubusercontent.com/greptimeteam/dashboard/main/docker/docker-compose.yml
```
> Tips: If you encounter network-related problems, you can download the `docker-compose.yml` file manually or simply copy and paste the [contents](https://github.com/GreptimeTeam/dashboard/blob/main/docker/docker-compose.yml) into an empty `yml` file on your machine or server, based on what you need.
2. Launching the application
```
docker compose up
```
3. Open you browser and visit `http://localhost:8080/dashboard/`
- Follow [getting started](https://docs.greptime.com/getting-started/quick-start#create-tables) to create your table and insert some data
- Run a `SELECT` query and check the result as table or chart

<!-- ### With Docker

We recommend using `docker-compose` to setup both greptimedb and
dashboard.

```
curl -O https://raw.githubusercontent.com/greptimeteam/dashboard/main/docker/docker-compose.yml
docker compose up
```

Open you browser and visit `http://localhost:8080/dashboard/`

- Follow [getting started](https://docs.greptime.com/getting-started/quick-start/mysql#try-out-basic-sql-operations) to create your table and insert some data
- Run a `SELECT` query and check the result as table or chart -->

### Dashboard Desktop App
With the desktop version of the Dashboard app, you can run it independently, connecting to a local or remote `GreptimeDB` instance.
- Download the Dashboard App from [release page](https://github.com/GreptimeTeam/dashboard/releases)

## Development Setup

- [Install GreptimeDB](https://docs.greptime.com/getting-started/installation/overview)
- Run `./greptime standalone start`
- Clone this project `git clone https://github.com/GreptimeTeam/dashboard.git`
- Run `pnpm install` for dependencies
- Run `pnpm run dev` and visit the URL in output

## Screenshot

![Dashboard Screenshot](screenshot1.png 'Dashboard Screenshot')
![Dashboard Screenshot](screenshot2.png 'Dashboard Screenshot')
## Contributing

- Please refer to [contribution guidelines](https://github.com/GreptimeTeam/greptimedb/blob/75dcf2467b022d4378f904efe5aae5027298986e/CONTRIBUTING.md) for more information.
- This is the very first edition of our Dashboard. In the future we hope to add more and more features for users, and we welcome everyone to make contributions in any way you see fit.

## License

This project is open source under [Apache 2.0 license][1]

[1]: LICENSE
