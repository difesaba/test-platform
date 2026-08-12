/* =====================================================================
   Índices de dbo.audit_events — idempotentes (guardados por sys.indexes).
   ===================================================================== */

/* Listado por tiempo (SELECT TOP (N) ... ORDER BY ts DESC) */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_audit_ts' AND object_id = OBJECT_ID('dbo.audit_events')
)
    CREATE INDEX IX_audit_ts ON dbo.audit_events (ts DESC);
GO

/* Filtro híbrido por contexto (ejecuciones por empresa+entorno) */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_audit_ctx' AND object_id = OBJECT_ID('dbo.audit_events')
)
    CREATE INDEX IX_audit_ctx ON dbo.audit_events (empresa_nombre, entorno, ts DESC);
GO
