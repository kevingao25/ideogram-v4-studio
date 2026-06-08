import * as React from "react";

import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-xl border border-black/10 bg-white/80 p-3 text-sm outline-none transition placeholder:text-black/35 focus:border-[#ff6b35]/60 focus:ring-2 focus:ring-[#ff6b35]/12",
        className,
      )}
      {...props}
    />
  );
}
