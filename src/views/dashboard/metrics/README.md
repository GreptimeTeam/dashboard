# Metrics Explorer

The Metrics Explorer is a comprehensive tool for exploring and querying metrics in GreptimeDB using PromQL (Prometheus Query Language). It provides an intuitive interface similar to Prometheus's metric explorer with autocomplete functionality.

## Features

### 1. Metrics & Labels Panel
- **Metrics Tab**: Browse all available metric names in your database
- **Labels Tab**: View all label names (attributes) associated with metrics
- **Search**: Filter metrics and labels by name
- **Refresh**: Update the list of available metrics and labels
- **Cache Management**: Clear cached data when needed

### 2. Query Editor
- **PromQL Support**: Full PromQL syntax support with autocomplete
- **Time Range Controls**: 
  - Date picker for custom time ranges
  - Quick time range buttons (1h, 6h, 24h)
  - Configurable step intervals (e.g., 15s, 1m, 1h)
- **Query Suggestions**: Intelligent autocomplete for:
  - Metric names
  - Label names
  - Label values
- **Query Execution**: Execute both instant and range queries

### 3. Results Display
- **Table View**: Structured display of query results
- **JSON View**: Raw API response data
- **Export**: Download results as JSON files

## API Endpoints Used

The Metrics Explorer uses GreptimeDB's Prometheus-compatible API endpoints:

- `GET /v1/prometheus/api/v1/label/__name__/values` - Get all metric names
- `GET /v1/prometheus/api/v1/labels` - Get all label names (with optional metric filtering)
- `GET /v1/prometheus/api/v1/label/{label_name}/values` - Get values for a specific label
- `GET /v1/prometheus/api/v1/query` - Execute instant PromQL queries
- `GET /v1/prometheus/api/v1/query_range` - Execute range PromQL queries

## Usage Examples

### Basic Metric Query
1. Select a metric from the Metrics tab
2. The metric name will be inserted into the query editor
3. Click "Execute" to run the query

### Filtering by Labels
1. Select a label from the Labels tab
2. Click "View Values" to see available values
3. Select a value and click "Insert"
4. The label selector will be added to your query

### Time Range Queries
1. Set the desired time range using the date picker
2. Configure the step interval (e.g., 15s for 15-second intervals)
3. Write your PromQL query
4. Click "Execute" to run a range query

### Advanced Queries
The query editor supports full PromQL syntax including:
- Functions: `rate()`, `increase()`, `avg_over_time()`, etc.
- Aggregations: `sum()`, `avg()`, `min()`, `max()`, etc.
- Binary operators: `+`, `-`, `*`, `/`, `%`, etc.
- Vector selectors: `{label="value"}`
- Range vectors: `[5m]`, `[1h]`, etc.

## Keyboard Shortcuts

- **Tab**: Navigate between panels
- **Enter**: Execute query
- **Ctrl/Cmd + Enter**: Execute query (alternative)
- **Escape**: Clear suggestions

## Caching

The Metrics Explorer implements intelligent caching to improve performance:
- Metric names are cached per database
- Label names are cached per database and metric filter
- Label values are cached per database, label name, and metric filter
- Cache can be manually cleared using the "Clear Cache" button

## Error Handling

- Network errors are displayed as user-friendly messages
- Query syntax errors show detailed error information
- Failed API calls are logged to the console for debugging

## Performance Tips

1. **Use specific metric selectors**: Instead of querying all metrics, filter by specific labels
2. **Optimize time ranges**: Use appropriate step intervals for your data
3. **Leverage caching**: The explorer automatically caches frequently accessed data
4. **Clear cache when needed**: If you suspect data is stale, use the "Clear Cache" button

## Troubleshooting

### Common Issues

1. **No metrics displayed**: Check if your database has metrics data and verify API connectivity
2. **Query execution fails**: Verify PromQL syntax and check the error message for details
3. **Slow performance**: Consider reducing the time range or step interval
4. **Cache issues**: Use the "Clear Cache" button to refresh data

### Debug Information

- Check the browser console for detailed error logs
- Verify API endpoint responses using browser developer tools
- Ensure your GreptimeDB instance supports Prometheus-compatible APIs

## Contributing

To extend the Metrics Explorer:

1. **Add new query functions**: Extend the `useMetrics` composable
2. **Enhance autocomplete**: Modify the suggestion generation logic
3. **Add visualization**: Integrate with charting libraries like ECharts
4. **Improve caching**: Enhance the caching strategy for better performance

## Related Documentation

- [GreptimeDB PromQL Guide](https://docs.greptime.com/user-guide/query-data/promql)
- [Prometheus Query Language](https://prometheus.io/docs/prometheus/latest/querying/)
- [PromQL Functions](https://prometheus.io/docs/prometheus/latest/querying/functions/) 