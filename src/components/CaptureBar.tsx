import { useEffect, useRef, useState } from "react";
import { useData } from "../stores/data";
import { useUI } from "../stores/ui";
import { IconPlus } from "./icons";
import { Kbd } from "./ui/primitives";

export function CaptureBar() {
  const addTask = useData((s) => s.addTask);
  const tick = useUI((s) => s.captureFocusTick);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [tick]);

  const submit = () => {
    const title = value.trim();
    if (!title) return;
    addTask({ title });
    setValue("");
    ref.current?.focus();
  };

  return (
    <div className="flex h-11 items-center gap-2.5 rounded-xl border border-bord bg-card px-3.5 shadow-card focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/15 transition-shadow">
      <IconPlus size={15} className="shrink-0 text-accent" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") (e.target as HTMLInputElement).blur();
        }}
        placeholder="Dump a thought — Enter saves it"
        className="h-full flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink3 outline-none"
      />
      <Kbd combo="mod+n" />
    </div>
  );
}
