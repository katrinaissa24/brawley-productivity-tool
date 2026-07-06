import { format } from "date-fns";
import { isTauri } from "../db/driver";
import { useData } from "../stores/data";
import { useSettings } from "../stores/settings";
import { activeSprint, isOpen, reviewDue, visibleTasks } from "../stores/selectors";
import { addDaysStr, daysUntil, todayStr } from "../lib/util";

/**
 * Native macOS notifications (§6.10). Runs while the app is open: a 30s tick
 * checks the schedule; each event fires once (dedupe keys in localStorage).
 */

const FIRED_KEY = "flow:notifFired";

function firedMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function markFired(key: string) {
  const map = firedMap();
  map[key] = todayStr();
  // prune entries older than 60 days
  const cutoff = addDaysStr(todayStr(), -60);
  for (const [k, v] of Object.entries(map)) if (v < cutoff) delete map[k];
  localStorage.setItem(FIRED_KEY, JSON.stringify(map));
}

const hasFired = (key: string) => key in firedMap();

async function notify(title: string, body: string) {
  if (!isTauri) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (granted) sendNotification({ title, body });
  } catch (e) {
    console.warn("notification failed", e);
  }
}

function tick() {
  const settings = useSettings.getState().settings;
  if (!settings.notifMaster) return;
  const data = useData.getState();
  if (!data.loaded) return;

  const today = todayStr();
  const nowHM = format(new Date(), "HH:mm");
  const morningReached = nowHM >= settings.notifMorningTime;
  const vis = visibleTasks(data.tasks, data.projects);

  // Morning planning nudge
  if (settings.notifMorning && morningReached && !hasFired(`morning:${today}`)) {
    markFired(`morning:${today}`);
    void notify("Plan your day", "Pick your Today tasks — a short list you'll actually finish.");
  }

  // Due-date reminders: morning-of and day-before
  if (settings.notifDue && morningReached) {
    const dueToday = vis.filter((t) => isOpen(t) && t.dueDate === today);
    if (dueToday.length > 0 && !hasFired(`dueToday:${today}`)) {
      markFired(`dueToday:${today}`);
      void notify(
        dueToday.length === 1 ? "Due today" : `${dueToday.length} tasks due today`,
        dueToday.length === 1
          ? dueToday[0].title
          : dueToday.slice(0, 3).map((t) => t.title).join(" · "),
      );
    }
    const tomorrow = addDaysStr(today, 1);
    const dueTomorrow = vis.filter((t) => isOpen(t) && t.dueDate === tomorrow);
    if (dueTomorrow.length > 0 && !hasFired(`dueTomorrow:${today}`)) {
      markFired(`dueTomorrow:${today}`);
      void notify(
        dueTomorrow.length === 1 ? "Due tomorrow" : `${dueTomorrow.length} tasks due tomorrow`,
        dueTomorrow.length === 1
          ? dueTomorrow[0].title
          : dueTomorrow.slice(0, 3).map((t) => t.title).join(" · "),
      );
    }
  }

  // Sprint ended → review ready
  if (settings.notifReview) {
    const sprint = activeSprint(data.sprints);
    if (sprint && reviewDue(sprint) && !hasFired(`review:${sprint.id}`)) {
      markFired(`review:${sprint.id}`);
      void notify("Sprint ended", "Your weekly review is ready — close it out and plan the next one.");
    }
  }

  // Goal countdowns: 7 days and 1 day out
  if (settings.notifGoal) {
    for (const g of data.goals) {
      if (g.status !== "active") continue;
      const left = daysUntil(g.targetDate);
      if (left === 7 && !hasFired(`goal7:${g.id}`)) {
        markFired(`goal7:${g.id}`);
        void notify("One week left", `"${g.title}" hits its target date in 7 days.`);
      }
      if (left === 1 && !hasFired(`goal1:${g.id}`)) {
        markFired(`goal1:${g.id}`);
        void notify("Final stretch", `"${g.title}" is due tomorrow.`);
      }
    }
  }
}

let started = false;

export function startNotificationScheduler() {
  if (started || !isTauri) return;
  started = true;
  window.setTimeout(tick, 4000); // shortly after boot
  window.setInterval(tick, 30_000);
}
