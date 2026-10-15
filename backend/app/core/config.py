from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://pierplace:pierplace@localhost:5432/pierplace"
    jwt_secret: str = "change-me-in-env"
    jwt_algorithm: str = "HS256"
    jwt_expires_minutes: int = 60 * 24 * 7  # one piscine + margin

    class Config:
        env_prefix = "PIERPLACE_"


settings = Settings()
