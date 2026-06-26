# GreptimeDB Dashboard

Dashboard is a data-visualization platform for [GreptimeDB](https://github.com/greptimeteam/greptimedb) developed with Vue3, Vite, TypeScript and Arco Design.

## Quick Start

You can try out our Dashboard in one of the following ways: (1) using GreptimeDB's binary, (2) using Docker, or (3) using the Desktop App.

### With GreptimeDB's binary

- Download GreptimeDB's pre-built binary [here](https://greptime.com/download).
- Start GreptimeDB normally.
- Visit `http://localhost:4000/dashboard`

### With Docker

We recommend using docker-compose to setup both GreptimeDB and Dashboard.

```
curl -O https://raw.githubusercontent.com/greptimeteam/dashboard/main/docker/docker-compose.yml
docker compose up
```

Open your browser and visit `http://localhost:8080/dashboard/`

### Dashboard Desktop App

With the desktop version of the Dashboard app, you can run it independently, connecting to a local or remote `GreptimeDB` instance.

- Download the Dashboard App from [release page](https://github.com/GreptimeTeam/dashboard/releases)

## Features

- **Table Query** — Query GreptimeDB with table and chart visualization, supports EXPLAIN for query plan analysis
- **Metrics Query** — Query metrics using PromQL with chart visualization
- **Logs Query** — Query and analyze log data with search, filtering, and export
- **Log Pipelines** — Manage log parsing pipelines
- **Traces** — Query and visualize distributed traces with timeline and span details
- **Data Ingestion** — Ingest data via InfluxDB Line Protocol 
- **Flow** — Manage flow tasks
- **Visualization** — Perses-powered dashboards and panels for custom visualization

## Screenshot

### Query - Table Result
![Table Query](tablequery.png 'Table Query')

### Metrics - Chart
![Metrics Chart](metricchart.png 'Metrics Chart')

### Logs - Query
![Logs Query](logsquery.png 'Logs Query')

## Development Setup

- [Install GreptimeDB](https://docs.greptime.com/getting-started/installation/overview)
- Run `./greptime standalone start`
- Clone this project `git clone https://github.com/GreptimeTeam/dashboard.git`
- Run `pnpm install` for dependencies
- Run `pnpm run dev` and visit the URL in output

## Agent Skills

Cursor and other AI agents can use skills from this repo to generate Perses dashboards. See [skills/README.md](skills/README.md) for the `greptimedb-perses-dashboard` skill directory and install instructions.

## Contributing

- Please refer to [contribution guidelines](https://github.com/GreptimeTeam/greptimedb/blob/75dcf2467b022d4378f904efe5aae5027298986e/CONTRIBUTING.md) for more information.
- This is an early-stage version of our Dashboard. We're continuously adding new features, and we warmly welcome contributions of all kinds.

## License

This project is open source under [Apache 2.0 license](LICENSE)