import { ApiProperty } from '@nestjs/swagger';

export class DelByGroupDto {
  @ApiProperty({ example: 1, description: '对话组Id', required: true })
  groupId: number;
}
