import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-blue-100/70", className)} {...props} />;
}

export { Skeleton };
