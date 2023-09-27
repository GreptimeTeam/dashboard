---
title: Monitor Host Metrics with PromQL
---

# Monitor Host Metrics with PromQL

GreptimeDB has implemented a set of [Prometheus-compatible APIs](https://docs.greptime.com/user-guide/query-data/promql#prometheus-http-api) that use the same input and output format as the original Prometheus HTTP API. In addition, GreptimeDB also exposes [a custom HTTP API](https://docs.greptime.com/user-guide/query-data/promql#greptimedb-s-http-api) for querying with PromQL and returning GreptimeDB's data frame output.

In this documentation, we will use Prometheus [node_exporter](https://github.com/prometheus/node_exporter) to export machine metrics to GreptimeCloud and query the metrics using PromQL.

## Sample Data

Node_exporter is a Prometheus exporter for hardware and OS metrics exposed by \*NIX kernels.
It is written in Go and has pluggable metric collectors.
For the metrics it collects, please refer to the [node_exporter Github repository](https://github.com/prometheus/node_exporter).

## Export Data to GreptimeCloud

Spin up a Docker container to write sample data to your database:

```shell
docker run --rm -e GREPTIME_URL='<host>/v1/prometheus/write?db=<database>' \
    -e GREPTIME_USERNAME='<username>' \
    -e GREPTIME_PASSWORD='<password>' \
    --name greptime-node-exporter greptime/node-exporter
```

Once the container has run successfully, host metrics will be written to GreptimeCloud periodically.

## List Metrics

We can use the following command to list all the metrics and verify that the data has been successfully written to GreptimeCloud.

For more information about the compatible PromQL HTTP API, please refer to [Prometheus' HTTP API](https://docs.greptime.com/user-guide/query-data/promql#prometheus-http-api).

```curl
curl -H 'Authorization: Basic <authorization>' <host>/v1/prometheus/api/v1/label/__name__/values
```

## Query Data with PromQL

Now use PromQL to query data and make monitor panels.

You can adjust the time range by clicking on the time range selector located in the upper left corner of the code.
Additionally, you can change the query resolution step by inputing a new value in the `Step` field.

### Return All Time Series with a Specific Metric Name

Any metrics in the metric list above can be queried. For example, we can query the `node_cpu_seconds_total` metric.

```promql
node_cpu_seconds_total
```

### Filter the Time Series by Label

We can filter the time series by label.
For example, return all time series with the metric name `node_cpu_seconds_total` and the label `mode` equals `system`.

```promql
node_cpu_seconds_total{mode="system"}
```

### Using Functions

We can use functions to aggregate the time series.
For example, return the 1-minute average value of `node_cpu_seconds_total`.

```promql
avg_over_time(node_cpu_seconds_total[1m])
```

The `node_cpu_seconds_total` metric has labels `cpu` and `mode`.
If we want to sum the average value of all `cpu`s and preserve the `mode` dimension, we can use the `sum by` clause.

```promql
sum by (mode) (
  avg_over_time(node_cpu_seconds_total[5s])
)
```

## Try Yourself

Congratulations! You have successfully experienced the power of GreptimeDB's PromQL API.
With this tool, you can explore a vast array of metrics and gain valuable insights into your time series data.
There are many other metrics waiting for you to explore.
Write your own PromQL query below and have fun exploring!

```promql

```
