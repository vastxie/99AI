import { Injectable, NestMiddleware } from '@nestjs/common';
import * as bodyParser from 'body-parser';

const bodyParserMiddleware = bodyParser.text({
  type: 'application/xml',
});

@Injectable()
export class XMLMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    bodyParserMiddleware(req, res, next);
  }
}
