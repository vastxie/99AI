import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmBindDto {
  @IsNotEmpty({ message: 'sessionId 不能为空' })
  @IsString()
  sessionId: string;
}
