from pydantic import BaseModel, Field


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6, max_length=128)
    display_name: str = Field(min_length=1, max_length=24)
    skin: str = "#b57c54"
    hair: str = "#332c30"
    shirt: str = "#548e80"
    photo_url: str | None = None
    wear_id: bool = True


class LoginIn(BaseModel):
    username: str
    password: str


class AuthOut(BaseModel):
    token: str
    user_id: str
    role: str
