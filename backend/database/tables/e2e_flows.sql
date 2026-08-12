IF OBJECT_ID('dbo.e2e_flows', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.e2e_flows (
        id               UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_e2e_flows PRIMARY KEY,
        [module]         NVARCHAR(200) NOT NULL,
        submodule        NVARCHAR(200) NULL,
        [page]           NVARCHAR(300) NULL,
        name             NVARCHAR(300) NOT NULL,
        url              NVARCHAR(800) NULL,
        tipo             VARCHAR(20)   NULL,
        [status]         VARCHAR(20)   NULL,
        last_ok          BIT           NULL,
        last_passed      INT           NULL,
        last_failed      INT           NULL,
        last_run_at      DATETIME2(3)  NULL,
        assertion_count  INT           NOT NULL CONSTRAINT DF_e2e_assert_count DEFAULT (0),
        data             NVARCHAR(MAX) NOT NULL,
        created_at       DATETIME2(3)  NOT NULL,
        updated_at       DATETIME2(3)  NOT NULL CONSTRAINT DF_e2e_updated DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX IX_e2e_ctx     ON dbo.e2e_flows ([module], submodule, [page]);
    CREATE INDEX IX_e2e_lastrun ON dbo.e2e_flows (last_run_at DESC);
END;
