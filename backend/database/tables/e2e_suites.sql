IF OBJECT_ID('dbo.e2e_suites', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.e2e_suites (
        id           UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_e2e_suites PRIMARY KEY,
        name         NVARCHAR(300)  NOT NULL,
        description  NVARCHAR(1000) NULL,
        flow_count   INT            NOT NULL CONSTRAINT DF_e2e_suites_fc  DEFAULT (0),
        data         NVARCHAR(MAX)  NOT NULL,
        created_at   DATETIME2(3)   NOT NULL,
        updated_at   DATETIME2(3)   NOT NULL CONSTRAINT DF_e2e_suites_upd DEFAULT (SYSUTCDATETIME())
    );
    CREATE INDEX IX_e2e_suites_name ON dbo.e2e_suites (name);
END;
