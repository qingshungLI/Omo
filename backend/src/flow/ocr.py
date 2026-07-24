#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def tesseract(path):
    command = os.environ.get("TESSERACT_BIN", "tesseract")
    result = subprocess.run(
        [command, path, "stdout", "-l", os.environ.get("TESSERACT_LANG", "chi_sim+eng")],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "tesseract failed")
    lines = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return lines


def paddle(path):
    import numpy as np
    from PIL import Image
    from paddleocr import PaddleOCR

    ocr = PaddleOCR(
        lang="ch",
        text_detection_model_name="PP-OCRv5_mobile_det",
        text_recognition_model_name="PP-OCRv5_mobile_rec",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )
    image = Image.open(path).convert("RGB")
    image = image.crop((0, 0, image.width, int(image.height * 0.62)))
    if image.width > 960:
        image = image.resize((960, round(image.height * 960 / image.width)))
    output = []
    for result in ocr.predict(np.array(image)):
        data = result.json if hasattr(result, "json") else result
        if callable(data):
            data = data()
        if isinstance(data, str):
            data = json.loads(data)
        if isinstance(data, dict) and isinstance(data.get("res"), dict):
            data = data["res"]
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    output.append(item)
        elif isinstance(data, dict):
            output.append(data)

    lines = []
    for item in output:
        texts = item.get("rec_texts") or item.get("text") or item.get("texts") or []
        if isinstance(texts, str):
            texts = [texts]
        lines.extend(str(text).strip() for text in texts if str(text).strip())
    return lines


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else ""
    if not path:
        emit({"code": "ocr_input_missing", "error": "image path is required"})
        return 2
    started = time.time()
    try:
        if os.environ.get("OCR_PROVIDER", "paddle").lower() not in ("paddle", "paddleocr"):
            lines = tesseract(path)
            emit({"provider": "tesseract", "lines": lines, "text": "\n".join(lines), "latencyMs": round((time.time() - started) * 1000)})
            return 0
        lines = paddle(path)
        emit({"provider": "paddleocr", "lines": lines, "text": "\n".join(lines), "latencyMs": round((time.time() - started) * 1000)})
        return 0
    except Exception as paddle_error:
        try:
            lines = tesseract(path)
            emit({"provider": "tesseract", "fallback": str(paddle_error)[:240], "lines": lines, "text": "\n".join(lines), "latencyMs": round((time.time() - started) * 1000)})
            return 0
        except Exception as fallback_error:
            emit({"code": "ocr_failed", "error": str(fallback_error)[:240], "paddleError": str(paddle_error)[:240]})
            return 1


if __name__ == "__main__":
    raise SystemExit(main())
