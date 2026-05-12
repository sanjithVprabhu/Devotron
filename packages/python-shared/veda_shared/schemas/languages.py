from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict


class LanguageCode(str, Enum):
    EN = "en"
    HI = "hi"
    KN = "kn"
    TA = "ta"
    TE = "te"
    MR = "mr"
    BN = "bn"
    ML = "ml"
    GU = "gu"
    PA = "pa"


class Script(str, Enum):
    LATIN = "latin"
    DEVANAGARI = "devanagari"
    KANNADA = "kannada"
    TAMIL = "tamil"
    TELUGU = "telugu"
    MALAYALAM = "malayalam"
    GURMUKHI = "gurmukhi"
    GUJARATI = "gujarati"
    BENGALI = "bengali"


class LanguageConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: LanguageCode
    name: str
    proficiency: Literal["primary", "secondary"]
    script: Script | None = None
