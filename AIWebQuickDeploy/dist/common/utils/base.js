"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decrypt = exports.encrypt = void 0;
const crypto = require("crypto");
const encryptionKey = 'bf3c116f2470cb4che9071240917c171';
const initializationVector = '518363fh72eec1v4';
const algorithm = 'aes-256-cbc';
function encrypt(text) {
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, initializationVector);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}
exports.encrypt = encrypt;
function decrypt(text) {
    try {
        const decipher = crypto.createDecipheriv(algorithm, encryptionKey, initializationVector);
        let decrypted = decipher.update(text, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    catch (error) {
        process.exit(1);
    }
}
exports.decrypt = decrypt;
