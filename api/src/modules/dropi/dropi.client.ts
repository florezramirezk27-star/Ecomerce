import { Injectable, Logger } from '@nestjs/common';
import https from 'https';
import { DropiHttpResponse } from './dropi.types';

@Injectable()
export class DropiClient {
  private readonly logger = new Logger(DropiClient.name);
  private readonly HOST = 'api.dropi.co';
  private readonly TIMEOUT = 15000;

  async request(
    path: string,
    method: string,
    body?: object,
    token?: string,
    host: string = this.HOST,
  ): Promise<DropiHttpResponse> {
    const hasBody = body !== undefined;
    const bodyStr = hasBody ? JSON.stringify(body) : '';

    const extraHeaders: Record<string, string> = {};
    if (token) {
      extraHeaders['X-Authorization'] = `Bearer ${token}`;
    }

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: host,
          path,
          method,
          timeout: this.TIMEOUT,
          headers: {
            'Content-Type': 'application/json',
            ...(hasBody
              ? { 'Content-Length': Buffer.byteLength(bodyStr) }
              : {}),
            Origin: 'https://app.dropi.co',
            Referer: 'https://app.dropi.co/',
            Accept: 'application/json, text/plain, */*',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
            'sec-ch-ua':
              '"Google Chrome";v="149", "Chromium";v="149", "Not)A;Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"',
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-site',
            ...extraHeaders,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ statusCode: res.statusCode, data }));
        },
      );

      req.on('error', reject);
      if (hasBody) req.write(bodyStr);
      req.end();
    });
  }
}
