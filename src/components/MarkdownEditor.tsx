import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { cn } from "../lib/util";
import { Segmented } from "./ui/primitives";
import {
  IconBold,
  IconCode,
  IconItalic,
  IconLink,
  IconList,
  IconQuote,
  IconTodo,
} from "./icons";

type Mode = "edit" | "split" | "preview";

/* ------------------------------ text transforms ----------------------------- */

interface Sel {
  text: string;
  start: number;
  end: number;
}

function selectionOf(el: HTMLTextAreaElement): Sel {
  return {
    text: el.value.slice(el.selectionStart, el.selectionEnd),
    start: el.selectionStart,
    end: el.selectionEnd,
  };
}

/** Wrap (or unwrap) the selection with a marker like ** or _. */
function wrapSelection(value: string, sel: Sel, marker: string): { text: string; start: number; end: number } {
  const before = value.slice(0, sel.start);
  const after = value.slice(sel.end);
  const already = before.endsWith(marker) && after.startsWith(marker);
  if (already) {
    return {
      text: before.slice(0, -marker.length) + sel.text + after.slice(marker.length),
      start: sel.start - marker.length,
      end: sel.end - marker.length,
    };
  }
  return {
    text: `${before}${marker}${sel.text}${marker}${after}`,
    start: sel.start + marker.length,
    end: sel.end + marker.length,
  };
}

/** Toggle a line-level prefix (#, -, >, 1.) across every selected line. */
function prefixLines(value: string, sel: Sel, prefix: string) {
  const lineStart = value.lastIndexOf("\n", sel.start - 1) + 1;
  const lineEndRaw = value.indexOf("\n", sel.end);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  // Heading levels swap rather than stack; everything else toggles off.
  const isHeading = /^#+ $/.test(prefix);
  const strip = (l: string) => (isHeading ? l.replace(/^#{1,6}\s+/, "") : l);
  const allHave = lines.every((l) => l.startsWith(prefix));
  const next = lines
    .map((l) => (allHave ? l.slice(prefix.length) : prefix + strip(l)))
    .join("\n");
  return {
    text: value.slice(0, lineStart) + next + value.slice(lineEnd),
    start: lineStart,
    end: lineStart + next.length,
  };
}

/** Enter inside a list continues it; Enter on an empty item ends it. */
function continueList(value: string, caret: number): { text: string; caret: number } | null {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const line = value.slice(lineStart, caret);
  const m = line.match(/^(\s*)([-*]\s\[[ xX]\]\s|[-*]\s|\d+\.\s)(.*)$/);
  if (!m) return null;
  const [, indent, bullet, rest] = m;
  if (!rest.trim()) {
    // Empty item — clear it instead of adding another.
    return { text: value.slice(0, lineStart) + value.slice(caret), caret: lineStart };
  }
  const next = /^\d+\.\s$/.test(bullet)
    ? `${parseInt(bullet, 10) + 1}. `
    : bullet.replace(/\[[xX]\]/, "[ ]");
  const insert = `\n${indent}${next}`;
  return {
    text: value.slice(0, caret) + insert + value.slice(caret),
    caret: caret + insert.length,
  };
}

/* --------------------------------- editor ---------------------------------- */

export function MarkdownEditor({
  value,
  onChange,
  onSave,
  readOnly,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>(() => {
    const saved = localStorage.getItem("brawley:spaces-mode");
    return saved === "edit" || saved === "split" || saved === "preview" ? saved : "edit";
  });

  useEffect(() => {
    localStorage.setItem("brawley:spaces-mode", mode);
  }, [mode]);

  const html = useMemo(
    () => marked.parse(value || "*Empty file.*", { breaks: true, gfm: true }) as string,
    [value],
  );

  /** Apply a transform to the live selection and restore the caret after. */
  const apply = (fn: (v: string, s: Sel) => { text: string; start: number; end: number }) => {
    const el = ref.current;
    if (!el || readOnly) return;
    const next = fn(el.value, selectionOf(el));
    onChange(next.text);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "b") {
      e.preventDefault();
      return apply((v, s) => wrapSelection(v, s, "**"));
    }
    if (mod && e.key.toLowerCase() === "i") {
      e.preventDefault();
      return apply((v, s) => wrapSelection(v, s, "_"));
    }
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave?.();
      return;
    }
    if (mod && e.key.toLowerCase() === "e") {
      e.preventDefault();
      setMode(mode === "preview" ? "edit" : "preview");
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const s = selectionOf(el);
      if (s.text.includes("\n")) {
        return apply((v, sel) => prefixLines(v, sel, "  "));
      }
      const next = `${el.value.slice(0, s.start)}  ${el.value.slice(s.end)}`;
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(s.start + 2, s.start + 2));
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !mod) {
      const el = e.currentTarget;
      const cont = continueList(el.value, el.selectionStart);
      if (cont) {
        e.preventDefault();
        onChange(cont.text);
        requestAnimationFrame(() => el.setSelectionRange(cont.caret, cont.caret));
      }
    }
  };

  const ToolButton = ({
    title,
    onClick,
    children,
  }: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <button
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={readOnly}
      className="flex h-[26px] min-w-[26px] items-center justify-center rounded-md px-1.5 text-[12px] font-medium text-ink2 transition-colors hover:bg-ink/5 hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {/* toolbar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-bord px-3 py-1.5">
        {([1, 2, 3] as const).map((lvl) => (
          <ToolButton
            key={lvl}
            title={`Heading ${lvl}`}
            onClick={() => apply((v, s) => prefixLines(v, s, `${"#".repeat(lvl)} `))}
          >
            H{lvl}
          </ToolButton>
        ))}
        <span className="mx-1 h-4 w-px bg-bord" />
        <ToolButton title="Bold (⌘B)" onClick={() => apply((v, s) => wrapSelection(v, s, "**"))}>
          <IconBold size={13} />
        </ToolButton>
        <ToolButton title="Italic (⌘I)" onClick={() => apply((v, s) => wrapSelection(v, s, "_"))}>
          <IconItalic size={13} />
        </ToolButton>
        <ToolButton title="Inline code" onClick={() => apply((v, s) => wrapSelection(v, s, "`"))}>
          <IconCode size={13} />
        </ToolButton>
        <ToolButton
          title="Link"
          onClick={() =>
            apply((v, s) => ({
              text: `${v.slice(0, s.start)}[${s.text || "text"}](url)${v.slice(s.end)}`,
              start: s.start + (s.text ? s.text.length + 3 : 1),
              end: s.start + (s.text ? s.text.length + 6 : 5),
            }))
          }
        >
          <IconLink size={13} />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-bord" />
        <ToolButton title="Bullet list" onClick={() => apply((v, s) => prefixLines(v, s, "- "))}>
          <IconList size={13} />
        </ToolButton>
        <ToolButton title="Checklist" onClick={() => apply((v, s) => prefixLines(v, s, "- [ ] "))}>
          <IconTodo size={13} />
        </ToolButton>
        <ToolButton title="Quote" onClick={() => apply((v, s) => prefixLines(v, s, "> "))}>
          <IconQuote size={13} />
        </ToolButton>

        <div className="ml-auto">
          <Segmented
            value={mode}
            onChange={(m) => setMode(m)}
            options={[
              { value: "edit", label: "Edit" },
              { value: "split", label: "Split" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </div>
      </div>

      {/* panes */}
      <div className="flex min-h-0 flex-1">
        {mode !== "preview" && (
          <textarea
            ref={ref}
            value={value}
            readOnly={readOnly}
            spellCheck
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Start writing… markdown works — # heading, **bold**, _italic_, - list"
            className={cn(
              "selectable min-h-0 flex-1 resize-none bg-transparent px-8 py-6 text-[14.5px] leading-[1.75] text-ink outline-none placeholder:text-ink3",
              mode === "split" && "border-r border-bord",
            )}
          />
        )}
        {mode !== "edit" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            <div className="md-doc mx-auto max-w-[720px]" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        )}
      </div>
    </div>
  );
}
