"use client";

import { useEffect, useState } from "react";
import { formatToHMS, getMillisecondsToNextDailyArenaRun } from "@/lib/timeHelpers";

export default function DailyArenaRunCountdown() {
  const [target] = useState(() => {
    const now = new Date();
    // Hobby cron may run at any point in the scheduled hour.
    if (now.getUTCHours() === 6) { now.setUTCMinutes(0, 0, 0); return now.getTime(); }
    return now.getTime() + getMillisecondsToNextDailyArenaRun(now);
  });
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    const update = () => setRemaining(Math.max(0, target - Date.now()));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [target]);

  return <span suppressHydrationWarning title="Scheduled daily from 06:00 UTC. Actual start depends on the scheduler.">{remaining > 0 ? `in ~${formatToHMS(remaining)}` : "Awaiting scheduled start"}</span>;
}
