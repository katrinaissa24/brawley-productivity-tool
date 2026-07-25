import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { useSettings } from "../stores/settings";
import { useUI } from "../stores/ui";
import { assignToClaude, spacesList, useSpaces } from "../stores/spaces";
import { baseName, isMarkdown, isTextFile, relPath, spaceFs, type FsEntry } from "../lib/fs";
import {
  CLAUDE_STATUSES,
  parseMentions,
  STATUS_LABEL,
  STATUS_STYLE,
  type ClaudeStatus,
  type ClaudeTask,
} from "../lib/claudeTasks";
import { cn } from "../lib/util";
import { ViewShell } from "../components/ViewShell";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MentionComposer } from "../components/MentionComposer";
import {
  Button,
  EmptyState,
  FloatingMenu,
  SectionLabel,
  Select,
  type MenuItem,
} from "../components/ui/primitives";
import {
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconFolderPlus,
  IconLayers,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconSparkle,
  IconTrash,
} from "../components/icons";

/* --------------------------------- helpers -------------------------------- */

/** Inline name field used for both "new file" and "rename". */
function NameInput({
  initial,
  placeholder,
  onCommit,
  onCancel,
}: {
  initial?: string;
  placeholder?: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    // Select the stem, not the extension — same as Finder.
    const dot = (initial ?? "").lastIndexOf(".");
    ref.current?.setSelectionRange(0, dot > 0 ? dot : (initial ?? "").length);
  }, [initial]);
  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => (value.trim() ? onCommit(value.trim()) : onCancel())}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          if (value.trim()) onCommit(value.trim());
          else onCancel();
        }
        if (e.key === "Escape") onCancel();
      }}
      className="h-[24px] w-full rounded-md border border-accent/60 bg-card px-1.5 text-[12.5px] text-ink outline-none ring-2 ring-accent/20"
    />
  );
}

/* ---------------------------------- tree ---------------------------------- */

function TreeRow({ entry, depth }: { entry: FsEntry; depth: number }) {
  const expanded = useSpaces((s) => s.expanded[entry.path] ?? false);
  const children = useSpaces((s) => s.dirs[entry.path]);
  const docPath = useSpaces((s) => s.doc?.path);
  const panel = useSpaces((s) => s.panel);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [creating, setCreating] = useState<null | { isDir: boolean }>(null);
  const ask = useUI((s) => s.ask);

  const st = useSpaces.getState();
  const active = panel === "files" && docPath === entry.path;

  const menuItems = (): MenuItem[] => {
    const items: MenuItem[] = [];
    if (entry.isDir) {
      items.push(
        {
          label: "New markdown file",
          onSelect: () => {
            if (!expanded) st.toggleDir(entry.path);
            setCreating({ isDir: false });
          },
        },
        {
          label: "New folder",
          onSelect: () => {
            if (!expanded) st.toggleDir(entry.path);
            setCreating({ isDir: true });
          },
        },
        { divider: true, label: "" },
      );
    }
    if (!entry.isDir && isMarkdown(entry.path)) {
      items.push({
        label: "Use as Claude hand-off file",
        onSelect: () => {
          const spaceId = useSpaces.getState().activeSpaceId;
          useSettings.getState().patch({
            spaces: spacesList().map((s) =>
              s.id === spaceId ? { ...s, claudeFile: entry.path } : s,
            ),
            claudeSpaceId: spaceId,
          });
          void useSpaces.getState().loadClaude(true);
          useUI.getState().toast(`Claude tasks now live in ${entry.name}`, "success");
        },
      });
    }
    items.push({ label: "Rename", onSelect: () => setRenaming(true) });
    if (spaceFs.kind === "native") {
      items.push({ label: "Reveal in Finder", onSelect: () => void spaceFs.reveal(entry.path) });
    }
    items.push({
      label: "Delete",
      danger: true,
      onSelect: () =>
        ask({
          title: entry.isDir ? "Delete folder?" : "Delete file?",
          message: `"${entry.name}" will be removed from disk${entry.isDir ? ", along with everything inside it" : ""}. This can't be undone from Brawley.`,
          confirmLabel: "Delete",
          danger: true,
          onConfirm: () => void st.deleteEntry(entry.path),
        }),
    });
    return items;
  };

  return (
    <>
      <div
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        className={cn(
          "group flex h-[26px] items-center gap-1 rounded-md pr-1 text-[12.5px] transition-colors",
          active ? "bg-accent/10 text-ink font-medium" : "text-ink2 hover:bg-ink/5",
        )}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {entry.isDir ? (
          <button onClick={() => st.toggleDir(entry.path)} className="shrink-0 p-0.5 text-ink3">
            <IconChevronRight
              size={11}
              className={cn("transition-transform duration-150", expanded && "rotate-90")}
            />
          </button>
        ) : (
          <span className="w-[16px] shrink-0" />
        )}
        <span className={cn("shrink-0", active ? "text-accent" : "text-ink3")}>
          {entry.isDir ? <IconFolder size={13} /> : <IconFileText size={13} />}
        </span>
        {renaming ? (
          <NameInput
            initial={entry.name}
            onCommit={(name) => {
              setRenaming(false);
              void st.renameEntry(entry.path, name);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            onClick={() => (entry.isDir ? st.toggleDir(entry.path) : void st.openFile(entry.path))}
            onDoubleClick={() => !entry.isDir && void st.openFile(entry.path)}
            className="min-w-0 flex-1 truncate py-1 text-left"
          >
            {entry.name}
          </button>
        )}
      </div>

      {entry.isDir && expanded && (
        <div>
          {creating && (
            <div style={{ paddingLeft: 24 + depth * 12 }} className="py-0.5 pr-1">
              <NameInput
                placeholder={creating.isDir ? "Folder name" : "note.md"}
                onCommit={(name) => {
                  const isDir = creating.isDir;
                  setCreating(null);
                  void st.createEntry(entry.path, name, isDir);
                }}
                onCancel={() => setCreating(null)}
              />
            </div>
          )}
          {(children ?? []).map((child) => (
            <TreeRow key={child.path} entry={child} depth={depth + 1} />
          ))}
          {children && children.length === 0 && !creating && (
            <p
              className="py-1 text-[11.5px] italic text-ink3"
              style={{ paddingLeft: 24 + depth * 12 }}
            >
              Empty
            </p>
          )}
        </div>
      )}

      {menu && <FloatingMenu x={menu.x} y={menu.y} items={menuItems()} onClose={() => setMenu(null)} />}
    </>
  );
}

/* ------------------------------- Claude panel ------------------------------ */

function ClaudeTaskCard({ task }: { task: ClaudeTask }) {
  const [open, setOpen] = useState(false);
  const setClaudeStatus = useSpaces((s) => s.setClaudeStatus);
  const removeClaudeTask = useSpaces((s) => s.removeClaudeTask);
  const ask = useUI((s) => s.ask);

  return (
    <div className="rounded-xl border border-bord bg-card shadow-card">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <button onClick={() => setOpen(!open)} className="block w-full text-left">
            <span className="text-[13.5px] font-medium text-ink">{task.title}</span>
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-ink3">
            <span
              className={cn(
                "rounded-md border px-1.5 py-0.5 font-medium",
                STATUS_STYLE[task.status],
              )}
            >
              {STATUS_LABEL[task.status]}
            </span>
            {task.priority && <span>{task.priority}</span>}
            {task.due && <span>due {task.due}</span>}
            {task.assignedAt && <span>assigned {task.assignedAt}</span>}
          </div>
          {(task.skill || task.files.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {task.skill && (
                <span className="inline-flex items-center gap-1 rounded-md bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                  <IconSparkle size={10} />/{task.skill}
                </span>
              )}
              {task.files.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 rounded-md bg-panel px-1.5 py-0.5 text-[11px] text-ink3"
                  title={f}
                >
                  {f.endsWith("/") ? <IconFolder size={10} /> : <IconFileText size={10} />}
                  <span className="max-w-[160px] truncate">{f}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          title="Remove from the hand-off file"
          onClick={() =>
            ask({
              title: "Remove this task?",
              message: `"${task.title}" will be deleted from the hand-off file. Claude won't see it any more.`,
              confirmLabel: "Remove",
              danger: true,
              onConfirm: () => void removeClaudeTask(task.key),
            })
          }
          className="shrink-0 rounded-md p-1 text-ink3 transition-colors hover:bg-red-500/10 hover:text-red-500"
        >
          <IconTrash size={13} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-bord px-3 py-2">
        {CLAUDE_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => void setClaudeStatus(task.key, s)}
            className={cn(
              "rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors",
              task.status === s
                ? "bg-accent/12 text-accent"
                : "text-ink3 hover:bg-ink/5 hover:text-ink2",
            )}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
        {(task.details || task.report) && (
          <button
            onClick={() => setOpen(!open)}
            className="ml-auto text-[11.5px] text-ink3 hover:text-ink2"
          >
            {open ? "Hide" : "Details"}
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-bord px-4 py-3 anim-fade">
          {task.details && (
            <>
              <SectionLabel className="mb-1.5">Details</SectionLabel>
              <div
                className="md-body mb-3"
                dangerouslySetInnerHTML={{ __html: marked.parse(task.details) as string }}
              />
            </>
          )}
          <SectionLabel className="mb-1.5">Claude's report</SectionLabel>
          <div
            className="md-body"
            dangerouslySetInnerHTML={{
              __html: marked.parse(task.report || "_Nothing reported yet._") as string,
            }}
          />
        </div>
      )}
    </div>
  );
}

function ClaudePanel() {
  const claude = useSpaces((s) => s.claude);
  const loading = useSpaces((s) => s.claudeLoading);
  const activeSpaceId = useSpaces((s) => s.activeSpaceId);
  const openFile = useSpaces((s) => s.openFile);
  const loadClaude = useSpaces((s) => s.loadClaude);
  const [draft, setDraft] = useState("");
  const space = spacesList().find((s) => s.id === activeSpaceId);
  const fileEntries = useSpaces((s) => (space ? s.fileIndex[space.path] : undefined)) ?? [];

  const skillSuggestions = useMemo(() => {
    const seen = new Set<string>();
    for (const t of claude?.tasks ?? []) if (t.skill) seen.add(t.skill);
    return [...seen];
  }, [claude]);

  if (loading && !claude) {
    return <p className="px-8 py-10 text-center text-[13px] text-ink3">Reading hand-off file…</p>;
  }
  if (!space || !claude) return null;

  const exists = claude.text.trim().length > 0;

  const add = async () => {
    const { text, skill, files } = parseMentions(draft);
    if (!text) return;
    setDraft("");
    await assignToClaude({ title: text, skill, files });
    await loadClaude(true);
  };

  const groups: { status: ClaudeStatus; label: string }[] = [
    { status: "waiting_review", label: "Waiting for your review" },
    { status: "in_progress", label: "Claude is working" },
    { status: "blocked", label: "Blocked" },
    { status: "assigned", label: "Assigned — not started" },
    { status: "done", label: "Done" },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
      <div className="mx-auto max-w-[720px]">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-accent/12 p-2.5 text-accent">
            <IconRobot size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">Tasks for Claude</p>
            <p className="truncate text-[12px] text-ink3">
              {relPath(space.path, claude.path)} · Claude reads and edits this file on your machine
            </p>
          </div>
          <Button size="xs" variant="ghost" onClick={() => void loadClaude(true)}>
            Reload
          </Button>
          {exists && (
            <Button size="xs" variant="secondary" onClick={() => void openFile(claude.path)}>
              Open as markdown
            </Button>
          )}
        </div>

        <div className="mt-5 flex items-start gap-2">
          <MentionComposer
            value={draft}
            onChange={setDraft}
            onSubmit={() => void add()}
            placeholder="Assign something to Claude… /skill to tag a skill, @ to mention a file"
            skillSuggestions={skillSuggestions}
            fileEntries={fileEntries}
            className="flex-1"
          />
          <Button variant="primary" icon={<IconPlus size={13} />} onClick={() => void add()}>
            Assign
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-ink3">
          Type <code className="rounded bg-panel px-1">/</code> to tag a skill for Claude to run, or{" "}
          <code className="rounded bg-panel px-1">@</code> to reference a file or folder it should work in.
        </p>

        {claude.tasks.length === 0 ? (
          <EmptyState
            icon={<IconRobot size={26} />}
            title="No tasks handed off yet"
            hint={`Assign one above, or from any task's detail panel. Everything lands in ${baseName(claude.path)} — point your scheduled Claude session at that file.`}
          />
        ) : (
          <div className="mt-6 flex flex-col gap-5">
            {groups.map(({ status, label }) => {
              const list = claude.tasks.filter((t) => t.status === status);
              if (list.length === 0) return null;
              return (
                <div key={status}>
                  <SectionLabel className="mb-2">
                    {label} · {list.length}
                  </SectionLabel>
                  <div className="flex flex-col gap-2">
                    {list.map((t) => (
                      <ClaudeTaskCard key={t.key} task={t} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- editor --------------------------------- */

function DocPane() {
  const doc = useSpaces((s) => s.doc);
  const saving = useSpaces((s) => s.saving);
  const setDocText = useSpaces((s) => s.setDocText);
  const saveNow = useSpaces((s) => s.saveNow);
  const renameEntry = useSpaces((s) => s.renameEntry);
  const activeSpaceId = useSpaces((s) => s.activeSpaceId);
  const [renaming, setRenaming] = useState(false);
  const space = spacesList().find((s) => s.id === activeSpaceId);

  if (!doc || !space) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <EmptyState
          icon={<IconFileText size={26} />}
          title="No file open"
          hint="Pick a markdown file on the left, or create one with the + button."
        />
      </div>
    );
  }

  const dirty = doc.text !== doc.saved;
  const editable = isTextFile(doc.path);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
        {renaming ? (
          <div className="w-[280px]">
            <NameInput
              initial={baseName(doc.path)}
              onCommit={(name) => {
                setRenaming(false);
                void renameEntry(doc.path, name);
              }}
              onCancel={() => setRenaming(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setRenaming(true)}
            title="Rename"
            className="min-w-0 truncate text-left text-[13.5px] font-medium text-ink hover:text-accent"
          >
            {relPath(space.path, doc.path)}
          </button>
        )}
        <span className="ml-auto shrink-0 text-[11.5px] text-ink3">
          {doc.loading
            ? "Opening…"
            : saving
              ? "Saving…"
              : dirty
                ? "Unsaved"
                : "Saved"}
        </span>
      </div>

      {doc.error ? (
        <div className="flex flex-1 items-center justify-center px-8">
          <EmptyState title="Couldn't open this file" hint={doc.error} />
        </div>
      ) : editable ? (
        <MarkdownEditor
          value={doc.text}
          onChange={setDocText}
          onSave={() => void saveNow()}
          readOnly={doc.loading}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-8">
          <EmptyState
            title="Not a text file"
            hint="Spaces edits markdown and plain text. Other files stay untouched on disk."
          />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- view ---------------------------------- */

export function SpacesView() {
  const settings = useSettings((s) => s.settings);
  const spaces = settings.spaces ?? [];
  const activeSpaceId = useSpaces((s) => s.activeSpaceId);
  const setActiveSpace = useSpaces((s) => s.setActiveSpace);
  const connectFolder = useSpaces((s) => s.connectFolder);
  const createDemoSpace = useSpaces((s) => s.createDemoSpace);
  const removeSpace = useSpaces((s) => s.removeSpace);
  const refresh = useSpaces((s) => s.refresh);
  const panel = useSpaces((s) => s.panel);
  const setPanel = useSpaces((s) => s.setPanel);
  const claude = useSpaces((s) => s.claude);
  const ask = useUI((s) => s.ask);

  const space = spaces.find((s) => s.id === activeSpaceId) ?? spaces[0] ?? null;
  const rootEntries = useSpaces((s) => (space ? s.dirs[space.path] : undefined));
  const [creating, setCreating] = useState<null | { isDir: boolean }>(null);

  // Adopt the first space on arrival, and load its root listing.
  useEffect(() => {
    if (space && activeSpaceId !== space.id) setActiveSpace(space.id);
    else if (space) void useSpaces.getState().loadDir(space.path);
  }, [space?.id, activeSpaceId]);

  // Claude (or any editor) may change these files behind our back.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const waiting = useMemo(
    () => claude?.tasks.filter((t) => t.status === "waiting_review").length ?? 0,
    [claude],
  );

  if (!space) {
    return (
      <ViewShell title="Spaces" meta="Your markdown files, live on disk">
        <EmptyState
          icon={<IconLayers size={28} />}
          title="No space connected yet"
          hint={
            spaceFs.kind === "native"
              ? "Connect a folder — an Obsidian vault, a notes directory, anything. Brawley reads and writes the real files, so Claude can work the same folder from your desktop."
              : "You're in the browser preview, which can't reach your disk. Create a demo space to explore the UI — the desktop app connects real folders."
          }
          action={
            spaceFs.kind === "native" ? (
              <Button variant="primary" icon={<IconFolder size={14} />} onClick={() => void connectFolder()}>
                Connect folder
              </Button>
            ) : (
              <Button variant="primary" icon={<IconLayers size={14} />} onClick={() => void createDemoSpace()}>
                Create demo space
              </Button>
            )
          }
        />
      </ViewShell>
    );
  }

  return (
    <ViewShell
      title="Spaces"
      meta={space.path}
      actions={
        <>
          {spaces.length > 1 && (
            <Select
              value={space.id}
              onChange={(id) => setActiveSpace(id)}
              options={spaces.map((s) => ({ value: s.id, label: s.name }))}
              className="max-w-[180px]"
            />
          )}
          <Button
            variant="ghost"
            icon={<IconRefresh size={13} />}
            title="Re-read files from disk"
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
          <Button
            variant="secondary"
            icon={<IconFolder size={13} />}
            onClick={() => (spaceFs.kind === "native" ? void connectFolder() : void createDemoSpace())}
          >
            {spaceFs.kind === "native" ? "Connect folder" : "Demo space"}
          </Button>
        </>
      }
      padContent={false}
      contentClassName="flex min-h-0"
    >
      {/* file tree */}
      <div className="flex w-[262px] shrink-0 flex-col border-r border-bord bg-panel/40">
        <div className="flex items-center gap-1 px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-ink3">
            {space.name}
          </span>
          <button
            title="New markdown file"
            onClick={() => setCreating({ isDir: false })}
            className="rounded p-0.5 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <IconPlus size={14} />
          </button>
          <button
            title="New folder"
            onClick={() => setCreating({ isDir: true })}
            className="rounded p-0.5 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <IconFolderPlus size={14} />
          </button>
          <button
            title="Disconnect this space"
            onClick={() =>
              ask({
                title: "Disconnect space?",
                message: `"${space.name}" is removed from Brawley. The folder and its files stay exactly where they are on disk.`,
                confirmLabel: "Disconnect",
                onConfirm: () => removeSpace(space.id),
              })
            }
            className="rounded p-0.5 text-ink3 transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <IconTrash size={13} />
          </button>
        </div>

        <button
          onClick={() => setPanel("claude")}
          className={cn(
            "mx-2 mb-1 flex h-[30px] items-center gap-2 rounded-lg px-2 text-[12.5px] transition-colors",
            panel === "claude"
              ? "bg-accent/10 font-medium text-accent"
              : "text-ink2 hover:bg-ink/5 hover:text-ink",
          )}
        >
          <IconRobot size={14} className={panel === "claude" ? "text-accent" : "text-ink3"} />
          <span className="flex-1 text-left">Claude tasks</span>
          {waiting > 0 && (
            <span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-orange-500/15 px-1 text-[10.5px] font-semibold text-orange-600 dark:text-orange-400">
              {waiting}
            </span>
          )}
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {creating && (
            <div className="px-1 py-1">
              <NameInput
                placeholder={creating.isDir ? "Folder name" : "note.md"}
                onCommit={(name) => {
                  const isDir = creating.isDir;
                  setCreating(null);
                  void useSpaces.getState().createEntry(space.path, name, isDir);
                }}
                onCancel={() => setCreating(null)}
              />
            </div>
          )}
          {(rootEntries ?? []).map((e) => (
            <TreeRow key={e.path} entry={e} depth={0} />
          ))}
          {rootEntries && rootEntries.length === 0 && !creating && (
            <p className="px-2 py-6 text-center text-[12px] leading-relaxed text-ink3">
              This folder is empty. Create your first note with the + above.
            </p>
          )}
        </div>
      </div>

      {/* editor / claude */}
      {panel === "claude" ? <ClaudePanel /> : <DocPane />}
    </ViewShell>
  );
}
