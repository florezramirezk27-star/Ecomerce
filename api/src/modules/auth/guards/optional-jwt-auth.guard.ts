import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(err: any, user: TUser): TUser {
    // Passport entrega `false`/`null` cuando no hay usuario: se devuelve tal
    // cual para que el controlador decida (guard opcional).
    return (user || null) as TUser;
  }
}
