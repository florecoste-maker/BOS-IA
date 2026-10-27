/**
 * Serveur SMTP minimal pour les tests : accepte tout et garde les messages reçus.
 * `fail` simule un refus du serveur (550) à l'envoi.
 */
import { createServer, type AddressInfo, type Socket } from "node:net";

export interface CapturedMail {
  from: string;
  to: string[];
  data: string;
}

export async function startSmtpSink(options: { fail?: boolean } = {}) {
  const mails: CapturedMail[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = "";
    let current: CapturedMail = { from: "", to: [], data: "" };
    let inData = false;
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply("220 sink ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let i: number;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            mails.push(current);
            current = { from: "", to: [], data: "" };
            reply("250 OK queued");
          } else {
            current.data += `${line.startsWith("..") ? line.slice(1) : line}\n`;
          }
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") reply("250 sink");
        else if (cmd === "MAIL") {
          if (options.fail) reply("550 Mailbox unavailable");
          else {
            current.from = line.slice(10).trim();
            reply("250 OK");
          }
        } else if (cmd === "RCPT") {
          current.to.push(line.slice(8).trim());
          reply("250 OK");
        } else if (cmd === "DATA") {
          inData = true;
          reply("354 End data with <CR><LF>.<CR><LF>");
        } else if (cmd === "QUIT") {
          reply("221 Bye");
          socket.end();
        } else if (cmd === "RSET" || cmd === "NOOP") reply("250 OK");
        else reply("250 OK");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    mails,
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
