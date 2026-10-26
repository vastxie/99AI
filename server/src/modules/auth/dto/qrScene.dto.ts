import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class QrSceneDto {
  @ApiProperty({ example: 'login', description: 'login：扫码登录；bind：扫码绑定到当前账号' })
  @IsIn(['login', 'bind'], { message: '扫码场景不正确！' })
  scene: 'login' | 'bind';
}

export class QrPollDto extends QrSceneDto {
  @ApiProperty({ description: '创建场景时返回的 sceneId' })
  @IsNotEmpty({ message: 'sceneId 不能为空！' })
  @IsString({ message: 'sceneId 必须是字符串！' })
  @Length(16, 64, { message: 'sceneId 长度必须在16到64位之间' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'sceneId 格式不正确' })
  sceneId: string;
}
