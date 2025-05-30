import { ApiProperty } from '@nestjs/swagger';

export class DelBadWordsDto {
  @ApiProperty({ example: 1, description: '敏感词id', required: true })
  id: number;
}
