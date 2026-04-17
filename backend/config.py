"""Configuration and LLM setup."""

import os
from dotenv import load_dotenv

load_dotenv()


def _parse_bool(value: str, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    LLM_TEMPERATURE: float = float(os.getenv("LLM_TEMPERATURE", "0.3"))
    APP_ENV: str = os.getenv("APP_ENV", "development").strip().lower()
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    RELOAD: bool = _parse_bool(
        os.getenv("RELOAD"),
        default=(APP_ENV == "development"),
    )
    CORS_ORIGINS: list[str] = os.getenv(
        "CORS_ORIGINS", "http://localhost:5173"
    ).split(",")
    CORS_ORIGINS = [origin.strip() for origin in CORS_ORIGINS if origin.strip()]
    CORS_ALLOW_LOCALHOST: bool = _parse_bool(
        os.getenv("CORS_ALLOW_LOCALHOST"),
        default=(APP_ENV == "development"),
    )
    CORS_LOCALHOST_REGEX: str = r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


settings = Settings()


def get_llm():
    """Return the configured LLM instance."""
    if settings.LLM_PROVIDER == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=settings.LLM_MODEL,
            temperature=settings.LLM_TEMPERATURE,
            anthropic_api_key=settings.ANTHROPIC_API_KEY,
        )
    else:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.LLM_MODEL,
            temperature=settings.LLM_TEMPERATURE,
            openai_api_key=settings.OPENAI_API_KEY,
        )
