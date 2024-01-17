"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSwagger = void 0;
const swagger_1 = require("@nestjs/swagger");
const swaggerOptions = new swagger_1.DocumentBuilder()
    .setTitle('Nine Team api document')
    .setDescription('Nine Team api document')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
function createSwagger(app) {
    const document = swagger_1.SwaggerModule.createDocument(app, swaggerOptions);
    swagger_1.SwaggerModule.setup('/nineai/swagger/docs', app, document);
}
exports.createSwagger = createSwagger;
