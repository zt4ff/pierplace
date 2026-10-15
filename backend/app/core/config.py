from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PIERPLACE_", extra="ignore")

    database_url: str = Field(
        default="postgresql+asyncpg://pierplace:pierplace@localhost:5432/pierplace",
        validation_alias=AliasChoices("PIERPLACE_DATABASE_URL", "DATABASE_URL"),
    )
    jwt_secret: str = "change-me-in-env"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 7  # one piscine + margin

    @field_validator("database_url")
    @classmethod
    def _asyncpg_scheme(cls, url: str) -> str:
        """Render injects DATABASE_URL as postgres:// — asyncpg needs +asyncpg."""
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url


settings = Settings()
