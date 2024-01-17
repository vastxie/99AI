"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const handlebars_adapter_1 = require("@nestjs-modules/mailer/dist/adapters/handlebars.adapter");
const mailConfig = {
    transport: {
        host: process.env.MAILER_HOST || 'smtpdm.aliyun.com',
        port: process.env.MAILER_PORT || '80',
        auth: {
            user: process.env.MAILER_USER,
            pass: process.env.MAILER_PASS,
        },
    },
    defaults: {
        from: process.env.MAILER_FROM,
    },
    template: {
        dir: 'templates/mail',
        adapter: new handlebars_adapter_1.HandlebarsAdapter(),
        options: {
            strict: true,
        },
    },
};
exports.default = mailConfig;
