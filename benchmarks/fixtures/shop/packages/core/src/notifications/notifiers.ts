import type { Mailer, SmsGateway } from "../domain/ports";
import type { User } from "../domain/types";
import { normalizePhone } from "../util/strings";

export interface Notifier {
  send(user: User, subject: string, message: string): Promise<boolean>;
}

export class EmailNotifier implements Notifier {
  constructor(private readonly mailer: Mailer) {}

  async send(user: User, subject: string, message: string): Promise<boolean> {
    if (user.status !== "active") return false;
    await this.mailer.send(user.email, subject, message);
    return true;
  }
}

export class SmsNotifier implements Notifier {
  constructor(private readonly sms: SmsGateway) {}

  async send(user: User, subject: string, message: string): Promise<boolean> {
    if (user.status !== "active" || user.phone === undefined) return false;
    await this.sms.sendText(normalizePhone(user.phone), `${subject}: ${message}`.slice(0, 160));
    return true;
  }
}
