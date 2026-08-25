import { IsString, IsOptional, MinLength, IsEmail } from 'class-validator';

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

  @IsEmail()
  @IsOptional()
  shippingEmail?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
