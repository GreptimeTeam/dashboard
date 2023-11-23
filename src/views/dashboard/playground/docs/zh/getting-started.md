---
title: 快速开始
---

# 快速开始

## 前言

欢迎来到 Greptime Play！除了按照文档指南进行操作，这个交互式的 Playground 将快速让你熟悉 GreptimeDB，并帮助你充分利用它。

::: tip 超酷的功能
本指南中的所有代码块都可以编辑和执行！
:::

通过点击 `运行` 按钮，代码将在一个临时的、私有的实例中执行和运行，该实例由 [GreptimeCloud](https://greptime.com/product/cloud) 生成。**你还可以通过编辑代码来探索和尝试不同的想法。**

:::danger 请注意
实例在启动后有效时间为**1小时**，一旦时间到期，你将需要创建一个新的实例。因此请不要在 Greptime Play 会话中存储重要数据。
:::

## 样本数据

在本文档中我们以 CPU 的用量为例，样本数据基于一个名为 `cpu_metrics` 的表，该表包含以下列：

- `hostname`：机器的主机名
- `environment`：服务的环境，例如生产、预发布等
- `usage_user`：在用户级别（应用程序）执行时发生的 CPU 利用率的百分比
- `usage_system`：在系统级别（内核）执行时发生的 CPU 利用率的百分比
- `usage_idle`：CPU 或 CPU 空闲的时间百分比，系统没有未完成的磁盘 I/O 请求
- `ts`：记录的时间戳

点击下面的按钮将样本数据导入到 Playground 中。

`@button:import={"table":"cpu_metrics","from":"tsbs","label":"导入预置数据"}`

导入完成后，我们可以使用 SQL 来探索数据。

## 查看表信息

你可以运行 `DESC TABLE` 来查看表的详细信息。
在 GreptimeDB 中，有三种类型的列：

- `Tag` 列存储常用查询的元数据。
- `Field` 列存储收集的数据指标，数据指标通常是数值。
- `Timestamp` 表示生成数据的日期和时间。

更多信息请参考 [数据模型](https://docs.greptime.cn/user-guide/concepts/data-model)。

```sql
DESC TABLE cpu_metrics;
```

## 使用 SQL 查询数据

在下面的示例中，我们将限制查询结果为 100 行以避免返回过多的数据。

### 简单地列出指标

运行下面的 SQL 语句来列出表中的指标。

```sql (line|usage_user|hostname,environment)
SELECT * FROM cpu_metrics ORDER BY ts DESC LIMIT 100;
```

你可以使用 `count()` 函数来获取表中的总行数。

```sql
SELECT count(*) FROM cpu_metrics;
```

### 选择特定的列并执行基本的算术运算

你可以选择特定的列并对其执行基本的算术运算。例如，下面的 SQL 语句选择 `usage_user` 列并将每个值乘以 2。

```sql
SELECT usage_user, usage_user * 2 as twice_usage_user FROM cpu_metrics LIMIT 100;
```

更多信息请参考 [`SELECT` 语句](https://docs.greptime.cn/reference/sql/select)。

### 使用 `WHERE` 子句过滤数据

`WHERE` 子句可以用来过滤数据。它支持对字符串、布尔值和数值进行比较。下面的 SQL 语句返回 `usage_user` 大于 50 的行。

```sql
SELECT * FROM cpu_metrics WHERE usage_user > 50 LIMIT 100;
```

你也可以在 `WHERE` 子句中执行基本的算术运算。例如，下面的 SQL 语句返回 `usage_user` 和 `usage_system` 字段值之和大于 50 的数据。

```sql
SELECT * FROM cpu_metrics WHERE usage_user + usage_system > 50 LIMIT 100;
```

`WHERE` 子句中还可以使用时间函数。例如，下面的 SQL 语句返回 `ts` 大于时间戳 `1680911820000` 减去 5 分钟的数据。

```sql
SELECT * FROM cpu_metrics WHERE ts > (1680911820000::timestamp_ms - interval '5 minutes') - interval '5 minutes') LIMIT 100;
```

更多信息请参考 [`WHERE` 子句](https://docs.greptime.cn/reference/sql/where)。

<!-- TODO time and data functions in SQL reference -->

### 按标签分组

开发人员总是会通过检查 CPU 的总体使用情况以确认资源是否有问题。例如，下面的 SQL 语句按主机分组返回平均 CPU 使用率。

```sql
SELECT hostname,
    avg(usage_user) as usage_user_avg
    FROM cpu_metrics
    GROUP BY hostname
    LIMIT 100;
```

多个字段可以一起分组。下面的 SQL 语句按 `hostname` 和 `environment` 分组返回平均 CPU 使用率。`avg` 别名函数 `mean` 也可以用来计算每个字段的平均值。

```sql
SELECT hostname, environment,
    mean(usage_user) as usage_user_avg
    FROM cpu_metrics
    GROUP BY hostname, environment
    LIMIT 100;
```

<!-- TODO 95 percent example for response time -->

更多信息请参考 [`GROUP BY` 子句](https://docs.greptime.cn/reference/sql/group_by)。

### 在时间范围内聚合数据

时间序列数据的一个重要场景是在特定的时间范围内聚合数据以监控其趋势。

#### 聚合 5 分钟内的数据

`RANGE` 关键字和 `ALIGN` 关键字可以结合使用以在特定的时间范围内聚合数据。
下面的 SQL 语句按 5 分钟的时间范围计算所有主机的平均 CPU 使用率，每 1 分钟计算一次数据。

```sql (line|usage_user_5m_avg,usage_system_5m_avg|ts)
SELECT
    ts,
    avg(usage_user) RANGE '5m' as usage_user_5m_avg,
    avg(usage_system) RANGE '5m' as usage_system_5m_avg
FROM cpu_metrics
ALIGN '1m' LIMIT 100;
```

更多信息请参考 [RANGE 查询](https://docs.greptime.cn/reference/sql/range)。

#### 按标签聚合 5 分钟内的数据

要通过标签键聚合数据，请在 `ALIGN` 关键字后的 `BY` 关键字中添加标签。
下面的 SQL 语句按主机名聚合 5 分钟范围内的数据，每 1 分钟计算一次数据。

```sql (line|usage_user_5m_avg|ts|hostname)
SELECT
    ts,
    hostname,
    avg(usage_user) RANGE '5m' as usage_user_5m_avg
FROM cpu_metrics
ALIGN '1m' BY (hostname) ORDER BY ts DESC LIMIT 100;
```

#### 聚合数据并填充缺失值

有时候在某些时间间隔内可能会缺少数据。
在这种情况下，可以使用 `FILL` 关键字来填充缺失值。

例如，下面的 SQL 语句按 5 分钟的时间范围计算所有主机的平均 CPU 使用率，每 1 分钟计算一次数据。
缺失的值使用前两个点的平均值填充，这是由 `LINEAR` 填充选项指定的。

```sql (line|usage_user_5m_avg|ts|hostname)
SELECT
    ts,
    hostname,
    avg(usage_user) RANGE '5m' FILL LINEAR as usage_user_5m_avg
FROM cpu_metrics
ALIGN '1m' BY (hostname) ORDER BY ts DESC LIMIT 100;
```

还有其他的填充选项可用，请参考 [填充选项](https://docs.greptime.cn/reference/sql/range#fill-option) 文档。

### 将查询结果写入新表

在获取查询结果后，你可以使用 `INSERT INTO` 语句将其存储在新表中。
在将查询结果存储在新表中之前，你需要先创建表。

:::tip 注意
GreptimeDB 支持其他协议，这些协议提供了一种无 schema 的写入数据的方法，无需手动创建表。请参考 [自动生成表结构](https://docs.greptime.cn/user-guide/write-data/overview#automatic-schema-generation)。
:::

下面的 SQL 语句创建一个名为 `cpu_metrics_avg_user` 的新表，用于存储每个主机的 5 分钟平均 CPU 使用率。

```sql
CREATE TABLE IF NOT EXISTS cpu_metrics_avg_user (
    hostname STRING,
    usage_user_5m_avg DOUBLE,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TIME INDEX(ts),
    PRIMARY KEY(hostname)
);
```

然后你可以使用 `INSERT INTO` 语句将查询结果写入新表。

```sql
INSERT INTO cpu_metrics_avg_user(ts, hostname, usage_user_5m_avg)
    SELECT
        ts,
        hostname,
        avg(usage_user) RANGE '5m' FILL LINEAR as usage_user_5m_avg
    FROM cpu_metrics
    ALIGN '1m' BY (hostname);
```

通过运行下面的 SQL 语句检查新表中的数据。

```sql
SELECT * FROM cpu_metrics_avg_user LIMIT 100;
```

更多信息请参考 [INSERT INTO SELECT](https://docs.greptime.cn/reference/sql/insert#insert-into-select-statement) 文档。

## 尝试一下

自行撰写 SQL 并体验 GreptimeDB 的强大功能！

```sql

```

## 使用自托管的 GreptimeDB 或 GreptimeCloud 为你的业务赋能

恭喜！你已经完成了快速入门指南。
现在你可以尝试使用 GreptimeCloud 或自托管的 GreptimeDB 来探索更多高级功能并为你的业务赋能。

- [注册 GreptimeCloud](https://greptime.com/product/cloud)
- [下载并启动自托管的 GreptimeDB](https://greptime.com/product/db)
