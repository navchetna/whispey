import os
import subprocess
from pathlib import Path


def download_model(language="hindi", model_dir="models"):
    url = (
        "https://asr.iitm.ac.in/SPRING_INX/models/fine_tuned/"
        f"SPRING_INX_ccc_wav2vec2_{language.title()}.pt"
    )

    os.makedirs(model_dir, exist_ok=True)
    out_path = os.path.join(model_dir, f"{language.title()}.pt")

    if os.path.exists(out_path):
        print(f"Model already exists: {out_path}")
        return

    subprocess.run(
        ["wget", "-c", url, "-O", out_path],
        check=True,
    )

    print(f"Model downloaded to {out_path}")