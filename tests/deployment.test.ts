import { it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

it("deployment aborts on dirty Git and keeps the service stopped after backup/build failures", () => {
  const directory = mkdtempSync(join(tmpdir(), "schwesterlib-deploy-"));
  // Redirect all production paths into a fixture and mock external commands.
  const script = readFileSync("scripts/deploy-production.sh", "utf8")
    .replace("[[ $EUID -eq 0 ]]", "true")
    .replaceAll("/srv/schwesterlib", directory)
    .replaceAll("/var/log/schwesterlib-deploy", directory)
    .replaceAll("/run/lock/schwesterlib-deploy.lock", join(directory, "lock"));
  writeFileSync(join(directory, ".env"), "", { mode: 0o600 });
  const mocks = `
record() { echo "$*" >> "$FIXTURE/events"; }
runuser() { shift 3; "$@"; }
stat() { if [[ $2 == %a ]]; then echo 600; else echo schwesterlib; fi; }
flock() { return 0; }
git() {
  record git "$@"
  case "$1" in
    branch) echo main;;
    status) if [[ $SCENARIO == dirty ]]; then echo ' M file'; fi;;
    rev-parse) echo abc123;;
  esac
  return 0
}
systemctl() { record systemctl "$@"; return 0; }
docker() { record docker "$@"; return 0; }
bash() { record backup; [[ $SCENARIO != backup_failure ]]; }
npm() { record npm "$@"; [[ $SCENARIO != build_failure || $* != 'run build' ]]; }
env() {
  if [[ $1 == -i ]]; then shift; fi
  while [[ $1 == *=* ]]; do shift; done
  if [[ $1 == /usr/bin/node ]]; then return 0; fi
  "$@"
}
curl() { record health; [[ $SCENARIO != health_failure ]]; }
sleep() { return 0; }
`;
  try {
    for (const scenario of ["dirty", "backup_failure", "build_failure", "health_failure", "success"]) {
      writeFileSync(join(directory, "events"), "");
      const result = spawnSync("bash", ["-c", mocks + script], {
        env: { ...process.env, FIXTURE: directory, SCENARIO: scenario }, encoding: "utf8",
      });
      const events = readFileSync(join(directory, "events"), "utf8");
      expect(result.status, result.stderr).toBe(scenario === "success" ? 0 : 1);
      if (scenario === "dirty") {
        expect(events).not.toContain("systemctl stop");
        expect(events).not.toContain("git fetch");
      } else {
        expect(events.indexOf("systemctl stop")).toBeLessThan(events.indexOf("backup"));
        if (scenario === "backup_failure") expect(events).not.toContain("npm");
        if (scenario === "health_failure") {
          expect(events).toContain("systemctl start");
          expect(events.trim().endsWith("systemctl stop schwesterlib.service")).toBe(true);
        } else if (scenario !== "success") expect(events).not.toContain("systemctl start");
        else {
          expect(events.indexOf("backup")).toBeLessThan(events.indexOf("npm run db:migrate"));
          expect(events.indexOf("npm run build")).toBeLessThan(events.indexOf("systemctl start"));
          expect(events).toContain("health");
        }
      }
      expect(events).not.toContain("db:seed");
    }
  } finally {
    rmSync(directory, { recursive: true });
  }
});
