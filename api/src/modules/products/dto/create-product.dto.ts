import { IsString, IsNumber, IsOptional, Min, IsArray } from 'class-validator';

export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  oldPrice?: number;

  @IsNumber()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  gallery?: string[];

  @IsOptional()
  @IsString()
  video?: string;

  /**
   * Videos del producto (lista completa). `video` sigue existiendo como
   * el primero de la lista, por compatibilidad con quien solo lee ese.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];

  @IsOptional()
  @IsString()
  customCode?: string;

  /** Landing larga (HTML/CSS/JS). Se renderiza en un iframe con sandbox. */
  @IsOptional()
  @IsString()
  landingCode?: string;

  @IsString()
  categoryId: string;
}
