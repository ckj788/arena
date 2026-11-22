"use client";

import { useRef, type ReactNode } from "react";
import useHomeMotion from "@/app/components/useHomeMotion";

export default function PlanPickerMain({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useHomeMotion(true, ref, "submit");
  return <main ref={ref} className="launch-plans-main relative z-10 mx-auto max-w-[1200px] px-5 pb-16 pt-12 sm:pt-16">{children}</main>;
}
