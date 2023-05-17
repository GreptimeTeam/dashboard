---
title: Quick Start
---
# Getting Started

## Preface
Greetings from Greptime Play! Apart from just following a word-document guide, this interactive playground will quickly familiarize you with GreptimeDB and help you to get the most out of it. 

::: tip Cool feature alert:
all code blocks in this guide are editable and executable! 
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

We will create a table named `cpu_metrics` and insert some data into it. Then we will use SQL to query the data. The protocol used in this example is SQL. Let's get started!


## Create a Time-Series Table

GreptimeDB offers a schemaless approach to writing data that eliminates the need to manually create tables using additional protocols. See [Automatic Schema Generation](https://docs.greptime.com/user-guide/write-data#automatic-schema-generation). 

Here we need to create a table manually with SQL protocol. 
Let's start the journey by creating a simple `cpu_metrics` table. Note that we pre-defined 
`hostname` as the primary key; `ts` as time index, both are important to know
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
    PRIMARY KEY(hostname)
);
```

Once the green marker appears, run `DESC TABLE` to view the details of the table.

In GreptimeDB, there are three types of columns:

- `PRIMARY KEY`: key columns that are used for sorting and partitioning
- `FIELD`: columns which store table values
- `TIME INDEX`: columns of data type TIME

```sql
DESC TABLE cpu_metrics;
```

## Add Some Data

Using the `INSERT` statement to easily add data to the table. Below example inserts three rows into the `cpu_metrics` table.

<!-- ts could be timestamp -->

``` sql
INSERT INTO cpu_metrics
VALUES
    ('host_0','test',32,58,36,'2023-04-01T00:00:00+00:00'),
    ('host_1','staging',12,32,50,'2023-04-01T00:00:00+00:00'),
    ('host_2','test',98,5,40,'2023-04-01T00:00:00+00:00'),
    ('host_3','test',98,95,7,'2023-04-01T00:00:00+00:00'),
    ('host_4','test',32,44,11,'2023-04-01T00:00:00+00:00'),
    ('host_0','test',31,57,37,'2023-04-01T00:01:00+00:00'),
    ('host_1','staging',11,31,52,'2023-04-01T00:01:00+00:00'),
    ('host_2','test',99,6,39,'2023-04-01T00:01:00+00:00'),
    ('host_3','test',99,95,7,'2023-04-01T00:01:00+00:00'),
    ('host_4','test',31,44,11,'2023-04-01T00:01:00+00:00'),
    ('host_0','test',29,58,36,'2023-04-01T00:02:00+00:00'),
    ('host_1','staging',10,32,50,'2023-04-01T00:02:00+00:00'),
    ('host_2','test',100,5,36,'2023-04-01T00:02:00+00:00'),
    ('host_3','staging',97,95,6,'2023-04-01T00:02:00+00:00'),
    ('host_0','test',32,60,36,'2023-04-01T00:04:00+00:00');
```


Ingest more entries by modifying the values and timestamps.


``` sql
INSERT INTO cpu_metrics
VALUES
    ('host_4','test',31,43,11,'2023-04-01T00:02:00+00:00'),
    ('host_0','test',31,58,34,'2023-04-01T00:03:00+00:00'),
    ('host_1','staging',10,31,49,'2023-04-01T00:03:00+00:00'),
    ('host_2','test',100,3,36,'2023-04-01T00:03:00+00:00'),
    ('host_3','staging',98,94,5,'2023-04-01T00:03:00+00:00'),
    ('host_4','test',31,43,11,'2023-04-01T00:03:00+00:00'),
    ('host_3','test',97,96,3,'2023-04-01T00:08:00+00:00'),
    ('host_4','test',36,44,12,'2023-04-01T00:08:00+00:00'),
    ('host_0','test',34,57,37,'2023-04-01T00:09:00+00:00'),
    ('host_1','staging',13,36,49,'2023-04-01T00:09:00+00:00'),
    ('host_2','test',98,3,38,'2023-04-01T00:09:00+00:00'),
    ('host_3','test',96,96,4,'2023-04-01T00:09:00+00:00'),
    ('host_0','test',35,59,36,'2023-04-01T00:11:00+00:00');
```

## Query Data with SQL

### Select all data

Run the following SQL statement to query all rows in the table. Then you can switch to the `Chart` tab to see the visualized data.

``` sql
SELECT * FROM cpu_metrics ORDER BY ts DESC;
```

You can also use `count()` function to get the number of rows in the table.

``` sql
SELECT count(*) FROM cpu_metrics;
```

### Select a specific column and perform basic arithmetic

Basic arithmetic can be performed on the selected column. For example, the following SQL statement selects the `usage_user` column and mutiply each value by 2.

``` sql
SELECT usage_user, usage_user * 2 as twice_usage_user FROM cpu_metrics;
```

See more about [`Select` clause](https://docs.greptime.com/reference/sql/select).

### Filter data by `WHERE` clause 

The `WHERE` clause can be used to filter data. It supports comparisons against string, boolean, and numeric values. The following SQL statement selects the rows where the `usage_user` is greater than 50.

``` sql
SELECT * FROM cpu_metrics WHERE usage_user > 50;
```

See more about [`Where` clause](https://docs.greptime.com/reference/sql/where).

### Group query results

Developers always want to see the general CPU usage to check if there are any problems with the resources. For example, the following SQL statement returns the average CPU usage group by hosts.

``` sql
SELECT hostname, 
    avg(usage_user) as usage_user_avg
    FROM cpu_metrics
    GROUP BY hostname;
```

Multiple fields can be grouped together. The following SQL statement returns the average CPU usage group by `hostname` and `environment`. The `mean` function alias of `avg` function also can be used to calculate the average value of each field.

``` sql
SELECT hostname, environment, 
    mean(usage_user) as usage_user_avg
    FROM cpu_metrics
    GROUP BY hostname, environment;
```

95 percent usage reflects the peak usage of the CPU. The following SQL statement returns the 95 percent CPU usage group by `hostname` and `environment`.

``` sql
SELECT hostname, environment, 
    approx_percentile_cont(usage_user, 0.95) as usage_user_95, 
    approx_percentile_cont(usage_system, 0.95) as usage_system_95, 
    approx_percentile_cont(usage_idle, 0.95) as usage_idle_95 
    FROM cpu_metrics
    GROUP BY hostname, environment;
```

See more about [`GROUP BY` clause](https://docs.greptime.com/reference/sql/group_by).

<!-- TODO: add GROUP BY time -->
<!-- 
The following SQL statement returns the average CPU usage of all hosts every 5 minutes.

``` sql
SELECT avg(usage_user), avg(usage_system), avg(usage_idle) FROM cpu_metrics GROUP BY time(5m);
``` -->

### More aggregate functions

There are more aggregate functions available, change `avg` to any of these below
and try out:

`max` / `min` / `sum`

<!-- TODO: refer to function doc to get more functions -->

## Try it Out


Please start exploring by writing some queries in the panel below!


```sql

```


For other advanced features like scripting and protocol supports,
[Download](https://greptime.com/download/) and run GreptimeDB locally by
following [docs](https://docs.greptime.com).
