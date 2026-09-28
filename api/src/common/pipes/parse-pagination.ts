import { BadRequestException } from '@nestjs/common';

/** Tope duro de resultados por pagina en endpoints publicos. */
export const MAX_PAGE_SIZE = 100;

/**
 * Parsea `page` y `limit` de query params.
 *
 * Antes se hacia `Number(param)` y se pasaba tal cual: `?limit=abc` llegaba como
 * `NaN` y `?limit=10000000` se aceptaba sin limite, lo que permite agotar la
 * memoria del servidor con una sola peticion.
 */
export function parsePagination(
  page?: string,
  limit?: string,
  defaultLimit = 20,
): { page: number; limit: number } {
  const parsedPage = parsePositiveInt(page, 'page');
  const parsedLimit = parsePositiveInt(limit, 'limit');

  return {
    page: parsedPage ?? 1,
    limit: Math.min(parsedLimit ?? defaultLimit, MAX_PAGE_SIZE),
  };
}

function parsePositiveInt(value: string | undefined, field: string) {
  if (value === undefined || value === '') return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(
      `El parametro "${field}" debe ser un entero positivo`,
    );
  }

  return parsed;
}
