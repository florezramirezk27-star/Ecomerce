import { IsString, IsNumber, IsOptional, Min, IsArray } from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  oldPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lowStockThreshold?: number;

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

  @IsOptional()
  @IsString()
  customCode?: string;

  /** Landing larga (HTML/CSS/JS). Se renderiza en un iframe con sandbox. */
  @IsOptional()
  @IsString()
  landingCode?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  active?: boolean;
}
