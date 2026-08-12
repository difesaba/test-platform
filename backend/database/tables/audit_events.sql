/* =====================================================================
   Tabla de auditoría — dbo.audit_events
   Fuente de verdad idempotente: se puede aplicar N veces sin romper.
   La app inserta un UNIQUEIDENTIFIER (randomUUID) como PK.
   ===================================================================== */
IF OBJECT_ID('dbo.audit_events', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.audit_events (
        id              UNIQUEIDENTIFIER NOT NULL
                          CONSTRAINT PK_audit_events PRIMARY KEY,   -- randomUUID() de la app
        ts              DATETIME2(3)     NOT NULL,                  -- momento del evento (UTC/ISO)
        [type]          VARCHAR(20)      NOT NULL,                  -- 'structural' | 'execution'
        [action]        NVARCHAR(60)     NOT NULL,                  -- crear | editar | eliminar | ejecutar | configurar ...
        target          NVARCHAR(400)    NOT NULL,                  -- sobre qué (módulo/página/flujo/swagger...)
        empresa_nombre  NVARCHAR(200)    NULL,                      -- contexto: empresa
        entorno         NVARCHAR(60)     NULL,                      -- contexto: pruebas | replica | produccion
        url_raiz        NVARCHAR(400)    NULL,
        meta            NVARCHAR(MAX)    NULL,                      -- JSON libre (detalles extra)
        created_at      DATETIME2(3)     NOT NULL
                          CONSTRAINT DF_audit_created DEFAULT SYSUTCDATETIME()
    );
END;
