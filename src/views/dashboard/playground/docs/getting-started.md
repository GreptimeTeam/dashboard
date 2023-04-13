---
title: Quick Start
---
# Getting Started

## Preface
Greetings from Greptime Play! Apart from just following a word-document guide, this interactive playground will quickly familiarize you with GreptimeDB and help you to get the most out of it. 

::: tip Cool feature alert:
all code blocks in this guide are editable and executable! 
 
basics of GreptimeDB. Instead of static doc reading, Greptime Play offers an interactive experience: **all code blocks in this guide are editable and executable**.
:::

By hitting the `Run` button, the code will be executed and run in a temporary, private instance generated
from [GreptimeCloud](https://greptime.com/product/cloud). **You can also explore and experiment with different ideas by editing the codes.**
:::danger Note that:
the instance is valid within **1 hour** once initiated, and you will need to create a new one when the time is up. Soplease never store important data in Greptime Play sessions.
:::

## Create a Time-Series Table

Let's start the journey by creating a simple `system_metrics` table first. Note that we pre-defined `host`
and `idc` as the primary keys; `ts` and time index, both are important to know
in GreptimeDB. Click `Run` on the upper left in the panel below to create the table:


```sql
CREATE TABLE IF NOT EXISTS system_metrics (
    host STRING,
    idc STRING,
    cpu_util DOUBLE,
    memory_util DOUBLE,
    disk_util DOUBLE,
    ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(host, idc),
    TIME INDEX(ts)
);
```

Once the green marker appears, run `DESC TABLE` to view the details of the table.

In GreptimeDB, there are three types of columns:

- `PRIMARY KEY`: key columns that are used for sorting and partitioning
- `FIELD`: columns which store table values
- `TIME INDEX`: columns of data type TIME

```sql
DESC TABLE system_metrics;
```

## Add Some Data

Using the `INSERT` statement to easily add data to the table. Below example inserts three rows into the `system_metrics` table.

``` sql
INSERT INTO system_metrics
VALUES
    ("host1", "idc_a", 11.8, 10.3, 10.3, 1667446791450),
    ("host2", "idc_a", 80.1, 70.3, 90.0, 1667446792460),
    ("host1", "idc_b", 50.0, 66.7, 40.6, 1667446793470);
```


Ingest more entries by modifying the values and timestamps.


``` sql
INSERT INTO system_metrics
VALUES
    ("host1", "idc_a", 30.2, 50.1, 11.0, 1667446794480),
    ("host2", "idc_a", 60.8, 74.9, 96.2, 1667446795490),
    ("host1", "idc_b", 30.0, 65.7, 40.2, 1667446796500);
```



## Query Data with SQL


GreptimeDB fully supports SQL.


``` sql
SELECT * FROM system_metrics ORDER BY ts DESC;
```


We list some SQL examples below of the `system_metrics` table, for you to get familiar
with using SQL alongside GreptimeDB's functions.

Use `count()` function to get the number of all rows in the table:


``` sql
SELECT count(*) FROM system_metrics;
```

The `avg()` function returns the average value of a certain field:

``` sql
SELECT avg(cpu_util) FROM system_metrics;
```

Use the `GROUP BY` clause to group rows that have the same values into
summary rows. The code below groups average memory usage by `idc`:


```sql
SELECT idc, avg(memory_util) FROM system_metrics GROUP BY idc;
```

There are more aggregate function available, change `avg` to any of these below
and try out:

`max` / `min` / `sum` / `mean`

## Try it Out


Please start exploring by writing some queries in the panel below!


```sql

```


For other advanced features like scripting and protocol supports,
[Download](https://greptime.com/download/) and run GreptimeDB locally by
following [docs](https://docs.greptime.com).
