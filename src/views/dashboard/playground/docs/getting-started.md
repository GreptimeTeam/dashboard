---
title: Quick Start
---

# Getting Started

## Preface

Greetings from Greptime Play! Apart from just following a word-document guide, this interactive playground will quickly familiarize you with GreptimeDB and help you to get the most out of it.

::: tip Cool feature alert:
All code blocks in this guide are editable and executable!
:::

By hitting the `Run` button, the code will be executed and run in a temporary, private instance generated
from [GreptimeCloud](https://greptime.com/product/cloud). **You can also explore and experiment with different ideas by editing the codes.**
:::danger Note that:
The instance is valid within **1 hour** once initiated, and you will need to create a new one when the time is up. So please never store important data in Greptime Play sessions.
:::

## Sample data

We will focus on an example of CPU usage in this document. The example is based on a table named `cpu_metrics`, which contains the following columns:

- `hostname`: the host name of the machine
- `environment`: the environment of the service, e.g. production, staging, etc.
- `usage_user`: the percentage of CPU utilization that occurred while executing at the user level (application)
- `usage_system`: the percentage of CPU utilization that occurred while executing at the system level (kernel)
- `usage_idle`: the percentage of time that the CPU or CPUs were idle and the system did not have an outstanding disk I/O request
- `ts`: the timestamp of the record

We will create a table named `cpu_metrics` and insert some data into it. Then we will use SQL to query the data. The query language used in this example is SQL. Let's get started!

## Create a Time-Series Table

Let's start the journey by creating a simple `cpu_metrics` table. Note that we pre-defined
`hostname` and `environment` as the primary keys; `ts` as time index, both are important to know
in GreptimeDB. Click `Run` on the upper left in the panel below to create the table:

```sql
CREATE TABLE IF NOT EXISTS cpu_metrics (
    hostname STRING,
    environment STRING,
    usage_user DOUBLE,
    usage_system DOUBLE,
    usage_idle DOUBLE,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TIME INDEX(ts),
    PRIMARY KEY(hostname, environment)
);
```

Once the green marker appears, run `DESC TABLE` to view the details of the table.

In GreptimeDB, there are three types of columns:

- `Tag` columns store metadata that is commonly queried.
- `Field` columns store data indicators that are collected. The data indicators are generally numerical values.
- `Timestamp` represents the date and time when the data was generated.

For more information please refer to [Data Model](https://docs.greptime.com/user-guide/concepts/data-model).

```sql
DESC TABLE cpu_metrics;
```

GreptimeDB offers a schemaless approach to writing data that eliminates the need to manually create tables using additional protocols. See [Automatic Schema Generation](https://docs.greptime.com/user-guide/write-data#automatic-schema-generation).

## Add Some Data

Using the `INSERT` statement to easily add data to the table. Below example inserts three rows into the `cpu_metrics` table.

```sql
INSERT INTO cpu_metrics
VALUES
    ('host_0','test',32,58,36,1680307200050),
    ('host_1','test',29,65,20,1680307200050),
    ('host_1','staging',12,32,50,1680307200050),
    ('host_2','staging',67,15,42,1680307200050),
    ('host_2','test',98,5,40,1680307200050),
    ('host_3','test',98,95,7,1680307200050),
    ('host_4','test',32,44,11,1680307200050),
    ('host_0','test',31,57,37,1680307260450),
    ('host_1','staging',11,31,52,1680307260450),
    ('host_1','test',26,68,18,1680307260450),
    ('host_2','staging',66,13,41,1680307260450),
    ('host_2','test',99,6,39,1680307260450),
    ('host_3','test',99,95,7,1680307260450),
    ('host_4','test',31,44,11,1680307260450),
    ('host_0','test',29,58,36,1680307320150),
    ('host_1','staging',10,32,50,1680307320150),
    ('host_1','test',32,63,22,1680307320150),
    ('host_2','staging',65,15,40,1680307320150),
    ('host_2','test',100,5,36,1680307320150);
```

Ingest more entries by modifying the values and timestamps.

```sql
INSERT INTO cpu_metrics
VALUES
    ('host_3','test',93,97,8,1680307320150),
    ('host_4','test',31,43,11,1680307320150),
    ('host_0','test',31,58,34,1680307380550),
    ('host_1','test',34,58,20,1680307380550),
    ('host_1','staging',10,31,49,1680307380550),
    ('host_2','staging',72,16,36,1680307380550),
    ('host_2','test',100,3,36,1680307380550),
    ('host_3','test',98,94,5,1680307380550),
    ('host_4','test',31,43,11,1680307380550),
    ('host_0','test',34,57,37,1680307440850),
    ('host_1','test',27,67,19,1680307440850),
    ('host_1','staging',13,36,49,1680307440850),
    ('host_2','test',98,3,38,1680307440850),
    ('host_2','staging',70,13,38,1680307440850),
    ('host_3','test',96,96,4,1680307440850),
    ('host_4','test',36,44,12,1680307440850);
```

See more about [`INSERT` clause](https://docs.greptime.com/reference/sql/insert).

Run the following SQL statement to query all rows in the table. After getting the results, click the `Chart` tab to see the visualized data. You can choose `Group By` options to make the visualized data group by `hostname` and `environment`.

```sql (line|usage_user|ts|hostname,environment)
SELECT * FROM cpu_metrics ORDER BY ts DESC;
```

## Query Data with SQL

In the following examples, we will limit the query result to 100 rows to avoid returning too much data.

### List metrics

Run the following SQL statement to list metrics in the table.

```sql (line|usage_user|ts|hostname,environment)
SELECT * FROM cpu_metrics ORDER BY ts DESC LIMIT 100;
```

You can also use `count()` function to get the number of rows in the table.

```sql
SELECT count(*) FROM cpu_metrics;
```

### Select a specific column and perform basic arithmetic

Basic arithmetic can be performed on the selected column. For example, the following SQL statement selects the `usage_user` column and mutiply each value by 2.

```sql
SELECT usage_user, usage_user * 2 as twice_usage_user FROM cpu_metrics LIMIT 100;
```

See more about [`SELECT` clause](https://docs.greptime.com/reference/sql/select).

### Filter data by `WHERE` clause

The `WHERE` clause can be used to filter data. It supports comparisons against string, boolean, and numeric values. The following SQL statement selects the rows where the `usage_user` is greater than 50.

```sql (line|usage_user|ts|hostname,environment)
SELECT * FROM cpu_metrics WHERE usage_user > 50;
```

See more about [`WHERE` clause](https://docs.greptime.com/reference/sql/where).

<!-- TODO time and data functions in SQL reference -->

### Group by tags

Developers always want to see the general CPU usage to check if there are any problems with the resources. For example, the following SQL statement returns the average CPU usage group by hosts.

```sql
SELECT hostname,
    avg(usage_user) as usage_user_avg
    FROM cpu_metrics
    GROUP BY hostname
    LIMIT 100;
```

Multiple fields can be grouped together. The following SQL statement returns the average CPU usage group by `hostname` and `environment`. The `mean` function alias of `avg` function also can be used to calculate the average value of each field.

```sql
SELECT hostname, environment,
    mean(usage_user) as usage_user_avg
    FROM cpu_metrics
    GROUP BY hostname, environment
    LIMIT 100;
```

<!-- TODO 95 percent example for response time -->

See more about [`GROUP BY` clause](https://docs.greptime.com/reference/sql/group_by).

### Aggregate data within a range of time

One important scenario for time series data is to aggregate data within a specific time range to monitor its trend.

#### Aggregate data in 5-minute intervals

The `RANGE` keyword and `ALIGN` keyword can be combined to aggregate data within a specific time range.
The following SQL statement calculates the average CPU usage of all hosts at a 5-minute interval,
with data calculated every 1 minute.

```sql (line|usage_user_5m_avg,usage_system_5m_avg|ts)
SELECT
    ts,
    avg(usage_user) RANGE '5m' as usage_user_5m_avg,
    avg(usage_system) RANGE '5m' as usage_system_5m_avg
FROM cpu_metrics
ALIGN '1m' LIMIT 100;
```

See more about [RANGE QUERY](https://docs.greptime.com/reference/sql/range).

#### Aggregate data in 5-minute intervals and by a tag key

To aggregate data by a tag key, add the tag key to the `BY` keyword after the `ALIGN` keyword.
The following SQL statement calculates the average CPU usage of each host at a 5-minute interval,
with data calculated every 1 minute.

```sql (line|avg_user,avg_system,avg_idle|dt|dt)
select date_trunc('second', ts) as dt,
    avg(usage_user) as avg_user,
    avg(usage_system) as avg_system,
    avg(usage_idle) as avg_idle
    FROM cpu_metrics
    GROUP BY dt
```

#### Aggregate data in intervals and fill in missing values

Sometimes data may be missing in certain intervals.
In such cases, the `FILL` keyword can be used to fill in the missing values.

For example, the following SQL statement calculates the average CPU usage of each host at a 5-minute interval,
with data calculated every 1 minute.
The missing values are filled using the average value of the two previous points,
as specified by the `LINEAR` fill option.

```sql (line|usage_user_5m_avg|ts|hostname)
SELECT
    ts,
    hostname,
    avg(usage_user) RANGE '5m' FILL LINEAR as usage_user_5m_avg
FROM cpu_metrics
ALIGN '1m' BY (hostname) ORDER BY ts DESC LIMIT 100;
```

There are other fill options available, please refer to [FILL OPTIONS](https://docs.greptime.com/reference/sql/range#fill-option) documentation.

### Write query results to a new table

After obtaining the query results, you can store them in a new table using the `INSERT INTO` statement.
Before storing the query results in a new table, you need to create the table first.

:::tip NOTE
GreptimeDB supports other protocols that offer a schemaless approach to writing data that eliminates the need to manually create tables. See [Automatic Schema Generation](https://docs.greptime.com/user-guide/write-data/overview#automatic-schema-generation).
:::

The following SQL statement creates a new table called `cpu_metrics_avg_user` to store the 5-minute average CPU usage of each host.

```sql
CREATE TABLE IF NOT EXISTS cpu_metrics_avg_user (
    hostname STRING,
    usage_user_5m_avg DOUBLE,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TIME INDEX(ts),
    PRIMARY KEY(hostname)
);
```

Then, you can write the query results to the new table by using the `INSERT INTO` statement.

```sql
INSERT INTO cpu_metrics_avg_user(ts, hostname, usage_user_5m_avg)
    SELECT
        ts,
        hostname,
        avg(usage_user) RANGE '5m' FILL LINEAR as usage_user_5m_avg
    FROM cpu_metrics
    ALIGN '1m' BY (hostname);
```

Check the data in the new table by running the following SQL statement.

```sql
SELECT * FROM cpu_metrics_avg_user LIMIT 100;
```

Please refer to [INSERT INTO SELECT](https://docs.greptime.com/reference/sql/insert#insert-into-select-statement) documentation for more information.

## Try it Out

Write your own queries and experience the power of GreptimeDB!

```sql

```

## Empower Your Business With Self-Hosted GreptimeDB or GreptimeCloud Now

Congratulations! You have completed the quick start guide.
Now you can try using GreptimeCloud or self-hosted GreptimeDB to explore more advanced features and empower your business.

- [Sign up for GreptimeCloud](https://greptime.com/product/cloud)
- [Download and start self-hosted GreptimeDB](https://greptime.com/product/db)
