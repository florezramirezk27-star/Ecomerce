import { JwtService } from '@nestjs/jwt';

export interface WsTicketPayload {
  userId: string;
  role: string;
}

let jwtService: JwtService;

const TICKET_TTL_S = 60;

function getJwtService(): JwtService {
  if (!jwtService) {
    jwtService = new JwtService({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: `${TICKET_TTL_S}s` },
    });
  }
  return jwtService;
}

export class WsTicketStore {
  static create(userId: string, role: string): string {
    const svc = getJwtService();
    return svc.sign({ userId, role });
  }

  static consume(ticket: string): WsTicketPayload | null {
    try {
      const svc = getJwtService();
      const payload = svc.verify<{ userId: string; role: string }>(ticket);
      return { userId: payload.userId, role: payload.role };
    } catch {
      return null;
    }
  }
}
