import { ApiProperty } from '@nestjs/swagger';

export class DelDto {
  @ApiProperty({ example: 1, description: '对话Id', required: true })
  id: number;
}
