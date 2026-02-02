# Scheduler System Guide

## Overview

The Scheduler System allows you to automate recurring operations such as:
- Email previews and sends
- SQL query previews and executions
- Data synchronization
- Custom operations

## Features

### Task Types

1. **EMAIL_PREVIEW**: Preview email content without sending
2. **EMAIL_SEND**: Send emails via configured connectors
3. **SQL_PREVIEW**: Preview SQL query results (read-only)
4. **SQL_EXECUTE**: Execute SQL queries (read/write)
5. **DATA_SYNC**: Synchronize data between connectors
6. **CUSTOM**: Execute custom operations

### Schedule Types

1. **Interval**: Execute every X minutes
2. **Specific**: Execute on specific days and hours
3. **Cron**: Execute using cron expressions

## Installation

### 1. Database Migration

The scheduler system requires new database tables. Run the Prisma migration:

```bash
npx prisma migrate dev --name add_scheduler_system
```

### 2. Dependencies

The system uses `node-cron` for scheduling. It's already installed in your project.

### 3. Initialize the Scheduler

The scheduler needs to be initialized when the application starts. Add this to your app initialization:

```typescript
// src/app/layout.tsx or src/app/api/scheduler/init/route.ts
import { initializeScheduler } from '@/lib/scheduler';

// Initialize on app startup
initializeScheduler().catch(console.error);
```

## Usage

### Creating a Scheduled Task

#### Via UI

1. Navigate to `/scheduler`
2. Click "Nuovo Task"
3. Fill in the task details:
   - **Name**: Task name
   - **Description**: Optional description
   - **Type**: Select task type
   - **Configuration**: Configure task-specific parameters
   - **Schedule**: Choose schedule type and configure timing
   - **Timezone**: Select timezone
   - **Retry Settings**: Configure max retries and retry delay
4. Click "Crea Task"

#### Via API

```typescript
const response = await fetch('/api/scheduler/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Daily Report Email',
    description: 'Send daily report at 9 AM',
    type: 'EMAIL_SEND',
    config: {
      connectorId: 'connector-123',
      to: 'recipient@example.com',
      subject: 'Daily Report',
      body: 'Here is your daily report...'
    },
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    timezone: 'Europe/Rome',
    maxRetries: 3,
    retryDelayMinutes: 5
  })
});
```

### Schedule Configuration Examples

#### Interval Schedule

Execute every 60 minutes:

```json
{
  "scheduleType": "interval",
  "intervalMinutes": 60
}
```

#### Specific Schedule

Execute on weekdays (Mon-Fri) at 9 AM and 5 PM:

```json
{
  "scheduleType": "specific",
  "daysOfWeek": "1,2,3,4,5",
  "hours": "9,17"
}
```

#### Cron Schedule

Execute every day at 9:00 AM:

```json
{
  "scheduleType": "cron",
  "cronExpression": "0 9 * * *"
}
```

Execute every 6 hours:

```json
{
  "scheduleType": "cron",
  "cronExpression": "0 */6 * * *"
}
```

Execute every Monday at 9:00 AM:

```json
{
  "scheduleType": "cron",
  "cronExpression": "0 9 * * 1"
}
```

### Managing Tasks

#### List Tasks

```typescript
const response = await fetch('/api/scheduler/tasks');
const { tasks } = await response.json();
```

#### Get Task Details

```typescript
const response = await fetch(`/api/scheduler/tasks/${taskId}`);
const { task } = await response.json();
```

#### Update Task

```typescript
const response = await fetch(`/api/scheduler/tasks/${taskId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'paused',
    intervalMinutes: 120
  })
});
```

#### Delete Task

```typescript
const response = await fetch(`/api/scheduler/tasks/${taskId}`, {
  method: 'DELETE'
});
```

#### Trigger Manual Execution

```typescript
const response = await fetch(`/api/scheduler/tasks/${taskId}/trigger`, {
  method: 'POST'
});
```

### Viewing Execution History

```typescript
const response = await fetch(`/api/scheduler/tasks/${taskId}/executions?page=1&limit=20`);
const { executions, pagination } = await response.json();
```

## Task Configuration Examples

### Email Task

```json
{
  "type": "EMAIL_SEND",
  "config": {
    "connectorId": "smtp-connector-id",
    "to": "recipient@example.com",
    "subject": "Daily Report",
    "body": "Here is your daily report..."
  }
}
```

### SQL Preview Task

```json
{
  "type": "SQL_PREVIEW",
  "config": {
    "connectorIdSql": "database-connector-id",
    "query": "SELECT * FROM orders WHERE date >= CURRENT_DATE"
  }
}
```

### SQL Execute Task

```json
{
  "type": "SQL_EXECUTE",
  "config": {
    "connectorIdSql": "database-connector-id",
    "query": "UPDATE orders SET status = 'processed' WHERE date < CURRENT_DATE"
  }
}
```

### Data Sync Task

```json
{
  "type": "DATA_SYNC",
  "config": {
    "sourceConnectorId": "source-db-id",
    "targetConnectorId": "target-db-id",
    "syncQuery": "SELECT * FROM customers WHERE updated_at > last_sync"
  }
}
```

### Custom Task

```json
{
  "type": "CUSTOM",
  "config": {
    "customAction": "generate-report",
    "customParams": {
      "reportType": "monthly",
      "includeCharts": true
    }
  }
}
```

## Best Practices

### 1. Error Handling

- Set appropriate `maxRetries` for critical tasks
- Configure `retryDelayMinutes` to avoid overwhelming systems
- Monitor execution history to identify failing tasks

### 2. Performance

- For interval schedules, use reasonable intervals (minimum 1 minute)
- For SQL operations, ensure queries are optimized
- Consider the load on your database when scheduling frequent tasks

### 3. Security

- Validate all user inputs before creating tasks
- Use parameterized queries for SQL operations
- Limit access to scheduler management to authorized users

### 4. Monitoring

- Regularly check execution history
- Set up alerts for failed tasks
- Review task performance metrics

## Troubleshooting

### Task Not Running

1. Check task status is `active`
2. Verify schedule configuration is correct
3. Check scheduler service is running
4. Review execution history for errors

### Task Failing

1. Check execution history for error messages
2. Verify connector configurations
3. Test the operation manually
4. Check system resources and logs

### Scheduler Not Starting

1. Verify database connection
2. Check for migration errors
3. Review application logs
4. Ensure dependencies are installed

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/scheduler/tasks` | List all tasks |
| POST | `/api/scheduler/tasks` | Create new task |
| GET | `/api/scheduler/tasks/:id` | Get task details |
| PUT | `/api/scheduler/tasks/:id` | Update task |
| DELETE | `/api/scheduler/tasks/:id` | Delete task |
| POST | `/api/scheduler/tasks/:id/trigger` | Trigger manual execution |
| GET | `/api/scheduler/tasks/:id/executions` | Get execution history |

### Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request (validation error)
- `401`: Unauthorized
- `404`: Not Found
- `500`: Internal Server Error

## Timezones

The scheduler supports timezone-aware scheduling. Available timezones:

- Europe/Rome (default)
- Europe/London
- Europe/Paris
- Europe/Berlin
- America/New_York
- America/Los_Angeles
- Asia/Tokyo
- UTC

## Cron Expression Format

Cron expressions use the standard format:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 7) (Sunday = 0 or 7)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

### Examples

| Expression | Description |
|------------|-------------|
| `0 * * * *` | Every hour |
| `0 */2 * * *` | Every 2 hours |
| `0 9 * * *` | Every day at 9:00 AM |
| `0 9,17 * * *` | Every day at 9:00 AM and 5:00 PM |
| `0 9 * * 1` | Every Monday at 9:00 AM |
| `0 9 * * 1-5` | Every weekday at 9:00 AM |
| `0 0 1 * *` | First day of every month at midnight |

## Integration with Existing Features

The scheduler integrates seamlessly with existing features:

- **Email Actions**: Uses existing email connectors
- **SQL Operations**: Uses existing database connectors
- **Data Sync**: Leverages existing connection infrastructure
- **Custom Actions**: Can call any server action

## Future Enhancements

Potential future improvements:

1. Webhook notifications for task completion
2. Task dependencies (run task A after task B)
3. Advanced retry strategies (exponential backoff)
4. Task templates for quick creation
5. Bulk operations on tasks
6. Export/import task configurations
7. Real-time task monitoring dashboard
8. Alerting and notification system
