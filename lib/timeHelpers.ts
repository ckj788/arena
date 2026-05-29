/**
 * 📅 INDIE CLASH — NEW YORK TIMEZONE (EST/EDT) CORE TIMING MODULE
 * File: d:\ZASON-项目\1\lib\timeHelpers.ts
 * Helper functions to calculate countdowns and automatic round settles
 * strictly using the New York Timezone benchmark.
 */

// 1. 获取当前纽约的本地时间 Date 对象
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

// 2. 计算距离下一次纽约时间零点（Midnight 00:00:00）的剩余毫秒数
// 🚀 [TESTING DEPLOYMENT BYPASS]: 为了在 Vercel 部署后极速跑通全套流程，我们将原本等待至纽约零点的限制缩短为 10 秒倒计时！
// 若要恢复原本的纽约零点限制，只需取消注释原版代码。
export function getMillisecondsToNextNYMidnight(startedAt?: string): number {
  const nyNow = getNewYorkTime();
  const nyMidnight = new Date(nyNow);
  nyMidnight.setHours(24, 0, 0, 0); 
  return nyMidnight.getTime() - nyNow.getTime();
}

// 3. 根据 3-2-1-1 规则，获取每轮赛事的规定时长（单位：毫秒）
// 已恢复为天数时间配置：3天、2天、1天、1天
export function getRoundDurationMs(roundNumber: number): number {
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  switch (roundNumber) {
    case 1:
      return 3 * ONE_DAY_MS; // 3天
    case 2:
      return 2 * ONE_DAY_MS; // 2天
    case 3:
      return 1 * ONE_DAY_MS; // 1天
    case 4:
      return 1 * ONE_DAY_MS; // 1天
    default:
      return 1 * ONE_DAY_MS;
  }
}

// 4. 获取当前轮次的剩余截止时间（单位：毫秒）
// 参数 startedAtStr: 数据库中记录的当前轮次启动 ISO 时间戳
export function getRoundRemainingMs(roundNumber: number, startedAtStr: string): number {
  const startedAt = new Date(startedAtStr).getTime();
  const duration = getRoundDurationMs(roundNumber);
  const deadline = startedAt + duration;
  
  // 🚀 [TESTING DEPLOYMENT BYPASS]: 采用纯 UTC 时间戳相减，100% 免疫任何时区差（如中美时差）导致的“瞬间归零”Bug！
  const remaining = deadline - Date.now();
  return Math.max(0, remaining);
  
  /* 原版纽约时间修正逻辑（在分钟级短测试下会因为时区差导致直接归零）：
  const currentNYTime = getNewYorkTime().getTime();
  const rawCurrentLocalTime = new Date().getTime();
  const diffOffset = currentNYTime - rawCurrentLocalTime; 
  const adjustedNow = Date.now() + diffOffset;
  const remaining = deadline - adjustedNow;
  return Math.max(0, remaining);
  */
}

// 5. 格式化毫秒数为天、时、分、秒字符串 (用于 UI 渲染)
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

// 6. 极速格式化为 HH:MM:SS 格式 (用于集结倒计时)
export function formatToHMS(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
