import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AIService } from './ai.service';
import { PromptInjectionGuard } from './guardrails/prompt-injection.guard';
import { StockPriceTool } from './tools/stock-price.tool';
import { TrackingTool } from './tools/tracking.tool';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * El camino sin OPENROUTER_API_KEY. No es un modo de pruebas: es el
 * que corre en produccion mientras la clave no este puesta, asi que todo lo
 * queprometa aqui le llega al cliente de verdad.
 */
describe('AIService sin clave de IA', () => {
  let categoryFindMany: jest.Mock;

  const montar = async (apiKey?: string) => {
    categoryFindMany = jest.fn().mockResolvedValue([]);

    const valores: Record<string, string | undefined> = {
      OPENROUTER_API_KEY: apiKey,
      OPENROUTER_MODEL: 'google/gemini-3.6-flash',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        {
          provide: ConfigService,
          useValue: { get: (clave: string) => valores[clave] },
        },
        {
          provide: PrismaService,
          useValue: {
            category: { findMany: categoryFindMany },
            product: { findMany: jest.fn().mockResolvedValue([]) },
          },
        },
        { provide: StockPriceTool, useValue: {} },
        { provide: TrackingTool, useValue: {} },
        {
          provide: PromptInjectionGuard,
          useValue: {
            sanitizeMessage: (m: string) => m,
            detectInjection: () => ({ isInjection: false, reason: '' }),
          },
        },
      ],
    }).compile();

    return module.get<AIService>(AIService);
  };

  const config = { sessionId: 'ses_1', isAdmin: false };

  it('avisa al arrancar que la IA real esta apagada', async () => {
    // Sin esto el arranque no decia nada. El bot respondia igual de bien, sin
    // un error en el log, y un despliegue con la clave faltante pasaba
    // desapercibido. Esta linea es la que lo hace visible.
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await montar(undefined);

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('OPENROUTER_API_KEY no esta configurada'),
    );
    warn.mockRestore();
  });

  it('anuncia el modelo cuando si hay clave', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await montar('una-clave');

    expect(log).toHaveBeenCalledWith(expect.stringContaining('OpenRouter'));
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('OPENROUTER_API_KEY'),
    );
    log.mockRestore();
    warn.mockRestore();
  });

  it('no promete rastrear pedidos que no puede rastrear', async () => {
    const service = await montar(undefined);

    const { text } = await service.processMessage(
      '¿mi pedido ya llegó?',
      [],
      config,
    );

    // Antes ofrecia rastrear la guia y pedia el numero. La herramienta
    // rastrearPedidoDropi solo la invoca el modelo, asi que el numero que
    // mandaba el cliente no servia para nada y acababa en el menu generico.
    // Ahora lo manda a Mis Pedidos, que si muestra el estado real.
    expect(text).toContain('Mis Pedidos');
    expect(text).not.toMatch(/número de guía|¿cuál es tu número/);
  });

  it('entiende un numero de guia suelto como consulta de estado', async () => {
    const service = await montar(undefined);

    const { text } = await service.processMessage('1234567890', [], config);

    // El numero es justo lo que el cliente contesta cuando le piden la guia.
    // Antes caia en UNKNOWN y recibia el menu de "que puedo hacer", que no
    // le servia de nada.
    expect(text).toContain('Mis Pedidos');
  });

  it('no inventa el tiempo de entrega ni el costo del envio', async () => {
    const service = await montar(undefined);

    // Ojo con la frase: casi cualquier pregunta de envio real cae antes en
    // PURCHASE, porque "cuanto", "precio" y "cuanto cuesta" estan en su regex y
    // ese intent se evalua antes que SHIPPING. Esta llega a SHIPPING porque no
    // lleva ninguna de esas palabras.
    const { text } = await service.processMessage(
      '¿tienen entrega a domicilio?',
      [],
      config,
    );

    // El "3 a 7 dias habiles" estaba escrito a mano y nadie lo comprobo. El
    // checkout no cobra flete aparte, asi que el monto tampoco se puede
    // prometer aqui. El system prompt ya prohibia inventar tiempos; ahora
    // el fallback local tampoco los inventa.
    expect(text).not.toMatch(/3 a 7|días hábiles|días habiles/);
    expect(text).not.toMatch(/¿En qué ciudad estás/);
  });
});
