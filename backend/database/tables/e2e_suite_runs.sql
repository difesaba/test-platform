IF OBJECT_ID('dbo.e2e_suite_runs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.e2e_suite_runs (
        id              UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_e2e_suite_runs PRIMARY KEY,
        suite_id        UNIQUEIDENTIFIER NOT NULL,
        suite_name      NVARCHAR(300) NULL,
        run_at          DATETIME2(3)  NOT NULL,
        total           INT NOT NULL CONSTRAINT DF_esr_total  DEFAULT (0),
        passed          INT NOT NULL CONSTRAINT DF_esr_passed DEFAULT (0),
        failed          INT NOT NULL CONSTRAINT DF_esr_failed DEFAULT (0),
        ok              BIT NOT NULL CONSTRAINT DF_esr_ok     DEFAULT (0),
        empresa_nombre  NVARCHAR(200) NULL,
        entorno         NVARCHAR(200) NULL,
        data            NVARCHAR(MAX) NULL,
        created_at      DATETIME2(3)  NOT NULL CONSTRAINT DF_esr_created DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX IX_esr_suite ON dbo.e2e_suite_runs (suite_id, run_at DESC);
    CREATE INDEX IX_esr_runat ON dbo.e2e_suite_runs (run_at DESC);
END;
