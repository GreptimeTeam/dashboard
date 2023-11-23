---
title: 使用 PromQL 监控主机指标
---

# 使用 PromQL 监控主机指标

GreptimeDB 实现了一组 [兼容 Prometheus 的 API](https://docs.greptime.cn/user-guide/query-data/promql#prometheus-http-api)，这些 API 使用与原始 Prometheus HTTP API 相同的输入和输出格式。此外，GreptimeDB 还公开了 [自定义的 HTTP API](https://docs.greptime.cn/user-guide/query-data/promql#greptimedb-%E7%9A%84-http-api) 用于使用 PromQL 查询并返回 GreptimeDB 的数据输出。

在本文档中，我们将使用 Prometheus [node_exporter](https://github.com/prometheus/node_exporter) 导出机器指标到 GreptimeCloud，并使用 PromQL 查询这些指标。

## 样本数据

Node_exporter 是一个 Prometheus 导出器，用于导出 \*NIX 内核公开的硬件和操作系统指标。
请参考 [node_exporter Github 仓库](https://github.com/prometheus/node_exporter) 获取它收集的指标。

## 导出数据到 GreptimeCloud

复制以下命令并在本地终端中运行，将示例数据写入到你的数据库中：

```shell
docker run --rm -e GREPTIME_URL='<host>/v1/prometheus/write?db=<database>' \
    -e GREPTIME_USERNAME='<username>' \
    -e GREPTIME_PASSWORD='<password>' \
    --name greptime-node-exporter greptime/node-exporter
```

当容器成功运行后，主机指标将会定期写入到 GreptimeCloud。

## 简单地列出指标

我们可以使用下面的命令列出所有指标，并验证数据已经成功写入到 GreptimeCloud。

有关兼容的 PromQL HTTP API 接口的更多信息，请参考 [Prometheus 的 HTTP API](https://docs.greptime.com/user-guide/query-data/promql#prometheus-http-api)。

```curl
curl -H 'Authorization: Basic <authorization>' <host>/v1/prometheus/api/v1/label/__name__/values
```

## 使用 PromQL 查询数据

使用 PromQL 查询数据并创建监控面板。
你可以通过点击代码左上角的时间范围选择器来调整时间范围。
此外，你还可以在 “Step” 字段中输入新值来更改查询的步长。

### 返回特定指标的所有时间序列数据

我们可以查询上述指标列表中的任一指标。例如，查询 `node_cpu_seconds_total`。

```promql
node_cpu_seconds_total
```

### 通过标签过滤时间序列值

我们可以通过标签过滤时间序列。
例如，返回所有 `node_cpu_seconds_total` 指标的 `mode` 标签等于 `system` 的时间序列。

```promql
node_cpu_seconds_total{mode="system"}
```

### 使用函数

我们可以使用函数来聚合时间序列。
例如，返回 `node_cpu_seconds_total` 的 1 分钟平均值。

```promql
avg_over_time(node_cpu_seconds_total[1m])
```

`node_cpu_seconds_total` 指标有 `cpu` 和 `mode` 标签。
如果我们想要对所有 `cpu` 的平均值进行求和，并保留 `mode` 维度，我们可以使用 `sum by` 子句。

```promql
sum by (mode) (
  avg_over_time(node_cpu_seconds_total[5s])
)
```

## 尝试一下

你已经成功初步体验了 GreptimeDB 的 PromQL API 的强大功能。
使用这个工具，你可以探索大量的指标，并获得有价值的洞察结果。
还有许多其他的指标等待你去探索。
在下面的文本框中编写你自己的 PromQL 查询来尝试一下吧！

```promql

```
