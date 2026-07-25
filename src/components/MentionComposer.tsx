import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { MentionEntry } from "../stores/spaces";
import { cn } from "../lib/util";
import { IconFileText, IconFolder, IconSparkle } from "./icons";

/**
 * A plain textarea/input that recognizes two Slack/Linear-style triggers:
 * `/skill-name` tags a skill, `@`path`` (picked from the space's real file
 * tree) references a file or folder. Both are just text tokens — parsing
 * them back out at submit time is `parseMentions` in lib/claudeTasks.
 */

interface Trigger {
  type: "skill" | "file";
  /** Index of the trigger character (`/` or `@`) in the current value. */
  start: number;
  query: string;
}

function detectTrigger(text: string, caret: number): Trigger | null {
  const upToCaret = text.slice(0, caret);
  const m = upToCaret.match(/(^|\s)([/@])(\S*)$/);
  if (!m) return null;
  const query = m[3];
  return {
    type: m[2] === "/" ? "skill" : "file",
    start: caret - query.length - 1,
    query,
  };
}

export function MentionComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  multiline = false,
  rows = 3,
  autoFocus,
  skillSuggestions = [],
  fileEntries = [],
  className,
  inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  autoFocus?: boolean;
  skillSuggestions?: string[];
  fileEntries?: MentionEntry[];
  className?: string;
  inputClassName?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // A parent resetting `value` from the outside (e.g. clearing the draft after
  // submit) doesn't go through applyChange/pick, so it can't be trusted to
  // leave `trigger` in a sane state — drop it whenever that happens.
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setTrigger(null);
    }
  }, [value]);

  const items: { key: string; label: string; sub?: string; isDir?: boolean }[] =
    trigger?.type === "skill"
      ? skillSuggestions
          .filter((s) => s.toLowerCase().includes(trigger.query.toLowerCase()))
          .slice(0, 8)
          .map((s) => ({ key: s, label: s }))
      : trigger?.type === "file"
        ? fileEntries
            .filter((f) => f.rel.toLowerCase().includes(trigger.query.toLowerCase()))
            .slice(0, 8)
            .map((f) => ({ key: f.path, label: f.rel, isDir: f.isDir }))
        : [];

  const applyChange = (nextValue: string, caret: number) => {
    lastEmitted.current = nextValue;
    onChange(nextValue);
    const next = detectTrigger(nextValue, caret);
    setTrigger(next);
    setActiveIndex(0);
  };

  const pick = (item: { key: string; label: string; isDir?: boolean }) => {
    if (!trigger) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? trigger.start + trigger.query.length + 1;
    const insert = trigger.type === "skill" ? `/${item.label} ` : `@\`${item.label}\` `;
    const next = value.slice(0, trigger.start) + insert + value.slice(caret);
    lastEmitted.current = next;
    onChange(next);
    setTrigger(null);
    requestAnimationFrame(() => {
      const pos = trigger.start + insert.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (trigger && items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(items[activeIndex]);
        return;
      }
    }
    if (e.key === "Escape" && trigger) {
      e.preventDefault();
      e.stopPropagation();
      setTrigger(null);
      return;
    }
    if (!multiline && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const shared = {
    value,
    placeholder,
    autoFocus,
    onKeyDown,
    onBlur: () => setTrigger(null),
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) =>
      applyChange(e.target.value, e.target.selectionStart ?? e.target.value.length),
  };

  return (
    <div className={cn("relative", className)}>
      {multiline ? (
        <textarea
          {...shared}
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          rows={rows}
          className={cn(
            "w-full resize-y rounded-lg border border-bord bg-card px-3 py-2 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink3 focus:border-accent/60 focus:ring-2 focus:ring-accent/20",
            inputClassName,
          )}
        />
      ) : (
        <input
          {...shared}
          ref={ref as React.RefObject<HTMLInputElement>}
          className={cn(
            "h-[34px] w-full rounded-lg border border-bord bg-card px-3 text-[13px] text-ink outline-none placeholder:text-ink3 focus:border-accent/60 focus:ring-2 focus:ring-accent/20",
            inputClassName,
          )}
        />
      )}

      {trigger && items.length > 0 && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-[180px] w-full min-w-[220px] overflow-y-auto rounded-lg border border-bord bg-pop py-1 shadow-pop anim-pop">
          {items.map((item, i) => (
            <button
              key={item.key}
              // Selecting via mousedown beats the input's onBlur, which would
              // otherwise close the dropdown before the click registers.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(item);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] transition-colors",
                i === activeIndex ? "bg-accent text-white" : "text-ink hover:bg-ink/5",
              )}
            >
              {trigger.type === "skill" ? (
                <IconSparkle size={12} className="shrink-0 opacity-70" />
              ) : item.isDir ? (
                <IconFolder size={12} className="shrink-0 opacity-70" />
              ) : (
                <IconFileText size={12} className="shrink-0 opacity-70" />
              )}
              <span className="truncate">{trigger.type === "skill" ? `/${item.label}` : item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
