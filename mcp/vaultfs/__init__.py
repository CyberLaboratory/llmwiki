from .base import DocumentVersionConflict, VaultFS

__all__ = ["DocumentVersionConflict", "VaultFS", "PostgresVaultFS", "SqliteVaultFS"]


def __getattr__(name: str):
    if name == "PostgresVaultFS":
        from .postgres import PostgresVaultFS
        return PostgresVaultFS
    if name == "SqliteVaultFS":
        from .sqlite import SqliteVaultFS
        return SqliteVaultFS
    raise AttributeError(f"module 'vaultfs' has no attribute {name!r}")
