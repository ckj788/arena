"use client";

import { useEffect, useState } from "react";
import { formatToHMS, getMillisecondsToNextDailyArenaRun } from "@/lib/timeHelpers";

export default function DailyArenaRunCountdown() {
  const [remaining, setRemaining] = useState(() => getMillisecondsToNextDailyArenaRun());

  useEffect(() => {
    const update = () => setRemaining(getMillisecondsToNextDailyArenaRun());
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return <span suppressHydrationWarning>{formatToHMS(remaining)}</span>;
}
