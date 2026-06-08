import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-black/10 bg-white/80 px-3 text-sm outline-none transition placeholder:text-black/35 focus:border-[#ff6b35]/60 focus:ring-2 focus:ring-[#ff6b35]/12",
        className,
      )}
      {...props}
    />
  );
}
