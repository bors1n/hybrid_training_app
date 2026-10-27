import nodemailer from 'nodemailer';

export interface Mailer {
  sendCode(email: string, code: string): Promise<void>;
}

/** Для разработки: код печатается в консоль сервера. */
export const consoleMailer: Mailer = {
  async sendCode(email, code) {
    console.log(`[вход] код для ${email}: ${code}`);
  },
};

export function smtpMailer(url: string, from: string): Mailer {
  const transport = nodemailer.createTransport(url);
  return {
    async sendCode(email, code) {
      await transport.sendMail({
        from,
        to: email,
        subject: `SPLAV: код входа ${code}`,
        text: `Код входа в SPLAV: ${code}\nОн действует 10 минут. Если вы не запрашивали код, просто проигнорируйте это письмо.`,
      });
    },
  };
}
