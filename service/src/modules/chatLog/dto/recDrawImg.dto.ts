import { ApiProperty } from '@nestjs/swagger';

export class recDrawImgDto {
  @ApiProperty({ example: 1, description: '推荐图片的id' })
  id: number;
}
