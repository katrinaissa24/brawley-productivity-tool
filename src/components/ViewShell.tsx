import type { ReactNode } from "react";
import { cn } from "../lib/util";

export function ViewShell({
  title,
  meta,
  actions,
  children,
  contentClassName,
  padContent = true,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
  padContent?: boolean;
}) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <header
        data-tauri-drag-region
        className="flex shrink-0 items-end justify-between gap-4 px-8 pb-3.5 pt-9"
      >
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h1>
          {meta && <div className="mt-0.5 text-[12.5px] text-ink3">{meta}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </header>
      <div
        className={cn(
          "flex-1 overflow-y-auto",
          padContent && "px-8 pb-12",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
