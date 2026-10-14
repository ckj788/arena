"use client";

import { useEffect, useState } from "react";
import { formatToHMS, getMillisecondsToNextDailyArenaRun } from "@/lib/timeHelpers";

export default function DailyArenaRunCountdown() {
  // The first render is stable: a ticking server timestamp would change every
  // ISR output even when no match or product changed.
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const now = new Date();
    // Hobby cron may run at any point in the scheduled hour.
    const target = now.getUTCHours() === 6
      ? new Date(now.setUTCMinutes(0, 0, 0)).getTime()
      : now.getTime() + getMillisecondsToNextDailyArenaRun(now);
    const update = () => setRemaining(Math.max(0, target - Date.now()));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return <span title="Scheduled daily from 06:00 UTC. Actual start depends on the scheduler.">{remaining === null ? "Daily at 06:00 UTC" : remaining > 0 ? `in ~${formatToHMS(remaining)}` : "Awaiting scheduled start"}</span>;
}
