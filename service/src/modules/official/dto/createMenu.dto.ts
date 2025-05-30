import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

class ButtonBase {
  @ApiProperty({ description: '菜单标题，不超过16个字节，子菜单不超过60个字节' })
  @IsString()
  name: string;
}

class SubButton extends ButtonBase {
  @ApiProperty({ description: '菜单的响应动作类型', required: false })
  @IsString()
  type?: string;

  @ApiProperty({ description: '菜单KEY值，用于消息接口推送，不超过128字节', required: false })
  @IsString()
  key?: string;

  @ApiProperty({ description: '网页链接，用户点击菜单可打开链接，不超过1024字节', required: false })
  @IsString()
  url?: string;

  @ApiProperty({ description: '调用新增永久素材接口返回的合法media_id', required: false })
  @IsString()
  media_id?: string;

  @ApiProperty({ description: '小程序的appid（仅认证公众号可配置）', required: false })
  @IsString()
  appid?: string;

  @ApiProperty({ description: '小程序的页面路径', required: false })
  @IsString()
  pagepath?: string;

  @ApiProperty({ description: '发布后获得的合法article_id', required: false })
  @IsString()
  article_id?: string;
}

class Button extends ButtonBase {
  @ApiProperty({ description: '菜单的响应动作类型', required: false })
  @IsString()
  type?: string;

  @ApiProperty({ description: '菜单KEY值，用于消息接口推送，不超过128字节', required: false })
  @IsString()
  key?: string;

  @ApiProperty({ description: '网页链接，用户点击菜单可打开链接，不超过1024字节', required: false })
  @IsString()
  url?: string;

  @ApiProperty({ description: '二级菜单数组，个数应为1~5个', required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubButton)
  sub_button?: SubButton[];

  @ApiProperty({ description: '调用新增永久素材接口返回的合法media_id', required: false })
  @IsString()
  media_id?: string;

  @ApiProperty({ description: '小程序的appid（仅认证公众号可配置）', required: false })
  @IsString()
  appid?: string;

  @ApiProperty({ description: '小程序的页面路径', required: false })
  @IsString()
  pagepath?: string;

  @ApiProperty({ description: '发布后获得的合法article_id', required: false })
  @IsString()
  article_id?: string;
}

export class CreateMenuDto {
  @ApiProperty({ description: '一级菜单数组，个数应为1~3个' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Button)
  button: Button[];
}
