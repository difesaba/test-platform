import CryptoJS from 'crypto-js';

const KEY = CryptoJS.enc.Utf8.parse('51nc0soft_5.A.5.');
const IV  = CryptoJS.enc.Utf8.parse('_T1cs|Fon*5o_S45');

// Replica String.prototype.toAESEncrypt de S5.js de Sinco
export function encryptPassword(plaintext: string): string {
    const iterations = Math.floor(Math.random() * 9) + 1;

    const encrypt = (data: CryptoJS.lib.WordArray | string) =>
        CryptoJS.AES.encrypt(data as CryptoJS.lib.WordArray, KEY, {
            keySize: 16,
            iv: IV,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7,
        });

    let result = encrypt(CryptoJS.enc.Utf8.parse(plaintext));

    for (let i = 0; i < iterations; i++) {
        result = encrypt(CryptoJS.enc.Utf8.parse(result.toString()));
    }

    return result.toString() + iterations;
}
