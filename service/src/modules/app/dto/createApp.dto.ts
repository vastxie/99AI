import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsIn, IsNumber, IsOptional } from 'class-validator';

export class CreateAppDto {
  @ApiProperty({ example: '前端助手', description: 'app名称', required: true })
  @IsDefined({ message: 'app名称是必传参数' })
  name: string;

  @ApiProperty({
    example: '1,2,3',
    description: 'app分类Id列表，多个分类Id以逗号分隔',
    required: true,
  })
  @IsDefined({ message: 'app分类Id必传参数' })
  catId: string;

  @ApiProperty({
    example: '适用于编程编码、期望成为您的编程助手',
    description: 'app名称详情描述',
    required: false,
  })
  @IsDefined({ message: 'app名称描述是必传参数' })
  des: string;

  @ApiProperty({
    example: '你现在是一个翻译官。接下来我说的所有话帮我翻译成中文',
    description: '预设的prompt',
    required: false,
  })
  @IsOptional()
  preset: string;

  @ApiProperty({
    example: 'GPTs 的调用ID',
    description: 'GPTs 使用的 ID',
    required: false,
  })
  @IsOptional()
  gizmoID: string;

  @ApiProperty({ description: '是否GPTs', required: false })
  @IsOptional()
  isGPTs: number;

  @ApiProperty({
    example: 'https://xxxx.png',
    description: '套餐封面图片',
    required: false,
  })
  @IsOptional()
  coverImg: string;

  @ApiProperty({
    example: 100,
    description: '套餐排序、数字越大越靠前',
    required: false,
  })
  @IsOptional()
  order: number;

  @ApiProperty({
    example: 1,
    description: '套餐状态 0：禁用 1：启用',
    required: true,
  })
  @IsNumber({}, { message: '套餐状态必须是Number' })
  @IsIn([0, 1, 3, 4, 5], { message: '套餐状态错误' })
  status: number;

  @ApiProperty({
    example: '这是一句示例数据',
    description: 'app示例数据',
    required: false,
  })
  demoData: string;

  @ApiProperty({
    example: 'system',
    description: '创建的角色',
    required: false,
  })
  role: string;

  @ApiProperty({
    example: 0,
    description: '是否使用flowith模型',
    required: false,
  })
  isFlowith: number;

  @ApiProperty({
    example: 'flowith模型ID',
    description: 'flowith模型ID',
    required: false,
  })
  flowithId: string;

  @ApiProperty({
    example: 'flowith模型名称',
    description: 'flowith模型名称',
    required: false,
  })
  flowithName: string;

  @ApiProperty({
    example: 'flowith模型Key',
    description: 'flowith模型Key',
    required: false,
  })
  flowithKey: string;
}
