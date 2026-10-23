import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PromptInjectionGuard {
  private readonly logger = new Logger(PromptInjectionGuard.name);

  private readonly INJECTION_PATTERNS = [
    /\bignore\s+(all\s+)?(previous|above|below)\s+(instructions|directions|prompts)\b/i,
    /\bforget\s+(all\s+)?(previous|above|below)\b/i,
    /\byou\s+are\s+(now|not\s+an?)\s+(a\s+)?(free|unrestricted|unbounded|jailbroken|hypothetical|roleplay)\b/i,
    /\brespond\s+as\s+if\b/i,
    /\byou\s+don'?t\s+(have\s+to|need\s+to)\s+(follow|obey|adhere)\b/i,
    /\bact\s+as\s+(a\s+)?(hypothetical|unrestricted|free)\b/i,
    /\bnew\s+rule\b/i,
    /\boverride\s+(system\s+)?prompt\b/i,
    /\byour\s+new\s+(name|role|identity|persona)\s+is\b/i,
    // El patron DAN iba a secas y en insensitive: casaba con el verbo "dan"
    // en español ("¿me dan descuento?", "¿qué dan en promoción?") y el
    // cliente se llevaba el rechazo de inyeccion, como si el bot no supiera
    // responder. Ahora exige contexto de jailbreak; el de "olvida
    // instrucciones" cubre ademas el intento clasico traducido.
    /\b(olvida|ignora|descarta)\s+(todas\s+)?las?\s+(instrucciones|reglas)\s+(anteriores|previas|antiguas|de\s+arriba|superiores)\b/i,
    /\b(you are|act as|become|roleplay as|enter)\s+(the\s+)?DAN\b/i,
    /\bDAN\s+(mode|jailbreak|persona)\b/i,
    /\bdo\s+anything\s+now\b/i,
    /\bno\s+(restrictions|limits|boundaries|rules|filters)\b/i,
    /\boutput\s+without\s+(filters|restrictions|censorship)\b/i,
    /\brewrite\s+(the\s+)?(system\s+)?prompt\b/i,
    /\bshow\s+me\s+(the\s+)?(system\s+)?prompt\b/i,
    /\bleak\s+(the\s+)?(system\s+)?prompt\b/i,
    /\bprint\s+(the\s+)?(system\s+)?prompt\b/i,
    /\btell\s+me\s+(the\s+)?(system\s+)?(prompt|instructions)\b/i,
    /\bchange\s+(the\s+)?(system\s+)?prompt\b/i,
    /\bupdate\s+(the\s+)?(system\s+)?(prompt|rules)\b/i,
    /\bmodify\s+(your\s+)?(behavior|rules|instructions)\b/i,
    /\byou\s+must\s+(respond|answer|reply|reply)\s+in\s+a\b(?!.*(helpful|friendly|kind))/i,
  ];

  private readonly SENSITIVE_ACTIONS = [
    /DROP\s+TABLE/i,
    /DELETE\s+FROM/i,
    /UPDATE\s+.*SET/i,
    /TRUNCATE/i,
    /GRANT\s+ALL/i,
    /EXEC(\s+|\()/i,
    /EVAL\s*\(/i,
    /require\(['"]fs['"]\)/i,
    /process\.env/i,
    /fs\.(read|write|exec)/i,
  ];

  sanitizeMessage(message: string): string {
    // Los caracteres de control C0 (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F) no
    // aportan nada a un mensaje y rompen el parseo posterior; TAB, LF y CR se
    // conservan porque separan lineas. El patron va en una plantilla (no en un
    // literal con \x00..) porque no-control-regex marca esos escapes como
    // caracteres de control intencionales.
    const controlChars = new RegExp(
      `[\u0000-\u0008\u000B\u000C\u000E-\u001F]`,
      'g',
    );
    return message
      .replace(controlChars, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
  }

  detectInjection(message: string): {
    isInjection: boolean;
    confidence: number;
    reason?: string;
  } {
    const sanitized = this.sanitizeMessage(message);
    let maxConfidence = 0;
    let reason: string | undefined;

    for (const pattern of this.INJECTION_PATTERNS) {
      if (pattern.test(sanitized)) {
        maxConfidence = Math.max(maxConfidence, 0.85);
        reason = `Prompt injection pattern detected: ${pattern}`;
      }
    }

    for (const pattern of this.SENSITIVE_ACTIONS) {
      if (pattern.test(sanitized)) {
        maxConfidence = Math.max(maxConfidence, 0.95);
        reason = `Sensitive action pattern detected: ${pattern}`;
      }
    }

    const systemInstructionWords = [
      'system',
      'prompt',
      'instruction',
      'rule',
      'guideline',
      'constraint',
    ];
    const instructionCount = systemInstructionWords.filter((w) =>
      sanitized.toLowerCase().includes(w),
    ).length;

    if (instructionCount >= 3 && sanitized.length > 100) {
      maxConfidence = Math.max(maxConfidence, 0.7);
      reason = 'Multiple system instruction references detected';
    }

    if (maxConfidence > 0) {
      this.logger.warn(
        `Injection detected (${Math.round(maxConfidence * 100)}%): ${sanitized.slice(0, 100)}`,
      );
    }

    return {
      isInjection: maxConfidence >= 0.7,
      confidence: maxConfidence,
      reason,
    };
  }

  isSqlInjectionAttempt(input: string): boolean {
    const sqlPatterns = [
      /['"]\s*OR\s*['"]/i,
      /['"]\s*OR\s*1\s*=\s*1/i,
      /;\s*DROP\s+/i,
      /;\s*DELETE\s+/i,
      /;\s*UPDATE\s+/i,
      /UNION\s+SELECT/i,
      /pg_sleep/i,
      /waitfor\s+delay/i,
    ];
    return sqlPatterns.some((p) => p.test(input));
  }
}
