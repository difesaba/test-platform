IF OBJECT_ID('dbo.e2e_runs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.e2e_runs (
        id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_e2e_runs PRIMARY KEY,
        flow_id          UNIQUEIDENTIFIER NOT NULL,
        [module]         NVARCHAR(200) NOT NULL,
        submodule        NVARCHAR(200) NULL,
        [page]           NVARCHAR(300) NULL,
        flow_name        NVARCHAR(300) NULL,
        tipo             VARCHAR(20)   NULL,
        run_at           DATETIME2(3)  NOT NULL,
        passed           INT           NOT NULL CONSTRAINT DF_e2e_runs_passed DEFAULT (0),
        failed           INT           NOT NULL CONSTRAINT DF_e2e_runs_failed DEFAULT (0),
        ok               BIT           NOT NULL CONSTRAINT DF_e2e_runs_ok     DEFAULT (0),
        step_count       INT           NULL,
        assertion_total  INT           NOT NULL CONSTRAINT DF_e2e_runs_atot   DEFAULT (0),
        assertion_failed INT           NOT NULL CONSTRAINT DF_e2e_runs_afail  DEFAULT (0),
        empresa_nombre   NVARCHAR(200) NULL,
        sucursal_nombre  NVARCHAR(200) NULL,
        entorno          NVARCHAR(200) NULL,
        url_raiz         NVARCHAR(800) NULL,
        data             NVARCHAR(MAX) NULL,
        created_at       DATETIME2(3)  NOT NULL CONSTRAINT DF_e2e_runs_created DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX IX_e2e_runs_flow  ON dbo.e2e_runs (flow_id, run_at DESC);
    CREATE INDEX IX_e2e_runs_ctx   ON dbo.e2e_runs ([module], submodule, [page]);
    CREATE INDEX IX_e2e_runs_runat ON dbo.e2e_runs (run_at DESC);
END;
