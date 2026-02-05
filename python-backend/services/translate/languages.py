from enum import Enum


class LangScript(str, Enum):
    HIN_DEVA = "hin_Deva"
    ENG_LATN = "eng_Latn"
    BEN_BENG = "ben_Beng"
    MAR_DEVA = "mar_Deva"
    GUJ_GUJR = "guj_Gujr"
    PAN_GURU = "pan_Guru"
    TEL_TELU = "tel_Telu"
    TAM_TAML = "tam_Taml"
    URD_ARAB = "urd_Arab"
    KAN_KANN = "kan_Kann"
    MAL_MLYM = "mal_Mlym"
    ORI_ORYA = "ori_Orya"
    ASM_BENG = "asm_Beng"


class Locale(str, Enum):
    HI_IN = "hi-IN"
    EN_IN = "en-IN"
    BN_IN = "bn-IN"
    MR_IN = "mr-IN"
    GU_IN = "gu-IN"
    PA_IN = "pa-IN"
    TE_IN = "te-IN"
    TA_IN = "ta-IN"
    UR_IN = "ur-IN"
    KN_IN = "kn-IN"
    ML_IN = "ml-IN"
    OR_IN = "or-IN"
    AS_IN = "as-IN"


LANG_SCRIPT_TO_LOCALE = {
    Locale.HI_IN: LangScript.HIN_DEVA,
    Locale.EN_IN: LangScript.ENG_LATN,
    Locale.BN_IN: LangScript.BEN_BENG,
    Locale.MR_IN: LangScript.MAR_DEVA,
    Locale.GU_IN: LangScript.GUJ_GUJR,
    Locale.PA_IN: LangScript.PAN_GURU,
    Locale.TE_IN: LangScript.TEL_TELU,
    Locale.TA_IN: LangScript.TAM_TAML,
    Locale.UR_IN: LangScript.URD_ARAB,
    Locale.KN_IN: LangScript.KAN_KANN,
    Locale.ML_IN: LangScript.MAL_MLYM,
    Locale.OR_IN: LangScript.ORI_ORYA,
    Locale.AS_IN: LangScript.ASM_BENG,  
}