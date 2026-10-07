import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { generateText } from 'ai';

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

  const montar = async (
    apiKey?: string,
    modelo = 'nvidia/nemotron-3-super-120b-a12b:free',
  ) => {
    categoryFindMany = jest.fn().mockResolvedValue([]);

    const valores: Record<string, string | undefined> = {
      OPENROUTER_API_KEY: apiKey,
      OPENROUTER_MODEL: modelo,
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

  it('entiende el plural de "envíos" y no manda el menu generico', async () => {
    const service = await montar(undefined);

    const { text } = await service.processMessage(
      '¿Hacen envíos a Cali?',
      [],
      config,
    );

    // Los \b de JavaScript son de ASCII: entre la "o" y la "s" de "envíos" no
    // hay borde de palabra, asi que "envío" de la lista no casaba y la
    // pregunta acababa en el menu de "que puedo hacer". Normalizando acentos y
    // listando el plural, cae en SHIPPING como debe.
    expect(text).toContain('Envíos a toda Colombia');
    expect(text).not.toContain('Soy **KronioBot**');
  });

  it('contesta el pago de la tienda cuando preguntan por Nequi', async () => {
    const service = await montar(undefined);

    const { text } = await service.processMessage(
      '¿Se puede pagar con Nequi?',
      [],
      config,
    );

    // Antes caia en UNKNOWN y el cliente se llevaba el menu. Contra entrega es
    // lo unico confirmado, y lo demas se manda a soporte en vez de prometerlo.
    expect(text).toContain('contra entrega');
    expect(text).toContain('Nequi');
    expect(text).not.toContain('Soy **KronioBot**');
  });

  it('dice que el producto no esta en vez de vender a ciegas', async () => {
    const service = await montar(undefined);

    const { text } = await service.processMessage(
      '¿Cuánto cuesta la lámpara LED?',
      [],
      config,
    );

    // PURCHASE sin resultados contestaba un "me encanta que quieras comprar"
    // que no decia nada del precio ni reconocia que no estaba el producto.
    expect(text).toContain('No encontré productos');
    expect(text).not.toContain('Me encanta que quieras comprar');
  });

  it('avisa al cliente cuando la IA falla en vez de fingir que respondio', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    // Hay clave, asi que el servicio intenta el modelo; el mock de generateText
    // devuelve undefined y la llamada revienta, que es lo que pasa en produccion
    // cuando OpenRouter devuelve 402 por credito agotado.
    const service = await montar('una-clave');

    const { text } = await service.processMessage('hola', [], config);

    // El aviso es la unica forma en que el cliente se entera de que la respuesta
    // viene del clasificador local y no del asistente.
    expect(text).toContain('modo básico');
    expect(text).toContain('Kronio Market');
    warn.mockRestore();
  });

  it('no deja un globo vacio cuando el modelo devuelve texto en blanco', async () => {
    // Pasa cuando el modelo se queda llamando herramientas hasta agotar los 5
    // pasos de stopWhen (tipico con un producto que no existe): el ultimo paso
    // es una tool call y result.text queda vacio, asi que el cliente veia un
    // globo en blanco.
    (generateText as jest.Mock).mockResolvedValueOnce({
      text: '',
      toolResults: [],
    });

    const service = await montar('una-clave');
    const { text } = await service.processMessage('hola', [], config);

    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toContain('catálogo');
  });

  it('salta al siguiente modelo cuando el principal se queda sin cuota', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const gen = generateText as jest.Mock;
    // El mock vive en todo el suite: se cuentan solo las llamadas de aqui.
    gen.mockClear();

    // Asi contesta OpenRouter cuando se acaba la cuota diaria de los
    // modelos gratuitos (429) o cuando no hay credito (402).
    gen.mockRejectedValueOnce(
      new Error('429 Rate limit exceeded: free-models-per-day'),
    );
    gen.mockResolvedValueOnce({
      text: 'respuesta del respaldo',
      toolResults: [],
    });

    const service = await montar('una-clave', 'modelo-agotado,modelo-respaldo');
    const { text } = await service.processMessage('hola', [], config);

    // Sin esto el cliente se habria llevado el fallback local (con su aviso)
    // aunque el segundo modelo estaba disponible.
    expect(text).toBe('respuesta del respaldo');
    expect(gen).toHaveBeenCalledTimes(2);

    gen.mockReset();
    warn.mockRestore();
    log.mockRestore();
  });

  it('salta de modelo cuando lo rechazan por app (403)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const gen = generateText as jest.Mock;
    gen.mockClear();

    // OpenRouter devuelve esto cuando un modelo esta restringido a cierto tipo
    // de app: no hay nada que reintentar contra ese modelo, hay que pasar al
    // siguiente de la lista.
    gen.mockRejectedValueOnce(
      new Error(
        'thinkingmachines/inkling:free is only available on agentic harnesses',
      ),
    );
    gen.mockResolvedValueOnce({
      text: 'respaldo que si contesta',
      toolResults: [],
    });

    const service = await montar('una-clave', 'modelo-restringido,modelo-ok');
    const { text } = await service.processMessage('hola', [], config);

    expect(text).toBe('respaldo que si contesta');
    expect(gen).toHaveBeenCalledTimes(2);

    gen.mockReset();
    warn.mockRestore();
  });

  it('no reintenta cuando el fallo no es de cuota', async () => {
    const gen = generateText as jest.Mock;
    gen.mockClear();
    gen.mockRejectedValueOnce(new Error('boom, bug nuestro'));

    const service = await montar('una-clave', 'modelo-a,modelo-b');

    // Un error propio no se arregla cambiando de modelo: repetirlo solo
    // alarga el fallo y tarda mas en llegar el aviso de modo basico.
    await expect(
      service.processMessage('hola', [], config),
    ).resolves.toMatchObject({
      text: expect.stringContaining('modo básico') as string,
    });
    expect(gen).toHaveBeenCalledTimes(1);

    gen.mockReset();
  });
});
