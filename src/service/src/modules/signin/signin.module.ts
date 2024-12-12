import { Global, Module } from '@nestjs/common';
import { SigninController } from './signin.controller';
import { SigninService } from './signin.service';
import { Type } from 'class-transformer';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SigninEntity } from './signIn.entity';
import { UserEntity } from '../user/user.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SigninEntity, UserEntity])],
  controllers: [SigninController],
  providers: [SigninService],
  exports: [SigninService],
})
export class SigninModule {}
