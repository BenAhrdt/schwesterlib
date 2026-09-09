import { readFile, writeFile } from "node:fs/promises";
import packageJson from "../../package.json";
import { AppError } from "./security";

const repository = "BenAhrdt/schwesterlib";
const releasePattern = /^v(\d+)\.(\d+)\.(\d+)$/;
const requestPath = () => process.env.UPDATE_REQUEST_PATH;
const statusPath = () =>
  process.env.UPDATE_STATUS_PATH ?? "/run/schwesterlib/update-status.json";

type UpdateStatus = {
  state: "idle" | "requested" | "running" | "success" | "failed";
  stage?: string;
  message?: string;
  version?: string;
  updatedAt?: string;
};

function newer(candidate: string, current: string) {
  const next = releasePattern.exec(candidate);
  const installed = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!next || !installed) return false;
  for (let index = 1; index <= 3; index++) {
    const difference = Number(next[index]) - Number(installed[index]);
    if (difference) return difference > 0;
  }
  return false;
}

async function latestRelease() {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/latest`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "SchwesterLib-Update-Checker",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok)
    throw new AppError(
      "Die GitHub-Releases konnten nicht geprüft werden.",
      503,
    );
  const release = (await response.json()) as Record<string, unknown>;
  if (
    typeof release.tag_name !== "string" ||
    !releasePattern.test(release.tag_name) ||
    typeof release.html_url !== "string" ||
    !release.html_url.startsWith(
      `https://github.com/${repository}/releases/tag/`,
    )
  )
    throw new AppError("Das neueste Release besitzt ungültige Metadaten.", 503);
  return {
    version: release.tag_name,
    name: typeof release.name === "string" ? release.name : release.tag_name,
    notes: typeof release.body === "string" ? release.body.slice(0, 12000) : "",
    url: release.html_url,
    publishedAt:
      typeof release.published_at === "string" ? release.published_at : null,
  };
}

async function deploymentStatus(): Promise<UpdateStatus> {
  try {
    const parsed = JSON.parse(
      await readFile(statusPath(), "utf8"),
    ) as UpdateStatus;
    if (!["requested", "running", "success", "failed"].includes(parsed.state))
      return { state: "idle" };
    return {
      state: parsed.state,
      stage:
        typeof parsed.stage === "string"
          ? parsed.stage.slice(0, 80)
          : undefined,
      message:
        typeof parsed.message === "string"
          ? parsed.message.slice(0, 300)
          : undefined,
      version:
        typeof parsed.version === "string" &&
        releasePattern.test(parsed.version)
          ? parsed.version
          : undefined,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    return { state: "idle" };
  }
}

export async function updateStatus() {
  return {
    currentVersion: packageJson.version,
    status: await deploymentStatus(),
  };
}

export async function updateInfo() {
  const [release, status] = await Promise.all([
    latestRelease(),
    deploymentStatus(),
  ]);
  return {
    currentVersion: packageJson.version,
    latestVersion: release.version,
    updateAvailable: newer(release.version, packageJson.version),
    configured: !!requestPath(),
    release,
    status,
  };
}

export async function requestUpdate(tag: string) {
  const path = requestPath();
  if (!path)
    throw new AppError(
      "Der systemd-Updater ist auf diesem Server noch nicht eingerichtet.",
      503,
    );
  const info = await updateInfo();
  if (tag !== info.latestVersion || !info.updateAvailable)
    throw new AppError("Dieses Release steht nicht zur Installation bereit.");
  if (["requested", "running"].includes(info.status.state))
    throw new AppError("Ein Update läuft bereits.", 409);
  try {
    await writeFile(path, `${tag}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new AppError("Ein Update läuft bereits.", 409);
    throw new AppError("Der Updateauftrag konnte nicht angelegt werden.", 503);
  }
  return { requested: true, version: tag };
}
