import { Injectable, Logger } from '@nestjs/common';
import https from 'https';
import { AVEONLINE_BASE_HOST, AveonlineHttpResponse } from './aveonline.types';

@Injectable()
export class AveonlineClient {
  private readonly logger = new Logger(AveonlineClient.name);
  private readonly TIMEOUT = 20000;

  async request(
    path: string,
    method: string,
    body: object,
    token?: string,
    host: string = AVEONLINE_BASE_HOST,
  ): Promise<AveonlineHttpResponse> {
    const bodyStr = JSON.stringify(body ?? {});

    const extraHeaders: Record<string, string> = {};
    if (token) {
      extraHeaders['Authorization'] = token;
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
            'Content-Length': Buffer.byteLength(bodyStr),
            Accept: 'application/json, text/plain, */*',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
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
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }
}
