import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as net from 'net';
import { lookup } from 'dns/promises';

interface OrderItemInfo {
  name: string;
  quantity: number;
  price: number;
}

interface ShippingInfo {
  name: string;
  phone: string;
  email?: string | null;
  address: string;
  city: string;
  state: string;
  zip?: string | null;
  notes?: string | null;
  docType?: string | null;
  docNumber?: string | null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<tr[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  async onModuleInit() {
    if (!this.transporter) return;
    await this.probeAndVerify(this.logger, 'boot');
  }

  private async probeAndVerify(
    logger: Logger,
    context: string,
  ): Promise<string | null> {
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT) || 587;

    const probe = await this.probeSmtp(host, port);
    if (!probe.ok) {
      const msg = `[${context}] No se puede conectar a ${host}:${port} desde el servidor: ${probe.error}`;
      logger.error(msg);
      return msg;
    }
    logger.log(`[${context}] Conexión TCP a ${host}:${port} OK`);

    try {
      await this.withTimeout(this.transporter!.verify(), 15000);
      logger.log(
        `[${context}] SMTP credentials verificadas OK: ${process.env.SMTP_USER || '?'}`,
      );
      return null;
    } catch (err) {
      const msg = `[${context}] SMTP audit rechazada por ${host} (revisa SMTP_USER/SMTP_PASS): ${
        err instanceof Error ? err.message : err
      }`;
      logger.error(msg);
      return msg;
    }
  }

  private async probeSmtp(
    host: string,
    port: number,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!host) return { ok: false, error: 'SMTP_HOST vacío' };
    try {
      const addresses = await lookup(host, { all: true });
      const resolved = addresses.map((a) => a.address).join(', ');
      if (addresses.length === 0)
        return { ok: false, error: `DNS no resolvió ${host}` };
      this.logger.log(`DNS ${host} → ${resolved}`);
    } catch (err) {
      return {
        ok: false,
        error: `DNS no resolvió ${host}: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }

    return new Promise((resolve) => {
      const socket = net.connect({ host, port });
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({
          ok: false,
          error: `timeout de conexión a ${host}:${port} (puerto bloqueado o red sin salida a Gmail)`,
        });
      }, 8000);
      socket.once('connect', () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: true });
      });
      socket.once('error', (err) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: false, error: err.message });
      });
    });
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout tras ${ms}ms`)),
        ms,
      );
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  constructor() {
    const clean = (v?: string): string | undefined => {
      if (!v) return v;
      let s = v.trim();
      if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
        s = s.slice(1, -1).trim();
      }
      return s;
    };

    for (const key of [
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
    ]) {
      const v = process.env[key];
      if (v) process.env[key] = clean(v);
    }

    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && port && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(port),
        secure: Number(port) === 465,
        auth: { user, pass },
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 20000,
      });
      this.logger.log(
        `Mail transporter configured: ${host}:${port} → ${user}`,
      );
    } else {
      this.logger.warn(
        `SMTP not configured — emails will be logged to console only (host=${host || '?'}, port=${port || '?'}, user=${user || '?'}, pass=${pass ? 'set' : '?'})`,
      );
    }
  }

  async sendAdminOrderNotification(
    adminEmail: string,
    customerName: string,
    customerEmail: string | null,
    orderId: string,
    items: OrderItemInfo[],
    total: number,
    shipping: ShippingInfo,
    dropiStatus?: string,
  ): Promise<boolean> {
    const itemsHtml = items
      .map(
        (i) =>
          `<tr>
            <td style="padding:10px 16px;border-bottom:1px solid #e4e4e7;color:#333;font-size:14px">${i.name}</td>
            <td style="padding:10px 16px;border-bottom:1px solid #e4e4e7;color:#333;font-size:14px;text-align:center">${i.quantity}</td>
            <td style="padding:10px 16px;border-bottom:1px solid #e4e4e7;color:#333;font-size:14px;text-align:right">$${i.price.toLocaleString('es-CO')}</td>
            <td style="padding:10px 16px;border-bottom:1px solid #e4e4e7;color:#333;font-size:14px;text-align:right;font-weight:bold">$${(i.price * i.quantity).toLocaleString('es-CO')}</td>
          </tr>`,
      )
      .join('\n');

    const dropiBanner = dropiStatus
      ? `<div style="margin-top:24px;padding:16px;background:#fef3c7;border-radius:8px;border:1px solid #fde68a">
          <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6">
            <strong>📦 Dropi:</strong> ${dropiStatus}
          </p>
        </div>`
      : '';

    await this.sendHtml({
      to: adminEmail,
      subject: `Nuevo pedido #${orderId.slice(0, 8)} — Kronio Market`,
      tag: 'ADMIN ORDER NOTIFICATION',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
    <div style="background:#18181b;padding:32px 24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">NUEVO PEDIDO</h1>
      <p style="color:#a1a1aa;margin:6px 0 0;font-size:13px">#${orderId}</p>
    </div>
    <div style="padding:32px 24px">
      <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:20px 0">
        <table style="width:100%;font-size:13px;color:#52525b">
          <tr>
            <td style="padding:4px 0">Cliente</td>
            <td style="padding:4px 0;text-align:right;font-weight:bold;color:#18181b">${customerName}</td>
          </tr>
          <tr>
            <td style="padding:4px 0">Email</td>
            <td style="padding:4px 0;text-align:right;font-weight:bold;color:#18181b">${customerEmail || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding:4px 0">Método de pago</td>
            <td style="padding:4px 0;text-align:right;font-weight:bold;color:#16a34a">Pago contra entrega</td>
          </tr>
        </table>
      </div>

      <h3 style="font-size:15px;color:#18181b;margin:24px 0 10px;font-weight:700">Productos</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f4f4f5">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#71717a;text-transform:uppercase">Producto</th>
            <th style="padding:10px 16px;text-align:center;font-size:12px;color:#71717a;text-transform:uppercase">Cant</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;color:#71717a;text-transform:uppercase">Precio</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;color:#71717a;text-transform:uppercase">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:14px 16px;text-align:right;font-size:14px;color:#333;font-weight:bold">Total:</td>
            <td style="padding:14px 16px;text-align:right;font-size:18px;color:#2563eb;font-weight:bold">$${total.toLocaleString('es-CO')}</td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e4e4e7">
        <h3 style="margin:0 0 10px;font-size:14px;color:#18181b;font-weight:700">Dirección de envío</h3>
        <p style="margin:0;font-size:13px;color:#52525b;line-height:1.6">
          ${shipping.name}<br>
          ${shipping.phone}<br>
          ${shipping.email ? `${shipping.email}<br>` : ''}
          ${shipping.address}<br>
          ${shipping.city}, ${shipping.state}${shipping.zip ? ` — ${shipping.zip}` : ''}
        </p>
        ${shipping.notes ? `<p style="margin:8px 0 0;font-size:12px;color:#71717a;font-style:italic">Notas: ${shipping.notes}</p>` : ''}
      </div>

      ${dropiBanner}

      <p style="color:#666;font-size:13px;margin-top:24px;border-top:1px solid #e4e4e7;padding-top:16px">
        Inicia sesión en el panel de administración para gestionar este pedido.
      </p>
    </div>
    <div style="background:#f4f4f5;padding:16px 24px;text-align:center;font-size:11px;color:#a1a1aa">
      Kronio Market — Notificación automática de pedidos
    </div>
  </div>
</body>
</html>`,
    });
    return true;
  }

  private async send(options: {
    to: string;
    subject: string;
    text: string;
    tag: string;
  }): Promise<boolean> {
    if (this.transporter) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await this.transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@ecommerce.com',
            to: options.to,
            subject: options.subject,
            text: options.text,
          });
          this.logger.log(
            `[${options.tag}] enviado a ${options.to} | ${options.subject}`,
          );
          return true;
        } catch (err) {
          const message = err instanceof Error ? err.message : err;
          if (attempt === 1) {
            this.logger.warn(
              `[${options.tag}] intento 1 falló (${message}); reintentando...`,
            );
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          this.logger.error(`Error sending ${options.tag} email: ${message}`);
          return false;
        }
      }
    }

    this.logger.warn(
      `[${options.tag}] SMTP no configurado — no se envió a ${options.to}`,
    );
    return false;
  }

  private async sendHtml(options: {
    to: string;
    subject: string;
    html: string;
    tag: string;
  }): Promise<boolean> {
    if (this.transporter) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          await this.transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@ecommerce.com',
            to: options.to,
            subject: options.subject,
            text: htmlToText(options.html),
            html: options.html,
          });
          this.logger.log(
            `[${options.tag}] enviado a ${options.to} | ${options.subject}`,
          );
          return true;
        } catch (err) {
          const message = err instanceof Error ? err.message : err;
          if (attempt === 1) {
            this.logger.warn(
              `[${options.tag}] intento 1 falló (${message}); reintentando...`,
            );
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          this.logger.error(`Error sending ${options.tag} email: ${message}`);
          return false;
        }
      }
    }

    this.logger.warn(
      `[${options.tag}] SMTP no configurado — no se envió a ${options.to}`,
    );
    return false;
  }

  async sendPasswordResetEmail(to: string, name: string, resetLink: string) {
    await this.sendHtml({
      to,
      subject: 'Recuperación de contraseña - Kronio Market',
      tag: 'PASSWORD RESET',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
    <div style="background:linear-gradient(135deg,#1d4ed8,#4338ca);padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:20px">Kronio Market</h1>
    </div>
    <div style="padding:32px 24px">
      <p style="color:#333;font-size:15px;line-height:1.5">Hola <strong>${name}</strong>,</p>
      <p style="color:#333;font-size:15px;line-height:1.5">
        Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente botón para crear una nueva:
      </p>
      <div style="text-align:center;margin:28px 0">
        <a href="${resetLink}" style="display:inline-block;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;border-radius:10px;padding:14px 32px;font-size:15px;font-weight:bold;text-decoration:none">Restablecer contraseña</a>
      </div>
      <p style="color:#666;font-size:13px;line-height:1.5">Este enlace expira en <strong>1 hora</strong>. Si no puede ver el botón, copia y pega esta dirección en tu navegador:</p>
      <p style="color:#2563eb;font-size:12px;word-break:break-all;background:#f4f4f5;border-radius:8px;padding:12px">${resetLink}</p>
      <p style="color:#666;font-size:13px;margin-top:20px;border-top:1px solid #e4e4e7;padding-top:16px">Si no solicitaste este cambio, ignora este correo. Tu contraseña no cambiará.</p>
    </div>
  </div>
</body>
</html>`,
    });
  }

  async sendVerificationCode(to: string, name: string, code: string) {
    await this.sendHtml({
      to,
      subject: 'Código de verificación - Kronio Market',
      tag: 'VERIFICATION CODE',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
    <div style="background:#18181b;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:20px">Kronio Market</h1>
    </div>
    <div style="padding:32px 24px">
      <p style="color:#333;font-size:15px;line-height:1.5">Hola <strong>${name}</strong>,</p>
      <p style="color:#333;font-size:15px;line-height:1.5">Usa el siguiente código para verificar tu identidad:</p>
      <div style="text-align:center;margin:28px 0">
        <span style="display:inline-block;background:#f4f4f5;border-radius:8px;padding:16px 32px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#18181b">${code}</span>
      </div>
      <p style="color:#666;font-size:13px">Este código expira en <strong>5 minutos</strong>.</p>
      <p style="color:#666;font-size:13px;margin-top:20px;border-top:1px solid #e4e4e7;padding-top:16px">Si no intentaste iniciar sesión, ignora este correo.</p>
    </div>
  </div>
</body>
</html>`,
    });
  }

  async sendOrderConfirmationEmail(
    to: string,
    name: string,
    orderId: string,
    items: OrderItemInfo[],
    total: number,
    shipping?: ShippingInfo,
  ): Promise<boolean> {
    const invoiceNumber = orderId.slice(0, 8).toUpperCase();
    const date = new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const subtotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
    const currency = (v: number) => `$${v.toLocaleString('es-CO')}`;

    const itemsHtml = items
      .map(
        (i, idx) =>
          `<tr style="${idx % 2 === 1 ? 'background:#f8fafc' : ''}">
            <td style="padding:12px 16px;border-bottom:1px solid #eef0f3;color:#18181b;font-size:14px;line-height:1.45">${i.name}</td>
            <td style="padding:12px 16px;border-bottom:1px solid #eef0f3;color:#52525b;font-size:14px;text-align:center">${i.quantity}</td>
            <td style="padding:12px 16px;border-bottom:1px solid #eef0f3;color:#52525b;font-size:14px;text-align:right">${currency(i.price)}</td>
            <td style="padding:12px 16px;border-bottom:1px solid #eef0f3;color:#18181b;font-size:14px;text-align:right;font-weight:600">${currency(i.price * i.quantity)}</td>
          </tr>`,
      )
      .join('\n');

    const docLine = shipping?.docNumber
      ? `<tr>
            <td style="padding:5px 0;color:#64748b">Documento</td>
            <td style="padding:5px 0;text-align:right;color:#0f172a;font-weight:600">${shipping.docType || 'CC'} ${shipping.docNumber}</td>
          </tr>`
      : '';

    const shippingAddressHtml = shipping
      ? `<tr>
            <td style="padding:5px 0;color:#64748b">Dirección de entrega</td>
            <td style="padding:5px 0;text-align:right;color:#0f172a;font-weight:600">${shipping.address}, ${shipping.city}, ${shipping.state}${shipping.zip ? ` (${shipping.zip})` : ''}</td>
          </tr>`
      : '';

    const notesHtml = shipping?.notes
      ? `<tr>
            <td style="padding:5px 0;color:#64748b">Notas del pedido</td>
            <td style="padding:5px 0;text-align:right;color:#0f172a;font-weight:600;font-style:italic">${shipping.notes}</td>
          </tr>`
      : '';

    await this.sendHtml({
      to,
      subject: `Factura de compra #${invoiceNumber} — Kronio Market`,
      tag: 'ORDER CONFIRMATION',
      html: `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:24px 12px">

    <!-- Marcador: encabezado con marca -->
    <div style="background:linear-gradient(135deg,#2563eb 0%,#4f46e5 60%,#4338ca 100%);border-radius:16px 16px 0 0;padding:28px 32px;color:#fff">
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="vertical-align:middle">
            <div style="display:inline-block;background:#fff;color:#2563eb;font-size:15px;font-weight:800;padding:8px 12px;border-radius:10px;letter-spacing:0.5px">KRONIO MARKET</div>
            <p style="margin:8px 0 0;font-size:12px;color:#c7d2fe;font-weight:500;letter-spacing:0.6px;text-transform:uppercase">Comprobante de compra</p>
          </td>
          <td style="vertical-align:middle;text-align:right">
            <p style="margin:0;font-size:11px;color:#c7d2fe;text-transform:uppercase;letter-spacing:0.5px">Factura N°</p>
            <p style="margin:2px 0 0;font-size:18px;font-weight:800;letter-spacing:1px">${invoiceNumber}</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="background:#ffffff;border-radius:0 0 16px 16px;padding:32px;box-shadow:0 10px 30px rgba(30,41,59,0.08)">

      <!-- Saludo -->
      <p style="margin:0 0 6px;font-size:15px;color:#0f172a;line-height:1.5">Hola <strong>${name}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6">
        ¡Gracias por tu compra en Kronio Market! Este es tu comprobante. El pago se realiza contra entrega.
      </p>

      <!-- Data del documento -->
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border:1px solid #eef0f3;border-radius:12px;padding:0">
        <tr>
          <td style="padding:16px 20px">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr>
                <td style="padding:5px 0;color:#64748b">Fecha</td>
                <td style="padding:5px 0;text-align:right;color:#0f172a;font-weight:600">${date}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;color:#64748b">Cliente</td>
                <td style="padding:5px 0;text-align:right;color:#0f172a;font-weight:600">${shipping?.name || name}</td>
              </tr>
              <tr>
                <td style="padding:5px 0;color:#64748b">Teléfono</td>
                <td style="padding:5px 0;text-align:right;color:#0f172a;font-weight:600">${shipping?.phone || '—'}</td>
              </tr>
              ${docLine}
              <tr>
                <td style="padding:5px 0;color:#64748b">Método de pago</td>
                <td style="padding:5px 0;text-align:right;color:#059669;font-weight:700">Pago contra entrega</td>
              </tr>
              ${shippingAddressHtml}
              ${notesHtml}
            </table>
          </td>
        </tr>
      </table>

      <!-- Detalle de productos -->
      <h3 style="margin:28px 0 12px;font-size:13px;color:#0f172a;font-weight:700;text-transform:uppercase;letter-spacing:0.6px">Detalle de tu pedido</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:11px 16px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-radius:8px 0 0 8px">Producto</th>
            <th style="padding:11px 16px;text-align:center;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Cant.</th>
            <th style="padding:11px 16px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Precio</th>
            <th style="padding:11px 16px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;border-radius:0 8px 8px 0">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="padding:14px 16px 4px;text-align:right;font-size:13px;color:#64748b">Subtotal</td>
            <td style="padding:14px 16px 4px;text-align:right;font-size:14px;color:#0f172a;font-weight:600">${currency(subtotal)}</td>
          </tr>
          <tr>
            <td colspan="3" style="padding:4px 16px 16px;text-align:right;font-size:14px;color:#0f172a;font-weight:700">Total a pagar contra entrega</td>
            <td style="padding:4px 16px 16px;text-align:right;font-size:20px;color:#2563eb;font-weight:800">${currency(total)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- Pago contra entrega -->
      <div style="margin-top:24px;padding:16px 20px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px">
        <table style="width:100%;border-collapse:collapse">
          <tr>
            <td style="vertical-align:top;padding-right:12px">
              <div style="width:36px;height:36px;border-radius:50%;background:#10b981;color:#fff;text-align:center;line-height:36px;font-size:18px;font-weight:bold">💵</div>
            </td>
            <td style="vertical-align:middle">
              <p style="margin:0;font-size:14px;color:#065f46;font-weight:700">Pago contra entrega</p>
              <p style="margin:2px 0 0;font-size:13px;color:#047857;line-height:1.5">
                Pagarás en efectivo al recibir tu pedido. Ten el monto exacto para facilitar la entrega.
              </p>
            </td>
          </tr>
        </table>
      </div>

      <!-- Garantías y legal -->
      <table style="width:100%;border-collapse:collapse;margin-top:24px;background:#f8fafc;border:1px solid #eef0f3;border-radius:12px">
        <tr>
          <td style="padding:16px 20px">
            <p style="margin:0 0 6px;font-size:13px;color:#0f172a;font-weight:700">Tus derechos como comprador</p>
            <p style="margin:0;font-size:12px;color:#64748b;line-height:1.65">
              Todos nuestros productos cuentan con garantía legal conforme a la Ley 1480 de 2011.
              Tienes plazo de <strong>retracto</strong> de hasta 5 días hábiles y puedes solicitar cambios o
              devoluciones según lo dispuesto por la ley. Cualquier novedad, respóndenos a este correo.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;border-top:1px solid #eef0f3;padding-top:16px">
        Kronio Market &middot; Tienda en línea &middot; Bogotá, Colombia<br>
        Correo de contacto: <span style="color:#2563eb">kroniomarket26@gmail.com</span> &middot; NIT 000.000.000-0
      </p>
    </div>

    <p style="margin:16px 0 0;text-align:center;font-size:11px;color:#94a3b8">
      Este es un correo generado automáticamente por Kronio Market. No lo respondas si es un error — escríbenos a kroniomarket26@gmail.com.
    </p>
  </div>
</body>
</html>`,
    });
    return true;
  }

  async sendOrderCancellationEmail(
    to: string,
    name: string,
    orderId: string,
    items: OrderItemInfo[],
    total: number,
  ): Promise<boolean> {
    const orderNumber = orderId.slice(0, 8).toUpperCase();
    const itemsHtml = items
      .map(
        (i) =>
          `<tr style="background:#fafafa">
            <td style="padding:10px 16px;color:#18181b;font-size:14px">${i.name}</td>
            <td style="padding:10px 16px;color:#52525b;font-size:14px;text-align:center">${i.quantity}</td>
            <td style="padding:10px 16px;color:#52525b;font-size:14px;text-align:right">$${(i.price * i.quantity).toLocaleString('es-CO')}</td>
          </tr>`,
      )
      .join('\n');

    await this.sendHtml({
      to,
      subject: `Pedido #${orderNumber} cancelado — Kronio Market`,
      tag: 'ORDER CANCELLED',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
    <div style="background:#dc2626;padding:32px 24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">PEDIDO CANCELADO</h1>
      <p style="color:#fecaca;margin:6px 0 0;font-size:13px">#${orderNumber}</p>
    </div>
    <div style="padding:32px 24px">
      <p style="margin:0 0 16px;font-size:15px;color:#18181b;line-height:1.6">
        Hola <strong>${name}</strong>, tu pedido <strong>#${orderNumber}</strong> de Kronio Market ha sido <strong>cancelado</strong>.
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;font-size:13px;color:#991b1b;line-height:1.5">
        No se te cobrará nada y tu dinero no está comprometido, ya que el pago era contra entrega.
        Si ya realizaste algún pago, será reintegrado por el mismo medio.
      </div>

      <h3 style="font-size:15px;color:#18181b;margin:24px 0 10px;font-weight:700">Productos del pedido</h3>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f4f4f5">
            <th style="padding:10px 16px;text-align:left;font-size:12px;color:#71717a;text-transform:uppercase">Producto</th>
            <th style="padding:10px 16px;text-align:center;font-size:12px;color:#71717a;text-transform:uppercase">Cant</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;color:#71717a;text-transform:uppercase">Subtotal</th>
          </tr>
        </thead>
        <tbody>${itemsHtml || '<tr><td colspan="3" style="padding:10px 16px;color:#71717a;font-size:13px">Sin detalles</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding:14px 16px;text-align:right;font-size:14px;color:#333;font-weight:bold">Total:</td>
            <td style="padding:14px 16px;text-align:right;font-size:18px;color:#dc2626;font-weight:bold">$${total.toLocaleString('es-CO')}</td>
          </tr>
        </tfoot>
      </table>

      <p style="color:#666;font-size:13px;margin-top:24px;border-top:1px solid #e4e4e7;padding-top:16px">
        Si tienes dudas o deseas volver a comprar, escríbenos a kroniomarket26@gmail.com. ¡Te esperamos!
      </p>
    </div>
    <div style="background:#f4f4f5;padding:16px 24px;text-align:center;font-size:11px;color:#a1a1aa">
      Kronio Market — Notificación de cancelación
    </div>
  </div>
</body>
</html>`,
    });
    return true;
  }

  async sendOrderStatusEmail(
    to: string,
    name: string,
    orderId: string,
    status: string,
  ) {
    const statusLabels: Record<string, string> = {
      PENDING: 'Pendiente',
      PAID: 'Pagada',
      SHIPPED: 'Enviada',
      DELIVERED: 'Entregada',
      CANCELLED: 'Cancelada',
    };

    const label = statusLabels[status] || status;

    await this.send({
      to,
      subject: `Estado de tu orden #${orderId.slice(0, 8)}: ${label}`,
      tag: 'ORDER STATUS',
      text:
        `Hola ${name},\n\n` +
        `El estado de tu orden #${orderId.slice(0, 8)} ha cambiado a: ${label}\n\n` +
        (status === 'CANCELLED'
          ? 'Si tienes dudas, contáctanos.'
          : 'Gracias por confiar en nosotros.'),
    });
  }

  async sendTestEmail(
    to: string,
  ): Promise<{
    ok: boolean;
    smtpConfigured: boolean;
    mailerHost: string | null;
    smtpUser: string | null;
    to: string;
    error?: string;
  }> {
    const mailerHost = process.env.SMTP_HOST || null;
    const smtpUser = process.env.SMTP_USER || null;

    if (!this.transporter) {
      return {
        ok: false,
        smtpConfigured: false,
        mailerHost,
        smtpUser,
        to,
        error:
          'SMTP no configurado (faltan SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS en las variables de entorno)',
      };
    }

    if (!to) {
      return {
        ok: false,
        smtpConfigured: true,
        mailerHost,
        smtpUser,
        to,
        error: 'Falta el destinatario (ADMIN_EMAIL/ADMIN_GOOGLE_EMAIL o body.to)',
      };
    }

    const base = {
      smtpConfigured: true,
      mailerHost,
      smtpUser,
      to,
    };

    const probe = await this.probeSmtp(mailerHost || '', 587);
    if (!probe.ok) {
      return {
        ...base,
        ok: false,
        error: `No se puede conectar a ${mailerHost} desde Render: ${probe.error}.`,
      };
    }

    try {
      await this.withTimeout(this.transporter.verify(), 15000);
    } catch (err) {
      return {
        ...base,
        ok: false,
        error: `Credenciales SMTP RECHAZADAS por ${mailerHost}: ${
          err instanceof Error ? err.message : err
        }`,
      };
    }

    const sent = await this.sendHtml({
      to,
      subject: 'Prueba — Kronio Market',
      tag: 'SMTP TEST',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <div style="max-width:520px;margin:40px auto;background:#fff;border-radius:12px;padding:32px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
    <h1 style="color:#18181b;font-size:20px;margin:0 0 8px">Kronio Market</h1>
    <p style="color:#52525b;font-size:14px;margin:0">Correo de prueba enviado correctamente.</p>
    <p style="color:#71717a;font-size:12px;margin:20px 0 0;border-top:1px solid #e4e4e7;padding-top:12px">Desde ${smtpUser || 'SMTP'} · ${new Date().toLocaleString('es-CO')}</p>
  </div>
</body>
</html>`,
    });

    return {
      ...base,
      ok: sent,
      error: sent
        ? undefined
        : 'El mensaje no pudo enviarse (revisa los logs del servicio)',
    };
  }
}
