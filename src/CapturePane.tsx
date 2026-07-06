import { useEffect, useRef, useState } from "react";
import { isTauri } from "./db/driver";
import { useData } from "./stores/data";
import { useSettings } from "./stores/settings";
import { IconPlus } from "./components/icons";

/**
 * Standalone Spotlight-style capture bar rendered in its own frameless,
 * always-on-top Tauri window (`#capture` route). Type → Enter → saved to Inbox.
 */
export function CapturePane() {
  const [value, setValue] = useState("");
  const [flash, setFlash] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const skipBlurSave = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void useData
      .getState()
      .loadAll()
      .then((settingsJson) => {
        // Theme + accent so the floating bar matches the app.
        useSettings.getState().init(settingsJson);
        setReady(true);
      })
      .catch((e) => console.error("capture load failed", e));
  }, []);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen("capture:show", () => {
        setValue("");
        // Pick up anything the main window changed while we were hidden.
        void useData.getState().refresh();
        setTimeout(() => ref.current?.focus(), 30);
      });
    })();
    const onBlur = async () => {
      // Losing focus saves whatever was typed (never discard), then hides.
      // Esc and Enter set skipBlurSave — they already handled the text.
      if (!skipBlurSave.current) {
        const title = ref.current?.value.trim();
        if (title && useData.getState().loaded) {
          useData.getState().addTask({ title });
          setValue("");
          const { emit } = await import("@tauri-apps/api/event");
          void emit("flow:data-changed", { source: "capture" });
        }
      }
      skipBlurSave.current = false;
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      void getCurrentWindow().hide();
    };
    window.addEventListener("blur", onBlur);
    return () => {
      unlisten?.();
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const hide = async () => {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().hide();
  };

  const submit = async () => {
    const title = value.trim();
    if (!title || !ready) return;
    skipBlurSave.current = true; // the hide below fires a blur — don't save twice
    useData.getState().addTask({ title });
    setValue("");
    setFlash(true);
    setTimeout(() => setFlash(false), 350);
    if (isTauri) {
      const { emit } = await import("@tauri-apps/api/event");
      void emit("flow:data-changed", { source: "capture" });
    }
    void hide();
  };

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent p-2">
      <div
        className={`flex h-[56px] w-full items-center gap-3 rounded-2xl border bg-pop/95 px-4 shadow-pop backdrop-blur-xl transition-colors duration-200 ${
          flash ? "border-accent" : "border-bord"
        }`}
      >
        <IconPlus size={18} className="shrink-0 text-accent" />
        <input
          ref={ref}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") {
              skipBlurSave.current = true; // Esc = explicit cancel, don't save
              void hide();
            }
          }}
          placeholder="What's on your mind?"
          className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink3"
        />
        <span className="shrink-0 text-[11px] text-ink3">↩ saves to Inbox</span>
      </div>
    </div>
  );
}
