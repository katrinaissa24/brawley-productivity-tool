import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/util";
import { IconX } from "../icons";

/* ---------------------------------- Button --------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: "xs" | "sm" | "md";
    icon?: ReactNode;
  }
>(function Button({ variant = "secondary", size = "sm", icon, className, children, ...props }, ref) {
  const sizes = {
    xs: "h-6 px-2 text-xs gap-1 rounded-md",
    sm: "h-[30px] px-3 text-[13px] gap-1.5 rounded-lg",
    md: "h-9 px-4 text-sm gap-2 rounded-lg",
  };
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-accent text-white hover:brightness-110 active:brightness-95 shadow-card font-medium",
    secondary:
      "bg-card border border-bord hover:bg-panel hover:border-bord2 text-ink font-medium",
    ghost: "text-ink2 hover:bg-ink/5 hover:text-ink",
    danger:
      "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 font-medium",
  };
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center transition-colors duration-150 disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});

/* ---------------------------------- Inputs --------------------------------- */

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          "h-[30px] w-full rounded-lg border border-bord bg-card px-2.5 text-[13px] text-ink placeholder:text-ink3",
          "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-shadow",
          className,
        )}
        {...props}
      />
    );
  },
);

export const TextArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-lg border border-bord bg-card px-2.5 py-2 text-[13px] text-ink placeholder:text-ink3 resize-none",
        "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20 transition-shadow",
        className,
      )}
      {...props}
    />
  );
});

export function Select({
  value,
  onChange,
  options,
  className,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-[30px] rounded-lg border border-bord bg-card px-2 text-[13px] text-ink",
        "focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20",
        className,
      )}
    >
      {placeholder != null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------------------------- Toggle ---------------------------------- */

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-[20px] w-[34px] rounded-full transition-colors duration-150 shrink-0",
        checked ? "bg-accent" : "bg-bord2",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-4 w-4 rounded-full bg-white shadow transition-transform duration-150",
          checked ? "translate-x-[16px]" : "translate-x-[2px]",
        )}
        style={{ left: 0 }}
      />
    </button>
  );
}

/* --------------------------------- Segmented -------------------------------- */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; title?: string }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-lg bg-panel border border-bord p-0.5 gap-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-6 px-2.5 rounded-md text-xs font-medium transition-colors duration-150",
            value === o.value
              ? "bg-card text-ink shadow-card border border-bord"
              : "text-ink3 hover:text-ink2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------- Kbd ------------------------------------ */

export function Kbd({ combo }: { combo: string }) {
  const parts = combo
    .split("+")
    .map((p) => p.trim())
    .map((p) => {
      switch (p.toLowerCase()) {
        case "mod":
        case "cmd":
        case "meta":
          return "⌘";
        case "shift":
          return "⇧";
        case "alt":
        case "option":
          return "⌥";
        case "ctrl":
          return "⌃";
        case "enter":
          return "↩";
        case "space":
          return "␣";
        case "escape":
        case "esc":
          return "⎋";
        case ",":
          return ",";
        default:
          return p.length === 1 ? p.toUpperCase() : p;
      }
    });
  return (
    <span className="inline-flex gap-0.5">
      {parts.map((p, i) => (
        <kbd
          key={i}
          className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded border border-bord bg-panel text-[10.5px] text-ink3 font-sans"
        >
          {p}
        </kbd>
      ))}
    </span>
  );
}

/* ---------------------------------- Modal ----------------------------------- */

export function Modal({
  open,
  onClose,
  children,
  width = 480,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  closeOnBackdrop?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 dark:bg-black/50 anim-fade"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="mt-[12vh] max-h-[76vh] overflow-y-auto rounded-xl border border-bord bg-pop shadow-pop anim-scale"
        style={{ width, maxWidth: "calc(100vw - 48px)" }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function ModalHeader({
  title,
  onClose,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start justify-between px-4 pt-4 pb-1">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-ink3">{subtitle}</p>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="p-1 -m-1 rounded-md text-ink3 hover:text-ink hover:bg-ink/5 transition-colors"
        >
          <IconX size={15} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Floating menu ------------------------------- */

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  checked?: boolean;
  onSelect?: () => void;
  submenu?: MenuItem[];
  divider?: boolean;
}

export function FloatingMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [sub, setSub] = useState<{ items: MenuItem[]; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const renderItems = (list: MenuItem[], isSub = false) => (
    <div
      className="min-w-[190px] rounded-lg border border-bord bg-pop shadow-pop py-1 anim-pop"
      style={isSub ? undefined : {}}
    >
      {list.map((item, i) =>
        item.divider ? (
          <div key={i} className="my-1 h-px bg-bord" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            className={cn(
              "flex w-full items-center gap-2 px-2.5 py-1.5 text-[13px] transition-colors text-left",
              item.danger ? "text-red-600 dark:text-red-400" : "text-ink",
              "hover:bg-accent hover:text-white disabled:opacity-40",
            )}
            onMouseEnter={(e) => {
              if (item.submenu) {
                const r = (e.target as HTMLElement).getBoundingClientRect();
                setSub({ items: item.submenu, x: r.right - 2, y: r.top - 5 });
              } else if (!isSub) {
                setSub(null);
              }
            }}
            onClick={() => {
              if (item.submenu) return;
              item.onSelect?.();
              onClose();
            }}
          >
            {item.icon && <span className="opacity-70 shrink-0">{item.icon}</span>}
            <span className="flex-1 truncate">{item.label}</span>
            {item.checked && <span className="text-xs">✓</span>}
            {item.submenu && <span className="text-ink3 text-xs">›</span>}
          </button>
        ),
      )}
    </div>
  );

  return createPortal(
    <div ref={ref} className="fixed z-[70]" style={{ left: pos.x, top: pos.y }}>
      {renderItems(items)}
      {sub && (
        <div
          className="fixed z-[71]"
          style={{
            left: Math.min(sub.x, window.innerWidth - 200),
            top: Math.min(sub.y, window.innerHeight - sub.items.length * 30 - 16),
          }}
        >
          {renderItems(sub.items, true)}
        </div>
      )}
    </div>,
    document.body,
  );
}

/* --------------------------------- Progress --------------------------------- */

export function ProgressRing({
  pct,
  size = 40,
  stroke = 4,
  color,
  showLabel = true,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  showLabel?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--c-border))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color ?? "rgb(var(--c-accent))"}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      {showLabel && (
        <span
          className="absolute font-semibold text-ink tabular-nums"
          style={{ fontSize: Math.max(9, size / 4.2) }}
        >
          {Math.round(clamped)}
        </span>
      )}
    </div>
  );
}

export function ProgressBar({ pct, color, className }: { pct: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-bord/60 overflow-hidden", className)}>
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color ?? "rgb(var(--c-accent))" }}
      />
    </div>
  );
}

/* --------------------------------- EmptyState -------------------------------- */

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center anim-fade">
      {icon && <div className="mb-3 text-ink3/70">{icon}</div>}
      <p className="text-[15px] font-medium text-ink2">{title}</p>
      {hint && <p className="mt-1.5 text-[13px] text-ink3 max-w-[340px] leading-relaxed">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------ Section heading ------------------------------ */

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("text-[11px] font-semibold uppercase tracking-wider text-ink3", className)}>
      {children}
    </div>
  );
}
