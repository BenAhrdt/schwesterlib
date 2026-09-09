export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build" &&
    process.env.PUSH_REMINDERS_DISABLED !== "true"
  ) {
    const { startPushReminders } = await import("./lib/push-reminders");
    startPushReminders();
  }
}
