-- Ajustes de la tienda (logo y video del banner) en base de datos.
--
-- Antes vivian en `api/settings.json`, un archivo en disco que en un servicio
-- sin disco persistente se regeneraba en cada deploy y perdia lo que el admin
-- hubiera subido.
--
-- Clave-valor para no migrar el esquema cada vez que aparece un ajuste nuevo.
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);
