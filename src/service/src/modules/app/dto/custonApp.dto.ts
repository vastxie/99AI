import { IsNotEmpty, MinLength, MaxLength, IsString, IsIn, IsOptional, Max, Min, ValidateNested, IsNumber, IsDefined } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CustomAppDto {
  @ApiProperty({ example: '前端助手', description: 'app名称', required: true })
  name: string;

  @ApiProperty({ example: 1, description: 'app分类Id', required: true })
  catId: number;

  @ApiProperty({
    example: '适用于编程编码、期望成为您的编程助手',
    description: 'app名称详情描述',
    required: false,
  })
  @IsDefined({ message: 'app名称描述是必传参数' })
  des: string;

  @ApiProperty({ example: '你现在是一个翻译官。接下来我说的所有话帮我翻译成中文', description: '预设的prompt', required: true })
  preset: string;

  @ApiProperty({ example: 'https://xxxx.png', description: '套餐封面图片', required: false })
  coverImg: string;

  @ApiProperty({ example: '这是一句示例数据', description: 'app示例数据', required: false })
  demoData: string;

  @ApiProperty({ example: false, description: '是否共享到所有人', required: false })
  public: boolean;

  @ApiProperty({ example: 1, description: '应用ID', required: false })
  @IsOptional()
  appId: number;
}
