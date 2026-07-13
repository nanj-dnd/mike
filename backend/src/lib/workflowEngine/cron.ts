// Minimal 5-field cron parser (minute hour day-of-month month day-of-week)
// supporting *, numbers, lists (a,b), ranges (a-b), and steps (*/n, a-b/n).
// Deliberately dependency-free; standard crontab semantics where a match
// on either day-of-month or day-of-week fires when both are restricted.

export interface CronSchedule {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
}

const FIELD_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sunday)
];

export function parseCronExpression(expr: string): CronSchedule | { error: string } {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    return { error: "cron expression must have 5 fields (minute hour dom month dow)" };
  }
  const sets: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const [min, max] = FIELD_RANGES[i];
    const set = parseField(fields[i], min, max);
    if (!set) return { error: `invalid cron field '${fields[i]}'` };
    sets.push(set);
  }
  return {
    minutes: sets[0],
    hours: sets[1],
    daysOfMonth: sets[2],
    months: sets[3],
    daysOfWeek: sets[4],
    domRestricted: fields[2] !== "*",
    dowRestricted: fields[4] !== "*",
  };
}

function parseField(field: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const stepMatch = /^(.+?)\/(\d+)$/.exec(part);
    const base = stepMatch ? stepMatch[1] : part;
    const step = stepMatch ? Number(stepMatch[2]) : 1;
    if (!Number.isInteger(step) || step < 1) return null;

    let lo: number;
    let hi: number;
    if (base === "*") {
      lo = min;
      hi = max;
    } else if (/^\d+$/.test(base)) {
      lo = Number(base);
      hi = stepMatch ? max : Number(base);
    } else {
      const range = /^(\d+)-(\d+)$/.exec(base);
      if (!range) return null;
      lo = Number(range[1]);
      hi = Number(range[2]);
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out.size > 0 ? out : null;
}

/** Next fire time strictly after `after`. Null if none within 366 days. */
export function nextCronRun(schedule: CronSchedule, after: Date): Date | null {
  const cursor = new Date(after.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  const limit = after.getTime() + 366 * 24 * 60 * 60 * 1000;

  while (cursor.getTime() <= limit) {
    if (!schedule.months.has(cursor.getMonth() + 1)) {
      cursor.setMonth(cursor.getMonth() + 1, 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    const domOk = schedule.daysOfMonth.has(cursor.getDate());
    const dowOk = schedule.daysOfWeek.has(cursor.getDay());
    const dayOk =
      schedule.domRestricted && schedule.dowRestricted
        ? domOk || dowOk
        : domOk && dowOk;
    if (!dayOk) {
      cursor.setDate(cursor.getDate() + 1);
      cursor.setHours(0, 0, 0, 0);
      continue;
    }
    if (!schedule.hours.has(cursor.getHours())) {
      cursor.setHours(cursor.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!schedule.minutes.has(cursor.getMinutes())) {
      cursor.setMinutes(cursor.getMinutes() + 1, 0, 0);
      continue;
    }
    return cursor;
  }
  return null;
}
