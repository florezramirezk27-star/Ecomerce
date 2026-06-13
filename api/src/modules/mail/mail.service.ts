import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

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
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
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
      });
      this.logger.log('Mail transporter configured');
    } else {
      this.logger.warn(
        'SMTP not configured — emails will be logged to console only',
      );
    }
  }

  private async send(options: {
    to: string;
    subject: string;
    text: string;
    tag: string;
  }) {
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@ecommerce.com',
          to: options.to,
          subject: options.subject,
          text: options.text,
        });
      } catch (err) {
        this.logger.error(`Error sending ${options.tag} email: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.logger.log(`[${options.tag}] To: ${options.to} | ${options.subject}`);
  }

  private async sendHtml(options: {
    to: string;
    subject: string;
    html: string;
    tag: string;
  }) {
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@ecommerce.com',
          to: options.to,
          subject: options.subject,
          html: options.html,
        });
      } catch (err) {
        this.logger.error(`Error sending ${options.tag} email: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.logger.log(`[${options.tag}] To: ${options.to} | ${options.subject}`);
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetLink: string,
  ) {
    await this.send({
      to,
      subject: 'Recuperación de contraseña',
      tag: 'PASSWORD RESET',
      text:
        `Hola ${name},\n\n` +
        `Recibimos una solicitud para restablecer tu contraseña.\n\n` +
        `Haz clic en el siguiente enlace para crear una nueva contraseña:\n${resetLink}\n\n` +
        `Este enlace expirará en 1 hora.\n\n` +
        `Si no solicitaste este cambio, ignora este correo.\n`,
    });
  }

  async sendVerificationCode(
    to: string,
    name: string,
    code: string,
  ) {
    await this.sendHtml({
      to,
      subject: 'Código de verificación - Kronio Market',
      tag: 'VERIFICATION CODE',
      html:
        `<!DOCTYPE html>
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
  ) {
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

    const shippingHtml = shipping
      ? `<div style="margin-top:24px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e4e4e7">
          <h3 style="margin:0 0 10px;font-size:14px;color:#18181b;font-weight:700">Dirección de envío</h3>
          <p style="margin:0;font-size:13px;color:#52525b;line-height:1.6">
            ${shipping.name}<br>
            ${shipping.phone}<br>
            ${shipping.email ? `${shipping.email}<br>` : ''}
            ${shipping.address}<br>
            ${shipping.city}, ${shipping.state}${shipping.zip ? ` — ${shipping.zip}` : ''}
          </p>
          ${shipping.notes ? `<p style="margin:8px 0 0;font-size:12px;color:#71717a;font-style:italic">Notas: ${shipping.notes}</p>` : ''}
        </div>`
      : '';

    await this.sendHtml({
      to,
      subject: `Factura de compra #${orderId.slice(0, 8)} — Kronio Market`,
      tag: 'ORDER CONFIRMATION',
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0">
  <div style="max-width:600px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
    <div style="background:#18181b;padding:32px 24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:1px">KRONIO MARKET</h1>
      <p style="color:#a1a1aa;margin:6px 0 0;font-size:13px">Factura electrónica</p>
    </div>
    <div style="padding:32px 24px">
      <p style="color:#333;font-size:15px;line-height:1.5">Hola <strong>${name}</strong>,</p>
      <p style="color:#333;font-size:15px;line-height:1.5">Gracias por tu compra. Aquí están los detalles de tu factura:</p>

      <div style="background:#f4f4f5;border-radius:8px;padding:16px;margin:20px 0">
        <table style="width:100%;font-size:13px;color:#52525b">
          <tr>
            <td style="padding:4px 0">N° de factura</td>
            <td style="padding:4px 0;text-align:right;font-weight:bold;color:#18181b">${orderId}</td>
          </tr>
          <tr>
            <td style="padding:4px 0">Fecha</td>
            <td style="padding:4px 0;text-align:right;font-weight:bold;color:#18181b">${new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
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

      ${shippingHtml}

      <div style="margin-top:24px;padding:16px;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
        <p style="margin:0;font-size:13px;color:#166534;line-height:1.6">
          <strong>💵 Pago contra entrega</strong><br>
          Pagarás en efectivo cuando recibas tu pedido. Ten el monto exacto disponible.
        </p>
      </div>

      <p style="color:#666;font-size:13px;margin-top:24px;border-top:1px solid #e4e4e7;padding-top:16px">
        Te notificaremos cuando el estado de tu pedido cambie.<br><br>
        Si tienes dudas, responde a este correo.
      </p>
    </div>
    <div style="background:#f4f4f5;padding:16px 24px;text-align:center;font-size:11px;color:#a1a1aa">
      Kronio Market — Tu tienda de confianza
    </div>
  </div>
</body>
</html>`,
    });
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
}
