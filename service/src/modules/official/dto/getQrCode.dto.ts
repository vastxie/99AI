import { IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetQrCodeDto {
  @ApiProperty({
    example: 'dasdasg2441lk1o24bk',
    description: '1-64位的字符参数',
    required: true,
  })
  @IsDefined({ message: 'sceneStr是必传参数' })
  sceneStr: string;
}
