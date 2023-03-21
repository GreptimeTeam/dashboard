# Quick Start

### Build

#### Build from Source

To compile GreptimeDB from source, you'll need:

- C/C++ Toolchain: provides basic tools for compiling and linking. This is
  available as `build-essential` on ubuntu and similar name on other platforms.
- Rust: the easiest way to install Rust is to use
  [`rustup`](https://rustup.rs/), which will check our `rust-toolchain` file and
  install correct Rust version for you.
- Protobuf: `protoc` is required for compiling `.proto` files. `protobuf` is
  available from major package manager on macos and linux distributions. You can
  find an installation instructions [here](https://grpc.io/docs/protoc-installation/).
  **Note that `protoc` version needs to be >= 3.15** because we have used the `optional`
  keyword. You can check it with `protoc --version`.
- python3-dev or python3-devel(Optional feature, only needed if you want to run scripts
  in CPython, and also need to enable `pyo3_backend` feature when compiling(by `cargo run -F pyo3_backend` or add `pyo3_backend` to src/script/Cargo.toml 's `features.default` like `default = ["python", "pyo3_backend]`)): this install a Python shared library required for running Python
  scripting engine(In CPython Mode). This is available as `python3-dev` on
  ubuntu, you can install it with `sudo apt install python3-dev`, or
  `python3-devel` on RPM based distributions (e.g. Fedora, Red Hat, SuSE). Mac's
  `Python3` package should have this shared library by default. More detail for compiling with PyO3 can be found in [PyO3](https://pyo3.rs/v0.18.1/building_and_distribution#configuring-the-python-version)'s documentation.

#### Build with Docker

A docker image with necessary dependencies is provided:

```
docker build --network host -f docker/Dockerfile -t greptimedb .
```

### Run

Start GreptimeDB from source code, in standalone mode:

```
cargo run -- standalone start
```

Or if you built from docker:

```
docker run -p 4002:4002 -v "$(pwd):/tmp/greptimedb" greptime/greptimedb standalone start
```

For more startup options, greptimedb's **distributed mode** and information
about Kubernetes deployment, check our [docs](https://docs.greptime.com/).

### Connect

1. Connect to GreptimeDB via standard [MySQL
   client](https://dev.mysql.com/downloads/mysql/):

   ```
   # The standalone instance listen on port 4002 by default.
   mysql -h 127.0.0.1 -P 4002
   ```

2. Create table:

   ```SQL
   CREATE TABLE monitor (
     host STRING,
     ts TIMESTAMP,
     cpu DOUBLE DEFAULT 0,
     memory DOUBLE,
     TIME INDEX (ts),
     PRIMARY KEY(host)) ENGINE=mito WITH(regions=1);
   ```

3. Insert some data:

   ```SQL
   INSERT INTO monitor(host, cpu, memory, ts) VALUES ('host1', 66.6, 1024, 1660897955000);
   INSERT INTO monitor(host, cpu, memory, ts) VALUES ('host2', 77.7, 2048, 1660897956000);
   INSERT INTO monitor(host, cpu, memory, ts) VALUES ('host3', 88.8, 4096, 1660897957000);
   ```

4. Query the data:

   ```SQL
   SELECT * FROM monitor;
   ```

You can always cleanup test database by removing `/tmp/greptimedb`.
