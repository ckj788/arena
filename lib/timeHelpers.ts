/**
 * 📅 INDIE CLASH — NEW YORK TIMEZONE (EST/EDT) CORE TIMING MODULE
 * File: d:\ZASON-项目\1\lib\timeHelpers.ts
 * Helper functions to calculate countdowns and automatic round settles
 * strictly using the New York Timezone benchmark.
 */

// 1. Get current local time in New York as Date object
export function getNewYorkTime(): Date {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map(p => [p.type, p.value]));
  
  return new Date(
    Number(map.get("year")),
    Number(map.get("month")) - 1,
    Number(map.get("day")),
    Number(map.get("hour")),
    Number(map.get("minute")),
    Number(map.get("second"))
  );
}

// 1.5. Convert a specific Date object to New York local time Date object
export function getNewYorkTimeOfDate(date: Date): Date {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  });
  
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map(p => [p.type, p.value]));
  
  return new Date(
    Number(map.get("year")),
    Number(map.get("month")) - 1,
    Number(map.get("day")),
    Number(map.get("hour")),
    Number(map.get("minute")),
    Number(map.get("second"))
  );
}

// 2. Calculate remaining milliseconds to next New York midnight (00:00:00)
// If startedAt is provided, target midnight of the day after startedAt (matching creation day)
export function getMillisecondsToNextNYMidnight(startedAt?: string): number {
  const nyNow = getNewYorkTime();
  const baseDate = startedAt ? new Date(startedAt) : new Date();
  const nyBase = getNewYorkTimeOfDate(baseDate);
  const nyTargetMidnight = new Date(nyBase);
  nyTargetMidnight.setHours(24, 0, 0, 0); 
  return nyTargetMidnight.getTime() - nyNow.getTime();
}

// 3. Get the duration of each round according to the 3-2-1-1 rule (in milliseconds)
// Restored to daily duration configs: 3 days, 2 days, 1 day, 1 day
export function getRoundDurationMs(roundNumber: number): number {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  switch (roundNumber) {
    case 1:
      return 3 * ONE_DAY_MS; // 3 days
    case 2:
      return 2 * ONE_DAY_MS; // 2 days
    case 3:
      return 1 * ONE_DAY_MS; // 1 day
    case 4:
      return 1 * ONE_DAY_MS; // 1 day
    default:
      return 1 * ONE_DAY_MS;
  }
}

function newYorkDateParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
  };
}

function timeZoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.get("year")),
    Number(values.get("month")) - 1,
    Number(values.get("day")),
    Number(values.get("hour")),
    Number(values.get("minute")),
    Number(values.get("second")),
  );
  return representedAsUtc - date.getTime();
}

// Convert a New York calendar midnight to a real UTC instant. Iterating the
// offset calculation keeps the result correct across EST/EDT transitions.
function newYorkMidnightUtc(year: number, month: number, day: number): Date {
  const localAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let result = new Date(localAsUtc);
  for (let index = 0; index < 3; index += 1) {
    result = new Date(localAsUtc - timeZoneOffsetMs(result));
  }
  return result;
}

export function getNextNewYorkMidnightIso(from: Date = new Date(), daysFromToday = 1): string {
  const parts = newYorkDateParts(from);
  const calendarTarget = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + daysFromToday));
  return newYorkMidnightUtc(
    calendarTarget.getUTCFullYear(),
    calendarTarget.getUTCMonth() + 1,
    calendarTarget.getUTCDate(),
  ).toISOString();
}

export function getRoundEndAtIso(roundNumber: number, from: Date = new Date()): string {
  const days = Math.max(1, Math.round(getRoundDurationMs(roundNumber) / (24 * 60 * 60 * 1000)));
  return getNextNewYorkMidnightIso(from, days);
}

export function isNewYorkWeeklyCutoff(date: Date = new Date()): boolean {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(date) === "Mon";
}

// 4. Get remaining time for the current round (in milliseconds)
// Param startedAtStr: ISO timestamp of the current round start recorded in DB
export function getRoundRemainingMs(roundNumber: number, startedAtStr: string, endsAtStr?: string): number {
  const explicitDeadline = endsAtStr ? new Date(endsAtStr).getTime() : Number.NaN;
  if (Number.isFinite(explicitDeadline)) return Math.max(0, explicitDeadline - Date.now());
  const startedAt = new Date(startedAtStr).getTime();
  const duration = getRoundDurationMs(roundNumber);
  const deadline = startedAt + duration;
  
  // 🚀 [TESTING DEPLOYMENT BYPASS]: Subtract pure UTC timestamps to avoid timezone difference bugs
  const remaining = deadline - Date.now();
  return Math.max(0, remaining);
  
  /* Original NY time adjustment logic (which could drop to zero immediately due to timezone differences in short testing):
  const currentNYTime = getNewYorkTime().getTime();
  const rawCurrentLocalTime = new Date().getTime();
  const diffOffset = currentNYTime - rawCurrentLocalTime; 
  const adjustedNow = Date.now() + diffOffset;
  const remaining = deadline - adjustedNow;
  return Math.max(0, remaining);
  */
}

// 5. Format milliseconds into day, hour, minute, second string (for UI rendering)
export function formatDuration(ms: number): string {
  if (ms <= 0) return "00:00:00";
  
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}D`);
  
  const pad = (num: number) => String(num).padStart(2, "0");
  parts.push(`${pad(hours)}H`);
  parts.push(`${pad(minutes)}M`);
  parts.push(`${pad(seconds)}S`);
  
  return parts.join(" ");
}

// 6. Format as HH:MM:SS (for countdown UI)
export function formatToHMS(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// The single Vercel cron runs at 06:00 UTC every day. Keep this calculation
// UTC-based so the public countdown always matches the scheduler exactly.
export function getMillisecondsToNextDailyArenaRun(from: Date = new Date()): number {
  const nextRun = new Date(from);
  nextRun.setUTCHours(6, 0, 0, 0);
  if (nextRun.getTime() <= from.getTime()) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }
  return Math.max(0, nextRun.getTime() - from.getTime());
}
