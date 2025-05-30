import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
// import { RedisService } from './../../redis/redis.service';
import { RedisCacheService } from '@/modules/redisCache/redisCache.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly redisService: RedisCacheService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: redisService.getJwtSecret(),
    });
  }

  /* fromat decode token return */
  async validate(payload): Promise<any> {
    return payload;
  }
}
