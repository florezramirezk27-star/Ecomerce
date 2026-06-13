import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface Settings {
  logo: string | null;
}

@Injectable()
export class SettingsService {
  private readonly filePath: string;

  constructor() {
    this.filePath = path.resolve(__dirname, '../../../settings.json');
    this.ensureFile();
  }

  private ensureFile() {
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify({ logo: null }), 'utf-8');
    }
  }

  private read(): Settings {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
    } catch {
      return { logo: null };
    }
  }

  private write(data: Settings) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  getLogo(): string | null {
    return this.read().logo;
  }

  setLogo(url: string) {
    const data = this.read();
    data.logo = url;
    this.write(data);
  }

  removeLogo() {
    const data = this.read();
    data.logo = null;
    this.write(data);
  }
}
