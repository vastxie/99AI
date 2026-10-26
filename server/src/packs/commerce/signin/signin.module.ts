import { forwardRef, Global, Module } from '@nestjs/common';
import { SigninController } from './signin.controller';
import { SigninService } from './signin.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SigninEntity } from './signIn.entity';
import { UserEntity } from '@/modules/user/user.entity';
import { UserModule } from '@/modules/user/user.module';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SigninEntity, UserEntity]), forwardRef(() => UserModule)],
  controllers: [SigninController],
  providers: [SigninService],
  exports: [SigninService],
})
export class SigninModule {}
