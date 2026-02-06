
import { calculateNextRunForTask } from '../src/lib/scheduler/scheduler-service';
import { DateTime } from 'luxon';

const TIMEZONE = 'Europe/Rome';

function assert(condition: boolean, message: string) {
    if (!condition) {
        console.error(`❌ FAIL: ${message}`);
        process.exit(1);
    } else {
        console.log(`✅ PASS: ${message}`);
    }
}

function runTests() {
    console.log("Starting Scheduler Logic Tests...");

    // Base Time: Monday, 2023-01-01 10:00:00
    // 2023-01-01 is actually a Sunday. Let's pick a known date.
    // 2024-01-01 is a Monday.
    const baseDate = DateTime.fromISO('2024-01-01T10:00:00', { zone: TIMEZONE }).toJSDate();

    // TEST 1: Interval (Every 30 mins)
    // Last run: 10:00. Now: 10:00. Next: 10:30.
    {
        const task = {
            scheduleType: 'interval',
            intervalMinutes: 30,
            lastRunAt: baseDate
        };
        // Passing baseDate as "now" AND as "lastRunAt" implies it just ran.
        const result = calculateNextRunForTask(task, TIMEZONE, baseDate);
        assert(!!result, "Interval result exists");
        const next = DateTime.fromJSDate(result!).setZone(TIMEZONE);
        assert(next.hour === 10 && next.minute === 30, `Interval 30m: Expected 10:30, got ${next.toFormat('HH:mm')}`);
    }

    // TEST 2: Interval with Catchup (Every 30 mins)
    // Last run: 09:00. Now: 10:15.
    // Should run at 10:30 (aligned)? or 10:15 + 30?
    // Logic implementation: aligned to lastRun.
    // 09:00 + 30 = 09:30 (< 10:15)
    // 09:30 + 30 = 10:00 (< 10:15)
    // 10:00 + 30 = 10:30 (> 10:15) -> Result should be 10:30.
    {
        const lastRun = DateTime.fromISO('2024-01-01T09:00:00', { zone: TIMEZONE }).toJSDate();
        const now = DateTime.fromISO('2024-01-01T10:15:00', { zone: TIMEZONE }).toJSDate();

        const task = {
            scheduleType: 'interval',
            intervalMinutes: 30,
            lastRunAt: lastRun
        };
        const result = calculateNextRunForTask(task, TIMEZONE, now);
        // assert(!!result, "Interval catchup result exists");
        const next = DateTime.fromJSDate(result!).setZone(TIMEZONE);
        assert(next.hour === 10 && next.minute === 30, `Interval catchup: Expected 10:30, got ${next.toFormat('HH:mm')}`);
    }

    // TEST 3: Custom Times (14:30)
    // Now: 10:00. Should be Today 14:30.
    {
        const task = {
            config: JSON.stringify({ customTimes: ["14:30"] }),
            daysOfWeek: "*" // Daily
        };
        const result = calculateNextRunForTask(task, TIMEZONE, baseDate);
        const next = DateTime.fromJSDate(result!).setZone(TIMEZONE);
        assert(next.hasSame(DateTime.fromJSDate(baseDate), 'day'), "Same day");
        assert(next.hour === 14 && next.minute === 30, `Custom Time: Expected 14:30, got ${next.toFormat('HH:mm')}`);
    }

    // TEST 4: Custom Times (09:00 - Passed)
    // Now: 10:00. Should be Tomorrow 09:00.
    {
        const task = {
            config: JSON.stringify({ customTimes: ["09:00"] }),
            daysOfWeek: "*"
        };
        const result = calculateNextRunForTask(task, TIMEZONE, baseDate);
        const next = DateTime.fromJSDate(result!).setZone(TIMEZONE);

        const expectedDay = DateTime.fromJSDate(baseDate).plus({ days: 1 });
        assert(next.hasSame(expectedDay, 'day'), "Next day");
        assert(next.hour === 9 && next.minute === 0, `Custom Time (Passed): Expected Tomorrow 09:00, got ${next.toFormat('dd HH:mm')}`);
    }

    // TEST 5: Specific Days (Monday is 1, Tuesday is 2)
    // Now: Monday 10:00.
    // Schedule: Tuesday (2) at 10:00.
    // Expected: Tomorrow (Tuesday)
    {
        const task = {
            scheduleType: 'specific',
            hours: "10",
            daysOfWeek: "2" // Tuesday. 2024-01-01 is Monday (1 in Luxon). Cron 2 is Tuesday.
            // Wait, logic says:
            // "Cron: 0=Sun, 1=Mon...6=Sat."
            // "Luxon weekday: 1=Mon...7=Sun."
            // "Mapping Luxon->Cron: val % 7."
            // 2024-01-01 is Monday. Luxon 1. RefDate.weekday % 7 = 1.
            // Target is "2" (Tuesday).
            // Should be tomorrow.
        };
        const result = calculateNextRunForTask(task, TIMEZONE, baseDate);
        const next = DateTime.fromJSDate(result!).setZone(TIMEZONE);

        const expectedDay = DateTime.fromJSDate(baseDate).plus({ days: 1 });
        assert(next.hasSame(expectedDay, 'day'), `Specific Day: Expected Tomorrow (Tuesday), got ${next.toFormat('cccc')}`);
        assert(next.hour === 10, "Hour is 10");
    }

    // TEST 6: Custom Times with Specific Days
    // Now: Monday 10:00.
    // Schedule: Wednesday (3 in Cron is Wed) at 12:00
    // Expected: Wednesday
    {
        const task = {
            config: JSON.stringify({ customTimes: ["12:00"] }),
            daysOfWeek: "3" // Wednesday
        };
        const result = calculateNextRunForTask(task, TIMEZONE, baseDate);
        const next = DateTime.fromJSDate(result!).setZone(TIMEZONE);

        const expectedDay = DateTime.fromJSDate(baseDate).plus({ days: 2 }); // Mon -> Wed is +2
        assert(next.hasSame(expectedDay, 'day'), `Custom Time + Day: Expected Wednesday, got ${next.toFormat('cccc')}`);
        assert(next.hour === 12, "Hour is 12");
    }

    console.log("ALL TESTS PASSED");
}

runTests();
