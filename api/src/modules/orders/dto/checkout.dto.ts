import { IsArray, IsString, IsOptional, MinLength } from 'class-validator';

export class CheckoutDto {
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @MinLength(1)
  shippingName: string;

  @IsString()
  @MinLength(1)
  shippingPhone: string;

  @IsString()
  @MinLength(1)
  shippingAddress: string;

  @IsString()
  @MinLength(1)
  shippingCity: string;

  @IsString()
  @MinLength(1)
  shippingState: string;

  @IsString()
  @IsOptional()
  shippingZip?: string;

  // El formato lo valida `checkoutSchema` (Zod). No se usa `@IsEmail` aqui
  // porque el campo es opcional y class-validator rechaza el string vacio.
  @IsString()
  @IsOptional()
  shippingEmail?: string;

  @IsString()
  @IsOptional()
  shippingDocType?: string;

  @IsString()
  @IsOptional()
  shippingDocNumber?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /**
   * Items del carrito del INVITADO (checkout sin sesión). El ZodValidationPipe
   * del controlador hace la validación real; aquí solo se declara para que el
   * `whitelist` del ValidationPipe global no la elimine antes de llegar a Zod.
   * El usuario registrado no los envía: su carrito vive en el servidor.
   */
  @IsOptional()
  @IsArray()
  items?: Array<{
    productId: string;
    quantity: number;
    variationId?: number;
  }>;
}
