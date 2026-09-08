import { NextRequest, NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { db } from "@/lib/db";
import {
  currentUser,
  requireUser,
  publicUser,
  startSession,
  endSession,
} from "@/lib/auth";
import {
  AppError,
  rateLimit,
  hashPassword,
  verifyPassword,
} from "@/lib/security";
import {
  createInitialAdmin,
  authenticate,
  createInvitation,
  acceptInvitation,
  inspectInvitation,
  revokeInvitation,
  createUser,
  updateUser,
  audit,
  setupOpen,
  createPasswordReset,
  inspectPasswordReset,
  completePasswordReset,
} from "@/lib/accounts";
import {
  availableSlots,
  bookAppointment,
  changeAppointmentStatus,
  saveRules,
  addException,
  removeException,
  saveProvider,
} from "@/lib/scheduling";
import { profileSchema, typeSchema } from "@/lib/validation";
import { appointmentMail, saveSmtp, sendMail, smtpAction } from "@/lib/mail";
import { requestUpdate, updateInfo } from "@/lib/updates";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
async function handle(req: NextRequest, ctx: Context) {
  try {
    const path = (await ctx.params).path.join("/");
    const post = req.method === "POST";
    if (
      post &&
      req.headers.get("origin") !== new URL(process.env.APP_URL!).origin
    )
      throw new AppError("Ungültiger Anfrageursprung.", 403);
    if (
      post &&
      !req.headers.get("content-type")?.startsWith("application/json")
    )
      throw new AppError("JSON erforderlich.", 415);
    let data: unknown = {};
    if (post) {
      const raw = await req.text();
      if (raw.length > 32768) throw new AppError("Anfrage zu groß.", 413);
      try {
        data = JSON.parse(raw);
      } catch {
        throw new AppError("Ungültiges JSON.");
      }
    }
    const ip =
      process.env.TRUST_PROXY === "true"
        ? (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          "unknown")
        : "shared";
    let result: unknown = { ok: true };
    if (path === "setup" && !post) result = { open: await setupOpen() };
    else if (path === "setup" && post) {
      await rateLimit(`setup:${ip}`, 5);
      const user = await createInitialAdmin(data);
      await startSession(user.id);
    } else if (path === "login" && post) {
      await rateLimit(`login:${ip}`, 30);
      const login = z.object({ username: z.string().max(128) }).parse(data);
      await rateLimit(
        `login-account:${login.username.trim().toLowerCase()}`,
        10,
      );
      await startSession(await authenticate(data));
    } else if (path === "logout" && post) await endSession();
    else if (path.startsWith("invite/")) {
      await rateLimit(`invite:${ip}`, 60);
      const secret = path.slice(7);
      if (post) {
        const user = await acceptInvitation(secret, data);
        await startSession(user.id);
      } else result = await inspectInvitation(secret);
    } else if (path.startsWith("reset-password/")) {
      await rateLimit(`password-reset:${ip}`, post ? 10 : 60);
      const secret = path.slice("reset-password/".length);
      result = post
        ? await completePasswordReset(secret, data)
        : await inspectPasswordReset(secret);
    } else if (path === "me" && !post) result = await currentUser();
    else {
      const actor = await requireUser();
      if (post) await rateLimit(`mutation:${actor.id}`, 120, 1);
      if (path === "catalog" && !post)
        result = await db.providerProfile.findMany({
          where: { active: true, user: { active: true, role: "PROVIDER" } },
          include: {
            user: { select: { displayName: true } },
            types: { where: { active: true } },
          },
        });
      else if (path === "slots" && !post)
        result = await availableSlots(
          req.nextUrl.searchParams.get("providerId") ?? "",
          req.nextUrl.searchParams.get("typeId") ?? "",
          req.nextUrl.searchParams.get("date") ?? "",
        );
      else if (path === "appointments" && !post)
        result = await db.appointment.findMany({
          where:
            actor.role === "ADMIN"
              ? {}
              : actor.role === "PROVIDER"
                ? {
                    OR: [
                      { userId: actor.id },
                      { provider: { userId: actor.id } },
                    ],
                  }
                : { userId: actor.id },
          include: {
            type: true,
            provider: { include: { user: { select: { displayName: true } } } },
            user: { select: { displayName: true } },
          },
          orderBy: { startsAt: "asc" },
          take: 2000,
        });
      else if (path === "appointments/book" && post) {
        const appointment = await bookAppointment(actor, data);
        result = { appointment, mailSent: true };
        try {
          await appointmentMail(
            appointment.id,
            (data as { appointmentId?: string }).appointmentId
              ? "verschoben"
              : "gebucht",
          );
        } catch {
          result = { appointment, mailSent: false };
        }
      } else if (path === "appointments/status" && post) {
        const a = await changeAppointmentStatus(actor, data);
        result = { appointment: a, mailSent: true };
        try {
          await appointmentMail(
            a.id,
            a.status === "CANCELLED" ? "abgesagt" : "aktualisiert",
          );
        } catch {
          result = { appointment: a, mailSent: false };
        }
      } else if (path === "profile" && post) {
        const values = profileSchema.parse(data);
        await db.user.update({
          where: { id: actor.id },
          data: {
            ...values,
            ...(values.email !== actor.email ? { emailVerifiedAt: null } : {}),
          },
        });
        await audit(db, "PROFILE_CHANGED", actor.id);
      } else if (path === "password" && post) {
        await rateLimit(`password:${actor.id}`, 5);
        const p = z
          .object({
            current: z.string().max(128),
            password: z.string().min(12).max(128),
          })
          .parse(data);
        const user = await db.user.findUniqueOrThrow({
          where: { id: actor.id },
        });
        if (!(await verifyPassword(user.passwordHash, p.current)))
          throw new AppError("Das aktuelle Passwort ist falsch.");
        const passwordHash = await hashPassword(p.password);
        await db.$transaction(async (tx) => {
          await tx.user.update({
            where: { id: actor.id },
            data: { passwordHash },
          });
          await tx.session.deleteMany({ where: { userId: actor.id } });
          await audit(tx, "PASSWORD_CHANGED", actor.id);
        });
        await startSession(actor.id);
      } else if (path === "providers" && !post) {
        await requireUser(["ADMIN", "PROVIDER"]);
        const providers = await db.providerProfile.findMany({
          where: actor.role === "ADMIN" ? {} : { userId: actor.id },
          include: {
            user: { select: { displayName: true, email: true } },
            invitation: {
              select: {
                displayName: true,
                email: true,
                status: true,
                expiresAt: true,
              },
            },
            rules: true,
            exceptions: true,
            types: true,
          },
        });
        result = providers.map(({ invitation, ...provider }) => ({
          ...provider,
          user: provider.user ?? {
            displayName: invitation?.displayName || "Behandlerentwurf",
            email: invitation?.email ?? null,
          },
          invitation: provider.user ? null : invitation,
        }));
      } else if (path === "providers" && post) {
        await saveProvider(actor, data);
      } else if (path === "availability" && post) await saveRules(actor, data);
      else if (path === "exceptions" && post)
        result = await addException(actor, data);
      else if (path === "exceptions/remove" && post)
        await removeException(
          actor,
          z.object({ id: z.string() }).parse(data).id,
        );
      else if (path === "types" && !post) {
        await requireUser(["ADMIN", "PROVIDER"]);
        result = await db.appointmentType.findMany({
          where:
            actor.role === "ADMIN"
              ? {}
              : { providers: { some: { userId: actor.id } } },
          include: { providers: { select: { id: true } } },
        });
      } else if (path === "types" && post) {
        await requireUser(["ADMIN", "PROVIDER"]);
        const { id, providerIds, ...values } = typeSchema.parse(data);
        if (
          actor.role !== "ADMIN" &&
          (providerIds.length !== 1 || providerIds[0] !== actor.provider?.id)
        )
          throw new AppError("Keine Berechtigung.", 403);
        await db.$transaction(async (tx) => {
          if (id && actor.role !== "ADMIN") {
            const old = await tx.appointmentType.findUnique({
              where: { id },
              include: { providers: true },
            });
            if (
              !old ||
              old.providers.length !== 1 ||
              old.providers[0].userId !== actor.id
            )
              throw new AppError(
                "Gemeinsame Terminarten verwaltet der Administrator.",
                403,
              );
          }
          const record = {
            ...values,
            providers: { set: providerIds.map((id) => ({ id })) },
          };
          if (id)
            await tx.appointmentType.update({ where: { id }, data: record });
          else
            await tx.appointmentType.create({
              data: {
                ...values,
                providers: { connect: providerIds.map((id) => ({ id })) },
              },
            });
          await audit(tx, "APPOINTMENT_TYPE_CHANGED", actor.id, id);
        });
      } else {
        await requireUser(["ADMIN"]);
        if (path === "users" && !post)
          result = await db.user.findMany({
            select: publicUser,
            orderBy: { createdAt: "desc" },
          });
        else if (path === "users" && post)
          result = await createUser(actor, data);
        else if (path === "users/update" && post) await updateUser(actor, data);
        else if (path === "users/password-reset" && post) {
          await rateLimit(`admin-password-reset:${actor.id}`, 10, 300);
          result = await createPasswordReset(actor, data);
        } else if (path === "invitations" && !post)
          result = await db.invitation.findMany({
            select: {
              id: true,
              email: true,
              displayName: true,
              role: true,
              status: true,
              expiresAt: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
          });
        else if (path === "invitations" && post) {
          const invitation = await createInvitation(actor, data);
          let mailSent = false;
          if (
            invitation.invitation.email &&
            (await db.emailConfiguration.count())
          ) {
            try {
              await sendMail(
                invitation.invitation.email,
                "Ihre Einladung zu SchwesterLib",
                `Sie wurden zu SchwesterLib eingeladen. Erstellen Sie Ihr Konto: ${invitation.link}\nGültig bis ${invitation.invitation.expiresAt.toISOString()}.`,
              );
              mailSent = true;
            } catch {
              /* Link remains usable even when delivery fails. */
            }
          }
          result = { link: invitation.link, mailSent };
        } else if (path === "invitations/revoke" && post)
          await revokeInvitation(
            actor,
            z.object({ id: z.string() }).parse(data).id,
          );
        else if (path === "smtp" && !post) {
          const cfg = await db.emailConfiguration.findUnique({
            where: { id: 1 },
          });
          result = cfg
            ? {
                host: cfg.host,
                port: cfg.port,
                secure: cfg.secure,
                username: cfg.username,
                senderName: cfg.senderName,
                senderAddress: cfg.senderAddress,
                passwordConfigured: !!cfg.passwordEncrypted,
              }
            : null;
        } else if (path === "smtp" && post) await saveSmtp(actor, data);
        else if (path === "smtp/test" && post) {
          await rateLimit(`smtp:${actor.id}`, 5);
          const p = z.object({ recipient: z.email().optional() }).parse(data);
          try {
            await smtpAction(actor, p.recipient);
          } catch {
            throw new AppError(
              "SMTP-Test fehlgeschlagen. Bitte Zugangsdaten und TLS-Einstellungen prüfen.",
            );
          }
        } else if (path === "settings" && !post)
          result = await db.appSettings.findUnique({ where: { id: 1 } });
        else if (path === "settings" && post) {
          const values = z
            .object({
              name: z.string().min(2).max(80),
              bookingHorizonDays: z.number().int().min(1).max(365),
            })
            .parse(data);
          await db.$transaction(async (tx) => {
            await tx.appSettings.update({ where: { id: 1 }, data: values });
            await audit(tx, "SETTINGS_CHANGED", actor.id);
          });
        } else if (path === "updates" && !post) result = await updateInfo();
        else if (path === "updates" && post) {
          await rateLimit(`update:${actor.id}`, 3, 300);
          const { version } = z
            .object({ version: z.string().regex(/^v\d+\.\d+\.\d+$/) })
            .parse(data);
          result = await requestUpdate(version);
          await audit(db, "UPDATE_REQUESTED", actor.id, version);
        } else if (path === "audit" && !post)
          result = await db.auditLog.findMany({
            orderBy: { createdAt: "desc" },
            take: 200,
          });
        else throw new AppError("Nicht gefunden.", 404);
      }
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Ungültige Eingabe." },
        { status: 400 },
      );
    if (error instanceof AppError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    const code = (error as { code?: string }).code;
    if (code === "P2002")
      return NextResponse.json(
        { error: "Diese Angaben sind bereits vergeben." },
        { status: 409 },
      );
    if (code === "P2004" || code === "P2010")
      return NextResponse.json(
        { error: "Die Änderung kollidiert mit vorhandenen Daten." },
        { status: 409 },
      );
    return NextResponse.json(
      {
        error:
          "Die Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es erneut.",
      },
      { status: 500 },
    );
  }
}
export const GET = handle;
export const POST = handle;
