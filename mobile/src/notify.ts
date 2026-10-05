/**
 * Kickoff reminders, on the phone: ask once, then keep the next four weeks scheduled.
 *
 * The ask comes the first time the owner walks into a room past the desk (`bridge.isRoom`),
 * never on launch and never over the opening ride: by then they have a league and have seen
 * what the reminder is for. iOS only ever shows its prompt once; after that the answer lives
 * in Settings, and this module just respects it.
 */

import * as Notifications from "expo-notifications";
import { NATIVE } from "../../web/src/lib/vocab.ts";
import { upcomingReminders } from "./reminders.ts";

Notifications.setNotificationHandler({
  // A reminder that lands while the app is open still shows: the clock is the point.
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Whether iOS has never asked. False on any error, so a failure never nags. */
export async function neverAsked(): Promise<boolean> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.ios?.status === Notifications.IosAuthorizationStatus.NOT_DETERMINED;
  } catch {
    return false;
  }
}

export async function askForReminders(): Promise<void> {
  try {
    const p = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    if (p.granted) await scheduleReminders();
  } catch {
    /* no reminders is a fine outcome; nothing else depends on them */
  }
}

/** Replace whatever is scheduled with the next four weeks. Safe to call on every launch. */
export async function scheduleReminders(now: number = Date.now()): Promise<void> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (!p.granted) return;
    await Notifications.cancelAllScheduledNotificationsAsync();
    for (const r of upcomingReminders(now)) {
      const words = NATIVE.reminders[r.kind];
      await Notifications.scheduleNotificationAsync({
        content: { title: words.title, body: words.body, data: { path: r.path } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
      });
    }
  } catch {
    /* Intl or the scheduler unavailable: skip this launch, try again on the next */
  }
}

/** The room a tapped reminder opens, or null. Only a path on our own site is honoured. */
export function pathFrom(response: Notifications.NotificationResponse | null): string | null {
  const path = response?.notification.request.content.data?.path;
  return typeof path === "string" && /^\/[a-z]/.test(path) ? path : null;
}
