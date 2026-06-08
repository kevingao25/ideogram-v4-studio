import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-black/8 bg-white/75 shadow-[0_18px_60px_rgba(38,32,20,0.08)] backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}
