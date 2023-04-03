---
title: Quick Start
---
# Getting Started

## Preface

basics of GreptimeDB. Instead of static doc reading, Greptime Play offers an
interactive experience: **all code blocks in this guide are editable and
executable**.
​
By hitting `Run` button, code will be executed in a temporary, private instance
from [GreptimeCloud](https://greptime.com/product/cloud). **You can also edit
the code to explore your own ideas**. Note that the session is valid in **1
hour**, you will be asked to create a new one when it's expired and recycled. So
never store important data in Greptime Play sessions.
​
## Create a Time-Series Table

Let's start by creating the `system_metrics` table. Note that we defined `host`
and `idc` as primary key, and `ts` and time index, both are important concepts
in GreptimeDB. Hit `Run` to create the table:
​

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

Once you see the green marker, run `desc table` to check detail of the table.
​
```sql
DESC TABLE system_metrics;
```

## Add Some Data

​
Using the `INSERT` statement is an easy way to add data to your table. Through
the statement below, we have inserted three rows into the `system_metrics`
table.
​

``` sql
INSERT INTO system_metrics
VALUES
    ("host1", "idc_a", 11.8, 10.3, 10.3, 1667446791450),
    ("host2", "idc_a", 80.1, 70.3, 90.0, 1667446792460),
    ("host1", "idc_b", 50.0, 66.7, 40.6, 1667446793470);
```

​
Modify the value and timestamp, we can ingest more entries.
​

``` sql
INSERT INTO system_metrics
VALUES
    ("host1", "idc_a", 30.2, 50.1, 11.0, 1667446794480),
    ("host2", "idc_a", 60.8, 74.9, 96.2, 1667446795490),
    ("host1", "idc_b", 30.0, 65.7, 40.2, 1667446796500);
```

​

## Query Data with SQL

​
GreptimeDB supports full SQL for you to query data from a database.
​

``` sql
SELECT * FROM system_metrics;
```

​
Here are some query examples for the `system_metrics` so you can get familiar
with using SQL alongside GreptimeDB functions.
​
Use `count()` function to get the number of all rows in the table:
​

``` sql
SELECT count(*) FROM system_metrics;
```

​
Use `avg()` function returns the average value of a certain field:
​

``` sql
SELECT avg(cpu_util) FROM system_metrics;
```

​
You can use the `GROUP BY` clause to group rows that have the same values into
summary rows. The average memory usage grouped by `idc`:
​

```sql
SELECT idc, avg(memory_util) FROM system_metrics GROUP BY idc;
```

​

## Explore by Yourself

​
Enough with the basics, try to write your own query and do some exploration.
​

```sql
-- Type your SQL here
​
```

​
Full more advanced features like scripting, various protocol support,
[Download](https://greptime.com/downloads/) GreptimeDB on your machine and
follow our [docs](https://docs.greptime.com).
