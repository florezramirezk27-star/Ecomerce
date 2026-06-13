import { IsString, IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsString()
  @IsIn(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'])
  status: string;
}
