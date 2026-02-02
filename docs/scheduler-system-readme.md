# Scheduler System - Quick Start Guide

## What is the Scheduler System?

The Scheduler System is a comprehensive task scheduling solution that allows you to automate recurring operations in your application. You can schedule:

- 📧 **Email operations** - Preview and send emails automatically
- 🗄️ **SQL operations** - Execute queries on databases
- 🔄 **Data synchronization** - Sync data between systems
- ⚙️ **Custom operations** - Run any custom action

## Quick Start

### 1. Run Database Migration

```bash
npx prisma migrate dev --name add_scheduler_system
```

### 2. Initialize the Scheduler

Add this to your application startup (e.g., in `src/app/layout.tsx`):

```typescript
import { initializeScheduler } from '@/lib/scheduler';

// Initialize on app startup
initializeScheduler().catch(console.error);
```

### 3. Access the Scheduler UI

Navigate to `/scheduler` in your browser to access the scheduler management interface.

## Creating Your First Scheduled Task

### Example: Send Daily Email Report

1. Go to `/scheduler`
2. Click "Nuovo Task"
3. Fill in the form:
   - **Name**: "Daily Report Email"
   - **Type**: "Invio Email"
   - **Configuration**:
     - Connector: Select your SMTP connector
     - To: `recipient@example.com`
     - Subject: `Daily Report`
     - Body: `Here is your daily report...`
   - **Schedule**:
     - Type: "Cron"
     - Expression: `0 9 * * *` (every day at 9:00 AM)
   - **Timezone**: `Europe/Rome`
4. Click "Crea Task"

Your task is now scheduled and will run automatically!

## Schedule Types Explained

### 1. Interval Schedule

Runs every X minutes.

**Example**: Every 2 hours
```
Interval: 120 minutes
```

### 2. Specific Schedule

Runs on specific days and hours.

**Example**: Weekdays at 9 AM and 5 PM
```
Days: Mon, Tue, Wed, Thu, Fri
Hours: 9, 17
```

### 3. Cron Schedule

Uses cron expressions for flexible scheduling.

**Examples**:
- `0 9 * * *` - Every day at 9:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1` - Every Monday at 9:00 AM
- `0 0 1 * *` - First day of every month at midnight

## Common Use Cases

### 1. Automated Reports

Send daily/weekly/monthly reports via email:

```json
{
  "type": "EMAIL_SEND",
  "scheduleType": "cron",
  "cronExpression": "0 9 * * 1",
  "config": {
    "connectorId": "smtp-connector",
    "to": "manager@example.com",
    "subject": "Weekly Report",
    "body": "Here is the weekly report..."
  }
}
```

### 2. Data Cleanup

Clean up old data regularly:

```json
{
  "type": "SQL_EXECUTE",
  "scheduleType": "cron",
  "cronExpression": "0 2 * * *",
  "config": {
    "connectorIdSql": "db-connector",
    "query": "DELETE FROM logs WHERE created_at < NOW() - INTERVAL '30 days'"
  }
}
```

### 3. Data Synchronization

Sync data between systems:

```json
{
  "type": "DATA_SYNC",
  "scheduleType": "interval",
  "intervalMinutes": 60,
  "config": {
    "sourceConnectorId": "source-db",
    "targetConnectorId": "target-db",
    "syncQuery": "SELECT * FROM products WHERE updated_at > last_sync"
  }
}
```

### 4. Database Monitoring

Run health checks on your database:

```json
{
  "type": "SQL_PREVIEW",
  "scheduleType": "interval",
  "intervalMinutes": 15,
  "config": {
    "connectorIdSql": "db-connector",
    "query": "SELECT COUNT(*) as active_users FROM users WHERE last_login > NOW() - INTERVAL '1 hour'"
  }
}
```

## Managing Tasks

### View All Tasks

Go to `/scheduler` to see all your scheduled tasks with their:
- Status (Active/Paused/Disabled)
- Last execution time
- Next execution time
- Success/failure counts

### Trigger Manual Execution

Click the "Play" button on any task to run it immediately.

### Pause/Resume Tasks

Click the "Pause/Play" button to temporarily stop a task from running.

### View Execution History

Click the "Clock" button to see detailed execution history including:
- Execution status
- Duration
- Error messages
- Retry attempts

### Delete Tasks

Click the "Trash" button to permanently remove a task.

## API Usage

### Create Task via API

```typescript
const response = await fetch('/api/scheduler/tasks', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'My Scheduled Task',
    type: 'EMAIL_SEND',
    config: {
      connectorId: 'connector-id',
      to: 'email@example.com',
      subject: 'Subject',
      body: 'Body'
    },
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    timezone: 'Europe/Rome'
  })
});
```

### Get Task Status

```typescript
const response = await fetch('/api/scheduler/tasks/task-id');
const { task } = await response.json();
console.log(task.status); // 'active', 'paused', 'disabled'
console.log(task.nextRunAt); // Next execution time
```

### Trigger Task Manually

```typescript
const response = await fetch('/api/scheduler/tasks/task-id/trigger', {
  method: 'POST'
});
```

## Best Practices

### 1. Start Simple

Begin with interval schedules (e.g., every hour) before moving to complex cron expressions.

### 2. Test Before Scheduling

Use the "Trigger" button to test your task before scheduling it.

### 3. Monitor Execution History

Regularly check the execution history to ensure tasks are running successfully.

### 4. Set Appropriate Retries

For critical tasks, set `maxRetries` to 3 or more with a reasonable `retryDelayMinutes`.

### 5. Use Timezone-Aware Scheduling

Always set the correct timezone to ensure tasks run at the expected local time.

### 6. Optimize SQL Queries

For SQL tasks, ensure queries are optimized and use indexes where appropriate.

### 7. Handle Errors Gracefully

Review failed executions and update task configurations to prevent recurring failures.

## Troubleshooting

### Task Not Running?

1. Check the task status is "Active"
2. Verify the schedule configuration is correct
3. Check the scheduler service is initialized
4. Review execution history for errors

### Task Failing?

1. Check the execution history for error messages
2. Verify connector configurations
3. Test the operation manually
4. Review system logs

### Can't Access Scheduler?

1. Ensure you're logged in
2. Check you have the required permissions
3. Verify the scheduler page route exists

## Security Considerations

- Only authorized users can access the scheduler
- Task configurations are validated before execution
- SQL queries use parameterized connectors
- Email operations use configured connectors only

## Performance Tips

- Minimum interval: 1 minute
- For frequent tasks, consider using cron expressions
- Monitor database load for SQL-heavy tasks
- Review execution duration to identify bottlenecks

## Need Help?

- 📖 Check the full documentation: `docs/scheduler-system-guide.md`
- 🐛 Report issues in the project repository
- 💬 Contact support for assistance

## What's Next?

The scheduler system is ready to use! Here are some ideas:

1. **Automate Reports**: Schedule daily/weekly report emails
2. **Data Maintenance**: Set up regular data cleanup tasks
3. **Monitoring**: Create health check tasks for your systems
4. **Data Sync**: Automate data synchronization between systems
5. **Custom Workflows**: Create custom tasks for your specific needs

Happy scheduling! 🚀
